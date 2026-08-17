/**
 * 初期セットアップとトリガー登録
 *
 * 手順:
 *   1. initProperties() の値を自社のIDに書き換えて1回だけ実行
 *   2. installTriggers() を1回だけ実行
 *   3. healthCheck() で疎通を確認
 */

/**
 * Script Properties を登録する。
 * ここに実IDを書いたままコミットしないこと（本リポジトリは公開）。
 * 値は Apps Script エディタの「プロジェクトの設定 > スクリプト プロパティ」から
 * 手で入れてもよい。その場合この関数は実行不要。
 */
function initProperties() {
  var values = {
    LEDGER_ID:         '<経理_請求管理台帳（自動連携）のID>',
    MASTER_ID:         '<経理_取引先マスタのID>',
    CLIENTS_FOLDER_ID: '<10_クライアント（受発注・請求・納品）のフォルダID>',
    ARCHIVE_FOLDER_ID: '<90_アーカイブのフォルダID>',
    NOTIFY_TO:         'trade@crossimage.jp',
    BANK_BLOCK:        '　<銀行名>　<支店名>（<支店番号>）\n　普通預金　<口座番号>\n　口座名義：<名義>',
    SIGNATURE:         '━━━━━━━━━━━━━━━━━━━━━━━\n' +
                       'クロスイメージ株式会社\n' +
                       '〒150-0011 東京都渋谷区東3-8-22 伊藤ビル2F\n' +
                       'TEL: <代表電話>\n' +
                       'E-mail: trade@crossimage.jp\n' +
                       '━━━━━━━━━━━━━━━━━━━━━━━'
  };

  Object.keys(values).forEach(function (k) {
    if (/^<.*>$/.test(values[k])) {
      throw new Error('initProperties: "' + k + '" のプレースホルダを実際の値に置き換えてください。');
    }
  });

  PropertiesService.getScriptProperties().setProperties(values, false);
  console.log('Script Properties を登録しました: ' + Object.keys(values).join(', '));
}

/** トリガーを登録する。既存の同名トリガーは張り替える。 */
function installTriggers() {
  var wanted = ['runInboxSweep', 'runDailyDunning'];

  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (wanted.indexOf(t.getHandlerFunction()) !== -1) ScriptApp.deleteTrigger(t);
  });

  // 受信・送信の走査は1時間ごと
  ScriptApp.newTrigger('runInboxSweep').timeBased().everyHours(1).create();

  // 督促の判定は平日朝9時（JST）に1回
  ScriptApp.newTrigger('runDailyDunning').timeBased()
    .atHour(9).nearMinute(0).everyDays(1).inTimezone(TZ).create();

  console.log('トリガーを登録しました: ' + wanted.join(', '));
}

function removeTriggers() {
  ScriptApp.getProjectTriggers().forEach(function (t) { ScriptApp.deleteTrigger(t); });
  console.log('全トリガーを削除しました。');
}

/** 1時間ごとの本体 ── 分類と Drive 保存 */
function runInboxSweep() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) { console.warn('別の実行が進行中のためスキップ'); return; }
  try {
    classifyInbox();
    fileSentInvoices();
    draftReplies();
  } finally {
    lock.releaseLock();
  }
}

/**
 * 返信下書きのドライラン ── 各スレッドの判定だけを出し、下書きは作らない。
 * 「どのメールに返信が要ると判断したか」を先に目視するために使う。
 */
function dryRunReplies() {
  var threads = GmailApp.search('in:inbox -from:me newer_than:30d', 0, 50);
  var out = ['返信判定ドライラン ' + ymd(today()), ''];

  threads.forEach(function (thread) {
    var last = lastInboundMessage(thread);
    if (!last) return;
    var client = resolveClientFromThread(thread);
    var type = classifyReply(thread, last, client);
    var already = repliedAfter(thread, last) ? '返信済' :
                  hasDraftInThread(thread.getId()) ? '下書きあり' : '未対応';
    out.push([
      already,
      type,
      (client ? client.code : '—'),
      (thread.getFirstMessageSubject() || '').slice(0, 40)
    ].join(' | '));
  });

  var report = out.join('\n');
  console.log(report);
  return report;
}

/** 疎通確認。破壊的な操作は一切行わない。 */
function healthCheck() {
  var out = [];
  var cfg = CFG();

  out.push('■ Script Properties');
  ['LEDGER_ID', 'MASTER_ID', 'CLIENTS_FOLDER_ID', 'ARCHIVE_FOLDER_ID', 'NOTIFY_TO'].forEach(function (k) {
    out.push('  ' + k + ': OK');
  });

  var master = loadMaster();
  var codes = Object.keys(master.byCode);
  out.push('■ 取引先マスタ: ' + codes.length + '件 (' + codes.join(', ') + ')');

  var rows = readLedger();
  var byStatus = {};
  rows.forEach(function (r) { byStatus[r.status] = (byStatus[r.status] || 0) + 1; });
  out.push('■ 請求管理台帳: ' + rows.length + '行 ' + JSON.stringify(byStatus));

  var clients = DriveApp.getFolderById(cfg.CLIENTS_FOLDER_ID);
  out.push('■ 10_クライアント: ' + clients.getName());

  var t = today();
  out.push('■ 営業日計算: 本日 ' + ymd(t) + ' / 3営業日後 ' + ymd(addBusinessDays(t, 3)));

  var labels = GmailApp.getUserLabels().map(function (l) { return l.getName(); });
  var missing = Object.keys(L)
    .filter(function (k) { return k !== 'CLIENT_PREFIX'; })
    .map(function (k) { return L[k]; })
    .filter(function (n) { return labels.indexOf(n) === -1; });
  out.push('■ ラベル: ' + labels.length + '件' +
           (missing.length ? ' / 未作成: ' + missing.join(', ') : ' / 過不足なし'));

  var report = out.join('\n');
  console.log(report);
  return report;
}

/**
 * ドライラン ── 督促の判定結果だけを出し、下書きもメールも作らない。
 * 本番投入前にこれで確認すること。
 */
function dryRunDunning() {
  var rows = readLedger();
  var t = today();
  var out = ['督促ドライラン ' + ymd(t), ''];

  rows.forEach(function (r) {
    if (r.status === ST.PAID || r.status === ST.DRAFT) return;
    var check = dunningPreCheck(r, t);
    var offset = r.dueDate ? businessDaysBetween(r.dueDate, t) : null;
    var action = '—';
    if (!check.ok) action = 'スキップ（' + check.reason + '）';
    else if (offset === null) action = '支払期限が未設定';
    else if (offset >= DUNNING.THIRD)  action = '三次督促';
    else if (offset >= DUNNING.SECOND) action = '二次督促';
    else if (offset >= DUNNING.FIRST)  action = '一次督促';
    else if (offset === DUNNING.RECONCILE) action = '入金照合';
    else if (offset === DUNNING.PRE_REMIND) action = '社内リマインド';
    else action = '待機（期限まで ' + (-offset) + '営業日）';

    out.push([r.invoiceNo, r.clientName, yen(r.gross),
              r.dueDate ? ymd(r.dueDate) : '—',
              r.status, action].join(' | '));
  });

  var report = out.join('\n');
  console.log(report);
  return report;
}

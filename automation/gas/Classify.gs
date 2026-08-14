/**
 * 分類 ── ラベル自動付与とノイズ整理（ルール §9）
 *
 * Gmail のフィルタ機能では取引先マスタを参照できないため、
 * フィルタではなく Apps Script 側で分類する。
 * ラベルは排他運用（ルール §9.3）。遷移時は旧ラベルを外す。
 */

/** ラベルを名前で取得（無ければ作成） */
function label(name) {
  if (!label._cache) label._cache = {};
  if (label._cache[name]) return label._cache[name];
  var lb = GmailApp.getUserLabelByName(name) || GmailApp.createLabel(name);
  label._cache[name] = lb;
  return lb;
}

function hasLabel(thread, name) {
  return thread.getLabels().some(function (l) { return l.getName() === name; });
}

/** 排他ラベルを付け替える（同グループの他ラベルを外す） */
function setExclusive(thread, group, name) {
  thread.getLabels().forEach(function (l) {
    if (l.getName().indexOf(group) === 0 && l.getName() !== name) {
      thread.removeLabel(l);
    }
  });
  if (name && !hasLabel(thread, name)) thread.addLabel(label(name));
}

/**
 * 受信トレイを走査して分類する。
 * 前回実行以降の新着のみを対象にし、二重処理を避ける。
 */
function classifyInbox() {
  var props = PropertiesService.getScriptProperties();
  var since = props.getProperty('LAST_CLASSIFY') || String(Math.floor(Date.now() / 1000) - 86400 * 7);
  var startedAt = Math.floor(Date.now() / 1000);

  var threads = GmailApp.search('after:' + since + ' -in:chats', 0, 100);
  var stats = { noise: 0, po: 0, invoice: 0, payment: 0, accounting: 0, client: 0 };

  threads.forEach(function (thread) {
    try {
      if (archiveIfNoise(thread)) { stats.noise++; return; }
      if (labelIfAccounting(thread)) { stats.accounting++; }

      var client = resolveClientFromThread(thread);
      if (client) {
        if (!hasLabel(thread, client.label)) thread.addLabel(label(client.label));
        stats.client++;
      }

      var last = thread.getMessages()[thread.getMessageCount() - 1];
      var subject = thread.getFirstMessageSubject() || '';
      var inbound = last.getFrom().indexOf(OWN_DOMAIN) === -1;

      // 発注書の受領（ルール §5.4 S1 のトリガー）
      if (inbound && isPurchaseOrder(subject, last) && !hasLabel(thread, L.PO_INVOICED)) {
        setExclusive(thread, '02_発注書/', L.PO_TODO);
        thread.addLabel(label(L.ACTION));
        if (client) fileIncomingPurchaseOrder(thread, last, client);
        stats.po++;
      }

      // 自社が送った請求書（ルール §5.4 S2 のトリガー）
      if (/【御請求書】/.test(subject) && sentByUs(thread)) {
        setExclusive(thread, '02_発注書/', L.PO_INVOICED);
        if (!hasLabel(thread, L.INV_SENT)) thread.addLabel(label(L.INV_SENT));
        if (!hasLabel(thread, L.INV_PAID) && !hasLabel(thread, L.INV_DUNNING)) {
          setExclusive(thread, '01_請求/入金', L.INV_WAITING);
        }
        stats.invoice++;
      }

      // 見積書
      if (/【御見積書】/.test(subject) && sentByUs(thread) && !hasLabel(thread, L.QT_WON)) {
        if (!hasLabel(thread, L.QT_SENT)) thread.addLabel(label(L.QT_SENT));
      }

      // 入金・振込に言及する受信メールは人の確認へ回す
      if (inbound && /振込|ご入金|入金|お支払/.test(last.getPlainBody().slice(0, 2000) + subject)) {
        if (!hasLabel(thread, L.ACTION)) thread.addLabel(label(L.ACTION));
        stats.payment++;
      }
    } catch (err) {
      console.error('classify failed for thread ' + thread.getId() + ': ' + err);
    }
  });

  props.setProperty('LAST_CLASSIFY', String(startedAt));
  console.log('classifyInbox: ' + JSON.stringify(stats));
  return stats;
}

/** ノイズ送信元は受信トレイから外して既読化（ルール §9.2 F12） */
function archiveIfNoise(thread) {
  var from = thread.getMessages()[0].getFrom().toLowerCase();
  var hit = NOISE_SENDERS.some(function (s) { return from.indexOf(s) !== -1; });
  if (!hit) return false;
  thread.markRead();
  thread.moveToArchive();
  return true;
}

function labelIfAccounting(thread) {
  var from = thread.getMessages()[0].getFrom().toLowerCase();
  var matched = false;
  Object.keys(ACCOUNTING_DOMAINS).forEach(function (dom) {
    if (from.indexOf(dom) !== -1) {
      if (!hasLabel(thread, ACCOUNTING_DOMAINS[dom])) thread.addLabel(label(ACCOUNTING_DOMAINS[dom]));
      matched = true;
    }
  });
  return matched;
}

/** 発注書メールか判定。件名だけでなく添付の有無・種別も見る。 */
function isPurchaseOrder(subject, message) {
  if (!/発注書|ご発注|発注/.test(subject)) return false;
  var atts = message.getAttachments({ includeInlineImages: false });
  if (atts.length === 0) return false;
  return atts.some(function (a) {
    return /\.(pdf|xlsx?|csv)$/i.test(a.getName());
  });
}

function sentByUs(thread) {
  return thread.getMessages().some(function (m) {
    return m.getFrom().indexOf(OWN_DOMAIN) !== -1;
  });
}

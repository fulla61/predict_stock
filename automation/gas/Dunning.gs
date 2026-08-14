/**
 * 入金消込と督促 ── スケジュール実行（ルール §8.2）
 *
 * 重要な設計方針:
 *   先方宛のメールは「下書きまで」作り、送信は必ず人が行う（ルール §12.1）。
 *   金額と信用に直結する文書であり、誤送信のコストが自動化の便益を上回る。
 *
 * 督促前には §8.3 の3点確認を必ずコードで通す。
 */

function prop(key) {
  var v = PropertiesService.getScriptProperties().getProperty(key);
  if (!v) throw new Error('Script Property "' + key + '" が未設定です。');
  return v;
}

function bankBlock()  { return prop('BANK_BLOCK'); }
function signature()  { return prop('SIGNATURE'); }

/** 日次実行のエントリポイント */
function runDailyDunning() {
  var rows = readLedger();
  var t = today();

  var preRemind = [];     // 期限-3営業日: 社内リマインドのみ
  var reconcile = [];     // 期限+1営業日: 入金照合の対象
  var buckets = { first: {}, second: {}, third: {} };
  var skipped = [];

  rows.forEach(function (r) {
    if (r.status === ST.PAID || r.status === ST.DRAFT) return;

    var check = dunningPreCheck(r, t);
    if (!check.ok) { skipped.push({ row: r, reason: check.reason }); return; }
    if (!r.dueDate) return;

    // 期限からの経過営業日。期限前なら負、期限後なら正。
    var offset = businessDaysBetween(r.dueDate, t);

    if (offset < 0) {
      if (offset === DUNNING.PRE_REMIND) preRemind.push(r); // -3営業日
      return;
    }
    if (offset === DUNNING.RECONCILE) { reconcile.push(r); return; }

    if (offset >= DUNNING.THIRD)       push(buckets.third,  r);
    else if (offset >= DUNNING.SECOND) push(buckets.second, r);
    else if (offset >= DUNNING.FIRST)  push(buckets.first,  r);
  });

  function push(bucket, r) {
    (bucket[r.clientCode] = bucket[r.clientCode] || []).push(r);
  }

  var made = { first: 0, second: 0, third: 0 };
  made.first  = createDunningDrafts(buckets.first,  1);
  made.second = createDunningDrafts(buckets.second, 2);
  made.third  = createDunningDrafts(buckets.third,  3);

  sendInternalDigest(preRemind, reconcile, buckets, skipped, made);

  console.log('runDailyDunning: ' + JSON.stringify({
    preRemind: preRemind.length, reconcile: reconcile.length,
    drafts: made, skipped: skipped.length
  }));
  return made;
}

/**
 * 督促前の必須確認 ── 3点（ルール §8.3）
 * 2026-07-28 に精算済み案件を督促した事例があり、ここが最後の砦になる。
 */
function dunningPreCheck(row, t) {
  // ① 相殺・精算済でないこと
  if (row.status === ST.SETTLED) {
    return { ok: false, reason: '相殺・精算済のため督促対象外' };
  }
  // ② 先方から入金予定日の回答が来ていないこと（回答済ならその日まで待つ）
  if (row.plannedDate && row.plannedDate >= t) {
    return { ok: false, reason: '入金予定日 ' + ymd(row.plannedDate) + ' の回答済み' };
  }
  // ③ 該当スレッドに先方からの支払関連の返信が来ていないこと
  if (row.threadId && hasRecentInboundPaymentReply(row.threadId, row.dueDate)) {
    return { ok: false, reason: '先方から支払関連の返信あり。人が確認すること' };
  }
  return { ok: true };
}

/** 支払期限以降に、先方から支払に触れる返信が来ていないか */
function hasRecentInboundPaymentReply(threadId, since) {
  try {
    var thread = GmailApp.getThreadById(threadId);
    if (!thread) return false;
    return thread.getMessages().some(function (m) {
      if (m.getFrom().indexOf(OWN_DOMAIN) !== -1) return false;
      if (since && m.getDate() < since) return false;
      return /振込|入金|送金|支払|お支払|相殺|精算/.test(m.getPlainBody().slice(0, 3000));
    });
  } catch (err) {
    console.warn('thread lookup failed (' + threadId + '): ' + err);
    return true; // 判定できない時は督促しない側に倒す
  }
}

/** 取引先ごとに督促の下書きを作る。送信はしない。 */
function createDunningDrafts(bucket, stage) {
  var master = loadMaster();
  var count = 0;

  Object.keys(bucket).forEach(function (code) {
    var rows = bucket[code];
    var client = master.byCode[code];
    if (!client) { console.warn('マスタ未登録の取引先コード: ' + code); return; }

    // 同一ステージで既に下書き済みなら作らない（多重生成の防止）
    var marker = 'DUNNED_' + stage + '_' + code + '_' + rows.map(function (r) { return r.invoiceNo; }).sort().join(',');
    var props = PropertiesService.getScriptProperties();
    if (props.getProperty(marker)) return;

    var body = buildDunningBody(client, rows, stage);
    var subject = '【ご確認のお願い】ご請求分の入金確認について / クロスイメージ株式会社';
    var cc = INTERNAL_CC.concat(client.cc);
    if (stage >= 2) cc = cc.concat(escalationCc(client));

    var options = {
      cc: cc.join(','),
      attachments: collectInvoiceFiles(rows)
    };

    try {
      if (rows.length === 1 && rows[0].threadId) {
        var thread = GmailApp.getThreadById(rows[0].threadId);
        if (thread) thread.createDraftReply(body, options);
        else GmailApp.createDraft(client.to.join(','), subject, body, options);
      } else {
        GmailApp.createDraft(client.to.join(','), subject, body, options);
      }

      rows.forEach(function (r) {
        if (r.status !== ST.DUNNING) setStatus(r.rowIndex, ST.DUNNING);
        appendNote(r.rowIndex, stage + '次督促 下書き作成 ' + ymd(today()));
        if (r.threadId) {
          try {
            var th = GmailApp.getThreadById(r.threadId);
            if (th) { setExclusive(th, '01_請求/入金', null); th.addLabel(label(L.INV_DUNNING)); }
          } catch (e) { /* ラベル付与失敗は致命ではない */ }
        }
      });

      props.setProperty(marker, ymd(today()));
      count++;
    } catch (err) {
      console.error('督促下書きの作成に失敗 (' + code + '): ' + err);
    }
  });

  return count;
}

/** 二次以降は先方の経理部門・上長をCcに追加（ルール §6 T6-2） */
function escalationCc(client) {
  var extra = PropertiesService.getScriptProperties()
    .getProperty('ESCALATION_CC_' + client.code);
  return extra ? splitAddrs(extra) : [];
}

/** 案件フォルダから請求書PDFを集めて添付する */
function collectInvoiceFiles(rows) {
  var files = [];
  rows.forEach(function (r) {
    if (!r.driveUrl) return;
    var m = r.driveUrl.match(/folders\/([A-Za-z0-9_-]+)/);
    if (!m) return;
    try {
      var it = DriveApp.getFolderById(m[1]).getFiles();
      while (it.hasNext()) {
        var f = it.next();
        if (/請求書/.test(f.getName()) && /\.pdf$/i.test(f.getName())) {
          files.push(f.getBlob());
        }
      }
    } catch (err) {
      console.warn('添付収集に失敗 (' + r.invoiceNo + '): ' + err);
    }
  });
  return files;
}

/** T6-1 / T6-2 / T6-3 の本文を組み立てる（ルール §6） */
function buildDunningBody(client, rows, stage) {
  var t = today();
  var lines = [];

  lines.push(client.name);
  lines.push(client.honorific === '個人名' ? contactHonorific(client) : 'ご担当者様');
  lines.push('（関係各位）');
  lines.push('');
  lines.push('いつも大変お世話になっております。');
  lines.push('クロスイメージ株式会社の張でございます。');
  lines.push('');

  if (stage >= 2) {
    lines.push('先般ご連絡いたしました件につきまして、再度のご連絡となり恐縮です。');
    lines.push('');
  }

  lines.push('標記の件につきまして、下記のご請求分の入金が現時点で確認できておりません。');
  lines.push('お手数ですが、ご入金状況をご確認くださいますようお願い申し上げます。');
  lines.push('');
  lines.push('【未確認のご請求】');

  var total = 0;
  rows.forEach(function (r) {
    var amount = Number(r.gross) || 0;
    total += amount;
    lines.push('　請求書番号：' + r.invoiceNo +
               '　御請求日：' + (r.issueDate ? jpDate(r.issueDate) : '—') +
               '　ご請求金額：' + yen(amount) + '（税込）');
  });
  if (rows.length > 1) {
    lines.push('　　合計　　：' + yen(total) + '（税込）');
  }

  lines.push('');
  lines.push('【振込先口座】');
  lines.push(bankBlock());
  lines.push('');
  lines.push('行き違いですでにお振込済みの場合は、何卒ご容赦ください。');
  lines.push('まだご入金いただけていない場合は、速やかにご入金くださいますようお願い申し上げます。');
  lines.push('');

  if (stage === 2) {
    lines.push('お支払い予定日について、' + jpDate(addBusinessDays(t, 5)) +
               'までにご回答いただけますと幸いです。');
    lines.push('');
  }
  if (stage === 3) {
    lines.push('本件につきまして、' + jpDate(addBusinessDays(t, 5)) +
               'までにご入金またはお支払い予定日のご回答をいただけない場合、');
    lines.push('別途ご相談させていただく場合がございます。');
    lines.push('');
  }

  lines.push('念のため、該当の請求書を添付いたします。');
  lines.push('ご確認のほど、何卒よろしくお願いいたします。');
  lines.push('');
  lines.push(signature());

  return lines.join('\n');
}

/** 担当者名は Script Property CONTACT_{コード} に入れる（公開リポジトリに氏名を置かないため） */
function contactHonorific(client) {
  var name = PropertiesService.getScriptProperties().getProperty('CONTACT_' + client.code);
  return name ? name + ' 様' : 'ご担当者様';
}

/**
 * 社内向けダイジェスト。
 * 先方には送らない情報（-3営業日リマインド、照合対象、督促スキップ理由）をまとめる。
 */
function sendInternalDigest(preRemind, reconcile, buckets, skipped, made) {
  var t = today();
  var b = [];

  b.push('経理メール自動化 日次レポート ' + ymd(t));
  b.push('');

  if (preRemind.length) {
    b.push('■ 支払期限 3営業日前（先方には送信していません）');
    preRemind.forEach(function (r) {
      b.push('　・' + r.invoiceNo + '　' + r.clientName + '　' + yen(r.gross) +
             '　期限 ' + ymd(r.dueDate));
    });
    b.push('');
  }

  if (reconcile.length) {
    b.push('■ 入金照合の対象（期限 +1営業日）');
    b.push('　入金を確認できたら台帳に入金日・入金額を記入し、T5「入金確認のご連絡」を送ってください。');
    reconcile.forEach(function (r) {
      b.push('　・' + r.invoiceNo + '　' + r.clientName + '　' + yen(r.gross));
    });
    b.push('');
  }

  var draftTotal = made.first + made.second + made.third;
  if (draftTotal) {
    b.push('■ 督促の下書きを作成しました（未送信）');
    b.push('　一次 ' + made.first + '件 / 二次 ' + made.second + '件 / 三次 ' + made.third + '件');
    b.push('　Gmail の下書きを確認し、内容を確認のうえ送信してください。');
    if (made.third) {
      b.push('　※三次督促は送信前に代表の承認が必要です（ルール §6 T6-3）。電話併用のこと。');
    }
    b.push('');
  }

  if (skipped.length) {
    b.push('■ 督促を見送った案件');
    skipped.forEach(function (s) {
      b.push('　・' + s.row.invoiceNo + '　' + s.row.clientName + '　── ' + s.reason);
    });
    b.push('');
  }

  if (b.length <= 2) return; // 報告事項なしなら送らない

  b.push('---');
  b.push('台帳: https://docs.google.com/spreadsheets/d/' + CFG().LEDGER_ID + '/edit');

  MailApp.sendEmail({
    to: CFG().NOTIFY_TO,
    subject: '[経理自動化] 日次レポート ' + ymd(t),
    body: b.join('\n')
  });
}

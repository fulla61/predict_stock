/**
 * 返信下書きの自動生成 ── 経理の定常メール全般
 *
 * 督促（Dunning.gs）以外の、日常的にやり取りする経理メールを対象にする。
 *
 * 3つの区分に振り分ける:
 *   1. NO_REPLY   返信不要。何もしない
 *   2. 定型       事実が揃うので完成形の下書きを作る
 *   3. 要判断     骨子だけ作り、埋めるべき箇所を《　》で明示する
 *
 * どの区分でも送信はしない（ルール §12.1）。
 */

/** 返信種別 */
var RT = {
  NO_REPLY:         'NO_REPLY',          // 返信不要
  RECEIPT_ACK:      'RECEIPT_ACK',       // 「拝受しました」だけ → 返信不要
  PAYMENT_NOTICE:   'PAYMENT_NOTICE',    // 入金連絡 → お礼（定型）
  DUE_DATE_CHANGE:  'DUE_DATE_CHANGE',   // 支払期日の変更申し出 → 承諾（定型）
  PO_RECEIVED:      'PO_RECEIVED',       // 発注書受領 → 受領確認（定型・金額は要確認）
  INVOICE_RESEND:   'INVOICE_RESEND',    // 請求書の再送依頼 → 再送（要判断）
  INVOICE_ERROR:    'INVOICE_ERROR',     // 請求内容の誤り指摘 → 訂正（要判断）
  DELIVERY_INQUIRY: 'DELIVERY_INQUIRY',  // 納期照会 → 回答（要判断）
  JUDGMENT:         'JUDGMENT'           // その他 → 下書きせず 99_要対応 のみ
};

/** 人の判断が要る種別。下書きに《　》を含めるため、そのまま送れないようにする。 */
var NEEDS_HUMAN = [RT.INVOICE_RESEND, RT.INVOICE_ERROR, RT.DELIVERY_INQUIRY, RT.PO_RECEIVED];

/**
 * 受信メールを走査し、返信が要るものに下書きを作る。
 * runInboxSweep から呼ばれる。
 */
function draftReplies() {
  var props = PropertiesService.getScriptProperties();
  var since = props.getProperty('LAST_REPLY_SWEEP') ||
              String(Math.floor(Date.now() / 1000) - 86400 * 14);
  var startedAt = Math.floor(Date.now() / 1000);

  var threads = GmailApp.search('in:inbox -from:me after:' + since, 0, 50);
  var made = [], skipped = [], flagged = [];

  threads.forEach(function (thread) {
    try {
      var last = lastInboundMessage(thread);
      if (!last) return;

      // 自社が最後に返信済みなら何もしない
      if (repliedAfter(thread, last)) return;

      // 既に下書きがあるスレッドは触らない（多重生成の防止）
      if (hasDraftInThread(thread.getId())) return;

      var client = resolveClientFromThread(thread);
      var type = classifyReply(thread, last, client);

      if (type === RT.NO_REPLY || type === RT.RECEIPT_ACK) {
        skipped.push({ subject: thread.getFirstMessageSubject(), type: type });
        return;
      }

      if (type === RT.JUDGMENT) {
        if (!hasLabel(thread, L.ACTION)) thread.addLabel(label(L.ACTION));
        flagged.push({ subject: thread.getFirstMessageSubject() });
        return;
      }

      var body = renderReply(type, thread, last, client);
      if (!body) return;

      thread.createDraftReply(body, { cc: replyCc(thread, client).join(',') });
      if (!hasLabel(thread, L.ACTION)) thread.addLabel(label(L.ACTION));

      made.push({
        subject: thread.getFirstMessageSubject(),
        type: type,
        needsHuman: NEEDS_HUMAN.indexOf(type) !== -1
      });
    } catch (err) {
      console.error('draftReplies failed for ' + thread.getId() + ': ' + err);
    }
  });

  props.setProperty('LAST_REPLY_SWEEP', String(startedAt));
  console.log('draftReplies: 作成 ' + made.length + ' / 返信不要 ' + skipped.length +
              ' / 要判断フラグ ' + flagged.length);
  return { made: made, skipped: skipped, flagged: flagged };
}

/* ---------- 判定 ---------- */

function lastInboundMessage(thread) {
  var msgs = thread.getMessages();
  for (var i = msgs.length - 1; i >= 0; i--) {
    if (msgs[i].getFrom().indexOf(OWN_DOMAIN) === -1) return msgs[i];
  }
  return null;
}

/** 対象メッセージより後に自社から返信しているか */
function repliedAfter(thread, message) {
  return thread.getMessages().some(function (m) {
    return m.getFrom().indexOf(OWN_DOMAIN) !== -1 && m.getDate() > message.getDate();
  });
}

function hasDraftInThread(threadId) {
  return GmailApp.getDrafts().some(function (d) {
    try { return d.getMessage().getThread().getId() === threadId; }
    catch (e) { return false; }
  });
}

/**
 * 返信種別を判定する。
 * 判定できないものは JUDGMENT に倒し、機械が勝手に文面を作らない。
 */
function classifyReply(thread, message, client) {
  var from = message.getFrom().toLowerCase();
  var subject = (thread.getFirstMessageSubject() || '') + ' ' + (message.getSubject() || '');
  var body = message.getPlainBody().slice(0, 3000);
  var text = subject + '\n' + body;

  // 送信専用・マーケティングは返信不要
  if (NOISE_SENDERS.some(function (s) { return from.indexOf(s) !== -1; })) return RT.NO_REPLY;
  if (/no-?reply|noreply|donotreply/.test(from)) return RT.NO_REPLY;

  // 取引先でも会計事務所でもない相手は人が見る
  var isAccounting = Object.keys(ACCOUNTING_DOMAINS).some(function (d) { return from.indexOf(d) !== -1; });
  if (!client && !isAccounting) return RT.JUDGMENT;

  // 請求内容の誤り指摘は最優先で拾う
  if (/誤り|間違|正しくは|訂正|差し替え/.test(text)) return RT.INVOICE_ERROR;

  // 再送依頼
  if (/再送|見つけられません|見つかりません|届いておりません|未着/.test(text)) return RT.INVOICE_RESEND;

  // 支払期日の変更申し出
  if (/支払サイクル|お振込みとさせて|支払予定日|お支払予定|に振込|払いとさせて/.test(text)) {
    return RT.DUE_DATE_CHANGE;
  }

  // 入金の連絡
  if (/振込いたしました|振込みました|入金いたしました|送金いたしました|振込明細|振込予定の案件/.test(text)) {
    return RT.PAYMENT_NOTICE;
  }

  // 納期照会
  if (/納期|納品時期|いつ頃|スケジュール/.test(text) && /\?|？|でしょうか|ください/.test(text)) {
    return RT.DELIVERY_INQUIRY;
  }

  // 発注書の受領
  if (isPurchaseOrder(subject, message)) return RT.PO_RECEIVED;

  // 「拝受しました」だけの受領連絡は返信不要
  if (/拝受|受領いたしました|確かに受け取/.test(text) && !/\?|？|でしょうか|お願いできます/.test(text)) {
    return RT.RECEIPT_ACK;
  }

  return RT.JUDGMENT;
}

/** 返信時のCc。受信メールのCcを維持し、自社Ccを足す（ルール §4.3） */
function replyCc(thread, client) {
  var set = {};
  INTERNAL_CC.forEach(function (a) { set[a.toLowerCase()] = a; });

  var last = lastInboundMessage(thread);
  if (last) {
    (last.getCc().match(/[\w.+-]+@[\w.-]+\.\w+/g) || []).forEach(function (a) {
      set[a.toLowerCase()] = a;
    });
  }
  if (client) client.cc.forEach(function (a) { set[a.toLowerCase()] = a; });

  return Object.keys(set).map(function (k) { return set[k]; });
}

/* ---------- 文面 ---------- */

function greeting(client) {
  var name = client ? client.name : '';
  var honor = (client && client.honorific === '個人名') ? contactHonorific(client) : 'ご担当者様';
  return (name ? name + '\n' : '') + honor + '\n\n' +
         'いつも大変お世話になっております。\nクロスイメージ株式会社でございます。\n';
}

function closing() {
  return '\n引き続き、どうぞよろしくお願い申し上げます。\n\n' + signature();
}

/** 返信が遅れている場合はお詫びを冒頭に足す */
function delayApology(message) {
  var days = businessDaysBetween(
    new Date(fmt(message.getDate(), 'yyyy/MM/dd') + ' 00:00:00'), today());
  if (days === null || days < 3) return '';
  return '\nご返信が遅くなり、誠に申し訳ございません。\n';
}

function renderReply(type, thread, message, client) {
  switch (type) {
    case RT.PAYMENT_NOTICE:   return replyPaymentNotice(thread, message, client);
    case RT.DUE_DATE_CHANGE:  return replyDueDateChange(thread, message, client);
    case RT.PO_RECEIVED:      return replyPoReceived(thread, message, client);
    case RT.INVOICE_RESEND:   return replyInvoiceResend(thread, message, client);
    case RT.INVOICE_ERROR:    return replyInvoiceError(thread, message, client);
    case RT.DELIVERY_INQUIRY: return replyDeliveryInquiry(thread, message, client);
    default: return null;
  }
}

/** 入金連絡へのお礼（T5）。台帳から該当請求を引いて金額を埋める。 */
function replyPaymentNotice(thread, message, client) {
  var rows = client ? readLedger().filter(function (r) {
    return r.clientCode === client.code &&
           (r.status === ST.WAITING || r.status === ST.DUNNING);
  }) : [];

  var b = greeting(client) + delayApology(message);
  b += '\nご入金のご連絡をいただき、誠にありがとうございます。\n';

  if (rows.length) {
    b += '下記のとおり、ご入金を確認いたしました。\n\n【ご入金内容】\n';
    var total = 0;
    rows.forEach(function (r) {
      total += Number(r.gross) || 0;
      b += '　・' + r.project + '（' + r.invoiceNo + '）　' + yen(r.gross) + '\n';
    });
    if (rows.length > 1) b += '　　　　　　　　　　　　　　合計　' + yen(total) + '\n';
    b += '\n《 台帳の入金待ち案件を機械的に列挙しています。実際の入金内容と照合してください 》\n';
  } else {
    b += '《 入金内容を記入してください 》\n';
  }

  b += closing();
  return b;
}

/** 支払期日変更の申し出への承諾 */
function replyDueDateChange(thread, message, client) {
  var b = greeting(client) + delayApology(message);
  b += '\nご査収ならびにお支払予定のご連絡をいただき、誠にありがとうございます。\n';
  b += '\nお知らせいただいたお支払予定にて承知いたしました。\n';
  b += '貴社の支払サイクルに合わせていただければ結構でございますので、\n';
  b += 'ご対応のほどよろしくお願いいたします。\n';
  b += '\n《 期日が大幅に後ろ倒しになる場合は、ルール §10 の例外処理へ回してください 》\n';
  b += closing();
  return b;
}

/** 発注書受領の確認。金額は発注書を見ないと確定しないため埋めない。 */
function replyPoReceived(thread, message, client) {
  var subject = thread.getFirstMessageSubject() || '';
  var poNo = extractPoNumber(subject) || extractPoNumber(
    (message.getAttachments()[0] || { getName: function () { return ''; } }).getName());
  var project = extractProjectName(subject);
  var terms = client ? client.terms : 'C';

  var b = greeting(client) + delayApology(message);
  b += '\nこのたびは「' + project + '」の発注書' +
       (poNo ? '（No.' + poNo + '）' : '') + 'をお送りいただき、\n';
  b += '誠にありがとうございます。ご発注を確かに承りました。\n';
  b += '\n■ お支払い条件について\n';

  if (terms === 'A') {
    b += '本件は全額（100%）の前払いでのご請求となります。\n';
    b += 'ご入金の確認後、生産に着手いたします。\n';
  } else if (terms === 'B') {
    b += 'お支払い条件（前金50%・残金50%）に基づき、まず前金分をご請求いたします。\n';
    b += '残金50%は納品後にご請求いたします。\n';
  } else {
    b += '本件は納品後に一括でご請求いたします。\n';
  }

  b += '\n■ 御請求書について\n';
  b += '　・請求書番号　：《 CRS-' + (client ? client.code : 'XXX') + '-' +
       (poNo || 'XXXX') + '-' + (terms === 'B' ? '1' : '0') + ' 》\n';
  b += '　・御請求金額　：《 金額を記入 》\n';
  b += '　・お支払期限　：《 ' + ymd(calcDueDate(today(), terms)) + ' 》\n';
  b += '　・納品予定日　：《 記入 》\n';
  b += '\n《 御請求書を作成のうえ添付し、§7 の送信前チェックを通してください 》\n';
  b += closing();
  return b;
}

/** 請求書の再送依頼。送信記録の確認結果を人が埋める。 */
function replyInvoiceResend(thread, message, client) {
  var b = greeting(client) + delayApology(message);
  b += '\nご確認にお手数をおかけしてしまい、申し訳ございません。\n';
  b += '\n《 いずれかを選んでください 》\n';
  b += '\n【A】送信記録が見つかった場合\n';
  b += '　当初は《 YYYY年M月D日 》にお送りしておりました。\n';
  b += '　念のため、本メールに改めて添付のうえお送りいたします。\n';
  b += '\n【B】送信記録が見つからない場合\n';
  b += '　当方の送信記録を確認いたしましたが、当該の御請求書を貴社宛に送付した\n';
  b += '　メールを特定することができませんでした。\n';
  b += '　当初のご送付自体ができていなかった可能性がございます。\n';
  b += '　お手間をおかけしてしまい、重ねてお詫び申し上げます。\n';
  b += '　本メールに添付のものを正式なものとしてお取り扱いくださいますようお願いいたします。\n';
  b += '\n《 該当の請求書PDFを添付してください。案件フォルダは台帳の Driveフォルダリンク から 》\n';
  b += closing();
  return b;
}

/** 請求内容の誤り指摘への訂正（T7）。請求書番号は振り直さない。 */
function replyInvoiceError(thread, message, client) {
  var b = greeting(client) + delayApology(message);
  b += '\nこのたびは《 誤りの内容 》に誤りがございましたこと、誠に申し訳ございません。\n';
  b += 'ご指摘のとおり、正しくは「《 正しい値 》」でございます。\n';
  b += '\n《 誤りの内容 》を修正のうえ、差し替え版を添付にてお送りいたします。\n';
  b += 'お手数をおかけし恐縮ですが、先にお送りしたもの（《 誤った値 》）は破棄いただき、\n';
  b += '本メールの添付をご査収くださいますようお願い申し上げます。\n';
  b += '\n《 請求書番号は振り直さないこと。ファイル名末尾に _差替 を付け、\n';
  b += '　 旧版は 90_アーカイブ へ移動してください（ルール §5.4 S4） 》\n';
  b += closing();
  return b;
}

/** 納期照会。納期は工場側の情報なので機械は埋められない。 */
function replyDeliveryInquiry(thread, message, client) {
  var b = greeting(client) + delayApology(message);
  b += '\n納品時期についてお問い合わせをいただき、ありがとうございます。\n';
  b += '\n現時点での目安を下記のとおりご連絡いたします。\n';
  b += '\n【納品予定（目安）】\n';
  b += '　《 品番・品名ごとの納品目安を記入 》\n';
  b += '\n確定次第、改めてご連絡いたします。\n';
  b += 'また、進捗に変更が生じた場合もすみやかにお知らせいたします。\n';
  b += closing();
  return b;
}

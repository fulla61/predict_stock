/**
 * 請求書の自動生成（Phase 2）
 *
 * 発注書を受領したら、請求書を作成して案件フォルダに保存し、
 * 返信下書きに添付するところまでを自動化する。
 *
 * 生成物:
 *   {案件フォルダ}/{YYYYMMDD}_{請求書番号}_{区分}請求書_{案件名}       … Google Sheet（編集原本）
 *   {案件フォルダ}/{YYYYMMDD}_{請求書番号}_{区分}請求書_{案件名}.pdf   … 送付版
 *
 * 【重要】金額は機械が決められない。
 *   発注書の合計金額を人が台帳の「税込」に入れるまで、請求書は生成しない。
 *   誤った金額の請求書を自動で作って添付する方が、作らないより有害である。
 */

/** 請求書テンプレート（Google Sheet）のセル位置。テンプレートを変えたらここも変える。 */
var INV_CELL = {
  SHEET_INDEX:  0,
  INVOICE_NO:   'E3',
  ISSUE_DATE:   'E4',
  CLIENT_ADDR:  'B4',
  CLIENT_NAME:  'B9',
  PROJECT:      'C16',
  ITEM_NAME:    'B19',
  ITEM_QTY:     'C19',
  ITEM_UNIT:    'D19',
  RATIO_LABEL:  'C26',
  RATIO:        'D26',
  TAX_RATE:     'E27',
  TERMS_NOTE:   'B31'
};

/** 区分 → 請求割合と表示ラベル */
function ratioFor(kind) {
  if (kind === '前金') return { ratio: 0.5, label: '発注時前金' };
  if (kind === '残金') return { ratio: 0.5, label: '残金' };
  return { ratio: 1, label: '請求割合（全額）' };
}

/**
 * 台帳の1行から請求書を生成する。
 * 既に同名ファイルがあれば作らない（多重生成の防止）。
 *
 * @return {{sheetId:string, pdfId:string, pdfBlob:Blob}|null}
 */
function generateInvoice(row) {
  var templateId = PropertiesService.getScriptProperties().getProperty('INVOICE_TEMPLATE_ID');
  if (!templateId) throw new Error('Script Property "INVOICE_TEMPLATE_ID" が未設定です。');

  var gross = Number(row.gross);
  if (!gross || gross <= 0) {
    console.log('金額未確定のため請求書を生成しない: ' + row.invoiceNo);
    return null;
  }

  var master = loadMaster().byCode[row.clientCode];
  if (!master) { console.warn('マスタ未登録: ' + row.clientCode); return null; }

  var folderId = (String(row.driveUrl).match(/folders\/([A-Za-z0-9_-]+)/) || [])[1];
  if (!folderId) { console.warn('案件フォルダ未設定: ' + row.invoiceNo); return null; }
  var folder = DriveApp.getFolderById(folderId);

  var issueDate = row.issueDate || today();
  // 統一命名（2026-08-24 確定）: {YYYYMMDD}_{請求書番号}_{区分}請求書_{案件名}
  var doc = (row.kind === '前金' || row.kind === '残金') ? row.kind + '請求書' : '請求書';
  var baseName = [ymdCompact(issueDate), row.invoiceNo, doc, safeName(row.project)].join('_');

  if (fileExists(folder, baseName + '.pdf')) {
    console.log('生成済みのためスキップ: ' + baseName);
    return null;
  }

  // 税抜・消費税を税込から逆算（台帳に税抜があればそれを優先）
  var taxRate = 0.1;
  var net = Number(row.net) || Math.round(gross / (1 + taxRate));
  var r = ratioFor(row.kind);

  // テンプレートを複製して値を差し込む
  var copy = DriveApp.getFileById(templateId).makeCopy(baseName, folder);
  var ss = SpreadsheetApp.openById(copy.getId());
  var sh = ss.getSheets()[INV_CELL.SHEET_INDEX];

  sh.getRange(INV_CELL.INVOICE_NO).setValue(row.invoiceNo);
  sh.getRange(INV_CELL.ISSUE_DATE).setValue(issueDate);
  sh.getRange(INV_CELL.CLIENT_NAME).setValue(master.name);
  sh.getRange(INV_CELL.PROJECT).setValue(row.project);
  sh.getRange(INV_CELL.ITEM_NAME).setValue(row.project);
  sh.getRange(INV_CELL.ITEM_QTY).setValue(1);
  // 単価には「割合を掛ける前の満額（税抜）」を入れる。割合は RATIO 側で効かせる。
  sh.getRange(INV_CELL.ITEM_UNIT).setValue(Math.round(net / r.ratio));
  sh.getRange(INV_CELL.RATIO_LABEL).setValue(r.label);
  sh.getRange(INV_CELL.RATIO).setValue(r.ratio);
  sh.getRange(INV_CELL.TAX_RATE).setValue(taxRate);
  if (row.dueDate) {
    sh.getRange(INV_CELL.TERMS_NOTE)
      .setValue('お支払期限：' + jpDate(row.dueDate) + '（' + (master.site || '') + '）');
  }
  SpreadsheetApp.flush();

  // PDF を書き出して同じフォルダへ
  var pdfBlob = copy.getAs('application/pdf').setName(baseName + '.pdf');
  var pdf = folder.createFile(pdfBlob);

  console.log('請求書を生成: ' + baseName + ' / ' + yen(gross));
  return { sheetId: copy.getId(), pdfId: pdf.getId(), pdfBlob: pdfBlob };
}

/**
 * 発注書を受領して台帳に金額が入っている案件について、
 * 請求書を生成し、該当スレッドの返信下書きに添付する。
 *
 * runInboxSweep から呼ばれる。送信は一切しない。
 */
function issuePendingInvoices() {
  var rows = readLedger().filter(function (r) {
    return r.status === ST.DRAFT && Number(r.gross) > 0 && r.driveUrl;
  });

  var made = [], waiting = [];

  readLedger().forEach(function (r) {
    if (r.status === ST.DRAFT && !(Number(r.gross) > 0)) {
      waiting.push(r.invoiceNo + '（' + r.clientName + '）');
    }
  });

  rows.forEach(function (row) {
    try {
      var result = generateInvoice(row);
      if (!result) return;

      var master = loadMaster().byCode[row.clientCode];
      var attached = attachInvoiceToDraft(row, master, result.pdfBlob);

      appendNote(row.rowIndex, '請求書を自動生成 ' + ymd(today()) +
                 (attached ? ' / 下書きに添付' : ' / 下書き未作成'));
      made.push(row.invoiceNo);
    } catch (err) {
      console.error('請求書生成に失敗 (' + row.invoiceNo + '): ' + err);
    }
  });

  if (waiting.length) {
    console.log('金額未入力のため保留: ' + waiting.join(', '));
  }
  console.log('issuePendingInvoices: 生成 ' + made.length + '件');
  return { made: made, waiting: waiting };
}

/**
 * 該当スレッドの既存下書きに請求書を添付する。
 * 下書きが無ければ新規に作る。いずれも送信はしない。
 */
function attachInvoiceToDraft(row, master, pdfBlob) {
  if (!row.threadId) return false;

  var thread;
  try { thread = GmailApp.getThreadById(row.threadId); } catch (e) { return false; }
  if (!thread) return false;

  var body = buildInvoiceReplyBody(row, master);
  var cc = replyCc(thread, master).join(',');

  // 既存の下書きがあれば差し替える（本文を保ちつつ添付を足すAPIが無いため作り直す）
  var existing = GmailApp.getDrafts().filter(function (d) {
    try { return d.getMessage().getThread().getId() === row.threadId; }
    catch (e) { return false; }
  });
  existing.forEach(function (d) { d.deleteDraft(); });

  thread.createDraftReply(body, { cc: cc, attachments: [pdfBlob] });
  return true;
}

/** 発注書受領 → 請求書送付の返信本文（ルール §6 T1／T3） */
function buildInvoiceReplyBody(row, master) {
  var terms = master ? master.terms : 'C';
  var b = greeting(master);

  b += '\nこのたびは「' + row.project + '」の発注書' +
       (row.poNo ? '（No.' + row.poNo + '）' : '') + 'をお送りいただき、\n';
  b += '誠にありがとうございます。ご発注を確かに承りました。\n';

  var net = Number(row.net) || Math.round(Number(row.gross) / 1.1);
  var tax = Number(row.tax) || (Number(row.gross) - net);

  if (terms === 'C') {
    // 納品後一括。請求書は「事前確認用」として添付し、正式版は納品後に送る。
    b += '\n■ お支払い条件について\n';
    b += '本件は分割をせず、納品後に一括にて御請求いたします。\n';
    b += '\n■ 御請求内容（事前ご確認用）\n';
    b += '納品後にご請求する内容を、あらかじめ御請求書として添付いたします。\n';
    b += 'ご確認のうえ、相違がございましたらお知らせください。\n';
  } else if (terms === 'A') {
    b += '\n■ ご請求について\n';
    b += '本件は全額（100%）の前払いでのご請求となります。\n';
    b += '御請求書を添付いたしますので、ご査収のほどよろしくお願いいたします。\n';
    b += 'ご入金の確認後、生産に着手いたします。\n';
  } else {
    b += '\n■ ご請求について\n';
    b += 'お支払い条件（前金50%・残金50%）に基づき、前金分の御請求書を添付いたします。\n';
    b += '残金50%は納品後にご請求いたします。\n';
  }

  b += '\n　請求書番号　：' + row.invoiceNo + '\n';
  b += '　案件名　　　：' + row.project + '\n';
  b += '　小計（税抜）：' + yen(net) + '\n';
  b += '　消費税(10%)　：' + yen(tax) + '\n';
  b += '　御請求金額　：' + yen(row.gross) + '（税込）\n';
  if (row.issueDate) b += '　御請求日　　：' + jpDate(row.issueDate) + '\n';
  if (row.dueDate)   b += '　お支払期限　：' + jpDate(row.dueDate) + '\n';

  if (terms === 'C') {
    b += '\n※正式な御請求書は、納品後に改めてお送りいたします。\n';
  }
  b += '※お振込手数料はお客様のご負担にてお願いいたします。\n';
  b += '\n【振込先口座】\n' + bankBlock() + '\n';
  b += closing();

  b += '\n\n《 送信前に確認 ── 添付の明細は「' + row.project +
       ' 一式」の1行で作成しています。\n';
  b += '　 発注書の品名・数量・単価と一致しているかご確認のうえ、この注記行を削除してください。 》\n';

  return b;
}

/**
 * 請求管理台帳 ── 読み書き（ルール §8.1）
 *
 * 主キーは請求書番号。既存行があれば空欄のみ埋め、
 * 人が手で入れた値（入金日・備考・例外）は自動処理で上書きしない。
 */

function ledgerSheet() {
  return SpreadsheetApp.openById(CFG().LEDGER_ID).getSheets()[0];
}

function readLedger() {
  var sh = ledgerSheet();
  var values = sh.getDataRange().getValues();
  var rows = [];
  for (var i = 1; i < values.length; i++) {
    var v = values[i];
    if (!String(v[COL.INVOICE_NO] || '').trim()) continue;
    rows.push({
      rowIndex: i + 1,               // 1-based シート行番号
      invoiceNo: String(v[COL.INVOICE_NO]).trim(),
      clientCode: String(v[COL.CLIENT_CODE] || '').trim(),
      clientName: String(v[COL.CLIENT_NAME] || '').trim(),
      project: String(v[COL.PROJECT] || '').trim(),
      poNo: String(v[COL.PO_NO] || '').trim(),
      kind: String(v[COL.KIND] || '').trim(),
      issueDate: parseDate(v[COL.ISSUE_DATE]),
      net: v[COL.NET], tax: v[COL.TAX], gross: v[COL.GROSS],
      dueDate: parseDate(v[COL.DUE_DATE]),
      plannedDate: parseDate(v[COL.PLANNED_DATE]),
      paidDate: parseDate(v[COL.PAID_DATE]),
      paidAmount: v[COL.PAID_AMOUNT],
      status: String(v[COL.STATUS] || '').trim(),
      threadId: String(v[COL.THREAD_ID] || '').trim(),
      driveUrl: String(v[COL.DRIVE_URL] || '').trim(),
      note: String(v[COL.NOTE] || '').trim()
    });
  }
  return rows;
}

/**
 * 請求書番号で upsert する。
 * 既存行では「空欄のみ」埋める。人の入力を機械が壊さないための不変条件。
 */
function upsertLedgerRow(data) {
  var sh = ledgerSheet();
  var values = sh.getDataRange().getValues();

  var target = -1;
  for (var i = 1; i < values.length; i++) {
    if (String(values[i][COL.INVOICE_NO]).trim() === data.invoiceNo) { target = i + 1; break; }
  }

  var map = [
    [COL.INVOICE_NO, data.invoiceNo], [COL.CLIENT_CODE, data.clientCode],
    [COL.CLIENT_NAME, data.clientName], [COL.PROJECT, data.project],
    [COL.PO_NO, data.poNo], [COL.KIND, data.kind],
    [COL.ISSUE_DATE, data.issueDate], [COL.NET, data.net],
    [COL.TAX, data.tax], [COL.GROSS, data.gross],
    [COL.DUE_DATE, data.dueDate], [COL.PLANNED_DATE, data.plannedDate],
    [COL.PAID_DATE, data.paidDate], [COL.PAID_AMOUNT, data.paidAmount],
    [COL.DIFF, data.diff], [COL.STATUS, data.status],
    [COL.THREAD_ID, data.threadId], [COL.DRIVE_URL, data.driveUrl],
    [COL.NOTE, data.note]
  ];

  if (target === -1) {
    var row = new Array(LEDGER_COLS).fill('');
    map.forEach(function (p) { if (p[1] !== undefined && p[1] !== null) row[p[0]] = p[1]; });
    sh.appendRow(row);
    console.log('ledger: appended ' + data.invoiceNo);
    return sh.getLastRow();
  }

  var existing = values[target - 1];
  var updates = [];
  map.forEach(function (p) {
    var col = p[0], val = p[1];
    if (val === undefined || val === null || val === '') return;
    // ステータスのみ前進を許す。それ以外は空欄補完に限る。
    if (col === COL.STATUS) {
      if (canAdvance(String(existing[col]).trim(), String(val))) updates.push([col, val]);
      return;
    }
    if (String(existing[col]).trim() === '') updates.push([col, val]);
  });

  updates.forEach(function (u) { sh.getRange(target, u[0] + 1).setValue(u[1]); });
  if (updates.length) console.log('ledger: updated ' + data.invoiceNo + ' (' + updates.length + ' cells)');
  return target;
}

/**
 * ステータス遷移の可否。
 * 相殺・精算済 と 入金済 は終端。機械が巻き戻してはならない。
 */
function canAdvance(from, to) {
  if (from === to) return false;
  if (from === ST.SETTLED || from === ST.PAID) return false;
  var order = [ST.DRAFT, ST.WAITING, ST.DUNNING, ST.PAID];
  var a = order.indexOf(from), b = order.indexOf(to);
  if (a === -1) return true;
  return b > a;
}

function setStatus(rowIndex, status) {
  ledgerSheet().getRange(rowIndex, COL.STATUS + 1).setValue(status);
}

function appendNote(rowIndex, text) {
  var cell = ledgerSheet().getRange(rowIndex, COL.NOTE + 1);
  var cur = String(cell.getValue() || '').trim();
  cell.setValue(cur ? cur + ' / ' + text : text);
}

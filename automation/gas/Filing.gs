/**
 * Drive 保存 ── S1〜S4（ルール §5.4）
 *
 * 保存先: 10_クライアント / 会社 / 年 / YYMMDD【発注書No】案件名
 * 命名:   {YYYYMMDD}_{発注書No}_{書類種別}_{区分}.{拡張子}
 *
 * これがメール処理の完了条件。案件フォルダが無い状態で請求書は送らない。
 */

/** 名前で子フォルダを引く。無ければ作る。 */
function childFolder(parent, name) {
  var it = parent.getFoldersByName(name);
  return it.hasNext() ? it.next() : parent.createFolder(name);
}

/** 会社フォルダを取得。マスタの指定名を優先し、無ければコード名で作る。 */
function clientFolder(client) {
  var root = DriveApp.getFolderById(CFG().CLIENTS_FOLDER_ID);
  var name = client.driveFolder
    ? client.driveFolder.split('/').pop()
    : client.code;
  return childFolder(root, name);
}

/**
 * 案件フォルダを取得または作成する。
 * 既存フォルダは【発注書No】で照合するため、末尾の表記ゆれに影響されない。
 */
function caseFolder(client, poNo, receivedDate, projectName) {
  var year = childFolder(clientFolder(client), fmt(receivedDate, 'yyyy'));

  // 既存案件フォルダを【発注書No】で探す（旧命名 "…発注書・前金" にも当たる）
  var it = year.getFolders();
  var token = '【' + poNo + '】';
  while (it.hasNext()) {
    var f = it.next();
    if (f.getName().indexOf(token) !== -1) return f;
  }

  // 新規は改訂後の命名（ルール §5.5）: YYMMDD【発注書No】案件名
  var name = yymmdd(receivedDate) + token + safeName(projectName);
  return year.createFolder(name);
}

/** 同名ファイルがあれば true（重複保存の防止） */
function fileExists(folder, name) {
  return folder.getFilesByName(name).hasNext();
}

/**
 * 添付を規定の名前で保存する。
 * 既に同名があればスキップし、"(1)" 付きファイルを作らない（既存ルール4）。
 */
function saveAttachment(folder, attachment, dateStr, poNo, docType, kind) {
  var orig = attachment.getName();
  var ext = (orig.match(/\.([A-Za-z0-9]+)$/) || [null, 'pdf'])[1];
  var parts = [dateStr, poNo, docType];
  if (kind) parts.push(kind);
  var name = parts.join('_') + '.' + ext.toLowerCase();

  if (fileExists(folder, name)) return null;
  return folder.createFile(attachment.copyBlob().setName(name));
}

/**
 * S1: 発注書メールを受領したら、案件フォルダを作り原本を保存し、台帳に行を起こす。
 */
function fileIncomingPurchaseOrder(thread, message, client) {
  var received = message.getDate();
  var subject = thread.getFirstMessageSubject() || '';
  var atts = message.getAttachments({ includeInlineImages: false }).filter(function (a) {
    return /\.(pdf|xlsx?|csv)$/i.test(a.getName());
  });
  if (atts.length === 0) return null;

  var poNo = extractPoNumber(subject) ||
             extractPoNumber(atts[0].getName()) ||
             yymmdd(received);
  var project = extractProjectName(subject);
  var folder = caseFolder(client, poNo, received, project);

  atts.forEach(function (a) {
    saveAttachment(folder, a, ymdCompact(received), poNo, '発注書', null);
  });

  // 台帳に未送付で起票（請求書番号は §3 の書式で採番）
  var kindSuffix = client.terms === 'B' ? '1' : '0';
  var invoiceNo = ['CRS', client.code, poNo, kindSuffix].join('-');
  upsertLedgerRow({
    invoiceNo: invoiceNo,
    clientCode: client.code,
    clientName: client.name,
    project: project,
    poNo: poNo,
    kind: client.terms === 'B' ? '前金' : '全額',
    status: ST.DRAFT,
    threadId: thread.getId(),
    driveUrl: folder.getUrl(),
    note: '発注書受領 ' + ymd(received) + ' / 自動起票'
  });

  console.log('S1 filed: ' + folder.getName() + ' (' + atts.length + ' files)');
  return folder;
}

/**
 * S2: 自社が送った請求書の添付を案件フォルダへ保存する。
 * 送信済みメールを走査するため classifyInbox とは別に回す。
 */
function fileSentInvoices() {
  var props = PropertiesService.getScriptProperties();
  var since = props.getProperty('LAST_FILING') || String(Math.floor(Date.now() / 1000) - 86400 * 14);
  var startedAt = Math.floor(Date.now() / 1000);

  var threads = GmailApp.search('in:sent after:' + since + ' subject:(【御請求書】)', 0, 50);
  var saved = 0;

  threads.forEach(function (thread) {
    try {
      var client = resolveClientFromThread(thread);
      if (!client) return;

      var subject = thread.getFirstMessageSubject() || '';
      thread.getMessages().forEach(function (m) {
        if (m.getFrom().indexOf(OWN_DOMAIN) === -1) return;
        var atts = m.getAttachments({ includeInlineImages: false }).filter(function (a) {
          return /\.(pdf|xlsx?)$/i.test(a.getName());
        });
        if (atts.length === 0) return;

        var msgSubject = m.getSubject() || subject;
        var poNo = extractPoNumber(msgSubject) ||
                   extractPoNumber(atts[0].getName()) ||
                   yymmdd(m.getDate());
        var kind = extractKind(msgSubject) || extractKind(atts[0].getName()) || '全額';
        var folder = caseFolder(client, poNo, m.getDate(), extractProjectName(msgSubject));

        atts.forEach(function (a) {
          // 相手から来た発注書を参考添付し直したものは原本名のまま別保存しない
          var docType = /見積/.test(a.getName()) ? '見積書'
                      : /発注/.test(a.getName()) ? '発注書'
                      : '請求書';
          var k = (docType === '請求書') ? kind : null;
          if (saveAttachment(folder, a, ymdCompact(m.getDate()), poNo, docType, k)) saved++;
        });

        // 台帳へ Drive リンクとステータスを反映
        var invoiceNo = ['CRS', client.code, poNo,
                         kind === '前金' ? '1' : kind === '残金' ? '2' : '0'].join('-');
        upsertLedgerRow({
          invoiceNo: invoiceNo,
          clientCode: client.code,
          clientName: client.name,
          project: extractProjectName(msgSubject),
          poNo: poNo,
          kind: kind,
          issueDate: ymd(m.getDate()),
          dueDate: ymd(calcDueDate(m.getDate(), client.terms)),
          status: ST.WAITING,
          threadId: thread.getId(),
          driveUrl: folder.getUrl()
        });
      });
    } catch (err) {
      console.error('fileSentInvoices failed: ' + err);
    }
  });

  props.setProperty('LAST_FILING', String(startedAt));
  console.log('fileSentInvoices: ' + saved + ' files saved');
  return saved;
}

/**
 * S4: 差し替え時に旧版を 90_アーカイブ へ退避する。
 * 手動運用の補助。ファイル名を指定して呼ぶ。
 */
function archiveOldVersion(fileId) {
  var file = DriveApp.getFileById(fileId);
  var archive = DriveApp.getFolderById(CFG().ARCHIVE_FOLDER_ID);
  var dated = childFolder(archive, fmt(new Date(), 'yyyy-MM'));
  file.moveTo(dated);
  return dated.getUrl();
}

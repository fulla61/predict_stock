/**
 * QuickSave.gs ── 送信済みメールの添付を Drive へ遡及保存する単発ツール
 *
 * Apps Script 本体（Setup.gs のトリガー）を設置する前でも、
 * このファイル単独で script.google.com に貼り付けて実行できる。
 * Script Properties も不要。
 *
 * 使い方:
 *   1. script.google.com → 新規プロジェクト → このファイルを貼り付け
 *   2. 関数 saveCri002Zankin を選んで実行（初回は Gmail/Drive の承認が出る）
 *   3. ログに「saved:」と出れば完了
 */

/** CRI-002 残金請求書（2026-08-21 送信）を案件フォルダへ統一命名で保存する */
function saveCri002Zankin() {
  saveSentAttachmentToFolder(
    'in:sent subject:(20260821_CRI-002_残金請求書)',   // 送信済みメールの検索条件
    '1DYNruebZI3QEQiMS-xzSIodIKbR3NTyS',               // 260609【CRI-002】ホワイトニング機材
    '20260821_CRS-CRI-002_2_残金請求書_ホワイトニング機材.pdf'
  );
}

/**
 * 検索条件に一致する送信済みメールのPDF添付を、指定フォルダへ指定名で保存する。
 * 同名ファイルが既にあれば何もしない（多重保存の防止）。
 */
function saveSentAttachmentToFolder(query, folderId, newName) {
  var folder = DriveApp.getFolderById(folderId);
  if (folder.getFilesByName(newName).hasNext()) {
    Logger.log('既に存在するためスキップ: ' + newName);
    return null;
  }

  var threads = GmailApp.search(query, 0, 5);
  if (!threads.length) throw new Error('メールが見つかりません: ' + query);

  var saved = null;
  threads.some(function (thread) {
    return thread.getMessages().some(function (m) {
      var atts = m.getAttachments({ includeInlineImages: false });
      return atts.some(function (a) {
        if (!/\.pdf$/i.test(a.getName())) return false;
        saved = folder.createFile(a.copyBlob().setName(newName));
        Logger.log('saved: ' + newName + ' (' + a.getBytes().length + ' bytes) → ' + folder.getName());
        return true;
      });
    });
  });

  if (!saved) throw new Error('PDF添付が見つかりません: ' + query);
  return saved;
}

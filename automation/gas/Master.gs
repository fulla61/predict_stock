/**
 * 取引先マスタ ── 自動化の単一の真実源（ルール §1）
 *
 * マスタ未登録の相手からのメールは分類だけ行い、
 * 案件フォルダ作成・台帳登録は行わない（採番衝突を防ぐため）。
 */

var MCOL = {
  CODE: 0, NAME: 1, TO: 2, CC: 3, HONORIFIC: 4, TERMS: 5,
  SITE: 6, DRIVE_FOLDER: 7, LABEL: 8, EXCEPTION: 9, STATUS: 10
};

/** 取引先マスタを読み、コード引き・ドメイン引きの両方を返す */
function loadMaster() {
  if (loadMaster._cache) return loadMaster._cache;

  var sh = SpreadsheetApp.openById(CFG().MASTER_ID).getSheets()[0];
  var rows = sh.getDataRange().getValues();
  var byCode = {}, byAddress = {}, byDomain = {};

  for (var i = 1; i < rows.length; i++) {
    var r = rows[i];
    var code = String(r[MCOL.CODE] || '').trim();
    if (!code) continue;
    if (String(r[MCOL.STATUS] || '').trim() === '休止') continue;

    var entry = {
      code: code,
      name: String(r[MCOL.NAME] || '').trim(),
      to: splitAddrs(r[MCOL.TO]),
      cc: splitAddrs(r[MCOL.CC]),
      honorific: String(r[MCOL.HONORIFIC] || 'ご担当者様').trim(),
      terms: String(r[MCOL.TERMS] || 'C').trim().toUpperCase(),
      site: String(r[MCOL.SITE] || '').trim(),
      driveFolder: String(r[MCOL.DRIVE_FOLDER] || '').trim(),
      label: String(r[MCOL.LABEL] || (L.CLIENT_PREFIX + code)).trim(),
      exception: String(r[MCOL.EXCEPTION] || '').trim()
    };

    byCode[code] = entry;
    entry.to.concat(entry.cc).forEach(function (a) {
      byAddress[a.toLowerCase()] = entry;
      var dom = a.split('@')[1];
      if (dom && dom.toLowerCase() !== OWN_DOMAIN) byDomain[dom.toLowerCase()] = entry;
    });
  }

  loadMaster._cache = { byCode: byCode, byAddress: byAddress, byDomain: byDomain };
  return loadMaster._cache;
}

function splitAddrs(v) {
  return String(v || '')
    .split(/[;,]/)
    .map(function (s) { return s.trim(); })
    .filter(Boolean);
}

/** メールアドレス文字列（"名前 <a@b>" 形式可）から取引先を引く */
function resolveClient(addressField) {
  if (!addressField) return null;
  var m = loadMaster();
  var addrs = String(addressField).match(/[\w.+-]+@[\w.-]+\.\w+/g) || [];
  for (var i = 0; i < addrs.length; i++) {
    var a = addrs[i].toLowerCase();
    if (a.indexOf('@' + OWN_DOMAIN) !== -1) continue;
    if (m.byAddress[a]) return m.byAddress[a];
    var dom = a.split('@')[1];
    if (m.byDomain[dom]) return m.byDomain[dom];
  }
  return null;
}

/** スレッド全体（送受信の両方向）から取引先を特定する */
function resolveClientFromThread(thread) {
  var msgs = thread.getMessages();
  for (var i = 0; i < msgs.length; i++) {
    var c = resolveClient(msgs[i].getFrom()) ||
            resolveClient(msgs[i].getTo())   ||
            resolveClient(msgs[i].getCc());
    if (c) return c;
  }
  return null;
}

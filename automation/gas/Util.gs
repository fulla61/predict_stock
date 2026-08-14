/**
 * 共通ユーティリティ ── 営業日計算・日付整形・件名解析
 */

var TZ = 'Asia/Tokyo';

function fmt(date, pattern) {
  return Utilities.formatDate(date, TZ, pattern);
}

function ymd(date)   { return fmt(date, 'yyyy-MM-dd'); }
function ymdCompact(date) { return fmt(date, 'yyyyMMdd'); }
function yymmdd(date){ return fmt(date, 'yyMMdd'); }

function today() {
  var d = new Date();
  return new Date(fmt(d, 'yyyy/MM/dd') + ' 00:00:00');
}

function parseDate(v) {
  if (!v) return null;
  if (v instanceof Date) return new Date(fmt(v, 'yyyy/MM/dd') + ' 00:00:00');
  var s = String(v).trim().replace(/-/g, '/');
  if (!/^\d{4}\/\d{1,2}\/\d{1,2}$/.test(s)) return null;
  var d = new Date(s + ' 00:00:00');
  return isNaN(d.getTime()) ? null : d;
}

/* ---------- 営業日 ---------- */

var HOLIDAY_CAL = 'ja.japanese#holiday@group.v.calendar.google.com';

/** 日本の祝日セット（YYYY-MM-DD）を1年分キャッシュする */
function holidaySet() {
  if (holidaySet._cache) return holidaySet._cache;

  var cache = CacheService.getScriptCache();
  var hit = cache.get('jp_holidays');
  if (hit) {
    holidaySet._cache = new Set(JSON.parse(hit));
    return holidaySet._cache;
  }

  var set = new Set();
  try {
    var cal = CalendarApp.getCalendarById(HOLIDAY_CAL);
    if (cal) {
      var from = new Date(); from.setMonth(from.getMonth() - 3);
      var to   = new Date(); to.setMonth(to.getMonth() + 12);
      cal.getEvents(from, to).forEach(function (e) {
        set.add(ymd(e.getStartTime()));
      });
    }
  } catch (err) {
    // 祝日カレンダーが引けなくても土日判定だけで動作を継続する
    console.warn('祝日カレンダー取得に失敗: ' + err);
  }

  cache.put('jp_holidays', JSON.stringify(Array.from(set)), 21600); // 6h
  holidaySet._cache = set;
  return set;
}

function isBusinessDay(d) {
  var w = d.getDay();
  if (w === 0 || w === 6) return false;
  return !holidaySet().has(ymd(d));
}

/** d から n 営業日後（n が負なら前）の日付 */
function addBusinessDays(d, n) {
  var cur = new Date(d.getTime());
  var step = n >= 0 ? 1 : -1;
  var left = Math.abs(n);
  while (left > 0) {
    cur.setDate(cur.getDate() + step);
    if (isBusinessDay(cur)) left--;
  }
  return cur;
}

/** from から to までの営業日数。to が過去なら負値。 */
function businessDaysBetween(from, to) {
  if (!from || !to) return null;
  var sign = to >= from ? 1 : -1;
  var a = sign > 0 ? new Date(from.getTime()) : new Date(to.getTime());
  var b = sign > 0 ? to : from;
  var count = 0;
  while (a < b) {
    a.setDate(a.getDate() + 1);
    if (isBusinessDay(a)) count++;
  }
  return count * sign;
}

/** 支払期限が休日なら翌営業日へ送る（ルール §7 チェック③） */
function shiftToBusinessDay(d) {
  var cur = new Date(d.getTime());
  while (!isBusinessDay(cur)) cur.setDate(cur.getDate() + 1);
  return cur;
}

/** 区分から支払期限を算出（ルール §2） */
function calcDueDate(issueDate, terms) {
  var d;
  if (terms === 'A') {
    d = new Date(issueDate.getTime());
    d.setDate(d.getDate() + 14);              // 請求日から14日以内
  } else {
    d = new Date(issueDate.getFullYear(), issueDate.getMonth() + 2, 0); // 翌月末日
  }
  return shiftToBusinessDay(d);
}

/* ---------- 件名・添付の解析 ---------- */

/**
 * 件名や添付ファイル名から発注書番号を抽出する。
 * 【4002】 / No.4002 / 発注【4002】 / PO-0000000947 などに対応。
 * 見つからなければ null（呼び出し側が受領日 YYMMDD で代用する）。
 */
function extractPoNumber(text) {
  if (!text) return null;
  var patterns = [
    /【\s*([A-Za-z0-9\-_]{2,20})\s*】/,
    /PO[-‐]?0*(\d{3,12})/i,
    /\bNo\.?\s*([A-Za-z0-9\-]{2,20})/i,
    /\b(\d{4})\s*発注/
  ];
  for (var i = 0; i < patterns.length; i++) {
    var m = text.match(patterns[i]);
    if (m && m[1] && !/^\d{6,8}$/.test(m[1])) return m[1].replace(/[-_]/g, '');
    if (m && m[1]) return m[1].replace(/[-_]/g, '');
  }
  return null;
}

/** 件名から区分（前金／残金／全額）を判定する */
function extractKind(text) {
  if (!text) return null;
  if (/前金|着手金|前払/.test(text)) return '前金';
  if (/残金|残額|後金/.test(text))   return '残金';
  if (/全額|一括/.test(text))        return '全額';
  return null;
}

/**
 * 件名から案件名を推定する。
 * 定型の飾り（【御請求書】/ 社名 / 日付 / 番号）を削って中身だけ残す。
 */
function extractProjectName(subject) {
  if (!subject) return '案件';
  var s = subject
    .replace(/^(Re|Fwd?)\s*:\s*/gi, '')
    .replace(/【[^】]*】/g, ' ')
    .replace(/\/\s*クロスイメージ株式会社.*$/, '')
    .replace(/\d{4}年\d{1,2}月分/g, ' ')
    .replace(/\d{6,8}/g, ' ')
    .replace(/(御請求書|請求書|御見積書|見積書|発注書|発注|納品書)/g, ' ')
    .replace(/[_、,]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return s || '案件';
}

/** ファイル名に使えない文字を落とす */
function safeName(s) {
  return String(s).replace(/[\\\/:*?"<>|]/g, '_').replace(/\s+/g, '').slice(0, 60);
}

/** 金額を ¥1,234,567 形式に */
function yen(n) {
  if (n === '' || n === null || n === undefined || isNaN(n)) return '';
  return '¥' + Number(n).toLocaleString('ja-JP');
}

function jpDate(d) {
  return d ? fmt(d, 'yyyy年M月d日') : '';
}

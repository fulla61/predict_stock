// GAS グローバルのスタブ
global.Utilities = {
  formatDate: (d, tz, pat) => {
    const p = n => String(n).padStart(2, '0');
    const Y = d.getFullYear(), M = d.getMonth() + 1, D = d.getDate();
    if (pat === 'yyyy-MM-dd') return `${Y}-${p(M)}-${p(D)}`;
    if (pat === 'yyyyMMdd')   return `${Y}${p(M)}${p(D)}`;
    if (pat === 'yyMMdd')     return `${String(Y).slice(2)}${p(M)}${p(D)}`;
    if (pat === 'yyyy/MM/dd') return `${Y}/${p(M)}/${p(D)}`;
    if (pat === 'yyyy')       return String(Y);
    if (pat === 'yyyy年M月d日') return `${Y}年${M}月${D}日`;
    if (pat === 'yyyy-MM')    return `${Y}-${p(M)}`;
    throw new Error('unhandled pattern ' + pat);
  }
};
// 祝日なし前提（土日のみ休み）で検証する
global.CacheService = { getScriptCache: () => ({ get: () => JSON.stringify([]), put: () => {} }) };
global.CalendarApp = { getCalendarById: () => null };
global.console = console;

const fs = require('fs');
eval(fs.readFileSync(__dirname + '/../gas/Config.gs', 'utf8'));
eval(fs.readFileSync(__dirname + '/../gas/Util.gs', 'utf8'));
eval(fs.readFileSync(__dirname + '/../gas/Ledger.gs', 'utf8').replace(/^function ledgerSheet[\s\S]*?\n}/m, ''));

let pass = 0, fail = 0;
function eq(label, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) { pass++; console.log(`  PASS ${label}`); }
  else { fail++; console.log(`  FAIL ${label}\n       got  ${JSON.stringify(got)}\n       want ${JSON.stringify(want)}`); }
}
const D = s => new Date(s + ' 00:00:00');

console.log('\n■ 営業日計算（2026-08 / 土日のみ休み）');
// 2026-08-14 は金曜
eq('金曜+1営業日 → 月曜', ymd(addBusinessDays(D('2026/08/14'), 1)), '2026-08-17');
eq('金曜+3営業日',        ymd(addBusinessDays(D('2026/08/14'), 3)), '2026-08-19');
eq('金曜-3営業日',        ymd(addBusinessDays(D('2026/08/14'), -3)), '2026-08-11');
eq('月曜-1営業日 → 金曜', ymd(addBusinessDays(D('2026/08/17'), -1)), '2026-08-14');

console.log('\n■ businessDaysBetween（期限からの経過営業日）');
eq('期限当日 = 0',        businessDaysBetween(D('2026/08/14'), D('2026/08/14')), 0);
eq('期限+1営業日',        businessDaysBetween(D('2026/08/14'), D('2026/08/17')), 1);
eq('期限+3営業日',        businessDaysBetween(D('2026/08/14'), D('2026/08/19')), 3);
eq('期限3営業日前 = -3',  businessDaysBetween(D('2026/08/14'), D('2026/08/11')), -3);
eq('期限+10営業日',       businessDaysBetween(D('2026/08/14'), D('2026/08/28')), 10);

console.log('\n■ 支払期限の算出（ルール §2）');
eq('区分A: 請求日+14日',  ymd(calcDueDate(D('2026/08/11'), 'A')), '2026-08-25');
eq('区分B: 翌月末日',     ymd(calcDueDate(D('2026/08/11'), 'B')), '2026-09-30');
eq('区分C: 翌月末日',     ymd(calcDueDate(D('2026/07/27'), 'C')), '2026-08-31');
// 2026-10-31 は土曜 → 翌営業日 11/2(月) へ送る
eq('期限が土曜 → 翌営業日', ymd(calcDueDate(D('2026/09/15'), 'B')), '2026-11-02');

console.log('\n■ 件名解析');
eq('【4002】',      extractPoNumber('フットレスト発注【4002】'), '4002');
eq('PO-0000000947', extractPoNumber('PO-0000000947 残金'), '947');
eq('番号なし',      extractPoNumber('サンプル発注書の送付'), null);
eq('区分 前金',     extractKind('【御請求書】2026年8月分_フットレスト_前金_CRS-WLB-4002-1'), '前金');
eq('区分 残金',     extractKind('20260630_3000_請求書_残金.pdf'), '残金');
eq('区分なし',      extractKind('発注書'), null);
eq('案件名抽出',    extractProjectName('【御請求書】20260803_サンプル郵送費_請求書 / クロスイメージ株式会社'), 'サンプル郵送費');

console.log('\n■ ステータス遷移（機械が巻き戻さないこと）');
eq('未送付→入金待ち 可',   canAdvance('未送付', '入金待ち'), true);
eq('入金待ち→督促中 可',   canAdvance('入金待ち', '督促中'), true);
eq('督促中→入金待ち 不可', canAdvance('督促中', '入金待ち'), false);
eq('入金済→入金待ち 不可', canAdvance('入金済', '入金待ち'), false);
eq('相殺精算済→督促中 不可', canAdvance('相殺・精算済', '督促中'), false);
eq('同値は更新しない',     canAdvance('入金待ち', '入金待ち'), false);

console.log(`\n結果: ${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);

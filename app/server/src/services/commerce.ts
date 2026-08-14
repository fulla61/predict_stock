import type { ProjectRow } from '../repo/projects.js';
import {
  getLatestRequirement,
  listQuestions,
  listSpecFields,
} from '../repo/projects.js';
import { getLatestProposal, listOptions } from '../repo/proposals.js';
import { listLatestQuotesForProject, type QuoteRow } from '../repo/rfqs.js';
import { getLatestLoop } from '../repo/loops.js';
import type { LoopOptionInput } from '../repo/loops.js';
import { getSettingNumber } from '../repo/settings.js';
import {
  generateLoopOptions,
  generateRfqDraft,
  type LoopCandidate,
  type RfqContext,
  type RfqResult,
} from './ai.js';

// ============================================================
// BI-2 商流サービス（RFQ生成コンテキスト / 係数価格 / Feasibility分析）
// 遮断: RFQコンテキストから予算・販売価格系を除外。
//       AIへは原価を渡さず、係数適用済みの表示レンジのみを渡す。
// ============================================================

// 予算・販売価格系フィールドはRFQ（工場向け文書）に絶対に含めない
const RFQ_EXCLUDED_FIELD_KEYS = new Set(['budget', 'answer_budget']);
const RFQ_EXCLUDED_PATTERN = /予算|販売価格|売価|マージン|利益/;

export function buildRfqContext(project: ProjectRow): RfqContext {
  const req = getLatestRequirement(project.id);
  const analysis = req?.analysis_json ? (JSON.parse(req.analysis_json) as { categoryLabel?: string }) : {};
  const fields = listSpecFields(project.id)
    .filter((f) => !RFQ_EXCLUDED_FIELD_KEYS.has(f.field_key))
    .filter((f) => !RFQ_EXCLUDED_PATTERN.test(f.name_ja))
    .map((f) => ({ label: f.name_ja, value: f.value ?? '未定' }));
  const answers = listQuestions(project.id)
    .filter((q) => q.answer_value !== null)
    .filter((q) => !RFQ_EXCLUDED_PATTERN.test(q.title) && q.question_key !== 'budget')
    .map((q) => ({ question: q.title, answer: q.answer_value as string }));

  return {
    projectPublicId: project.public_id,
    categoryLabel: analysis.categoryLabel ?? '雑貨・生活用品',
    fields,
    answers,
    qtyTiers: buildQtyTiers(getDesiredQty(project.id)),
  };
}

export function getDesiredQty(projectId: number): string | null {
  const qty = listSpecFields(projectId).find((f) => f.field_key === 'qty');
  if (!qty || !qty.value || qty.value.includes('未定')) return null;
  return qty.value;
}

function parseQtyNumber(qtyText: string | null): number | null {
  if (!qtyText) return null;
  const m = qtyText.replace(/[,，]/g, '').match(/(\d+)/);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function fmt(n: number): string {
  return n.toLocaleString('ja-JP');
}

export function buildQtyTiers(desiredQty: string | null): string[] {
  const n = parseQtyNumber(desiredQty);
  if (n) return [fmt(n), fmt(n * 2), fmt(n * 5)];
  return ['500', '1,000', '3,000'];
}

// 顧客向け表示価格レンジ = 見積単価 × 為替 × 係数（settings.price_coefficient / cny_jpy_rate、CONFIGURABLE）
// 原価そのものは顧客向けデータに出さず、係数適用後のレンジ文字列だけを扱う。
export function computeCustomerPriceRange(quote: Pick<QuoteRow, 'currency' | 'unit_price'>): string {
  const coefficient = getSettingNumber('price_coefficient', 1.35);
  const rate =
    quote.currency === 'CNY'
      ? getSettingNumber('cny_jpy_rate', 21)
      : quote.currency === 'USD'
        ? getSettingNumber('usd_jpy_rate', 150)
        : 1;
  const base = quote.unit_price * rate * coefficient;
  const round10 = (v: number): number => Math.max(10, Math.round(v / 10) * 10);
  const round10up = (v: number): number => Math.max(10, Math.ceil(v / 10) * 10);
  const low = round10(base);
  const high = round10up(base * 1.15);
  // 単位（／個）や注記はUI側で付与する。レンジが潰れる場合は「約」表記に集約
  return high > low ? `¥${fmt(low)}〜¥${fmt(high)}` : `約¥${fmt(low)}`;
}

export interface LoopAnalysisResult {
  feasibility: unknown;
  aiMode: 'live' | 'mock';
  options: LoopOptionInput[];
  triggerReason: string;
}

export async function runLoopAnalysis(project: ProjectRow): Promise<LoopAnalysisResult | { error: string }> {
  const quotes = listLatestQuotesForProject(project.id);
  if (quotes.length === 0) {
    return { error: 'NO_QUOTES' };
  }
  const desiredQty = getDesiredQty(project.id);
  const desiredQtyN = parseQtyNumber(desiredQty);

  // 顧客の選択済みプラン
  const proposal = getLatestProposal(project.id);
  const selectedOption = proposal
    ? listOptions(proposal.id).find((o) => o.selected_at !== null)
    : undefined;

  // 2周目トリガー: 直前loopがMODIFYか
  const prevLoop = getLatestLoop(project.id);
  const triggerReason = prevLoop?.customer_decision === 'MODIFY' ? 'CUSTOMER_MODIFY' : 'INITIAL';
  const modifyNote = triggerReason === 'CUSTOMER_MODIFY' ? (prevLoop?.modify_note ?? null) : null;

  // Feasibility: 顧客の希望（数量・選択案） vs 登録済み全Quote の差分（内部用JSON）
  const feasibility = {
    desiredQty,
    selectedPlan: selectedOption
      ? { title: selectedOption.title, qtyFrom: selectedOption.qty_from, priceRangeJpy: selectedOption.price_range_jpy }
      : null,
    trigger: triggerReason,
    modifyNote,
    quotes: quotes.map((q) => ({
      quotePublicId: q.public_id,
      factoryName: q.factory_name, // 内部用（顧客へは返さない）
      versionNo: q.version_no,
      currency: q.currency,
      unitPrice: q.unit_price,
      moq: q.moq,
      leadDays: q.lead_days,
      moqVsDesired:
        desiredQtyN === null ? 'UNKNOWN' : q.moq <= desiredQtyN ? 'OK' : 'MOQ_ABOVE_DESIRED',
    })),
    analyzedAt: new Date().toISOString(),
  };

  // AIへ渡す候補（匿名化: 工場名・原価を含めない。価格は係数適用済みレンジのみ）
  const candidates: LoopCandidate[] = quotes.map((q, i) => ({
    index: i,
    customerPriceRange: computeCustomerPriceRange(q),
    moq: q.moq,
    leadDays: q.lead_days,
    qtyHint: `${fmt(q.moq)}個〜`,
  }));

  const understanding = listSpecFields(project.id)
    .filter((f) => f.field_key !== 'budget')
    .map((f) => ({ label: f.name_ja, value: f.value ?? '未定' }));

  const gen = await generateLoopOptions({
    understanding,
    desiredQty,
    selectedPlanTitle: selectedOption?.title ?? null,
    modifyNote,
    candidates,
  });

  const options: LoopOptionInput[] = gen.options.map((o) => ({
    key: o.key,
    title: o.title,
    concept: o.concept,
    customerPriceRange: o.customerPriceRange,
    qtyFrom: o.qtyFrom,
    leadDays: o.leadDays,
    pros: o.pros,
    tradeoff: o.tradeoff,
    basedOnQuoteId: o.basedOnIndex !== null ? (quotes[o.basedOnIndex]?.id ?? null) : null,
    internalNote: o.internalNote,
    recommended: o.recommended,
  }));

  return { feasibility, aiMode: gen.aiMode, options, triggerReason };
}

export async function generateRfqForProject(project: ProjectRow): Promise<RfqResult> {
  return generateRfqDraft(buildRfqContext(project));
}

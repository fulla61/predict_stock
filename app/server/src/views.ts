// CLIENT向けレスポンス整形（遮断: 内部フィールドを含めない）
// CLIENTへ返すJSONは必ずこのファイルの toClientView 系関数を経由すること。
import type {
  AgreementCheckItem,
  AgreementClientView,
  AgreementLimitSample,
  AgreementResponsibility,
  AgreementStaffView,
  AgreementTolerance,
  DocumentStaffView,
  DocumentView,
  FactoryView,
  LoopClientView,
  LoopOptionClientView,
  LoopOptionStaffView,
  LoopStaffView,
  ProposalOptionView,
  ProposalView,
  QuestionView,
  QuoteView,
  RfqView,
  UnderstandingField,
} from '../../shared/api-types.js';
import type { SpecFieldRow, QuestionRow } from './repo/projects.js';
import type { ProposalRow, ProposalOptionRow } from './repo/proposals.js';
import type { FactoryRow } from './repo/factories.js';
import type { LoopOptionRow, LoopRow } from './repo/loops.js';
import type { QuoteConditionRow, QuoteRow, RfqRow } from './repo/rfqs.js';
import type { DocumentWithUploader } from './repo/documents.js';
import type { AgreementRow } from './repo/agreements.js';

export function toUnderstandingView(rows: SpecFieldRow[]): UnderstandingField[] {
  return rows.map((r) => ({
    key: r.field_key,
    label: r.name_ja,
    value: r.value ?? '',
    // CLIENT_ANSWERは顧客回答由来なのでFROM_INPUT扱いで表示
    source: r.source === 'AI_INFERRED' ? 'AI_INFERRED' : 'FROM_INPUT',
    status: r.status,
  }));
}

export function toQuestionView(rows: QuestionRow[]): QuestionView[] {
  return rows.map((q) => ({
    id: q.id,
    key: q.question_key,
    title: q.title,
    options: JSON.parse(q.choices_json) as string[],
    answer: q.answer_value,
  }));
}

// BI-3: hidePrices=true（projects.hide_initial_prices=1）のCLIENT向けでは
// priceRangeJpy をレスポンスから完全に除外する（金額非表示モード）。
export function toOptionView(rows: ProposalOptionRow[], hidePrices = false): ProposalOptionView[] {
  return rows.map((o) => ({
    id: o.id,
    key: o.option_key,
    title: o.title,
    concept: o.concept,
    ...(hidePrices ? {} : { priceRangeJpy: o.price_range_jpy }),
    qtyFrom: o.qty_from,
    leadDays: o.lead_days,
    pros: JSON.parse(o.pros_json) as string[],
    tradeoff: o.tradeoff,
    recommended: o.recommended === 1,
    selected: o.selected_at !== null,
  }));
}

export function toProposalView(
  row: ProposalRow,
  options: ProposalOptionRow[],
  hidePrices = false
): ProposalView {
  const opts = toOptionView(options, hidePrices);
  const selected = opts.find((o) => o.selected);
  return {
    id: row.id,
    status: row.status,
    aiMode: row.ai_mode,
    options: opts,
    selectedOptionId: selected ? selected.id : null,
  };
}

// ============================================================
// BI-2（CONTRACT-2）
// ============================================================

// 【遮断・最重要】顧客向けOptionのサニタイズ。
// based_on_quote_id / internal_note / 工場情報 / 原価・マージン系を絶対に含めない。
// CLIENTへloop optionを返す経路は必ずこの関数を通すこと。
export function toLoopOptionClientView(rows: LoopOptionRow[]): LoopOptionClientView[] {
  return rows.map((o) => ({
    key: o.option_key,
    title: o.title,
    concept: o.concept,
    customerPriceRange: o.customer_price_range,
    qtyFrom: o.qty_from,
    leadDays: o.lead_days,
    pros: JSON.parse(o.pros_json) as string[],
    tradeoff: o.tradeoff,
    recommended: o.recommended === 1,
    selected: o.selected_at !== null,
  }));
}

export function toLoopClientView(loop: LoopRow, options: LoopOptionRow[]): LoopClientView {
  const selected = options.find((o) => o.selected_at !== null);
  return {
    id: loop.id,
    loopNo: loop.loop_no,
    options: toLoopOptionClientView(options),
    customerDecision: loop.customer_decision,
    selectedOptionKey: selected ? selected.option_key : null,
  };
}

// STAFF向け（内部フィールド込み）
export function toLoopOptionStaffView(rows: LoopOptionRow[]): LoopOptionStaffView[] {
  return rows.map((o) => ({
    ...toLoopOptionClientView([o])[0],
    id: o.id,
    basedOnQuoteId: o.based_on_quote_id,
    internalNote: o.internal_note,
  }));
}

export function toLoopStaffView(loop: LoopRow, options: LoopOptionRow[]): LoopStaffView {
  return {
    id: loop.id,
    publicId: loop.public_id,
    projectId: loop.project_id,
    loopNo: loop.loop_no,
    triggerReason: loop.trigger_reason,
    status: loop.status,
    aiMode: loop.ai_mode ?? 'mock',
    feasibility: JSON.parse(loop.feasibility_json) as unknown,
    customerDecision: loop.customer_decision,
    modifyNote: loop.modify_note,
    decidedAt: loop.decided_at,
    options: toLoopOptionStaffView(options),
    createdAt: loop.created_at,
  };
}

export function toFactoryView(row: FactoryRow): FactoryView {
  return {
    id: row.id,
    publicId: row.public_id,
    name: row.name,
    region: row.region,
    specialty: row.specialties,
    riskClass: row.risk_class,
    channelNote: row.channel_note,
    createdAt: row.created_at,
  };
}

export function toRfqView(row: RfqRow, factoryIds: number[]): RfqView {
  return {
    id: row.id,
    publicId: row.public_id,
    projectId: row.project_id,
    body: row.body_zh,
    status: row.status,
    sentAt: row.sent_at,
    sentChannel: row.sent_channel,
    aiMode: row.ai_mode ?? 'mock',
    factoryIds,
    createdAt: row.created_at,
  };
}

export function toQuoteView(
  row: QuoteRow & { factory_name: string },
  conditions: QuoteConditionRow[]
): QuoteView {
  return {
    id: row.id,
    publicId: row.public_id,
    rfqId: row.rfq_id,
    factoryId: row.factory_id,
    factoryName: row.factory_name,
    versionNo: row.version_no,
    supersedesQuoteId: row.supersedes_quote_id,
    currency: row.currency,
    unitPrice: row.unit_price,
    moq: row.moq,
    toolingCost: row.tooling_cost,
    sampleCost: row.sample_cost,
    leadDays: row.lead_days,
    validUntil: row.valid_until,
    notes: row.notes,
    conditions: conditions.map((c) => ({
      conditionType: c.condition_type,
      moqDimension: c.moq_dimension ?? undefined,
      thresholdQty: c.threshold_qty ?? undefined,
      value: c.value ?? undefined,
      note: c.note ?? undefined,
    })),
    createdAt: row.created_at,
  };
}

// ============================================================
// BI-3（CONTRACT-3）
// ============================================================

// 【遮断】顧客向け資料ビュー。storage_path・uploaded_by_user_id・visibility は絶対に含めない。
// アップロード者はロールラベルのみ。CLIENTへdocumentを返す経路は必ずこの関数を通すこと。
export function toDocumentClientView(row: DocumentWithUploader): DocumentView {
  return {
    id: row.id,
    publicId: row.public_id,
    title: row.title,
    fileName: row.file_name ?? '',
    mimeType: row.mime_type ?? 'application/octet-stream',
    sizeBytes: row.size_bytes ?? 0,
    uploadedByRole: row.uploaded_by_role ?? 'STAFF',
    source: row.source ?? 'STAFF',
    createdAt: row.created_at,
  };
}

// STAFF向け（visibility・氏名つき。storage_pathはAPIへ出さない）
export function toDocumentStaffView(row: DocumentWithUploader): DocumentStaffView {
  return {
    ...toDocumentClientView(row),
    projectId: row.project_id,
    visibility: row.visibility,
    uploadedByName: row.uploaded_by_name,
  };
}

function parseJsonOr<T>(json: string | null, fallback: T): T {
  if (!json) return fallback;
  try {
    return JSON.parse(json) as T;
  } catch {
    return fallback;
  }
}

// 顧客向け合意書ビュー。body_zh は工場転送用に含める。
// customer_note は記入した本人（当該client）とSTAFFのみが到達できる経路で使うこと。
export function toAgreementClientView(row: AgreementRow): AgreementClientView {
  return {
    id: row.id,
    publicId: row.public_id,
    versionNo: row.version_no,
    status: row.status,
    approvedSampleDocId: row.approved_sample_doc_id,
    checkItems: parseJsonOr<AgreementCheckItem[]>(row.check_items_json, []),
    limitSamples: parseJsonOr<AgreementLimitSample[]>(row.limit_samples_json, []),
    tolerance: parseJsonOr<AgreementTolerance | null>(row.tolerance_json, null),
    responsibility: parseJsonOr<AgreementResponsibility | null>(row.responsibility_json, null),
    bodyZh: row.body_zh,
    customerNote: row.customer_note,
    customerDecidedAt: row.customer_decided_at,
    createdAt: row.created_at,
  };
}

export function toAgreementStaffView(row: AgreementRow): AgreementStaffView {
  return {
    ...toAgreementClientView(row),
    projectId: row.project_id,
    aiMode: row.ai_mode ?? 'mock',
  };
}

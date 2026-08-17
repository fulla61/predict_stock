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
  FeedbackView,
  InspectionView,
  LotView,
  ProgressSummaryClient,
  SampleClientView,
  SampleStaffView,
  ShipmentView,
} from '../../shared/api-types.js';
import type { SpecFieldRow, QuestionRow } from './repo/projects.js';
import type { ProposalRow, ProposalOptionRow } from './repo/proposals.js';
import type { FactoryRow } from './repo/factories.js';
import type { LoopOptionRow, LoopRow } from './repo/loops.js';
import type { QuoteConditionRow, QuoteRow, RfqRow } from './repo/rfqs.js';
import type { DocumentWithUploader } from './repo/documents.js';
import type { AgreementRow } from './repo/agreements.js';
import type { SampleRow } from './repo/samples.js';
import type { InspectionRow, LotRow, ShipmentRow } from './repo/production.js';

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

// ============================================================
// BI-4（CONTRACT-4）
// ============================================================

// 【遮断・最重要】顧客向けサンプルビュー。
// factory_note / request_note を絶対に含めない。呼び出し側で CUSTOMER_REVIEW 以降のみに絞ること
// （repo の listClientVisibleSamples() を使う）。
export function toSampleClientView(row: SampleRow): SampleClientView {
  return {
    id: row.id,
    publicId: row.public_id,
    roundNo: row.round_no,
    status: row.status,
    photoDocIds: parseJsonOr<number[]>(row.photo_doc_ids_json, []),
    customerNote: row.customer_note,
    decidedAt: row.decided_at,
    createdAt: row.created_at,
  };
}

export function toSampleStaffView(row: SampleRow): SampleStaffView {
  return {
    ...toSampleClientView(row),
    projectId: row.project_id,
    requestNote: row.request_note,
    factoryNote: row.factory_note,
  };
}

// STAFF専用（CLIENTへは返さない。顧客向けは toProgressSummaryClient() のみ）
export function toLotView(row: LotRow): LotView {
  return {
    id: row.id,
    publicId: row.public_id,
    projectId: row.project_id,
    qty: row.qty,
    status: row.status,
    startedAt: row.started_at,
    expectedDoneOn: row.expected_done_on,
    doneAt: row.done_at,
    note: row.note,
    createdAt: row.created_at,
  };
}

export function toInspectionView(row: InspectionRow): InspectionView {
  return {
    id: row.id,
    publicId: row.public_id,
    projectId: row.project_id,
    lotId: row.lot_id,
    result: row.result,
    inspectedQty: row.inspected_qty,
    defectQty: row.defect_qty,
    defectNote: row.defect_note,
    photoDocIds: parseJsonOr<number[]>(row.photo_doc_ids_json, []),
    inspectedOn: row.inspected_on,
    createdAt: row.created_at,
  };
}

export function toShipmentView(row: ShipmentRow): ShipmentView {
  return {
    id: row.id,
    publicId: row.public_id,
    projectId: row.project_id,
    lotId: row.lot_id,
    method: row.method,
    status: row.status,
    etd: row.etd,
    eta: row.eta,
    deliveredOn: row.delivered_on,
    destinationNote: row.destination_note,
    trackingNote: row.tracking_note,
    createdAt: row.created_at,
  };
}

const SHIPMENT_METHOD_JA: Record<ShipmentRow['method'], string> = {
  SEA: '船便',
  AIR: '航空便',
  COURIER: '国際宅配便',
};

// 【遮断・最重要】顧客向け進捗サマリー。
// 工場名・不良内訳（defect_qty/defect_note）・内部メモ（note/destination_note/tracking_note）を
// 絶対に含めない。検品は「合格しました（抜取n=◯）」レベルのみ。FAILの存在自体を顧客へ出さない。
export function toProgressSummaryClient(
  lots: LotRow[],
  inspections: InspectionRow[],
  shipments: ShipmentRow[]
): ProgressSummaryClient | null {
  if (lots.length === 0 && shipments.length === 0) return null;

  const latestLot = lots.length > 0 ? lots[lots.length - 1] : null;
  const production: ProgressSummaryClient['production'] = {
    status: latestLot ? latestLot.status : 'NONE',
    expectedDoneOn: latestLot?.expected_done_on ?? null,
  };

  // 合格実績のみ（不良数・メモは絶対に出さない）
  const latestPass = [...inspections].reverse().find((i) => i.result === 'PASS');
  const inspection: ProgressSummaryClient['inspection'] = latestPass
    ? {
        passed: true,
        summaryJa: `検品に合格しました（抜取${latestPass.inspected_qty}個）`,
      }
    : null;

  const latestShipment = shipments.length > 0 ? shipments[shipments.length - 1] : null;
  const shipping: ProgressSummaryClient['shipping'] = latestShipment
    ? {
        method: latestShipment.method,
        status: latestShipment.status,
        eta: latestShipment.eta,
        deliveredOn: latestShipment.delivered_on,
      }
    : null;

  // 状況カード（顧客向け文言）
  const cards: string[] = [];
  if (latestShipment && latestShipment.status !== 'PREPARING') {
    const methodJa = SHIPMENT_METHOD_JA[latestShipment.method];
    if (latestShipment.status === 'SHIPPED') {
      cards.push(
        latestShipment.eta
          ? `輸送中です（${methodJa}・到着予定 ${latestShipment.eta}）`
          : `輸送中です（${methodJa}）`
      );
    } else if (latestShipment.status === 'CUSTOMS') {
      cards.push('通関手続き中です');
    } else if (latestShipment.status === 'ARRIVED_JP') {
      cards.push('日本に到着しました。お届けの準備をしています');
    } else if (latestShipment.status === 'DELIVERED') {
      cards.push('お届けが完了しました。お受け取りの確認をお願いします');
    }
  } else if (latestLot && latestLot.status === 'DONE') {
    cards.push('生産が完了しました。出荷の準備をしています');
  } else if (latestLot && latestLot.status === 'IN_PROGRESS') {
    cards.push(
      latestLot.expected_done_on
        ? `生産中です（${latestLot.expected_done_on}ごろ完了予定）`
        : '生産中です'
    );
  } else if (latestLot) {
    cards.push('生産の準備を進めています');
  }
  if (inspection) cards.push(inspection.summaryJa);

  return { production, inspection, shipping, cards };
}

export function toFeedbackView(feedbackJson: string | null): FeedbackView | null {
  const parsed = parseJsonOr<{
    rating?: number;
    comment?: string | null;
    askedRepeat?: boolean;
    submittedAt?: string;
  } | null>(feedbackJson, null);
  if (!parsed || typeof parsed.rating !== 'number') return null;
  return {
    rating: parsed.rating,
    comment: parsed.comment ?? null,
    askedRepeat: parsed.askedRepeat === true,
    submittedAt: parsed.submittedAt ?? '',
  };
}

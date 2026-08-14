// CLIENT向けレスポンス整形（遮断: 内部フィールドを含めない）
// CLIENTへ返すJSONは必ずこのファイルの toClientView 系関数を経由すること。
import type {
  ProposalOptionView,
  ProposalView,
  QuestionView,
  UnderstandingField,
} from '../../shared/api-types.js';
import type { SpecFieldRow, QuestionRow } from './repo/projects.js';
import type { ProposalRow, ProposalOptionRow } from './repo/proposals.js';

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

export function toOptionView(rows: ProposalOptionRow[]): ProposalOptionView[] {
  return rows.map((o) => ({
    id: o.id,
    key: o.option_key,
    title: o.title,
    concept: o.concept,
    priceRangeJpy: o.price_range_jpy,
    qtyFrom: o.qty_from,
    leadDays: o.lead_days,
    pros: JSON.parse(o.pros_json) as string[],
    tradeoff: o.tradeoff,
    recommended: o.recommended === 1,
    selected: o.selected_at !== null,
  }));
}

export function toProposalView(row: ProposalRow, options: ProposalOptionRow[]): ProposalView {
  const opts = toOptionView(options);
  const selected = opts.find((o) => o.selected);
  return {
    id: row.id,
    status: row.status,
    aiMode: row.ai_mode,
    options: opts,
    selectedOptionId: selected ? selected.id : null,
  };
}

import {
  getLatestRequirement,
  insertQuestion,
  listQuestions,
  listSpecFields,
  saveRequirementAnalysis,
  upsertProjectAttributes,
  upsertProjectDna,
  upsertSpecField,
  type ProjectRow,
} from '../repo/projects.js';
import { getSettingNumber } from '../repo/settings.js';
import {
  analyzeRequirement,
  generateProposals,
  type AnalysisResult,
  type ProjectContext,
  type ProposalsResult,
} from './ai.js';

// 相談分析の結果をDBへ反映（AI推定は必ずAI_SUGGESTED / 顧客明示はPROVISIONAL）
// BI-3: inheritedKeys（前回案件から引き継いだ項目キー）がある場合、
//   - 引き継ぎ済みフィールドはAI分析で上書きしない
//   - 引き継ぎ済み項目に対する質問は出さない（差分だけ質問 ≤2）
//   - DNA/属性も引き継ぎ済みのため上書きしない
export function applyAnalysis(
  projectId: number,
  requirementId: number,
  analysis: AnalysisResult,
  inheritedKeys?: Set<string>
): void {
  saveRequirementAnalysis(requirementId, analysis, analysis.aiMode);
  for (const f of analysis.fields) {
    if (inheritedKeys?.has(f.key)) continue; // 引き継ぎ済みは上書きしない
    const unknown = f.value.includes('未定');
    upsertSpecField({
      projectId,
      fieldKey: f.key,
      nameJa: f.label,
      value: f.value,
      status: unknown ? 'UNKNOWN' : f.source === 'AI_INFERRED' ? 'AI_SUGGESTED' : 'PROVISIONAL',
      source: f.source,
    });
  }
  const questions = inheritedKeys
    ? analysis.questions
        .filter((q) => !inheritedKeys.has(q.key) && !inheritedKeys.has(`answer_${q.key}`))
        .slice(0, 2)
    : analysis.questions;
  for (const q of questions) {
    insertQuestion({
      projectId,
      requirementId,
      questionKey: q.key,
      title: q.title,
      choices: q.options,
    });
  }
  if (!inheritedKeys || inheritedKeys.size === 0) {
    upsertProjectDna(projectId, analysis.dna, analysis.dnaRationale);
    upsertProjectAttributes(projectId, analysis.attributes);
  }
}

export async function analyzeAndApply(
  projectId: number,
  requirementId: number,
  text: string,
  entryRoute: ProjectRow['entry_route'],
  inherited?: { keys: Set<string>; fields: { label: string; value: string }[] }
): Promise<AnalysisResult> {
  const analysis = await analyzeRequirement(text, entryRoute, [], inherited?.fields ?? []);
  applyAnalysis(projectId, requirementId, analysis, inherited?.keys);
  return analysis;
}

// BI-3: 初回3案の価格レンジに market_price_bias（高め係数・CONFIGURABLE）を乗算する。
// 「¥980〜1,180（工場確認前の目安）」のような文字列内の数値（2桁以上）を対象に丸め（10円単位）。
export function applyPriceBias(range: string, bias: number): string {
  if (!Number.isFinite(bias) || bias === 1) return range;
  return range.replace(/([0-9][0-9,]+)/g, (m) => {
    const n = Number(m.replace(/,/g, ''));
    if (!Number.isFinite(n) || n < 10) return m;
    const v = Math.round((n * bias) / 10) * 10;
    return v.toLocaleString('ja-JP');
  });
}

export function buildProjectContext(project: ProjectRow, extraInstruction?: string): ProjectContext {
  const req = getLatestRequirement(project.id);
  const fields = listSpecFields(project.id).map((f) => ({
    label: f.name_ja,
    value: f.value ?? '',
    source: f.source === 'AI_INFERRED' ? 'AI_INFERRED' : 'FROM_INPUT',
  }));
  const answers = listQuestions(project.id)
    .filter((q) => q.answer_value !== null)
    .map((q) => ({ question: q.title, answer: q.answer_value as string }));
  if (extraInstruction) {
    answers.push({ question: '担当者からの修正指示', answer: extraInstruction });
  }
  return {
    entryRoute: project.entry_route,
    rawText: req?.raw_text ?? '',
    refUrl: project.ref_url,
    fields,
    answers,
  };
}

export async function generateProposalsForProject(
  project: ProjectRow,
  extraInstruction?: string
): Promise<ProposalsResult> {
  const result = await generateProposals(buildProjectContext(project, extraInstruction));
  // BI-3: 初回概算は高め係数を乗算（settings.market_price_bias。live promptにも高め側指示あり）
  const bias = getSettingNumber('market_price_bias', 1.2);
  return {
    ...result,
    options: result.options.map((o) => ({
      ...o,
      priceRangeJpy: applyPriceBias(o.priceRangeJpy, bias),
    })),
  };
}

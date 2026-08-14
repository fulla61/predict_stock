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
import {
  analyzeRequirement,
  generateProposals,
  type AnalysisResult,
  type ProjectContext,
  type ProposalsResult,
} from './ai.js';

// 相談分析の結果をDBへ反映（AI推定は必ずAI_SUGGESTED / 顧客明示はPROVISIONAL）
export function applyAnalysis(projectId: number, requirementId: number, analysis: AnalysisResult): void {
  saveRequirementAnalysis(requirementId, analysis, analysis.aiMode);
  for (const f of analysis.fields) {
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
  for (const q of analysis.questions) {
    insertQuestion({
      projectId,
      requirementId,
      questionKey: q.key,
      title: q.title,
      choices: q.options,
    });
  }
  upsertProjectDna(projectId, analysis.dna, analysis.dnaRationale);
  upsertProjectAttributes(projectId, analysis.attributes);
}

export async function analyzeAndApply(
  projectId: number,
  requirementId: number,
  text: string,
  entryRoute: ProjectRow['entry_route']
): Promise<AnalysisResult> {
  const analysis = await analyzeRequirement(text, entryRoute);
  applyAnalysis(projectId, requirementId, analysis);
  return analysis;
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
  return generateProposals(buildProjectContext(project, extraInstruction));
}

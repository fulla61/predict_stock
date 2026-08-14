import { db } from '../db/db.js';
import { nextProjectPublicId } from './ids.js';

// テナント分離: CLIENT系の全関数は clientId をシグネチャで必須にする。
// routes から生SQLを直接呼ばないこと。

export interface ProjectRow {
  id: number;
  public_id: string;
  client_id: number;
  title: string;
  status: string;
  entry_route: 'IDEA' | 'PRODUCT' | 'SPEC' | 'REPEAT';
  ref_url: string | null;
  created_at: string;
}

export interface SpecFieldRow {
  id: number;
  project_id: number;
  field_key: string;
  name_ja: string;
  value: string | null;
  unit: string | null;
  status: 'CONFIRMED' | 'PROVISIONAL' | 'AI_SUGGESTED' | 'UNKNOWN';
  source: 'FROM_INPUT' | 'AI_INFERRED' | 'CLIENT_ANSWER';
}

export interface QuestionRow {
  id: number;
  project_id: number;
  requirement_id: number;
  question_key: string;
  title: string;
  choices_json: string;
  answer_value: string | null;
  answered_at: string | null;
}

export const createProjectTx = db.transaction(
  (params: {
    clientId: number;
    title: string;
    entryRoute: string;
    refUrl: string | null;
    createdBy: number;
    rawText: string;
  }) => {
    const publicId = nextProjectPublicId();
    const p = db
      .prepare(
        `INSERT INTO projects (public_id, client_id, title, status, entry_route, ref_url, created_by)
         VALUES (?, ?, ?, 'CONSULTATION', ?, ?, ?)`
      )
      .run(publicId, params.clientId, params.title, params.entryRoute, params.refUrl, params.createdBy);
    const projectId = Number(p.lastInsertRowid);
    const r = db
      .prepare(`INSERT INTO requirements (project_id, raw_text) VALUES (?, ?)`)
      .run(projectId, params.rawText);
    // 商業条件プロファイル（UNKNOWN可＝未記入でも開始可）
    db.prepare(`INSERT INTO commercial_profiles (project_id) VALUES (?)`).run(projectId);
    return { projectId, publicId, requirementId: Number(r.lastInsertRowid) };
  }
);

export function getProjectForClient(clientId: number, projectId: number): ProjectRow | undefined {
  return db
    .prepare(`SELECT * FROM projects WHERE id = ? AND client_id = ?`)
    .get(projectId, clientId) as ProjectRow | undefined;
}

export function getProjectForStaff(projectId: number): ProjectRow | undefined {
  return db.prepare(`SELECT * FROM projects WHERE id = ?`).get(projectId) as
    | ProjectRow
    | undefined;
}

export function getClientName(clientId: number): string {
  const row = db.prepare(`SELECT name FROM clients WHERE id = ?`).get(clientId) as
    | { name: string }
    | undefined;
  return row?.name ?? '';
}

export function getLatestRequirement(projectId: number):
  | { id: number; raw_text: string; analysis_json: string | null; ai_mode: string | null }
  | undefined {
  return db
    .prepare(
      `SELECT id, raw_text, analysis_json, ai_mode FROM requirements
       WHERE project_id = ? ORDER BY id DESC LIMIT 1`
    )
    .get(projectId) as never;
}

export function saveRequirementAnalysis(
  requirementId: number,
  analysis: unknown,
  aiMode: 'live' | 'mock'
): void {
  db.prepare(`UPDATE requirements SET analysis_json = ?, ai_mode = ? WHERE id = ?`).run(
    JSON.stringify(analysis),
    aiMode,
    requirementId
  );
}

export function upsertSpecField(params: {
  projectId: number;
  fieldKey: string;
  nameJa: string;
  value: string | null;
  status: SpecFieldRow['status'];
  source: SpecFieldRow['source'];
}): void {
  db.prepare(
    `INSERT INTO spec_fields (project_id, field_key, name_ja, value, status, source)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(project_id, field_key) DO UPDATE SET
       name_ja = excluded.name_ja,
       value = excluded.value,
       status = excluded.status,
       source = excluded.source,
       updated_at = datetime('now')`
  ).run(params.projectId, params.fieldKey, params.nameJa, params.value, params.status, params.source);
}

export function listSpecFields(projectId: number): SpecFieldRow[] {
  return db
    .prepare(`SELECT * FROM spec_fields WHERE project_id = ? ORDER BY id`)
    .all(projectId) as SpecFieldRow[];
}

export function insertQuestion(params: {
  projectId: number;
  requirementId: number;
  questionKey: string;
  title: string;
  choices: string[];
}): void {
  db.prepare(
    `INSERT INTO requirement_questions (project_id, requirement_id, question_key, title, choices_json)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(project_id, question_key) DO NOTHING`
  ).run(params.projectId, params.requirementId, params.questionKey, params.title, JSON.stringify(params.choices));
}

export function listQuestions(projectId: number): QuestionRow[] {
  return db
    .prepare(`SELECT * FROM requirement_questions WHERE project_id = ? ORDER BY id`)
    .all(projectId) as QuestionRow[];
}

export function getQuestionForClient(
  clientId: number,
  questionId: number
): QuestionRow | undefined {
  return db
    .prepare(
      `SELECT q.* FROM requirement_questions q
       JOIN projects p ON p.id = q.project_id
       WHERE q.id = ? AND p.client_id = ?`
    )
    .get(questionId, clientId) as QuestionRow | undefined;
}

export function answerQuestion(questionId: number, value: string): void {
  db.prepare(
    `UPDATE requirement_questions SET answer_value = ?, answered_at = datetime('now') WHERE id = ?`
  ).run(value, questionId);
}

export function upsertProjectDna(projectId: number, axes: unknown, rationale: string): void {
  db.prepare(
    `INSERT INTO project_dna (project_id, axes_json, status, ai_rationale)
     VALUES (?, ?, 'AI_SUGGESTED', ?)
     ON CONFLICT(project_id) DO UPDATE SET axes_json = excluded.axes_json, ai_rationale = excluded.ai_rationale`
  ).run(projectId, JSON.stringify(axes), rationale);
}

export function getProjectDna(projectId: number): { axes_json: string; ai_rationale: string | null } | undefined {
  return db
    .prepare(`SELECT axes_json, ai_rationale FROM project_dna WHERE project_id = ?`)
    .get(projectId) as never;
}

export function upsertProjectAttributes(projectId: number, codes: string[]): void {
  const stmt = db.prepare(
    `INSERT INTO project_attributes (project_id, attribute_code, status)
     VALUES (?, ?, 'AI_SUGGESTED')
     ON CONFLICT(project_id, attribute_code) DO NOTHING`
  );
  for (const code of codes) stmt.run(projectId, code);
}

export function updateProjectStatus(projectId: number, status: string): void {
  db.prepare(`UPDATE projects SET status = ?, updated_at = datetime('now') WHERE id = ?`).run(
    status,
    projectId
  );
}

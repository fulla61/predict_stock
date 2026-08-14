// Crossimage Product OS — BI-1 API契約型（server/web共用）

export type Role = 'CLIENT' | 'STAFF';
export type EntryRoute = 'IDEA' | 'PRODUCT' | 'SPEC' | 'REPEAT';
export type AiMode = 'live' | 'mock';
export type FieldSource = 'FROM_INPUT' | 'AI_INFERRED';
export type SpecFieldStatus = 'CONFIRMED' | 'PROVISIONAL' | 'AI_SUGGESTED' | 'UNKNOWN';
export type ProposalStatus =
  | 'DRAFT'
  | 'PENDING_APPROVAL'
  | 'APPROVED'
  | 'REVISION_REQUESTED'
  | 'SELECTED';

export interface ApiError {
  error: { code: string; message: string };
}

// ---- auth ----
export interface LoginRequest {
  email: string;
  password: string;
}
export interface UserView {
  id: number;
  name: string;
  role: Role;
  clientId?: number;
}
export interface LoginResponse {
  user: UserView;
}
export interface MeResponse {
  user: UserView;
}

// ---- consultation / understanding ----
export interface UnderstandingField {
  key: string;
  label: string;
  value: string;
  source: FieldSource;
  status: SpecFieldStatus;
}
export interface QuestionView {
  id: number;
  key: string;
  title: string;
  options: string[];
  answer: string | null;
}
export interface ConsultationRequest {
  text: string;
  entryRoute: EntryRoute;
  refUrl?: string;
}
export interface ConsultationResponse {
  projectId: number;
  publicId: string;
  understanding: UnderstandingField[];
  questions: QuestionView[];
  aiMode: AiMode;
}

export interface AnswersRequest {
  answers: { questionId: number; value: string }[];
}
export interface AnswersResponse {
  understanding: UnderstandingField[];
  questions: QuestionView[];
}

// ---- proposals ----
export interface ProposalOptionView {
  id: number;
  key: string; // rec | small | cost
  title: string;
  concept: string;
  priceRangeJpy: string;
  qtyFrom: string;
  leadDays: string;
  pros: string[];
  tradeoff: string;
  recommended: boolean;
  selected: boolean;
}
export interface GenerateProposalsResponse {
  proposalId: number;
  status: 'pending_approval' | 'approved';
  aiMode: AiMode;
  options?: ProposalOptionView[]; // AUTO_APPROVE=true のときのみ即返却
}

export interface ProposalView {
  id: number;
  status: ProposalStatus;
  aiMode: AiMode;
  options: ProposalOptionView[]; // CLIENTにはAPPROVED以降のみ中身が入る
  selectedOptionId: number | null;
}

export interface ProjectViewClient {
  projectId: number;
  publicId: string;
  title: string;
  entryRoute: EntryRoute;
  status: string;
  understanding: UnderstandingField[];
  questions: QuestionView[];
  proposal:
    | { state: 'none' }
    | { state: 'pending_approval' }
    | { state: 'ready'; proposal: ProposalView };
  aiMode: AiMode;
}

export interface ProjectViewStaff extends Omit<ProjectViewClient, 'proposal'> {
  clientId: number;
  clientName: string;
  rawText: string;
  refUrl: string | null;
  dna: Record<string, unknown> | null;
  proposal: { state: 'none' } | { state: ProposalStatus; proposal: ProposalView };
}

export interface SelectResponse {
  ok: true;
  selectedOptionId: number;
}

// ---- admin ----
export interface AdminQueueItem {
  proposalId: number;
  projectId: number;
  publicId: string;
  clientName: string;
  title: string;
  rawText: string;
  understanding: UnderstandingField[];
  options: ProposalOptionView[];
  aiMode: AiMode;
  createdAt: string;
}
export interface AdminQueueResponse {
  items: AdminQueueItem[];
}
export interface ApproveRequest {
  note?: string;
}
export interface ReviseRequest {
  instruction: string;
}
export interface AdminActionResponse {
  ok: true;
  status: ProposalStatus;
}

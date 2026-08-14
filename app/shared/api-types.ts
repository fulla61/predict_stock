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
  /** BI-3: projects.hide_initial_prices=1 の案件のCLIENTレスポンスでは省略される（金額非表示モード） */
  priceRangeJpy?: string;
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


// ============================================================
// BI-2（CONTRACT-2）
// web/src/types.ts の暫定型と互換の形状（web側は契約確定後に再エクスポートへ切替）
// ============================================================

// ---- 会社の「見え方の設定」（clients.settings） ----
export type ExperienceLevelOverride = 'EXP_BEGINNER' | 'EXP_EXPERIENCED' | 'EXP_PRO';

export interface ClientSettingsView {
  /** null = 自動判定のまま */
  experienceLevelOverride: ExperienceLevelOverride | null;
  defaultEntryRoute: EntryRoute | null;
  note: string;
}
export interface ClientSettingsPatchRequest {
  experienceLevelOverride?: ExperienceLevelOverride | null;
  defaultEntryRoute?: EntryRoute | null;
  note?: string;
}
export interface ClientSettingsPatchResponse {
  ok: true;
  settings: ClientSettingsView;
}

// ---- GET /admin/clients ----
export interface AdminClientListItem {
  clientId: number;
  publicId: string;
  name: string;
  activeProjects: number;
  /** 状態内訳（順調/確認待ち/要対応） */
  statusCounts: { ok: number; waiting: number; action: number };
  lastActivityAt: string | null;
  lastActivityText: string | null;
}
export interface AdminActivityItem {
  projectId: number;
  publicId: string;
  clientName: string;
  title: string;
  what: string;
  at: string;
}
export interface AdminClientsResponse {
  items: AdminClientListItem[];
  /** 動きがあった案件（直近更新） */
  recentActivity: AdminActivityItem[];
}

// ---- GET /admin/clients/:id ----
export interface AdminProjectSummary {
  projectId: number;
  publicId: string;
  title: string;
  status: string;
  updatedAt: string | null;
}
export interface AdminClientDetailResponse {
  clientId: number;
  publicId: string;
  name: string;
  /** 自動判定されたお客様レベル（例: "初心者"） */
  experienceLevelAuto?: string;
  settings: ClientSettingsView;
  projects: AdminProjectSummary[];
  activity: { what: string; at: string }[];
}

// ---- 工場台帳 ----
export type FactoryRiskClass = 'FRISK_LOW' | 'FRISK_MEDIUM' | 'FRISK_HIGH' | 'FRISK_UNKNOWN';

export interface FactoryView {
  id: number;
  publicId: string; // FA-{NNNN}
  name: string;
  region: string | null;
  specialty: string | null;
  riskClass: FactoryRiskClass;
  channelNote: string | null;
  createdAt: string;
}
export interface FactoriesResponse {
  items: FactoryView[];
}
export interface CreateFactoryRequest {
  name: string;
  region?: string;
  specialty?: string;
  riskClass?: FactoryRiskClass;
  channelNote?: string;
}
// POST /admin/factories → FactoryView をそのまま返す

// ---- RFQ ----
export type RfqStatus = 'DRAFT' | 'SENT';

export interface RfqView {
  id: number;
  publicId: string; // {ProjectID}-RFQ-{NN}
  projectId: number;
  /** 中国語ドラフト本文（画面でコピー/.mdダウンロード） */
  body: string;
  status: RfqStatus;
  sentAt: string | null;
  sentChannel: string | null;
  factoryIds: number[];
  aiMode: AiMode;
  createdAt: string;
}
export interface CreateRfqRequest {
  factoryIds: number[];
}
// POST /admin/projects/:id/rfq → RfqView をそのまま返す
export interface RfqSentRequest {
  channel: string; // 'WeChat' | 'メール' 等（手入力）
}
export interface RfqSentResponse {
  ok: true;
  status: RfqStatus;
  sentAt: string;
}

// ---- 見積（版管理・上書き禁止） ----
export type QuoteCurrency = 'CNY' | 'JPY' | 'USD';
export type QuoteConditionType = 'MOQ' | 'PRICE_TIER' | 'TOOLING' | 'LEADTIME' | 'OTHER';

export interface QuoteConditionInput {
  conditionType: QuoteConditionType;
  moqDimension?: string;
  thresholdQty?: number;
  value?: string;
  note?: string;
}
export interface CreateQuoteRequest {
  factoryId: number;
  currency: QuoteCurrency;
  unitPrice: number;
  moq: number;
  toolingCost?: number;
  sampleCost?: number;
  leadDays: number;
  validUntil?: string;
  notes?: string;
  conditions?: QuoteConditionInput[];
}
export interface QuoteView {
  id: number;
  publicId: string; // {ProjectID}-QT-{NN}
  rfqId: number;
  factoryId: number;
  /** STAFF画面のみ（顧客レスポンスには存在しない） */
  factoryName: string;
  versionNo: number;
  supersedesQuoteId: number | null;
  currency: QuoteCurrency;
  unitPrice: number;
  moq: number;
  toolingCost: number | null;
  sampleCost: number | null;
  leadDays: number;
  validUntil: string | null;
  notes: string | null;
  conditions: QuoteConditionInput[];
  createdAt: string;
}
// POST /admin/rfqs/:id/quotes → QuoteView をそのまま返す

// ---- 商流Loop / 選べる進め方 ----
export type LoopStatus = 'PENDING_APPROVAL' | 'APPROVED';
export type LoopDecision = 'ACCEPT' | 'MODIFY' | 'HOLD';

/** 顧客向けOption（サニタイズ済: 工場名・原価・based_on_quote_id・internal_note は存在しない） */
export interface LoopOptionClientView {
  key: string;
  title: string;
  concept: string;
  customerPriceRange: string;
  qtyFrom: string;
  leadDays: string;
  pros: string[];
  tradeoff: string;
  recommended: boolean;
  selected: boolean;
}
/** 社内向けOption（内部フィールド付き） */
export interface LoopOptionStaffView extends LoopOptionClientView {
  id: number;
  basedOnQuoteId: number | null;
  internalNote: string | null;
}
export interface LoopStaffView {
  id: number;
  publicId: string; // {ProjectID}-LOOP-{NN}
  projectId: number;
  loopNo: number;
  status: LoopStatus;
  triggerReason: string;
  /** 希望 vs 回答の差分JSON（内部用） */
  feasibility: unknown;
  customerDecision: LoopDecision | null;
  modifyNote: string | null;
  decidedAt: string | null;
  options: LoopOptionStaffView[];
  aiMode: AiMode;
  createdAt: string;
}
export interface LoopClientView {
  id: number;
  loopNo: number;
  options: LoopOptionClientView[];
  customerDecision: LoopDecision | null;
  selectedOptionKey: string | null;
}
// POST /admin/projects/:id/loop → LoopStaffView をそのまま返す
export interface LoopOptionPatch {
  key: string;
  title?: string;
  concept?: string;
  customerPriceRange?: string;
  qtyFrom?: string;
  leadDays?: string;
  pros?: string[];
  tradeoff?: string;
  recommended?: boolean;
}
export interface LoopOptionsPatchRequest {
  options: LoopOptionPatch[];
}
export interface LoopActionResponse {
  ok: true;
  loop?: LoopStaffView;
}
export interface LoopDecideRequest {
  decision: 'ACCEPT' | 'MODIFY';
  selectedOptionKey?: string;
  modifyNote?: string;
}
export interface LoopDecideResponse {
  ok: true;
  decision: 'ACCEPT' | 'MODIFY';
}

// ---- 既存ビューのBI-2拡張 ----
export interface ProjectViewClientV2 extends ProjectViewClient {
  /** 承認済みLoopがある場合のみ（サニタイズ済）。それ以外は null */
  loop: LoopClientView | null;
}
export interface ProjectViewStaffV2 extends ProjectViewStaff {
  rfqs: RfqView[];
  quotes: QuoteView[];
  loops: LoopStaffView[];
}

// ---- 判断キュー拡張（提案承認待ち + Loop承認待ち + 条件変更希望） ----
export interface AdminLoopQueueItem {
  loopId: number;
  projectId: number;
  publicId: string; // project public id
  clientName: string;
  title: string;
  loopNo: number;
  triggerReason: string;
  options: LoopOptionStaffView[];
  aiMode: AiMode;
  createdAt: string;
}
export interface AdminModifyQueueItem {
  loopId: number;
  projectId: number;
  publicId: string; // project public id
  clientName: string;
  title: string;
  loopNo: number;
  modifyNote: string | null;
  decidedAt: string | null;
}
export interface AdminQueueResponseV2 extends AdminQueueResponse {
  loops: AdminLoopQueueItem[];
  modifyRequests: AdminModifyQueueItem[];
}

// ============================================================
// BI-3（CONTRACT-3）
// ============================================================

// ---- 資料（documents + 実ファイル） ----
export type DocumentVisibility = 'CLIENT_VISIBLE' | 'INTERNAL';
export type DocumentSource = 'CLIENT' | 'STAFF' | 'CN';

/** 顧客向け資料ビュー（サニタイズ済: storage_path・内部ID系は存在しない。CLIENT_VISIBLEのみ返る） */
export interface DocumentView {
  id: number;
  publicId: string; // {ProjectID}-DOC-{NN}
  title: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  /** アップロード者のロールラベルのみ（内部ユーザー情報は返さない） */
  uploadedByRole: Role;
  source: DocumentSource;
  createdAt: string;
}
/** 社内向け資料ビュー（visibility・アップロード者情報つき。storage_pathはAPIに出さない） */
export interface DocumentStaffView extends DocumentView {
  projectId: number;
  visibility: DocumentVisibility;
  uploadedByName: string | null;
}
export interface DocumentsResponse {
  items: DocumentView[] | DocumentStaffView[];
}
// POST /projects/:id/documents (multipart {file, title?, visibility?, source?})
export interface UploadDocumentResponse {
  document: DocumentView | DocumentStaffView;
}

// ---- 30秒記録（NOTE） ----
export interface ProjectNoteRequest {
  text: string;
}
export interface ProjectNoteResponse {
  ok: true;
}

// ---- 量産合意書（Production Agreement = G-02） ----
export type AgreementStatus = 'DRAFT' | 'PENDING_CUSTOMER' | 'AGREED' | 'SUPERSEDED';

export interface AgreementCheckItem {
  name: string;
  criteriaJa: string; // 測れる表現（数値・距離・回数）
  criteriaZh: string;
  method: string; // 検査方法（目視/ノギス/抜取 等）
}
export interface AgreementLimitSample {
  docId: number;
  label: 'OK_LIMIT' | 'NG';
  note?: string;
}
export interface AgreementTolerance {
  defectRatePct: number;
  spareQty: string;
  note?: string;
}
export interface AgreementResponsibility {
  inspectionPass: string; // 検品合格後の扱い
  marketDefect: string; // 市場不良時の扱い
  compensation: string; // 補償の考え方
}

/** 顧客向け合意書ビュー（body_zhは転送用に含める。内部メモ系なし。customer_noteは本人の記入内容） */
export interface AgreementClientView {
  id: number;
  publicId: string; // {ProjectID}-GS-{NN}
  versionNo: number;
  status: AgreementStatus;
  approvedSampleDocId: number | null;
  checkItems: AgreementCheckItem[];
  limitSamples: AgreementLimitSample[];
  tolerance: AgreementTolerance | null;
  responsibility: AgreementResponsibility | null;
  bodyZh: string | null;
  customerNote: string | null;
  customerDecidedAt: string | null;
  createdAt: string;
}
export interface AgreementStaffView extends AgreementClientView {
  projectId: number;
  aiMode: AiMode;
}
// POST /admin/projects/:id/agreement
export interface CreateAgreementResponse {
  agreement: AgreementStaffView;
  aiMode: AiMode;
}
// PATCH /admin/agreements/:id（DRAFTのみ）
export interface PatchAgreementRequest {
  checkItems?: AgreementCheckItem[];
  limitSamples?: AgreementLimitSample[];
  toleranceJson?: AgreementTolerance;
  responsibilityJson?: AgreementResponsibility;
  approvedSampleDocId?: number | null;
}
export interface PatchAgreementResponse {
  ok: true;
  agreement: AgreementStaffView;
}
// POST /admin/agreements/:id/vague-check
export interface VagueFinding {
  itemIndex: number;
  phrase: string;
  suggestion: string;
}
export interface VagueCheckResponse {
  findings: VagueFinding[];
  aiMode: AiMode;
}
// POST /admin/agreements/:id/send
export interface SendAgreementResponse {
  ok: true;
  agreement: AgreementStaffView;
  aiMode: AiMode;
}
// POST /agreements/:id/decide（CLIENT）
export interface AgreementDecideRequest {
  decision: 'APPROVE' | 'REQUEST_CHANGE';
  note?: string;
}
export interface AgreementDecideResponse {
  ok: true;
  status: AgreementStatus;
}

// ---- リピート（顧客の自社案件一覧 + 相談の引き継ぎ） ----
export interface ClientProjectListItem {
  projectId: number;
  publicId: string;
  title: string;
  status: string;
  updatedAt: string | null;
}
export interface ClientProjectsResponse {
  items: ClientProjectListItem[];
}
/** POST /consultations 拡張: entryRoute='REPEAT' 時に前回案件を指定可 */
export interface ConsultationRequestV3 extends ConsultationRequest {
  sourceProjectId?: number;
}

// ---- 顧客発行（POST /admin/clients） ----
export interface CreateClientRequest {
  companyName: string;
  contactName: string;
  email: string;
  tempPassword: string;
}
export interface CreateClientResponse {
  clientId: number;
  publicId: string; // CL-{NNNN}
}

// ---- 価格方針（P-17） ----
// PATCH /admin/proposals/:id/options（PENDING_APPROVAL中のみ）
export interface ProposalOptionsPatchRequest {
  options: { key: string; priceRangeJpy?: string }[];
}
export interface ProposalOptionsPatchResponse {
  ok: true;
  options: ProposalOptionView[];
}
// POST /admin/projects/:id/pricing-mode
export interface PricingModeRequest {
  hideInitialPrices: boolean;
}
export interface PricingModeResponse {
  ok: true;
  hideInitialPrices: boolean;
}

// ---- 既存ビューのBI-3拡張 ----
/** 顧客向け: hideInitialPrices=true の案件では options[].priceRangeJpy が存在しない（UIは説明文を表示） */
export interface ProjectViewClientV3 extends ProjectViewClientV2 {
  /** 顧客が見られる最新の合意書（PENDING_CUSTOMER/AGREEDのみ）。無ければ null */
  agreement: AgreementClientView | null;
  /** 金額非表示モード（trueならproposal optionsに価格レンジが含まれない） */
  hideInitialPrices: boolean;
}
export interface ProjectViewStaffV3 extends ProjectViewStaffV2 {
  agreements: AgreementStaffView[];
  documents: DocumentStaffView[];
  hideInitialPrices: boolean;
}

// ---- 判断キュー拡張（合意書: 顧客回答待ち + 顧客修正希望着信） ----
export interface AdminAgreementQueueItem {
  agreementId: number;
  agreementPublicId: string;
  projectId: number;
  publicId: string; // project public id
  clientName: string;
  title: string;
  status: AgreementStatus;
  customerNote: string | null;
  customerDecidedAt: string | null;
  createdAt: string;
}
export interface AdminQueueResponseV3 extends AdminQueueResponseV2 {
  /** 顧客回答待ちの合意書（PENDING_CUSTOMER） */
  agreementsPending: AdminAgreementQueueItem[];
  /** 顧客のREQUEST_CHANGE着信（DRAFTに戻り customer_note あり・未再送） */
  agreementChangeRequests: AdminAgreementQueueItem[];
}

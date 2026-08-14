/**
 * BI-3（CONTRACT-3）暫定ローカル型。
 * TODO: shared型へ差し替え
 *   app/shared/api-types.ts にBI-3の契約型（DocumentView / AgreementView /
 *   AgreementCheckItem / VagueFinding / ClientProjectListItem 等）が入り次第、
 *   このファイルを削除して src/types.ts（= shared再エクスポート）からの import に
 *   切り替える。ページ側は本モジュール経由のみで参照しているため、純粋な型スワップで済む。
 *
 * 方針: 旧バックエンド（BI-2まで）に対しても壊れないよう、追加フィールドは
 * すべて optional にしてある（存在しなければUI側で非表示にする）。
 */
import type {
  AdminQueueResponseV2,
  AiMode,
  ProjectViewClientV2,
  ProjectViewStaffV2,
} from './types';

/* ---------------- 資料（documents） ---------------- */

export type DocumentVisibility = 'CLIENT_VISIBLE' | 'INTERNAL';
export type DocumentSource = 'CLIENT' | 'STAFF' | 'CN';

// TODO: shared型へ差し替え
export interface DocumentView {
  id: number;
  projectId?: number;
  title?: string | null;
  fileName?: string | null;
  mimeType?: string | null;
  sizeBytes?: number | null;
  visibility?: DocumentVisibility;
  source?: DocumentSource | null;
  uploadedByName?: string | null;
  createdAt?: string | null;
}
export interface DocumentsResponse {
  items?: DocumentView[];
}
export interface UploadDocumentResponse {
  document: DocumentView;
}

/* ---------------- 量産合意書（production agreements = G-02） ---------------- */

export type AgreementStatus = 'DRAFT' | 'PENDING_CUSTOMER' | 'AGREED' | 'SUPERSEDED';
export type LimitSampleLabel = 'OK_LIMIT' | 'NG';

// TODO: shared型へ差し替え
export interface AgreementCheckItem {
  name: string;
  criteriaJa: string;
  criteriaZh?: string;
  method?: string;
}
export interface AgreementLimitSample {
  docId: number;
  label: LimitSampleLabel;
  note?: string;
}
export interface AgreementTolerance {
  defectRatePct?: number | string | null;
  spareQty?: number | string | null;
  note?: string | null;
}
export interface AgreementResponsibility {
  inspectionPass?: string | null;
  marketDefect?: string | null;
  compensation?: string | null;
}

// TODO: shared型へ差し替え
export interface AgreementView {
  id: number;
  publicId?: string;
  projectId?: number;
  versionNo?: number;
  status: AgreementStatus;
  approvedSampleDocId?: number | null;
  checkItems?: AgreementCheckItem[];
  limitSamples?: AgreementLimitSample[];
  /** どちらのキー名でも受けられるようにしておく（契約表記は *_json） */
  tolerance?: AgreementTolerance | null;
  toleranceJson?: AgreementTolerance | null;
  responsibility?: AgreementResponsibility | null;
  responsibilityJson?: AgreementResponsibility | null;
  bodyZh?: string | null;
  customerNote?: string | null;
  customerDecidedAt?: string | null;
  createdAt?: string | null;
  aiMode?: AiMode;
}
export interface CreateAgreementResponse {
  agreement: AgreementView;
  aiMode?: AiMode;
}

// TODO: shared型へ差し替え
export interface VagueFinding {
  itemIndex: number;
  phrase: string;
  suggestion: string;
}
export interface VagueCheckResponse {
  findings?: VagueFinding[];
  aiMode?: AiMode;
}

/* ---------------- リピート（自社案件一覧） ---------------- */

// TODO: shared型へ差し替え
export interface ClientProjectListItem {
  id: number;
  publicId: string;
  title: string;
  state?: string;
  updatedAt?: string | null;
}
export interface ClientProjectsResponse {
  items?: ClientProjectListItem[];
}

/* ---------------- 顧客発行 ---------------- */

// TODO: shared型へ差し替え
export interface CreateClientResponse {
  clientId: number;
  publicId: string;
}

/* ---------------- 既存ビューのBI-3拡張 ---------------- */

// TODO: shared型へ差し替え
export interface ProjectViewClientV3 extends ProjectViewClientV2 {
  /** 量産合意書（PENDING_CUSTOMER/AGREED 等）。旧バックエンドでは undefined */
  agreement?: AgreementView | null;
  hideInitialPrices?: boolean;
}

// TODO: shared型へ差し替え
export interface ProjectViewStaffV3 extends ProjectViewStaffV2 {
  agreements?: AgreementView[];
  agreement?: AgreementView | null;
  hideInitialPrices?: boolean;
}

/* ---------------- 判断キューのBI-3拡張（防御的: 全てoptional） ---------------- */

// TODO: shared型へ差し替え
export interface AdminAgreementQueueItem {
  agreementId?: number;
  projectId: number;
  publicId?: string;
  clientName?: string;
  title?: string;
  status?: AgreementStatus;
  customerNote?: string | null;
  createdAt?: string | null;
  decidedAt?: string | null;
}
export interface AdminQueueResponseV3 extends AdminQueueResponseV2 {
  /** 量産合意書: お客様の確認待ち（バックエンドが提供する場合のみ） */
  agreements?: AdminAgreementQueueItem[];
  /** 量産合意書: お客様からの修正希望 */
  agreementChanges?: AdminAgreementQueueItem[];
}

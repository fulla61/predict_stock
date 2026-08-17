/**
 * BI-4（CONTRACT-4）暫定ローカル型。
 * TODO: shared型へ差し替え
 *   app/shared/api-types.ts にBI-4の契約型（SampleView / ProductionLotView /
 *   InspectionView / ShipmentView / FeedbackView / ProjectViewClientV4 /
 *   ProjectViewStaffV4 / AdminQueueResponseV4 等）が入り次第、このファイルを
 *   削除して src/types.ts（= shared再エクスポート）からの import に切り替える。
 *   ページ側は本モジュール経由のみで参照しているため、純粋な型スワップで済む。
 *
 * 方針: 旧バックエンド（BI-3まで）に対しても壊れないよう、追加フィールドは
 * すべて optional にしてある（存在しなければUI側で非表示・既存挙動に退避する）。
 */
import type {
  AdminQueueResponseV3,
  ProjectViewClientV3,
  ProjectViewStaffV3,
} from './types-bi3';

/* ---------------- 案件state（BI-4拡張値） ---------------- */

// TODO: shared型へ差し替え
export type ProjectStateV4 =
  | 'SAMPLE'
  | 'PRODUCTION'
  | 'INSPECTION'
  | 'SHIPPING'
  | 'DELIVERED'
  | 'COMPLETED';

/* ---------------- サンプル往復（samples） ---------------- */

export type SampleStatus =
  | 'REQUESTED'
  | 'ARRIVED'
  | 'CUSTOMER_REVIEW'
  | 'APPROVED'
  | 'REJECTED';

// TODO: shared型へ差し替え
export interface SampleView {
  id: number;
  publicId?: string;
  roundNo?: number;
  status?: SampleStatus | string;
  requestNote?: string | null;
  factoryNote?: string | null;
  photoDocIds?: number[];
  customerNote?: string | null;
  decidedAt?: string | null;
  createdAt?: string | null;
}

/** 顧客向けサンプルビュー（CUSTOMER_REVIEW以降のみ返る想定・サニタイズ済） */
// TODO: shared型へ差し替え
export interface ClientSampleView {
  id: number;
  publicId?: string;
  roundNo?: number;
  status?: SampleStatus | string;
  /** 担当者からのメッセージ（キー名の揺れに備えて両方受ける） */
  requestNote?: string | null;
  message?: string | null;
  photoDocIds?: number[];
  customerNote?: string | null;
  decidedAt?: string | null;
}

export interface SampleDecideRequest {
  decision: 'APPROVE' | 'REQUEST_CHANGE';
  note?: string;
}
export interface SampleDecideResponse {
  ok?: boolean;
  status?: SampleStatus | string;
}

/* ---------------- 生産ロット（production_lots） ---------------- */

export type LotStatus = 'PLANNED' | 'IN_PROGRESS' | 'DONE';

// TODO: shared型へ差し替え
export interface ProductionLotView {
  id: number;
  publicId?: string;
  qty?: number;
  status?: LotStatus | string;
  startedAt?: string | null;
  expectedDoneOn?: string | null;
  doneAt?: string | null;
  note?: string | null;
  createdAt?: string | null;
}

/* ---------------- 検品（inspections） ---------------- */

export type InspectionResult = 'PASS' | 'FAIL';

// TODO: shared型へ差し替え
export interface InspectionView {
  id: number;
  publicId?: string;
  lotId?: number;
  result?: InspectionResult | string;
  inspectedQty?: number;
  defectQty?: number;
  defectNote?: string | null;
  photoDocIds?: number[];
  inspectedOn?: string | null;
  /** 合意した不良許容率を超えた場合 true（判断は人間） */
  overTolerance?: boolean;
  createdAt?: string | null;
}

// TODO: shared型へ差し替え
export interface CreateInspectionResponse {
  inspection?: InspectionView;
  overTolerance?: boolean;
  /** 直下に検品ビューが返る形（キー無し）にも耐えるよう主要項目を許容 */
  id?: number;
  result?: InspectionResult | string;
}

/* ---------------- 輸送（shipments） ---------------- */

export type ShipmentMethod = 'SEA' | 'AIR' | 'COURIER';
export type ShipmentStatus =
  | 'PREPARING'
  | 'SHIPPED'
  | 'CUSTOMS'
  | 'ARRIVED_JP'
  | 'DELIVERED';

// TODO: shared型へ差し替え
export interface ShipmentView {
  id: number;
  publicId?: string;
  lotId?: number | null;
  method?: ShipmentMethod | string;
  status?: ShipmentStatus | string;
  etd?: string | null;
  eta?: string | null;
  deliveredOn?: string | null;
  destinationNote?: string | null;
  trackingNote?: string | null;
  createdAt?: string | null;
}

/* ---------------- 納品後フィードバック（P-12最小形） ---------------- */

// TODO: shared型へ差し替え
export interface FeedbackView {
  rating?: number;
  comment?: string | null;
  askedRepeat?: boolean;
  createdAt?: string | null;
}
export interface FeedbackRequest {
  rating: number;
  comment?: string;
  askedRepeat?: boolean;
}

/* ---------------- 顧客向け進捗サマリー（内部情報なし） ---------------- */

// TODO: shared型へ差し替え
export interface ClientProgressSummary {
  state?: ProjectStateV4 | string;
  production?: {
    status?: LotStatus | string;
    expectedDoneOn?: string | null;
    doneAt?: string | null;
  } | null;
  inspection?: {
    result?: InspectionResult | string;
    passed?: boolean;
    inspectedQty?: number | null;
    inspectedOn?: string | null;
  } | null;
  shipment?: {
    status?: ShipmentStatus | string;
    method?: ShipmentMethod | string;
    eta?: string | null;
    deliveredOn?: string | null;
  } | null;
  deliveredOn?: string | null;
}

/* ---------------- 既存ビューのBI-4拡張 ---------------- */

// TODO: shared型へ差し替え
export interface ProjectViewClientV4 extends ProjectViewClientV3 {
  /** BI-4の案件state（旧バックエンドでは undefined） */
  state?: ProjectStateV4 | string;
  samples?: ClientSampleView[];
  /** 進捗サマリー（どちらのキー名でも受けられるようにしておく） */
  progress?: ClientProgressSummary | null;
  progressSummary?: ClientProgressSummary | null;
  feedback?: FeedbackView | null;
  deliveryConfirmedAt?: string | null;
}

// TODO: shared型へ差し替え
export interface ProjectViewStaffV4 extends ProjectViewStaffV3 {
  state?: ProjectStateV4 | string;
  samples?: SampleView[];
  lots?: ProductionLotView[];
  inspections?: InspectionView[];
  shipments?: ShipmentView[];
  feedback?: FeedbackView | null;
  deliveryConfirmedAt?: string | null;
}

/* ---------------- 判断キューのBI-4拡張（防御的: 全てoptional） ---------------- */

// TODO: shared型へ差し替え
export interface AdminBi4QueueItem {
  projectId: number;
  publicId?: string;
  clientName?: string;
  title?: string;
  /* サンプル系 */
  sampleId?: number;
  samplePublicId?: string;
  status?: string;
  customerNote?: string | null;
  /* 検品系 */
  inspectionId?: number;
  inspectionPublicId?: string;
  lotId?: number;
  defectQty?: number;
  overTolerance?: boolean;
  /* フィードバック系 */
  rating?: number;
  comment?: string | null;
  askedRepeat?: boolean;
  /* 日時（キー名の揺れに備える） */
  at?: string | null;
  createdAt?: string | null;
  decidedAt?: string | null;
}

// TODO: shared型へ差し替え
export interface AdminQueueResponseV4 extends AdminQueueResponseV3 {
  /** サンプル: お客様確認待ち／修正希望着信 */
  sampleReviews?: AdminBi4QueueItem[];
  /** 検品FAIL */
  inspectionFails?: AdminBi4QueueItem[];
  /** お届け済み・受取確認待ち */
  deliveredAwaitingConfirm?: AdminBi4QueueItem[];
  /** 振り返り（フィードバック）着信 */
  feedbackArrived?: AdminBi4QueueItem[];
}

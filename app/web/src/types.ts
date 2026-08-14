/**
 * API型: app/shared/api-types.ts（server/web共用の契約型）を再エクスポート。
 * 画面側は本モジュール経由で import する。
 * BI-2契約型も shared 側に反映済みのため、暫定型は撤去済み。
 */
export * from '../../shared/api-types';

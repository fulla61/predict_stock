import type { ApiError as ApiErrorBody } from '../types';

/** APIエラー（サーバーの {error:{code,message}} を保持） */
export class ApiError extends Error {
  code: string;
  status: number;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

/** ネットワーク到達不能などの接続エラー */
export class NetworkError extends Error {
  constructor() {
    super('サーバーに接続できませんでした。時間をおいてもう一度お試しください。');
    this.name = 'NetworkError';
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      credentials: 'same-origin',
      headers: init?.body ? { 'Content-Type': 'application/json' } : undefined,
      ...init,
    });
  } catch {
    throw new NetworkError();
  }

  if (!res.ok) {
    let code = 'UNKNOWN';
    let message = `エラーが発生しました（${res.status}）`;
    try {
      const body = (await res.json()) as ApiErrorBody;
      if (body?.error) {
        code = body.error.code ?? code;
        message = body.error.message ?? message;
      }
    } catch {
      /* JSONでないエラーレスポンスはそのまま既定メッセージ */
    }
    throw new ApiError(res.status, code, message);
  }

  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export const api = {
  get<T>(path: string): Promise<T> {
    return request<T>(path);
  },
  post<T>(path: string, body?: unknown): Promise<T> {
    return request<T>(path, {
      method: 'POST',
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  },
};

/** visual-engine 接続点（CONTRACT §6）。購読側は未実装、発火のみ。 */
export function emitVisual(state: string, extra?: Record<string, unknown>): void {
  window.dispatchEvent(new CustomEvent('cx-visual', { detail: { state, ...extra } }));
}

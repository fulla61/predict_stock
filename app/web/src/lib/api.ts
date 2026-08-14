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
  // multipart（FormData）はブラウザに boundary 付き Content-Type を任せる
  const isForm = typeof FormData !== 'undefined' && init?.body instanceof FormData;
  try {
    res = await fetch(`/api${path}`, {
      credentials: 'same-origin',
      headers:
        init?.body && !isForm ? { 'Content-Type': 'application/json' } : undefined,
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
  patch<T>(path: string, body: unknown): Promise<T> {
    return request<T>(path, {
      method: 'PATCH',
      body: JSON.stringify(body),
    });
  },
  /** multipart/form-data 送信（BI-3: ファイルアップロード用） */
  postForm<T>(path: string, form: FormData): Promise<T> {
    return request<T>(path, {
      method: 'POST',
      body: form,
    });
  },
};

/** テキストを .md 等のファイルとしてダウンロードさせる（RFQ本文の保存用） */
export function downloadText(filename: string, text: string, mime = 'text/markdown'): void {
  const blob = new Blob([text], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** visual-engine 接続点（CONTRACT §6）。購読側は未実装、発火のみ。 */
export function emitVisual(state: string, extra?: Record<string, unknown>): void {
  window.dispatchEvent(new CustomEvent('cx-visual', { detail: { state, ...extra } }));
}

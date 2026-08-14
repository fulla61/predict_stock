import { useCallback, useEffect, useRef, useState } from 'react';
import type { FieldSource } from '../types';

/* ---------------- toast ---------------- */

export function useToast(): [string, boolean, (msg: string) => void] {
  const [msg, setMsg] = useState('');
  const [show, setShow] = useState(false);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  const toast = useCallback((m: string) => {
    setMsg(m);
    setShow(true);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setShow(false), 3200);
  }, []);

  return [msg, show, toast];
}

export function Toast({ msg, show }: { msg: string; show: boolean }) {
  return (
    <div className={`toast${show ? ' show' : ''}`} role="status" aria-live="polite">
      {msg}
    </div>
  );
}

/* ---------------- 用語ツールチップ（§14: 用語（説明）） ---------------- */

export function Tt({ term, desc }: { term: string; desc: string }) {
  const [open, setOpen] = useState(false);
  return (
    <button
      type="button"
      className={`tt${open ? ' open' : ''}`}
      aria-label={`${term} の説明`}
      onClick={() => setOpen((v) => !v)}
      onBlur={() => setOpen(false)}
    >
      {term}
      <span className="tt-bubble" role="tooltip">
        {desc}
      </span>
    </button>
  );
}

/* ---------------- 根拠chip（FROM_INPUT / AI_INFERRED） ---------------- */

export function SourceChip({ source }: { source: FieldSource }) {
  return source === 'FROM_INPUT' ? (
    <span className="chip-state chip-from-user">ご記入から</span>
  ) : (
    <span className="chip-state chip-ai-guess">AIの推測</span>
  );
}

/* ---------------- 表示フォーマッタ ---------------- */

/** 価格レンジ: 契約上は「¥980〜1,180」形式の文字列。数値で来ても崩れないよう防御 */
export function formatPrice(p: string | number): string {
  return typeof p === 'number' ? `¥${p.toLocaleString()}` : p;
}

export function formatQtyFrom(q: string | number): string {
  return typeof q === 'number' ? `${q.toLocaleString()}個〜` : q;
}

export function formatLeadDays(d: string | number): string {
  return typeof d === 'number' ? `約${d}日` : d;
}

/** ファイルサイズ表示（BI-3: 資料一覧用） */
export function formatBytes(n?: number | null): string {
  if (n == null || Number.isNaN(n)) return '';
  if (n < 1024) return `${n}B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)}KB`;
  return `${(n / 1024 / 1024).toFixed(1)}MB`;
}

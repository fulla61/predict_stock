import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../../lib/api';
import { Toast, useToast } from '../../components/ui';
import type {
  AdminClientDetailResponse,
  ClientSettingsPatchRequest,
  ClientSettingsPatchResponse,
  EntryRoute,
  ExperienceLevelOverride,
} from '../../types';

/** お客様レベルの上書き選択肢（'' = 自動のまま） */
const LEVEL_OPTIONS: { value: '' | ExperienceLevelOverride; label: string }[] = [
  { value: '', label: '自動のまま' },
  { value: 'EXP_BEGINNER', label: '初心者' },
  { value: 'EXP_EXPERIENCED', label: '経験あり' },
  { value: 'EXP_PRO', label: 'プロ' },
];

const ENTRY_OPTIONS: { value: '' | EntryRoute; label: string }[] = [
  { value: '', label: '指定なし（お客様が選択）' },
  { value: 'IDEA', label: 'まだ相談したい' },
  { value: 'PRODUCT', label: '商品は決まっている' },
  { value: 'SPEC', label: '仕様書・図面がある' },
  { value: 'REPEAT', label: '以前の商品をもう一度' },
];

function fmtDate(s?: string | null): string {
  if (!s) return '';
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? s : d.toLocaleString('ja-JP');
}

export default function AdminClientPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [toastMsg, toastShow, toast] = useToast();

  const [detail, setDetail] = useState<AdminClientDetailResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  // 見え方の設定フォーム
  const [level, setLevel] = useState<'' | ExperienceLevelOverride>('');
  const [entry, setEntry] = useState<'' | EntryRoute>('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    setDetail(null);
    setError(null);
    api
      .get<AdminClientDetailResponse>(`/admin/clients/${id}`)
      .then((res) => {
        if (cancelled) return;
        setDetail(res);
        setLevel(res.settings?.experienceLevelOverride ?? '');
        setEntry(res.settings?.defaultEntryRoute ?? '');
        setNote(res.settings?.note ?? '');
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : '会社情報を取得できませんでした。');
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  async function saveSettings() {
    if (saving) return;
    setSaving(true);
    setSavedAt(null);
    try {
      const body: ClientSettingsPatchRequest = {
        experienceLevelOverride: level === '' ? null : level,
        defaultEntryRoute: entry === '' ? null : entry,
        note,
      };
      const res = await api.patch<ClientSettingsPatchResponse>(
        `/admin/clients/${id}/settings`,
        body,
      );
      if (res.settings) {
        setLevel(res.settings.experienceLevelOverride ?? '');
        setEntry(res.settings.defaultEntryRoute ?? '');
        setNote(res.settings.note ?? '');
      }
      setSavedAt(Date.now());
      toast('見え方の設定を保存しました。');
    } catch (e) {
      toast(e instanceof Error ? e.message : '設定の保存に失敗しました。');
    } finally {
      setSaving(false);
    }
  }

  if (error) {
    return (
      <section className="enter">
        <button type="button" className="btn-back" onClick={() => navigate('/admin')}>
          &#8592; ホームに戻る
        </button>
        <div className="form-error" role="alert" style={{ marginTop: 16 }}>
          {error}
        </div>
      </section>
    );
  }

  if (!detail) {
    return (
      <section className="enter">
        <p className="empty-note" style={{ padding: 0 }}>
          読み込んでいます…
        </p>
      </section>
    );
  }

  return (
    <section className="enter" aria-labelledby="client-h">
      <button type="button" className="btn-back" onClick={() => navigate('/admin')}>
        &#8592; ホームに戻る
      </button>

      <div className="card page-head" style={{ marginTop: 10 }}>
        <div className="who">
          <h2 id="client-h">{detail.name}</h2>
          <div className="meta">
            <span className="num">{detail.publicId}</span>
          </div>
        </div>
        <div className="kpi-set">
          <div className="kpi">
            <div className="k">進行中</div>
            <div className="v num">
              {detail.projects.length}
              <small> 件</small>
            </div>
          </div>
          <div className="kpi">
            <div className="k">
              お客様レベル <span className="badge-internal">社内のみ表示</span>
            </div>
            <div className="v" style={{ fontSize: 14 }}>
              {level === ''
                ? `自動判定: ${detail.experienceLevelAuto ?? '初心者'}`
                : (LEVEL_OPTIONS.find((o) => o.value === level)?.label ?? level)}
            </div>
          </div>
        </div>
      </div>

      <div className="sec-title">
        進行中の案件 <span className="hint">クリックで案件詳細へ</span>
      </div>
      <div className="card rows" role="list">
        {detail.projects.length === 0 && (
          <div className="empty-note">進行中の案件はありません。</div>
        )}
        {detail.projects.map((p) => (
          <button
            key={p.projectId}
            type="button"
            className="row-btn cs-row"
            role="listitem"
            onClick={() => navigate(`/admin/projects/${p.projectId}`)}
          >
            <span className="row-main">
              <span className="row-title">
                {p.title}{' '}
                <span
                  className="num"
                  style={{ fontWeight: 400, fontSize: 11, color: 'var(--faint)' }}
                >
                  {p.publicId}
                </span>
              </span>
              <span className="row-sub">
                <span className="chip-state st-stage">{p.status}</span>
              </span>
            </span>
            <span />
            <span className="row-meta num">{fmtDate(p.updatedAt)}</span>
            <svg
              className="row-arrow"
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="m9 5 7 7-7 7" />
            </svg>
          </button>
        ))}
      </div>

      <div className="sec-title">見え方の設定</div>
      <div className="card setting-card">
        <h3>このお客様への画面・提案の見え方</h3>
        <p className="sub">
          説明の細かさや専門用語（業界特有の言葉）の補足量を、お客様に合わせて調整します。
          保存すると即時に反映され、変更は記録されます。
        </p>
        <div className="form-grid">
          <div className="form-field">
            <label htmlFor="set-level">
              お客様レベル
              <span className="auto-note">
                自動判定: {detail.experienceLevelAuto ?? '初心者'}
              </span>
            </label>
            <select
              id="set-level"
              className="select-input"
              value={level}
              onChange={(e) => setLevel(e.target.value as '' | ExperienceLevelOverride)}
            >
              {LEVEL_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <div className="form-field">
            <label htmlFor="set-entry">既定の入り口</label>
            <select
              id="set-entry"
              className="select-input"
              value={entry}
              onChange={(e) => setEntry(e.target.value as '' | EntryRoute)}
            >
              {ENTRY_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="form-field" style={{ marginTop: 14 }}>
          <label htmlFor="set-note">社内メモ（お客様には表示されません）</label>
          <textarea
            id="set-note"
            className="textarea-input"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="例）決裁は田中様で完結。返信は平日午前が早い"
          />
        </div>
        <div className="form-actions">
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={saveSettings}
            disabled={saving}
          >
            {saving ? '保存しています…' : '保存する'}
          </button>
          {savedAt && <span className="saved-note">保存しました</span>}
        </div>
      </div>

      {detail.activity && detail.activity.length > 0 && (
        <>
          <div className="sec-title">直近のやりとり</div>
          <div className="card memo-card">
            <ul style={{ listStyle: 'none' }}>
              {detail.activity.map((a, i) => (
                <li key={i} style={{ fontSize: 12.5, padding: '5px 0' }}>
                  <span className="num" style={{ color: 'var(--faint)', marginRight: 8 }}>
                    {fmtDate(a.at)}
                  </span>
                  {a.what}
                </li>
              ))}
            </ul>
          </div>
        </>
      )}

      <Toast msg={toastMsg} show={toastShow} />
    </section>
  );
}

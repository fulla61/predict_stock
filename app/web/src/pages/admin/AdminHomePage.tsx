import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import type {
  AdminActivityItem,
  AdminClientListItem,
  AdminClientsResponse,
  AdminQueueResponseV2,
} from '../../types';

const RowArrow = (
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
);

/** 判断キューの1行（種別ラベル付き） */
interface QueueRow {
  key: string;
  projectId: number;
  publicId: string;
  clientName: string;
  title: string;
  task: string;
  kind: '提案の承認' | 'Loopの承認' | '条件変更の希望';
  at?: string | null;
}

function fmtDate(s?: string | null): string {
  if (!s) return '';
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? s : d.toLocaleString('ja-JP');
}

export default function AdminHomePage() {
  const navigate = useNavigate();
  const { setAiMode } = useAuth();

  const [queueRows, setQueueRows] = useState<QueueRow[] | null>(null);
  const [queueError, setQueueError] = useState<string | null>(null);
  const [clients, setClients] = useState<AdminClientListItem[] | null>(null);
  const [activity, setActivity] = useState<AdminActivityItem[] | null>(null);
  const [clientsError, setClientsError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    api
      .get<AdminQueueResponseV2>('/admin/queue')
      .then((res) => {
        if (cancelled) return;
        const mode = res.items?.[0]?.aiMode ?? res.loops?.[0]?.aiMode;
        if (mode) setAiMode(mode);
        const rows: QueueRow[] = [
          ...(res.items ?? []).map((it) => ({
            key: `p-${it.proposalId}`,
            projectId: it.projectId,
            publicId: it.publicId,
            clientName: it.clientName,
            title: it.title || it.rawText,
            task: 'お客様へ送る3案の最終確認',
            kind: '提案の承認' as const,
            at: it.createdAt,
          })),
          ...(res.loops ?? []).map((it) => ({
            key: `l-${it.loopId}`,
            projectId: it.projectId,
            publicId: it.publicId,
            clientName: it.clientName,
            title: it.title,
            task: '「選べる進め方」の承認（価格レンジの確認）',
            kind: 'Loopの承認' as const,
            at: it.createdAt,
          })),
          ...(res.modifyRequests ?? []).map((it) => ({
            key: `m-${it.loopId}`,
            projectId: it.projectId,
            publicId: it.publicId,
            clientName: it.clientName,
            title: it.title,
            task: it.modifyNote
              ? `お客様のご希望: ${it.modifyNote}`
              : '条件の再調整（再分析→再提案）',
            kind: '条件変更の希望' as const,
            at: it.decidedAt,
          })),
        ];
        setQueueRows(rows);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setQueueRows([]);
        setQueueError(e instanceof Error ? e.message : '判断キューを取得できませんでした。');
      });

    api
      .get<AdminClientsResponse>('/admin/clients')
      .then((res) => {
        if (cancelled) return;
        setClients(res.items ?? []);
        setActivity(res.recentActivity ?? []);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setClients([]);
        setActivity([]);
        setClientsError(
          e instanceof Error ? e.message : 'お客様一覧を取得できませんでした。',
        );
      });

    return () => {
      cancelled = true;
    };
  }, [setAiMode]);

  return (
    <section className="enter" aria-labelledby="home-h">
      <h2 id="home-h" className="sr-only">
        ホーム
      </h2>

      <div className="sec-title" id="t-queue">
        今日の判断
        <span className="hint">
          Crossimageの判断が必要なものだけを表示します。正常進行中の案件はここに出しません。
        </span>
      </div>
      <div className="card rows" role="list" aria-labelledby="t-queue">
        {queueRows === null && <div className="empty-note">読み込んでいます…</div>}
        {queueError && (
          <div className="empty-note" role="alert">
            {queueError}
          </div>
        )}
        {queueRows !== null && !queueError && queueRows.length === 0 && (
          <div className="empty-note">
            現在、判断が必要な項目はありません。新しい相談・見積・条件変更が届くとここに表示されます。
          </div>
        )}
        {queueRows?.map((row) => (
          <button
            key={row.key}
            type="button"
            className="row-btn q-row"
            role="listitem"
            onClick={() => navigate(`/admin/projects/${row.projectId}`)}
          >
            <span className="row-main">
              <span className="row-title">
                {row.clientName} / {row.title}{' '}
                <span className="num" style={{ fontWeight: 400, fontSize: 11, color: 'var(--faint)' }}>
                  {row.publicId}
                </span>
              </span>
              <span className="row-sub">{row.task}</span>
            </span>
            <span className="row-meta num">{fmtDate(row.at)}</span>
            <span
              className="q-kind"
              style={{
                color: row.kind === '条件変更の希望' ? 'var(--warn)' : 'var(--accent-deep)',
              }}
            >
              {row.kind}
            </span>
            {RowArrow}
          </button>
        ))}
      </div>

      <div className="sec-title" id="t-activity">
        動きがあった案件 <span className="hint">直近の更新</span>
      </div>
      <div className="card rows" role="list" aria-labelledby="t-activity">
        {activity === null && <div className="empty-note">読み込んでいます…</div>}
        {activity !== null && activity.length === 0 && (
          <div className="empty-note">直近の更新はまだありません。</div>
        )}
        {activity?.map((a, i) => (
          <button
            key={`${a.projectId}-${i}`}
            type="button"
            className="row-btn act-row"
            role="listitem"
            onClick={() => navigate(`/admin/projects/${a.projectId}`)}
          >
            <span className="row-main">
              <span className="row-title">
                {a.clientName}{' '}
                <span style={{ fontWeight: 400, color: 'var(--faint)' }}>/</span> {a.title}
              </span>
              <span className="row-sub">{a.what}</span>
            </span>
            <span className="row-meta num">{fmtDate(a.at)}</span>
          </button>
        ))}
      </div>

      <ClientListSection clients={clients} error={clientsError} titleId="t-clients" />
    </section>
  );
}

/* ================= お客様一覧（ホーム / お客様タブで共用） ================= */

export function ClientListSection({
  clients,
  error,
  titleId,
}: {
  clients: AdminClientListItem[] | null;
  error: string | null;
  titleId: string;
}) {
  const navigate = useNavigate();
  const [filter, setFilter] = useState('');

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!clients) return null;
    if (!q) return clients;
    return clients.filter((c) => `${c.name}${c.publicId}`.toLowerCase().includes(q));
  }, [clients, filter]);

  return (
    <>
      <div className="sec-title" id={titleId}>
        すべてのお客様
        <span className="hint">クリックで会社ページへ</span>
      </div>
      <input
        type="search"
        className="search-box"
        placeholder="会社名で検索"
        aria-label="お客様を検索"
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
      />
      <div className="card rows" role="list" aria-labelledby={titleId}>
        {filtered === null && <div className="empty-note">読み込んでいます…</div>}
        {error && (
          <div className="empty-note" role="alert">
            {error}
          </div>
        )}
        {filtered !== null && !error && filtered.length === 0 && (
          <div className="empty-note">該当するお客様が見つかりません</div>
        )}
        {filtered?.map((c) => (
          <button
            key={c.clientId}
            type="button"
            className="row-btn cl-row"
            role="listitem"
            onClick={() => navigate(`/admin/clients/${c.clientId}`)}
          >
            <span className="row-main">
              <span className="row-title">{c.name}</span>
              <span className="row-sub">
                <span className="num">{c.publicId}</span> ・ 進行中 {c.activeProjects}件
              </span>
            </span>
            <span className="chipset">
              {c.statusCounts?.ok > 0 && (
                <span className="chip-state st-ok">順調 {c.statusCounts.ok}</span>
              )}
              {c.statusCounts?.waiting > 0 && (
                <span className="chip-state st-warn">確認待ち {c.statusCounts.waiting}</span>
              )}
              {c.statusCounts?.action > 0 && (
                <span className="chip-state st-alert">要対応 {c.statusCounts.action}</span>
              )}
            </span>
            <span className="row-sub cl-moves" style={{ textAlign: 'right' }}>
              {c.lastActivityText ?? ''}
              {c.lastActivityAt && (
                <>
                  <br />
                  <span className="num">{fmtDate(c.lastActivityAt)}</span>
                </>
              )}
            </span>
            {RowArrow}
          </button>
        ))}
      </div>
    </>
  );
}

/* ================= お客様タブ（ナビ「お客様」直行用） ================= */

export function AdminClientsPage() {
  const [clients, setClients] = useState<AdminClientListItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .get<AdminClientsResponse>('/admin/clients')
      .then((res) => {
        if (!cancelled) setClients(res.items ?? []);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setClients([]);
        setError(e instanceof Error ? e.message : 'お客様一覧を取得できませんでした。');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <section className="enter" aria-labelledby="clients-h">
      <h2 id="clients-h" className="sr-only">
        お客様
      </h2>
      <ClientListSection clients={clients} error={error} titleId="t-clients-tab" />
    </section>
  );
}

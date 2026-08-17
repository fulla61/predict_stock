import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ApiError, api } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { Toast, useToast } from '../../components/ui';
import type {
  AdminActivityItem,
  AdminClientListItem,
  AdminClientsResponse,
} from '../../types';
import type { CreateClientResponse } from '../../types-bi3';
import type { AdminBi4QueueItem, AdminQueueResponseV4 } from '../../types-bi4';

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

/** 判断キューの1行（種別ラベル付き）。kind は将来の種別追加に備えて文字列 */
interface QueueRow {
  key: string;
  projectId: number;
  publicId: string;
  clientName: string;
  title: string;
  task: string;
  kind: string;
  /** 目立たせる種別（お客様からの希望・修正系） */
  urgent?: boolean;
  at?: string | null;
}

function fmtDate(s?: string | null): string {
  if (!s) return '';
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? s : d.toLocaleString('ja-JP');
}

/** BI-4の新キュー配列を防御的にQueueRowへ変換（無い/欠けても壊れない） */
function mapBi4Queue(
  items: AdminBi4QueueItem[] | undefined,
  keyPrefix: string,
  build: (it: AdminBi4QueueItem) => { task: string; kind: string; urgent?: boolean },
): QueueRow[] {
  return (items ?? [])
    .filter((it) => it && typeof it.projectId === 'number')
    .map((it, i) => ({
      key: `${keyPrefix}-${it.sampleId ?? it.inspectionId ?? it.projectId}-${i}`,
      projectId: it.projectId,
      publicId: it.publicId ?? '',
      clientName: it.clientName ?? '',
      title: it.title ?? '',
      at: it.at ?? it.decidedAt ?? it.createdAt,
      ...build(it),
    }));
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
      .get<AdminQueueResponseV4>('/admin/queue')
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
            kind: '提案の承認',
            at: it.createdAt,
          })),
          ...(res.loops ?? []).map((it) => ({
            key: `l-${it.loopId}`,
            projectId: it.projectId,
            publicId: it.publicId,
            clientName: it.clientName,
            title: it.title,
            task: '「選べる進め方」の承認（価格レンジの確認）',
            kind: 'Loopの承認',
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
            kind: '条件変更の希望',
            urgent: true,
            at: it.decidedAt,
          })),
          /* ---- BI-3: 量産合意書系（バックエンドが提供する場合のみ・防御的） ---- */
          ...(res.agreements ?? [])
            .filter((it) => it && it.projectId != null)
            .map((it) => ({
              key: `ag-${it.agreementId ?? it.projectId}`,
              projectId: it.projectId,
              publicId: it.publicId ?? '',
              clientName: it.clientName ?? '',
              title: it.title ?? '量産合意書',
              task: '量産合意書: お客様の確認待ち',
              kind: '量産合意書',
              at: it.createdAt,
            })),
          ...(res.agreementChanges ?? [])
            .filter((it) => it && it.projectId != null)
            .map((it) => ({
              key: `agc-${it.agreementId ?? it.projectId}`,
              projectId: it.projectId,
              publicId: it.publicId ?? '',
              clientName: it.clientName ?? '',
              title: it.title ?? '量産合意書',
              task: it.customerNote
                ? `お客様の修正希望: ${it.customerNote}`
                : '量産合意書の修正（お客様からのご希望）',
              kind: '合意書の修正希望',
              urgent: true,
              at: it.decidedAt ?? it.createdAt,
            })),
          /* ---- BI-4: サンプル/検品/受取確認/振り返り（バックエンドが提供する場合のみ・防御的） ---- */
          ...mapBi4Queue(res.sampleReviews, 'smp', (it) =>
            it.status === 'REJECTED'
              ? {
                  task: it.customerNote
                    ? `お客様の修正希望: ${it.customerNote}`
                    : 'サンプルの修正希望が届いています（次ラウンドの手配）',
                  kind: 'サンプル修正希望',
                  urgent: true,
                }
              : {
                  task: 'サンプル: お客様の確認待ち',
                  kind: 'サンプル確認待ち',
                },
          ),
          ...mapBi4Queue(res.inspectionFails, 'insf', (it) => ({
            task:
              it.defectQty != null
                ? `検品不合格（不良${it.defectQty}個）。対応を判断してください`
                : '検品不合格。対応を判断してください',
            kind: '検品不合格',
            urgent: true,
          })),
          ...mapBi4Queue(res.deliveredAwaitingConfirm, 'dlv', () => ({
            task: 'お届け済み。お客様の受取確認を待っています',
            kind: '受取確認待ち',
          })),
          ...mapBi4Queue(res.feedbackArrived, 'fb', (it) => ({
            task:
              it.rating != null
                ? `振り返りが届きました（星${it.rating}${it.askedRepeat ? '・次の商品も相談したい' : ''}）`
                : '振り返り（フィードバック）が届きました',
            kind: '振り返り着信',
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
                color: row.urgent ? 'var(--warn)' : 'var(--accent-deep)',
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
  const [toastMsg, toastShow, toast] = useToast();
  const [clients, setClients] = useState<AdminClientListItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadClients = useCallback(async () => {
    try {
      const res = await api.get<AdminClientsResponse>('/admin/clients');
      setClients(res.items ?? []);
      setError(null);
    } catch (e) {
      setClients([]);
      setError(e instanceof Error ? e.message : 'お客様一覧を取得できませんでした。');
    }
  }, []);

  useEffect(() => {
    void loadClients();
  }, [loadClients]);

  /* ---- BI-3: お客様アカウント発行 ---- */
  const [formOpen, setFormOpen] = useState(false);
  const [company, setCompany] = useState('');
  const [contact, setContact] = useState('');
  const [email, setEmail] = useState('');
  const [tempPw, setTempPw] = useState('');
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<{
    publicId: string;
    company: string;
    email: string;
    tempPassword: string;
  } | null>(null);

  async function createClient() {
    if (busy) return;
    if (!company.trim() || !contact.trim() || !email.trim() || !tempPw.trim()) {
      toast('会社名・担当者名・メール・仮パスワードをすべてご入力ください。');
      return;
    }
    setBusy(true);
    try {
      const res = await api.post<CreateClientResponse>('/admin/clients', {
        companyName: company.trim(),
        contactName: contact.trim(),
        email: email.trim(),
        tempPassword: tempPw,
      });
      setCreated({
        publicId: res.publicId,
        company: company.trim(),
        email: email.trim(),
        tempPassword: tempPw,
      });
      setFormOpen(false);
      setCompany('');
      setContact('');
      setEmail('');
      setTempPw('');
      toast('お客様を追加しました。仮パスワードをお伝えください。');
      await loadClients();
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        toast('このメールアドレスは既に登録されています。');
      } else {
        toast(e instanceof Error ? e.message : 'お客様の追加に失敗しました。');
      }
    } finally {
      setBusy(false);
    }
  }

  async function copyTempPw() {
    if (!created) return;
    try {
      await navigator.clipboard.writeText(created.tempPassword);
      toast('仮パスワードをコピーしました。');
    } catch {
      toast('コピーできませんでした。表示された文字列を手動でコピーしてください。');
    }
  }

  return (
    <section className="enter" aria-labelledby="clients-h">
      <h2 id="clients-h" className="sr-only">
        お客様
      </h2>

      <div className="sec-title">
        お客様アカウントの発行
        <span className="hint">
          作成すると、お客様がメール+仮パスワードでログインできるようになります
        </span>
      </div>

      {created && (
        <div className="card setting-card pw-box" role="alert">
          <h3>{created.company} 様のアカウントを作成しました</h3>
          <p className="sub">
            仮パスワード（初回ログイン用のパスワード）はこの画面でしか確認できません。
            お客様へ安全な方法でお伝えください。この表示を閉じると再表示できません。
          </p>
          <div className="state-line">
            <span className="k">お客様番号</span>
            <span className="num">{created.publicId}</span>
          </div>
          <div className="state-line">
            <span className="k">ログインID</span>
            <span className="num">{created.email}</span>
          </div>
          <div className="state-line">
            <span className="k">仮パスワード</span>
            <span className="num pw-value">{created.tempPassword}</span>
          </div>
          <div className="form-actions">
            <button type="button" className="btn btn-primary btn-sm" onClick={copyTempPw}>
              仮パスワードをコピー
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => setCreated(null)}
            >
              閉じる（以後表示されません）
            </button>
          </div>
        </div>
      )}

      {formOpen ? (
        <div className="card setting-card" style={{ marginBottom: 16 }}>
          <h3>お客様を追加</h3>
          <p className="sub">
            1画面1判断: 4項目だけで発行できます。細かな見え方の設定は、作成後の会社ページから行えます。
          </p>
          <div className="form-grid">
            <div className="form-field">
              <label htmlFor="nc-company">会社名（必須）</label>
              <input
                id="nc-company"
                className="text-input"
                value={company}
                onChange={(e) => setCompany(e.target.value)}
                placeholder="例）株式会社サンプル"
              />
            </div>
            <div className="form-field">
              <label htmlFor="nc-contact">担当者名（必須）</label>
              <input
                id="nc-contact"
                className="text-input"
                value={contact}
                onChange={(e) => setContact(e.target.value)}
                placeholder="例）山田 花子"
              />
            </div>
            <div className="form-field">
              <label htmlFor="nc-email">メールアドレス（ログインID・必須）</label>
              <input
                id="nc-email"
                className="text-input"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="例）hanako@example.co.jp"
              />
            </div>
            <div className="form-field">
              <label htmlFor="nc-pw">仮パスワード（必須）</label>
              <input
                id="nc-pw"
                className="text-input"
                value={tempPw}
                onChange={(e) => setTempPw(e.target.value)}
                placeholder="例）初回ログイン用の文字列"
              />
            </div>
          </div>
          <div className="form-actions">
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={createClient}
              disabled={busy}
            >
              {busy ? '作成しています…' : 'この内容で作成'}
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => setFormOpen(false)}
              disabled={busy}
            >
              やめる
            </button>
          </div>
        </div>
      ) : (
        <div style={{ marginBottom: 16 }}>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={() => setFormOpen(true)}
          >
            ＋ お客様を追加
          </button>
        </div>
      )}

      <ClientListSection clients={clients} error={error} titleId="t-clients-tab" />
      <Toast msg={toastMsg} show={toastShow} />
    </section>
  );
}

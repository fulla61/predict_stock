import { useCallback, useEffect, useState } from 'react';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import {
  formatLeadDays,
  formatPrice,
  formatQtyFrom,
  SourceChip,
  Toast,
  useToast,
} from '../components/ui';
import type {
  AdminActionResponse,
  AdminQueueItem,
  AdminQueueResponse,
  ProjectViewStaff,
  ProposalOptionView,
} from '../types';

export default function AdminPage() {
  const { setAiMode } = useAuth();
  const [toastMsg, toastShow, toast] = useToast();

  const [queue, setQueue] = useState<AdminQueueItem[] | null>(null);
  const [queueError, setQueueError] = useState<string | null>(null);
  const [selected, setSelected] = useState<AdminQueueItem | null>(null);
  const [project, setProject] = useState<ProjectViewStaff | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [revising, setRevising] = useState(false);
  const [instruction, setInstruction] = useState('');

  const loadQueue = useCallback(async () => {
    setQueueError(null);
    try {
      const res = await api.get<AdminQueueResponse>('/admin/queue');
      setQueue(res.items ?? []);
      const mode = res.items?.[0]?.aiMode;
      if (mode) setAiMode(mode);
    } catch (e) {
      setQueue([]);
      setQueueError(
        e instanceof Error ? e.message : '承認キューを取得できませんでした。',
      );
    }
  }, [setAiMode]);

  useEffect(() => {
    void loadQueue();
  }, [loadQueue]);

  async function openItem(item: AdminQueueItem) {
    setSelected(item);
    setProject(null);
    setDetailError(null);
    setInstruction('');
    setRevising(false);
    window.scrollTo({ top: 0 });
    try {
      // STAFF向け全項目ビュー（回答済み質問・参考URLを含む）
      const pj = await api.get<ProjectViewStaff>(`/projects/${item.projectId}`);
      setProject(pj);
      if (pj.aiMode) setAiMode(pj.aiMode);
    } catch (e) {
      // 詳細取得に失敗してもキュー項目自身のデータで1画面表示は成立させる
      setDetailError(
        e instanceof Error ? e.message : '案件詳細の取得に失敗しました（キュー内の情報で表示しています）。',
      );
    }
  }

  function backToQueue() {
    setSelected(null);
    setProject(null);
    void loadQueue();
  }

  async function approve() {
    if (!selected || busy) return;
    setBusy(true);
    try {
      await api.post<AdminActionResponse>(
        `/admin/proposals/${selected.proposalId}/approve`,
        {},
      );
      toast('提案を承認しました。お客様の画面に公開されます。');
      backToQueue();
    } catch (e) {
      toast(e instanceof Error ? e.message : '承認に失敗しました。');
    } finally {
      setBusy(false);
    }
  }

  async function revise() {
    if (!selected || busy) return;
    const text = instruction.trim();
    if (!text) {
      toast('修正内容をご記入ください。');
      return;
    }
    setBusy(true);
    try {
      await api.post<AdminActionResponse>(
        `/admin/proposals/${selected.proposalId}/revise`,
        { instruction: text },
      );
      toast('修正を依頼しました。再生成後、あらためて承認キューに入ります。');
      backToQueue();
    } catch (e) {
      toast(e instanceof Error ? e.message : '修正依頼に失敗しました。');
    } finally {
      setBusy(false);
    }
  }

  /* ---------------- 一覧 ---------------- */
  if (!selected) {
    return (
      <section className="step enter" aria-labelledby="h-admin">
        <span className="internal-badge">INTERNAL — 社内のみ</span>
        <h1 className="h-main" id="h-admin" style={{ fontSize: 22 }}>
          承認キュー
        </h1>
        <p className="h-sub">
          お客様に提案を送る前の最終確認です。1件ずつ開いて判断してください。
        </p>

        {queue === null && (
          <p className="page-note" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span className="spinner" aria-hidden="true" />
            読み込んでいます…
          </p>
        )}

        {queueError && (
          <div className="form-error" role="alert" style={{ marginTop: 28 }}>
            {queueError}
          </div>
        )}

        {queue !== null && !queueError && queue.length === 0 && (
          <p className="page-note">
            現在、承認待ちの提案はありません。新しい相談が届くとここに表示されます。
          </p>
        )}

        <div className="queue-list">
          {queue?.map((item) => (
            <button
              key={item.proposalId}
              type="button"
              className="card queue-item"
              onClick={() => openItem(item)}
            >
              <span className="queue-main">
                <span>
                  <span className="queue-id num">{item.publicId}</span>
                  <span className="queue-client">{item.clientName}</span>
                </span>
                <span className="queue-summary">{item.title || item.rawText}</span>
              </span>
              {item.createdAt && (
                <span className="queue-date num">
                  {new Date(item.createdAt).toLocaleString('ja-JP')}
                </span>
              )}
              <span className="queue-open" aria-hidden="true">
                &#8594;
              </span>
            </button>
          ))}
        </div>

        <Toast msg={toastMsg} show={toastShow} />
      </section>
    );
  }

  /* ---------------- 詳細（1画面1判断） ---------------- */
  const understanding = project?.understanding ?? selected.understanding;
  const options: ProposalOptionView[] =
    (project?.proposal && 'proposal' in project.proposal
      ? project.proposal.proposal.options
      : undefined) ?? selected.options;
  const answered = (project?.questions ?? []).filter((q) => q.answer);

  return (
    <section className="step enter" aria-labelledby="h-int">
      <button type="button" className="btn-back" onClick={backToQueue}>
        &#8592; 承認キューに戻る
      </button>
      <span className="internal-badge" style={{ display: 'inline-block', marginTop: 14 }}>
        INTERNAL — 社内のみ
      </span>
      <h1 className="h-main" id="h-int" style={{ fontSize: 22 }}>
        提案承認ビュー{' '}
        <span className="num" style={{ color: 'var(--accent-deep)' }}>
          {selected.publicId}
        </span>
      </h1>
      <p className="h-sub">
        1画面1判断: この提案をお客様に送ってよいか、だけを確認します。
      </p>

      {detailError && (
        <div className="form-error" role="alert" style={{ marginTop: 28 }}>
          {detailError}
        </div>
      )}

      <div className="card int-section">
        <h3>顧客入力（原文） — {project?.clientName ?? selected.clientName}</h3>
        <div className="int-raw">{project?.rawText ?? selected.rawText}</div>
        {project?.refUrl && (
          <p className="note">
            参考URL: <a href={project.refUrl}>{project.refUrl}</a>
          </p>
        )}
      </div>

      <div className="card int-section">
        <h3>AI整理結果</h3>
        <table className="int-table">
          <tbody>
            {understanding.map((r) => (
              <tr key={r.key}>
                <td className="k">{r.label}</td>
                <td>{r.value}</td>
                <td style={{ textAlign: 'right' }}>
                  <SourceChip source={r.source} />
                </td>
              </tr>
            ))}
            {answered.map((q) => (
              <tr key={q.id}>
                <td className="k">追加回答</td>
                <td>
                  {q.title} → {q.answer}
                </td>
                <td style={{ textAlign: 'right' }}>
                  <span className="chip-state chip-from-user">ご記入から</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="int-legend">
          <span>
            <span className="chip-state chip-from-user">ご記入から</span> =
            顧客の記入に基づく
          </span>
          <span>
            <span className="chip-state chip-ai-guess">AIの推測</span> =
            送信前に要確認
          </span>
        </div>
      </div>

      <div className="card int-section">
        <h3>提案する3案</h3>
        {options.length ? (
          options.map((p) => (
            <div className="int-plan" key={p.id}>
              <span className="nm">{p.title}</span>
              {p.recommended && (
                <span
                  className="chip-state"
                  style={{
                    background: 'var(--accent-soft)',
                    color: 'var(--accent-deep)',
                    marginLeft: 6,
                  }}
                >
                  推奨
                </span>
              )}{' '}
              — {p.concept}
              <br />
              <span className="pr">{formatPrice(p.priceRangeJpy)}</span> ／{' '}
              {formatQtyFrom(p.qtyFrom)} ／ {formatLeadDays(p.leadDays)}
              <br />
              <span style={{ color: 'var(--sub)' }}>
                ○ {p.pros.join(' ／ ')}　△ {p.tradeoff}
              </span>
            </div>
          ))
        ) : (
          <p className="page-note" style={{ marginTop: 0 }}>
            提案データを取得できませんでした。
          </p>
        )}
      </div>

      {revising && (
        <div className="card int-section revise-box">
          <h3>修正の依頼内容</h3>
          <textarea
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
            placeholder="例）小ロット案の価格レンジが高すぎる。最新の相場感で再計算してほしい"
            aria-label="修正の依頼内容"
          />
        </div>
      )}

      <div className="int-actions">
        {revising ? (
          <>
            <button type="button" className="btn btn-primary" onClick={revise} disabled={busy}>
              {busy ? '送信しています…' : 'この内容で修正を依頼'}
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => setRevising(false)}
              disabled={busy}
            >
              やめる
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              className="btn btn-primary"
              onClick={approve}
              disabled={busy || !options.length}
            >
              {busy ? '送信しています…' : '承認して公開'}
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => setRevising(true)}
              disabled={busy}
            >
              修正を依頼
            </button>
          </>
        )}
      </div>

      <Toast msg={toastMsg} show={toastShow} />
    </section>
  );
}

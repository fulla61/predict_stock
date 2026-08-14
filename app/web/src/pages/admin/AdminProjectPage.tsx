import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api, downloadText } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { SourceChip, Toast, useToast } from '../../components/ui';
import type {
  AdminActionResponse,
  CreateFactoryRequest,
  CreateQuoteRequest,
  FactoriesResponse,
  FactoryView,
  LoopActionResponse,
  LoopOptionStaffView,
  LoopStaffView,
  ProjectViewStaffV2,
  QuoteConditionType,
  QuoteCurrency,
  RfqSentResponse,
  RfqView,
} from '../../types';

/* 工程: CONTRACT-2 / prototype準拠 */
const STAGES = ['相談', '提案', '工場確認', 'サンプル', '生産', '検品', '輸入', '納品'];

const COND_TYPES: { value: QuoteConditionType; label: string }[] = [
  { value: 'MOQ', label: 'MOQ（最低数量）' },
  { value: 'PRICE_TIER', label: '数量別単価' },
  { value: 'TOOLING', label: '金型・治具' },
  { value: 'LEADTIME', label: '納期条件' },
  { value: 'OTHER', label: 'その他' },
];

interface CondRow {
  _id: number;
  conditionType: QuoteConditionType;
  thresholdQty: string;
  value: string;
  note: string;
}

function fmtDate(s?: string | null): string {
  if (!s) return '';
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? s : d.toLocaleString('ja-JP');
}

export default function AdminProjectPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { setAiMode } = useAuth();
  const [toastMsg, toastShow, toast] = useToast();

  const [project, setProject] = useState<ProjectViewStaffV2 | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [factories, setFactories] = useState<FactoryView[] | null>(null);
  const [factoriesError, setFactoriesError] = useState<string | null>(null);

  const loadProject = useCallback(async () => {
    try {
      const pj = await api.get<ProjectViewStaffV2>(`/projects/${id}`);
      setProject(pj);
      setLoadError(null);
      if (pj.aiMode) setAiMode(pj.aiMode);
      return pj;
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : '案件を取得できませんでした。');
      return null;
    }
  }, [id, setAiMode]);

  const loadFactories = useCallback(async () => {
    try {
      const res = await api.get<FactoriesResponse>('/admin/factories');
      setFactories(res.items ?? []);
      setFactoriesError(null);
    } catch (e) {
      setFactories([]);
      setFactoriesError(
        e instanceof Error ? e.message : '工場台帳を取得できませんでした。',
      );
    }
  }, []);

  useEffect(() => {
    void loadProject();
    void loadFactories();
  }, [loadProject, loadFactories]);

  /* ---------------- 提案承認（BI-1 統合） ---------------- */
  const [busy, setBusy] = useState(false);
  const [revising, setRevising] = useState(false);
  const [instruction, setInstruction] = useState('');

  const proposal =
    project && project.proposal.state !== 'none' ? project.proposal.proposal : null;
  const proposalPending = project?.proposal.state === 'PENDING_APPROVAL';

  async function approveProposal() {
    if (!proposal || busy) return;
    setBusy(true);
    try {
      await api.post<AdminActionResponse>(`/admin/proposals/${proposal.id}/approve`, {});
      toast('提案を承認しました。お客様の画面に公開されます。');
      setRevising(false);
      await loadProject();
    } catch (e) {
      toast(e instanceof Error ? e.message : '承認に失敗しました。');
    } finally {
      setBusy(false);
    }
  }

  async function reviseProposal() {
    if (!proposal || busy) return;
    const text = instruction.trim();
    if (!text) {
      toast('修正内容をご記入ください。');
      return;
    }
    setBusy(true);
    try {
      await api.post<AdminActionResponse>(`/admin/proposals/${proposal.id}/revise`, {
        instruction: text,
      });
      toast('修正を依頼しました。再生成後、あらためて承認キューに入ります。');
      setRevising(false);
      setInstruction('');
      await loadProject();
    } catch (e) {
      toast(e instanceof Error ? e.message : '修正依頼に失敗しました。');
    } finally {
      setBusy(false);
    }
  }

  /* ---------------- 工場登録 ---------------- */
  const [showFactoryForm, setShowFactoryForm] = useState(false);
  const [fName, setFName] = useState('');
  const [fRegion, setFRegion] = useState('');
  const [fSpecialties, setFSpecialties] = useState('');
  const [factoryBusy, setFactoryBusy] = useState(false);

  async function addFactory() {
    if (factoryBusy) return;
    if (!fName.trim()) {
      toast('工場名をご入力ください。');
      return;
    }
    setFactoryBusy(true);
    try {
      const body: CreateFactoryRequest = {
        name: fName.trim(),
        ...(fRegion.trim() ? { region: fRegion.trim() } : {}),
        ...(fSpecialties.trim() ? { specialty: fSpecialties.trim() } : {}),
      };
      await api.post<FactoryView>('/admin/factories', body);
      toast('工場を登録しました。');
      setFName('');
      setFRegion('');
      setFSpecialties('');
      setShowFactoryForm(false);
      await loadFactories();
    } catch (e) {
      toast(e instanceof Error ? e.message : '工場の登録に失敗しました。');
    } finally {
      setFactoryBusy(false);
    }
  }

  /* ---------------- RFQ生成・送信 ---------------- */
  const [checkedFactories, setCheckedFactories] = useState<number[]>([]);
  const [rfqGenerating, setRfqGenerating] = useState(false);
  const [localRfqs, setLocalRfqs] = useState<RfqView[]>([]);
  const [openRfqId, setOpenRfqId] = useState<number | null>(null);
  const [sentChannel, setSentChannel] = useState<'WeChat' | 'メール'>('WeChat');
  const [rfqBusy, setRfqBusy] = useState(false);

  // project再取得時はサーバー側の一覧を正とする
  useEffect(() => {
    if (project) setLocalRfqs(project.rfqs ?? []);
  }, [project]);

  const rfqs = localRfqs;

  function toggleFactory(fid: number) {
    setCheckedFactories((cur) =>
      cur.includes(fid) ? cur.filter((x) => x !== fid) : [...cur, fid],
    );
  }

  async function generateRfq() {
    if (rfqGenerating) return;
    if (checkedFactories.length === 0) {
      toast('見積を依頼する工場を選んでください。');
      return;
    }
    setRfqGenerating(true);
    try {
      const rfq = await api.post<RfqView>(`/admin/projects/${id}/rfq`, {
        factoryIds: checkedFactories,
      });
      if (rfq.aiMode) setAiMode(rfq.aiMode);
      setLocalRfqs((cur) => [rfq, ...cur.filter((r) => r.id !== rfq.id)]);
      setOpenRfqId(rfq.id);
      toast('中国語の見積依頼（RFQ）を作成しました。内容を確認して送信してください。');
    } catch (e) {
      toast(e instanceof Error ? e.message : '見積依頼の作成に失敗しました。');
    } finally {
      setRfqGenerating(false);
    }
  }

  async function copyRfq(rfq: RfqView) {
    try {
      await navigator.clipboard.writeText(rfq.body);
      toast('本文をコピーしました。WeChat等に貼り付けて送信してください。');
    } catch {
      toast('コピーできませんでした。本文を選択して手動でコピーしてください。');
    }
  }

  function downloadRfq(rfq: RfqView) {
    downloadText(`${rfq.publicId || `RFQ-${rfq.id}`}.md`, rfq.body);
  }

  async function markRfqSent(rfq: RfqView) {
    if (rfqBusy) return;
    setRfqBusy(true);
    try {
      const res = await api.post<RfqSentResponse>(`/admin/rfqs/${rfq.id}/sent`, {
        channel: sentChannel,
      });
      setLocalRfqs((cur) =>
        cur.map((r) =>
          r.id === rfq.id
            ? { ...r, status: 'SENT', sentChannel, sentAt: res.sentAt }
            : r,
        ),
      );
      toast(`送信済みにしました（${sentChannel}）。見積が届いたら下の欄から入力してください。`);
    } catch (e) {
      toast(e instanceof Error ? e.message : '送信済みへの更新に失敗しました。');
    } finally {
      setRfqBusy(false);
    }
  }

  /* ---------------- 見積入力（版管理） ---------------- */
  const [qRfqId, setQRfqId] = useState<number | ''>('');
  const [qFactoryId, setQFactoryId] = useState<number | ''>('');
  const [qCurrency, setQCurrency] = useState<QuoteCurrency>('CNY');
  const [qUnitPrice, setQUnitPrice] = useState('');
  const [qMoq, setQMoq] = useState('');
  const [qTooling, setQTooling] = useState('');
  const [qSample, setQSample] = useState('');
  const [qLeadDays, setQLeadDays] = useState('');
  const [qValidUntil, setQValidUntil] = useState('');
  const [qNotes, setQNotes] = useState('');
  const [conds, setConds] = useState<CondRow[]>([]);
  const [condSeq, setCondSeq] = useState(1);
  const [quoteBusy, setQuoteBusy] = useState(false);

  const quotes = useMemo(() => project?.quotes ?? [], [project]);

  // RFQの既定選択（送信済み優先）
  useEffect(() => {
    if (qRfqId === '' && rfqs.length > 0) {
      const sent = rfqs.find((r) => r.status === 'SENT');
      setQRfqId((sent ?? rfqs[0]).id);
    }
  }, [rfqs, qRfqId]);

  function addCond() {
    setConds((cur) => [
      ...cur,
      { _id: condSeq, conditionType: 'MOQ', thresholdQty: '', value: '', note: '' },
    ]);
    setCondSeq((n) => n + 1);
  }
  function updateCond(cid: number, patch: Partial<CondRow>) {
    setConds((cur) => cur.map((c) => (c._id === cid ? { ...c, ...patch } : c)));
  }
  function removeCond(cid: number) {
    setConds((cur) => cur.filter((c) => c._id !== cid));
  }

  async function submitQuote() {
    if (quoteBusy) return;
    if (qRfqId === '') {
      toast('先に見積依頼（RFQ）を作成してください。');
      return;
    }
    if (qFactoryId === '' || !qUnitPrice || !qMoq || !qLeadDays) {
      toast('工場・単価・MOQ・納期は必須です。');
      return;
    }
    setQuoteBusy(true);
    try {
      const body: CreateQuoteRequest = {
        factoryId: Number(qFactoryId),
        currency: qCurrency,
        unitPrice: Number(qUnitPrice),
        moq: Number(qMoq),
        ...(qTooling ? { toolingCost: Number(qTooling) } : {}),
        ...(qSample ? { sampleCost: Number(qSample) } : {}),
        leadDays: Number(qLeadDays),
        ...(qValidUntil ? { validUntil: qValidUntil } : {}),
        ...(qNotes.trim() ? { notes: qNotes.trim() } : {}),
        conditions: conds
          .filter((c) => c.value.trim() || c.thresholdQty !== '')
          .map((c) => ({
            conditionType: c.conditionType,
            ...(c.thresholdQty !== '' ? { thresholdQty: Number(c.thresholdQty) } : {}),
            ...(c.value.trim() ? { value: c.value.trim() } : {}),
            ...(c.note.trim() ? { note: c.note.trim() } : {}),
          })),
      };
      await api.post(`/admin/rfqs/${qRfqId}/quotes`, body);
      toast('見積を登録しました（新しい版として記録されます）。');
      setQUnitPrice('');
      setQMoq('');
      setQTooling('');
      setQSample('');
      setQLeadDays('');
      setQValidUntil('');
      setQNotes('');
      setConds([]);
      await loadProject();
    } catch (e) {
      toast(e instanceof Error ? e.message : '見積の登録に失敗しました。');
    } finally {
      setQuoteBusy(false);
    }
  }

  /* ---------------- Loop（条件分析→Option編集→承認） ---------------- */
  const loops = useMemo(() => project?.loops ?? [], [project]);
  const pendingLoop = loops.find((l) => l.status === 'PENDING_APPROVAL') ?? null;
  const modifyLoop =
    loops.find((l) => l.customerDecision === 'MODIFY' && l.status !== 'PENDING_APPROVAL') ??
    null;

  const [loopBusy, setLoopBusy] = useState(false);
  const [editOpts, setEditOpts] = useState<LoopOptionStaffView[]>([]);

  useEffect(() => {
    setEditOpts(pendingLoop ? pendingLoop.options.map((o) => ({ ...o })) : []);
  }, [pendingLoop]);

  function updateOpt(key: string, patch: Partial<LoopOptionStaffView>) {
    setEditOpts((cur) => cur.map((o) => (o.key === key ? { ...o, ...patch } : o)));
  }

  async function analyzeLoop() {
    if (loopBusy) return;
    setLoopBusy(true);
    try {
      const loop = await api.post<LoopStaffView>(`/admin/projects/${id}/loop`, {});
      if (loop.aiMode) setAiMode(loop.aiMode);
      toast('条件を分析し、お客様向けのOption案を作成しました。内容を確認・編集してください。');
      await loadProject();
    } catch (e) {
      toast(e instanceof Error ? e.message : '分析に失敗しました。');
    } finally {
      setLoopBusy(false);
    }
  }

  async function saveOptions(loop: LoopStaffView) {
    await api.patch<LoopActionResponse>(`/admin/loops/${loop.id}/options`, {
      options: editOpts.map((o) => ({
        key: o.key,
        title: o.title,
        concept: o.concept,
        customerPriceRange: o.customerPriceRange,
        qtyFrom: String(o.qtyFrom),
        leadDays: String(o.leadDays),
        pros: o.pros,
        tradeoff: o.tradeoff,
        recommended: o.recommended,
      })),
    });
  }

  async function saveOnly(loop: LoopStaffView) {
    if (loopBusy) return;
    setLoopBusy(true);
    try {
      await saveOptions(loop);
      toast('編集内容を保存しました。');
      await loadProject();
    } catch (e) {
      toast(e instanceof Error ? e.message : '保存に失敗しました。');
    } finally {
      setLoopBusy(false);
    }
  }

  async function approveLoop(loop: LoopStaffView) {
    if (loopBusy) return;
    setLoopBusy(true);
    try {
      await saveOptions(loop);
      await api.post<LoopActionResponse>(`/admin/loops/${loop.id}/approve`, {});
      toast('承認しました。お客様の画面に「選べる進め方」として公開されます。');
      await loadProject();
    } catch (e) {
      toast(e instanceof Error ? e.message : '承認に失敗しました。');
    } finally {
      setLoopBusy(false);
    }
  }

  /* ---------------- 工程インデックス推定 ---------------- */
  const stageIdx = useMemo(() => {
    if (!project) return 0;
    if (loops.length > 0 || quotes.length > 0 || rfqs.length > 0) return 2; // 工場確認
    const st = project.proposal.state;
    if (st === 'none' || st === 'PENDING_APPROVAL' || st === 'REVISION_REQUESTED') return 0;
    return 1; // 提案
  }, [project, loops.length, quotes.length, rfqs.length]);

  /* ================= render ================= */

  if (loadError) {
    return (
      <section className="enter">
        <button type="button" className="btn-back" onClick={() => navigate('/admin')}>
          &#8592; ホームに戻る
        </button>
        <div className="form-error" role="alert" style={{ marginTop: 16 }}>
          {loadError}
        </div>
      </section>
    );
  }
  if (!project) {
    return (
      <section className="enter">
        <p className="empty-note" style={{ padding: 0 }}>
          読み込んでいます…
        </p>
      </section>
    );
  }

  const answered = (project.questions ?? []).filter((q) => q.answer);

  return (
    <section className="enter" aria-labelledby="case-h">
      <button type="button" className="btn-back" onClick={() => navigate(-1)}>
        &#8592; 戻る
      </button>

      {/* ---- ヘッダ + 工程 ---- */}
      <div className="card" style={{ marginTop: 10 }}>
        <div className="page-head" style={{ paddingBottom: 6 }}>
          <div className="who">
            <h2 id="case-h">
              {project.clientName} / {project.title}
            </h2>
            <div className="meta">
              <span className="num">{project.publicId}</span> ・ {project.status}
            </div>
          </div>
        </div>
        <div className="timeline" aria-label="工程タイムライン">
          {STAGES.map((s, i) => {
            const cls = i < stageIdx ? 'done' : i === stageIdx ? 'now' : '';
            return (
              <div className={`tl-step ${cls}`} key={s}>
                <div className="tl-dot">
                  {i < stageIdx && (
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="m5 13 4 4 10-10" />
                    </svg>
                  )}
                </div>
                <div className="tl-label">
                  {s}
                  <span className="sr-only">
                    {i < stageIdx ? '（完了）' : i === stageIdx ? '（現在）' : ''}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
        <div style={{ padding: '0 22px 18px' }}>
          <div className="state-line">
            <span className="k">現在の工程</span>
            <span>
              <span className="chip-state st-stage">{STAGES[stageIdx]}</span>
            </span>
          </div>
          <div className="state-line">
            <span className="k">顧客入力</span>
            <span style={{ whiteSpace: 'pre-wrap', fontSize: 12.5 }}>{project.rawText}</span>
          </div>
        </div>
      </div>

      {/* ---- 提案承認（PENDING時のみ） ---- */}
      {proposalPending && proposal && (
        <div className="card case-section">
          <h3>提案の承認（お客様へ送る前の最終確認）</h3>
          <p className="sub">1画面1判断: この3案をお客様に送ってよいか、だけを確認します。</p>

          <table className="int-table">
            <tbody>
              {project.understanding.map((r) => (
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

          {proposal.options.map((p) => (
            <div className="int-plan" key={p.id}>
              <span className="nm">{p.title}</span>
              {p.recommended && (
                <span
                  className="chip-state"
                  style={{ background: 'var(--accent-soft)', color: 'var(--accent-deep)', marginLeft: 6 }}
                >
                  推奨
                </span>
              )}{' '}
              — {p.concept}
              <br />
              <span className="pr">{p.priceRangeJpy}</span> ／ {p.qtyFrom} ／ {p.leadDays}
              <br />
              <span style={{ color: 'var(--sub)' }}>
                ○ {p.pros.join(' ／ ')}　△ {p.tradeoff}
              </span>
            </div>
          ))}

          {revising && (
            <div style={{ marginTop: 14 }}>
              <label className="form-field" style={{ display: 'block' }}>
                <span style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--sub)', marginBottom: 5 }}>
                  修正の依頼内容
                </span>
                <textarea
                  className="textarea-input"
                  value={instruction}
                  onChange={(e) => setInstruction(e.target.value)}
                  placeholder="例）小ロット案の価格レンジが高すぎる。最新の相場感で再計算してほしい"
                />
              </label>
            </div>
          )}

          <div className="form-actions">
            {revising ? (
              <>
                <button type="button" className="btn btn-primary btn-sm" onClick={reviseProposal} disabled={busy}>
                  {busy ? '送信しています…' : 'この内容で修正を依頼'}
                </button>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setRevising(false)} disabled={busy}>
                  やめる
                </button>
              </>
            ) : (
              <>
                <button type="button" className="btn btn-primary btn-sm" onClick={approveProposal} disabled={busy}>
                  {busy ? '送信しています…' : '承認して公開'}
                </button>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setRevising(true)} disabled={busy}>
                  修正を依頼
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {/* ---- RFQ（中国語の見積依頼） ---- */}
      <div className="card case-section">
        <h3>
          工場への見積依頼（RFQ<span style={{ fontWeight: 400 }}>（見積依頼書）</span>）
        </h3>
        <p className="sub">
          依頼先の工場を選ぶと、理解済みの仕様から中国語の依頼文をAIが作成します。
          送信はWeChat・メールで担当者が行い、送信後に「送信済みにする」を押してください。
          依頼文にお客様への販売価格・マージンは含まれません。
        </p>

        {factoriesError && (
          <div className="empty-note" role="alert" style={{ padding: '8px 0' }}>
            {factoriesError}
          </div>
        )}

        <div className="factory-list">
          {factories !== null && factories.length === 0 && !factoriesError && (
            <div className="empty-note" style={{ padding: '8px 0' }}>
              工場がまだ登録されていません。下の「工場を登録」から追加してください。
            </div>
          )}
          {factories?.map((f) => (
            <label className="factory-check" key={f.id}>
              <input
                type="checkbox"
                checked={checkedFactories.includes(f.id)}
                onChange={() => toggleFactory(f.id)}
              />
              <span>
                <strong>{f.name}</strong>{' '}
                <span className="num" style={{ fontSize: 11, color: 'var(--faint)' }}>
                  {f.publicId}
                </span>
                <span className="fmeta" style={{ display: 'block' }}>
                  {[f.region, f.specialty].filter(Boolean).join(' ・ ')}
                </span>
              </span>
            </label>
          ))}
        </div>

        {showFactoryForm ? (
          <div style={{ marginTop: 12 }}>
            <div className="form-grid">
              <div className="form-field">
                <label htmlFor="f-name">工場名（必須）</label>
                <input id="f-name" className="text-input" value={fName} onChange={(e) => setFName(e.target.value)} placeholder="例）恒达日用品廠" />
              </div>
              <div className="form-field">
                <label htmlFor="f-region">地域</label>
                <input id="f-region" className="text-input" value={fRegion} onChange={(e) => setFRegion(e.target.value)} placeholder="例）広東省・佛山" />
              </div>
              <div className="form-field">
                <label htmlFor="f-spec">得意分野</label>
                <input id="f-spec" className="text-input" value={fSpecialties} onChange={(e) => setFSpecialties(e.target.value)} placeholder="例）ホーロー・金属日用品" />
              </div>
            </div>
            <div className="form-actions">
              <button type="button" className="btn btn-primary btn-sm" onClick={addFactory} disabled={factoryBusy}>
                {factoryBusy ? '登録しています…' : 'この内容で登録'}
              </button>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setShowFactoryForm(false)} disabled={factoryBusy}>
                やめる
              </button>
            </div>
          </div>
        ) : (
          <div className="form-actions">
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={generateRfq}
              disabled={rfqGenerating || checkedFactories.length === 0}
            >
              {rfqGenerating ? '作成しています…' : '中国語の見積依頼を作る'}
            </button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setShowFactoryForm(true)}>
              工場を登録
            </button>
          </div>
        )}

        {rfqs.map((rfq) => (
          <div className="rfq-item" key={rfq.id}>
            <div className="head">
              <strong className="num">{rfq.publicId || `RFQ-${rfq.id}`}</strong>
              {rfq.status === 'SENT' ? (
                <span className="chip-state st-ok">
                  送信済み{rfq.sentChannel ? `（${rfq.sentChannel}）` : ''}
                </span>
              ) : (
                <span className="chip-state st-warn">下書き（未送信）</span>
              )}
              {rfq.sentAt && <span className="row-meta num">{fmtDate(rfq.sentAt)}</span>}
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                style={{ marginLeft: 'auto' }}
                onClick={() => setOpenRfqId(openRfqId === rfq.id ? null : rfq.id)}
              >
                {openRfqId === rfq.id ? '本文を閉じる' : '本文を見る'}
              </button>
            </div>
            {openRfqId === rfq.id && (
              <>
                <div className="rfq-body" lang="zh-CN">
                  {rfq.body}
                </div>
                <div className="form-actions">
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => copyRfq(rfq)}>
                    本文をコピー
                  </button>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => downloadRfq(rfq)}>
                    .mdでダウンロード
                  </button>
                  {rfq.status !== 'SENT' && (
                    <>
                      <label className="form-field" style={{ margin: 0 }}>
                        <span className="sr-only">送信チャネル</span>
                        <select
                          className="select-input"
                          style={{ width: 'auto' }}
                          value={sentChannel}
                          onChange={(e) => setSentChannel(e.target.value as 'WeChat' | 'メール')}
                        >
                          <option value="WeChat">WeChat</option>
                          <option value="メール">メール</option>
                        </select>
                      </label>
                      <button type="button" className="btn btn-primary btn-sm" onClick={() => markRfqSent(rfq)} disabled={rfqBusy}>
                        送信済みにする
                      </button>
                    </>
                  )}
                </div>
              </>
            )}
          </div>
        ))}
      </div>

      {/* ---- 見積入力 ---- */}
      <div className="card case-section">
        <h3>工場見積の入力（版として記録）</h3>
        <p className="sub">
          工場からの回答を入力します。同じ工場の再見積は上書きせず、新しい版として記録されます。
          この内容はお客様には表示されません。
        </p>

        {rfqs.length === 0 ? (
          <div className="empty-note" style={{ padding: '8px 0' }}>
            先に見積依頼（RFQ）を作成・送信してください。
          </div>
        ) : (
          <>
            <div className="form-grid">
              <div className="form-field">
                <label htmlFor="q-rfq">対象のRFQ</label>
                <select id="q-rfq" className="select-input" value={qRfqId} onChange={(e) => setQRfqId(Number(e.target.value))}>
                  {rfqs.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.publicId || `RFQ-${r.id}`}
                      {r.status === 'SENT' ? '（送信済み）' : '（未送信）'}
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-field">
                <label htmlFor="q-factory">工場（必須）</label>
                <select
                  id="q-factory"
                  className="select-input"
                  value={qFactoryId}
                  onChange={(e) => setQFactoryId(e.target.value === '' ? '' : Number(e.target.value))}
                >
                  <option value="">選択してください</option>
                  {factories?.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.name}（{f.publicId}）
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-field">
                <label htmlFor="q-currency">通貨</label>
                <select id="q-currency" className="select-input" value={qCurrency} onChange={(e) => setQCurrency(e.target.value as QuoteCurrency)}>
                  <option value="CNY">CNY（人民元）</option>
                  <option value="JPY">JPY（日本円）</option>
                  <option value="USD">USD（米ドル）</option>
                </select>
              </div>
              <div className="form-field">
                <label htmlFor="q-price">単価（必須）</label>
                <input id="q-price" className="text-input num" type="number" min="0" step="0.01" value={qUnitPrice} onChange={(e) => setQUnitPrice(e.target.value)} placeholder="例）6.80" />
              </div>
              <div className="form-field">
                <label htmlFor="q-moq">MOQ（最低生産数量・必須）</label>
                <input id="q-moq" className="text-input num" type="number" min="0" value={qMoq} onChange={(e) => setQMoq(e.target.value)} placeholder="例）1000" />
              </div>
              <div className="form-field">
                <label htmlFor="q-tooling">金型費</label>
                <input id="q-tooling" className="text-input num" type="number" min="0" value={qTooling} onChange={(e) => setQTooling(e.target.value)} placeholder="任意" />
              </div>
              <div className="form-field">
                <label htmlFor="q-sample">サンプル費</label>
                <input id="q-sample" className="text-input num" type="number" min="0" value={qSample} onChange={(e) => setQSample(e.target.value)} placeholder="任意" />
              </div>
              <div className="form-field">
                <label htmlFor="q-lead">納期（日数・必須）</label>
                <input id="q-lead" className="text-input num" type="number" min="0" value={qLeadDays} onChange={(e) => setQLeadDays(e.target.value)} placeholder="例）45" />
              </div>
              <div className="form-field">
                <label htmlFor="q-valid">見積の有効期限</label>
                <input id="q-valid" className="text-input" type="date" value={qValidUntil} onChange={(e) => setQValidUntil(e.target.value)} />
              </div>
            </div>

            <div className="form-field" style={{ marginTop: 14 }}>
              <label htmlFor="q-notes">備考</label>
              <input id="q-notes" className="text-input" value={qNotes} onChange={(e) => setQNotes(e.target.value)} placeholder="例）色は3色まで同価格。パッケージ別途" />
            </div>

            <div style={{ marginTop: 14 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--sub)' }}>
                条件行（数量別単価・金型条件など）
              </div>
              {conds.map((c) => (
                <div className="cond-row" key={c._id}>
                  <select
                    className="select-input"
                    aria-label="条件の種類"
                    value={c.conditionType}
                    onChange={(e) => updateCond(c._id, { conditionType: e.target.value as QuoteConditionType })}
                  >
                    {COND_TYPES.map((t) => (
                      <option key={t.value} value={t.value}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                  <input
                    className="text-input num"
                    type="number"
                    min="0"
                    aria-label="しきい数量"
                    placeholder="数量"
                    value={c.thresholdQty}
                    onChange={(e) => updateCond(c._id, { thresholdQty: e.target.value })}
                  />
                  <input
                    className="text-input"
                    aria-label="条件の内容"
                    placeholder="例）3000個以上で単価6.2元"
                    value={c.value}
                    onChange={(e) => updateCond(c._id, { value: e.target.value })}
                  />
                  <input
                    className="text-input"
                    aria-label="条件のメモ"
                    placeholder="メモ（任意）"
                    value={c.note}
                    onChange={(e) => updateCond(c._id, { note: e.target.value })}
                  />
                  <button
                    type="button"
                    className="cond-remove"
                    aria-label="この条件行を削除"
                    onClick={() => removeCond(c._id)}
                  >
                    &#215;
                  </button>
                </div>
              ))}
              <div className="form-actions" style={{ marginTop: 10 }}>
                <button type="button" className="btn btn-ghost btn-sm" onClick={addCond}>
                  ＋ 条件行を追加
                </button>
                <button type="button" className="btn btn-primary btn-sm" onClick={submitQuote} disabled={quoteBusy}>
                  {quoteBusy ? '登録しています…' : '見積を版として登録'}
                </button>
              </div>
            </div>
          </>
        )}

        {quotes.length > 0 && (
          <div className="quote-table-wrap">
            <table className="quote-table">
              <thead>
                <tr>
                  <th>見積番号</th>
                  <th>工場</th>
                  <th>版</th>
                  <th>単価</th>
                  <th>MOQ</th>
                  <th>金型費</th>
                  <th>納期</th>
                  <th>有効期限</th>
                </tr>
              </thead>
              <tbody>
                {quotes.map((q) => (
                  <tr key={q.id}>
                    <td className="num">{q.publicId}</td>
                    <td>{q.factoryName || `#${q.factoryId}`}</td>
                    <td className="num">v{q.versionNo}</td>
                    <td className="num">
                      {q.currency} {q.unitPrice.toLocaleString()}
                    </td>
                    <td className="num">{q.moq.toLocaleString()}</td>
                    <td className="num">{q.toolingCost ? q.toolingCost.toLocaleString() : '—'}</td>
                    <td className="num">{q.leadDays}日</td>
                    <td className="num">{q.validUntil ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ---- Loop: 条件分析 → Option編集 → 承認 ---- */}
      <div className="card case-section">
        <h3>選べる進め方(お客様向けOption)の作成</h3>
        <p className="sub">
          お客様の選択・数量希望と、登録済みの工場見積を突き合わせて分析し、
          お客様向けの進め方（2〜3案）を作成します。価格は係数によるレンジ表示で、
          公開前にここで編集できます。工場名・原価・内部メモはお客様には公開されません。
        </p>

        {modifyLoop && (
          <div className="modify-note-box">
            <strong>お客様から条件変更のご希望が届いています。</strong>
            {modifyLoop.modifyNote && (
              <>
                <br />「{modifyLoop.modifyNote}」
              </>
            )}
            <br />
            下の「条件を分析して提案を作る」で再分析すると、次のOption案（2周目）が作成されます。
          </div>
        )}

        {!pendingLoop && (
          <div className="form-actions">
            <button type="button" className="btn btn-primary btn-sm" onClick={analyzeLoop} disabled={loopBusy}>
              {loopBusy ? '分析しています…' : '条件を分析して提案を作る'}
            </button>
            {quotes.length === 0 && (
              <span className="row-sub" style={{ margin: 0 }}>
                見積が未登録の場合は分析できません。
              </span>
            )}
          </div>
        )}

        {pendingLoop && (
          <div style={{ marginTop: 4 }}>
            <div className="sec-title" style={{ margin: '10px 0 6px' }}>
              <span className="num">{pendingLoop.publicId}</span>
              <span className="chip-state st-warn">承認待ち</span>
              <span className="hint">お客様にはまだ公開されていません</span>
            </div>

            {pendingLoop.feasibility != null && (
              <details>
                <summary style={{ fontSize: 12.5, color: 'var(--sub)', cursor: 'pointer' }}>
                  分析結果（ご希望と工場回答の差分）を見る
                </summary>
                <div className="feas-box">{JSON.stringify(pendingLoop.feasibility, null, 2)}</div>
              </details>
            )}

            {editOpts.map((o) => (
              <div className="opt-edit" key={o.key}>
                <div className="opt-head">
                  <span className="key num">{o.key}</span>
                  <input
                    className="text-input"
                    style={{ maxWidth: 260, fontWeight: 600 }}
                    aria-label="案の名前"
                    value={o.title}
                    onChange={(e) => updateOpt(o.key, { title: e.target.value })}
                  />
                  <label style={{ fontSize: 12, display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                    <input
                      type="radio"
                      name="loop-recommended"
                      checked={o.recommended}
                      onChange={() =>
                        setEditOpts((cur) => cur.map((x) => ({ ...x, recommended: x.key === o.key })))
                      }
                    />
                    おすすめ表示
                  </label>
                </div>
                <div className="opt-grid">
                  <div className="form-field">
                    <label>価格レンジ（お客様向け表示）</label>
                    <input
                      className="text-input"
                      value={o.customerPriceRange}
                      onChange={(e) => updateOpt(o.key, { customerPriceRange: e.target.value })}
                      placeholder="例）¥980〜1,180"
                    />
                  </div>
                  <div className="form-field">
                    <label>数量目安</label>
                    <input
                      className="text-input"
                      value={o.qtyFrom}
                      onChange={(e) => updateOpt(o.key, { qtyFrom: e.target.value })}
                      placeholder="例）1,000個〜"
                    />
                  </div>
                  <div className="form-field">
                    <label>お届け目安</label>
                    <input
                      className="text-input"
                      value={o.leadDays}
                      onChange={(e) => updateOpt(o.key, { leadDays: e.target.value })}
                      placeholder="例）約60日"
                    />
                  </div>
                </div>
                <div className="form-field" style={{ marginTop: 10 }}>
                  <label>ひとこと（コンセプト）</label>
                  <input
                    className="text-input"
                    value={o.concept}
                    onChange={(e) => updateOpt(o.key, { concept: e.target.value })}
                  />
                </div>
                <div className="form-field" style={{ marginTop: 10 }}>
                  <label>ご注意いただく点（トレードオフ）</label>
                  <input
                    className="text-input"
                    value={o.tradeoff}
                    onChange={(e) => updateOpt(o.key, { tradeoff: e.target.value })}
                  />
                </div>
                {(o.internalNote || o.basedOnQuoteId != null) && (
                  <div className="opt-internal">
                    <span className="badge-internal">社内のみ表示</span>{' '}
                    {o.basedOnQuoteId != null && <>根拠見積: #{o.basedOnQuoteId}　</>}
                    {o.internalNote}
                  </div>
                )}
              </div>
            ))}

            <div className="form-actions">
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => saveOnly(pendingLoop)} disabled={loopBusy}>
                編集を保存
              </button>
              <button type="button" className="btn btn-primary btn-sm" onClick={() => approveLoop(pendingLoop)} disabled={loopBusy}>
                {loopBusy ? '送信しています…' : '承認して顧客へ公開'}
              </button>
            </div>
          </div>
        )}

        {loops.filter((l) => l.status !== 'PENDING_APPROVAL').length > 0 && (
          <div style={{ marginTop: 16 }}>
            <div className="sec-title" style={{ margin: '0 0 6px' }}>
              これまでのLoop
            </div>
            {loops
              .filter((l) => l.status !== 'PENDING_APPROVAL')
              .map((l) => (
                <div className="state-line" key={l.id}>
                  <span className="k num">{l.publicId}</span>
                  <span>
                    {l.status === 'APPROVED' && !l.customerDecision && (
                      <span className="chip-state st-stage">お客様の選択待ち</span>
                    )}
                    {l.customerDecision === 'ACCEPT' && (
                      <span className="chip-state st-ok">
                        確定{l.decidedAt ? `（${fmtDate(l.decidedAt)}）` : ''}
                      </span>
                    )}
                    {l.customerDecision === 'MODIFY' && (
                      <span className="chip-state st-warn">条件変更のご希望あり</span>
                    )}
                    {l.customerDecision === 'HOLD' && (
                      <span className="chip-state st-plain">保留</span>
                    )}
                  </span>
                </div>
              ))}
          </div>
        )}
      </div>

      <Toast msg={toastMsg} show={toastShow} />
    </section>
  );
}

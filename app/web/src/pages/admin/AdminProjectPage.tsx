import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api, downloadText } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { SourceChip, Toast, formatBytes, useToast } from '../../components/ui';
import type {
  AdminActionResponse,
  CreateFactoryRequest,
  CreateQuoteRequest,
  FactoriesResponse,
  FactoryView,
  LoopActionResponse,
  LoopOptionStaffView,
  LoopStaffView,
  QuoteConditionType,
  QuoteCurrency,
  RfqSentResponse,
  RfqView,
} from '../../types';
import type {
  AgreementView,
  CreateAgreementResponse,
  DocumentView,
  DocumentVisibility,
  DocumentsResponse,
  LimitSampleLabel,
  ProjectViewStaffV3,
  VagueCheckResponse,
  VagueFinding,
} from '../../types-bi3';

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

/* BI-3: 量産合意書ステータスの表示 */
const AG_STATUS: Record<string, { label: string; cls: string }> = {
  DRAFT: { label: '下書き', cls: 'st-plain' },
  PENDING_CUSTOMER: { label: 'お客様の確認待ち', cls: 'st-warn' },
  AGREED: { label: '合意済み', cls: 'st-ok' },
  SUPERSEDED: { label: '旧版', cls: 'st-plain' },
};

export default function AdminProjectPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { setAiMode } = useAuth();
  const [toastMsg, toastShow, toast] = useToast();

  const [project, setProject] = useState<ProjectViewStaffV3 | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [factories, setFactories] = useState<FactoryView[] | null>(null);
  const [factoriesError, setFactoriesError] = useState<string | null>(null);

  const loadProject = useCallback(async () => {
    try {
      const pj = await api.get<ProjectViewStaffV3>(`/projects/${id}`);
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

  /* ---- BI-3: 価格レンジ直接編集 + 金額非表示モード（P-17） ---- */
  const [optPrices, setOptPrices] = useState<Record<string, string>>({});
  const [pricesDirty, setPricesDirty] = useState(false);
  const [hidePrices, setHidePrices] = useState(false);
  const [hideDirty, setHideDirty] = useState(false);

  useEffect(() => {
    if (!proposal) return;
    const m: Record<string, string> = {};
    for (const o of proposal.options) m[o.key] = o.priceRangeJpy ?? '';
    setOptPrices(m);
    setPricesDirty(false);
    setHidePrices(Boolean(project?.hideInitialPrices));
    setHideDirty(false);
    // proposal は loadProject のたびに新しいオブジェクトになるが、
    // 再取得（承認・修正後）時に編集内容をサーバー値へ揃え直すのは意図どおり
  }, [proposal, project?.hideInitialPrices]);

  async function approveProposal() {
    if (!proposal || busy) return;
    setBusy(true);
    try {
      /* BI-3: 編集した場合のみ新エンドポイントを呼ぶ（旧バックエンドでは既存フローに影響しない） */
      if (pricesDirty) {
        await api.patch(`/admin/proposals/${proposal.id}/options`, {
          options: proposal.options.map((o) => ({
            key: o.key,
            priceRangeJpy: optPrices[o.key] ?? o.priceRangeJpy,
          })),
        });
      }
      if (hideDirty) {
        await api.post(`/admin/projects/${id}/pricing-mode`, {
          hideInitialPrices: hidePrices,
        });
      }
      await api.post<AdminActionResponse>(`/admin/proposals/${proposal.id}/approve`, {});
      toast(
        hidePrices
          ? '提案を承認しました。金額は表示せずお客様の画面に公開されます。'
          : '提案を承認しました。お客様の画面に公開されます。',
      );
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

  /* ---------------- BI-3: 資料（documents） ---------------- */
  const [docs, setDocs] = useState<DocumentView[] | null>(null);
  const [docsAvailable, setDocsAvailable] = useState(true);
  const [dFile, setDFile] = useState<File | null>(null);
  const [dTitle, setDTitle] = useState('');
  const [dVisibility, setDVisibility] = useState<DocumentVisibility>('INTERNAL');
  const [dBusy, setDBusy] = useState(false);

  const loadDocs = useCallback(async () => {
    try {
      const res = await api.get<DocumentsResponse | DocumentView[]>(
        `/projects/${id}/documents`,
      );
      setDocs(Array.isArray(res) ? res : (res.items ?? []));
      setDocsAvailable(true);
    } catch {
      /* 旧バックエンド（未対応）ではセクションごと非表示 */
      setDocs([]);
      setDocsAvailable(false);
    }
  }, [id]);

  useEffect(() => {
    void loadDocs();
  }, [loadDocs]);

  async function uploadDoc() {
    if (dBusy) return;
    if (!dFile) {
      toast('アップロードするファイルを選んでください。');
      return;
    }
    if (dFile.size > 15 * 1024 * 1024) {
      toast('15MB以下のファイルをご指定ください。');
      return;
    }
    setDBusy(true);
    try {
      const fd = new FormData();
      fd.append('file', dFile);
      if (dTitle.trim()) fd.append('title', dTitle.trim());
      fd.append('visibility', dVisibility);
      await api.postForm(`/projects/${id}/documents`, fd);
      toast(
        dVisibility === 'INTERNAL'
          ? '資料を登録しました（社内のみ表示）。'
          : '資料を登録しました（お客様にも表示されます）。',
      );
      setDFile(null);
      setDTitle('');
      await loadDocs();
    } catch (e) {
      toast(e instanceof Error ? e.message : '資料の登録に失敗しました。');
    } finally {
      setDBusy(false);
    }
  }

  /* ---------------- BI-3: 30秒記録（タイムラインへのメモ） ---------------- */
  const [noteText, setNoteText] = useState('');
  const [noteBusy, setNoteBusy] = useState(false);
  const [sessionNotes, setSessionNotes] = useState<{ text: string; at: string }[]>([]);

  async function addNote() {
    if (noteBusy) return;
    const t = noteText.trim();
    if (!t) {
      toast('記録する内容をご入力ください。');
      return;
    }
    setNoteBusy(true);
    try {
      await api.post(`/admin/projects/${id}/note`, { text: t });
      setSessionNotes((cur) => [{ text: t, at: new Date().toISOString() }, ...cur]);
      setNoteText('');
      toast('タイムラインに記録しました。');
    } catch (e) {
      toast(e instanceof Error ? e.message : '記録に失敗しました。');
    } finally {
      setNoteBusy(false);
    }
  }

  /* ---------------- BI-3: 量産合意書（G-02） ---------------- */
  const [agreement, setAgreement] = useState<AgreementView | null>(null);
  const [agBusy, setAgBusy] = useState(false);
  const [findings, setFindings] = useState<VagueFinding[]>([]);

  /* project 再取得時はサーバー側の合意書を正とする（SUPERSEDED以外の最新） */
  useEffect(() => {
    if (!project) return;
    const list =
      project.agreements ?? (project.agreement ? [project.agreement] : []);
    const active = list.find((a) => a.status !== 'SUPERSEDED') ?? list[0] ?? null;
    if (active) setAgreement(active);
  }, [project]);

  /* 編集用ドラフト（DRAFTのみ編集可） */
  interface ChkRow {
    _id: number;
    name: string;
    criteriaJa: string;
    criteriaZh: string;
    method: string;
  }
  const [chk, setChk] = useState<ChkRow[]>([]);
  const chkSeq = useRef(1);
  const [limits, setLimits] = useState<
    { docId: number; label: LimitSampleLabel; note: string }[]
  >([]);
  const [limitDocId, setLimitDocId] = useState<number | ''>('');
  const [limitLabel, setLimitLabel] = useState<LimitSampleLabel>('OK_LIMIT');
  const [limitNote, setLimitNote] = useState('');
  const [sampleDocId, setSampleDocId] = useState<number | ''>('');
  const [tolRate, setTolRate] = useState('');
  const [tolSpare, setTolSpare] = useState('');
  const [tolNote, setTolNote] = useState('');
  const [respPass, setRespPass] = useState('');
  const [respMarket, setRespMarket] = useState('');
  const [respComp, setRespComp] = useState('');

  useEffect(() => {
    if (!agreement) return;
    setChk(
      (agreement.checkItems ?? []).map((c) => ({
        _id: chkSeq.current++,
        name: c.name ?? '',
        criteriaJa: c.criteriaJa ?? '',
        criteriaZh: c.criteriaZh ?? '',
        method: c.method ?? '',
      })),
    );
    setLimits(
      (agreement.limitSamples ?? []).map((s) => ({
        docId: s.docId,
        label: s.label,
        note: s.note ?? '',
      })),
    );
    const tol = agreement.tolerance ?? agreement.toleranceJson;
    setTolRate(tol?.defectRatePct != null ? String(tol.defectRatePct) : '');
    setTolSpare(tol?.spareQty != null ? String(tol.spareQty) : '');
    setTolNote(tol?.note ?? '');
    const resp = agreement.responsibility ?? agreement.responsibilityJson;
    setRespPass(resp?.inspectionPass ?? '');
    setRespMarket(resp?.marketDefect ?? '');
    setRespComp(resp?.compensation ?? '');
    setSampleDocId(agreement.approvedSampleDocId ?? '');
    setFindings([]);
  }, [agreement]);

  function agreementPatchBody() {
    return {
      checkItems: chk.map((c) => ({
        name: c.name.trim(),
        criteriaJa: c.criteriaJa.trim(),
        criteriaZh: c.criteriaZh.trim(),
        method: c.method.trim(),
      })),
      limitSamples: limits.map((s) => ({
        docId: s.docId,
        label: s.label,
        ...(s.note.trim() ? { note: s.note.trim() } : {}),
      })),
      toleranceJson: {
        defectRatePct: tolRate.trim() === '' ? null : Number(tolRate),
        spareQty: tolSpare.trim() === '' ? null : Number(tolSpare),
        note: tolNote.trim(),
      },
      responsibilityJson: {
        inspectionPass: respPass.trim(),
        marketDefect: respMarket.trim(),
        compensation: respComp.trim(),
      },
      approvedSampleDocId: sampleDocId === '' ? null : Number(sampleDocId),
    };
  }

  async function createAgreement() {
    if (agBusy) return;
    setAgBusy(true);
    try {
      const res = await api.post<CreateAgreementResponse>(
        `/admin/projects/${id}/agreement`,
        {},
      );
      if (res.aiMode) setAiMode(res.aiMode);
      setAgreement(res.agreement);
      toast('AIが下書きを作成しました。チェック項目を確認・編集してください。');
    } catch (e) {
      toast(e instanceof Error ? e.message : '下書きの作成に失敗しました。');
    } finally {
      setAgBusy(false);
    }
  }

  async function saveAgreement(silent = false): Promise<boolean> {
    if (!agreement) return false;
    try {
      await api.patch(`/admin/agreements/${agreement.id}`, agreementPatchBody());
      if (!silent) toast('量産合意書を保存しました。');
      return true;
    } catch (e) {
      toast(e instanceof Error ? e.message : '保存に失敗しました。');
      return false;
    }
  }

  async function saveAgreementOnly() {
    if (agBusy) return;
    setAgBusy(true);
    try {
      await saveAgreement();
    } finally {
      setAgBusy(false);
    }
  }

  async function vagueCheck() {
    if (!agreement || agBusy) return;
    setAgBusy(true);
    try {
      /* 最新の編集内容に対してチェックするため先に保存 */
      const saved = await saveAgreement(true);
      if (!saved) return;
      const res = await api.post<VagueCheckResponse>(
        `/admin/agreements/${agreement.id}/vague-check`,
        {},
      );
      if (res.aiMode) setAiMode(res.aiMode);
      const fs = res.findings ?? [];
      setFindings(fs);
      toast(
        fs.length === 0
          ? '曖昧語（測れない表現）は見つかりませんでした。'
          : `曖昧語を${fs.length}件検出しました。各項目の下の修正案をご確認ください。`,
      );
    } catch (e) {
      toast(e instanceof Error ? e.message : '曖昧語チェックに失敗しました。');
    } finally {
      setAgBusy(false);
    }
  }

  function applySuggestion(f: VagueFinding) {
    setChk((cur) =>
      cur.map((c, i) => (i === f.itemIndex ? { ...c, criteriaJa: f.suggestion } : c)),
    );
    setFindings((cur) => cur.filter((x) => x !== f));
  }

  function addChkRow() {
    if (chk.length >= 7) {
      toast('チェック項目は7件までです。');
      return;
    }
    setChk((cur) => [
      ...cur,
      { _id: chkSeq.current++, name: '', criteriaJa: '', criteriaZh: '', method: '' },
    ]);
  }
  function removeChkRow(rid: number) {
    setChk((cur) => cur.filter((c) => c._id !== rid));
    setFindings([]);
  }
  function updateChkRow(rid: number, patch: Partial<ChkRow>) {
    setChk((cur) => cur.map((c) => (c._id === rid ? { ...c, ...patch } : c)));
  }

  function addLimit() {
    if (limitDocId === '') {
      toast('限度見本にする資料（写真）を選んでください。');
      return;
    }
    setLimits((cur) => [
      ...cur,
      { docId: Number(limitDocId), label: limitLabel, note: limitNote.trim() },
    ]);
    setLimitDocId('');
    setLimitNote('');
  }
  function removeLimit(idx: number) {
    setLimits((cur) => cur.filter((_, i) => i !== idx));
  }

  async function sendAgreement() {
    if (!agreement || agBusy) return;
    if (chk.length < 3 || chk.length > 7) {
      toast('チェック項目は3〜7件にしてください。');
      return;
    }
    if (chk.some((c) => !c.name.trim() || !c.criteriaJa.trim())) {
      toast('各チェック項目の「項目名」と「基準（日本語）」をご入力ください。');
      return;
    }
    setAgBusy(true);
    try {
      const saved = await saveAgreement(true);
      if (!saved) return;
      await api.post(`/admin/agreements/${agreement.id}/send`, {});
      toast('お客様へ送りました。中文版（工場向け）も同時に生成されています。');
      await loadProject();
    } catch (e) {
      toast(e instanceof Error ? e.message : '送信に失敗しました。');
    } finally {
      setAgBusy(false);
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
    /* BI-3: 量産合意書の進み具合を優先して反映 */
    if (agreement?.status === 'AGREED') return 4; // 生産
    if (agreement) return 3; // サンプル（合意書の作成・確認中）
    if (loops.length > 0 || quotes.length > 0 || rfqs.length > 0) return 2; // 工場確認
    const st = project.proposal.state;
    if (st === 'none' || st === 'PENDING_APPROVAL' || st === 'REVISION_REQUESTED') return 0;
    return 1; // 提案
  }, [project, agreement, loops.length, quotes.length, rfqs.length]);

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
              {/* BI-3: 価格レンジ直接編集（PATCH /admin/proposals/:id/options） */}
              <div className="form-field" style={{ marginTop: 8, maxWidth: 280 }}>
                <label htmlFor={`opt-price-${p.key}`}>
                  価格レンジ（お客様向け表示・編集可）
                </label>
                <input
                  id={`opt-price-${p.key}`}
                  className="text-input"
                  value={optPrices[p.key] ?? ''}
                  onChange={(e) => {
                    setOptPrices((cur) => ({ ...cur, [p.key]: e.target.value }));
                    setPricesDirty(true);
                  }}
                  placeholder="例）¥980〜1,180"
                />
              </div>
            </div>
          ))}

          {/* BI-3: 金額非表示モード（案件単位・P-17） */}
          <label className="hide-price-toggle">
            <input
              type="checkbox"
              checked={hidePrices}
              onChange={(e) => {
                setHidePrices(e.target.checked);
                setHideDirty(true);
              }}
            />
            <span>
              金額を出さずに公開（お客様の画面には「概算金額は、工場確認のうえ担当者からご提示します」と表示されます）
            </span>
          </label>

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

      {/* ---- BI-3: 資料（アップロード共有） ---- */}
      {docsAvailable && (
        <div className="card case-section">
          <h3>資料（画像・図面・ファイル）</h3>
          <p className="sub">
            お客様からの参考資料と社内資料をここで管理します。
            「社内のみ表示」の資料は、お客様の画面・APIには一切表示されません。上限15MB。
          </p>

          <div className="doc-list">
            {docs !== null && docs.length === 0 && (
              <div className="empty-note" style={{ padding: '6px 0' }}>
                まだ資料がありません。
              </div>
            )}
            {docs?.map((d) => (
              <div className="doc-row" key={d.id}>
                <a
                  className="doc-thumb"
                  href={`/api/documents/${d.id}/file`}
                  target="_blank"
                  rel="noreferrer"
                  aria-label={`${d.title || d.fileName || `資料 #${d.id}`} を開く`}
                >
                  {d.mimeType?.startsWith('image/') ? (
                    <img src={`/api/documents/${d.id}/file`} alt="" />
                  ) : (
                    <svg
                      width="18"
                      height="18"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
                      <path d="M14 2v6h6" />
                    </svg>
                  )}
                </a>
                <span className="doc-main">
                  <span className="doc-name">
                    {d.title || d.fileName || `資料 #${d.id}`}
                  </span>
                  <span className="doc-meta">
                    {[
                      formatBytes(d.sizeBytes),
                      d.uploadedByName ??
                        (d.source === 'CLIENT' ? 'お客様' : '社内'),
                      fmtDate(d.createdAt),
                    ]
                      .filter(Boolean)
                      .join(' ・ ')}
                  </span>
                </span>
                {d.visibility === 'CLIENT_VISIBLE' ? (
                  <span className="chip-state st-stage">お客様にも表示</span>
                ) : (
                  <span className="badge-internal">社内のみ表示</span>
                )}
                <a
                  className="btn btn-ghost btn-sm"
                  href={`/api/documents/${d.id}/file`}
                  download
                >
                  ダウンロード
                </a>
              </div>
            ))}
          </div>

          <div className="form-grid" style={{ marginTop: 14 }}>
            <div className="form-field">
              <label htmlFor="doc-file">ファイル</label>
              <input
                id="doc-file"
                className="text-input"
                type="file"
                accept="image/*,.pdf,.xlsx,.xls,.csv,.docx,.doc,.zip"
                onChange={(e) => setDFile(e.target.files?.[0] ?? null)}
              />
            </div>
            <div className="form-field">
              <label htmlFor="doc-title">タイトル（任意）</label>
              <input
                id="doc-title"
                className="text-input"
                value={dTitle}
                onChange={(e) => setDTitle(e.target.value)}
                placeholder="例）ロゴ入稿データ"
              />
            </div>
            <div className="form-field">
              <label htmlFor="doc-vis">公開範囲</label>
              <select
                id="doc-vis"
                className="select-input"
                value={dVisibility}
                onChange={(e) => setDVisibility(e.target.value as DocumentVisibility)}
              >
                <option value="INTERNAL">社内のみ</option>
                <option value="CLIENT_VISIBLE">お客様にも表示</option>
              </select>
            </div>
          </div>
          <div className="form-actions">
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={uploadDoc}
              disabled={dBusy}
            >
              {dBusy ? 'アップロードしています…' : 'アップロード'}
            </button>
          </div>
        </div>
      )}

      {/* ---- BI-3: 30秒記録 ---- */}
      <div className="card case-section">
        <h3>30秒記録（タイムラインへのメモ）</h3>
        <p className="sub">
          電話・WeChatのやりとりなどを一言で記録します。案件のタイムラインに残り、
          お客様には表示されません。添付が必要な場合は上の資料からどうぞ。
        </p>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <input
            className="text-input"
            style={{ flex: 1, minWidth: 220 }}
            value={noteText}
            onChange={(e) => setNoteText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                void addNote();
              }
            }}
            placeholder="例）工場に電話。金型は既存流用でOK、来週サンプル発送とのこと"
            aria-label="30秒記録の内容"
          />
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={addNote}
            disabled={noteBusy}
          >
            {noteBusy ? '記録しています…' : '記録'}
          </button>
        </div>
        {sessionNotes.length > 0 && (
          <div style={{ marginTop: 12 }}>
            {sessionNotes.map((n, i) => (
              <div className="state-line" key={i}>
                <span className="k num">{fmtDate(n.at)}</span>
                <span style={{ whiteSpace: 'pre-wrap' }}>{n.text}</span>
              </div>
            ))}
          </div>
        )}
      </div>

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

      {/* ---- BI-3: 量産合意書（G-02） ---- */}
      <div className="card case-section">
        <h3>量産合意書（量産で守る品質基準のとりきめ・G-02）</h3>
        <p className="sub">
          サンプル承認後、量産前に品質基準をお客様と合意します。AIが仕様から測れる基準の
          下書きを作り、曖昧語（「綺麗」「しっかり」など測れない表現）をチェックできます。
          「顧客へ送る」で中文版（工場向け・顧客名や販売価格は含まれません）も生成されます。
        </p>

        {!agreement ? (
          <div className="form-actions" style={{ marginTop: 4 }}>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={createAgreement}
              disabled={agBusy}
            >
              {agBusy ? '作成しています…' : 'AIで下書き作成'}
            </button>
            <span className="row-sub" style={{ margin: 0 }}>
              理解済みの仕様から、チェック項目（3〜7件）を下書きします。
            </span>
          </div>
        ) : (
          <>
            <div className="sec-title" style={{ margin: '10px 0 6px' }}>
              {agreement.publicId && <span className="num">{agreement.publicId}</span>}
              <span
                className={`chip-state ${(AG_STATUS[agreement.status] ?? AG_STATUS.DRAFT).cls}`}
              >
                {(AG_STATUS[agreement.status] ?? { label: agreement.status }).label}
              </span>
              <a
                className="hint"
                href={`/api/admin/agreements/${agreement.id}/export.md`}
                download
                style={{ textDecoration: 'underline', textUnderlineOffset: 3 }}
              >
                .mdをダウンロード（日中併記・WeChat転送用）
              </a>
            </div>

            {agreement.customerNote && (
              <div className="modify-note-box">
                <strong>お客様から修正のご希望が届いています。</strong>
                <br />「{agreement.customerNote}」
                <br />
                内容を修正して、あらためて「顧客へ送る」を押してください。
              </div>
            )}

            {agreement.status === 'DRAFT' ? (
              <>
                {/* ---- チェック項目編集 ---- */}
                <div
                  style={{ fontSize: 12, fontWeight: 600, color: 'var(--sub)', marginTop: 12 }}
                >
                  チェック項目（3〜7件・測れる文で）
                </div>
                <div className="chk-table-wrap">
                  <table className="chk-table">
                    <thead>
                      <tr>
                        <th>#</th>
                        <th>項目名</th>
                        <th>基準（日本語・測れる文）</th>
                        <th>基準（中文・工場向け）</th>
                        <th>確認方法</th>
                        <th aria-label="操作" />
                      </tr>
                    </thead>
                    <tbody>
                      {chk.map((c, i) => (
                        <Fragment key={c._id}>
                          <tr>
                            <td className="num">{i + 1}</td>
                            <td>
                              <input
                                className="text-input"
                                aria-label={`項目${i + 1}の名前`}
                                value={c.name}
                                onChange={(e) => updateChkRow(c._id, { name: e.target.value })}
                                placeholder="例）ロゴ印刷"
                              />
                            </td>
                            <td>
                              <input
                                className="text-input"
                                aria-label={`項目${i + 1}の基準（日本語）`}
                                value={c.criteriaJa}
                                onChange={(e) =>
                                  updateChkRow(c._id, { criteriaJa: e.target.value })
                                }
                                placeholder="例）位置ズレ±1mm以内、かすれ無し"
                              />
                            </td>
                            <td>
                              <input
                                className="text-input"
                                lang="zh-CN"
                                aria-label={`項目${i + 1}の基準（中文）`}
                                value={c.criteriaZh}
                                onChange={(e) =>
                                  updateChkRow(c._id, { criteriaZh: e.target.value })
                                }
                                placeholder="例）位置偏差±1mm内，无掉色"
                              />
                            </td>
                            <td>
                              <input
                                className="text-input"
                                aria-label={`項目${i + 1}の確認方法`}
                                value={c.method}
                                onChange={(e) =>
                                  updateChkRow(c._id, { method: e.target.value })
                                }
                                placeholder="例）全数目視"
                              />
                            </td>
                            <td>
                              <button
                                type="button"
                                className="cond-remove"
                                aria-label={`項目${i + 1}を削除`}
                                onClick={() => removeChkRow(c._id)}
                              >
                                &#215;
                              </button>
                            </td>
                          </tr>
                          {findings
                            .filter((f) => f.itemIndex === i)
                            .map((f, fi) => (
                              <tr key={`f-${fi}`}>
                                <td />
                                <td colSpan={5}>
                                  <div className="vague-box">
                                    <span className="chip-state st-warn">曖昧語</span>{' '}
                                    「{f.phrase}」は測りにくい表現です。
                                    <div className="vague-suggest">修正案: {f.suggestion}</div>
                                    <button
                                      type="button"
                                      className="btn btn-ghost btn-sm"
                                      style={{ marginTop: 6 }}
                                      onClick={() => applySuggestion(f)}
                                    >
                                      置き換える
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            ))}
                        </Fragment>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="form-actions" style={{ marginTop: 10 }}>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={addChkRow}>
                    ＋ 項目を追加
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={vagueCheck}
                    disabled={agBusy}
                  >
                    {agBusy ? '確認しています…' : '曖昧語をチェック'}
                  </button>
                  <span className="row-sub" style={{ margin: 0 }}>
                    現在 {chk.length} 件（3〜7件）
                  </span>
                </div>

                {/* ---- 承認サンプル / 限度見本 ---- */}
                <div className="form-grid" style={{ marginTop: 16 }}>
                  <div className="form-field">
                    <label htmlFor="ag-sample">承認サンプル写真（資料から選択）</label>
                    <select
                      id="ag-sample"
                      className="select-input"
                      value={sampleDocId}
                      onChange={(e) =>
                        setSampleDocId(e.target.value === '' ? '' : Number(e.target.value))
                      }
                    >
                      <option value="">未設定</option>
                      {(docs ?? [])
                        .filter((d) => d.mimeType?.startsWith('image/'))
                        .map((d) => (
                          <option key={d.id} value={d.id}>
                            {d.title || d.fileName || `資料 #${d.id}`}
                          </option>
                        ))}
                    </select>
                  </div>
                </div>
                {sampleDocId !== '' && (
                  <img
                    src={`/api/documents/${sampleDocId}/file`}
                    alt="承認サンプルのプレビュー"
                    style={{
                      maxWidth: 220,
                      maxHeight: 160,
                      borderRadius: 10,
                      border: '1px solid var(--border)',
                      marginTop: 8,
                      display: 'block',
                    }}
                  />
                )}

                <div
                  style={{ fontSize: 12, fontWeight: 600, color: 'var(--sub)', marginTop: 16 }}
                >
                  限度見本（OK/NGの実例写真・資料から選択）
                </div>
                {limits.map((s, i) => (
                  <div className="limit-row" key={`${s.docId}-${i}`}>
                    <img src={`/api/documents/${s.docId}/file`} alt="" />
                    <span
                      className={`chip-state ${s.label === 'NG' ? 'st-alert' : 'st-ok'}`}
                    >
                      {s.label === 'NG' ? 'NG（不良）' : 'OK限度（ここまで許容）'}
                    </span>
                    <span style={{ flex: 1, minWidth: 0 }}>{s.note}</span>
                    <button
                      type="button"
                      className="cond-remove"
                      aria-label="この限度見本を外す"
                      onClick={() => removeLimit(i)}
                    >
                      &#215;
                    </button>
                  </div>
                ))}
                <div className="cond-row" style={{ gridTemplateColumns: 'minmax(0,1.4fr) 150px minmax(0,1.6fr) auto' }}>
                  <select
                    className="select-input"
                    aria-label="限度見本にする資料"
                    value={limitDocId}
                    onChange={(e) =>
                      setLimitDocId(e.target.value === '' ? '' : Number(e.target.value))
                    }
                  >
                    <option value="">資料（写真）を選択</option>
                    {(docs ?? [])
                      .filter((d) => d.mimeType?.startsWith('image/'))
                      .map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.title || d.fileName || `資料 #${d.id}`}
                        </option>
                      ))}
                  </select>
                  <select
                    className="select-input"
                    aria-label="OK/NGの区分"
                    value={limitLabel}
                    onChange={(e) => setLimitLabel(e.target.value as LimitSampleLabel)}
                  >
                    <option value="OK_LIMIT">OK限度（ここまで許容）</option>
                    <option value="NG">NG（これは不良）</option>
                  </select>
                  <input
                    className="text-input"
                    aria-label="限度見本のメモ"
                    value={limitNote}
                    onChange={(e) => setLimitNote(e.target.value)}
                    placeholder="例）この程度の色ムラまで許容"
                  />
                  <button type="button" className="btn btn-ghost btn-sm" onClick={addLimit}>
                    追加
                  </button>
                </div>

                {/* ---- 許容条件 / 責任分界 ---- */}
                <div className="form-grid" style={{ marginTop: 16 }}>
                  <div className="form-field">
                    <label htmlFor="tol-rate">不良の許容率（%）</label>
                    <input
                      id="tol-rate"
                      className="text-input num"
                      type="number"
                      min="0"
                      step="0.1"
                      value={tolRate}
                      onChange={(e) => setTolRate(e.target.value)}
                      placeholder="例）1.5"
                    />
                  </div>
                  <div className="form-field">
                    <label htmlFor="tol-spare">予備数（個）</label>
                    <input
                      id="tol-spare"
                      className="text-input num"
                      type="number"
                      min="0"
                      value={tolSpare}
                      onChange={(e) => setTolSpare(e.target.value)}
                      placeholder="例）20"
                    />
                  </div>
                  <div className="form-field">
                    <label htmlFor="tol-note">許容条件の補足</label>
                    <input
                      id="tol-note"
                      className="text-input"
                      value={tolNote}
                      onChange={(e) => setTolNote(e.target.value)}
                      placeholder="例）外箱の軽微なスレは許容"
                    />
                  </div>
                </div>
                <div className="form-grid" style={{ marginTop: 10 }}>
                  <div className="form-field">
                    <label htmlFor="resp-pass">責任分界: 検品合格後</label>
                    <input
                      id="resp-pass"
                      className="text-input"
                      value={respPass}
                      onChange={(e) => setRespPass(e.target.value)}
                      placeholder="例）検品合格後の輸送破損はCrossimageが対応"
                    />
                  </div>
                  <div className="form-field">
                    <label htmlFor="resp-market">責任分界: 市場での不具合</label>
                    <input
                      id="resp-market"
                      className="text-input"
                      value={respMarket}
                      onChange={(e) => setRespMarket(e.target.value)}
                      placeholder="例）基準内の個体差はお客様側で判断"
                    />
                  </div>
                  <div className="form-field">
                    <label htmlFor="resp-comp">補償</label>
                    <input
                      id="resp-comp"
                      className="text-input"
                      value={respComp}
                      onChange={(e) => setRespComp(e.target.value)}
                      placeholder="例）基準超の不良は代品または返金"
                    />
                  </div>
                </div>

                <div className="form-actions">
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={saveAgreementOnly}
                    disabled={agBusy}
                  >
                    編集を保存
                  </button>
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    onClick={sendAgreement}
                    disabled={agBusy}
                  >
                    {agBusy ? '送信しています…' : '顧客へ送る'}
                  </button>
                </div>
              </>
            ) : (
              /* ---- PENDING_CUSTOMER / AGREED: 読み取り表示 ---- */
              <div style={{ marginTop: 8 }}>
                {(agreement.checkItems ?? []).map((c, i) => (
                  <div className="state-line" key={i}>
                    <span className="k">{c.name}</span>
                    <span>
                      {c.criteriaJa}
                      {c.method && (
                        <span style={{ color: 'var(--faint)', fontSize: 12 }}>
                          {' '}
                          ／ 確認方法: {c.method}
                        </span>
                      )}
                    </span>
                  </div>
                ))}
                {(agreement.limitSamples ?? []).length > 0 && (
                  <div className="state-line">
                    <span className="k">限度見本</span>
                    <span style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      {(agreement.limitSamples ?? []).map((s, i) => (
                        <span
                          key={i}
                          className={`chip-state ${s.label === 'NG' ? 'st-alert' : 'st-ok'}`}
                        >
                          {s.label === 'NG' ? 'NG' : 'OK限度'}
                          {s.note ? `: ${s.note}` : ''}
                        </span>
                      ))}
                    </span>
                  </div>
                )}
                {agreement.customerDecidedAt && (
                  <div className="state-line">
                    <span className="k">お客様の決定</span>
                    <span className="num">{fmtDate(agreement.customerDecidedAt)}</span>
                  </div>
                )}
                {agreement.bodyZh && (
                  <details style={{ marginTop: 10 }}>
                    <summary
                      style={{ fontSize: 12.5, color: 'var(--sub)', cursor: 'pointer' }}
                    >
                      中文版（工場向け）を見る
                    </summary>
                    <div className="rfq-body" lang="zh-CN">
                      {agreement.bodyZh}
                    </div>
                  </details>
                )}
              </div>
            )}
          </>
        )}
      </div>

      <Toast msg={toastMsg} show={toastShow} />
    </section>
  );
}

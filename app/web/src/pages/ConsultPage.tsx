import { useCallback, useEffect, useRef, useState } from 'react';
import { api, emitVisual } from '../lib/api';
import { useAuth } from '../lib/auth';
import {
  formatLeadDays,
  formatPrice,
  formatQtyFrom,
  SourceChip,
  Toast,
  Tt,
  useToast,
} from '../components/ui';
import type {
  AnswersResponse,
  ConsultationResponse,
  EntryRoute,
  GenerateProposalsResponse,
  LoopClientView,
  LoopDecideResponse,
  LoopOptionClientView,
  ProposalOptionView,
  QuestionView,
  SelectResponse,
  UnderstandingField,
} from '../types';
import type {
  AgreementView,
  ClientProjectListItem,
  ClientProjectsResponse,
  DocumentView,
  DocumentsResponse,
} from '../types-bi3';
import type {
  ClientProgressSummary,
  ClientSampleView,
  ProjectViewClientV4,
} from '../types-bi4';

type Step =
  | 'input'
  | 'processing'
  | 'understand'
  | 'generating'
  | 'pending'
  | 'proposal'
  | 'done'
  /* ---- BI-2: 選べる進め方（商流Loop） ---- */
  | 'loop'
  | 'modify_pending'
  | 'loop_done'
  /* ---- BI-3: 量産合意書（G-02） ---- */
  | 'agreement'
  | 'agreement_change_sent'
  | 'agreement_done'
  /* ---- BI-4: サンプル確認〜生産進捗〜お届け〜振り返り ---- */
  | 'sample_review'
  | 'sample_change_sent'
  | 'sample_approved'
  | 'progress'
  | 'delivered'
  | 'feedback'
  | 'feedback_done';

const ENTRY_CHIPS: { route: EntryRoute; label: string; placeholder: string }[] = [
  {
    route: 'IDEA',
    label: 'まだ相談したい',
    placeholder:
      '例）ざっくりですが、自社ブランドで何かオリジナルグッズを作れないかと考えています。方向性から相談したい',
  },
  {
    route: 'PRODUCT',
    label: '商品は決まっている',
    placeholder:
      '例）自社ブランドでキャンプ用のホーローマグを作りたい。ロゴを入れて、ギフトにできる箱も欲しい。予算はまだ決めていない',
  },
  {
    route: 'SPEC',
    label: '仕様書・図面がある',
    placeholder:
      '例）仕様書と図面があります。素材はステンレス、容量350ml。図面どおりに作れる工場と概算を知りたい',
  },
  {
    route: 'REPEAT',
    label: '以前の商品をもう一度',
    placeholder:
      '例）以前作っていただいたロゴ入りトートバッグを、色違いでもう一度作りたい。前回は2022年ごろ、1,000枚でした',
  },
];

const DEFAULT_PLACEHOLDER =
  '例）自社ブランドでキャンプ用のホーローマグを作りたい。ロゴを入れて、ギフトにできる箱も欲しい。予算はまだ決めていない';

const EXAMPLES: { key: string; label: string; text: string }[] = [
  {
    key: 'tumbler',
    label: 'タンブラーの例',
    text: '自社カフェのロゴ入りステンレスタンブラーを作りたい。保温できて、持ち歩きやすいサイズ。店頭とオンラインで販売予定。まずは500個くらいから試したい。',
  },
  {
    key: 'pet',
    label: 'ペット用品の例',
    text: '猫用のオリジナル食器を作りたい。ひげが当たりにくい浅めの形で、電子レンジと食洗機に対応してほしい。自社ブランドで販売する予定。数量や予算はこれから決める。',
  },
  {
    key: 'bag',
    label: 'バッグの例',
    text: '展示会の来場者に配るオリジナルトートバッグを作りたい。A4が入るサイズでロゴを1色印刷。3,000枚くらい、1枚300円以内におさめたい。',
  },
];

/* ---- BI-3: 入口別の実例テンプレ（タップで入力欄へ雛形挿入） ---- */
const TEMPLATES: Record<EntryRoute, { label: string; text: string }[]> = {
  IDEA: [
    {
      label: 'ざっくり相談の見本',
      text: '◯◯な人向けに、◯◯できる商品を作ってみたい。参考にしているのは◯◯です。数量や予算はまだ決まっていません。',
    },
    {
      label: 'ブランドグッズの見本',
      text: '自社ブランド「◯◯」のオリジナルグッズを作りたい。候補は◯◯や◯◯。ブランドの雰囲気は◯◯な感じです。',
    },
    {
      label: '課題から相談の見本',
      text: '◯◯という悩みを解決できる商品を作れないか相談したい。使う人は◯◯で、◯◯なときに使うイメージです。',
    },
  ],
  PRODUCT: [
    {
      label: '同等品を作りたい',
      text: 'この商品（URL/写真: ◯◯）と同等品を◯個、◯月までに作りたい。変更したい点: ◯◯',
    },
    {
      label: 'ロゴ入りで作りたい',
      text: '◯◯（商品名）に自社ロゴを入れて◯個作りたい。色は◯◯、1個あたりの予算は◯円くらいを考えています。',
    },
  ],
  SPEC: [
    {
      label: '仕様を列挙する',
      text: '仕様書・図面があります。素材: ◯◯／サイズ: ◯◯／色: ◯◯／数量: ◯個／希望時期: ◯月。図面どおりに作れる工場と概算を知りたい。',
    },
    {
      label: '一部だけ未定',
      text: '仕様はほぼ決まっています。素材: ◯◯／サイズ: ◯◯／数量: ◯個。◯◯だけ未定なので、あわせて相談したい。',
    },
  ],
  REPEAT: [
    {
      label: '前回と同じものを',
      text: '前回の◯◯を、同じ仕様でもう一度◯個作りたい。希望時期は◯月です。',
    },
    {
      label: '一部変えて再注文',
      text: '前回の◯◯をベースに、◯◯を変えて作りたい。数量は◯個、そのほかは前回と同じで大丈夫です。',
    },
  ],
};

/* ---- BI-3: 決めることマップ（常設の横レール） ---- */
const DMAP_STAGES: { name: string; you: string; cx: string }[] = [
  { name: '相談', you: '作りたいものを言葉にする', cx: '内容を整理して3案をご用意' },
  { name: '提案', you: '進め方を1つ選ぶ', cx: '数量・価格・納期の違いをご説明' },
  { name: '工場確認', you: '気になる条件があれば伝える', cx: '工場へ見積・条件を正式確認' },
  { name: 'サンプル', you: '実物を見てOK・直したい点を伝える', cx: 'サンプル手配と改善の橋渡し' },
  { name: '量産合意', you: '品質基準（量産合意書）に合意する', cx: '合意書を作成し工場と共有' },
  { name: '生産', you: '（お待ちいただくだけ）', cx: '進捗を管理してご報告' },
  { name: '検品', you: '（お待ちいただくだけ）', cx: '決めた基準どおりかを検査' },
  { name: 'お届け', you: '受け取って中身を確認する', cx: '輸送・通関を手配して納品' },
];

const MAX_FILE_BYTES = 15 * 1024 * 1024;

const PROC_STAGES = [
  'ご要望を整理しています…',
  '似た商品の事例と相場を確認しています…',
  '工場条件の目安を計算しています…',
];

const CheckSvg = (
  <svg
    width="12"
    height="12"
    viewBox="0 0 24 24"
    fill="none"
    stroke="#fff"
    strokeWidth="3.4"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M20 6L9 17l-5-5" />
  </svg>
);

export default function ConsultPage() {
  const { setAiMode } = useAuth();
  const [toastMsg, toastShow, toast] = useToast();

  const [step, setStep] = useState<Step>('input');
  const [entry, setEntry] = useState<EntryRoute | null>(null);
  const [text, setText] = useState('');
  const [refUrl, setRefUrl] = useState('');
  const [shortHint, setShortHint] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [projectId, setProjectId] = useState<number | null>(null);
  const [publicId, setPublicId] = useState<string | null>(null);
  const [understanding, setUnderstanding] = useState<UnderstandingField[]>([]);
  const [questions, setQuestions] = useState<QuestionView[]>([]);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [options, setOptions] = useState<ProposalOptionView[] | null>(null);
  const [chosen, setChosen] = useState<ProposalOptionView | null>(null);
  const [selecting, setSelecting] = useState(false);

  /* ---- BI-2: 選べる進め方（商流Loop） ---- */
  const [loop, setLoop] = useState<LoopClientView | null>(null);
  const [loopChosen, setLoopChosen] = useState<LoopOptionClientView | null>(null);
  const [modifyOpen, setModifyOpen] = useState(false);
  const [modifyNote, setModifyNote] = useState('');
  const [deciding, setDeciding] = useState(false);
  const modifiedLoopId = useRef<number | null>(null);

  /* ---- BI-3: リピート引き継ぎ / 添付 / 量産合意書 ---- */
  const [pastProjects, setPastProjects] = useState<ClientProjectListItem[] | null>(null);
  const [sourceProjectId, setSourceProjectId] = useState<number | ''>('');
  const [attached, setAttached] = useState<{ id: number; file: File; url: string | null }[]>(
    [],
  );
  const attachSeq = useRef(1);
  const [agreement, setAgreement] = useState<AgreementView | null>(null);
  const [agBusy, setAgBusy] = useState(false);
  const [agChangeOpen, setAgChangeOpen] = useState(false);
  const [agNote, setAgNote] = useState('');

  /* ---- BI-4: サンプル確認 / 進捗 / お届け / フィードバック ---- */
  const [sample, setSample] = useState<ClientSampleView | null>(null);
  const [sampleBusy, setSampleBusy] = useState(false);
  const [sampleChangeOpen, setSampleChangeOpen] = useState(false);
  const [sampleNote, setSampleNote] = useState('');
  const decidedSampleIds = useRef<Set<number>>(new Set());
  const [progress, setProgress] = useState<ClientProgressSummary | null>(null);
  const [projState, setProjState] = useState<string | null>(null);
  const [fbRating, setFbRating] = useState(0);
  const [fbComment, setFbComment] = useState('');
  const [fbRepeat, setFbRepeat] = useState(false);
  const [fbBusy, setFbBusy] = useState(false);
  const fbDone = useRef(false);

  const canvasRef = useRef<HTMLTextAreaElement>(null);
  const submittedText = useRef('');

  /* REPEAT選択時: 自社の過去案件一覧（取得できない環境では静かに非表示） */
  useEffect(() => {
    if (entry !== 'REPEAT' || pastProjects !== null) return;
    let cancelled = false;
    api
      .get<ClientProjectsResponse | ClientProjectListItem[]>('/projects')
      .then((res) => {
        if (cancelled) return;
        setPastProjects(Array.isArray(res) ? res : (res.items ?? []));
      })
      .catch(() => {
        if (!cancelled) setPastProjects([]);
      });
    return () => {
      cancelled = true;
    };
  }, [entry, pastProjects]);

  /* テンプレ挿入（入力済みの場合は確認してから置き換え） */
  function insertTemplate(t: string) {
    if (text.trim() && text.trim() !== t.trim()) {
      const ok = window.confirm('入力欄の内容をテンプレートで置き換えます。よろしいですか？');
      if (!ok) return;
    }
    setText(t);
    setShortHint(false);
    canvasRef.current?.focus();
  }

  /* 添付ファイルの追加・削除（相談フォーム） */
  function addAttachments(list: File[] | null) {
    if (!list || list.length === 0) return;
    setAttached((cur) => {
      const next = [...cur];
      for (const f of list) {
        if (f.size > MAX_FILE_BYTES) {
          toast(`「${f.name}」は15MBを超えているため添付できません。`);
          continue;
        }
        next.push({
          id: attachSeq.current++,
          file: f,
          url: f.type.startsWith('image/') ? URL.createObjectURL(f) : null,
        });
      }
      return next;
    });
  }
  function removeAttachment(aid: number) {
    setAttached((cur) => {
      const target = cur.find((x) => x.id === aid);
      if (target?.url) URL.revokeObjectURL(target.url);
      return cur.filter((x) => x.id !== aid);
    });
  }

  /* 画面切替時: 先頭へスクロール */
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'auto' });
  }, [step]);

  useEffect(() => {
    emitVisual('CANVAS_OPEN'); // Presentation Layer 接続点
  }, []);

  /* ---------------- STEP 2: 整理中アニメーション ---------------- */
  const [stageIdx, setStageIdx] = useState(0);
  useEffect(() => {
    if (step !== 'processing') return;
    setStageIdx(0);
    const t = window.setInterval(
      () => setStageIdx((i) => Math.min(i + 1, PROC_STAGES.length - 1)),
      900,
    );
    return () => window.clearInterval(t);
  }, [step]);

  /* ---------------- STEP 1 → 送信 ---------------- */
  async function submitConsultation() {
    const trimmed = text.trim();
    if (trimmed.length < 20) {
      setShortHint(true);
      canvasRef.current?.focus();
      return;
    }
    setShortHint(false);
    setError(null);
    submittedText.current = trimmed;
    setAnswers({});
    setChosen(null);
    setOptions(null);
    setStep('processing');
    emitVisual('ANALYZING'); // Presentation Layer 接続点

    try {
      const res = await api.post<ConsultationResponse>('/consultations', {
        text: trimmed,
        entryRoute: entry ?? 'IDEA',
        ...(refUrl.trim() ? { refUrl: refUrl.trim() } : {}),
        ...(entry === 'REPEAT' && sourceProjectId !== ''
          ? { sourceProjectId: Number(sourceProjectId) }
          : {}),
      });

      /* BI-3: 添付ファイルの送信（失敗しても相談フローは継続） */
      if (attached.length > 0) {
        let failed = 0;
        for (const a of attached) {
          try {
            const fd = new FormData();
            fd.append('file', a.file);
            await api.postForm(`/projects/${res.projectId}/documents`, fd);
          } catch {
            failed += 1;
          }
        }
        if (failed > 0) {
          toast('一部の参考資料をお送りできませんでした。あとで案件画面から追加できます。');
        }
      }

      setProjectId(res.projectId);
      setPublicId(res.publicId);
      setUnderstanding(res.understanding ?? []);
      setQuestions((res.questions ?? []).slice(0, 2)); // 質問は最大2問
      setAiMode(res.aiMode);
      setStep('understand');
      emitVisual('UNDERSTOOD'); // Presentation Layer 接続点
    } catch (e) {
      setStep('input');
      setError(
        e instanceof Error
          ? e.message
          : '送信できませんでした。時間をおいてもう一度お試しください。',
      );
    }
  }

  /* ---------------- STEP 3 → 提案生成 ---------------- */
  async function generateProposals() {
    if (!projectId) return;
    setError(null);
    setStep('generating');

    try {
      const toSend = Object.entries(answers)
        .filter(([, v]) => v && v !== 'あとで決める')
        .map(([questionId, value]) => ({ questionId: Number(questionId), value }));
      if (toSend.length > 0) {
        const ans = await api.post<AnswersResponse>(`/projects/${projectId}/answers`, {
          answers: toSend,
        });
        if (ans.understanding) setUnderstanding(ans.understanding);
        if (ans.questions) setQuestions(ans.questions.slice(0, 2));
      }

      const res = await api.post<GenerateProposalsResponse>(
        `/projects/${projectId}/proposals`,
      );
      if (res.aiMode) setAiMode(res.aiMode);

      if (res.status === 'approved' && res.options?.length) {
        // AUTO_APPROVE_PROPOSALS=true: 即3案表示
        setOptions(res.options);
        setStep('proposal');
        emitVisual('PROPOSAL_READY'); // Presentation Layer 接続点（CONTRACT §6）
      } else {
        // PENDING_APPROVAL: 担当者確認中 → 10sポーリング
        setStep('pending');
      }
    } catch (e) {
      setStep('understand');
      setError(
        e instanceof Error
          ? e.message
          : '提案を作成できませんでした。時間をおいてもう一度お試しください。',
      );
    }
  }

  /* ---------------- PENDING: 10sポーリング ---------------- */
  const pollProject = useCallback(async () => {
    if (!projectId) return;
    try {
      const pj = await api.get<ProjectViewClientV4>(`/projects/${projectId}`);
      if (pj.aiMode) setAiMode(pj.aiMode);
      if (pj.proposal.state === 'ready' && pj.proposal.proposal.options.length) {
        setOptions(pj.proposal.proposal.options);
        if (pj.understanding?.length) setUnderstanding(pj.understanding);
        setStep('proposal');
        emitVisual('PROPOSAL_READY'); // Presentation Layer 接続点（CONTRACT §6）
      }
    } catch {
      /* 一時的な失敗は次のポーリングで再試行 */
    }
  }, [projectId, setAiMode]);

  useEffect(() => {
    if (step !== 'pending') return;
    void pollProject();
    const t = window.setInterval(() => void pollProject(), 10_000);
    return () => window.clearInterval(t);
  }, [step, pollProject]);

  /* ---------------- BI-2/BI-3/BI-4: 承認済みLoop・合意書・後工程の10sポーリング ---------------- */
  const pollLoop = useCallback(async () => {
    if (!projectId) return;
    try {
      const pj = await api.get<ProjectViewClientV4>(`/projects/${projectId}`);
      if (pj.aiMode) setAiMode(pj.aiMode);

      /* ---- BI-4: 後工程（サーバーは既存フィールドstatusに工程を返す。stateも許容） ---- */
      const state =
        typeof pj.state === 'string' ? pj.state : typeof pj.status === 'string' ? pj.status : null;
      const prog = pj.progress ?? pj.progressSummary ?? null;

      /* お取引完了: 受取確認済み → フィードバック（送信済みならお礼画面） */
      if (state === 'COMPLETED') {
        setProgress(prog);
        setProjState(state);
        if ((pj.feedback && pj.feedback.rating != null) || fbDone.current) {
          fbDone.current = true;
          setStep('feedback_done');
        } else {
          setStep('feedback');
        }
        return;
      }

      /* お届け済み: 受取確認のご案内 */
      if (state === 'DELIVERED') {
        setProgress(prog);
        setProjState(state);
        setStep('delivered');
        return;
      }

      /* サンプルがお客様確認待ちになったら確認画面へ */
      const smp = (pj.samples ?? []).find(
        (s) =>
          s &&
          s.status === 'CUSTOMER_REVIEW' &&
          !decidedSampleIds.current.has(s.id),
      );
      if (smp) {
        setSample(smp);
        setSampleChangeOpen(false);
        setSampleNote('');
        if (pj.agreement) setAgreement(pj.agreement);
        setStep('sample_review');
        emitVisual('SAMPLE_READY'); // Presentation Layer 接続点
        return;
      }

      /* BI-3: 量産合意書がお客様確認待ちになったら合意画面へ（Loopより優先） */
      const ag = pj.agreement;
      if (ag && ag.status === 'PENDING_CUSTOMER') {
        setAgreement(ag);
        setAgChangeOpen(false);
        setStep('agreement');
        emitVisual('AGREEMENT_READY'); // Presentation Layer 接続点
        return;
      }

      /* BI-4: 生産〜輸送中は静かな進捗カード */
      if (state === 'PRODUCTION' || state === 'INSPECTION' || state === 'SHIPPING') {
        if (ag) setAgreement(ag);
        setProgress(prog);
        setProjState(state);
        setStep('progress');
        return;
      }

      const lp = pj.loop;
      if (
        lp &&
        lp.options.length &&
        !lp.customerDecision &&
        lp.id !== modifiedLoopId.current
      ) {
        setLoop(lp);
        setModifyOpen(false);
        setModifyNote('');
        setStep('loop');
        emitVisual('LOOP_READY'); // Presentation Layer 接続点
      }
    } catch {
      /* 一時的な失敗は次のポーリングで再試行 */
    }
  }, [projectId, setAiMode]);

  useEffect(() => {
    if (
      step !== 'done' &&
      step !== 'modify_pending' &&
      step !== 'loop_done' &&
      step !== 'agreement_change_sent' &&
      /* BI-4: 待ち・進捗系の画面でも同じポーリングを流用 */
      step !== 'agreement_done' &&
      step !== 'sample_change_sent' &&
      step !== 'sample_approved' &&
      step !== 'progress' &&
      step !== 'delivered'
    )
      return;
    void pollLoop();
    const t = window.setInterval(() => void pollLoop(), 10_000);
    return () => window.clearInterval(t);
  }, [step, pollLoop]);

  /* ---------------- BI-4: 進行中案件への復帰（リロード・別端末でも続きから） ---------------- */
  const resumeTried = useRef(false);
  useEffect(() => {
    if (resumeTried.current || projectId !== null || step !== 'input') return;
    resumeTried.current = true;
    void (async () => {
      try {
        const list = await api.get<{
          items?: { projectId?: number; id?: number; status?: string; state?: string; updatedAt?: string }[];
          projects?: { projectId?: number; id?: number; status?: string; state?: string; updatedAt?: string }[];
        }>('/projects');
        const items = (list.items ?? list.projects ?? []).filter(Boolean);
        if (!items.length) return;
        const active = [...items]
          .sort((a, b) => (b.updatedAt ?? '').localeCompare(a.updatedAt ?? ''))
          .find((p) => (p.status ?? p.state) !== 'COMPLETED');
        const activeId = active ? (active.projectId ?? active.id) : undefined;
        if (!activeId) return;
        const pj = await api.get<ProjectViewClientV4>(`/projects/${activeId}`);
        setProjectId(activeId);
        if (pj.aiMode) setAiMode(pj.aiMode);
        if (pj.understanding?.length) setUnderstanding(pj.understanding);

        const state =
          typeof pj.state === 'string' ? pj.state : typeof pj.status === 'string' ? pj.status : null;
        const prog = pj.progress ?? pj.progressSummary ?? null;
        if (state === 'DELIVERED') {
          setProgress(prog);
          setProjState(state);
          setStep('delivered');
          return;
        }
        const smp = (pj.samples ?? []).find((sm) => sm && sm.status === 'CUSTOMER_REVIEW');
        if (smp) {
          setSample(smp);
          if (pj.agreement) setAgreement(pj.agreement);
          setStep('sample_review');
          return;
        }
        if (pj.agreement && pj.agreement.status === 'PENDING_CUSTOMER') {
          setAgreement(pj.agreement);
          setStep('agreement');
          return;
        }
        if (state === 'PRODUCTION' || state === 'INSPECTION' || state === 'SHIPPING') {
          if (pj.agreement) setAgreement(pj.agreement);
          setProgress(prog);
          setProjState(state);
          setStep('progress');
          return;
        }
        if (pj.loop && pj.loop.options.length && !pj.loop.customerDecision) {
          setLoop(pj.loop);
          setStep('loop');
          return;
        }
        if (pj.proposal.state === 'ready' && pj.proposal.proposal.options.length) {
          setOptions(pj.proposal.proposal.options);
          const sel = pj.proposal.proposal.options.find((o) => o.selected);
          if (sel) {
            setChosen(sel);
            setStep('done'); // doneのポーリングが以後の工程へ進める
          } else {
            setStep('proposal');
          }
          return;
        }
        if (pj.proposal.state === 'pending_approval') {
          setStep('pending');
          return;
        }
        /* 相談整理の途中など復帰先が定まらない場合は新規相談のまま（まれ） */
      } catch {
        /* 復帰できなければ新規相談のまま */
      }
    })();
  }, [projectId, step, setAiMode]);

  /* ---------------- BI-3: 量産合意書の決定（APPROVE / REQUEST_CHANGE） ---------------- */
  async function decideAgreement(decision: 'APPROVE' | 'REQUEST_CHANGE') {
    if (!agreement || agBusy) return;
    const note = agNote.trim();
    if (decision === 'REQUEST_CHANGE' && !note) {
      toast('修正したい点をご記入ください。');
      return;
    }
    setAgBusy(true);
    try {
      await api.post(`/agreements/${agreement.id}/decide`, {
        decision,
        ...(decision === 'REQUEST_CHANGE' ? { note } : {}),
      });
      if (decision === 'APPROVE') {
        setAgreement({ ...agreement, status: 'AGREED' });
        setStep('agreement_done');
        emitVisual('AGREEMENT_AGREED'); // Presentation Layer 接続点
      } else {
        setAgChangeOpen(false);
        setAgNote('');
        setStep('agreement_change_sent');
      }
    } catch (e) {
      toast(
        e instanceof Error
          ? e.message
          : '送信できませんでした。時間をおいてもう一度お試しください。',
      );
    } finally {
      setAgBusy(false);
    }
  }

  /* ---------------- BI-4: サンプルの決定（APPROVE / REQUEST_CHANGE） ---------------- */
  async function decideSample(decision: 'APPROVE' | 'REQUEST_CHANGE') {
    if (!sample || sampleBusy) return;
    const note = sampleNote.trim();
    if (decision === 'REQUEST_CHANGE' && !note) {
      toast('修正したい点をご記入ください。');
      return;
    }
    setSampleBusy(true);
    try {
      await api.post(`/samples/${sample.id}/decide`, {
        decision,
        ...(decision === 'REQUEST_CHANGE' ? { note } : {}),
      });
      decidedSampleIds.current.add(sample.id);
      if (decision === 'APPROVE') {
        setStep('sample_approved');
        emitVisual('SAMPLE_APPROVED'); // Presentation Layer 接続点
      } else {
        setSampleChangeOpen(false);
        setSampleNote('');
        setStep('sample_change_sent');
      }
    } catch (e) {
      toast(
        e instanceof Error
          ? e.message
          : '送信できませんでした。時間をおいてもう一度お試しください。',
      );
    } finally {
      setSampleBusy(false);
    }
  }

  /* ---------------- BI-4: 受取確認 → ひとことフィードバック ---------------- */
  async function confirmDelivery() {
    if (!projectId || fbBusy) return;
    setFbBusy(true);
    try {
      await api.post(`/projects/${projectId}/delivery-confirm`, {});
      setStep('feedback');
      emitVisual('DELIVERY_CONFIRMED'); // Presentation Layer 接続点
    } catch (e) {
      toast(
        e instanceof Error
          ? e.message
          : '送信できませんでした。時間をおいてもう一度お試しください。',
      );
    } finally {
      setFbBusy(false);
    }
  }

  async function submitFeedback() {
    if (!projectId || fbBusy) return;
    if (fbRating < 1) {
      toast('星をタップして、満足度をお選びください。');
      return;
    }
    setFbBusy(true);
    try {
      await api.post(`/projects/${projectId}/feedback`, {
        rating: fbRating,
        ...(fbComment.trim() ? { comment: fbComment.trim() } : {}),
        askedRepeat: fbRepeat,
      });
      fbDone.current = true;
      setStep('feedback_done');
      emitVisual('FEEDBACK_SENT'); // Presentation Layer 接続点
    } catch (e) {
      toast(
        e instanceof Error
          ? e.message
          : '送信できませんでした。時間をおいてもう一度お試しください。',
      );
    } finally {
      setFbBusy(false);
    }
  }

  function skipFeedback() {
    /* 送らない選択もできる（ポーリングでフォームに戻さないよう記録） */
    fbDone.current = true;
    setStep('feedback_done');
  }

  /* ---------------- BI-2: Loopの決定（ACCEPT / MODIFY） ---------------- */
  async function acceptLoopOption(opt: LoopOptionClientView) {
    if (!loop || deciding) return;
    setDeciding(true);
    try {
      await api.post<LoopDecideResponse>(`/loops/${loop.id}/decide`, {
        decision: 'ACCEPT',
        selectedOptionKey: opt.key,
      });
      setLoopChosen(opt);
      setStep('loop_done');
      emitVisual('LOOP_ACCEPTED', { option: opt.key }); // Presentation Layer 接続点
    } catch (e) {
      toast(
        e instanceof Error
          ? e.message
          : '選択を記録できませんでした。もう一度お試しください。',
      );
    } finally {
      setDeciding(false);
    }
  }

  async function sendModify() {
    if (!loop || deciding) return;
    const note = modifyNote.trim();
    if (!note) {
      toast('変えたい条件をご記入ください。');
      return;
    }
    setDeciding(true);
    try {
      await api.post<LoopDecideResponse>(`/loops/${loop.id}/decide`, {
        decision: 'MODIFY',
        modifyNote: note,
      });
      modifiedLoopId.current = loop.id;
      setLoop(null);
      setStep('modify_pending');
    } catch (e) {
      toast(
        e instanceof Error
          ? e.message
          : '送信できませんでした。時間をおいてもう一度お試しください。',
      );
    } finally {
      setDeciding(false);
    }
  }

  /* ---------------- STEP 4 → 選択 ---------------- */
  async function selectOption(opt: ProposalOptionView) {
    if (selecting) return;
    setSelecting(true);
    setError(null);
    try {
      await api.post<SelectResponse>(`/proposals/${opt.id}/select`);
      setChosen(opt);
      setStep('done');
      emitVisual('PLAN_SELECTED', { option: opt.id }); // Presentation Layer 接続点
    } catch (e) {
      toast(
        e instanceof Error
          ? e.message
          : '選択を記録できませんでした。もう一度お試しください。',
      );
    } finally {
      setSelecting(false);
    }
  }

  function restart() {
    setStep('input');
    setEntry(null);
    setText('');
    setRefUrl('');
    setError(null);
    setShortHint(false);
    setProjectId(null);
    setPublicId(null);
    setUnderstanding([]);
    setQuestions([]);
    setAnswers({});
    setOptions(null);
    setChosen(null);
    setLoop(null);
    setLoopChosen(null);
    setModifyOpen(false);
    setModifyNote('');
    modifiedLoopId.current = null;
    /* BI-3 */
    setSourceProjectId('');
    setAttached((cur) => {
      for (const a of cur) if (a.url) URL.revokeObjectURL(a.url);
      return [];
    });
    setAgreement(null);
    setAgChangeOpen(false);
    setAgNote('');
    /* BI-4 */
    setSample(null);
    setSampleChangeOpen(false);
    setSampleNote('');
    decidedSampleIds.current.clear();
    setProgress(null);
    setProjState(null);
    setFbRating(0);
    setFbComment('');
    setFbRepeat(false);
    fbDone.current = false;
    emitVisual('CANVAS_OPEN'); // Presentation Layer 接続点
  }

  /* リピート導線: 「以前の商品をもう一度」入口で新しい相談を始める */
  function restartAsRepeat() {
    restart();
    setEntry('REPEAT');
    setPastProjects(null); // 一覧を取り直す
  }

  const placeholder =
    ENTRY_CHIPS.find((c) => c.route === entry)?.placeholder ?? DEFAULT_PLACEHOLDER;

  /* ---- BI-3: 決めることマップの現在地 ---- */
  const showDmap = step !== 'input' && step !== 'processing';
  const dmapIdx = (() => {
    switch (step) {
      case 'understand':
        return 0;
      case 'generating':
      case 'pending':
      case 'proposal':
        return 1;
      case 'done':
      case 'loop':
      case 'modify_pending':
        return 2;
      case 'loop_done':
        return 3;
      case 'agreement':
      case 'agreement_change_sent':
        return 4;
      case 'agreement_done':
        return 5;
      /* ---- BI-4 ---- */
      case 'sample_review':
      case 'sample_change_sent':
      case 'sample_approved':
        return 3;
      case 'progress':
        return projState === 'SHIPPING' ? 7 : projState === 'INSPECTION' ? 6 : 5;
      case 'delivered':
      case 'feedback':
      case 'feedback_done':
        return 7;
      default:
        return 0;
    }
  })();

  /* ================= render ================= */

  return (
    <>
      {/* ---------- BI-3: 決めることマップ（常設） ---------- */}
      {showDmap && <DecisionMap current={dmapIdx} />}

      {/* ---------- STEP 1: 相談キャンバス ---------- */}
      {step === 'input' && (
        <section className="step enter" aria-labelledby="h-input">
          <h1 className="h-main" id="h-input">
            どんな商品を、
            <br />
            つくりたいですか？
          </h1>
          <p className="h-sub">
            アイデアのままで大丈夫です。商品づくりの知識は必要ありません。
          </p>

          <div className="entry-chips" role="group" aria-label="ご相談の入り口">
            {ENTRY_CHIPS.map((c) => (
              <button
                key={c.route}
                type="button"
                className="chip"
                aria-pressed={entry === c.route}
                onClick={() => setEntry(entry === c.route ? null : c.route)}
              >
                {c.label}
              </button>
            ))}
          </div>

          {entry && (
            <div className="tpl-chips" role="group" aria-label="実例テンプレ（穴埋め式の例文）">
              <span className="tpl-label">
                実例テンプレ（タップで挿入・◯◯を書き換えるだけ）:
              </span>
              {TEMPLATES[entry].map((t) => (
                <button
                  key={t.label}
                  type="button"
                  className="chip chip-tpl"
                  onClick={() => insertTemplate(t.text)}
                >
                  {t.label}
                </button>
              ))}
            </div>
          )}

          {entry === 'REPEAT' && pastProjects !== null && pastProjects.length > 0 && (
            <>
              <label className="field-label" htmlFor="src-project" style={{ marginTop: 18 }}>
                前回の案件（内容を引き継ぎます）
              </label>
              <select
                id="src-project"
                className="past-select"
                value={sourceProjectId}
                onChange={(e) =>
                  setSourceProjectId(e.target.value === '' ? '' : Number(e.target.value))
                }
              >
                <option value="">選択しない（新規として相談）</option>
                {pastProjects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.title}（{p.publicId}）
                  </option>
                ))}
              </select>
              <p className="note" style={{ marginTop: 6 }}>
                選ぶと前回の仕様を引き継ぎ、変わる点だけをおうかがいします。
              </p>
            </>
          )}

          <label className="field-label" htmlFor="canvas">
            ご相談内容
          </label>
          <textarea
            id="canvas"
            ref={canvasRef}
            className="canvas-input"
            placeholder={placeholder}
            value={text}
            onChange={(e) => setText(e.target.value)}
          />

          <label className="field-label" htmlFor="ref-url">
            参考URL（任意）
          </label>
          <input
            id="ref-url"
            type="url"
            className="url-input"
            placeholder="https:// 参考にしたい商品ページなど"
            inputMode="url"
            value={refUrl}
            onChange={(e) => setRefUrl(e.target.value)}
          />

          <label className="field-label">参考資料（任意）</label>
          <div className="attach-row">
            {attached.map((a) => (
              <span className="thumb-chip" key={a.id}>
                <span className="thumb">
                  {a.url ? <img src={a.url} alt="" /> : FileSvg}
                </span>
                {a.file.name}
                <button
                  type="button"
                  className="rm"
                  aria-label={`${a.file.name} を外す`}
                  onClick={() => removeAttachment(a.id)}
                >
                  &#215;
                </button>
              </span>
            ))}
            <label className="example-link" style={{ cursor: 'pointer' }}>
              ＋ ファイルを選ぶ
              <input
                type="file"
                multiple
                accept="image/*,.pdf,.xlsx,.xls,.csv,.docx,.doc,.zip"
                style={{ display: 'none' }}
                onChange={(e) => {
                  const list = e.target.files ? Array.from(e.target.files) : null;
                  e.target.value = '';
                  addAttachments(list);
                }}
              />
            </label>
          </div>
          <p className="note" style={{ marginTop: 6 }}>
            参考画像・図面などあればどうぞ（15MBまで）
          </p>

          <div className="example-links" role="group" aria-label="例文">
            <span
              style={{ fontSize: 13, color: 'var(--faint)', alignSelf: 'center' }}
            >
              例文を使う:
            </span>
            {EXAMPLES.map((ex) => (
              <button
                key={ex.key}
                type="button"
                className="example-link"
                onClick={() => {
                  setText(ex.text);
                  setShortHint(false);
                  canvasRef.current?.focus();
                }}
              >
                {ex.label}
              </button>
            ))}
          </div>

          {shortHint && (
            <div className="gentle-hint">
              <strong>もう少しだけ教えてください。</strong>
              <br />
              「何を・誰のために・どんなふうに使うか」が一言あると、ご提案がぐっと正確になります。上の例文をそのまま使って試すこともできます。
            </div>
          )}

          {error && (
            <div className="form-error" role="alert">
              {error}
            </div>
          )}

          <div className="step1-cta">
            <button type="button" className="btn btn-primary" onClick={submitConsultation}>
              相談内容を整理してもらう
            </button>
            <span className="note" style={{ marginTop: 0 }}>
              予算・数量が未定でも進められます
            </span>
          </div>
        </section>
      )}

      {/* ---------- STEP 2: AI整理中 ---------- */}
      {step === 'processing' && (
        <section className="step enter" aria-labelledby="h-proc" aria-live="polite">
          <h2 className="h-main" id="h-proc" style={{ fontSize: 22 }}>
            少しだけお待ちください
          </h2>
          <div className="card proc-card">
            {PROC_STAGES.map((label, i) => (
              <div
                key={label}
                className={`proc-stage${i === stageIdx ? ' active' : ''}${
                  i < stageIdx ? ' done' : ''
                }`}
              >
                <span className="proc-dot">{CheckSvg}</span>
                {label}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ---------- STEP 3: こう理解しました ---------- */}
      {step === 'understand' && (
        <section className="step enter" aria-labelledby="h-und">
          <button type="button" className="btn-back" onClick={() => setStep('input')}>
            &#8592; 入力に戻る
          </button>
          <h2 className="h-main" id="h-und" style={{ marginTop: 18 }}>
            ご相談を、
            <br />
            こう理解しました
          </h2>
          <p className="h-sub">
            「AIの推測」の項目は、下の質問へのご回答と担当者の確認で正確にしていきます。
          </p>
          {publicId && (
            <p className="note">
              相談番号（お問い合わせの際にお使いください）: <span className="num">{publicId}</span>
            </p>
          )}

          <div className="card parse-card">
            {understanding.map((row) => (
              <div key={row.key} className="parse-row" style={{ cursor: 'default' }}>
                <span className="parse-key">{row.label}</span>
                <span className="parse-value">{row.value}</span>
                <SourceChip source={row.source} />
              </div>
            ))}
          </div>

          <div id="questions">
            {questions.map((q) => (
              <div className="q-block" key={q.id}>
                <div className="q-title">{q.title}</div>
                <div className="q-chips" role="group" aria-label={q.title}>
                  {[...q.options, 'あとで決める'].map((opt) => (
                    <button
                      key={opt}
                      type="button"
                      className="chip"
                      aria-pressed={answers[q.id] === opt}
                      onClick={() =>
                        setAnswers((a) => ({ ...a, [q.id]: opt }))
                      }
                    >
                      {opt}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {error && (
            <div className="form-error" role="alert">
              {error}
            </div>
          )}

          <div className="step3-cta">
            <button type="button" className="btn btn-primary" onClick={generateProposals}>
              この内容で提案を見る
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => setStep('input')}>
              入力を直す
            </button>
          </div>
        </section>
      )}

      {/* ---------- 提案生成中 ---------- */}
      {step === 'generating' && (
        <section className="step enter" aria-live="polite">
          <h2 className="h-main" style={{ fontSize: 22 }}>
            少しだけお待ちください
          </h2>
          <div className="pending-card card">
            <span className="spinner" aria-hidden="true" />
            <div>
              <div className="pending-title">3つの進め方をまとめています…</div>
              <p className="pending-desc">
                ご相談内容をもとに、数量・価格・納期の異なる3案を用意しています。
              </p>
            </div>
          </div>
        </section>
      )}

      {/* ---------- PENDING: 担当者確認中 ---------- */}
      {step === 'pending' && (
        <section className="step enter" aria-live="polite">
          <h2 className="h-main" style={{ fontSize: 22 }}>
            担当者が内容を確認しています
          </h2>
          <div className="pending-card card">
            <span className="pending-icon" aria-hidden="true">
              <svg
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="12" cy="12" r="10" />
                <path d="M12 6v6l4 2" />
              </svg>
            </span>
            <div>
              <div className="pending-title">
                お送りする提案を、担当者が最終確認しています。
              </div>
              <p className="pending-desc">
                通常1営業日以内にこの画面に3つのご提案が表示されます。このままお待ちいただいても、あとで開き直していただいても大丈夫です。
              </p>
              {publicId && (
                <p className="note">
                  相談番号: <span className="num">{publicId}</span>
                </p>
              )}
            </div>
          </div>
        </section>
      )}

      {/* ---------- STEP 4: 3案提案 ---------- */}
      {step === 'proposal' && options && (
        <section className="step enter" aria-labelledby="h-prop">
          <button type="button" className="btn-back" onClick={() => setStep('understand')}>
            &#8592; 整理内容に戻る
          </button>
          <h2 className="h-main" id="h-prop" style={{ marginTop: 18 }}>
            3つの進め方を
            <br />
            ご用意しました
          </h2>
          <p className="h-sub">
            どれを選んでも、このあと担当者が工場に正式確認します。金額はすべて工場確認前の目安です。
          </p>

          <div className="plans">
            {options.map((opt) => (
              <article
                key={opt.id}
                className={`card plan-card${opt.recommended ? ' recommended' : ''}`}
              >
                {opt.recommended && <span className="ribbon">おすすめ</span>}
                <h3 className="plan-name">{opt.title}</h3>
                <p className="plan-concept">{opt.concept}</p>
                {opt.priceRangeJpy ? (
                  <>
                    <div className="plan-price-row">
                      <span className="price">
                        {formatPrice(opt.priceRangeJpy)}
                        <span className="unit-label">／個</span>
                      </span>
                    </div>
                    <p className="plan-price-note">
                      <Tt
                        term="概算"
                        desc="工場に正式確認する前の目安金額です。仕様確定後に正式なお見積りをお出しします。"
                      />
                      （工場確認前の目安）
                    </p>
                  </>
                ) : (
                  /* BI-3: 金額非表示モード（hide_initial_prices） */
                  <p className="plan-price-hidden">
                    概算金額は、工場確認のうえ担当者からご提示します
                  </p>
                )}
                <dl className="plan-meta">
                  <div>
                    <dt>
                      <Tt
                        term="数量目安"
                        desc="品質と価格が両立しやすい最小の生産数量（MOQ）の目安です。"
                      />
                    </dt>
                    <dd className="num">{formatQtyFrom(opt.qtyFrom)}</dd>
                  </div>
                  <div>
                    <dt>お届け目安</dt>
                    <dd className="num">{formatLeadDays(opt.leadDays)}</dd>
                  </div>
                </dl>
                <ul className="plan-good">
                  {opt.pros.map((g) => (
                    <li key={g}>{g}</li>
                  ))}
                </ul>
                <p className="plan-tradeoff">{opt.tradeoff}</p>
                <div className="plan-cta">
                  <button
                    type="button"
                    className={`btn ${opt.recommended ? 'btn-primary' : 'btn-ghost'}`}
                    disabled={selecting}
                    onClick={() => selectOption(opt)}
                  >
                    この案で進める
                  </button>
                </div>
              </article>
            ))}
          </div>

          <div className="card after-flow">
            <h3>この後の流れ</h3>
            <div className="flow-steps">
              <FlowStep name="サンプル確認" desc="実物を手に取って確認" icon="box" />
              <FlowStep name="品質のとりきめ" desc="基準を一緒に決定" icon="check" />
              <FlowStep name="生産" desc="進捗は随時ご報告" icon="gear" />
              <FlowStep name="お届け" desc="検品のうえ納品" icon="truck" />
            </div>
            <p className="jargon-note">ここから先も、専門用語はその都度ご説明します。</p>
          </div>
        </section>
      )}

      {/* ---------- STEP 5: 選択完了 ---------- */}
      {step === 'done' && chosen && (
        <section className="step enter" aria-labelledby="h-done">
          <div className="card done-hero">
            <div className="done-check">
              <svg
                width="26"
                height="26"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.4"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M20 6L9 17l-5-5" />
              </svg>
            </div>
            <h2 className="done-title" id="h-done">
              「{chosen.title}」案で進めます。
              <br />
              担当者が内容を確認し、工場への確認を始めます。
            </h2>
            <div className="done-next">
              <strong>次にやること</strong>
              サンプルのご相談からご案内します。通常<span className="num">1〜2</span>
              営業日以内に担当者からご連絡します。
            </div>
            <p className="note">
              工場との条件確認が進むと、この画面に新しい進め方のご案内が表示されます。
              このままお待ちいただいても、後で開き直していただいても大丈夫です。
            </p>
          </div>

          <div className="card receipt">
            <h3>ご相談内容の控え</h3>
            <div>
              <ReceiptLine k="相談番号" v={publicId ?? '—'} />
              <ReceiptLine k="ご相談内容" v={submittedText.current} />
              {understanding.map((r) => (
                <ReceiptLine
                  key={r.key}
                  k={r.label}
                  v={
                    r.value +
                    (r.source === 'AI_INFERRED'
                      ? '（AIの推測・担当者が確認します）'
                      : '')
                  }
                />
              ))}
              {questions
                .filter((q) => answers[q.id] && answers[q.id] !== 'あとで決める')
                .map((q) => (
                  <ReceiptLine key={q.id} k={q.title} v={answers[q.id]} />
                ))}
              <ReceiptLine k="選んだ案" v={`${chosen.title} — ${chosen.concept}`} />
              <ReceiptLine
                k="概算単価"
                v={
                  chosen.priceRangeJpy
                    ? `${formatPrice(chosen.priceRangeJpy)}（工場確認前の目安）`
                    : '概算金額は、工場確認のうえ担当者からご提示します'
                }
              />
              {refUrl.trim() && <ReceiptLine k="参考URL" v={refUrl.trim()} />}
            </div>
          </div>

          {projectId && <CustomerDocsBox projectId={projectId} toast={toast} />}

          <div className="step3-cta">
            <button type="button" className="btn btn-ghost" onClick={() => setStep('proposal')}>
              提案に戻る
            </button>
            <button type="button" className="btn btn-ghost" onClick={restart}>
              新しい相談を始める
            </button>
          </div>
        </section>
      )}

      {/* ---------- BI-2: 選べる進め方 ---------- */}
      {step === 'loop' && loop && (
        <section className="step enter" aria-labelledby="h-loop">
          <h2 className="h-main" id="h-loop">
            条件を調整して、
            <br />
            より合う進め方をご用意しました
          </h2>
          <p className="h-sub">
            ご選択いただいた内容をもとに、担当者が工場と条件を確認しました。
            どの案でも、このあと正式なお見積りとサンプルのご案内に進みます。
          </p>
          {publicId && (
            <p className="note">
              相談番号: <span className="num">{publicId}</span>
            </p>
          )}

          <div className="plans">
            {loop.options.map((opt) => (
              <article
                key={opt.key}
                className={`card plan-card${opt.recommended ? ' recommended' : ''}`}
              >
                {opt.recommended && <span className="ribbon">おすすめ</span>}
                <h3 className="plan-name">{opt.title}</h3>
                <p className="plan-concept">{opt.concept}</p>
                {opt.customerPriceRange ? (
                  <>
                    <div className="plan-price-row">
                      <span className="price">
                        {formatPrice(opt.customerPriceRange)}
                        <span className="unit-label">／個</span>
                      </span>
                    </div>
                    <p className="plan-price-note">
                      <Tt
                        term="概算"
                        desc="工場との確認をふまえた目安金額です。数量とお届け先が確定した時点で正式なお見積りをお出しします。"
                      />
                      （工場との確認をふまえた目安）
                    </p>
                  </>
                ) : (
                  <p className="plan-price-hidden">
                    概算金額は、工場確認のうえ担当者からご提示します
                  </p>
                )}
                <dl className="plan-meta">
                  <div>
                    <dt>
                      <Tt
                        term="数量目安"
                        desc="品質と価格が両立しやすい最小の生産数量（MOQ）の目安です。"
                      />
                    </dt>
                    <dd className="num">{formatQtyFrom(opt.qtyFrom)}</dd>
                  </div>
                  <div>
                    <dt>お届け目安</dt>
                    <dd className="num">{formatLeadDays(opt.leadDays)}</dd>
                  </div>
                </dl>
                <ul className="plan-good">
                  {opt.pros.map((g) => (
                    <li key={g}>{g}</li>
                  ))}
                </ul>
                <p className="plan-tradeoff">{opt.tradeoff}</p>
                <div className="plan-cta">
                  <button
                    type="button"
                    className={`btn ${opt.recommended ? 'btn-primary' : 'btn-ghost'}`}
                    disabled={deciding}
                    onClick={() => acceptLoopOption(opt)}
                  >
                    この案で進める
                  </button>
                </div>
              </article>
            ))}
          </div>

          <div className="card loop-modify-box">
            <h3>条件を変えたい</h3>
            <p className="sub">
              数量・価格・お届け時期など、気になる点をそのままの言葉でお書きください。
              担当者が工場と再調整し、新しい進め方をご用意します。
            </p>
            {modifyOpen ? (
              <>
                <textarea
                  className="textarea-input"
                  value={modifyNote}
                  onChange={(e) => setModifyNote(e.target.value)}
                  placeholder="例）もう少し数量を減らして始めたい。500個くらいだとどうなりますか？"
                  aria-label="変えたい条件"
                />
                <div className="step3-cta" style={{ marginTop: 18 }}>
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={sendModify}
                    disabled={deciding}
                  >
                    {deciding ? '送信しています…' : 'この内容で相談する'}
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost"
                    onClick={() => setModifyOpen(false)}
                    disabled={deciding}
                  >
                    やめる
                  </button>
                </div>
              </>
            ) : (
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => setModifyOpen(true)}
              >
                条件を変えたい
              </button>
            )}
          </div>
        </section>
      )}

      {/* ---------- BI-2: MODIFY送信後（再調整中） ---------- */}
      {step === 'modify_pending' && (
        <section className="step enter" aria-live="polite">
          <h2 className="h-main" style={{ fontSize: 22 }}>
            担当者が再調整しています
          </h2>
          <div className="pending-card card">
            <span className="pending-icon" aria-hidden="true">
              <svg
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="12" cy="12" r="10" />
                <path d="M12 6v6l4 2" />
              </svg>
            </span>
            <div>
              <div className="pending-title">
                お伺いした条件をもとに、担当者が工場と再調整しています。
              </div>
              <p className="pending-desc">
                通常<span className="num">1〜2</span>
                営業日以内に、新しい進め方をこの画面でご案内します。このままお待ちいただいても、後で開き直していただいても大丈夫です。
              </p>
              {publicId && (
                <p className="note">
                  相談番号: <span className="num">{publicId}</span>
                </p>
              )}
            </div>
          </div>
        </section>
      )}

      {/* ---------- BI-2: Loop確定（完了） ---------- */}
      {step === 'loop_done' && loopChosen && (
        <section className="step enter" aria-labelledby="h-loop-done">
          <div className="card done-hero">
            <div className="done-check">
              <svg
                width="26"
                height="26"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.4"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M20 6L9 17l-5-5" />
              </svg>
            </div>
            <h2 className="done-title" id="h-loop-done">
              「{loopChosen.title}」で進めます。
              <br />
              担当者が正式なお見積りとサンプルのご案内を準備します。
            </h2>
            <div className="done-next">
              <strong>次にやること</strong>
              正式なお見積りとサンプルのご案内を、通常<span className="num">1〜2</span>
              営業日以内に担当者からお送りします。
            </div>
          </div>

          <div className="card receipt">
            <h3>ご選択内容の控え</h3>
            <div>
              <ReceiptLine k="相談番号" v={publicId ?? '—'} />
              <ReceiptLine k="選んだ進め方" v={`${loopChosen.title} — ${loopChosen.concept}`} />
              <ReceiptLine
                k="概算単価"
                v={
                  loopChosen.customerPriceRange
                    ? `${formatPrice(loopChosen.customerPriceRange)}（工場との確認をふまえた目安）`
                    : '概算金額は、工場確認のうえ担当者からご提示します'
                }
              />
              <ReceiptLine k="数量目安" v={formatQtyFrom(loopChosen.qtyFrom)} />
              <ReceiptLine k="お届け目安" v={formatLeadDays(loopChosen.leadDays)} />
            </div>
          </div>

          {projectId && <CustomerDocsBox projectId={projectId} toast={toast} />}

          <div className="step3-cta">
            <button type="button" className="btn btn-ghost" onClick={restart}>
              新しい相談を始める
            </button>
          </div>
        </section>
      )}

      {/* ---------- BI-3: 量産合意書のご確認 ---------- */}
      {step === 'agreement' && agreement && (
        <section className="step enter" aria-labelledby="h-agr">
          <h2 className="h-main" id="h-agr">
            量産前の品質のとりきめを
            <br />
            ご確認ください
          </h2>
          <p className="h-sub">
            量産合意書（量産で守る品質基準を1枚にまとめたもの）です。
            ご合意いただいた基準で、工場との生産・検品を進めます。
          </p>
          {publicId && (
            <p className="note">
              相談番号: <span className="num">{publicId}</span>
              {agreement.publicId && (
                <>
                  {' '}
                  ・ 合意書番号: <span className="num">{agreement.publicId}</span>
                </>
              )}
            </p>
          )}

          {agreement.approvedSampleDocId != null && (
            <div className="card agr-card">
              <h3>承認サンプル</h3>
              <img
                className="agr-photo"
                src={`/api/documents/${agreement.approvedSampleDocId}/file`}
                alt="承認サンプルの写真"
              />
              <p className="note" style={{ marginTop: 8 }}>
                この<Tt term="承認サンプル" desc="量産の基準となる見本です。量産品はこのサンプルと同じ品質で作られます。" />
                を基準として量産します。
              </p>
            </div>
          )}

          <div className="card agr-card">
            <h3>チェック項目（量産で守る基準）</h3>
            <ol className="agr-checks">
              {(agreement.checkItems ?? []).map((c, i) => (
                <li key={i}>
                  <strong>{c.name}</strong>
                  <span className="crit">{c.criteriaJa}</span>
                  {c.method && <span className="method">確認方法: {c.method}</span>}
                </li>
              ))}
            </ol>
          </div>

          {(agreement.limitSamples ?? []).length > 0 && (
            <div className="card agr-card">
              <h3>
                <Tt
                  term="限度見本"
                  desc="「ここまでは許容（OK）」「これは不良（NG）」の境目を写真で決めておく見本です。認識のずれによるトラブルを防ぎます。"
                />
                （OK/NGの実例写真）
              </h3>
              <div className="agr-limits">
                {(agreement.limitSamples ?? []).map((s, i) => (
                  <figure key={i} className="agr-limit">
                    <span
                      className={`chip-state ${s.label === 'NG' ? 'st-alert' : 'st-ok'}`}
                    >
                      {s.label === 'NG' ? 'NG（これは不良）' : 'OK限度（ここまで許容）'}
                    </span>
                    <img src={`/api/documents/${s.docId}/file`} alt="" />
                    {s.note && <figcaption>{s.note}</figcaption>}
                  </figure>
                ))}
              </div>
            </div>
          )}

          {(() => {
            const tol = agreement.tolerance ?? agreement.toleranceJson;
            const resp = agreement.responsibility ?? agreement.responsibilityJson;
            return (
              <>
                {tol && (
                  <div className="card agr-card">
                    <h3>許容条件（あらかじめ決めておく許容範囲）</h3>
                    <div>
                      <ReceiptLine
                        k="不良の許容率"
                        v={tol.defectRatePct != null ? `${tol.defectRatePct}%` : '—'}
                      />
                      <ReceiptLine
                        k="予備数"
                        v={tol.spareQty != null ? `${tol.spareQty}個` : '—'}
                      />
                      {tol.note && <ReceiptLine k="補足" v={tol.note} />}
                    </div>
                  </div>
                )}
                {resp && (
                  <div className="card agr-card">
                    <h3>責任分界（万一のときの役割分担）</h3>
                    <div>
                      <ReceiptLine k="検品合格後" v={resp.inspectionPass || '—'} />
                      <ReceiptLine k="市場での不具合" v={resp.marketDefect || '—'} />
                      <ReceiptLine k="補償" v={resp.compensation || '—'} />
                    </div>
                  </div>
                )}
              </>
            );
          })()}

          {agChangeOpen ? (
            <div className="card loop-modify-box">
              <h3>修正を希望する</h3>
              <p className="sub">
                気になる点をそのままの言葉でお書きください。担当者が合意書を修正し、
                あらためてご確認いただきます。
              </p>
              <textarea
                className="textarea-input"
                value={agNote}
                onChange={(e) => setAgNote(e.target.value)}
                placeholder="例）ロゴの色ズレの基準を、もう少し具体的に決めておきたい"
                aria-label="修正したい点"
              />
              <div className="step3-cta" style={{ marginTop: 18 }}>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => decideAgreement('REQUEST_CHANGE')}
                  disabled={agBusy}
                >
                  {agBusy ? '送信しています…' : 'この内容で修正を依頼する'}
                </button>
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => setAgChangeOpen(false)}
                  disabled={agBusy}
                >
                  やめる
                </button>
              </div>
            </div>
          ) : (
            <div className="step3-cta">
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => decideAgreement('APPROVE')}
                disabled={agBusy}
              >
                {agBusy ? '送信しています…' : 'この内容で合意する'}
              </button>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => setAgChangeOpen(true)}
                disabled={agBusy}
              >
                修正を希望する
              </button>
            </div>
          )}
        </section>
      )}

      {/* ---------- BI-3: 修正希望 送信後 ---------- */}
      {step === 'agreement_change_sent' && (
        <section className="step enter" aria-live="polite">
          <h2 className="h-main" style={{ fontSize: 22 }}>
            担当者が合意書を修正しています
          </h2>
          <div className="pending-card card">
            <span className="pending-icon" aria-hidden="true">
              <svg
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="12" cy="12" r="10" />
                <path d="M12 6v6l4 2" />
              </svg>
            </span>
            <div>
              <div className="pending-title">
                ご指摘の内容をもとに、担当者が量産合意書を修正しています。
              </div>
              <p className="pending-desc">
                修正版ができると、この画面にあらためて表示されます。
                このままお待ちいただいても、後で開き直していただいても大丈夫です。
              </p>
              {publicId && (
                <p className="note">
                  相談番号: <span className="num">{publicId}</span>
                </p>
              )}
            </div>
          </div>
        </section>
      )}

      {/* ---------- BI-3: 合意完了（AGREED） ---------- */}
      {step === 'agreement_done' && (
        <section className="step enter" aria-labelledby="h-agr-done">
          <div className="card done-hero">
            <div className="done-check">
              <svg
                width="26"
                height="26"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.4"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M20 6L9 17l-5-5" />
              </svg>
            </div>
            <p style={{ marginBottom: 10 }}>
              <span className="chip-state st-ok">AGREED（合意済み）</span>
            </p>
            <h2 className="done-title" id="h-agr-done">
              品質のとりきめに合意しました。
              <br />
              この基準で量産・検品を進めます。
            </h2>
            <div className="done-next">
              <strong>次にやること</strong>
              特にありません。生産の進捗は担当者からご報告します。
              上の「決めることマップ」のとおり、次は生産・検品に進みます。
            </div>
          </div>

          <div className="card receipt">
            <h3>合意内容の控え</h3>
            <div>
              <ReceiptLine k="相談番号" v={publicId ?? '—'} />
              <ReceiptLine k="合意書番号" v={agreement?.publicId ?? '—'} />
              <ReceiptLine
                k="チェック項目"
                v={`${(agreement?.checkItems ?? []).length}項目（画面でご確認いただいた基準）`}
              />
              <ReceiptLine k="合意日時" v={new Date().toLocaleString('ja-JP')} />
            </div>
          </div>

          <div className="step3-cta">
            <button type="button" className="btn btn-ghost" onClick={restart}>
              新しい相談を始める
            </button>
          </div>
        </section>
      )}

      {/* ---------- BI-4: サンプル確認 ---------- */}
      {step === 'sample_review' && sample && (
        <section className="step enter" aria-labelledby="h-smp">
          <h2 className="h-main" id="h-smp">
            サンプルが届きました。
            <br />
            写真をご確認ください
          </h2>
          <p className="h-sub">
            <Tt
              term="サンプル"
              desc="量産の前に実際に作った見本です。この見本を基準に量産の品質を決めていきます。"
            />
            （量産前の見本）の写真です。この見本で進めてよいか、直したい点がないかだけをご確認ください。
          </p>
          <p className="note">
            {publicId && (
              <>
                相談番号: <span className="num">{publicId}</span>
              </>
            )}
            {sample.publicId && (
              <>
                {publicId && ' ・ '}
                見本番号: <span className="num">{sample.publicId}</span>
              </>
            )}
            {sample.roundNo != null && (
              <>
                {' '}
                （<span className="num">{sample.roundNo}</span>回目）
              </>
            )}
          </p>

          {(sample.message ?? sample.requestNote) && (
            <div className="card agr-card">
              <h3>担当者からのメッセージ</h3>
              <p style={{ fontSize: 14, lineHeight: 1.8, whiteSpace: 'pre-wrap' }}>
                {sample.message ?? sample.requestNote}
              </p>
            </div>
          )}

          <div className="card agr-card">
            <h3>サンプル写真</h3>
            {(sample.photoDocIds ?? []).length > 0 ? (
              <div className="sample-gallery">
                {(sample.photoDocIds ?? []).map((docId, i) => (
                  <a
                    key={docId}
                    href={`/api/documents/${docId}/file`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <img
                      src={`/api/documents/${docId}/file`}
                      alt={`サンプル写真 ${i + 1}（タップで拡大）`}
                    />
                  </a>
                ))}
              </div>
            ) : (
              <p className="note" style={{ marginTop: 0 }}>
                写真を準備しています。少しお待ちください。
              </p>
            )}
          </div>

          {sampleChangeOpen ? (
            <div className="card loop-modify-box">
              <h3>修正を希望する</h3>
              <p className="sub">
                気になる点をそのままの言葉でお書きください。担当者が工場と調整し、
                次のサンプルをご用意します。
              </p>
              <textarea
                className="textarea-input"
                value={sampleNote}
                onChange={(e) => setSampleNote(e.target.value)}
                placeholder="例）ロゴの色が思ったより暗い。もう少し明るい青にしたい"
                aria-label="修正したい点"
              />
              <div className="step3-cta" style={{ marginTop: 18 }}>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => decideSample('REQUEST_CHANGE')}
                  disabled={sampleBusy}
                >
                  {sampleBusy ? '送信しています…' : 'この内容で修正を希望する'}
                </button>
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => setSampleChangeOpen(false)}
                  disabled={sampleBusy}
                >
                  やめる
                </button>
              </div>
            </div>
          ) : (
            <div className="step3-cta">
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => decideSample('APPROVE')}
                disabled={sampleBusy}
              >
                {sampleBusy ? '送信しています…' : 'この見本で進める'}
              </button>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => setSampleChangeOpen(true)}
                disabled={sampleBusy}
              >
                修正を希望する
              </button>
            </div>
          )}
        </section>
      )}

      {/* ---------- BI-4: サンプル修正希望 送信後 ---------- */}
      {step === 'sample_change_sent' && (
        <section className="step enter" aria-live="polite">
          <h2 className="h-main" style={{ fontSize: 22 }}>
            担当者が工場と調整しています
          </h2>
          <div className="pending-card card">
            <span className="pending-icon" aria-hidden="true">
              <svg
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="12" cy="12" r="10" />
                <path d="M12 6v6l4 2" />
              </svg>
            </span>
            <div>
              <div className="pending-title">
                ご指摘の内容をもとに、担当者が工場と調整し、次のサンプルを手配します。
              </div>
              <p className="pending-desc">
                次のサンプルの写真が届くと、この画面にあらためて表示されます。
                このままお待ちいただいても、後で開き直していただいても大丈夫です。
              </p>
              {publicId && (
                <p className="note">
                  相談番号: <span className="num">{publicId}</span>
                </p>
              )}
            </div>
          </div>
        </section>
      )}

      {/* ---------- BI-4: サンプル承認 完了 ---------- */}
      {step === 'sample_approved' && (
        <section className="step enter" aria-labelledby="h-smp-done">
          <div className="card done-hero">
            <div className="done-check">
              <svg
                width="26"
                height="26"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.4"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M20 6L9 17l-5-5" />
              </svg>
            </div>
            <h2 className="done-title" id="h-smp-done">
              この見本で進めます。
              <br />
              ありがとうございました。
            </h2>
            <div className="done-next">
              <strong>次にやること</strong>
              {agreement && agreement.status === 'PENDING_CUSTOMER'
                ? '量産合意書（量産で守る品質基準のとりきめ）のご確認へ進みます。まもなくこの画面に表示されます。'
                : '担当者が進めています。量産合意書（量産で守る品質基準のとりきめ）の準備ができると、この画面でご案内します。'}
            </div>
            {publicId && (
              <p className="note">
                相談番号: <span className="num">{publicId}</span>
              </p>
            )}
          </div>
        </section>
      )}

      {/* ---------- BI-4: 生産〜輸送の進捗 ---------- */}
      {step === 'progress' && (
        <section className="step enter" aria-labelledby="h-prog" aria-live="polite">
          <h2 className="h-main" id="h-prog" style={{ fontSize: 22 }}>
            いまの状況
          </h2>
          {(() => {
            const pc = progressCard(projState, progress);
            return (
              <div className="card progress-card">
                <div className="progress-title">{pc.title}</div>
                <p className="progress-desc">{pc.desc}</p>
                {pc.milestone && <div className="progress-milestone">{pc.milestone}</div>}
                {publicId && (
                  <p className="note" style={{ marginTop: 14 }}>
                    相談番号: <span className="num">{publicId}</span>
                  </p>
                )}
              </div>
            );
          })()}
          <p className="note" style={{ marginTop: 14 }}>
            お客様にやっていただくことは、いまはありません。状況が変わるとこの画面が自動で切り替わります。
            閉じても、後で開き直していただいて大丈夫です。
          </p>
        </section>
      )}

      {/* ---------- BI-4: お届け済み（受取確認） ---------- */}
      {step === 'delivered' && (
        <section className="step enter" aria-labelledby="h-dlv">
          <h2 className="h-main" id="h-dlv" style={{ fontSize: 22 }}>
            商品をお届けしました
          </h2>
          <div className="card progress-card">
            <div className="progress-title">お届け済み</div>
            <p className="progress-desc">
              お手元に商品は届きましたか？ 中身をご確認のうえ、下のボタンを押してください。
              万一、届いていない・内容に気になる点がある場合は、そのまま担当者へご連絡ください。
            </p>
            <div className="step3-cta" style={{ marginTop: 18 }}>
              <button
                type="button"
                className="btn btn-primary"
                onClick={confirmDelivery}
                disabled={fbBusy}
              >
                {fbBusy ? '送信しています…' : '受け取りました'}
              </button>
            </div>
            {publicId && (
              <p className="note" style={{ marginTop: 14 }}>
                相談番号: <span className="num">{publicId}</span>
              </p>
            )}
          </div>
        </section>
      )}

      {/* ---------- BI-4: 完了 + ひとことフィードバック ---------- */}
      {step === 'feedback' && (
        <section className="step enter" aria-labelledby="h-fb">
          <div className="card done-hero">
            <div className="done-check">
              <svg
                width="26"
                height="26"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.4"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M20 6L9 17l-5-5" />
              </svg>
            </div>
            <h2 className="done-title" id="h-fb">
              お受け取りありがとうございました。
              <br />
              今回の商品づくりはこれで完了です。
            </h2>
          </div>

          <div className="card agr-card">
            <h3>ひとことフィードバック（30秒で終わります）</h3>
            <p className="note" style={{ marginTop: 0 }}>
              次回をもっと良くするために、ひとことだけお聞かせください。
            </p>

            <div style={{ marginTop: 12 }}>
              <span className="field-label" id="fb-star-label" style={{ marginTop: 0 }}>
                今回のご満足度
              </span>
              <div className="star-rate" role="group" aria-labelledby="fb-star-label">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    type="button"
                    className={`star-btn${n <= fbRating ? ' on' : ''}`}
                    aria-pressed={fbRating === n}
                    aria-label={`星${n}つ${fbRating === n ? '（選択中）' : ''}`}
                    onClick={() => setFbRating(n)}
                  >
                    <span aria-hidden="true">{n <= fbRating ? '★' : '☆'}</span>
                  </button>
                ))}
                {fbRating > 0 && (
                  <span className="star-value num" aria-live="polite">
                    {fbRating} / 5
                  </span>
                )}
              </div>
            </div>

            <label className="field-label" htmlFor="fb-comment">
              ひとこと（任意）
            </label>
            <textarea
              id="fb-comment"
              className="textarea-input"
              value={fbComment}
              onChange={(e) => setFbComment(e.target.value)}
              placeholder="例）思ったより仕上がりが良かった。次は色違いも作ってみたい"
            />

            <label className="fb-check">
              <input
                type="checkbox"
                checked={fbRepeat}
                onChange={(e) => setFbRepeat(e.target.checked)}
              />
              <span>次の商品も相談したい（担当者からあらためてご連絡します）</span>
            </label>

            <div className="step3-cta" style={{ marginTop: 18 }}>
              <button
                type="button"
                className="btn btn-primary"
                onClick={submitFeedback}
                disabled={fbBusy}
              >
                {fbBusy ? '送信しています…' : 'この内容で送る'}
              </button>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={skipFeedback}
                disabled={fbBusy}
              >
                今回は送らない
              </button>
            </div>
          </div>
        </section>
      )}

      {/* ---------- BI-4: フィードバック送信後（リピート導線） ---------- */}
      {step === 'feedback_done' && (
        <section className="step enter" aria-labelledby="h-fb-done">
          <div className="card done-hero">
            <div className="done-check">
              <svg
                width="26"
                height="26"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.4"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M20 6L9 17l-5-5" />
              </svg>
            </div>
            <h2 className="done-title" id="h-fb-done">
              ありがとうございました。
              <br />
              またのご相談をお待ちしています。
            </h2>
            <div className="done-next">
              <strong>次の商品づくりは、もっとかんたんです</strong>
              新しい相談で「以前の商品をもう一度」を選ぶと、今回の内容を引き継いで、
              色違い・数量違いなどの再注文をすぐに始められます。
            </div>
          </div>

          <div className="step3-cta">
            <button type="button" className="btn btn-primary" onClick={restartAsRepeat}>
              以前の商品をもう一度（新しい相談へ）
            </button>
            <button type="button" className="btn btn-ghost" onClick={restart}>
              新しい相談を始める
            </button>
          </div>
        </section>
      )}

      <Toast msg={toastMsg} show={toastShow} />
    </>
  );
}

/* ---------------- 小物 ---------------- */

const FileSvg = (
  <svg
    width="16"
    height="16"
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
);

/* ---------------- BI-4: 進捗カードの文言（内部情報なし） ---------------- */

/** 日付文字列 → 「◯月◯日」。読めない場合はそのまま返す */
function fmtMd(s?: string | null): string {
  if (!s) return '';
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return s;
  return `${d.getMonth() + 1}月${d.getDate()}日`;
}

function progressCard(
  state: string | null,
  prog: ClientProgressSummary | null,
): { title: string; desc: string; milestone?: string } {
  const inspected = prog?.inspection;
  const inspectionPassed =
    inspected != null && (inspected.passed === true || inspected.result === 'PASS');
  const passLine = inspectionPassed
    ? inspected?.inspectedQty != null
      ? `検品に合格しました（抜取n=${inspected.inspectedQty}）`
      : '検品に合格しました'
    : null;

  if (state === 'PRODUCTION') {
    const ed = prog?.production?.expectedDoneOn;
    return {
      title: ed ? `生産中（${fmtMd(ed)}ごろ完了予定）` : '生産中',
      desc: '工場で生産を進めています。完了しだい、合意した品質基準どおりかを検品します。',
    };
  }
  if (state === 'INSPECTION') {
    if (passLine) {
      return {
        title: passLine,
        desc: '合意した品質基準（量産合意書）どおりかを確認し、合格しました。このあと日本への輸送準備に進みます。',
      };
    }
    return {
      title: '検品を行っています',
      desc: '合意した品質基準（量産合意書）どおりかを、1つずつ確認しています。',
    };
  }
  if (state === 'SHIPPING') {
    const sh = prog?.shipment;
    if (sh?.status === 'CUSTOMS') {
      return {
        title: '通関手続き中',
        desc: '日本へ輸入するための手続き（通関）を進めています。完了しだい、お届けの手配に入ります。',
        ...(passLine ? { milestone: passLine } : {}),
      };
    }
    if (sh?.status === 'ARRIVED_JP') {
      return {
        title: '日本に到着しました',
        desc: 'まもなくお届けの手配に入ります。到着まで、いましばらくお待ちください。',
        ...(passLine ? { milestone: passLine } : {}),
      };
    }
    return {
      title: sh?.eta ? `輸送中（到着予定${fmtMd(sh.eta)}）` : '輸送中',
      desc: '検品に合格した商品を、日本へ輸送しています。',
      ...(passLine ? { milestone: passLine } : {}),
    };
  }
  return {
    title: '担当者が進めています',
    desc: '状況が変わると、この画面に表示されます。',
  };
}

/* ---------------- BI-3: 決めることマップ ---------------- */

function DecisionMap({ current }: { current: number }) {
  return (
    <div className="card dmap" aria-label="決めることマップ（この先の流れ）">
      <div className="dmap-head">
        決めることマップ
        <span className="dmap-hint">
          各工程をタップすると「お客様が決めること」が見られます
        </span>
      </div>
      <div className="dmap-rail">
        {DMAP_STAGES.map((s, i) => (
          <div
            key={s.name}
            className={`dmap-step${i === current ? ' now' : i < current ? ' done' : ''}`}
          >
            <span className="dmap-dot" aria-hidden="true" />
            <Tt
              term={s.name}
              desc={`お客様が決めること: ${s.you} ／ Crossimageがやること: ${s.cx}`}
            />
            <span className="sr-only">
              {i < current ? '（完了）' : i === current ? '（現在の工程）' : ''}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------------- BI-3: 案件画面の参考資料（一覧+追加） ---------------- */

function CustomerDocsBox({
  projectId,
  toast,
}: {
  projectId: number;
  toast: (m: string) => void;
}) {
  const [docs, setDocs] = useState<DocumentView[] | null>(null);
  const [available, setAvailable] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await api.get<DocumentsResponse | DocumentView[]>(
        `/projects/${projectId}/documents`,
      );
      setDocs(Array.isArray(res) ? res : (res.items ?? []));
      setAvailable(true);
    } catch {
      /* 旧バックエンド（未対応）や一時エラー時はセクションごと非表示 */
      setDocs([]);
      setAvailable(false);
    }
  }, [projectId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function upload(list: File[] | null) {
    if (!list || list.length === 0 || busy) return;
    setBusy(true);
    try {
      let sent = 0;
      for (const f of list) {
        if (f.size > MAX_FILE_BYTES) {
          toast(`「${f.name}」は15MBを超えているため添付できません。`);
          continue;
        }
        const fd = new FormData();
        fd.append('file', f);
        await api.postForm(`/projects/${projectId}/documents`, fd);
        sent += 1;
      }
      if (sent > 0) toast('参考資料をお送りしました。担当者が確認します。');
      await load();
    } catch (e) {
      toast(
        e instanceof Error
          ? e.message
          : '送信できませんでした。時間をおいてもう一度お試しください。',
      );
    } finally {
      setBusy(false);
    }
  }

  if (!available) return null;

  return (
    <div className="card receipt">
      <h3>参考資料</h3>
      <p className="note" style={{ marginTop: 0 }}>
        参考画像・図面などあればどうぞ（15MBまで）
      </p>
      <div className="attach-row">
        {docs?.map((d) => (
          <span className="thumb-chip" key={d.id}>
            <span className="thumb">
              {d.mimeType?.startsWith('image/') ? (
                <img src={`/api/documents/${d.id}/file`} alt="" />
              ) : (
                FileSvg
              )}
            </span>
            <a
              href={`/api/documents/${d.id}/file`}
              target="_blank"
              rel="noreferrer"
              style={{ color: 'inherit' }}
            >
              {d.title || d.fileName || `資料 #${d.id}`}
            </a>
          </span>
        ))}
        <label className="example-link" style={{ cursor: 'pointer' }}>
          {busy ? '送信しています…' : '＋ ファイルを追加'}
          <input
            type="file"
            multiple
            accept="image/*,.pdf,.xlsx,.xls,.csv,.docx,.doc,.zip"
            style={{ display: 'none' }}
            disabled={busy}
            onChange={(e) => {
              const list = e.target.files ? Array.from(e.target.files) : null;
              e.target.value = '';
              void upload(list);
            }}
          />
        </label>
      </div>
    </div>
  );
}

function ReceiptLine({ k, v }: { k: string; v: string }) {
  return (
    <div className="receipt-line">
      <span className="k">{k}</span>
      <span className="v">{v}</span>
    </div>
  );
}

function FlowStep({
  name,
  desc,
  icon,
}: {
  name: string;
  desc: string;
  icon: 'box' | 'check' | 'gear' | 'truck';
}) {
  const icons = {
    box: (
      <>
        <path d="M21 8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z" />
        <path d="M3.3 7L12 12l8.7-5M12 22V12" />
      </>
    ),
    check: (
      <>
        <path d="M9 11l3 3L22 4" />
        <path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" />
      </>
    ),
    gear: (
      <>
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 11-4 0v-.09a1.65 1.65 0 00-1-1.51 1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 11-2.83-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 110-4h.09a1.65 1.65 0 001.51-1 1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06a1.65 1.65 0 001.82.33h0a1.65 1.65 0 001-1.51V3a2 2 0 114 0v.09a1.65 1.65 0 001 1.51h0a1.65 1.65 0 001.82-.33l.06-.06a2 2 0 112.83 2.83l-.06.06a1.65 1.65 0 00-.33 1.82v0a1.65 1.65 0 001.51 1H21a2 2 0 110 4h-.09a1.65 1.65 0 00-1.51 1z" />
      </>
    ),
    truck: (
      <>
        <path d="M1 3h15v13H1zM16 8h4l3 3v5h-7V8z" />
        <circle cx="5.5" cy="18.5" r="2.5" />
        <circle cx="18.5" cy="18.5" r="2.5" />
      </>
    ),
  } as const;

  return (
    <div className="flow-step">
      <div className="flow-icon">
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          {icons[icon]}
        </svg>
      </div>
      <div className="flow-name">{name}</div>
      <div className="flow-desc">{desc}</div>
    </div>
  );
}

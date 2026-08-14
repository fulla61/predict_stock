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
  ProjectViewClient,
  ProposalOptionView,
  QuestionView,
  SelectResponse,
  UnderstandingField,
} from '../types';

type Step =
  | 'input'
  | 'processing'
  | 'understand'
  | 'generating'
  | 'pending'
  | 'proposal'
  | 'done';

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

  const canvasRef = useRef<HTMLTextAreaElement>(null);
  const submittedText = useRef('');

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
      });
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
      const pj = await api.get<ProjectViewClient>(`/projects/${projectId}`);
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
    emitVisual('CANVAS_OPEN'); // Presentation Layer 接続点
  }

  const placeholder =
    ENTRY_CHIPS.find((c) => c.route === entry)?.placeholder ?? DEFAULT_PLACEHOLDER;

  /* ================= render ================= */

  return (
    <>
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
                v={`${formatPrice(chosen.priceRangeJpy)}（工場確認前の目安）`}
              />
              {refUrl.trim() && <ReceiptLine k="参考URL" v={refUrl.trim()} />}
            </div>
          </div>

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

      <Toast msg={toastMsg} show={toastShow} />
    </>
  );
}

/* ---------------- 小物 ---------------- */

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

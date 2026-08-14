// prototype/consultation.html のMock AI 6分類辞書の移植（分類・抽出・3案テンプレート）

export interface MockQuestion {
  id: string;
  title: string;
  opts: string[];
}

export interface MockPlan {
  key: 'rec' | 'small' | 'cost';
  name: string;
  concept: string;
  price: string;
  qty: string;
  delivery: string;
  good: [string, string];
  tradeoff: string;
}

export interface MockCategory {
  id: string;
  label: string;
  kw: string[];
  product: string;
  defaultUse: string;
  defaultDetail: string;
  questions: MockQuestion[];
  plans: MockPlan[];
}

export const CATEGORIES: MockCategory[] = [
  {
    id: 'mug',
    label: 'マグ・タンブラー',
    kw: ['マグ', 'タンブラー', 'カップ', 'コップ', 'ボトル', '水筒', 'ホーロー', '琺瑯', 'ジョッキ', 'グラス', 'ドリンク'],
    product: 'オリジナルのマグ・タンブラー（ホーロー／ステンレス等）',
    defaultUse: 'アウトドア・日常使いの両方',
    defaultDetail: '飲み口の質感と保温性、ロゴの再現性',
    questions: [
      { id: 'place', title: '主にどこで使いますか？', opts: ['屋外', '室内', '両方'] },
      { id: 'qty', title: '数量のイメージは？', opts: ['まず少量(〜500)', '普通(1,000前後)', '多め(3,000〜)', '未定'] },
    ],
    plans: [
      { key: 'rec', name: 'おすすめ', concept: '品質と価格のバランス重視。国内検品つき', price: '¥980〜1,180', qty: '1,000個〜', delivery: '約60日',
        good: ['塗装・印刷の仕上がりを国内で全数検品してからお届け', 'ギフト箱までワンストップで同じ工場グループに依頼可能'],
        tradeoff: '最小ロットが1,000個からになります' },
      { key: 'small', name: '小ロット優先', concept: 'まず作って、市場の反応を見たい方に', price: '¥1,450〜1,680', qty: '300個〜', delivery: '約45日',
        good: ['300個から生産でき、在庫リスクを小さく始められる', 'サンプルから量産までの切り替えが速い'],
        tradeoff: '単価は量産時より4〜5割ほど高くなります' },
      { key: 'cost', name: '価格優先', concept: '販売価格を抑えたい・数量が見えている方に', price: '¥620〜780', qty: '3,000個〜', delivery: '約75日',
        good: ['大ロット専業工場で単価を大きく圧縮', '箱・付属品も同時生産でさらにコストダウン'],
        tradeoff: '納期が長めで、仕様変更の自由度は下がります' },
    ],
  },
  {
    id: 'bag',
    label: 'バッグ・ポーチ',
    kw: ['バッグ', 'ポーチ', 'トート', 'サコッシュ', '巾着', 'かばん', '鞄', 'リュック', 'エコバッグ', 'ケース', '袋'],
    product: 'オリジナルのバッグ・ポーチ（帆布／ナイロン等）',
    defaultUse: '日常使い・ノベルティ',
    defaultDetail: '生地の風合いと縫製の丈夫さ、プリントの発色',
    questions: [
      { id: 'material', title: '生地のイメージに近いのは？', opts: ['帆布・コットン', 'ナイロン・軽量', 'リサイクル素材'] },
      { id: 'qty', title: '数量のイメージは？', opts: ['まず少量(〜500)', '普通(1,000前後)', '多め(3,000〜)', '未定'] },
    ],
    plans: [
      { key: 'rec', name: 'おすすめ', concept: '定番の帆布で、長く使える一品に', price: '¥720〜890', qty: '1,000枚〜', delivery: '約50日',
        good: ['厚手帆布＋底マチ補強で日常使いに耐える作り', 'シルク印刷2色までこの価格に込み'],
        tradeoff: '生地色は定番8色からの選択になります' },
      { key: 'small', name: '小ロット優先', concept: 'イベントや試験販売にちょうどよく', price: '¥1,050〜1,250', qty: '200枚〜', delivery: '約35日',
        good: ['200枚から作れてイベント日程にも間に合いやすい', '版代を抑えた1色印刷プランあり'],
        tradeoff: '厚手生地・特色印刷は選択肢が絞られます' },
      { key: 'cost', name: '価格優先', concept: '配布用・ノベルティ前提のコスト設計', price: '¥380〜480', qty: '3,000枚〜', delivery: '約65日',
        good: ['軽量生地×大ロットで1枚あたりを大きく圧縮', '個包装・のし対応も低単価で追加可能'],
        tradeoff: '生地は薄手中心で、高級感は控えめになります' },
    ],
  },
  {
    id: 'pet',
    label: 'ペット用品',
    kw: ['ペット', '犬', '猫', 'ドッグ', 'キャット', 'わんちゃん', 'ねこ', 'リード', '首輪', 'ハーネス', 'おやつ', 'フード'],
    product: 'オリジナルのペット用品',
    defaultUse: '自社ブランドでの販売',
    defaultDetail: '安全性（誤飲・素材）とお手入れのしやすさ',
    questions: [
      { id: 'petsize', title: '対象のサイズ帯は？', opts: ['小型', '中型〜大型', 'サイズ展開したい'] },
      { id: 'qty', title: '数量のイメージは？', opts: ['まず少量(〜500)', '普通(1,000前後)', '多め(3,000〜)', '未定'] },
    ],
    plans: [
      { key: 'rec', name: 'おすすめ', concept: '安全基準の確認込みで安心して売れる', price: '¥890〜1,080', qty: '1,000個〜', delivery: '約55日',
        good: ['食品衛生法相当の素材試験レポートを取得してお渡し', 'サイズ2展開まで同一ロット扱いで対応'],
        tradeoff: '試験取得のぶん初回のみ2週間ほど余分にかかります' },
      { key: 'small', name: '小ロット優先', concept: '新ブランドの立ち上げ・反応見に', price: '¥1,280〜1,520', qty: '300個〜', delivery: '約40日',
        good: ['300個からの生産で棚の反応を早く確かめられる', 'パッケージは既製箱＋ラベルで初期費用を圧縮'],
        tradeoff: '素材試験は簡易版になります（販売前に相談推奨）' },
      { key: 'cost', name: '価格優先', concept: '定番化した商品の原価改善に', price: '¥520〜640', qty: '3,000個〜', delivery: '約70日',
        good: ['金型・版を継続利用して原価を段階的に低減', '出荷単位の調整で保管費用も抑えられる'],
        tradeoff: '仕様の細かな変更は次ロットからの反映になります' },
    ],
  },
  {
    id: 'desk',
    label: 'デスク・家具',
    kw: ['デスク', '机', '椅子', 'チェア', '家具', '棚', 'ラック', 'スタンド', 'トレー', '木製', 'スツール', 'テーブル'],
    product: 'オリジナルのデスク・家具・木工品',
    defaultUse: 'オフィス・自宅ワークスペース',
    defaultDetail: '天然木の質感と、ぐらつきのない組み立て精度',
    questions: [
      { id: 'finish', title: '仕上げのイメージに近いのは？', opts: ['木の質感を活かす', '塗装でしっかり着色', '金属と組み合わせ'] },
      { id: 'qty', title: '数量のイメージは？', opts: ['まず少量(〜100)', '普通(300前後)', '多め(1,000〜)', '未定'] },
    ],
    plans: [
      { key: 'rec', name: 'おすすめ', concept: '量産木工の定番ライン。強度試験つき', price: '¥4,800〜5,600', qty: '300台〜', delivery: '約70日',
        good: ['耐荷重・ぐらつきの強度試験レポートつき', '組み立て説明書のデザインまで一式対応'],
        tradeoff: '木材の色味には天然のばらつきが残ります' },
      { key: 'small', name: '小ロット優先', concept: 'クラファン・受注生産スタートに', price: '¥7,200〜8,400', qty: '50台〜', delivery: '約50日',
        good: ['50台から生産でき、受注分だけ作る運用が可能', '試作1台を先行制作して細部を詰められる'],
        tradeoff: '1台あたりの輸送費比率が高くなります' },
      { key: 'cost', name: '価格優先', concept: '規格材ベースでコストを作り込む', price: '¥3,200〜3,900', qty: '1,000台〜', delivery: '約90日',
        good: ['規格材＋ノックダウン設計で物流費まで圧縮', '継続発注で金具類の共通化がさらに効く'],
        tradeoff: '寸法・樹種の自由度は規格の範囲内になります' },
    ],
  },
  {
    id: 'cosme',
    label: 'コスメ容器',
    kw: ['コスメ', '化粧', '容器', 'クリーム', 'リップ', '美容', 'ジャー', 'ポンプ', 'チューブ', 'スキンケア', 'パッケージ容器'],
    product: 'オリジナルのコスメ容器・パッケージ',
    defaultUse: '自社コスメブランドでの販売',
    defaultDetail: '中身との相性（気密性）と、手に取ったときの高級感',
    questions: [
      { id: 'content', title: '中身のタイプは？', opts: ['クリーム・バーム', '液体・ミスト', 'スティック'] },
      { id: 'qty', title: '数量のイメージは？', opts: ['まず少量(〜1,000)', '普通(3,000前後)', '多め(10,000〜)', '未定'] },
    ],
    plans: [
      { key: 'rec', name: 'おすすめ', concept: '既製金型×オリジナル加飾で上質に', price: '¥180〜240', qty: '3,000個〜', delivery: '約60日',
        good: ['気密試験・落下試験を実施したうえで納品', '箔押し・マット塗装など加飾の選択肢が豊富'],
        tradeoff: '形状そのものは既製金型の範囲からの選択です' },
      { key: 'small', name: '小ロット優先', concept: '処方テスト・先行販売の分だけ', price: '¥320〜420', qty: '500個〜', delivery: '約40日',
        good: ['500個からスタートでき、ラベルで世界観を作れる', '中身充填パートナーの紹介まで対応'],
        tradeoff: '加飾は印刷ラベル中心になります' },
      { key: 'cost', name: '価格優先', concept: '定番SKUの容器原価を下げる', price: '¥95〜130', qty: '10,000個〜', delivery: '約75日',
        good: ['大ロット成形で1個あたりを大幅に圧縮', '年間発注計画とあわせた分納で倉庫費も削減'],
        tradeoff: 'ロットが大きく、初回からの採用はリスクがあります' },
    ],
  },
  {
    id: 'zakka',
    label: '生活雑貨',
    kw: [],
    product: 'オリジナルの生活雑貨',
    defaultUse: '日常使い・ギフト',
    defaultDetail: '手に取ったときの質感と、贈りやすいパッケージ',
    questions: [
      { id: 'place', title: '主にどこで使いますか？', opts: ['屋外', '室内', '両方'] },
      { id: 'qty', title: '数量のイメージは？', opts: ['まず少量(〜500)', '普通(1,000前後)', '多め(3,000〜)', '未定'] },
    ],
    plans: [
      { key: 'rec', name: 'おすすめ', concept: '類似事例の多い定番工場で手堅く', price: '¥850〜1,050', qty: '1,000個〜', delivery: '約55日',
        good: ['類似商品の生産実績がある工場を選定してご提案', '素材・仕上げのサンプルを見比べてから決められる'],
        tradeoff: '仕様確定までに1度お打ち合わせをお願いします' },
      { key: 'small', name: '小ロット優先', concept: 'まず形にして、手応えを確かめる', price: '¥1,200〜1,450', qty: '300個〜', delivery: '約40日',
        good: ['300個から生産でき、初期投資を抑えられる', '試作サンプルを最短2週間でお手元に'],
        tradeoff: '単価は量産時より高めになります' },
      { key: 'cost', name: '価格優先', concept: '数量前提でしっかり原価を作る', price: '¥520〜680', qty: '3,000個〜', delivery: '約70日',
        good: ['大ロット前提の工場選定で単価を圧縮', 'パッケージ同時生産でトータルコストを最適化'],
        tradeoff: '納期に余裕を見ていただく必要があります' },
    ],
  },
];

function zenToHan(s: string): string {
  return s
    .replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/，/g, ',')
    .replace(/．/g, '.');
}

export function classify(text: string): MockCategory {
  let best: MockCategory | null = null;
  let bestScore = 0;
  for (const cat of CATEGORIES) {
    let score = 0;
    for (const k of cat.kw) {
      if (text.includes(k)) score += k.length >= 3 ? 2 : 1;
    }
    if (score > bestScore) {
      bestScore = score;
      best = cat;
    }
  }
  return best || CATEGORIES[CATEGORIES.length - 1];
}

export interface MockAnalysisRow {
  key: string;
  label: string;
  value: string;
  src: 'user' | 'ai';
}

export function mockAnalyze(rawText: string): {
  cat: MockCategory;
  rows: MockAnalysisRow[];
  qtyKnown: boolean;
  budgetKnown: boolean;
} {
  const text = zenToHan(rawText);
  const cat = classify(text);

  // 数量抽出: 「500個」「1,000枚」「3000本」など
  let qty: string | null = null;
  const qm = text.match(/([0-9][0-9,]*)\s*(万)?\s*(個|本|枚|台|セット|ロット|pcs|着|袋)/i);
  if (qm) {
    const n = Number(qm[1].replace(/,/g, '')) * (qm[2] ? 10000 : 1);
    qty = `${n.toLocaleString()}${qm[3]}`;
  }

  // 予算抽出: 「300円」「50万円」「単価800円」など
  let budget: string | null = null;
  const bm = text.match(/([0-9][0-9,]*)\s*(万円|円)/);
  if (bm) {
    const n = Number(bm[1].replace(/,/g, ''));
    const before = text.slice(Math.max(0, (bm.index ?? 0) - 8), bm.index ?? 0);
    if (/単価|1個|一個|1枚|1本/.test(before)) {
      budget = `1個あたり ${n.toLocaleString()}${bm[2]}`;
    } else {
      budget =
        n.toLocaleString() +
        bm[2] +
        (bm[2] === '円' && n < 10000 ? '（単価の目安として解釈）' : '（総予算として解釈）');
    }
  }

  const USES: [string, string][] = [
    ['ギフト', 'ギフト・贈答用'], ['贈答', 'ギフト・贈答用'], ['プレゼント', 'ギフト・贈答用'],
    ['ノベルティ', 'ノベルティ・配布用'], ['配る', 'ノベルティ・配布用'], ['配布', 'ノベルティ・配布用'],
    ['キャンプ', 'アウトドア・キャンプ'], ['アウトドア', 'アウトドア・キャンプ'], ['登山', 'アウトドア・キャンプ'],
    ['記念', '記念品'], ['周年', '周年記念品'],
    ['販売', '自社ブランドでの販売'], ['自社ブランド', '自社ブランドでの販売'], ['ストア', '自社ブランドでの販売'],
    ['オフィス', 'オフィス・職場'], ['店舗', '店舗での利用・販売'],
  ];
  let use: string | null = null;
  for (const [k, v] of USES) {
    if (text.includes(k)) { use = v; break; }
  }

  const DETAILS: [string, string][] = [
    ['ロゴ', 'ロゴ入れ'], ['名入れ', '名入れ'], ['刻印', '刻印'], ['箔押し', '箔押し'],
    ['箱', 'ギフト箱・化粧箱'], ['パッケージ', 'オリジナルパッケージ'],
    ['保温', '保温性'], ['保冷', '保冷性'], ['撥水', '撥水・防水'], ['防水', '撥水・防水'],
    ['エコ', '環境配慮素材'], ['リサイクル', '環境配慮素材'], ['サステ', '環境配慮素材'],
    ['食洗機', '食洗機対応'], ['レンジ', '電子レンジ対応'], ['軽量', '軽さ'], ['丈夫', '丈夫さ'],
  ];
  const found: string[] = [];
  for (const [k, v] of DETAILS) {
    if (text.includes(k) && !found.includes(v)) found.push(v);
  }
  const detail = found.length ? found.join('・') : null;

  return {
    cat,
    rows: [
      { key: 'product', label: '商品', value: cat.product, src: 'user' },
      { key: 'use', label: '用途', value: use || cat.defaultUse, src: use ? 'user' : 'ai' },
      { key: 'detail', label: 'こだわり', value: detail || cat.defaultDetail, src: detail ? 'user' : 'ai' },
      { key: 'qty', label: '数量', value: qty || '未定（あとで決められます）', src: qty ? 'user' : 'ai' },
      { key: 'budget', label: '予算', value: budget || '未定（あとで決められます）', src: budget ? 'user' : 'ai' },
    ],
    qtyKnown: !!qty,
    budgetKnown: !!budget,
  };
}

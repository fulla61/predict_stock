/**
 * 経理メール自動化 ── 設定
 *
 * 本リポジトリは公開のため、スプレッドシートID・フォルダIDは
 * ソースに埋め込まず Script Properties から読む。
 * 初回のみ Setup.gs の initProperties() を実行して登録すること。
 *
 * 対応ルール: docs/accounting-email-rules.md
 */

/** Script Properties から必須設定を読む。未設定なら即座に落とす。 */
function CFG() {
  if (CFG._cache) return CFG._cache;

  var p = PropertiesService.getScriptProperties();
  function need(key) {
    var v = p.getProperty(key);
    if (!v) {
      throw new Error(
        'Script Property "' + key + '" が未設定です。Setup.gs の initProperties() を実行してください。'
      );
    }
    return v;
  }

  CFG._cache = {
    LEDGER_ID: need('LEDGER_ID'),          // 経理_請求管理台帳（自動連携）
    MASTER_ID: need('MASTER_ID'),          // 経理_取引先マスタ
    CLIENTS_FOLDER_ID: need('CLIENTS_FOLDER_ID'), // 10_クライアント（受発注・請求・納品）
    ARCHIVE_FOLDER_ID: need('ARCHIVE_FOLDER_ID'), // 90_アーカイブ
    NOTIFY_TO: need('NOTIFY_TO')           // 社内リマインドの送信先
  };
  return CFG._cache;
}

/** 自社側Cc ── 全送信メールに常時付与する（ルール §4.3） */
var INTERNAL_CC = [
  'info@crossimage.jp',
  'koizumi@crossimage.jp',
  'chen@crossimage.jp'
];

/** ラベル名 ── ルール §9.1 の体系と一致させること */
var L = {
  INV_SENT:     '01_請求/送付済',
  INV_WAITING:  '01_請求/入金待ち',
  INV_PAID:     '01_請求/入金済',
  INV_DUNNING:  '01_請求/督促中',
  PO_TODO:      '02_発注書/未対応',
  PO_INVOICED:  '02_発注書/請求済',
  QT_SENT:      '03_見積/送付済',
  QT_WON:       '03_見積/受注',
  QT_LOST:      '03_見積/失注',
  PAYABLE:      '04_支払',
  ACC_FREEE:    '05_会計/freee',
  ACC_TAX:      '05_会計/税理士',
  ACTION:       '99_要対応',
  CLIENT_PREFIX:'06_取引先/'
};

/** 台帳のステータス値 ── ルール §8.1 */
var ST = {
  DRAFT:    '未送付',
  WAITING:  '入金待ち',
  PAID:     '入金済',
  DUNNING:  '督促中',
  SETTLED:  '相殺・精算済'   // 督促対象外。誤督促防止の要（ルール §8.3）
};

/** 台帳の列順。CSVヘッダと完全一致させること。 */
var COL = {
  INVOICE_NO: 0, CLIENT_CODE: 1, CLIENT_NAME: 2, PROJECT: 3, PO_NO: 4,
  KIND: 5, ISSUE_DATE: 6, NET: 7, TAX: 8, GROSS: 9, DUE_DATE: 10,
  PLANNED_DATE: 11, PAID_DATE: 12, PAID_AMOUNT: 13, DIFF: 14,
  STATUS: 15, THREAD_ID: 16, DRIVE_URL: 17, NOTE: 18
};
var LEDGER_COLS = 19;

/** 督促スケジュール（営業日オフセット）── ルール §8.2 */
var DUNNING = {
  PRE_REMIND: -3,   // 社内リマインドのみ。先方には送らない
  RECONCILE:   1,   // 入金照合
  FIRST:       3,   // 一次督促 T6-1
  SECOND:     10,   // 二次督促 T6-2
  THIRD:      20    // 三次督促 T6-3（社内エスカレーション必須）
};

/** 受信トレイをスキップするノイズ送信元 ── ルール §9.2 F12 */
var NOISE_SENDERS = [
  'info@tailscale.com',
  'events@tailscale.com',
  'workspace-noreply@google.com',
  'googleaistudio-noreply@google.com',
  'drive-shares-dm-noreply@google.com'
];

/** 会計関連の送信元ドメイン */
var ACCOUNTING_DOMAINS = {
  'freee.co.jp': L.ACC_FREEE,
  'sustainable-accounting.com': L.ACC_TAX
};

/** 自社ドメイン。送信メール判定に使う。 */
var OWN_DOMAIN = 'crossimage.jp';

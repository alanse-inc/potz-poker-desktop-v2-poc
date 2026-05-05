export type Suit = "spade" | "heart" | "diamond" | "club";
export type CardValue =
  | "2"
  | "3"
  | "4"
  | "5"
  | "6"
  | "7"
  | "8"
  | "9"
  | "T"
  | "J"
  | "Q"
  | "K"
  | "A";
export type Card = { suit: Suit; value: CardValue };
export type Phase = "pre_flop" | "flop" | "turn" | "river" | "showdown";
export type Player = {
  position: number;
  name: string;
  stack: number;
  hand: [Card, Card] | null;
  betInRound: number;
  hasFolded: boolean;
  isAllIn: boolean;
  hasActed: boolean;
  totalInvested: number;
};
export type Pot = { amount: number };
export type TexasHoldemBoard = {
  handNumber: number;
  dealerPosition: number;
  sbPosition: number;
  bbPosition: number;
  currentTurn: number;
  currentBet: number;
  /** 直近のレイズ幅。最低再レイズ額の計算に使用。ラウンドリセット時は 0。 */
  lastRaiseSize: number;
  players: Player[];
  communityCards: Card[];
  pots: Pot[];
  phase: Phase;
  winners: number[];
};
export type GameSettings = {
  smallBlind: number;
  bigBlind: number;
  minChip: number;
  bbAnte: boolean;
};
export type TelopState = {
  message: string;
  color: string;
  /** テロップ表示モード */
  mode?: "basic" | "classic" | "modern" | "broadcast";
};
export type HandRank =
  | "high_card"
  | "one_pair"
  | "two_pair"
  | "three_of_a_kind"
  | "straight"
  | "flush"
  | "full_house"
  | "four_of_a_kind"
  | "straight_flush"
  | "royal_straight_flush";
export type EvaluatedHand = { rank: HandRank; kickers: CardValue[] };

// ---------------------------------------------------------------------------
// RFID 関連型
// ---------------------------------------------------------------------------

/** カードが配布される位置 */
export type CardPosition =
  | { type: "playerHand"; seat: number }
  | { type: "communityCard"; slot: number }
  | { type: "burnCard" };

/** カード配置イベントペイロード (card_placed) */
export type CardPlacedPayload = {
  rfid: string;
  card: Card;
  position: CardPosition;
};

/** 未登録 RFID イベントペイロード (card_placed_unregistered) */
export type CardPlacedUnregisteredPayload = {
  rfid: string;
};

/** 登録モード中 RFID イベントペイロード (card_placed_register) */
export type CardPlacedRegisterPayload = {
  rfid: string;
};

/** ゲーム未開始時 RFID イベントペイロード (card_placed_no_board) */
export type CardPlacedNoBoardPayload = {
  rfid: string;
};

/** シリアル接続状態 */
export type SerialStatus = {
  connected: boolean;
  portName: string | null;
};

/** RFID → Card マッピング */
export type RfidCardMapping = {
  id: string;
  name: string;
  cards: Record<string, Card>;
};

export type AccountInfo = { appVersion: string };

// ---------------------------------------------------------------------------
// テキサスホールデム初期ボード (initial_board_context 用)
// ---------------------------------------------------------------------------

/** ゲーム開始前の初期ボード状態 */
export type TexasHoldemInitialBoard = {
  /** ハンドナンバー */
  handNumber: number;
  /** ディーラーポジション */
  dealerPosition: number;
  /** プレイヤー一覧 */
  players: Player[];
  /** ゲーム設定 */
  settings: GameSettings;
};

// ---------------------------------------------------------------------------
// テロップ設定 (telop_context 用)
// ---------------------------------------------------------------------------

/** テロップ ID (表示テンプレート種別) */
export type TelopId = "basic" | "classic" | "broadcast" | "modern";

/** テロップ画面状態 */
export type TelopScreenState =
  | "manual-setting"
  | "auto-setting"
  | "playing"
  | null;

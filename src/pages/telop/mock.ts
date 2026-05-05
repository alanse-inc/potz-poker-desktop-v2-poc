/**
 * テロップ設定プレビュー用モックデータ
 * 本番ビルドでは実際のゲームデータを使用する
 */
import type { Player, TexasHoldemBoard } from "../../types";

const MOCK_PLAYERS: Player[] = [
  {
    position: 0,
    name: "SAKURARA",
    stack: 1000000,
    hand: [
      { suit: "spade", value: "A" },
      { suit: "heart", value: "K" },
    ],
    betInRound: 100000,
    hasFolded: false,
    isAllIn: false,
    hasActed: true,
  },
  {
    position: 1,
    name: "TARO",
    stack: 800000,
    hand: [
      { suit: "club", value: "Q" },
      { suit: "diamond", value: "J" },
    ],
    betInRound: 50000,
    hasFolded: false,
    isAllIn: false,
    hasActed: true,
  },
  {
    position: 2,
    name: "JIRO",
    stack: 700000,
    hand: [
      { suit: "heart", value: "9" },
      { suit: "spade", value: "8" },
    ],
    betInRound: 25000,
    hasFolded: false,
    isAllIn: false,
    hasActed: false,
  },
  {
    position: 3,
    name: "HANAKO",
    stack: 600000,
    hand: [
      { suit: "diamond", value: "7" },
      { suit: "club", value: "6" },
    ],
    betInRound: 10000,
    hasFolded: false,
    isAllIn: false,
    hasActed: true,
  },
  {
    position: 4,
    name: "YUKI",
    stack: 500000,
    hand: [
      { suit: "spade", value: "5" },
      { suit: "heart", value: "4" },
    ],
    betInRound: 5000,
    hasFolded: true,
    isAllIn: false,
    hasActed: true,
  },
  {
    position: 5,
    name: "KENTA",
    stack: 400000,
    hand: [
      { suit: "club", value: "3" },
      { suit: "diamond", value: "2" },
    ],
    betInRound: 0,
    hasFolded: false,
    isAllIn: false,
    hasActed: false,
  },
];

export const MOCK_BOARD: TexasHoldemBoard = {
  handNumber: 1,
  dealerPosition: 0,
  sbPosition: 1,
  bbPosition: 2,
  currentTurn: 2,
  currentBet: 100000,
  lastRaiseSize: 100000,
  players: MOCK_PLAYERS,
  communityCards: [
    { suit: "spade", value: "K" },
    { suit: "heart", value: "Q" },
    { suit: "diamond", value: "J" },
  ],
  pots: [{ amount: 185000 }],
  phase: "flop",
  winners: [],
};

/**
 * Auto Game ボード初期化ワークフロー
 */

import { err, ok, type Result } from "neverthrow";
import {
  assignPositions,
  initializePlayers,
} from "../../domain/auto_game/player";
import type {
  AutoModeBoard,
  AutoModeGameSetting,
  AutoModePlayer,
} from "../../domain/auto_game/types";

export type InitializeBoardError =
  | { kind: "insufficient_players" }
  | { kind: "no_btn_player" };

/**
 * ゲームボードを初期化する
 *
 * validate ステップ: プレイヤー数チェック + BTN プレイヤー存在チェック
 * initialize ステップ: プレイヤー配列構築 + ポジション割り当て
 *
 * @param setting ゲーム設定
 * @param players プレイヤー一覧 (ポジション設定済み)
 * @param handNumber ハンド番号
 */
export function initializeBoard(args: {
  setting: AutoModeGameSetting;
  players: (Pick<AutoModePlayer, "id" | "name" | "icon" | "seat"> & {
    position?: AutoModePlayer["position"];
  })[];
  btnPlayerId?: string;
  handNumber: number;
}): Result<AutoModeBoard, InitializeBoardError> {
  return ok(args)
    .andThen(validate)
    .andThen(({ resolvedBtnPlayerId }) =>
      initialize({
        setting: args.setting,
        players: args.players,
        btnPlayerId: resolvedBtnPlayerId,
        handNumber: args.handNumber,
      }),
    );
}

// --- ステップ: validate ---

function validate(args: {
  players: (Pick<AutoModePlayer, "id" | "name" | "icon" | "seat"> & {
    position?: AutoModePlayer["position"];
  })[];
  btnPlayerId?: string;
}): Result<{ resolvedBtnPlayerId: string }, InitializeBoardError> {
  const { players, btnPlayerId } = args;

  if (players.length < 2) {
    return err({ kind: "insufficient_players" });
  }

  // btnPlayerId が明示されていない場合は players の position から解決する
  const resolvedBtnPlayerId =
    btnPlayerId ??
    players.find((p) => p.position === "btn" || p.position === "btn_sb")?.id;

  if (!resolvedBtnPlayerId) {
    return err({ kind: "no_btn_player" });
  }

  return ok({ resolvedBtnPlayerId });
}

// --- ステップ: initialize ---

function initialize(args: {
  setting: AutoModeGameSetting;
  players: Pick<AutoModePlayer, "id" | "name" | "icon" | "seat">[];
  btnPlayerId: string;
  handNumber: number;
}): Result<AutoModeBoard, never> {
  const { setting, players, btnPlayerId, handNumber } = args;

  const initializedPlayers = initializePlayers(players);
  const playersWithPositions = assignPositions(initializedPlayers, btnPlayerId);

  const board: AutoModeBoard = {
    setting,
    players: playersWithPositions,
    communityCards: [],
    burnCards: [],
    handNumber,
    winners: null,
  };

  return ok(board);
}

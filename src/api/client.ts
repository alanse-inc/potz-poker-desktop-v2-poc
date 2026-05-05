import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type {
  Card,
  CardPlacedPayload,
  CardPlacedRegisterPayload,
  CardPlacedUnregisteredPayload,
  CardPosition,
  EvaluatedHand,
  GameSettings,
  RfidCardMapping,
  SerialStatus,
  TelopId,
  TelopScreenState,
  TelopState,
  TexasHoldemBoard,
  TexasHoldemInitialBoard,
} from "../types";

export const api = {
  board: {
    getBoard: () => invoke<TexasHoldemBoard | null>("get_board"),
    startGame: (params: {
      smallBlind: number;
      bigBlind: number;
      minChip: number;
      bbAnte: boolean;
      playerNames: string[];
      dealerPosition: number;
    }) => invoke<TexasHoldemBoard>("start_game", params),
    moveNextGame: () => invoke<TexasHoldemBoard>("move_next_game"),
    resetBoard: () => invoke<void>("reset_board"),
    backBoard: () => invoke<TexasHoldemBoard>("back_board"),
    evaluateHand: (position: number) =>
      invoke<EvaluatedHand>("evaluate_player_hand", { position }),
    editCommunityCard: (locateNumber: number, card: Card) =>
      invoke<TexasHoldemBoard>("set_community_card", { locateNumber, card }),
    getRemainingDeck: () => invoke<Card[]>("get_remaining_deck"),
    updatePlayer: (params: {
      position: number;
      name?: string;
      stack?: number;
    }) => invoke<TexasHoldemBoard>("update_player", params),
    addPlayer: (name: string) =>
      invoke<TexasHoldemBoard>("add_player", { name }),
    removePlayer: (position: number) =>
      invoke<TexasHoldemBoard>("remove_player", { position }),
  },
  action: {
    bet: (amount: number) =>
      invoke<TexasHoldemBoard>("bet", { amount: Math.trunc(amount) }),
    call: () => invoke<TexasHoldemBoard>("call"),
    check: () => invoke<TexasHoldemBoard>("check"),
    fold: () => invoke<TexasHoldemBoard>("fold"),
    raise: (amount: number) =>
      invoke<TexasHoldemBoard>("raise", { amount: Math.trunc(amount) }),
    allin: () => invoke<TexasHoldemBoard>("allin"),
    expose: (exposeCard: Card) => invoke<Card>("expose", { exposeCard }),
  },
  gameSettings: {
    load: () => invoke<GameSettings>("load_game_settings"),
    save: (settings: GameSettings) =>
      invoke<void>("save_game_settings", { settings }),
  },
  telop: {
    open: () => invoke<void>("open_telop_window"),
    close: () => invoke<void>("close_telop_window"),
    isOpen: () => invoke<boolean>("is_telop_window_open"),
    setMessage: (message: string) =>
      invoke<void>("set_telop_message", { message }),
    setColor: (color: string) => invoke<void>("set_telop_color", { color }),
    getState: () => invoke<TelopState>("get_telop_state"),
  },
  deck: {
    getAllDecks: () => invoke<RfidCardMapping[]>("get_all_decks"),
    getDeckById: (id: string) =>
      invoke<RfidCardMapping | null>("get_deck_by_id", { id }),
    saveDeck: (deck: RfidCardMapping) =>
      invoke<RfidCardMapping>("save_deck", { args: { deck } }),
    deleteDeck: (id: string) => invoke<void>("delete_deck", { args: { id } }),
    chooseDeck: (id: string) => invoke<void>("choose_deck", { args: { id } }),
    getCurrentDeck: () => invoke<RfidCardMapping | null>("get_current_deck"),
  },
  rfid: {
    getMapping: () => invoke<RfidCardMapping>("get_rfid_card_mapping"),
    registerCard: (rfid: string, card: Card) =>
      invoke<RfidCardMapping>("register_rfid_card", { args: { rfid, card } }),
    unregisterCard: (rfid: string) =>
      invoke<RfidCardMapping>("unregister_rfid_card", { args: { rfid } }),
    setRegisterMode: (enabled: boolean) =>
      invoke<void>("set_register_mode", { args: { enabled } }),
    getSerialStatus: () => invoke<SerialStatus>("get_serial_status"),
    applyCardPlaced: (rfid: string, card: Card, position: CardPosition) =>
      invoke<void>("apply_card_placed", { rfid, card, position }),
  },
  notifications: {
    onBoardUpdated: (
      cb: (board: TexasHoldemBoard | null) => void,
    ): Promise<UnlistenFn> =>
      listen<TexasHoldemBoard | null>("board_updated", (e) => cb(e.payload)),
    onTelopUpdated: (cb: (state: TelopState) => void): Promise<UnlistenFn> =>
      listen<TelopState>("telop_updated", (e) => cb(e.payload)),
    onCardPlaced: (
      cb: (payload: CardPlacedPayload) => void,
    ): Promise<UnlistenFn> =>
      listen<CardPlacedPayload>("card_placed", (e) => cb(e.payload)),
    onCardPlacedUnregistered: (
      cb: (payload: CardPlacedUnregisteredPayload) => void,
    ): Promise<UnlistenFn> =>
      listen<CardPlacedUnregisteredPayload>("card_placed_unregistered", (e) =>
        cb(e.payload),
      ),
    onCardPlacedRegister: (
      cb: (payload: CardPlacedRegisterPayload) => void,
    ): Promise<UnlistenFn> =>
      listen<CardPlacedRegisterPayload>("card_placed_register", (e) =>
        cb(e.payload),
      ),
    onSerialStatusUpdated: (
      cb: (status: SerialStatus) => void,
    ): Promise<UnlistenFn> =>
      listen<SerialStatus>("serial_status_updated", (e) => cb(e.payload)),
    onTelopIdUpdated: (cb: (telopId: TelopId) => void): Promise<UnlistenFn> =>
      listen<TelopId>("telop_id_updated", (e) => cb(e.payload)),
    onTelopBackgroundColorUpdated: (
      cb: (color: string) => void,
    ): Promise<UnlistenFn> =>
      listen<string>("telop_background_color_updated", (e) => cb(e.payload)),
    onTelopCurrentScreenUpdated: (
      cb: (screen: TelopScreenState) => void,
    ): Promise<UnlistenFn> =>
      listen<TelopScreenState>("telop_current_screen_updated", (e) =>
        cb(e.payload),
      ),
    onInitialBoardUpdated: (
      cb: (board: TexasHoldemInitialBoard | null) => void,
    ): Promise<UnlistenFn> =>
      listen<TexasHoldemInitialBoard | null>("initial_board_updated", (e) =>
        cb(e.payload),
      ),
  },
  initialBoard: {
    getInitialBoard: (): Promise<TexasHoldemInitialBoard | null> =>
      invoke<TexasHoldemInitialBoard | null>("get_initial_board"),
  },
  telopSettings: {
    getTelopId: (): Promise<TelopId> => invoke<TelopId>("get_telop_id"),
    setTelopId: (telopId: TelopId): Promise<void> =>
      invoke<void>("set_telop_id", { telopId }),
    getBackgroundColor: (): Promise<string> =>
      invoke<string>("get_telop_background_color"),
    setBackgroundColor: (color: string): Promise<void> =>
      invoke<void>("set_telop_background_color", { color }),
    getCurrentScreen: (): Promise<TelopScreenState> =>
      invoke<TelopScreenState>("get_telop_current_screen"),
    setCurrentScreen: (screen: TelopScreenState): Promise<void> =>
      invoke<void>("set_telop_current_screen", { screen }),
  },
};

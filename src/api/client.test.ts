import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "./client";

describe("api.board", () => {
  beforeEach(() => {
    vi.mocked(invoke).mockResolvedValue(null);
  });

  it("getBoard() calls invoke('get_board')", async () => {
    await api.board.getBoard();
    expect(invoke).toHaveBeenCalledWith("get_board");
  });

  it("startGame() calls invoke('start_game', params)", async () => {
    const params = {
      smallBlind: 100,
      bigBlind: 200,
      buyIn: 10000,
      playerNames: ["Alice", "Bob"],
    };
    await api.board.startGame(params);
    expect(invoke).toHaveBeenCalledWith("start_game", params);
  });

  it("moveNextGame() calls invoke('move_next_game')", async () => {
    await api.board.moveNextGame();
    expect(invoke).toHaveBeenCalledWith("move_next_game");
  });

  it("resetBoard() calls invoke('reset_board')", async () => {
    await api.board.resetBoard();
    expect(invoke).toHaveBeenCalledWith("reset_board");
  });

  it("backBoard() calls invoke('back_board')", async () => {
    await api.board.backBoard();
    expect(invoke).toHaveBeenCalledWith("back_board");
  });
});

describe("api.action", () => {
  beforeEach(() => {
    vi.mocked(invoke).mockResolvedValue(null);
  });

  it("bet(500) calls invoke('bet', { amount: 500 })", async () => {
    await api.action.bet(500);
    expect(invoke).toHaveBeenCalledWith("bet", { amount: 500 });
  });

  it("call() calls invoke('call')", async () => {
    await api.action.call();
    expect(invoke).toHaveBeenCalledWith("call");
  });

  it("check() calls invoke('check')", async () => {
    await api.action.check();
    expect(invoke).toHaveBeenCalledWith("check");
  });

  it("fold() calls invoke('fold')", async () => {
    await api.action.fold();
    expect(invoke).toHaveBeenCalledWith("fold");
  });

  it("raise(1000) calls invoke('raise', { amount: 1000 })", async () => {
    await api.action.raise(1000);
    expect(invoke).toHaveBeenCalledWith("raise", { amount: 1000 });
  });

  it("allin() calls invoke('allin')", async () => {
    await api.action.allin();
    expect(invoke).toHaveBeenCalledWith("allin");
  });
});

describe("api.gameSettings", () => {
  beforeEach(() => {
    vi.mocked(invoke).mockResolvedValue(null);
  });

  it("load() calls invoke('load_game_settings')", async () => {
    await api.gameSettings.load();
    expect(invoke).toHaveBeenCalledWith("load_game_settings");
  });

  it("save(settings) calls invoke('save_game_settings', { settings })", async () => {
    const settings = { smallBlind: 100, bigBlind: 200, buyIn: 10000 };
    await api.gameSettings.save(settings);
    expect(invoke).toHaveBeenCalledWith("save_game_settings", { settings });
  });
});

describe("api.telop", () => {
  beforeEach(() => {
    vi.mocked(invoke).mockResolvedValue(null);
  });

  it("open() calls invoke('open_telop_window')", async () => {
    await api.telop.open();
    expect(invoke).toHaveBeenCalledWith("open_telop_window");
  });

  it("close() calls invoke('close_telop_window')", async () => {
    await api.telop.close();
    expect(invoke).toHaveBeenCalledWith("close_telop_window");
  });

  it("setMessage('hello') calls invoke('set_telop_message', { message: 'hello' })", async () => {
    await api.telop.setMessage("hello");
    expect(invoke).toHaveBeenCalledWith("set_telop_message", {
      message: "hello",
    });
  });

  it("setColor('#ff0000') calls invoke('set_telop_color', { color: '#ff0000' })", async () => {
    await api.telop.setColor("#ff0000");
    expect(invoke).toHaveBeenCalledWith("set_telop_color", {
      color: "#ff0000",
    });
  });

  it("getState() calls invoke('get_telop_state')", async () => {
    await api.telop.getState();
    expect(invoke).toHaveBeenCalledWith("get_telop_state");
  });
});

describe("api.rfid", () => {
  beforeEach(() => {
    vi.mocked(invoke).mockResolvedValue(null);
  });

  it("getMapping() calls invoke('get_rfid_card_mapping')", async () => {
    await api.rfid.getMapping();
    expect(invoke).toHaveBeenCalledWith("get_rfid_card_mapping");
  });

  it("registerCard(rfid, card) calls invoke('register_rfid_card', { rfid, card })", async () => {
    const card = { suit: "spade" as const, value: "A" as const };
    await api.rfid.registerCard("A1B2C3D4E5F678", card);
    expect(invoke).toHaveBeenCalledWith("register_rfid_card", {
      rfid: "A1B2C3D4E5F678",
      card,
    });
  });

  it("unregisterCard(rfid) calls invoke('unregister_rfid_card', { rfid })", async () => {
    await api.rfid.unregisterCard("A1B2C3D4E5F678");
    expect(invoke).toHaveBeenCalledWith("unregister_rfid_card", {
      rfid: "A1B2C3D4E5F678",
    });
  });

  it("setRegisterMode(true) calls invoke('set_register_mode', { enabled: true })", async () => {
    await api.rfid.setRegisterMode(true);
    expect(invoke).toHaveBeenCalledWith("set_register_mode", { enabled: true });
  });

  it("getSerialStatus() calls invoke('get_serial_status')", async () => {
    await api.rfid.getSerialStatus();
    expect(invoke).toHaveBeenCalledWith("get_serial_status");
  });

  it("applyCardPlaced calls invoke('apply_card_placed', { rfid, card, position })", async () => {
    const card = { suit: "heart" as const, value: "K" as const };
    const position = { type: "communityCard" as const, slot: 0 };
    await api.rfid.applyCardPlaced("RFID0000000001", card, position);
    expect(invoke).toHaveBeenCalledWith("apply_card_placed", {
      rfid: "RFID0000000001",
      card,
      position,
    });
  });
});

describe("api.notifications", () => {
  it("onBoardUpdated(cb) calls listen('board_updated', ...) and invokes cb with payload", async () => {
    const cb = vi.fn();
    const fakePayload = { handNumber: 1 };

    let capturedHandler: ((e: { payload: unknown }) => void) | undefined;
    vi.mocked(listen).mockImplementation(
      async (_event, handler: (e: { payload: unknown }) => void) => {
        capturedHandler = handler;
        return () => {};
      },
    );

    await api.notifications.onBoardUpdated(cb);

    expect(listen).toHaveBeenCalledWith("board_updated", expect.any(Function));

    // payload を simulate
    capturedHandler?.({ payload: fakePayload });
    expect(cb).toHaveBeenCalledWith(fakePayload);
  });

  it("onTelopUpdated(cb) calls listen('telop_updated', ...) and invokes cb with payload", async () => {
    const cb = vi.fn();
    const fakePayload = { message: "test", color: "#fff" };

    let capturedHandler: ((e: { payload: unknown }) => void) | undefined;
    vi.mocked(listen).mockImplementation(
      async (_event, handler: (e: { payload: unknown }) => void) => {
        capturedHandler = handler;
        return () => {};
      },
    );

    await api.notifications.onTelopUpdated(cb);

    expect(listen).toHaveBeenCalledWith("telop_updated", expect.any(Function));

    capturedHandler?.({ payload: fakePayload });
    expect(cb).toHaveBeenCalledWith(fakePayload);
  });

  it("onCardPlaced(cb) calls listen('card_placed', ...) and invokes cb with payload", async () => {
    const cb = vi.fn();
    const fakePayload = {
      rfid: "A1B2C3D4E5F678",
      card: { suit: "spade", value: "A" },
      position: { type: "communityCard", slot: 0 },
    };

    let capturedHandler: ((e: { payload: unknown }) => void) | undefined;
    vi.mocked(listen).mockImplementation(
      async (_event, handler: (e: { payload: unknown }) => void) => {
        capturedHandler = handler;
        return () => {};
      },
    );

    await api.notifications.onCardPlaced(cb);
    expect(listen).toHaveBeenCalledWith("card_placed", expect.any(Function));

    capturedHandler?.({ payload: fakePayload });
    expect(cb).toHaveBeenCalledWith(fakePayload);
  });

  it("onCardPlacedUnregistered(cb) calls listen('card_placed_unregistered', ...)", async () => {
    const cb = vi.fn();
    const fakePayload = { rfid: "A1B2C3D4E5F678" };

    let capturedHandler: ((e: { payload: unknown }) => void) | undefined;
    vi.mocked(listen).mockImplementation(
      async (_event, handler: (e: { payload: unknown }) => void) => {
        capturedHandler = handler;
        return () => {};
      },
    );

    await api.notifications.onCardPlacedUnregistered(cb);
    expect(listen).toHaveBeenCalledWith(
      "card_placed_unregistered",
      expect.any(Function),
    );

    capturedHandler?.({ payload: fakePayload });
    expect(cb).toHaveBeenCalledWith(fakePayload);
  });

  it("onSerialStatusUpdated(cb) calls listen('serial_status_updated', ...)", async () => {
    const cb = vi.fn();
    const fakePayload = { connected: true, portName: "/dev/tty.usbmodem1234" };

    let capturedHandler: ((e: { payload: unknown }) => void) | undefined;
    vi.mocked(listen).mockImplementation(
      async (_event, handler: (e: { payload: unknown }) => void) => {
        capturedHandler = handler;
        return () => {};
      },
    );

    await api.notifications.onSerialStatusUpdated(cb);
    expect(listen).toHaveBeenCalledWith(
      "serial_status_updated",
      expect.any(Function),
    );

    capturedHandler?.({ payload: fakePayload });
    expect(cb).toHaveBeenCalledWith(fakePayload);
  });
});

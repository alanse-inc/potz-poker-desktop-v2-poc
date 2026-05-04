import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("react-hot-toast", () => ({
  default: {
    error: vi.fn(),
  },
}));

vi.mock("../services/sentry", () => ({
  Sentry: {
    addBreadcrumb: vi.fn(),
    captureException: vi.fn(),
  },
}));

vi.mock("../constants/toast_messages", () => ({
  GAME_ACTION_ERROR_MESSAGES: { GENERIC: "アクションに失敗しました" },
  GAME_SETTING_ERROR_MESSAGES: { GENERIC: "ゲーム設定の更新に失敗しました" },
  CARD_PLACED_ERROR_MESSAGES: {
    GENERIC: "カードの配置に失敗しました",
    DUPLICATE_CARD: "重複したカードを読み込みました",
  },
  BOARD_ERROR_MESSAGES: { GENERIC: "ボードの更新に失敗しました" },
  UNKNOWN_ERROR_MESSAGES: { GENERIC: "不明なエラーが発生しました" },
  DUPLICATE_CARD_ERROR_PATTERN: "Duplicate card detected",
}));

describe("error_tracker", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("trackError", () => {
    describe("開発モードでのconsole.error出力", () => {
      it("開発モードの場合、console.errorが呼ばれる", async () => {
        const consoleSpy = vi
          .spyOn(console, "error")
          .mockImplementation(() => {});

        vi.stubEnv("NODE_ENV", "development");
        vi.resetModules();

        const { trackError } = await import("./error_tracker");

        trackError({
          type: "game_action_error",
          message: "test error",
        });

        expect(consoleSpy).toHaveBeenCalledWith(
          "[trackError] game_action_error: test error",
        );

        vi.unstubAllEnvs();
        consoleSpy.mockRestore();
      });

      it("テスト/本番モードの場合、console.errorが呼ばれない", async () => {
        const consoleSpy = vi
          .spyOn(console, "error")
          .mockImplementation(() => {});

        vi.stubEnv("NODE_ENV", "test");
        vi.resetModules();

        const { trackError } = await import("./error_tracker");

        trackError({
          type: "game_action_error",
          message: "test error",
        });

        expect(consoleSpy).not.toHaveBeenCalled();

        vi.unstubAllEnvs();
        consoleSpy.mockRestore();
      });
    });

    describe("Sentryへのエラー送信", () => {
      it("ブレッドクラムとcaptureExceptionが呼ばれる", async () => {
        vi.stubEnv("NODE_ENV", "test");
        vi.resetModules();

        const { trackError } = await import("./error_tracker");
        const { Sentry } = await import("../services/sentry");

        trackError({
          type: "unknown_error",
          message: "something went wrong",
          stack: "Error: something went wrong\n  at ...",
          name: "UnknownError",
          cause: "root cause",
        });

        expect.soft(Sentry.addBreadcrumb).toHaveBeenCalledWith(
          expect.objectContaining({
            message: "Error occurred: unknown_error",
            category: "error",
            level: "error",
          }),
        );

        expect.soft(Sentry.captureException).toHaveBeenCalledWith(
          expect.objectContaining({
            message: "something went wrong",
            name: "UnknownError",
          }),
          expect.objectContaining({
            tags: { errorType: "unknown_error" },
            level: "error",
          }),
        );

        vi.unstubAllEnvs();
      });
    });

    describe("Sentryへのエラー送信（stack/causeなし）", () => {
      it("stack/causeがない場合でもcaptureExceptionが呼ばれる", async () => {
        vi.stubEnv("NODE_ENV", "test");
        vi.resetModules();

        const { trackError } = await import("./error_tracker");
        const { Sentry } = await import("../services/sentry");

        trackError({
          type: "game_action_error",
          message: "no stack error",
        });

        expect(Sentry.captureException).toHaveBeenCalledWith(
          expect.objectContaining({
            message: "no stack error",
            name: "game_action_error",
          }),
          expect.objectContaining({
            tags: { errorType: "game_action_error" },
          }),
        );

        vi.unstubAllEnvs();
      });
    });

    describe("エラータイプ別のトースト表示", () => {
      let trackError: (
        result: Parameters<typeof import("./error_tracker").trackError>[0],
      ) => void;
      let toastMock: { error: ReturnType<typeof vi.fn> };

      beforeEach(async () => {
        vi.stubEnv("NODE_ENV", "production");
        vi.resetModules();
        const mod = await import("./error_tracker");
        trackError = mod.trackError;
        const toast = await import("react-hot-toast");
        toastMock = toast.default as unknown as typeof toastMock;
      });

      afterEach(() => {
        vi.unstubAllEnvs();
      });

      it("client_side_errorの場合、メッセージがそのまま表示される", () => {
        trackError({
          type: "client_side_error",
          message: "クライアントエラー",
        });

        expect(toastMock.error).toHaveBeenCalledWith("クライアントエラー");
      });

      it("game_action_errorの場合、汎用メッセージが表示される", () => {
        trackError({
          type: "game_action_error",
          message: "internal detail",
        });

        expect(toastMock.error).toHaveBeenCalledWith(
          "アクションに失敗しました",
        );
      });

      it("game_setting_errorの場合、汎用メッセージが表示される", () => {
        trackError({
          type: "game_setting_error",
          message: "internal detail",
        });

        expect(toastMock.error).toHaveBeenCalledWith(
          "ゲーム設定の更新に失敗しました",
        );
      });

      it("card_placed_errorの場合、汎用メッセージが表示される", () => {
        trackError({
          type: "card_placed_error",
          message: "some card error",
        });

        expect(toastMock.error).toHaveBeenCalledWith(
          "カードの配置に失敗しました",
        );
      });

      it("card_placed_errorで重複カードの場合、専用メッセージが表示される", () => {
        trackError({
          type: "card_placed_error",
          message: "Duplicate card detected: Ah",
        });

        expect(toastMock.error).toHaveBeenCalledWith(
          "重複したカードを読み込みました",
        );
      });

      it("board_errorの場合、汎用メッセージが表示される", () => {
        trackError({
          type: "board_error",
          message: "board issue",
        });

        expect(toastMock.error).toHaveBeenCalledWith(
          "ボードの更新に失敗しました",
        );
      });

      it("unknown_errorの場合、汎用メッセージが表示される", () => {
        trackError({
          type: "unknown_error",
          message: "unexpected",
        });

        expect(toastMock.error).toHaveBeenCalledWith(
          "不明なエラーが発生しました",
        );
      });
    });
  });

  describe("開発モードでのトースト表示（詳細メッセージ付き）", () => {
    let trackError: (
      result: Parameters<typeof import("./error_tracker").trackError>[0],
    ) => void;
    let toastMock: { error: ReturnType<typeof vi.fn> };

    beforeEach(async () => {
      vi.spyOn(console, "error").mockImplementation(() => {});
      vi.stubEnv("NODE_ENV", "development");
      vi.resetModules();
      const mod = await import("./error_tracker");
      trackError = mod.trackError;
      const toast = await import("react-hot-toast");
      toastMock = toast.default as unknown as typeof toastMock;
    });

    afterEach(() => {
      vi.unstubAllEnvs();
      vi.restoreAllMocks();
    });

    it("client_side_errorでstackがある場合、スタックも表示される", () => {
      trackError({
        type: "client_side_error",
        message: "エラー発生",
        stack: "Error: エラー発生\n  at test.ts:1",
      });

      expect(toastMock.error).toHaveBeenCalledWith(
        "エラー発生\nError: エラー発生\n  at test.ts:1",
      );
    });

    it("client_side_errorでstackがない場合、メッセージのみ表示される", () => {
      trackError({
        type: "client_side_error",
        message: "エラー発生",
      });

      expect(toastMock.error).toHaveBeenCalledWith("エラー発生");
    });

    it("game_action_errorの場合、詳細メッセージが付与される", () => {
      trackError({
        type: "game_action_error",
        message: "detailed info",
      });

      expect(toastMock.error).toHaveBeenCalledWith(
        "アクションに失敗しました\ndetailed info",
      );
    });

    it("game_setting_errorの場合、詳細メッセージが付与される", () => {
      trackError({
        type: "game_setting_error",
        message: "detailed info",
      });

      expect(toastMock.error).toHaveBeenCalledWith(
        "ゲーム設定の更新に失敗しました\ndetailed info",
      );
    });

    it("card_placed_errorの場合、詳細メッセージが付与される", () => {
      trackError({
        type: "card_placed_error",
        message: "card detail",
      });

      expect(toastMock.error).toHaveBeenCalledWith(
        "カードの配置に失敗しました\ncard detail",
      );
    });

    it("board_errorの場合、詳細メッセージが付与される", () => {
      trackError({
        type: "board_error",
        message: "board detail",
      });

      expect(toastMock.error).toHaveBeenCalledWith(
        "ボードの更新に失敗しました\nboard detail",
      );
    });

    it("unknown_errorの場合、詳細メッセージが付与される", () => {
      trackError({
        type: "unknown_error",
        message: "unknown detail",
      });

      expect(toastMock.error).toHaveBeenCalledWith(
        "不明なエラーが発生しました\nunknown detail",
      );
    });
  });

  describe("trackClientSideError", () => {
    it("client_side_errorとしてtrackErrorを呼び出す", async () => {
      vi.stubEnv("NODE_ENV", "production");
      vi.resetModules();

      const { trackClientSideError } = await import("./error_tracker");
      const { Sentry } = await import("../services/sentry");

      trackClientSideError("テストエラー", {
        stack: "Error: テストエラー\n  at ...",
        name: "TestError",
        cause: "test cause",
      });

      expect(Sentry.captureException).toHaveBeenCalledWith(
        expect.objectContaining({
          message: "テストエラー",
          name: "TestError",
        }),
        expect.objectContaining({
          tags: { errorType: "client_side_error" },
        }),
      );

      vi.unstubAllEnvs();
    });

    it("context フィールドが Sentry の errorContext として渡される", async () => {
      vi.stubEnv("NODE_ENV", "production");
      vi.resetModules();

      const { trackClientSideError } = await import("./error_tracker");
      const { Sentry } = await import("../services/sentry");

      trackClientSideError("USB QR scan failed", {
        cause: new Error("Invalid URL"),
        context: { rawDecodedText: "https://potz.poker /checkin/abc" },
      });

      expect(Sentry.captureException).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          contexts: expect.objectContaining({
            errorContext: { rawDecodedText: "https://potz.poker /checkin/abc" },
          }),
        }),
      );

      vi.unstubAllEnvs();
    });

    it("cause が Error インスタンスの場合、originalResult に message/name として含まれる", async () => {
      vi.stubEnv("NODE_ENV", "production");
      vi.resetModules();

      const { trackClientSideError } = await import("./error_tracker");
      const { Sentry } = await import("../services/sentry");

      trackClientSideError("scan failed", {
        cause: new Error("Invalid URL"),
      });

      expect(Sentry.captureException).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          contexts: expect.objectContaining({
            ipcError: expect.objectContaining({
              originalResult: expect.objectContaining({
                cause: expect.objectContaining({
                  message: "Invalid URL",
                  name: "Error",
                }),
              }),
            }),
          }),
        }),
      );

      vi.unstubAllEnvs();
    });

    it("cause がオブジェクトの場合、originalResult に含まれる", async () => {
      vi.stubEnv("NODE_ENV", "production");
      vi.resetModules();

      const { trackClientSideError } = await import("./error_tracker");
      const { Sentry } = await import("../services/sentry");

      trackClientSideError("scan failed", {
        cause: { code: 404, detail: "not found" },
      });

      expect(Sentry.captureException).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          contexts: expect.objectContaining({
            ipcError: expect.objectContaining({
              originalResult: expect.objectContaining({
                cause: { code: 404, detail: "not found" },
              }),
            }),
          }),
        }),
      );

      vi.unstubAllEnvs();
    });

    it("context なしの場合、errorContext は Sentry に送信されない", async () => {
      vi.stubEnv("NODE_ENV", "production");
      vi.resetModules();

      const { trackClientSideError } = await import("./error_tracker");
      const { Sentry } = await import("../services/sentry");

      trackClientSideError("scan failed");

      const call = (Sentry.captureException as ReturnType<typeof vi.fn>).mock
        .calls[0];
      const captureOptions = call[1] as { contexts: Record<string, unknown> };
      expect(captureOptions.contexts).not.toHaveProperty("errorContext");

      vi.unstubAllEnvs();
    });
  });
});

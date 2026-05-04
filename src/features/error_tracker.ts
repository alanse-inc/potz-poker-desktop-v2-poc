import toast from "react-hot-toast";
import {
  BOARD_ERROR_MESSAGES,
  CARD_PLACED_ERROR_MESSAGES,
  DUPLICATE_CARD_ERROR_PATTERN,
  GAME_ACTION_ERROR_MESSAGES,
  GAME_SETTING_ERROR_MESSAGES,
  UNKNOWN_ERROR_MESSAGES,
} from "../constants/toast_messages";
import { Sentry } from "../services/sentry";

type ClientSideErrorResult = {
  type: "client_side_error";
  message: string;
  stack?: string;
  name?: string;
  cause?: unknown;
  context?: Record<string, string | number | boolean | null | undefined>;
};

type ErrorIPCResult =
  | {
      readonly type: "game_action_error";
      readonly message: string;
      readonly stack?: string;
      readonly name?: string;
      readonly cause?: unknown;
    }
  | {
      readonly type: "game_setting_error";
      readonly message: string;
      readonly stack?: string;
      readonly name?: string;
      readonly cause?: unknown;
    }
  | {
      readonly type: "card_placed_error";
      readonly message: string;
      readonly stack?: string;
      readonly name?: string;
      readonly cause?: unknown;
    }
  | {
      readonly type: "board_error";
      readonly message: string;
      readonly stack?: string;
      readonly name?: string;
      readonly cause?: unknown;
    }
  | {
      readonly type: "unknown_error";
      readonly message: string;
      readonly stack?: string;
      readonly name?: string;
      readonly cause?: unknown;
    }
  | ClientSideErrorResult;

const isDevelopment = process.env.NODE_ENV === "development";

/**
 * エラーをトラックする
 *
 * - 何かしらの分析サービスに送信する
 * - トーストでエラーメッセージを表示する
 *
 * @param result エラーの結果
 */
export const trackError = (result: {
  type?: string;
  message?: string;
  stack?: string;
  name?: string;
  cause?: unknown;
  context?: Record<string, string | number | boolean | null | undefined>;
}) => {
  const r = result as ErrorIPCResult;

  if (isDevelopment) {
    console.error(`[trackError] ${r.type}: ${r.message}`);
  }

  // エラー発生時のブレッドクラムを追加
  Sentry.addBreadcrumb({
    message: `Error occurred: ${r.type}`,
    category: "error",
    level: "error",
    data: {
      errorType: r.type,
      message: r.message,
      hasStack: !!r.stack,
    },
    timestamp: Date.now() / 1000,
  });

  // Sentryにエラーを送信
  const error = new Error(r.message);
  error.name = r.name || r.type;
  if (r.stack) {
    error.stack = r.stack;
  }
  if (r.cause) {
    error.cause = r.cause;
  }

  const clientSideContext =
    r.type === "client_side_error" && "context" in result && result.context
      ? { errorContext: result.context }
      : {};

  Sentry.captureException(error, {
    tags: {
      errorType: r.type,
    },
    contexts: {
      ipcError: {
        originalResult: JSON.parse(
          JSON.stringify(r, (_key, value) =>
            value instanceof Error
              ? { message: value.message, name: value.name, stack: value.stack }
              : value,
          ),
        ),
      },
      ...clientSideContext,
    },
    level: "error",
  });

  switch (r.type) {
    case "client_side_error":
      toast.error(
        `${r.message}${isDevelopment && r.stack ? `\n${r.stack}` : ""}`,
      );
      break;
    case "game_action_error":
      toast.error(
        `${GAME_ACTION_ERROR_MESSAGES.GENERIC}${isDevelopment ? `\n${r.message}` : ""}`,
      );
      break;
    case "game_setting_error":
      toast.error(
        `${GAME_SETTING_ERROR_MESSAGES.GENERIC}${isDevelopment ? `\n${r.message}` : ""}`,
      );
      break;
    case "card_placed_error": {
      // 重複カードエラーかどうかを判定
      const isDuplicateCardError =
        r.message?.includes(DUPLICATE_CARD_ERROR_PATTERN) ?? false;
      const displayMessage = isDuplicateCardError
        ? CARD_PLACED_ERROR_MESSAGES.DUPLICATE_CARD
        : CARD_PLACED_ERROR_MESSAGES.GENERIC;
      toast.error(`${displayMessage}${isDevelopment ? `\n${r.message}` : ""}`);
      break;
    }
    case "board_error":
      toast.error(
        `${BOARD_ERROR_MESSAGES.GENERIC}${isDevelopment ? `\n${r.message}` : ""}`,
      );
      break;
    case "unknown_error":
      toast.error(
        `${UNKNOWN_ERROR_MESSAGES.GENERIC}${isDevelopment ? `\n${r.message}` : ""}`,
      );
      break;
    default:
      break;
  }
};

/**
 * クライアントサイドのエラーをトラックする
 *
 * @param error エラーメッセージまたは unknown 型のエラー
 * @param context オプションコンテキスト（旧 options 形式も互換）
 */
export function trackClientSideError(error: unknown, context?: object): void;
export function trackClientSideError(
  message: string,
  options?: {
    stack?: string;
    name?: string;
    cause?: unknown;
    context?: Record<string, string | number | boolean | null | undefined>;
  },
): void;
export function trackClientSideError(
  errorOrMessage: unknown,
  optionsOrContext?: object,
): void {
  let message: string;
  let stack: string | undefined;
  let name: string | undefined;
  let cause: unknown;
  let ctx:
    | Record<string, string | number | boolean | null | undefined>
    | undefined;

  if (typeof errorOrMessage === "string") {
    const options = optionsOrContext as
      | {
          stack?: string;
          name?: string;
          cause?: unknown;
          context?: Record<
            string,
            string | number | boolean | null | undefined
          >;
        }
      | undefined;
    message = errorOrMessage;
    stack = options?.stack;
    name = options?.name;
    cause = options?.cause;
    ctx = options?.context;
  } else if (errorOrMessage instanceof Error) {
    message = errorOrMessage.message;
    stack = errorOrMessage.stack;
    name = errorOrMessage.name;
    cause = errorOrMessage.cause;
  } else {
    message = String(errorOrMessage);
  }

  trackError({
    type: "client_side_error",
    message,
    stack,
    name,
    cause,
    context: ctx,
  });
}

/**
 * RFID カード配置イベントを処理するカスタムフック。
 *
 * 元実装: desktop-app/src/renderer/pages/game/playing/hooks/useCardPlacedHandler.ts
 */

import { useCallback, useEffect, useRef, useState } from "react";
import toast from "react-hot-toast";
import { api } from "../../../../api/client";
import type { CardPlacedPayload } from "../../../../types";

/** 保持するイベント履歴の最大件数。古いイベントから順に破棄される（FIFO）。 */
const MAX_EVENT_HISTORY = 200;

/**
 * CardPlacedPayload から意味的なキー文字列を生成する。
 * JSON.stringify のプロパティ順依存を排除し、フィールド追加に対して安定させる。
 */
function payloadKey(payload: CardPlacedPayload): string {
  const pos = payload.position;
  const posKey =
    pos.type === "playerHand"
      ? `ph:${pos.seat}`
      : pos.type === "communityCard"
        ? `cc:${pos.slot}`
        : "burn";
  return `${payload.rfid}|${payload.card.suit}:${payload.card.value}|${posKey}`;
}

/**
 * card_placed イベントを購読し、ボードに反映する。
 * 同一イベントの重複処理を eventHistory で防ぐ。
 */
export function useCardPlacedHandler() {
  const [eventHistory, setEventHistory] = useState<string[]>([]);
  const processingRef = useRef(false);
  const pendingQueueRef = useRef<CardPlacedPayload[]>([]);
  const eventHistoryRef = useRef<string[]>([]);

  const pushEventHistory = useCallback((eventJson: string) => {
    const next = [...eventHistoryRef.current, eventJson];
    eventHistoryRef.current =
      next.length > MAX_EVENT_HISTORY ? next.slice(-MAX_EVENT_HISTORY) : next;
    setEventHistory(eventHistoryRef.current);
  }, []);

  const popEventHistory = useCallback(() => {
    eventHistoryRef.current = eventHistoryRef.current.slice(0, -1);
    setEventHistory(eventHistoryRef.current);
  }, []);

  // biome-ignore lint/correctness/useExhaustiveDependencies: intentionally omit deps to run once on mount
  useEffect(() => {
    let cancelled = false;
    let unlisten: (() => void) | undefined;

    const setup = async () => {
      const processNext = async (): Promise<void> => {
        // unmount 後 (cancelled === true) は新規 IPC 呼び出し / toast / state 更新を行わず
        // そのまま終了する。
        while (!cancelled && pendingQueueRef.current.length > 0) {
          const next = pendingQueueRef.current.shift();
          if (!next) break;

          const eventKey = payloadKey(next);

          if (eventHistoryRef.current.includes(eventKey)) {
            continue;
          }

          pushEventHistory(eventKey);

          try {
            await api.rfid.applyCardPlaced(next.rfid, next.card, next.position);
            if (cancelled) return;
            toast.success("カードを読み込みました");
          } catch (e) {
            if (cancelled) return;
            popEventHistory();
            const message =
              e instanceof Error ? e.message : "カード配置に失敗しました";
            toast.error(message);
          }
        }
        processingRef.current = false;
      };

      const unlistenCardPlaced = await api.notifications.onCardPlaced(
        async (payload: CardPlacedPayload) => {
          if (cancelled) return;
          if (processingRef.current) {
            pendingQueueRef.current.push(payload);
            return;
          }

          const eventKey = payloadKey(payload);

          // 重複イベントはスキップ（ref経由で最新の履歴を参照）
          if (eventHistoryRef.current.includes(eventKey)) {
            return;
          }

          processingRef.current = true;
          pushEventHistory(eventKey);

          try {
            await api.rfid.applyCardPlaced(
              payload.rfid,
              payload.card,
              payload.position,
            );
            if (cancelled) return;
            toast.success("カードを読み込みました");
          } catch (e) {
            if (cancelled) return;
            // エラー時は履歴からロールバック
            popEventHistory();
            const message =
              e instanceof Error ? e.message : "カード配置に失敗しました";
            toast.error(message);
          } finally {
            if (!cancelled) {
              await processNext();
            } else {
              processingRef.current = false;
            }
          }
        },
      );

      // onCardPlaced 登録後にアンマウントされた場合は即解除してリーク防止
      if (cancelled) {
        unlistenCardPlaced();
        return;
      }

      // 未登録カードのイベントも購読
      const unlistenUnregistered =
        await api.notifications.onCardPlacedUnregistered(() => {
          toast.error("デッキに登録されていないカードです");
        });

      // onCardPlacedUnregistered 登録後にアンマウントされた場合は両方解除
      if (cancelled) {
        unlistenCardPlaced();
        unlistenUnregistered();
        return;
      }

      // ゲーム未開始時のカードスキャンを購読
      const unlistenNoBoard = await api.notifications.onCardPlacedNoBoard(
        () => {
          toast.error("ゲームが開始されていません");
        },
      );

      // onCardPlacedNoBoard 登録後にアンマウントされた場合は全部解除
      if (cancelled) {
        unlistenCardPlaced();
        unlistenUnregistered();
        unlistenNoBoard();
        return;
      }

      unlisten = () => {
        unlistenCardPlaced();
        unlistenUnregistered();
        unlistenNoBoard();
      };
    };

    setup().catch((err) => {
      console.error("[useCardPlacedHandler] failed to register listener", err);
    });

    return () => {
      cancelled = true;
      pendingQueueRef.current = [];
      unlisten?.();
    };
  }, []);

  const clearEventHistory = useCallback(() => {
    eventHistoryRef.current = [];
    setEventHistory([]);
    // 履歴クリア後にキューに残ったイベントを処理すると history が再増加するため
    // pendingQueue も同時に空にする。
    pendingQueueRef.current = [];
  }, []);

  return { eventHistory, clearEventHistory };
}

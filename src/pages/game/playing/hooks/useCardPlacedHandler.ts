/**
 * RFID カード配置イベントを処理するカスタムフック。
 *
 * 元実装: desktop-app/src/renderer/pages/game/playing/hooks/useCardPlacedHandler.ts
 */

import { useCallback, useEffect, useRef, useState } from "react";
import toast from "react-hot-toast";
import { api } from "../../../../api/client";
import type { CardPlacedPayload } from "../../../../types";

/**
 * card_placed イベントを購読し、ボードに反映する。
 * 同一イベントの重複処理を eventHistory で防ぐ。
 */
export function useCardPlacedHandler() {
  const [eventHistory, setEventHistory] = useState<string[]>([]);
  const processingRef = useRef(false);
  const eventHistoryRef = useRef<string[]>([]);

  const pushEventHistory = useCallback((eventJson: string) => {
    eventHistoryRef.current = [...eventHistoryRef.current, eventJson];
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
      const unlistenCardPlaced = await api.notifications.onCardPlaced(
        async (payload: CardPlacedPayload) => {
          if (processingRef.current) return;

          const eventJson = JSON.stringify(payload);

          // 重複イベントはスキップ（ref経由で最新の履歴を参照）
          if (eventHistoryRef.current.includes(eventJson)) {
            return;
          }

          processingRef.current = true;
          pushEventHistory(eventJson);

          try {
            await api.rfid.applyCardPlaced(
              payload.rfid,
              payload.card,
              payload.position,
            );
            toast.success("カードを読み込みました");
          } catch (e) {
            // エラー時は履歴からロールバック
            popEventHistory();
            const message =
              e instanceof Error ? e.message : "カード配置に失敗しました";
            toast.error(message);
          } finally {
            processingRef.current = false;
          }
        },
      );

      // 未登録カードのイベントも購読
      const unlistenUnregistered =
        await api.notifications.onCardPlacedUnregistered(() => {
          toast.error("デッキに登録されていないカードです");
        });

      const combinedUnlisten = () => {
        unlistenCardPlaced();
        unlistenUnregistered();
      };

      if (cancelled) {
        // setup 完了前にアンマウントされた場合は即解除してリーク防止
        combinedUnlisten();
        return;
      }
      unlisten = combinedUnlisten;
    };

    setup();

    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, []);

  return { eventHistory, clearEventHistory: () => setEventHistory([]) };
}

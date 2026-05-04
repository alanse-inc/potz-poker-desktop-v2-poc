/**
 * デッキ登録ページ。
 * 52枚のカードを表示し、1枚クリック → set_register_mode(true) + RFID 待機 → 登録。
 *
 * 元実装: desktop-app/src/renderer/pages/deck/register/page.tsx
 *         desktop-app/src/renderer/pages/deck/register/hooks/useDeckRegister.ts
 */

import { useCallback, useEffect, useRef, useState } from "react";
import toast from "react-hot-toast";
import { useNavigate } from "react-router";
import { api } from "../../../api/client";
import type { Card, CardValue, RfidCardMapping, Suit } from "../../../types";

// ---------------------------------------------------------------------------
// 定数
// ---------------------------------------------------------------------------

const SUITS: Suit[] = ["spade", "heart", "diamond", "club"];
const VALUES: CardValue[] = [
  "A",
  "2",
  "3",
  "4",
  "5",
  "6",
  "7",
  "8",
  "9",
  "T",
  "J",
  "Q",
  "K",
];

const SUIT_LABEL: Record<Suit, string> = {
  spade: "♠",
  heart: "♥",
  diamond: "♦",
  club: "♣",
};

// ---------------------------------------------------------------------------
// コンポーネント
// ---------------------------------------------------------------------------

export function DeckRegister() {
  const navigate = useNavigate();
  const [mapping, setMapping] = useState<RfidCardMapping>({
    id: crypto.randomUUID(),
    name: "",
    cards: {},
  });
  const [pendingCard, setPendingCard] = useState<Card | null>(null);
  const [isWaiting, setIsWaiting] = useState(false);
  const unlistenRef = useRef<(() => void) | null>(null);

  // マッピングをロード
  useEffect(() => {
    api.rfid.getMapping().then(setMapping).catch(console.error);
  }, []);

  // 登録モードを必ずオフにしてからアンマウント
  useEffect(() => {
    return () => {
      api.rfid.setRegisterMode(false).catch(console.error);
      unlistenRef.current?.();
    };
  }, []);

  /** カードが登録済みかどうか */
  const isRegistered = useCallback(
    (suit: Suit, value: CardValue): boolean => {
      return Object.values(mapping.cards).some(
        (c) => c.suit === suit && c.value === value,
      );
    },
    [mapping.cards],
  );

  /** カードをクリックしたとき: 登録モードを有効化して RFID 待機 */
  const handleCardClick = useCallback(async (suit: Suit, value: CardValue) => {
    const card: Card = { suit, value };
    setPendingCard(card);
    setIsWaiting(true);

    try {
      await api.rfid.setRegisterMode(true);

      // card_placed_register イベントを待つ
      const unlisten = await api.notifications.onCardPlacedRegister(
        async (payload) => {
          try {
            const updated = await api.rfid.registerCard(payload.rfid, card);
            setMapping(updated);
            toast.success(
              `${SUIT_LABEL[suit]}${value} を ${payload.rfid} に登録しました`,
            );
          } catch (e) {
            toast.error(e instanceof Error ? e.message : "登録に失敗しました");
          } finally {
            // 1枚登録したらリスナーを解除して登録モードをオフ
            unlisten();
            unlistenRef.current = null;
            await api.rfid.setRegisterMode(false);
            setIsWaiting(false);
            setPendingCard(null);
          }
        },
      );

      unlistenRef.current = unlisten;
    } catch (e) {
      toast.error(
        e instanceof Error ? e.message : "登録モードの開始に失敗しました",
      );
      // listener 設定が失敗した場合でも登録モードは確実にオフにする
      await api.rfid.setRegisterMode(false).catch(console.error);
      setIsWaiting(false);
      setPendingCard(null);
    }
  }, []);

  /** 待機キャンセル */
  const handleCancel = useCallback(async () => {
    unlistenRef.current?.();
    unlistenRef.current = null;
    await api.rfid.setRegisterMode(false);
    setIsWaiting(false);
    setPendingCard(null);
  }, []);

  return (
    <div className="flex min-h-screen flex-col items-center gap-6 bg-black p-8 text-white">
      <h1 className="font-bold text-2xl">デッキ登録</h1>
      <p className="text-gray-400 text-sm">
        カードをクリックして RFID を読み取ってください
      </p>

      {isWaiting && pendingCard && (
        <div className="flex flex-col items-center gap-3 rounded-lg border border-yellow-400 bg-yellow-900/30 p-4">
          <p className="font-semibold text-yellow-300">
            {SUIT_LABEL[pendingCard.suit]}
            {pendingCard.value} の RFID カードをかざしてください…
          </p>
          <button
            type="button"
            onClick={handleCancel}
            className="rounded bg-gray-700 px-4 py-1 text-sm hover:bg-gray-600"
          >
            キャンセル
          </button>
        </div>
      )}

      <div className="flex flex-col gap-3">
        {SUITS.map((suit) => (
          <div key={suit} className="flex gap-2">
            {VALUES.map((value) => {
              const registered = isRegistered(suit, value);
              const isPending =
                pendingCard?.suit === suit && pendingCard?.value === value;
              return (
                <button
                  key={`${suit}-${value}`}
                  type="button"
                  disabled={isWaiting && !isPending}
                  onClick={() => handleCardClick(suit, value)}
                  className={[
                    "flex h-12 w-9 flex-col items-center justify-center rounded border font-bold text-xs transition-colors",
                    registered
                      ? "border-green-500 bg-green-900/50 text-green-300"
                      : "border-gray-600 bg-gray-800 text-gray-400 hover:border-gray-400 hover:text-white",
                    isPending
                      ? "border-yellow-400 bg-yellow-900/50 ring-2 ring-yellow-400"
                      : "",
                    isWaiting && !isPending
                      ? "cursor-not-allowed opacity-40"
                      : "cursor-pointer",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                >
                  <span>{SUIT_LABEL[suit]}</span>
                  <span>{value}</span>
                </button>
              );
            })}
          </div>
        ))}
      </div>

      <div className="mt-4 flex gap-4">
        <button
          type="button"
          onClick={() => navigate("/deck")}
          className="rounded bg-gray-700 px-6 py-2 hover:bg-gray-600"
        >
          戻る
        </button>
      </div>
    </div>
  );
}

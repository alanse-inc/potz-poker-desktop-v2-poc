/**
 * デッキ編集ページ。
 * デッキ名の変更・カード登録を行う。
 */

import { useCallback, useEffect, useRef, useState } from "react";
import toast from "react-hot-toast";
import { useNavigate, useParams } from "react-router";
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

export function DeckEdit() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();

  const [deck, setDeck] = useState<RfidCardMapping | null>(null);
  const [deckName, setDeckName] = useState("");
  const [pendingCard, setPendingCard] = useState<Card | null>(null);
  const [isWaiting, setIsWaiting] = useState(false);
  const [saving, setSaving] = useState(false);
  const unlistenRef = useRef<(() => void) | null>(null);

  // デッキをロード
  useEffect(() => {
    if (!id) return;
    api.deck
      .getDeckById(id)
      .then((d) => {
        if (d) {
          setDeck(d);
          setDeckName(d.name);
        }
      })
      .catch(console.error);
  }, [id]);

  // アンマウント時に登録モードをオフ
  useEffect(() => {
    return () => {
      api.rfid.setRegisterMode(false).catch(console.error);
      unlistenRef.current?.();
    };
  }, []);

  const isRegistered = useCallback(
    (suit: Suit, value: CardValue): boolean => {
      if (!deck) return false;
      return Object.values(deck.cards).some(
        (c) => c.suit === suit && c.value === value,
      );
    },
    [deck],
  );

  /** カードをクリック: RFID 登録待機 */
  const handleCardClick = useCallback(
    async (suit: Suit, value: CardValue) => {
      if (!deck) return;
      const card: Card = { suit, value };
      setPendingCard(card);
      setIsWaiting(true);

      try {
        await api.rfid.setRegisterMode(true);

        const unlisten = await api.notifications.onCardPlacedRegister(
          async (payload) => {
            try {
              // まずデッキを更新してから保存
              const updatedCards = { ...deck.cards, [payload.rfid]: card };
              const updatedDeck: RfidCardMapping = {
                ...deck,
                cards: updatedCards,
              };
              const saved = await api.deck.saveDeck(updatedDeck);
              setDeck(saved);
              toast.success(
                `${SUIT_LABEL[suit]}${value} を ${payload.rfid} に登録しました`,
              );
            } catch (e) {
              toast.error(
                e instanceof Error ? e.message : "登録に失敗しました",
              );
            } finally {
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
        await api.rfid.setRegisterMode(false).catch(console.error);
        setIsWaiting(false);
        setPendingCard(null);
      }
    },
    [deck],
  );

  const handleCancel = useCallback(async () => {
    unlistenRef.current?.();
    unlistenRef.current = null;
    await api.rfid.setRegisterMode(false);
    setIsWaiting(false);
    setPendingCard(null);
  }, []);

  const handleSaveName = async () => {
    if (!deck) return;
    setSaving(true);
    try {
      const saved = await api.deck.saveDeck({ ...deck, name: deckName });
      setDeck(saved);
      toast.success("デッキ名を保存しました");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "保存に失敗しました");
    } finally {
      setSaving(false);
    }
  };

  if (!deck) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-black text-white">
        <p>読み込み中...</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col items-center gap-6 bg-black p-8 text-white">
      <h1 className="font-bold text-2xl">デッキ編集</h1>

      {/* デッキ名編集 */}
      <div className="flex w-full max-w-md gap-2">
        <input
          type="text"
          value={deckName}
          onChange={(e) => setDeckName(e.target.value)}
          placeholder="デッキ名"
          className="flex-1 rounded border border-gray-600 bg-gray-800 px-3 py-2 text-white outline-none focus:border-blue-500"
        />
        <button
          type="button"
          onClick={handleSaveName}
          disabled={saving || !deckName.trim()}
          className="rounded bg-blue-600 px-4 py-2 font-semibold hover:bg-blue-500 disabled:opacity-40"
        >
          保存
        </button>
      </div>

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
          onClick={() => navigate("/deck/choose")}
          className="rounded bg-gray-700 px-6 py-2 hover:bg-gray-600"
        >
          戻る
        </button>
      </div>
    </div>
  );
}

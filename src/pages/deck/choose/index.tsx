/**
 * デッキ選択ページ。
 * 保存済みデッキ一覧を表示し、選択・作成・削除ができる。
 */

import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { api } from "../../../api/client";
import type { RfidCardMapping } from "../../../types";

export function DeckChoose() {
  const navigate = useNavigate();
  const [decks, setDecks] = useState<RfidCardMapping[]>([]);
  const [currentDeckId, setCurrentDeckId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // 新規作成モーダル
  const [showModal, setShowModal] = useState(false);
  const [newDeckName, setNewDeckName] = useState("");
  const [creating, setCreating] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const [all, current] = await Promise.all([
          api.deck.getAllDecks(),
          api.deck.getCurrentDeck(),
        ]);
        setDecks(all);
        setCurrentDeckId(current?.id ?? null);
      } catch (e) {
        console.error("Failed to load decks", e);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  useEffect(() => {
    if (showModal) {
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [showModal]);

  const handleChoose = async (id: string) => {
    try {
      await api.deck.chooseDeck(id);
      navigate("/deck");
    } catch (e) {
      console.error("Failed to choose deck", e);
    }
  };

  const handleDelete = async (id: string) => {
    if (decks.length <= 1) return;
    try {
      await api.deck.deleteDeck(id);
      const updated = await api.deck.getAllDecks();
      setDecks(updated);
      const current = await api.deck.getCurrentDeck();
      setCurrentDeckId(current?.id ?? null);
    } catch (e) {
      console.error("Failed to delete deck", e);
    }
  };

  const handleCreateDeck = async () => {
    const name = newDeckName.trim();
    if (!name) return;
    setCreating(true);
    try {
      const created = await api.deck.saveDeck({ id: "", name, cards: {} });
      setShowModal(false);
      setNewDeckName("");
      navigate(`/deck/edit/${created.id}`);
    } catch (e) {
      console.error("Failed to create deck", e);
    } finally {
      setCreating(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-black text-white">
        <p>読み込み中...</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col items-center gap-6 bg-black p-8 text-white">
      <h1 className="font-bold text-2xl">デッキ選択</h1>

      {decks.length === 0 ? (
        <p className="text-gray-400">
          デッキがありません。新しいデッキを作成してください。
        </p>
      ) : (
        <ul className="w-full max-w-md space-y-3">
          {decks.map((deck) => (
            <li
              key={deck.id}
              className={[
                "flex items-center justify-between rounded-lg border px-4 py-3",
                deck.id === currentDeckId
                  ? "border-blue-500 bg-blue-900/30"
                  : "border-gray-700 bg-gray-900",
              ].join(" ")}
            >
              <div className="flex flex-col">
                <span className="font-semibold">{deck.name}</span>
                <span className="text-gray-400 text-xs">
                  {Object.keys(deck.cards).length} 枚登録済み
                </span>
                {deck.id === currentDeckId && (
                  <span className="mt-1 text-blue-400 text-xs">選択中</span>
                )}
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => handleChoose(deck.id)}
                  className="rounded bg-blue-600 px-3 py-1 text-sm hover:bg-blue-500"
                >
                  選択
                </button>
                <button
                  type="button"
                  onClick={() => handleDelete(deck.id)}
                  disabled={decks.length <= 1}
                  className="rounded border border-red-600 px-3 py-1 text-red-400 text-sm hover:bg-red-900/30 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  削除
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <button
        type="button"
        onClick={() => setShowModal(true)}
        className="rounded-lg bg-green-700 px-8 py-3 font-semibold hover:bg-green-600"
      >
        新しいデッキを作成
      </button>

      <button
        type="button"
        onClick={() => navigate("/deck")}
        className="rounded-lg bg-gray-700 px-8 py-3 hover:bg-gray-600"
      >
        戻る
      </button>

      {/* 新規作成モーダル */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
          <div className="flex w-80 flex-col gap-4 rounded-xl border border-gray-700 bg-gray-900 p-6">
            <h2 className="font-bold text-lg">新しいデッキ名</h2>
            <input
              ref={inputRef}
              type="text"
              value={newDeckName}
              onChange={(e) => setNewDeckName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleCreateDeck();
                if (e.key === "Escape") {
                  setShowModal(false);
                  setNewDeckName("");
                }
              }}
              placeholder="デッキ名を入力"
              className="rounded border border-gray-600 bg-gray-800 px-3 py-2 text-white outline-none focus:border-blue-500"
            />
            <div className="flex gap-3">
              <button
                type="button"
                onClick={handleCreateDeck}
                disabled={creating || !newDeckName.trim()}
                className="flex-1 rounded bg-green-700 py-2 font-semibold hover:bg-green-600 disabled:cursor-not-allowed disabled:opacity-40"
              >
                作成
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowModal(false);
                  setNewDeckName("");
                }}
                className="flex-1 rounded bg-gray-700 py-2 hover:bg-gray-600"
              >
                キャンセル
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

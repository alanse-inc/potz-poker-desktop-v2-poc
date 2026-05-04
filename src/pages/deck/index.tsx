/**
 * デッキ管理ホーム。
 * 現在のデッキ表示・デッキ切り替え・編集・カード登録・シリアル接続状態。
 */

import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { api } from "../../api/client";
import type { RfidCardMapping, SerialStatus } from "../../types";

export function DeckHome() {
  const navigate = useNavigate();
  const [serialStatus, setSerialStatus] = useState<SerialStatus>({
    connected: false,
    portName: null,
  });
  const [currentDeck, setCurrentDeck] = useState<RfidCardMapping | null>(null);

  useEffect(() => {
    let unlisten: (() => void) | undefined;

    const setup = async () => {
      // 初期状態を取得
      const [status, deck] = await Promise.all([
        api.rfid.getSerialStatus(),
        api.deck.getCurrentDeck(),
      ]);
      setSerialStatus(status);
      setCurrentDeck(deck);

      // 以降はイベントで追跡
      unlisten = await api.notifications.onSerialStatusUpdated((s) => {
        setSerialStatus(s);
      });
    };

    setup().catch(console.error);

    return () => {
      unlisten?.();
    };
  }, []);

  const handleResetMapping = async () => {
    try {
      if (!currentDeck) return;
      for (const rfid of Object.keys(currentDeck.cards)) {
        await api.rfid.unregisterCard(rfid);
      }
      const updated = await api.deck.getCurrentDeck();
      setCurrentDeck(updated);
    } catch (e) {
      console.error("Failed to reset mapping", e);
    }
  };

  return (
    <div className="flex min-h-screen flex-col items-center gap-8 bg-black p-8 text-white">
      <h1 className="font-bold text-2xl">デッキ管理</h1>

      {/* シリアル接続状態 */}
      <div className="flex items-center gap-3 rounded-lg border border-gray-700 bg-gray-900 p-4">
        <span
          className={`h-3 w-3 rounded-full ${serialStatus.connected ? "bg-green-400" : "bg-red-500"}`}
        />
        <span className="text-sm">
          {serialStatus.connected
            ? `接続中: ${serialStatus.portName ?? "不明"}`
            : "未接続（自動再接続待ち）"}
        </span>
      </div>

      {/* 現在のデッキ */}
      <div className="w-full max-w-md rounded-lg border border-gray-700 bg-gray-900 p-4">
        <p className="mb-1 text-gray-400 text-xs">現在のデッキ</p>
        {currentDeck ? (
          <div>
            <p className="font-semibold text-lg">{currentDeck.name}</p>
            <p className="text-gray-400 text-sm">
              {Object.keys(currentDeck.cards).length} 枚登録済み
            </p>
          </div>
        ) : (
          <p className="text-gray-400 text-sm">デッキが選択されていません</p>
        )}
      </div>

      {/* アクション */}
      <div className="flex flex-col gap-4">
        <button
          type="button"
          onClick={() => navigate("/deck/choose")}
          className="rounded-lg bg-blue-600 px-8 py-3 font-semibold hover:bg-blue-500"
        >
          デッキを切り替える
        </button>
        {currentDeck && (
          <button
            type="button"
            onClick={() => navigate(`/deck/edit/${currentDeck.id}`)}
            className="rounded-lg bg-indigo-600 px-8 py-3 font-semibold hover:bg-indigo-500"
          >
            デッキを編集
          </button>
        )}
        <button
          type="button"
          onClick={() => navigate("/deck/register")}
          className="rounded-lg bg-gray-700 px-8 py-3 font-semibold hover:bg-gray-600"
        >
          カード登録
        </button>
        <button
          type="button"
          onClick={handleResetMapping}
          className="rounded-lg border border-red-600 px-8 py-3 text-red-400 hover:bg-red-900/30"
        >
          マッピングをリセット
        </button>
        <button
          type="button"
          onClick={() => navigate("/")}
          className="rounded-lg bg-gray-700 px-8 py-3 hover:bg-gray-600"
        >
          ホームに戻る
        </button>
      </div>
    </div>
  );
}

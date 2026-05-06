import { invoke } from "@tauri-apps/api/core";
import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { useNavigate } from "react-router";
import { api } from "../../api/client";
import type {
  CardPosition,
  CardValue,
  GameSettings,
  RfidCardMapping,
  SerialStatus,
  Suit,
  TexasHoldemBoard,
} from "../../types";
import { RoundButton } from "../../ui/button/round_button";
import { BasicPage } from "../../ui/page/basic";

const SUITS: ReadonlyArray<Suit> = ["spade", "heart", "diamond", "club"];
const SUIT_LABELS: Record<Suit, string> = {
  spade: "♠ spade",
  heart: "♥ heart",
  diamond: "♦ diamond",
  club: "♣ club",
};
const VALUES: ReadonlyArray<CardValue> = [
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
  "A",
];
type PositionType = CardPosition["type"];

type DebugSnapshot = {
  board: TexasHoldemBoard | null;
  settings: GameSettings | null;
  rfidMapping: RfidCardMapping | null;
  serialStatus: SerialStatus | null;
};

type SmokeStatus = "pending" | "running" | "pass" | "fail";

type SmokeResult = {
  name: string;
  status: SmokeStatus;
  durationMs?: number;
  error?: string;
};

const SMOKE_STEPS: ReadonlyArray<{
  name: string;
  run: () => Promise<unknown>;
}> = [
  { name: "board.getBoard", run: () => api.board.getBoard() },
  { name: "gameSettings.load", run: () => api.gameSettings.load() },
  { name: "rfid.getMapping", run: () => api.rfid.getMapping() },
  { name: "rfid.getSerialStatus", run: () => api.rfid.getSerialStatus() },
  { name: "deck.getCurrentDeck", run: () => api.deck.getCurrentDeck() },
  { name: "deck.getAllDecks", run: () => api.deck.getAllDecks() },
  { name: "telop.getState", run: () => api.telop.getState() },
  { name: "get_table_name", run: () => invoke<string>("get_table_name") },
];

export function Debug() {
  const navigate = useNavigate();
  const [snapshot, setSnapshot] = useState<DebugSnapshot>({
    board: null,
    settings: null,
    rfidMapping: null,
    serialStatus: null,
  });
  const [isLoading, setIsLoading] = useState(false);
  const [tableName, setTableName] = useState<string>("");
  const [smokeResults, setSmokeResults] = useState<SmokeResult[]>(() =>
    SMOKE_STEPS.map((s) => ({
      name: s.name,
      status: "pending" as SmokeStatus,
    })),
  );
  const [isSmokeRunning, setIsSmokeRunning] = useState(false);

  const [dealSuit, setDealSuit] = useState<Suit>("spade");
  const [dealValue, setDealValue] = useState<CardValue>("A");
  const [dealPositionType, setDealPositionType] =
    useState<PositionType>("playerHand");
  const [dealSeat, setDealSeat] = useState<number>(0);
  const [dealSlot, setDealSlot] = useState<number>(0);
  const [dealRfid, setDealRfid] = useState<string>("");
  const [isDealing, setIsDealing] = useState(false);

  const fetchSnapshot = async () => {
    setIsLoading(true);
    try {
      const [board, settings, rfidMapping, serialStatus, tn] =
        await Promise.allSettled([
          api.board.getBoard(),
          api.gameSettings.load(),
          api.rfid.getMapping(),
          api.rfid.getSerialStatus(),
          invoke<string>("get_table_name"),
        ]);
      setSnapshot({
        board: board.status === "fulfilled" ? board.value : null,
        settings: settings.status === "fulfilled" ? settings.value : null,
        rfidMapping:
          rfidMapping.status === "fulfilled" ? rfidMapping.value : null,
        serialStatus:
          serialStatus.status === "fulfilled" ? serialStatus.value : null,
      });
      if (tn.status === "fulfilled") {
        setTableName(tn.value);
      }
    } catch (e) {
      toast.error(
        e instanceof Error ? e.message : "データの取得に失敗しました",
      );
    } finally {
      setIsLoading(false);
    }
  };

  // biome-ignore lint/correctness/useExhaustiveDependencies: マウント時のみ初期ロード
  useEffect(() => {
    void fetchSnapshot();
  }, []);

  const handlePingBoard = async () => {
    try {
      const board = await api.board.getBoard();
      setSnapshot((prev) => ({ ...prev, board }));
      toast.success("ボード状態を更新しました");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "ping 失敗");
    }
  };

  const handleSmokeTest = async () => {
    setIsSmokeRunning(true);
    setSmokeResults(
      SMOKE_STEPS.map((s) => ({ name: s.name, status: "pending" as const })),
    );
    let passCount = 0;
    let failCount = 0;
    for (let i = 0; i < SMOKE_STEPS.length; i++) {
      const step = SMOKE_STEPS[i];
      setSmokeResults((prev) =>
        prev.map((r, idx) => (idx === i ? { ...r, status: "running" } : r)),
      );
      const startedAt = performance.now();
      try {
        await step.run();
        const durationMs = Math.round(performance.now() - startedAt);
        setSmokeResults((prev) =>
          prev.map((r, idx) =>
            idx === i ? { ...r, status: "pass", durationMs } : r,
          ),
        );
        passCount += 1;
      } catch (e) {
        const durationMs = Math.round(performance.now() - startedAt);
        const error = e instanceof Error ? e.message : String(e);
        setSmokeResults((prev) =>
          prev.map((r, idx) =>
            idx === i ? { ...r, status: "fail", durationMs, error } : r,
          ),
        );
        failCount += 1;
      }
    }
    setIsSmokeRunning(false);
    if (failCount === 0) {
      toast.success(`スモークテスト ${passCount}/${SMOKE_STEPS.length} 成功`);
    } else {
      toast.error(`スモークテスト ${failCount}/${SMOKE_STEPS.length} 失敗`);
    }
  };

  const handleTestCardPlaced = async () => {
    try {
      await api.rfid.applyCardPlaced(
        "DEBUG_RFID_TEST",
        { suit: "spade", value: "A" },
        { type: "burnCard" },
      );
      toast.success("card_placed テストイベントを発火しました");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "イベント発火失敗");
    }
  };

  const handleAssignRandom = async () => {
    try {
      await api.debug.assignRandomCard();
      toast.success("ランダムカードを次のスロットに配布しました");
      void fetchSnapshot();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "ランダム配布失敗");
    }
  };

  const handleDealCard = async () => {
    let position: CardPosition;
    if (dealPositionType === "playerHand") {
      position = { type: "playerHand", seat: dealSeat };
    } else if (dealPositionType === "communityCard") {
      position = { type: "communityCard", slot: dealSlot };
    } else {
      position = { type: "burnCard" };
    }
    const rfid =
      dealRfid.trim() !== ""
        ? dealRfid.trim()
        : `DEBUG_${dealSuit}_${dealValue}_${Date.now()}`;
    setIsDealing(true);
    try {
      await api.rfid.applyCardPlaced(
        rfid,
        { suit: dealSuit, value: dealValue },
        position,
      );
      const positionLabel =
        position.type === "playerHand"
          ? `seat ${position.seat}`
          : position.type === "communityCard"
            ? `community ${position.slot}`
            : "burn";
      toast.success(`${dealValue} of ${dealSuit} → ${positionLabel}`);
      void fetchSnapshot();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "カード配布失敗");
    } finally {
      setIsDealing(false);
    }
  };

  return (
    <BasicPage scrollable>
      <div className="flex w-full max-w-3xl flex-col gap-6 p-8">
        <div className="flex items-center justify-between">
          <h1 className="font-bold text-2xl text-primary">デバッグメニュー</h1>
          <div className="flex gap-3">
            <RoundButton
              type="primary"
              text={isLoading ? "読込中..." : "リフレッシュ"}
              size="auto"
              onClick={fetchSnapshot}
              disabled={isLoading}
            />
            <RoundButton
              type="black"
              text="戻る"
              size="auto"
              onClick={() => navigate("/")}
            />
          </div>
        </div>

        <section className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <h2 className="font-bold text-gray-400 text-sm uppercase">
              全機能スモークテスト
            </h2>
            <button
              type="button"
              onClick={handleSmokeTest}
              disabled={isSmokeRunning}
              className="flex h-9 items-center justify-center rounded-lg bg-primary px-4 font-semibold text-black text-sm transition-colors hover:opacity-80 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isSmokeRunning ? "実行中..." : "実行"}
            </button>
          </div>
          <ul className="flex flex-col gap-1 rounded-lg bg-gray-900 p-3">
            {smokeResults.map((r) => {
              const badge =
                r.status === "pass"
                  ? { color: "bg-green-600", label: "PASS" }
                  : r.status === "fail"
                    ? { color: "bg-red-600", label: "FAIL" }
                    : r.status === "running"
                      ? { color: "bg-yellow-600", label: "RUN" }
                      : { color: "bg-gray-700", label: "WAIT" };
              return (
                <li
                  key={r.name}
                  className="flex items-center justify-between gap-3 text-xs"
                >
                  <span className="flex items-center gap-2">
                    <span
                      className={`inline-flex w-12 items-center justify-center rounded px-1 py-0.5 font-bold text-white ${badge.color}`}
                    >
                      {badge.label}
                    </span>
                    <span className="font-mono text-white">{r.name}</span>
                  </span>
                  <span className="flex items-center gap-2 text-gray-400">
                    {r.durationMs !== undefined && (
                      <span>{r.durationMs}ms</span>
                    )}
                    {r.error && (
                      <span
                        className="max-w-xs truncate text-red-400"
                        title={r.error}
                      >
                        {r.error}
                      </span>
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="font-bold text-gray-400 text-sm uppercase">
            イベントテスト
          </h2>
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={handlePingBoard}
              className="flex h-10 items-center justify-center rounded-lg bg-background-dark-gray px-4 font-semibold text-sm text-white transition-colors hover:bg-gray-700"
            >
              Ping ボード
            </button>
            <button
              type="button"
              onClick={handleTestCardPlaced}
              className="flex h-10 items-center justify-center rounded-lg bg-orange-600 px-4 font-semibold text-sm text-white transition-colors hover:bg-orange-700"
            >
              card_placed テスト発火
            </button>
          </div>
        </section>

        <section className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <h2 className="font-bold text-gray-400 text-sm uppercase">
              手動カード配布
            </h2>
            <button
              type="button"
              onClick={handleAssignRandom}
              className="flex h-9 items-center justify-center rounded-lg bg-blue-600 px-4 font-semibold text-sm text-white transition-colors hover:opacity-80"
            >
              ランダム配布
            </button>
          </div>
          <div className="flex flex-col gap-3 rounded-lg bg-gray-900 p-4">
            <div className="grid grid-cols-2 gap-3">
              <label className="flex flex-col gap-1 text-gray-300 text-xs">
                <span>SUIT</span>
                <select
                  value={dealSuit}
                  onChange={(e) => setDealSuit(e.target.value as Suit)}
                  className="h-9 rounded bg-gray-800 px-2 text-sm text-white"
                >
                  {SUITS.map((s) => (
                    <option key={s} value={s}>
                      {SUIT_LABELS[s]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1 text-gray-300 text-xs">
                <span>VALUE</span>
                <select
                  value={dealValue}
                  onChange={(e) => setDealValue(e.target.value as CardValue)}
                  className="h-9 rounded bg-gray-800 px-2 text-sm text-white"
                >
                  {VALUES.map((v) => (
                    <option key={v} value={v}>
                      {v}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <label className="flex flex-col gap-1 text-gray-300 text-xs">
              <span>POSITION</span>
              <select
                value={dealPositionType}
                onChange={(e) =>
                  setDealPositionType(e.target.value as PositionType)
                }
                className="h-9 rounded bg-gray-800 px-2 text-sm text-white"
              >
                <option value="playerHand">playerHand (seat)</option>
                <option value="communityCard">communityCard (slot)</option>
                <option value="burnCard">burnCard</option>
              </select>
            </label>

            {dealPositionType === "playerHand" && (
              <label className="flex flex-col gap-1 text-gray-300 text-xs">
                <span>SEAT (0-8)</span>
                <input
                  type="number"
                  min={0}
                  max={8}
                  value={dealSeat}
                  onChange={(e) =>
                    setDealSeat(
                      Math.max(0, Math.min(8, Number(e.target.value) || 0)),
                    )
                  }
                  className="h-9 rounded bg-gray-800 px-2 text-sm text-white"
                />
              </label>
            )}

            {dealPositionType === "communityCard" && (
              <label className="flex flex-col gap-1 text-gray-300 text-xs">
                <span>SLOT (0-4)</span>
                <input
                  type="number"
                  min={0}
                  max={4}
                  value={dealSlot}
                  onChange={(e) =>
                    setDealSlot(
                      Math.max(0, Math.min(4, Number(e.target.value) || 0)),
                    )
                  }
                  className="h-9 rounded bg-gray-800 px-2 text-sm text-white"
                />
              </label>
            )}

            <label className="flex flex-col gap-1 text-gray-300 text-xs">
              <span>RFID (空欄なら自動採番)</span>
              <input
                type="text"
                value={dealRfid}
                onChange={(e) => setDealRfid(e.target.value)}
                placeholder="DEBUG_xxx"
                className="h-9 rounded bg-gray-800 px-2 text-sm text-white"
              />
            </label>

            <button
              type="button"
              onClick={handleDealCard}
              disabled={isDealing}
              className="flex h-10 items-center justify-center rounded-lg bg-primary px-4 font-semibold text-black text-sm transition-colors hover:opacity-80 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isDealing ? "配布中..." : "配布する"}
            </button>
          </div>
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="font-bold text-gray-400 text-sm uppercase">
            テーブル名
          </h2>
          <div className="rounded-lg bg-gray-900 p-3">
            <p className="text-sm text-white">{tableName || "(未設定)"}</p>
          </div>
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="font-bold text-gray-400 text-sm uppercase">
            シリアル / RFID 状態
          </h2>
          <div className="rounded-lg bg-gray-900 p-3">
            {snapshot.serialStatus ? (
              <div className="flex items-center gap-2">
                <span
                  className={`h-2.5 w-2.5 rounded-full ${
                    snapshot.serialStatus.connected
                      ? "bg-green-400"
                      : "bg-red-500"
                  }`}
                />
                <span className="text-sm text-white">
                  {snapshot.serialStatus.connected
                    ? `接続中: ${snapshot.serialStatus.portName ?? "unknown"}`
                    : "未接続"}
                </span>
              </div>
            ) : (
              <p className="text-gray-500 text-sm">取得中...</p>
            )}
          </div>
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="font-bold text-gray-400 text-sm uppercase">
            ゲーム設定スナップショット
          </h2>
          <pre className="overflow-x-auto rounded-lg bg-gray-900 p-4 text-green-300 text-xs">
            {snapshot.settings
              ? JSON.stringify(snapshot.settings, null, 2)
              : "null"}
          </pre>
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="font-bold text-gray-400 text-sm uppercase">
            ボードスナップショット
          </h2>
          <pre className="max-h-80 overflow-auto rounded-lg bg-gray-900 p-4 text-green-300 text-xs">
            {snapshot.board
              ? JSON.stringify(snapshot.board, null, 2)
              : "null (ゲーム未開始)"}
          </pre>
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="font-bold text-gray-400 text-sm uppercase">
            RFID マッピングスナップショット
          </h2>
          <pre className="max-h-60 overflow-auto rounded-lg bg-gray-900 p-4 text-green-300 text-xs">
            {snapshot.rfidMapping
              ? JSON.stringify(snapshot.rfidMapping, null, 2)
              : "null"}
          </pre>
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="font-bold text-gray-400 text-sm uppercase">
            バージョン情報
          </h2>
          <div className="rounded-lg bg-gray-900 p-3">
            <p className="text-sm text-white">POTZ Poker Desktop v2 (Tauri)</p>
            <p className="text-gray-500 text-xs">Tauri 2 + React 19</p>
          </div>
        </section>
      </div>
    </BasicPage>
  );
}

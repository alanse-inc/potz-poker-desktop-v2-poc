import { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";
import { useNavigate } from "react-router";
import {
  finishGameEvent,
  type GameEventResponse,
  listGameEventsPaginated,
} from "../../../api/backend";
import { RoundButton } from "../../../ui/button/round_button";
import { BasicPage } from "../../../ui/page/basic";

const PER_PAGE = 20;

function StatusBadge({ status }: { status: GameEventResponse["status"] }) {
  if (status === "started") {
    return (
      <span className="rounded-full bg-green-600 px-3 py-1 font-bold text-sm text-white">
        ONGOING
      </span>
    );
  }
  if (status === "finished") {
    return (
      <span className="rounded-full bg-gray-600 px-3 py-1 font-bold text-sm text-white">
        FINISHED
      </span>
    );
  }
  return (
    <span className="rounded-full bg-yellow-600 px-3 py-1 font-bold text-sm text-white">
      PENDING
    </span>
  );
}

type FinishModalProps = {
  session: GameEventResponse;
  isFinishing: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

function FinishConfirmModal({
  session,
  isFinishing,
  onConfirm,
  onCancel,
}: FinishModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
      <div className="flex w-96 flex-col gap-6 rounded-2xl bg-black-deep p-8 shadow-xl">
        <h3 className="font-bold text-lg text-white">
          このセッションを終了しますか？
        </h3>
        <p className="text-gray-400 text-sm">
          「{session.gameName}」を終了します。この操作は取り消せません。
        </p>
        <div className="flex justify-end gap-4">
          <RoundButton
            type="black"
            size="small"
            text="キャンセル"
            disabled={isFinishing}
            onClick={onCancel}
          />
          <RoundButton
            type="primary"
            size="small"
            text={isFinishing ? "処理中..." : "終了する"}
            disabled={isFinishing}
            onClick={onConfirm}
          />
        </div>
      </div>
    </div>
  );
}

export function SessionList() {
  const navigate = useNavigate();
  const [sessions, setSessions] = useState<GameEventResponse[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [finishTarget, setFinishTarget] = useState<GameEventResponse | null>(
    null,
  );
  const [isFinishing, setIsFinishing] = useState(false);

  const totalPages = Math.max(1, Math.ceil(total / PER_PAGE));

  const loadSessions = useCallback(async (targetPage: number) => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await listGameEventsPaginated(targetPage, PER_PAGE);
      setSessions(res.data);
      setTotal(res.total);
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : "セッション一覧の取得に失敗しました";
      setError(message);
      toast.error(message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSessions(page);
  }, [page, loadSessions]);

  const handleEdit = useCallback(
    (session: GameEventResponse) => {
      navigate(`/session/edit/${session.gameEventId}`, {
        state: { session },
      });
    },
    [navigate],
  );

  const handleFinishRequest = useCallback((session: GameEventResponse) => {
    setFinishTarget(session);
  }, []);

  const handleFinishConfirm = useCallback(async () => {
    if (!finishTarget) return;
    setIsFinishing(true);
    try {
      await finishGameEvent(finishTarget.gameEventId);
      toast.success(`「${finishTarget.gameName}」を終了しました`);
      setFinishTarget(null);
      await loadSessions(page);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "セッションの終了に失敗しました";
      toast.error(message);
    } finally {
      setIsFinishing(false);
    }
  }, [finishTarget, page, loadSessions]);

  const handleFinishCancel = useCallback(() => {
    setFinishTarget(null);
  }, []);

  const handlePrev = useCallback(() => {
    setPage((p) => Math.max(1, p - 1));
  }, []);

  const handleNext = useCallback(() => {
    setPage((p) => Math.min(totalPages, p + 1));
  }, [totalPages]);

  return (
    <BasicPage scrollable>
      <div className="flex w-full max-w-4xl flex-col gap-6 p-8">
        <div className="flex w-full items-center justify-between">
          <h1 className="font-bold text-2xl text-primary">セッション一覧</h1>
          <RoundButton
            type="black"
            size="auto"
            text="戻る"
            onClick={() => navigate("/")}
          />
        </div>

        {error && (
          <div className="rounded-lg border border-red-500 bg-red-500/10 p-4 text-red-400">
            {error}
          </div>
        )}

        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <p className="text-gray-400">読み込み中...</p>
          </div>
        ) : sessions.length === 0 && !error ? (
          <div className="flex items-center justify-center py-16">
            <p className="text-gray-400">セッションがありません</p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {sessions.map((session) => (
              <div
                key={session.gameEventId}
                className="flex items-center justify-between rounded-xl border border-border-white bg-background-dark-gray px-6 py-4"
              >
                <div className="flex flex-col gap-1">
                  <span className="font-bold text-white">
                    {session.gameName}
                  </span>
                  <span className="text-gray-400 text-sm">
                    {session.startedAt
                      ? new Date(session.startedAt).toLocaleString("ja-JP")
                      : session.startDate}
                  </span>
                  <span className="text-gray-400 text-sm">
                    SB: {session.smallBlind} / BB: {session.bigBlind}
                  </span>
                </div>

                <div className="flex items-center gap-4">
                  <StatusBadge status={session.status} />

                  <RoundButton
                    type="dark-gray"
                    size="small"
                    text="編集"
                    disabled={session.status !== "started"}
                    onClick={() => handleEdit(session)}
                  />

                  {session.status === "started" && (
                    <RoundButton
                      type="black"
                      size="small"
                      text="終了"
                      onClick={() => handleFinishRequest(session)}
                    />
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="flex items-center justify-center gap-6">
          <RoundButton
            type="black"
            size="auto"
            text="Prev"
            disabled={page <= 1}
            onClick={handlePrev}
          />
          <span className="text-gray-400 text-sm">
            {page} / {totalPages}
          </span>
          <RoundButton
            type="black"
            size="auto"
            text="Next"
            disabled={page >= totalPages}
            onClick={handleNext}
          />
        </div>
      </div>

      {finishTarget && (
        <FinishConfirmModal
          session={finishTarget}
          isFinishing={isFinishing}
          onConfirm={handleFinishConfirm}
          onCancel={handleFinishCancel}
        />
      )}
    </BasicPage>
  );
}

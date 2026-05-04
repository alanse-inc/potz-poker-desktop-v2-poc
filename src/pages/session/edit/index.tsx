import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { useLocation, useNavigate, useParams } from "react-router";
import {
  type GameEventResponse,
  getGameEventDetail,
  updateGameEvent,
} from "../../../api/backend";
import { RoundButton } from "../../../ui/button/round_button";
import { BasicPage } from "../../../ui/page/basic";

type LocationState = { session?: GameEventResponse } | null;

function SessionEditForm({ session }: { session: GameEventResponse }) {
  const navigate = useNavigate();
  const [name, setName] = useState(session.gameName ?? "");
  const [smallBlind, setSmallBlind] = useState(String(session.smallBlind));
  const [bigBlind, setBigBlind] = useState(String(session.bigBlind));
  const [isSaving, setIsSaving] = useState(false);

  const isTournament = session.gameFormat === "tournament";

  const isValid =
    name.trim().length > 0 &&
    Number(smallBlind) > 0 &&
    Number(bigBlind) > 0 &&
    Number(bigBlind) >= Number(smallBlind);

  const handleSave = async () => {
    if (!isValid || isSaving) return;
    setIsSaving(true);
    try {
      await updateGameEvent(session.gameEventId, {
        name: name.trim(),
        smallBlind: Number(smallBlind),
        bigBlind: Number(bigBlind),
      });
      toast.success("セッションを更新しました");
      navigate("/session/list");
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "セッションの更新に失敗しました";
      toast.error(message);
    } finally {
      setIsSaving(false);
    }
  };

  const title = isTournament
    ? "Tournament セッション編集"
    : "Ring Game セッション編集";

  return (
    <BasicPage>
      <div className="flex w-full max-w-xl flex-col gap-6 p-8">
        <h2 className="text-center font-bold text-lg text-white">{title}</h2>

        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <label className="text-gray-400 text-sm" htmlFor="session-name">
              セッション名
            </label>
            <input
              id="session-name"
              type="text"
              className="h-12 w-full rounded border border-border-white bg-black-deep px-4 text-white focus:outline-none focus:ring-2 focus:ring-primary"
              placeholder="セッション名を入力"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-gray-400 text-sm" htmlFor="small-blind">
              スモールブラインド
            </label>
            <input
              id="small-blind"
              type="number"
              min={1}
              className="h-12 w-full rounded border border-border-white bg-black-deep px-4 text-white focus:outline-none focus:ring-2 focus:ring-primary"
              value={smallBlind}
              onChange={(e) => setSmallBlind(e.target.value)}
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-gray-400 text-sm" htmlFor="big-blind">
              ビッグブラインド
            </label>
            <input
              id="big-blind"
              type="number"
              min={1}
              className="h-12 w-full rounded border border-border-white bg-black-deep px-4 text-white focus:outline-none focus:ring-2 focus:ring-primary"
              value={bigBlind}
              onChange={(e) => setBigBlind(e.target.value)}
            />
          </div>
        </div>

        <div className="flex flex-row justify-between gap-4">
          <RoundButton
            type="black"
            size="small"
            text="戻る"
            onClick={() => navigate("/session/list")}
          />
          <RoundButton
            type="primary"
            size="small"
            text={isSaving ? "保存中..." : "保存"}
            disabled={!isValid || isSaving}
            onClick={handleSave}
          />
        </div>
      </div>
    </BasicPage>
  );
}

function SessionEditLoader({ id }: { id: string }) {
  const [session, setSession] = useState<GameEventResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    (async () => {
      try {
        const detail = await getGameEventDetail(id);
        setSession(detail);
      } catch (err) {
        const message =
          err instanceof Error
            ? err.message
            : "セッション情報の取得に失敗しました";
        setError(message);
        toast.error(message);
      } finally {
        setIsLoading(false);
      }
    })();
  }, [id]);

  if (isLoading) {
    return (
      <BasicPage>
        <p className="text-gray-400">読み込み中...</p>
      </BasicPage>
    );
  }

  if (error || !session) {
    return (
      <BasicPage>
        <div className="flex flex-col items-center gap-6">
          <p className="text-red-400">
            {error ?? "セッションが見つかりません"}
          </p>
          <RoundButton
            type="black"
            size="medium"
            text="一覧に戻る"
            onClick={() => navigate("/session/list")}
          />
        </div>
      </BasicPage>
    );
  }

  return <SessionEditForm session={session} />;
}

export function SessionEdit() {
  const { id } = useParams<{ id: string }>();
  const location = useLocation();
  const state = location.state as LocationState;
  const sessionFromState = state?.session;

  if (!id) {
    return (
      <BasicPage>
        <p className="text-red-400">セッション ID が指定されていません</p>
      </BasicPage>
    );
  }

  if (sessionFromState) {
    return <SessionEditForm session={sessionFromState} />;
  }

  return <SessionEditLoader id={id} />;
}

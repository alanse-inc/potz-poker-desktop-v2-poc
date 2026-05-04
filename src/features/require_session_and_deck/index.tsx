import type { ReactNode } from "react";
import { useNavigate } from "react-router";
import { usePreferences } from "../../hooks/usePreferences";
import { RoundButton } from "../../ui/button/round_button";
import { LoadingSpinner } from "../../ui/loading_spinner";

type Props = {
  children: ReactNode;
};

/**
 * ゲーム画面を開く前提として Session / Deck の選択保存を要求するガード。
 *
 * 子要素（ゲーム設定画面）は常時レンダリングし、未保存の場合は
 * その上にモーダル風オーバーレイで誘導 UI を被せる。
 *
 * @tauri-apps/plugin-store で永続化された preferences を読み込み、
 * lastSelectedSessionId / lastSelectedDeckIds の有無でブロック判定する。
 */
export function RequireSessionAndDeck({ children }: Props) {
  const navigate = useNavigate();
  const { preferences, isLoaded } = usePreferences();

  if (!isLoaded) {
    return (
      <div className="flex h-full w-full items-center justify-center">
        <LoadingSpinner size="large" />
      </div>
    );
  }

  const hasSession = !!preferences.lastSelectedSessionId;
  const hasDeck = preferences.lastSelectedDeckIds.length > 0;
  const blocked = !hasSession || !hasDeck;

  const missingItems: string[] = [];
  if (!hasSession) missingItems.push("Session");
  if (!hasDeck) missingItems.push("Deck");

  return (
    <>
      {children}
      {blocked && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/70 backdrop-blur-sm">
          <div className="flex w-md flex-col items-center gap-8 rounded-xl border border-white bg-black-deep px-10 py-12 text-center">
            <h2 className="font-bold text-2xl text-white">
              {missingItems.join(" と ")} を選択してください
            </h2>
            <div className="flex w-full flex-col gap-4">
              {!hasSession && (
                <RoundButton
                  type="primary"
                  size="full"
                  text="SESSION を選択する"
                  onClick={() => navigate("/session/list")}
                />
              )}
              {!hasDeck && (
                <RoundButton
                  type="primary"
                  size="full"
                  text="DECK を選択する"
                  onClick={() => navigate("/deck/choose")}
                />
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { api } from "../../api/client";
import type { GameSettings } from "../../types";
import { RoundButton } from "../../ui/button/round_button";
import { BasicPage } from "../../ui/page/basic";

const APP_VERSION = "0.1.0";

export function AccountPage() {
  const navigate = useNavigate();
  const [gameSettings, setGameSettings] = useState<GameSettings | null>(null);

  useEffect(() => {
    api.gameSettings
      .load()
      .then(setGameSettings)
      .catch(() => {
        setGameSettings(null);
      });
  }, []);

  return (
    <BasicPage scrollable>
      <div className="relative flex w-full max-w-md flex-col items-center px-8 py-10">
        {/* ヘッダー */}
        <h1 className="mb-8 font-bold text-3xl text-primary">アカウント</h1>

        <div className="w-full select-text">
          {/* アプリバージョン */}
          <div className="mb-4 flex items-center justify-between gap-6">
            <span className="font-bold text-lg text-white">バージョン</span>
            <span className="font-bold text-lg text-primary">
              {APP_VERSION}
            </span>
          </div>

          {/* ゲーム設定 */}
          {gameSettings && (
            <>
              <div className="my-6 w-full border-white/30 border-b" />

              <h2 className="mb-4 font-bold text-white text-xl">ゲーム設定</h2>

              <div className="mb-4 flex items-center justify-between gap-6">
                <span className="font-bold text-lg text-white">SB</span>
                <span className="font-bold text-lg text-primary">
                  {gameSettings.smallBlind.toLocaleString()}
                </span>
              </div>

              <div className="mb-4 flex items-center justify-between gap-6">
                <span className="font-bold text-lg text-white">BB</span>
                <span className="font-bold text-lg text-primary">
                  {gameSettings.bigBlind.toLocaleString()}
                </span>
              </div>

              <div className="mb-4 flex items-center justify-between gap-6">
                <span className="font-bold text-lg text-white">MIN CHIP</span>
                <span className="font-bold text-lg text-primary">
                  {gameSettings.minChip.toLocaleString()}
                </span>
              </div>

              <div className="mb-4 flex items-center justify-between gap-6">
                <span className="font-bold text-lg text-white">BB ANTE</span>
                <span className="font-bold text-lg text-primary">
                  {gameSettings.bbAnte ? "あり" : "なし"}
                </span>
              </div>
            </>
          )}

          <div className="mt-8 mb-8 w-full border-white/30 border-b" />

          <div className="flex w-full justify-center">
            <RoundButton
              type="dark-gray"
              size="medium"
              text="ホームへ戻る"
              onClick={() => navigate("/")}
            />
          </div>
        </div>
      </div>
    </BasicPage>
  );
}

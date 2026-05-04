import { useNavigate } from "react-router";
import { api } from "../../api/client";
import { RoundButton } from "../../ui/button/round_button";
import { BasicPage } from "../../ui/page/basic";

export function Home() {
  const navigate = useNavigate();

  const handleOpenTelop = async () => {
    try {
      await api.telop.open();
    } catch {
      // ignore
    }
  };

  return (
    <BasicPage>
      <div className="flex flex-col items-center gap-8 p-8">
        <h1 className="font-bold text-4xl text-primary">POTZ POKER</h1>
        <div className="flex flex-col gap-4">
          <RoundButton
            type="primary"
            text="新規ゲーム設定"
            size="large"
            onClick={() => navigate("/game/setting")}
          />
          <RoundButton
            type="primary"
            text="AUTO ゲーム設定"
            size="large"
            onClick={() => navigate("/auto-game/setting")}
          />
          <RoundButton
            type="black"
            text="テロップウィンドウを開く"
            size="large"
            onClick={handleOpenTelop}
          />
          <RoundButton
            type="black"
            text="テロップ設定"
            size="large"
            onClick={() => navigate("/settings/telop")}
          />
          <RoundButton
            type="black"
            text="リモート接続"
            size="large"
            onClick={() => navigate("/settings/remote")}
          />
          <RoundButton
            type="black"
            text="テーブル名設定"
            size="large"
            onClick={() => navigate("/settings/table-name")}
          />
          <RoundButton
            type="black"
            text="セッション一覧"
            size="large"
            onClick={() => navigate("/session/list")}
          />
          <RoundButton
            type="dark-gray"
            text="アカウント"
            size="large"
            onClick={() => navigate("/account")}
          />
          <RoundButton
            type="dark-gray"
            text="デバッグ"
            size="large"
            onClick={() => navigate("/debug")}
          />
        </div>
      </div>
    </BasicPage>
  );
}

import { useMemo } from "react";
import { useNavigate } from "react-router";
import { api } from "../../api/client";
import { useAuth } from "../../contexts/auth_context";
import { CustomLoginForm } from "../../features/auth/custom_login_form";
import { RoundButton } from "../../ui/button/round_button";
import { LoadingSpinner } from "../../ui/loading_spinner";
import { BasicPage } from "../../ui/page/basic";
import { getUserLicense } from "../../utils/license";

function HomeMenu() {
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

export function Home() {
  // E2E 環境では認証ゲートをバイパスして既存の E2E テストを維持する
  if (import.meta.env.VITE_E2E === "true") {
    return <HomeMenu />;
  }

  return <HomeGate />;
}

function HomeGate() {
  const {
    isSignedIn,
    user,
    isInitializing,
    isLoggingIn,
    authError,
    loginWithPassword,
  } = useAuth();

  const license = useMemo(() => getUserLicense(user), [user]);

  if (isInitializing || isLoggingIn) {
    return (
      <div className="flex h-full w-full items-center justify-center p-4">
        <LoadingSpinner size="large" />
      </div>
    );
  }

  if (!isSignedIn) {
    return (
      <CustomLoginForm
        onLogin={loginWithPassword}
        isLoading={isLoggingIn}
        error={authError ?? undefined}
      />
    );
  }

  if (!license.isValid) {
    return (
      <BasicPage>
        <div className="flex h-full w-full items-center justify-center p-6">
          <div className="max-w-2xl text-center">
            <p className="mb-8 text-lg text-white leading-relaxed">
              現在ご利用のアカウントではライセンスが確認できません。
              <br />
              ※お困りの場合はPOTZサポートまでお問い合わせください。
            </p>
            <div className="space-y-4">
              <div className="mt-4">
                <a
                  href="https://potz-pro.com/poker/"
                  className="text-primary underline"
                  target="_blank"
                  rel="noreferrer"
                >
                  https://potz-pro.com/poker/
                </a>
              </div>
            </div>
          </div>
        </div>
      </BasicPage>
    );
  }

  return <HomeMenu />;
}

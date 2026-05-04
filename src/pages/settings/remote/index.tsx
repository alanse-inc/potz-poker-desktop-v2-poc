import { invoke } from "@tauri-apps/api/core";
import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import QRCode from "react-qr-code";
import { useNavigate } from "react-router";
import { RoundButton } from "../../../ui/button/round_button";
import { BasicPage } from "../../../ui/page/basic";

const BACKEND_URL = "http://localhost:8080";

export function RemoteSettings() {
  const navigate = useNavigate();
  const [connectionUrl, setConnectionUrl] = useState<string>("");
  const [tableName, setTableName] = useState<string>("");
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const init = async () => {
      try {
        setIsLoading(true);
        setError(null);
        const tn = await invoke<string>("get_table_name").catch(() => "");
        setTableName(tn);
        setConnectionUrl(BACKEND_URL);
      } catch {
        setError("接続情報の取得に失敗しました");
      } finally {
        setIsLoading(false);
      }
    };
    void init();
  }, []);

  const qrData = JSON.stringify({
    url: connectionUrl,
    type: "potz-poker-remote",
    tableName,
  });

  return (
    <BasicPage scrollable>
      <div className="flex w-full max-w-md flex-col gap-6 p-8">
        <h1 className="text-center font-bold text-2xl text-primary">
          リモート接続
        </h1>

        {isLoading ? (
          <div className="flex flex-col items-center gap-4">
            <p className="text-gray-400 text-sm">接続情報を読み込み中...</p>
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-700 border-t-primary" />
          </div>
        ) : error ? (
          <p className="text-red-400 text-sm">{error}</p>
        ) : (
          <>
            <p className="text-center text-gray-300 text-sm">
              QRコードをiPadなどの端末で読み取ってください
            </p>

            <div className="flex items-center justify-center rounded-lg bg-white p-4">
              <QRCode value={qrData} size={224} />
            </div>

            <div className="flex flex-col gap-1">
              <span className="block font-bold text-sm text-white">
                接続URL
              </span>
              <div className="flex items-stretch gap-2">
                <p className="flex-1 break-all rounded border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white">
                  {connectionUrl}
                </p>
                <button
                  type="button"
                  aria-label="接続URLをコピー"
                  title="接続URLをコピー"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(connectionUrl);
                      toast.success("接続URLをコピーしました");
                    } catch {
                      toast.error("コピーに失敗しました");
                    }
                  }}
                  className="flex shrink-0 cursor-pointer items-center justify-center rounded border border-gray-700 bg-gray-800 px-3 text-white transition-colors hover:bg-gray-700"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <title>コピー</title>
                    <rect width="14" height="14" x="8" y="8" rx="2" ry="2" />
                    <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
                  </svg>
                </button>
              </div>
              <p className="text-gray-500 text-xs">
                ※ 同じWiFiネットワークに接続してください
              </p>
            </div>

            {tableName && (
              <div className="flex flex-col gap-1">
                <span className="block font-bold text-sm text-white">
                  テーブル名
                </span>
                <p className="rounded border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white">
                  {tableName}
                </p>
              </div>
            )}
          </>
        )}

        <RoundButton
          type="black"
          text="戻る"
          size="full"
          onClick={() => navigate("/")}
        />
      </div>
    </BasicPage>
  );
}

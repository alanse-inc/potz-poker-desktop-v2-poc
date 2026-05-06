import type { Html5QrcodeResult } from "html5-qrcode";
import { useEffect, useId, useRef, useState } from "react";
import { type CameraDevice, useQrScanner } from "../hooks/useQrScanner";

type Props = {
  /** QRコード検出時のコールバック */
  onScanSuccess: (decodedText: string, result: Html5QrcodeResult) => void;
  /** スキャン自動開始フラグ */
  autoStart?: boolean;
};

/**
 * QRコードスキャナーコンポーネント
 *
 * Webカメラを使用してQRコードをリアルタイムスキャンします。
 * カメラが複数接続されている場合は切り替えセレクタを表示します。
 */
export function QrScanner({ onScanSuccess, autoStart = true }: Props) {
  const elementId = useId();
  const {
    isScanning,
    error,
    cameras,
    selectedCameraId,
    startScanning,
    selectCamera,
  } = useQrScanner(elementId, onScanSuccess, {
    fps: 10,
    qrbox: 400,
    facingMode: "user",
  });

  // 自動開始: マウント後に少し待ってからスキャン開始（DOM完全レンダリング待ち）
  useEffect(() => {
    if (!autoStart || isScanning || error) {
      return;
    }

    const timer = setTimeout(() => {
      startScanning();
    }, 100);

    return () => clearTimeout(timer);
  }, [autoStart, isScanning, error, startScanning]);

  return (
    <div className="flex w-full flex-col items-center justify-center gap-6">
      {/* カメラ映像表示エリア */}
      <div className="relative w-full max-w-md">
        <div
          id={elementId}
          className="aspect-[4/3] w-full overflow-hidden rounded-lg bg-gray-900"
          style={{ transform: "scaleX(-1)" }}
        />

        {isScanning && (
          <div className="absolute top-3 left-3 rounded-full bg-black/70 px-3 py-1.5 text-white text-xs">
            Scan QR Code
          </div>
        )}

        {cameras.length > 1 && (
          <CameraSelectorDropdown
            cameras={cameras}
            selectedCameraId={selectedCameraId}
            onSelect={selectCamera}
          />
        )}
      </div>

      {error && (
        <div className="w-full max-w-md rounded border border-red-400 bg-red-100 px-4 py-3 text-red-700">
          <p className="font-bold">カメラエラー</p>
          <p className="text-sm">{error}</p>
          <button
            type="button"
            onClick={startScanning}
            className="mt-2 rounded bg-red-600 px-4 py-2 text-white hover:bg-red-700"
          >
            再試行
          </button>
        </div>
      )}
    </div>
  );
}

type CameraSelectorDropdownProps = {
  cameras: CameraDevice[];
  selectedCameraId: string | null;
  onSelect: (cameraId: string) => void;
};

function CameraSelectorDropdown({
  cameras,
  selectedCameraId,
  onSelect,
}: CameraSelectorDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const handleDocumentClick = (event: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleDocumentClick);
    return () => document.removeEventListener("mousedown", handleDocumentClick);
  }, [isOpen]);

  const selectedIndex = cameras.findIndex((c) => c.id === selectedCameraId);
  const selected = selectedIndex >= 0 ? cameras[selectedIndex] : cameras[0];
  const selectedLabel =
    selected?.label || `カメラ ${Math.max(0, selectedIndex) + 1}`;

  return (
    <div ref={containerRef} className="absolute top-3 right-3 z-10">
      <button
        type="button"
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        onClick={() => setIsOpen((prev) => !prev)}
        className="flex max-w-[180px] items-center gap-2 rounded-lg bg-black/70 px-3 py-1.5 text-white text-xs backdrop-blur-sm transition hover:bg-black/85"
      >
        <svg
          aria-hidden="true"
          className="h-3.5 w-3.5 shrink-0"
          fill="currentColor"
          viewBox="0 0 24 24"
          xmlns="http://www.w3.org/2000/svg"
        >
          <title>カメラ</title>
          <path d="M9 4a2 2 0 0 0-1.79 1.106L6.382 6.764A1 1 0 0 1 5.486 7.32H4a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-8a2 2 0 0 0-2-2h-1.486a1 1 0 0 1-.896-.553l-.829-1.658A2 2 0 0 0 15 4H9zm3 4a4.5 4.5 0 1 1 0 9 4.5 4.5 0 0 1 0-9z" />
        </svg>
        <span className="truncate">{selectedLabel}</span>
        <svg
          aria-hidden="true"
          className={`h-3.5 w-3.5 shrink-0 transition-transform ${
            isOpen ? "rotate-180" : ""
          }`}
          fill="currentColor"
          viewBox="0 0 20 20"
          xmlns="http://www.w3.org/2000/svg"
        >
          <title>メニュー</title>
          <path
            clipRule="evenodd"
            d="M5.23 7.21a.75.75 0 0 1 1.06.02L10 11.06l3.71-3.83a.75.75 0 0 1 1.08 1.04l-4.25 4.39a.75.75 0 0 1-1.08 0L5.21 8.27a.75.75 0 0 1 .02-1.06z"
            fillRule="evenodd"
          />
        </svg>
      </button>
      {isOpen && (
        <div
          role="listbox"
          aria-label="カメラ選択"
          className="absolute right-0 mt-1 max-h-60 min-w-[200px] overflow-auto rounded-lg border border-white/10 bg-black/85 py-1 shadow-xl backdrop-blur-md"
        >
          {cameras.map((cam, index) => {
            const isSelected = cam.id === selectedCameraId;
            return (
              <button
                key={cam.id}
                role="option"
                aria-selected={isSelected}
                className={`block w-full px-3 py-2 text-left text-xs transition hover:bg-white/10 ${
                  isSelected
                    ? "bg-white/10 font-bold text-primary"
                    : "text-white"
                }`}
                type="button"
                onClick={() => {
                  onSelect(cam.id);
                  setIsOpen(false);
                }}
              >
                <span className="truncate">
                  {cam.label || `カメラ ${index + 1}`}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

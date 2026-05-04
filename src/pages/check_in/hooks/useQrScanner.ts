import { Html5Qrcode, type Html5QrcodeResult } from "html5-qrcode";
import { useCallback, useEffect, useRef, useState } from "react";

export type CameraDevice = {
  id: string;
  label: string;
};

export type QrScannerConfig = {
  /** スキャン頻度（FPS） */
  fps?: number;
  /** QRコード検出領域のサイズ（px） */
  qrbox?: number;
  /** カメラの向き（フロント/バック）- デバイス列挙失敗時のフォールバック */
  facingMode?: "user" | "environment";
};

export type QrScannerState = {
  isScanning: boolean;
  error: string | null;
  lastScannedValue: string | null;
  cameras: CameraDevice[];
  selectedCameraId: string | null;
};

/**
 * html5-qrcodeライブラリを使用したQRスキャナーフック
 *
 * @param elementId - QRスキャナーをマウントするHTML要素のID
 * @param onScanSuccess - QRコード検出時のコールバック
 * @param config - スキャナーの設定
 */
export function useQrScanner(
  elementId: string,
  onScanSuccess: (decodedText: string, result: Html5QrcodeResult) => void,
  config: QrScannerConfig = {},
) {
  const { fps = 10, qrbox = 250, facingMode = "user" } = config;

  const scannerRef = useRef<Html5Qrcode | null>(null);
  const isStartingRef = useRef(false);
  const configRef = useRef({ facingMode, fps, qrbox });
  const callbackRef = useRef(onScanSuccess);
  const selectedCameraIdRef = useRef<string | null>(null);

  useEffect(() => {
    callbackRef.current = onScanSuccess;
  }, [onScanSuccess]);

  useEffect(() => {
    configRef.current = { facingMode, fps, qrbox };
  }, [facingMode, fps, qrbox]);

  const [state, setState] = useState<QrScannerState>({
    isScanning: false,
    error: null,
    lastScannedValue: null,
    cameras: [],
    selectedCameraId: null,
  });

  // マウント時にカメラ一覧を取得
  useEffect(() => {
    Html5Qrcode.getCameras()
      .then((devices) => {
        if (devices.length === 0) return;
        const backCamera = devices.find((cam) =>
          /back|rear|environment/i.test(cam.label),
        );
        const defaultCamera = backCamera ?? devices[0];
        selectedCameraIdRef.current = defaultCamera.id;
        setState((prev) => ({
          ...prev,
          cameras: devices,
          selectedCameraId: defaultCamera.id,
        }));
      })
      .catch((error) => {
        if (
          error instanceof DOMException &&
          (error.name === "NotAllowedError" || error.name === "NotFoundError")
        ) {
          return;
        }
        console.error("Failed to enumerate cameras on mount", error);
      });
  }, []);

  const startScanning = useCallback(async () => {
    if (isStartingRef.current || scannerRef.current?.isScanning) {
      return;
    }
    isStartingRef.current = true;
    try {
      if (!scannerRef.current) {
        scannerRef.current = new Html5Qrcode(elementId);
      }

      setState((prev) => ({ ...prev, isScanning: true, error: null }));

      const currentConfig = configRef.current;

      let cameraIdOrConstraint: string | MediaTrackConstraints;
      const cameraId = selectedCameraIdRef.current;

      if (cameraId) {
        cameraIdOrConstraint = cameraId;
      } else {
        try {
          const cameras = await Html5Qrcode.getCameras();
          if (cameras.length === 0) {
            throw new Error("カメラが見つかりませんでした");
          }
          const backCamera = cameras.find((cam) =>
            /back|rear|environment/i.test(cam.label),
          );
          const selected = backCamera ?? cameras[0];
          selectedCameraIdRef.current = selected.id;
          setState((prev) => ({
            ...prev,
            cameras,
            selectedCameraId: selected.id,
          }));
          cameraIdOrConstraint = selected.id;
        } catch {
          cameraIdOrConstraint = { facingMode: currentConfig.facingMode };
        }
      }

      await scannerRef.current.start(
        cameraIdOrConstraint,
        { fps: currentConfig.fps, qrbox: currentConfig.qrbox },
        (decodedText, decodedResult) => {
          setState((prev) => ({ ...prev, lastScannedValue: decodedText }));
          callbackRef.current(decodedText, decodedResult);
        },
        () => {
          // QRコード未検出時のエラーは無視
        },
      );
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "カメラの起動に失敗しました";
      setState((prev) => ({
        ...prev,
        isScanning: false,
        error: message,
      }));
    } finally {
      isStartingRef.current = false;
    }
  }, [elementId]);

  const stopScanning = useCallback(async () => {
    try {
      if (scannerRef.current?.isScanning) {
        await scannerRef.current.stop();
      }
      setState((prev) => ({ ...prev, isScanning: false }));
    } catch (error) {
      setState((prev) => ({ ...prev, isScanning: false }));
      throw error;
    }
  }, []);

  const selectCamera = useCallback(
    async (cameraId: string) => {
      const wasScanning = scannerRef.current?.isScanning ?? false;
      selectedCameraIdRef.current = cameraId;
      setState((prev) => ({ ...prev, selectedCameraId: cameraId }));
      if (!wasScanning) return;
      try {
        await stopScanning();
      } catch {
        return;
      }
      await startScanning();
    },
    [stopScanning, startScanning],
  );

  // アンマウント時クリーンアップ
  useEffect(() => {
    return () => {
      const scanner = scannerRef.current;
      if (!scanner) return;
      const cleanup = scanner.isScanning
        ? scanner.stop().then(() => scanner.clear())
        : Promise.resolve(scanner.clear());
      cleanup.catch((error) => {
        console.error("Failed to cleanup scanner", error);
      });
    };
  }, []);

  return {
    ...state,
    startScanning,
    stopScanning,
    selectCamera,
  };
}

import { useCallback, useEffect, useRef } from "react";

/**
 * USB QRコードリーダーのキーボード入力をキャプチャするカスタムフック
 *
 * USB QRコードリーダーはキーボード入力をエミュレーションし、
 * 読み取りデータを高速にタイプした後、Enterキーを送信する。
 * このフックはその入力をバッファリングし、Enterキーで完了としてコールバックを発火する。
 *
 * @param onRead 読み取り完了時のコールバック（バッファリングされた文字列を渡す）
 * @param enabled フックの有効/無効（USBモードかつscanningステップのときのみtrue）
 */
export function useUsbQrReader(
  onRead: (decodedText: string) => void,
  enabled: boolean,
) {
  const bufferRef = useRef("");
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onReadRef = useRef(onRead);

  useEffect(() => {
    onReadRef.current = onRead;
  }, [onRead]);

  const resetBuffer = useCallback(() => {
    bufferRef.current = "";
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!enabled) {
      resetBuffer();
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      // IME変換中の入力は無視（Windows日本語IME環境での誤入力防止）
      if (event.isComposing) {
        return;
      }

      // フォーム要素にフォーカスがある場合は無視
      const target = event.target as HTMLElement;
      if (
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.tagName === "SELECT" ||
        target.isContentEditable
      ) {
        return;
      }

      if (event.key === "Enter") {
        event.preventDefault();
        const data = bufferRef.current.trim();
        if (data.length > 0) {
          onReadRef.current(data);
        }
        resetBuffer();
        return;
      }

      // 制御キーは無視（Shift, Ctrl, Alt, Meta, Tab, Escape等）
      if (event.key.length !== 1) {
        return;
      }

      bufferRef.current += event.key;

      // タイマーリセット: 500ms入力がなければバッファクリア
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
      timerRef.current = setTimeout(() => {
        resetBuffer();
      }, 500);
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      resetBuffer();
    };
  }, [enabled, resetBuffer]);
}

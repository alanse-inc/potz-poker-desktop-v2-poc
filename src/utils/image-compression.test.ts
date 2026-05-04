import { beforeEach, describe, expect, it, vi } from "vitest";
import { compressImageToTargetSize } from "./image-compression";

/**
 * image-compression テスト
 *
 * Canvas API は jsdom で部分的にしか動かないため、
 * FileReader / Image を prototype 経由でモックする。
 */

// テスト用の小さなダミー PNG (1x1px) の Data URL
const DUMMY_PNG_DATA_URL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

/**
 * Data URL から File オブジェクトを生成するヘルパー
 */
function dataUrlToFile(dataUrl: string, filename: string): File {
  const [header, base64] = dataUrl.split(",");
  const mimeMatch = header.match(/:(.*?);/);
  const mime = mimeMatch ? mimeMatch[1] : "image/png";
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new File([bytes], filename, { type: mime });
}

/**
 * FileReader.prototype.readAsDataURL をモックして onload を呼ぶ。
 */
function mockFileReaderSuccess(resultDataUrl: string) {
  vi.spyOn(FileReader.prototype, "readAsDataURL").mockImplementation(function (
    this: FileReader,
  ) {
    setTimeout(() => {
      Object.defineProperty(this, "result", {
        get: () => resultDataUrl,
        configurable: true,
      });
      this.onload?.({ target: this } as ProgressEvent<FileReader>);
    }, 0);
  });
}

/**
 * FileReader.prototype.readAsDataURL をモックして onerror を呼ぶ。
 */
function mockFileReaderError() {
  vi.spyOn(FileReader.prototype, "readAsDataURL").mockImplementation(function (
    this: FileReader,
  ) {
    setTimeout(() => {
      this.onerror?.(new ProgressEvent("error"));
    }, 0);
  });
}

/**
 * FileReader.prototype.readAsDataURL をモックして result=null で onload を呼ぶ。
 */
function mockFileReaderNullResult() {
  vi.spyOn(FileReader.prototype, "readAsDataURL").mockImplementation(function (
    this: FileReader,
  ) {
    setTimeout(() => {
      Object.defineProperty(this, "result", {
        get: () => null,
        configurable: true,
      });
      this.onload?.({ target: this } as ProgressEvent<FileReader>);
    }, 0);
  });
}

/**
 * HTMLImageElement.prototype の src セッターをモックして onload を呼ぶ。
 */
function mockImageSuccess(width: number, height: number) {
  Object.defineProperty(HTMLImageElement.prototype, "width", {
    get: () => width,
    configurable: true,
  });
  Object.defineProperty(HTMLImageElement.prototype, "height", {
    get: () => height,
    configurable: true,
  });
  Object.defineProperty(HTMLImageElement.prototype, "src", {
    set(_url: string) {
      setTimeout(() => {
        this.onload?.();
      }, 0);
    },
    configurable: true,
  });
}

/**
 * HTMLImageElement.prototype の src セッターをモックして onerror を呼ぶ。
 */
function mockImageError() {
  Object.defineProperty(HTMLImageElement.prototype, "src", {
    set(_url: string) {
      setTimeout(() => {
        this.onerror?.();
      }, 0);
    },
    configurable: true,
  });
}

describe("compressImageToTargetSize", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    // setup.ts の getContext モックを再適用（restoreAllMocks で消えるため）
    HTMLCanvasElement.prototype.getContext = vi.fn().mockReturnValue({
      fillRect: vi.fn(),
      clearRect: vi.fn(),
      getImageData: vi.fn(),
      putImageData: vi.fn(),
      createImageData: vi.fn(),
      setTransform: vi.fn(),
      drawImage: vi.fn(),
      save: vi.fn(),
      restore: vi.fn(),
      scale: vi.fn(),
      rotate: vi.fn(),
      translate: vi.fn(),
      transform: vi.fn(),
      beginPath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      closePath: vi.fn(),
      stroke: vi.fn(),
      fill: vi.fn(),
      arc: vi.fn(),
      fillText: vi.fn(),
      measureText: vi.fn().mockReturnValue({ width: 0 }),
      canvas: {} as HTMLCanvasElement,
      fillStyle: "",
      strokeStyle: "",
      lineWidth: 1,
    });
  });

  describe("正常系: 小さい画像がそのまま通る", () => {
    it("目標サイズ内の画像はそのまま resolve される", async () => {
      const file = dataUrlToFile(DUMMY_PNG_DATA_URL, "test.png");
      mockFileReaderSuccess(DUMMY_PNG_DATA_URL);
      mockImageSuccess(100, 100);

      const smallDataUrl = `data:image/jpeg;base64,${"A".repeat(100)}`;
      HTMLCanvasElement.prototype.toDataURL = vi
        .fn()
        .mockReturnValue(smallDataUrl);

      const result = await compressImageToTargetSize(file, 500);
      expect(result).toBe(smallDataUrl);
    });
  });

  describe("リサイズロジック", () => {
    it("maxDimension を超える横長画像でも resolve される", async () => {
      const file = dataUrlToFile(DUMMY_PNG_DATA_URL, "wide.png");
      mockFileReaderSuccess(DUMMY_PNG_DATA_URL);
      mockImageSuccess(1280, 720);

      const smallDataUrl = `data:image/jpeg;base64,${"B".repeat(50)}`;
      HTMLCanvasElement.prototype.toDataURL = vi
        .fn()
        .mockReturnValue(smallDataUrl);

      const result = await compressImageToTargetSize(file, 500, 640);
      expect(result).toBe(smallDataUrl);
    });

    it("maxDimension を超える縦長画像でも resolve される", async () => {
      const file = dataUrlToFile(DUMMY_PNG_DATA_URL, "tall.png");
      mockFileReaderSuccess(DUMMY_PNG_DATA_URL);
      mockImageSuccess(480, 960);

      const smallDataUrl = `data:image/jpeg;base64,${"C".repeat(50)}`;
      HTMLCanvasElement.prototype.toDataURL = vi
        .fn()
        .mockReturnValue(smallDataUrl);

      const result = await compressImageToTargetSize(file, 500, 640);
      expect(result).toBe(smallDataUrl);
    });

    it("maxDimension 以内の画像はそのまま resolve される", async () => {
      const file = dataUrlToFile(DUMMY_PNG_DATA_URL, "small.png");
      mockFileReaderSuccess(DUMMY_PNG_DATA_URL);
      mockImageSuccess(320, 240);

      const smallDataUrl = `data:image/jpeg;base64,${"D".repeat(50)}`;
      HTMLCanvasElement.prototype.toDataURL = vi
        .fn()
        .mockReturnValue(smallDataUrl);

      const result = await compressImageToTargetSize(file, 500, 640);
      expect(result).toBe(smallDataUrl);
    });
  });

  describe("品質調整ロジック", () => {
    it("大きなデータのとき品質を下げながら再試行し最終的に resolve する", async () => {
      const file = dataUrlToFile(DUMMY_PNG_DATA_URL, "large.png");
      mockFileReaderSuccess(DUMMY_PNG_DATA_URL);
      mockImageSuccess(100, 100);

      let callCount = 0;
      // 最初の3回は大きいデータ（~200KB）を返し、それ以降は小さいデータ
      HTMLCanvasElement.prototype.toDataURL = vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount < 3) {
          // 200KB相当のbase64文字列 (200*1024*4/3 ≒ 273067 文字)
          return `data:image/jpeg;base64,${"X".repeat(273067)}`;
        }
        return `data:image/jpeg;base64,${"Y".repeat(50)}`;
      });

      const result = await compressImageToTargetSize(file, 100);
      expect(result).toContain("data:image/jpeg;base64,");
      expect(callCount).toBeGreaterThanOrEqual(3);
    });

    it("最低品質でも超える場合、最後の toDataURL の戻り値が返る", async () => {
      const file = dataUrlToFile(DUMMY_PNG_DATA_URL, "huge.png");
      mockFileReaderSuccess(DUMMY_PNG_DATA_URL);
      mockImageSuccess(100, 100);

      // 常に大きなデータを返す（品質0.1でも超過させる）
      const bigDataUrl = `data:image/jpeg;base64,${"Z".repeat(500 * 1024 * 2)}`;
      HTMLCanvasElement.prototype.toDataURL = vi
        .fn()
        .mockReturnValue(bigDataUrl);

      // 1KBという極小ターゲット: quality が 0.1 以下になってフォールバック実行
      const result = await compressImageToTargetSize(file, 1);
      expect(result).toBe(bigDataUrl);
    });
  });

  describe("エラー系", () => {
    it("FileReader.onerror -> reject", async () => {
      const file = dataUrlToFile(DUMMY_PNG_DATA_URL, "error.png");
      mockFileReaderError();

      await expect(compressImageToTargetSize(file, 500)).rejects.toThrow(
        "ファイルの読み込みに失敗しました",
      );
    });

    it("img.onerror -> reject", async () => {
      const file = dataUrlToFile(DUMMY_PNG_DATA_URL, "brokenpng.png");
      mockFileReaderSuccess(DUMMY_PNG_DATA_URL);
      mockImageError();

      await expect(compressImageToTargetSize(file, 500)).rejects.toThrow(
        "画像の読み込みに失敗しました",
      );
    });

    it("FileReader.result が文字列でない場合 -> reject", async () => {
      const file = dataUrlToFile(DUMMY_PNG_DATA_URL, "nullresult.png");
      mockFileReaderNullResult();

      await expect(compressImageToTargetSize(file, 500)).rejects.toThrow(
        "ファイルの読み込みに失敗しました",
      );
    });

    it("Canvas context が取得できない場合 -> reject", async () => {
      const file = dataUrlToFile(DUMMY_PNG_DATA_URL, "noctx.png");
      mockFileReaderSuccess(DUMMY_PNG_DATA_URL);
      mockImageSuccess(100, 100);

      // getContext が null を返す
      HTMLCanvasElement.prototype.getContext = vi.fn().mockReturnValue(null);

      await expect(compressImageToTargetSize(file, 500)).rejects.toThrow(
        "Canvas context not available",
      );
    });
  });
});

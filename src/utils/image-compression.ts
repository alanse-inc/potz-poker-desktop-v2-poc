/**
 * 画像圧縮ユーティリティ
 * プロフィール画像を目標サイズまで自動的にリサイズ・圧縮します
 */

/**
 * 画像を目標ファイルサイズ以下に圧縮する
 * @param file 元画像ファイル
 * @param targetSizeKB 目標ファイルサイズ（KB）
 * @param maxDimension 最大寸法（px）- 画像の長辺がこのサイズを超える場合は縮小
 * @returns 圧縮された画像のBase64 Data URL
 */
export const compressImageToTargetSize = async (
  file: File,
  targetSizeKB: number,
  maxDimension = 640,
): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (e) => {
      const img = new Image();

      img.onload = async () => {
        try {
          // 1. リサイズ（アスペクト比を維持）
          let width = img.width;
          let height = img.height;

          if (width > maxDimension || height > maxDimension) {
            if (width > height) {
              height = (height / width) * maxDimension;
              width = maxDimension;
            } else {
              width = (width / height) * maxDimension;
              height = maxDimension;
            }
          }

          // 2. Canvas に描画
          const canvas = document.createElement("canvas");
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext("2d");

          if (!ctx) {
            reject(new Error("Canvas context not available"));
            return;
          }

          ctx.drawImage(img, 0, 0, width, height);

          // 3. 品質を調整しながら目標サイズ以下に圧縮
          let quality = 0.9;
          let compressedDataUrl = "";
          const targetSizeBytes = targetSizeKB * 1024;

          while (quality > 0.1) {
            compressedDataUrl = canvas.toDataURL("image/jpeg", quality);

            // Base64のデータ部分のサイズを計算
            // data:image/jpeg;base64, の部分を除く
            const base64Data = compressedDataUrl.split(",")[1];
            const binarySize = (base64Data.length * 3) / 4;

            if (binarySize <= targetSizeBytes) {
              break;
            }

            quality -= 0.1;
          }

          // 最低品質でも目標サイズを超える場合は、さらにリサイズ
          if (quality <= 0.1) {
            const scaleFactor = 0.8;
            width *= scaleFactor;
            height *= scaleFactor;
            canvas.width = width;
            canvas.height = height;
            ctx.drawImage(img, 0, 0, width, height);
            compressedDataUrl = canvas.toDataURL("image/jpeg", 0.1);
          }

          resolve(compressedDataUrl);
        } catch (error) {
          reject(error);
        }
      };

      img.onerror = () => {
        reject(new Error("画像の読み込みに失敗しました"));
      };

      if (typeof e.target?.result === "string") {
        img.src = e.target.result;
      } else {
        reject(new Error("ファイルの読み込みに失敗しました"));
      }
    };

    reader.onerror = () => {
      reject(new Error("ファイルの読み込みに失敗しました"));
    };

    reader.readAsDataURL(file);
  });
};

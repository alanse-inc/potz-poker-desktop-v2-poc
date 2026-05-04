/**
 * Auto Mode プレイヤー編集モーダル
 *
 * Electron 版の features/modal/auto_mode_player_edit_modal/index.tsx を移植
 * アイコン圧縮・アップロード機能を含む
 */

import { useCallback, useRef, useState } from "react";
import toast from "react-hot-toast";
import { RoundButton } from "../../../ui/button/round_button";
import { SquareButton } from "../../../ui/button/square_button";
import { Modal } from "../../../ui/modal";
import { PlayerNameForm } from "../../form/player_name_form";
import { PlayerIcon } from "../../player/player_icon";

const MAX_FILE_SIZE_MB = 5;
const TARGET_ICON_SIZE_KB = 50;

export type EditPlayerData = {
  playerId?: string;
  name?: string;
  icon?: string | null;
};

type Props = {
  playerId?: string;
  name?: string;
  icon?: string | null;
  onJoin: (data: EditPlayerData) => void;
  onCancel: () => void;
  onDelete: () => void;
};

/**
 * 画像を目標サイズ以下に圧縮する
 */
async function compressImage(file: File, targetKB: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        let quality = 0.9;
        let result = "";
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          reject(new Error("Canvas context not available"));
          return;
        }

        // リサイズ (最大 200px)
        const maxSize = 200;
        let { width, height } = img;
        if (width > maxSize || height > maxSize) {
          if (width > height) {
            height = Math.round((height * maxSize) / width);
            width = maxSize;
          } else {
            width = Math.round((width * maxSize) / height);
            height = maxSize;
          }
        }
        canvas.width = width;
        canvas.height = height;
        ctx.drawImage(img, 0, 0, width, height);

        // 品質を下げながら圧縮
        while (quality > 0.1) {
          result = canvas.toDataURL("image/jpeg", quality);
          const sizeKB = (result.length * 3) / 4 / 1024;
          if (sizeKB <= targetKB) break;
          quality -= 0.1;
        }

        resolve(result);
      };
      img.onerror = () => reject(new Error("Image load failed"));
      img.src = e.target?.result as string;
    };
    reader.onerror = () => reject(new Error("File read failed"));
    reader.readAsDataURL(file);
  });
}

export function AutoModePlayerEditModal({
  playerId,
  name,
  icon,
  onJoin,
  onCancel,
  onDelete,
}: Props) {
  const [data, setData] = useState<EditPlayerData>({ playerId, name, icon });
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleNameChange = (newName: string) => {
    setData((prev) => ({ ...prev, name: newName }));
  };

  const handleUpdateIconClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const sizeMB = file.size / (1024 * 1024);
    if (sizeMB > MAX_FILE_SIZE_MB) {
      toast.error(`画像サイズが大きすぎます (最大 ${MAX_FILE_SIZE_MB}MB)`);
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    try {
      const compressed = await compressImage(file, TARGET_ICON_SIZE_KB);
      setData((prev) => ({ ...prev, icon: compressed }));
    } catch {
      toast.error("画像の処理に失敗しました");
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const joinDisabled = !data.name;

  const handleJoin = useCallback(() => {
    onJoin(data);
    onCancel();
  }, [onJoin, onCancel, data]);

  const handleDelete = useCallback(() => {
    onDelete();
    onCancel();
  }, [onDelete, onCancel]);

  return (
    <Modal>
      <div className="flex w-xl flex-col items-center gap-4 py-6 text-center">
        <h2 className="font-bold text-2xl text-primary">PROFILE</h2>

        <div className="flex flex-col items-center gap-2">
          <div className="flex items-center gap-4 py-1">
            <PlayerIcon
              playerIcon={data.icon ?? null}
              bgColor={data.icon ? "white" : "gray"}
              size="medium"
            />
            <SquareButton
              type="gray"
              text={["UPDATE"]}
              size="mini"
              onClick={handleUpdateIconClick}
            />
          </div>
          <p className="text-gray-400 text-xs">
            画像は {MAX_FILE_SIZE_MB}MB 以内で選択してください
          </p>
        </div>

        <div className="flex w-sm flex-col items-center gap-4">
          <div className="flex w-full flex-col gap-2 px-18">
            <PlayerNameForm
              value={data.name ?? ""}
              onChange={handleNameChange}
            />
          </div>

          <RoundButton
            type={joinDisabled ? "dark-gray" : "primary"}
            size="full"
            text="JOIN"
            disabled={joinDisabled}
            onClick={handleJoin}
          />

          <div className="flex w-full gap-6">
            <RoundButton
              type="dark-gray"
              size="full"
              text="CANCEL"
              onClick={onCancel}
            />
            <RoundButton
              type="black"
              size="full"
              text="DELETE"
              onClick={handleDelete}
            />
          </div>
        </div>
      </div>

      <input
        type="file"
        accept="image/*"
        style={{ display: "none" }}
        ref={fileInputRef}
        onChange={handleFileChange}
      />
    </Modal>
  );
}

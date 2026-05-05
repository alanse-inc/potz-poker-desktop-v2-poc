import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { useNavigate } from "react-router";
import { api } from "../../../api/client";
import { RoundButton } from "../../../ui/button/round_button";
import { BasicPage } from "../../../ui/page/basic";
import { TextInput } from "../../../ui/text_input";

export function TelopSettings() {
  const navigate = useNavigate();
  const [message, setMessage] = useState("");
  const [color, setColor] = useState("#000000");
  const [isLoading, setIsLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    api.telop
      .getState()
      .then((state) => {
        setMessage(state.message);
        setColor(state.color);
      })
      .catch(() => {
        // ignore
      });

    api.telop
      .isOpen()
      .then((open) => {
        setIsOpen(open);
      })
      .catch(() => {
        // ignore
      });
  }, []);

  const handleApply = async () => {
    setIsLoading(true);
    try {
      await api.telop.setMessage(message);
      await api.telop.setColor(color);
      toast.success("テロップを適用しました");
    } catch (e) {
      toast.error(
        e instanceof Error ? e.message : "テロップの適用に失敗しました",
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleToggleWindow = async () => {
    try {
      if (isOpen) {
        await api.telop.close();
        setIsOpen(false);
      } else {
        await api.telop.open();
        setIsOpen(true);
      }
    } catch (e) {
      toast.error(
        e instanceof Error
          ? e.message
          : "テロップウィンドウの操作に失敗しました",
      );
    }
  };

  return (
    <BasicPage>
      <div className="flex w-full max-w-md flex-col gap-6 p-8">
        <h1 className="text-center font-bold text-2xl text-primary">
          テロップ設定
        </h1>

        <div className="flex flex-col gap-4">
          <label className="block">
            <span className="mb-1 block font-bold text-sm text-white">
              テロップテキスト
            </span>
            <TextInput
              value={message}
              onChange={setMessage}
              placeholder="表示するメッセージを入力"
            />
          </label>

          <label className="block">
            <span className="mb-1 block font-bold text-sm text-white">
              背景色
            </span>
            <div className="flex items-center gap-4">
              <input
                type="color"
                value={color}
                onChange={(e) => setColor(e.target.value)}
                className="h-12 w-20 cursor-pointer rounded border-none bg-transparent"
              />
              <TextInput
                value={color}
                onChange={setColor}
                placeholder="#000000"
              />
            </div>
          </label>

          {/* プレビュー */}
          <div className="flex h-24 items-center justify-center rounded-xl">
            <div
              className="flex h-full w-full items-center justify-center rounded-xl"
              style={{ backgroundColor: color }}
            >
              <p className="font-bold text-2xl text-white drop-shadow-lg">
                {message || "プレビュー"}
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-3">
          <RoundButton
            type="primary"
            text={isLoading ? "適用中..." : "適用"}
            size="full"
            onClick={handleApply}
            disabled={isLoading}
          />
          <RoundButton
            type="black"
            text={
              isOpen ? "テロップウィンドウを閉じる" : "テロップウィンドウを開く"
            }
            size="full"
            onClick={handleToggleWindow}
          />
          <RoundButton
            type="black"
            text="戻る"
            size="full"
            onClick={() => navigate("/")}
          />
        </div>
      </div>
    </BasicPage>
  );
}

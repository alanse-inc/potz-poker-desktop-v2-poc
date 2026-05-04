import { invoke } from "@tauri-apps/api/core";
import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { useNavigate } from "react-router";
import { RoundButton } from "../../../ui/button/round_button";
import { BasicPage } from "../../../ui/page/basic";
import { TextInput } from "../../../ui/text_input";

export function TableNameSettings() {
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    invoke<string>("get_table_name")
      .then((n) => setName(n))
      .catch(() => {
        // ignore
      });
  }, []);

  const handleSave = async () => {
    setIsLoading(true);
    try {
      await invoke<void>("set_table_name", { name });
      toast.success("テーブル名を保存しました");
    } catch (e) {
      toast.error(
        e instanceof Error ? e.message : "テーブル名の保存に失敗しました",
      );
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <BasicPage>
      <div className="flex w-full max-w-md flex-col gap-6 p-8">
        <h1 className="text-center font-bold text-2xl text-primary">
          テーブル名設定
        </h1>

        <div className="flex flex-col gap-4">
          <label className="block">
            <span className="mb-1 block font-bold text-sm text-white">
              テーブル名
            </span>
            <TextInput
              value={name}
              onChange={setName}
              placeholder="テーブル名を入力"
              onEnterPress={handleSave}
            />
          </label>

          <div className="flex h-16 items-center justify-center rounded-xl bg-gray-900">
            <p className="font-bold text-lg text-white">{name || "(未設定)"}</p>
          </div>
        </div>

        <div className="flex flex-col gap-3">
          <RoundButton
            type="primary"
            text={isLoading ? "保存中..." : "保存"}
            size="full"
            onClick={handleSave}
            disabled={isLoading}
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

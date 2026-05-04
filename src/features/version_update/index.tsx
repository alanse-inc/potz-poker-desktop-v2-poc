import type { UpdaterState } from "../../hooks/use_app_updater";
import { RoundButton } from "../../ui/button/round_button";
import { Modal } from "../../ui/modal";

type Props = {
  state: UpdaterState;
  onUpdate: () => void;
  onDismiss: () => void;
};

/**
 * アップデート通知モーダル。
 *
 * - state.phase === "available" のとき、新バージョンの通知を表示する。
 * - state.phase === "downloading" のとき、ダウンロード進捗を表示する。
 * - state.phase === "error" のとき、エラーメッセージを表示する。
 * - それ以外 (idle / ready) は何も描画しない。
 */
export function AppUpdateModal({ state, onUpdate, onDismiss }: Props) {
  if (state.phase === "idle" || state.phase === "ready") {
    return null;
  }

  if (state.phase === "available") {
    return (
      <Modal>
        <div className="flex w-sm flex-col items-center justify-center gap-6 p-4">
          <div className="flex flex-col items-center justify-center gap-1">
            <h1 className="mb-2 font-bold text-2xl text-white">
              アップデートがあります
            </h1>
            <p className="mb-4 text-center text-white">
              バージョン {state.version} が利用可能です。
              <br />
              今すぐアップデートしますか？
            </p>
          </div>
          <div className="flex gap-4">
            <RoundButton
              type="dark-gray"
              size="medium"
              text="後で"
              onClick={onDismiss}
            />
            <RoundButton
              type="primary"
              size="medium"
              text="アップデート"
              onClick={onUpdate}
            />
          </div>
        </div>
      </Modal>
    );
  }

  if (state.phase === "downloading") {
    return (
      <Modal>
        <div className="flex w-sm flex-col items-center justify-center gap-6 p-4">
          <h1 className="font-bold text-2xl text-white">ダウンロード中...</h1>
          <div className="h-2 w-full overflow-hidden rounded-full bg-white/20">
            <div
              className="h-full rounded-full bg-primary transition-all duration-300"
              style={{ width: `${state.progress}%` }}
            />
          </div>
          <p className="text-center text-white">{state.progress}%</p>
        </div>
      </Modal>
    );
  }

  // phase === "error"
  return (
    <Modal>
      <div className="flex w-sm flex-col items-center justify-center gap-6 p-4">
        <h1 className="font-bold text-2xl text-white">
          アップデートに失敗しました
        </h1>
        <p className="text-center text-white/70">{state.message}</p>
        <RoundButton
          type="dark-gray"
          size="auto"
          text="閉じる"
          onClick={onDismiss}
        />
      </div>
    </Modal>
  );
}

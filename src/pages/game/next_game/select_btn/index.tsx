import { produce } from "immer";
import { useNavigate } from "react-router";
import {
  type PlayerSeatRange,
  useInitializeBoardCommand,
} from "../../../../contexts/initialize_board_command_context";
import type { TexasHoldemPosition } from "../../../../domain/auto_game/types";
import {
  Board,
  type BoardProps,
  type SeatContent,
} from "../../../../features/board";
import { DealerIcon } from "../../../../features/dealer_icon";
import { useAutoScale } from "../../../../hooks/useAutoScale";
import { RoundButton } from "../../../../ui/button/round_button";
import { BasicPage } from "../../../../ui/page/basic";
import { GameSettingButtons } from "../setting/components/game_setting_buttons";

const EMPTY_SEATS: BoardProps["seats"] = {
  1: { playerCard: undefined },
  2: { playerCard: undefined },
  3: { playerCard: undefined },
  4: { playerCard: undefined },
  5: { playerCard: undefined },
  6: { playerCard: undefined },
  7: { playerCard: undefined },
  8: { playerCard: undefined },
  9: { playerCard: undefined },
};

export function NextGameSelectBtn() {
  const { initializeBoardCommand, updatePlayer } = useInitializeBoardCommand();
  const navigate = useNavigate();
  const { containerRef, contentRef } = useAutoScale(950, 400, 1.6, 0.7);

  const { players, setting } = initializeBoardCommand.input;

  const handleSelectBtn = (seat: PlayerSeatRange) => {
    const player = players.find((p) => p.seat === seat);
    if (!player) return;
    updatePlayer({ ...player, position: "btn" as TexasHoldemPosition });
    navigate(-1);
  };

  const handleBack = () => {
    navigate(-1);
  };

  const seats = produce(EMPTY_SEATS, (draft) => {
    for (const player of players) {
      const seatContent: SeatContent = {
        playerCard: (
          <button
            key={player.seat}
            type="button"
            className="relative flex cursor-pointer flex-col items-center justify-center p-2"
            onClick={() => handleSelectBtn(player.seat)}
          >
            <div className="w-45">
              <div className="flex h-18 flex-col items-start justify-start rounded-t-xl border-x-3 border-t-3 bg-gray-900 px-3 pt-1 font-bold text-white text-xs">
                <div>{player.name || "NO NAME"}</div>
                <div>{player.stack.toLocaleString()}</div>
              </div>
              <div className="h-7 rounded-b-xl border-3 border-white bg-white px-3 text-left font-bold text-gray-900 text-xs" />
            </div>
          </button>
        ),
        otherItem:
          player.position === "btn" || player.position === "btn_sb" ? (
            <DealerIcon />
          ) : undefined,
      };
      draft[player.seat] = seatContent;
    }
  });

  const centerContent = (
    <div className="flex flex-col items-center gap-4">
      <p className="font-bold text-sm text-white">{setting.name}</p>
    </div>
  );

  return (
    <BasicPage>
      <div className="relative flex h-full w-full flex-col items-center justify-between gap-40 p-8">
        <div className="flex h-20 w-full items-center justify-center">
          <h1 className="font-bold text-2xl text-primary">
            BTNを選択してください
          </h1>
        </div>
        <div
          ref={containerRef}
          className="relative flex w-full flex-1 items-center justify-center"
        >
          <div
            ref={contentRef}
            className="absolute"
            style={{ width: "950px", height: "400px" }}
          >
            <div className="flex h-full items-center gap-60 pl-16">
              <Board seats={seats} centerContent={centerContent} />
              <GameSettingButtons
                setting={setting}
                onSelectButton={() => {}}
                onBtnButtonClick={() => {}}
                onAnteRuleToggle={() => {}}
                disabled
              />
            </div>
          </div>
        </div>
        <div className="flex h-20 w-full items-center justify-end">
          <RoundButton
            text="BACK"
            type="dark-gray"
            size="small"
            onClick={handleBack}
          />
        </div>
      </div>
    </BasicPage>
  );
}

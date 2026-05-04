import { produce } from "immer";
import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { useLocation, useNavigate } from "react-router";
import { api } from "../../../api/client";
import { useBoard } from "../../../contexts/board_context";
import {
  Board,
  type BoardProps,
  type SeatContent,
} from "../../../features/board";
import { DealerIcon } from "../../../features/dealer_icon";
import { useAutoScale } from "../../../hooks/useAutoScale";
import { RoundButton } from "../../../ui/button/round_button";
import { BasicPage } from "../../../ui/page/basic";
import { GameSettingButtons } from "../setting/components/game_setting_buttons";
import { SelectablePlayerCard } from "./components/selectable_player_card";

type LocationState = {
  smallBlind: number;
  bigBlind: number;
  minChip: number;
  bbAnte: boolean;
  playerNames: string[];
};

function positionToSeat(position: number): 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 {
  return ((position % 9) + 1) as 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;
}

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

export function SelectBtn() {
  const navigate = useNavigate();
  const location = useLocation();
  const { refresh } = useBoard();
  const state = location.state as LocationState | null;

  const [dealer, setDealer] = useState(0);
  const [isLoading, setIsLoading] = useState(false);

  const { containerRef, contentRef } = useAutoScale(950, 400, 1.6, 0.7);

  useEffect(() => {
    if (!state) {
      navigate("/game/setting", { replace: true });
    }
  }, [state, navigate]);

  if (!state) return null;

  const handleStart = async () => {
    setIsLoading(true);
    try {
      await api.board.startGame({
        smallBlind: state.smallBlind,
        bigBlind: state.bigBlind,
        minChip: state.minChip,
        bbAnte: state.bbAnte,
        playerNames: state.playerNames,
        dealerPosition: dealer,
      });
      await refresh();
      navigate("/game/playing");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "ゲーム開始に失敗しました";
      toast.error(msg);
    } finally {
      setIsLoading(false);
    }
  };

  const seats = produce(EMPTY_SEATS, (draft) => {
    state.playerNames.forEach((name, i) => {
      const seat = positionToSeat(i);
      const isSelected = dealer === i;
      const seatContent: SeatContent = {
        playerCard: (
          <SelectablePlayerCard
            seatNumber={i + 1}
            name={name}
            initialStack={state.smallBlind * 100}
            highlight={isSelected}
            onPress={() => setDealer(i)}
          />
        ),
        otherItem: isSelected ? <DealerIcon /> : undefined,
      };
      draft[seat] = seatContent;
    });
  });

  const centerContent = (
    <div className="flex flex-col items-center gap-1 text-center">
      <p className="font-bold text-primary text-sm">BTN（ディーラー）を選択</p>
      <p className="text-gray-300 text-xs">プレイヤーをタップして選択</p>
    </div>
  );

  return (
    <BasicPage>
      <div className="relative flex h-full w-full flex-col items-center justify-between gap-40 p-8">
        {/* ヘッダー: BACK（左）、ゲーム開始（右） */}
        <div className="flex h-20 w-full items-center justify-between">
          <RoundButton
            type="black"
            text="BACK"
            size="auto"
            onClick={() => navigate(-1)}
          />
          <RoundButton
            type="primary"
            text={isLoading ? "開始中..." : "ゲーム開始"}
            size="auto"
            disabled={isLoading}
            onClick={handleStart}
          />
        </div>

        {/* Board部分のみスケーリング、setting と同じ右寄り構成 */}
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
                smallBlind={state.smallBlind}
                bigBlind={state.bigBlind}
                minChip={state.minChip}
                bbAnte={state.bbAnte}
                onSelectButton={() => {}}
                onBbAnteToggle={() => {}}
              />
            </div>
          </div>
        </div>

        {/* フッター: 余白 (setting と同様の構造を維持) */}
        <div className="h-20 w-full" />
      </div>
    </BasicPage>
  );
}

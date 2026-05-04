import type { ReactNode } from "react";
import { RoundButton } from "../../../ui/button/round_button";
import { Modal } from "../../../ui/modal";

type Props = {
  title: string;
  description: string;
  buttonText: string;
  onButtonClick: () => void;
  children?: ReactNode;
};

export const InfomationModal = ({
  title,
  description,
  buttonText,
  onButtonClick,
  children,
}: Props) => {
  return (
    <Modal>
      <div className="flex w-sm flex-col items-center justify-center gap-6 p-4">
        <div className="flex flex-col items-center justify-center gap-1">
          <h1 className="mb-2 font-bold text-2xl text-white">{title}</h1>
          <p className="mb-4 text-center text-white">{description}</p>
        </div>
        {children}
        <RoundButton
          type="dark-gray"
          size="auto"
          text={buttonText}
          onClick={onButtonClick}
        />
      </div>
    </Modal>
  );
};

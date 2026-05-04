import type { ReactNode } from "react";
import { RoundButton } from "../../../ui/button/round_button";
import { Modal } from "../../../ui/modal";

type Props = {
  title: string;
  description?: string;
  cancelButtonText: string;
  confirmButtonText: string;
  onCloseClick: () => void;
  onConfirmClick: () => void;
  isConfirmDisabled?: boolean;
  children?: ReactNode;
};

export const ActionConfirmModal = ({
  title,
  description,
  cancelButtonText,
  confirmButtonText,
  onCloseClick,
  onConfirmClick,
  isConfirmDisabled,
  children,
}: Props) => {
  return (
    <Modal>
      <div className="flex w-auto flex-col items-center justify-center gap-6 p-4">
        <div className="flex flex-col items-center justify-center gap-1">
          <h1 className="mb-2 font-bold text-2xl text-white">{title}</h1>
          {description && (
            <p className="mb-4 text-center text-white">{description}</p>
          )}
        </div>
        {children}
        <div className="flex gap-8">
          <RoundButton
            type="dark-gray"
            size="small"
            text={cancelButtonText}
            onClick={onCloseClick}
          />
          <RoundButton
            type="primary"
            size="small"
            text={confirmButtonText}
            onClick={onConfirmClick}
            disabled={isConfirmDisabled}
          />
        </div>
      </div>
    </Modal>
  );
};

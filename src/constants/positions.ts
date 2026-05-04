import type { CSSProperties } from "react";

export interface ItemPosition {
  left?: number;
  right?: number;
  top: number;
}

export interface SeatPosition {
  left: number;
  top: number;
}

export const OTHER_ITEM_POSITIONS: { [key: number]: ItemPosition } = {
  1: { left: 30, top: 90 }, // 左下
  2: { left: 8, top: 68 }, // 左
  3: { left: 8, top: 32 }, // 左
  4: { left: 20, top: 15 }, // 左上
  5: { left: 45, top: 8 }, // 中央
  6: { right: 20, top: 15 }, // 右上
  7: { right: 8, top: 32 }, // 右
  8: { right: 8, top: 68 }, // 右
  9: { right: 30, top: 90 }, // 右下
};

export const SEAT_POSITIONS: { [key: number]: SeatPosition } = {
  1: { left: 8, top: 100 }, // 左下
  2: { left: -15, top: 65 }, // 左中下
  3: { left: -15, top: 30 }, // 左中
  4: { left: 8, top: -5 }, // 左上
  5: { left: 50, top: -15 }, // 上中央（最上部）
  6: { left: 92, top: -5 }, // 右上
  7: { left: 114, top: 30 }, // 右中
  8: { left: 114, top: 65 }, // 右中下
  9: { left: 92, top: 100 }, // 右下
};

export function getOtherItemStyle(seatIndex: number): CSSProperties {
  const pos = OTHER_ITEM_POSITIONS[seatIndex];
  if (!pos) return {};

  return {
    position: "absolute",
    left: pos.left !== undefined ? `${pos.left}%` : undefined,
    right: pos.right !== undefined ? `${pos.right}%` : undefined,
    top: `${pos.top}%`,
    transform: "translate(0, -50%)",
  };
}

export function getSeatPosition(seatIndex: number): CSSProperties {
  const pos = SEAT_POSITIONS[seatIndex];
  if (!pos) return {};

  return {
    position: "absolute",
    left: `${pos.left}%`,
    top: `${pos.top}%`,
    transform: "translate(-50%, -50%)",
  };
}

import type { CSSProperties } from "react";

type ResizeHandlePosition =
  | "top"
  | "right"
  | "bottom"
  | "left"
  | "top-left"
  | "top-right"
  | "bottom-left"
  | "bottom-right";

interface ResizeHandlesProps {
  onMouseDown: (e: React.MouseEvent, position?: string) => void;
  positions?: ResizeHandlePosition[];
  visible?: boolean;
}

const defaultPositions: ResizeHandlePosition[] = [
  "top",
  "right",
  "bottom",
  "left",
  "top-left",
  "top-right",
  "bottom-left",
  "bottom-right",
];

export function ResizeHandles({
  onMouseDown,
  positions = defaultPositions,
  visible = true,
}: ResizeHandlesProps) {
  if (!visible) {
    return null;
  }
  const handleStyle: CSSProperties = {
    position: "absolute",
    backgroundColor: "transparent",
    border: "none",
    zIndex: 10000,
    pointerEvents: "auto" as const,
  };

  const cornerSize = 20;
  const edgeThickness = 6;

  const getHandleStyle = (position: ResizeHandlePosition): CSSProperties => {
    const baseStyle = { ...handleStyle };

    switch (position) {
      case "top":
        return {
          ...baseStyle,
          top: -edgeThickness / 2,
          left: cornerSize,
          right: cornerSize,
          height: edgeThickness,
          cursor: "ns-resize",
        };
      case "right":
        return {
          ...baseStyle,
          top: cornerSize,
          right: -edgeThickness / 2,
          bottom: cornerSize,
          width: edgeThickness,
          cursor: "ew-resize",
        };
      case "bottom":
        return {
          ...baseStyle,
          bottom: -edgeThickness / 2,
          left: cornerSize,
          right: cornerSize,
          height: edgeThickness,
          cursor: "ns-resize",
        };
      case "left":
        return {
          ...baseStyle,
          top: cornerSize,
          left: -edgeThickness / 2,
          bottom: cornerSize,
          width: edgeThickness,
          cursor: "ew-resize",
        };
      case "top-left":
        return {
          ...baseStyle,
          top: -cornerSize / 2,
          left: -cornerSize / 2,
          width: cornerSize,
          height: cornerSize,
          cursor: "nwse-resize",
          borderRadius: "50%",
        };
      case "top-right":
        return {
          ...baseStyle,
          top: -cornerSize / 2,
          right: -cornerSize / 2,
          width: cornerSize,
          height: cornerSize,
          cursor: "nesw-resize",
          borderRadius: "50%",
        };
      case "bottom-left":
        return {
          ...baseStyle,
          bottom: -cornerSize / 2,
          left: -cornerSize / 2,
          width: cornerSize,
          height: cornerSize,
          cursor: "nesw-resize",
          borderRadius: "50%",
        };
      case "bottom-right":
        return {
          ...baseStyle,
          bottom: -cornerSize / 2,
          right: -cornerSize / 2,
          width: cornerSize,
          height: cornerSize,
          cursor: "nwse-resize",
          borderRadius: "50%",
        };
      default:
        return baseStyle;
    }
  };

  const getHandleClassName = (position: ResizeHandlePosition): string => {
    switch (position) {
      case "top":
      case "bottom":
        return "resize-handle resize-handle-ns";
      case "left":
      case "right":
        return "resize-handle resize-handle-ew";
      case "top-left":
      case "bottom-right":
        return "resize-handle resize-handle-nwse";
      case "top-right":
      case "bottom-left":
        return "resize-handle resize-handle-nesw";
      default:
        return "resize-handle";
    }
  };

  return (
    <>
      {positions.map((position) => (
        // biome-ignore lint/a11y/noStaticElementInteractions: resize handle requires mouse events
        <div
          key={position}
          className={getHandleClassName(position)}
          style={getHandleStyle(position)}
          onMouseDown={(e) => onMouseDown(e, position)}
        />
      ))}
    </>
  );
}

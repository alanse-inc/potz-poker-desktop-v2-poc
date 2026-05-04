import { useCallback, useRef } from "react";

interface UseResizeHandleProps {
  onScaleChange?: (newScale: number) => void;
  currentScale: number;
  minScale?: number;
  maxScale?: number;
}

export function useResizeHandle({
  onScaleChange,
  currentScale,
  minScale = 0.5,
  maxScale = 5,
}: UseResizeHandleProps) {
  const startPosRef = useRef<{ x: number; y: number } | null>(null);
  const startSizeRef = useRef<{ width: number; height: number } | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const handlePositionRef = useRef<string>("");

  const handleResizeStart = useCallback(
    (e: React.MouseEvent, position?: string) => {
      e.preventDefault();
      e.stopPropagation();

      if (!containerRef.current || !onScaleChange) return;

      handlePositionRef.current = position || "";

      startPosRef.current = { x: e.clientX, y: e.clientY };
      const rect = containerRef.current.getBoundingClientRect();
      startSizeRef.current = { width: rect.width, height: rect.height };

      const handleMouseMove = (moveEvent: MouseEvent) => {
        if (!startPosRef.current || !startSizeRef.current) return;

        const deltaX = moveEvent.clientX - startPosRef.current.x;
        const deltaY = moveEvent.clientY - startPosRef.current.y;

        let scaleDelta = 0;
        const sensitivity = 100;

        switch (handlePositionRef.current) {
          case "top-left":
            scaleDelta = (-deltaX - deltaY) / 2 / sensitivity;
            break;
          case "top-right":
            scaleDelta = (deltaX - deltaY) / 2 / sensitivity;
            break;
          case "bottom-left":
            scaleDelta = (-deltaX + deltaY) / 2 / sensitivity;
            break;
          case "bottom-right":
            scaleDelta = (deltaX + deltaY) / 2 / sensitivity;
            break;
          case "top":
            scaleDelta = -deltaY / sensitivity;
            break;
          case "bottom":
            scaleDelta = deltaY / sensitivity;
            break;
          case "left":
            scaleDelta = -deltaX / sensitivity;
            break;
          case "right":
            scaleDelta = deltaX / sensitivity;
            break;
          default:
            scaleDelta = (deltaX + deltaY) / 2 / sensitivity;
        }

        const newScale = Math.max(
          minScale,
          Math.min(maxScale, currentScale + scaleDelta),
        );

        onScaleChange(newScale);
      };

      const handleMouseUp = () => {
        startPosRef.current = null;
        startSizeRef.current = null;
        handlePositionRef.current = "";
        document.removeEventListener("mousemove", handleMouseMove);
        document.removeEventListener("mouseup", handleMouseUp);
      };

      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
    },
    [currentScale, minScale, maxScale, onScaleChange],
  );

  return {
    containerRef,
    handleResizeStart,
  };
}

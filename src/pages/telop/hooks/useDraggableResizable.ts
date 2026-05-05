import { useCallback, useEffect, useRef, useState } from "react";
import type { DraggableData, DraggableEvent } from "react-draggable";
import type { ResizableDelta, Rnd } from "react-rnd";

// ResizeDirection comes from re-resizable (transitive dep of react-rnd)
type ResizeDirection =
  | "top"
  | "right"
  | "bottom"
  | "left"
  | "topRight"
  | "bottomRight"
  | "bottomLeft"
  | "topLeft";

// NumberSize equivalent from re-resizable
type NumberSize = ResizableDelta;

export interface DraggableResizableConfig {
  initialSize: { width: number; height: number };
  initialPosition: { x: number; y: number };
  enableResize?: boolean;
  bounds?: "window" | "parent";
  minWidth?: number;
  minHeight?: number;
  flexDirection?: "row" | "column";
  alignItems?: "flex-start" | "flex-end" | "center";
  componentType?: string;
  autoSizeToContent?: boolean;
  initialScale?: number;
  minScale?: number;
  maxScale?: number;
  delayAutoSize?: number;
  disableAutoSizeOnAnimation?: boolean;
}

export function useDraggableResizable(config: DraggableResizableConfig) {
  const [scale, setScale] = useState(config.initialScale || 1);
  const [isFocused, setIsFocused] = useState(false);
  const [position, setPosition] = useState(config.initialPosition);
  const [size, setSize] = useState(config.initialSize);
  const [isAutoSizeEnabled, setIsAutoSizeEnabled] = useState(
    !config.delayAutoSize,
  );

  const contentRef = useRef<HTMLDivElement>(null);
  const rndRef = useRef<Rnd | null>(null);
  const isResizingRef = useRef(false);
  const updateTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sizeHistoryRef = useRef<
    Array<{ width: number; height: number; timestamp: number }>
  >([]);
  const sizeRef = useRef<{ width: number; height: number }>(config.initialSize);

  useEffect(() => {
    if (config.delayAutoSize && !isAutoSizeEnabled) {
      const timer = setTimeout(() => {
        setIsAutoSizeEnabled(true);
      }, config.delayAutoSize);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [config.delayAutoSize, isAutoSizeEnabled]);

  const findContentElement = useCallback(() => {
    if (!contentRef.current) return null;

    const cached = contentRef.current.dataset.cachedElement;
    if (cached) {
      const element = contentRef.current.querySelector(cached);
      if (element) return element as HTMLElement;
    }

    const flexContainer = contentRef.current.querySelector(".flex.flex-col");
    if (flexContainer) {
      contentRef.current.dataset.cachedElement = ".flex.flex-col";
      return flexContainer as HTMLElement;
    }

    const firstChild = contentRef.current.children[0] as HTMLElement;
    if (firstChild) {
      contentRef.current.dataset.cachedElement = ":first-child";
      return firstChild;
    }

    return null;
  }, []);

  const updateSizeFromContent = useCallback(() => {
    if (!contentRef.current || !rndRef.current || isResizingRef.current) {
      return;
    }

    const contentElement = findContentElement();
    if (!contentElement) return;

    const rect = contentElement.getBoundingClientRect();
    const contentWidth = Math.ceil(rect.width / scale);
    const contentHeight = Math.ceil(rect.height / scale);

    const newWidth = Math.max(config.minWidth || 180, contentWidth);
    const newHeight = Math.max(config.minHeight || 400, contentHeight);

    const now = Date.now();
    const recentHistory = sizeHistoryRef.current.filter(
      (entry) => now - entry.timestamp < 1000,
    );

    const isOscillating = recentHistory.some(
      (entry) =>
        Math.abs(entry.width - newWidth) < 2 &&
        Math.abs(entry.height - newHeight) < 2,
    );

    if (isOscillating) {
      return;
    }

    const threshold = recentHistory.length > 3 ? 5 : 2;

    if (
      Math.abs(newWidth - sizeRef.current.width) > threshold ||
      Math.abs(newHeight - sizeRef.current.height) > threshold
    ) {
      sizeHistoryRef.current.push({
        width: newWidth,
        height: newHeight,
        timestamp: now,
      });
      sizeHistoryRef.current = sizeHistoryRef.current.slice(-10);

      const newSize = { width: newWidth, height: newHeight };
      sizeRef.current = newSize;
      rndRef.current.updateSize(newSize);
      setSize(newSize);
    }
  }, [
    config.minWidth,
    config.minHeight,
    scale,
    findContentElement,
  ]);

  useEffect(() => {
    if (
      !config.autoSizeToContent ||
      !isAutoSizeEnabled ||
      !contentRef.current
    ) {
      return;
    }

    let resizeObserver: ResizeObserver | null = null;
    let rafId: number | null = null;

    const handleResize = () => {
      if (updateTimeoutRef.current) {
        clearTimeout(updateTimeoutRef.current);
      }

      if (rafId) {
        cancelAnimationFrame(rafId);
      }

      rafId = requestAnimationFrame(() => {
        updateTimeoutRef.current = setTimeout(() => {
          updateSizeFromContent();
        }, 100);
      });
    };

    resizeObserver = new ResizeObserver(handleResize);

    const targetElement =
      contentRef.current.querySelector(".flex.flex-col") || contentRef.current;
    resizeObserver.observe(targetElement);

    updateTimeoutRef.current = setTimeout(updateSizeFromContent, 200);

    return () => {
      if (resizeObserver) {
        resizeObserver.disconnect();
      }
      if (rafId) {
        cancelAnimationFrame(rafId);
      }
      if (updateTimeoutRef.current) {
        clearTimeout(updateTimeoutRef.current);
      }
    };
  }, [config.autoSizeToContent, isAutoSizeEnabled, updateSizeFromContent]);

  useEffect(() => {
    if (!config.autoSizeToContent || !rndRef.current) return;

    const timeoutId = setTimeout(() => {
      sizeHistoryRef.current = [];
      updateSizeFromContent();
    }, 300);

    return () => clearTimeout(timeoutId);
  }, [config.autoSizeToContent, updateSizeFromContent]);

  const handleResize = useCallback(
    (
      _event: MouseEvent | TouchEvent,
      _direction: ResizeDirection,
      _ref: HTMLElement,
      _delta: NumberSize,
      newPosition: { x: number; y: number },
    ) => {
      isResizingRef.current = true;
      setPosition(newPosition);
    },
    [],
  );

  const handleDragStart = useCallback(() => {
    setIsFocused(true);
  }, []);

  const handleDrag = useCallback(
    (_event: DraggableEvent, data: DraggableData) => {
      setPosition({ x: data.x, y: data.y });
    },
    [],
  );

  const handleDragStop = useCallback(
    (_event: DraggableEvent, data: DraggableData) => {
      const newPosition = { x: data.x, y: data.y };
      setPosition(newPosition);
      setIsFocused(false);
    },
    [],
  );

  const handleResizeStart = useCallback(() => {
    isResizingRef.current = true;
    setIsFocused(true);
  }, []);

  const handleResizeStop = useCallback(
    (
      _event: MouseEvent | TouchEvent,
      _direction: ResizeDirection,
      _ref: HTMLElement,
      _delta: NumberSize,
      newPosition: { x: number; y: number },
    ) => {
      isResizingRef.current = false;
      setIsFocused(false);

      const newWidth = _ref.offsetWidth;
      const newHeight = _ref.offsetHeight;

      setPosition(newPosition);

      const newSize = { width: newWidth, height: newHeight };

      if (config.enableResize) {
        const widthScale = newWidth / config.initialSize.width;
        const heightScale = newHeight / config.initialSize.height;
        const newScale = Math.max(
          config.minScale || 0.1,
          Math.min(config.maxScale || 5, Math.min(widthScale, heightScale)),
        );
        setScale(newScale);
      }

      sizeRef.current = newSize;
      setSize(newSize);

      if (config.autoSizeToContent) {
        updateTimeoutRef.current = setTimeout(updateSizeFromContent, 200);
      }
    },
    [
      config.autoSizeToContent,
      config.enableResize,
      config.initialSize.width,
      config.initialSize.height,
      config.minScale,
      config.maxScale,
      updateSizeFromContent,
    ],
  );

  const handleScaleChange = useCallback(
    (newScale: number) => {
      const minScale = config.minScale || 0.1;
      const maxScale = config.maxScale || 5;
      const clampedScale = Math.max(minScale, Math.min(maxScale, newScale));

      const scaleRatio = clampedScale / scale;
      const newWidth = Math.round(size.width * scaleRatio);
      const newHeight = Math.round(size.height * scaleRatio);
      const newSize = { width: newWidth, height: newHeight };

      if (rndRef.current) {
        rndRef.current.updateSize(newSize);
      }

      sizeRef.current = newSize;
      setScale(clampedScale);
      setSize(newSize);
    },
    [config.minScale, config.maxScale, size, scale],
  );

  const getFocusStyle = useCallback(() => {
    return {
      border: "none",
      boxShadow: "none",
      borderRadius: "0px",
      zIndex: isFocused ? 1000 : 100,
    };
  }, [isFocused]);

  return {
    scale,
    contentRef,
    rndRef,
    isFocused,
    position,
    size,
    handlers: {
      onResize: handleResize,
      onDrag: handleDrag,
      onDragStart: handleDragStart,
      onDragStop: handleDragStop,
      onResizeStart: handleResizeStart,
      onResizeStop: handleResizeStop,
    },
    getFocusStyle,
    setScale: handleScaleChange,
  };
}

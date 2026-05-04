import { cloneElement, isValidElement } from "react";
import { Rnd } from "react-rnd";
import {
  type DraggableResizableConfig,
  useDraggableResizable,
} from "../hooks/useDraggableResizable";

interface Props {
  config: DraggableResizableConfig;
  children: React.ReactNode;
  debugColor?: string;
  debugVisible?: boolean;
  className?: string;
  componentType?: "left-cards" | "right-cards" | "community-cards" | "custom";
}

export function DraggableResizableWrapper({
  config,
  children,
  debugColor,
  debugVisible = false,
  className = "",
}: Props) {
  const {
    scale,
    contentRef,
    rndRef,
    handlers,
    getFocusStyle,
    position,
    size,
    setScale,
  } = useDraggableResizable(config);

  const rndSize = {
    width: size.width,
    height: size.height,
  };

  return (
    <Rnd
      ref={rndRef}
      position={position}
      size={rndSize}
      minWidth={config.minWidth ?? 180}
      minHeight={config.minHeight ?? 400}
      bounds={config.bounds || "window"}
      disableDragging={false}
      dragHandleClassName="drag-handle"
      lockAspectRatio={true}
      enableResizing={
        config.enableResize
          ? {
              top: false,
              right: false,
              bottom: false,
              left: false,
              topRight: false,
              bottomRight: false,
              bottomLeft: false,
              topLeft: false,
            }
          : false
      }
      className={`rnd-container ${className}`}
      style={{
        ...getFocusStyle(),
        overflow: "visible",
      }}
      onDragStart={handlers.onDragStart}
      onDrag={handlers.onDrag}
      onDragStop={handlers.onDragStop}
      onResizeStart={handlers.onResizeStart}
      onResize={handlers.onResize}
      onResizeStop={handlers.onResizeStop}
    >
      {/** biome-ignore lint/a11y/noStaticElementInteractions: drag handle requires mouse events */}
      <div
        ref={contentRef}
        className="drag-handle"
        style={{
          backgroundColor:
            debugVisible && debugColor ? debugColor : "transparent",
          border:
            debugVisible && debugColor
              ? "2px dashed rgba(255, 255, 255, 0.5)"
              : "none",
          width:
            config.componentType === "community-cards" ? "fit-content" : "100%",
          minHeight: "100%",
          cursor: "grab",
          display: "flex",
          flexDirection: "column",
          alignItems:
            config.componentType === "community-cards" ? "flex-end" : "stretch",
          justifyContent: "flex-end",
          overflow:
            config.componentType === "community-cards" ? "hidden" : "visible",
          position: "relative",
          zIndex: 1,
        }}
        onMouseEnter={(e) => {
          const target = e.target as HTMLElement;
          if (!target.closest(".resize-handle")) {
            e.currentTarget.style.cursor = "grab";
          }
        }}
        onMouseDown={(e) => {
          const target = e.target as HTMLElement;
          if (!target.closest(".resize-handle")) {
            e.currentTarget.style.cursor = "grabbing";
          }
        }}
        onMouseUp={(e) => {
          const target = e.target as HTMLElement;
          if (!target.closest(".resize-handle")) {
            e.currentTarget.style.cursor = "grab";
          }
        }}
      >
        <div
          style={{
            position: "relative",
            width:
              config.componentType === "community-cards"
                ? "fit-content"
                : "100%",
            minHeight: "100%",
            display: "flex",
            flexDirection: "column",
            justifyContent: "flex-end",
            alignItems: config.alignItems || "flex-start",
            transform: `scale(${scale})`,
            transformOrigin:
              config.componentType === "community-cards"
                ? "right bottom"
                : config.alignItems === "flex-end"
                  ? "right bottom"
                  : "left bottom",
          }}
        >
          {isValidElement(children)
            ? cloneElement(
                children as React.ReactElement<{
                  scale?: number;
                  onScaleChange?: (scale: number) => void;
                }>,
                {
                  scale,
                  onScaleChange: config.enableResize ? setScale : undefined,
                },
              )
            : children}
        </div>
      </div>
    </Rnd>
  );
}

import type { DraggableResizableConfig } from "../hooks/useDraggableResizable";

export interface TelopLayoutOptions {
  windowSize: { width: number; height: number };
  baseMargin?: number;
  enableResize?: boolean;
  leftPlayerCount?: number;
  rightPlayerCount?: number;
}

export class TelopLayoutConfig {
  private windowSize: { width: number; height: number };
  private baseMargin: number;
  private enableResize: boolean;
  private playerCardHeight = 100;
  private playerCardGap = 10;

  constructor(options: TelopLayoutOptions) {
    this.windowSize = options.windowSize;
    this.baseMargin = options.baseMargin || 50;
    this.enableResize = options.enableResize ?? true;
  }

  getLeftCardsConfig(): DraggableResizableConfig {
    const maxPlayerCount = 6;
    const calculatedHeight =
      this.playerCardHeight * maxPlayerCount +
      this.playerCardGap * (maxPlayerCount - 1) +
      80;
    const initialHeight = Math.max(600, calculatedHeight);

    return {
      initialSize: { width: 120, height: initialHeight },
      initialPosition: {
        x: this.baseMargin,
        y: this.windowSize.height - initialHeight,
      },
      enableResize: this.enableResize,
      bounds: "window",
      minWidth: 100,
      minHeight: 90,
      componentType: "left-cards",
      autoSizeToContent: false,
      initialScale: 1,
      minScale: 0.5,
      maxScale: 5,
    };
  }

  getRightCardsConfig(): DraggableResizableConfig {
    const maxPlayerCount = 6;
    const calculatedHeight =
      this.playerCardHeight * maxPlayerCount +
      this.playerCardGap * (maxPlayerCount - 1) +
      80;
    const initialHeight = Math.max(600, calculatedHeight);

    const rightX = this.baseMargin + 120 + 500;

    return {
      initialSize: { width: 120, height: initialHeight },
      initialPosition: {
        x: rightX,
        y: this.windowSize.height - initialHeight,
      },
      enableResize: this.enableResize,
      bounds: "window",
      minWidth: 100,
      minHeight: 90,
      flexDirection: "column",
      alignItems: "flex-end",
      componentType: "right-cards",
      autoSizeToContent: false,
      initialScale: 1,
      minScale: 0.5,
      maxScale: 5,
    };
  }

  getCommunityCardsConfig(): DraggableResizableConfig {
    const communityX = this.baseMargin + 120 + 500 + 120 + 250;

    return {
      initialSize: { width: 336, height: 150 },
      initialPosition: {
        x: communityX,
        y: this.windowSize.height - 200,
      },
      enableResize: this.enableResize,
      bounds: "window",
      minWidth: 250,
      minHeight: 80,
      componentType: "community-cards",
      autoSizeToContent: true,
      delayAutoSize: 100,
      initialScale: 1,
      minScale: 0.5,
      maxScale: 5,
      alignItems: "flex-end",
    };
  }
}

import { describe, expect, it } from "vitest";
import { TelopLayoutConfig } from "./telopLayoutConfig";

describe("TelopLayoutConfig", () => {
  const windowSize = { width: 1920, height: 1080 };
  const baseMargin = 50;

  it("getLeftCardsConfig は baseMargin の位置から始まる", () => {
    const config = new TelopLayoutConfig({ windowSize, baseMargin });
    const leftConfig = config.getLeftCardsConfig();
    expect(leftConfig.initialPosition.x).toBe(baseMargin);
  });

  it("getLeftCardsConfig の初期高さは最低 600", () => {
    const config = new TelopLayoutConfig({ windowSize, baseMargin });
    const leftConfig = config.getLeftCardsConfig();
    expect(leftConfig.initialSize.height).toBeGreaterThanOrEqual(600);
  });

  it("getLeftCardsConfig の y は 画面高さ - 初期高さ", () => {
    const config = new TelopLayoutConfig({ windowSize, baseMargin });
    const leftConfig = config.getLeftCardsConfig();
    expect(leftConfig.initialPosition.y).toBe(
      windowSize.height - leftConfig.initialSize.height,
    );
  });

  it("getRightCardsConfig は左カードより右に配置される", () => {
    const config = new TelopLayoutConfig({ windowSize, baseMargin });
    const leftConfig = config.getLeftCardsConfig();
    const rightConfig = config.getRightCardsConfig();
    expect(rightConfig.initialPosition.x).toBeGreaterThan(
      leftConfig.initialPosition.x,
    );
  });

  it("getRightCardsConfig の x は baseMargin + 120 + 500", () => {
    const config = new TelopLayoutConfig({ windowSize, baseMargin });
    const rightConfig = config.getRightCardsConfig();
    expect(rightConfig.initialPosition.x).toBe(baseMargin + 120 + 500);
  });

  it("getCommunityCardsConfig は右カードより右に配置される", () => {
    const config = new TelopLayoutConfig({ windowSize, baseMargin });
    const rightConfig = config.getRightCardsConfig();
    const communityConfig = config.getCommunityCardsConfig();
    expect(communityConfig.initialPosition.x).toBeGreaterThan(
      rightConfig.initialPosition.x,
    );
  });

  it("getCommunityCardsConfig の autoSizeToContent が true", () => {
    const config = new TelopLayoutConfig({ windowSize, baseMargin });
    const communityConfig = config.getCommunityCardsConfig();
    expect(communityConfig.autoSizeToContent).toBe(true);
  });

  it("enableResize が false のとき各 config に反映される", () => {
    const config = new TelopLayoutConfig({
      windowSize,
      baseMargin,
      enableResize: false,
    });
    expect(config.getLeftCardsConfig().enableResize).toBe(false);
    expect(config.getRightCardsConfig().enableResize).toBe(false);
    expect(config.getCommunityCardsConfig().enableResize).toBe(false);
  });

  it("デフォルト baseMargin は 50", () => {
    const config = new TelopLayoutConfig({ windowSize });
    expect(config.getLeftCardsConfig().initialPosition.x).toBe(50);
  });
});

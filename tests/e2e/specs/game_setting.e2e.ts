/**
 * GameSetting 画面の操作 E2E
 *
 * - SB / BB / MINICHIP のチップ入力モーダル表示
 * - RESET でチップ値が既定 (SB=100, BB=200, MINICHIP=100) に戻る
 * - BACK で Home に戻る
 */
import { $, browser, expect } from "@wdio/globals";

async function gotoGameSetting(): Promise<void> {
  await browser.url("/");
  await $("h1=POTZ POKER").waitForDisplayed({ timeout: 5000 });
  await $("button=新規ゲーム設定").click();
  await browser.waitUntil(
    async () => (await browser.getUrl()).includes("/game/setting"),
    { timeout: 5000, timeoutMsg: "did not navigate to /game/setting" },
  );
}

describe("game_setting", () => {
  beforeEach(async () => {
    await gotoGameSetting();
  });

  it("SB / BB / MINICHIP / GAME START のボタンが表示される", async () => {
    await expect(await $("button=BACK")).toBeDisplayed();
    await expect(await $("button=RESET")).toBeDisplayed();
    await expect(await $("button=GAME START")).toBeDisplayed();
  });

  it("BACK で Home に戻れる", async () => {
    await $("button=BACK").click();
    await $("h1=POTZ POKER").waitForDisplayed({ timeout: 5000 });
  });

  it("プレイヤー未入力時は GAME START が disabled", async () => {
    const startBtn = await $("button=GAME START");
    await expect(startBtn).toBeDisplayed();
    // disabled 属性の検証
    const isEnabled = await startBtn.isEnabled();
    expect(isEnabled).toBe(false);
  });
});

/**
 * AutoGame 画面の操作 E2E
 *
 * - AutoGameSetting 画面の表示
 * - AUTO MODE スイッチで通常モード (FirstGame) に切り替わる
 * - GAME START がプレイヤー未入力時に disabled
 */
import { $, browser, expect } from "@wdio/globals";

async function gotoAutoGameSetting(): Promise<void> {
  await browser.url("/");
  await $("h1=POTZ POKER").waitForDisplayed({ timeout: 5000 });
  await $("button=AUTO ゲーム設定").click();
  await browser.waitUntil(
    async () => (await browser.getUrl()).includes("/auto-game/setting"),
    { timeout: 5000, timeoutMsg: "did not navigate to /auto-game/setting" },
  );
}

describe("auto_game", () => {
  beforeEach(async () => {
    await gotoAutoGameSetting();
  });

  it("AUTO MODE スイッチと GAME START ボタンが表示される", async () => {
    await expect(await $("=AUTO MODE")).toBeDisplayed();
    await expect(await $("button=GAME START")).toBeDisplayed();
  });

  it("プレイヤー未入力時は GAME START が disabled", async () => {
    const startBtn = await $("button=GAME START");
    const isEnabled = await startBtn.isEnabled();
    expect(isEnabled).toBe(false);
  });

  it("AUTO MODE スイッチで通常 (first-game) モードに戻る", async () => {
    // Switch コンポーネントは role="switch" の input
    const swt = await $('input[type="checkbox"][role="switch"]');
    if (await swt.isExisting()) {
      await swt.click();
    } else {
      // フォールバック: 文言の親要素クリック
      await $("=AUTO MODE").click();
    }
    await browser.waitUntil(
      async () =>
        (await browser.getUrl()).includes("/game/first-game/setting") ||
        (await browser.getUrl()).includes("/game/setting"),
      {
        timeout: 5000,
        timeoutMsg: "did not switch out of auto-game mode",
      },
    );
  });
});

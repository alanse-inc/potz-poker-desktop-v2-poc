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
  await $("h1=POTZ POKER").waitForDisplayed({ timeout: 30_000 });
  await $("button=AUTO ゲーム設定").click();
  // createMemoryRouter のため getUrl() は常に tauri://localhost/ を返す
  // DOM 要素の出現で遷移完了を確認する
  await $("button=GAME START").waitForDisplayed({ timeout: 5000 });
}

describe("auto_game", () => {
  beforeEach(async () => {
    await gotoAutoGameSetting();
  });

  it("AUTO MODE スイッチと GAME START ボタンが表示される", async () => {
    // Switch コンポーネントは button[role="switch"] で確認
    await expect(await $('button[role="switch"]')).toBeDisplayed();
    await expect(await $("button=GAME START")).toBeDisplayed();
  });

  it("プレイヤー未入力時は GAME START が disabled", async () => {
    const startBtn = await $("button=GAME START");
    const isEnabled = await startBtn.isEnabled();
    expect(isEnabled).toBe(false);
  });

  it("AUTO MODE スイッチで通常 (first-game) モードに戻る", async () => {
    // Switch コンポーネントは button[role="switch"] でクリック
    await $('button[role="switch"]').click();
    // createMemoryRouter のため getUrl() は常に tauri://localhost/ を返す
    // game/first-game/setting に遷移したことを BACK ボタンで確認
    await $("button=BACK").waitForDisplayed({ timeout: 5000 });
  });
});

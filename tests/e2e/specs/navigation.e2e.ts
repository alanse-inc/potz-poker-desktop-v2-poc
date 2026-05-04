/**
 * ナビゲーション網羅 E2E
 *
 * Home から主要画面への遷移と GlobalNav 経由の遷移を確認する。
 * createMemoryRouter を使っているため URL 直接遷移はできず、
 * 全てクリック操作で確認する。
 */
import { $, browser, expect } from "@wdio/globals";

async function gotoHome(): Promise<void> {
  await browser.url("/");
  await $("h1=POTZ POKER").waitForDisplayed({ timeout: 5000 });
}

describe("navigation", () => {
  beforeEach(async () => {
    await gotoHome();
  });

  it("Home に Auto-game 設定ボタンが表示される", async () => {
    const btn = await $("button=AUTO ゲーム設定");
    await expect(btn).toBeDisplayed();
  });

  it("新規ゲーム設定 から Setting 画面に遷移する", async () => {
    await $("button=新規ゲーム設定").click();
    await browser.waitUntil(
      async () => (await browser.getUrl()).includes("/game/setting"),
      { timeout: 5000, timeoutMsg: "did not navigate to /game/setting" },
    );
    await expect(await $("button=BACK")).toBeDisplayed();
  });

  it("AUTO ゲーム設定 から Auto-game Setting 画面に遷移する", async () => {
    await $("button=AUTO ゲーム設定").click();
    await browser.waitUntil(
      async () => (await browser.getUrl()).includes("/auto-game/setting"),
      { timeout: 5000, timeoutMsg: "did not navigate to /auto-game/setting" },
    );
    // AUTO MODE スイッチが表示される
    await expect(await $("=AUTO MODE")).toBeDisplayed();
  });

  it("テロップ設定 → Home に遷移できる", async () => {
    await $("button=テロップ設定").click();
    await browser.waitUntil(
      async () => (await browser.getUrl()).includes("/settings/telop"),
      { timeout: 5000, timeoutMsg: "did not navigate to /settings/telop" },
    );
  });

  it("セッション一覧 → Home に遷移できる", async () => {
    await $("button=セッション一覧").click();
    await browser.waitUntil(
      async () => (await browser.getUrl()).includes("/session/list"),
      { timeout: 5000, timeoutMsg: "did not navigate to /session/list" },
    );
  });

  it("アカウント画面に遷移できる", async () => {
    await $("button=アカウント").click();
    await browser.waitUntil(
      async () => (await browser.getUrl()).includes("/account"),
      { timeout: 5000, timeoutMsg: "did not navigate to /account" },
    );
  });

  it("デバッグ画面に遷移できる", async () => {
    await $("button=デバッグ").click();
    await browser.waitUntil(
      async () => (await browser.getUrl()).includes("/debug"),
      { timeout: 5000, timeoutMsg: "did not navigate to /debug" },
    );
  });

  it("GlobalNav から Game メニュー (Setting) に遷移できる", async () => {
    await $("button=Game").click();
    await browser.waitUntil(
      async () => (await browser.getUrl()).includes("/game/setting"),
      { timeout: 5000, timeoutMsg: "did not navigate via GlobalNav" },
    );
  });

  it("GlobalNav から Deck メニュー (choose) に遷移できる", async () => {
    await $("button=Deck").click();
    await browser.waitUntil(
      async () => (await browser.getUrl()).includes("/deck/choose"),
      { timeout: 5000, timeoutMsg: "did not navigate to /deck/choose" },
    );
  });
});

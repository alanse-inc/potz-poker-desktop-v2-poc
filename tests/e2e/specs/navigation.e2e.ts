/**
 * ナビゲーション網羅 E2E
 *
 * Home から主要画面への遷移と GlobalNav 経由の遷移を確認する。
 * createMemoryRouter を使っているため browser.getUrl() は常に
 * tauri://localhost/ を返すため、URL チェックは DOM 要素の存在で代替する。
 */
import { $, browser, expect } from "@wdio/globals";

async function gotoHome(): Promise<void> {
  await browser.url("/");
  await $("h1=POTZ POKER").waitForDisplayed({ timeout: 30_000 });
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
    // createMemoryRouter: URL ではなく BACK ボタンの出現で確認
    await expect(await $("button=BACK")).toBeDisplayed({ timeout: 5000 });
  });

  it("AUTO ゲーム設定 から Auto-game Setting 画面に遷移する", async () => {
    await $("button=AUTO ゲーム設定").click();
    // Switch コンポーネントは button[role="switch"] で確認
    await expect(await $('button[role="switch"]')).toBeDisplayed({ timeout: 5000 });
  });

  it("テロップ設定 → Home に遷移できる", async () => {
    await $("button=テロップ設定").click();
    // createMemoryRouter: h1 でページ確認
    await expect(await $("h1=テロップ設定")).toBeDisplayed({ timeout: 5000 });
  });

  it("セッション一覧 → Home に遷移できる", async () => {
    await $("button=セッション一覧").click();
    await expect(await $("h1=セッション一覧")).toBeDisplayed({ timeout: 5000 });
  });

  it("アカウント画面に遷移できる", async () => {
    await $("button=アカウント").click();
    await expect(await $("h1=アカウント")).toBeDisplayed({ timeout: 5000 });
  });

  it("デバッグ画面に遷移できる", async () => {
    await $("button=デバッグ").click();
    await expect(await $("h1=デバッグメニュー")).toBeDisplayed({ timeout: 5000 });
  });

  it("GlobalNav から Game メニュー (Setting) に遷移できる", async () => {
    await $("button=Game").click();
    // BACK ボタンが表示されることで setting 画面到達を確認
    await expect(await $("button=BACK")).toBeDisplayed({ timeout: 5000 });
  });

  it("GlobalNav から Deck メニュー (choose) に遷移できる", async () => {
    await $("button=Deck").click();
    await expect(await $("h1=デッキ選択")).toBeDisplayed({ timeout: 5000 });
  });
});

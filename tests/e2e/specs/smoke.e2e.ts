/**
 * 基本スモーク E2E
 *
 * カバー範囲:
 *   - アプリ起動
 *   - Home 画面の主要ボタン表示
 *   - GlobalNav 全項目への遷移
 */
import { $, browser, expect } from "@wdio/globals";

describe("smoke", () => {
  it("Home 画面が表示される", async () => {
    await browser.url("/");
    const title = await $("h1=POTZ POKER");
    await expect(title).toBeDisplayed();
  });

  it("Home の主要ボタンが揃っている", async () => {
    const labels = [
      "新規ゲーム設定",
      "テロップウィンドウを開く",
      "テロップ設定",
      "リモート接続",
      "テーブル名設定",
      "セッション一覧",
      "アカウント",
      "デバッグ",
    ];
    for (const label of labels) {
      const btn = await $(`button=${label}`);
      await expect(btn).toBeDisplayed();
    }
  });

  it("GlobalNav からセッション一覧に遷移できる", async () => {
    await $("button=セッション").click();
    await browser.waitUntil(
      async () => (await browser.getUrl()).includes("/session/list"),
      { timeout: 5000, timeoutMsg: "did not navigate to /session/list" },
    );
  });

  it("デバッグ画面のスモークテストを実行して全 PASS する", async () => {
    await browser.url("/debug");
    const runButton = await $("button=実行");
    await expect(runButton).toBeDisplayed();
    await runButton.click();
    await browser.waitUntil(async () => (await $$("span=PASS").length) === 8, {
      timeout: 15_000,
      timeoutMsg: "smoke test did not all pass",
    });
  });
});

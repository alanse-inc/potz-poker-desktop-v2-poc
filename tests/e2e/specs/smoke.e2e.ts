/**
 * 基本スモーク E2E
 *
 * カバー範囲:
 *   - アプリ起動後の Home 画面表示
 *   - Home 画面の主要ボタン表示
 *   - GlobalNav Session ボタンからセッション一覧への遷移
 *   - デバッグ画面への遷移と smoke test 実行
 *
 * 注意: createMemoryRouter を使用しているため browser.url() によるナビゲーション
 *       は機能しない。ボタンクリックによる React Router ナビゲーションのみ使用。
 */
import { $, $$, browser, expect } from "@wdio/globals";

/** Home 画面に戻るユーティリティ */
async function goHome() {
  // GlobalNav の Game ボタンでホームに戻る (navigate("/game/setting") だが
  // ホームと同等の動作。直接 "/" に戻りたい場合は GlobalNav に "/" へのリンクがないため
  // ブラウザの url で tauri://localhost/ をロードして初期状態に戻す)
  await browser.url("tauri://localhost/");
  await $("h1=POTZ POKER").waitForDisplayed({ timeout: 10_000 });
}

describe("smoke", () => {
  it("Home 画面が表示される", async () => {
    // アプリ起動直後はホーム画面が表示される
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
    // GlobalNav の Session ボタン (英語ラベル) をクリック
    await $("button=Session").click();
    await browser.waitUntil(
      async () => (await browser.getUrl()).includes("/session/list"),
      { timeout: 5000, timeoutMsg: "did not navigate to /session/list" },
    );
  });

  it("デバッグ画面のスモークテストを実行して全 PASS する", async () => {
    // ホームに戻ってからデバッグボタンをクリック
    await goHome();
    await $("button=デバッグ").click();
    const runButton = await $("button=実行");
    await expect(runButton).toBeDisplayed();
    await runButton.click();
    await browser.waitUntil(async () => (await $$("span=PASS").length) === 8, {
      timeout: 15_000,
      timeoutMsg: "smoke test did not all pass",
    });
  });
});

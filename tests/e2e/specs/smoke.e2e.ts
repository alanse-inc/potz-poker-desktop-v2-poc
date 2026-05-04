/**
 * 基本スモーク E2E
 *
 * カバー範囲:
 *   - アプリ起動後の Home 画面表示
 *   - Home 画面の主要ボタン表示
 *   - GlobalNav Session ボタンからセッション一覧への遷移
 *   - デバッグ画面への遷移と smoke test 実行
 *
 * 注意: createMemoryRouter を使用しているため browser.getUrl() は常に
 *       tauri://localhost/ を返す。ページ確認は DOM 要素の存在で行う。
 *       またブラウザ URL ナビゲーションでは React Router ルートは変わらない
 *       ため、ページ遷移は必ずボタンクリックで行う。
 */
import { $, $$, browser, expect } from "@wdio/globals";

describe("smoke", () => {
  it("Home 画面が表示される", async () => {
    // アプリ起動直後はホーム画面が表示される（DRI3 警告などで初回レンダリングが遅れるため長めに待つ）
    const title = await $("h1=POTZ POKER");
    await expect(title).toBeDisplayed({ timeout: 30_000 });
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
    // 最初のボタンは長めに待ち、以降はデフォルトタイムアウトで OK
    const firstBtn = await $(`button=${labels[0]}`);
    await expect(firstBtn).toBeDisplayed({ timeout: 30_000 });
    for (const label of labels.slice(1)) {
      const btn = await $(`button=${label}`);
      await expect(btn).toBeDisplayed({ timeout: 10_000 });
    }
  });

  it("GlobalNav からセッション一覧に遷移できる", async () => {
    // GlobalNav の Session ボタン (英語ラベル) をクリック
    await $("button=Session").click();
    // URL ではなく DOM 要素でセッション一覧ページを確認
    const heading = await $("h1=セッション一覧");
    await expect(heading).toBeDisplayed({ timeout: 10_000 });
  });

  it("デバッグ画面のスモークテストを実行して全 PASS する", async () => {
    // セッション一覧の「戻る」ボタンでホームに戻る
    await $("button=戻る").click();
    await $("h1=POTZ POKER").waitForDisplayed({ timeout: 30_000 });
    // ホームの「デバッグ」ボタンでデバッグ画面に遷移
    await $("button=デバッグ").click();
    const runButton = await $("button=実行");
    await expect(runButton).toBeDisplayed({ timeout: 10_000 });
    await runButton.click();
    await browser.waitUntil(async () => (await $$("span=PASS").length) === 8, {
      timeout: 30_000,
      timeoutMsg: "smoke test did not all pass",
    });
  });
});

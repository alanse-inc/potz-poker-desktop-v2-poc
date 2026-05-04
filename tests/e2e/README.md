# E2E (tauri-driver + WebdriverIO)

Tauri アプリの WebDriver 経由 E2E テスト基盤。

## プラットフォーム制約

| OS | サポート | 必要ランタイム |
|---|---|---|
| Linux | OK | `webkit2gtk-4.1`, `WebKitWebDriver` |
| Windows | OK | `WebView2`, `Microsoft Edge Driver`（バージョン一致必須） |
| macOS | **NG (Tauri 2 公式未対応)** | — |

macOS で開発している場合は CI（Linux）か Windows ランナーで実行してください。`pnpm test`（Vitest）と Debug 画面の「全機能スモークテスト」ボタンが macOS 側の代替手段です。

## セットアップ

```bash
# 1. tauri-driver バイナリ
cargo install tauri-driver --locked

# 2. Linux 限定: WebDriver
sudo apt install webkit2gtk-driver

# 3. Tauri アプリのデバッグビルド
pnpm tauri build --debug

# 4. WebdriverIO 関連 npm パッケージはルート package.json に登録済み
pnpm install
```

## 実行

```bash
pnpm e2e
```

環境変数:

| 変数 | デフォルト | 用途 |
|---|---|---|
| `TAURI_BIN` | `src-tauri/target/debug/potz-poker-desktop-v2` | テスト対象のバイナリ |
| `TAURI_DRIVER_PORT` | `4444` | tauri-driver の listen ポート |

## 構造

```
tests/e2e/
├── wdio.conf.ts       # WebdriverIO + tauri-driver 設定
├── tsconfig.json      # E2E 専用 TS 設定（mocha 型）
├── specs/
│   └── smoke.e2e.ts   # スモークシナリオ
└── README.md
```

## 追加シナリオの書き方

`specs/*.e2e.ts` を追加。Page Object パターンを使うなら `tests/e2e/pages/` にラップしてください。

## トラブルシュート

- **`tauri-driver: command not found`**: PATH に `~/.cargo/bin` が入っているか確認
- **`Tauri binary not found`**: `pnpm tauri build --debug` 実行後、`TAURI_BIN` を設定
- **`Failed to start session`**: WebDriver バージョンと WebView バージョンの不整合（Windows で頻発）

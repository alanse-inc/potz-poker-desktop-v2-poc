# Potz Poker Desktop v2 — Tauri 移行 PoC

このリポジトリは [`potz-poker/packages/desktop-app`](../potz-poker/packages/desktop-app) を **Electron → Tauri 2** に移植する Proof-of-Concept です。

元アプリは多機能（Auth0 ROPG / Sentry / Mixpanel / 自動更新 / 内蔵 Hono サーバ / RFID シリアル / Deepgram 音声 / マルチウィンドウ / electron-store 暗号化 / 配信用テロップ）で全面移行は大規模なため、本 PoC では **Tauri ネイティブの強みが出るコア機能だけ** を実装し、移行のフィージビリティを検証する。

## PoC スコープ

### 実装する（Tauri ネイティブ機能の検証）

| カテゴリ | 内容 | 元実装 → Tauri 化 |
|---|---|---|
| ドメイン層 | テキサスホールデム Manual モードの簡略状態機械 | TypeScript → **Rust に移植**（パフォーマンス検証） |
| 役判定 | High Card 〜 Royal Straight Flush の 10 種、ホイール A2345 含む | TypeScript `evaluate_hand.ts` → **Rust `domain/hand.rs`** |
| 状態管理 | サーバ側ボード状態 + 設定 + テロップ | Hono + electron-store → **`Arc<Mutex<AppState>>`** + `tauri-plugin-store` |
| IPC | ボード取得 / アクション送信（bet/call/check/fold/raise/allin） | `ipcMain.handle` + `fetch /api/*` → **`#[tauri::command]` + `invoke()`** |
| イベント | ボード更新 / テロップ更新を全ウィンドウへ push | SSE (`/api/events/stream`) → **`app.emit()` + `listen()`** |
| マルチウィンドウ | メイン (ゲーム画面) + テロップ (配信用オーバーレイ) | `BrowserWindow` 複数 → **`WebviewWindowBuilder`** |
| 永続化 | ゲーム設定 (SB/BB/BuyIn) | `electron-store` → **`tauri-plugin-store`** |
| UI | メインゲーム画面 (`pages/game/playing/`)、設定、テロップ設定 | 元コードを **そのままコピー** （IPC 部分のみ Tauri に置換） |
| テスト | 元と同形式 | vitest + @testing-library/react + jsdom + `cargo test` |

### 範囲外（PoC では実装しないが、Tauri 移行時の検証ポイントは整理済み）

| 機能 | Tauri 移行時の方針メモ |
|---|---|
| Auth0 ROPG + 暗号化トークン | `tauri-plugin-keychain` (OS キーチェーン) または Rust の `aes-gcm` |
| Sentry / Mixpanel | `@sentry/browser` をフロントで継続 + Rust 用 `sentry` クレートをメインに |
| 自動更新 | `tauri-plugin-updater` + GCS generic provider（`latest.json` フォーマット要互換確認） |
| 内蔵 HTTP サーバ (Hono) | モバイル PWA 連携が必要なら `axum` でリプレース。不要なら撤去して全面 IPC に集約 |
| RFID シリアル (`serialport` npm) | `tauri-plugin-serialport` または `serialport-rs` クレートで Rust 化 |
| 音声入力 (`mic` npm + Deepgram WebSocket) | `cpal` クレート or レンダラー `getUserMedia` (`AudioWorklet` 化) |
| 自動モード (Auto モード) | Manual モードと並行する別状態機械。元実装の `auto/board.ts` を別途 Rust 移植 |
| Auth0 連携が必要なすべての機能 | 上記 Auth0 完成後に統合 |
| Auto モードのテロップ全 4 系統 (basic/classic/modern/broadcast) | UI コピーのみで動作可能。状態は Rust 側 board と同期するだけ |
| Storybook | `@storybook/react-vite` をそのまま導入可能（元と同じ構成） |
| Web/PWA 配信版 | Hono サーバを継続するか、Tauri Mobile を使う |

## アーキテクチャ

```
┌─────────────────────────────────────────────────────────────┐
│                         Tauri 2 App                         │
│  ┌────────────────────┐         ┌────────────────────────┐  │
│  │  Main WebView      │         │  Telop WebView         │  │
│  │  (index.html)      │         │  (telop.html)          │  │
│  │  ┌──────────────┐  │         │  ┌──────────────────┐  │  │
│  │  │ React 19     │  │         │  │ React 19         │  │  │
│  │  │ react-router │  │  emit   │  │ Subscribes to    │  │  │
│  │  │ Tailwind v4  │◄─┼─────────┼──│ telop_updated    │  │  │
│  │  └──────────────┘  │  event  │  └──────────────────┘  │  │
│  │  ▲                 │         │                        │  │
│  └──┼─────────────────┘         └────────────────────────┘  │
│     │ invoke() / listen()                                   │
│  ┌──▼──────────────────────────────────────────────────┐    │
│  │  Rust (Tauri commands)                              │    │
│  │  ┌──────────────────┐  ┌─────────────────────────┐  │    │
│  │  │ AppState         │  │ Domain (Rust)           │  │    │
│  │  │ Arc<Mutex<...>>  │  │  - card / deck          │  │    │
│  │  │  - board         │  │  - evaluate_hand        │  │    │
│  │  │  - settings      │  │  - texas_holdem board   │  │    │
│  │  │  - telop_state   │  │                         │  │    │
│  │  └──────────────────┘  └─────────────────────────┘  │    │
│  │  ┌──────────────────────────────────────────────┐   │    │
│  │  │ tauri-plugin-store (settings.json)           │   │    │
│  │  └──────────────────────────────────────────────┘   │    │
│  └─────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
```

### 主要な Tauri commands

| Command | 引数 | 戻り値 | 用途 |
|---|---|---|---|
| `get_board` | – | `TexasHoldemBoard \| null` | 現在のボード取得 |
| `start_game` | `{ smallBlind, bigBlind, buyIn, playerNames }` | `TexasHoldemBoard` | ゲーム開始 (ブラインド徴収 + ホール配布) |
| `move_next_game` | – | `TexasHoldemBoard` | 次ハンドへ |
| `reset_board` | – | `void` | ボードリセット |
| `back_board` | – | `TexasHoldemBoard` | 1 手戻す（履歴） |
| `evaluate_player_hand` | `{ position }` | `EvaluatedHand` | 役判定（パフォーマンスデモ） |
| `bet` / `call` / `check` / `fold` / `raise` / `allin` | – | `TexasHoldemBoard` | アクション実行 |
| `load_game_settings` | – | `GameSettings` | tauri-plugin-store からロード |
| `save_game_settings` | `{ settings }` | `void` | tauri-plugin-store に保存 |
| `open_telop_window` / `close_telop_window` | – | `void` | テロップ WebView 制御 |
| `set_telop_message` / `set_telop_color` | `{ message }` / `{ color }` | `void` | テロップ表示更新 |
| `get_telop_state` | – | `TelopState` | テロップ初期取得 |

### イベント

| Event | Payload | 発火タイミング |
|---|---|---|
| `board_updated` | `TexasHoldemBoard` | 全アクション・ゲーム遷移 mutation 後 |
| `telop_updated` | `{ message, color }` | テロップ設定変更時 |

## セットアップ

### 前提

- Node.js 24.12.0 以上 (`mise install`)
- pnpm 10.26.0
- Rust 1.77 以上（`rustup` 推奨）
- Tauri 2 のシステム要件: macOS は Xcode CLI Tools、Linux は WebKitGTK、Windows は WebView2

### 手順

```sh
# 依存インストール
pnpm install

# 開発（Tauri が Vite を起動して WebView を立ち上げる）
pnpm tauri:dev

# 本番ビルド
pnpm tauri:build

# テスト
pnpm test          # フロントエンド (vitest)
pnpm test:rust     # Rust (cargo test)
```

## ディレクトリ構成

```
.
├── src/                    # フロントエンド (React 19 + Tailwind v4)
│   ├── api/                # Tauri invoke ラッパー
│   ├── domain/             # 共通型 (Rust とミラー)
│   ├── features/           # 元 desktop-app からコピー (board, chip, dealer_icon, ...)
│   ├── ui/                 # 元 desktop-app からコピー (button, page, snackbar, ...)
│   ├── pages/              # PoC 画面 (home, game/setting, game/playing, settings/telop)
│   ├── routes/             # react-router 7 (createMemoryRouter)
│   ├── layouts/            # MainLayout
│   ├── contexts/           # BoardProvider 等
│   ├── css/                # Tailwind v4 + 元 themes/tokens
│   ├── test/               # vitest setup
│   ├── main.tsx            # メインウィンドウ entry
│   └── telop.tsx           # テロップウィンドウ entry
├── src-tauri/              # Rust バックエンド
│   ├── src/
│   │   ├── domain/         # poker domain (Rust)
│   │   ├── commands/       # Tauri commands
│   │   ├── state.rs        # AppState
│   │   ├── events.rs       # イベント定数
│   │   ├── lib.rs
│   │   └── main.rs
│   ├── capabilities/       # Tauri 権限定義
│   ├── icons/
│   ├── tauri.conf.json
│   ├── Cargo.toml
│   └── build.rs
├── index.html              # メインウィンドウ HTML
├── telop.html              # テロップウィンドウ HTML
├── vite.config.ts          # 2-entry build (main + telop)
├── tsconfig.json
├── tsconfig.web.json
├── biome.json              # 元と同一設定
├── tailwind.config.js
├── postcss.config.js
├── vitest.config.ts
└── package.json
```

## 検証ポイント

PoC で確認できること:

1. **Rust の状態管理が Electron main プロセスを完全に置き換えられる** — board 状態機械 + 役判定 + 設定永続化を全部 Rust 化
2. **Tauri Event が SSE の代替として機能する** — `app.emit("board_updated", board)` を全ウィンドウが受信
3. **マルチウィンドウ (main + telop) が `WebviewWindowBuilder` で実現できる**
4. **`tauri-plugin-store` が `electron-store` の代替として使える** — JSON ベースで型安全
5. **元の React/Tailwind v4 UI コードがそのまま動く** — `import` 置換のみで移行可能
6. **`vitest` + `@testing-library/react` で元と同形式のテストが書ける** — Tauri invoke はテスト時 mock

## 既知の未対応事項（PoC スコープ外）

`src-tauri/src/lib.rs` の冒頭 doc コメントおよび本 README の上部「範囲外」表に記載のとおり。

## ライセンス

社内 PoC のため未定。

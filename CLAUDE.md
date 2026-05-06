# Potz Poker Desktop v2

Texas Hold'em ポーカー卓 (Tauri 2 + React 19 + Rust + RFID)。

## 基本方針

- 日本語で応答 (技術用語・コード識別子は原文)
- emoji 不使用
- 最小限の変更。リファクタや未要求の追加機能は入れない

## 検証コマンド

### Rust 側 (src-tauri/)

```sh
cd src-tauri && cargo fmt --check && cargo test --lib && cargo clippy --all-targets -- -D warnings
```

### Frontend 側 (リポジトリルート)

```sh
pnpm exec tsc --noEmit && pnpm vitest run --exclude='**/.claude/**' && pnpm biome check src/
```

詳細な手順・失敗時の対処・ベースライン数値は `/verify` skill を参照。

## 落とし穴 / ルール

`.claude/rules/` に詳細なチェックリストを置いている。
Claude は対象ファイルを開いたときにパススコープルールを自動で読み込む。

| ファイル | 対象 | 内容 |
|---|---|---|
| `.claude/rules/tauri-pitfalls.md` | `src-tauri/**` | Mutex 非再入、history rollback、camelCase IPC、burn_count 累積 等 |
| `.claude/rules/frontend-pitfalls.md` | `src/**/*.{ts,tsx}` | useEffect cleanup、listen 解除、race condition、cancelled flag 等 |
| `.claude/rules/workflow-rop.md` | 全体 | RoP/neverthrow、副作用隔離、Discriminated Union エラー型 |
| `.claude/rules/subagent-orchestration.md` | 全体 | Explorer→Implementer→cherry-pick フロー、誤報精査、コミット規約 |

## Skill / Agent

| コマンド | 役割 |
|---|---|
| `/verify` | Rust + Frontend を一括または個別に検証 |
| `/bug-round` | Explorer → 並列 Implementer → cherry-pick → push の 1 ラウンド |

### `.claude/agents/` の subagent

| agent | 役割 |
|---|---|
| `bug-explorer` | コードを調査し 6〜10 件のバグを報告 |
| `bug-implementer` | 指定バグを worktree で修正・検証・コミット |
| `bug-reviewer` | cherry-pick 後の修正をレビュー |

## ディレクトリ構成

Tauri 2 の公式標準。`src/` (React) と `src-tauri/` (Rust) は変更しない。

```
potz-poker-desktop-v2/
├── src/                    # React 19 フロントエンド
├── src-tauri/              # Tauri 2 + Rust バックエンド
├── .claude/
│   ├── agents/             # subagent 定義
│   ├── rules/              # パススコープルール
│   ├── skills/             # カスタム skill
│   └── settings.json       # プロジェクト権限・env 設定
└── CLAUDE.md               # このファイル
```

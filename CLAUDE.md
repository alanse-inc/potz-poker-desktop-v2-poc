# Potz Poker Desktop v2

Texas Hold'em ポーカー卓 (Tauri 2 + React 19 + Rust + RFID)。

## 基本方針

- 日本語で応答 (技術用語・コード識別子は原文)
- emoji 不使用
- 最小限の変更。リファクタや未要求の追加機能は入れない

## 検証

- Rust: `cd src-tauri && cargo fmt --check && cargo test --lib && cargo clippy --all-targets -- -D warnings`
- Frontend: `pnpm exec tsc --noEmit && pnpm vitest run --exclude='**/.claude/**' && pnpm biome check src/`

詳細は `/verify` skill を参照。

## Tauri 落とし穴

- `parking_lot::Mutex` は非再入。lock 中に同じ lock を取らない
- lock を保持したまま `app.emit()` を呼ばない
- state 変更コマンドは `history` push + エラー時 pop でロールバック
- `tauri::command(rename_all = "camelCase")` 引数はフロントで camelCase

## Skill / Agent

- `/verify` — 動作確認
- `/bug-round` — 探索 → 並列実装 → cherry-pick → push の 1 ラウンド
- `bug-explorer` / `bug-implementer` / `bug-reviewer` — `.claude/agents/` の subagent

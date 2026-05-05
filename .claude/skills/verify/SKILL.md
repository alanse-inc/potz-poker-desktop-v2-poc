---
name: verify
description: >
  Potz Poker Desktop v2 の動作確認 (Rust + Frontend) を実行する。
  "動作確認", "検証", "verify", "テスト走らせて", "lint" と言われた場合に使用する。
  cargo fmt / test / clippy + tsc / vitest / biome を一括または個別に実行する。
allowed-tools:
  - Bash(cargo *)
  - Bash(pnpm *)
  - Bash(npm *)
  - Bash(npx *)
  - Bash(cd *)
  - Bash(ls *)
  - Read
---

# Potz Poker Desktop v2 動作確認

Tauri 2 + React 19 プロジェクトの検証手順。Rust 側と Frontend 側を区別する。

## 引数 ($ARGUMENTS)

- 引数なし: full (Rust + Frontend を全て実行)
- `rust`: Rust 側のみ
- `frontend` / `front` / `web`: Frontend 側のみ
- `quick`: cargo test --lib + pnpm vitest run のみ (lint / format をスキップ)
- 個別コマンド名 (`fmt`, `clippy`, `tsc`, `biome` 等) を指定すると単発実行

## Rust 側 (src-tauri/)

### 1. フォーマット
```sh
cd src-tauri && cargo fmt --check
```
差分が出たら `cargo fmt` で修正してから再確認する。

### 2. ユニットテスト
```sh
cd src-tauri && cargo test --lib
```
- ベースライン: 通過テスト数を維持・増加させる (Round 22 時点で 194 passed)
- 1 件でも失敗したら原因を究明し修正する。スキップ・無効化はしない

### 3. lint (警告ゼロ必須)
```sh
cd src-tauri && cargo clippy --all-targets -- -D warnings
```
- `-D warnings` で警告をエラー扱いする
- 修正不能な警告には `#[allow(...)]` を最小スコープで付与し、付与理由をコミットメッセージに残す

## Frontend 側 (リポジトリルート)

### 1. 型チェック
```sh
pnpm exec tsc --noEmit
```
- `tsgo` ベース。出力が空なら成功

### 2. テスト
```sh
pnpm vitest run --exclude='**/.claude/**'
```
- `--exclude='**/.claude/**'` は worktree 上のテストを除外するために必須
- ベースライン (Round 22 時点): 975 passed / 91 files

### 3. lint (baseline 5 errors)
```sh
pnpm biome check src/
```
- 既存ベースラインは 5 errors。これを超えるエラーが出た場合は新規発生分を修正する
- baseline を超える警告は受け入れない

## 完全実行 (CI 相当)

```sh
# Rust
cd src-tauri && cargo fmt --check && cargo test --lib && cargo clippy --all-targets -- -D warnings
# Frontend (リポジトリルートに戻る)
cd .. && pnpm exec tsc --noEmit && pnpm vitest run --exclude='**/.claude/**' && pnpm biome check src/
```

## 失敗時の対処

- **cargo fmt 差分**: `cargo fmt` で自動修正
- **cargo test 失敗**: 失敗テスト名から原因ファイルを特定。Read でテストとプロダクトコードを確認
- **cargo clippy 警告**: 推奨される書き方に従う。`#[allow(clippy::...)]` は最小スコープに限る
- **tsc エラー**: 型エラーは型を直す。`as any` での回避は禁止
- **vitest 失敗**: テストが期待値の更新を必要とするか、プロダクトコードのバグかを判断
- **biome エラー超過**: 自動修正可能なら `pnpm biome check src/ --write` (要確認)

## 報告フォーマット

各ステップ完了後、以下のように要約する:

```
- cargo fmt --check: OK
- cargo test --lib: 194 passed
- cargo clippy: warnings 0
- tsc --noEmit: OK
- vitest: 975 passed / 91 files
- biome: 5 errors (baseline)
```

$ARGUMENTS

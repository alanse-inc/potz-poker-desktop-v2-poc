---
name: bug-round
description: >
  Potz Poker Desktop v2 のバグ探索・並列実装・cherry-pick・push を 1 ラウンドで実行する。
  "次のラウンド", "Round N", "バグ探索して直して", "自律バグ修正" と言われた場合に使用する。
  Explorer agent でバグを 6〜10 件抽出し、3〜4 並列の Implementer agent で worktree 実装、
  完了後に main で cherry-pick + 検証 + push まで自動化する。
allowed-tools:
  - Bash(git *)
  - Bash(cargo *)
  - Bash(pnpm *)
  - Bash(cd *)
  - Bash(ls *)
  - Bash(grep *)
  - Bash(rg *)
  - Read
  - Edit
  - Write
  - Glob
  - Grep
---

# 自律バグ修正ラウンド (Round)

「探索 → 並列実装 → cherry-pick → 検証 → push」を 1 サイクルとして繰り返す運用。

## 前提

- `git status` がクリーンであること
- main ブランチに居ること、`git pull` 済みでなくても origin/main の HEAD と同期されていること
- 過去ラウンドの修正履歴 (commit メッセージ) を `git log --oneline` で確認しておくこと

## 1. Explorer 起動 (1 体)

`.claude/agents/bug-explorer.md` の subagent を foreground で起動する。返り値は Markdown レポート (Bug N 形式)。

- 各バグに **実コード根拠 (ファイルパス:行番号 + コード引用)** が必須
- 過去ラウンドで対応済みのバグを除外する (重複回避のため、最近の commit log を agent に渡す)
- 6〜10 件、優先度 (high / medium / low) を付ける
- 推測ではなく実コードを根拠にすること、要検証点があれば明記すること

## 2. グループ分け

報告されたバグを **3〜4 グループ** に分割する。原則:

- **同じファイルを触る修正は同一グループ** にする (cherry-pick 時の衝突回避)
- 各グループは 1〜3 件のバグを扱う
- 高優先度 (high) のバグから優先的に着手する
- グループ A/B/C/D の命名で TaskCreate に記録する

## 3. Implementer 並列起動 (3〜4 体)

各グループに対して `.claude/agents/bug-implementer.md` の subagent を `isolation: "worktree"` + `run_in_background: true` で起動する。プロンプトには以下を含める:

- 対象 Bug 番号 + 修正方針 + 該当コード根拠 (Explorer のレポートを引用)
- 制約 (最小限の変更、emoji 不使用、実コード前提検証、スキップ判断可)
- 検証コマンド (cargo / pnpm 各種)
- 報告内容 (コミット SHA, 変更ファイル, 検証結果, スキップ時の理由)

完了通知が届くまで待機。完了通知の途中で他作業を進めても良い。

## 4. Cherry-pick

全 implementer 完了後、main repo で順に `git cherry-pick <SHA>` する。順序は:

1. 同一ファイルを触る修正を連続でまとめる
2. 衝突した場合は `git diff` で内容確認 → Edit で解決 → `git add` → `git cherry-pick --continue`
3. 衝突解決時は **両方の修正の意図を保つ** こと (片方を捨てない)
4. 解決後の cargo / pnpm 検証で両方の修正が機能することを確認

## 5. フル検証

`/verify` skill を呼ぶか、以下を直接実行:

```sh
cd src-tauri && cargo fmt --check && cargo test --lib && cargo clippy --all-targets -- -D warnings
cd .. && pnpm exec tsc --noEmit && pnpm vitest run --exclude='**/.claude/**' && pnpm biome check src/
```

- 失敗があれば修正する。テストが新仕様に追従していない場合はテストを更新し、新規コミットとして追加する (`test:` プレフィックス)

## 6. Push

```sh
git push origin main
```

- `bypass-rule-violations` が自動で出力される (status check 設定のため、許容)
- 失敗したら原因を確認し、必要ならテスト修正コミットを追加してから再 push

## 7. TaskUpdate + 次 Round

- 全グループのタスクを `completed` に更新
- 次 Round の explorer タスクを TaskCreate して即起動
- standing directive (CLAUDE.md user instructions) 「完了ごとに次のタスクを投げ続けて常に稼働」に従う

## スキップ判断のパターン

Implementer agent が「該当バグの前提が誤っている」と報告した場合:

- スキップ理由を確認 (実コードの該当箇所引用が必須)
- 妥当ならグループ完了として扱い、当該 Bug の修正は行わない
- 妥当でなければ explorer に戻すか自分で再調査

## 注意事項

- worktree 上で `git cherry-pick` を実行しない (現在のディレクトリ確認、main repo パスへ `cd` してから)
- `git cherry-pick --abort` で中断できる
- 衝突解決後の amend は禁止。新規コミットを作る
- `--no-verify` 等のフックスキップは原則禁止

$ARGUMENTS

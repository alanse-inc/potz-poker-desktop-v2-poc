# Subagent 並列運用と cherry-pick フロー

`/bug-round` skill が実行する Explorer → 並列 Implementer → cherry-pick → push の運用規約。

## フロー概要

```
Explorer (1体・foreground)
  └─ Bug レポート (6〜10 件)
       └─ グループ分け (3〜4 グループ)
            ├─ Implementer A (worktree・background)
            ├─ Implementer B (worktree・background)
            └─ Implementer C (worktree・background)
                 └─ 全完了後 cherry-pick → 検証 → push
```

## 1. Explorer の起動

- foreground で 1 体起動。返り値は Bug N 形式の Markdown レポート
- 各バグに **実コード根拠** (ファイルパス:行番号 + コード引用) を必須とする
- 過去ラウンドで対応済みのバグを除外する (`git log --oneline -50` を agent に渡す)
- 件数: 6〜10 件、優先度 high / medium / low を付ける

## 2. グループ分けの原則

- **同じファイルを触る修正は同一グループ** にする (cherry-pick 衝突回避)
- 各グループ 1〜3 件のバグを担当
- high 優先度のバグから優先的に着手する
- グループ数は 3〜4 (多すぎると管理コストが上回る)
- 粒度目標: 1 グループ = 1〜2 コミット

## 3. Implementer の起動

- `isolation: "worktree"` + `run_in_background: true` で起動
- プロンプトに含める情報:
  - 対象 Bug 番号 + 修正方針 + Explorer のコード引用
  - 制約: 最小限の変更、emoji 不使用
  - 前提検証指示: 実コードで前提を確認してからスキップ判断可
  - 検証コマンド (後述)
  - 報告フォーマット (SHA、変更ファイル、検証結果、worktree パス)
- 全 Implementer の完了を待ってから次ステップへ

### スキップ判断のパターン

Implementer が「前提が誤っている」と報告した場合:
- 実コード引用付きのスキップ理由を確認する
- 妥当ならグループ完了として扱い、当該 Bug はスキップ
- 妥当でなければ Explorer に戻すか自分で再調査する

## 4. Cherry-pick

cherry-pick は **main repo (worktree ではない)** で行う。

```sh
# main repo の絶対パスで実行すること
git cherry-pick <SHA>
```

順序の原則:
1. 同一ファイルを触るコミットは連続してまとめる
2. 衝突した場合: `git diff` で確認 → Edit で解決 → `git add` → `git cherry-pick --continue`
3. 衝突解決は **両方の修正の意図を保つ** (片方を捨てない)
4. 解決後に両修正が機能することを検証する

禁止事項:
- `git cherry-pick --abort` 以外での中断はしない
- `amend` は禁止。衝突解決後は新規コミットを作る
- `--no-verify` でのフックスキップは禁止

## 5. 誤報精査ステップ

cherry-pick 前に Explorer レポートの品質を確認する:

- [ ] ファイルパス + 行番号の引用が現行コードと一致するか
- [ ] 過去コミットで既に修正済みでないか (`git log --all --oneline -- <file>` で確認)
- [ ] 修正方針が実際のコードの構造と整合するか
- [ ] テスト (cargo test / vitest) が存在するか、あるいは追加が必要か

誤報 (前提が誤り) と判明した場合は Implementer のスキップを採用し、次ラウンドで再調査。

## 6. フル検証

cherry-pick 完了後に `/verify` を呼ぶか直接実行:

```sh
cd src-tauri && cargo fmt --check && cargo test --lib && cargo clippy --all-targets -- -D warnings
pnpm exec tsc --noEmit && pnpm vitest run --exclude='**/.claude/**' && pnpm biome check src/
```

失敗時: 修正して `test:` プレフィックスの新規コミットを追加する。

## 7. Worktree の後片付け

使用済み worktree は `/cleanup-worktrees` skill で削除する。
パスは `.claude/worktrees/` 配下。

## コミットメッセージ規約

- `fix: <日本語要約>` — バグ修正
- `test: <日本語要約>` — テスト追加・修正
- `refactor: <日本語要約>` — リファクタリング (最小限の変更原則に従い原則使わない)
- 1 コミット = 1 論理変更 (cherry-pick 時の粒度確保)

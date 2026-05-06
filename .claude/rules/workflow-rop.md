# Workflow / Railway-oriented Programming (RoP) 規約

## 概要

このプロジェクトは *Domain Modeling Made Functional* (Scott Wlaschin) の流儀をベースに、
`neverthrow` の `Result` 型を使った Railway-oriented Programming を採用している (v1 設計)。
v2 では同じ原則を Tauri コマンド層 + Rust ドメイン層に適用する方針。

## 核心原則

### 1. エラー型は Discriminated Union で定義する

```ts
// 良い例
type ActionError =
  | { kind: 'invalid_bet'; amount: number; min: number }
  | { kind: 'not_your_turn'; player_id: string }
  | { kind: 'network_error'; message: string };
```

- `Error` クラスの継承や `string` エラーは使わない
- `kind` フィールドで型を絞り込めるようにする

### 2. neverthrow Result + andThen チェイン

```ts
import { ok, err, Result } from 'neverthrow';

function validateBet(amount: number, stack: number): Result<number, ActionError> {
  if (amount <= 0) return err({ kind: 'invalid_bet', amount, min: 1 });
  if (amount > stack) return err({ kind: 'invalid_bet', amount, min: 0 });
  return ok(amount);
}

// チェイン
const result = validateBet(bet, stack)
  .andThen((amount) => checkTurn(amount, currentPlayer))
  .andThen((amount) => submitAction(amount));
```

### 3. 副作用は I/O 境界に隔離する

- ドメイン関数 (純粋計算) は副作用を持たない
- Tauri コマンド層が I/O 境界。ここでのみ `invoke` / `emit` / `localStorage` を呼ぶ
- context の `dispatch` や state 更新も I/O 境界として扱う

### 4. 早期 return の代わりに Result チェインを使う

```ts
// 悪い例: 早期 return で例外的フロー
async function placebet(amount: number) {
    if (!isMyTurn()) throw new Error('not your turn');
    if (amount < minBet) throw new Error('too small');
    // ...
}

// 良い例: Result チェイン
async function placeBet(amount: number): Promise<Result<void, ActionError>> {
    return validateTurn()
        .andThen(() => validateAmount(amount))
        .asyncAndThen(() => invokeAction(amount));
}
```

## Rust 側の対応

```rust
// エラー型は thiserror を使う
#[derive(Debug, thiserror::Error)]
pub enum GameError {
    #[error("invalid action: {0}")]
    InvalidAction(String),
    #[error("not player's turn")]
    NotYourTurn,
}

// コマンド層で Result を返す
#[tauri::command]
pub fn place_bet(amount: u64, state: tauri::State<GameState>) -> Result<(), GameError> {
    let mut board = state.lock();
    board.validate_bet(amount)?;
    board.apply_bet(amount)
}
```

## v2 でやるべきこと

- [ ] Tauri コマンドの戻り値を `Result<T, GameError>` に統一する (部分的に実施済み)
- [ ] フロント側のエラーハンドリングを `Result` チェインに置き換える (必要に応じて段階的に)
- [ ] `GameError` の種別を `kind` ベースの Discriminated Union に整理する
- [ ] テストでは `assert_eq!(result, Err(GameError::NotYourTurn))` のように具体的なエラー型を検証する

## 参考

- *Domain Modeling Made Functional* - Scott Wlaschin
- neverthrow: https://github.com/supermacro/neverthrow
- thiserror: https://github.com/dtolnay/thiserror

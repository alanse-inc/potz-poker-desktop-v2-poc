---
paths:
  - "src-tauri/**"
---

# Tauri / Rust 落とし穴チェックリスト

このファイルは `src-tauri/` を編集するときに自動的に読み込まれるパススコープルールです。
修正・実装前に該当項目を確認すること。

## Mutex と排他制御

- [ ] `parking_lot::Mutex` は非再入。lock を保持したまま、同じ lock を取る関数を呼ばない
- [ ] lock を保持したまま `app.emit()` を呼ばない (emit 前に lock を解放すること)
- [ ] lock スコープを最小化し、必要な値のクローンを取ってから lock を解放する

```rust
// 悪い例: lock 保持中に emit
let mut state = app.state::<Mutex<GameState>>().lock();
app.emit("event", &*state).unwrap(); // デッドロックの可能性

// 良い例: 値をクローンしてから emit
let snapshot = {
    let state = app.state::<Mutex<GameState>>().lock();
    state.clone()
};
app.emit("event", &snapshot).unwrap();
```

## History ロールバック

- [ ] state 変更コマンドは変更前に `history.push(snapshot)` する
- [ ] エラー時は `history.pop()` でロールバックする (push と pop は必ずペア)
- [ ] `MAX_HISTORY` 制限を超えた場合の削除処理を含める

```rust
// 必須パターン
let snapshot = state.clone();
history.push(snapshot);
match perform_action(&mut state) {
    Ok(result) => Ok(result),
    Err(e) => {
        history.pop(); // ロールバック
        Err(e)
    }
}
```

## Tauri IPC / camelCase

- [ ] `#[tauri::command(rename_all = "camelCase")]` を付けたコマンドの引数は、フロントエンド側で camelCase で渡す
- [ ] 引数名の不一致はサイレントな `undefined` になるため、追加・変更時は必ず両側を確認する

例: Rust 側 `fn move_next_game(game_id: u32)` → フロント側 `invoke('move_next_game', { gameId: u32 })`

## カード配布と burn_count

- [ ] `advance_phase` の `burn_count` 引数は **累積枚数** のセマンティクス (0/1/2)
  - Flop: burn 1 枚 → `burn_count = 1`
  - Turn: さらに burn 1 枚 → `burn_count = 2`
  - River: さらに burn 1 枚 → `burn_count = 3`
- [ ] `burn_count` は `u8` 型。オーバーフロー防止のため加算には `saturating_add` を使う
- [ ] `CommunityCard` アームで `try_advance_if_round_complete` を呼ぶこと

## resolve_showdown / pot 計算

- [ ] `resolve_showdown` で `community.len() < 5` のガードを入れる
- [ ] pot 計算の `eligible_for_pot` から `pending` hand (まだ行動中) を除外する
- [ ] `bb_ante_amount` フィールドは `Board` に存在する。`ante_amount` と混同しない

## heads-up (2 人) と 3+ 人の差異

- [ ] SB/BB 決定ルールは heads-up と 3+ 人で異なる
- [ ] `stack == 0` のプレイヤーに強制ベットさせないガードを入れる
- [ ] `next_game` で dealer_position を進める前に全プレイヤーのスタックを確認する

## unwrap / expect

- [ ] テストコード以外で `unwrap()` / `expect()` を使わない
- [ ] 想定外の失敗には `anyhow::bail!` またはドメイン固有のエラー型を返す

## シリアル通信 (RFID)

- [ ] シリアル受信のデバウンス処理が存在するか確認する
- [ ] disconnect 時に state をリセットするか確認する
- [ ] reconnect 時の state 整合性 (既存の game 状態との整合) を確認する
- [ ] `apply_card_placed` の冪等性を確認する (重複受信時の安全性)

## 検証コマンド (Rust 側)

```sh
cd src-tauri && cargo fmt --check
cd src-tauri && cargo test --lib
cd src-tauri && cargo clippy --all-targets -- -D warnings
```

`-D warnings` により警告はエラー扱い。`#[allow(clippy::...)]` は最小スコープかつ理由コメント必須。

//! プレイヤーアクションに関する Tauri commands。

use crate::domain::board::{
    board_allin, board_bet, board_call, board_check, board_fold, board_raise, TexasHoldemBoard,
};
use crate::domain::card::Card;
use crate::error::BoardError;
use crate::events::BOARD_UPDATED;
use crate::state::{AppState, MAX_HISTORY};
use tauri::{AppHandle, Emitter, State};

/// board と deck を取り出してアクションを適用するヘルパー。
/// borrow checker 対策として history への push と action の適用を別々に行う。
fn run_action<F>(
    app: &AppHandle,
    state: &State<'_, AppState>,
    action_fn: F,
) -> Result<TexasHoldemBoard, String>
where
    F: FnOnce(&mut TexasHoldemBoard, &mut Vec<Card>) -> Result<(), BoardError>,
{
    let mut inner = state.lock();

    // snapshot を history に保存
    {
        let board_snap = inner
            .board
            .as_ref()
            .ok_or_else(|| BoardError::GameNotStarted.to_string())?
            .clone();
        let deck_snap = inner.deck.clone();
        let burn_count_snap = inner.burn_count;
        let burn_card_snap = inner.burn_card;
        inner
            .history
            .push((board_snap, deck_snap, burn_count_snap, burn_card_snap));
        if inner.history.len() > MAX_HISTORY {
            let excess = inner.history.len() - MAX_HISTORY;
            inner.history.drain(0..excess);
        }
    }

    // board と deck を取り出して mut 参照を渡す
    let (board_ref, deck_ref) = inner
        .split_board_and_deck()
        .ok_or_else(|| BoardError::GameNotStarted.to_string())?;

    action_fn(board_ref, deck_ref).map_err(|e| e.to_string())?;

    let result = board_ref.clone();
    drop(inner); // Mutex lock を解放してから emit する

    let _ = app.emit(BOARD_UPDATED, &result);
    Ok(result)
}

#[tauri::command]
pub fn bet(
    app: AppHandle,
    state: State<'_, AppState>,
    amount: u32,
) -> Result<TexasHoldemBoard, String> {
    let min_chip = state.lock().settings.min_chip;
    run_action(&app, &state, move |board, deck| {
        board_bet(board, amount, deck, min_chip)
    })
}

#[tauri::command]
pub fn call(app: AppHandle, state: State<'_, AppState>) -> Result<TexasHoldemBoard, String> {
    run_action(&app, &state, board_call)
}

#[tauri::command]
pub fn check(app: AppHandle, state: State<'_, AppState>) -> Result<TexasHoldemBoard, String> {
    run_action(&app, &state, board_check)
}

#[tauri::command]
pub fn fold(app: AppHandle, state: State<'_, AppState>) -> Result<TexasHoldemBoard, String> {
    run_action(&app, &state, board_fold)
}

#[tauri::command]
pub fn raise(
    app: AppHandle,
    state: State<'_, AppState>,
    amount: u32,
) -> Result<TexasHoldemBoard, String> {
    let min_chip = state.lock().settings.min_chip;
    run_action(&app, &state, move |board, deck| {
        board_raise(board, amount, deck, min_chip)
    })
}

#[tauri::command]
pub fn allin(app: AppHandle, state: State<'_, AppState>) -> Result<TexasHoldemBoard, String> {
    run_action(&app, &state, board_allin)
}

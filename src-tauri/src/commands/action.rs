//! プレイヤーアクションに関する Tauri commands。

use crate::domain::board::{
    board_allin, board_bet, board_call, board_check, board_fold, board_raise, TexasHoldemBoard,
};
use crate::domain::card::Card;
use crate::error::BoardError;
use crate::events::BOARD_UPDATED;
use crate::state::AppState;
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
        inner.history.push((board_snap, deck_snap));
    }

    // board と deck を取り出して mut 参照を渡す
    // Option::as_mut → *Option でフィールドアクセスするのでそれぞれ別々に借用
    let (board_ref, deck_ref) = match &mut *inner {
        ref mut s => {
            let b = s.board.as_mut().ok_or_else(|| BoardError::GameNotStarted.to_string())?;
            let d = &mut s.deck;
            // SAFETY: b と d は InnerState の異なるフィールドなので、
            // raw pointer を使って同時 mut 参照を取得する。
            // これは Rust の borrow checker が構造体の異なるフィールドを
            // 同時 mut 借用できないことへの回避策。
            let b_ptr: *mut TexasHoldemBoard = b as *mut _;
            let d_ptr: *mut Vec<Card> = d as *mut _;
            unsafe { (&mut *b_ptr, &mut *d_ptr) }
        }
    };

    action_fn(board_ref, deck_ref).map_err(|e| e.to_string())?;

    let result = board_ref.clone();
    let _ = app.emit(BOARD_UPDATED, &result);
    Ok(result)
}

#[tauri::command]
pub fn bet(
    app: AppHandle,
    state: State<'_, AppState>,
    amount: u32,
) -> Result<TexasHoldemBoard, String> {
    run_action(&app, &state, |board, deck| board_bet(board, amount, deck))
}

#[tauri::command]
pub fn call(
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<TexasHoldemBoard, String> {
    run_action(&app, &state, |board, deck| board_call(board, deck))
}

#[tauri::command]
pub fn check(
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<TexasHoldemBoard, String> {
    run_action(&app, &state, |board, deck| board_check(board, deck))
}

#[tauri::command]
pub fn fold(
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<TexasHoldemBoard, String> {
    run_action(&app, &state, |board, deck| board_fold(board, deck))
}

#[tauri::command]
pub fn raise(
    app: AppHandle,
    state: State<'_, AppState>,
    amount: u32,
) -> Result<TexasHoldemBoard, String> {
    run_action(&app, &state, |board, deck| board_raise(board, amount, deck))
}

#[tauri::command]
pub fn allin(
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<TexasHoldemBoard, String> {
    run_action(&app, &state, |board, deck| board_allin(board, deck))
}

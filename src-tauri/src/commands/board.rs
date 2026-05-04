//! ボード操作に関する Tauri commands。

use crate::domain::board::{
    add_player as domain_add_player, build_remaining_deck,
    evaluate_player_hand as domain_evaluate_player_hand, next_game,
    remove_player as domain_remove_player, set_community_card as domain_set_community_card,
    start_game as domain_start_game, update_player as domain_update_player, GameSettings,
    TexasHoldemBoard,
};
use crate::domain::card::Card;
use crate::domain::hand::EvaluatedHand;
use crate::error::BoardError;
use crate::events::BOARD_UPDATED;
use crate::state::AppState;
use tauri::{AppHandle, Emitter, State};

#[tauri::command]
pub fn get_board(state: State<'_, AppState>) -> Option<TexasHoldemBoard> {
    state.lock().board.clone()
}

#[tauri::command(rename_all = "camelCase")]
pub fn start_game(
    app: AppHandle,
    state: State<'_, AppState>,
    small_blind: u32,
    big_blind: u32,
    min_chip: u32,
    bb_ante: bool,
    player_names: Vec<String>,
    dealer_position: u8,
) -> Result<TexasHoldemBoard, String> {
    let settings = GameSettings {
        small_blind,
        big_blind,
        min_chip,
        bb_ante,
    };

    let board = domain_start_game(settings.clone(), player_names, dealer_position)
        .map_err(|e| e.to_string())?;
    let deck = build_remaining_deck(&board);

    let mut inner = state.lock();
    inner.settings = settings;
    inner.history.clear();
    inner.board = Some(board.clone());
    inner.deck = deck;

    let _ = app.emit(BOARD_UPDATED, &board);
    Ok(board)
}

#[tauri::command]
pub fn move_next_game(
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<TexasHoldemBoard, String> {
    let mut inner = state.lock();
    let prev = inner
        .board
        .as_ref()
        .ok_or_else(|| BoardError::GameNotStarted.to_string())?
        .clone();
    let settings = inner.settings.clone();

    let (board, deck) = next_game(&prev, &settings).map_err(|e| e.to_string())?;

    inner.history.clear();
    inner.board = Some(board.clone());
    inner.deck = deck;

    let _ = app.emit(BOARD_UPDATED, &board);
    Ok(board)
}

#[tauri::command]
pub fn reset_board(_app: AppHandle, state: State<'_, AppState>) -> Result<(), String> {
    let mut inner = state.lock();
    inner.board = None;
    inner.deck.clear();
    inner.history.clear();
    Ok(())
}

#[tauri::command]
pub fn back_board(
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<TexasHoldemBoard, String> {
    let mut inner = state.lock();
    let (prev_board, prev_deck) = inner
        .history
        .pop()
        .ok_or_else(|| BoardError::NoHistory.to_string())?;

    inner.board = Some(prev_board.clone());
    inner.deck = prev_deck;

    let _ = app.emit(BOARD_UPDATED, &prev_board);
    Ok(prev_board)
}

#[tauri::command]
pub fn evaluate_player_hand(
    state: State<'_, AppState>,
    position: u8,
) -> Result<EvaluatedHand, String> {
    let inner = state.lock();
    let board = inner
        .board
        .as_ref()
        .ok_or_else(|| BoardError::GameNotStarted.to_string())?;

    domain_evaluate_player_hand(board, position).map_err(|e| e.to_string())
}

#[tauri::command(rename_all = "camelCase")]
pub fn set_community_card(
    app: AppHandle,
    state: State<'_, AppState>,
    locate_number: u8,
    card: Card,
) -> Result<TexasHoldemBoard, String> {
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
    let (board_ref, deck_ref) = match &mut *inner {
        ref mut s => {
            let b = s.board.as_mut().ok_or_else(|| BoardError::GameNotStarted.to_string())?;
            let d = &mut s.deck;
            let b_ptr: *mut TexasHoldemBoard = b as *mut _;
            let d_ptr: *mut Vec<Card> = d as *mut _;
            unsafe { (&mut *b_ptr, &mut *d_ptr) }
        }
    };

    domain_set_community_card(board_ref, locate_number, card, deck_ref)
        .map_err(|e| e.to_string())?;

    let result = board_ref.clone();
    let _ = app.emit(BOARD_UPDATED, &result);
    Ok(result)
}

#[tauri::command]
pub fn get_remaining_deck(state: State<'_, AppState>) -> Vec<Card> {
    state.lock().deck.clone()
}

#[tauri::command(rename_all = "camelCase")]
pub fn update_player(
    app: AppHandle,
    state: State<'_, AppState>,
    position: u8,
    name: Option<String>,
    stack: Option<u32>,
) -> Result<TexasHoldemBoard, String> {
    let mut inner = state.lock();
    let board = inner
        .board
        .as_mut()
        .ok_or_else(|| BoardError::GameNotStarted.to_string())?;
    domain_update_player(board, position, name, stack).map_err(|e| e.to_string())?;
    let result = board.clone();
    let _ = app.emit(BOARD_UPDATED, &result);
    Ok(result)
}

#[tauri::command(rename_all = "camelCase")]
pub fn add_player(
    app: AppHandle,
    state: State<'_, AppState>,
    name: String,
) -> Result<TexasHoldemBoard, String> {
    let mut inner = state.lock();
    let initial_stack = inner.settings.small_blind * 100;
    let board = inner
        .board
        .as_mut()
        .ok_or_else(|| BoardError::GameNotStarted.to_string())?;
    domain_add_player(board, name, initial_stack).map_err(|e| e.to_string())?;
    let result = board.clone();
    let _ = app.emit(BOARD_UPDATED, &result);
    Ok(result)
}

#[tauri::command(rename_all = "camelCase")]
pub fn remove_player(
    app: AppHandle,
    state: State<'_, AppState>,
    position: u8,
) -> Result<TexasHoldemBoard, String> {
    let mut inner = state.lock();
    let board = inner
        .board
        .as_mut()
        .ok_or_else(|| BoardError::GameNotStarted.to_string())?;
    domain_remove_player(board, position).map_err(|e| e.to_string())?;
    let result = board.clone();
    let _ = app.emit(BOARD_UPDATED, &result);
    Ok(result)
}

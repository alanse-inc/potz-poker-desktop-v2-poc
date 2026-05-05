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
#[allow(clippy::too_many_arguments)]
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

    {
        let mut inner = state.lock();
        inner.settings = settings;
        inner.history.clear();
        inner.board = Some(board.clone());
        inner.deck = deck;
        inner.burn_count = 0;
        inner.burn_card = None;
        inner.event_history.clear();
    } // lock を解放してから emit

    let _ = app.emit(BOARD_UPDATED, &board);
    Ok(board)
}

#[tauri::command]
pub fn move_next_game(
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<TexasHoldemBoard, String> {
    let board = {
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
        inner.burn_count = 0;
        inner.burn_card = None;
        inner.event_history.clear();

        board
    }; // lock を解放してから emit

    let _ = app.emit(BOARD_UPDATED, &board);
    Ok(board)
}

#[tauri::command]
pub fn reset_board(app: AppHandle, state: State<'_, AppState>) -> Result<(), String> {
    {
        let mut inner = state.lock();
        inner.board = None;
        inner.deck.clear();
        inner.history.clear();
        inner.burn_count = 0;
        inner.burn_card = None;
        inner.event_history.clear();
    } // lock を解放してから emit

    let _ = app.emit(BOARD_UPDATED, Option::<TexasHoldemBoard>::None);
    Ok(())
}

#[tauri::command]
pub fn back_board(
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<TexasHoldemBoard, String> {
    let prev_board = {
        let mut inner = state.lock();
        let (prev_board, prev_deck, prev_burn_count, prev_burn_card) = inner
            .history
            .pop()
            .ok_or_else(|| BoardError::NoHistory.to_string())?;

        inner.board = Some(prev_board.clone());
        inner.deck = prev_deck;
        inner.burn_count = prev_burn_count;
        inner.burn_card = prev_burn_card;
        inner.event_history.clear();

        prev_board
    }; // lock を解放してから emit

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
    let result = {
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
            inner.history.push((board_snap, deck_snap, burn_count_snap, burn_card_snap));
        }

        // board と deck を取り出して mut 参照を渡す
        let (board_ref, deck_ref) = {
            let s = &mut *inner;
            let b = s.board.as_mut().ok_or_else(|| BoardError::GameNotStarted.to_string())?;
            let d = &mut s.deck;
            let b_ptr: *mut TexasHoldemBoard = b as *mut _;
            let d_ptr: *mut Vec<Card> = d as *mut _;
            unsafe { (&mut *b_ptr, &mut *d_ptr) }
        };

        domain_set_community_card(board_ref, locate_number, card, deck_ref)
            .map_err(|e| e.to_string())?;

        board_ref.clone()
    }; // lock を解放してから emit

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
    let result = {
        let mut inner = state.lock();
        let board = inner
            .board
            .as_mut()
            .ok_or_else(|| BoardError::GameNotStarted.to_string())?;
        domain_update_player(board, position, name, stack).map_err(|e| e.to_string())?;
        board.clone()
    }; // lock を解放してから emit

    let _ = app.emit(BOARD_UPDATED, &result);
    Ok(result)
}

fn calculate_initial_stack(board: &TexasHoldemBoard, fallback_big_blind: u32) -> u32 {
    if board.players.is_empty() {
        fallback_big_blind * 100
    } else {
        let total: u32 = board.players.iter().map(|p| p.stack).sum();
        total / board.players.len() as u32
    }
}

#[tauri::command(rename_all = "camelCase")]
pub fn add_player(
    app: AppHandle,
    state: State<'_, AppState>,
    name: String,
) -> Result<TexasHoldemBoard, String> {
    let result = {
        let mut inner = state.lock();
        let fallback_big_blind = inner.settings.big_blind;
        let board = inner
            .board
            .as_mut()
            .ok_or_else(|| BoardError::GameNotStarted.to_string())?;
        let initial_stack = calculate_initial_stack(board, fallback_big_blind);
        domain_add_player(board, name, initial_stack).map_err(|e| e.to_string())?;
        board.clone()
    }; // lock を解放してから emit

    let _ = app.emit(BOARD_UPDATED, &result);
    Ok(result)
}

#[tauri::command(rename_all = "camelCase")]
pub fn remove_player(
    app: AppHandle,
    state: State<'_, AppState>,
    position: u8,
) -> Result<TexasHoldemBoard, String> {
    let result = {
        let mut inner = state.lock();
        let board = inner
            .board
            .as_mut()
            .ok_or_else(|| BoardError::GameNotStarted.to_string())?;
        domain_remove_player(board, position).map_err(|e| e.to_string())?;
        board.clone()
    }; // lock を解放してから emit

    let _ = app.emit(BOARD_UPDATED, &result);
    Ok(result)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::domain::board::{start_game, GameSettings};
    use crate::domain::card::{Card, CardValue, Suit};
    use crate::state::InnerState;

    #[test]
    fn calculate_initial_stack_uses_average_when_players_exist() {
        let settings = GameSettings {
            small_blind: 50,
            big_blind: 100,
            min_chip: 50,
            bb_ante: false,
        };
        let names = vec!["Alice".into(), "Bob".into()];
        let mut board = start_game(settings, names, 0).unwrap();
        board.phase = crate::domain::board::Phase::Showdown;

        board.players[0].stack = 3000;
        board.players[1].stack = 1000;
        // average = (3000 + 1000) / 2 = 2000
        let stack = calculate_initial_stack(&board, 100);
        assert_eq!(stack, 2000);
    }

    #[test]
    fn calculate_initial_stack_uses_fallback_when_no_players() {
        let settings = GameSettings {
            small_blind: 50,
            big_blind: 100,
            min_chip: 50,
            bb_ante: false,
        };
        let names = vec!["Alice".into(), "Bob".into()];
        let mut board = start_game(settings, names, 0).unwrap();
        board.phase = crate::domain::board::Phase::Showdown;
        board.players.clear();

        // fallback: big_blind * 100 = 100 * 100 = 10000
        let stack = calculate_initial_stack(&board, 100);
        assert_eq!(stack, 10000);
    }

    #[test]
    fn history_snapshot_tuple_contains_burn_fields() {
        // history の各要素が (TexasHoldemBoard, Vec<Card>, u8, Option<Card>) の 4-tuple であることを確認
        let settings = GameSettings {
            small_blind: 50,
            big_blind: 100,
            min_chip: 50,
            bb_ante: false,
        };
        let names = vec!["Alice".into(), "Bob".into()];
        let board = start_game(settings, names, 0).unwrap();
        let deck = build_remaining_deck(&board);
        let burn_card = Card::new(Suit::Spade, CardValue::Ace);

        let mut state = InnerState::default();
        state.board = Some(board.clone());
        state.deck = deck.clone();
        state.burn_count = 2;
        state.burn_card = Some(burn_card);

        // スナップショットを push
        let snap = (board, deck, state.burn_count, state.burn_card);
        state.history.push(snap);

        assert_eq!(state.history.len(), 1);
        let (_, _, snapped_count, snapped_card) = &state.history[0];
        assert_eq!(*snapped_count, 2);
        assert!(snapped_card.is_some());
    }

    #[test]
    fn back_board_restores_burn_count_and_burn_card() {
        let settings = GameSettings {
            small_blind: 50,
            big_blind: 100,
            min_chip: 50,
            bb_ante: false,
        };
        let names = vec!["Alice".into(), "Bob".into()];
        let board = start_game(settings, names, 0).unwrap();
        let deck = build_remaining_deck(&board);
        let burn_card = Card::new(Suit::Heart, CardValue::King);

        let mut state = InnerState::default();
        state.board = Some(board.clone());
        state.deck = deck.clone();

        // back_board で復元されるべき値を history に push
        state.history.push((board.clone(), deck.clone(), 3, Some(burn_card)));

        // 現在の burn_count / burn_card を別の値にしておく
        state.burn_count = 0;
        state.burn_card = None;

        // back_board 相当の復元処理
        let (prev_board, prev_deck, prev_burn_count, prev_burn_card) =
            state.history.pop().unwrap();
        state.board = Some(prev_board);
        state.deck = prev_deck;
        state.burn_count = prev_burn_count;
        state.burn_card = prev_burn_card;

        assert_eq!(state.burn_count, 3);
        assert!(state.burn_card.is_some());
        let restored = state.burn_card.unwrap();
        assert_eq!(restored.suit, Suit::Heart);
        assert_eq!(restored.value, CardValue::King);
        assert!(state.history.is_empty());
    }
}

//! ボード操作に関する Tauri commands。

use crate::domain::board::{
    add_player as domain_add_player, build_remaining_deck,
    evaluate_player_hand as domain_evaluate_player_hand, next_game,
    remove_player as domain_remove_player, set_community_card as domain_set_community_card,
    start_game as domain_start_game, update_player as domain_update_player, GameSettings,
    TexasHoldemBoard, TexasHoldemInitialBoard,
};
use crate::domain::card::Card;
use crate::domain::hand::EvaluatedHand;
use crate::error::BoardError;
use crate::events::{BOARD_UPDATED, INITIAL_BOARD_UPDATED};
use crate::state::{AppState, MAX_HISTORY};
use tauri::{AppHandle, Emitter, State};

#[tauri::command]
pub fn get_board(state: State<'_, AppState>) -> Option<TexasHoldemBoard> {
    state.lock().board.clone()
}

#[tauri::command]
pub fn get_initial_board(state: State<'_, AppState>) -> Option<TexasHoldemInitialBoard> {
    state.lock().initial_board.clone()
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
    let initial_board = TexasHoldemInitialBoard::from_board(&board, settings.clone());

    {
        let mut inner = state.lock();
        inner.settings = settings;
        inner.history.clear();
        inner.board = Some(board.clone());
        inner.initial_board = Some(initial_board.clone());
        inner.deck = deck;
        inner.burn_count = 0;
        inner.burn_card = None;
        inner.event_history.clear();
    } // lock を解放してから emit

    let _ = app.emit(BOARD_UPDATED, &board);
    let _ = app.emit(INITIAL_BOARD_UPDATED, &initial_board);
    Ok(board)
}

#[tauri::command]
pub fn move_next_game(
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<TexasHoldemBoard, String> {
    let (board, initial_board) = {
        let mut inner = state.lock();
        let prev = inner
            .board
            .as_ref()
            .ok_or_else(|| BoardError::GameNotStarted.to_string())?
            .clone();
        let settings = inner.settings.clone();

        let (board, deck) = next_game(&prev, &settings).map_err(|e| e.to_string())?;
        let initial_board = TexasHoldemInitialBoard::from_board(&board, settings);

        inner.history.clear();
        inner.board = Some(board.clone());
        inner.initial_board = Some(initial_board.clone());
        inner.deck = deck;
        inner.burn_count = 0;
        inner.burn_card = None;
        inner.event_history.clear();

        (board, initial_board)
    }; // lock を解放してから emit

    let _ = app.emit(BOARD_UPDATED, &board);
    let _ = app.emit(INITIAL_BOARD_UPDATED, &initial_board);
    Ok(board)
}

#[tauri::command]
pub fn reset_board(app: AppHandle, state: State<'_, AppState>) -> Result<(), String> {
    {
        let mut inner = state.lock();
        inner.board = None;
        inner.initial_board = None;
        inner.deck.clear();
        inner.history.clear();
        inner.burn_count = 0;
        inner.burn_card = None;
        inner.event_history.clear();
    } // lock を解放してから emit

    let _ = app.emit(BOARD_UPDATED, Option::<TexasHoldemBoard>::None);
    let _ = app.emit(
        INITIAL_BOARD_UPDATED,
        Option::<TexasHoldemInitialBoard>::None,
    );
    Ok(())
}

#[tauri::command]
pub fn back_board(app: AppHandle, state: State<'_, AppState>) -> Result<TexasHoldemBoard, String> {
    let (prev_board, initial_board) = {
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

        (prev_board, inner.initial_board.clone())
    }; // lock を解放してから emit

    let _ = app.emit(BOARD_UPDATED, &prev_board);
    let _ = app.emit(INITIAL_BOARD_UPDATED, &initial_board);
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
            inner
                .history
                .push((board_snap, deck_snap, burn_count_snap, burn_card_snap));
            if inner.history.len() > MAX_HISTORY {
                let excess = inner.history.len() - MAX_HISTORY;
                inner.history.drain(0..excess);
            }
        }

        // board と deck を取り出して mut 参照を渡す
        let set_result = {
            let (board_ref, deck_ref) = inner
                .split_board_and_deck()
                .ok_or_else(|| BoardError::GameNotStarted.to_string())?;
            let r = domain_set_community_card(board_ref, locate_number, card, deck_ref);
            r.map(|_| board_ref.clone())
        };

        if set_result.is_err() {
            inner.history.pop(); // エラー時はスナップショットをロールバック
        }
        set_result.map_err(|e| e.to_string())?
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

        let update_result = {
            let board = inner
                .board
                .as_mut()
                .ok_or_else(|| BoardError::GameNotStarted.to_string())?;
            domain_update_player(board, position, name, stack)
                .map_err(|e| e.to_string())
                .map(|_| board.clone())
        };

        if update_result.is_err() {
            inner.history.pop(); // エラー時はスナップショットをロールバック
        }
        update_result?
    }; // lock を解放してから emit

    let _ = app.emit(BOARD_UPDATED, &result);
    Ok(result)
}

fn calculate_initial_stack(board: &TexasHoldemBoard, fallback_big_blind: u32) -> u32 {
    if board.players.is_empty() {
        fallback_big_blind.saturating_mul(100)
    } else {
        let total: u32 = board
            .players
            .iter()
            .fold(0u32, |acc, p| acc.saturating_add(p.stack));
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
    use crate::state::{InnerState, MAX_HISTORY};

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

        let mut state = InnerState {
            board: Some(board.clone()),
            deck: deck.clone(),
            burn_count: 2,
            burn_card: Some(burn_card),
            ..Default::default()
        };

        // スナップショットを push
        let snap = (board, deck, state.burn_count, state.burn_card);
        state.history.push(snap);

        assert_eq!(state.history.len(), 1);
        let (_, _, snapped_count, snapped_card) = &state.history[0];
        assert_eq!(*snapped_count, 2);
        assert!(snapped_card.is_some());
    }

    #[test]
    fn history_does_not_exceed_max_history_limit() {
        let settings = GameSettings {
            small_blind: 50,
            big_blind: 100,
            min_chip: 50,
            bb_ante: false,
        };
        let names = vec!["Alice".into(), "Bob".into()];
        let board = start_game(settings, names, 0).unwrap();
        let deck = build_remaining_deck(&board);

        let mut state = InnerState {
            board: Some(board.clone()),
            deck: deck.clone(),
            ..Default::default()
        };

        // MAX_HISTORY + 5 件 push して上限を超えることをシミュレート
        for _ in 0..MAX_HISTORY + 5 {
            state.history.push((board.clone(), deck.clone(), 0, None));
            if state.history.len() > MAX_HISTORY {
                let excess = state.history.len() - MAX_HISTORY;
                state.history.drain(0..excess);
            }
        }

        assert_eq!(state.history.len(), MAX_HISTORY);
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

        let mut state = InnerState {
            board: Some(board.clone()),
            deck: deck.clone(),
            ..Default::default()
        };

        // back_board で復元されるべき値を history に push
        state
            .history
            .push((board.clone(), deck.clone(), 3, Some(burn_card)));

        // 現在の burn_count / burn_card を別の値にしておく
        state.burn_count = 0;
        state.burn_card = None;

        // back_board 相当の復元処理
        let (prev_board, prev_deck, prev_burn_count, prev_burn_card) = state.history.pop().unwrap();
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

    #[test]
    fn move_next_game_updates_initial_board() {
        // move_next_game 相当のロジックで initial_board が更新されることを確認
        use crate::domain::board::next_game;

        let settings = GameSettings {
            small_blind: 50,
            big_blind: 100,
            min_chip: 50,
            bb_ante: false,
        };
        let names = vec!["Alice".into(), "Bob".into()];
        let first_board = start_game(settings.clone(), names, 0).unwrap();
        let first_deck = build_remaining_deck(&first_board);
        let first_initial_board =
            TexasHoldemInitialBoard::from_board(&first_board, settings.clone());

        let mut state = InnerState {
            board: Some(first_board.clone()),
            deck: first_deck,
            initial_board: Some(first_initial_board.clone()),
            settings: settings.clone(),
            ..Default::default()
        };

        // move_next_game 相当の処理を再現
        let prev = state.board.as_ref().unwrap().clone();
        let (new_board, new_deck) = next_game(&prev, &state.settings).unwrap();
        let new_initial_board =
            TexasHoldemInitialBoard::from_board(&new_board, state.settings.clone());

        state.history.clear();
        state.board = Some(new_board.clone());
        state.initial_board = Some(new_initial_board.clone());
        state.deck = new_deck;
        state.burn_count = 0;
        state.burn_card = None;
        state.event_history.clear();

        // initial_board が新しい board を反映していること
        let stored = state.initial_board.as_ref().unwrap();
        assert_eq!(stored.dealer_position, new_board.dealer_position);
        // 最初の initial_board とはディーラー位置が異なること（次のゲームにシフト）
        assert_ne!(stored.dealer_position, first_initial_board.dealer_position);
    }

    #[test]
    fn set_community_card_error_does_not_grow_history() {
        let settings = GameSettings {
            small_blind: 50,
            big_blind: 100,
            min_chip: 50,
            bb_ante: false,
        };
        let names = vec!["Alice".into(), "Bob".into()];
        let board = start_game(settings.clone(), names, 0).unwrap();
        let deck = build_remaining_deck(&board);

        let mut inner = InnerState {
            board: Some(board.clone()),
            deck: deck.clone(),
            settings,
            ..Default::default()
        };

        let history_len_before = inner.history.len();

        // set_community_card 相当のロジック: push してからエラー時に pop
        let board_snap = inner.board.as_ref().unwrap().clone();
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

        // locate_number=99 は無効 → エラーになる
        let set_result = {
            let (board_ref, deck_ref) = inner.split_board_and_deck().unwrap();
            let r = domain_set_community_card(
                board_ref,
                99,
                Card::new(Suit::Spade, CardValue::Ace),
                deck_ref,
            );
            r.map(|_| board_ref.clone())
        };

        if set_result.is_err() {
            inner.history.pop();
        }

        assert!(set_result.is_err());
        assert_eq!(inner.history.len(), history_len_before);
    }

    #[test]
    fn calculate_initial_stack_no_overflow_with_large_fallback() {
        let settings = GameSettings {
            small_blind: 50,
            big_blind: 100,
            min_chip: 50,
            bb_ante: false,
        };
        let names = vec!["Alice".into(), "Bob".into()];
        let mut board = start_game(settings, names, 0).unwrap();
        board.players.clear();

        // u32::MAX / 100 + 1 を渡してもパニックしないこと
        let large_bb = u32::MAX / 100 + 1;
        let stack = calculate_initial_stack(&board, large_bb);
        assert_eq!(stack, u32::MAX);
    }

    #[test]
    fn calculate_initial_stack_no_overflow_with_large_player_stacks() {
        let settings = GameSettings {
            small_blind: 50,
            big_blind: 100,
            min_chip: 50,
            bb_ante: false,
        };
        let names = vec!["Alice".into(), "Bob".into()];
        let mut board = start_game(settings, names, 0).unwrap();

        // 全プレイヤーの stack を u32::MAX / 2 にしても合計がラップしないこと
        let large_stack = u32::MAX / 2;
        for p in &mut board.players {
            p.stack = large_stack;
        }
        let stack = calculate_initial_stack(&board, 100);
        assert_eq!(stack, large_stack);
    }

    #[test]
    fn update_player_pushes_snapshot_to_history() {
        let settings = GameSettings {
            small_blind: 50,
            big_blind: 100,
            min_chip: 50,
            bb_ante: false,
        };
        let names = vec!["Alice".into(), "Bob".into()];
        let board = start_game(settings.clone(), names, 0).unwrap();
        let deck = build_remaining_deck(&board);

        let mut inner = InnerState {
            board: Some(board.clone()),
            deck: deck.clone(),
            settings,
            ..Default::default()
        };

        assert_eq!(inner.history.len(), 0);

        // update_player 相当のロジックを再現: snapshot push → 操作
        let board_snap = inner.board.as_ref().unwrap().clone();
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

        let update_result = {
            let board_ref = inner.board.as_mut().unwrap();
            domain_update_player(board_ref, 0, Some("Charlie".into()), Some(2000))
                .map(|_| board_ref.clone())
        };
        if update_result.is_err() {
            inner.history.pop();
        }

        assert!(update_result.is_ok());
        assert_eq!(inner.history.len(), 1);
        // history に push された snapshot は変更前の名前を持つ
        let (snapped_board, _, _, _) = &inner.history[0];
        assert_eq!(snapped_board.players[0].name, "Alice");
        // 現在の board は変更後の値
        assert_eq!(inner.board.as_ref().unwrap().players[0].name, "Charlie");
        assert_eq!(inner.board.as_ref().unwrap().players[0].stack, 2000);
    }

    #[test]
    fn update_player_error_does_not_grow_history() {
        let settings = GameSettings {
            small_blind: 50,
            big_blind: 100,
            min_chip: 50,
            bb_ante: false,
        };
        let names = vec!["Alice".into(), "Bob".into()];
        let board = start_game(settings.clone(), names, 0).unwrap();
        let deck = build_remaining_deck(&board);

        let mut inner = InnerState {
            board: Some(board.clone()),
            deck: deck.clone(),
            settings,
            ..Default::default()
        };

        let history_len_before = inner.history.len();

        // snapshot push
        let board_snap = inner.board.as_ref().unwrap().clone();
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

        // 空の名前は InvalidAction エラー
        let update_result = {
            let board_ref = inner.board.as_mut().unwrap();
            domain_update_player(board_ref, 0, Some("   ".into()), None).map(|_| board_ref.clone())
        };
        if update_result.is_err() {
            inner.history.pop();
        }

        assert!(update_result.is_err());
        assert_eq!(inner.history.len(), history_len_before);
    }

    #[test]
    fn update_player_snapshot_can_be_restored_by_back_board() {
        let settings = GameSettings {
            small_blind: 50,
            big_blind: 100,
            min_chip: 50,
            bb_ante: false,
        };
        let names = vec!["Alice".into(), "Bob".into()];
        let board = start_game(settings.clone(), names, 0).unwrap();
        let deck = build_remaining_deck(&board);

        let mut inner = InnerState {
            board: Some(board.clone()),
            deck: deck.clone(),
            settings,
            ..Default::default()
        };

        // update_player 相当: snapshot push → 操作
        let board_snap = inner.board.as_ref().unwrap().clone();
        let deck_snap = inner.deck.clone();
        let burn_count_snap = inner.burn_count;
        let burn_card_snap = inner.burn_card;
        inner
            .history
            .push((board_snap, deck_snap, burn_count_snap, burn_card_snap));

        {
            let board_ref = inner.board.as_mut().unwrap();
            domain_update_player(board_ref, 0, Some("Charlie".into()), Some(9999)).unwrap();
        }
        assert_eq!(inner.board.as_ref().unwrap().players[0].name, "Charlie");
        assert_eq!(inner.board.as_ref().unwrap().players[0].stack, 9999);

        // back_board 相当: history から復元
        let (prev_board, prev_deck, prev_burn_count, prev_burn_card) = inner.history.pop().unwrap();
        inner.board = Some(prev_board);
        inner.deck = prev_deck;
        inner.burn_count = prev_burn_count;
        inner.burn_card = prev_burn_card;

        // update_player 前の状態に戻っていること
        assert_eq!(inner.board.as_ref().unwrap().players[0].name, "Alice");
        assert!(inner.history.is_empty());
    }
}

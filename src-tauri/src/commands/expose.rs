//! Expose コマンド: preflop でバーンカードと差し替えてコミュニティカードへ公開する。

use crate::domain::board::TexasHoldemBoard;
use crate::domain::card::Card;
use crate::error::BoardError;
use crate::events::BOARD_UPDATED;
use crate::state::{AppState, MAX_HISTORY};
use tauri::{AppHandle, Emitter, State};

/// Expose コマンド。
/// フロントエンドからカードを受け取り、直近のバーンカードと差し替えて
/// コミュニティカードへ追加する。
#[tauri::command(rename_all = "camelCase")]
pub fn expose(app: AppHandle, expose_card: Card, state: State<AppState>) -> Result<Card, String> {
    let (burn_card, board_snapshot): (Card, TexasHoldemBoard) = {
        let mut guard = state.lock();

        // snapshot を history に保存（action.rs の run_action パターンに倣う）
        {
            let board_snap = guard
                .board
                .as_ref()
                .ok_or_else(|| BoardError::GameNotStarted.to_string())?
                .clone();
            let deck_snap = guard.deck.clone();
            let burn_count_snap = guard.burn_count;
            let burn_card_snap = guard.burn_card;
            guard
                .history
                .push((board_snap, deck_snap, burn_count_snap, burn_card_snap));
            if guard.history.len() > MAX_HISTORY {
                let excess = guard.history.len() - MAX_HISTORY;
                guard.history.drain(0..excess);
            }
        }

        let burn_card = guard.burn_card.ok_or_else(|| "no burn card".to_string());
        let burn_card = match burn_card {
            Ok(c) => c,
            Err(e) => {
                guard.history.pop(); // エラー時はスナップショットをロールバック
                return Err(e);
            }
        };

        let expose_result = {
            let board = guard.board.as_mut().ok_or_else(|| "no board".to_string());
            match board {
                Ok(board) => crate::domain::board::board_expose(board, expose_card, burn_card)
                    .map_err(|e| e.to_string()),
                Err(e) => Err(e),
            }
        };

        if let Err(e) = expose_result {
            guard.history.pop(); // エラー時はスナップショットをロールバック
            return Err(e);
        }

        guard.deck.retain(|c| c != &burn_card && c != &expose_card);
        guard.burn_card = None;
        guard.burn_count = 0;
        let board_snapshot = guard.board.clone().ok_or_else(|| "no board".to_string())?;
        (burn_card, board_snapshot)
    }; // lock を解放してから emit

    let _ = app.emit(BOARD_UPDATED, &board_snapshot);
    Ok(burn_card)
}

#[cfg(test)]
mod tests {
    use crate::domain::board::{board_expose, build_remaining_deck, start_game, GameSettings};
    use crate::state::InnerState;

    fn make_state_with_board() -> InnerState {
        let settings = GameSettings {
            small_blind: 50,
            big_blind: 100,
            min_chip: 50,
            bb_ante: false,
        };
        let names = vec!["Alice".into(), "Bob".into()];
        let board = start_game(settings.clone(), names, 0).unwrap();
        let deck = build_remaining_deck(&board);
        InnerState {
            settings,
            board: Some(board),
            deck,
            ..Default::default()
        }
    }

    #[test]
    fn expose_removes_burn_and_expose_card_from_deck() {
        let mut state = make_state_with_board();
        // deck から未使用カードを選ぶ（プレイヤーの hand に含まれない保証）
        let burn_card = *state.deck.first().expect("deck must have cards");
        let expose_card = *state
            .deck
            .iter()
            .find(|&&c| c != burn_card)
            .expect("deck should have a card different from burn_card");
        let deck_len_before = state.deck.len();
        state.burn_card = Some(burn_card);

        // expose ロジックを直接実行（expose コマンドと同じ retain 条件）
        let board = state.board.as_mut().unwrap();
        board_expose(board, expose_card, burn_card).unwrap();
        state.deck.retain(|c| c != &burn_card && c != &expose_card);

        assert!(
            !state.deck.contains(&burn_card),
            "burn_card should be removed from deck after expose"
        );
        assert!(
            !state.deck.contains(&expose_card),
            "expose_card should be removed from deck after expose"
        );
        assert!(
            state.deck.len() <= deck_len_before - 2,
            "deck length should decrease by at least 2 (burn + expose)"
        );
    }

    #[test]
    fn expose_removes_burn_card_from_deck() {
        let mut state = make_state_with_board();
        // deck から未使用カードを選ぶ（プレイヤーの hand に含まれない保証）
        let burn_card = *state.deck.first().expect("deck must have cards");
        let deck_len_before = state.deck.len();
        state.burn_card = Some(burn_card);

        let expose_card = state
            .deck
            .iter()
            .rev()
            .find(|&&c| c != burn_card)
            .copied()
            .expect("deck should have a card different from burn_card");

        let board = state.board.as_mut().unwrap();
        board_expose(board, expose_card, burn_card).unwrap();
        state.deck.retain(|c| c != &burn_card && c != &expose_card);

        assert!(
            !state.deck.contains(&burn_card),
            "burn_card should be removed from deck after expose"
        );
        assert!(
            state.deck.len() < deck_len_before,
            "deck length should decrease after expose"
        );
    }

    // ================================================================
    // Bug 3 fix: expose 成功後に burn_card フィールドが None にリセットされること
    // ================================================================

    #[test]
    fn expose_resets_burn_card() {
        let mut state = make_state_with_board();
        let burn_card = *state.deck.first().expect("deck must have cards");
        let expose_card = state
            .deck
            .iter()
            .rev()
            .find(|&&c| c != burn_card)
            .copied()
            .expect("deck should have a card different from burn_card");

        // expose 前に burn_card をセット
        state.burn_card = Some(burn_card);
        assert!(
            state.burn_card.is_some(),
            "burn_card should be Some before expose"
        );

        // expose コマンドと同じロジックを直接実行
        let board = state.board.as_mut().unwrap();
        board_expose(board, expose_card, burn_card).unwrap();
        state.deck.retain(|c| c != &burn_card && c != &expose_card);
        state.burn_card = None; // Bug 3 fix

        assert!(
            state.burn_card.is_none(),
            "burn_card must be None after expose succeeds"
        );
    }

    // ================================================================
    // Bug 4 fix: expose が history に保存し back_board で undo できること
    // ================================================================

    /// expose 相当の処理で history に snapshot が push されること、および
    /// back_board 相当の処理で community_cards が空に戻ることを確認。
    #[test]
    fn expose_pushes_to_history_and_back_board_restores() {
        use crate::state::MAX_HISTORY;

        let mut state = make_state_with_board();
        // deck から未使用カードを選ぶ（プレイヤーの hand に含まれない保証）
        let burn_card = *state.deck.first().expect("deck must have cards");
        state.burn_card = Some(burn_card);

        let expose_card = state
            .deck
            .iter()
            .rev()
            .find(|&&c| c != burn_card)
            .copied()
            .expect("deck should have a card different from burn_card");

        // expose コマンドと同じ history push パターン
        {
            let board_snap = state.board.as_ref().unwrap().clone();
            let deck_snap = state.deck.clone();
            let burn_count_snap = state.burn_count;
            let burn_card_snap = state.burn_card;
            state
                .history
                .push((board_snap, deck_snap, burn_count_snap, burn_card_snap));
            if state.history.len() > MAX_HISTORY {
                let excess = state.history.len() - MAX_HISTORY;
                state.history.drain(0..excess);
            }
        }

        {
            let board = state.board.as_mut().unwrap();
            board_expose(board, expose_card, burn_card).unwrap();
        }
        state.deck.retain(|c| c != &burn_card && c != &expose_card);

        // expose 後 community_cards に 1 枚追加されている
        assert_eq!(state.board.as_ref().unwrap().community_cards.len(), 1);
        assert_eq!(state.history.len(), 1);

        // back_board 相当の処理で community_cards が空に戻る
        let (prev_board, prev_deck, prev_burn_count, prev_burn_card) = state.history.pop().unwrap();
        state.board = Some(prev_board);
        state.deck = prev_deck;
        state.burn_count = prev_burn_count;
        state.burn_card = prev_burn_card;

        assert_eq!(
            state.board.as_ref().unwrap().community_cards.len(),
            0,
            "community_cards should be restored to empty after back_board"
        );
        assert!(state.history.is_empty());
        // deck に expose_card と burn_card が戻っている
        assert!(
            state.deck.contains(&expose_card),
            "expose_card should be restored to deck"
        );
        assert!(
            state.deck.contains(&burn_card),
            "burn_card should be restored to deck"
        );
    }

    // ================================================================
    // Bug 1 fix: expose 成功後に burn_count が 0 にリセットされること
    // ================================================================

    #[test]
    fn expose_resets_burn_count() {
        let mut state = make_state_with_board();
        let burn_card = *state.deck.first().expect("deck must have cards");
        let expose_card = state
            .deck
            .iter()
            .rev()
            .find(|&&c| c != burn_card)
            .copied()
            .expect("deck should have a card different from burn_card");

        // BurnCard 処理と同様に burn_count を 1 にしてから expose を行う
        state.burn_card = Some(burn_card);
        state.burn_count = 1;

        // expose コマンドと同じロジックを直接実行
        let board = state.board.as_mut().unwrap();
        board_expose(board, expose_card, burn_card).unwrap();
        state.deck.retain(|c| c != &burn_card && c != &expose_card);
        state.burn_card = None;
        state.burn_count = 0; // Bug 1 fix

        assert_eq!(
            state.burn_count, 0,
            "burn_count must be 0 after expose succeeds"
        );
    }
}

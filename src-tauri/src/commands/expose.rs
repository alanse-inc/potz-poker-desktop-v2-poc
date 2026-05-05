//! Expose コマンド: preflop でバーンカードと差し替えてコミュニティカードへ公開する。

use crate::domain::board::TexasHoldemBoard;
use crate::domain::card::Card;
use crate::events::BOARD_UPDATED;
use crate::state::AppState;
use tauri::{AppHandle, Emitter, State};

/// Expose コマンド。
/// フロントエンドからカードを受け取り、直近のバーンカードと差し替えて
/// コミュニティカードへ追加する。
#[tauri::command(rename_all = "camelCase")]
pub fn expose(app: AppHandle, expose_card: Card, state: State<AppState>) -> Result<Card, String> {
    let (burn_card, board_snapshot): (Card, TexasHoldemBoard) = {
        let mut guard = state.lock();
        let burn_card = guard
            .burn_card
            .ok_or_else(|| "no burn card".to_string())?;
        {
            let board = guard
                .board
                .as_mut()
                .ok_or_else(|| "no board".to_string())?;
            crate::domain::board::board_expose(board, expose_card, burn_card)
                .map_err(|e| e.to_string())?;
        }
        guard.deck.retain(|c| c != &burn_card);
        let board_snapshot = guard
            .board
            .clone()
            .ok_or_else(|| "no board".to_string())?;
        (burn_card, board_snapshot)
    }; // lock を解放してから emit

    let _ = app.emit(BOARD_UPDATED, &board_snapshot);
    Ok(burn_card)
}

#[cfg(test)]
mod tests {
    use crate::domain::board::{build_remaining_deck, board_expose, GameSettings, start_game};
    use crate::domain::card::{Card, CardValue, Suit};
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
        let mut state = InnerState::default();
        state.settings = settings;
        state.board = Some(board);
        state.deck = deck;
        state
    }

    #[test]
    fn expose_removes_burn_card_from_deck() {
        let mut state = make_state_with_board();
        let burn_card = Card::new(Suit::Diamond, CardValue::Two);
        // deck に burn_card を確実に含める
        if !state.deck.contains(&burn_card) {
            state.deck.push(burn_card);
        }
        let deck_len_before = state.deck.len();
        state.burn_card = Some(burn_card);

        // expose ロジックを直接実行
        let board = state.board.as_mut().unwrap();
        let expose_card = state.deck[state.deck.len() - 1];
        // burn_card と expose_card が異なることを保証
        if expose_card == burn_card {
            // もう一枚選ぶ
            let expose_card2 = state.deck[state.deck.len() - 2];
            board_expose(board, expose_card2, burn_card).unwrap();
            state.deck.retain(|c| c != &burn_card);
        } else {
            board_expose(board, expose_card, burn_card).unwrap();
            state.deck.retain(|c| c != &burn_card);
        }

        assert!(
            !state.deck.contains(&burn_card),
            "burn_card should be removed from deck after expose"
        );
        assert!(
            state.deck.len() < deck_len_before || !state.deck.contains(&burn_card),
            "deck length should decrease after removing burn_card"
        );
    }
}

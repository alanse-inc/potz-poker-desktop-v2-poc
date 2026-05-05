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
        let burn_card = guard.burn_card.ok_or_else(|| "no burn card".to_string())?;
        {
            let board = guard.board.as_mut().ok_or_else(|| "no board".to_string())?;
            crate::domain::board::board_expose(board, expose_card, burn_card)
                .map_err(|e| e.to_string())?;
        }
        guard.deck.retain(|c| c != &burn_card && c != &expose_card);
        let board_snapshot = guard.board.clone().ok_or_else(|| "no board".to_string())?;
        (burn_card, board_snapshot)
    }; // lock を解放してから emit

    let _ = app.emit(BOARD_UPDATED, &board_snapshot);
    Ok(burn_card)
}

#[cfg(test)]
mod tests {
    use crate::domain::board::{board_expose, build_remaining_deck, start_game, GameSettings};
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
        let burn_card = Card::new(Suit::Diamond, CardValue::Two);
        // deck に burn_card と expose_card を確実に含める
        if !state.deck.contains(&burn_card) {
            state.deck.push(burn_card);
        }
        let expose_card = Card::new(Suit::Heart, CardValue::Three);
        if !state.deck.contains(&expose_card) {
            state.deck.push(expose_card);
        }
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
        let burn_card = Card::new(Suit::Diamond, CardValue::Two);
        // deck に burn_card を確実に含める
        if !state.deck.contains(&burn_card) {
            state.deck.push(burn_card);
        }
        let deck_len_before = state.deck.len();
        state.burn_card = Some(burn_card);

        // deck の末尾から burn_card と異なるカードを expose_card として選ぶ
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
}

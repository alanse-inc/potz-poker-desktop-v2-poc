//! デバッグ用 Tauri コマンド。
//!
//! RFID リーダーがない開発環境でゲームを進められるよう、
//! 仮想的にカードを割り当てるコマンドを提供する。
//!
//! `cfg!(debug_assertions)` によりデバッグビルドのみで有効化する。
//! リリースビルドでは全コマンドが no-op (Err("debug only")) になる。

use crate::domain::card::Card;
use crate::domain::card_distribution::CardPosition;
use crate::state::AppState;
use tauri::{AppHandle, State};

/// 現在のデッキからランダムに 1 枚選び、次に配るべき位置に割り当てる。
///
/// `determine_next_card_position` でボードの状態から次のスロットを判定し、
/// デッキの残りカードからランダムに選択して `apply_card_placed` と同じ経路で反映する。
///
/// リリースビルド (`cfg!(debug_assertions)` が false) では `Err("debug only")` を返す。
#[tauri::command]
pub fn debug_assign_random_card(app: AppHandle, state: State<'_, AppState>) -> Result<(), String> {
    if !cfg!(debug_assertions) {
        return Err("debug only".to_string());
    }

    use crate::commands::serial::apply_card_placed;
    use crate::domain::card_distribution::determine_next_card_position;
    use rand::seq::SliceRandom;

    // board / burn_count / deck を lock の外にクローンする (lock 保持中の apply_card_placed 呼び出しを避ける)
    let (board, burn_count, deck) = {
        let guard = state.lock();
        let board = guard
            .board
            .clone()
            .ok_or_else(|| "no active board".to_string())?;
        let burn_count = guard.burn_count;
        let deck = guard.deck.clone();
        (board, burn_count, deck)
    };

    // 次に配るべきポジションを決定する
    let position = determine_next_card_position(&board, burn_count)
        .map_err(|e| format!("cannot determine next card position: {}", e))?;

    // デッキからランダムに 1 枚選ぶ
    let card = deck
        .choose(&mut rand::thread_rng())
        .copied()
        .ok_or_else(|| "deck is empty".to_string())?;

    let debug_rfid = format!(
        "DEBUG_{}_{}_{}",
        format!("{:?}", card.suit).to_uppercase(),
        card.value,
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis()
    );

    // apply_card_placed と同じ経路で state に反映する
    apply_card_placed(app, debug_rfid, card, position, state)
}

/// 指定したカードを指定したポジションに割り当てる（debug build 向けの薄いラッパー）。
///
/// フロントエンドの「手動カード配布」UI から呼ばれる。
/// 内部的には `apply_card_placed` を直接呼ぶ。
///
/// リリースビルドでは `Err("debug only")` を返す。
#[tauri::command]
pub fn debug_assign_card(
    app: AppHandle,
    card: Card,
    position: CardPosition,
    rfid: Option<String>,
    state: State<'_, AppState>,
) -> Result<(), String> {
    if !cfg!(debug_assertions) {
        return Err("debug only".to_string());
    }

    use crate::commands::serial::apply_card_placed;

    let effective_rfid = rfid.unwrap_or_else(|| {
        format!(
            "DEBUG_{}_{}",
            format!("{:?}", card.suit).to_uppercase(),
            card.value
        )
    });

    apply_card_placed(app, effective_rfid, card, position, state)
}

// ---------------------------------------------------------------------------
// テスト
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use crate::domain::board::{start_game, GameSettings};
    use crate::domain::card::{full_deck, Card, CardValue, Suit};
    use crate::domain::card_distribution::{determine_next_card_position, CardPosition};
    use crate::state::InnerState;
    use rand::seq::SliceRandom;

    fn make_state_with_board() -> InnerState {
        let settings = GameSettings {
            small_blind: 50,
            big_blind: 100,
            min_chip: 50,
            bb_ante: false,
        };
        let names = vec!["Alice".into(), "Bob".into(), "Carol".into()];
        let mut board = start_game(settings.clone(), names, 0).unwrap();
        for p in &mut board.players {
            p.hand = None;
        }
        let deck = full_deck();
        InnerState {
            settings,
            board: Some(board),
            deck,
            ..Default::default()
        }
    }

    /// デッキが空の場合、choose は None を返すこと。
    #[test]
    fn empty_deck_yields_no_card() {
        let mut state = make_state_with_board();
        state.deck.clear();

        let chosen: Option<&Card> = state.deck.choose(&mut rand::thread_rng());
        assert!(chosen.is_none(), "empty deck must yield None");
    }

    /// デッキにカードがある場合、次のpositionが PlayerHand になること。
    #[test]
    fn non_empty_deck_determines_player_hand_position() {
        let state = make_state_with_board();
        let board = state.board.as_ref().unwrap();

        let pos = determine_next_card_position(board, state.burn_count).unwrap();
        assert!(
            matches!(pos, CardPosition::PlayerHand { .. }),
            "first card should go to a player, got {:?}",
            pos
        );
    }

    /// debug_assign_card の rfid=None のとき自動採番文字列が生成されること。
    #[test]
    fn auto_rfid_format_contains_suit_and_value() {
        let card = Card::new(Suit::Spade, CardValue::Ace);
        let auto_rfid = format!(
            "DEBUG_{}_{}",
            format!("{:?}", card.suit).to_uppercase(),
            card.value
        );
        assert!(
            auto_rfid.starts_with("DEBUG_"),
            "auto rfid should start with DEBUG_"
        );
        assert!(
            auto_rfid.contains("SPADE"),
            "auto rfid should contain SPADE"
        );
        assert!(auto_rfid.ends_with('A'), "auto rfid should end with A");
    }

    /// CardPosition が serde でシリアライズ/デシリアライズできること。
    #[test]
    fn card_position_serde_roundtrip() {
        let positions = vec![
            CardPosition::PlayerHand { seat: 0 },
            CardPosition::PlayerHand { seat: 7 },
            CardPosition::CommunityCard { slot: 0 },
            CardPosition::CommunityCard { slot: 4 },
            CardPosition::BurnCard,
        ];

        for pos in positions {
            let json = serde_json::to_string(&pos).unwrap();
            let back: CardPosition = serde_json::from_str(&json).unwrap();
            assert_eq!(pos, back, "serde roundtrip failed for {:?}", pos);
        }
    }
}

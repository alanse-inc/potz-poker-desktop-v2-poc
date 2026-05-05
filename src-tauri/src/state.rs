//! グローバルアプリケーション状態。Arc<Mutex<InnerState>> で管理する。

use crate::domain::board::{GameSettings, TexasHoldemBoard, TexasHoldemInitialBoard};
use crate::domain::card::Card;
use crate::domain::rfid_mapping::RfidCardMapping;
use parking_lot::Mutex;
use serde::{Deserialize, Serialize};
use std::collections::VecDeque;

/// history Vec に保持するスナップショット数の上限。
/// push 後にこの値を超えた場合は古いエントリを先入れ先出しで削除する。
pub const MAX_HISTORY: usize = 50;

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct TelopState {
    pub message: String,
    pub color: String,
    /// テロップ表示テンプレート種別 ("modern" / "classic" / "broadcast" / "basic")。
    pub mode: String,
}

pub struct InnerState {
    pub board: Option<TexasHoldemBoard>,
    /// `start_game` 時に保存するゲーム開始直後のスナップショット。
    /// `get_initial_board` コマンドで返す。`reset_board` 時に None にリセット。
    pub initial_board: Option<TexasHoldemInitialBoard>,
    /// board に対応するデッキ（community cards 配布用）。
    pub deck: Vec<Card>,
    pub settings: GameSettings,
    pub telop_color: String,
    pub telop_message: String,
    pub history: Vec<(TexasHoldemBoard, Vec<Card>, u8, Option<Card>)>,
    /// 複数デッキ管理。
    pub decks: Vec<RfidCardMapping>,
    /// 現在選択中のデッキ ID。
    pub current_deck_id: Option<String>,
    /// 配布済みバーンカード枚数。
    pub burn_count: u8,
    /// 直近のバーンカード（Expose 機能で使用）。
    pub burn_card: Option<Card>,
    /// 受信イベント履歴（重複検知用）。
    pub event_history: VecDeque<String>,
    /// RFID 登録モードフラグ。
    pub register_mode: bool,
    /// シリアルポート接続状態。
    pub serial_connected: bool,
    /// 接続中のシリアルポート名。
    pub serial_port_name: Option<String>,
    /// テロップ表示テンプレート種別。
    pub telop_id: String,
    /// テロップ背景色。
    pub telop_background_color: String,
    /// テロップ現在画面状態。
    pub telop_current_screen: Option<String>,
}

impl InnerState {
    pub fn telop_state(&self) -> TelopState {
        TelopState {
            message: self.telop_message.clone(),
            color: self.telop_color.clone(),
            mode: self.telop_id.clone(),
        }
    }

    /// 現在選択中のデッキへの参照を返す。
    pub fn current_deck(&self) -> Option<&RfidCardMapping> {
        let id = self.current_deck_id.as_ref()?;
        self.decks.iter().find(|d| &d.id == id)
    }

    /// 現在選択中のデッキへの可変参照を返す。
    pub fn current_deck_mut(&mut self) -> Option<&mut RfidCardMapping> {
        let id = self.current_deck_id.clone()?;
        self.decks.iter_mut().find(|d| d.id == id)
    }

    /// `board` と `deck` への独立した可変参照を同時に取り出す。
    /// `board` が `None` の場合は `None` を返す。
    pub fn split_board_and_deck(&mut self) -> Option<(&mut TexasHoldemBoard, &mut Vec<Card>)> {
        let board = self.board.as_mut()?;
        Some((board, &mut self.deck))
    }
}

impl Default for InnerState {
    fn default() -> Self {
        Self {
            board: None,
            initial_board: None,
            deck: Vec::new(),
            settings: GameSettings::default(),
            telop_color: "#1a1a2e".to_string(),
            telop_message: String::new(),
            history: Vec::new(),
            decks: vec![],
            current_deck_id: None,
            burn_count: 0,
            burn_card: None,
            event_history: VecDeque::new(),
            register_mode: false,
            serial_connected: false,
            serial_port_name: None,
            telop_id: "modern".to_string(),
            telop_background_color: "#00ff00".to_string(),
            telop_current_screen: None,
        }
    }
}

pub type AppState = Mutex<InnerState>;

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::Arc;

    #[test]
    fn telop_state_includes_mode_from_telop_id() {
        let state = InnerState::default();
        let telop_state = state.telop_state();
        assert_eq!(telop_state.mode, "modern");
    }

    #[test]
    fn telop_state_mode_reflects_changed_telop_id() {
        let state = InnerState {
            telop_id: "classic".to_string(),
            ..InnerState::default()
        };
        let telop_state = state.telop_state();
        assert_eq!(telop_state.mode, "classic");
    }

    #[test]
    fn concurrent_access_does_not_panic() {
        let state = Arc::new(AppState::new(InnerState::default()));
        let handles: Vec<_> = (0..8)
            .map(|_| {
                let s = Arc::clone(&state);
                std::thread::spawn(move || {
                    let guard = s.lock();
                    let _ = guard.settings.big_blind;
                })
            })
            .collect();
        for h in handles {
            h.join().unwrap();
        }
    }

    #[test]
    fn current_deck_none_when_no_decks() {
        let state = InnerState::default();
        assert!(state.current_deck().is_none());
    }

    #[test]
    fn current_deck_some_returns_correct_deck() {
        let mut state = InnerState::default();
        let deck = RfidCardMapping::new("deck-1", "Deck 1");
        state.decks.push(deck.clone());
        state.current_deck_id = Some("deck-1".to_string());
        let result = state.current_deck();
        assert!(result.is_some());
        assert_eq!(result.unwrap().id, "deck-1");
        assert_eq!(result.unwrap().name, "Deck 1");
    }

    #[test]
    fn current_deck_mut_allows_modification() {
        let mut state = InnerState::default();
        let deck = RfidCardMapping::new("deck-1", "Old Name");
        state.decks.push(deck);
        state.current_deck_id = Some("deck-1".to_string());
        if let Some(d) = state.current_deck_mut() {
            d.name = "New Name".to_string();
        }
        assert_eq!(state.current_deck().unwrap().name, "New Name");
    }

    #[test]
    fn multiple_decks_returns_correct_one() {
        let mut state = InnerState::default();
        state.decks.push(RfidCardMapping::new("deck-1", "Deck 1"));
        state.decks.push(RfidCardMapping::new("deck-2", "Deck 2"));
        state.decks.push(RfidCardMapping::new("deck-3", "Deck 3"));
        state.current_deck_id = Some("deck-2".to_string());
        let result = state.current_deck();
        assert!(result.is_some());
        assert_eq!(result.unwrap().id, "deck-2");
    }

    #[test]
    fn current_deck_id_not_found_returns_none() {
        let mut state = InnerState::default();
        state.decks.push(RfidCardMapping::new("deck-1", "Deck 1"));
        state.current_deck_id = Some("nonexistent".to_string());
        assert!(state.current_deck().is_none());
    }
}

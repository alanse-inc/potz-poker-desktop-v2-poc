//! グローバルアプリケーション状態。Arc<Mutex<InnerState>> で管理する。

use crate::domain::board::{GameSettings, TexasHoldemBoard};
use crate::domain::card::Card;
use crate::domain::rfid_mapping::RfidCardMapping;
use parking_lot::Mutex;
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct TelopState {
    pub message: String,
    pub color: String,
}

pub struct InnerState {
    pub board: Option<TexasHoldemBoard>,
    /// board に対応するデッキ（community cards 配布用）。
    pub deck: Vec<Card>,
    pub settings: GameSettings,
    pub telop_color: String,
    pub telop_message: String,
    pub history: Vec<(TexasHoldemBoard, Vec<Card>)>,
    /// 複数デッキ管理。
    pub decks: Vec<RfidCardMapping>,
    /// 現在選択中のデッキ ID。
    pub current_deck_id: Option<String>,
    /// 配布済みバーンカード枚数。
    pub burn_count: u8,
    /// 直近のバーンカード（Expose 機能で使用）。
    pub burn_card: Option<Card>,
    /// 受信イベント履歴（重複検知用）。
    pub event_history: Vec<String>,
    /// RFID 登録モードフラグ。
    pub register_mode: bool,
    /// シリアルポート接続状態。
    pub serial_connected: bool,
    /// 接続中のシリアルポート名。
    pub serial_port_name: Option<String>,
}

impl InnerState {
    pub fn telop_state(&self) -> TelopState {
        TelopState {
            message: self.telop_message.clone(),
            color: self.telop_color.clone(),
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
}

impl Default for InnerState {
    fn default() -> Self {
        Self {
            board: None,
            deck: Vec::new(),
            settings: GameSettings::default(),
            telop_color: "#1a1a2e".to_string(),
            telop_message: String::new(),
            history: Vec::new(),
            decks: vec![],
            current_deck_id: None,
            burn_count: 0,
            burn_card: None,
            event_history: Vec::new(),
            register_mode: false,
            serial_connected: false,
            serial_port_name: None,
        }
    }
}

pub type AppState = Mutex<InnerState>;

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::Arc;

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

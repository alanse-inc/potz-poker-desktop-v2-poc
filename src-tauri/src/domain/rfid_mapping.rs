//! RFID UID → Card マッピングのドメインモデル。

use crate::domain::card::Card;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// RFID UID とカードの対応テーブル。
/// `id` はデッキを識別する UUID 文字列、`name` はユーザー定義のデッキ名。
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct RfidCardMapping {
    pub id: String,
    pub name: String,
    /// key: RFID UID (ASCII 14桁), value: Card
    pub cards: HashMap<String, Card>,
}

impl RfidCardMapping {
    pub fn new(id: impl Into<String>, name: impl Into<String>) -> Self {
        Self {
            id: id.into(),
            name: name.into(),
            cards: HashMap::new(),
        }
    }

    /// RFID UID に対応するカードを返す。
    pub fn lookup(&self, rfid: &str) -> Option<Card> {
        self.cards.get(rfid).copied()
    }

    /// RFID UID とカードを登録する（上書きあり）。
    pub fn register(&mut self, rfid: impl Into<String>, card: Card) {
        self.cards.insert(rfid.into(), card);
    }

    /// RFID UID の登録を削除する。
    pub fn unregister(&mut self, rfid: &str) {
        self.cards.remove(rfid);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::domain::card::{CardValue, Suit};

    fn ace_of_spades() -> Card {
        Card::new(Suit::Spade, CardValue::Ace)
    }

    fn two_of_hearts() -> Card {
        Card::new(Suit::Heart, CardValue::Two)
    }

    #[test]
    fn lookup_returns_none_when_empty() {
        let mapping = RfidCardMapping::new("id1", "Deck1");
        assert!(mapping.lookup("A1B2C3D4E5F678").is_none());
    }

    #[test]
    fn register_then_lookup_returns_card() {
        let mut mapping = RfidCardMapping::new("id1", "Deck1");
        mapping.register("A1B2C3D4E5F678", ace_of_spades());
        let result = mapping.lookup("A1B2C3D4E5F678");
        assert_eq!(result, Some(ace_of_spades()));
    }

    #[test]
    fn register_overwrites_existing_rfid() {
        let mut mapping = RfidCardMapping::new("id1", "Deck1");
        mapping.register("A1B2C3D4E5F678", ace_of_spades());
        mapping.register("A1B2C3D4E5F678", two_of_hearts());
        assert_eq!(mapping.lookup("A1B2C3D4E5F678"), Some(two_of_hearts()));
    }

    #[test]
    fn unregister_removes_entry() {
        let mut mapping = RfidCardMapping::new("id1", "Deck1");
        mapping.register("A1B2C3D4E5F678", ace_of_spades());
        mapping.unregister("A1B2C3D4E5F678");
        assert!(mapping.lookup("A1B2C3D4E5F678").is_none());
    }

    #[test]
    fn unregister_nonexistent_is_noop() {
        let mut mapping = RfidCardMapping::new("id1", "Deck1");
        mapping.unregister("NONEXISTENT1234"); // should not panic
    }

    #[test]
    fn multiple_rfids_independent() {
        let mut mapping = RfidCardMapping::new("id1", "Deck1");
        mapping.register("RFID00000000001", ace_of_spades());
        mapping.register("RFID00000000002", two_of_hearts());
        assert_eq!(mapping.lookup("RFID00000000001"), Some(ace_of_spades()));
        assert_eq!(mapping.lookup("RFID00000000002"), Some(two_of_hearts()));
    }

    #[test]
    fn serde_roundtrip() {
        let mut mapping = RfidCardMapping::new("test-id", "TestDeck");
        mapping.register("A1B2C3D4E5F678", ace_of_spades());
        let json = serde_json::to_string(&mapping).unwrap();
        let restored: RfidCardMapping = serde_json::from_str(&json).unwrap();
        assert_eq!(restored.id, "test-id");
        assert_eq!(restored.name, "TestDeck");
        assert_eq!(restored.lookup("A1B2C3D4E5F678"), Some(ace_of_spades()));
    }
}

//! カード・スート・デッキのドメインモデルと serde 実装。

use serde::{Deserialize, Deserializer, Serialize, Serializer};
use std::fmt;

#[derive(Clone, Copy, PartialEq, Eq, Debug, Hash, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Suit {
    Spade,
    Heart,
    Diamond,
    Club,
}

/// カードの数値。JSON では "2"〜"9","T","J","Q","K","A" で表現する。
#[derive(Clone, Copy, PartialEq, Eq, Debug, Hash, PartialOrd, Ord)]
pub enum CardValue {
    Two,
    Three,
    Four,
    Five,
    Six,
    Seven,
    Eight,
    Nine,
    Ten,
    Jack,
    Queen,
    King,
    Ace,
}

impl CardValue {
    /// 比較用の数値（2=2, …, A=14）。
    pub fn numeric(self) -> u8 {
        match self {
            Self::Two => 2,
            Self::Three => 3,
            Self::Four => 4,
            Self::Five => 5,
            Self::Six => 6,
            Self::Seven => 7,
            Self::Eight => 8,
            Self::Nine => 9,
            Self::Ten => 10,
            Self::Jack => 11,
            Self::Queen => 12,
            Self::King => 13,
            Self::Ace => 14,
        }
    }

    pub fn all() -> [CardValue; 13] {
        [
            Self::Two,
            Self::Three,
            Self::Four,
            Self::Five,
            Self::Six,
            Self::Seven,
            Self::Eight,
            Self::Nine,
            Self::Ten,
            Self::Jack,
            Self::Queen,
            Self::King,
            Self::Ace,
        ]
    }
}

impl fmt::Display for CardValue {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        let s = match self {
            Self::Two => "2",
            Self::Three => "3",
            Self::Four => "4",
            Self::Five => "5",
            Self::Six => "6",
            Self::Seven => "7",
            Self::Eight => "8",
            Self::Nine => "9",
            Self::Ten => "T",
            Self::Jack => "J",
            Self::Queen => "Q",
            Self::King => "K",
            Self::Ace => "A",
        };
        write!(f, "{}", s)
    }
}

impl Serialize for CardValue {
    fn serialize<S: Serializer>(&self, s: S) -> Result<S::Ok, S::Error> {
        s.serialize_str(&self.to_string())
    }
}

impl<'de> Deserialize<'de> for CardValue {
    fn deserialize<D: Deserializer<'de>>(d: D) -> Result<Self, D::Error> {
        let raw = String::deserialize(d)?;
        match raw.as_str() {
            "2" => Ok(Self::Two),
            "3" => Ok(Self::Three),
            "4" => Ok(Self::Four),
            "5" => Ok(Self::Five),
            "6" => Ok(Self::Six),
            "7" => Ok(Self::Seven),
            "8" => Ok(Self::Eight),
            "9" => Ok(Self::Nine),
            "T" | "10" => Ok(Self::Ten),
            "J" => Ok(Self::Jack),
            "Q" => Ok(Self::Queen),
            "K" => Ok(Self::King),
            "A" => Ok(Self::Ace),
            other => Err(serde::de::Error::unknown_variant(
                other,
                &[
                    "2", "3", "4", "5", "6", "7", "8", "9", "T", "J", "Q", "K", "A",
                ],
            )),
        }
    }
}

#[derive(Clone, Copy, PartialEq, Eq, Debug, Hash, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Card {
    pub suit: Suit,
    pub value: CardValue,
}

impl Card {
    pub fn new(suit: Suit, value: CardValue) -> Self {
        Self { suit, value }
    }
}

/// 52 枚のフルデッキを返す。
pub fn full_deck() -> Vec<Card> {
    let suits = [Suit::Spade, Suit::Heart, Suit::Diamond, Suit::Club];
    let mut deck = Vec::with_capacity(52);
    for suit in suits {
        for value in CardValue::all() {
            deck.push(Card::new(suit, value));
        }
    }
    deck
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashSet;

    #[test]
    fn full_deck_has_52_cards() {
        let deck = full_deck();
        assert_eq!(deck.len(), 52);
    }

    #[test]
    fn full_deck_no_duplicates() {
        let deck = full_deck();
        let unique: HashSet<_> = deck.iter().collect();
        assert_eq!(unique.len(), 52);
    }

    #[test]
    fn card_value_serialization() {
        let v = CardValue::Ten;
        let json = serde_json::to_string(&v).unwrap();
        assert_eq!(json, "\"T\"");
        let back: CardValue = serde_json::from_str(&json).unwrap();
        assert_eq!(back, CardValue::Ten);
    }
}

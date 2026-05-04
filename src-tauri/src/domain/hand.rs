//! ポーカーハンド役判定。5〜7 枚のカードから最強の HandRank を返す。

use super::card::{Card, CardValue};
use serde::{Deserialize, Serialize};

#[derive(Clone, Copy, PartialEq, Eq, Debug, PartialOrd, Ord, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum HandRank {
    HighCard,
    OnePair,
    TwoPair,
    ThreeOfAKind,
    Straight,
    Flush,
    FullHouse,
    FourOfAKind,
    StraightFlush,
    RoyalStraightFlush,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EvaluatedHand {
    pub rank: HandRank,
    /// ランク内の強さ比較用キッカー（降順）。
    pub kickers: Vec<CardValue>,
}

/// 5〜7 枚のカードから最強の役を評価する。
pub fn evaluate_hand(cards: &[Card]) -> EvaluatedHand {
    assert!(cards.len() >= 5, "at least 5 cards required");

    if cards.len() == 5 {
        return evaluate_five(cards);
    }

    // 7 枚以下なら C(n,5) の全組み合わせを試す。
    let n = cards.len();
    let mut best: Option<EvaluatedHand> = None;
    for i in 0..n {
        for j in (i + 1)..n {
            for k in (j + 1)..n {
                for l in (k + 1)..n {
                    for m in (l + 1)..n {
                        let five = [cards[i], cards[j], cards[k], cards[l], cards[m]];
                        let candidate = evaluate_five(&five);
                        best = Some(match best {
                            None => candidate,
                            Some(ref prev) => {
                                if compare_evaluated(&candidate, prev) == std::cmp::Ordering::Greater {
                                    candidate
                                } else {
                                    prev.clone()
                                }
                            }
                        });
                    }
                }
            }
        }
    }
    best.unwrap()
}

/// EvaluatedHand の強さを比較する。
pub fn compare_evaluated(a: &EvaluatedHand, b: &EvaluatedHand) -> std::cmp::Ordering {
    let rank_cmp = a.rank.cmp(&b.rank);
    if rank_cmp != std::cmp::Ordering::Equal {
        return rank_cmp;
    }
    for (av, bv) in a.kickers.iter().zip(b.kickers.iter()) {
        let c = av.numeric().cmp(&bv.numeric());
        if c != std::cmp::Ordering::Equal {
            return c;
        }
    }
    std::cmp::Ordering::Equal
}

/// ちょうど 5 枚のカードを評価する。
fn evaluate_five(cards: &[Card]) -> EvaluatedHand {
    debug_assert_eq!(cards.len(), 5);

    let mut sorted: Vec<Card> = cards.to_vec();
    // 数値降順
    sorted.sort_by(|a, b| b.value.numeric().cmp(&a.value.numeric()));

    let is_flush = sorted.iter().all(|c| c.suit == sorted[0].suit);
    let values: Vec<u8> = sorted.iter().map(|c| c.value.numeric()).collect();

    let is_straight = values.windows(2).all(|w| w[0] == w[1] + 1);
    // A-2-3-4-5 ホイール: sorted = [A,5,4,3,2] → values = [14,5,4,3,2]
    let is_wheel = values == [14, 5, 4, 3, 2];

    if is_flush {
        if is_straight && values[0] == 14 {
            return EvaluatedHand {
                rank: HandRank::RoyalStraightFlush,
                kickers: vec![CardValue::Ace],
            };
        }
        if is_straight {
            return EvaluatedHand {
                rank: HandRank::StraightFlush,
                kickers: vec![sorted[0].value],
            };
        }
        if is_wheel {
            // A-2-3-4-5 ストレートフラッシュ：強さは 5 ハイ
            return EvaluatedHand {
                rank: HandRank::StraightFlush,
                kickers: vec![CardValue::Five],
            };
        }
        return EvaluatedHand {
            rank: HandRank::Flush,
            kickers: sorted.iter().map(|c| c.value).collect(),
        };
    }

    if is_straight {
        return EvaluatedHand {
            rank: HandRank::Straight,
            kickers: vec![sorted[0].value],
        };
    }
    if is_wheel {
        return EvaluatedHand {
            rank: HandRank::Straight,
            kickers: vec![CardValue::Five],
        };
    }

    // 枚数カウント
    let counts: Vec<(u8, u8)> = {
        let mut map = std::collections::HashMap::new();
        for c in &sorted {
            *map.entry(c.value.numeric()).or_insert(0u8) += 1;
        }
        let mut v: Vec<(u8, u8)> = map.into_iter().collect();
        // 枚数降順 → 数値降順
        v.sort_by(|a, b| b.1.cmp(&a.1).then(b.0.cmp(&a.0)));
        v
    };

    let top_count = counts[0].1;
    let top_value = numeric_to_card_value(counts[0].0);
    let second_count = if counts.len() > 1 { counts[1].1 } else { 0 };
    let second_value = if counts.len() > 1 {
        Some(numeric_to_card_value(counts[1].0))
    } else {
        None
    };

    match (top_count, second_count) {
        (4, _) => {
            let kicker = second_value.unwrap();
            EvaluatedHand {
                rank: HandRank::FourOfAKind,
                kickers: vec![top_value, kicker],
            }
        }
        (3, 2) => EvaluatedHand {
            rank: HandRank::FullHouse,
            kickers: vec![top_value, second_value.unwrap()],
        },
        (3, _) => {
            let kickers: Vec<CardValue> = counts[1..]
                .iter()
                .map(|(v, _)| numeric_to_card_value(*v))
                .collect();
            EvaluatedHand {
                rank: HandRank::ThreeOfAKind,
                kickers: std::iter::once(top_value).chain(kickers).collect(),
            }
        }
        (2, 2) => {
            let third = numeric_to_card_value(counts[2].0);
            EvaluatedHand {
                rank: HandRank::TwoPair,
                kickers: vec![top_value, second_value.unwrap(), third],
            }
        }
        (2, _) => {
            let kickers: Vec<CardValue> = counts[1..]
                .iter()
                .map(|(v, _)| numeric_to_card_value(*v))
                .collect();
            EvaluatedHand {
                rank: HandRank::OnePair,
                kickers: std::iter::once(top_value).chain(kickers).collect(),
            }
        }
        _ => {
            // High card: counts は既に降順
            let kickers = counts.iter().map(|(v, _)| numeric_to_card_value(*v)).collect();
            EvaluatedHand {
                rank: HandRank::HighCard,
                kickers,
            }
        }
    }
}

fn numeric_to_card_value(n: u8) -> CardValue {
    match n {
        2 => CardValue::Two,
        3 => CardValue::Three,
        4 => CardValue::Four,
        5 => CardValue::Five,
        6 => CardValue::Six,
        7 => CardValue::Seven,
        8 => CardValue::Eight,
        9 => CardValue::Nine,
        10 => CardValue::Ten,
        11 => CardValue::Jack,
        12 => CardValue::Queen,
        13 => CardValue::King,
        14 => CardValue::Ace,
        _ => panic!("invalid card numeric value: {}", n),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::domain::card::{Card, CardValue::*, Suit::*};

    fn c(suit: crate::domain::card::Suit, value: CardValue) -> Card {
        Card::new(suit, value)
    }

    #[test]
    fn high_card() {
        let cards = [c(Spade, Two), c(Heart, Four), c(Diamond, Six), c(Club, Eight), c(Spade, Ten)];
        let e = evaluate_hand(&cards);
        assert_eq!(e.rank, HandRank::HighCard);
    }

    #[test]
    fn one_pair() {
        let cards = [c(Spade, Two), c(Heart, Two), c(Diamond, Six), c(Club, Eight), c(Spade, Ten)];
        let e = evaluate_hand(&cards);
        assert_eq!(e.rank, HandRank::OnePair);
    }

    #[test]
    fn two_pair() {
        let cards = [c(Spade, Two), c(Heart, Two), c(Diamond, Six), c(Club, Six), c(Spade, Ten)];
        let e = evaluate_hand(&cards);
        assert_eq!(e.rank, HandRank::TwoPair);
    }

    #[test]
    fn three_of_a_kind() {
        let cards = [c(Spade, Two), c(Heart, Two), c(Diamond, Two), c(Club, Six), c(Spade, Ten)];
        let e = evaluate_hand(&cards);
        assert_eq!(e.rank, HandRank::ThreeOfAKind);
    }

    #[test]
    fn straight() {
        let cards = [c(Spade, Three), c(Heart, Four), c(Diamond, Five), c(Club, Six), c(Spade, Seven)];
        let e = evaluate_hand(&cards);
        assert_eq!(e.rank, HandRank::Straight);
        assert_eq!(e.kickers[0], Seven);
    }

    #[test]
    fn wheel_straight_a2345() {
        let cards = [c(Spade, Ace), c(Heart, Two), c(Diamond, Three), c(Club, Four), c(Spade, Five)];
        let e = evaluate_hand(&cards);
        assert_eq!(e.rank, HandRank::Straight);
        assert_eq!(e.kickers[0], Five);
    }

    #[test]
    fn flush() {
        let cards = [c(Spade, Two), c(Spade, Four), c(Spade, Six), c(Spade, Eight), c(Spade, King)];
        let e = evaluate_hand(&cards);
        assert_eq!(e.rank, HandRank::Flush);
    }

    #[test]
    fn full_house() {
        let cards = [c(Spade, King), c(Heart, King), c(Diamond, King), c(Club, Two), c(Spade, Two)];
        let e = evaluate_hand(&cards);
        assert_eq!(e.rank, HandRank::FullHouse);
    }

    #[test]
    fn four_of_a_kind() {
        let cards = [c(Spade, Ace), c(Heart, Ace), c(Diamond, Ace), c(Club, Ace), c(Spade, King)];
        let e = evaluate_hand(&cards);
        assert_eq!(e.rank, HandRank::FourOfAKind);
    }

    #[test]
    fn straight_flush() {
        let cards = [c(Heart, Five), c(Heart, Six), c(Heart, Seven), c(Heart, Eight), c(Heart, Nine)];
        let e = evaluate_hand(&cards);
        assert_eq!(e.rank, HandRank::StraightFlush);
    }

    #[test]
    fn royal_straight_flush() {
        let cards = [c(Club, Ten), c(Club, Jack), c(Club, Queen), c(Club, King), c(Club, Ace)];
        let e = evaluate_hand(&cards);
        assert_eq!(e.rank, HandRank::RoyalStraightFlush);
    }

    #[test]
    fn seven_card_best_hand() {
        // 7 枚渡しても最強役が取れる
        let cards = [
            c(Club, Ace), c(Club, King), c(Club, Queen), c(Club, Jack), c(Club, Ten),
            c(Spade, Two), c(Heart, Three),
        ];
        let e = evaluate_hand(&cards);
        assert_eq!(e.rank, HandRank::RoyalStraightFlush);
    }
}

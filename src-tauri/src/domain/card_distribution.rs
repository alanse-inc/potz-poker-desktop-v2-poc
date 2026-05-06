//! テキサスホールデムにおけるカード配布位置の決定ロジック。
//!
//! 元実装 (TypeScript): desktop-app/src/domain/texas_holdem/card_distribution.ts
//!
//! v2 の TexasHoldemBoard はシンプル化されているため、
//! 元実装の "auto mode / manual mode" 分岐は省き、
//! v2 のボード構造に直接対応する形に移植する。

use crate::domain::board::{Phase, Player, TexasHoldemBoard};
use serde::{Deserialize, Serialize};
use thiserror::Error;

/// カードが配布される位置。
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum CardPosition {
    /// プレイヤーへのハンドカード。`seat` はプレイヤーの `position` 番号。
    PlayerHand { seat: u8 },
    /// コミュニティカード。`slot` は 0–4 (0=flop1, 1=flop2, 2=flop3, 3=turn, 4=river)。
    CommunityCard { slot: u8 },
    /// バーンカード。
    BurnCard,
}

#[derive(Debug, Error)]
pub enum CardDistributionError {
    #[error("no card receivable players found")]
    NoCardReceivablePlayers,
    #[error("BB player not found in heads-up")]
    HeadsUpBbNotFound,
    #[error("all players have been dealt initial cards")]
    AllPlayersDealt,
    #[error("no more community cards to deal")]
    NoMoreCommunityCards,
    #[error("game is over, no more cards expected")]
    GameOver,
}

/// カードを受け取れるプレイヤーかどうか。
/// フォールドしていないプレイヤーが対象（all-in も含む）。
fn is_card_receivable(player: &Player) -> bool {
    !player.has_folded
}

/// ONE BIG 適用中かどうかを判定。
/// v2 では position-based (dealer/sb/bb はインデックスで管理) のため、
/// sb_position と bb_position から判定する。
/// heads-up (2名) の場合は dealer=sb となる特殊ケースを考慮する。
fn is_one_big_applied(board: &TexasHoldemBoard, receivable_players: &[&Player]) -> bool {
    // プレイヤー数が 3 以上でないと ONE BIG にならない
    if receivable_players.len() < 3 {
        return false;
    }
    // sb_position == bb_position ならば ONE BIG（SB がいない）
    // ただし v2 の board では heads-up 時に dealer==sb になっているため要注意
    // ONE BIG は SBが存在しない (dealer+1=BB) パターン
    // v2 では dealer→sb→bb の順なので通常は dealer+1=sb, dealer+2=bb
    // ONE BIG は dealer+1=bb (sbスキップ) のケース
    let n = board.players.len() as u8;
    let expected_sb = (board.dealer_position + 1) % n;
    board.sb_position != expected_sb
}

/// 起点シートを決定（ONE BIG時=BB、通常時=SB）。
fn find_dealing_start_seat(board: &TexasHoldemBoard, receivable_players: &[&Player]) -> u8 {
    if is_one_big_applied(board, receivable_players) {
        board.bb_position
    } else {
        board.sb_position
    }
}

/// 時計回り距離でプレイヤーをソートする。
/// `start_seat` を起点として最も近い順に並べる。
fn sort_by_clockwise_distance(players: &[&Player], start_seat: u8, total: u8) -> Vec<u8> {
    let mut seats: Vec<u8> = players.iter().map(|p| p.position).collect();
    seats.sort_by_key(|&seat| (seat + total - start_seat) % total);
    seats
}

/// hand が確定済み（2枚スキャン完了）かどうかを判定する。
/// pending 状態 (hand[0] == hand[1]) は1枚目スキャン済みだが未確定とみなす。
fn is_hand_confirmed(hand: &[crate::domain::card::Card; 2]) -> bool {
    hand[0] != hand[1]
}

/// 全プレイヤーに初期カード（2枚）が配られているか確認。
/// pending 状態 (hand[0] == hand[1]) は未配布として扱う。
fn are_all_players_dealt(board: &TexasHoldemBoard) -> bool {
    let receivable: Vec<&Player> = board
        .players
        .iter()
        .filter(|p| is_card_receivable(p))
        .collect();
    if receivable.is_empty() {
        return true;
    }
    receivable
        .iter()
        .all(|p| p.hand.as_ref().is_some_and(is_hand_confirmed))
}

/// バーンカードが必要かどうかを判定。
/// v2 では `burn_count` を外部で管理し引数として受け取る。
/// コミュニティカードの枚数で判断する（フェーズに依存しない）。
pub fn should_burn_card(board: &TexasHoldemBoard, burn_count: u8) -> bool {
    let community_count = board.community_cards.len() as u8;
    // フロップ前のバーン: プレイヤー全員配布済みでコミュニティ0枚、バーン0枚。
    // PreFlop ベッティングが完了していない場合はバーンを許可しない。
    // これにより PreFlop ベッティング中の早期スキャンで誤って BurnCard を返すことを防ぐ。
    if burn_count == 0 && community_count == 0 {
        if board.phase == Phase::PreFlop && !board.is_round_complete() {
            return false;
        }
        return true;
    }
    // ターン前のバーン: コミュニティ3枚、バーン1枚
    if burn_count == 1 && community_count == 3 {
        return true;
    }
    // リバー前のバーン: コミュニティ4枚、バーン2枚
    if burn_count == 2 && community_count == 4 {
        return true;
    }
    false
}

/// 次に配るべきカードの位置を決定する。
///
/// # 引数
/// * `board` - 現在のボード状態
/// * `burn_count` - これまでに配布されたバーンカードの枚数
pub fn determine_next_card_position(
    board: &TexasHoldemBoard,
    burn_count: u8,
) -> Result<CardPosition, CardDistributionError> {
    if board.phase == Phase::Showdown {
        return Err(CardDistributionError::GameOver);
    }

    // プレイヤーへのカード配布が完了しているか確認
    if !are_all_players_dealt(board) {
        return determine_next_player_card_position(board);
    }

    // バーンカードが必要か
    if should_burn_card(board, burn_count) {
        return Ok(CardPosition::BurnCard);
    }

    // コミュニティカード
    determine_next_community_card_position(board)
}

/// 次のプレイヤーカードの位置を決定する。
fn determine_next_player_card_position(
    board: &TexasHoldemBoard,
) -> Result<CardPosition, CardDistributionError> {
    let receivable: Vec<&Player> = board
        .players
        .iter()
        .filter(|p| is_card_receivable(p))
        .collect();

    if receivable.is_empty() {
        return Err(CardDistributionError::NoCardReceivablePlayers);
    }

    let total = board.players.len() as u8;

    // ヘッズアップ（2人）の特別処理: BB → SB/BTN → BB → SB/BTN の順
    if receivable.len() == 2 {
        let bb_player = receivable.iter().find(|p| p.position == board.bb_position);
        let bb_player = match bb_player {
            Some(p) => *p,
            None => return Err(CardDistributionError::HeadsUpBbNotFound),
        };
        let other_player = receivable.iter().find(|p| p.position != board.bb_position);
        let other_player = match other_player {
            Some(p) => *p,
            None => return Err(CardDistributionError::HeadsUpBbNotFound),
        };

        let heads_up_order = [bb_player, other_player];

        for p in &heads_up_order {
            let undealt = p.hand.as_ref().map_or(true, |h| !is_hand_confirmed(h));
            if undealt {
                return Ok(CardPosition::PlayerHand { seat: p.position });
            }
        }
    } else {
        // 3人以上
        let start_seat = find_dealing_start_seat(board, &receivable);
        let sorted_seats = sort_by_clockwise_distance(&receivable, start_seat, total);

        for seat in &sorted_seats {
            if let Some(p) = board.players.iter().find(|p| p.position == *seat) {
                let undealt = p.hand.as_ref().map_or(true, |h| !is_hand_confirmed(h));
                if undealt {
                    return Ok(CardPosition::PlayerHand { seat: p.position });
                }
            }
        }
    }

    Err(CardDistributionError::AllPlayersDealt)
}

/// 次のコミュニティカードの位置を決定する。
fn determine_next_community_card_position(
    board: &TexasHoldemBoard,
) -> Result<CardPosition, CardDistributionError> {
    match board.community_cards.len() {
        0 => Ok(CardPosition::CommunityCard { slot: 0 }), // flop1
        1 => Ok(CardPosition::CommunityCard { slot: 1 }), // flop2
        2 => Ok(CardPosition::CommunityCard { slot: 2 }), // flop3
        3 => Ok(CardPosition::CommunityCard { slot: 3 }), // turn
        4 => Ok(CardPosition::CommunityCard { slot: 4 }), // river
        _ => Err(CardDistributionError::NoMoreCommunityCards),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::domain::board::{start_game, GameSettings};

    fn make_board_3p() -> TexasHoldemBoard {
        let settings = GameSettings {
            small_blind: 50,
            big_blind: 100,
            min_chip: 50,
            bb_ante: false,
        };
        let names = vec!["Alice".into(), "Bob".into(), "Carol".into()];
        let mut board = start_game(settings, names, 0).unwrap();
        // RFID テスト用にハンドをリセット（全員 hand = None）
        for p in &mut board.players {
            p.hand = None;
        }
        board
    }

    fn make_board_2p() -> TexasHoldemBoard {
        let settings = GameSettings {
            small_blind: 50,
            big_blind: 100,
            min_chip: 50,
            bb_ante: false,
        };
        let names = vec!["Alice".into(), "Bob".into()];
        let mut board = start_game(settings, names, 0).unwrap();
        for p in &mut board.players {
            p.hand = None;
        }
        board
    }

    // ---- 3人通常パターン ----

    #[test]
    fn three_players_first_card_goes_to_sb() {
        let board = make_board_3p();
        // dealer=0, sb=1, bb=2 の通常配布
        // 最初のカードは SB (position=1) に行く
        let pos = determine_next_card_position(&board, 0).unwrap();
        assert_eq!(pos, CardPosition::PlayerHand { seat: 1 });
    }

    #[test]
    fn three_players_second_player_after_sb_dealt() {
        let mut board = make_board_3p();
        // SB (position=1) に hand を付与
        use crate::domain::card::{Card, CardValue, Suit};
        board.players[1].hand = Some([
            Card::new(Suit::Spade, CardValue::Ace),
            Card::new(Suit::Heart, CardValue::King),
        ]);
        // 次は BB (position=2) に行くはず
        let pos = determine_next_card_position(&board, 0).unwrap();
        assert_eq!(pos, CardPosition::PlayerHand { seat: 2 });
    }

    #[test]
    fn three_players_third_player_last() {
        let mut board = make_board_3p();
        use crate::domain::card::{Card, CardValue, Suit};
        board.players[1].hand = Some([
            Card::new(Suit::Spade, CardValue::Ace),
            Card::new(Suit::Heart, CardValue::King),
        ]);
        board.players[2].hand = Some([
            Card::new(Suit::Spade, CardValue::Two),
            Card::new(Suit::Heart, CardValue::Three),
        ]);
        // 次は Dealer (position=0) に行くはず
        let pos = determine_next_card_position(&board, 0).unwrap();
        assert_eq!(pos, CardPosition::PlayerHand { seat: 0 });
    }

    #[test]
    fn all_players_dealt_burns_first() {
        let mut board = make_board_3p();
        use crate::domain::card::{Card, CardValue, Suit};
        for p in &mut board.players {
            p.hand = Some([
                Card::new(Suit::Spade, CardValue::Ace),
                Card::new(Suit::Heart, CardValue::King),
            ]);
        }
        // Bug 1 fix: PreFlop ベッティングが完了していない場合はバーンを返さない。
        // PreFlop ベッティング未完了（has_acted=false のプレイヤーあり） → BurnCard にならない
        let pos = determine_next_card_position(&board, 0).unwrap();
        assert!(
            matches!(pos, CardPosition::CommunityCard { slot: 0 }),
            "should go to community flop1 (not BurnCard) when PreFlop betting is not complete, got {:?}",
            pos
        );

        // PreFlop ベッティング完了後（全員 has_acted=true かつ bet 揃い） → BurnCard
        for p in &mut board.players {
            p.has_acted = true;
            p.bet_in_round = board.current_bet;
        }
        let pos_after_round = determine_next_card_position(&board, 0).unwrap();
        assert_eq!(
            pos_after_round,
            CardPosition::BurnCard,
            "should return BurnCard after PreFlop betting is complete"
        );
    }

    #[test]
    fn after_burn_community_flop1() {
        let mut board = make_board_3p();
        use crate::domain::card::{Card, CardValue, Suit};
        for p in &mut board.players {
            p.hand = Some([
                Card::new(Suit::Spade, CardValue::Ace),
                Card::new(Suit::Heart, CardValue::King),
            ]);
        }
        // burn_count=1 → コミュニティ flop1
        let pos = determine_next_card_position(&board, 1).unwrap();
        assert_eq!(pos, CardPosition::CommunityCard { slot: 0 });
    }

    #[test]
    fn community_flop_sequence() {
        let mut board = make_board_3p();
        use crate::domain::card::{Card, CardValue, Suit};
        for p in &mut board.players {
            p.hand = Some([
                Card::new(Suit::Spade, CardValue::Ace),
                Card::new(Suit::Heart, CardValue::King),
            ]);
        }
        let card = Card::new(Suit::Diamond, CardValue::Two);
        board.community_cards.push(card); // flop1
        let pos = determine_next_card_position(&board, 1).unwrap();
        assert_eq!(pos, CardPosition::CommunityCard { slot: 1 }); // flop2

        board.community_cards.push(card);
        let pos = determine_next_card_position(&board, 1).unwrap();
        assert_eq!(pos, CardPosition::CommunityCard { slot: 2 }); // flop3

        board.community_cards.push(card);
        // burn_count=1, community=3 → burn#2
        let pos = determine_next_card_position(&board, 1).unwrap();
        assert_eq!(pos, CardPosition::BurnCard);

        // burn_count=2 → turn
        let pos = determine_next_card_position(&board, 2).unwrap();
        assert_eq!(pos, CardPosition::CommunityCard { slot: 3 });

        board.community_cards.push(card);
        // burn_count=2, community=4 → burn#3
        let pos = determine_next_card_position(&board, 2).unwrap();
        assert_eq!(pos, CardPosition::BurnCard);

        // burn_count=3 → river
        let pos = determine_next_card_position(&board, 3).unwrap();
        assert_eq!(pos, CardPosition::CommunityCard { slot: 4 });
    }

    // ---- ヘッズアップパターン ----

    #[test]
    fn heads_up_first_card_goes_to_bb() {
        let board = make_board_2p();
        // dealer=0(=sb), bb=1 → 最初は BB(1) に配布
        let pos = determine_next_card_position(&board, 0).unwrap();
        assert_eq!(pos, CardPosition::PlayerHand { seat: 1 });
    }

    #[test]
    fn heads_up_second_card_goes_to_dealer() {
        let mut board = make_board_2p();
        use crate::domain::card::{Card, CardValue, Suit};
        // BB(1) に配布済み
        board.players[1].hand = Some([
            Card::new(Suit::Spade, CardValue::Ace),
            Card::new(Suit::Heart, CardValue::King),
        ]);
        let pos = determine_next_card_position(&board, 0).unwrap();
        assert_eq!(pos, CardPosition::PlayerHand { seat: 0 });
    }

    // ---- バーン + コミュニティカード ----

    #[test]
    fn no_more_community_cards_returns_error() {
        let mut board = make_board_3p();
        use crate::domain::card::{Card, CardValue, Suit};
        for p in &mut board.players {
            p.hand = Some([
                Card::new(Suit::Spade, CardValue::Ace),
                Card::new(Suit::Heart, CardValue::King),
            ]);
        }
        let card = Card::new(Suit::Diamond, CardValue::Two);
        for _ in 0..5 {
            board.community_cards.push(card);
        }
        let result = determine_next_card_position(&board, 3);
        assert!(result.is_err());
    }

    // ---- Showdown 後の拒否 ----

    #[test]
    fn determine_next_card_position_rejects_after_showdown() {
        let mut board = make_board_3p();
        use crate::domain::board::Phase;
        board.phase = Phase::Showdown;
        let result = determine_next_card_position(&board, 0);
        assert!(matches!(result, Err(CardDistributionError::GameOver)));
    }

    // ---- ONE BIG パターン ----

    // ---- pending hand (Bug 2 fix) ----

    #[test]
    fn are_all_players_dealt_with_pending_returns_false() {
        use crate::domain::card::{Card, CardValue, Suit};
        let mut board = make_board_3p();
        let card = Card::new(Suit::Spade, CardValue::Ace);
        // 全員を pending 状態（hand[0] == hand[1]）にする
        for p in &mut board.players {
            p.hand = Some([card, card]);
        }
        // pending は未配布扱い → 次のカードはプレイヤーへ
        let pos = determine_next_card_position(&board, 0).unwrap();
        assert!(
            matches!(pos, CardPosition::PlayerHand { .. }),
            "pending hand should not count as dealt: got {:?}",
            pos
        );
    }

    #[test]
    fn are_all_players_dealt_with_one_pending_returns_false() {
        use crate::domain::card::{Card, CardValue, Suit};
        let mut board = make_board_3p();
        let ace = Card::new(Suit::Spade, CardValue::Ace);
        let king = Card::new(Suit::Heart, CardValue::King);
        // player[0], player[2] は confirmed
        board.players[0].hand = Some([ace, king]);
        board.players[2].hand = Some([ace, king]);
        // player[1] は pending
        board.players[1].hand = Some([ace, ace]);
        let pos = determine_next_card_position(&board, 0).unwrap();
        assert!(
            matches!(pos, CardPosition::PlayerHand { .. }),
            "one pending player should not count as all dealt: got {:?}",
            pos
        );
    }

    #[test]
    fn are_all_players_dealt_all_confirmed_goes_to_burn() {
        use crate::domain::card::{Card, CardValue, Suit};
        let mut board = make_board_3p();
        let ace = Card::new(Suit::Spade, CardValue::Ace);
        let king = Card::new(Suit::Heart, CardValue::King);
        for p in &mut board.players {
            p.hand = Some([ace, king]);
        }
        // Bug 1 fix: PreFlop ベッティングが完了していない状態では BurnCard を返さない。
        // 全員配布済みでも PreFlop ベッティング未完了の場合は CommunityCard { slot: 0 } を返す。
        // PreFlop ベッティングを完了させてから BurnCard を確認する。
        for p in &mut board.players {
            p.has_acted = true;
            p.bet_in_round = board.current_bet;
        }
        let pos = determine_next_card_position(&board, 0).unwrap();
        assert_eq!(pos, CardPosition::BurnCard);
    }

    #[test]
    fn one_big_starts_from_bb() {
        let settings = GameSettings {
            small_blind: 50,
            big_blind: 100,
            min_chip: 50,
            bb_ante: false,
        };
        let names = vec!["Alice".into(), "Bob".into(), "Carol".into()];
        let mut board = start_game(settings, names, 0).unwrap();
        // dealer=0, 通常なら sb=1, bb=2
        // ONE BIG: sb を bb に変更 (sb_position=bb_position=2)
        board.sb_position = 2;
        board.bb_position = 2;
        for p in &mut board.players {
            p.hand = None;
        }
        // is_one_big_applied: expected_sb=(0+1)%3=1, actual sb=2 → ONE BIG
        // start seat = bb = 2
        let pos = determine_next_card_position(&board, 0).unwrap();
        assert_eq!(pos, CardPosition::PlayerHand { seat: 2 });
    }

    // ================================================================
    // Bug 1 リグレッションテスト: PreFlop ベッティング中の早期バーンスキャン防止
    // ================================================================

    /// PreFlop 配布完了後、ベッティング途中では should_burn_card が false を返すこと。
    /// これにより advance_phase 二重バーンを防ぐ。
    #[test]
    fn r34_bug1_should_burn_card_returns_false_during_preflop_betting() {
        use crate::domain::card::{Card, CardValue, Suit};
        let mut board = make_board_3p();
        let ace = Card::new(Suit::Spade, CardValue::Ace);
        let king = Card::new(Suit::Heart, CardValue::King);
        // 全員ホールカード配布完了
        for p in &mut board.players {
            p.hand = Some([ace, king]);
        }
        // PreFlop ベッティング未完了（has_acted = false のプレイヤーあり）
        // → should_burn_card は false を返すべき
        assert!(
            !should_burn_card(&board, 0),
            "should_burn_card must return false during PreFlop betting (Bug 1 regression)"
        );
        // → determine_next_card_position も BurnCard を返さないこと
        let pos = determine_next_card_position(&board, 0).unwrap();
        assert!(
            !matches!(pos, CardPosition::BurnCard),
            "determine_next_card_position must not return BurnCard during PreFlop betting, got {:?}",
            pos
        );
    }

    /// PreFlop ベッティング完了後は should_burn_card が true を返すこと。
    #[test]
    fn r34_bug1_should_burn_card_returns_true_after_preflop_betting_complete() {
        use crate::domain::card::{Card, CardValue, Suit};
        let mut board = make_board_3p();
        let ace = Card::new(Suit::Spade, CardValue::Ace);
        let king = Card::new(Suit::Heart, CardValue::King);
        // 全員ホールカード配布完了
        for p in &mut board.players {
            p.hand = Some([ace, king]);
        }
        // PreFlop ベッティング完了（全員 has_acted = true かつ bet 揃い）
        for p in &mut board.players {
            p.has_acted = true;
            p.bet_in_round = board.current_bet;
        }
        assert!(
            should_burn_card(&board, 0),
            "should_burn_card must return true after PreFlop betting is complete"
        );
        let pos = determine_next_card_position(&board, 0).unwrap();
        assert_eq!(
            pos,
            CardPosition::BurnCard,
            "determine_next_card_position must return BurnCard after PreFlop betting is complete"
        );
    }
}

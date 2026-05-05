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

/// 全プレイヤーに初期カード（2枚）が配られているか確認。
fn are_all_players_dealt(board: &TexasHoldemBoard) -> bool {
    let receivable: Vec<&Player> = board
        .players
        .iter()
        .filter(|p| is_card_receivable(p))
        .collect();
    if receivable.is_empty() {
        return true;
    }
    receivable.iter().all(|p| p.hand.is_some())
}

/// バーンカードが必要かどうかを判定。
/// v2 では `burn_count` を外部で管理し引数として受け取る。
/// コミュニティカードの枚数で判断する（フェーズに依存しない）。
pub fn should_burn_card(board: &TexasHoldemBoard, burn_count: u8) -> bool {
    let community_count = board.community_cards.len() as u8;
    // フロップ前のバーン: プレイヤー全員配布済みでコミュニティ0枚、バーン0枚
    if burn_count == 0 && community_count == 0 {
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

        // 1枚目
        for p in &heads_up_order {
            if p.hand.is_none() {
                return Ok(CardPosition::PlayerHand { seat: p.position });
            }
        }
        // 2枚目（今の実装では hand は Option<[Card;2]> で一度に渡されるが、
        // RFID モードでは1枚ずつ渡される想定に合わせて hand が None のケースで判定）
        // v2 の Player.hand は Option<[Card;2]> のため「1枚のみ」という状態を表現できない。
        // ここでは hand が Some であれば2枚とも配布済みとみなす。
        // プレイヤーハンドカードの2枚配布は別途手動操作で行う想定のためこのロジックは
        // 「最初に hand が None のプレイヤーに配る」として扱う。
    } else {
        // 3人以上
        let start_seat = find_dealing_start_seat(board, &receivable);
        let sorted_seats = sort_by_clockwise_distance(&receivable, start_seat, total);

        // hand が None の最初のプレイヤー
        for seat in &sorted_seats {
            if let Some(p) = board.players.iter().find(|p| p.position == *seat) {
                if p.hand.is_none() {
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
        // 全員配布済み → burn_count=0, community=0 → BurnCard
        let pos = determine_next_card_position(&board, 0).unwrap();
        assert_eq!(pos, CardPosition::BurnCard);
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
}

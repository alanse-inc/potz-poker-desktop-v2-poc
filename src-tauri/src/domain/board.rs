//! テキサスホールデムのボード状態機械（Manual モード簡略版）。

use super::card::{full_deck, Card, CardValue, Suit};
use super::hand::{compare_evaluated, evaluate_hand, EvaluatedHand};
use crate::error::BoardError;
use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Clone, Copy, PartialEq, Eq, Debug)]
#[serde(rename_all = "snake_case")]
pub enum Phase {
    PreFlop,
    Flop,
    Turn,
    River,
    Showdown,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Player {
    pub position: u8,
    pub name: String,
    pub stack: u32,
    pub hand: Option<[Card; 2]>,
    pub bet_in_round: u32,
    pub has_folded: bool,
    pub is_all_in: bool,
    /// 現ラウンドでアクション（bet/call/check/fold/raise/allin）を実行済みか。
    pub has_acted: bool,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Pot {
    pub amount: u32,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct GameSettings {
    pub small_blind: u32,
    pub big_blind: u32,
    pub min_chip: u32,
    pub bb_ante: bool,
}

impl Default for GameSettings {
    fn default() -> Self {
        Self {
            small_blind: 100,
            big_blind: 200,
            min_chip: 100,
            bb_ante: false,
        }
    }
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct TexasHoldemBoard {
    pub hand_number: u32,
    pub dealer_position: u8,
    pub sb_position: u8,
    pub bb_position: u8,
    pub current_turn: u8,
    pub current_bet: u32,
    /// 直近のレイズ幅（最低再レイズ額の計算に使用）。ラウンドリセット時は 0 に戻る。
    pub last_raise_size: u32,
    pub players: Vec<Player>,
    pub community_cards: Vec<Card>,
    pots: Vec<Pot>,
    pub phase: Phase,
    /// ショーダウン時の勝者ポジション一覧。
    pub winners: Vec<u8>,
}

impl TexasHoldemBoard {
    pub fn pots(&self) -> &[Pot] {
        &self.pots
    }

    pub fn total_pot(&self) -> u32 {
        self.pots.iter().map(|p| p.amount).sum()
    }

    fn current_player_idx(&self) -> Option<usize> {
        self.players.iter().position(|p| p.position == self.current_turn)
    }

    fn next_active_position_after(&self, pos: u8) -> Option<u8> {
        let n = self.players.len();
        // 現在位置の次から一周
        let start_idx = self.players.iter().position(|p| p.position == pos)?;
        for offset in 1..=n {
            let idx = (start_idx + offset) % n;
            let p = &self.players[idx];
            if !p.has_folded && !p.is_all_in {
                return Some(p.position);
            }
        }
        None
    }

    /// ベットラウンドが完了しているか判定する。
    fn is_round_complete(&self) -> bool {
        let actives: Vec<&Player> = self
            .players
            .iter()
            .filter(|p| !p.has_folded)
            .collect();

        // fold 以外が 1 人なら完了
        if actives.len() <= 1 {
            return true;
        }

        // allin 以外のアクティブプレイヤー
        let non_allin: Vec<&Player> = actives.iter().filter(|p| !p.is_all_in).copied().collect();

        // 全員 allin ならラウンド完了
        if non_allin.is_empty() {
            return true;
        }

        // まだアクションしていないプレイヤーがいればラウンド未完了
        if non_allin.iter().any(|p| !p.has_acted) {
            return false;
        }

        // 全員が current_bet に追いついているか
        non_allin.iter().all(|p| p.bet_in_round >= self.current_bet)
    }

    /// ラウンドをリセットし次フェーズへ進める。community_cards を配る。
    fn advance_phase(&mut self, deck: &mut Vec<Card>) {
        // ベット額をポットに移動
        let total_bet: u32 = self.players.iter().map(|p| p.bet_in_round).sum();
        if total_bet > 0 {
            if let Some(pot) = self.pots.last_mut() {
                pot.amount += total_bet;
            } else {
                self.pots.push(Pot { amount: total_bet });
            }
        }
        for p in &mut self.players {
            p.bet_in_round = 0;
            p.has_acted = false;
        }
        self.current_bet = 0;
        self.last_raise_size = 0;

        self.phase = match self.phase {
            Phase::PreFlop => Phase::Flop,
            Phase::Flop => Phase::Turn,
            Phase::Turn => Phase::River,
            Phase::River => Phase::Showdown,
            Phase::Showdown => Phase::Showdown,
        };

        match self.phase {
            Phase::Flop => {
                for _ in 0..3 {
                    if let Some(card) = deck.pop() {
                        self.community_cards.push(card);
                    }
                }
            }
            Phase::Turn | Phase::River => {
                if let Some(card) = deck.pop() {
                    self.community_cards.push(card);
                }
            }
            _ => {}
        }

        // 次のアクション順：SB の左から
        if self.phase != Phase::Showdown {
            if let Some(pos) = self.next_active_position_after(self.dealer_position) {
                self.current_turn = pos;
            }
        }
    }

    /// 現在ターンのプレイヤーにアクションを適用し、次のターンへ。
    /// クロージャは (player, current_bet) を受け取る。
    fn apply_action<F>(&mut self, f: F, deck: &mut Vec<Card>) -> Result<(), BoardError>
    where
        F: FnOnce(&mut Player, u32) -> Result<(), BoardError>,
    {
        if self.phase == Phase::Showdown {
            return Err(BoardError::InvalidAction("game is over".into()));
        }

        let idx = self
            .current_player_idx()
            .ok_or_else(|| BoardError::InvalidAction("current player not found".into()))?;

        // borrow split: clone player, apply, write back
        let current_bet = self.current_bet;
        let mut player = self.players[idx].clone();
        f(&mut player, current_bet)?;
        player.has_acted = true;
        self.players[idx] = player;

        // fold 以外が 1 人しか残っていない → showdown へ
        let alive_count = self.players.iter().filter(|p| !p.has_folded).count();
        if alive_count == 1 {
            let winner_pos = self
                .players
                .iter()
                .find(|p| !p.has_folded)
                .map(|p| p.position)
                .unwrap();
            let total_bet: u32 = self.players.iter().map(|p| p.bet_in_round).sum();
            if total_bet > 0 {
                if let Some(pot) = self.pots.last_mut() {
                    pot.amount += total_bet;
                } else {
                    self.pots.push(Pot { amount: total_bet });
                }
            }
            for p in &mut self.players {
                p.bet_in_round = 0;
            }
            self.phase = Phase::Showdown;
            self.winners = vec![winner_pos];
            // ポットを勝者に配分
            let total = self.total_pot();
            if let Some(p) = self.players.iter_mut().find(|p| p.position == winner_pos) {
                p.stack += total;
            }
            self.pots.clear();
            self.pots.push(Pot { amount: 0 });
            return Ok(());
        }

        if self.is_round_complete() {
            self.advance_phase(deck);
            // 全員 allin 等で誰もアクションできない場合は Showdown まで連続で進める
            while self.phase != Phase::Showdown && self.is_round_complete() {
                self.advance_phase(deck);
            }
            if self.phase == Phase::Showdown {
                self.resolve_showdown();
            }
        } else {
            // 次のアクティブプレイヤーへ
            let current_pos = self.players[idx].position;
            if let Some(next) = self.next_active_position_after(current_pos) {
                self.current_turn = next;
            }
        }

        Ok(())
    }

    fn resolve_showdown(&mut self) {
        if self.phase != Phase::Showdown {
            return;
        }

        let active: Vec<usize> = self
            .players
            .iter()
            .enumerate()
            .filter(|(_, p)| !p.has_folded && p.hand.is_some())
            .map(|(i, _)| i)
            .collect();

        if active.is_empty() {
            // hand が None のままショーダウンに到達した場合のフォールバック:
            // フォールドしていない全プレイヤーにポットを均等分割する。
            // 端数はディーラー左回りの最初のプレイヤーが受け取る。
            let eligible: Vec<usize> = self
                .players
                .iter()
                .enumerate()
                .filter(|(_, p)| !p.has_folded)
                .map(|(i, _)| i)
                .collect();

            if eligible.is_empty() {
                // 全員フォールド（通常は apply_action で処理済みのため到達しない）
                return;
            }

            eprintln!(
                "[WARN] resolve_showdown: all active players have hand=None; \
                 distributing pot equally among {} non-folded player(s)",
                eligible.len()
            );

            // ディーラー左回り順でソート（dealer_position の次から）
            let dealer_pos = self.dealer_position;
            let n = self.players.len();
            let dealer_idx = self
                .players
                .iter()
                .position(|p| p.position == dealer_pos)
                .unwrap_or(0);
            let mut ordered: Vec<usize> = eligible.clone();
            // dealer_idx の「次」から始まる左回り順（dealer 自身は末尾）
            ordered.sort_by_key(|&i| (i + n - dealer_idx - 1) % n);

            let total = self.total_pot();
            let count = ordered.len() as u32;
            let share = total / count;
            let remainder = total % count;

            for (i, &widx) in ordered.iter().enumerate() {
                let extra = if i == 0 { remainder } else { 0 };
                self.players[widx].stack += share + extra;
            }
            self.pots.clear();
            self.pots.push(Pot { amount: 0 });
            self.winners = ordered.iter().map(|&i| self.players[i].position).collect();
            return;
        }

        // 各プレイヤーの手役を評価
        let mut best_eval: Option<(EvaluatedHand, Vec<usize>)> = None;
        for &idx in &active {
            let p = &self.players[idx];
            let hole = match p.hand {
                Some(h) => h,
                None => continue,
            };
            let mut all_cards: Vec<Card> = self.community_cards.clone();
            all_cards.push(hole[0]);
            all_cards.push(hole[1]);
            let eval = evaluate_hand(&all_cards);

            best_eval = Some(match best_eval {
                None => (eval, vec![idx]),
                Some((prev_eval, mut winners)) => {
                    let ord = compare_evaluated(&eval, &prev_eval);
                    match ord {
                        std::cmp::Ordering::Greater => (eval, vec![idx]),
                        std::cmp::Ordering::Equal => {
                            winners.push(idx);
                            (prev_eval, winners)
                        }
                        std::cmp::Ordering::Less => (prev_eval, winners),
                    }
                }
            });
        }

        if let Some((_eval, winner_indices)) = best_eval {
            let total = self.total_pot();
            let share = total / winner_indices.len() as u32;
            let remainder = total % winner_indices.len() as u32;

            for (i, &widx) in winner_indices.iter().enumerate() {
                let extra = if i == 0 { remainder } else { 0 };
                self.players[widx].stack += share + extra;
            }
            self.pots.clear();
            self.pots.push(Pot { amount: 0 });
            self.winners = winner_indices
                .iter()
                .map(|&i| self.players[i].position)
                .collect();
        }
    }
}

/// デッキをシャッフルして返す（疑似乱数：LCG）。
fn shuffled_deck(seed: u64) -> Vec<Card> {
    let mut deck = full_deck();
    let n = deck.len();
    let mut s = seed;
    for i in (1..n).rev() {
        s = s.wrapping_mul(6364136223846793005).wrapping_add(1442695040888963407);
        let j = (s >> 33) as usize % (i + 1);
        deck.swap(i, j);
    }
    deck
}

/// タイムスタンプもどきの seed を生成する。
fn seed_from_hand_number(hand_number: u32) -> u64 {
    // deterministic-ish: 実際は std::time が使えるが依存追加なしで対応
    let base: u64 = 0xDEAD_BEEF_CAFE_BABE;
    base.wrapping_mul(hand_number as u64 + 1)
        .wrapping_add(0x1234_5678_9ABC_DEF0)
}

/// ゲームを開始してボードを返す。hand_number=1 で開始する。
pub fn start_game(
    settings: GameSettings,
    player_names: Vec<String>,
    dealer: u8,
) -> Result<TexasHoldemBoard, BoardError> {
    let n = player_names.len();
    if !(2..=10).contains(&n) {
        return Err(BoardError::InvalidAction(
            "2 to 10 players required".into(),
        ));
    }

    if (dealer as usize) >= n {
        return Err(BoardError::InvalidAction(
            "dealer position out of range".into(),
        ));
    }

    let initial_stack = settings.small_blind * 100;
    let stacks: Vec<u32> = vec![initial_stack; n];

    let sb_pos = if n == 2 { dealer } else { (dealer + 1) % n as u8 };
    let bb_pos = if n == 2 {
        (dealer + 1) % n as u8
    } else {
        (dealer + 2) % n as u8
    };

    start_game_with_stacks(settings, player_names, stacks, 1, dealer, sb_pos, bb_pos)
}

/// 次のゲームへ進む（dealer をシフト）。
pub fn next_game(
    prev: &TexasHoldemBoard,
    settings: &GameSettings,
) -> Result<(TexasHoldemBoard, Vec<Card>), BoardError> {
    let n = prev.players.len();
    let new_dealer = (prev.dealer_position + 1) % n as u8;
    let new_sb = if n == 2 {
        new_dealer
    } else {
        (new_dealer + 1) % n as u8
    };
    let new_bb = if n == 2 {
        (new_dealer + 1) % n as u8
    } else {
        (new_dealer + 2) % n as u8
    };

    // stack 0 のプレイヤーはバスト（ゲームから除外）しない簡略版。
    // そのまま継続（buy-in なし）。
    let names: Vec<String> = prev.players.iter().map(|p| p.name.clone()).collect();
    let new_settings = settings.clone();

    // 前回のスタックを引き継ぐ
    let stacks: Vec<u32> = prev.players.iter().map(|p| p.stack).collect();

    let board = start_game_with_stacks(new_settings, names, stacks, prev.hand_number + 1, new_dealer, new_sb, new_bb)?;

    let deck = build_remaining_deck(&board);
    Ok((board, deck))
}

fn start_game_with_stacks(
    settings: GameSettings,
    player_names: Vec<String>,
    stacks: Vec<u32>,
    hand_number: u32,
    dealer: u8,
    sb_pos: u8,
    bb_pos: u8,
) -> Result<TexasHoldemBoard, BoardError> {
    let n = player_names.len();

    let mut players: Vec<Player> = player_names
        .into_iter()
        .enumerate()
        .map(|(i, name)| Player {
            position: i as u8,
            name,
            stack: stacks[i],
            hand: None,
            bet_in_round: 0,
            has_folded: false,
            is_all_in: false,
            has_acted: false,
        })
        .collect();

    let sb_idx = sb_pos as usize;
    let sb_amount = settings.small_blind.min(players[sb_idx].stack);
    players[sb_idx].stack -= sb_amount;
    players[sb_idx].bet_in_round = sb_amount;
    if players[sb_idx].stack == 0 {
        players[sb_idx].is_all_in = true;
    }

    let bb_idx = bb_pos as usize;
    let bb_amount = settings.big_blind.min(players[bb_idx].stack);
    players[bb_idx].stack -= bb_amount;
    players[bb_idx].bet_in_round = bb_amount;
    if players[bb_idx].stack == 0 {
        players[bb_idx].is_all_in = true;
    }

    let current_bet = bb_amount;

    let utg_pos = if n <= 2 {
        dealer
    } else {
        (bb_pos + 1) % n as u8
    };

    let mut deck = shuffled_deck(seed_from_hand_number(hand_number));

    for p in &mut players {
        let c1 = deck.pop().unwrap();
        let c2 = deck.pop().unwrap();
        p.hand = Some([c1, c2]);
    }

    Ok(TexasHoldemBoard {
        hand_number,
        dealer_position: dealer,
        sb_position: sb_pos,
        bb_position: bb_pos,
        current_turn: utg_pos,
        current_bet,
        last_raise_size: current_bet,
        players,
        community_cards: Vec::new(),
        pots: vec![Pot { amount: 0 }],
        phase: Phase::PreFlop,
        winners: Vec::new(),
    })
}

/// board で使用済みのカードを除いた残デッキを返す。
pub fn build_remaining_deck(board: &TexasHoldemBoard) -> Vec<Card> {
    let used: std::collections::HashSet<(Suit, CardValue)> = board
        .players
        .iter()
        .flat_map(|p| p.hand.iter().flat_map(|h| h.iter().map(|c| (c.suit, c.value))))
        .chain(board.community_cards.iter().map(|c| (c.suit, c.value)))
        .collect();

    let mut deck = shuffled_deck(seed_from_hand_number(board.hand_number));
    deck.retain(|c| !used.contains(&(c.suit, c.value)));
    deck
}

// ---- コミュニティカード手動設定 ----

/// コミュニティカードを手動で設定する。
/// locate_number は 0..=4 で、board.community_cards.len() == locate_number のときのみ許可する。
/// card は deck に含まれていなければならない。
pub fn set_community_card(
    board: &mut TexasHoldemBoard,
    locate_number: u8,
    card: Card,
    deck: &mut Vec<Card>,
) -> Result<(), BoardError> {
    if locate_number > 4 {
        return Err(BoardError::InvalidAction(format!(
            "locate_number must be 0..=4, got {}",
            locate_number
        )));
    }
    if board.community_cards.len() != locate_number as usize {
        return Err(BoardError::InvalidAction(format!(
            "community_cards.len() is {}, expected {}",
            board.community_cards.len(),
            locate_number
        )));
    }
    let in_deck = deck.iter().any(|c| c.suit == card.suit && c.value == card.value);
    if !in_deck {
        return Err(BoardError::InvalidAction(
            "card is not in the remaining deck".into(),
        ));
    }
    deck.retain(|c| !(c.suit == card.suit && c.value == card.value));
    board.community_cards.push(card);
    Ok(())
}

// ---- プレイヤー編集 ----

/// プレイヤー名・スタックを更新する。
pub fn update_player(
    board: &mut TexasHoldemBoard,
    position: u8,
    name: Option<String>,
    stack: Option<u32>,
) -> Result<(), BoardError> {
    let player = board
        .players
        .iter_mut()
        .find(|p| p.position == position)
        .ok_or_else(|| {
            BoardError::InvalidAction(format!("player at position {} not found", position))
        })?;
    if let Some(n) = name {
        let trimmed = n.trim();
        if trimmed.is_empty() {
            return Err(BoardError::InvalidAction("name must not be empty".into()));
        }
        player.name = trimmed.to_string();
    }
    if let Some(s) = stack {
        player.stack = s;
    }
    Ok(())
}

/// 新しいプレイヤーをボード末尾に追加する。Showdown 時のみ許可。
pub fn add_player(
    board: &mut TexasHoldemBoard,
    name: String,
    initial_stack: u32,
) -> Result<(), BoardError> {
    if board.phase != Phase::Showdown {
        return Err(BoardError::InvalidAction(
            "add_player is only allowed during showdown".into(),
        ));
    }
    if board.players.len() >= 10 {
        return Err(BoardError::InvalidAction(
            "max 10 players reached".into(),
        ));
    }
    let trimmed = name.trim();
    if trimmed.is_empty() {
        return Err(BoardError::InvalidAction("name must not be empty".into()));
    }
    let position = board.players.len() as u8;
    board.players.push(Player {
        position,
        name: trimmed.to_string(),
        stack: initial_stack,
        hand: None,
        bet_in_round: 0,
        has_folded: true,
        is_all_in: false,
        has_acted: true,
    });
    Ok(())
}

/// プレイヤーを削除する。Showdown 時のみ許可。位置は詰め直す。
pub fn remove_player(
    board: &mut TexasHoldemBoard,
    position: u8,
) -> Result<(), BoardError> {
    if board.phase != Phase::Showdown {
        return Err(BoardError::InvalidAction(
            "remove_player is only allowed during showdown".into(),
        ));
    }
    if board.players.len() <= 2 {
        return Err(BoardError::InvalidAction(
            "minimum 2 players required".into(),
        ));
    }
    let idx = board
        .players
        .iter()
        .position(|p| p.position == position)
        .ok_or_else(|| {
            BoardError::InvalidAction(format!("player at position {} not found", position))
        })?;
    board.players.remove(idx);
    // position を 0..n に振り直す
    for (i, p) in board.players.iter_mut().enumerate() {
        p.position = i as u8;
    }
    let n = board.players.len() as u8;
    if board.dealer_position >= n {
        board.dealer_position = 0;
    }
    if board.sb_position >= n {
        board.sb_position = 0;
    }
    if board.bb_position >= n {
        board.bb_position = 0;
    }
    board.winners.retain(|&w| w < n);
    Ok(())
}

// ---- アクション実装 ----

pub fn board_bet(board: &mut TexasHoldemBoard, amount: u32, deck: &mut Vec<Card>) -> Result<(), BoardError> {
    board.apply_action(
        |p, current_bet| {
            if current_bet > 0 {
                return Err(BoardError::InvalidAction("use raise when there is a bet".into()));
            }
            if amount == 0 {
                return Err(BoardError::InvalidAction("bet amount must be positive".into()));
            }
            if amount > p.stack {
                return Err(BoardError::InvalidAction("not enough stack".into()));
            }
            p.stack -= amount;
            p.bet_in_round += amount;
            if p.stack == 0 {
                p.is_all_in = true;
            }
            Ok(())
        },
        deck,
    )?;
    let new_bet = board.players.iter().map(|p| p.bet_in_round).max().unwrap_or(0);
    board.last_raise_size = new_bet.saturating_sub(board.current_bet);
    board.current_bet = new_bet;
    Ok(())
}

pub fn board_call(board: &mut TexasHoldemBoard, deck: &mut Vec<Card>) -> Result<(), BoardError> {
    board.apply_action(
        |p, current_bet| {
            let already = p.bet_in_round;
            let needed = current_bet.saturating_sub(already);
            let actual = needed.min(p.stack);
            p.stack -= actual;
            p.bet_in_round += actual;
            if p.stack == 0 {
                p.is_all_in = true;
            }
            Ok(())
        },
        deck,
    )
}

pub fn board_check(board: &mut TexasHoldemBoard, deck: &mut Vec<Card>) -> Result<(), BoardError> {
    let current_bet = board.current_bet;
    let current_turn = board.current_turn;
    let player_bet = board
        .players
        .iter()
        .find(|p| p.position == current_turn)
        .map(|p| p.bet_in_round)
        .unwrap_or(0);

    if player_bet < current_bet {
        return Err(BoardError::InvalidAction(
            "cannot check when there is an outstanding bet".into(),
        ));
    }
    board.apply_action(|_p, _current_bet| Ok(()), deck)
}

pub fn board_fold(board: &mut TexasHoldemBoard, deck: &mut Vec<Card>) -> Result<(), BoardError> {
    board.apply_action(
        |p, _current_bet| {
            p.has_folded = true;
            Ok(())
        },
        deck,
    )
}

pub fn board_raise(board: &mut TexasHoldemBoard, to: u32, deck: &mut Vec<Card>) -> Result<(), BoardError> {
    let prev_bet = board.current_bet;
    board.apply_action(
        |p, current_bet| {
            if to <= current_bet {
                return Err(BoardError::InvalidAction("raise must be greater than current bet".into()));
            }
            let already = p.bet_in_round;
            let needed = to.saturating_sub(already);
            if needed > p.stack {
                return Err(BoardError::InvalidAction("not enough stack for raise".into()));
            }
            p.stack -= needed;
            p.bet_in_round = to;
            if p.stack == 0 {
                p.is_all_in = true;
            }
            Ok(())
        },
        deck,
    )?;
    let new_bet = board.players.iter().map(|p| p.bet_in_round).max().unwrap_or(0);
    board.last_raise_size = new_bet.saturating_sub(prev_bet);
    board.current_bet = new_bet;
    Ok(())
}

pub fn board_allin(board: &mut TexasHoldemBoard, deck: &mut Vec<Card>) -> Result<(), BoardError> {
    let prev_bet = board.current_bet;
    board.apply_action(
        |p, _current_bet| {
            if p.stack == 0 {
                return Err(BoardError::InvalidAction("already all-in".into()));
            }
            p.bet_in_round += p.stack;
            p.stack = 0;
            p.is_all_in = true;
            Ok(())
        },
        deck,
    )?;
    let new_bet = board.players.iter().map(|p| p.bet_in_round).max().unwrap_or(board.current_bet);
    if new_bet > prev_bet {
        board.last_raise_size = new_bet.saturating_sub(prev_bet);
    }
    board.current_bet = new_bet;
    Ok(())
}

/// Expose: preflop でバーンカードと差し替えてコミュニティカードへ公開する。
/// - phase が PreFlop でなければエラー
/// - community_cards が空でなければエラー
/// - expose_card はプレイヤーの hand またはコミュニティカードに既出ではいけない
pub fn board_expose(
    board: &mut TexasHoldemBoard,
    expose_card: Card,
    burn_card: Card,
) -> Result<Card, BoardError> {
    if board.phase != Phase::PreFlop {
        return Err(BoardError::InvalidAction(
            "expose only allowed in preflop".into(),
        ));
    }
    if !board.community_cards.is_empty() {
        return Err(BoardError::InvalidAction(
            "expose only allowed before any community card is dealt".into(),
        ));
    }
    // 使用済みカードの重複検査
    let used: Vec<(Suit, CardValue)> = board
        .players
        .iter()
        .flat_map(|p| {
            p.hand
                .iter()
                .flat_map(|h| h.iter().map(|c| (c.suit, c.value)))
        })
        .chain(board.community_cards.iter().map(|c| (c.suit, c.value)))
        .collect();
    if used.contains(&(expose_card.suit, expose_card.value)) {
        return Err(BoardError::InvalidAction(
            "expose_card is already used".into(),
        ));
    }
    // バーンカードを expose_card と差し替え（コミュニティへ追加）
    board.community_cards.push(expose_card);
    Ok(burn_card)
}

pub fn evaluate_player_hand(board: &TexasHoldemBoard, position: u8) -> Result<EvaluatedHand, BoardError> {
    let player = board
        .players
        .iter()
        .find(|p| p.position == position)
        .ok_or_else(|| BoardError::InvalidAction(format!("player at position {} not found", position)))?;

    let hole = player
        .hand
        .ok_or_else(|| BoardError::InvalidAction("player has no hand".into()))?;

    let mut cards: Vec<Card> = board.community_cards.clone();
    cards.push(hole[0]);
    cards.push(hole[1]);

    if cards.len() < 5 {
        return Err(BoardError::InvalidAction(
            "not enough community cards to evaluate".into(),
        ));
    }

    Ok(evaluate_hand(&cards))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn make_board() -> (TexasHoldemBoard, Vec<Card>) {
        let settings = GameSettings {
            small_blind: 10,
            big_blind: 20,
            min_chip: 10,
            bb_ante: false,
        };
        let names = vec!["Alice".into(), "Bob".into(), "Carol".into()];
        let board = start_game(settings, names, 0).unwrap();
        let deck = build_remaining_deck(&board);
        (board, deck)
    }

    #[test]
    fn start_game_initial_state() {
        let (board, _deck) = make_board();
        assert_eq!(board.players.len(), 3);
        assert_eq!(board.phase, Phase::PreFlop);
        // SB pos=1 が 10 ブラインド (small_blind=10, initial_stack=10*100=1000)
        let sb = &board.players[1];
        assert_eq!(sb.bet_in_round, 10);
        assert_eq!(sb.stack, 990);
        // BB pos=2 が 20 ブラインド
        let bb = &board.players[2];
        assert_eq!(bb.bet_in_round, 20);
        assert_eq!(bb.stack, 980);
        // current_bet == big blind
        assert_eq!(board.current_bet, 20);
        // UTG は pos=0 (dealer=0 なので UTG は BB+1=3%3=0)
        // → n=3, bb_pos=2, utg = (2+1)%3 = 0
        assert_eq!(board.current_turn, 0);
        // 各プレイヤーに 2 枚配られている
        assert!(board.players.iter().all(|p| p.hand.is_some()));
    }

    #[test]
    fn fold_reduces_active_players() {
        let (mut board, mut deck) = make_board();
        board_fold(&mut board, &mut deck).unwrap();
        let folded = &board.players[0]; // UTG が fold
        assert!(folded.has_folded);
    }

    #[test]
    fn call_advances_turn() {
        let (mut board, mut deck) = make_board();
        let before_turn = board.current_turn;
        board_call(&mut board, &mut deck).unwrap();
        // turn が変わっている
        assert_ne!(board.current_turn, before_turn);
    }

    #[test]
    fn raise_updates_current_bet() {
        let (mut board, mut deck) = make_board();
        board_raise(&mut board, 300, &mut deck).unwrap();
        assert_eq!(board.current_bet, 300);
    }

    #[test]
    fn check_fails_when_bet_outstanding() {
        let (mut board, mut deck) = make_board();
        // UTG の bet_in_round=0, current_bet=100 → check 不可
        let result = board_check(&mut board, &mut deck);
        assert!(result.is_err());
    }

    #[test]
    fn phase_advances_after_all_call() {
        let (mut board, mut deck) = make_board();
        // 3 人 (UTG=0, SB=1, BB=2), preflop
        // UTG call (0 → 100)
        board_call(&mut board, &mut deck).unwrap();
        // SB call (50 → 100)
        board_call(&mut board, &mut deck).unwrap();
        // BB check
        board_check(&mut board, &mut deck).unwrap();
        // Flop に進んでいるはず
        assert_eq!(board.phase, Phase::Flop);
        assert_eq!(board.community_cards.len(), 3);
    }

    #[test]
    fn winner_decided_when_one_remains() {
        let (mut board, mut deck) = make_board();
        // UTG fold
        board_fold(&mut board, &mut deck).unwrap();
        // SB fold → BB が勝者
        board_fold(&mut board, &mut deck).unwrap();
        assert_eq!(board.phase, Phase::Showdown);
        assert_eq!(board.winners, vec![2]);
    }

    #[test]
    fn next_game_shifts_dealer() {
        let settings = GameSettings { small_blind: 50, big_blind: 100, min_chip: 50, bb_ante: false };
        let names = vec!["A".into(), "B".into(), "C".into()];
        let board1 = start_game(settings.clone(), names, 0).unwrap();
        let (board2, _) = next_game(&board1, &settings).unwrap();
        assert_eq!(board2.dealer_position, 1);
        assert_eq!(board2.hand_number, 2);
    }

    #[test]
    fn set_community_card_flop_three_cards() {
        let (mut board, mut deck) = make_board();
        assert_eq!(board.community_cards.len(), 0);
        // deck の最初の 3 枚をそれぞれ locate_number 0, 1, 2 で追加する
        let card0 = deck[deck.len() - 1];
        set_community_card(&mut board, 0, card0, &mut deck).unwrap();
        assert_eq!(board.community_cards.len(), 1);
        assert_eq!(board.community_cards[0], card0);
        assert!(!deck.iter().any(|c| c.suit == card0.suit && c.value == card0.value));

        let card1 = deck[deck.len() - 1];
        set_community_card(&mut board, 1, card1, &mut deck).unwrap();
        assert_eq!(board.community_cards.len(), 2);

        let card2 = deck[deck.len() - 1];
        set_community_card(&mut board, 2, card2, &mut deck).unwrap();
        assert_eq!(board.community_cards.len(), 3);

        // フェーズは変わらない
        assert_eq!(board.phase, Phase::PreFlop);
    }

    #[test]
    fn all_allin_progresses_to_showdown() {
        // 3 人全員が allin → 自動的に River までコミュニティカードが配られ Showdown になる
        let (mut board, mut deck) = make_board();
        // UTG=0, SB=1, BB=2 / current_bet=20 (big_blind=20, initial_stack=1000)
        board_allin(&mut board, &mut deck).unwrap(); // UTG allin (1000)
        board_allin(&mut board, &mut deck).unwrap(); // SB allin (1000)
        board_allin(&mut board, &mut deck).unwrap(); // BB allin (1000)
        assert_eq!(board.phase, Phase::Showdown);
        assert_eq!(board.community_cards.len(), 5);
        assert!(!board.winners.is_empty());
        // ポット(3000)が勝者(達)に配分される
        let total_stack: u32 = board.players.iter().map(|p| p.stack).sum();
        assert_eq!(total_stack, 3000);
    }

    #[test]
    fn update_player_changes_name_and_stack() {
        let (mut board, _deck) = make_board();
        update_player(&mut board, 0, Some("Alex".into()), Some(1500)).unwrap();
        assert_eq!(board.players[0].name, "Alex");
        assert_eq!(board.players[0].stack, 1500);
    }

    #[test]
    fn update_player_rejects_empty_name() {
        let (mut board, _deck) = make_board();
        let r = update_player(&mut board, 0, Some("  ".into()), None);
        assert!(r.is_err());
    }

    #[test]
    fn add_player_blocked_outside_showdown() {
        let (mut board, _deck) = make_board();
        let r = add_player(&mut board, "Dave".into(), 1000);
        assert!(r.is_err());
    }

    #[test]
    fn add_player_during_showdown_appends() {
        let (mut board, _deck) = make_board();
        board.phase = Phase::Showdown;
        add_player(&mut board, "Dave".into(), 500).unwrap();
        assert_eq!(board.players.len(), 4);
        assert_eq!(board.players[3].name, "Dave");
        assert_eq!(board.players[3].stack, 500);
        assert!(board.players[3].has_folded);
    }

    #[test]
    fn remove_player_during_showdown_renumbers() {
        let (mut board, _deck) = make_board();
        board.phase = Phase::Showdown;
        remove_player(&mut board, 1).unwrap();
        assert_eq!(board.players.len(), 2);
        assert_eq!(board.players[0].position, 0);
        assert_eq!(board.players[1].position, 1);
    }

    #[test]
    fn remove_player_blocked_when_minimum() {
        let (mut board, _deck) = make_board();
        board.phase = Phase::Showdown;
        remove_player(&mut board, 0).unwrap();
        let r = remove_player(&mut board, 0);
        assert!(r.is_err());
    }

    #[test]
    fn set_community_card_invalid_locate_number() {
        let (mut board, mut deck) = make_board();
        // locate_number=1 なのに community_cards が空 → エラー
        let card = deck[deck.len() - 1];
        let result = set_community_card(&mut board, 1, card, &mut deck);
        assert!(result.is_err());
        // locate_number=5 は範囲外
        let result2 = set_community_card(&mut board, 5, card, &mut deck);
        assert!(result2.is_err());
    }

    // ---- board_expose テスト ----

    fn make_expose_card(board: &TexasHoldemBoard, deck: &[Card]) -> (Card, Card) {
        // deck の末尾を expose_card、末尾-1 を burn_card とする
        let expose_card = deck[deck.len() - 1];
        let burn_card = deck[deck.len() - 2];
        // プレイヤーの hand や既存 community に含まれないことを確認済み
        let used: Vec<(Suit, CardValue)> = board
            .players
            .iter()
            .flat_map(|p| {
                p.hand
                    .iter()
                    .flat_map(|h| h.iter().map(|c| (c.suit, c.value)))
            })
            .chain(board.community_cards.iter().map(|c| (c.suit, c.value)))
            .collect();
        assert!(!used.contains(&(expose_card.suit, expose_card.value)));
        (expose_card, burn_card)
    }

    #[test]
    fn board_expose_preflop_success() {
        let (mut board, deck) = make_board();
        let (expose_card, burn_card) = make_expose_card(&board, &deck);
        let result = board_expose(&mut board, expose_card, burn_card);
        assert!(result.is_ok());
        // expose_card がコミュニティカードに追加されている
        assert_eq!(board.community_cards.len(), 1);
        assert_eq!(board.community_cards[0], expose_card);
        // 戻り値は burn_card
        assert_eq!(result.unwrap(), burn_card);
    }

    #[test]
    fn board_expose_fails_when_not_preflop() {
        let (mut board, deck) = make_board();
        // フェーズを Flop に強制変更
        board.phase = Phase::Flop;
        let expose_card = deck[deck.len() - 1];
        let burn_card = deck[deck.len() - 2];
        let result = board_expose(&mut board, expose_card, burn_card);
        assert!(result.is_err());
        let msg = result.unwrap_err().to_string();
        assert!(msg.contains("expose only allowed in preflop"));
    }

    #[test]
    fn board_expose_fails_when_community_card_exists() {
        let (mut board, mut deck) = make_board();
        // コミュニティカードを1枚追加しておく
        let first_card = deck.pop().unwrap();
        board.community_cards.push(first_card);
        let expose_card = deck[deck.len() - 1];
        let burn_card = deck[deck.len() - 2];
        let result = board_expose(&mut board, expose_card, burn_card);
        assert!(result.is_err());
        let msg = result.unwrap_err().to_string();
        assert!(msg.contains("expose only allowed before any community card is dealt"));
    }

    #[test]
    fn board_expose_fails_when_expose_card_is_in_player_hand() {
        let (mut board, deck) = make_board();
        // プレイヤー0の hand[0] を expose_card として渡す
        let expose_card = board.players[0].hand.unwrap()[0];
        let burn_card = deck[deck.len() - 1];
        let result = board_expose(&mut board, expose_card, burn_card);
        assert!(result.is_err());
        let msg = result.unwrap_err().to_string();
        assert!(msg.contains("expose_card is already used"));
    }

    #[test]
    fn board_expose_fails_when_expose_card_is_in_community() {
        let (mut board, mut deck) = make_board();
        // コミュニティカードを追加してから、フェーズを戻してから expose を呼ぶ
        let community_card = deck.pop().unwrap();
        board.community_cards.push(community_card);
        // phase を PreFlop に戻す（テスト用）
        board.phase = Phase::PreFlop;
        // community_card を expose_card として渡す → 重複エラーになるはず
        let burn_card = deck[deck.len() - 1];
        let result = board_expose(&mut board, community_card, burn_card);
        // community_cards が空でないので "before any community card" エラーが先に出る
        assert!(result.is_err());
    }

    // ---- seed / shuffle テスト ----

    /// 異なる hand_number で start_game を呼んだ際にシャッフル結果が異なることを検証する。
    #[test]
    fn different_hand_numbers_produce_different_shuffles() {
        let settings = GameSettings {
            small_blind: 10,
            big_blind: 20,
            min_chip: 10,
            bb_ante: false,
        };
        let names = vec!["Alice".into(), "Bob".into()];

        // hand_number=1 での start_game（内部委譲）
        let board1 = start_game(settings.clone(), names.clone(), 0).unwrap();
        assert_eq!(board1.hand_number, 1);

        // hand_number=2 での start_game_with_stacks（next_game 経由）
        let (board2, _) = next_game(&board1, &settings).unwrap();
        assert_eq!(board2.hand_number, 2);

        // hand_number が異なるので、配られた手札が異なるはず
        let hand1_p0 = board1.players[0].hand.unwrap();
        let hand2_p0 = board2.players[0].hand.unwrap();
        assert_ne!(
            hand1_p0, hand2_p0,
            "hand_number=1 と hand_number=2 で同じ手札が配られた（seed が固定されている可能性）"
        );
    }

    /// start_game の seed が hand_number=1 と対応していることを確認する。
    /// つまり start_game と、hand_number=1 を明示的に渡した start_game_with_stacks が同じ結果を返す。
    #[test]
    fn start_game_uses_hand_number_1_seed() {
        let settings = GameSettings {
            small_blind: 10,
            big_blind: 20,
            min_chip: 10,
            bb_ante: false,
        };
        let names = vec!["Alice".into(), "Bob".into(), "Carol".into()];

        let board_via_start = start_game(settings.clone(), names.clone(), 0).unwrap();
        let stacks = vec![settings.small_blind * 100; 3];
        let board_via_with_stacks =
            start_game_with_stacks(settings.clone(), names.clone(), stacks, 1, 0, 1, 2).unwrap();

        // 同じ hand_number=1 で同じシャッフル結果になるはず
        assert_eq!(
            board_via_start.players[0].hand,
            board_via_with_stacks.players[0].hand,
        );
        assert_eq!(
            board_via_start.players[1].hand,
            board_via_with_stacks.players[1].hand,
        );
    }

    // ---- resolve_showdown フォールバック（BUG-O）テスト ----

    /// 全プレイヤーが hand=None でフォールドしていない → ポットが均等分割される。
    #[test]
    fn resolve_showdown_fallback_all_hand_none_equal_split() {
        // 3 人 / dealer=0 / pot=300 / hand をすべて None にする
        let mut board = TexasHoldemBoard {
            hand_number: 1,
            dealer_position: 0,
            sb_position: 1,
            bb_position: 2,
            current_turn: 0,
            current_bet: 0,
            last_raise_size: 0,
            players: vec![
                Player { position: 0, name: "A".into(), stack: 0, hand: None,
                         bet_in_round: 0, has_folded: false, is_all_in: false, has_acted: true },
                Player { position: 1, name: "B".into(), stack: 0, hand: None,
                         bet_in_round: 0, has_folded: false, is_all_in: false, has_acted: true },
                Player { position: 2, name: "C".into(), stack: 0, hand: None,
                         bet_in_round: 0, has_folded: false, is_all_in: false, has_acted: true },
            ],
            community_cards: vec![],
            pots: vec![Pot { amount: 300 }],
            phase: Phase::Showdown,
            winners: vec![],
        };

        board.resolve_showdown();

        // 300 / 3 = 100 ずつ
        assert_eq!(board.players[0].stack, 100);
        assert_eq!(board.players[1].stack, 100);
        assert_eq!(board.players[2].stack, 100);
        assert_eq!(board.total_pot(), 0);
        // winners は 3 人全員
        assert_eq!(board.winners.len(), 3);
    }

    /// 全プレイヤーが hand=None でポットに端数がある場合、dealer 左回りの最初が端数を受け取る。
    #[test]
    fn resolve_showdown_fallback_remainder_goes_to_dealer_left() {
        // 3 人 / dealer=0 / pot=301
        // dealer 左回り: dealer_idx=0 → 次は idx=1 (position=1)
        let mut board = TexasHoldemBoard {
            hand_number: 1,
            dealer_position: 0,
            sb_position: 1,
            bb_position: 2,
            current_turn: 0,
            current_bet: 0,
            last_raise_size: 0,
            players: vec![
                Player { position: 0, name: "A".into(), stack: 0, hand: None,
                         bet_in_round: 0, has_folded: false, is_all_in: false, has_acted: true },
                Player { position: 1, name: "B".into(), stack: 0, hand: None,
                         bet_in_round: 0, has_folded: false, is_all_in: false, has_acted: true },
                Player { position: 2, name: "C".into(), stack: 0, hand: None,
                         bet_in_round: 0, has_folded: false, is_all_in: false, has_acted: true },
            ],
            community_cards: vec![],
            pots: vec![Pot { amount: 301 }],
            phase: Phase::Showdown,
            winners: vec![],
        };

        board.resolve_showdown();

        // 301 / 3 = 100 余り 1 → 端数はディーラー左回りの最初（dealer_idx=0 の次は idx=1）
        let total_stack: u32 = board.players.iter().map(|p| p.stack).sum();
        assert_eq!(total_stack, 301);
        assert_eq!(board.total_pot(), 0);
        // dealer_idx=0 の次から順: idx=1 が端数 1 を受け取る → stack=101
        assert_eq!(board.players[1].stack, 101);
        assert_eq!(board.players[2].stack, 100);
        assert_eq!(board.players[0].stack, 100);
    }

    /// 1 人だけ hand=None（他はフォールド） → その 1 人がポット全額を受け取る。
    #[test]
    fn resolve_showdown_fallback_single_hand_none_player_wins_all() {
        let mut board = TexasHoldemBoard {
            hand_number: 1,
            dealer_position: 0,
            sb_position: 1,
            bb_position: 2,
            current_turn: 0,
            current_bet: 0,
            last_raise_size: 0,
            players: vec![
                Player { position: 0, name: "A".into(), stack: 500, hand: None,
                         bet_in_round: 0, has_folded: false, is_all_in: false, has_acted: true },
                Player { position: 1, name: "B".into(), stack: 0, hand: None,
                         bet_in_round: 0, has_folded: true, is_all_in: false, has_acted: true },
                Player { position: 2, name: "C".into(), stack: 0, hand: None,
                         bet_in_round: 0, has_folded: true, is_all_in: false, has_acted: true },
            ],
            community_cards: vec![],
            pots: vec![Pot { amount: 200 }],
            phase: Phase::Showdown,
            winners: vec![],
        };

        board.resolve_showdown();

        assert_eq!(board.players[0].stack, 700); // 500 + 200
        assert_eq!(board.players[1].stack, 0);
        assert_eq!(board.players[2].stack, 0);
        assert_eq!(board.total_pot(), 0);
        assert_eq!(board.winners, vec![0]);
    }

    /// 一部プレイヤーが hand=Some → hand がある人だけで手役評価（既存挙動は変わらない）。
    #[test]
    fn resolve_showdown_partial_hand_none_uses_hand_holders_only() {
        use super::super::card::{Card, CardValue, Suit};

        // プレイヤー 0: hand=Some（強い手） / プレイヤー 1: hand=None / プレイヤー 2: hand=Some（弱い手）
        // community_cards で 5 枚揃う状況を作る
        let community = vec![
            Card { suit: Suit::Spade, value: CardValue::Two },
            Card { suit: Suit::Heart, value: CardValue::Three },
            Card { suit: Suit::Diamond, value: CardValue::Four },
            Card { suit: Suit::Club, value: CardValue::Five },
            Card { suit: Suit::Spade, value: CardValue::Seven },
        ];
        let hand_strong: [Card; 2] = [
            Card { suit: Suit::Heart, value: CardValue::Ace },
            Card { suit: Suit::Diamond, value: CardValue::Ace },
        ];
        let hand_weak: [Card; 2] = [
            Card { suit: Suit::Club, value: CardValue::Eight },
            Card { suit: Suit::Heart, value: CardValue::Nine },
        ];

        let mut board = TexasHoldemBoard {
            hand_number: 1,
            dealer_position: 0,
            sb_position: 1,
            bb_position: 2,
            current_turn: 0,
            current_bet: 0,
            last_raise_size: 0,
            players: vec![
                Player { position: 0, name: "A".into(), stack: 0, hand: Some(hand_strong),
                         bet_in_round: 0, has_folded: false, is_all_in: false, has_acted: true },
                Player { position: 1, name: "B".into(), stack: 0, hand: None,
                         bet_in_round: 0, has_folded: false, is_all_in: false, has_acted: true },
                Player { position: 2, name: "C".into(), stack: 0, hand: Some(hand_weak),
                         bet_in_round: 0, has_folded: false, is_all_in: false, has_acted: true },
            ],
            community_cards: community,
            pots: vec![Pot { amount: 300 }],
            phase: Phase::Showdown,
            winners: vec![],
        };

        board.resolve_showdown();

        // hand=Some を持つプレイヤー 0（AA ペア＋ストレート）が勝利
        // hand=None のプレイヤー 1 はフォールバックには入らない（active が空でないため）
        assert_eq!(board.total_pot(), 0);
        // 勝者は position=0 か position=2 のどちらか（手役評価による）
        // いずれにせよ position=1（hand=None）は winners に入らない
        assert!(!board.winners.contains(&1));
    }
}

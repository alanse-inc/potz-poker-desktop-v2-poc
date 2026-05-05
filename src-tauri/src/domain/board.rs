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
    /// このハンドで累計投入したチップ額（サイドポット計算用）。フェーズをまたいでリセットしない。
    #[serde(default)]
    pub total_invested: u32,
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
            match self.next_active_position_after(self.dealer_position) {
                Some(pos) => self.current_turn = pos,
                None => self.current_turn = u8::MAX,
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
        let bet_before = player.bet_in_round;
        f(&mut player, current_bet)?;
        player.total_invested += player.bet_in_round.saturating_sub(bet_before);
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

        // bet/raise 後に is_round_complete を評価する前に current_bet を暫定更新する。
        // これにより bet/raise した直後に古い current_bet で即 true 判定されることを防ぐ。
        let max_bet_in_round = self.players.iter().map(|p| p.bet_in_round).max().unwrap_or(0);
        let new_current_bet = self.current_bet.max(max_bet_in_round);
        if new_current_bet > self.current_bet {
            // ベット/レイズが発生した場合、他のアクティブプレイヤーの has_acted をリセットする。
            // これにより先行チェック済みプレイヤーがベットに応答できるようになる。
            for i in 0..self.players.len() {
                if i != idx && !self.players[i].has_folded && !self.players[i].is_all_in {
                    self.players[i].has_acted = false;
                }
            }
        }
        self.current_bet = new_current_bet;

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

            tracing::warn!(
                "resolve_showdown: all active players have hand=None; \
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

        // dealer-left ordering ヘルパー: dealer の左隣から始まる順序でソートするキーを返す。
        let n = self.players.len();
        let dealer_pos = self.dealer_position;
        let dealer_idx = self
            .players
            .iter()
            .position(|p| p.position == dealer_pos)
            .unwrap_or(0);
        let dealer_left_key = |i: usize| (i + n - dealer_idx - 1) % n;

        // 各プレイヤーの手役を評価（active = has_hand のプレイヤー）
        let evals: Vec<(usize, EvaluatedHand)> = active
            .iter()
            .filter_map(|&idx| {
                let p = &self.players[idx];
                let hole = p.hand?;
                let mut all_cards: Vec<Card> = self.community_cards.clone();
                all_cards.push(hole[0]);
                all_cards.push(hole[1]);
                Some((idx, evaluate_hand(&all_cards)))
            })
            .collect();

        if evals.is_empty() {
            return;
        }

        // サイドポット計算:
        // 各プレイヤーの total_invested をしきい値として使いポットを切り分ける。
        let total_invested: Vec<u32> = self.players.iter().map(|p| p.total_invested).collect();
        let mut thresholds: Vec<u32> = total_invested.clone();
        thresholds.sort_unstable();
        thresholds.dedup();
        // 0 は除く
        thresholds.retain(|&t| t > 0);
        if thresholds.is_empty() {
            // total_invested が全員 0 のとき（ゲーム開始直後のエッジケース）
            // pots の合計を均等分割する
            thresholds.push(1);
        }

        let mut all_winner_positions: Vec<u8> = Vec::new();
        let mut prev_threshold: u32 = 0;
        let total_pot_before = self.total_pot();
        let mut distributed: u32 = 0;

        for &threshold in &thresholds {
            let level_amount = threshold - prev_threshold;
            // このレベルに参加しているプレイヤー数（prev_threshold より多く投入したプレイヤー）
            let contributors = total_invested.iter().filter(|&&ti| ti > prev_threshold).count() as u32;
            let pot_amount = level_amount * contributors;

            // このポットの勝者候補: total_invested >= threshold かつ has_folded でない
            let eligible_for_pot: Vec<usize> = (0..self.players.len())
                .filter(|&i| total_invested[i] >= threshold && !self.players[i].has_folded)
                .collect();

            if eligible_for_pot.is_empty() {
                // 勝者候補なし（全員フォールド済み）→ 次のレベルへ持ち越し
                prev_threshold = threshold;
                continue;
            }

            // eligible_for_pot の中で hand を持つプレイヤーのみ手役勝者候補
            let mut best_eval_pot: Option<(EvaluatedHand, Vec<usize>)> = None;
            for &idx in &eligible_for_pot {
                if let Some((_, eval)) = evals.iter().find(|(i, _)| *i == idx) {
                    best_eval_pot = Some(match best_eval_pot {
                        None => (eval.clone(), vec![idx]),
                        Some((prev_eval, mut winners)) => {
                            let ord = compare_evaluated(eval, &prev_eval);
                            match ord {
                                std::cmp::Ordering::Greater => (eval.clone(), vec![idx]),
                                std::cmp::Ordering::Equal => {
                                    winners.push(idx);
                                    (prev_eval, winners)
                                }
                                std::cmp::Ordering::Less => (prev_eval, winners),
                            }
                        }
                    });
                }
            }

            // hand を持つ勝者がいない場合は eligible 全員で均等分割（フォールバック）
            let pot_winners: Vec<usize> = if let Some((_, w)) = best_eval_pot {
                w
            } else {
                eligible_for_pot.clone()
            };

            // dealer-left ordering でソート
            let mut ordered_winners = pot_winners.clone();
            ordered_winners.sort_by_key(|&i| dealer_left_key(i));

            let share = pot_amount / ordered_winners.len() as u32;
            let remainder = pot_amount % ordered_winners.len() as u32;

            for (i, &widx) in ordered_winners.iter().enumerate() {
                let extra = if i == 0 { remainder } else { 0 };
                self.players[widx].stack += share + extra;
                distributed += share + extra;
                let pos = self.players[widx].position;
                if !all_winner_positions.contains(&pos) {
                    all_winner_positions.push(pos);
                }
            }

            prev_threshold = threshold;
        }

        // total_invested が 0 のプレイヤーがポットに入れていない場合など、
        // 端数が残っていたら dealer-left の最初の非フォールドプレイヤーに渡す。
        let undistributed = total_pot_before.saturating_sub(distributed);
        if undistributed > 0 {
            let mut leftover_candidates: Vec<usize> = (0..self.players.len())
                .filter(|&i| !self.players[i].has_folded)
                .collect();
            leftover_candidates.sort_by_key(|&i| dealer_left_key(i));
            if let Some(&widx) = leftover_candidates.first() {
                self.players[widx].stack += undistributed;
                let pos = self.players[widx].position;
                if !all_winner_positions.contains(&pos) {
                    all_winner_positions.push(pos);
                }
            }
        }

        self.pots.clear();
        self.pots.push(Pot { amount: 0 });
        // winners を dealer-left ordering でソート
        all_winner_positions.sort_by_key(|&pos| {
            let idx = self.players.iter().position(|p| p.position == pos).unwrap_or(0);
            dealer_left_key(idx)
        });
        self.winners = all_winner_positions;
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
            total_invested: 0,
        })
        .collect();

    let sb_idx = sb_pos as usize;
    let sb_amount = settings.small_blind.min(players[sb_idx].stack);
    players[sb_idx].stack -= sb_amount;
    players[sb_idx].bet_in_round = sb_amount;
    players[sb_idx].total_invested = sb_amount;
    if players[sb_idx].stack == 0 {
        players[sb_idx].is_all_in = true;
    }

    let bb_idx = bb_pos as usize;
    let bb_amount = settings.big_blind.min(players[bb_idx].stack);
    players[bb_idx].stack -= bb_amount;
    players[bb_idx].bet_in_round = bb_amount;
    players[bb_idx].total_invested = bb_amount;
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
        let c1 = deck.pop().ok_or_else(|| BoardError::InvalidAction("deck exhausted".into()))?;
        let c2 = deck.pop().ok_or_else(|| BoardError::InvalidAction("deck exhausted".into()))?;
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
        total_invested: 0,
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
    let prev_bet = board.current_bet;
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
    board.last_raise_size = new_bet.saturating_sub(prev_bet);
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
    // min raise validation: to >= current_bet + last_raise_size（all-in 例外あり）
    {
        let min_raise_to = board.current_bet.saturating_add(board.last_raise_size);
        let p_idx = board
            .current_player_idx()
            .ok_or_else(|| BoardError::InvalidAction("current player not found".into()))?;
        let p = &board.players[p_idx];
        let all_in_total = p.stack + p.bet_in_round;
        if to < min_raise_to && to != all_in_total {
            return Err(BoardError::InvalidAction(format!(
                "raise must be at least {} (or all-in {}); got {}",
                min_raise_to, all_in_total, to
            )));
        }
    }
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
                         bet_in_round: 0, has_folded: false, is_all_in: false, has_acted: true, total_invested: 100 },
                Player { position: 1, name: "B".into(), stack: 0, hand: None,
                         bet_in_round: 0, has_folded: false, is_all_in: false, has_acted: true, total_invested: 100 },
                Player { position: 2, name: "C".into(), stack: 0, hand: None,
                         bet_in_round: 0, has_folded: false, is_all_in: false, has_acted: true, total_invested: 100 },
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
                         bet_in_round: 0, has_folded: false, is_all_in: false, has_acted: true, total_invested: 100 },
                Player { position: 1, name: "B".into(), stack: 0, hand: None,
                         bet_in_round: 0, has_folded: false, is_all_in: false, has_acted: true, total_invested: 101 },
                Player { position: 2, name: "C".into(), stack: 0, hand: None,
                         bet_in_round: 0, has_folded: false, is_all_in: false, has_acted: true, total_invested: 100 },
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
                         bet_in_round: 0, has_folded: false, is_all_in: false, has_acted: true, total_invested: 200 },
                Player { position: 1, name: "B".into(), stack: 0, hand: None,
                         bet_in_round: 0, has_folded: true, is_all_in: false, has_acted: true, total_invested: 0 },
                Player { position: 2, name: "C".into(), stack: 0, hand: None,
                         bet_in_round: 0, has_folded: true, is_all_in: false, has_acted: true, total_invested: 0 },
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
                         bet_in_round: 0, has_folded: false, is_all_in: false, has_acted: true, total_invested: 100 },
                Player { position: 1, name: "B".into(), stack: 0, hand: None,
                         bet_in_round: 0, has_folded: false, is_all_in: false, has_acted: true, total_invested: 100 },
                Player { position: 2, name: "C".into(), stack: 0, hand: Some(hand_weak),
                         bet_in_round: 0, has_folded: false, is_all_in: false, has_acted: true, total_invested: 100 },
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

    // ================================================================
    // Bug 1: apply_action 内 is_round_complete の current_bet 古値問題
    // ================================================================

    /// 3人ゲーム（1人フォールド後の flop）: A check → B bet → フェーズは Flop のまま。
    #[test]
    fn bet_does_not_advance_phase_in_two_active_players() {
        use super::super::card::{Card, CardValue, Suit};
        // 3 人、dealer=0, SB=1, BB=2。SB が fold 後 flop 状態を作る。
        // flop の current_turn = dealer 左の最初のアクティブ = pos=1 (SB)
        // SB が fold、BB だけ残るが、ここでは A=pos1, B=pos2 で 2 人残す。
        // pos=0 がフォールド済み、pos=1(A) check, pos=2(B) bet の順
        let community = vec![
            Card { suit: Suit::Spade, value: CardValue::Two },
            Card { suit: Suit::Heart, value: CardValue::Three },
            Card { suit: Suit::Diamond, value: CardValue::Four },
        ];
        let hand_a: [Card; 2] = [
            Card { suit: Suit::Club, value: CardValue::King },
            Card { suit: Suit::Heart, value: CardValue::Queen },
        ];
        let hand_b: [Card; 2] = [
            Card { suit: Suit::Spade, value: CardValue::Nine },
            Card { suit: Suit::Club, value: CardValue::Eight },
        ];
        let mut board = TexasHoldemBoard {
            hand_number: 1,
            dealer_position: 0,
            sb_position: 1,
            bb_position: 2,
            current_turn: 1, // A のターン
            current_bet: 0,
            last_raise_size: 0,
            players: vec![
                Player { position: 0, name: "X".into(), stack: 900, hand: None,
                         bet_in_round: 0, has_folded: true, is_all_in: false, has_acted: true, total_invested: 100 },
                Player { position: 1, name: "A".into(), stack: 900, hand: Some(hand_a),
                         bet_in_round: 0, has_folded: false, is_all_in: false, has_acted: false, total_invested: 100 },
                Player { position: 2, name: "B".into(), stack: 900, hand: Some(hand_b),
                         bet_in_round: 0, has_folded: false, is_all_in: false, has_acted: false, total_invested: 100 },
            ],
            community_cards: community,
            pots: vec![Pot { amount: 300 }],
            phase: Phase::Flop,
            winners: vec![],
        };
        let mut deck = Vec::new(); // deck は空でも ok（advance_phase で pop するが Flop 後は不要）

        // A: check
        board_check(&mut board, &mut deck).unwrap();
        assert_eq!(board.current_turn, 2); // B のターンへ
        assert_eq!(board.phase, Phase::Flop); // まだ Flop

        // B: bet 100
        board_bet(&mut board, 100, &mut deck).unwrap();
        // bet 後もフェーズは Flop のまま（A が応答していないため）
        assert_eq!(board.phase, Phase::Flop, "bet after check should not advance phase");
        // 次は A のターン
        assert_eq!(board.current_turn, 1, "turn should go back to A");
        // A の has_acted が false にリセットされている
        assert!(!board.players[1].has_acted, "A's has_acted should be false after B bet");
    }

    /// 3人ゲーム（1人フォールド後の flop）: A check → B bet → A raise → フェーズは Flop のまま（B 未応答）。
    #[test]
    fn raise_does_not_advance_phase_in_two_active_players() {
        use super::super::card::{Card, CardValue, Suit};
        let community = vec![
            Card { suit: Suit::Spade, value: CardValue::Two },
            Card { suit: Suit::Heart, value: CardValue::Three },
            Card { suit: Suit::Diamond, value: CardValue::Four },
        ];
        let hand_a: [Card; 2] = [
            Card { suit: Suit::Club, value: CardValue::King },
            Card { suit: Suit::Heart, value: CardValue::Queen },
        ];
        let hand_b: [Card; 2] = [
            Card { suit: Suit::Spade, value: CardValue::Nine },
            Card { suit: Suit::Club, value: CardValue::Eight },
        ];
        let mut board = TexasHoldemBoard {
            hand_number: 1,
            dealer_position: 0,
            sb_position: 1,
            bb_position: 2,
            current_turn: 1,
            current_bet: 0,
            last_raise_size: 0,
            players: vec![
                Player { position: 0, name: "X".into(), stack: 900, hand: None,
                         bet_in_round: 0, has_folded: true, is_all_in: false, has_acted: true, total_invested: 100 },
                Player { position: 1, name: "A".into(), stack: 900, hand: Some(hand_a),
                         bet_in_round: 0, has_folded: false, is_all_in: false, has_acted: false, total_invested: 100 },
                Player { position: 2, name: "B".into(), stack: 900, hand: Some(hand_b),
                         bet_in_round: 0, has_folded: false, is_all_in: false, has_acted: false, total_invested: 100 },
            ],
            community_cards: community,
            pots: vec![Pot { amount: 300 }],
            phase: Phase::Flop,
            winners: vec![],
        };
        let mut deck = Vec::new();

        // A check
        board_check(&mut board, &mut deck).unwrap();
        // B bet 100
        board_bet(&mut board, 100, &mut deck).unwrap();
        assert_eq!(board.phase, Phase::Flop);
        assert_eq!(board.current_turn, 1); // A のターン
        assert!(!board.players[1].has_acted, "A's has_acted reset after B bet");

        // A raise 200（B のベットに対してリレイズ）
        board_raise(&mut board, 200, &mut deck).unwrap();
        // フェーズは Flop のまま（B が応答していないため）
        assert_eq!(board.phase, Phase::Flop, "raise should not advance phase");
        assert_eq!(board.current_turn, 2, "turn should be B's");
        assert!(!board.players[2].has_acted, "B's has_acted should be false after A raise");
    }

    /// ヘッズアップ flop: BB check → BTN bet → フェーズは Flop のまま。
    #[test]
    fn heads_up_flop_bet_does_not_advance_phase() {
        use super::super::card::{Card, CardValue, Suit};
        let community = vec![
            Card { suit: Suit::Spade, value: CardValue::Two },
            Card { suit: Suit::Heart, value: CardValue::Three },
            Card { suit: Suit::Diamond, value: CardValue::Four },
        ];
        let hand_btn: [Card; 2] = [
            Card { suit: Suit::Club, value: CardValue::King },
            Card { suit: Suit::Heart, value: CardValue::Queen },
        ];
        let hand_bb: [Card; 2] = [
            Card { suit: Suit::Spade, value: CardValue::Nine },
            Card { suit: Suit::Club, value: CardValue::Eight },
        ];
        // ヘッズアップ: dealer=BTN=pos0, BB=pos1
        // flop の current_turn は dealer の次(dealer 自身) = pos1(BB) → dealer left = pos0?
        // next_active_position_after(dealer=0) の次 = pos1(BB)
        // ヘッズアップ flop: SB/BTN が先にアクション
        let mut board = TexasHoldemBoard {
            hand_number: 1,
            dealer_position: 0,
            sb_position: 0, // ヘッズアップ: dealer=SB=BTN=pos0
            bb_position: 1,
            current_turn: 1, // BB が先（flop では dealer 左から）
            current_bet: 0,
            last_raise_size: 0,
            players: vec![
                Player { position: 0, name: "BTN".into(), stack: 900, hand: Some(hand_btn),
                         bet_in_round: 0, has_folded: false, is_all_in: false, has_acted: false, total_invested: 100 },
                Player { position: 1, name: "BB".into(), stack: 900, hand: Some(hand_bb),
                         bet_in_round: 0, has_folded: false, is_all_in: false, has_acted: false, total_invested: 100 },
            ],
            community_cards: community,
            pots: vec![Pot { amount: 200 }],
            phase: Phase::Flop,
            winners: vec![],
        };
        let mut deck = Vec::new();

        // BB check
        board_check(&mut board, &mut deck).unwrap();
        assert_eq!(board.current_turn, 0); // BTN のターン

        // BTN bet 100
        board_bet(&mut board, 100, &mut deck).unwrap();
        // フェーズは Flop のまま
        assert_eq!(board.phase, Phase::Flop, "bet should not advance phase in heads-up");
        // 次は BB のターン
        assert_eq!(board.current_turn, 1, "turn should be BB's");
    }

    // ================================================================
    // Bug 2: サイドポット計算
    // ================================================================

    /// スタック 1000/400/200 の 3 人全員 all-in、200 のプレイヤーが最強ハンドで勝利。
    /// short stack は 200×3=600 のみ受け取り、残り 600+400 は別の勝者へ。
    #[test]
    fn side_pot_short_stack_winner() {
        use super::super::card::{Card, CardValue, Suit};
        // コミュニティカード: 2s 3h 4d 5c 7s (ストレートになりやすい)
        let community = vec![
            Card { suit: Suit::Spade, value: CardValue::Two },
            Card { suit: Suit::Heart, value: CardValue::Three },
            Card { suit: Suit::Diamond, value: CardValue::Four },
            Card { suit: Suit::Club, value: CardValue::Five },
            Card { suit: Suit::Spade, value: CardValue::Seven },
        ];
        // p0 (short stack=200): AA → AA ペア + ストレートボードでロイヤルな役
        //   コミュニティ: 2 3 4 5 7 + AA → ストレート (A2345) + AA で最強役はストレート or ペア
        //   実際の手役: A 2 3 4 5 でストレート (wheel)
        let hand_short: [Card; 2] = [
            Card { suit: Suit::Heart, value: CardValue::Ace },
            Card { suit: Suit::Diamond, value: CardValue::Ace },
        ];
        // p1 (mid stack=400): K9 → ハイカード
        let hand_mid: [Card; 2] = [
            Card { suit: Suit::Club, value: CardValue::King },
            Card { suit: Suit::Heart, value: CardValue::Nine },
        ];
        // p2 (big stack=1000): QJ → ハイカード
        let hand_big: [Card; 2] = [
            Card { suit: Suit::Spade, value: CardValue::Queen },
            Card { suit: Suit::Club, value: CardValue::Jack },
        ];

        // total_invested: p0=200, p1=400, p2=400（p2 は 1000 スタックだが 400 だけ投入）
        // サイドポット計算:
        // threshold=200: 200 * 3 = 600 → 勝者は p0（AA ストレート最強）→ p0 に 600
        // threshold=400: (400-200) * 2 = 400 → 勝者は p1/p2 の中の最強。K9 vs QJ → p1(K9) に 400
        // p2 は 1000-400=600 残スタック（投入なし分）
        let mut board = TexasHoldemBoard {
            hand_number: 1,
            dealer_position: 0,
            sb_position: 1,
            bb_position: 2,
            current_turn: 0,
            current_bet: 400,
            last_raise_size: 0,
            players: vec![
                Player { position: 0, name: "Short".into(), stack: 0, hand: Some(hand_short),
                         bet_in_round: 0, has_folded: false, is_all_in: true, has_acted: true, total_invested: 200 },
                Player { position: 1, name: "Mid".into(), stack: 0, hand: Some(hand_mid),
                         bet_in_round: 0, has_folded: false, is_all_in: true, has_acted: true, total_invested: 400 },
                Player { position: 2, name: "Big".into(), stack: 600, hand: Some(hand_big),
                         bet_in_round: 0, has_folded: false, is_all_in: true, has_acted: true, total_invested: 400 },
            ],
            community_cards: community,
            pots: vec![Pot { amount: 1000 }], // 200+400+400
            phase: Phase::Showdown,
            winners: vec![],
        };

        board.resolve_showdown();

        // p0 は 600 のみ受け取る
        assert_eq!(board.players[0].stack, 600, "short stack winner gets main pot only");
        // p1 は 400 を受け取る（サイドポット）
        assert_eq!(board.players[1].stack, 400, "mid stack player gets side pot");
        // p2 は 600（元スタック）のみ
        assert_eq!(board.players[2].stack, 600, "big stack player should not gain");
        // チップ保全: 600+400+600 = 1600 = 200+400+1000
        let total: u32 = board.players.iter().map(|p| p.stack).sum();
        assert_eq!(total, 1600);
    }

    /// 2 人 all-in（1000/400）と 1 人フォールド（200）→ サイドポット分配。
    #[test]
    fn side_pot_main_and_one_side() {
        use super::super::card::{Card, CardValue, Suit};
        let community = vec![
            Card { suit: Suit::Spade, value: CardValue::Two },
            Card { suit: Suit::Heart, value: CardValue::Three },
            Card { suit: Suit::Diamond, value: CardValue::Four },
            Card { suit: Suit::Club, value: CardValue::Five },
            Card { suit: Suit::Spade, value: CardValue::Seven },
        ];
        let hand_big: [Card; 2] = [
            Card { suit: Suit::Heart, value: CardValue::Ace },
            Card { suit: Suit::Diamond, value: CardValue::Ace },
        ];
        let hand_mid: [Card; 2] = [
            Card { suit: Suit::Club, value: CardValue::King },
            Card { suit: Suit::Heart, value: CardValue::Nine },
        ];
        // p0 (200 フォールド), p1 (400 allin), p2 (1000 allin)
        // total_invested: p0=200, p1=400, p2=400（all-in max は p1 の 400）
        // threshold=200: 200*3=600. 勝者候補(has_folded=false)=p1,p2。手役: p2(AA) > p1(K9) → p2 に 600
        // threshold=400: (400-200)*2=400. 勝者候補=p1,p2（has_folded=false）。p2(AA) > p1(K9) → p2 に 400
        // p2 total = 600 + 400 = 1000. p1 は 0.
        let mut board = TexasHoldemBoard {
            hand_number: 1,
            dealer_position: 0,
            sb_position: 1,
            bb_position: 2,
            current_turn: 0,
            current_bet: 400,
            last_raise_size: 0,
            players: vec![
                Player { position: 0, name: "Fold".into(), stack: 800, hand: None,
                         bet_in_round: 0, has_folded: true, is_all_in: false, has_acted: true, total_invested: 200 },
                Player { position: 1, name: "Mid".into(), stack: 0, hand: Some(hand_mid),
                         bet_in_round: 0, has_folded: false, is_all_in: true, has_acted: true, total_invested: 400 },
                Player { position: 2, name: "Big".into(), stack: 600, hand: Some(hand_big),
                         bet_in_round: 0, has_folded: false, is_all_in: true, has_acted: true, total_invested: 400 },
            ],
            community_cards: community,
            pots: vec![Pot { amount: 1000 }], // 200+400+400
            phase: Phase::Showdown,
            winners: vec![],
        };

        board.resolve_showdown();

        // p2(AA) が全サイドポット勝者
        assert_eq!(board.players[2].stack, 600 + 1000, "AA wins all eligible pots");
        assert_eq!(board.players[1].stack, 0);
        // チップ保全: p0.stack(800) + p1.stack(0) + p2.stack(600+1000) = 2400
        let total: u32 = board.players.iter().map(|p| p.stack).sum();
        assert_eq!(total, 2400);
    }

    /// 同ポット内で複数勝者のスプリット。
    #[test]
    fn side_pot_split_within_pot() {
        use super::super::card::{Card, CardValue, Suit};
        // コミュニティ: A K Q J T → ロイヤルストレートフラッシュボード
        // 全員が同じ手役（ボードのみで決まる）→ スプリット
        let community = vec![
            Card { suit: Suit::Spade, value: CardValue::Ace },
            Card { suit: Suit::Spade, value: CardValue::King },
            Card { suit: Suit::Spade, value: CardValue::Queen },
            Card { suit: Suit::Spade, value: CardValue::Jack },
            Card { suit: Suit::Spade, value: CardValue::Ten },
        ];
        // 全員が low card を持つ（ボードに勝てない）→ 全員がロイヤルフラッシュでスプリット
        let hand0: [Card; 2] = [
            Card { suit: Suit::Heart, value: CardValue::Two },
            Card { suit: Suit::Diamond, value: CardValue::Three },
        ];
        let hand1: [Card; 2] = [
            Card { suit: Suit::Club, value: CardValue::Two },
            Card { suit: Suit::Heart, value: CardValue::Four },
        ];
        let hand2: [Card; 2] = [
            Card { suit: Suit::Diamond, value: CardValue::Two },
            Card { suit: Suit::Club, value: CardValue::Five },
        ];

        // 3 人均等スプリット: pot=300, 各 total_invested=100
        let mut board = TexasHoldemBoard {
            hand_number: 1,
            dealer_position: 0,
            sb_position: 1,
            bb_position: 2,
            current_turn: 0,
            current_bet: 100,
            last_raise_size: 0,
            players: vec![
                Player { position: 0, name: "P0".into(), stack: 0, hand: Some(hand0),
                         bet_in_round: 0, has_folded: false, is_all_in: false, has_acted: true, total_invested: 100 },
                Player { position: 1, name: "P1".into(), stack: 0, hand: Some(hand1),
                         bet_in_round: 0, has_folded: false, is_all_in: false, has_acted: true, total_invested: 100 },
                Player { position: 2, name: "P2".into(), stack: 0, hand: Some(hand2),
                         bet_in_round: 0, has_folded: false, is_all_in: false, has_acted: true, total_invested: 100 },
            ],
            community_cards: community,
            pots: vec![Pot { amount: 300 }],
            phase: Phase::Showdown,
            winners: vec![],
        };

        board.resolve_showdown();

        // 300 / 3 = 100 ずつスプリット
        let total: u32 = board.players.iter().map(|p| p.stack).sum();
        assert_eq!(total, 300, "total chips preserved");
        assert_eq!(board.total_pot(), 0);
        // 全員が勝者
        assert_eq!(board.winners.len(), 3);
    }

    /// ショーダウン後の全プレイヤー stack 合計 == 初期スタック合計。
    #[test]
    fn total_chips_preserved_after_showdown() {
        let settings = GameSettings {
            small_blind: 50,
            big_blind: 100,
            min_chip: 50,
            bb_ante: false,
        };
        let names = vec!["A".into(), "B".into(), "C".into()];
        let initial_stacks = vec![1000u32, 400, 200];
        let board_start = start_game_with_stacks(
            settings, names, initial_stacks.clone(), 1, 0, 1, 2,
        ).unwrap();
        let initial_total: u32 = initial_stacks.iter().sum();

        let mut board = board_start;
        let mut deck = build_remaining_deck(&board);

        // 全員 all-in
        board_allin(&mut board, &mut deck).unwrap();
        board_allin(&mut board, &mut deck).unwrap();
        board_allin(&mut board, &mut deck).unwrap();

        // Showdown に至っている
        assert_eq!(board.phase, Phase::Showdown);

        let final_total: u32 = board.players.iter().map(|p| p.stack).sum();
        assert_eq!(final_total, initial_total, "total chips must be preserved");
    }

    // ================================================================
    // Bug 3: スプリットポット端数の dealer-left ordering
    // ================================================================

    /// dealer=2 の 4 人ゲームで position 0, 1, 3 が同点勝者、ポット 301 → 端数は dealer 左隣 position 3。
    #[test]
    fn split_pot_remainder_goes_to_dealer_left() {
        use super::super::card::{Card, CardValue, Suit};
        // コミュニティ: A K Q J T (スペード) → 全員ロイヤルストレートフラッシュ
        let community = vec![
            Card { suit: Suit::Spade, value: CardValue::Ace },
            Card { suit: Suit::Spade, value: CardValue::King },
            Card { suit: Suit::Spade, value: CardValue::Queen },
            Card { suit: Suit::Spade, value: CardValue::Jack },
            Card { suit: Suit::Spade, value: CardValue::Ten },
        ];
        let make_low_hand = |v1: CardValue, v2: CardValue| -> [Card; 2] {
            [
                Card { suit: Suit::Heart, value: v1 },
                Card { suit: Suit::Diamond, value: v2 },
            ]
        };

        // dealer=position 2 (idx=2)
        // dealer-left ordering: (idx + n - dealer_idx - 1) % n
        // n=4, dealer_idx=2
        // idx=0: (0+4-2-1)%4 = 1
        // idx=1: (1+4-2-1)%4 = 2
        // idx=2: (2+4-2-1)%4 = 3  ← dealer 自身（最後）
        // idx=3: (3+4-2-1)%4 = 0  ← dealer の左隣（最初に端数を受け取る）
        // winner_indices = [0, 1, 3]（position 2 はフォールド）
        // dealer-left 順: idx=3 が key=0 → 端数を受け取る
        //
        // total_invested: pos0=100, pos1=100, pos2=1(fold), pos3=100 → sum=301
        // threshold=1: 1 * 4(ti>0) = 4。eligible=[p0,p1,p3]。4/3=1余1 → p3が2, p0が1, p1が1
        // threshold=100: 99 * 3(ti>1) = 297。eligible=[p0,p1,p3]。297/3=99余0 → 各99
        // p3 total = 2+99 = 101, p0 = 1+99 = 100, p1 = 1+99 = 100
        let mut board = TexasHoldemBoard {
            hand_number: 1,
            dealer_position: 2, // dealer は position=2
            sb_position: 3,
            bb_position: 0,
            current_turn: 0,
            current_bet: 100,
            last_raise_size: 0,
            players: vec![
                Player { position: 0, name: "P0".into(), stack: 0, hand: Some(make_low_hand(CardValue::Two, CardValue::Three)),
                         bet_in_round: 0, has_folded: false, is_all_in: false, has_acted: true, total_invested: 100 },
                Player { position: 1, name: "P1".into(), stack: 0, hand: Some(make_low_hand(CardValue::Four, CardValue::Five)),
                         bet_in_round: 0, has_folded: false, is_all_in: false, has_acted: true, total_invested: 100 },
                Player { position: 2, name: "P2".into(), stack: 0, hand: Some(make_low_hand(CardValue::Six, CardValue::Seven)),
                         bet_in_round: 0, has_folded: true, is_all_in: false, has_acted: true, total_invested: 1 },
                Player { position: 3, name: "P3".into(), stack: 0, hand: Some(make_low_hand(CardValue::Eight, CardValue::Nine)),
                         bet_in_round: 0, has_folded: false, is_all_in: false, has_acted: true, total_invested: 100 },
            ],
            community_cards: community,
            pots: vec![Pot { amount: 301 }],
            phase: Phase::Showdown,
            winners: vec![],
        };

        board.resolve_showdown();

        // 総チップ保全
        let total: u32 = board.players.iter().map(|p| p.stack).sum();
        assert_eq!(total, 301, "chips must be preserved");
        assert_eq!(board.total_pot(), 0);

        // dealer-left 順の最初(idx=3, position=3)が端数を受け取る
        // p3: 101, p0: 100, p1: 100
        assert_eq!(board.players[3].stack, 101, "P3 (dealer left) should get the remainder");
        assert_eq!(board.players[0].stack, 100);
        assert_eq!(board.players[1].stack, 100);
    }

    // ================================================================
    // Bug 4: board_raise の minimum raise validation
    // ================================================================

    /// current_bet=100, last_raise_size=100, raise to=150 → エラー（min raise = 200）。
    #[test]
    fn raise_below_min_raise_is_rejected() {
        use super::super::card::{Card, CardValue, Suit};
        let hand_a: [Card; 2] = [
            Card { suit: Suit::Heart, value: CardValue::Ace },
            Card { suit: Suit::Spade, value: CardValue::King },
        ];
        let hand_b: [Card; 2] = [
            Card { suit: Suit::Diamond, value: CardValue::Queen },
            Card { suit: Suit::Club, value: CardValue::Jack },
        ];
        let mut board = TexasHoldemBoard {
            hand_number: 1,
            dealer_position: 0,
            sb_position: 0,
            bb_position: 1,
            current_turn: 0,
            current_bet: 100,
            last_raise_size: 100,
            players: vec![
                Player { position: 0, name: "A".into(), stack: 900, hand: Some(hand_a),
                         bet_in_round: 100, has_folded: false, is_all_in: false, has_acted: false, total_invested: 100 },
                Player { position: 1, name: "B".into(), stack: 900, hand: Some(hand_b),
                         bet_in_round: 100, has_folded: false, is_all_in: false, has_acted: true, total_invested: 100 },
            ],
            community_cards: vec![],
            pots: vec![Pot { amount: 0 }],
            phase: Phase::PreFlop,
            winners: vec![],
        };
        let mut deck = Vec::new();

        let result = board_raise(&mut board, 150, &mut deck);
        assert!(result.is_err(), "raise to 150 should be rejected when min raise is 200");
    }

    /// current_bet=100, last_raise_size=100, raise to=200 → Ok（ちょうど min raise）。
    #[test]
    fn raise_at_min_raise_is_accepted() {
        use super::super::card::{Card, CardValue, Suit};
        let community = vec![
            Card { suit: Suit::Spade, value: CardValue::Two },
            Card { suit: Suit::Heart, value: CardValue::Three },
            Card { suit: Suit::Diamond, value: CardValue::Four },
        ];
        let hand_a: [Card; 2] = [
            Card { suit: Suit::Heart, value: CardValue::Ace },
            Card { suit: Suit::Spade, value: CardValue::King },
        ];
        let hand_b: [Card; 2] = [
            Card { suit: Suit::Diamond, value: CardValue::Queen },
            Card { suit: Suit::Club, value: CardValue::Jack },
        ];
        let mut board = TexasHoldemBoard {
            hand_number: 1,
            dealer_position: 0,
            sb_position: 0,
            bb_position: 1,
            current_turn: 0,
            current_bet: 100,
            last_raise_size: 100,
            players: vec![
                Player { position: 0, name: "A".into(), stack: 900, hand: Some(hand_a),
                         bet_in_round: 100, has_folded: false, is_all_in: false, has_acted: false, total_invested: 100 },
                Player { position: 1, name: "B".into(), stack: 900, hand: Some(hand_b),
                         bet_in_round: 100, has_folded: false, is_all_in: false, has_acted: true, total_invested: 100 },
            ],
            community_cards: community,
            pots: vec![Pot { amount: 0 }],
            phase: Phase::Flop,
            winners: vec![],
        };
        let mut deck = Vec::new();

        let result = board_raise(&mut board, 200, &mut deck);
        assert!(result.is_ok(), "raise to 200 should be accepted (min raise)");
        assert_eq!(board.current_bet, 200);
    }

    /// スタック 50, current_bet=100, last_raise_size=100 → all-in 例外で raise to=150 は Ok。
    #[test]
    fn raise_below_min_raise_allowed_when_all_in() {
        use super::super::card::{Card, CardValue, Suit};
        let community = vec![
            Card { suit: Suit::Spade, value: CardValue::Two },
            Card { suit: Suit::Heart, value: CardValue::Three },
            Card { suit: Suit::Diamond, value: CardValue::Four },
        ];
        let hand_a: [Card; 2] = [
            Card { suit: Suit::Heart, value: CardValue::Ace },
            Card { suit: Suit::Spade, value: CardValue::King },
        ];
        let hand_b: [Card; 2] = [
            Card { suit: Suit::Diamond, value: CardValue::Queen },
            Card { suit: Suit::Club, value: CardValue::Jack },
        ];
        // p0: bet_in_round=100, stack=50 → all_in_total = 100+50 = 150
        // min_raise_to = 100+100 = 200 だが all-in 例外で 150 は ok
        let mut board = TexasHoldemBoard {
            hand_number: 1,
            dealer_position: 0,
            sb_position: 0,
            bb_position: 1,
            current_turn: 0,
            current_bet: 100,
            last_raise_size: 100,
            players: vec![
                Player { position: 0, name: "A".into(), stack: 50, hand: Some(hand_a),
                         bet_in_round: 100, has_folded: false, is_all_in: false, has_acted: false, total_invested: 100 },
                Player { position: 1, name: "B".into(), stack: 900, hand: Some(hand_b),
                         bet_in_round: 100, has_folded: false, is_all_in: false, has_acted: true, total_invested: 100 },
            ],
            community_cards: community,
            pots: vec![Pot { amount: 0 }],
            phase: Phase::Flop,
            winners: vec![],
        };
        let mut deck = Vec::new();

        let result = board_raise(&mut board, 150, &mut deck);
        assert!(result.is_ok(), "all-in raise below min should be allowed");
        assert!(board.players[0].is_all_in);
    }

    /// Bet 後に last_raise_size が bet 額そのものになる（prev_bet=0 から差分を取る）。
    /// これは BUG-X minimum raise validation が機能するための前提。
    #[test]
    fn bet_sets_last_raise_size_to_bet_amount() {
        use super::super::card::{Card, CardValue, Suit};
        let community = vec![
            Card { suit: Suit::Spade, value: CardValue::Two },
            Card { suit: Suit::Heart, value: CardValue::Three },
            Card { suit: Suit::Diamond, value: CardValue::Four },
        ];
        let hand_a: [Card; 2] = [
            Card { suit: Suit::Heart, value: CardValue::Ace },
            Card { suit: Suit::Spade, value: CardValue::King },
        ];
        let hand_b: [Card; 2] = [
            Card { suit: Suit::Diamond, value: CardValue::Queen },
            Card { suit: Suit::Club, value: CardValue::Jack },
        ];
        // Flop で current_bet=0, last_raise_size=0 の状態から bet 200 → last_raise_size=200
        let mut board = TexasHoldemBoard {
            hand_number: 1,
            dealer_position: 0,
            sb_position: 0,
            bb_position: 1,
            current_turn: 0,
            current_bet: 0,
            last_raise_size: 0,
            players: vec![
                Player { position: 0, name: "A".into(), stack: 900, hand: Some(hand_a),
                         bet_in_round: 0, has_folded: false, is_all_in: false, has_acted: false, total_invested: 100 },
                Player { position: 1, name: "B".into(), stack: 900, hand: Some(hand_b),
                         bet_in_round: 0, has_folded: false, is_all_in: false, has_acted: false, total_invested: 100 },
            ],
            community_cards: community,
            pots: vec![Pot { amount: 200 }],
            phase: Phase::Flop,
            winners: vec![],
        };
        let mut deck = Vec::new();

        board_bet(&mut board, 200, &mut deck).unwrap();
        assert_eq!(board.current_bet, 200, "current_bet should equal bet amount");
        assert_eq!(board.last_raise_size, 200, "last_raise_size should equal bet amount (regression: was 0)");

        // 次の raise の min_raise_to = 200 + 200 = 400 → raise to=300 は拒否されるべき
        let result = board_raise(&mut board, 300, &mut deck);
        assert!(result.is_err(), "raise to 300 should be rejected (min raise=400)");
    }

    // ---- Bug 12: 全員 all-in 後の current_turn ----

    /// 全員 all-in 後に advance_phase が呼ばれると current_turn が u8::MAX になること。
    #[test]
    fn advance_phase_sets_sentinel_when_all_players_allin() {
        let settings = GameSettings {
            small_blind: 50,
            big_blind: 100,
            min_chip: 50,
            bb_ante: false,
        };
        let names = vec!["Alice".into(), "Bob".into(), "Carol".into()];
        let stacks = vec![200u32, 200, 200];
        let mut board = start_game_with_stacks(settings, names, stacks, 1, 0, 1, 2).unwrap();
        let mut deck = build_remaining_deck(&board);

        // 全員 all-in させる
        board_allin(&mut board, &mut deck).unwrap();
        board_allin(&mut board, &mut deck).unwrap();
        board_allin(&mut board, &mut deck).unwrap();

        // 全員 all-in → Showdown まで進む
        assert_eq!(board.phase, Phase::Showdown);
    }

    /// advance_phase で next_active_position_after が None のとき current_turn = u8::MAX になること。
    #[test]
    fn advance_phase_sets_max_sentinel_when_no_active_player() {
        // 全員 all-in の Flop フェーズを手動で構築
        let hand_a = [
            Card { suit: Suit::Spade, value: CardValue::Ace },
            Card { suit: Suit::Heart, value: CardValue::King },
        ];
        let hand_b = [
            Card { suit: Suit::Diamond, value: CardValue::Queen },
            Card { suit: Suit::Club, value: CardValue::Jack },
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
                Player { position: 0, name: "A".into(), stack: 0, hand: Some(hand_a),
                         bet_in_round: 0, has_folded: false, is_all_in: true, has_acted: true, total_invested: 200 },
                Player { position: 1, name: "B".into(), stack: 0, hand: Some(hand_b),
                         bet_in_round: 0, has_folded: false, is_all_in: true, has_acted: true, total_invested: 200 },
            ],
            community_cards: vec![],
            pots: vec![Pot { amount: 400 }],
            phase: Phase::PreFlop,
            winners: vec![],
        };
        let mut deck = Vec::new();

        board.advance_phase(&mut deck);

        // 全員 all-in のため next_active_position_after は None → u8::MAX
        assert_eq!(
            board.current_turn,
            u8::MAX,
            "current_turn should be u8::MAX when all players are all-in"
        );
    }
}

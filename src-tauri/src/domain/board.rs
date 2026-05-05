//! テキサスホールデムのボード状態機械（Manual モード簡略版）。

use super::card::{full_deck, Card, CardValue, Suit};
use super::hand::{compare_evaluated, evaluate_hand, EvaluatedHand};
use crate::error::BoardError;
use rand::seq::SliceRandom;
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

/// ゲーム開始時のボード状態スナップショット。
/// `start_game` 呼び出し直後に InnerState に保存し、`get_initial_board` で返す。
#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct TexasHoldemInitialBoard {
    pub hand_number: u32,
    pub dealer_position: u8,
    pub players: Vec<Player>,
    pub settings: GameSettings,
}

impl TexasHoldemInitialBoard {
    /// `TexasHoldemBoard` と `GameSettings` からスナップショットを生成する。
    pub fn from_board(board: &TexasHoldemBoard, settings: GameSettings) -> Self {
        Self {
            hand_number: board.hand_number,
            dealer_position: board.dealer_position,
            players: board.players.clone(),
            settings,
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
        self.players
            .iter()
            .position(|p| p.position == self.current_turn)
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
        let actives: Vec<&Player> = self.players.iter().filter(|p| !p.has_folded).collect();

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

        // Manual モード (RFID) で既にカードが追加済みの場合は各フェーズでスキップ。
        match self.phase {
            Phase::Flop if self.community_cards.len() < 3 => {
                let _ = deck.pop(); // burn card
                while self.community_cards.len() < 3 {
                    if let Some(card) = deck.pop() {
                        self.community_cards.push(card);
                    } else {
                        break;
                    }
                }
            }
            Phase::Turn if self.community_cards.len() < 4 => {
                let _ = deck.pop(); // burn card
                if let Some(card) = deck.pop() {
                    self.community_cards.push(card);
                }
            }
            Phase::River if self.community_cards.len() < 5 => {
                let _ = deck.pop(); // burn card
                if let Some(card) = deck.pop() {
                    self.community_cards.push(card);
                }
            }
            _ => {}
        }

        // 次のアクション順：SB の左から
        match self.phase {
            Phase::Showdown => self.current_turn = u8::MAX,
            _ => match self.next_active_position_after(self.dealer_position) {
                Some(pos) => self.current_turn = pos,
                None => self.current_turn = u8::MAX,
            },
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
        let max_bet_in_round = self
            .players
            .iter()
            .map(|p| p.bet_in_round)
            .max()
            .unwrap_or(0);
        let new_current_bet = self.current_bet.max(max_bet_in_round);
        if new_current_bet > self.current_bet {
            // ベット/レイズが発生した場合、他のアクティブプレイヤーの has_acted をリセットする。
            // これにより先行チェック済みプレイヤーがベットに応答できるようになる。
            for i in 0..self.players.len() {
                if i != idx && !self.players[i].has_folded && !self.players[i].is_all_in {
                    self.players[i].has_acted = false;
                }
            }
            // last_raise_size をここで確定させる。advance_phase 後の末尾書き込みによる
            // 二重更新を防ぐため、current_bet 変更が確定したタイミングで更新する。
            self.last_raise_size = new_current_bet.saturating_sub(self.current_bet);
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

        let invested_sum: u32 = self.players.iter().map(|p| p.total_invested).sum();
        let pot_total = self.total_pot();
        if invested_sum != pot_total {
            tracing::warn!(
                "resolve_showdown: total_invested sum ({}) != total_pot ({}); \
                 chip conservation may be violated",
                invested_sum,
                pot_total
            );
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

        // 各プレイヤーの手役を評価（community_cards が不足している場合は None を返す）。
        let evals: Vec<(usize, EvaluatedHand)> = active
            .iter()
            .filter_map(|&idx| {
                let p = &self.players[idx];
                let hole = p.hand?;
                let mut all_cards: Vec<Card> = self.community_cards.clone();
                all_cards.push(hole[0]);
                all_cards.push(hole[1]);
                // community_cards 不足で 5 枚未満のときは手役評価をスキップ
                if all_cards.len() < 5 {
                    return None;
                }
                Some((idx, evaluate_hand(&all_cards)))
            })
            .collect();

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
        let mut carry_over: u32 = 0;

        for &threshold in &thresholds {
            let level_amount = threshold - prev_threshold;
            // このレベルに参加しているプレイヤー数（prev_threshold より多く投入したプレイヤー）
            let contributors = total_invested
                .iter()
                .filter(|&&ti| ti > prev_threshold)
                .count() as u32;
            let pot_amount = ((level_amount as u64)
                .saturating_mul(contributors as u64)
                .saturating_add(carry_over as u64))
            .min(u32::MAX as u64) as u32;

            // このポットの勝者候補: total_invested >= threshold かつ has_folded でない
            let eligible_for_pot: Vec<usize> = (0..self.players.len())
                .filter(|&i| total_invested[i] >= threshold && !self.players[i].has_folded)
                .collect();

            if eligible_for_pot.is_empty() {
                // 勝者候補なし（全員フォールド済み）→ pot_amount を次のレベルへ持ち越し
                carry_over = pot_amount;
                prev_threshold = threshold;
                continue;
            }
            carry_over = 0;

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

        // 端数が残っていたら dealer-left かつ勝者のプレイヤーに渡す。
        // 勝者がいない場合は dealer-left の最初の非フォールドプレイヤーに渡す。
        let undistributed = total_pot_before.saturating_sub(distributed);
        if undistributed > 0 {
            let mut leftover_candidates: Vec<usize> = if !all_winner_positions.is_empty() {
                (0..self.players.len())
                    .filter(|&i| all_winner_positions.contains(&self.players[i].position))
                    .collect()
            } else {
                (0..self.players.len())
                    .filter(|&i| !self.players[i].has_folded)
                    .collect()
            };
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
            let idx = self
                .players
                .iter()
                .position(|p| p.position == pos)
                .unwrap_or(0);
            dealer_left_key(idx)
        });
        self.winners = all_winner_positions;
    }
}

/// デッキを任意の RNG でシャッフルして返す。
/// テストでは `rand::rngs::StdRng::seed_from_u64(n)` を渡すことで決定論的にできる。
pub fn shuffle_deck_with_rng<R: rand::Rng>(rng: &mut R) -> Vec<Card> {
    let mut deck = full_deck();
    deck.shuffle(rng);
    deck
}

/// ゲームを開始してボードを返す。hand_number=1 で開始する。
pub fn start_game(
    settings: GameSettings,
    player_names: Vec<String>,
    dealer: u8,
) -> Result<TexasHoldemBoard, BoardError> {
    let (board, _deck) = start_game_with_deck(settings, player_names, dealer, 1)?;
    Ok(board)
}

/// ゲームを開始してボードとシャッフル済み残デッキを返す。
/// Auto モードで community cards を内部デッキから配布する際に使用する。
pub fn start_game_with_deck(
    settings: GameSettings,
    player_names: Vec<String>,
    dealer: u8,
    hand_number: u32,
) -> Result<(TexasHoldemBoard, Vec<Card>), BoardError> {
    let n = player_names.len();
    if !(2..=10).contains(&n) {
        return Err(BoardError::InvalidAction("2 to 10 players required".into()));
    }

    if (dealer as usize) >= n {
        return Err(BoardError::InvalidAction(
            "dealer position out of range".into(),
        ));
    }

    // 空文字チェック
    for name in &player_names {
        if name.trim().is_empty() {
            return Err(BoardError::InvalidAction(
                "player name must not be empty".into(),
            ));
        }
    }
    // 重複チェック (trim 後で比較)
    let mut seen = std::collections::HashSet::new();
    for name in &player_names {
        if !seen.insert(name.trim()) {
            return Err(BoardError::InvalidAction(
                "duplicate player names are not allowed".into(),
            ));
        }
    }

    let initial_stack = settings
        .small_blind
        .checked_mul(100)
        .ok_or_else(|| BoardError::InvalidAction("small_blind * 100 overflows u32".into()))?;
    let stacks: Vec<u32> = vec![initial_stack; n];

    let sb_pos = if n == 2 {
        dealer
    } else {
        (dealer + 1) % n as u8
    };
    let bb_pos = if n == 2 {
        (dealer + 1) % n as u8
    } else {
        (dealer + 2) % n as u8
    };

    start_game_with_stacks_and_deck(
        settings,
        player_names,
        stacks,
        hand_number,
        dealer,
        sb_pos,
        bb_pos,
    )
}

/// スタックが 0 でないプレイヤーの位置を from_pos の次から順に探す。
/// 全員スタック 0 の場合は None を返す。
fn next_non_zero_stack_pos(stacks: &[u32], from_pos: u8) -> Option<u8> {
    let n = stacks.len();
    for offset in 1..=n {
        let pos = (from_pos as usize + offset) % n;
        if stacks[pos] > 0 {
            return Some(pos as u8);
        }
    }
    None
}

/// 次のゲームへ進む（dealer をシフト）。
pub fn next_game(
    prev: &TexasHoldemBoard,
    settings: &GameSettings,
) -> Result<(TexasHoldemBoard, Vec<Card>), BoardError> {
    let n = prev.players.len();
    let new_dealer = (prev.dealer_position + 1) % n as u8;

    // 前回のスタックを引き継ぐ
    let stacks: Vec<u32> = prev.players.iter().map(|p| p.stack).collect();

    // スタックが 0 のプレイヤーをスキップして SB/BB を決定する。
    let (new_sb, new_bb) = if n == 2 {
        // ヘッズアップ: dealer=SB, 相手=BB
        // どちらかがスタック 0 の場合はゲーム終了（バスト）として扱う。
        if stacks[new_dealer as usize] == 0 {
            return Err(BoardError::InvalidAction(
                "heads-up: dealer has stack 0; game over".into(),
            ));
        }
        let opponent = (new_dealer + 1) % n as u8;
        if stacks[opponent as usize] == 0 {
            return Err(BoardError::InvalidAction(
                "heads-up: opponent has stack 0; game over".into(),
            ));
        }
        (new_dealer, opponent)
    } else {
        // SB は dealer の次でスタック 0 をスキップ
        let sb = next_non_zero_stack_pos(&stacks, new_dealer).ok_or_else(|| {
            BoardError::InvalidAction("all players have stack 0; cannot determine SB".into())
        })?;
        // BB は SB の次でスタック 0 をスキップ
        let bb = next_non_zero_stack_pos(&stacks, sb).ok_or_else(|| {
            BoardError::InvalidAction("only one player has chips; cannot determine BB".into())
        })?;
        // SB と BB が同一位置 = 残スタック 1 名のみ → ゲーム続行不可
        if sb == bb {
            return Err(BoardError::InvalidAction("ゲーム続行不可".into()));
        }
        (sb, bb)
    };

    // stack 0 のプレイヤーはバスト（ゲームから除外）しない簡略版。
    // そのまま継続（buy-in なし）。
    let names: Vec<String> = prev.players.iter().map(|p| p.name.clone()).collect();
    let new_settings = settings.clone();

    let (board, deck) = start_game_with_stacks_and_deck(
        new_settings,
        names,
        stacks,
        prev.hand_number + 1,
        new_dealer,
        new_sb,
        new_bb,
    )?;

    Ok((board, deck))
}

/// テスト用互換ラッパー。デッキを破棄してボードのみ返す。
#[cfg(test)]
fn start_game_with_stacks(
    settings: GameSettings,
    player_names: Vec<String>,
    stacks: Vec<u32>,
    hand_number: u32,
    dealer: u8,
    sb_pos: u8,
    bb_pos: u8,
) -> Result<TexasHoldemBoard, BoardError> {
    start_game_with_stacks_and_deck(
        settings,
        player_names,
        stacks,
        hand_number,
        dealer,
        sb_pos,
        bb_pos,
    )
    .map(|(board, _deck)| board)
}

/// ゲームを開始してボードとシャッフル済み残デッキを返す内部実装。
fn start_game_with_stacks_and_deck(
    settings: GameSettings,
    player_names: Vec<String>,
    stacks: Vec<u32>,
    hand_number: u32,
    dealer: u8,
    sb_pos: u8,
    bb_pos: u8,
) -> Result<(TexasHoldemBoard, Vec<Card>), BoardError> {
    let n = player_names.len();

    if stacks[sb_pos as usize] == 0 && stacks[bb_pos as usize] == 0 {
        return Err(BoardError::InvalidAction(
            "both SB and BB have stack 0; at least one must have chips to post blinds".into(),
        ));
    }
    if stacks[sb_pos as usize] == 0 {
        tracing::warn!(
            "SB at pos {} has stack 0; player will be forced all-in on blind post",
            sb_pos
        );
    }
    if stacks[bb_pos as usize] == 0 {
        tracing::warn!(
            "BB at pos {} has stack 0; player will be forced all-in on blind post",
            bb_pos
        );
    }

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

    // bb_ante: BB プレイヤーから big_blind 相当をアンティとして追加徴収する。
    // アンティはラウンドベットではないため bet_in_round には含めず、ポットに直接加算する。
    let ante_amount = if settings.bb_ante {
        let ante = settings.big_blind.min(players[bb_idx].stack);
        players[bb_idx].stack -= ante;
        players[bb_idx].total_invested += ante;
        if players[bb_idx].stack == 0 {
            players[bb_idx].is_all_in = true;
        }
        ante
    } else {
        0
    };

    // SB/BB 以外でスタックが 0 のプレイヤーも is_all_in=true にする。
    // ブラインド徴収後に処理するため SB/BB は既に設定済み。
    for p in &mut players {
        if p.stack == 0 {
            p.is_all_in = true;
        }
    }

    let current_bet = bb_amount;

    let utg_pos = if n <= 2 {
        dealer
    } else {
        (bb_pos + 1) % n as u8
    };

    let mut deck = shuffle_deck_with_rng(&mut rand::thread_rng());

    for p in &mut players {
        let c1 = deck
            .pop()
            .ok_or_else(|| BoardError::InvalidAction("deck exhausted".into()))?;
        let c2 = deck
            .pop()
            .ok_or_else(|| BoardError::InvalidAction("deck exhausted".into()))?;
        p.hand = Some([c1, c2]);
    }

    let board = TexasHoldemBoard {
        hand_number,
        dealer_position: dealer,
        sb_position: sb_pos,
        bb_position: bb_pos,
        current_turn: utg_pos,
        current_bet,
        last_raise_size: current_bet,
        players,
        community_cards: Vec::new(),
        pots: vec![Pot {
            amount: ante_amount,
        }],
        phase: Phase::PreFlop,
        winners: Vec::new(),
    };
    // ハンド配布後の残デッキをそのまま返す（再シャッフルしない）。
    Ok((board, deck))
}

/// board で使用済みのカードを除いた残デッキを返す。
/// Manual モード (RFID) の初期化や recovery 用途に使用する。
pub fn build_remaining_deck(board: &TexasHoldemBoard) -> Vec<Card> {
    let used: std::collections::HashSet<(Suit, CardValue)> = board
        .players
        .iter()
        .flat_map(|p| {
            p.hand
                .iter()
                .flat_map(|h| h.iter().map(|c| (c.suit, c.value)))
        })
        .chain(board.community_cards.iter().map(|c| (c.suit, c.value)))
        .collect();

    let mut deck = shuffle_deck_with_rng(&mut rand::thread_rng());
    deck.retain(|c| !used.contains(&(c.suit, c.value)));
    deck
}

// ---- コミュニティカード手動設定 ----

/// コミュニティカードを手動で設定する。
/// locate_number は 0..=4 で、board.community_cards.len() == locate_number のときのみ許可する。
/// card は deck に含まれていなければならない。
///
/// フェーズと locate_number の整合性チェック:
/// - locate_number 0..=2: Phase::PreFlop のみ許可（RFID モードでフロップを手動配布）
/// - locate_number 3:     Phase::Flop のみ許可（ターンを手動配布）
/// - locate_number 4:     Phase::Turn のみ許可（リバーを手動配布）
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

    // フェーズと locate_number の整合性チェック
    let valid_phase = match locate_number {
        0..=2 => board.phase == Phase::PreFlop,
        3 => board.phase == Phase::Flop,
        4 => board.phase == Phase::Turn,
        _ => false,
    };
    if !valid_phase {
        return Err(BoardError::InvalidAction(format!(
            "invalid phase {:?} for community card index {}",
            board.phase, locate_number
        )));
    }

    if board.community_cards.len() != locate_number as usize {
        return Err(BoardError::InvalidAction(format!(
            "community_cards.len() is {}, expected {}",
            board.community_cards.len(),
            locate_number
        )));
    }
    let in_deck = deck
        .iter()
        .any(|c| c.suit == card.suit && c.value == card.value);
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
    // stack はハンド進行中に変更されると total_invested とポット計算の整合が崩れるため、
    // Showdown のときのみ反映する。Showdown 以外で指定された場合はエラーにする。
    if stack.is_some() && board.phase != Phase::Showdown {
        return Err(BoardError::InvalidAction(
            "stack can only be updated during showdown".into(),
        ));
    }
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
        return Err(BoardError::InvalidAction("max 10 players reached".into()));
    }
    let trimmed = name.trim();
    if trimmed.is_empty() {
        return Err(BoardError::InvalidAction("name must not be empty".into()));
    }
    if board.players.iter().any(|p| p.name == trimmed) {
        return Err(BoardError::InvalidAction(
            "duplicate player names are not allowed".into(),
        ));
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
pub fn remove_player(board: &mut TexasHoldemBoard, position: u8) -> Result<(), BoardError> {
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
    if board.current_turn >= n {
        board.current_turn = u8::MAX;
    }
    Ok(())
}

// ---- アクション実装 ----

pub fn board_bet(
    board: &mut TexasHoldemBoard,
    amount: u32,
    deck: &mut Vec<Card>,
    min_chip: u32,
) -> Result<(), BoardError> {
    if min_chip > 0 && amount % min_chip != 0 {
        return Err(BoardError::InvalidAction(format!(
            "amount {} must be a multiple of min_chip {}",
            amount, min_chip
        )));
    }
    board.apply_action(
        |p, current_bet| {
            if current_bet > 0 {
                return Err(BoardError::InvalidAction(
                    "use raise when there is a bet".into(),
                ));
            }
            if amount == 0 {
                return Err(BoardError::InvalidAction(
                    "bet amount must be positive".into(),
                ));
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
    Ok(())
}

pub fn board_call(board: &mut TexasHoldemBoard, deck: &mut Vec<Card>) -> Result<(), BoardError> {
    if board.current_bet == 0 {
        return Err(BoardError::InvalidAction(
            "コール対象のベットがありません".into(),
        ));
    }
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
    // all-in プレイヤーはアクション不可のためフォールドを禁止する。
    // フォールドを許可するとサイドポット計算で eligible_for_pot が空になり
    // チップが誤って配分される可能性がある。
    {
        let p_idx = board
            .current_player_idx()
            .ok_or_else(|| BoardError::InvalidAction("current player not found".into()))?;
        if board.players[p_idx].is_all_in {
            return Err(BoardError::InvalidAction(
                "all-in player cannot fold".into(),
            ));
        }
    }
    board.apply_action(
        |p, _current_bet| {
            p.has_folded = true;
            Ok(())
        },
        deck,
    )
}

pub fn board_raise(
    board: &mut TexasHoldemBoard,
    to: u32,
    deck: &mut Vec<Card>,
    min_chip: u32,
) -> Result<(), BoardError> {
    if min_chip > 0 && to % min_chip != 0 {
        return Err(BoardError::InvalidAction(format!(
            "amount {} must be a multiple of min_chip {}",
            to, min_chip
        )));
    }
    // min raise validation: to >= current_bet + last_raise_size（all-in 例外あり）
    let min_raise_to = board.current_bet.saturating_add(board.last_raise_size);
    {
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
    board.apply_action(
        |p, _current_bet| {
            let all_in_total = p.stack + p.bet_in_round;
            if to < min_raise_to && to != all_in_total {
                return Err(BoardError::InvalidAction(format!(
                    "raise must be at least {} (or all-in {}); got {}",
                    min_raise_to, all_in_total, to
                )));
            }
            let already = p.bet_in_round;
            let needed = to.saturating_sub(already);
            if needed > p.stack {
                return Err(BoardError::InvalidAction(
                    "not enough stack for raise".into(),
                ));
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
    Ok(())
}

pub fn board_allin(board: &mut TexasHoldemBoard, deck: &mut Vec<Card>) -> Result<(), BoardError> {
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
    if used.contains(&(burn_card.suit, burn_card.value)) {
        return Err(BoardError::InvalidAction(
            "バーンカードが既に使用されています".into(),
        ));
    }
    // バーンカードを expose_card と差し替え（コミュニティへ追加）
    board.community_cards.push(expose_card);
    Ok(burn_card)
}

pub fn evaluate_player_hand(
    board: &TexasHoldemBoard,
    position: u8,
) -> Result<EvaluatedHand, BoardError> {
    let player = board
        .players
        .iter()
        .find(|p| p.position == position)
        .ok_or_else(|| {
            BoardError::InvalidAction(format!("player at position {} not found", position))
        })?;

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
        board_raise(&mut board, 300, &mut deck, 1).unwrap();
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
        let settings = GameSettings {
            small_blind: 50,
            big_blind: 100,
            min_chip: 50,
            bb_ante: false,
        };
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
        assert!(!deck
            .iter()
            .any(|c| c.suit == card0.suit && c.value == card0.value));

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
        // stack 変更は Showdown のみ許可
        board.phase = Phase::Showdown;
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

    /// ハンド進行中 (PreFlop) に stack を更新しようとするとエラーになる。
    #[test]
    fn update_player_rejects_stack_change_outside_showdown() {
        let (mut board, _deck) = make_board();
        assert_eq!(board.phase, Phase::PreFlop);
        let r = update_player(&mut board, 0, None, Some(2000));
        assert!(r.is_err(), "stack 変更は PreFlop で拒否されるべき");
        // 名前のみの更新は許可される
        update_player(&mut board, 0, Some("Alex".into()), None).unwrap();
        assert_eq!(board.players[0].name, "Alex");
    }

    /// Showdown では stack 更新が成功する。
    #[test]
    fn update_player_allows_stack_change_during_showdown() {
        let (mut board, _deck) = make_board();
        board.phase = Phase::Showdown;
        update_player(&mut board, 0, None, Some(2000)).unwrap();
        assert_eq!(board.players[0].stack, 2000);
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
    fn remove_player_resets_current_turn_when_out_of_range() {
        let (mut board, _deck) = make_board();
        board.phase = Phase::Showdown;
        // current_turn を削除後に範囲外になる値に設定する
        board.current_turn = 2; // 削除後 n=2 になるため 2 は範囲外
        remove_player(&mut board, 1).unwrap();
        assert_eq!(
            board.current_turn,
            u8::MAX,
            "current_turn should be u8::MAX when out of range after remove_player"
        );
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

    // ---- shuffle テスト ----

    /// shuffle_deck_with_rng が 52 枚全て返し重複がないことを検証する。
    #[test]
    fn shuffle_deck_with_rng_returns_full_deck() {
        use rand::rngs::StdRng;
        use rand::SeedableRng;
        let mut rng = StdRng::seed_from_u64(42);
        let deck = shuffle_deck_with_rng(&mut rng);
        assert_eq!(deck.len(), 52);
        // 重複なし
        let mut seen = std::collections::HashSet::new();
        for c in &deck {
            assert!(
                seen.insert((c.suit, c.value)),
                "duplicate card in shuffled deck"
            );
        }
    }

    /// 異なるシードで shuffle_deck_with_rng を呼んだ際にシャッフル結果が異なることを検証する。
    #[test]
    fn different_seeds_produce_different_shuffles() {
        use rand::rngs::StdRng;
        use rand::SeedableRng;
        let deck1 = shuffle_deck_with_rng(&mut StdRng::seed_from_u64(1));
        let deck2 = shuffle_deck_with_rng(&mut StdRng::seed_from_u64(2));
        assert_ne!(
            deck1, deck2,
            "different seeds should produce different shuffles"
        );
    }

    /// start_game でゲームが開始できること（手札が配られること）を確認する。
    #[test]
    fn start_game_deals_hands() {
        let settings = GameSettings {
            small_blind: 10,
            big_blind: 20,
            min_chip: 10,
            bb_ante: false,
        };
        let names = vec!["Alice".into(), "Bob".into()];
        let board = start_game(settings, names, 0).unwrap();
        assert_eq!(board.hand_number, 1);
        assert!(
            board.players.iter().all(|p| p.hand.is_some()),
            "all players should have hands"
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
                Player {
                    position: 0,
                    name: "A".into(),
                    stack: 0,
                    hand: None,
                    bet_in_round: 0,
                    has_folded: false,
                    is_all_in: false,
                    has_acted: true,
                    total_invested: 100,
                },
                Player {
                    position: 1,
                    name: "B".into(),
                    stack: 0,
                    hand: None,
                    bet_in_round: 0,
                    has_folded: false,
                    is_all_in: false,
                    has_acted: true,
                    total_invested: 100,
                },
                Player {
                    position: 2,
                    name: "C".into(),
                    stack: 0,
                    hand: None,
                    bet_in_round: 0,
                    has_folded: false,
                    is_all_in: false,
                    has_acted: true,
                    total_invested: 100,
                },
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
                Player {
                    position: 0,
                    name: "A".into(),
                    stack: 0,
                    hand: None,
                    bet_in_round: 0,
                    has_folded: false,
                    is_all_in: false,
                    has_acted: true,
                    total_invested: 100,
                },
                Player {
                    position: 1,
                    name: "B".into(),
                    stack: 0,
                    hand: None,
                    bet_in_round: 0,
                    has_folded: false,
                    is_all_in: false,
                    has_acted: true,
                    total_invested: 101,
                },
                Player {
                    position: 2,
                    name: "C".into(),
                    stack: 0,
                    hand: None,
                    bet_in_round: 0,
                    has_folded: false,
                    is_all_in: false,
                    has_acted: true,
                    total_invested: 100,
                },
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
                Player {
                    position: 0,
                    name: "A".into(),
                    stack: 500,
                    hand: None,
                    bet_in_round: 0,
                    has_folded: false,
                    is_all_in: false,
                    has_acted: true,
                    total_invested: 200,
                },
                Player {
                    position: 1,
                    name: "B".into(),
                    stack: 0,
                    hand: None,
                    bet_in_round: 0,
                    has_folded: true,
                    is_all_in: false,
                    has_acted: true,
                    total_invested: 0,
                },
                Player {
                    position: 2,
                    name: "C".into(),
                    stack: 0,
                    hand: None,
                    bet_in_round: 0,
                    has_folded: true,
                    is_all_in: false,
                    has_acted: true,
                    total_invested: 0,
                },
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
            Card {
                suit: Suit::Spade,
                value: CardValue::Two,
            },
            Card {
                suit: Suit::Heart,
                value: CardValue::Three,
            },
            Card {
                suit: Suit::Diamond,
                value: CardValue::Four,
            },
            Card {
                suit: Suit::Club,
                value: CardValue::Five,
            },
            Card {
                suit: Suit::Spade,
                value: CardValue::Seven,
            },
        ];
        let hand_strong: [Card; 2] = [
            Card {
                suit: Suit::Heart,
                value: CardValue::Ace,
            },
            Card {
                suit: Suit::Diamond,
                value: CardValue::Ace,
            },
        ];
        let hand_weak: [Card; 2] = [
            Card {
                suit: Suit::Club,
                value: CardValue::Eight,
            },
            Card {
                suit: Suit::Heart,
                value: CardValue::Nine,
            },
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
                Player {
                    position: 0,
                    name: "A".into(),
                    stack: 0,
                    hand: Some(hand_strong),
                    bet_in_round: 0,
                    has_folded: false,
                    is_all_in: false,
                    has_acted: true,
                    total_invested: 100,
                },
                Player {
                    position: 1,
                    name: "B".into(),
                    stack: 0,
                    hand: None,
                    bet_in_round: 0,
                    has_folded: false,
                    is_all_in: false,
                    has_acted: true,
                    total_invested: 100,
                },
                Player {
                    position: 2,
                    name: "C".into(),
                    stack: 0,
                    hand: Some(hand_weak),
                    bet_in_round: 0,
                    has_folded: false,
                    is_all_in: false,
                    has_acted: true,
                    total_invested: 100,
                },
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
            Card {
                suit: Suit::Spade,
                value: CardValue::Two,
            },
            Card {
                suit: Suit::Heart,
                value: CardValue::Three,
            },
            Card {
                suit: Suit::Diamond,
                value: CardValue::Four,
            },
        ];
        let hand_a: [Card; 2] = [
            Card {
                suit: Suit::Club,
                value: CardValue::King,
            },
            Card {
                suit: Suit::Heart,
                value: CardValue::Queen,
            },
        ];
        let hand_b: [Card; 2] = [
            Card {
                suit: Suit::Spade,
                value: CardValue::Nine,
            },
            Card {
                suit: Suit::Club,
                value: CardValue::Eight,
            },
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
                Player {
                    position: 0,
                    name: "X".into(),
                    stack: 900,
                    hand: None,
                    bet_in_round: 0,
                    has_folded: true,
                    is_all_in: false,
                    has_acted: true,
                    total_invested: 100,
                },
                Player {
                    position: 1,
                    name: "A".into(),
                    stack: 900,
                    hand: Some(hand_a),
                    bet_in_round: 0,
                    has_folded: false,
                    is_all_in: false,
                    has_acted: false,
                    total_invested: 100,
                },
                Player {
                    position: 2,
                    name: "B".into(),
                    stack: 900,
                    hand: Some(hand_b),
                    bet_in_round: 0,
                    has_folded: false,
                    is_all_in: false,
                    has_acted: false,
                    total_invested: 100,
                },
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
        board_bet(&mut board, 100, &mut deck, 1).unwrap();
        // bet 後もフェーズは Flop のまま（A が応答していないため）
        assert_eq!(
            board.phase,
            Phase::Flop,
            "bet after check should not advance phase"
        );
        // 次は A のターン
        assert_eq!(board.current_turn, 1, "turn should go back to A");
        // A の has_acted が false にリセットされている
        assert!(
            !board.players[1].has_acted,
            "A's has_acted should be false after B bet"
        );
    }

    /// 3人ゲーム（1人フォールド後の flop）: A check → B bet → A raise → フェーズは Flop のまま（B 未応答）。
    #[test]
    fn raise_does_not_advance_phase_in_two_active_players() {
        use super::super::card::{Card, CardValue, Suit};
        let community = vec![
            Card {
                suit: Suit::Spade,
                value: CardValue::Two,
            },
            Card {
                suit: Suit::Heart,
                value: CardValue::Three,
            },
            Card {
                suit: Suit::Diamond,
                value: CardValue::Four,
            },
        ];
        let hand_a: [Card; 2] = [
            Card {
                suit: Suit::Club,
                value: CardValue::King,
            },
            Card {
                suit: Suit::Heart,
                value: CardValue::Queen,
            },
        ];
        let hand_b: [Card; 2] = [
            Card {
                suit: Suit::Spade,
                value: CardValue::Nine,
            },
            Card {
                suit: Suit::Club,
                value: CardValue::Eight,
            },
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
                Player {
                    position: 0,
                    name: "X".into(),
                    stack: 900,
                    hand: None,
                    bet_in_round: 0,
                    has_folded: true,
                    is_all_in: false,
                    has_acted: true,
                    total_invested: 100,
                },
                Player {
                    position: 1,
                    name: "A".into(),
                    stack: 900,
                    hand: Some(hand_a),
                    bet_in_round: 0,
                    has_folded: false,
                    is_all_in: false,
                    has_acted: false,
                    total_invested: 100,
                },
                Player {
                    position: 2,
                    name: "B".into(),
                    stack: 900,
                    hand: Some(hand_b),
                    bet_in_round: 0,
                    has_folded: false,
                    is_all_in: false,
                    has_acted: false,
                    total_invested: 100,
                },
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
        board_bet(&mut board, 100, &mut deck, 1).unwrap();
        assert_eq!(board.phase, Phase::Flop);
        assert_eq!(board.current_turn, 1); // A のターン
        assert!(
            !board.players[1].has_acted,
            "A's has_acted reset after B bet"
        );

        // A raise 200（B のベットに対してリレイズ）
        board_raise(&mut board, 200, &mut deck, 1).unwrap();
        // フェーズは Flop のまま（B が応答していないため）
        assert_eq!(board.phase, Phase::Flop, "raise should not advance phase");
        assert_eq!(board.current_turn, 2, "turn should be B's");
        assert!(
            !board.players[2].has_acted,
            "B's has_acted should be false after A raise"
        );
    }

    /// ヘッズアップ flop: BB check → BTN bet → フェーズは Flop のまま。
    #[test]
    fn heads_up_flop_bet_does_not_advance_phase() {
        use super::super::card::{Card, CardValue, Suit};
        let community = vec![
            Card {
                suit: Suit::Spade,
                value: CardValue::Two,
            },
            Card {
                suit: Suit::Heart,
                value: CardValue::Three,
            },
            Card {
                suit: Suit::Diamond,
                value: CardValue::Four,
            },
        ];
        let hand_btn: [Card; 2] = [
            Card {
                suit: Suit::Club,
                value: CardValue::King,
            },
            Card {
                suit: Suit::Heart,
                value: CardValue::Queen,
            },
        ];
        let hand_bb: [Card; 2] = [
            Card {
                suit: Suit::Spade,
                value: CardValue::Nine,
            },
            Card {
                suit: Suit::Club,
                value: CardValue::Eight,
            },
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
                Player {
                    position: 0,
                    name: "BTN".into(),
                    stack: 900,
                    hand: Some(hand_btn),
                    bet_in_round: 0,
                    has_folded: false,
                    is_all_in: false,
                    has_acted: false,
                    total_invested: 100,
                },
                Player {
                    position: 1,
                    name: "BB".into(),
                    stack: 900,
                    hand: Some(hand_bb),
                    bet_in_round: 0,
                    has_folded: false,
                    is_all_in: false,
                    has_acted: false,
                    total_invested: 100,
                },
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
        board_bet(&mut board, 100, &mut deck, 1).unwrap();
        // フェーズは Flop のまま
        assert_eq!(
            board.phase,
            Phase::Flop,
            "bet should not advance phase in heads-up"
        );
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
            Card {
                suit: Suit::Spade,
                value: CardValue::Two,
            },
            Card {
                suit: Suit::Heart,
                value: CardValue::Three,
            },
            Card {
                suit: Suit::Diamond,
                value: CardValue::Four,
            },
            Card {
                suit: Suit::Club,
                value: CardValue::Five,
            },
            Card {
                suit: Suit::Spade,
                value: CardValue::Seven,
            },
        ];
        // p0 (short stack=200): AA → AA ペア + ストレートボードでロイヤルな役
        //   コミュニティ: 2 3 4 5 7 + AA → ストレート (A2345) + AA で最強役はストレート or ペア
        //   実際の手役: A 2 3 4 5 でストレート (wheel)
        let hand_short: [Card; 2] = [
            Card {
                suit: Suit::Heart,
                value: CardValue::Ace,
            },
            Card {
                suit: Suit::Diamond,
                value: CardValue::Ace,
            },
        ];
        // p1 (mid stack=400): K9 → ハイカード
        let hand_mid: [Card; 2] = [
            Card {
                suit: Suit::Club,
                value: CardValue::King,
            },
            Card {
                suit: Suit::Heart,
                value: CardValue::Nine,
            },
        ];
        // p2 (big stack=1000): QJ → ハイカード
        let hand_big: [Card; 2] = [
            Card {
                suit: Suit::Spade,
                value: CardValue::Queen,
            },
            Card {
                suit: Suit::Club,
                value: CardValue::Jack,
            },
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
                Player {
                    position: 0,
                    name: "Short".into(),
                    stack: 0,
                    hand: Some(hand_short),
                    bet_in_round: 0,
                    has_folded: false,
                    is_all_in: true,
                    has_acted: true,
                    total_invested: 200,
                },
                Player {
                    position: 1,
                    name: "Mid".into(),
                    stack: 0,
                    hand: Some(hand_mid),
                    bet_in_round: 0,
                    has_folded: false,
                    is_all_in: true,
                    has_acted: true,
                    total_invested: 400,
                },
                Player {
                    position: 2,
                    name: "Big".into(),
                    stack: 600,
                    hand: Some(hand_big),
                    bet_in_round: 0,
                    has_folded: false,
                    is_all_in: true,
                    has_acted: true,
                    total_invested: 400,
                },
            ],
            community_cards: community,
            pots: vec![Pot { amount: 1000 }], // 200+400+400
            phase: Phase::Showdown,
            winners: vec![],
        };

        board.resolve_showdown();

        // p0 は 600 のみ受け取る
        assert_eq!(
            board.players[0].stack, 600,
            "short stack winner gets main pot only"
        );
        // p1 は 400 を受け取る（サイドポット）
        assert_eq!(
            board.players[1].stack, 400,
            "mid stack player gets side pot"
        );
        // p2 は 600（元スタック）のみ
        assert_eq!(
            board.players[2].stack, 600,
            "big stack player should not gain"
        );
        // チップ保全: 600+400+600 = 1600 = 200+400+1000
        let total: u32 = board.players.iter().map(|p| p.stack).sum();
        assert_eq!(total, 1600);
    }

    /// 2 人 all-in（1000/400）と 1 人フォールド（200）→ サイドポット分配。
    #[test]
    fn side_pot_main_and_one_side() {
        use super::super::card::{Card, CardValue, Suit};
        let community = vec![
            Card {
                suit: Suit::Spade,
                value: CardValue::Two,
            },
            Card {
                suit: Suit::Heart,
                value: CardValue::Three,
            },
            Card {
                suit: Suit::Diamond,
                value: CardValue::Four,
            },
            Card {
                suit: Suit::Club,
                value: CardValue::Five,
            },
            Card {
                suit: Suit::Spade,
                value: CardValue::Seven,
            },
        ];
        let hand_big: [Card; 2] = [
            Card {
                suit: Suit::Heart,
                value: CardValue::Ace,
            },
            Card {
                suit: Suit::Diamond,
                value: CardValue::Ace,
            },
        ];
        let hand_mid: [Card; 2] = [
            Card {
                suit: Suit::Club,
                value: CardValue::King,
            },
            Card {
                suit: Suit::Heart,
                value: CardValue::Nine,
            },
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
                Player {
                    position: 0,
                    name: "Fold".into(),
                    stack: 800,
                    hand: None,
                    bet_in_round: 0,
                    has_folded: true,
                    is_all_in: false,
                    has_acted: true,
                    total_invested: 200,
                },
                Player {
                    position: 1,
                    name: "Mid".into(),
                    stack: 0,
                    hand: Some(hand_mid),
                    bet_in_round: 0,
                    has_folded: false,
                    is_all_in: true,
                    has_acted: true,
                    total_invested: 400,
                },
                Player {
                    position: 2,
                    name: "Big".into(),
                    stack: 600,
                    hand: Some(hand_big),
                    bet_in_round: 0,
                    has_folded: false,
                    is_all_in: true,
                    has_acted: true,
                    total_invested: 400,
                },
            ],
            community_cards: community,
            pots: vec![Pot { amount: 1000 }], // 200+400+400
            phase: Phase::Showdown,
            winners: vec![],
        };

        board.resolve_showdown();

        // p2(AA) が全サイドポット勝者
        assert_eq!(
            board.players[2].stack,
            600 + 1000,
            "AA wins all eligible pots"
        );
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
            Card {
                suit: Suit::Spade,
                value: CardValue::Ace,
            },
            Card {
                suit: Suit::Spade,
                value: CardValue::King,
            },
            Card {
                suit: Suit::Spade,
                value: CardValue::Queen,
            },
            Card {
                suit: Suit::Spade,
                value: CardValue::Jack,
            },
            Card {
                suit: Suit::Spade,
                value: CardValue::Ten,
            },
        ];
        // 全員が low card を持つ（ボードに勝てない）→ 全員がロイヤルフラッシュでスプリット
        let hand0: [Card; 2] = [
            Card {
                suit: Suit::Heart,
                value: CardValue::Two,
            },
            Card {
                suit: Suit::Diamond,
                value: CardValue::Three,
            },
        ];
        let hand1: [Card; 2] = [
            Card {
                suit: Suit::Club,
                value: CardValue::Two,
            },
            Card {
                suit: Suit::Heart,
                value: CardValue::Four,
            },
        ];
        let hand2: [Card; 2] = [
            Card {
                suit: Suit::Diamond,
                value: CardValue::Two,
            },
            Card {
                suit: Suit::Club,
                value: CardValue::Five,
            },
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
                Player {
                    position: 0,
                    name: "P0".into(),
                    stack: 0,
                    hand: Some(hand0),
                    bet_in_round: 0,
                    has_folded: false,
                    is_all_in: false,
                    has_acted: true,
                    total_invested: 100,
                },
                Player {
                    position: 1,
                    name: "P1".into(),
                    stack: 0,
                    hand: Some(hand1),
                    bet_in_round: 0,
                    has_folded: false,
                    is_all_in: false,
                    has_acted: true,
                    total_invested: 100,
                },
                Player {
                    position: 2,
                    name: "P2".into(),
                    stack: 0,
                    hand: Some(hand2),
                    bet_in_round: 0,
                    has_folded: false,
                    is_all_in: false,
                    has_acted: true,
                    total_invested: 100,
                },
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
        let board_start =
            start_game_with_stacks(settings, names, initial_stacks.clone(), 1, 0, 1, 2).unwrap();
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
            Card {
                suit: Suit::Spade,
                value: CardValue::Ace,
            },
            Card {
                suit: Suit::Spade,
                value: CardValue::King,
            },
            Card {
                suit: Suit::Spade,
                value: CardValue::Queen,
            },
            Card {
                suit: Suit::Spade,
                value: CardValue::Jack,
            },
            Card {
                suit: Suit::Spade,
                value: CardValue::Ten,
            },
        ];
        let make_low_hand = |v1: CardValue, v2: CardValue| -> [Card; 2] {
            [
                Card {
                    suit: Suit::Heart,
                    value: v1,
                },
                Card {
                    suit: Suit::Diamond,
                    value: v2,
                },
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
                Player {
                    position: 0,
                    name: "P0".into(),
                    stack: 0,
                    hand: Some(make_low_hand(CardValue::Two, CardValue::Three)),
                    bet_in_round: 0,
                    has_folded: false,
                    is_all_in: false,
                    has_acted: true,
                    total_invested: 100,
                },
                Player {
                    position: 1,
                    name: "P1".into(),
                    stack: 0,
                    hand: Some(make_low_hand(CardValue::Four, CardValue::Five)),
                    bet_in_round: 0,
                    has_folded: false,
                    is_all_in: false,
                    has_acted: true,
                    total_invested: 100,
                },
                Player {
                    position: 2,
                    name: "P2".into(),
                    stack: 0,
                    hand: Some(make_low_hand(CardValue::Six, CardValue::Seven)),
                    bet_in_round: 0,
                    has_folded: true,
                    is_all_in: false,
                    has_acted: true,
                    total_invested: 1,
                },
                Player {
                    position: 3,
                    name: "P3".into(),
                    stack: 0,
                    hand: Some(make_low_hand(CardValue::Eight, CardValue::Nine)),
                    bet_in_round: 0,
                    has_folded: false,
                    is_all_in: false,
                    has_acted: true,
                    total_invested: 100,
                },
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
        assert_eq!(
            board.players[3].stack, 101,
            "P3 (dealer left) should get the remainder"
        );
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
            Card {
                suit: Suit::Heart,
                value: CardValue::Ace,
            },
            Card {
                suit: Suit::Spade,
                value: CardValue::King,
            },
        ];
        let hand_b: [Card; 2] = [
            Card {
                suit: Suit::Diamond,
                value: CardValue::Queen,
            },
            Card {
                suit: Suit::Club,
                value: CardValue::Jack,
            },
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
                Player {
                    position: 0,
                    name: "A".into(),
                    stack: 900,
                    hand: Some(hand_a),
                    bet_in_round: 100,
                    has_folded: false,
                    is_all_in: false,
                    has_acted: false,
                    total_invested: 100,
                },
                Player {
                    position: 1,
                    name: "B".into(),
                    stack: 900,
                    hand: Some(hand_b),
                    bet_in_round: 100,
                    has_folded: false,
                    is_all_in: false,
                    has_acted: true,
                    total_invested: 100,
                },
            ],
            community_cards: vec![],
            pots: vec![Pot { amount: 0 }],
            phase: Phase::PreFlop,
            winners: vec![],
        };
        let mut deck = Vec::new();

        let result = board_raise(&mut board, 150, &mut deck, 1);
        assert!(
            result.is_err(),
            "raise to 150 should be rejected when min raise is 200"
        );
    }

    /// current_bet=100, last_raise_size=100, raise to=200 → Ok（ちょうど min raise）。
    #[test]
    fn raise_at_min_raise_is_accepted() {
        use super::super::card::{Card, CardValue, Suit};
        let community = vec![
            Card {
                suit: Suit::Spade,
                value: CardValue::Two,
            },
            Card {
                suit: Suit::Heart,
                value: CardValue::Three,
            },
            Card {
                suit: Suit::Diamond,
                value: CardValue::Four,
            },
        ];
        let hand_a: [Card; 2] = [
            Card {
                suit: Suit::Heart,
                value: CardValue::Ace,
            },
            Card {
                suit: Suit::Spade,
                value: CardValue::King,
            },
        ];
        let hand_b: [Card; 2] = [
            Card {
                suit: Suit::Diamond,
                value: CardValue::Queen,
            },
            Card {
                suit: Suit::Club,
                value: CardValue::Jack,
            },
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
                Player {
                    position: 0,
                    name: "A".into(),
                    stack: 900,
                    hand: Some(hand_a),
                    bet_in_round: 100,
                    has_folded: false,
                    is_all_in: false,
                    has_acted: false,
                    total_invested: 100,
                },
                Player {
                    position: 1,
                    name: "B".into(),
                    stack: 900,
                    hand: Some(hand_b),
                    bet_in_round: 100,
                    has_folded: false,
                    is_all_in: false,
                    has_acted: true,
                    total_invested: 100,
                },
            ],
            community_cards: community,
            pots: vec![Pot { amount: 0 }],
            phase: Phase::Flop,
            winners: vec![],
        };
        let mut deck = Vec::new();

        let result = board_raise(&mut board, 200, &mut deck, 1);
        assert!(
            result.is_ok(),
            "raise to 200 should be accepted (min raise)"
        );
        assert_eq!(board.current_bet, 200);
    }

    /// スタック 50, current_bet=100, last_raise_size=100 → all-in 例外で raise to=150 は Ok。
    #[test]
    fn raise_below_min_raise_allowed_when_all_in() {
        use super::super::card::{Card, CardValue, Suit};
        let community = vec![
            Card {
                suit: Suit::Spade,
                value: CardValue::Two,
            },
            Card {
                suit: Suit::Heart,
                value: CardValue::Three,
            },
            Card {
                suit: Suit::Diamond,
                value: CardValue::Four,
            },
        ];
        let hand_a: [Card; 2] = [
            Card {
                suit: Suit::Heart,
                value: CardValue::Ace,
            },
            Card {
                suit: Suit::Spade,
                value: CardValue::King,
            },
        ];
        let hand_b: [Card; 2] = [
            Card {
                suit: Suit::Diamond,
                value: CardValue::Queen,
            },
            Card {
                suit: Suit::Club,
                value: CardValue::Jack,
            },
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
                Player {
                    position: 0,
                    name: "A".into(),
                    stack: 50,
                    hand: Some(hand_a),
                    bet_in_round: 100,
                    has_folded: false,
                    is_all_in: false,
                    has_acted: false,
                    total_invested: 100,
                },
                Player {
                    position: 1,
                    name: "B".into(),
                    stack: 900,
                    hand: Some(hand_b),
                    bet_in_round: 100,
                    has_folded: false,
                    is_all_in: false,
                    has_acted: true,
                    total_invested: 100,
                },
            ],
            community_cards: community,
            pots: vec![Pot { amount: 0 }],
            phase: Phase::Flop,
            winners: vec![],
        };
        let mut deck = Vec::new();

        let result = board_raise(&mut board, 150, &mut deck, 1);
        assert!(result.is_ok(), "all-in raise below min should be allowed");
        assert!(board.players[0].is_all_in);
    }

    /// Bet 後に last_raise_size が bet 額そのものになる（prev_bet=0 から差分を取る）。
    /// これは BUG-X minimum raise validation が機能するための前提。
    #[test]
    fn bet_sets_last_raise_size_to_bet_amount() {
        use super::super::card::{Card, CardValue, Suit};
        let community = vec![
            Card {
                suit: Suit::Spade,
                value: CardValue::Two,
            },
            Card {
                suit: Suit::Heart,
                value: CardValue::Three,
            },
            Card {
                suit: Suit::Diamond,
                value: CardValue::Four,
            },
        ];
        let hand_a: [Card; 2] = [
            Card {
                suit: Suit::Heart,
                value: CardValue::Ace,
            },
            Card {
                suit: Suit::Spade,
                value: CardValue::King,
            },
        ];
        let hand_b: [Card; 2] = [
            Card {
                suit: Suit::Diamond,
                value: CardValue::Queen,
            },
            Card {
                suit: Suit::Club,
                value: CardValue::Jack,
            },
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
                Player {
                    position: 0,
                    name: "A".into(),
                    stack: 900,
                    hand: Some(hand_a),
                    bet_in_round: 0,
                    has_folded: false,
                    is_all_in: false,
                    has_acted: false,
                    total_invested: 100,
                },
                Player {
                    position: 1,
                    name: "B".into(),
                    stack: 900,
                    hand: Some(hand_b),
                    bet_in_round: 0,
                    has_folded: false,
                    is_all_in: false,
                    has_acted: false,
                    total_invested: 100,
                },
            ],
            community_cards: community,
            pots: vec![Pot { amount: 200 }],
            phase: Phase::Flop,
            winners: vec![],
        };
        let mut deck = Vec::new();

        board_bet(&mut board, 200, &mut deck, 1).unwrap();
        assert_eq!(
            board.current_bet, 200,
            "current_bet should equal bet amount"
        );
        assert_eq!(
            board.last_raise_size, 200,
            "last_raise_size should equal bet amount (regression: was 0)"
        );

        // 次の raise の min_raise_to = 200 + 200 = 400 → raise to=300 は拒否されるべき
        let result = board_raise(&mut board, 300, &mut deck, 1);
        assert!(
            result.is_err(),
            "raise to 300 should be rejected (min raise=400)"
        );
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
            Card {
                suit: Suit::Spade,
                value: CardValue::Ace,
            },
            Card {
                suit: Suit::Heart,
                value: CardValue::King,
            },
        ];
        let hand_b = [
            Card {
                suit: Suit::Diamond,
                value: CardValue::Queen,
            },
            Card {
                suit: Suit::Club,
                value: CardValue::Jack,
            },
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
                Player {
                    position: 0,
                    name: "A".into(),
                    stack: 0,
                    hand: Some(hand_a),
                    bet_in_round: 0,
                    has_folded: false,
                    is_all_in: true,
                    has_acted: true,
                    total_invested: 200,
                },
                Player {
                    position: 1,
                    name: "B".into(),
                    stack: 0,
                    hand: Some(hand_b),
                    bet_in_round: 0,
                    has_folded: false,
                    is_all_in: true,
                    has_acted: true,
                    total_invested: 200,
                },
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

    // ================================================================
    // Bug 1: bb_ante フラグ適用
    // ================================================================

    /// bb_ante=true で開始した場合、BB の stack が big_blind 分追加で減り、ポットに入ること。
    #[test]
    fn bb_ante_deducts_from_bb_and_adds_to_pot() {
        let settings = GameSettings {
            small_blind: 50,
            big_blind: 100,
            min_chip: 50,
            bb_ante: true,
        };
        let names = vec!["Alice".into(), "Bob".into(), "Carol".into()];
        // dealer=0 → SB=1, BB=2
        let board = start_game(settings.clone(), names, 0).unwrap();

        // BB は big_blind(100) のブラインドと big_blind(100) のアンティ = 合計 200 を失う
        let initial_stack = settings.small_blind * 100; // 50 * 100 = 5000
        let bb = &board.players[2]; // BB = position 2
        assert_eq!(
            bb.stack,
            initial_stack - settings.big_blind - settings.big_blind,
            "BB stack should be reduced by blind + ante"
        );
        assert_eq!(
            bb.total_invested,
            settings.big_blind + settings.big_blind,
            "BB total_invested should include blind + ante"
        );

        // ポットにアンティが反映されている（ブラインドは bet_in_round にあるので advance_phase で加算）
        assert_eq!(
            board.total_pot(),
            settings.big_blind,
            "pot should contain the ante amount at game start"
        );

        // SB は変わらず
        let sb = &board.players[1];
        assert_eq!(sb.stack, initial_stack - settings.small_blind);
        assert_eq!(sb.bet_in_round, settings.small_blind);
    }

    /// bb_ante=false で開始した場合、ポットは 0 のまま（従来通り）。
    #[test]
    fn bb_ante_false_pot_is_zero_at_start() {
        let settings = GameSettings {
            small_blind: 50,
            big_blind: 100,
            min_chip: 50,
            bb_ante: false,
        };
        let names = vec!["Alice".into(), "Bob".into(), "Carol".into()];
        let board = start_game(settings, names, 0).unwrap();
        assert_eq!(
            board.total_pot(),
            0,
            "pot should be 0 when bb_ante is false"
        );
    }

    /// bb_ante=true で全員オールインした後もチップ保全されること。
    #[test]
    fn bb_ante_total_chips_preserved() {
        let settings = GameSettings {
            small_blind: 50,
            big_blind: 100,
            min_chip: 50,
            bb_ante: true,
        };
        let names = vec!["Alice".into(), "Bob".into(), "Carol".into()];
        let initial_stack = settings.small_blind * 100; // 5000
        let total_before: u32 = initial_stack * 3;

        let board = start_game(settings, names, 0).unwrap();
        let mut board = board;
        let mut deck = build_remaining_deck(&board);

        board_allin(&mut board, &mut deck).unwrap();
        board_allin(&mut board, &mut deck).unwrap();
        board_allin(&mut board, &mut deck).unwrap();

        let total_after: u32 = board.players.iter().map(|p| p.stack).sum();
        assert_eq!(
            total_after, total_before,
            "total chips must be preserved with bb_ante"
        );
    }

    /// bb_ante=true でサイドポットが発生する場合、ante 分が二重カウントされないこと。
    ///
    /// シナリオ: dealer=0, SB=1 (200 stack), BB=2 (200 stack), UTG=0 (400 stack)
    /// sb=50, bb=100, ante=100 → BB.total_invested=200, BB is all-in
    /// 全員 all-in → Showdown でチップ総量が保全されること。
    #[test]
    fn bb_ante_sidepot_no_double_count() {
        let settings = GameSettings {
            small_blind: 50,
            big_blind: 100,
            min_chip: 50,
            bb_ante: true,
        };
        let names = vec!["UTG".into(), "SB".into(), "BB".into()];
        let stacks = vec![400u32, 200, 200];
        let total_before: u32 = stacks.iter().sum();

        let mut board = start_game_with_stacks(settings, names, stacks, 1, 0, 1, 2).unwrap();
        let mut deck = build_remaining_deck(&board);

        // 全員 all-in: UTG→SB→BB の順でアクション
        board_allin(&mut board, &mut deck).unwrap();
        board_allin(&mut board, &mut deck).unwrap();
        // BB は already all-in なので次は Showdown へ

        let total_after: u32 = board.players.iter().map(|p| p.stack).sum();
        assert_eq!(
            total_after, total_before,
            "total chips must be preserved with bb_ante and sidepot"
        );
    }

    // ================================================================
    // Bug 7 (resolve_showdown undistributed): 勝者に端数を渡す
    // ================================================================

    /// undistributed が発生したとき dealer-left の非フォールドではなく
    /// 勝者 (all_winner_positions) に端数が渡ること。
    ///
    /// シナリオ: dealer=0, 3 人。p0=winner(non-folded), p1=non-folded(loser), p2=folded。
    /// dealer-left 順は p1→p2→p0 なので修正前は p1 が端数を受け取っていた。
    /// pots.sum()=110 > total_invested.sum()=100 で undistributed=10 を人工的に生成。
    #[test]
    fn resolve_showdown_undistributed_goes_to_winner_not_dealer_left_loser() {
        use super::super::card::{Card, CardValue, Suit};
        let hand_winner: [Card; 2] = [
            Card {
                suit: Suit::Spade,
                value: CardValue::Ace,
            },
            Card {
                suit: Suit::Spade,
                value: CardValue::King,
            },
        ];
        let hand_loser: [Card; 2] = [
            Card {
                suit: Suit::Diamond,
                value: CardValue::Two,
            },
            Card {
                suit: Suit::Club,
                value: CardValue::Three,
            },
        ];
        let community = vec![
            Card {
                suit: Suit::Spade,
                value: CardValue::Queen,
            },
            Card {
                suit: Suit::Spade,
                value: CardValue::Jack,
            },
            Card {
                suit: Suit::Spade,
                value: CardValue::Ten,
            },
            Card {
                suit: Suit::Heart,
                value: CardValue::Five,
            },
            Card {
                suit: Suit::Heart,
                value: CardValue::Six,
            },
        ];
        // dealer=0 → dealer-left 順は p1→p2→p0
        // p0: winner (手役最強), p1: loser (non-folded), p2: folded
        // total_invested: p0=100, p1=0, p2=0 → sum=100
        // pots[0].amount=110 → undistributed=10
        let mut board = TexasHoldemBoard {
            hand_number: 1,
            dealer_position: 0,
            sb_position: 1,
            bb_position: 2,
            // p1 が current_turn で check すると is_round_complete → advance_phase → Showdown
            current_turn: 1,
            current_bet: 0,
            last_raise_size: 0,
            players: vec![
                Player {
                    position: 0,
                    name: "Winner".into(),
                    stack: 0,
                    hand: Some(hand_winner),
                    bet_in_round: 0,
                    has_folded: false,
                    is_all_in: true,
                    has_acted: true,
                    total_invested: 100,
                },
                Player {
                    position: 1,
                    name: "Loser".into(),
                    stack: 500,
                    hand: Some(hand_loser),
                    bet_in_round: 0,
                    has_folded: false,
                    is_all_in: false,
                    has_acted: false,
                    total_invested: 0,
                },
                Player {
                    position: 2,
                    name: "Folded".into(),
                    stack: 500,
                    hand: None,
                    bet_in_round: 0,
                    has_folded: true,
                    is_all_in: false,
                    has_acted: true,
                    total_invested: 0,
                },
            ],
            community_cards: community,
            pots: vec![Pot { amount: 110 }],
            phase: Phase::River,
            winners: vec![],
        };
        // p1 が check → is_round_complete → advance_phase → Showdown → resolve_showdown
        let mut deck = Vec::new();
        board_check(&mut board, &mut deck).unwrap();

        assert_eq!(board.phase, Phase::Showdown);
        let winner = &board.players[0]; // p0 = Winner
        let loser = &board.players[1]; // p1 = Loser
                                       // p0 が pot 100 + undistributed 10 = 110 を受け取るべき
        assert_eq!(
            winner.stack, 110,
            "winner should receive distributed 100 + undistributed 10"
        );
        // p1 は端数を受け取らない
        assert_eq!(loser.stack, 500, "loser should not receive undistributed");
    }

    // ================================================================
    // Bug 2: u32 乗算オーバーフロー
    // ================================================================

    /// small_blind が非常に大きい場合、start_game が overflow エラーを返すこと。
    #[test]
    fn start_game_overflow_returns_error() {
        let settings = GameSettings {
            small_blind: u32::MAX / 50, // * 100 でオーバーフロー
            big_blind: u32::MAX / 50 * 2,
            min_chip: 1,
            bb_ante: false,
        };
        let names = vec!["Alice".into(), "Bob".into()];
        let result = start_game(settings, names, 0);
        assert!(result.is_err(), "overflow should return Err");
    }

    /// small_blind が境界値（42949672）では成功すること（4294967200 < u32::MAX）。
    #[test]
    fn start_game_boundary_near_overflow_succeeds() {
        let settings = GameSettings {
            small_blind: 42949672, // 42949672 * 100 = 4294967200 < u32::MAX(4294967295)
            big_blind: 85899344,
            min_chip: 1,
            bb_ante: false,
        };
        let names = vec!["Alice".into(), "Bob".into()];
        let result = start_game(settings, names, 0);
        assert!(
            result.is_ok(),
            "42949672 * 100 = 4294967200 does not overflow u32"
        );
    }

    /// small_blind=42949 (42949 * 100 = 4294900 < u32::MAX) は成功する。
    #[test]
    fn start_game_large_but_valid_small_blind_succeeds() {
        let settings = GameSettings {
            small_blind: 42949,
            big_blind: 85898,
            min_chip: 1,
            bb_ante: false,
        };
        let names = vec!["Alice".into(), "Bob".into()];
        let result = start_game(settings, names, 0);
        assert!(
            result.is_ok(),
            "42949 * 100 = 4294900 should not overflow u32"
        );
    }

    // ================================================================
    // Bug 3: min_chip 倍数制約の検証
    // ================================================================

    /// board_bet で min_chip=10 の倍数でない amount=15 → エラー。
    #[test]
    fn board_bet_rejects_non_multiple_of_min_chip() {
        use super::super::card::{Card, CardValue, Suit};
        let hand_a: [Card; 2] = [
            Card {
                suit: Suit::Heart,
                value: CardValue::Ace,
            },
            Card {
                suit: Suit::Spade,
                value: CardValue::King,
            },
        ];
        let hand_b: [Card; 2] = [
            Card {
                suit: Suit::Diamond,
                value: CardValue::Queen,
            },
            Card {
                suit: Suit::Club,
                value: CardValue::Jack,
            },
        ];
        let mut board = TexasHoldemBoard {
            hand_number: 1,
            dealer_position: 0,
            sb_position: 0,
            bb_position: 1,
            current_turn: 0,
            current_bet: 0,
            last_raise_size: 0,
            players: vec![
                Player {
                    position: 0,
                    name: "A".into(),
                    stack: 1000,
                    hand: Some(hand_a),
                    bet_in_round: 0,
                    has_folded: false,
                    is_all_in: false,
                    has_acted: false,
                    total_invested: 0,
                },
                Player {
                    position: 1,
                    name: "B".into(),
                    stack: 1000,
                    hand: Some(hand_b),
                    bet_in_round: 0,
                    has_folded: false,
                    is_all_in: false,
                    has_acted: false,
                    total_invested: 0,
                },
            ],
            community_cards: vec![],
            pots: vec![Pot { amount: 0 }],
            phase: Phase::Flop,
            winners: vec![],
        };
        let mut deck = Vec::new();

        let result = board_bet(&mut board, 15, &mut deck, 10);
        assert!(
            result.is_err(),
            "bet of 15 should be rejected when min_chip=10"
        );
        let msg = result.unwrap_err().to_string();
        assert!(
            msg.contains("min_chip"),
            "error message should mention min_chip"
        );
    }

    /// board_bet で min_chip=10 の倍数である amount=20 → 成功。
    #[test]
    fn board_bet_accepts_multiple_of_min_chip() {
        use super::super::card::{Card, CardValue, Suit};
        let hand_a: [Card; 2] = [
            Card {
                suit: Suit::Heart,
                value: CardValue::Ace,
            },
            Card {
                suit: Suit::Spade,
                value: CardValue::King,
            },
        ];
        let hand_b: [Card; 2] = [
            Card {
                suit: Suit::Diamond,
                value: CardValue::Queen,
            },
            Card {
                suit: Suit::Club,
                value: CardValue::Jack,
            },
        ];
        let community = vec![
            Card {
                suit: Suit::Club,
                value: CardValue::Two,
            },
            Card {
                suit: Suit::Heart,
                value: CardValue::Three,
            },
            Card {
                suit: Suit::Diamond,
                value: CardValue::Four,
            },
        ];
        let mut board = TexasHoldemBoard {
            hand_number: 1,
            dealer_position: 0,
            sb_position: 0,
            bb_position: 1,
            current_turn: 0,
            current_bet: 0,
            last_raise_size: 0,
            players: vec![
                Player {
                    position: 0,
                    name: "A".into(),
                    stack: 1000,
                    hand: Some(hand_a),
                    bet_in_round: 0,
                    has_folded: false,
                    is_all_in: false,
                    has_acted: false,
                    total_invested: 0,
                },
                Player {
                    position: 1,
                    name: "B".into(),
                    stack: 1000,
                    hand: Some(hand_b),
                    bet_in_round: 0,
                    has_folded: false,
                    is_all_in: false,
                    has_acted: false,
                    total_invested: 0,
                },
            ],
            community_cards: community,
            pots: vec![Pot { amount: 0 }],
            phase: Phase::Flop,
            winners: vec![],
        };
        let mut deck = Vec::new();

        let result = board_bet(&mut board, 20, &mut deck, 10);
        assert!(
            result.is_ok(),
            "bet of 20 should be accepted when min_chip=10"
        );
        assert_eq!(board.current_bet, 20);
    }

    /// board_raise で min_chip=10 の倍数でない amount=15 → エラー。
    #[test]
    fn board_raise_rejects_non_multiple_of_min_chip() {
        use super::super::card::{Card, CardValue, Suit};
        let hand_a: [Card; 2] = [
            Card {
                suit: Suit::Heart,
                value: CardValue::Ace,
            },
            Card {
                suit: Suit::Spade,
                value: CardValue::King,
            },
        ];
        let hand_b: [Card; 2] = [
            Card {
                suit: Suit::Diamond,
                value: CardValue::Queen,
            },
            Card {
                suit: Suit::Club,
                value: CardValue::Jack,
            },
        ];
        let mut board = TexasHoldemBoard {
            hand_number: 1,
            dealer_position: 0,
            sb_position: 0,
            bb_position: 1,
            current_turn: 0,
            current_bet: 10,
            last_raise_size: 10,
            players: vec![
                Player {
                    position: 0,
                    name: "A".into(),
                    stack: 1000,
                    hand: Some(hand_a),
                    bet_in_round: 10,
                    has_folded: false,
                    is_all_in: false,
                    has_acted: false,
                    total_invested: 10,
                },
                Player {
                    position: 1,
                    name: "B".into(),
                    stack: 1000,
                    hand: Some(hand_b),
                    bet_in_round: 10,
                    has_folded: false,
                    is_all_in: false,
                    has_acted: true,
                    total_invested: 10,
                },
            ],
            community_cards: vec![],
            pots: vec![Pot { amount: 0 }],
            phase: Phase::PreFlop,
            winners: vec![],
        };
        let mut deck = Vec::new();

        // to=15 は min_chip=10 の倍数ではない → エラー（min raise 検証より先に実行される）
        let result = board_raise(&mut board, 15, &mut deck, 10);
        assert!(
            result.is_err(),
            "raise to 15 should be rejected when min_chip=10"
        );
        let msg = result.unwrap_err().to_string();
        assert!(
            msg.contains("min_chip"),
            "error message should mention min_chip"
        );
    }

    /// board_raise で min_chip=10 の倍数である amount=20 → 成功。
    #[test]
    fn board_raise_accepts_multiple_of_min_chip() {
        use super::super::card::{Card, CardValue, Suit};
        let hand_a: [Card; 2] = [
            Card {
                suit: Suit::Heart,
                value: CardValue::Ace,
            },
            Card {
                suit: Suit::Spade,
                value: CardValue::King,
            },
        ];
        let hand_b: [Card; 2] = [
            Card {
                suit: Suit::Diamond,
                value: CardValue::Queen,
            },
            Card {
                suit: Suit::Club,
                value: CardValue::Jack,
            },
        ];
        let community = vec![
            Card {
                suit: Suit::Club,
                value: CardValue::Two,
            },
            Card {
                suit: Suit::Heart,
                value: CardValue::Three,
            },
            Card {
                suit: Suit::Diamond,
                value: CardValue::Four,
            },
        ];
        let mut board = TexasHoldemBoard {
            hand_number: 1,
            dealer_position: 0,
            sb_position: 0,
            bb_position: 1,
            current_turn: 0,
            current_bet: 10,
            last_raise_size: 10,
            players: vec![
                Player {
                    position: 0,
                    name: "A".into(),
                    stack: 1000,
                    hand: Some(hand_a),
                    bet_in_round: 10,
                    has_folded: false,
                    is_all_in: false,
                    has_acted: false,
                    total_invested: 10,
                },
                Player {
                    position: 1,
                    name: "B".into(),
                    stack: 1000,
                    hand: Some(hand_b),
                    bet_in_round: 10,
                    has_folded: false,
                    is_all_in: false,
                    has_acted: true,
                    total_invested: 10,
                },
            ],
            community_cards: community,
            pots: vec![Pot { amount: 0 }],
            phase: Phase::Flop,
            winners: vec![],
        };
        let mut deck = Vec::new();

        // to=20 は min_chip=10 の倍数かつ min raise (10+10=20) を満たす → 成功
        let result = board_raise(&mut board, 20, &mut deck, 10);
        assert!(
            result.is_ok(),
            "raise to 20 should be accepted when min_chip=10"
        );
        assert_eq!(board.current_bet, 20);
    }

    // ================================================================
    // Bug 7: advance_phase でのバーンカード消費
    // ================================================================

    /// PreFlop → Flop 遷移でバーンカード 1 枚が消費されること。
    #[test]
    fn advance_phase_burns_one_card_before_flop() {
        let settings = GameSettings {
            small_blind: 50,
            big_blind: 100,
            min_chip: 50,
            bb_ante: false,
        };
        let names = vec!["Alice".into(), "Bob".into(), "Carol".into()];
        let board = start_game(settings, names, 0).unwrap();
        let mut deck = build_remaining_deck(&board);
        let deck_size_before = deck.len();

        let mut b = board.clone();
        // PreFlop → Flop: バーン 1 枚 + フロップ 3 枚 = 4 枚消費
        b.advance_phase(&mut deck);

        assert_eq!(b.phase, Phase::Flop);
        assert_eq!(
            b.community_cards.len(),
            3,
            "flop should have 3 community cards"
        );
        assert_eq!(
            deck.len(),
            deck_size_before - 4,
            "deck should shrink by 4 (1 burn + 3 flop) on PreFlop->Flop"
        );
    }

    /// Flop → Turn 遷移でバーンカード 1 枚が消費されること。
    #[test]
    fn advance_phase_burns_one_card_before_turn() {
        let hand_a = [
            Card {
                suit: Suit::Spade,
                value: CardValue::Ace,
            },
            Card {
                suit: Suit::Heart,
                value: CardValue::King,
            },
        ];
        let hand_b = [
            Card {
                suit: Suit::Diamond,
                value: CardValue::Queen,
            },
            Card {
                suit: Suit::Club,
                value: CardValue::Jack,
            },
        ];
        let flop = vec![
            Card {
                suit: Suit::Spade,
                value: CardValue::Two,
            },
            Card {
                suit: Suit::Heart,
                value: CardValue::Three,
            },
            Card {
                suit: Suit::Diamond,
                value: CardValue::Four,
            },
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
                Player {
                    position: 0,
                    name: "A".into(),
                    stack: 900,
                    hand: Some(hand_a),
                    bet_in_round: 0,
                    has_folded: false,
                    is_all_in: false,
                    has_acted: true,
                    total_invested: 100,
                },
                Player {
                    position: 1,
                    name: "B".into(),
                    stack: 900,
                    hand: Some(hand_b),
                    bet_in_round: 0,
                    has_folded: false,
                    is_all_in: false,
                    has_acted: true,
                    total_invested: 100,
                },
            ],
            community_cards: flop,
            pots: vec![Pot { amount: 200 }],
            phase: Phase::Flop,
            winners: vec![],
        };
        // ターン用カードのデッキ (Vec::pop は末尾から取るので逆順で積む)
        // pop() 順: Six (バーン) → Five (ターン)
        let mut deck = vec![
            Card {
                suit: Suit::Spade,
                value: CardValue::Five,
            }, // ターンカード (先に積む)
            Card {
                suit: Suit::Club,
                value: CardValue::Six,
            }, // バーンカード (後に積む = 最初に pop)
        ];
        let deck_size_before = deck.len();

        board.advance_phase(&mut deck);

        assert_eq!(board.phase, Phase::Turn);
        assert_eq!(
            board.community_cards.len(),
            4,
            "turn should add 1 community card"
        );
        // バーン 1 枚 + ターン 1 枚 = 2 枚消費
        assert_eq!(
            deck.len(),
            deck_size_before - 2,
            "deck should shrink by 2 (1 burn + 1 turn) on Flop->Turn"
        );
        // ターンカードはバーン後に pop = Spade Five
        assert_eq!(
            board.community_cards[3],
            Card {
                suit: Suit::Spade,
                value: CardValue::Five
            },
            "turn card should be the card after burn"
        );
    }

    /// Turn → River 遷移でバーンカード 1 枚が消費されること。
    #[test]
    fn advance_phase_burns_one_card_before_river() {
        let hand_a = [
            Card {
                suit: Suit::Spade,
                value: CardValue::Ace,
            },
            Card {
                suit: Suit::Heart,
                value: CardValue::King,
            },
        ];
        let hand_b = [
            Card {
                suit: Suit::Diamond,
                value: CardValue::Queen,
            },
            Card {
                suit: Suit::Club,
                value: CardValue::Jack,
            },
        ];
        let four_cards = vec![
            Card {
                suit: Suit::Spade,
                value: CardValue::Two,
            },
            Card {
                suit: Suit::Heart,
                value: CardValue::Three,
            },
            Card {
                suit: Suit::Diamond,
                value: CardValue::Four,
            },
            Card {
                suit: Suit::Club,
                value: CardValue::Five,
            },
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
                Player {
                    position: 0,
                    name: "A".into(),
                    stack: 900,
                    hand: Some(hand_a),
                    bet_in_round: 0,
                    has_folded: false,
                    is_all_in: false,
                    has_acted: true,
                    total_invested: 100,
                },
                Player {
                    position: 1,
                    name: "B".into(),
                    stack: 900,
                    hand: Some(hand_b),
                    bet_in_round: 0,
                    has_folded: false,
                    is_all_in: false,
                    has_acted: true,
                    total_invested: 100,
                },
            ],
            community_cards: four_cards,
            pots: vec![Pot { amount: 200 }],
            phase: Phase::Turn,
            winners: vec![],
        };
        // リバー用デッキ (Vec::pop は末尾から取るので逆順で積む)
        // pop() 順: Eight (バーン) → Seven (リバー)
        let mut deck = vec![
            Card {
                suit: Suit::Heart,
                value: CardValue::Seven,
            }, // リバーカード (先に積む)
            Card {
                suit: Suit::Spade,
                value: CardValue::Eight,
            }, // バーンカード (後に積む = 最初に pop)
        ];
        let deck_size_before = deck.len();

        board.advance_phase(&mut deck);

        assert_eq!(board.phase, Phase::River);
        assert_eq!(
            board.community_cards.len(),
            5,
            "river should add 1 community card"
        );
        // バーン 1 枚 + リバー 1 枚 = 2 枚消費
        assert_eq!(
            deck.len(),
            deck_size_before - 2,
            "deck should shrink by 2 (1 burn + 1 river) on Turn->River"
        );
        // リバーカードはバーン後に pop = Heart Seven
        assert_eq!(
            board.community_cards[4],
            Card {
                suit: Suit::Heart,
                value: CardValue::Seven
            },
            "river card should be the card after burn"
        );
    }

    // ================================================================
    // Bug 5: set_community_card フェーズ整合性チェック
    // ================================================================

    /// PreFlop 中に locate_number=0,1,2 のコミュニティカードは許可される（RFID フロップ配布）。
    #[test]
    fn set_community_card_preflop_allows_flop_indices() {
        let (mut board, mut deck) = make_board();
        assert_eq!(board.phase, Phase::PreFlop);

        let card0 = deck[deck.len() - 1];
        assert!(
            set_community_card(&mut board, 0, card0, &mut deck).is_ok(),
            "locate_number=0 in PreFlop should be allowed"
        );
        let card1 = deck[deck.len() - 1];
        assert!(
            set_community_card(&mut board, 1, card1, &mut deck).is_ok(),
            "locate_number=1 in PreFlop should be allowed"
        );
        let card2 = deck[deck.len() - 1];
        assert!(
            set_community_card(&mut board, 2, card2, &mut deck).is_ok(),
            "locate_number=2 in PreFlop should be allowed"
        );
        assert_eq!(board.community_cards.len(), 3);
    }

    /// Flop フェーズ中に locate_number=3（ターン）は許可される。
    #[test]
    fn set_community_card_flop_allows_turn_index() {
        let (mut board, mut deck) = make_board();
        // Flop フェーズに強制移行し community_cards を 3 枚にセット
        board.phase = Phase::Flop;
        for _ in 0..3 {
            let c = deck.pop().unwrap();
            board.community_cards.push(c);
        }
        let turn_card = deck[deck.len() - 1];
        let result = set_community_card(&mut board, 3, turn_card, &mut deck);
        assert!(result.is_ok(), "locate_number=3 in Flop should be allowed");
        assert_eq!(board.community_cards.len(), 4);
    }

    /// Turn フェーズ中に locate_number=4（リバー）は許可される。
    #[test]
    fn set_community_card_turn_allows_river_index() {
        let (mut board, mut deck) = make_board();
        // Turn フェーズに強制移行し community_cards を 4 枚にセット
        board.phase = Phase::Turn;
        for _ in 0..4 {
            let c = deck.pop().unwrap();
            board.community_cards.push(c);
        }
        let river_card = deck[deck.len() - 1];
        let result = set_community_card(&mut board, 4, river_card, &mut deck);
        assert!(result.is_ok(), "locate_number=4 in Turn should be allowed");
        assert_eq!(board.community_cards.len(), 5);
    }

    /// PreFlop 中に locate_number=3 はフェーズ不整合でエラーになる。
    #[test]
    fn set_community_card_preflop_rejects_turn_index() {
        let (mut board, mut deck) = make_board();
        // community_cards を 3 枚セット（locate_number=3 の前提を満たす）
        for _ in 0..3 {
            let c = deck.pop().unwrap();
            board.community_cards.push(c);
        }
        // 依然として PreFlop のままで locate_number=3 を試みる
        assert_eq!(board.phase, Phase::PreFlop);
        let card = deck[deck.len() - 1];
        let result = set_community_card(&mut board, 3, card, &mut deck);
        assert!(
            result.is_err(),
            "locate_number=3 in PreFlop should be rejected as phase mismatch"
        );
        let msg = result.unwrap_err().to_string();
        assert!(
            msg.contains("invalid phase"),
            "error message should mention invalid phase, got: {}",
            msg
        );
    }

    /// Flop フェーズ中に locate_number=0 はフェーズ不整合でエラーになる。
    #[test]
    fn set_community_card_flop_rejects_flop_index() {
        let (mut board, mut deck) = make_board();
        board.phase = Phase::Flop;
        // community_cards は空のまま（locate_number=0 の前提を満たす）
        let card = deck[deck.len() - 1];
        let result = set_community_card(&mut board, 0, card, &mut deck);
        assert!(
            result.is_err(),
            "locate_number=0 in Flop phase should be rejected"
        );
    }

    // ================================================================
    // Bug 6: board_fold で all-in プレイヤーのフォールドを禁止
    // ================================================================

    /// all-in プレイヤーに対して board_fold を呼ぶとエラーになる。
    #[test]
    fn board_fold_rejects_allin_player() {
        let (mut board, mut deck) = make_board();
        // UTG=0 を all-in にする
        board_allin(&mut board, &mut deck).unwrap();
        // all-in 後は current_turn が SB=1 に移る。ここで current_turn を UTG=0 に戻す
        board.current_turn = 0; // all-in プレイヤー
        let result = board_fold(&mut board, &mut deck);
        assert!(
            result.is_err(),
            "folding an all-in player should return Err"
        );
        let msg = result.unwrap_err().to_string();
        assert!(
            msg.contains("all-in player cannot fold"),
            "error message should mention all-in, got: {}",
            msg
        );
    }

    /// 通常プレイヤー（not all-in）に対して board_fold は成功する。
    #[test]
    fn board_fold_allows_non_allin_player() {
        let (mut board, mut deck) = make_board();
        // UTG=0 は all-in でないので fold できる
        assert!(!board.players[0].is_all_in);
        let result = board_fold(&mut board, &mut deck);
        assert!(result.is_ok(), "non-allin player should be able to fold");
        assert!(board.players[0].has_folded);
    }

    // ================================================================
    // Bug 1 fix: start_game でスタック 0 の全プレイヤーを is_all_in=true に設定
    // ================================================================

    /// 4 人ゲームで dealer=3, SB=0, BB=1, Player[2] が stack=0 → is_all_in=true になること。
    #[test]
    fn start_game_non_sb_bb_with_zero_stack_is_allin() {
        let settings = GameSettings {
            small_blind: 100,
            big_blind: 200,
            min_chip: 100,
            bb_ante: false,
        };
        let names = vec!["A".into(), "B".into(), "C".into(), "D".into()];
        // dealer=3, SB=0(stack=1000), BB=1(stack=1000), P2(stack=0), P3=dealer(stack=1000)
        let stacks = vec![1000u32, 1000, 0, 1000];
        let board = start_game_with_stacks(settings, names, stacks, 1, 3, 0, 1).unwrap();

        // P2 (position=2) は SB/BB ではないが stack=0 なので is_all_in=true
        assert!(
            board.players[2].is_all_in,
            "player with stack=0 (non-SB/BB) must be is_all_in=true"
        );
        // SB/BB は正常
        assert_eq!(board.players[0].bet_in_round, 100); // SB
        assert_eq!(board.players[1].bet_in_round, 200); // BB
                                                        // P3 (dealer) は stack>0 なので is_all_in=false
        assert!(!board.players[3].is_all_in);
    }

    // ================================================================
    // Bug 3 fix: next_game で SB/BB が stack 0 でも進行可能にする
    // ================================================================

    /// 4 人ゲームで dealer=0, 次のゲームで SB=1(stack=0), BB=2(stack=0) のとき
    /// next_game がスキップして進行できること。
    #[test]
    fn next_game_skips_zero_stack_sb_bb() {
        let settings = GameSettings {
            small_blind: 100,
            big_blind: 200,
            min_chip: 100,
            bb_ante: false,
        };
        // dealer=0, SB=1(stack=0), BB=2(stack=0), P3(stack=1000) で showdown 後の状態を作る
        let board = TexasHoldemBoard {
            hand_number: 1,
            dealer_position: 0,
            sb_position: 1,
            bb_position: 2,
            current_turn: u8::MAX,
            current_bet: 0,
            last_raise_size: 0,
            players: vec![
                Player {
                    position: 0,
                    name: "A".into(),
                    stack: 1000,
                    hand: None,
                    bet_in_round: 0,
                    has_folded: false,
                    is_all_in: false,
                    has_acted: true,
                    total_invested: 0,
                },
                Player {
                    position: 1,
                    name: "B".into(),
                    stack: 0,
                    hand: None,
                    bet_in_round: 0,
                    has_folded: false,
                    is_all_in: true,
                    has_acted: true,
                    total_invested: 0,
                },
                Player {
                    position: 2,
                    name: "C".into(),
                    stack: 0,
                    hand: None,
                    bet_in_round: 0,
                    has_folded: false,
                    is_all_in: true,
                    has_acted: true,
                    total_invested: 0,
                },
                Player {
                    position: 3,
                    name: "D".into(),
                    stack: 1000,
                    hand: None,
                    bet_in_round: 0,
                    has_folded: false,
                    is_all_in: false,
                    has_acted: true,
                    total_invested: 0,
                },
            ],
            community_cards: vec![],
            pots: vec![Pot { amount: 0 }],
            phase: Phase::Showdown,
            winners: vec![0],
        };

        // next_game は dealer=0+1=1 となり、SB=1(stack=0)、BB=2(stack=0) をスキップして
        // SB=3(stack=1000)、BB=0(stack=1000) で進行するはず
        let result = next_game(&board, &settings);
        assert!(
            result.is_ok(),
            "next_game should succeed even if positions 1 and 2 have stack=0"
        );
        let (new_board, _) = result.unwrap();
        assert_eq!(new_board.dealer_position, 1);
        assert_eq!(new_board.hand_number, 2);
        // SB と BB は stack が 0 でないプレイヤーを指すはず
        let sb_player = new_board
            .players
            .iter()
            .find(|p| p.position == new_board.sb_position)
            .unwrap();
        let bb_player = new_board
            .players
            .iter()
            .find(|p| p.position == new_board.bb_position)
            .unwrap();
        // SB=3, BB=0 の場合 total_invested > 0 (ブラインドを投入済み)
        assert!(
            sb_player.total_invested > 0,
            "SB must have posted blind (non-zero stack)"
        );
        assert!(
            bb_player.total_invested > 0,
            "BB must have posted blind (non-zero stack)"
        );
    }

    // ================================================================
    // Bug 4: ヘッズアップ next_game でスタック 0 のチェック
    // ================================================================

    /// ヘッズアップで dealer のスタックが 0 のとき next_game がエラーを返す。
    #[test]
    fn heads_up_next_game_dealer_stack_zero_returns_error() {
        let settings = GameSettings {
            small_blind: 50,
            big_blind: 100,
            min_chip: 50,
            bb_ante: false,
        };
        let names = vec!["Alice".into(), "Bob".into()];
        // dealer=0 で開始し、手動で player 1 (次のディーラー) のスタックを 0 にする。
        let mut board = start_game(settings.clone(), names, 0).unwrap();
        // next_game では new_dealer = (0+1)%2 = 1 になる。
        // position 1 のスタックを 0 にセットする。
        board.players[1].stack = 0;
        board.phase = Phase::Showdown;

        let result = next_game(&board, &settings);
        assert!(
            result.is_err(),
            "next_game should fail when heads-up dealer has stack 0"
        );
        let msg = result.unwrap_err().to_string();
        assert!(
            msg.contains("stack 0"),
            "error message should mention stack 0, got: {}",
            msg
        );
    }

    /// ヘッズアップで opponent のスタックが 0 のとき next_game がエラーを返す。
    #[test]
    fn heads_up_next_game_opponent_stack_zero_returns_error() {
        let settings = GameSettings {
            small_blind: 50,
            big_blind: 100,
            min_chip: 50,
            bb_ante: false,
        };
        let names = vec!["Alice".into(), "Bob".into()];
        // dealer=0 で開始し、position 0 (新ディーラーの opponent) のスタックを 0 にする。
        // next_game: new_dealer=(0+1)%2=1, opponent=(1+1)%2=0
        let mut board = start_game(settings.clone(), names, 0).unwrap();
        board.players[0].stack = 0;
        board.phase = Phase::Showdown;

        let result = next_game(&board, &settings);
        assert!(
            result.is_err(),
            "next_game should fail when heads-up opponent has stack 0"
        );
        let msg = result.unwrap_err().to_string();
        assert!(
            msg.contains("stack 0"),
            "error message should mention stack 0, got: {}",
            msg
        );
    }

    /// ヘッズアップで両者ともスタックがある場合は next_game が成功する（既存動作の保護）。
    #[test]
    fn heads_up_next_game_both_have_stack_succeeds() {
        let settings = GameSettings {
            small_blind: 50,
            big_blind: 100,
            min_chip: 50,
            bb_ante: false,
        };
        let names = vec!["Alice".into(), "Bob".into()];
        let board = start_game(settings.clone(), names, 0).unwrap();
        // 初期スタックは両者とも 5000 (50*100)。
        let result = next_game(&board, &settings);
        assert!(
            result.is_ok(),
            "next_game should succeed when both players have chips"
        );
        let (new_board, _) = result.unwrap();
        assert_eq!(new_board.dealer_position, 1);
        assert_eq!(new_board.hand_number, 2);
    }

    // ================================================================
    // Bug 2 fix: start_game が空文字・重複名をリジェクトすること
    // ================================================================

    #[test]
    fn start_game_rejects_empty_player_name() {
        let settings = GameSettings {
            small_blind: 50,
            big_blind: 100,
            min_chip: 50,
            bb_ante: false,
        };
        let names = vec!["Alice".into(), "".into()];
        let result = start_game(settings, names, 0);
        assert!(result.is_err());
        assert_eq!(
            result.unwrap_err().to_string(),
            "invalid action: player name must not be empty"
        );
    }

    #[test]
    fn start_game_rejects_whitespace_only_player_name() {
        let settings = GameSettings {
            small_blind: 50,
            big_blind: 100,
            min_chip: 50,
            bb_ante: false,
        };
        let names = vec!["Alice".into(), "   ".into()];
        let result = start_game(settings, names, 0);
        assert!(result.is_err());
        assert_eq!(
            result.unwrap_err().to_string(),
            "invalid action: player name must not be empty"
        );
    }

    #[test]
    fn start_game_rejects_duplicate_player_names() {
        let settings = GameSettings {
            small_blind: 50,
            big_blind: 100,
            min_chip: 50,
            bb_ante: false,
        };
        let names = vec!["Alice".into(), "Alice".into()];
        let result = start_game(settings, names, 0);
        assert!(result.is_err());
        assert_eq!(
            result.unwrap_err().to_string(),
            "invalid action: duplicate player names are not allowed"
        );
    }

    #[test]
    fn start_game_accepts_valid_player_names() {
        let settings = GameSettings {
            small_blind: 50,
            big_blind: 100,
            min_chip: 50,
            bb_ante: false,
        };
        let names = vec!["Alice".into(), "Bob".into()];
        let result = start_game(settings, names, 0);
        assert!(result.is_ok());
    }

    // ================================================================
    // Bug 3+4 fix: advance_phase での community card 二重追加防止
    // ================================================================

    /// Manual モード (RFID) でフロップ 3 枚を set_community_card で手動追加した後、
    /// preflop ベットラウンドが完了しても advance_phase が community に追加しないこと。
    #[test]
    fn manual_set_community_then_advance_phase_does_not_double_add_flop() {
        let settings = GameSettings {
            small_blind: 10,
            big_blind: 20,
            min_chip: 10,
            bb_ante: false,
        };
        let names = vec!["Alice".into(), "Bob".into(), "Carol".into()];
        let mut board = start_game(settings, names, 0).unwrap();
        let mut deck = build_remaining_deck(&board);

        // Phase::PreFlop の状態でフロップ 3 枚を手動追加 (locate_number 0,1,2)
        let card0 = deck[deck.len() - 1];
        set_community_card(&mut board, 0, card0, &mut deck).unwrap();
        let card1 = deck[deck.len() - 1];
        set_community_card(&mut board, 1, card1, &mut deck).unwrap();
        let card2 = deck[deck.len() - 1];
        set_community_card(&mut board, 2, card2, &mut deck).unwrap();

        assert_eq!(board.community_cards.len(), 3);
        // フェーズはまだ PreFlop のまま
        assert_eq!(board.phase, Phase::PreFlop);

        // preflop アクションを全員完了させて advance_phase を発火する
        // UTG=0, SB=1, BB=2: UTG call → SB call → BB check でラウンド完了
        board_call(&mut board, &mut deck).unwrap();
        board_call(&mut board, &mut deck).unwrap();
        board_check(&mut board, &mut deck).unwrap();

        // advance_phase 後フェーズは Flop になっているはず
        assert_eq!(board.phase, Phase::Flop);
        // 既に 3 枚あるため追加されず、3 枚のまま
        assert_eq!(
            board.community_cards.len(),
            3,
            "advance_phase should not add more cards when flop is already set manually"
        );
        // 手動で追加した 3 枚が維持されている
        assert_eq!(board.community_cards[0], card0);
        assert_eq!(board.community_cards[1], card1);
        assert_eq!(board.community_cards[2], card2);
    }

    /// Manual モードでターン (locate_number=3) を手動追加した後、
    /// flop ベットラウンド完了時に advance_phase が重複追加しないこと。
    #[test]
    fn manual_set_community_then_advance_phase_does_not_double_add_turn() {
        let settings = GameSettings {
            small_blind: 10,
            big_blind: 20,
            min_chip: 10,
            bb_ante: false,
        };
        let names = vec!["Alice".into(), "Bob".into(), "Carol".into()];
        let (mut board, mut deck) = start_game_with_deck(settings, names, 0, 1).unwrap();

        // flop フェーズに直接進めるため community_cards に 3 枚手動追加してフェーズを Flop にする
        // まず preflop を全員 check/call で完了させる
        board_call(&mut board, &mut deck).unwrap(); // UTG
        board_call(&mut board, &mut deck).unwrap(); // SB
        board_check(&mut board, &mut deck).unwrap(); // BB
        assert_eq!(board.phase, Phase::Flop);
        let flop_len = board.community_cards.len();
        assert_eq!(flop_len, 3);

        // フロップ後のデッキからターンカードを手動追加
        let turn_card = deck[deck.len() - 1];
        set_community_card(&mut board, 3, turn_card, &mut deck).unwrap();
        assert_eq!(board.community_cards.len(), 4);
        assert_eq!(board.phase, Phase::Flop); // まだ Flop のまま

        // flop ベットラウンドを全員 check で完了させる
        board_check(&mut board, &mut deck).unwrap();
        board_check(&mut board, &mut deck).unwrap();
        board_check(&mut board, &mut deck).unwrap();

        // advance_phase 後フェーズは Turn
        assert_eq!(board.phase, Phase::Turn);
        // 既にターンが手動追加済みのため 4 枚のまま
        assert_eq!(
            board.community_cards.len(),
            4,
            "advance_phase should not add turn card when already set manually"
        );
        assert_eq!(board.community_cards[3], turn_card);
    }

    /// Auto モード（deck から自動配布）では advance_phase が従来通り community cards を追加すること。
    #[test]
    fn auto_mode_advance_phase_adds_community_cards_normally() {
        let (mut board, mut deck) = make_board();

        // preflop アクション完了: UTG call → SB call → BB check
        board_call(&mut board, &mut deck).unwrap();
        board_call(&mut board, &mut deck).unwrap();
        board_check(&mut board, &mut deck).unwrap();

        // Flop に進んで community_cards が 3 枚になること
        assert_eq!(board.phase, Phase::Flop);
        assert_eq!(board.community_cards.len(), 3);

        // flop check を全員で完了
        board_check(&mut board, &mut deck).unwrap();
        board_check(&mut board, &mut deck).unwrap();
        board_check(&mut board, &mut deck).unwrap();

        // Turn に進んで community_cards が 4 枚になること
        assert_eq!(board.phase, Phase::Turn);
        assert_eq!(board.community_cards.len(), 4);

        // turn check を全員で完了
        board_check(&mut board, &mut deck).unwrap();
        board_check(&mut board, &mut deck).unwrap();
        board_check(&mut board, &mut deck).unwrap();

        // River に進んで community_cards が 5 枚になること
        assert_eq!(board.phase, Phase::River);
        assert_eq!(board.community_cards.len(), 5);
    }

    // ================================================================
    // Bug 7 fix: start_game_with_deck でシャッフル済みデッキが保持されること
    // ================================================================

    /// start_game_with_deck が返すデッキはプレイヤーのハンドで使われたカードを含まないこと。
    #[test]
    fn start_game_with_deck_returns_remaining_deck_without_hand_cards() {
        let settings = GameSettings {
            small_blind: 10,
            big_blind: 20,
            min_chip: 10,
            bb_ante: false,
        };
        let names = vec!["Alice".into(), "Bob".into(), "Carol".into()];
        let (board, deck) = start_game_with_deck(settings, names, 0, 1).unwrap();

        // 3 人 × 2 枚 = 6 枚使用済み → 残 52 - 6 = 46 枚
        assert_eq!(deck.len(), 52 - board.players.len() * 2);

        // 返ってきたデッキにプレイヤーの手札が含まれていないこと
        let hand_cards: Vec<(Suit, CardValue)> = board
            .players
            .iter()
            .flat_map(|p| {
                p.hand
                    .iter()
                    .flat_map(|h| h.iter().map(|c| (c.suit, c.value)))
            })
            .collect();
        for (suit, value) in &hand_cards {
            assert!(
                !deck.iter().any(|c| c.suit == *suit && c.value == *value),
                "deck should not contain hand card {:?} {:?}",
                suit,
                value
            );
        }
    }

    #[test]
    fn add_player_rejects_duplicate_name() {
        let (mut board, _deck) = make_board();
        board.phase = Phase::Showdown;
        // board には "Alice", "Bob", "Carol" が既に存在する
        let existing_name = board.players[0].name.clone();
        let r = add_player(&mut board, existing_name, 500);
        assert!(r.is_err());
        let err_msg = format!("{:?}", r.unwrap_err());
        assert!(
            err_msg.contains("duplicate player names are not allowed"),
            "unexpected error: {}",
            err_msg
        );
    }

    #[test]
    fn add_player_accepts_unique_name() {
        let (mut board, _deck) = make_board();
        board.phase = Phase::Showdown;
        let initial_len = board.players.len();
        add_player(&mut board, "UniquePlayer".into(), 500).unwrap();
        assert_eq!(board.players.len(), initial_len + 1);
        assert_eq!(board.players[initial_len].name, "UniquePlayer");
    }

    /// next_game が返すデッキも再シャッフルせずプレイヤーのハンドを除いた残デッキであること。
    #[test]
    fn next_game_returns_deck_without_hand_cards() {
        let settings = GameSettings {
            small_blind: 10,
            big_blind: 20,
            min_chip: 10,
            bb_ante: false,
        };
        let names = vec!["Alice".into(), "Bob".into()];
        let board1 = start_game(settings.clone(), names, 0).unwrap();
        let (board2, deck2) = next_game(&board1, &settings).unwrap();

        // 2 人 × 2 枚 = 4 枚使用済み → 残 52 - 4 = 48 枚
        assert_eq!(deck2.len(), 52 - board2.players.len() * 2);

        // 返ってきたデッキにプレイヤー2の手札が含まれていないこと
        for p in &board2.players {
            if let Some(hand) = p.hand {
                for card in &hand {
                    assert!(
                        !deck2
                            .iter()
                            .any(|c| c.suit == card.suit && c.value == card.value),
                        "deck should not contain hand card {:?}",
                        card
                    );
                }
            }
        }
    }

    #[test]
    fn next_game_single_remaining_stack_returns_error() {
        let settings = GameSettings {
            small_blind: 10,
            big_blind: 20,
            min_chip: 10,
            bb_ante: false,
        };
        let names = vec!["A".into(), "B".into(), "C".into()];
        let board1 = start_game(settings.clone(), names, 0).unwrap();
        // B と C のスタックを 0 にして A だけ残す（n=3, 残 1 名）
        let mut board1 = board1;
        board1.players[1].stack = 0;
        board1.players[2].stack = 0;
        let result = next_game(&board1, &settings);
        assert!(
            result.is_err(),
            "残スタック1名のとき next_game はエラーを返すべき"
        );
        let msg = result.unwrap_err().to_string();
        assert!(
            msg.contains("ゲーム続行不可"),
            "エラーメッセージが想定外: {}",
            msg
        );
    }

    #[test]
    fn board_call_no_bet_returns_error() {
        let (mut board, mut deck) = make_board();
        board.current_bet = 0;
        let result = board_call(&mut board, &mut deck);
        assert!(
            result.is_err(),
            "current_bet=0 のとき board_call はエラーを返すべき"
        );
        let msg = result.unwrap_err().to_string();
        assert!(
            msg.contains("コール対象のベットがありません"),
            "エラーメッセージが想定外: {}",
            msg
        );
    }

    #[test]
    fn board_expose_invalid_burn_returns_error() {
        let (mut board, _deck) = make_board();
        let used_card = board.players[0].hand.unwrap()[0];
        use super::super::card::{Card, CardValue, Suit};
        let all_used: Vec<(Suit, CardValue)> = board
            .players
            .iter()
            .flat_map(|p| {
                p.hand
                    .iter()
                    .flat_map(|h| h.iter().map(|c| (c.suit, c.value)))
            })
            .collect();
        let candidate = Card {
            suit: Suit::Spade,
            value: CardValue::Jack,
        };
        let expose_card = if !all_used.contains(&(candidate.suit, candidate.value)) {
            candidate
        } else {
            Card {
                suit: Suit::Spade,
                value: CardValue::Queen,
            }
        };
        let burn_card = used_card;
        let result = board_expose(&mut board, expose_card, burn_card);
        assert!(
            result.is_err(),
            "使用済みカードを burn_card に渡したときエラーを返すべき"
        );
        let msg = result.unwrap_err().to_string();
        assert!(
            msg.contains("バーンカードが既に使用されています"),
            "エラーメッセージが想定外: {}",
            msg
        );
    }
}

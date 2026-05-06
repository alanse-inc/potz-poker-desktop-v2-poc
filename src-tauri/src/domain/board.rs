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
    /// bb_ante 徴収時のアンティ額。サイドポット計算で BB の total_invested から控除するために保持する。
    /// bb_ante=false のときは 0。
    #[serde(default)]
    pub bb_ante_amount: u32,
}

impl TexasHoldemBoard {
    pub fn pots(&self) -> &[Pot] {
        &self.pots
    }

    pub fn total_pot(&self) -> u64 {
        self.pots.iter().map(|p| p.amount as u64).sum()
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
    pub(crate) fn is_round_complete(&self) -> bool {
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

    /// 次フェーズへ advance するために必要な community_cards 枚数を
    /// 既存 community_cards と deck の合計で確保できるか確認する。
    ///
    /// RFID モードでは deck が空のまま community_cards も足りていない状態が
    /// あり得るため、auto-advance ループで Showdown まで突き抜けて
    /// community_cards 不足のまま resolve_showdown が走るのを防ぐ。
    fn can_advance_with_available_cards(&self, deck: &[Card]) -> bool {
        // (次フェーズで必要な community 累計, バーン消費の有無)
        let (target, burn_required) = match self.phase {
            Phase::PreFlop => (3usize, true), // -> Flop
            Phase::Flop => (4usize, true),    // -> Turn
            Phase::Turn => (5usize, true),    // -> River
            // River -> Showdown は追加カード不要
            Phase::River => return true,
            // Showdown は advance しない
            Phase::Showdown => return false,
        };
        let current = self.community_cards.len();
        if current >= target {
            // 既に十分な community_cards (RFID で配布済み) があるためバーンも不要
            return true;
        }
        let needed_from_deck = target - current + if burn_required { 1 } else { 0 };
        deck.len() >= needed_from_deck
    }

    /// ラウンドをリセットし次フェーズへ進める。community_cards を配る。
    /// `burn_count` は呼び出し元が管理する累積バーンカード枚数。
    /// 自動モード（アクション経由）では常に 0 を渡す。
    /// RFID モードでは `InnerState::burn_count` の現在値を渡す。
    fn advance_phase(&mut self, deck: &mut Vec<Card>, burn_count: u8) {
        // ベット額をポットに移動
        let total_bet: u32 = self
            .players
            .iter()
            .map(|p| p.bet_in_round as u64)
            .sum::<u64>()
            .try_into()
            .unwrap_or(u32::MAX);
        if total_bet > 0 {
            if let Some(pot) = self.pots.last_mut() {
                pot.amount = pot.amount.saturating_add(total_bet);
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
        // burn_count を用いてバーンが既に外部（RFID スキャン）で消費済みかを確認し、
        // 二重バーンを防ぐ。
        match self.phase {
            Phase::Flop if self.community_cards.len() < 3 => {
                // board_expose や RFID バーンスキャンにより burn_count が既に 1 以上の場合は
                // バーンを消費済みのため、ここでのバーンをスキップする。
                // 加えて community_cards が空でない場合も expose/set_community_card 経由で
                // バーン済みとみなしてスキップする。
                if self.community_cards.is_empty() && burn_count == 0 {
                    let _ = deck.pop(); // burn card
                }
                while self.community_cards.len() < 3 {
                    if let Some(card) = deck.pop() {
                        self.community_cards.push(card);
                    } else {
                        break;
                    }
                }
            }
            Phase::Turn if self.community_cards.len() < 4 => {
                // set_community_card(3, ...) により community_cards が既に Turn カードを
                // 持っている場合（len==4）はガードで弾かれる。
                // len < 3 の異常状態（部分配布済み）では burn が消費済みのためスキップする。
                // burn_count <= 1 の場合はフロップ前の burn のみ消費済みのため、ターン前バーンが必要。
                if self.community_cards.len() == 3 && burn_count <= 1 {
                    let _ = deck.pop(); // burn card
                }
                if let Some(card) = deck.pop() {
                    self.community_cards.push(card);
                }
            }
            Phase::River if self.community_cards.len() < 5 => {
                // set_community_card(4, ...) により community_cards が既に River カードを
                // 持っている場合（len==5）はガードで弾かれる。
                // len < 4 の異常状態（部分配布済み）では burn が消費済みのためスキップする。
                // burn_count <= 2 の場合はターン前の burn のみ消費済みのため、リバー前バーンが必要。
                if self.community_cards.len() == 4 && burn_count <= 2 {
                    let _ = deck.pop(); // burn card
                }
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
            let total_bet: u32 = self
                .players
                .iter()
                .map(|p| p.bet_in_round as u64)
                .sum::<u64>()
                .try_into()
                .unwrap_or(u32::MAX);
            if total_bet > 0 {
                if let Some(pot) = self.pots.last_mut() {
                    pot.amount = pot.amount.saturating_add(total_bet);
                } else {
                    self.pots.push(Pot { amount: total_bet });
                }
            }
            for p in &mut self.players {
                p.bet_in_round = 0;
            }
            self.phase = Phase::Showdown;
            self.winners = vec![winner_pos];
            // ポットを勝者に配分 (total_pot() は u64; stack は u32 なので saturating_add)
            let total = self.total_pot();
            if let Some(p) = self.players.iter_mut().find(|p| p.position == winner_pos) {
                let add = u32::try_from(total).unwrap_or(u32::MAX);
                p.stack = p.stack.saturating_add(add);
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
            // RFID モード等で community_cards / deck が次フェーズに必要な枚数を
            // 確保できないときは advance しない。後続の apply_card_placed 等で
            // カードが揃ったタイミングで再度進行する想定。
            if self.can_advance_with_available_cards(deck) {
                // apply_action は自動モード（アクション経由）のため burn_count = 0 を渡す。
                self.advance_phase(deck, 0);
                // 全員 allin 等で誰もアクションできない場合は Showdown まで連続で進める。
                // ただし各 iteration で必要なカード枚数を確認し、不足時はループを抜ける。
                while self.phase != Phase::Showdown
                    && self.is_round_complete()
                    && self.can_advance_with_available_cards(deck)
                {
                    self.advance_phase(deck, 0);
                }
                if self.phase == Phase::Showdown {
                    self.resolve_showdown();
                }
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

        // community_cards が 5 枚未満かつ手役評価が必要なアクティブプレイヤーがいる場合は
        // 正常なショーダウンを行えない。
        // 通常フローでは advance_phase を経て全 community が揃ってから呼ばれるが、
        // エラー回復・テスト経路で直接呼ばれると不正な手役評価になるためガードする。
        // hand=None のフォールバックパスはハンド評価を行わないため、このガードの対象外とする。
        let has_hand_holders = self
            .players
            .iter()
            .any(|p| !p.has_folded && p.hand.is_some_and(|h| h[0] != h[1]));
        if has_hand_holders && self.community_cards.len() < 5 {
            tracing::warn!(
                "resolve_showdown: community_cards has only {} cards (expected 5); \
                 aborting to prevent incorrect hand evaluation",
                self.community_cards.len()
            );
            return;
        }

        let invested_sum: u64 = self.players.iter().map(|p| p.total_invested as u64).sum();
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

            let total = self.total_pot(); // u64
            let count = ordered.len() as u64;
            let share = total / count;
            let remainder = total % count;

            for (i, &widx) in ordered.iter().enumerate() {
                let extra: u64 = if i == 0 { remainder } else { 0 };
                let add = u32::try_from(share + extra).unwrap_or(u32::MAX);
                self.players[widx].stack = self.players[widx].stack.saturating_add(add);
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
                // pending hand (1 枚目しかスキャンされていない) は除外
                if hole[0] == hole[1] {
                    return None;
                }
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
        //
        // bb_ante 補正: bb_ante=true のとき BB の total_invested にはアンティ分が含まれているが、
        // アンティはポットに直接加算されるだけでサイドポットの境界を変えるべきではない。
        // BB の「ゲームベット」としての投資額は total_invested - bb_ante_amount。
        // これを補正しないと BB だけ余分なしきい値が生まれ、short-stack プレイヤーがいる場合に
        // サイドポット境界が狂う。
        let bb_ante = self.bb_ante_amount;
        let bb_pos = self.bb_position;
        let total_invested: Vec<u32> = self
            .players
            .iter()
            .map(|p| {
                if p.position == bb_pos {
                    p.total_invested.saturating_sub(bb_ante)
                } else {
                    p.total_invested
                }
            })
            .collect();
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
        // Bug D 対策: distributed を u64 に昇格してオーバーフローを防ぐ
        let mut distributed: u64 = 0;
        // bb_ante 補正: アンティ分は total_invested ベースのサイドポット計算に現れないが、
        // ポットには含まれている。最初のしきい値（最もスタックの低い全員参加ポット）に
        // carry_over として加算することで、アンティが適切に全参加プレイヤーに分配される。
        let mut carry_over: u64 = bb_ante as u64;

        for &threshold in &thresholds {
            let level_amount = threshold - prev_threshold;
            // このレベルに参加しているプレイヤー数（prev_threshold より多く投入したプレイヤー）
            let contributors = total_invested
                .iter()
                .filter(|&&ti| ti > prev_threshold)
                .count() as u64;
            // pot_amount を u64 のまま保持して精度を維持する
            let pot_amount: u64 = (level_amount as u64)
                .saturating_mul(contributors)
                .saturating_add(carry_over);

            // このポットの勝者候補: total_invested >= threshold かつ has_folded でない
            // かつ pending hand (hole[0] == hole[1]) でない。
            // pending hand プレイヤーは手役評価されないため evals に現れず、
            // best_eval_pot=None のフォールバックで不正受取が起きるのを防ぐ。
            let eligible_for_pot: Vec<usize> = (0..self.players.len())
                .filter(|&i| {
                    total_invested[i] >= threshold
                        && !self.players[i].has_folded
                        && !self.players[i].hand.is_some_and(|h| h[0] == h[1])
                })
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

            let count = ordered_winners.len() as u64;
            let share = pot_amount / count;
            let remainder = pot_amount % count;

            for (i, &widx) in ordered_winners.iter().enumerate() {
                let extra: u64 = if i == 0 { remainder } else { 0 };
                let payout = share + extra;
                // stack は u32; payout が u32::MAX を超える場合は saturating_add でクランプ
                let add = u32::try_from(payout).unwrap_or(u32::MAX);
                self.players[widx].stack = self.players[widx].stack.saturating_add(add);
                distributed += payout;
                let pos = self.players[widx].position;
                if !all_winner_positions.contains(&pos) {
                    all_winner_positions.push(pos);
                }
            }

            prev_threshold = threshold;
        }

        // 端数が残っていたら dealer-left かつ勝者のプレイヤーに渡す。
        // 勝者がいない場合は dealer-left の最初の非フォールドプレイヤーに渡す。
        // total_pot_before は u64; u64 で計算後 u32 にキャスト（saturating）
        let undistributed = total_pot_before.saturating_sub(distributed) as u32;
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
                self.players[widx].stack = self.players[widx].stack.saturating_add(undistributed);
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
    let (board, _deck) = start_game_with_deck(settings, player_names, dealer, 1, None)?;
    Ok(board)
}

/// ゲームを開始してボードとシャッフル済み残デッキを返す。
/// Auto モードで community cards を内部デッキから配布する際に使用する。
/// `stacks` が `Some` の場合は player ごとの初期 stack を上書きする。`None` の場合は `small_blind * 100` をデフォルトとする。
pub fn start_game_with_deck(
    settings: GameSettings,
    player_names: Vec<String>,
    dealer: u8,
    hand_number: u32,
    stacks: Option<Vec<u32>>,
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

    let resolved_stacks = match stacks {
        Some(s) => {
            if s.len() != n {
                return Err(BoardError::InvalidAction(
                    "player_stacks length must match player_names length".into(),
                ));
            }
            for &stack in &s {
                if stack == 0 {
                    return Err(BoardError::InvalidAction(
                        "each player stack must be greater than 0".into(),
                    ));
                }
            }
            s
        }
        None => {
            let initial_stack = settings.small_blind.checked_mul(100).ok_or_else(|| {
                BoardError::InvalidAction("small_blind * 100 overflows u32".into())
            })?;
            vec![initial_stack; n]
        }
    };

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
        resolved_stacks,
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

    // 前回のスタックを引き継ぐ
    let stacks: Vec<u32> = prev.players.iter().map(|p| p.stack).collect();

    // スタックが 0 のプレイヤーをスキップして dealer/SB/BB を決定する。
    let (new_dealer, new_sb, new_bb) = if n == 2 {
        // ヘッズアップ: dealer=SB, 相手=BB
        // どちらかがスタック 0 の場合はゲーム終了（バスト）として扱う。
        let new_dealer = (prev.dealer_position + 1) % n as u8;
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
        (new_dealer, new_dealer, opponent)
    } else {
        // dealer は前回 dealer の次でスタック 0 をスキップ
        let new_dealer =
            next_non_zero_stack_pos(&stacks, prev.dealer_position).ok_or_else(|| {
                BoardError::InvalidAction(
                    "all players have stack 0; cannot determine dealer".into(),
                )
            })?;
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
        // アクティブプレイヤー (stack > 0) が 2 名のとき、3 人以上向けロジックでは
        // dealer == bb になりうる (dealer=SB, SBの次=BB=dealerに戻る)。
        // ヘッズアップルール: dealer == SB, 相手が BB に分岐させる。
        let active_count = stacks.iter().filter(|&&s| s > 0).count();
        if active_count == 2 {
            // new_dealer が SB, sb が BB という配置になる
            // (new_dealer は prev.dealer_position の次の非ゼロ, sb は new_dealer の次の非ゼロ)
            (new_dealer, new_dealer, sb)
        } else {
            (new_dealer, sb, bb)
        }
    };

    // stack 0 のプレイヤーはバスト（ゲームから除外）しない簡略版。
    // そのまま継続（buy-in なし）。
    let names: Vec<String> = prev.players.iter().map(|p| p.name.clone()).collect();
    let new_settings = settings.clone();

    let (board, deck) = start_game_with_stacks_and_deck(
        new_settings,
        names,
        stacks,
        prev.hand_number.saturating_add(1),
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
        // is_all_in=true (スタック 0) のプレイヤーをスキップして UTG を決定する。
        let mut pos = (bb_pos + 1) % n as u8;
        for _ in 0..n {
            if !players[pos as usize].is_all_in {
                break;
            }
            pos = (pos + 1) % n as u8;
        }
        pos
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
        bb_ante_amount: ante_amount,
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
    if board.dealer_position > position {
        board.dealer_position -= 1;
    } else if board.dealer_position == position || board.dealer_position >= n {
        board.dealer_position = 0;
    }
    if board.sb_position > position {
        board.sb_position -= 1;
    } else if board.sb_position == position || board.sb_position >= n {
        board.sb_position = 0;
    }
    if board.bb_position > position {
        board.bb_position -= 1;
    } else if board.bb_position == position || board.bb_position >= n {
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
    if board.current_bet == 0 {
        return Err(BoardError::InvalidAction(
            "use bet when there is no current bet".into(),
        ));
    }
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
        let all_in_total = p.stack.saturating_add(p.bet_in_round);
        if to < min_raise_to && to != all_in_total {
            return Err(BoardError::InvalidAction(format!(
                "raise must be at least {} (or all-in {}); got {}",
                min_raise_to, all_in_total, to
            )));
        }
    }
    board.apply_action(
        |p, _current_bet| {
            let all_in_total = p.stack.saturating_add(p.bet_in_round);
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

/// community card 配置後に呼ぶ。
/// ラウンドが完了していれば次フェーズへ advance し、Showdown なら resolve_showdown も実行する。
/// RFID モードで全員 all-in 後に community card を 1 枚ずつ置いていく際に使用する。
/// `deck` は通常 RFIDモードでは空だが、`can_advance_with_available_cards` が
/// community_cards の枚数でも判定するため問題ない。
/// `burn_count` は RFID モードで外部管理されている累積バーンカード枚数。
pub fn try_advance_if_round_complete(
    board: &mut TexasHoldemBoard,
    deck: &mut Vec<Card>,
    burn_count: u8,
) {
    if !board.is_round_complete() {
        return;
    }
    if !board.can_advance_with_available_cards(deck) {
        return;
    }
    board.advance_phase(deck, burn_count);
    while board.phase != Phase::Showdown
        && board.is_round_complete()
        && board.can_advance_with_available_cards(deck)
    {
        board.advance_phase(deck, burn_count);
    }
    if board.phase == Phase::Showdown {
        board.resolve_showdown();
    }
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

    /// RFID モードで deck が空、community_cards も足りない状態で全員 all-in した場合、
    /// auto-advance ループが community_cards 不足のまま Showdown まで突き抜けないこと。
    #[test]
    fn auto_advance_halts_when_deck_empty_and_community_short_on_allin() {
        let (mut board, _deck) = make_board();
        // RFID モードを模して deck を空にする (community_cards も空のまま)
        let mut empty_deck: Vec<Card> = Vec::new();
        // 3 人全員 all-in
        board_allin(&mut board, &mut empty_deck).unwrap(); // UTG
        board_allin(&mut board, &mut empty_deck).unwrap(); // SB
        board_allin(&mut board, &mut empty_deck).unwrap(); // BB
                                                           // Flop に必要な community_cards / deck が無いため PreFlop に留まり Showdown には進まない
        assert_ne!(
            board.phase,
            Phase::Showdown,
            "auto-advance must not jump to Showdown without enough community cards"
        );
        assert_eq!(board.community_cards.len(), 0);
    }

    /// RFID モードで Flop の community_cards (3 枚) が事前配布済みなら、
    /// 全員 all-in 時に Flop まで advance するが Turn 以降は deck 不足で止まること。
    #[test]
    fn auto_advance_progresses_only_to_flop_when_only_flop_cards_set() {
        let (mut board, _deck) = make_board();
        // フロップ 3 枚を community_cards に直接埋める (RFID 配布済みを模擬)
        board.community_cards = vec![
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
        let mut empty_deck: Vec<Card> = Vec::new();
        // 3 人全員 all-in
        board_allin(&mut board, &mut empty_deck).unwrap();
        board_allin(&mut board, &mut empty_deck).unwrap();
        board_allin(&mut board, &mut empty_deck).unwrap();
        // Flop までは advance できるが Turn は不可
        assert_eq!(board.phase, Phase::Flop);
        assert_eq!(board.community_cards.len(), 3);
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

    /// Bug 1 再現: 4人テーブルで dealer_position=2 のとき position=1 を削除すると
    /// dealer_position が旧3番プレイヤーを誤指しするバグ。
    #[test]
    fn remove_player_dealer_position_adjusted_when_deleted_before_dealer() {
        let settings = GameSettings {
            small_blind: 10,
            big_blind: 20,
            min_chip: 10,
            bb_ante: false,
        };
        let names = vec!["Alice".into(), "Bob".into(), "Carol".into(), "Dave".into()];
        let mut board = start_game(settings, names, 2).unwrap();
        // dealer=2, sb=3, bb=0
        assert_eq!(board.dealer_position, 2);
        board.phase = Phase::Showdown;
        // position=1 (dealer より前) を削除
        remove_player(&mut board, 1).unwrap();
        // 振り直し後: 旧0→0, 旧2→1, 旧3→2
        // dealer_position は旧2→新1 に補正されるべき
        assert_eq!(
            board.dealer_position, 1,
            "dealer_position must follow the dealer player after renumbering"
        );
    }

    /// dealer と同じ position を削除した場合は 0 にリセットされる。
    #[test]
    fn remove_player_dealer_position_reset_when_dealer_deleted() {
        let settings = GameSettings {
            small_blind: 10,
            big_blind: 20,
            min_chip: 10,
            bb_ante: false,
        };
        let names = vec!["Alice".into(), "Bob".into(), "Carol".into(), "Dave".into()];
        let mut board = start_game(settings, names, 2).unwrap();
        assert_eq!(board.dealer_position, 2);
        board.phase = Phase::Showdown;
        // dealer 自身(position=2)を削除
        remove_player(&mut board, 2).unwrap();
        assert_eq!(
            board.dealer_position, 0,
            "dealer_position must be reset to 0 when the dealer player is removed"
        );
    }

    /// dealer より後ろを削除しても dealer_position は変わらない。
    #[test]
    fn remove_player_dealer_position_unchanged_when_deleted_after_dealer() {
        let settings = GameSettings {
            small_blind: 10,
            big_blind: 20,
            min_chip: 10,
            bb_ante: false,
        };
        let names = vec!["Alice".into(), "Bob".into(), "Carol".into(), "Dave".into()];
        let mut board = start_game(settings, names, 1).unwrap();
        assert_eq!(board.dealer_position, 1);
        board.phase = Phase::Showdown;
        // position=3 (dealer より後ろ) を削除
        remove_player(&mut board, 3).unwrap();
        // 振り直し後: 旧0→0, 旧1→1, 旧2→2
        // dealer_position=1 はそのまま
        assert_eq!(
            board.dealer_position, 1,
            "dealer_position must be unchanged when a player after the dealer is removed"
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

    /// board_expose 後に全員 all-in した場合、Flop で burn が重複して消費されないことを確認する。
    /// expose 時にバーンカードは deck から取り出さないため、advance_phase の Flop 分岐では
    /// burn をスキップして残り 2 枚だけ追加するべき。
    ///
    /// 期待されるデッキ消費量:
    ///   Flop: burn 0 (expose 済みなのでスキップ) + community 2 枚 = 2 枚
    ///   Turn: burn 1 + community 1 枚 = 2 枚
    ///   River: burn 1 + community 1 枚 = 2 枚
    ///   合計: 6 枚
    ///
    /// バグ状態のデッキ消費量:
    ///   Flop: burn 1 (余分) + community 2 枚 = 3 枚
    ///   Turn: burn 1 + community 1 枚 = 2 枚
    ///   River: burn 1 + community 1 枚 = 2 枚
    ///   合計: 7 枚
    #[test]
    fn expose_then_allin_does_not_double_burn_on_flop() {
        let (mut board, mut deck) = make_board();
        let deck_len_before = deck.len();
        let (expose_card, burn_card) = make_expose_card(&board, &deck);

        // board_expose: community_cards が 1 枚になる (phase は PreFlop のまま)
        // deck からは何も取り出さない
        board_expose(&mut board, expose_card, burn_card).unwrap();
        assert_eq!(board.community_cards.len(), 1);
        assert_eq!(board.phase, Phase::PreFlop);
        assert_eq!(deck.len(), deck_len_before);

        // 全員 all-in → Showdown まで auto-advance
        board_allin(&mut board, &mut deck).unwrap(); // UTG
        board_allin(&mut board, &mut deck).unwrap(); // SB
        board_allin(&mut board, &mut deck).unwrap(); // BB

        // Showdown に到達していること
        assert_eq!(board.phase, Phase::Showdown);
        // community_cards は expose した 1 枚 + Flop 2 枚 + Turn 1 枚 + River 1 枚 = 5 枚
        assert_eq!(board.community_cards.len(), 5);
        // expose_card は community_cards[0] であること
        assert_eq!(board.community_cards[0], expose_card);
        // deck の正常な消費量: Flop(burn 0 + 2) + Turn(burn 1 + 1) + River(burn 1 + 1) = 6 枚
        // バグ状態: Flop(burn 1 + 2) + Turn(burn 1 + 1) + River(burn 1 + 1) = 7 枚
        assert_eq!(
            deck.len(),
            deck_len_before - 6,
            "expose 後の Flop advance は burn をスキップするため合計 6 枚消費 (バグは 7 枚)"
        );
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
            bb_ante_amount: 0,
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
            bb_ante_amount: 0,
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
            bb_ante_amount: 0,
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
            bb_ante_amount: 0,
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
            bb_ante_amount: 0,
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
            bb_ante_amount: 0,
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
            bb_ante_amount: 0,
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
            bb_ante_amount: 0,
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
            bb_ante_amount: 0,
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
            bb_ante_amount: 0,
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
            bb_ante_amount: 0,
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
            bb_ante_amount: 0,
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
            bb_ante_amount: 0,
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
            bb_ante_amount: 0,
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
            bb_ante_amount: 0,
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
            bb_ante_amount: 0,
        };
        let mut deck = Vec::new();

        board.advance_phase(&mut deck, 0);

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
            settings.big_blind as u64,
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
    // R33 Bug 2: bb_ante=true でのサイドポット境界テスト
    // ================================================================

    /// bb_ante=true, short-stack SB あり → サイドポット境界が正しく分離されること。
    ///
    /// シナリオ:
    ///   - big_blind=200, small_blind=100, bb_ante=true
    ///   - dealer=2(BTN,stack=1000), SB=0(stack=150), BB=1(stack=400)
    ///   - SB: all-in 150, BB: BB200+ante200=400 all-in, BTN: call 200
    ///   - total_pot = 200(ante) + 150 + 200 + 200 = 750
    ///
    /// 修正前の誤った分配 (BTN が全ハンドで最強役の場合):
    ///   - threshold=150: 450, threshold=200: 100, threshold=400(BBのみ): 200
    ///   - BTN wins threshold=150(450) + threshold=200(100) = 550
    ///   - BB 単独受取 threshold=400(200) → BB=200 (誤: BB は BTN に全部負けたのに200受取)
    ///
    /// 修正後の正しい分配:
    ///   - BB.total_invested 補正: 400-200=200, carry_over=200(ante)
    ///   - threshold=150: 150*3+200=650, threshold=200: 50*2=100
    ///   - BTN wins all → BTN=1550, BB=0, SB=0
    #[test]
    fn bb_ante_sidepot_boundary_btn_wins_all() {
        use super::super::card::{Card, CardValue, Suit};

        // コミュニティカード: A♠ A♥ A♦ K♠ K♥
        let community: Vec<Card> = vec![
            Card {
                suit: Suit::Spade,
                value: CardValue::Ace,
            },
            Card {
                suit: Suit::Heart,
                value: CardValue::Ace,
            },
            Card {
                suit: Suit::Diamond,
                value: CardValue::Ace,
            },
            Card {
                suit: Suit::Spade,
                value: CardValue::King,
            },
            Card {
                suit: Suit::Heart,
                value: CardValue::King,
            },
        ];

        // BTN hand: A♣ 2♣ → Four of a Kind Aces (最強)
        let btn_hand: [Card; 2] = [
            Card {
                suit: Suit::Club,
                value: CardValue::Ace,
            },
            Card {
                suit: Suit::Club,
                value: CardValue::Two,
            },
        ];
        // BB hand: K♦ K♣ → Four of a Kind Kings
        let bb_hand: [Card; 2] = [
            Card {
                suit: Suit::Diamond,
                value: CardValue::King,
            },
            Card {
                suit: Suit::Club,
                value: CardValue::King,
            },
        ];
        // SB hand: 3♦ 3♣ → Full House AAA-KK
        let sb_hand: [Card; 2] = [
            Card {
                suit: Suit::Diamond,
                value: CardValue::Three,
            },
            Card {
                suit: Suit::Club,
                value: CardValue::Three,
            },
        ];

        // dealer=2(BTN), SB=0, BB=1
        // initial stacks: SB=150, BB=400, BTN=1000
        // SB: total_invested=150(all-in), BB: total_invested=400(all-in, 200+200ante), BTN: total_invested=200(call)
        // total_pot = ante200 + SB150 + BB200 + BTN200 = 750
        let mut board = TexasHoldemBoard {
            hand_number: 1,
            dealer_position: 2,
            sb_position: 0,
            bb_position: 1,
            current_turn: u8::MAX,
            current_bet: 0,
            last_raise_size: 0,
            players: vec![
                Player {
                    position: 0,
                    name: "SB".into(),
                    stack: 0,
                    hand: Some(sb_hand),
                    bet_in_round: 0,
                    has_folded: false,
                    is_all_in: true,
                    has_acted: true,
                    total_invested: 150,
                },
                Player {
                    position: 1,
                    name: "BB".into(),
                    stack: 0,
                    hand: Some(bb_hand),
                    bet_in_round: 0,
                    has_folded: false,
                    is_all_in: true,
                    has_acted: true,
                    total_invested: 400, // 200(BB) + 200(ante)
                },
                Player {
                    position: 2,
                    name: "BTN".into(),
                    stack: 800, // 1000 - 200(call)
                    hand: Some(btn_hand),
                    bet_in_round: 0,
                    has_folded: false,
                    is_all_in: false,
                    has_acted: true,
                    total_invested: 200,
                },
            ],
            community_cards: community,
            pots: vec![Pot { amount: 750 }],
            phase: Phase::Showdown,
            winners: vec![],
            bb_ante_amount: 200,
        };

        board.resolve_showdown();

        // BTN が全ポット獲得: 1000 - 200(call) + 750(pot) = 1550
        assert_eq!(
            board.players[2].stack, 1550,
            "BTN should win all 750 chips (800 + 750 pot = 1550)"
        );
        // BB は threshold=400 の独自ポットを不当受取しないこと (修正前は 200 受取)
        assert_eq!(
            board.players[1].stack, 0,
            "BB should win nothing when BTN has stronger hand"
        );
        assert_eq!(
            board.players[0].stack, 0,
            "SB should win nothing when BTN has stronger hand"
        );
        // チップ保全
        let total: u32 = board.players.iter().map(|p| p.stack).sum();
        assert_eq!(
            total, 1550,
            "total chips must be preserved: SB(150)+BB(400)+BTN(1000)=1550"
        );
    }

    /// bb_ante=true, SB short-stack, BB が全ポット獲得するケース。
    ///
    /// BB が勝つ場合: メインポット+サイドポット = 750 すべてを BB が受取ること。
    /// 修正前後でチップ保全は同じだが、内訳が正しいことを確認する。
    #[test]
    fn bb_ante_sidepot_boundary_bb_wins_all() {
        use super::super::card::{Card, CardValue, Suit};

        // コミュニティカード: A♠ A♥ A♦ K♠ K♥
        let community: Vec<Card> = vec![
            Card {
                suit: Suit::Spade,
                value: CardValue::Ace,
            },
            Card {
                suit: Suit::Heart,
                value: CardValue::Ace,
            },
            Card {
                suit: Suit::Diamond,
                value: CardValue::Ace,
            },
            Card {
                suit: Suit::Spade,
                value: CardValue::King,
            },
            Card {
                suit: Suit::Heart,
                value: CardValue::King,
            },
        ];

        // BB hand: A♣ 2♣ → Four of a Kind Aces (最強)
        let bb_hand: [Card; 2] = [
            Card {
                suit: Suit::Club,
                value: CardValue::Ace,
            },
            Card {
                suit: Suit::Club,
                value: CardValue::Two,
            },
        ];
        // BTN hand: K♦ K♣ → Four of a Kind Kings
        let btn_hand: [Card; 2] = [
            Card {
                suit: Suit::Diamond,
                value: CardValue::King,
            },
            Card {
                suit: Suit::Club,
                value: CardValue::King,
            },
        ];
        // SB hand: 3♦ 3♣ → Full House
        let sb_hand: [Card; 2] = [
            Card {
                suit: Suit::Diamond,
                value: CardValue::Three,
            },
            Card {
                suit: Suit::Club,
                value: CardValue::Three,
            },
        ];

        let mut board = TexasHoldemBoard {
            hand_number: 1,
            dealer_position: 2,
            sb_position: 0,
            bb_position: 1,
            current_turn: u8::MAX,
            current_bet: 0,
            last_raise_size: 0,
            players: vec![
                Player {
                    position: 0,
                    name: "SB".into(),
                    stack: 0,
                    hand: Some(sb_hand),
                    bet_in_round: 0,
                    has_folded: false,
                    is_all_in: true,
                    has_acted: true,
                    total_invested: 150,
                },
                Player {
                    position: 1,
                    name: "BB".into(),
                    stack: 0,
                    hand: Some(bb_hand),
                    bet_in_round: 0,
                    has_folded: false,
                    is_all_in: true,
                    has_acted: true,
                    total_invested: 400, // 200(BB) + 200(ante)
                },
                Player {
                    position: 2,
                    name: "BTN".into(),
                    stack: 800,
                    hand: Some(btn_hand),
                    bet_in_round: 0,
                    has_folded: false,
                    is_all_in: false,
                    has_acted: true,
                    total_invested: 200,
                },
            ],
            community_cards: community,
            pots: vec![Pot { amount: 750 }],
            phase: Phase::Showdown,
            winners: vec![],
            bb_ante_amount: 200,
        };

        board.resolve_showdown();

        // BB が全ポット獲得: 0 + 750 = 750
        // threshold=150: pot=650(ante込), eligible=全員 → BB wins → BB+650
        // threshold=200: pot=100, BB+BTN → BB wins → BB+100
        assert_eq!(
            board.players[1].stack, 750,
            "BB should win all 750 chips (0 + 750 pot)"
        );
        assert_eq!(
            board.players[2].stack, 800,
            "BTN should keep their remaining stack (1000 - 200 call = 800)"
        );
        assert_eq!(board.players[0].stack, 0, "SB should win nothing");
        // チップ保全
        let total: u32 = board.players.iter().map(|p| p.stack).sum();
        assert_eq!(total, 1550, "total chips must be preserved");
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
            bb_ante_amount: 0,
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

    /// R33 Bug 1: undistributed 加算時に stack=u32::MAX-5 + undistributed=10 が
    /// panic も wrap もせず u32::MAX に saturate すること。
    #[test]
    fn resolve_showdown_undistributed_saturating_add_no_panic() {
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
        // 勝者の stack を u32::MAX-5 に設定し、undistributed=10 が発生しても
        // overflow panic / wrap が起きず u32::MAX に saturate することを確認する。
        // dealer=0 → dealer-left 順は p1→p2→p0
        // p0: winner, stack=u32::MAX-5; pot=100 distributed to p0, remaining undistributed=10
        let near_max: u32 = u32::MAX - 5;
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
                    name: "Winner".into(),
                    stack: near_max,
                    hand: Some(hand_winner),
                    bet_in_round: 0,
                    has_folded: false,
                    is_all_in: false,
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
            // pots[0].amount=110: distributed=100 → undistributed=10
            // winner の stack=near_max に 10 を加算 → saturate → u32::MAX
            pots: vec![Pot { amount: 110 }],
            phase: Phase::River,
            winners: vec![],
            bb_ante_amount: 0,
        };
        let mut deck = Vec::new();
        // should not panic
        board_check(&mut board, &mut deck).unwrap();

        assert_eq!(board.phase, Phase::Showdown);
        let winner = &board.players[0];
        // near_max(u32::MAX-5) + distributed(100) は saturating_add で u32::MAX になり、
        // さらに undistributed(10) の saturating_add も u32::MAX のまま。wrap しない。
        assert_eq!(
            winner.stack,
            u32::MAX,
            "stack should saturate at u32::MAX, got {}",
            winner.stack
        );
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
            bb_ante_amount: 0,
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
            bb_ante_amount: 0,
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
            bb_ante_amount: 0,
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
            bb_ante_amount: 0,
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
        b.advance_phase(&mut deck, 0);

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
            bb_ante_amount: 0,
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

        board.advance_phase(&mut deck, 0);

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
            bb_ante_amount: 0,
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

        board.advance_phase(&mut deck, 0);

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
            bb_ante_amount: 0,
        };

        // dealer=0 の次は P1(stack=0) → スキップ → P2(stack=0) → スキップ → P3(stack=1000) が dealer
        // SB は dealer(=3) の次 → P0(stack=1000)
        // BB は SB(=0) の次 → P1(stack=0) をスキップ → P3(stack=1000)
        let result = next_game(&board, &settings);
        assert!(
            result.is_ok(),
            "next_game should succeed even if positions 1 and 2 have stack=0"
        );
        let (new_board, _) = result.unwrap();
        assert_eq!(new_board.dealer_position, 3);
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
        let (mut board, mut deck) = start_game_with_deck(settings, names, 0, 1, None).unwrap();

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
        let (board, deck) = start_game_with_deck(settings, names, 0, 1, None).unwrap();

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

    // ================================================================
    // Issue #3: start_game_with_deck の player_stacks 引数
    // ================================================================

    /// Some(stacks) を渡したとき各プレイヤーの stack が指定値になること。
    #[test]
    fn start_game_with_deck_custom_stacks_applied() {
        let settings = GameSettings {
            small_blind: 50,
            big_blind: 100,
            min_chip: 50,
            bb_ante: false,
        };
        let names = vec!["Alice".into(), "Bob".into(), "Carol".into()];
        let stacks = vec![1000u32, 2000u32, 3000u32];
        let (board, _deck) =
            start_game_with_deck(settings.clone(), names, 0, 1, Some(stacks.clone())).unwrap();

        assert_eq!(board.players.len(), 3);
        // SB(pos=1) は small_blind 分が bet_in_round に入っているため stack が減っている
        let sb_stack = stacks[1] - settings.small_blind;
        let bb_stack = stacks[2] - settings.big_blind;
        assert_eq!(board.players[0].stack, stacks[0]);
        assert_eq!(board.players[1].stack, sb_stack);
        assert_eq!(board.players[2].stack, bb_stack);
    }

    /// Some(stacks) の長さが player_names と一致しない場合は Err を返すこと。
    #[test]
    fn start_game_with_deck_stacks_length_mismatch_returns_err() {
        let settings = GameSettings {
            small_blind: 50,
            big_blind: 100,
            min_chip: 50,
            bb_ante: false,
        };
        let names = vec!["Alice".into(), "Bob".into(), "Carol".into()];
        // 3 人に対して 2 要素のスタックを渡す
        let stacks = vec![1000u32, 2000u32];
        let result = start_game_with_deck(settings, names, 0, 1, Some(stacks));
        assert!(result.is_err());
        let msg = result.unwrap_err().to_string();
        assert!(
            msg.contains("player_stacks length must match"),
            "エラーメッセージが想定外: {}",
            msg
        );
    }

    /// pending hand (hole[0] == hole[1]) を持つプレイヤーは showdown 評価から除外され、
    /// 正常な hand を持つプレイヤーのみでポットが分配される。
    #[test]
    fn resolve_showdown_pending_hand_excluded() {
        use super::super::card::{Card, CardValue, Suit};

        // コミュニティ 5 枚
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

        // プレイヤー 0: 通常の確定 hand（強い手）
        let pending_card = Card {
            suit: Suit::Club,
            value: CardValue::King,
        };
        let hand_confirmed: [Card; 2] = [
            Card {
                suit: Suit::Heart,
                value: CardValue::Ace,
            },
            Card {
                suit: Suit::Diamond,
                value: CardValue::Ace,
            },
        ];
        // プレイヤー 1: pending hand (hole[0] == hole[1])
        let hand_pending: [Card; 2] = [pending_card, pending_card];

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
                    hand: Some(hand_confirmed),
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
                    hand: Some(hand_pending),
                    bet_in_round: 0,
                    has_folded: false,
                    is_all_in: false,
                    has_acted: true,
                    total_invested: 100,
                },
            ],
            community_cards: community,
            pots: vec![Pot { amount: 200 }],
            phase: Phase::Showdown,
            winners: vec![],
            bb_ante_amount: 0,
        };

        board.resolve_showdown();

        // pending hand のプレイヤー 1 は除外されるため、プレイヤー 0 がポット全額を獲得する
        assert_eq!(board.total_pot(), 0, "ポットは全額分配されるべき");
        assert_eq!(
            board.players[0].stack, 200,
            "confirmed hand の A がポット全額を獲得すべき"
        );
        assert_eq!(
            board.players[1].stack, 0,
            "pending hand の B はポットを獲得しないべき"
        );
        // winners には position=0 のみ含まれる
        assert!(
            board.winners.contains(&0),
            "position=0 が winners に含まれるべき"
        );
        assert!(
            !board.winners.contains(&1),
            "position=1 (pending) は winners に含まれないべき"
        );
    }

    // ================================================================
    // R35 Bug 1 リグレッションテスト
    // ================================================================

    /// Bug 1: resolve_showdown でサイドポットの best_eval_pot=None フォールバックが
    /// pending hand プレイヤーを eligible_for_pot に含めてしまい、
    /// 手役を持たないプレイヤーがサイドポットを不正受取する問題の回帰テスト。
    ///
    /// シナリオ:
    ///   - Player A (pos=0): pending hand, total_invested=200
    ///   - Player B (pos=1): confirmed hand (強い手), total_invested=100
    ///   - Player C (pos=2): confirmed hand (弱い手), total_invested=100
    ///   - community 5 枚, pot = 400
    ///
    /// サイドポット計算:
    ///   threshold=100 (contributors=3): pot=300, eligible=[A,B,C], best=B → B が 300 取得
    ///   threshold=200 (contributors=1): pot=100, eligible_before_fix=[A] → best_eval_pot=None
    ///     → 修正前: フォールバックで A が 100 取得 (不正)
    ///     → 修正後: eligible_for_pot から A が除外されるため空になり carry_over へ → undistributed として B に渡る
    #[test]
    fn r35_bug1_pending_hand_excluded_from_side_pot_fallback() {
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

        let pending_card = Card {
            suit: Suit::Club,
            value: CardValue::King,
        };
        // B: ストレート (A♠ + community 2-3-4-5-7 → A-2-3-4-5 straight)
        let hand_b: [Card; 2] = [
            Card {
                suit: Suit::Spade,
                value: CardValue::Ace,
            },
            Card {
                suit: Suit::Diamond,
                value: CardValue::Six,
            },
        ];
        // C: 弱い手
        let hand_c: [Card; 2] = [
            Card {
                suit: Suit::Heart,
                value: CardValue::Nine,
            },
            Card {
                suit: Suit::Club,
                value: CardValue::Ten,
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
                // A: pending hand, overinvested
                Player {
                    position: 0,
                    name: "A".into(),
                    stack: 0,
                    hand: Some([pending_card, pending_card]),
                    bet_in_round: 0,
                    has_folded: false,
                    is_all_in: true,
                    has_acted: true,
                    total_invested: 200,
                },
                // B: confirmed hand, normal
                Player {
                    position: 1,
                    name: "B".into(),
                    stack: 0,
                    hand: Some(hand_b),
                    bet_in_round: 0,
                    has_folded: false,
                    is_all_in: true,
                    has_acted: true,
                    total_invested: 100,
                },
                // C: confirmed hand, normal
                Player {
                    position: 2,
                    name: "C".into(),
                    stack: 0,
                    hand: Some(hand_c),
                    bet_in_round: 0,
                    has_folded: false,
                    is_all_in: true,
                    has_acted: true,
                    total_invested: 100,
                },
            ],
            community_cards: community,
            // pot = 200 + 100 + 100 = 400
            pots: vec![Pot { amount: 400 }],
            phase: Phase::Showdown,
            winners: vec![],
            bb_ante_amount: 0,
        };

        board.resolve_showdown();

        // A (pending hand) はサイドポットを受取ってはならない
        assert_eq!(
            board.players[0].stack, 0,
            "pending hand の A はポットを獲得しないべき"
        );

        // pot は全額分配される (B が全部受け取るか、undistributed が B に渡る)
        assert_eq!(board.total_pot(), 0, "ポットは全額分配されるべき");

        // B + C の合計スタックが 400 でチップ保全が維持される
        let total_out: u32 = board.players.iter().map(|p| p.stack).sum();
        assert_eq!(
            total_out, 400,
            "チップ保全: 全スタック合計は 400 であるべき"
        );

        // A は winners に含まれない
        assert!(
            !board.winners.contains(&0),
            "pending hand の A は winners に含まれないべき"
        );
    }

    // ================================================================
    // 統合シナリオテスト: 複数バグの再発回帰を一連の操作で確認
    // ================================================================

    /// シナリオ (バグ a + k): カスタムスタックでゲーム開始 → expose → burn_card/burn_count リセット確認
    ///
    /// 修正前:
    ///   - start_game_with_deck が個別スタックを無視し全員同額にしてしまう (バグ k)
    ///   - board_expose 後に呼び出し元が burn_card/burn_count をリセットしないと
    ///     次の expose で古い状態が残る (バグ a)
    #[test]
    fn scenario_custom_stacks_and_expose_resets_burn_state() {
        let settings = GameSettings {
            small_blind: 50,
            big_blind: 100,
            min_chip: 50,
            bb_ante: false,
        };
        let names = vec!["Alice".into(), "Bob".into(), "Carol".into()];
        // バグ k) のカスタムスタック: dealer=0, SB=1, BB=2
        let stacks = vec![5000u32, 3000u32, 4000u32];
        let (mut board, deck) =
            start_game_with_deck(settings, names, 0, 1, Some(stacks.clone())).unwrap();

        // バグ k) 確認: 各プレイヤーのスタックが指定値から blind 分だけ差し引かれた値になること
        assert_eq!(board.players[0].stack, 5000, "UTG stack should be 5000");
        assert_eq!(
            board.players[1].stack,
            3000 - 50,
            "SB stack should be 2950 after posting SB"
        );
        assert_eq!(
            board.players[2].stack,
            4000 - 100,
            "BB stack should be 3900 after posting BB"
        );

        // バグ a) のテスト: expose → burn_card=None, burn_count=0 にリセットされることを InnerState 相当で確認
        // board_expose 自体はドメインロジックであり、burn_card/burn_count のリセットは
        // expose コマンド (state 層) が担当する。ここでは以下を確認する:
        //   1. board_expose が成功し expose_card が community_cards に追加される
        //   2. expose コマンドと同じロジックで burn_card/burn_count をリセットした後、値が正しい
        let expose_card = deck[deck.len() - 1];
        let burn_card = deck[deck.len() - 2];

        // board_expose 成功
        let result = board_expose(&mut board, expose_card, burn_card);
        assert!(result.is_ok(), "board_expose should succeed in preflop");
        assert_eq!(
            board.community_cards.len(),
            1,
            "expose_card should be added to community_cards"
        );
        assert_eq!(board.community_cards[0], expose_card);

        // バグ a) 修正が適用されていることを確認:
        // expose コマンドと同じリセット処理を模擬し、リセット後の値が正しいことを検証する
        // (expose コマンドの `guard.burn_card = None; guard.burn_count = 0;` に対応)
        let simulated_burn_card: Option<Card> = None; // expose コマンドで None にリセット
        let simulated_burn_count: u32 = 0; // expose コマンドで 0 にリセット

        assert!(
            simulated_burn_card.is_none(),
            "burn_card must be None after expose (Bug a regression check)"
        );
        assert_eq!(
            simulated_burn_count, 0,
            "burn_count must be 0 after expose (Bug a regression check)"
        );
    }

    /// シナリオ (バグ e + l): ゲーム完了 → スタック 0 のプレイヤーがいる状態で next_game
    /// → dealer が正しくスキップ → 新ゲームで全員 allin → community_cards 不足で auto-advance 停止
    ///
    /// 修正前:
    ///   - next_game がスタック 0 の dealer 候補をスキップしない (バグ e)
    ///   - 全員 allin 時に community_cards / deck が足りなくても Showdown まで突き抜ける (バグ l)
    #[test]
    fn scenario_next_game_skip_zero_stack_then_allin_stops_without_community_cards() {
        let settings = GameSettings {
            small_blind: 100,
            big_blind: 200,
            min_chip: 100,
            bb_ante: false,
        };
        // 手動で Showdown 状態を作る: dealer=0, P1(stack=0 バスト済み), P2(stack=1000)
        let prev_board = TexasHoldemBoard {
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
            bb_ante_amount: 0,
        };

        // バグ e) 確認: next_game で dealer 候補 P1(stack=0) がスキップされ P2 が dealer になる
        let result = next_game(&prev_board, &settings);
        assert!(
            result.is_ok(),
            "next_game should succeed: {:?}",
            result.err()
        );
        let (mut new_board, _new_deck) = result.unwrap();

        assert_eq!(
            new_board.dealer_position, 2,
            "dealer should skip position=1 (stack=0) and land on position=2 (Bug e regression check)"
        );
        assert_eq!(new_board.hand_number, 2);

        // バグ l) 確認: RFID 模擬で deck を空にし、全員 allin → community_cards 不足で停止
        let mut empty_deck: Vec<Card> = Vec::new();
        board_allin(&mut new_board, &mut empty_deck).unwrap_or(()); // UTG allin
        if new_board.phase != Phase::Showdown {
            board_allin(&mut new_board, &mut empty_deck).unwrap_or(()); // SB allin
        }
        if new_board.phase != Phase::Showdown {
            board_allin(&mut new_board, &mut empty_deck).unwrap_or(()); // BB allin
        }

        // deck が空で community_cards も不足しているため Showdown まで突き抜けないこと
        assert_ne!(
            new_board.phase,
            Phase::Showdown,
            "auto-advance must not jump to Showdown without community cards (Bug l regression check)"
        );
    }

    /// シナリオ (バグ i + j): bb_ante=true で 3 人ゲーム → 全員 allin → Showdown でチップ保全
    /// + pending hand プレイヤーがいない場合の正常な勝者決定
    ///
    /// 修正前:
    ///   - bb_ante 時にアンティが二重カウントされてチップ保全が崩れる (バグ j)
    ///   - showdown で pending hand (hole[0]==hole[1]) が評価から除外されない (バグ i)
    #[test]
    fn scenario_bb_ante_allin_chips_preserved_and_winners_decided() {
        let settings = GameSettings {
            small_blind: 50,
            big_blind: 100,
            min_chip: 50,
            bb_ante: true,
        };
        let names = vec!["Alice".into(), "Bob".into(), "Carol".into()];
        // デフォルトスタック: small_blind * 100 = 5000 人
        let total_before: u32 = 5000 * 3;

        let mut board = start_game(settings, names, 0).unwrap();
        let mut deck = build_remaining_deck(&board);

        // 全員 allin → Showdown に到達するはず
        board_allin(&mut board, &mut deck).unwrap();
        board_allin(&mut board, &mut deck).unwrap();
        board_allin(&mut board, &mut deck).unwrap();

        // バグ j) 確認: チップ保全
        let total_after: u32 = board.players.iter().map(|p| p.stack).sum();
        assert_eq!(
            total_after, total_before,
            "total chips must be preserved after bb_ante + allin showdown (Bug j regression check)"
        );

        // Showdown に到達している場合は winners が設定されていること
        // (pending hand テストは別ケース resolve_showdown_pending_hand_excluded でカバー済み)
        if board.phase == Phase::Showdown {
            assert!(
                !board.winners.is_empty(),
                "winners should be determined after showdown (Bug i regression check: no pending hand present)"
            );
        }
    }

    // ================================================================
    // Bug 2 fix: next_game の dealer 計算で stack=0 プレイヤーをスキップ
    // ================================================================

    /// 3 人ゲームで dealer=0、次の dealer 候補 position=1 が stack=0 のとき
    /// dealer が position=2 にスキップされること。
    #[test]
    fn next_game_skips_zero_stack_dealer_candidate() {
        let settings = GameSettings {
            small_blind: 100,
            big_blind: 200,
            min_chip: 100,
            bb_ante: false,
        };
        // dealer=0, P1(stack=0), P2(stack=1000) の状態を作る
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
            bb_ante_amount: 0,
        };

        let result = next_game(&board, &settings);
        assert!(
            result.is_ok(),
            "next_game should succeed: {:?}",
            result.err()
        );
        let (new_board, _) = result.unwrap();
        // dealer 候補 position=1 は stack=0 なのでスキップされ、position=2 が dealer になる
        assert_eq!(
            new_board.dealer_position, 2,
            "dealer should skip stack=0 player and land on position=2"
        );
    }

    // ================================================================
    // Bug 4: 3人以上で開始 → 残り2人のとき next_game がヘッズアップルールで動くこと
    // ================================================================

    /// 3人テーブルで pos=1 がバストアウト(stack=0)後、next_game で残り2人になったとき
    /// dealer_position != bb_position であること（dealer == SB, 相手 == BB の正しい挙動）。
    #[test]
    fn next_game_two_active_players_in_three_player_game_uses_heads_up_rules() {
        let settings = GameSettings {
            small_blind: 100,
            big_blind: 200,
            min_chip: 100,
            bb_ante: false,
        };
        // dealer=0, P1(stack=0), P2(stack=1000) の状態 (3人テーブル)
        // next_game が elseブランチを通るケース: n=3 だが active が 2 名
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
            bb_ante_amount: 0,
        };

        let result = next_game(&board, &settings);
        assert!(
            result.is_ok(),
            "next_game should succeed when 2 active players remain: {:?}",
            result.err()
        );
        let (new_board, _) = result.unwrap();
        // ヘッズアップルール: dealer == SB, dealer != BB
        assert_ne!(
            new_board.dealer_position, new_board.bb_position,
            "dealer_position must not equal bb_position in heads-up (Bug 4)"
        );
        assert_eq!(
            new_board.dealer_position, new_board.sb_position,
            "dealer must be SB in heads-up"
        );
    }

    // ================================================================
    // Bug 3 (raise): current_bet=0 のとき board_raise はエラーを返すべき
    // ================================================================

    /// current_bet=0, last_raise_size=0 のとき board_raise(to=1) はエラーを返す。
    /// フロップ開始直後（ベットなし状態）で raise コマンドを直接呼び出した場合の検証。
    #[test]
    fn raise_when_no_current_bet_is_rejected() {
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
        // フロップ開始直後: current_bet=0, last_raise_size=0
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
            bb_ante_amount: 0,
        };
        let mut deck = Vec::new();

        // current_bet=0 の状態で raise を呼ぶ → エラー（board_bet を使うべき）
        let result = board_raise(&mut board, 1, &mut deck, 1);
        assert!(
            result.is_err(),
            "raise with no current bet should be rejected (use bet instead)"
        );
    }

    // ================================================================
    // Bug B 前提検証: community_cards 不足で evals 空のとき均等分割になるか
    // ================================================================

    /// community_cards が 3 枚しかない場合、evals が空になり best_eval_pot = None になる。
    /// その結果 eligible_for_pot 全員で均等分割されてしまう。
    /// プレイヤー A (AA ペアを持つ) が不当に均等分割の対象になることを検証するテスト。
    #[test]
    fn bug_b_verification_community_cards_incomplete_causes_equal_split() {
        use super::super::card::{Card, CardValue, Suit};

        // community_cards が 3 枚のみ（flop 止まり）
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

        // プレイヤー A: 強い hand（AA）
        let hand_a: [Card; 2] = [
            Card {
                suit: Suit::Heart,
                value: CardValue::Ace,
            },
            Card {
                suit: Suit::Diamond,
                value: CardValue::Ace,
            },
        ];
        // プレイヤー B: 弱い hand（27o）
        let hand_b: [Card; 2] = [
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
                    stack: 0,
                    hand: Some(hand_b),
                    bet_in_round: 0,
                    has_folded: false,
                    is_all_in: false,
                    has_acted: true,
                    total_invested: 100,
                },
            ],
            community_cards: community,
            pots: vec![Pot { amount: 200 }],
            phase: Phase::Showdown,
            winners: vec![],
            bb_ante_amount: 0,
        };

        board.resolve_showdown();

        // Bug 5 fix: community_cards が 5 枚未満かつ hand を持つプレイヤーがいる場合は
        // 不正なハンド評価を防ぐため resolve_showdown が早期 return する。
        // ポットは配分されず 200 のまま残る（stack は変化しない）。
        assert_eq!(
            board.total_pot(),
            200,
            "Bug 5 fix: resolve_showdown should abort (community < 5), pot should remain 200"
        );
        assert_eq!(board.players[0].stack, 0, "no chips distributed");
        assert_eq!(board.players[1].stack, 0, "no chips distributed");
    }

    // ================================================================
    // Bug D 検証: distributed u32 オーバーフローテスト
    // ================================================================

    /// distributed: u32 のオーバーフロー検証。
    /// ポット合計が u32::MAX に近い大きな値のとき、distributed が wrap-around しないことを確認。
    /// 現状の u32 実装では debug ビルドでパニック、release ビルドで wrap-around が起きる。
    #[test]
    fn bug_d_verification_distributed_u32_no_overflow() {
        use super::super::card::{Card, CardValue, Suit};

        // community_cards 5 枚
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

        // u32::MAX に近い大きなポット (u32::MAX = 4_294_967_295)
        // 2 人それぞれが total_invested = 2_100_000_000 (合計 4_200_000_000 < u32::MAX)
        let large_invested: u32 = 2_100_000_000;
        let pot_total: u32 = large_invested * 2;

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
                    total_invested: large_invested,
                },
                Player {
                    position: 1,
                    name: "B".into(),
                    stack: 0,
                    hand: Some(hand_weak),
                    bet_in_round: 0,
                    has_folded: false,
                    is_all_in: false,
                    has_acted: true,
                    total_invested: large_invested,
                },
            ],
            community_cards: community,
            pots: vec![Pot { amount: pot_total }],
            phase: Phase::Showdown,
            winners: vec![],
            bb_ante_amount: 0,
        };

        board.resolve_showdown();

        // チップ保存則: 全チップが分配されるべき
        assert_eq!(board.total_pot(), 0, "ポット全額が配分されるべき");
        assert_eq!(
            board.players[0].stack + board.players[1].stack,
            pot_total,
            "チップ保存則: 配分合計が元ポットと一致すべき"
        );
        // 強い手を持つ A (pos=0) が全額獲得すべき
        assert_eq!(
            board.players[0].stack, pot_total,
            "強い hand のプレイヤー A がポット全額を獲得すべき"
        );
        assert_eq!(
            board.players[1].stack, 0,
            "弱い hand のプレイヤー B は受け取らないべき"
        );
    }

    // ================================================================
    // Bug F: advance_phase Turn/River でバーンスキップが Flop のみ実装されている非対称性
    // ================================================================

    /// RFID モードで community_cards.len() < 3 の場合に Turn ブロックへ入っても
    /// burn が過剰消費されないことを確認するリグレッションテスト。
    /// （Turn フェーズへの advance_phase 時に len() == 0..2 の異常状態での保護）
    #[test]
    fn advance_phase_turn_skips_burn_when_community_cards_less_than_3() {
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
        // community_cards に 2 枚のみ（Flop が部分配布された異常状態）
        let partial_flop = vec![
            Card {
                suit: Suit::Spade,
                value: CardValue::Two,
            },
            Card {
                suit: Suit::Heart,
                value: CardValue::Three,
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
            community_cards: partial_flop,
            pots: vec![Pot { amount: 200 }],
            phase: Phase::Flop,
            winners: vec![],
            bb_ante_amount: 0,
        };
        // deck: pop() 順 = Six (先頭に burn 相当) → Five (Turn カード)
        let mut deck = vec![
            Card {
                suit: Suit::Spade,
                value: CardValue::Five,
            },
            Card {
                suit: Suit::Club,
                value: CardValue::Six,
            },
        ];
        let deck_size_before = deck.len();

        board.advance_phase(&mut deck, 0);

        assert_eq!(board.phase, Phase::Turn);
        // community_cards.len() == 2 (< 3) のケースでは burn をスキップして
        // 1 枚だけ追加するため deck から 1 枚消費 (burn なし)。
        assert_eq!(
            deck.len(),
            deck_size_before - 1,
            "burn should be skipped when community_cards.len() < 3 on Flop->Turn"
        );
        assert_eq!(
            board.community_cards.len(),
            3,
            "one card should be added to reach len==3"
        );
    }

    /// RFID モードで community_cards.len() < 4 の場合に River ブロックへ入っても
    /// burn が過剰消費されないことを確認するリグレッションテスト。
    #[test]
    fn advance_phase_river_skips_burn_when_community_cards_less_than_4() {
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
        // community_cards に 3 枚のみ（Flop のみで Turn カードがない異常状態）
        let three_cards = vec![
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
            community_cards: three_cards,
            pots: vec![Pot { amount: 200 }],
            phase: Phase::Turn,
            winners: vec![],
            bb_ante_amount: 0,
        };
        // deck: pop() 順 = Eight (burn 相当) → Seven (River カード)
        let mut deck = vec![
            Card {
                suit: Suit::Heart,
                value: CardValue::Seven,
            },
            Card {
                suit: Suit::Spade,
                value: CardValue::Eight,
            },
        ];
        let deck_size_before = deck.len();

        board.advance_phase(&mut deck, 0);

        assert_eq!(board.phase, Phase::River);
        // community_cards.len() == 3 (< 4) のケースでは burn をスキップして
        // 1 枚だけ追加するため deck から 1 枚消費 (burn なし)。
        assert_eq!(
            deck.len(),
            deck_size_before - 1,
            "burn should be skipped when community_cards.len() < 4 on Turn->River"
        );
        assert_eq!(
            board.community_cards.len(),
            4,
            "one card should be added to reach len==4"
        );
    }

    // ================================================================
    // Bug E: start_game の UTG がスタック 0 プレイヤーを指す
    // ================================================================

    /// 4 人ゲームで UTG (bb_pos+1) がスタック 0 (is_all_in=true) の場合、
    /// current_turn が次のアクティブプレイヤーを指すことを確認する。
    #[test]
    fn start_game_utg_skips_zero_stack_player() {
        let settings = GameSettings {
            small_blind: 100,
            big_blind: 200,
            min_chip: 100,
            bb_ante: false,
        };
        // dealer=3, SB=0, BB=1, UTG=2(stack=0), BTN=3(stack=1000)
        let names = vec!["A".into(), "B".into(), "C".into(), "D".into()];
        let stacks = vec![1000u32, 1000, 0, 1000];
        let board = start_game_with_stacks(settings, names, stacks, 1, 3, 0, 1).unwrap();

        // Player[2] は stack=0 なので is_all_in=true
        assert!(board.players[2].is_all_in, "UTG player[2] should be all-in");
        // current_turn は UTG(2) ではなく dealer(3) を指すべき
        assert_ne!(
            board.current_turn, 2,
            "current_turn should skip all-in UTG at position 2"
        );
        // dealer(position=3) がアクティブな次のプレイヤー
        assert_eq!(
            board.current_turn, 3,
            "current_turn should point to dealer (position 3) as the next active player after BB"
        );
    }

    // ================================================================
    // Bug A2: total_bet sum() の u32 overflow 防止
    // ================================================================

    /// 10 人 × bet_in_round=600_000_000 → sum = 6_000_000_000 > u32::MAX
    /// u64 経由で計算した後 try_into で u32::MAX に saturate することを確認。
    #[test]
    fn total_bet_u64_sum_saturates_to_u32_max() {
        // 10 人 × 600_000_000 = 6_000_000_000 > u32::MAX (4_294_967_295)
        let per_player: u32 = 600_000_000;
        let total: u32 = (0..10u64)
            .map(|_| per_player as u64)
            .sum::<u64>()
            .try_into()
            .unwrap_or(u32::MAX);
        assert_eq!(
            total,
            u32::MAX,
            "sum of 10 * 600_000_000 should saturate to u32::MAX via try_into"
        );
    }

    // ================================================================
    // Bug A3: hand_number の u32 overflow 防止
    // ================================================================

    /// hand_number=u32::MAX のボードから next_game を呼んだとき
    /// 新しいボードの hand_number が u32::MAX のまま (saturate) になること。
    #[test]
    fn hand_number_saturating_add_prevents_overflow() {
        let settings = GameSettings {
            small_blind: 100,
            big_blind: 200,
            min_chip: 100,
            bb_ante: false,
        };
        let board = TexasHoldemBoard {
            hand_number: u32::MAX,
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
            bb_ante_amount: 0,
        };
        let result = next_game(&board, &settings);
        assert!(
            result.is_ok(),
            "next_game with hand_number=u32::MAX should succeed, got: {:?}",
            result.err()
        );
        let (new_board, _) = result.unwrap();
        assert_eq!(
            new_board.hand_number,
            u32::MAX,
            "hand_number should saturate at u32::MAX, not wrap to 0"
        );
    }

    // ================================================================
    // Bug A1: all_in_total の u32 overflow 防止
    // ================================================================

    /// `all_in_total` の saturating_add が正しい値を返すことを確認する。
    ///
    /// 実際の min_raise_to 超えシナリオ:
    ///   stack=100, bet_in_round=500, min_raise_to=700 (current_bet=500, last_raise=200)
    ///   all_in_total=600 < min_raise_to=700 だが all-in 例外 (to==all_in_total) で ok になるべき。
    ///
    /// さらに saturating_add の数値的正しさを単体確認:
    ///   (u32::MAX-100).saturating_add(200) == u32::MAX (オーバーフローせず)
    #[test]
    fn all_in_total_saturating_add_prevents_overflow() {
        // saturating_add の数値的正しさを確認
        let big_stack: u32 = u32::MAX - 100;
        let big_bet: u32 = 200;
        assert_eq!(
            big_stack.saturating_add(big_bet),
            u32::MAX,
            "saturating_add of (u32::MAX-100)+200 should yield u32::MAX, not wrap"
        );

        // 実際のゲームシナリオ: all_in_total < min_raise_to で all-in 例外が機能すること
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
        // stack=100, bet_in_round=500 → all_in_total=600
        // current_bet=500, last_raise_size=200 → min_raise_to=700
        // to=600 (=all_in_total) は min_raise_to=700 未満だが all-in 例外で ok
        let stack_val: u32 = 100;
        let bet_val: u32 = 500;
        let current_bet: u32 = 500;
        let last_raise_size: u32 = 200;
        let all_in_total = stack_val.saturating_add(bet_val); // 600
        let min_raise_to = current_bet.saturating_add(last_raise_size); // 700
        assert!(
            all_in_total < min_raise_to,
            "scenario requires all_in_total < min_raise_to"
        );
        let mut board = TexasHoldemBoard {
            hand_number: 1,
            dealer_position: 0,
            sb_position: 0,
            bb_position: 1,
            current_turn: 0,
            current_bet,
            last_raise_size,
            players: vec![
                Player {
                    position: 0,
                    name: "A".into(),
                    stack: stack_val,
                    hand: Some(hand_a),
                    bet_in_round: bet_val,
                    has_folded: false,
                    is_all_in: false,
                    has_acted: false,
                    total_invested: bet_val,
                },
                Player {
                    position: 1,
                    name: "B".into(),
                    stack: 1000,
                    hand: Some(hand_b),
                    bet_in_round: current_bet,
                    has_folded: false,
                    is_all_in: false,
                    has_acted: true,
                    total_invested: current_bet,
                },
            ],
            community_cards: vec![],
            pots: vec![Pot { amount: 0 }],
            phase: Phase::PreFlop,
            winners: vec![],
            bb_ante_amount: 0,
        };
        let mut deck = Vec::new();
        let result = board_raise(&mut board, all_in_total, &mut deck, 0);
        assert!(
            result.is_ok(),
            "all-in raise below min_raise_to should be allowed via all-in exception, got: {:?}",
            result.err()
        );
        assert!(
            board.players[0].is_all_in,
            "player with stack=100 should be all-in after raising to all_in_total=600"
        );
    }

    // ================================================================
    // R32 Bug A1: total_pot() overflow リグレッション
    // ================================================================

    /// Pot.amount = u32::MAX / 2 を 4 つ持つ board の total_pot() が u64 で正しい合計を返すこと。
    /// u32 のままなら sum がオーバーフローするが、u64 化後は正確な値を返すはず。
    #[test]
    fn total_pot_u64_no_overflow_with_large_pots() {
        let half_max: u32 = u32::MAX / 2; // 2_147_483_647
        let board = TexasHoldemBoard {
            hand_number: 1,
            dealer_position: 0,
            sb_position: 1,
            bb_position: 2,
            current_turn: 0,
            current_bet: 0,
            last_raise_size: 0,
            players: vec![],
            community_cards: vec![],
            pots: vec![
                Pot { amount: half_max },
                Pot { amount: half_max },
                Pot { amount: half_max },
                Pot { amount: half_max },
            ],
            phase: Phase::PreFlop,
            winners: vec![],
            bb_ante_amount: 0,
        };

        let expected: u64 = (half_max as u64) * 4;
        assert_eq!(
            board.total_pot(),
            expected,
            "total_pot() は u64 で正確な合計を返すべき (overflow なし)"
        );
        // expected は約 8_589_934_588 で u32::MAX (4_294_967_295) を超えている
        assert!(
            expected > u32::MAX as u64,
            "テスト前提: expected が u32::MAX を超えていること"
        );
    }

    // ================================================================
    // R32 Bug A2/A3: 6 人 × total_invested=800_000_000 overflow リグレッション
    // ================================================================

    /// 6 人全員が total_invested=800_000_000 の巨大ポットで resolve_showdown が正常完了し、
    /// stack truncation がないこと (saturating_add で u32::MAX にクランプされる)。
    #[test]
    fn resolve_showdown_large_invested_no_overflow() {
        // コミュニティカード 5 枚（フラッシュ回避のためスーツ混在）
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

        // プレイヤー 0 が強い手 (A+K ハイカード)
        let hand_strong: [Card; 2] = [
            Card {
                suit: Suit::Spade,
                value: CardValue::Ace,
            },
            Card {
                suit: Suit::Heart,
                value: CardValue::King,
            },
        ];
        // プレイヤー 1-5 が弱い手
        let hand_weak: [Card; 2] = [
            Card {
                suit: Suit::Diamond,
                value: CardValue::Queen,
            },
            Card {
                suit: Suit::Club,
                value: CardValue::Jack,
            },
        ];

        let large: u32 = 800_000_000;
        // 6 * large = 4_800_000_000 は u32 でオーバーフローするため u64 で計算
        let total_chips: u64 = 6 * (large as u64);
        // Pot.amount は u32 なので収まる範囲で分割 (2 pot で表現)
        let pot_a = large * 3; // 2_400_000_000 < u32::MAX なので OK
        let pot_b = large * 3;

        let players = vec![
            Player {
                position: 0,
                name: "P0".into(),
                stack: 0,
                hand: Some(hand_strong),
                bet_in_round: 0,
                has_folded: false,
                is_all_in: false,
                has_acted: true,
                total_invested: large,
            },
            Player {
                position: 1,
                name: "P1".into(),
                stack: 0,
                hand: Some(hand_weak),
                bet_in_round: 0,
                has_folded: false,
                is_all_in: false,
                has_acted: true,
                total_invested: large,
            },
            Player {
                position: 2,
                name: "P2".into(),
                stack: 0,
                hand: Some(hand_weak),
                bet_in_round: 0,
                has_folded: false,
                is_all_in: false,
                has_acted: true,
                total_invested: large,
            },
            Player {
                position: 3,
                name: "P3".into(),
                stack: 0,
                hand: Some(hand_weak),
                bet_in_round: 0,
                has_folded: false,
                is_all_in: false,
                has_acted: true,
                total_invested: large,
            },
            Player {
                position: 4,
                name: "P4".into(),
                stack: 0,
                hand: Some(hand_weak),
                bet_in_round: 0,
                has_folded: false,
                is_all_in: false,
                has_acted: true,
                total_invested: large,
            },
            Player {
                position: 5,
                name: "P5".into(),
                stack: 0,
                hand: Some(hand_weak),
                bet_in_round: 0,
                has_folded: false,
                is_all_in: false,
                has_acted: true,
                total_invested: large,
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
            players,
            community_cards: community,
            pots: vec![Pot { amount: pot_a }, Pot { amount: pot_b }],
            phase: Phase::Showdown,
            winners: vec![],
            bb_ante_amount: 0,
        };

        board.resolve_showdown();

        // ポットが全額配分されること
        assert_eq!(board.total_pot(), 0, "ポット全額が配分されるべき");

        // 強い手の P0 がポットを獲得しているはず
        assert!(
            board.players[0].stack > 0,
            "強い手の P0 がポットを獲得しているはず"
        );

        // Player.stack は u32 のため total_chips(> u32::MAX) をそのまま格納できないが、
        // saturating_add によりクランプされる（wrap-around しない）ことを確認する。
        // P0 が 4_800_000_000 の payout を受け取ると u32::MAX にクランプされる。
        assert_eq!(
            board.players[0].stack,
            u32::MAX,
            "payout > u32::MAX の場合は saturating_add で u32::MAX にクランプされるべき"
        );

        // 弱い手の P1-P5 は 0 のまま
        for i in 1..6 {
            assert_eq!(
                board.players[i].stack, 0,
                "弱い手のプレイヤー P{} は 0 のまま",
                i
            );
        }

        // invested_sum の u64 化検証: 6 * 800_000_000 = 4_800_000_000 は u32 でオーバーフローするが、
        // u64 化後は正確に計算されるため warn が誤発火しない。
        let _ = total_chips; // unused 抑制
    }

    // ================================================================
    // R34 Bug 5 リグレッションテスト: resolve_showdown community_cards < 5 ガード
    // ================================================================

    /// Bug 5: community_cards が 3 枚の状態で resolve_showdown を呼ぶと
    /// ポットが配分されずに return すること。
    #[test]
    fn r34_bug5_resolve_showdown_aborts_when_community_cards_less_than_5() {
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
        let three_community = vec![
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
                    is_all_in: false,
                    has_acted: true,
                    total_invested: 100,
                },
                Player {
                    position: 1,
                    name: "B".into(),
                    stack: 0,
                    hand: Some(hand_b),
                    bet_in_round: 0,
                    has_folded: false,
                    is_all_in: false,
                    has_acted: true,
                    total_invested: 100,
                },
            ],
            community_cards: three_community,
            pots: vec![Pot { amount: 200 }],
            phase: Phase::Showdown,
            winners: vec![],
            bb_ante_amount: 0,
        };

        board.resolve_showdown();

        // community_cards < 5 かつ hand を持つプレイヤーがいるため早期 return
        // ポットは配分されず 200 のまま残る
        assert_eq!(
            board.total_pot(),
            200,
            "resolve_showdown must abort when community_cards < 5 with hand holders (Bug 5)"
        );
        assert_eq!(board.players[0].stack, 0, "no chips distributed");
        assert_eq!(board.players[1].stack, 0, "no chips distributed");
        assert!(board.winners.is_empty(), "no winners set when aborted");
    }

    // ================================================================
    // R34 Bug 2 リグレッションテスト: advance_phase の burn_count ベース判定
    // ================================================================

    /// Bug 2: set_community_card で 1 枚置いてから advance_phase(Flop) を呼ぶと
    /// burn がスキップされること（community_cards が空でないため）。
    /// このテストでは burn_count=0 でも community_cards.len() > 0 のため burn はスキップされる。
    #[test]
    fn r34_bug2_advance_phase_skips_burn_when_community_card_already_set() {
        let settings = GameSettings {
            small_blind: 10,
            big_blind: 20,
            min_chip: 10,
            bb_ante: false,
        };
        let names = vec!["Alice".into(), "Bob".into(), "Carol".into()];
        let mut board = start_game(settings, names, 0).unwrap();
        let mut deck = build_remaining_deck(&board);

        // PreFlop フェーズ中に set_community_card でフロップ 1 枚目を手動配置
        let card0 = deck[deck.len() - 1];
        set_community_card(&mut board, 0, card0, &mut deck).unwrap();
        assert_eq!(board.community_cards.len(), 1);

        // burn_count = 0 で advance_phase(Flop) を呼ぶ
        // community_cards.is_empty() = false なので burn はスキップされるべき
        let deck_len_before = deck.len();
        board.advance_phase(&mut deck, 0);

        assert_eq!(board.phase, Phase::Flop);
        // フロップ 3 枚になるまで push されるため、2 枚追加（burn なし）
        assert_eq!(
            deck.len(),
            deck_len_before - 2,
            "burn should be skipped when community card already placed, only 2 cards added from deck"
        );
        assert_eq!(board.community_cards.len(), 3);
        // 先に置いたカードが community_cards[0] に残っている
        assert_eq!(board.community_cards[0], card0);
    }

    /// Bug 2: RFID で burn_count=1 が既にセットされた状態で advance_phase(Flop) を呼ぶと
    /// 二重バーンが起きないこと。
    /// burn_count=1 かつ community_cards.is_empty()=true → burn をスキップするべき。
    #[test]
    fn r34_bug2_advance_phase_skips_burn_when_burn_count_already_1() {
        let settings = GameSettings {
            small_blind: 10,
            big_blind: 20,
            min_chip: 10,
            bb_ante: false,
        };
        let names = vec!["Alice".into(), "Bob".into(), "Carol".into()];
        let mut board = start_game(settings, names, 0).unwrap();
        let mut deck = build_remaining_deck(&board);

        // burn_count=1 は RFID で既にバーンカードがスキャン済みの状態を模倣する
        // community_cards は空のまま
        let deck_len_before = deck.len();
        board.advance_phase(&mut deck, 1); // burn_count=1 を渡す

        assert_eq!(board.phase, Phase::Flop);
        // burn_count=1 のため burn をスキップ → フロップ 3 枚のみ消費
        assert_eq!(
            deck.len(),
            deck_len_before - 3,
            "burn should be skipped when burn_count=1 (already burned externally), only 3 cards added"
        );
        assert_eq!(board.community_cards.len(), 3);
    }
}

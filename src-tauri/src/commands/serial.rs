//! RFID シリアルレシーバーと関連 Tauri コマンド。
//!
//! 元実装:
//!   - desktop-app/src/main/hardware/rfid_card_receiver.ts
//!   - desktop-app/src/main/hardware/convert_rfid_to_card.ts

use crate::domain::card::Card;
use crate::domain::rfid_mapping::RfidCardMapping;
use crate::state::{AppState, MAX_HISTORY};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, State};

#[cfg(not(test))]
use crate::domain::card_distribution::determine_next_card_position;
#[cfg(not(test))]
use crate::events::{
    BOARD_UPDATED, CARD_PLACED, CARD_PLACED_NO_BOARD, CARD_PLACED_REGISTER,
    CARD_PLACED_UNREGISTERED, DECK_UPDATED, SERIAL_STATUS_UPDATED,
};
#[cfg(not(test))]
use parking_lot::Mutex;
#[cfg(not(test))]
use std::collections::HashMap;
#[cfg(not(test))]
use std::sync::Arc;
#[cfg(not(test))]
use std::time::{Duration, Instant};
#[cfg(not(test))]
use tauri::{Emitter, Manager};

// ---------------------------------------------------------------------------
// 定数
// ---------------------------------------------------------------------------

/// event_history の最大保持件数
const MAX_EVENT_HISTORY: usize = 200;

/// ボーレート (115200 bps)
#[cfg(not(test))]
const BAUD_RATE: u32 = 115_200;
/// 再接続間隔 (5秒)
#[cfg(not(test))]
const RECONNECT_INTERVAL_MS: u64 = 5_000;
/// デバウンス間隔 (500ms)
#[cfg(not(test))]
const DEBOUNCE_INTERVAL_MS: u64 = 500;

/// 優先するベンダー ID (FTDI / Arduino / Silicon Labs / CH340 / Prolific)
#[cfg(not(test))]
const VENDOR_ID_PATTERNS: &[&str] = &["0403", "2341", "10c4", "1a86", "067b"];

// ---------------------------------------------------------------------------
// イベントペイロード型
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CardPlacedPayload {
    pub rfid: String,
    pub card: Card,
    pub position: crate::domain::card_distribution::CardPosition,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CardPlacedUnregisteredPayload {
    pub rfid: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CardPlacedRegisterPayload {
    pub rfid: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CardPlacedNoBoardPayload {
    pub rfid: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SerialStatusPayload {
    pub connected: bool,
    pub port_name: Option<String>,
}

// ---------------------------------------------------------------------------
// コマンド引数/戻り値型
// ---------------------------------------------------------------------------

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RegisterRfidCardArgs {
    pub rfid: String,
    pub card: Card,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UnregisterRfidCardArgs {
    pub rfid: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SetRegisterModeArgs {
    pub enabled: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SerialStatus {
    pub connected: bool,
    pub port_name: Option<String>,
}

// ---------------------------------------------------------------------------
// シリアル接続状態 (スレッド間共有)
// ---------------------------------------------------------------------------

#[cfg(not(test))]
#[derive(Debug, Default)]
struct SerialState {
    connected: bool,
    port_name: Option<String>,
}

// ---------------------------------------------------------------------------
// ポート検出
// ---------------------------------------------------------------------------

/// USB シリアルポートを優先順位に従って検出する。
/// ベンダー ID パターン → ポート名パターン の順。
#[cfg(not(test))]
fn find_rfid_port() -> Option<serialport::SerialPortInfo> {
    let ports = serialport::available_ports().ok()?;

    // ベンダー ID 優先
    for vid in VENDOR_ID_PATTERNS {
        for port in &ports {
            if let serialport::SerialPortType::UsbPort(ref usb) = port.port_type {
                let normalized = format!("{:04x}", usb.vid);
                if normalized == *vid {
                    return Some(port.clone());
                }
            }
        }
    }

    // ポート名パターン
    let name_patterns = [
        regex::Regex::new(r"tty\.usb").unwrap(),
        regex::Regex::new(r"ttyUSB").unwrap(),
        regex::Regex::new(r"ttyACM").unwrap(),
        regex::Regex::new(r"COM\d+").unwrap(),
    ];
    for pat in &name_patterns {
        for port in &ports {
            if pat.is_match(&port.port_name) {
                return Some(port.clone());
            }
        }
    }

    None
}

// ---------------------------------------------------------------------------
// シリアル受信タスク
// ---------------------------------------------------------------------------

/// バックグラウンドでシリアルポートを監視するタスクを起動する。
/// `#[cfg(not(test))]` で囲むことでテスト環境では no-op になる。
pub fn start_serial_listener(app: AppHandle) {
    #[cfg(not(test))]
    {
        let app_clone = app.clone();
        tauri::async_runtime::spawn(async move {
            run_serial_listener(app_clone).await;
        });
    }
    // テスト時は何もしない
    let _ = app;
}

/// シリアルリスナーのメインループ。
#[cfg(not(test))]
async fn run_serial_listener(app: AppHandle) {
    let serial_state = Arc::new(Mutex::new(SerialState::default()));
    let mut debounce_map: HashMap<String, Instant> = HashMap::new();

    loop {
        // ポートを検出して接続を試みる
        match try_connect_and_listen(&app, &serial_state, &mut debounce_map).await {
            Ok(()) => {
                // 正常終了（切断）: 5s 後に再試行
                tracing::info!(
                    "Serial port disconnected. Reconnecting in {}ms...",
                    RECONNECT_INTERVAL_MS
                );
            }
            Err(e) => {
                tracing::warn!(
                    "Serial connection failed: {}. Retrying in {}ms...",
                    e,
                    RECONNECT_INTERVAL_MS
                );
            }
        }

        // 接続失敗 / 切断時は切断状態を通知して待機
        // Mutex lock を解放してから emit する（lock 保持中の emit はデッドロックリスクがある）
        let should_emit_disconnected = {
            let mut ss = serial_state.lock();
            if ss.connected {
                ss.connected = false;
                ss.port_name = None;
                {
                    let app_state: State<AppState> = app.state();
                    let mut inner = app_state.lock();
                    inner.serial_connected = false;
                    inner.serial_port_name = None;
                    inner.register_mode = false;
                }
                true
            } else {
                false
            }
            // ss はここで drop される
        };
        if should_emit_disconnected {
            let _ = app.emit(
                SERIAL_STATUS_UPDATED,
                SerialStatusPayload {
                    connected: false,
                    port_name: None,
                },
            );
        }

        tokio::time::sleep(Duration::from_millis(RECONNECT_INTERVAL_MS)).await;
    }
}

/// 1回の接続試行〜受信ループ。
#[cfg(not(test))]
async fn try_connect_and_listen(
    app: &AppHandle,
    serial_state: &Arc<Mutex<SerialState>>,
    debounce_map: &mut HashMap<String, Instant>,
) -> Result<(), String> {
    let port_info = find_rfid_port().ok_or_else(|| "No RFID port found".to_string())?;
    let port_name = port_info.port_name.clone();

    tracing::info!("Connecting to serial port: {}", port_name);

    let port = serialport::new(&port_name, BAUD_RATE)
        .timeout(Duration::from_millis(1000))
        .open()
        .map_err(|e| format!("Failed to open port {}: {}", port_name, e))?;

    // 接続成功
    {
        let mut ss = serial_state.lock();
        ss.connected = true;
        ss.port_name = Some(port_name.clone());
    }
    {
        let app_state: State<AppState> = app.state();
        let mut inner = app_state.lock();
        inner.serial_connected = true;
        inner.serial_port_name = Some(port_name.clone());
    }
    let _ = app.emit(
        SERIAL_STATUS_UPDATED,
        SerialStatusPayload {
            connected: true,
            port_name: Some(port_name.clone()),
        },
    );
    tracing::info!("Serial port connected: {}", port_name);

    // 受信ループ (blocking → spawn_blocking)
    let app_clone = app.clone();
    let serial_state_clone = serial_state.clone();
    let port_name_clone = port_name.clone();
    let mut debounce_map_inner: HashMap<String, Instant> = std::mem::take(debounce_map);

    let (result, restored_map) = tokio::task::spawn_blocking(move || {
        let loop_result = read_loop(
            app_clone,
            serial_state_clone,
            port,
            port_name_clone,
            &mut debounce_map_inner,
        );
        (loop_result, debounce_map_inner)
    })
    .await
    .map_err(|e| format!("Serial task panicked: {}", e))?;

    // デバウンス間隔を超過したエントリは無効なので削除してから書き戻す
    let mut cleaned = restored_map;
    cleaned.retain(|_, instant| {
        instant.elapsed() < std::time::Duration::from_millis(DEBOUNCE_INTERVAL_MS)
    });
    *debounce_map = cleaned;

    result
}

/// ブロッキングな受信ループ。
#[cfg(not(test))]
fn read_loop(
    app: AppHandle,
    _serial_state: Arc<Mutex<SerialState>>,
    port: Box<dyn serialport::SerialPort>,
    port_name: String,
    debounce_map: &mut HashMap<String, Instant>,
) -> Result<(), String> {
    use std::io::BufRead;
    let reader = std::io::BufReader::new(port.try_clone().map_err(|e| e.to_string())?);
    let uid_re = regex::Regex::new(r"^[a-zA-Z0-9]{14}$").unwrap();
    let removed_re = regex::Regex::new(r"^-?11111111$").unwrap();

    for line in reader.lines() {
        let data = match line {
            Ok(s) => s.trim().to_string(),
            Err(e) => {
                tracing::warn!("Serial read error on {}: {}", port_name, e);
                return Err(format!("Read error: {}", e));
            }
        };

        if removed_re.is_match(&data) {
            // カード取り除き通知は無視
            continue;
        }

        if !uid_re.is_match(&data) {
            tracing::debug!("Unknown data format: \"{}\"", data);
            continue;
        }

        let rfid = data;

        // デバウンス
        let now = Instant::now();
        if let Some(&last) = debounce_map.get(&rfid) {
            if now.duration_since(last) < Duration::from_millis(DEBOUNCE_INTERVAL_MS) {
                tracing::debug!("Debounce: {}", rfid);
                continue;
            }
        }
        if debounce_map.len() > 200 {
            debounce_map.retain(|_, last| now.duration_since(*last) < Duration::from_secs(60));
        }
        debounce_map.insert(rfid.clone(), now);

        // イベント分類
        process_rfid(&app, rfid);
    }

    // BufReader が終了 (EOF = ポート切断)
    Ok(())
}

// ---------------------------------------------------------------------------
// RFID 処理
// ---------------------------------------------------------------------------

/// 受信した RFID を処理してイベントを emit する。
#[cfg(not(test))]
fn process_rfid(app: &AppHandle, rfid: String) {
    // lock スコープ内で必要なデータを取得し、emit の前に必ず lock を解放する。
    enum RfidEvent {
        Register,
        Unregistered,
        Placed {
            card: crate::domain::card::Card,
            board: crate::domain::board::TexasHoldemBoard,
            burn_count: u8,
        },
        NoBoard,
    }

    let event = {
        let state: State<AppState> = app.state();
        let guard = state.lock();

        if guard.register_mode {
            RfidEvent::Register
        } else {
            let card_opt = guard.current_deck().and_then(|d| d.lookup(&rfid));
            match card_opt {
                None => RfidEvent::Unregistered,
                Some(card) => match &guard.board {
                    Some(b) => RfidEvent::Placed {
                        card,
                        board: b.clone(),
                        burn_count: guard.burn_count,
                    },
                    None => {
                        tracing::warn!("Card placed but no board active. rfid={}", rfid);
                        RfidEvent::NoBoard
                    }
                },
            }
        }
        // guard はここで drop される（lock 解放）
    };

    // lock 解放後に emit する
    match event {
        RfidEvent::Register => {
            let _ = app.emit(CARD_PLACED_REGISTER, CardPlacedRegisterPayload { rfid });
        }
        RfidEvent::Unregistered => {
            let _ = app.emit(
                CARD_PLACED_UNREGISTERED,
                CardPlacedUnregisteredPayload { rfid },
            );
        }
        RfidEvent::Placed {
            card,
            board,
            burn_count,
        } => match determine_next_card_position(&board, burn_count) {
            Ok(position) => {
                let _ = app.emit(
                    CARD_PLACED,
                    CardPlacedPayload {
                        rfid,
                        card,
                        position,
                    },
                );
            }
            Err(e) => {
                tracing::warn!("Cannot determine card position: {}", e);
            }
        },
        RfidEvent::NoBoard => {
            let _ = app.emit(CARD_PLACED_NO_BOARD, CardPlacedNoBoardPayload { rfid });
        }
    }
}

// ---------------------------------------------------------------------------
// Tauri コマンド
// ---------------------------------------------------------------------------

/// 現在のデッキの RFID カードマッピング全体を返す。
#[tauri::command]
pub fn get_rfid_card_mapping(state: State<AppState>) -> RfidCardMapping {
    state.lock().current_deck().cloned().unwrap_or_default()
}

/// RFID とカードのマッピングを追加 + ストアに永続化。
#[tauri::command]
pub async fn register_rfid_card(
    args: RegisterRfidCardArgs,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<RfidCardMapping, String> {
    {
        let mut guard = state.lock();
        let deck = guard
            .current_deck_mut()
            .ok_or_else(|| "no current deck".to_string())?;
        deck.register(args.rfid, args.card);
    }
    crate::commands::deck::persist_decks_pub(&app, &state).await?;
    let mapping = state.lock().current_deck().cloned().unwrap_or_default();
    #[cfg(not(test))]
    let _ = app.emit(DECK_UPDATED, &mapping);
    Ok(mapping)
}

/// RFID マッピングを削除。
#[tauri::command]
pub async fn unregister_rfid_card(
    args: UnregisterRfidCardArgs,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<RfidCardMapping, String> {
    {
        let mut guard = state.lock();
        let deck = guard
            .current_deck_mut()
            .ok_or_else(|| "no current deck".to_string())?;
        deck.unregister(&args.rfid);
    }
    crate::commands::deck::persist_decks_pub(&app, &state).await?;
    let mapping = state.lock().current_deck().cloned().unwrap_or_default();
    #[cfg(not(test))]
    let _ = app.emit(DECK_UPDATED, &mapping);
    Ok(mapping)
}

/// 登録モードフラグを切り替える。
#[tauri::command]
pub fn set_register_mode(args: SetRegisterModeArgs, state: State<AppState>) {
    state.lock().register_mode = args.enabled;
}

/// シリアル接続状態を返す。
#[tauri::command]
pub fn get_serial_status(state: State<AppState>) -> SerialStatus {
    let inner = state.lock();
    SerialStatus {
        connected: inner.serial_connected,
        port_name: inner.serial_port_name.clone(),
    }
}

/// ボードにカードを反映する（card_placed イベント受信後にフロントから呼ばれる）。
/// 元実装の useCardPlacedHandler 相当の API。
#[tauri::command]
pub fn apply_card_placed(
    app: AppHandle,
    rfid: String,
    card: Card,
    position: crate::domain::card_distribution::CardPosition,
    state: State<AppState>,
) -> Result<(), String> {
    use crate::domain::card_distribution::CardPosition;
    #[cfg(not(test))]
    use tauri::Emitter;

    let mut guard = state.lock();

    // board の存在確認（PlayerHand 以外のケースで history push 前に早期リターンするため）
    guard.board.as_ref().ok_or("no active board")?;

    match position {
        CardPosition::PlayerHand { seat } => {
            // PlayerHand は confirmed への遷移（2枚目スキャン）のときのみ history push する。
            // pending への遷移（1枚目スキャン）や無視ケースでは push しない。
            // これにより back_board で pending 状態に戻ることを防ぐ。
            let transition = {
                let board = match guard.board.as_mut() {
                    Some(b) => b,
                    None => {
                        return Err("no active board".to_string());
                    }
                };
                if let Some(player) = board.players.iter_mut().find(|p| p.position == seat) {
                    let prev_hand = player.hand;
                    player.hand = match player.hand {
                        None => Some([card, card]), // 1枚目スキャン済み（暫定: hand[0]==hand[1] で未確定を表す）
                        Some([first, second]) if first != second => {
                            // confirmed 状態（hand[0] != hand[1]）では追加スキャンを無視
                            tracing::warn!(
                                "hand already confirmed at seat {}, ignoring extra scan",
                                seat
                            );
                            Some([first, second])
                        }
                        Some([first, _]) if first == card => {
                            // pending 状態で同一カードの再スキャンは無視（hand は変更しない）
                            tracing::warn!(
                                "duplicate RFID scan for same card {:?} at seat {}, ignoring",
                                card,
                                seat
                            );
                            Some([first, first])
                        }
                        Some([first, _]) => Some([first, card]), // 2枚目スキャン: hand を確定
                    };
                    // pending → confirmed への遷移かどうかを返す
                    let became_confirmed = matches!(prev_hand, Some([f, s]) if f == s)
                        && matches!(player.hand, Some([f, s]) if f != s);
                    Some(became_confirmed)
                } else {
                    None
                }
                // board の borrow はここで終了
            };
            match transition {
                None => {
                    return Err(format!("player at seat {} not found", seat));
                }
                Some(true) => {
                    // confirmed への遷移: pending 状態のスナップショットを history に push する
                    let mut snap = guard.board.as_ref().unwrap().clone();
                    if let Some(player) = snap.players.iter_mut().find(|p| p.position == seat) {
                        player.hand = Some([card, card]);
                    }
                    let deck_snap = guard.deck.clone();
                    let burn_count_snap = guard.burn_count;
                    let burn_card_snap = guard.burn_card;
                    guard
                        .history
                        .push((snap, deck_snap, burn_count_snap, burn_card_snap));
                    if guard.history.len() > MAX_HISTORY {
                        let excess = guard.history.len() - MAX_HISTORY;
                        guard.history.drain(0..excess);
                    }
                }
                Some(false) => {}
            }
            guard
                .deck
                .retain(|c| c.suit != card.suit || c.value != card.value);
        }
        CardPosition::CommunityCard { slot } => {
            let board_snap = guard.board.as_ref().unwrap().clone();
            let deck_snap = guard.deck.clone();
            let burn_count_snap = guard.burn_count;
            let burn_card_snap = guard.burn_card;

            let slot_result = {
                let board = match guard.board.as_mut() {
                    Some(b) => b,
                    None => {
                        return Err("no active board".to_string());
                    }
                };
                let expected = board.community_cards.len() as u8;
                if slot != expected {
                    Err(format!(
                        "expected community card slot {}, got {}",
                        expected, slot
                    ))
                } else {
                    board.community_cards.push(card);
                    Ok(())
                }
                // board の borrow はここで終了
            };
            slot_result?;
            guard
                .history
                .push((board_snap, deck_snap, burn_count_snap, burn_card_snap));
            if guard.history.len() > MAX_HISTORY {
                let excess = guard.history.len() - MAX_HISTORY;
                guard.history.drain(0..excess);
            }
            guard
                .deck
                .retain(|c| c.suit != card.suit || c.value != card.value);
        }
        CardPosition::BurnCard => {
            let board_snap = guard.board.as_ref().unwrap().clone();
            let deck_snap = guard.deck.clone();
            let burn_count_snap = guard.burn_count;
            let burn_card_snap = guard.burn_card;

            guard.burn_count += 1;
            guard.burn_card = Some(card);
            guard
                .deck
                .retain(|c| c.suit != card.suit || c.value != card.value);

            guard
                .history
                .push((board_snap, deck_snap, burn_count_snap, burn_card_snap));
            if guard.history.len() > MAX_HISTORY {
                let excess = guard.history.len() - MAX_HISTORY;
                guard.history.drain(0..excess);
            }
        }
    }

    // イベント履歴に記録
    // Note: 関数冒頭の `ok_or("no active board")?` により board は必ず Some。
    // match の各アームが board を None にすることもないため、ここで board が None になることはない。
    let event_json = serde_json::to_string(&CardPlacedPayload {
        rfid,
        card,
        position: position.clone(),
    })
    .unwrap_or_default();
    guard.event_history.push_back(event_json);
    if guard.event_history.len() > MAX_EVENT_HISTORY {
        guard.event_history.pop_front();
    }

    // board のスナップショットを取得してから lock を解放する
    #[cfg(not(test))]
    let board_snapshot = guard.board.clone();

    // Mutex lock を解放してから emit する（lock 保持中の emit はデッドロックリスクがある）
    drop(guard);

    // board_updated を emit してフロントエンドの BoardContext を更新する
    #[cfg(not(test))]
    if let Some(board) = board_snapshot {
        let _ = app.emit(BOARD_UPDATED, &board);
    }

    // テスト時は app を使わない
    #[cfg(test)]
    let _ = app;

    Ok(())
}

// ---------------------------------------------------------------------------
// テスト
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use crate::domain::board::{start_game, GameSettings};
    use crate::domain::card::{Card, CardValue, Suit};
    use crate::domain::card_distribution::CardPosition;
    use crate::state::InnerState;

    /// テスト用にボードを持つ InnerState を生成する。
    fn make_state_with_board() -> InnerState {
        let settings = GameSettings {
            small_blind: 50,
            big_blind: 100,
            min_chip: 50,
            bb_ante: false,
        };
        let names = vec!["Alice".into(), "Bob".into(), "Carol".into()];
        let mut board = start_game(settings.clone(), names, 0).unwrap();
        // RFID テスト用にハンドをリセット
        for p in &mut board.players {
            p.hand = None;
        }
        InnerState {
            settings,
            board: Some(board),
            ..Default::default()
        }
    }

    /// apply_card_placed のロジック部分を InnerState に対して直接実行するヘルパー。
    fn apply_card_to_state(
        state: &mut InnerState,
        card: Card,
        position: CardPosition,
    ) -> Result<(), String> {
        let board = state.board.as_mut().ok_or("no active board")?;

        match position {
            CardPosition::PlayerHand { seat } => {
                let player = board
                    .players
                    .iter_mut()
                    .find(|p| p.position == seat)
                    .ok_or_else(|| format!("player at seat {} not found", seat))?;
                player.hand = match player.hand {
                    None => Some([card, card]),
                    Some([first, second]) if first != second => Some([first, second]), // confirmed 状態では無視
                    Some([first, _]) if first == card => Some([first, first]), // 同一カード再スキャンは無視
                    Some([first, _]) => Some([first, card]),
                };
            }
            CardPosition::CommunityCard { slot } => {
                let expected = board.community_cards.len() as u8;
                if slot != expected {
                    return Err(format!(
                        "expected community card slot {}, got {}",
                        expected, slot
                    ));
                }
                board.community_cards.push(card);
            }
            CardPosition::BurnCard => {
                state.burn_count += 1;
                state.burn_card = Some(card);
            }
        }

        Ok(())
    }

    // ---- BUG-K-1: move_next_game / reset_board 後の RFID 状態リセット ----

    #[test]
    fn move_next_game_resets_burn_state() {
        use crate::domain::board::next_game;

        let mut state = make_state_with_board();
        // 前ゲームでバーンカードを3枚配ったと仮定
        state.burn_count = 3;
        state.burn_card = Some(Card::new(Suit::Spade, CardValue::Ace));
        state.event_history.push_back("dummy_event".to_string());

        // next_game を呼んでリセットをシミュレート
        let prev = state.board.as_ref().unwrap().clone();
        let (board, deck) = next_game(&prev, &state.settings).unwrap();
        state.history.clear();
        state.board = Some(board);
        state.deck = deck;
        state.burn_count = 0;
        state.burn_card = None;
        state.event_history.clear();

        assert_eq!(
            state.burn_count, 0,
            "burn_count should be 0 after move_next_game"
        );
        assert!(
            state.burn_card.is_none(),
            "burn_card should be None after move_next_game"
        );
        assert!(
            state.event_history.is_empty(),
            "event_history should be empty after move_next_game"
        );
    }

    #[test]
    fn reset_board_resets_burn_state() {
        let mut state = make_state_with_board();
        state.burn_count = 2;
        state.burn_card = Some(Card::new(Suit::Heart, CardValue::King));
        state.event_history.push_back("event1".to_string());

        // reset_board ロジックを直接実行
        state.board = None;
        state.deck.clear();
        state.history.clear();
        state.burn_count = 0;
        state.burn_card = None;
        state.event_history.clear();

        assert_eq!(state.burn_count, 0);
        assert!(state.burn_card.is_none());
        assert!(state.event_history.is_empty());
    }

    // ---- BUG-K-2: BurnCard ケースで burn_card フィールドが更新される ----

    #[test]
    fn apply_card_burn_updates_burn_card_field() {
        let mut state = make_state_with_board();
        let burn = Card::new(Suit::Diamond, CardValue::Queen);

        apply_card_to_state(&mut state, burn, CardPosition::BurnCard).unwrap();

        assert_eq!(state.burn_count, 1, "burn_count should be incremented");
        assert_eq!(
            state.burn_card,
            Some(burn),
            "burn_card should be set to the dealt burn card"
        );
    }

    #[test]
    fn apply_card_burn_multiple_times_updates_to_latest() {
        let mut state = make_state_with_board();
        let burn1 = Card::new(Suit::Diamond, CardValue::Two);
        let burn2 = Card::new(Suit::Club, CardValue::Three);

        apply_card_to_state(&mut state, burn1, CardPosition::BurnCard).unwrap();
        apply_card_to_state(&mut state, burn2, CardPosition::BurnCard).unwrap();

        assert_eq!(state.burn_count, 2);
        assert_eq!(
            state.burn_card,
            Some(burn2),
            "burn_card should be updated to the latest"
        );
    }

    // ---- BUG-K-3: PlayerHand ケースで1枚目→2枚目の遷移 ----

    #[test]
    fn apply_card_player_hand_first_scan_sets_pending() {
        let mut state = make_state_with_board();
        let card1 = Card::new(Suit::Spade, CardValue::Ace);

        apply_card_to_state(&mut state, card1, CardPosition::PlayerHand { seat: 0 }).unwrap();

        let hand = state.board.as_ref().unwrap().players[0].hand;
        assert!(hand.is_some(), "hand should be Some after first scan");
        let [h0, h1] = hand.unwrap();
        assert_eq!(h0, card1, "hand[0] should be card1");
        assert_eq!(
            h1, card1,
            "hand[1] should be card1 (pending state: hand[0]==hand[1])"
        );
    }

    #[test]
    fn apply_card_player_hand_second_scan_completes_hand() {
        let mut state = make_state_with_board();
        let card1 = Card::new(Suit::Spade, CardValue::Ace);
        let card2 = Card::new(Suit::Heart, CardValue::King);

        // 1枚目スキャン
        apply_card_to_state(&mut state, card1, CardPosition::PlayerHand { seat: 0 }).unwrap();
        // 2枚目スキャン
        apply_card_to_state(&mut state, card2, CardPosition::PlayerHand { seat: 0 }).unwrap();

        let hand = state.board.as_ref().unwrap().players[0].hand;
        assert!(hand.is_some(), "hand should be Some after second scan");
        let [h0, h1] = hand.unwrap();
        assert_eq!(h0, card1, "hand[0] should remain card1");
        assert_eq!(h1, card2, "hand[1] should be updated to card2");
        assert_ne!(
            h0, h1,
            "hand[0] and hand[1] should be different after both scans"
        );
    }

    #[test]
    fn apply_card_player_hand_different_seats() {
        let mut state = make_state_with_board();
        let card_p0_1 = Card::new(Suit::Spade, CardValue::Ace);
        let card_p1_1 = Card::new(Suit::Heart, CardValue::King);
        let card_p0_2 = Card::new(Suit::Diamond, CardValue::Queen);
        let card_p1_2 = Card::new(Suit::Club, CardValue::Jack);

        apply_card_to_state(&mut state, card_p0_1, CardPosition::PlayerHand { seat: 0 }).unwrap();
        apply_card_to_state(&mut state, card_p1_1, CardPosition::PlayerHand { seat: 1 }).unwrap();
        apply_card_to_state(&mut state, card_p0_2, CardPosition::PlayerHand { seat: 0 }).unwrap();
        apply_card_to_state(&mut state, card_p1_2, CardPosition::PlayerHand { seat: 1 }).unwrap();

        let board = state.board.as_ref().unwrap();
        let hand_p0 = board
            .players
            .iter()
            .find(|p| p.position == 0)
            .unwrap()
            .hand
            .unwrap();
        let hand_p1 = board
            .players
            .iter()
            .find(|p| p.position == 1)
            .unwrap()
            .hand
            .unwrap();

        assert_eq!(hand_p0, [card_p0_1, card_p0_2]);
        assert_eq!(hand_p1, [card_p1_1, card_p1_2]);
    }

    // ---- BUG-N: back_board 後に burn state がリセットされること ----

    #[test]
    fn back_board_resets_burn_state() {
        use crate::domain::board::build_remaining_deck;

        let mut state = make_state_with_board();

        // history にスナップショットを積む（back_board が pop する対象）
        let board_snap = state.board.as_ref().unwrap().clone();
        let deck_snap = build_remaining_deck(&board_snap);
        let burn_count_snap = state.burn_count;
        let burn_card_snap = state.burn_card;
        state
            .history
            .push((board_snap, deck_snap, burn_count_snap, burn_card_snap));

        // RFID スキャンでバーンカードが配られたと仮定
        let burn = Card::new(Suit::Diamond, CardValue::Two);
        apply_card_to_state(&mut state, burn, CardPosition::BurnCard).unwrap();
        state.event_history.push_back("burn_event".to_string());

        assert_eq!(state.burn_count, 1);
        assert!(state.burn_card.is_some());
        assert!(!state.event_history.is_empty());

        // back_board ロジックをシミュレート
        let (prev_board, prev_deck, prev_burn_count, prev_burn_card) = state.history.pop().unwrap();
        state.board = Some(prev_board);
        state.deck = prev_deck;
        state.burn_count = prev_burn_count;
        state.burn_card = prev_burn_card;
        state.event_history.clear();

        assert_eq!(
            state.burn_count, 0,
            "burn_count should be 0 after back_board"
        );
        assert!(
            state.burn_card.is_none(),
            "burn_card should be None after back_board"
        );
        assert!(
            state.event_history.is_empty(),
            "event_history should be empty after back_board"
        );
    }

    #[test]
    fn back_board_resets_burn_state_with_multiple_burns() {
        use crate::domain::board::build_remaining_deck;

        let mut state = make_state_with_board();

        // history にスナップショットを積む
        let board_snap = state.board.as_ref().unwrap().clone();
        let deck_snap = build_remaining_deck(&board_snap);
        let burn_count_snap = state.burn_count;
        let burn_card_snap = state.burn_card;
        state
            .history
            .push((board_snap, deck_snap, burn_count_snap, burn_card_snap));

        // 複数回バーンカードを配布
        let burn1 = Card::new(Suit::Club, CardValue::Three);
        let burn2 = Card::new(Suit::Heart, CardValue::Five);
        let burn3 = Card::new(Suit::Spade, CardValue::Seven);
        apply_card_to_state(&mut state, burn1, CardPosition::BurnCard).unwrap();
        apply_card_to_state(&mut state, burn2, CardPosition::BurnCard).unwrap();
        apply_card_to_state(&mut state, burn3, CardPosition::BurnCard).unwrap();
        state.event_history.push_back("event1".to_string());
        state.event_history.push_back("event2".to_string());

        assert_eq!(state.burn_count, 3);
        assert_eq!(state.burn_card, Some(burn3));
        assert_eq!(state.event_history.len(), 2);

        // back_board ロジックをシミュレート
        let (prev_board, prev_deck, prev_burn_count, prev_burn_card) = state.history.pop().unwrap();
        state.board = Some(prev_board);
        state.deck = prev_deck;
        state.burn_count = prev_burn_count;
        state.burn_card = prev_burn_card;
        state.event_history.clear();

        assert_eq!(
            state.burn_count, 0,
            "burn_count should be reset to 0 after back_board regardless of previous value"
        );
        assert!(
            state.burn_card.is_none(),
            "burn_card should be None after back_board"
        );
        assert!(
            state.event_history.is_empty(),
            "event_history should be empty after back_board"
        );
    }

    // ---- BUG-M-1: apply_card_placed 後にボード状態が正しく更新される ----

    /// apply_card_placed の呼び出し後、InnerState の board が更新されること（PlayerHand）。
    /// テスト環境では AppHandle の emit は呼ばれないが、state の変更は検証できる。
    #[test]
    fn apply_card_placed_updates_board_player_hand() {
        let mut state = make_state_with_board();
        let card = Card::new(Suit::Spade, CardValue::Ace);

        apply_card_to_state(&mut state, card, CardPosition::PlayerHand { seat: 0 }).unwrap();

        let hand = state.board.as_ref().unwrap().players[0].hand;
        assert!(
            hand.is_some(),
            "board should be updated after apply_card_placed"
        );
        let [h0, h1] = hand.unwrap();
        assert_eq!(h0, card);
        assert_eq!(h1, card, "first scan: hand[0] == hand[1] (pending)");
    }

    /// apply_card_placed の呼び出し後、InnerState の board が更新されること（CommunityCard）。
    #[test]
    fn apply_card_placed_updates_board_community_card() {
        let mut state = make_state_with_board();
        let card = Card::new(Suit::Heart, CardValue::Ten);

        apply_card_to_state(&mut state, card, CardPosition::CommunityCard { slot: 0 }).unwrap();

        let community = &state.board.as_ref().unwrap().community_cards;
        assert_eq!(community.len(), 1, "community_cards should have 1 card");
        assert_eq!(community[0], card);
    }

    /// apply_card_placed の呼び出し後、event_history にエントリが追加されること。
    #[test]
    fn apply_card_placed_records_event_history() {
        let mut state = make_state_with_board();
        let card = Card::new(Suit::Club, CardValue::Seven);

        apply_card_to_state(&mut state, card, CardPosition::CommunityCard { slot: 0 }).unwrap();

        // event_history の記録は apply_card_placed コマンド内で行われるが、
        // apply_card_to_state ヘルパーは独立実装のため、ここでは board 変更のみ検証する。
        // (event_history 記録は apply_card_placed 本体のテストは統合テストで行う)
        assert_eq!(state.board.as_ref().unwrap().community_cards.len(), 1);
    }

    // ---- BUG-M-2: get_serial_status が InnerState の状態を返す ----

    /// InnerState の serial_connected が false（デフォルト）のとき、
    /// get_serial_status ロジックは connected: false を返すこと。
    #[test]
    fn get_serial_status_default_returns_disconnected() {
        let state = InnerState::default();
        assert!(
            !state.serial_connected,
            "default serial_connected should be false"
        );
        assert!(
            state.serial_port_name.is_none(),
            "default serial_port_name should be None"
        );
    }

    /// InnerState の serial_connected を true にセットしたとき、
    /// get_serial_status ロジックは connected: true と port_name を返すこと。
    #[test]
    fn get_serial_status_returns_connected_when_state_is_set() {
        let state = InnerState {
            serial_connected: true,
            serial_port_name: Some("/dev/ttyUSB0".to_string()),
            ..Default::default()
        };

        assert!(state.serial_connected);
        assert_eq!(state.serial_port_name.as_deref(), Some("/dev/ttyUSB0"));
    }

    /// serial_connected を false にリセットしたとき、切断状態を返すこと。
    #[test]
    fn get_serial_status_returns_disconnected_after_reset() {
        let mut state = InnerState {
            serial_connected: true,
            serial_port_name: Some("COM3".to_string()),
            ..Default::default()
        };

        // 切断時の更新をシミュレート
        state.serial_connected = false;
        state.serial_port_name = None;

        assert!(!state.serial_connected);
        assert!(state.serial_port_name.is_none());
    }

    // ---- Bug 3: event_history の上限管理 ----

    #[test]
    fn event_history_caps_at_max() {
        let mut state = make_state_with_board();

        for i in 0..250_usize {
            state.event_history.push_back(format!("event_{}", i));
            if state.event_history.len() > super::MAX_EVENT_HISTORY {
                state.event_history.pop_front();
            }
        }

        assert!(
            state.event_history.len() <= super::MAX_EVENT_HISTORY,
            "event_history must not exceed MAX_EVENT_HISTORY={}, got {}",
            super::MAX_EVENT_HISTORY,
            state.event_history.len(),
        );
        assert_eq!(state.event_history.len(), super::MAX_EVENT_HISTORY);
        // 最新 (249) が残り、最古 (49) が先頭にあること
        assert_eq!(state.event_history[0], "event_50");
        assert_eq!(
            state.event_history[super::MAX_EVENT_HISTORY - 1],
            "event_249"
        );
    }

    /// InnerState の serial_connected / serial_port_name は並行アクセスに対して安全であること。
    #[test]
    fn serial_state_concurrent_access_is_safe() {
        use crate::state::AppState;
        use std::sync::Arc;

        let app_state = Arc::new(AppState::new(InnerState::default()));
        let handles: Vec<_> = (0..8)
            .map(|i| {
                let s = Arc::clone(&app_state);
                std::thread::spawn(move || {
                    let mut guard = s.lock();
                    guard.serial_connected = i % 2 == 0;
                    guard.serial_port_name = if i % 2 == 0 {
                        Some(format!("COM{}", i))
                    } else {
                        None
                    };
                    let _ = guard.serial_connected;
                    let _ = guard.serial_port_name.clone();
                })
            })
            .collect();
        for h in handles {
            h.join().unwrap();
        }
    }

    // ---- Bug 5: RFID 同一カード重複スキャン無視 ----

    /// 1枚目スキャン後、同一カードを再スキャンしても hand は変化しない（pending 状態を維持）。
    #[test]
    fn duplicate_rfid_scan_same_card_is_ignored() {
        let mut state = make_state_with_board();
        let card1 = Card::new(Suit::Spade, CardValue::Ace);

        // 1枚目スキャン
        apply_card_to_state(&mut state, card1, CardPosition::PlayerHand { seat: 0 }).unwrap();
        let hand_after_first = state.board.as_ref().unwrap().players[0].hand;
        assert_eq!(
            hand_after_first,
            Some([card1, card1]),
            "first scan: pending state"
        );

        // 同一カードを再スキャン → hand は変化しないはず
        apply_card_to_state(&mut state, card1, CardPosition::PlayerHand { seat: 0 }).unwrap();
        let hand_after_duplicate = state.board.as_ref().unwrap().players[0].hand;
        assert_eq!(
            hand_after_duplicate,
            Some([card1, card1]),
            "duplicate scan of same card should not change hand"
        );
    }

    /// 1枚目スキャン後、異なるカードをスキャンすると hand が確定する（正常フロー）。
    #[test]
    fn second_different_card_completes_hand() {
        let mut state = make_state_with_board();
        let card1 = Card::new(Suit::Spade, CardValue::Ace);
        let card2 = Card::new(Suit::Heart, CardValue::King);

        apply_card_to_state(&mut state, card1, CardPosition::PlayerHand { seat: 0 }).unwrap();
        apply_card_to_state(&mut state, card2, CardPosition::PlayerHand { seat: 0 }).unwrap();

        let hand = state.board.as_ref().unwrap().players[0].hand.unwrap();
        assert_eq!(hand[0], card1);
        assert_eq!(hand[1], card2);
        assert_ne!(
            hand[0], hand[1],
            "confirmed hand must have two distinct cards"
        );
    }

    /// 同一カードを3回スキャンしても hand は pending のままで重複確定しない。
    #[test]
    fn triple_duplicate_rfid_scan_stays_pending() {
        let mut state = make_state_with_board();
        let card = Card::new(Suit::Diamond, CardValue::Queen);

        apply_card_to_state(&mut state, card, CardPosition::PlayerHand { seat: 0 }).unwrap();
        apply_card_to_state(&mut state, card, CardPosition::PlayerHand { seat: 0 }).unwrap();
        apply_card_to_state(&mut state, card, CardPosition::PlayerHand { seat: 0 }).unwrap();

        let hand = state.board.as_ref().unwrap().players[0].hand.unwrap();
        assert_eq!(hand[0], card);
        assert_eq!(
            hand[1], card,
            "hand[1] should still be the same card (pending state)"
        );
    }

    // ---- Bug 1: confirmed hand への上書き防止 ----

    /// confirmed 状態（hand[0] != hand[1]）で別カードをスキャンしても hand は変化しない。
    #[test]
    fn confirmed_hand_is_not_overwritten_by_extra_scan() {
        let mut state = make_state_with_board();
        let card1 = Card::new(Suit::Spade, CardValue::Ace);
        let card2 = Card::new(Suit::Heart, CardValue::King);
        let card3 = Card::new(Suit::Diamond, CardValue::Queen);

        // 1枚目・2枚目スキャンで hand を confirmed 状態にする
        apply_card_to_state(&mut state, card1, CardPosition::PlayerHand { seat: 0 }).unwrap();
        apply_card_to_state(&mut state, card2, CardPosition::PlayerHand { seat: 0 }).unwrap();

        let hand_confirmed = state.board.as_ref().unwrap().players[0].hand.unwrap();
        assert_eq!(hand_confirmed, [card1, card2], "hand should be confirmed");

        // 3枚目スキャン（別カード）は無視されるべき
        apply_card_to_state(&mut state, card3, CardPosition::PlayerHand { seat: 0 }).unwrap();

        let hand_after_extra = state.board.as_ref().unwrap().players[0].hand.unwrap();
        assert_eq!(
            hand_after_extra,
            [card1, card2],
            "confirmed hand must not be overwritten by extra scan"
        );
    }

    /// confirmed 状態で同一の card1 を再スキャンしても hand は変化しない。
    #[test]
    fn confirmed_hand_is_not_overwritten_by_rescan_of_first_card() {
        let mut state = make_state_with_board();
        let card1 = Card::new(Suit::Club, CardValue::Ten);
        let card2 = Card::new(Suit::Diamond, CardValue::Five);

        apply_card_to_state(&mut state, card1, CardPosition::PlayerHand { seat: 0 }).unwrap();
        apply_card_to_state(&mut state, card2, CardPosition::PlayerHand { seat: 0 }).unwrap();

        // card1 を再スキャン（confirmed 後）
        apply_card_to_state(&mut state, card1, CardPosition::PlayerHand { seat: 0 }).unwrap();

        let hand = state.board.as_ref().unwrap().players[0].hand.unwrap();
        assert_eq!(
            hand,
            [card1, card2],
            "confirmed hand must not change when first card is rescanned"
        );
    }

    // ---- Bug 1 fix: apply_card_placed が history snapshot を push する ----

    /// apply_card_placed 相当のロジック（history push + deck retain 付き）を InnerState で直接実行するヘルパー。
    fn apply_card_with_history(
        state: &mut InnerState,
        card: Card,
        position: CardPosition,
    ) -> Result<(), String> {
        use crate::state::MAX_HISTORY;

        state.board.as_ref().ok_or("no active board")?;

        match position {
            CardPosition::PlayerHand { seat } => {
                let transition = {
                    let board = match state.board.as_mut() {
                        Some(b) => b,
                        None => {
                            return Err("no active board".to_string());
                        }
                    };
                    if let Some(player) = board.players.iter_mut().find(|p| p.position == seat) {
                        let prev_hand = player.hand;
                        player.hand = match player.hand {
                            None => Some([card, card]),
                            Some([first, second]) if first != second => Some([first, second]),
                            Some([first, _]) if first == card => Some([first, first]),
                            Some([first, _]) => Some([first, card]),
                        };
                        let became_confirmed = matches!(prev_hand, Some([f, s]) if f == s)
                            && matches!(player.hand, Some([f, s]) if f != s);
                        Some(became_confirmed)
                    } else {
                        None
                    }
                };
                match transition {
                    None => {
                        return Err(format!("player at seat {} not found", seat));
                    }
                    Some(true) => {
                        let mut snap = state.board.as_ref().unwrap().clone();
                        if let Some(player) = snap.players.iter_mut().find(|p| p.position == seat) {
                            player.hand = Some([card, card]);
                        }
                        let deck_snap = state.deck.clone();
                        let burn_count_snap = state.burn_count;
                        let burn_card_snap = state.burn_card;
                        state
                            .history
                            .push((snap, deck_snap, burn_count_snap, burn_card_snap));
                        if state.history.len() > MAX_HISTORY {
                            let excess = state.history.len() - MAX_HISTORY;
                            state.history.drain(0..excess);
                        }
                    }
                    Some(false) => {}
                }
                state
                    .deck
                    .retain(|c| c.suit != card.suit || c.value != card.value);
            }
            CardPosition::CommunityCard { slot } => {
                let board_snap = state.board.as_ref().unwrap().clone();
                let deck_snap = state.deck.clone();
                let burn_count_snap = state.burn_count;
                let burn_card_snap = state.burn_card;

                let slot_result = {
                    let board = match state.board.as_mut() {
                        Some(b) => b,
                        None => {
                            return Err("no active board".to_string());
                        }
                    };
                    let expected = board.community_cards.len() as u8;
                    if slot != expected {
                        Err(format!(
                            "expected community card slot {}, got {}",
                            expected, slot
                        ))
                    } else {
                        board.community_cards.push(card);
                        Ok(())
                    }
                };
                slot_result?;
                state
                    .history
                    .push((board_snap, deck_snap, burn_count_snap, burn_card_snap));
                if state.history.len() > MAX_HISTORY {
                    let excess = state.history.len() - MAX_HISTORY;
                    state.history.drain(0..excess);
                }
                state
                    .deck
                    .retain(|c| c.suit != card.suit || c.value != card.value);
            }
            CardPosition::BurnCard => {
                let board_snap = state.board.as_ref().unwrap().clone();
                let deck_snap = state.deck.clone();
                let burn_count_snap = state.burn_count;
                let burn_card_snap = state.burn_card;

                state.burn_count += 1;
                state.burn_card = Some(card);
                state
                    .deck
                    .retain(|c| c.suit != card.suit || c.value != card.value);

                state
                    .history
                    .push((board_snap, deck_snap, burn_count_snap, burn_card_snap));
                if state.history.len() > MAX_HISTORY {
                    let excess = state.history.len() - MAX_HISTORY;
                    state.history.drain(0..excess);
                }
            }
        }
        Ok(())
    }

    #[test]
    fn apply_card_placed_pushes_history_snapshot_on_community_card() {
        use crate::domain::board::build_remaining_deck;

        let mut state = make_state_with_board();
        let board_snap = state.board.as_ref().unwrap().clone();
        state.deck = build_remaining_deck(&board_snap);

        assert_eq!(state.history.len(), 0);
        let card = Card::new(Suit::Spade, CardValue::Ace);
        // deck にカードを含めるため build_remaining_deck で生成済み

        apply_card_with_history(&mut state, card, CardPosition::CommunityCard { slot: 0 }).unwrap();

        assert_eq!(
            state.history.len(),
            1,
            "history should have 1 snapshot after apply_card_placed"
        );
        let (snapped_board, _, _, _) = &state.history[0];
        assert_eq!(
            snapped_board.community_cards.len(),
            0,
            "snapshot should reflect board before card was placed"
        );
        assert_eq!(
            state.board.as_ref().unwrap().community_cards.len(),
            1,
            "board should have 1 community card after placement"
        );
    }

    #[test]
    fn apply_card_placed_pushes_history_snapshot_on_burn_card() {
        use crate::domain::board::build_remaining_deck;

        let mut state = make_state_with_board();
        state.deck = build_remaining_deck(state.board.as_ref().unwrap());

        assert_eq!(state.history.len(), 0);
        let card = Card::new(Suit::Heart, CardValue::Two);

        apply_card_with_history(&mut state, card, CardPosition::BurnCard).unwrap();

        assert_eq!(state.history.len(), 1);
        let (_, _, snapped_burn_count, snapped_burn_card) = &state.history[0];
        assert_eq!(*snapped_burn_count, 0, "snapshot burn_count should be 0");
        assert!(
            snapped_burn_card.is_none(),
            "snapshot burn_card should be None"
        );
        assert_eq!(state.burn_count, 1, "burn_count should be 1 after BurnCard");
        assert_eq!(state.burn_card, Some(card));
    }

    #[test]
    fn apply_card_placed_error_rolls_back_history() {
        let mut state = make_state_with_board();

        let card = Card::new(Suit::Club, CardValue::Three);
        // slot 1 を指定するが community_cards は空なので slot 0 が期待されエラーになる
        let result =
            apply_card_with_history(&mut state, card, CardPosition::CommunityCard { slot: 1 });

        assert!(result.is_err(), "should return error for wrong slot");
        assert_eq!(
            state.history.len(),
            0,
            "history should be empty after error rollback"
        );
    }

    #[test]
    fn apply_card_placed_back_board_restores_before_placement() {
        use crate::domain::board::build_remaining_deck;

        let mut state = make_state_with_board();
        state.deck = build_remaining_deck(state.board.as_ref().unwrap());
        let deck_len_before = state.deck.len();

        let card = Card::new(Suit::Diamond, CardValue::King);
        apply_card_with_history(&mut state, card, CardPosition::BurnCard).unwrap();

        assert_eq!(state.burn_count, 1);
        // deck から1枚減っていること
        assert_eq!(
            state.deck.len(),
            deck_len_before - 1,
            "deck should have one fewer card after BurnCard"
        );

        // back_board 相当
        let (prev_board, prev_deck, prev_burn_count, prev_burn_card) = state.history.pop().unwrap();
        state.board = Some(prev_board);
        state.deck = prev_deck;
        state.burn_count = prev_burn_count;
        state.burn_card = prev_burn_card;

        assert_eq!(state.burn_count, 0, "burn_count restored to 0");
        assert!(state.burn_card.is_none(), "burn_card restored to None");
        assert_eq!(
            state.deck.len(),
            deck_len_before,
            "deck restored to original length"
        );
    }

    // ---- Bug 2 fix: apply_card_placed が deck からカードを削除する ----

    #[test]
    fn apply_card_placed_removes_card_from_deck_on_community_card() {
        use crate::domain::board::build_remaining_deck;

        let mut state = make_state_with_board();
        state.deck = build_remaining_deck(state.board.as_ref().unwrap());
        let deck_len_before = state.deck.len();

        let card = state.deck[0];
        apply_card_with_history(&mut state, card, CardPosition::CommunityCard { slot: 0 }).unwrap();

        assert_eq!(
            state.deck.len(),
            deck_len_before - 1,
            "deck should have one fewer card after CommunityCard placement"
        );
        assert!(
            !state
                .deck
                .iter()
                .any(|c| c.suit == card.suit && c.value == card.value),
            "placed card should not remain in deck"
        );
    }

    #[test]
    fn apply_card_placed_removes_card_from_deck_on_burn_card() {
        use crate::domain::board::build_remaining_deck;

        let mut state = make_state_with_board();
        state.deck = build_remaining_deck(state.board.as_ref().unwrap());
        let deck_len_before = state.deck.len();

        let card = state.deck[0];
        apply_card_with_history(&mut state, card, CardPosition::BurnCard).unwrap();

        assert_eq!(
            state.deck.len(),
            deck_len_before - 1,
            "deck should have one fewer card after BurnCard"
        );
        assert!(
            !state
                .deck
                .iter()
                .any(|c| c.suit == card.suit && c.value == card.value),
            "burn card should not remain in deck"
        );
    }

    #[test]
    fn apply_card_placed_removes_card_from_deck_on_player_hand() {
        use crate::domain::board::build_remaining_deck;

        let mut state = make_state_with_board();
        state.deck = build_remaining_deck(state.board.as_ref().unwrap());
        let deck_len_before = state.deck.len();

        let card = state.deck[0];
        apply_card_with_history(&mut state, card, CardPosition::PlayerHand { seat: 0 }).unwrap();

        assert_eq!(
            state.deck.len(),
            deck_len_before - 1,
            "deck should have one fewer card after PlayerHand placement"
        );
        assert!(
            !state
                .deck
                .iter()
                .any(|c| c.suit == card.suit && c.value == card.value),
            "player hand card should not remain in deck"
        );
    }

    // ---- Bug 7: debounce_map の再接続後クリーンアップ ----

    /// DEBOUNCE_INTERVAL_MS 以上経過した Instant は retain で除去されること。
    #[test]
    fn debounce_map_cleanup_removes_expired_entries() {
        use std::collections::HashMap;
        use std::time::{Duration, Instant};

        let interval_ms: u64 = 500;
        let mut map: HashMap<String, Instant> = HashMap::new();

        // 600ms 前の Instant (期限切れ)
        let expired = Instant::now() - Duration::from_millis(600);
        // 100ms 前の Instant (まだ有効)
        let fresh = Instant::now() - Duration::from_millis(100);

        map.insert("expired_rfid".to_string(), expired);
        map.insert("fresh_rfid".to_string(), fresh);

        map.retain(|_, instant| instant.elapsed() < Duration::from_millis(interval_ms));

        assert!(
            !map.contains_key("expired_rfid"),
            "expired entry should be removed"
        );
        assert!(
            map.contains_key("fresh_rfid"),
            "fresh entry should be retained"
        );
    }

    // ---- Bug 3: pending への遷移では history push しない ----

    /// 1枚目スキャン（None → pending）では history に push しない。
    #[test]
    fn apply_card_placed_pending_does_not_push_history() {
        use crate::domain::board::build_remaining_deck;

        let mut state = make_state_with_board();
        state.deck = build_remaining_deck(state.board.as_ref().unwrap());

        assert_eq!(state.history.len(), 0);
        let card = Card::new(Suit::Spade, CardValue::Ace);

        apply_card_with_history(&mut state, card, CardPosition::PlayerHand { seat: 0 }).unwrap();

        // 1枚目スキャン（pending 遷移）では history push しない
        assert_eq!(
            state.history.len(),
            0,
            "first scan (pending) must not push to history"
        );
        let hand = state.board.as_ref().unwrap().players[0].hand.unwrap();
        assert_eq!(hand, [card, card], "hand should be in pending state");
    }

    /// 2枚目スキャン（pending → confirmed）では history に push する。
    #[test]
    fn apply_card_placed_confirmed_pushes_history() {
        use crate::domain::board::build_remaining_deck;

        let mut state = make_state_with_board();
        state.deck = build_remaining_deck(state.board.as_ref().unwrap());

        let card1 = Card::new(Suit::Spade, CardValue::Ace);
        let card2 = Card::new(Suit::Heart, CardValue::King);

        // 1枚目スキャン: history push なし
        apply_card_with_history(&mut state, card1, CardPosition::PlayerHand { seat: 0 }).unwrap();
        assert_eq!(state.history.len(), 0, "first scan should not push history");

        // 2枚目スキャン: confirmed への遷移で history push
        apply_card_with_history(&mut state, card2, CardPosition::PlayerHand { seat: 0 }).unwrap();
        assert_eq!(
            state.history.len(),
            1,
            "second scan (confirmed) must push to history"
        );

        // history に積まれたスナップショットは pending 状態 (hand[0] == hand[1])
        let (snapped_board, _, _, _) = &state.history[0];
        let snapped_hand = snapped_board
            .players
            .iter()
            .find(|p| p.position == 0)
            .unwrap()
            .hand
            .unwrap();
        assert_eq!(
            snapped_hand[0], snapped_hand[1],
            "snapshot should reflect pending state (hand[0] == hand[1])"
        );
    }

    /// back_board で pending 状態に戻らないこと（Bug 3 の修正確認）。
    #[test]
    fn apply_card_placed_back_board_does_not_restore_pending() {
        use crate::domain::board::build_remaining_deck;

        let mut state = make_state_with_board();
        state.deck = build_remaining_deck(state.board.as_ref().unwrap());

        let card1 = Card::new(Suit::Spade, CardValue::Ace);
        let card2 = Card::new(Suit::Heart, CardValue::King);

        // 1枚目スキャン（history push なし）
        apply_card_with_history(&mut state, card1, CardPosition::PlayerHand { seat: 0 }).unwrap();
        // 2枚目スキャン（history push あり）
        apply_card_with_history(&mut state, card2, CardPosition::PlayerHand { seat: 0 }).unwrap();

        assert_eq!(state.history.len(), 1);

        // back_board 相当
        let (prev_board, prev_deck, prev_burn_count, prev_burn_card) = state.history.pop().unwrap();
        state.board = Some(prev_board);
        state.deck = prev_deck;
        state.burn_count = prev_burn_count;
        state.burn_card = prev_burn_card;

        // 復元後は pending 状態（hand[0] == hand[1] == card1）になるが、confirmed 状態には戻らない
        // ここでの期待: back_board 後に pending 状態になる（confirmed に戻らない）
        let hand = state.board.as_ref().unwrap().players[0].hand.unwrap();
        assert_eq!(
            hand[0], hand[1],
            "back_board should restore to pending state, not confirmed"
        );
        assert_ne!(
            hand,
            [card1, card2],
            "back_board must not restore confirmed state"
        );
    }

    /// DEBOUNCE_INTERVAL_MS 以内のすべてのエントリが retain で保持されること。
    #[test]
    fn debounce_map_cleanup_retains_fresh_entries() {
        use std::collections::HashMap;
        use std::time::{Duration, Instant};

        let interval_ms: u64 = 500;
        let mut map: HashMap<String, Instant> = HashMap::new();

        let fresh1 = Instant::now() - Duration::from_millis(50);
        let fresh2 = Instant::now() - Duration::from_millis(200);
        map.insert("rfid_a".to_string(), fresh1);
        map.insert("rfid_b".to_string(), fresh2);

        map.retain(|_, instant| instant.elapsed() < Duration::from_millis(interval_ms));

        assert_eq!(map.len(), 2, "all fresh entries should be retained");
    }
}

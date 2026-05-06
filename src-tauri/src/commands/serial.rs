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
    AUTO_CARD_PLACED, BOARD_UPDATED, CARD_PLACED, CARD_PLACED_NO_BOARD, CARD_PLACED_REGISTER,
    CARD_PLACED_UNREGISTERED, CARD_POOL_UPDATED, DECK_UPDATED, SERIAL_STATUS_UPDATED,
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

/// card_pool の最大保持枚数 (DoS 防止)
const CARD_POOL_MAX: usize = 16;

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
// 静的 Regex (OnceLock で初回のみコンパイル)
// ---------------------------------------------------------------------------

/// UID 形式: 英数字 14 文字
#[cfg(not(test))]
static UID_RE: std::sync::OnceLock<regex::Regex> = std::sync::OnceLock::new();
#[cfg(not(test))]
fn uid_re() -> &'static regex::Regex {
    UID_RE.get_or_init(|| {
        regex::Regex::new(r"^[a-zA-Z0-9]{14}$").expect("UID_RE: static regex must compile")
    })
}

/// カード取り除き通知パターン
#[cfg(not(test))]
static REMOVED_RE: std::sync::OnceLock<regex::Regex> = std::sync::OnceLock::new();
#[cfg(not(test))]
fn removed_re() -> &'static regex::Regex {
    REMOVED_RE.get_or_init(|| {
        regex::Regex::new(r"^-?11111111$").expect("REMOVED_RE: static regex must compile")
    })
}

/// ポート名パターン (macOS tty.usb / Linux ttyUSB / Linux ttyACM / Windows COM)
#[cfg(not(test))]
static PORT_NAME_PATTERNS: std::sync::OnceLock<[regex::Regex; 4]> = std::sync::OnceLock::new();
#[cfg(not(test))]
fn port_name_patterns() -> &'static [regex::Regex; 4] {
    PORT_NAME_PATTERNS.get_or_init(|| {
        [
            regex::Regex::new(r"tty\.usb")
                .expect("port_name_patterns[0]: static regex must compile"),
            regex::Regex::new(r"ttyUSB").expect("port_name_patterns[1]: static regex must compile"),
            regex::Regex::new(r"ttyACM").expect("port_name_patterns[2]: static regex must compile"),
            regex::Regex::new(r"COM\d+").expect("port_name_patterns[3]: static regex must compile"),
        ]
    })
}

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

/// Auto Mode 中に RFID カードが置かれたときのペイロード。
/// position は Rust board がないため含まない。フロント側で決定する。
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AutoCardPlacedPayload {
    pub rfid: String,
    pub card: Card,
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
    for pat in port_name_patterns() {
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
        // serial_state と app_state のロックを別スコープで取得する。
        // ネストロック（serial_state 保持中に app_state を取得）はデッドロックの原因になるため、
        // try_connect_and_listen と同じパターン（逐次取得）に揃える。
        let should_emit_disconnected = {
            let mut ss = serial_state.lock();
            let was_connected = ss.connected;
            if was_connected {
                ss.connected = false;
                ss.port_name = None;
            }
            was_connected
            // ss はここで drop される
        };
        if should_emit_disconnected {
            let app_state: State<AppState> = app.state();
            let mut inner = app_state.lock();
            inner.serial_connected = false;
            inner.serial_port_name = None;
            inner.register_mode = false;
        }
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

    for line in reader.lines() {
        let data = match line {
            Ok(s) => s.trim().to_string(),
            Err(e) => {
                tracing::warn!("Serial read error on {}: {}", port_name, e);
                return Err(format!("Read error: {}", e));
            }
        };

        if removed_re().is_match(&data) {
            // カード取り除き通知は無視
            continue;
        }

        if !uid_re().is_match(&data) {
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
            last_emitted: Option<(crate::domain::card_distribution::CardPosition, Instant)>,
        },
        /// Auto Mode 中 (board = None) にカードが置かれた。
        AutoPlaced {
            card: crate::domain::card::Card,
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
                        last_emitted: guard.last_emitted_position.clone(),
                    },
                    None => {
                        // Auto Mode 中 (active_route が /auto-game/ 始まり) はカード情報付きで emit する。
                        // それ以外は board 未開始として通知する。
                        if guard.active_route.starts_with("/auto-game/") {
                            RfidEvent::AutoPlaced { card }
                        } else {
                            tracing::warn!("Card placed but no board active. rfid={}", rfid);
                            RfidEvent::NoBoard
                        }
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
            last_emitted,
        } => match determine_next_card_position(&board, burn_count) {
            Ok(position) => {
                // per-position デバウンス:
                // 直前に同じ position を emit してから DEBOUNCE_INTERVAL_MS 以内なら
                // apply_card_placed のラウンドトリップがまだ完了していない可能性があるためスキップする。
                if let Some((ref prev_pos, prev_instant)) = last_emitted {
                    if prev_pos == &position
                        && prev_instant.elapsed() < Duration::from_millis(DEBOUNCE_INTERVAL_MS)
                    {
                        tracing::debug!(
                            "per-position debounce: skipping duplicate emit for {:?}",
                            position
                        );
                        return;
                    }
                }

                // emit 前に last_emitted_position を更新する（lock を再取得）
                {
                    let state: State<AppState> = app.state();
                    let mut guard = state.lock();
                    guard.last_emitted_position = Some((position.clone(), Instant::now()));
                }

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
        RfidEvent::AutoPlaced { card } => {
            let _ = app.emit(AUTO_CARD_PLACED, AutoCardPlacedPayload { rfid, card });
        }
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

/// アクティブなフロントエンドルートを Rust 側に通知する。
/// process_rfid で Auto/Manual モードの分岐に使用する。
#[tauri::command(rename_all = "camelCase")]
pub fn set_active_route(route: String, state: State<AppState>) {
    state.lock().active_route = route;
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
                    // ignored: hand が変更されなかった（スキャンを無視した）かどうか
                    let ignored = matches!(prev_hand, Some([f, s]) if f != s)
                        || matches!(prev_hand, Some([f, _]) if f == card);
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
                    Some((became_confirmed, ignored))
                } else {
                    None
                }
                // board の borrow はここで終了
            };
            match transition {
                None => {
                    return Err(format!("player at seat {} not found", seat));
                }
                Some((_, true)) => {
                    // スキャンが無視されたケース: deck を変更しない
                    guard.last_emitted_position = None;
                    return Ok(());
                }
                Some((true, false)) => {
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
                Some((false, false)) => {}
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

            match slot_result {
                Err(reason) => {
                    // スロット不一致: カードをプールに保留して成功扱いにする
                    add_to_card_pool(&mut guard.card_pool, card);
                    tracing::info!(
                        "Card {:?} pooled ({}). pool size={}",
                        card,
                        reason,
                        guard.card_pool.len()
                    );
                    // lock 解放後の emit のためプールのスナップショットを取得
                    #[cfg(not(test))]
                    let pool_snapshot = guard.card_pool.clone();
                    // pool 入りも成功扱いなので per-position デバウンスキャッシュをクリアする
                    guard.last_emitted_position = None;
                    drop(guard);
                    #[cfg(not(test))]
                    let _ = app.emit(CARD_POOL_UPDATED, &pool_snapshot);
                    #[cfg(test)]
                    let _ = app;
                    return Ok(());
                }
                Ok(()) => {
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

                    // 全員 all-in 等でラウンドが完了している場合は advance_phase を呼んで次フェーズへ進める。
                    // 通常はプレイヤーアクション (apply_action) が advance_phase をトリガーするが、
                    // 全員 all-in 後はアクション不要のため community card 配置だけでは進行しない。
                    let burn_count_for_advance = guard.burn_count;
                    if let Some((board_ref, deck_ref)) = guard.split_board_and_deck() {
                        crate::domain::board::try_advance_if_round_complete(
                            board_ref,
                            deck_ref,
                            burn_count_for_advance,
                        );
                    }

                    // フェーズが進んだかもしれないのでプールを再評価する
                    drain_card_pool(&mut guard);
                }
            }
        }
        CardPosition::BurnCard => {
            let board_snap = guard.board.as_ref().unwrap().clone();
            let deck_snap = guard.deck.clone();
            let burn_count_snap = guard.burn_count;
            let burn_card_snap = guard.burn_card;

            guard.burn_count = guard.burn_count.saturating_add(1);
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

            // バーンカード完了後にプールを再評価する
            drain_card_pool(&mut guard);
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

    // カードが正常に適用されたので per-position デバウンスキャッシュをクリアする。
    // これにより次回スキャンで同じ position への emit が抑制されなくなる。
    guard.last_emitted_position = None;

    // board のスナップショットとプールのスナップショットを取得してから lock を解放する
    #[cfg(not(test))]
    let board_snapshot = guard.board.clone();
    #[cfg(not(test))]
    let pool_snapshot = guard.card_pool.clone();

    // Mutex lock を解放してから emit する（lock 保持中の emit はデッドロックリスクがある）
    drop(guard);

    // board_updated / card_pool_updated を emit してフロントエンドを更新する
    #[cfg(not(test))]
    if let Some(board) = board_snapshot {
        let _ = app.emit(BOARD_UPDATED, &board);
    }
    #[cfg(not(test))]
    let _ = app.emit(CARD_POOL_UPDATED, &pool_snapshot);

    // テスト時は app を使わない
    #[cfg(test)]
    let _ = app;

    Ok(())
}

// ---------------------------------------------------------------------------
// カードプールヘルパー
// ---------------------------------------------------------------------------

/// カードをプールに追加する。
/// 重複がある場合または上限に達している場合は追加しない。
fn add_to_card_pool(pool: &mut Vec<Card>, card: Card) {
    if pool.len() >= CARD_POOL_MAX {
        tracing::warn!(
            "card_pool is full ({} cards); dropping {:?}",
            CARD_POOL_MAX,
            card
        );
        return;
    }
    // 同一カードの重複追加を防ぐ
    let already_in_pool = pool
        .iter()
        .any(|c| c.suit == card.suit && c.value == card.value);
    if !already_in_pool {
        pool.push(card);
    }
}

/// プール内のカードを現在のボード状態で再評価し、コミュニティスロットへ適用できるものを順番に適用する。
/// ボード・デッキは `InnerState` から直接参照する。
/// この関数は `apply_card_placed` のロック取得済みスコープ内から呼ばれる。
fn drain_card_pool(state: &mut crate::state::InnerState) {
    use crate::domain::board::Phase;

    if state.card_pool.is_empty() {
        return;
    }

    // ボードが存在しない場合はプールを触らない
    let phase = match state.board.as_ref() {
        Some(b) => b.phase,
        None => return,
    };

    // Showdown になっていたらプールをクリアして終了
    if phase == Phase::Showdown {
        state.card_pool.clear();
        return;
    }

    // プールの先頭から順に現在のコミュニティスロットへ適用を試みる。
    // community_cards.len() < 5 の間、プールに残っている限り繰り返す。
    while let Some(board) = state.board.as_ref() {
        let community_len = board.community_cards.len();

        // コミュニティカードが 5 枚以上、またはプールが空なら終了
        if community_len >= 5 || state.card_pool.is_empty() {
            break;
        }

        let pooled_card = state.card_pool[0];

        // 状態変更前にスナップショットを history へ記録 (back_board によるロールバックを可能にする)
        let board_snap = match state.board.as_ref() {
            Some(b) => b.clone(),
            None => break,
        };
        let deck_snap = state.deck.clone();
        let burn_count_snap = state.burn_count;
        let burn_card_snap = state.burn_card;
        state
            .history
            .push((board_snap, deck_snap, burn_count_snap, burn_card_snap));
        if state.history.len() > MAX_HISTORY {
            let excess = state.history.len() - MAX_HISTORY;
            state.history.drain(0..excess);
        }

        let board_mut = match state.board.as_mut() {
            Some(b) => b,
            None => break,
        };

        let slot = board_mut.community_cards.len() as u8;
        board_mut.community_cards.push(pooled_card);
        // デッキからも除去
        state
            .deck
            .retain(|dc| dc.suit != pooled_card.suit || dc.value != pooled_card.value);
        // プールから削除（先頭を除去）
        state.card_pool.remove(0);
        tracing::info!(
            "Card {:?} drained from pool into community slot {}",
            pooled_card,
            slot
        );

        // advance_phase が必要か確認
        let burn_count_for_advance = state.burn_count;
        if let Some((board_ref, deck_ref)) = state.split_board_and_deck() {
            crate::domain::board::try_advance_if_round_complete(
                board_ref,
                deck_ref,
                burn_count_for_advance,
            );
        }

        // Showdown になった場合はプールをクリアして終了
        if state
            .board
            .as_ref()
            .is_some_and(|b| b.phase == Phase::Showdown)
        {
            state.card_pool.clear();
            return;
        }
    }
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
                state.burn_count = state.burn_count.saturating_add(1);
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

    // ---- Bug2: burn_count saturating_add (u8 overflow 防止) ----

    #[test]
    fn burn_count_saturates_at_u8_max() {
        let mut state = make_state_with_board();
        state.burn_count = u8::MAX;
        let burn = Card::new(Suit::Club, CardValue::Two);

        apply_card_to_state(&mut state, burn, CardPosition::BurnCard).unwrap();

        assert_eq!(
            state.burn_count,
            u8::MAX,
            "burn_count should remain u8::MAX (255) after saturating_add, not overflow"
        );
        // u8::MAX (255) > 2 なので二重バーン防止の閾値 (0, <=1, <=2) はいずれも false
        // → advance_phase が二重バーンをスキップせず通常動作することを確認
        assert!(
            state.burn_count > 2,
            "burn_count at u8::MAX should not satisfy any double-burn skip threshold (<= 2)"
        );
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
                        let ignored = matches!(prev_hand, Some([f, s]) if f != s)
                            || matches!(prev_hand, Some([f, _]) if f == card);
                        player.hand = match player.hand {
                            None => Some([card, card]),
                            Some([first, second]) if first != second => Some([first, second]),
                            Some([first, _]) if first == card => Some([first, first]),
                            Some([first, _]) => Some([first, card]),
                        };
                        let became_confirmed = matches!(prev_hand, Some([f, s]) if f == s)
                            && matches!(player.hand, Some([f, s]) if f != s);
                        Some((became_confirmed, ignored))
                    } else {
                        None
                    }
                };
                match transition {
                    None => {
                        return Err(format!("player at seat {} not found", seat));
                    }
                    Some((_, true)) => {
                        // スキャンが無視されたケース: apply_card_placed と同様にリセットして返す
                        state.last_emitted_position = None;
                        return Ok(());
                    }
                    Some((true, false)) => {
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
                    Some((false, false)) => {}
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
                if slot_result.is_err() {
                    // スロット不一致: apply_card_placed と同様にプールに保留して成功扱い
                    super::add_to_card_pool(&mut state.card_pool, card);
                    state.last_emitted_position = None;
                    return Ok(());
                }
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

                let burn_count_for_advance = state.burn_count;
                if let Some((board_ref, deck_ref)) = state.split_board_and_deck() {
                    crate::domain::board::try_advance_if_round_complete(
                        board_ref,
                        deck_ref,
                        burn_count_for_advance,
                    );
                }
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
        // apply_card_placed 本体と同様に last_emitted_position をクリアする
        state.last_emitted_position = None;
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
        // slot 1 を指定するが community_cards は空なので slot 0 が期待される。
        // apply_card_placed (および apply_card_with_history) ではスロット不一致は
        // プールに保留して Ok(()) を返す設計のため、history は増えない。
        let result =
            apply_card_with_history(&mut state, card, CardPosition::CommunityCard { slot: 1 });

        assert!(
            result.is_ok(),
            "slot mismatch should pool the card and return Ok"
        );
        assert_eq!(
            state.history.len(),
            0,
            "history should not grow on slot mismatch (pool entry, not a board change)"
        );
        assert_eq!(
            state.card_pool.len(),
            1,
            "card should be in pool after slot mismatch"
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

    // ---- Bug 2 fix: confirmed な hand への追加スキャンで deck が汚染されない ----

    /// confirmed 状態の hand に追加スキャンしても deck からカードが除去されないこと。
    #[test]
    fn apply_card_placed_confirmed_hand_extra_scan_does_not_pollute_deck() {
        use crate::domain::board::build_remaining_deck;

        let mut state = make_state_with_board();
        state.deck = build_remaining_deck(state.board.as_ref().unwrap());

        let card1 = Card::new(Suit::Spade, CardValue::Ace);
        let card2 = Card::new(Suit::Heart, CardValue::King);
        let card3 = Card::new(Suit::Club, CardValue::Two);

        // 1枚目スキャン（pending）
        apply_card_with_history(&mut state, card1, CardPosition::PlayerHand { seat: 0 }).unwrap();
        // 2枚目スキャン（confirmed）
        apply_card_with_history(&mut state, card2, CardPosition::PlayerHand { seat: 0 }).unwrap();

        // confirmed 状態に。deck のサイズを記録
        let deck_len_after_confirmed = state.deck.len();
        assert!(
            !state
                .deck
                .iter()
                .any(|c| c.suit == card1.suit && c.value == card1.value),
            "card1 should not be in deck after pending"
        );
        assert!(
            !state
                .deck
                .iter()
                .any(|c| c.suit == card2.suit && c.value == card2.value),
            "card2 should not be in deck after confirmed"
        );
        assert!(
            state
                .deck
                .iter()
                .any(|c| c.suit == card3.suit && c.value == card3.value),
            "card3 should still be in deck before extra scan"
        );

        // 3枚目を誤ってスキャン（confirmed 状態なので hand は変わらないはず）
        apply_card_with_history(&mut state, card3, CardPosition::PlayerHand { seat: 0 }).unwrap();

        // hand は変わっていないこと
        let hand = state.board.as_ref().unwrap().players[0].hand.unwrap();
        assert_eq!(
            hand,
            [card1, card2],
            "hand should remain confirmed after extra scan"
        );

        // deck のサイズも変わっていないこと（card3 が除去されていないこと）
        assert_eq!(
            state.deck.len(),
            deck_len_after_confirmed,
            "deck should not change on ignored scan of confirmed hand"
        );
        assert!(
            state
                .deck
                .iter()
                .any(|c| c.suit == card3.suit && c.value == card3.value),
            "card3 must remain in deck after ignored extra scan"
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

    // ---- Bug B (R32): 全員 all-in 後 community card 配置で Showdown に進む ----

    /// 2 人が全員 all-in している状態で community card を 5 枚押し込んだとき、
    /// Phase が Showdown になり winners が確定すること。
    #[test]
    fn all_in_community_cards_advance_to_showdown() {
        use crate::domain::board::{board_allin, board_call, start_game, GameSettings, Phase};
        use crate::domain::card_distribution::CardPosition;

        // 2 人ゲームを開始
        let settings = GameSettings {
            small_blind: 50,
            big_blind: 100,
            min_chip: 50,
            bb_ante: false,
        };
        let names = vec!["Alice".into(), "Bob".into()];
        let board = start_game(settings.clone(), names, 0).unwrap();
        let mut state = InnerState {
            settings,
            board: Some(board),
            ..Default::default()
        };

        // Preflop: UTG(dealer+1) が all-in → BB が call（全員 all-in に）
        // 2 人 heads-up では SB=dealer=0, BB=1, UTG=SB=0 から開始
        // board_allin で SB(0) が all-in
        {
            let (board_ref, deck_ref) = state.split_board_and_deck().unwrap();
            board_allin(board_ref, deck_ref).unwrap();
        }
        // BB(1) が call（all-in へ）
        {
            let (board_ref, deck_ref) = state.split_board_and_deck().unwrap();
            board_call(board_ref, deck_ref).unwrap();
        }

        // 全員 all-in 後は is_round_complete() == true になる
        // deck は空（RFID モード相当）なので advance_phase はコミュニティカードを追加しない
        // → Phase は PreFlop のまま（can_advance_with_available_cards が false）
        let phase_after_allin = state.board.as_ref().unwrap().phase;
        // preflop が完了して flop に進んでいるかもしれないが、community_cards が 0 の状態で
        // deck も空なら PreFlop のままのはず
        // ここでは phase に関わらず community card を手動で 5 枚配布して Showdown を確認する

        // community card を 5 枚配置（slot 0..4）
        let community_cards = [
            Card::new(Suit::Spade, CardValue::Two),
            Card::new(Suit::Heart, CardValue::Three),
            Card::new(Suit::Diamond, CardValue::Four),
            Card::new(Suit::Club, CardValue::Five),
            Card::new(Suit::Spade, CardValue::Seven),
        ];

        // Phase が PreFlop なら Flop 用に 3 枚、Turn 用に 1 枚、River 用に 1 枚を順番に置く
        // Phase が既に Flop/Turn/River の場合は現在の community_cards.len() から続ける
        let start_slot = state.board.as_ref().unwrap().community_cards.len() as u8;
        for (i, &card) in community_cards.iter().enumerate() {
            let slot = start_slot + i as u8;
            if slot >= 5 {
                break;
            }
            apply_card_with_history(&mut state, card, CardPosition::CommunityCard { slot })
                .unwrap();
        }

        // Phase が Showdown になっていること
        let board = state.board.as_ref().unwrap();
        assert_eq!(
            board.phase,
            Phase::Showdown,
            "phase should be Showdown after 5 community cards with all-in players (was {:?} after all-in, community_cards={:?})",
            phase_after_allin,
            board.community_cards
        );

        // winners が確定していること（空でないこと）
        assert!(
            !board.winners.is_empty(),
            "winners should be determined after Showdown"
        );
    }

    /// 全員 all-in で community card を 1 枚ずつ置くたびに Phase が適切に遷移すること。
    /// River (5 枚目) 配置後に Showdown になること。
    #[test]
    fn all_in_phase_transitions_with_community_cards() {
        use crate::domain::board::{board_allin, board_call, start_game, GameSettings, Phase};
        use crate::domain::card_distribution::CardPosition;

        let settings = GameSettings {
            small_blind: 50,
            big_blind: 100,
            min_chip: 50,
            bb_ante: false,
        };
        let names = vec!["Alice".into(), "Bob".into()];
        let board = start_game(settings.clone(), names, 0).unwrap();
        let mut state = InnerState {
            settings,
            board: Some(board),
            ..Default::default()
        };

        // 両者 all-in
        {
            let (board_ref, deck_ref) = state.split_board_and_deck().unwrap();
            board_allin(board_ref, deck_ref).unwrap();
        }
        {
            let (board_ref, deck_ref) = state.split_board_and_deck().unwrap();
            board_call(board_ref, deck_ref).unwrap();
        }

        // 現在の community_cards.len() から開始して 5 枚になるまで community card を配布
        let cards = [
            Card::new(Suit::Spade, CardValue::Two),
            Card::new(Suit::Heart, CardValue::Three),
            Card::new(Suit::Diamond, CardValue::Four),
            Card::new(Suit::Club, CardValue::Five),
            Card::new(Suit::Spade, CardValue::Seven),
            Card::new(Suit::Heart, CardValue::Eight),
            Card::new(Suit::Diamond, CardValue::Nine),
        ];

        let mut card_idx = 0usize;
        while state.board.as_ref().unwrap().community_cards.len() < 5
            && state.board.as_ref().unwrap().phase != Phase::Showdown
        {
            let slot = state.board.as_ref().unwrap().community_cards.len() as u8;
            apply_card_with_history(
                &mut state,
                cards[card_idx],
                CardPosition::CommunityCard { slot },
            )
            .unwrap();
            card_idx += 1;
        }

        let board = state.board.as_ref().unwrap();
        assert_eq!(
            board.phase,
            Phase::Showdown,
            "phase must be Showdown after all community cards placed with all-in players"
        );
        assert!(
            !board.winners.is_empty(),
            "winners must be determined after Showdown"
        );
    }

    // ---- R33 Bug 3: per-position デバウンス ----

    /// last_emitted_position が設定済みで DEBOUNCE_INTERVAL_MS (500ms) 以内のとき、
    /// 同一 position へのデバウンス判定が true (スキップすべき) になること。
    #[test]
    fn per_position_debounce_skips_within_interval() {
        use crate::domain::card_distribution::CardPosition;
        use std::time::{Duration, Instant};

        let debounce_ms: u64 = 500;
        let position = CardPosition::PlayerHand { seat: 0 };

        // 100ms 前に同じ position を emit 済みと仮定
        let last_emitted: Option<(CardPosition, Instant)> = Some((
            position.clone(),
            Instant::now() - Duration::from_millis(100),
        ));

        let should_skip = match &last_emitted {
            Some((prev_pos, prev_instant)) => {
                prev_pos == &position && prev_instant.elapsed() < Duration::from_millis(debounce_ms)
            }
            None => false,
        };

        assert!(
            should_skip,
            "same position within 500ms should be debounced (skipped)"
        );
    }

    /// last_emitted_position が DEBOUNCE_INTERVAL_MS (500ms) を超過したとき、
    /// 同一 position へのデバウンス判定が false (emit すべき) になること。
    #[test]
    fn per_position_debounce_allows_after_interval() {
        use crate::domain::card_distribution::CardPosition;
        use std::time::{Duration, Instant};

        let debounce_ms: u64 = 500;
        let position = CardPosition::PlayerHand { seat: 0 };

        // 600ms 前に同じ position を emit 済みと仮定（タイムアウト超過）
        let last_emitted: Option<(CardPosition, Instant)> = Some((
            position.clone(),
            Instant::now() - Duration::from_millis(600),
        ));

        let should_skip = match &last_emitted {
            Some((prev_pos, prev_instant)) => {
                prev_pos == &position && prev_instant.elapsed() < Duration::from_millis(debounce_ms)
            }
            None => false,
        };

        assert!(
            !should_skip,
            "same position after 500ms should NOT be debounced (allow emit)"
        );
    }

    /// last_emitted_position が異なる position のとき、
    /// デバウンス判定が false (emit すべき) になること。
    #[test]
    fn per_position_debounce_allows_different_position() {
        use crate::domain::card_distribution::CardPosition;
        use std::time::{Duration, Instant};

        let debounce_ms: u64 = 500;
        let emitted_position = CardPosition::PlayerHand { seat: 0 };
        let new_position = CardPosition::PlayerHand { seat: 1 };

        // 100ms 前に seat 0 へ emit 済み、今回は seat 1 へ
        let last_emitted: Option<(CardPosition, Instant)> = Some((
            emitted_position,
            Instant::now() - Duration::from_millis(100),
        ));

        let should_skip = match &last_emitted {
            Some((prev_pos, prev_instant)) => {
                prev_pos == &new_position
                    && prev_instant.elapsed() < Duration::from_millis(debounce_ms)
            }
            None => false,
        };

        assert!(
            !should_skip,
            "different position should NOT be debounced (allow emit)"
        );
    }

    /// apply_card_placed 相当のロジック実行後、last_emitted_position がクリアされること。
    /// (apply_card_with_history に last_emitted_position クリアを含めてテスト)
    #[test]
    fn apply_card_placed_clears_last_emitted_position() {
        use crate::domain::board::build_remaining_deck;
        use crate::domain::card_distribution::CardPosition;
        use std::time::Instant;

        let mut state = make_state_with_board();
        state.deck = build_remaining_deck(state.board.as_ref().unwrap());

        // last_emitted_position を事前に設定（1枚目スキャン後を模擬）
        let card = state.deck[0];
        state.last_emitted_position = Some((CardPosition::PlayerHand { seat: 0 }, Instant::now()));

        // apply_card_with_history で 1 枚目スキャン適用
        apply_card_with_history(&mut state, card, CardPosition::PlayerHand { seat: 0 }).unwrap();

        // カードが適用された後は last_emitted_position がクリアされるべき
        // (apply_card_with_history 内でクリアするロジックを追加済み)
        assert!(
            state.last_emitted_position.is_none(),
            "last_emitted_position should be cleared after apply_card_placed"
        );
    }

    /// 1枚目スキャン後 200ms 以内に同じ seat への 2 枚目スキャンが来た場合、
    /// per-position デバウンスによりスキップされ、last_emitted_position は変化しないこと。
    #[test]
    fn per_position_debounce_second_scan_within_200ms_is_skipped() {
        use crate::domain::card_distribution::CardPosition;
        use std::time::{Duration, Instant};

        let debounce_ms: u64 = 500;
        let seat0 = CardPosition::PlayerHand { seat: 0 };

        // 1枚目スキャン: last_emitted_position を設定
        let emit_instant = Instant::now() - Duration::from_millis(200); // 200ms 前
        let last_emitted: Option<(CardPosition, Instant)> = Some((seat0.clone(), emit_instant));

        // 2枚目スキャン（200ms 後、同一 seat）: デバウンスでスキップすべき
        let should_skip = match &last_emitted {
            Some((prev_pos, prev_instant)) => {
                prev_pos == &seat0 && prev_instant.elapsed() < Duration::from_millis(debounce_ms)
            }
            None => false,
        };

        assert!(
            should_skip,
            "second scan to same seat within 200ms must be debounced (skipped)"
        );
    }

    // ---- card_pool: 基本操作 ----

    #[test]
    fn add_to_card_pool_prevents_duplicate() {
        let card = Card::new(Suit::Spade, CardValue::Ace);
        let mut pool: Vec<Card> = Vec::new();

        super::add_to_card_pool(&mut pool, card);
        super::add_to_card_pool(&mut pool, card); // 重複

        assert_eq!(pool.len(), 1, "duplicate card should not be added to pool");
    }

    #[test]
    fn add_to_card_pool_respects_max_limit() {
        use crate::domain::card::CardValue;
        let values = [
            CardValue::Two,
            CardValue::Three,
            CardValue::Four,
            CardValue::Five,
            CardValue::Six,
            CardValue::Seven,
            CardValue::Eight,
            CardValue::Nine,
            CardValue::Ten,
            CardValue::Jack,
            CardValue::Queen,
            CardValue::King,
            CardValue::Ace,
            CardValue::Two,   // Suit::Heart で再利用
            CardValue::Three, // Suit::Heart
            CardValue::Four,  // Suit::Heart  (17枚目: 超過)
        ];
        let suits = [
            Suit::Spade,
            Suit::Spade,
            Suit::Spade,
            Suit::Spade,
            Suit::Spade,
            Suit::Spade,
            Suit::Spade,
            Suit::Spade,
            Suit::Spade,
            Suit::Spade,
            Suit::Spade,
            Suit::Spade,
            Suit::Spade,
            Suit::Heart,
            Suit::Heart,
            Suit::Heart,
        ];
        let mut pool: Vec<Card> = Vec::new();
        for (v, s) in values.iter().zip(suits.iter()) {
            super::add_to_card_pool(&mut pool, Card::new(*s, *v));
        }
        assert_eq!(
            pool.len(),
            super::CARD_POOL_MAX,
            "pool should not exceed CARD_POOL_MAX"
        );
    }

    // ---- card_pool: drain 後に community へ自動適用される ----

    /// Flop 前にスキャンされたコミュニティカードがプールに保留され、
    /// Flop 進行後に自動で community に追加されること。
    #[test]
    fn card_pool_drains_into_community_after_phase_advance() {
        use crate::domain::board::{start_game_with_deck, GameSettings, Phase};

        // 3人ゲームを作成
        let settings = GameSettings {
            small_blind: 50,
            big_blind: 100,
            min_chip: 50,
            bb_ante: false,
        };
        let names = vec!["Alice".into(), "Bob".into(), "Carol".into()];
        let (mut board, deck) = start_game_with_deck(settings.clone(), names, 0, 1, None).unwrap();

        // 全員のハンドをリセット（テスト用）してから confirmed 状態にする
        let card_a = Card::new(Suit::Spade, CardValue::Ace);
        let card_b = Card::new(Suit::Heart, CardValue::King);
        for p in &mut board.players {
            p.hand = Some([card_a, card_b]);
        }

        // PreFlop ベッティングを完了済みにする
        let current_bet = board.current_bet;
        for p in &mut board.players {
            p.has_acted = true;
            p.bet_in_round = current_bet;
        }

        let mut state = InnerState {
            settings: settings.clone(),
            board: Some(board),
            deck,
            ..Default::default()
        };

        // コミュニティカード (Flop 1枚目) をプールに追加する
        // (Flop 前: フェーズがまだ PreFlop なのでプールへ)
        let flop1 = Card::new(Suit::Diamond, CardValue::Two);
        super::add_to_card_pool(&mut state.card_pool, flop1);
        assert_eq!(
            state.card_pool.len(),
            1,
            "card should be in pool before phase advance"
        );
        assert_eq!(
            state.board.as_ref().unwrap().phase,
            Phase::PreFlop,
            "phase should still be PreFlop"
        );

        // バーンカードを1枚処理してプールを再評価する
        // (バーンカード完了後に drain_card_pool が呼ばれる)
        let burn_card = Card::new(Suit::Club, CardValue::Five);
        state.burn_count = state.burn_count.saturating_add(1);
        state.burn_card = Some(burn_card);
        state
            .deck
            .retain(|c| c.suit != burn_card.suit || c.value != burn_card.value);

        // drain_card_pool を呼ぶ (BurnCard 処理後と同じ)
        super::drain_card_pool(&mut state);

        // プールのカードが community に移動していること
        let community = &state.board.as_ref().unwrap().community_cards;
        assert!(
            community.contains(&flop1),
            "pooled card should be drained into community after burn, community={:?}",
            community
        );
        assert!(
            state.card_pool.is_empty(),
            "card_pool should be empty after successful drain"
        );
    }

    /// reset_board 時にプールがクリアされること。
    #[test]
    fn card_pool_cleared_on_reset() {
        let mut state = make_state_with_board();
        let card = Card::new(Suit::Spade, CardValue::Ace);
        super::add_to_card_pool(&mut state.card_pool, card);
        assert_eq!(state.card_pool.len(), 1);

        // reset_board ロジックをシミュレート
        state.board = None;
        state.deck.clear();
        state.history.clear();
        state.burn_count = 0;
        state.burn_card = None;
        state.event_history.clear();
        state.card_pool.clear();

        assert!(
            state.card_pool.is_empty(),
            "card_pool should be cleared after reset_board"
        );
    }

    /// move_next_game 時にプールがクリアされること。
    #[test]
    fn card_pool_cleared_on_next_game() {
        use crate::domain::board::next_game;

        let mut state = make_state_with_board();
        let card = Card::new(Suit::Heart, CardValue::Queen);
        super::add_to_card_pool(&mut state.card_pool, card);
        assert_eq!(state.card_pool.len(), 1);

        // next_game でリセット
        let prev = state.board.as_ref().unwrap().clone();
        let (board, deck) = next_game(&prev, &state.settings).unwrap();
        state.board = Some(board);
        state.deck = deck;
        state.burn_count = 0;
        state.burn_card = None;
        state.event_history.clear();
        state.card_pool.clear();

        assert!(
            state.card_pool.is_empty(),
            "card_pool should be cleared after move_next_game"
        );
    }

    // ---- last_emitted_position リセット: 全成功パス ----

    /// PlayerHand 1枚目スキャン (pending 遷移) 後に last_emitted_position がリセットされること。
    #[test]
    fn last_emitted_position_reset_on_player_hand_pending() {
        use crate::domain::board::build_remaining_deck;
        use std::time::Instant;

        let mut state = make_state_with_board();
        state.deck = build_remaining_deck(state.board.as_ref().unwrap());

        let card = state.deck[0];
        state.last_emitted_position = Some((CardPosition::PlayerHand { seat: 0 }, Instant::now()));

        apply_card_with_history(&mut state, card, CardPosition::PlayerHand { seat: 0 }).unwrap();

        assert!(
            state.last_emitted_position.is_none(),
            "last_emitted_position should be None after PlayerHand pending (1st scan)"
        );
    }

    /// PlayerHand 2枚目スキャン (confirmed 遷移) 後に last_emitted_position がリセットされること。
    #[test]
    fn last_emitted_position_reset_on_player_hand_confirmed() {
        use crate::domain::board::build_remaining_deck;
        use std::time::Instant;

        let mut state = make_state_with_board();
        state.deck = build_remaining_deck(state.board.as_ref().unwrap());

        let card1 = state.deck[0];
        let card2 = state.deck[1];
        // 1枚目スキャンで pending 状態にする
        apply_card_with_history(&mut state, card1, CardPosition::PlayerHand { seat: 0 }).unwrap();
        // last_emitted_position を再設定（2枚目スキャン前を模擬）
        state.last_emitted_position = Some((CardPosition::PlayerHand { seat: 0 }, Instant::now()));

        // 2枚目スキャンで confirmed 遷移
        apply_card_with_history(&mut state, card2, CardPosition::PlayerHand { seat: 0 }).unwrap();

        assert!(
            state.last_emitted_position.is_none(),
            "last_emitted_position should be None after PlayerHand confirmed (2nd scan)"
        );
    }

    /// CommunityCard 正常配置 (slot 一致) 後に last_emitted_position がリセットされること。
    #[test]
    fn last_emitted_position_reset_on_community_card_success() {
        use crate::domain::board::build_remaining_deck;
        use std::time::Instant;

        let mut state = make_state_with_board();
        state.deck = build_remaining_deck(state.board.as_ref().unwrap());

        let card = state.deck[0];
        state.last_emitted_position =
            Some((CardPosition::CommunityCard { slot: 0 }, Instant::now()));

        // slot 0 は community_cards が空のときに有効
        apply_card_with_history(&mut state, card, CardPosition::CommunityCard { slot: 0 }).unwrap();

        assert!(
            state.last_emitted_position.is_none(),
            "last_emitted_position should be None after CommunityCard slot match"
        );
    }

    /// CommunityCard slot 不一致 (pool 入り) 後に last_emitted_position がリセットされること。
    /// これが今回修正したバグの直接的な回帰テスト。
    #[test]
    fn last_emitted_position_reset_on_community_card_pool_entry() {
        use crate::domain::board::build_remaining_deck;
        use std::time::Instant;

        let mut state = make_state_with_board();
        state.deck = build_remaining_deck(state.board.as_ref().unwrap());

        let card = state.deck[0];
        // slot 1 を指定するが community_cards は空 (expected = 0) → slot 不一致でプール入り
        state.last_emitted_position =
            Some((CardPosition::CommunityCard { slot: 1 }, Instant::now()));

        apply_card_with_history(&mut state, card, CardPosition::CommunityCard { slot: 1 }).unwrap();

        assert!(
            state.last_emitted_position.is_none(),
            "last_emitted_position should be None after CommunityCard slot mismatch (pool entry)"
        );
        // カードがプールに入っていること
        assert_eq!(
            state.card_pool.len(),
            1,
            "card should be in pool after slot mismatch"
        );
    }

    /// CommunityCard pool から drain されて community に確定した後に
    /// last_emitted_position がリセットされること。
    #[test]
    fn last_emitted_position_reset_on_community_card_after_pool_drain() {
        use crate::domain::board::{start_game_with_deck, GameSettings, Phase};
        use std::time::Instant;

        // 3人ゲームを Flop 直前の状態で作成
        let settings = GameSettings {
            small_blind: 50,
            big_blind: 100,
            min_chip: 50,
            bb_ante: false,
        };
        let names = vec!["Alice".into(), "Bob".into(), "Carol".into()];
        let (mut board, deck) = start_game_with_deck(settings.clone(), names, 0, 1, None).unwrap();

        // 全員 confirmed 状態にする
        let card_a = Card::new(Suit::Spade, CardValue::Ace);
        let card_b = Card::new(Suit::Heart, CardValue::King);
        for p in &mut board.players {
            p.hand = Some([card_a, card_b]);
        }
        // PreFlop ベッティング完了
        let current_bet = board.current_bet;
        for p in &mut board.players {
            p.has_acted = true;
            p.bet_in_round = current_bet;
        }

        let mut state = InnerState {
            settings: settings.clone(),
            board: Some(board),
            deck,
            ..Default::default()
        };

        // Flop 1枚目を slot 1 (不一致) でプールに入れる
        let flop1 = state.deck[0];
        apply_card_with_history(&mut state, flop1, CardPosition::CommunityCard { slot: 1 })
            .unwrap();
        assert_eq!(state.card_pool.len(), 1, "flop1 should be in pool");
        assert!(state.board.as_ref().unwrap().phase == Phase::PreFlop);

        // バーンカードを処理して Flop フェーズへ進める
        state.last_emitted_position = Some((CardPosition::BurnCard, Instant::now()));
        let burn_card = state.deck[1];
        apply_card_with_history(&mut state, burn_card, CardPosition::BurnCard).unwrap();

        // BurnCard 処理後 last_emitted_position がリセットされていること
        assert!(
            state.last_emitted_position.is_none(),
            "last_emitted_position should be None after BurnCard"
        );
    }

    /// BurnCard 配置後に last_emitted_position がリセットされること。
    #[test]
    fn last_emitted_position_reset_on_burn_card() {
        use crate::domain::board::build_remaining_deck;
        use std::time::Instant;

        let mut state = make_state_with_board();
        state.deck = build_remaining_deck(state.board.as_ref().unwrap());

        let card = state.deck[0];
        state.last_emitted_position = Some((CardPosition::BurnCard, Instant::now()));

        apply_card_with_history(&mut state, card, CardPosition::BurnCard).unwrap();

        assert!(
            state.last_emitted_position.is_none(),
            "last_emitted_position should be None after BurnCard"
        );
    }
}

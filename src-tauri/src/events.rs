//! Tauri イベント名の定数。

pub const BOARD_UPDATED: &str = "board_updated";
pub const TELOP_UPDATED: &str = "telop_updated";
pub const DECK_UPDATED: &str = "deck_updated";

/// RFID 登録済みカードが置かれたとき (ゲーム中)。
pub const CARD_PLACED: &str = "card_placed";
/// RFID デッキ未登録のカードが置かれたとき。
pub const CARD_PLACED_UNREGISTERED: &str = "card_placed_unregistered";
/// 登録モード中にカードが置かれたとき。
pub const CARD_PLACED_REGISTER: &str = "card_placed_register";
/// ゲーム未開始時にカードが置かれたとき。
pub const CARD_PLACED_NO_BOARD: &str = "card_placed_no_board";
/// シリアル接続状態が変わったとき。
pub const SERIAL_STATUS_UPDATED: &str = "serial_status_updated";
/// テロップ ID が変わったとき。
pub const TELOP_ID_UPDATED: &str = "telop_id_updated";
/// テロップ背景色が変わったとき。
pub const TELOP_BACKGROUND_COLOR_UPDATED: &str = "telop_background_color_updated";
/// テロップ現在画面状態が変わったとき。
pub const TELOP_CURRENT_SCREEN_UPDATED: &str = "telop_current_screen_updated";
/// ゲーム開始時の初期ボードスナップショットが更新されたとき。
pub const INITIAL_BOARD_UPDATED: &str = "initial_board_updated";

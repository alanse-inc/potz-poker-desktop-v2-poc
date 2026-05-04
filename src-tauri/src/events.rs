//! Tauri イベント名の定数。

pub const BOARD_UPDATED: &str = "board_updated";
pub const TELOP_UPDATED: &str = "telop_updated";

/// RFID 登録済みカードが置かれたとき (ゲーム中)。
pub const CARD_PLACED: &str = "card_placed";
/// RFID デッキ未登録のカードが置かれたとき。
pub const CARD_PLACED_UNREGISTERED: &str = "card_placed_unregistered";
/// 登録モード中にカードが置かれたとき。
pub const CARD_PLACED_REGISTER: &str = "card_placed_register";
/// シリアル接続状態が変わったとき。
pub const SERIAL_STATUS_UPDATED: &str = "serial_status_updated";

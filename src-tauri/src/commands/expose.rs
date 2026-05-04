//! Expose コマンド: preflop でバーンカードと差し替えてコミュニティカードへ公開する。

use crate::domain::card::Card;
use crate::state::AppState;
use tauri::State;

/// Expose コマンド。
/// フロントエンドからカードを受け取り、直近のバーンカードと差し替えて
/// コミュニティカードへ追加する。
#[tauri::command(rename_all = "camelCase")]
pub fn expose(expose_card: Card, state: State<AppState>) -> Result<Card, String> {
    let mut guard = state.lock();
    let burn_card = guard
        .burn_card
        .ok_or_else(|| "no burn card".to_string())?;
    let board = guard
        .board
        .as_mut()
        .ok_or_else(|| "no board".to_string())?;
    crate::domain::board::board_expose(board, expose_card, burn_card)
        .map_err(|e| e.to_string())
}

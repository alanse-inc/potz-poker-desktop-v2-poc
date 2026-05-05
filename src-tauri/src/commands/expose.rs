//! Expose コマンド: preflop でバーンカードと差し替えてコミュニティカードへ公開する。

use crate::domain::board::TexasHoldemBoard;
use crate::domain::card::Card;
use crate::events::BOARD_UPDATED;
use crate::state::AppState;
use tauri::{AppHandle, Emitter, State};

/// Expose コマンド。
/// フロントエンドからカードを受け取り、直近のバーンカードと差し替えて
/// コミュニティカードへ追加する。
#[tauri::command(rename_all = "camelCase")]
pub fn expose(app: AppHandle, expose_card: Card, state: State<AppState>) -> Result<Card, String> {
    let (burn_card, board_snapshot): (Card, TexasHoldemBoard) = {
        let mut guard = state.lock();
        let burn_card = guard
            .burn_card
            .ok_or_else(|| "no burn card".to_string())?;
        let board = guard
            .board
            .as_mut()
            .ok_or_else(|| "no board".to_string())?;
        crate::domain::board::board_expose(board, expose_card, burn_card)
            .map_err(|e| e.to_string())?;
        (burn_card, board.clone())
    }; // lock を解放してから emit

    let _ = app.emit(BOARD_UPDATED, &board_snapshot);
    Ok(burn_card)
}

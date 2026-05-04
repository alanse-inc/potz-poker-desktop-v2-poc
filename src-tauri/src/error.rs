//! アプリケーション共通エラー型。

use thiserror::Error;

#[derive(Debug, Error)]
pub enum BoardError {
    #[error("invalid action: {0}")]
    InvalidAction(String),

    #[error("game not started")]
    GameNotStarted,

    #[error("no history to go back")]
    NoHistory,

    #[error("store error: {0}")]
    Store(String),
}

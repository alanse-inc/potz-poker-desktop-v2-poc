//! ゲーム設定の読み書き commands。tauri-plugin-store を使う。

use crate::domain::board::GameSettings;
use crate::state::AppState;
use tauri::{AppHandle, State};
use tauri_plugin_store::StoreExt;

const STORE_PATH: &str = "settings.json";
const KEY_SMALL_BLIND: &str = "smallBlind";
const KEY_BIG_BLIND: &str = "bigBlind";
const KEY_MIN_CHIP: &str = "minChip";
const KEY_BB_ANTE: &str = "bbAnte";

#[tauri::command]
pub fn load_game_settings(
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<GameSettings, String> {
    let store = app.store(STORE_PATH).map_err(|e| e.to_string())?;

    let sb = store
        .get(KEY_SMALL_BLIND)
        .and_then(|v| v.as_u64())
        .map(|v| v as u32)
        .unwrap_or(100);
    let bb = store
        .get(KEY_BIG_BLIND)
        .and_then(|v| v.as_u64())
        .map(|v| v as u32)
        .unwrap_or(200);
    let min_chip = store
        .get(KEY_MIN_CHIP)
        .and_then(|v| v.as_u64())
        .map(|v| v as u32)
        .unwrap_or(100);
    let bb_ante = store
        .get(KEY_BB_ANTE)
        .and_then(|v| v.as_bool())
        .unwrap_or(false);

    let settings = GameSettings {
        small_blind: sb,
        big_blind: bb,
        min_chip,
        bb_ante,
    };

    state.lock().settings = settings.clone();
    Ok(settings)
}

#[tauri::command]
pub fn save_game_settings(
    app: AppHandle,
    state: State<'_, AppState>,
    settings: GameSettings,
) -> Result<(), String> {
    let store = app.store(STORE_PATH).map_err(|e| e.to_string())?;

    store.set(KEY_SMALL_BLIND, serde_json::json!(settings.small_blind));
    store.set(KEY_BIG_BLIND, serde_json::json!(settings.big_blind));
    store.set(KEY_MIN_CHIP, serde_json::json!(settings.min_chip));
    store.set(KEY_BB_ANTE, serde_json::json!(settings.bb_ante));
    store.save().map_err(|e| e.to_string())?;

    state.lock().settings = settings;
    Ok(())
}

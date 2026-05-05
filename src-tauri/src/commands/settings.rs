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

/// 読み込んだ設定値を正規化する。
/// - sb < 1 なら 100
/// - bb < 1 なら 200
/// - bb < sb なら sb * 2
/// - min_chip < 1 なら sb
pub fn sanitize_settings(sb: u32, bb: u32, min_chip: u32, bb_ante: bool) -> GameSettings {
    let sb = if sb < 1 { 100 } else { sb };
    let bb = if bb < 1 {
        200
    } else if bb < sb {
        sb * 2
    } else {
        bb
    };
    let min_chip = if min_chip < 1 { sb } else { min_chip };
    GameSettings {
        small_blind: sb,
        big_blind: bb,
        min_chip,
        bb_ante,
    }
}

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

    let settings = sanitize_settings(sb, bb, min_chip, bb_ante);

    state.lock().settings = settings.clone();
    Ok(settings)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn load_game_settings_normalizes_zero_small_blind() {
        let s = sanitize_settings(0, 200, 100, false);
        assert_eq!(s.small_blind, 100);
        assert_eq!(s.big_blind, 200);
        assert_eq!(s.min_chip, 100);
    }

    #[test]
    fn load_game_settings_normalizes_zero_big_blind() {
        let s = sanitize_settings(100, 0, 100, false);
        assert_eq!(s.small_blind, 100);
        assert_eq!(s.big_blind, 200);
    }

    #[test]
    fn load_game_settings_normalizes_bb_less_than_sb() {
        let s = sanitize_settings(200, 100, 50, false);
        assert_eq!(s.small_blind, 200);
        assert_eq!(s.big_blind, 400); // sb * 2
    }

    #[test]
    fn load_game_settings_normalizes_zero_min_chip() {
        let s = sanitize_settings(100, 200, 0, false);
        assert_eq!(s.min_chip, 100); // sb
    }

    #[test]
    fn load_game_settings_valid_values_unchanged() {
        let s = sanitize_settings(50, 100, 25, true);
        assert_eq!(s.small_blind, 50);
        assert_eq!(s.big_blind, 100);
        assert_eq!(s.min_chip, 25);
        assert!(s.bb_ante);
    }

    fn make_settings(sb: u32, bb: u32, min_chip: u32) -> GameSettings {
        GameSettings {
            small_blind: sb,
            big_blind: bb,
            min_chip,
            bb_ante: false,
        }
    }

    #[test]
    fn validate_settings_rejects_zero_small_blind() {
        assert!(validate_settings(&make_settings(0, 200, 100)).is_err());
    }

    #[test]
    fn validate_settings_rejects_zero_big_blind() {
        assert!(validate_settings(&make_settings(100, 0, 100)).is_err());
    }

    #[test]
    fn validate_settings_rejects_bb_less_than_sb() {
        assert!(validate_settings(&make_settings(200, 100, 100)).is_err());
    }

    #[test]
    fn validate_settings_rejects_zero_min_chip() {
        assert!(validate_settings(&make_settings(100, 200, 0)).is_err());
    }

    #[test]
    fn validate_settings_accepts_valid_input() {
        assert!(validate_settings(&make_settings(100, 200, 100)).is_ok());
    }
}

fn validate_settings(settings: &GameSettings) -> Result<(), String> {
    if settings.small_blind < 1 {
        return Err("invalid settings: small_blind must be >= 1".to_string());
    }
    if settings.big_blind < 1 {
        return Err("invalid settings: big_blind must be >= 1".to_string());
    }
    if settings.big_blind < settings.small_blind {
        return Err("invalid settings: big_blind must be >= small_blind".to_string());
    }
    if settings.min_chip < 1 {
        return Err("invalid settings: min_chip must be >= 1".to_string());
    }
    Ok(())
}

#[tauri::command]
pub fn save_game_settings(
    app: AppHandle,
    state: State<'_, AppState>,
    settings: GameSettings,
) -> Result<(), String> {
    validate_settings(&settings)?;
    let store = app.store(STORE_PATH).map_err(|e| e.to_string())?;

    store.set(KEY_SMALL_BLIND, serde_json::json!(settings.small_blind));
    store.set(KEY_BIG_BLIND, serde_json::json!(settings.big_blind));
    store.set(KEY_MIN_CHIP, serde_json::json!(settings.min_chip));
    store.set(KEY_BB_ANTE, serde_json::json!(settings.bb_ante));
    store.save().map_err(|e| e.to_string())?;

    state.lock().settings = settings;
    Ok(())
}

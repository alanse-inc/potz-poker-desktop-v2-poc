//! テロップウィンドウ制御と状態管理の commands。

use crate::events::{TELOP_BACKGROUND_COLOR_UPDATED, TELOP_CURRENT_SCREEN_UPDATED, TELOP_ID_UPDATED, TELOP_UPDATED};
use crate::state::{AppState, TelopState};
use tauri::{AppHandle, Emitter, Manager, State, WebviewWindowBuilder};
use tauri_plugin_store::StoreExt;

const TELOP_STORE_PATH: &str = "telop_settings.json";
const KEY_TELOP_ID: &str = "telopId";
const KEY_TELOP_BACKGROUND_COLOR: &str = "telopBackgroundColor";
const KEY_TELOP_CURRENT_SCREEN: &str = "telopCurrentScreen";

const TELOP_LABEL: &str = "telop";

#[tauri::command]
pub fn open_telop_window(app: AppHandle) -> Result<(), String> {
    if app.get_webview_window(TELOP_LABEL).is_some() {
        return Ok(());
    }

    WebviewWindowBuilder::new(&app, TELOP_LABEL, tauri::WebviewUrl::App("telop.html".into()))
        .title("Telop")
        .inner_size(800.0, 200.0)
        .resizable(true)
        .build()
        .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub fn close_telop_window(app: AppHandle) -> Result<(), String> {
    if let Some(win) = app.get_webview_window(TELOP_LABEL) {
        win.close().map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub fn set_telop_message(
    app: AppHandle,
    state: State<'_, AppState>,
    message: String,
) -> Result<(), String> {
    let telop = {
        let mut inner = state.lock();
        inner.telop_message = message;
        inner.telop_state()
    };
    let _ = app.emit(TELOP_UPDATED, &telop);
    Ok(())
}

#[tauri::command]
pub fn set_telop_color(
    app: AppHandle,
    state: State<'_, AppState>,
    color: String,
) -> Result<(), String> {
    let telop = {
        let mut inner = state.lock();
        inner.telop_color = color;
        inner.telop_state()
    };
    let _ = app.emit(TELOP_UPDATED, &telop);
    Ok(())
}

#[tauri::command]
pub fn get_telop_state(state: State<'_, AppState>) -> TelopState {
    state.lock().telop_state()
}

#[tauri::command]
pub fn get_telop_id(state: State<'_, AppState>) -> String {
    state.lock().telop_id.clone()
}

#[tauri::command]
pub fn set_telop_id(
    app: AppHandle,
    state: State<'_, AppState>,
    telop_id: String,
) -> Result<(), String> {
    let new_id = {
        let mut inner = state.lock();
        inner.telop_id = telop_id;
        inner.telop_id.clone()
    };
    let store = app.store(TELOP_STORE_PATH).map_err(|e| e.to_string())?;
    store.set(KEY_TELOP_ID, serde_json::json!(new_id));
    store.save().map_err(|e| e.to_string())?;
    let _ = app.emit(TELOP_ID_UPDATED, &new_id);
    Ok(())
}

#[tauri::command]
pub fn get_telop_background_color(state: State<'_, AppState>) -> String {
    state.lock().telop_background_color.clone()
}

#[tauri::command]
pub fn set_telop_background_color(
    app: AppHandle,
    state: State<'_, AppState>,
    color: String,
) -> Result<(), String> {
    let new_color = {
        let mut inner = state.lock();
        inner.telop_background_color = color;
        inner.telop_background_color.clone()
    };
    let store = app.store(TELOP_STORE_PATH).map_err(|e| e.to_string())?;
    store.set(KEY_TELOP_BACKGROUND_COLOR, serde_json::json!(new_color));
    store.save().map_err(|e| e.to_string())?;
    let _ = app.emit(TELOP_BACKGROUND_COLOR_UPDATED, &new_color);
    Ok(())
}

#[tauri::command]
pub fn get_telop_current_screen(state: State<'_, AppState>) -> Option<String> {
    state.lock().telop_current_screen.clone()
}

#[tauri::command]
pub fn set_telop_current_screen(
    app: AppHandle,
    state: State<'_, AppState>,
    screen: Option<String>,
) -> Result<(), String> {
    let new_screen = {
        let mut inner = state.lock();
        inner.telop_current_screen = screen;
        inner.telop_current_screen.clone()
    };
    let store = app.store(TELOP_STORE_PATH).map_err(|e| e.to_string())?;
    match &new_screen {
        Some(s) => store.set(KEY_TELOP_CURRENT_SCREEN, serde_json::json!(s)),
        None => store.set(KEY_TELOP_CURRENT_SCREEN, serde_json::Value::Null),
    }
    store.save().map_err(|e| e.to_string())?;
    let _ = app.emit(TELOP_CURRENT_SCREEN_UPDATED, &new_screen);
    Ok(())
}

pub fn load_telop_settings_from_store(app: &AppHandle, state: &AppState) {
    let store = match app.store(TELOP_STORE_PATH) {
        Ok(s) => s,
        Err(e) => {
            tracing::warn!("Failed to open telop store: {}", e);
            return;
        }
    };
    if let Some(v) = store.get(KEY_TELOP_ID) {
        if let Some(s) = v.as_str() {
            state.lock().telop_id = s.to_string();
        }
    }
    if let Some(v) = store.get(KEY_TELOP_BACKGROUND_COLOR) {
        if let Some(s) = v.as_str() {
            state.lock().telop_background_color = s.to_string();
        }
    }
    if let Some(v) = store.get(KEY_TELOP_CURRENT_SCREEN) {
        if v.is_null() {
            state.lock().telop_current_screen = None;
        } else if let Some(s) = v.as_str() {
            state.lock().telop_current_screen = Some(s.to_string());
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::state::InnerState;
    use parking_lot::Mutex;

    fn make_state() -> AppState {
        Mutex::new(InnerState::default())
    }

    #[test]
    fn telop_id_default_is_modern() {
        let state = make_state();
        assert_eq!(state.lock().telop_id, "modern");
    }

    #[test]
    fn telop_background_color_default() {
        let state = make_state();
        assert_eq!(state.lock().telop_background_color, "#00ff00");
    }

    #[test]
    fn telop_current_screen_default_is_none() {
        let state = make_state();
        assert!(state.lock().telop_current_screen.is_none());
    }

    #[test]
    fn set_telop_id_updates_state() {
        let state = make_state();
        state.lock().telop_id = "classic".to_string();
        assert_eq!(state.lock().telop_id, "classic");
    }

    #[test]
    fn set_telop_background_color_updates_state() {
        let state = make_state();
        state.lock().telop_background_color = "#ff0000".to_string();
        assert_eq!(state.lock().telop_background_color, "#ff0000");
    }

    #[test]
    fn set_telop_current_screen_updates_state() {
        let state = make_state();
        state.lock().telop_current_screen = Some("playing".to_string());
        assert_eq!(state.lock().telop_current_screen, Some("playing".to_string()));
    }

    #[test]
    fn set_telop_current_screen_to_none() {
        let state = make_state();
        state.lock().telop_current_screen = Some("playing".to_string());
        state.lock().telop_current_screen = None;
        assert!(state.lock().telop_current_screen.is_none());
    }
}

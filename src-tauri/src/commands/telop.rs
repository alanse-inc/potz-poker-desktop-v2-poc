//! テロップウィンドウ制御と状態管理の commands。

use crate::events::TELOP_UPDATED;
use crate::state::{AppState, TelopState};
use tauri::{AppHandle, Emitter, Manager, State, WebviewWindowBuilder};

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

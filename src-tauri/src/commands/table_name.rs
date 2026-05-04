//! テーブル名の読み書き commands。settings.json に tableName キーで永続化。

use tauri::AppHandle;
use tauri_plugin_store::StoreExt;

const STORE_PATH: &str = "settings.json";
const KEY_TABLE_NAME: &str = "tableName";

#[tauri::command]
pub fn get_table_name(app: AppHandle) -> Result<String, String> {
    let store = app.store(STORE_PATH).map_err(|e| e.to_string())?;
    Ok(store
        .get(KEY_TABLE_NAME)
        .and_then(|v| v.as_str().map(|s| s.to_string()))
        .unwrap_or_default())
}

#[tauri::command]
pub fn set_table_name(app: AppHandle, name: String) -> Result<(), String> {
    let store = app.store(STORE_PATH).map_err(|e| e.to_string())?;
    store.set(KEY_TABLE_NAME, serde_json::json!(name));
    store.save().map_err(|e| e.to_string())
}

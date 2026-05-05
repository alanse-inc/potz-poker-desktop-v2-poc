//! デッキ CRUD コマンド。
use crate::domain::rfid_mapping::RfidCardMapping;
use crate::state::AppState;
use serde::Deserialize;
use tauri::{AppHandle, State};
use tauri_plugin_store::StoreExt;

const STORE_FILE: &str = "decks.json";
const KEY_DECKS: &str = "decks";
const KEY_CURRENT_DECK_ID: &str = "currentDeckId";
const LEGACY_STORE_FILE: &str = "rfid_mapping.json";
const LEGACY_KEY: &str = "mapping";

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveDeckArgs {
    pub deck: RfidCardMapping,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DeleteDeckArgs {
    pub id: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChooseDeckArgs {
    pub id: String,
}

/// UUID v4 による ID 生成。
pub fn generate_id() -> String {
    uuid::Uuid::new_v4().to_string()
}

#[tauri::command]
pub async fn save_deck(
    args: SaveDeckArgs,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<RfidCardMapping, String> {
    let mut deck = args.deck;
    if deck.id.is_empty() {
        deck.id = generate_id();
    }
    {
        let mut guard = state.lock();
        if let Some(existing) = guard.decks.iter_mut().find(|d| d.id == deck.id) {
            *existing = deck.clone();
        } else {
            guard.decks.push(deck.clone());
        }
        if guard.current_deck_id.is_none() {
            guard.current_deck_id = Some(deck.id.clone());
        }
    }
    persist_decks(&app, &state).await?;
    Ok(deck)
}

#[tauri::command]
pub fn get_all_decks(state: State<AppState>) -> Vec<RfidCardMapping> {
    state.lock().decks.clone()
}

#[tauri::command]
pub fn get_deck_by_id(id: String, state: State<AppState>) -> Option<RfidCardMapping> {
    state.lock().decks.iter().find(|d| d.id == id).cloned()
}

#[tauri::command]
pub async fn delete_deck(
    args: DeleteDeckArgs,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<(), String> {
    {
        let mut guard = state.lock();
        guard.decks.retain(|d| d.id != args.id);
        if guard.current_deck_id.as_deref() == Some(args.id.as_str()) {
            guard.current_deck_id = guard.decks.first().map(|d| d.id.clone());
        }
    }
    persist_decks(&app, &state).await
}

#[tauri::command]
pub async fn choose_deck(
    args: ChooseDeckArgs,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<(), String> {
    {
        let mut guard = state.lock();
        let exists = guard.decks.iter().any(|d| d.id == args.id);
        if !exists {
            return Err(format!("deck {} not found", args.id));
        }
        guard.current_deck_id = Some(args.id);
    }
    persist_decks(&app, &state).await
}

#[tauri::command]
pub fn get_current_deck(state: State<AppState>) -> Option<RfidCardMapping> {
    state.lock().current_deck().cloned()
}

/// serial.rs などから呼び出し可能な公開版。
pub async fn persist_decks_pub(app: &AppHandle, state: &State<'_, AppState>) -> Result<(), String> {
    persist_decks(app, state).await
}

async fn persist_decks(app: &AppHandle, state: &State<'_, AppState>) -> Result<(), String> {
    let (decks, current_id) = {
        let guard = state.lock();
        (guard.decks.clone(), guard.current_deck_id.clone())
    };
    let store = app.store(STORE_FILE).map_err(|e| e.to_string())?;
    store.set(
        KEY_DECKS,
        serde_json::to_value(&decks).map_err(|e| e.to_string())?,
    );
    if let Some(id) = current_id {
        store.set(KEY_CURRENT_DECK_ID, serde_json::Value::String(id));
    } else {
        store.set(KEY_CURRENT_DECK_ID, serde_json::Value::Null);
    }
    store.save().map_err(|e| e.to_string())?;
    Ok(())
}

pub fn load_decks_from_store(app: &AppHandle, state: &AppState) {
    // legacy 移行: rfid_mapping.json → decks.json
    if let Ok(legacy) = app.store(LEGACY_STORE_FILE) {
        if let Some(value) = legacy.get(LEGACY_KEY) {
            if let Ok(mut mapping) = serde_json::from_value::<RfidCardMapping>(value) {
                if mapping.id.is_empty() {
                    mapping.id = generate_id();
                }
                if mapping.name.is_empty() {
                    mapping.name = "default".to_string();
                }
                let mut guard = state.lock();
                if guard.decks.iter().all(|d| d.id != mapping.id) {
                    guard.current_deck_id = Some(mapping.id.clone());
                    guard.decks.push(mapping);
                }
                tracing::info!("Migrated legacy rfid_mapping to decks");
            }
        }
    }

    let store = match app.store(STORE_FILE) {
        Ok(s) => s,
        Err(e) => {
            tracing::warn!("Failed to open decks store: {}", e);
            return;
        }
    };
    if let Some(value) = store.get(KEY_DECKS) {
        if let Ok(decks) = serde_json::from_value::<Vec<RfidCardMapping>>(value) {
            state.lock().decks = decks;
        }
    }
    if let Some(value) = store.get(KEY_CURRENT_DECK_ID) {
        if let Ok(id) = serde_json::from_value::<Option<String>>(value) {
            state.lock().current_deck_id = id;
        }
    }
}

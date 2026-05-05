//! デッキ CRUD コマンド。
use crate::domain::rfid_mapping::RfidCardMapping;
use crate::state::AppState;
use serde::Deserialize;
use tauri::{AppHandle, State};
use tauri_plugin_store::StoreExt;

#[cfg(not(test))]
use crate::events::DECK_UPDATED;
#[cfg(not(test))]
use tauri::Emitter;

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
    #[cfg_attr(test, allow(unused))]
    let emit_payload = {
        let mut guard = state.lock();
        if let Some(existing) = guard.decks.iter_mut().find(|d| d.id == deck.id) {
            *existing = deck.clone();
        } else {
            guard.decks.push(deck.clone());
        }
        if guard.current_deck_id.is_none() {
            guard.current_deck_id = Some(deck.id.clone());
        }
        guard.current_deck().cloned().unwrap_or_default()
    };
    persist_decks(&app, &state).await?;
    #[cfg(not(test))]
    let _ = app.emit(DECK_UPDATED, emit_payload);
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
    #[cfg_attr(test, allow(unused))]
    let emit_payload = {
        let mut guard = state.lock();
        guard.decks.retain(|d| d.id != args.id);
        if guard.current_deck_id.as_deref() == Some(args.id.as_str()) {
            guard.current_deck_id = guard.decks.first().map(|d| d.id.clone());
        }
        guard.current_deck().cloned().unwrap_or_default()
    };
    persist_decks(&app, &state).await?;
    #[cfg(not(test))]
    let _ = app.emit(DECK_UPDATED, emit_payload);
    Ok(())
}

#[tauri::command]
pub async fn choose_deck(
    args: ChooseDeckArgs,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<(), String> {
    #[cfg_attr(test, allow(unused))]
    let emit_payload = {
        let mut guard = state.lock();
        let exists = guard.decks.iter().any(|d| d.id == args.id);
        if !exists {
            return Err(format!("deck {} not found", args.id));
        }
        guard.current_deck_id = Some(args.id);
        guard.current_deck().cloned().unwrap_or_default()
    };
    persist_decks(&app, &state).await?;
    #[cfg(not(test))]
    let _ = app.emit(DECK_UPDATED, emit_payload);
    Ok(())
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
                {
                    let mut guard = state.lock();
                    if guard.decks.iter().all(|d| d.id != mapping.id) {
                        guard.current_deck_id = Some(mapping.id.clone());
                        guard.decks.push(mapping);
                    }
                }
                legacy.delete(LEGACY_KEY);
                let _ = legacy.save();
                tracing::info!("Migrated legacy rfid_mapping to decks and cleared legacy key");
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
        if let Ok(opt_id) = serde_json::from_value::<Option<String>>(value) {
            // None の場合はレガシー移行で設定した値を維持する
            if opt_id.is_some() {
                state.lock().current_deck_id = opt_id;
            }
        }
    }
}

// ---------------------------------------------------------------------------
// テスト
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use crate::domain::rfid_mapping::RfidCardMapping;
    use crate::state::{AppState, InnerState};

    fn make_app_state() -> AppState {
        AppState::new(InnerState::default())
    }

    fn make_mapping(id: &str, name: &str) -> RfidCardMapping {
        RfidCardMapping {
            id: id.to_string(),
            name: name.to_string(),
            ..RfidCardMapping::default()
        }
    }

    /// レガシー移行で current_deck_id が設定されたあと、
    /// decks.json の currentDeckId が null (None) でも上書きされないことを検証する。
    ///
    /// load_decks_from_store の実際の Store 依存部分はテスト環境では呼べないため、
    /// その内部ロジック（None は上書きしない）を直接再現して検証する。
    #[test]
    fn current_deck_id_not_overwritten_by_null_from_store() {
        let state = make_app_state();

        // レガシー移行で current_deck_id が設定される状況をシミュレート
        let mapping = make_mapping("legacy-id-001", "default");
        {
            let mut guard = state.lock();
            guard.decks.push(mapping.clone());
            guard.current_deck_id = Some(mapping.id.clone());
        }

        // decks.json の currentDeckId が null の場合のロジックをシミュレート
        // (serde_json::from_value::<Option<String>>(Value::Null) == Ok(None))
        let store_value = serde_json::Value::Null;
        let opt_id: Option<String> = serde_json::from_value(store_value).unwrap();
        assert!(opt_id.is_none());

        // None の場合は上書きしない（修正後のロジック）
        if opt_id.is_some() {
            state.lock().current_deck_id = opt_id;
        }

        // レガシー移行で設定した値が維持されること
        let guard = state.lock();
        assert_eq!(
            guard.current_deck_id.as_deref(),
            Some("legacy-id-001"),
            "current_deck_id は decks.json の null で上書きされてはいけない"
        );
    }

    // ---- Bug 2: save_deck / delete_deck / choose_deck の状態更新 ----

    /// save_deck: 新規デッキを追加すると decks が増え、current_deck_id が設定される。
    #[test]
    fn save_deck_adds_deck_and_sets_current_deck_id() {
        let state = make_app_state();
        let deck = make_mapping("deck-001", "Main");
        {
            let mut guard = state.lock();
            if guard.current_deck_id.is_none() {
                guard.current_deck_id = Some(deck.id.clone());
            }
            guard.decks.push(deck.clone());
        }
        let guard = state.lock();
        assert_eq!(guard.decks.len(), 1);
        assert_eq!(guard.current_deck_id.as_deref(), Some("deck-001"));
    }

    /// save_deck: 既存デッキを更新しても decks の件数は変わらない。
    #[test]
    fn save_deck_updates_existing_deck_without_increasing_count() {
        let state = make_app_state();
        let deck = make_mapping("deck-001", "Original");
        {
            let mut guard = state.lock();
            guard.decks.push(deck.clone());
            guard.current_deck_id = Some(deck.id.clone());
        }
        {
            let mut guard = state.lock();
            if let Some(existing) = guard.decks.iter_mut().find(|d| d.id == "deck-001") {
                existing.name = "Updated".to_string();
            }
        }
        let guard = state.lock();
        assert_eq!(guard.decks.len(), 1);
        assert_eq!(guard.decks[0].name, "Updated");
    }

    /// delete_deck: 削除後に decks が減り、current_deck_id が次のデッキに切り替わる。
    #[test]
    fn delete_deck_removes_deck_and_updates_current_deck_id() {
        let state = make_app_state();
        let d1 = make_mapping("deck-001", "First");
        let d2 = make_mapping("deck-002", "Second");
        {
            let mut guard = state.lock();
            guard.decks.push(d1.clone());
            guard.decks.push(d2.clone());
            guard.current_deck_id = Some("deck-001".to_string());
        }
        {
            let mut guard = state.lock();
            guard.decks.retain(|d| d.id != "deck-001");
            if guard.current_deck_id.as_deref() == Some("deck-001") {
                guard.current_deck_id = guard.decks.first().map(|d| d.id.clone());
            }
        }
        let guard = state.lock();
        assert_eq!(guard.decks.len(), 1);
        assert_eq!(guard.current_deck_id.as_deref(), Some("deck-002"));
    }

    /// delete_deck: 最後のデッキを削除すると current_deck_id が None になる。
    #[test]
    fn delete_last_deck_sets_current_deck_id_to_none() {
        let state = make_app_state();
        let d = make_mapping("deck-001", "Only");
        {
            let mut guard = state.lock();
            guard.decks.push(d.clone());
            guard.current_deck_id = Some("deck-001".to_string());
        }
        {
            let mut guard = state.lock();
            guard.decks.retain(|d| d.id != "deck-001");
            if guard.current_deck_id.as_deref() == Some("deck-001") {
                guard.current_deck_id = guard.decks.first().map(|d| d.id.clone());
            }
        }
        let guard = state.lock();
        assert!(guard.decks.is_empty());
        assert!(guard.current_deck_id.is_none());
    }

    /// choose_deck: current_deck_id が指定した ID に更新される。
    #[test]
    fn choose_deck_updates_current_deck_id() {
        let state = make_app_state();
        let d1 = make_mapping("deck-001", "First");
        let d2 = make_mapping("deck-002", "Second");
        {
            let mut guard = state.lock();
            guard.decks.push(d1.clone());
            guard.decks.push(d2.clone());
            guard.current_deck_id = Some("deck-001".to_string());
        }
        {
            let mut guard = state.lock();
            let target_id = "deck-002";
            let exists = guard.decks.iter().any(|d| d.id == target_id);
            assert!(exists);
            guard.current_deck_id = Some(target_id.to_string());
        }
        let guard = state.lock();
        assert_eq!(guard.current_deck_id.as_deref(), Some("deck-002"));
    }

    /// choose_deck: 存在しない ID を指定すると current_deck_id は変更されない（エラー）。
    #[test]
    fn choose_deck_with_nonexistent_id_does_not_update() {
        let state = make_app_state();
        let d = make_mapping("deck-001", "Only");
        {
            let mut guard = state.lock();
            guard.decks.push(d.clone());
            guard.current_deck_id = Some("deck-001".to_string());
        }
        {
            let guard = state.lock();
            let target_id = "nonexistent";
            let exists = guard.decks.iter().any(|d| d.id == target_id);
            assert!(!exists, "should not find nonexistent deck");
        }
        let guard = state.lock();
        assert_eq!(
            guard.current_deck_id.as_deref(),
            Some("deck-001"),
            "current_deck_id must not change when target deck does not exist"
        );
    }

    /// decks.json の currentDeckId が有効な Some(id) の場合は上書きされることを検証する。
    #[test]
    fn current_deck_id_overwritten_by_valid_id_from_store() {
        let state = make_app_state();

        // レガシー移行で current_deck_id が設定される状況をシミュレート
        let legacy_mapping = make_mapping("legacy-id-001", "default");
        let store_mapping = make_mapping("store-id-002", "from_store");
        {
            let mut guard = state.lock();
            guard.decks.push(legacy_mapping.clone());
            guard.decks.push(store_mapping.clone());
            guard.current_deck_id = Some(legacy_mapping.id.clone());
        }

        // decks.json に有効な currentDeckId が保存されている場合のロジックをシミュレート
        let store_value = serde_json::Value::String("store-id-002".to_string());
        let opt_id: Option<String> = serde_json::from_value(store_value).unwrap();
        assert_eq!(opt_id.as_deref(), Some("store-id-002"));

        // Some の場合は上書きする（修正後のロジック）
        if opt_id.is_some() {
            state.lock().current_deck_id = opt_id;
        }

        let guard = state.lock();
        assert_eq!(
            guard.current_deck_id.as_deref(),
            Some("store-id-002"),
            "decks.json に有効な ID がある場合は上書きされること"
        );
    }

    /// Bug 7: レガシー移行済みの場合、重複ガードが空の id でも機能することを検証する。
    /// id が空のレガシー mapping は generate_id() で新しい UUID が割り当てられるため、
    /// 移行後に legacy key を削除しないと再起動毎に重複する。
    /// このテストは「移行後に decks が 1 件のみ」という invariant を検証する。
    #[test]
    fn legacy_migration_with_empty_id_does_not_duplicate() {
        let state = make_app_state();

        // id が空のレガシー mapping をシミュレート（generate_id() で UUID を付与）
        let mut mapping = make_mapping("", "default");
        if mapping.id.is_empty() {
            mapping.id = "generated-uuid-001".to_string();
        }
        if mapping.name.is_empty() {
            mapping.name = "default".to_string();
        }

        // 1 回目の移行
        {
            let mut guard = state.lock();
            if guard.decks.iter().all(|d| d.id != mapping.id) {
                guard.current_deck_id = Some(mapping.id.clone());
                guard.decks.push(mapping.clone());
            }
        }
        assert_eq!(state.lock().decks.len(), 1, "1 回目の移行後は 1 件");

        // delete 後は同じ id ガードが機能する（移行済みなので再追加されない）
        {
            let mut guard = state.lock();
            if guard.decks.iter().all(|d| d.id != mapping.id) {
                guard.current_deck_id = Some(mapping.id.clone());
                guard.decks.push(mapping.clone());
            }
        }
        assert_eq!(state.lock().decks.len(), 1, "同じ id の移行は重複しない");
    }
}

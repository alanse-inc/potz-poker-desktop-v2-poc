//! Tauri アプリケーションのエントリポイント。全 command を登録する。

pub mod commands;
pub mod domain;
pub mod error;
pub mod events;
pub mod state;

use commands::action::{allin, bet, call, check, fold, raise};
use commands::board::{
    add_player, back_board, evaluate_player_hand, get_board, get_remaining_deck, move_next_game,
    remove_player, reset_board, set_community_card, start_game, update_player,
};
use commands::deck::{
    choose_deck, delete_deck, get_all_decks, get_current_deck, get_deck_by_id,
    load_decks_from_store, save_deck,
};
use commands::expose::expose;
use commands::serial::{
    apply_card_placed, get_rfid_card_mapping, get_serial_status, register_rfid_card,
    set_register_mode, start_serial_listener, unregister_rfid_card,
};
use commands::settings::{load_game_settings, save_game_settings};
use commands::table_name::{get_table_name, set_table_name};
use commands::telop::{
    close_telop_window, get_telop_background_color, get_telop_current_screen, get_telop_id,
    get_telop_state, load_telop_settings_from_store, open_telop_window, set_telop_background_color,
    set_telop_color, set_telop_current_screen, set_telop_id, set_telop_message,
};
use state::{AppState, InnerState};
use tauri::Manager;

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_dialog::init())
        .manage(AppState::new(InnerState::default()))
        .invoke_handler(tauri::generate_handler![
            // board
            get_board,
            start_game,
            move_next_game,
            reset_board,
            back_board,
            evaluate_player_hand,
            set_community_card,
            get_remaining_deck,
            update_player,
            add_player,
            remove_player,
            // action
            bet,
            call,
            check,
            fold,
            raise,
            allin,
            // settings
            load_game_settings,
            save_game_settings,
            // table name
            get_table_name,
            set_table_name,
            // telop
            open_telop_window,
            close_telop_window,
            set_telop_message,
            set_telop_color,
            get_telop_state,
            get_telop_id,
            set_telop_id,
            get_telop_background_color,
            set_telop_background_color,
            get_telop_current_screen,
            set_telop_current_screen,
            // expose
            expose,
            // serial / rfid
            get_rfid_card_mapping,
            register_rfid_card,
            unregister_rfid_card,
            set_register_mode,
            get_serial_status,
            apply_card_placed,
            // deck CRUD
            save_deck,
            get_all_decks,
            get_deck_by_id,
            delete_deck,
            choose_deck,
            get_current_deck,
        ])
        .setup(|app| {
            tracing_subscriber::fmt::init();
            // ストアからデッキを読み込む（legacy 移行含む）
            let app_state: tauri::State<AppState> = app.state();
            load_decks_from_store(app.handle(), &app_state);
            // テロップ設定を読み込む
            load_telop_settings_from_store(app.handle(), &app_state);
            // シリアルリスナーを開始
            start_serial_listener(app.handle().clone());
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

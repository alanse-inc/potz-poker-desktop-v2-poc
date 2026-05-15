//! スプラッシュウィンドウ制御の commands。

use tauri::{AppHandle, Manager};

const SPLASH_LABEL: &str = "splash";
const MAIN_LABEL: &str = "main";

/// フロントエンドの準備完了時に呼ばれる。
/// splash window を閉じ、main window を表示する。
#[tauri::command]
pub fn close_splash(app: AppHandle) -> Result<(), String> {
    if let Some(splash) = app.get_webview_window(SPLASH_LABEL) {
        splash.close().map_err(|e| e.to_string())?;
    }
    if let Some(main) = app.get_webview_window(MAIN_LABEL) {
        main.show().map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// splash window のフェイルセーフタイマーを起動する。
/// `timeout_ms` ミリ秒後に `close_splash` と同じ処理を行う。
/// フロントエンドから `close_splash` が先に呼ばれた場合は何もしない。
pub fn schedule_splash_timeout(app: AppHandle, timeout_ms: u64) {
    std::thread::spawn(move || {
        std::thread::sleep(std::time::Duration::from_millis(timeout_ms));
        if let Some(splash) = app.get_webview_window(SPLASH_LABEL) {
            let _ = splash.close();
        }
        if let Some(main) = app.get_webview_window(MAIN_LABEL) {
            let _ = main.show();
        }
    });
}

#[cfg(test)]
mod tests {
    #[test]
    fn splash_label_is_correct() {
        assert_eq!(super::SPLASH_LABEL, "splash");
    }

    #[test]
    fn main_label_is_correct() {
        assert_eq!(super::MAIN_LABEL, "main");
    }
}

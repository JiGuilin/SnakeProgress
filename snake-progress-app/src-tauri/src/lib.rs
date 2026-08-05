mod config;
mod progress;

use config::{AppConfig, ThemePreset};
use progress::{calculate_progress, ProgressInfo};
use std::fs;
use std::sync::Mutex;
use tauri::{
    menu::{Menu, MenuItem, PredefinedMenuItem, CheckMenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Manager, Emitter,
};
use tauri_plugin_autostart::MacosLauncher;
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut};

/// 应用状态
struct AppState {
    config: Mutex<AppConfig>,
    visible: Mutex<bool>,
    first_launch: Mutex<bool>,
}

// ============ Tauri Commands ============

#[tauri::command(name = "get_config")]
fn get_config(state: tauri::State<AppState>) -> AppConfig {
    state.config.lock().unwrap().clone()
}

#[tauri::command(name = "save_config")]
fn save_config(state: tauri::State<AppState>, config: AppConfig) -> bool {
    let mut current = state.config.lock().unwrap();
    *current = config.clone();
    current.save()
}

#[tauri::command(name = "get_progress")]
fn get_progress(state: tauri::State<AppState>) -> ProgressInfo {
    let config = state.config.lock().unwrap();
    calculate_progress(
        &config.work_time.start,
        &config.work_time.end,
        config.work_time.lunch.enabled,
        &config.work_time.lunch.start,
        &config.work_time.lunch.end,
        &config.work_time.workdays,
    )
}

#[tauri::command(name = "get_themes")]
fn get_themes() -> Vec<serde_json::Value> {
    ThemePreset::all()
        .into_iter()
        .map(|t| {
            serde_json::json!({
                "name": t.name,
                "label": t.label,
                "snakeColor": t.snake_color,
                "headColor": t.head_color,
                "colorMode": t.color_mode,
                "pixelSize": t.pixel_size,
                "opacity": t.opacity,
            })
        })
        .collect()
}

#[tauri::command(name = "apply_theme")]
fn apply_theme(state: tauri::State<AppState>, theme_name: String) -> Option<AppConfig> {
    let themes = ThemePreset::all();
    let theme = themes.into_iter().find(|t| t.name == theme_name)?;
    let mut config = state.config.lock().unwrap();
    theme.apply_to_config(&mut config);
    config.save();
    Some(config.clone())
}

#[tauri::command(name = "toggle_visibility")]
fn toggle_visibility(app: tauri::AppHandle, state: tauri::State<AppState>) -> bool {
    let mut visible = state.visible.lock().unwrap();
    *visible = !*visible;
    let is_visible = *visible;

    if let Some(window) = app.get_webview_window("main") {
        if is_visible {
            let _ = window.show();
        } else {
            let _ = window.hide();
        }
    }

    is_visible
}

#[tauri::command(name = "reset_config")]
fn reset_config(state: tauri::State<AppState>) -> AppConfig {
    let mut config = state.config.lock().unwrap();
    *config = AppConfig::default();
    config.save();
    config.clone()
}

#[tauri::command(name = "open_settings")]
fn open_settings(app: tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("settings") {
        let _ = window.set_always_on_top(true);
        let _ = window.show();
        let _ = window.set_focus();
    }
}

#[tauri::command(name = "set_click_through")]
fn set_click_through(app: tauri::AppHandle, enabled: bool) -> bool {
    if let Some(window) = app.get_webview_window("main") {
        window.set_ignore_cursor_events(enabled).is_ok()
    } else {
        false
    }
}

#[tauri::command(name = "export_config")]
fn export_config(state: tauri::State<AppState>) -> Result<String, String> {
    let config = state.config.lock().unwrap();
    serde_json::to_string_pretty(&*config).map_err(|e| e.to_string())
}

#[tauri::command(name = "import_config")]
fn import_config(state: tauri::State<AppState>, json: String) -> Result<AppConfig, String> {
    let new_config: AppConfig =
        serde_json::from_str(&json).map_err(|e| format!("配置格式错误: {}", e))?;

    if new_config.version.is_empty() {
        return Err("配置版本信息缺失".to_string());
    }

    let mut config = state.config.lock().unwrap();
    *config = new_config.clone();
    config.save();
    Ok(config.clone())
}

#[tauri::command(name = "is_first_launch")]
fn is_first_launch(state: tauri::State<AppState>) -> bool {
    *state.first_launch.lock().unwrap()
}

#[tauri::command(name = "mark_first_launch_done")]
fn mark_first_launch_done(state: tauri::State<AppState>) {
    *state.first_launch.lock().unwrap() = false;
    let marker_path = AppConfig::config_path().with_extension("launched");
    let _ = fs::write(&marker_path, "true");
}

#[tauri::command(name = "get_config_path")]
fn get_config_path() -> String {
    AppConfig::config_path().to_string_lossy().to_string()
}

// ============ 主入口 ============

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_autostart::init(
            MacosLauncher::LaunchAgent,
            Some(vec![]),
        ))
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(|app, _shortcut, event| {
                    if event.state() == tauri_plugin_global_shortcut::ShortcutState::Pressed {
                        toggle_window_visibility(app);
                    }
                })
                .build(),
        )
        .manage(AppState {
            config: Mutex::new(AppConfig::load()),
            visible: Mutex::new(true),
            first_launch: Mutex::new(check_first_launch()),
        })
        .invoke_handler(tauri::generate_handler![
            get_config,
            save_config,
            get_progress,
            get_themes,
            apply_theme,
            toggle_visibility,
            reset_config,
            open_settings,
            set_click_through,
            export_config,
            import_config,
            is_first_launch,
            mark_first_launch_done,
            get_config_path,
        ])
        .setup(|app| {
            // ======== 主窗口鼠标穿透 ========
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.set_ignore_cursor_events(true);
            }

            // ======== 设置窗口关闭拦截：隐藏而非销毁 ========
            if let Some(settings_window) = app.get_webview_window("settings") {
                let sw = settings_window.clone();
                settings_window.on_window_event(move |event| {
                    if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                        api.prevent_close();
                        let _ = sw.set_always_on_top(false);
                        let _ = sw.hide();
                    }
                });
            }

            // ======== 注册全局快捷键 ========
            let shortcut: Shortcut = "Ctrl+Shift+S".parse().unwrap();
            let gs = app.global_shortcut();
            let _ = gs.register(shortcut);

            // ======== 系统托盘 ========
            let show_item = CheckMenuItem::with_id(app, "show", "显示进度条", true, true, None::<&str>)?;
            let settings_item = MenuItem::with_id(app, "settings", "设置", true, None::<&str>)?;
            let separator1 = PredefinedMenuItem::separator(app)?;
            let autostart_item = CheckMenuItem::with_id(app, "autostart", "开机自启", true, true, None::<&str>)?;
            let separator2 = PredefinedMenuItem::separator(app)?;
            let about_item = MenuItem::with_id(app, "about", "关于 SnakeProgress", true, None::<&str>)?;
            let quit_item = MenuItem::with_id(app, "quit", "退出", true, None::<&str>)?;

            let menu = Menu::with_items(app, &[
                &show_item,
                &settings_item,
                &separator1,
                &autostart_item,
                &separator2,
                &about_item,
                &quit_item,
            ])?;

            let _tray = TrayIconBuilder::with_id("main")
                .icon(app.default_window_icon().unwrap().clone())
                .menu(&menu)
                .show_menu_on_left_click(false)
                .tooltip("SnakeProgress - 贪吃蛇进度条")
                .on_menu_event(move |app, event| {
                    match event.id.as_ref() {
                        "show" => {
                            toggle_window_visibility(app);
                        }
                        "settings" => {
                            if let Some(window) = app.get_webview_window("settings") {
                                // 主窗口是 alwaysOnTop + maximized，会遮挡设置窗口
                                // 临时将设置窗口也设为置顶，确保可见
                                let _ = window.set_always_on_top(true);
                                let _ = window.show();
                                let _ = window.set_focus();
                            }
                        }
                        "autostart" => {
                            toggle_autostart(app);
                        }
                        "about" => {
                            let _ = app.emit("show-about", ());
                        }
                        "quit" => {
                            app.exit(0);
                        }
                        _ => {}
                    }
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } = event {
                        let app = tray.app_handle();
                        toggle_window_visibility(app);
                    }
                })
                .build(app)?;

            // ======== 首次启动不再弹出设置窗口 ========

            // ======== 托盘提示定时更新 ========
            let app_handle = app.handle().clone();
            std::thread::spawn(move || {
                loop {
                    std::thread::sleep(std::time::Duration::from_secs(10));
                    update_tray_tooltip(&app_handle);
                }
            });

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

// ============ 辅助函数 ============

fn check_first_launch() -> bool {
    let marker_path = AppConfig::config_path().with_extension("launched");
    !marker_path.exists()
}

fn toggle_window_visibility(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let is_visible = window.is_visible().unwrap_or(false);
        if is_visible {
            let _ = app.emit("fade-out", ());
            let win = window.clone();
            std::thread::spawn(move || {
                std::thread::sleep(std::time::Duration::from_millis(200));
                let _ = win.hide();
            });
        } else {
            let _ = window.show();
            let _ = app.emit("fade-in", ());
        }
    }
}

fn toggle_autostart(app: &tauri::AppHandle) {
    use tauri_plugin_autostart::ManagerExt;
    let manager = app.autolaunch();
    let enabled = manager.is_enabled().unwrap_or(false);
    if enabled {
        let _ = manager.disable();
    } else {
        let _ = manager.enable();
    }
}

fn update_tray_tooltip(app: &tauri::AppHandle) {
    let state = app.state::<AppState>();
    let config = state.config.lock().unwrap();
    let progress = calculate_progress(
        &config.work_time.start,
        &config.work_time.end,
        config.work_time.lunch.enabled,
        &config.work_time.lunch.start,
        &config.work_time.lunch.end,
        &config.work_time.workdays,
    );
    drop(config);

    let remaining = progress.remaining_minutes;
    let hours = remaining / 60;
    let mins = remaining % 60;
    let percent = (progress.percent * 100.0).round() / 100.0; // 保留2位小数

    let tooltip = if progress.status == "NonWorkday" {
        "SnakeProgress - 非工作日".to_string()
    } else if progress.status == "AfterWork" {
        "SnakeProgress - 已完成 🎉".to_string()
    } else if progress.is_lunch_break {
        format!("SnakeProgress - 工作进度 {:.2}% · 🌙午休中", percent)
    } else {
        format!(
            "SnakeProgress - 工作进度 {:.2}% · 剩余 {}h {}min",
            percent, hours, mins
        )
    };

    if let Some(tray) = app.tray_by_id("main") {
        let _ = tray.set_tooltip(Some(&tooltip));
    }
}

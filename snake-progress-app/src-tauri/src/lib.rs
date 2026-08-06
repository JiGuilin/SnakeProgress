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
use std::time::{SystemTime, UNIX_EPOCH};

/// 应用状态
struct AppState {
    config: Mutex<AppConfig>,
    visible: Mutex<bool>,
    first_launch: Mutex<bool>,
    overlay_open: Mutex<bool>,  // 前端弹窗是否打开
    show_menu_item: Mutex<Option<CheckMenuItem<tauri::Wry>>>,
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

fn detail_or_about_open(app: &tauri::AppHandle) -> bool {
    let state = app.state::<AppState>();
    let result = *state.overlay_open.lock().unwrap();
    result
}

#[tauri::command(name = "get_screen_size")]
fn get_screen_size() -> (i32, i32) {
    #[cfg(target_os = "windows")]
    {
        use windows::Win32::UI::WindowsAndMessaging::{GetSystemMetrics, SM_CXSCREEN, SM_CYSCREEN};
        let w = unsafe { GetSystemMetrics(SM_CXSCREEN) };
        let h = unsafe { GetSystemMetrics(SM_CYSCREEN) };
        (w, h)
    }
    #[cfg(not(target_os = "windows"))]
    {
        (1920, 1080) // 默认值，非 Windows 平台由前端自行获取
    }
}

#[tauri::command(name = "get_cursor_pos")]
fn get_cursor_pos() -> (i32, i32) {
    #[cfg(target_os = "windows")]
    {
        use windows::Win32::UI::WindowsAndMessaging::GetCursorPos;
        use windows::Win32::Foundation::POINT;

        let mut point = POINT { x: 0, y: 0 };
        unsafe {
            let _ = GetCursorPos(&mut point);
        }
        (point.x, point.y)
    }
    #[cfg(not(target_os = "windows"))]
    {
        (0, 0)
    }
}

#[tauri::command(name = "set_overlay_open")]
fn set_overlay_open(app: tauri::AppHandle, open: bool) -> bool {
    let state = app.state::<AppState>();
    *state.overlay_open.lock().unwrap() = open;
    // 弹窗打开时确保穿透关闭
    if open {
        if let Some(window) = app.get_webview_window("main") {
            let _ = window.set_ignore_cursor_events(false);
        }
    }
    true
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

// ============ 打卡功能 ============

#[derive(serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct ClockRecord {
    clock_in: Option<String>,
    clock_out: Option<String>,
    work_minutes: i64,
}

#[tauri::command(name = "clock_in")]
fn clock_in() -> String {
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();
    let local_secs = now + 8 * 3600;
    let hours = (local_secs / 3600) % 24;
    let minutes = (local_secs % 3600) / 60;
    let seconds = local_secs % 60;
    format!("{:02}:{:02}:{:02}", hours, minutes, seconds)
}

#[tauri::command(name = "get_clock_status")]
fn get_clock_status() -> ClockRecord {
    // 从配置目录读取打卡记录
    let record_path = AppConfig::config_path().with_extension("clock");
    if record_path.exists() {
        if let Ok(content) = fs::read_to_string(&record_path) {
            if let Ok(record) = serde_json::from_str::<ClockRecord>(&content) {
                return record;
            }
        }
    }
    ClockRecord {
        clock_in: None,
        clock_out: None,
        work_minutes: 0,
    }
}

#[tauri::command(name = "save_clock_in")]
fn save_clock_in(time: String) -> bool {
    let record_path = AppConfig::config_path().with_extension("clock");
    let mut record = get_clock_status();
    record.clock_in = Some(time);
    record.clock_out = None;
    record.work_minutes = 0;
    let _ = fs::write(&record_path, serde_json::to_string(&record).unwrap_or_default());
    true
}

#[tauri::command(name = "save_clock_out")]
fn save_clock_out(time: String) -> bool {
    let record_path = AppConfig::config_path().with_extension("clock");
    let mut record = get_clock_status();
    record.clock_out = Some(time.clone());
    // 计算工时
    if let Some(clock_in) = &record.clock_in {
        let in_parts: Vec<&str> = clock_in.split(':').collect();
        let out_parts: Vec<&str> = time.split(':').collect();
        if in_parts.len() == 3 && out_parts.len() == 3 {
            let in_mins: i64 = in_parts[0].parse().unwrap_or(0) * 60 + in_parts[1].parse().unwrap_or(0);
            let out_mins: i64 = out_parts[0].parse().unwrap_or(0) * 60 + out_parts[1].parse().unwrap_or(0);
            record.work_minutes = (out_mins - in_mins).max(0);
        }
    }
    let _ = fs::write(&record_path, serde_json::to_string(&record).unwrap_or_default());
    true
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
            overlay_open: Mutex::new(false),
            show_menu_item: Mutex::new(None),
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
            clock_in,
            get_clock_status,
            save_clock_in,
            save_clock_out,
            get_cursor_pos,
            set_overlay_open,
            get_screen_size,
        ])
        .setup(|app| {
            // ======== 主窗口鼠标穿透 ========
            // 窗口始终穿透（ignore_cursor_events = true）
            // 只有当用户关闭穿透开关时，才会在鼠标靠近边缘时临时关闭穿透以接收事件
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
            // 保存菜单项引用到 AppState，供后续更新勾选状态
            {
                let state = app.state::<AppState>();
                *state.show_menu_item.lock().unwrap() = Some(show_item.clone());
            }
            let settings_item = MenuItem::with_id(app, "settings", "设置", true, None::<&str>)?;
            let separator1 = PredefinedMenuItem::separator(app)?;
            let detail_item = MenuItem::with_id(app, "detail", "📊 详细信息", true, None::<&str>)?;
            let clock_in_item = MenuItem::with_id(app, "clock_in", "📍 上班打卡", true, None::<&str>)?;
            let clock_out_item = MenuItem::with_id(app, "clock_out", "🏠 下班打卡", true, None::<&str>)?;
            let separator2 = PredefinedMenuItem::separator(app)?;
            let autostart_item = CheckMenuItem::with_id(app, "autostart", "开机自启", true, true, None::<&str>)?;
            let separator3 = PredefinedMenuItem::separator(app)?;
            let about_item = MenuItem::with_id(app, "about", "关于 SnakeProgress", true, None::<&str>)?;
            let quit_item = MenuItem::with_id(app, "quit", "退出", true, None::<&str>)?;

            let menu = Menu::with_items(app, &[
                &show_item,
                &settings_item,
                &separator1,
                &detail_item,
                &clock_in_item,
                &clock_out_item,
                &separator2,
                &autostart_item,
                &separator3,
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
                        "detail" => {
                            let _ = app.emit("show-detail", ());
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
                        "clock_in" => {
                            let time = clock_in();
                            let _ = save_clock_in(time.clone());
                            let _ = app.emit("clock-event", serde_json::json!({
                                "type": "clockIn",
                                "time": time,
                            }));
                        }
                        "clock_out" => {
                            let time = clock_in(); // 复用获取当前时间的逻辑
                            let _ = save_clock_out(time.clone());
                            let _ = app.emit("clock-event", serde_json::json!({
                                "type": "clockOut",
                                "time": time,
                            }));
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

            // ======== 动态鼠标穿透切换 ========
            // click_through = true（开启穿透）→ 始终穿透，不弹窗
            // click_through = false（关闭穿透）→ 鼠标靠近边缘时临时关闭穿透，允许点击蛇身弹窗
            #[cfg(target_os = "windows")]
            {
                let click_app = app.handle().clone();
                std::thread::spawn(move || {
                    use windows::Win32::UI::WindowsAndMessaging::GetCursorPos;
                    use windows::Win32::UI::WindowsAndMessaging::{GetSystemMetrics, SM_CXSCREEN, SM_CYSCREEN};
                    use windows::Win32::Foundation::POINT;

                    let mut was_near_edge = false;
                    loop {
                        std::thread::sleep(std::time::Duration::from_millis(80));

                        let config = click_app.state::<AppState>().config.lock().unwrap().clone();

                        if config.display.click_through {
                            // 开启穿透 → 但如果有弹窗打开，临时关闭穿透
                            if detail_or_about_open(&click_app) {
                                if let Some(window) = click_app.get_webview_window("main") {
                                    let _ = window.set_ignore_cursor_events(false);
                                }
                                was_near_edge = true;
                                continue;
                            }
                            // 确保穿透状态
                            if !was_near_edge {
                                if let Some(window) = click_app.get_webview_window("main") {
                                    let _ = window.set_ignore_cursor_events(true);
                                }
                            }
                            was_near_edge = false;
                            continue;
                        }

                        // 关闭穿透 → 允许蛇身交互
                        // 如果有弹窗打开，保持穿透关闭，不恢复
                        if detail_or_about_open(&click_app) {
                            if let Some(window) = click_app.get_webview_window("main") {
                                let _ = window.set_ignore_cursor_events(false);
                            }
                            was_near_edge = true;
                            continue;
                        }

                        let mut point = POINT { x: 0, y: 0 };
                        let _ = unsafe { GetCursorPos(&mut point) };

                        let margin = config.appearance.margin as i32;
                        let pixel_size = config.appearance.pixel_size as i32;
                        let threshold = margin + pixel_size * 3; // 蛇身附近的判定范围

                        let screen_w = unsafe { GetSystemMetrics(SM_CXSCREEN) };
                        let screen_h = unsafe { GetSystemMetrics(SM_CYSCREEN) };

                        let near_edge = point.x <= threshold
                            || point.y <= threshold
                            || point.x >= screen_w - threshold
                            || point.y >= screen_h - threshold;

                        if near_edge && !was_near_edge {
                            // 鼠标进入边缘 → 临时关闭穿透，让前端可以接收事件
                            if let Some(window) = click_app.get_webview_window("main") {
                                let _ = window.set_ignore_cursor_events(false);
                            }
                            was_near_edge = true;
                        } else if !near_edge && was_near_edge {
                            // 鼠标离开边缘 → 恢复穿透
                            if let Some(window) = click_app.get_webview_window("main") {
                                let _ = window.set_ignore_cursor_events(true);
                            }
                            was_near_edge = false;
                        }
                    }
                });
            }

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
        // 同步更新菜单项勾选状态
        let state = app.state::<AppState>();
        let show_item = state.show_menu_item.lock().unwrap().clone();
        if let Some(item) = show_item {
            let _ = item.set_checked(!is_visible);
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
    let percent = (progress.percent * 1000.0).round() / 1000.0; // 保留3位小数

    let tooltip = if progress.status == "NonWorkday" {
        "SnakeProgress - 非工作日".to_string()
    } else if progress.status == "AfterWork" {
        "SnakeProgress - 已完成 🎉".to_string()
    } else if progress.is_lunch_break {
        format!("SnakeProgress - 工作进度 {:.3}% · 🌙午休中", percent)
    } else {
        format!(
            "SnakeProgress - 工作进度 {:.3}% · 剩余 {}h {}min",
            percent, hours, mins
        )
    };

    if let Some(tray) = app.tray_by_id("main") {
        let _ = tray.set_tooltip(Some(&tooltip));
    }
}

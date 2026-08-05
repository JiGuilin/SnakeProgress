use serde::{Deserialize, Serialize};
use std::env;
use std::fs;
use std::path::PathBuf;

/// 应用配置结构体，与需求文档 §7.1 一致
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppConfig {
    pub version: String,
    pub work_time: WorkTime,
    pub appearance: Appearance,
    pub display: Display,
    pub shortcut: Shortcut,
    pub celebration: Celebration,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkTime {
    pub start: String,
    pub end: String,
    pub lunch: Lunch,
    pub workdays: Vec<u8>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Lunch {
    pub enabled: bool,
    pub start: String,
    pub end: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Appearance {
    pub theme: String,
    pub snake_color: String,
    pub head_color: String,
    pub color_mode: String,
    pub rainbow_mode: bool,
    pub pixel_size: u32,
    pub opacity: u32,
    pub margin: u32,
    pub snake_length_mode: String,
    pub fixed_length_percent: u32,
    pub animation_speed: String,
    pub show_trail: bool,
    pub head_glow: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Display {
    pub monitor: String,
    pub auto_hide_fullscreen: bool,
    pub click_through: bool,
    pub auto_start: bool,
    pub show_on_non_workdays: bool,
    pub non_workday_style: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Shortcut {
    pub toggle_visibility: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Celebration {
    pub enabled: bool,
    pub duration: u32,
    pub celebration_type: String,
}

impl Default for AppConfig {
    fn default() -> Self {
        Self {
            version: "1.0.0".to_string(),
            work_time: WorkTime {
                start: "09:00".to_string(),
                end: "18:00".to_string(),
                lunch: Lunch {
                    enabled: true,
                    start: "12:00".to_string(),
                    end: "13:00".to_string(),
                },
                workdays: vec![1, 2, 3, 4, 5],
            },
            appearance: Appearance {
                theme: "classic".to_string(),
                snake_color: "#00FF00".to_string(),
                head_color: "#FFFF00".to_string(),
                color_mode: "solid".to_string(),
                rainbow_mode: false,
                pixel_size: 8,
                opacity: 80,
                margin: 2,
                snake_length_mode: "trailing".to_string(),
                fixed_length_percent: 20,
                animation_speed: "normal".to_string(),
                show_trail: false,
                head_glow: true,
            },
            display: Display {
                monitor: "primary".to_string(),
                auto_hide_fullscreen: true,
                click_through: true,
                auto_start: true,
                show_on_non_workdays: false,
                non_workday_style: "hidden".to_string(),
            },
            shortcut: Shortcut {
                toggle_visibility: "Ctrl+Shift+S".to_string(),
            },
            celebration: Celebration {
                enabled: true,
                duration: 3000,
                celebration_type: "fireworks".to_string(),
            },
        }
    }
}

impl AppConfig {
    /// 获取配置文件路径（跨平台，不依赖 dirs crate）
    pub fn config_path() -> PathBuf {
        // Windows: %APPDATA%\SnakeProgress\config.json
        // macOS: ~/Library/Application Support/SnakeProgress/config.json
        // Linux: ~/.config/SnakeProgress/config.json
        let base_dir = if cfg!(target_os = "windows") {
            env::var("APPDATA")
                .map(PathBuf::from)
                .unwrap_or_else(|_| PathBuf::from("."))
        } else if cfg!(target_os = "macos") {
            let home = env::var("HOME").unwrap_or_else(|_| ".".to_string());
            PathBuf::from(home).join("Library").join("Application Support")
        } else {
            // Linux
            let xdg = env::var("XDG_CONFIG_HOME")
                .map(PathBuf::from)
                .unwrap_or_else(|_| {
                    let home = env::var("HOME").unwrap_or_else(|_| ".".to_string());
                    PathBuf::from(home).join(".config")
                });
            xdg
        };

        let path = base_dir.join("SnakeProgress");
        fs::create_dir_all(&path).ok();
        path.join("config.json")
    }

    /// 从文件加载配置，失败则返回默认值
    pub fn load() -> Self {
        let path = Self::config_path();
        match fs::read_to_string(&path) {
            Ok(content) => {
                match serde_json::from_str::<AppConfig>(&content) {
                    Ok(config) => config,
                    Err(e) => {
                        eprintln!("配置文件解析失败，使用默认配置: {}", e);
                        let default = Self::default();
                        default.save();
                        default
                    }
                }
            }
            Err(_) => {
                let default = Self::default();
                default.save();
                default
            }
        }
    }

    /// 保存配置到文件
    pub fn save(&self) -> bool {
        let path = Self::config_path();
        match serde_json::to_string_pretty(self) {
            Ok(json) => {
                if let Some(parent) = path.parent() {
                    fs::create_dir_all(parent).ok();
                }
                fs::write(&path, json).is_ok()
            }
            Err(_) => false,
        }
    }
}

/// 主题预设定义，与需求文档 §7.3 一致
pub struct ThemePreset {
    pub name: String,
    pub label: String,
    pub snake_color: String,
    pub head_color: String,
    pub color_mode: String,
    pub pixel_size: u32,
    pub opacity: u32,
}

impl ThemePreset {
    pub fn all() -> Vec<Self> {
        vec![
            ThemePreset {
                name: "classic".to_string(),
                label: "经典绿".to_string(),
                snake_color: "#00FF00".to_string(),
                head_color: "#FFFF00".to_string(),
                color_mode: "solid".to_string(),
                pixel_size: 8,
                opacity: 80,
            },
            ThemePreset {
                name: "cyberpunk".to_string(),
                label: "赛博朋克".to_string(),
                snake_color: "#FF00FF,#00FFFF".to_string(),
                head_color: "#FFFFFF".to_string(),
                color_mode: "gradient".to_string(),
                pixel_size: 8,
                opacity: 90,
            },
            ThemePreset {
                name: "retro".to_string(),
                label: "像素红白机".to_string(),
                snake_color: "#FF0000".to_string(),
                head_color: "#FFFFFF".to_string(),
                color_mode: "solid".to_string(),
                pixel_size: 4,
                opacity: 100,
            },
            ThemePreset {
                name: "dark".to_string(),
                label: "暗黑".to_string(),
                snake_color: "#555555".to_string(),
                head_color: "#AAAAAA".to_string(),
                color_mode: "solid".to_string(),
                pixel_size: 8,
                opacity: 60,
            },
            ThemePreset {
                name: "ocean".to_string(),
                label: "海洋".to_string(),
                snake_color: "#0077BE,#00CED1".to_string(),
                head_color: "#FFFFFF".to_string(),
                color_mode: "gradient".to_string(),
                pixel_size: 10,
                opacity: 85,
            },
            ThemePreset {
                name: "sakura".to_string(),
                label: "樱花".to_string(),
                snake_color: "#FFB7C5,#FF69B4".to_string(),
                head_color: "#FFFFFF".to_string(),
                color_mode: "gradient".to_string(),
                pixel_size: 8,
                opacity: 75,
            },
        ]
    }

    pub fn apply_to_config(&self, config: &mut AppConfig) {
        config.appearance.theme = self.name.clone();
        config.appearance.snake_color = self.snake_color.clone();
        config.appearance.head_color = self.head_color.clone();
        config.appearance.color_mode = self.color_mode.clone();
        config.appearance.pixel_size = self.pixel_size;
        config.appearance.opacity = self.opacity;
        config.appearance.rainbow_mode = false;
    }
}

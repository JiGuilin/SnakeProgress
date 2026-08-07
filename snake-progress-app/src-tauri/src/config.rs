use serde::{Deserialize, Serialize};
use std::env;
use std::fs;
use std::path::PathBuf;

// serde 默认值函数
fn default_true() -> bool { true }
fn default_body_anim() -> String { "none".to_string() }
fn default_body_motion() -> String { "wiggle".to_string() }
fn default_start_position() -> String { "top-left".to_string() }
fn default_direction() -> String { "clockwise".to_string() }
fn default_display_mode() -> String { "full".to_string() }
fn default_random_food_interval() -> u32 { 15 }
fn default_random_food_range_min() -> f64 { 0.5 }
fn default_random_food_range_max() -> f64 { 5.0 }
fn default_random_food_max_count() -> u32 { 5 }

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
    #[serde(default = "default_body_motion")]
    pub body_motion_mode: String, // straight, wiggle, wave, bounce, coil
    pub head_shape: String, // triangle, rectangle, square, circle, diamond, arrow, hexagon, star, sprite_pixel/cute/dragon/robot/ghost/knight/alien
    pub skin_texture: String, // solid, checkerboard, stripe, dots, outline, cross, sprite_pixel/scale/armor/glow/crystal/circuit/lava
    #[serde(default = "default_true")]
    pub show_power_ups: bool, // 显示里程碑道具
    #[serde(default = "default_body_anim")]
    pub body_anim_effect: String, // none, breathing, pulse, wave, sparkle, rainbow, glow, ripple, lightning, neon, fire
    #[serde(default = "default_body_anim")]
    pub head_anim_effect: String, // none, nod, bob, wobble, shake, bounce
    #[serde(default = "default_body_anim")]
    pub tail_anim_effect: String, // none, swish, curl, pulse, flame, flow
    #[serde(default = "default_start_position")]
    pub start_position: String, // top-left, top-right, bottom-left, bottom-right
    #[serde(default = "default_direction")]
    pub direction: String, // clockwise, counterclockwise
    #[serde(default = "default_display_mode")]
    pub display_mode: String, // full, single (单边模式下由 start_position 决定具体边)
    #[serde(default = "default_true")]
    pub random_food_enabled: bool, // 随机食物开关
    #[serde(default = "default_random_food_interval")]
    pub random_food_interval: u32, // 随机食物生成间隔（秒）
    #[serde(default = "default_random_food_range_min")]
    pub random_food_range_min: f64, // 食物生成范围最小值（百分比）
    #[serde(default = "default_random_food_range_max")]
    pub random_food_range_max: f64, // 食物生成范围最大值（百分比）
    #[serde(default = "default_random_food_max_count")]
    pub random_food_max_count: u32, // 同时存在的最大食物数量
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
                body_motion_mode: "wiggle".to_string(),
                head_shape: "triangle".to_string(),
                skin_texture: "solid".to_string(),
                show_power_ups: true,
                body_anim_effect: "none".to_string(),
                head_anim_effect: "none".to_string(),
                tail_anim_effect: "none".to_string(),
                start_position: "top-left".to_string(),
                direction: "clockwise".to_string(),
                display_mode: "full".to_string(),
                random_food_enabled: true,
                random_food_interval: 15,
                random_food_range_min: 0.5,
                random_food_range_max: 5.0,
                random_food_max_count: 5,
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
            ThemePreset {
                name: "aurora".to_string(),
                label: "极光".to_string(),
                snake_color: "#00FF87,#60EFFF,#7B2FF7".to_string(),
                head_color: "#FFFFFF".to_string(),
                color_mode: "gradient".to_string(),
                pixel_size: 6,
                opacity: 85,
            },
            ThemePreset {
                name: "sunset".to_string(),
                label: "日落".to_string(),
                snake_color: "#FF6B35,#FF2E63,#8E2DE2".to_string(),
                head_color: "#FFD93D".to_string(),
                color_mode: "gradient".to_string(),
                pixel_size: 8,
                opacity: 90,
            },
            ThemePreset {
                name: "matrix".to_string(),
                label: "黑客帝国".to_string(),
                snake_color: "#00FF41".to_string(),
                head_color: "#39FF14".to_string(),
                color_mode: "solid".to_string(),
                pixel_size: 4,
                opacity: 100,
            },
            ThemePreset {
                name: "neon".to_string(),
                label: "霓虹".to_string(),
                snake_color: "#FF073A,#39FF14,#00F0FF,#FF61D8".to_string(),
                head_color: "#FFFFFF".to_string(),
                color_mode: "gradient".to_string(),
                pixel_size: 6,
                opacity: 95,
            },
            ThemePreset {
                name: "lavender".to_string(),
                label: "薰衣草".to_string(),
                snake_color: "#C77DFF,#9D4EDD,#7B2CBF".to_string(),
                head_color: "#E0AAFF".to_string(),
                color_mode: "gradient".to_string(),
                pixel_size: 8,
                opacity: 80,
            },
            ThemePreset {
                name: "gold".to_string(),
                label: "黑金".to_string(),
                snake_color: "#FFD700,#FFA500".to_string(),
                head_color: "#FFFFFF".to_string(),
                color_mode: "gradient".to_string(),
                pixel_size: 10,
                opacity: 90,
            },
            ThemePreset {
                name: "mint".to_string(),
                label: "薄荷".to_string(),
                snake_color: "#2EC4B6,#CBF3F0".to_string(),
                head_color: "#FFFFFF".to_string(),
                color_mode: "gradient".to_string(),
                pixel_size: 8,
                opacity: 75,
            },
            ThemePreset {
                name: "lava".to_string(),
                label: "熔岩".to_string(),
                snake_color: "#FF0000,#FF4500,#FF8C00".to_string(),
                head_color: "#FFD700".to_string(),
                color_mode: "gradient".to_string(),
                pixel_size: 8,
                opacity: 95,
            },
            ThemePreset {
                name: "ice".to_string(),
                label: "冰霜".to_string(),
                snake_color: "#A8DADC,#457B9D,#1D3557".to_string(),
                head_color: "#F1FAEE".to_string(),
                color_mode: "gradient".to_string(),
                pixel_size: 8,
                opacity: 80,
            },
            ThemePreset {
                name: "forest".to_string(),
                label: "森林".to_string(),
                snake_color: "#2D6A4F,#40916C,#52B788".to_string(),
                head_color: "#B7E4C7".to_string(),
                color_mode: "gradient".to_string(),
                pixel_size: 8,
                opacity: 85,
            },
            ThemePreset {
                name: "candy".to_string(),
                label: "糖果".to_string(),
                snake_color: "#FF6F91,#FF9671,#FFC75F,#F9F871".to_string(),
                head_color: "#FFFFFF".to_string(),
                color_mode: "gradient".to_string(),
                pixel_size: 10,
                opacity: 85,
            },
            ThemePreset {
                name: "stealth".to_string(),
                label: "隐身".to_string(),
                snake_color: "#333333".to_string(),
                head_color: "#666666".to_string(),
                color_mode: "solid".to_string(),
                pixel_size: 2,
                opacity: 30,
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

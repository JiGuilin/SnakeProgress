# 🐍 SnakeProgress

> 把"时间进度"变成"屏幕边框的一部分"——无需打开任何应用，只需瞟一眼屏幕边框，就知道工作日走了多远。

SnakeProgress 是一款基于 **Tauri 2 + Canvas 2D** 的桌面常驻工具，以经典贪吃蛇像素风格沿屏幕四周边框可视化展示当日工作进度。零交互成本，开机自启，鼠标穿透不干扰操作。

---

## ✨ 核心特性

### 📊 进度展示
- 蛇身沿屏幕边框移动，蛇头位置精确映射当前进度
- 支持尾随模式（蛇身=已完成进度）和固定长度模式（固定长度蛇跟随进度移动）
- 鼠标悬停显示进度百分比 Tooltip
- 到达下班时间触发庆祝动画

### 🎨 丰富外观
- **18 套内置主题**：经典绿、赛博朋克、像素红白机、暗黑、海洋、樱花、极光、日落、黑客帝国、霓虹、薰衣草、黑金、薄荷、熔岩、冰霜、森林、糖果、隐身
- 蛇身颜色支持纯色 / 多色渐变 / 彩虹模式
- 蛇头/蛇尾颜色独立设置
- 像素大小、透明度、边框边距自由调节

### 🎬 动效系统
- **蛇身特效**（8种）：呼吸灯、脉冲波纹、色彩波浪、星光闪烁、彩虹流光、外发光、水波纹
- **蛇身动画**（4种）：抖动、波浪、弹跳、缠绕
- **蛇头动画**（5种）：点头、浮动、摇摆、颤抖、弹跳
- **尾巴动画**（5种）：摆尾、卷尾、脉动尾、火焰尾、流动尾
- 蛇头形状：三角形、长方形、正方形、圆形、菱形 + 4种像素素材风格
- 皮肤纹理：纯色、鳞片、条纹、圆点 + 4种像素素材纹理
- 里程碑道具：25%/50%/75% 进度处显示食物

### ⚙️ 自定义路径
- **起始位置**：左上角 / 右上角 / 左下角 / 右下角
- **运动方向**：顺时针 / 逆时针
- **显示模式**：全屏环绕 / 单边模式

### 🖥️ 显示控制
- 全屏时自动隐藏
- 鼠标穿透（不拦截点击）
- 开机自启
- 非工作日显示控制
- 全局快捷键 `Ctrl+Shift+S` 切换显示/隐藏

### 📅 时间管理
- 自定义上下班时间
- 可选午休时段（午休期间蛇身暂停）
- 工作日选择（周一至周日）
- 实时进度预览

### 💾 数据管理
- 配置自动保存（JSON 格式）
- 支持配置导入/导出
- 配置版本迁移

---

## 🛠️ 技术栈

| 层 | 技术 | 说明 |
|:---|:---|:---|
| **桌面框架** | Tauri 2 | 轻量级桌面应用框架，~5MB 安装包 |
| **前端渲染** | HTML + CSS + Canvas 2D | 无框架依赖，原生 JS 驱动 |
| **后端** | Rust | 时间计算、窗口管理、系统集成 |
| **渲染方式** | `requestAnimationFrame` | 30fps 帧率限制，低 CPU 占用 |

### 项目结构

```
SnakeProgress/
├── snake-progress-app/
│   ├── src/                    # 前端源码
│   │   ├── index.html          # 主窗口（蛇身渲染）
│   │   ├── main.js             # 核心渲染引擎 + 进度计算
│   │   ├── settings.html       # 设置面板
│   │   ├── settings.js         # 设置面板逻辑
│   │   ├── sprite-generator.js # 像素素材生成器
│   │   └── styles.css          # 设置面板样式
│   └── src-tauri/              # Rust 后端
│       ├── src/
│       │   ├── main.rs         # 入口
│       │   ├── lib.rs          # Tauri 命令 + 系统集成
│       │   ├── config.rs       # 配置管理 + 主题预设
│       │   └── progress.rs     # 进度计算引擎
│       ├── Cargo.toml
│       └── tauri.conf.json     # Tauri 配置
├── 需求文档.MD
└── README.md
```

---

## 🚀 快速开始

### 环境要求

- [Node.js](https://nodejs.org/) 18+
- [Rust](https://www.rust-lang.org/) 1.70+
- Tauri 2 CLI 前置依赖（参见 [Tauri 官方文档](https://tauri.app/start/prerequisites/)）

### 开发运行

```bash
cd snake-progress-app
npm install
npm run tauri dev
```

### 构建发布

```bash
cd snake-progress-app
npm run tauri build
```

构建产物位于 `snake-progress-app/src-tauri/target/release/`。

---

## ⌨️ 快捷键

| 快捷键 | 功能 |
|:---|:---|
| `Ctrl+Shift+S` | 显示/隐藏蛇身 |

---

## 📝 配置文件

配置文件位于系统应用数据目录：

- **Windows**: `%APPDATA%\SnakeProgress\config.json`
- **macOS**: `~/Library/Application Support/SnakeProgress/config.json`
- **Linux**: `~/.config/SnakeProgress/config.json`

---

## 📜 License

MIT License

---

> 🐍 让时间感知变得有趣而无声。

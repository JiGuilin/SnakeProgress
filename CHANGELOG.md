# Changelog

本项目所有显著变更均记录在此文件中。

格式基于 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，
版本号遵循 [Semantic Versioning](https://semver.org/lang/zh-CN/)。

## [Unreleased]

### Changed

- 前端 `main.js` 拆分为 `path` / `effects` / `render` / `ui` 独立 ES Module，入口仅负责状态与编排

## [0.2.0] - 2026-08-07

### Added

- 蛇头形状：箭头、六边形、星形
- 皮肤纹理：描边、十字
- 蛇身特效：闪电、霓虹、火焰
- 像素风格蛇头：幽灵、骑士、外星
- 像素风格皮肤：水晶、电路、熔岩
- 随机食物生成范围与最大数量设置

### Changed

- 路径采样与 `pixelSize` 解耦，不同像素大小下移动更平滑
- 蛇身生成动画改为约 10 秒 easeInOutQuad 生长
- 蠕动改为弧度累积，避免波浪重复感
- 渲染性能优化：路径缓存复用、光晕渐变缓存、庆祝粒子预生成

### Fixed

- 窗口隐藏时停止 `requestAnimationFrame` 与全部定时器，消除 WebView2 隐藏态 IO

## [0.1.0] - 2026-08-06

### Added

- 基于 Tauri 2 + Canvas 2D 的桌面贪吃蛇进度条（初版）
- 工作时段 / 午休 / 工作日进度映射到屏幕边框蛇身
- 18 套主题、尾随/固定长度模式、鼠标穿透、开机自启、全局快捷键
- 系统托盘菜单（显示/隐藏、设置、详细信息、打卡、关于）
- 蛇头形状（三角/长方/正方/圆/菱形）与皮肤纹理（鳞片/条纹/圆点）
- 蛇身 / 蛇头 / 尾巴动画效果
- 像素精灵图生成器与 25%/50%/75% 里程碑道具
- 起始位置、运动方向、显示模式（全屏环绕 / 单边）
- 随机食物、蛇身点击详情弹窗、蛇头跟随鼠标、上下班打卡
- 设置页左侧 Tab 导航与深浅主题切换
- GitHub Actions 多平台 Release 工作流与项目文档

### Fixed

- 1px 模式坐标对齐整数网格
- 渐变主题下发光体 sprite 崩溃导致进度条不可见
- 蛇头像素素材方向错误
- 午休时段落在工作时段之外时进度计算错误
- 穿透模式下蛇头跟随鼠标失效
- 跨平台编译（Windows API 条件编译）

[Unreleased]: https://github.com/JiGuilin/SnakeProgress/compare/v0.2.0...HEAD
[0.2.0]: https://github.com/JiGuilin/SnakeProgress/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/JiGuilin/SnakeProgress/releases/tag/v0.1.0

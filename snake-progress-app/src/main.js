/**
 * SnakeProgress - 贪吃蛇进度条主渲染逻辑
 * 负责在 Canvas 上绘制沿屏幕边框移动的像素贪吃蛇
 */

const { invoke } = window.__TAURI__.core;
const { listen } = window.__TAURI__.event;

// ============ 全局状态 ============
let config = null;
let progressInfo = null;
let animationId = null;
const PROGRESS_UPDATE_INTERVAL = 30000; // 后端状态同步间隔（30秒），percent 由前端实时计算

// 像素素材系统
const spriteGen = new SpriteGenerator();
const powerUpSystem = new PowerUpSystem(spriteGen);
const randomFoodSystem = new RandomFoodSystem(spriteGen);
let lastMilestoneCheck = -1; // 上次检查里程碑的百分比

// 动画状态
let wiggleOffset = 0;
let headGlowPhase = 0;
let bodyAnimPhase = 0; // 蛇身动画效果相位
let celebrationActive = false;
let celebrationStart = 0;
let lastCelebrationPercent = 0;

// 淡入淡出
let fadeOpacity = 1.0;
let fadeTarget = 1.0;
const FADE_SPEED = 0.05;

// 帧率限制
const TARGET_FPS = 30;
const FRAME_INTERVAL = 1000 / TARGET_FPS;
let lastFrameTime = 0;

// Tooltip 状态
let tooltipVisible = false;
let tooltipTimer = null;

// 鼠标位置（用于蛇头跟随）
let mouseX = -9999;
let mouseY = -9999;

// 定时获取全局鼠标位置（穿透模式下 mousemove 不触发，需要从 Rust 端获取）
setInterval(async () => {
  try {
    const [x, y] = await invoke('get_cursor_pos');
    // get_cursor_pos 返回物理像素，需要转换为逻辑像素
    // 使用 devicePixelRatio 或窗口尺寸与屏幕尺寸的比例换算
    const dpr = window.devicePixelRatio || 1;
    mouseX = x / dpr;
    mouseY = y / dpr;
  } catch (e) {
    // fallback：如果获取失败，保持上次值
  }
}, 100);

// 全屏检测
let wasFullscreen = false;
let fullscreenCheckInterval = null;

// ============ Canvas 初始化 ============
const canvas = document.getElementById('snakeCanvas');
const ctx = canvas.getContext('2d');
const tooltip = document.getElementById('tooltip');

// 关于对话框
let aboutOverlay = null;

function resizeCanvas() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  const dpr = window.devicePixelRatio || 1;

  canvas.width = Math.floor(w * dpr);
  canvas.height = Math.floor(h * dpr);
  canvas.style.width = w + 'px';
  canvas.style.height = h + 'px';
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

window.addEventListener('resize', resizeCanvas);
resizeCanvas();

setInterval(() => {
  const currentW = parseInt(canvas.style.width);
  const currentH = parseInt(canvas.style.height);
  if (currentW !== window.innerWidth || currentH !== window.innerHeight) {
    resizeCanvas();
  }
}, 2000);

// ============ 配置与进度加载 ============
async function loadConfig() {
  try {
    config = await invoke('get_config');
    // 配置变更时清除 sprite 缓存
    if (typeof spriteGen !== 'undefined') spriteGen.clearCache();
  } catch (e) {
    console.error('加载配置失败:', e);
    config = getDefaultConfig();
  }
}

async function loadProgress() {
  try {
    progressInfo = await invoke('get_progress');
  } catch (e) {
    console.error('获取进度失败:', e);
  }
}

/**
 * 前端实时计算进度百分比（精确到秒）
 * 使用本地 Date 对象，避免每帧 IPC 调用
 */
function calcRealtimePercent() {
  if (!config) return 0;

  const now = new Date();
  const currentTotalSeconds = now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds();

  // 工作日判断
  const weekday = now.getDay() === 0 ? 7 : now.getDay(); // 1=周一..7=周日
  const workdays = config.workTime.workdays || [1, 2, 3, 4, 5];
  if (!workdays.includes(weekday)) return 0;

  const parseTime = (str) => {
    const [h, m] = str.split(':').map(Number);
    return h * 3600 + m * 60;
  };

  const startSec = parseTime(config.workTime.start);
  const endSec = parseTime(config.workTime.end);

  // 午休（仅计算落在工作时段内的午休时间）
  const lunchEnabled = config.workTime.lunch.enabled;
  const lunchStartSec = parseTime(config.workTime.lunch.start);
  const lunchEndSec = parseTime(config.workTime.lunch.end);
  const lunchDuration = lunchEnabled
    ? Math.max(0, Math.min(lunchEndSec, endSec) - Math.max(lunchStartSec, startSec))
    : 0;

  const totalSec = Math.max(0, endSec - startSec);
  const totalWorkSec = totalSec - lunchDuration;

  if (totalWorkSec <= 0) return 0;

  // 上班前
  if (currentTotalSeconds < startSec) return 0;

  // 下班后
  if (currentTotalSeconds >= endSec) return 100;

  // 午休中（仅在午休与工作时段有交集时才生效）
  if (lunchEnabled && lunchDuration > 0
      && currentTotalSeconds >= Math.max(lunchStartSec, startSec)
      && currentTotalSeconds < Math.min(lunchEndSec, endSec)) {
    const elapsedToLunch = Math.max(0, Math.max(lunchStartSec, startSec) - startSec);
    return (elapsedToLunch / totalWorkSec) * 100;
  }

  // 工作中
  let elapsed = currentTotalSeconds - startSec;
  if (lunchEnabled && currentTotalSeconds >= Math.min(lunchEndSec, endSec)) {
    elapsed -= lunchDuration;
  }
  elapsed = Math.max(0, elapsed);

  return Math.min(100, (elapsed / totalWorkSec) * 100);
}

function getDefaultConfig() {
  return {
    version: '1.0.0',
    workTime: {
      start: '09:00', end: '18:00',
      lunch: { enabled: true, start: '12:00', end: '13:00' },
      workdays: [1, 2, 3, 4, 5],
    },
    appearance: {
      theme: 'classic', snakeColor: '#00FF00', headColor: '#FFFF00',
      colorMode: 'solid', rainbowMode: false, pixelSize: 8,
      opacity: 80, margin: 2, snakeLengthMode: 'trailing',
      fixedLengthPercent: 20, animationSpeed: 'normal',
      showTrail: false, headGlow: true, straightMode: false, bodyMotionMode: 'wiggle', headShape: 'triangle', skinTexture: 'solid',
      showPowerUps: true, bodyAnimEffect: 'none', headAnimEffect: 'none', tailAnimEffect: 'none',
      startPosition: 'top-left', direction: 'clockwise', displayMode: 'full',
      randomFoodEnabled: true, randomFoodInterval: 15,
    },
    display: {
      monitor: 'primary', autoHideFullscreen: true,
      clickThrough: true, autoStart: true,
      showOnNonWorkdays: false, nonWorkdayStyle: 'hidden',
    },
    shortcut: { toggleVisibility: 'Ctrl+Shift+S' },
    celebration: { enabled: true, duration: 3000, celebrationType: 'fireworks' },
  };
}

// ============ 蛇身路径计算 ============

/**
 * 计算蛇身沿屏幕边框的路径点（逻辑像素坐标）
 * 每个点间隔 pixelSize，按顺时针排列
 */
function calculateBorderPath(width, height, margin, pixelSize) {
  const ps = pixelSize;
  const alignToGrid = ps <= 2;
  const m = alignToGrid
    ? Math.round(margin + ps / 2)
    : margin + ps / 2;

  const startPos = (config.appearance.startPosition) || 'top-left';
  const direction = (config.appearance.direction) || 'clockwise';
  const displayMode = (config.appearance.displayMode) || 'full';

  // 单边模式：由起始位置+方向决定具体在哪条边
  if (displayMode === 'single') {
    return calculateSingleSidePath(width, height, m, ps, alignToGrid, startPos, direction);
  }

  // 全屏模式：生成四边路径
  // 先生成四条边的点数组
  const top = [], right = [], bottom = [], left = [];
  for (let x = m; x <= width - m + 0.5; x += ps) {
    top.push({ x: alignToGrid ? Math.round(x) : x, y: m, side: 'top' });
  }
  for (let y = m + ps; y <= height - m + 0.5; y += ps) {
    right.push({ x: width - m, y: alignToGrid ? Math.round(y) : y, side: 'right' });
  }
  for (let x = width - m - ps; x >= m - 0.5; x -= ps) {
    bottom.push({ x: alignToGrid ? Math.round(x) : x, y: height - m, side: 'bottom' });
  }
  for (let y = height - m - ps; y >= m + ps - 0.5; y -= ps) {
    left.push({ x: m, y: alignToGrid ? Math.round(y) : y, side: 'left' });
  }

  // 根据起始位置和方向排列四条边的顺序
  // 顺时针边顺序映射
  const cwOrder = {
    'top-left':    ['top', 'right', 'bottom', 'left'],
    'top-right':   ['right', 'bottom', 'left', 'top'],
    'bottom-right':['bottom', 'left', 'top', 'right'],
    'bottom-left': ['left', 'top', 'right', 'bottom'],
  };
  // 逆时针边顺序映射
  const ccwOrder = {
    'top-left':    ['left', 'bottom', 'right', 'top'],
    'top-right':   ['top', 'left', 'bottom', 'right'],
    'bottom-right':['right', 'top', 'left', 'bottom'],
    'bottom-left': ['bottom', 'right', 'top', 'left'],
  };

  const orderMap = direction === 'counterclockwise' ? ccwOrder : cwOrder;
  const order = orderMap[startPos] || cwOrder['top-left'];
  const sideMap = { top, right, bottom, left };

  // 逆时针时，每条边的点需要反转（因为行进方向相反）
  const path = [];
  for (const side of order) {
    const points = sideMap[side];
    if (direction === 'counterclockwise') {
      // 逆时针：反转每条边的点序，并修正 side 标记
      for (let i = points.length - 1; i >= 0; i--) {
        path.push({ ...points[i] });
      }
    } else {
      for (const p of points) {
        path.push({ ...p });
      }
    }
  }

  return path;
}

/**
 * 计算单边模式的路径
 * 起始位置+方向决定具体在哪条边及行进方向：
 *   顺时针：top-left→上(左→右), top-right→右(上→下), bottom-right→下(右→左), bottom-left→左(下→上)
 *   逆时针：top-left→左(上→下), top-right→上(右→左), bottom-right→右(下→上), bottom-left→下(左→右)
 */
function calculateSingleSidePath(width, height, m, ps, alignToGrid, startPos, direction) {
  const path = [];
  const addPoint = (x, y, s) => path.push({ x: alignToGrid ? Math.round(x) : x, y: alignToGrid ? Math.round(y) : y, side: s });

  // 推导出具体边和行进方向
  const cwMap = {
    'top-left':    { side: 'top',    forward: true  }, // 上边 左→右
    'top-right':   { side: 'right',  forward: true  }, // 右边 上→下
    'bottom-right':{ side: 'bottom', forward: false }, // 下边 右→左
    'bottom-left': { side: 'left',   forward: false }, // 左边 下→上
  };
  const ccwMap = {
    'top-left':    { side: 'left',   forward: true  }, // 左边 上→下
    'top-right':   { side: 'top',    forward: false }, // 上边 右→左
    'bottom-right':{ side: 'right',  forward: false }, // 右边 下→上
    'bottom-left': { side: 'bottom', forward: true  }, // 下边 左→右
  };

  const map = direction === 'counterclockwise' ? ccwMap : cwMap;
  const cfg = map[startPos] || cwMap['top-left'];
  const side = cfg.side;
  const forward = cfg.forward;

  switch (side) {
    case 'top':
      if (forward) { for (let x = m; x <= width - m + 0.5; x += ps) addPoint(x, m, 'top'); }
      else         { for (let x = width - m; x >= m - 0.5; x -= ps) addPoint(x, m, 'top'); }
      break;
    case 'right':
      if (forward) { for (let y = m; y <= height - m + 0.5; y += ps) addPoint(width - m, y, 'right'); }
      else         { for (let y = height - m; y >= m - 0.5; y -= ps) addPoint(width - m, y, 'right'); }
      break;
    case 'bottom':
      if (forward) { for (let x = m; x <= width - m + 0.5; x += ps) addPoint(x, height - m, 'bottom'); }
      else         { for (let x = width - m; x >= m - 0.5; x -= ps) addPoint(x, height - m, 'bottom'); }
      break;
    case 'left':
      if (forward) { for (let y = m; y <= height - m + 0.5; y += ps) addPoint(m, y, 'left'); }
      else         { for (let y = height - m; y >= m - 0.5; y -= ps) addPoint(m, y, 'left'); }
      break;
  }
  return path;
}

function getSnakeBlocks(percent, path) {
  const totalBlocks = path.length;
  if (totalBlocks === 0) return [];

  // 精确的浮点索引，支持亚像素级平滑移动
  const exactIndex = (percent / 100) * totalBlocks;
  const headBlockIndex = Math.min(Math.floor(exactIndex), totalBlocks - 1);
  // 蛇头在当前点与下一点之间的插值比例 [0, 1)
  const frac = exactIndex - Math.floor(exactIndex);

  let startBlock = 0;
  if (config.appearance.snakeLengthMode === 'fixed') {
    const fixedLength = Math.floor(totalBlocks * (config.appearance.fixedLengthPercent / 100));
    startBlock = Math.max(0, headBlockIndex - fixedLength);
  }

  const blocks = [];
  for (let i = startBlock; i <= headBlockIndex; i++) {
    blocks.push({
      x: path[i].x,
      y: path[i].y,
      side: path[i].side,
      index: i,
      isHead: i === headBlockIndex,
      progressRatio: totalBlocks > 1 ? i / (totalBlocks - 1) : 0,
    });
  }

  // 蛇头线性插值：在当前点与下一点之间平滑过渡
  if (blocks.length > 0 && frac > 0 && headBlockIndex < totalBlocks - 1) {
    const head = blocks[blocks.length - 1];
    const next = path[headBlockIndex + 1];
    head.x = head.x + (next.x - head.x) * frac;
    head.y = head.y + (next.y - head.y) * frac;
  }

  return blocks;
}

// ============ 颜色计算 ============

function getBlockColor(block) {
  const opacity = (config.appearance.opacity / 100) * fadeOpacity;

  if (config.appearance.rainbowMode) {
    const hue = (block.progressRatio * 360) % 360;
    return `hsla(${hue}, 100%, 55%, ${opacity})`;
  }

  if (config.appearance.colorMode === 'gradient') {
    const colors = config.appearance.snakeColor.split(',');
    if (colors.length >= 2) {
      return interpolateColor(colors[0], colors[1], block.progressRatio, opacity);
    }
  }

  const rgb = hexToRgb(config.appearance.snakeColor);
  return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${opacity})`;
}

function getHeadColor() {
  const rgb = hexToRgb(config.appearance.headColor);
  const opacity = (config.appearance.opacity / 100) * fadeOpacity;
  return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${opacity})`;
}

function hexToRgb(hex) {
  // 防御：多色逗号分隔时取第一个
  hex = hex.split(',')[0].trim();
  hex = hex.replace('#', '');
  return {
    r: parseInt(hex.substring(0, 2), 16),
    g: parseInt(hex.substring(2, 4), 16),
    b: parseInt(hex.substring(4, 6), 16),
  };
}

function interpolateColor(hex1, hex2, ratio, opacity) {
  const c1 = hexToRgb(hex1);
  const c2 = hexToRgb(hex2);
  const r = Math.round(c1.r + (c2.r - c1.r) * ratio);
  const g = Math.round(c1.g + (c2.g - c1.g) * ratio);
  const b = Math.round(c1.b + (c2.b - c1.b) * ratio);
  return `rgba(${r}, ${g}, ${b}, ${opacity})`;
}

// ============ 渲染引擎（帧率限制 30fps） ============

function render(timestamp) {
  if (timestamp - lastFrameTime < FRAME_INTERVAL) {
    animationId = requestAnimationFrame(render);
    return;
  }
  lastFrameTime = timestamp;

  const w = window.innerWidth;
  const h = window.innerHeight;
  ctx.clearRect(0, 0, w, h);

  if (!config || !progressInfo) {
    animationId = requestAnimationFrame(render);
    return;
  }

  if (!progressInfo.isWorkday && !config.display.showOnNonWorkdays) {
    animationId = requestAnimationFrame(render);
    return;
  }

  // 淡入淡出插值
  if (fadeOpacity < fadeTarget) {
    fadeOpacity = Math.min(fadeOpacity + FADE_SPEED, fadeTarget);
  } else if (fadeOpacity > fadeTarget) {
    fadeOpacity = Math.max(fadeOpacity - FADE_SPEED, fadeTarget);
  }

  const { pixelSize, margin, showTrail, headGlow } = config.appearance;
  const percent = calcRealtimePercent();
  const path = calculateBorderPath(w, h, margin, pixelSize);

  // 更新蠕动偏移
  const speedMap = { slow: 0.3, normal: 1, fast: 3 };
  const speed = speedMap[config.appearance.animationSpeed] || 1;
  wiggleOffset = (wiggleOffset + speed * 0.5) % pixelSize;
  // 更新蛇身动画相位
  bodyAnimPhase = (timestamp / 1000) % (Math.PI * 2);

  // 绘制轨迹
  if (showTrail) {
    drawTrail(path, percent, pixelSize);
  }

  // 绘制蛇身
  const blocks = getSnakeBlocks(percent, path);
  drawSnakeBody(blocks, pixelSize);

  // 绘制蛇头特效
  if (headGlow && blocks.length > 0) {
    drawHeadGlow(blocks[blocks.length - 1], pixelSize, timestamp);
  }

  // 绘制里程碑道具（25%/50%/75%处显示食物）
  const showPowerUps = config.appearance.showPowerUps !== false;
  if (showPowerUps) {
    powerUpSystem.drawMilestones(ctx, path, pixelSize, percent, fadeOpacity);
    // 检查里程碑收集
    const roundedPercent = Math.floor(percent);
    if (roundedPercent !== lastMilestoneCheck) {
      lastMilestoneCheck = roundedPercent;
      const collected = powerUpSystem.checkCollection(percent);
      if (collected) {
        // 可在此触发通知
      }
    }
    // 绘制吃食物动画
    powerUpSystem.drawEatAnimations(ctx, path, pixelSize, fadeOpacity);
  }

  // 随机食物系统
  const randomFoodEnabled = config.appearance.randomFoodEnabled !== false;
  if (randomFoodEnabled) {
    const foodInterval = config.appearance.randomFoodInterval || 15;
    // 尝试生成新食物
    randomFoodSystem.trySpawn(percent, path.length, foodInterval, pixelSize);
    // 检查是否吃到食物
    randomFoodSystem.checkCollection(percent);
    // 绘制食物
    randomFoodSystem.drawFoods(ctx, path, pixelSize, percent, fadeOpacity);
    // 绘制吃食物粒子动画
    randomFoodSystem.drawEatAnimations(ctx, path, pixelSize, fadeOpacity);
  }

  // 午休变色效果
  if (progressInfo.isLunchBreak) {
    drawLunchBreakOverlay(w, h);
  }

  // 庆祝动画
  if (celebrationActive) {
    drawCelebration(timestamp, w, h);
  }

  // 状态文字
  drawStatusText(w, h);

  animationId = requestAnimationFrame(render);
}

function drawTrail(path, percent, pixelSize) {
  const totalBlocks = path.length;
  const headBlockIndex = Math.floor((percent / 100) * totalBlocks);
  const opacity = 0.06 * fadeOpacity;
  const half = pixelSize / 2;
  const snap = pixelSize <= 2;

  ctx.fillStyle = `rgba(255, 255, 255, ${opacity})`;
  for (let i = headBlockIndex + 1; i < totalBlocks; i += 2) {
    const p = path[i];
    if (p) {
      const tx = snap ? Math.round(p.x - half) : p.x - half;
      const ty = snap ? Math.round(p.y - half) : p.y - half;
      ctx.fillRect(tx, ty, pixelSize, pixelSize);
    }
  }
}

function drawSnakeBody(blocks, pixelSize) {
  const gap = pixelSize >= 4 ? 1 : 0;
  const blockSize = Math.max(1, pixelSize - gap);
  const motionMode = config.appearance.bodyMotionMode || (config.appearance.straightMode ? 'straight' : 'wiggle');
  const tiny = pixelSize <= 2 || motionMode === 'straight'; // 直线模式或小像素无摆动
  const snap = tiny;
  const totalBlocks = blocks.length;
  const texture = config.appearance.skinTexture || 'solid';
  // 从蛇头形状/皮肤纹理中推导 sprite 变体
  const _headShape = config.appearance.headShape || 'triangle';
  const _skinTexture = config.appearance.skinTexture || 'solid';
  const spriteHeadVariant = _headShape.startsWith('sprite_') ? _headShape.slice(7) : null;
  const spriteBodyVariant = _skinTexture.startsWith('sprite_') ? _skinTexture.slice(7) : null;
  const useSpriteHead = spriteHeadVariant !== null;
  const useSpriteBody = spriteBodyVariant !== null;
  // 尾部渐变缩小的点数：根据像素大小动态调整
  // 像素越大，蛇尾渐变越长（1px=0, 2px=0, 4px=5, 6px=7, 8px=9, 12px=13, 16px=17...）
  let tailTaperCount = 0;
  if (pixelSize > 2) {
    tailTaperCount = Math.min(Math.max(4, Math.floor(pixelSize * 1.1)), Math.floor(totalBlocks / 3));
  }
  // 头部不抖动的点数
  const headNoWiggle = pixelSize > 2 ? 2 : 0;
  // 尾部不抖动的点数：跟随渐变长度调整
  const tailNoWiggle = pixelSize > 2 ? Math.min(Math.ceil(tailTaperCount * 0.5), 5) : 0;

  for (let bIdx = 0; bIdx < totalBlocks; bIdx++) {
    const block = blocks[bIdx];
    const bodyPos = bIdx;

    let dx = 0, dy = 0;
    if (!tiny) {
      const isHeadZone = bodyPos >= totalBlocks - headNoWiggle;
      const isTailZone = bodyPos < tailNoWiggle;
      if (!isHeadZone && !isTailZone) {
        const isVertical = block.side === 'top' || block.side === 'bottom';
        switch (motionMode) {
          case 'wave': {
            // 波浪：大幅正弦波，蛇身像水波一样起伏
            const wave = Math.sin((block.index + wiggleOffset) * 0.35) * Math.min(2, pixelSize * 0.3);
            if (isVertical) { dy = wave; } else { dx = wave; }
            break;
          }
          case 'bounce': {
            // 弹跳：整段蛇身上下弹跳，幅度随位置变化
            const bounce = Math.abs(Math.sin((block.index + wiggleOffset) * 0.3)) * Math.min(2, pixelSize * 0.25);
            if (isVertical) { dy = -bounce; } else { dx = -bounce; }
            break;
          }
          case 'coil': {
            // 缠绕：双轴交叉波动，营造蛇身缠绕感
            const c1 = Math.sin((block.index + wiggleOffset) * 0.4) * Math.min(1.5, pixelSize * 0.18);
            const c2 = Math.cos((block.index + wiggleOffset) * 0.25) * Math.min(1, pixelSize * 0.1);
            dx = c1; dy = c2;
            break;
          }
          case 'wiggle':
          default: {
            // 抖动（默认）：原有小幅摆动
            const wiggle = Math.sin((block.index + wiggleOffset) * 0.5) * Math.min(1, pixelSize * 0.12);
            if (isVertical) { dy = wiggle; } else { dx = wiggle; }
            break;
          }
        }
      }
    }

    // 尾部渐变缩放：像素越大，尾部末端越尖
    let scale = 1;
    if (tailTaperCount > 0 && bodyPos < tailTaperCount) {
      scale = (bodyPos + 1) / tailTaperCount;
      const minScale = pixelSize > 8 ? 0.15 : pixelSize > 4 ? 0.2 : 0.3;
      scale = Math.max(minScale, scale);
    }

    if (block.isHead && pixelSize > 2) {
      const headSize = pixelSize + 2;
      // 蛇头动画偏移
      const headAnim = config.appearance.headAnimEffect || 'none';
      let headDx = 0, headDy = 0;
      if (headAnim !== 'none') {
        const headOff = calcHeadAnimOffset(block, pixelSize, headAnim);
        headDx = headOff.dx;
        headDy = headOff.dy;
      }
      if (useSpriteHead) {
        drawSpriteHead(block, headSize, dx + headDx, dy + headDy, spriteHeadVariant);
      } else {
        drawHead(block, headSize, dx + headDx, dy + headDy);
      }
    } else {
      // 尾巴动画偏移
      const tailAnim = config.appearance.tailAnimEffect || 'none';
      let tailDx = 0, tailDy = 0, tailScale = 1;
      if (tailAnim !== 'none' && tailTaperCount > 0 && bodyPos < tailTaperCount) {
        const tailOff = calcTailAnimOffset(block, bIdx, tailTaperCount, pixelSize, tailAnim);
        tailDx = tailOff.dx;
        tailDy = tailOff.dy;
        if (tailOff.scale) tailScale = tailOff.scale;
      }
      const scaledSize = Math.max(1, blockSize * scale * tailScale);
      const bx = snap ? Math.round(block.x - scaledSize / 2 + dx + tailDx) : block.x - scaledSize / 2 + dx + tailDx;
      const by = snap ? Math.round(block.y - scaledSize / 2 + dy + tailDy) : block.y - scaledSize / 2 + dy + tailDy;

      if (useSpriteBody) {
        // 使用 sprite 素材绘制蛇身
        drawSpriteBodyBlock(bx, by, scaledSize, block, bIdx, spriteBodyVariant);
      } else if (texture === 'solid' || pixelSize <= 3) {
        // 纯色模式或小像素：直接绘制方块
        ctx.fillStyle = block.isHead ? getHeadColor() : getBlockColor(block);
        ctx.fillRect(bx, by, scaledSize, scaledSize);
      } else if (texture === 'checkerboard') {
        // 鳞片（棋盘格）：交替亮暗方块
        drawCheckerboardBlock(bx, by, scaledSize, block, bIdx);
      } else if (texture === 'stripe') {
        // 条纹：方块内绘制横/竖条纹
        drawStripeBlock(bx, by, scaledSize, block);
      } else if (texture === 'dots') {
        // 圆点：方块内绘制圆点
        drawDotsBlock(bx, by, scaledSize, block, bIdx);
      }

      // 蛇身动画效果叠加
      const bodyAnim = config.appearance.bodyAnimEffect || 'none';
      if (bodyAnim !== 'none') {
        drawBodyAnimEffect(bx, by, scaledSize, block, bIdx, totalBlocks, bodyAnim);
      }
    }
  }
}

/**
 * 蛇身动画效果叠加
 * @param {number} bx - 方块左上角 x
 * @param {number} by - 方块左上角 y
 * @param {number} size - 方块尺寸
 * @param {Object} block - 蛇身块数据
 * @param {number} bIdx - 在蛇身中的索引
 * @param {number} total - 蛇身总块数
 * @param {string} effect - 效果类型: breathing, pulse, wave, sparkle
 */
function drawBodyAnimEffect(bx, by, size, block, bIdx, total, effect) {
  const phase = bodyAnimPhase;
  const cx = bx + size / 2;
  const cy = by + size / 2;

  switch (effect) {
    case 'breathing': {
      // 呼吸灯：整条蛇明暗周期性缓慢脉动
      const breathVal = Math.sin(phase * 0.8);
      if (breathVal > 0) {
        // 亮相：叠加白色高光
        ctx.fillStyle = `rgba(255, 255, 255, ${breathVal * 0.35 * fadeOpacity})`;
      } else {
        // 暗相：叠加黑色遮罩
        ctx.fillStyle = `rgba(0, 0, 0, ${-breathVal * 0.25 * fadeOpacity})`;
      }
      ctx.fillRect(bx, by, size, size);
      break;
    }
    case 'pulse': {
      // 脉冲：从蛇尾向蛇头传播的亮色光带，宽度较大
      const pulseSpeed = 2;
      const pulseLen = 0.25; // 光带宽度占蛇长25%
      const headRatio = bIdx / total;
      const pulsePos = (phase * pulseSpeed / (Math.PI * 2)) % 1;
      const dist = Math.abs(headRatio - pulsePos);
      const wrappedDist = Math.min(dist, 1 - dist);
      if (wrappedDist < pulseLen) {
        // 中心最亮，边缘渐弱
        const intensity = Math.pow(1 - wrappedDist / pulseLen, 1.5) * 0.55;
        ctx.fillStyle = `rgba(255, 255, 255, ${intensity * fadeOpacity})`;
        ctx.fillRect(bx, by, size, size);
      }
      break;
    }
    case 'wave': {
      // 色彩波浪：沿蛇身流动的彩虹色带，较强可见度
      const waveHue = ((bIdx / total) * 360 + phase * 60) % 360;
      const waveAlpha = 0.45 * fadeOpacity;
      ctx.fillStyle = `hsla(${waveHue}, 90%, 60%, ${waveAlpha})`;
      ctx.fillRect(bx, by, size, size);
      break;
    }
    case 'sparkle': {
      // 闪烁星光：随机位置出现的明显亮点+十字光芒
      const seed = block.index * 7 + Math.floor(phase * 4);
      const rand = Math.sin(seed * 12.9898 + seed * 78.233) * 43758.5453;
      const sparkleChance = rand - Math.floor(rand);
      if (sparkleChance > 0.75) { // 更多方块参与闪烁
        const flicker = 0.5 + Math.sin(phase * 5 + block.index) * 0.5; // 0~1 闪烁
        const sparkleAlpha = flicker * 0.8 * fadeOpacity;
        const dotR = Math.max(1.5, size * 0.35);
        // 中心亮点
        ctx.fillStyle = `rgba(255, 255, 255, ${sparkleAlpha})`;
        ctx.beginPath();
        ctx.arc(cx, cy, dotR, 0, Math.PI * 2);
        ctx.fill();
        // 十字光芒（仅大方块时）
        if (size >= 6) {
          const armLen = size * 0.6;
          ctx.strokeStyle = `rgba(255, 255, 255, ${sparkleAlpha * 0.5})`;
          ctx.lineWidth = Math.max(1, size * 0.08);
          ctx.beginPath();
          ctx.moveTo(cx - armLen, cy); ctx.lineTo(cx + armLen, cy);
          ctx.moveTo(cx, cy - armLen); ctx.lineTo(cx, cy + armLen);
          ctx.stroke();
        }
      }
      break;
    }
    case 'rainbow': {
      // 彩虹流光：饱和度更高的彩虹色沿蛇身流动，带渐变过渡
      const rainbowHue = ((bIdx / total) * 720 + phase * 80) % 360;
      const rainbowAlpha = 0.5 * fadeOpacity;
      const saturation = 95;
      const lightness = 55 + Math.sin(phase * 1.5 + bIdx * 0.4) * 10;
      ctx.fillStyle = `hsla(${rainbowHue}, ${saturation}%, ${lightness}%, ${rainbowAlpha})`;
      ctx.fillRect(bx, by, size, size);
      break;
    }
    case 'glow': {
      // 外发光：每个方块外围叠加柔和辉光
      const glowPulse = 0.4 + Math.sin(phase * 1.2 + bIdx * 0.3) * 0.2;
      const glowR = size * 0.7;
      const grad = ctx.createRadialGradient(cx, cy, size * 0.2, cx, cy, glowR);
      grad.addColorStop(0, `rgba(255, 220, 100, ${glowPulse * fadeOpacity})`);
      grad.addColorStop(1, `rgba(255, 220, 100, 0)`);
      ctx.fillStyle = grad;
      ctx.fillRect(bx - glowR * 0.3, by - glowR * 0.3, size + glowR * 0.6, size + glowR * 0.6);
      break;
    }
    case 'ripple': {
      // 水波纹：从蛇头向蛇尾传播的环形波纹
      const rippleSpeed = 1.5;
      const rippleLen = 0.2;
      const headRatio = bIdx / total;
      const ripplePos = (phase * rippleSpeed / (Math.PI * 2)) % 1;
      const dist = Math.abs(headRatio - ripplePos);
      const wrappedDist = Math.min(dist, 1 - dist);
      if (wrappedDist < rippleLen) {
        const waveVal = Math.sin((wrappedDist / rippleLen) * Math.PI * 2);
        if (waveVal > 0) {
          const rippleAlpha = waveVal * 0.35 * fadeOpacity;
          ctx.strokeStyle = `rgba(100, 200, 255, ${rippleAlpha})`;
          ctx.lineWidth = Math.max(1, size * 0.15);
          ctx.beginPath();
          ctx.arc(cx, cy, size * 0.45, 0, Math.PI * 2);
          ctx.stroke();
        }
      }
      break;
    }
  }
}

/**
 * 蛇头动画偏移计算
 * @returns {{ dx: number, dy: number }}
 */
function calcHeadAnimOffset(headBlock, pixelSize, effect) {
  const phase = bodyAnimPhase;
  const amp = pixelSize * 0.6; // 动画幅度
  const side = headBlock.side;

  switch (effect) {
    case 'nod': {
      // 点头：沿前进方向前后摆动
      const offset = Math.sin(phase * 2) * amp;
      if (side === 'top') return { dx: offset, dy: 0 };
      if (side === 'right') return { dx: 0, dy: offset };
      if (side === 'bottom') return { dx: -offset, dy: 0 };
      return { dx: 0, dy: -offset };
    }
    case 'bob': {
      // 上下浮动：垂直于前进方向摆动
      const offset = Math.sin(phase * 2.5) * amp * 0.8;
      if (side === 'top' || side === 'bottom') return { dx: 0, dy: offset };
      return { dx: offset, dy: 0 };
    }
    case 'wobble': {
      // 摇摆：双轴混合摆动
      const ox = Math.sin(phase * 3) * amp * 0.5;
      const oy = Math.cos(phase * 2.3) * amp * 0.5;
      return { dx: ox, dy: oy };
    }
    case 'shake': {
      // 颤抖：高频小幅快速振动
      const sx = Math.sin(phase * 12) * amp * 0.25;
      const sy = Math.cos(phase * 11) * amp * 0.25;
      return { dx: sx, dy: sy };
    }
    case 'bounce': {
      // 弹跳：沿垂直方向弹跳（利用 abs(sin) 实现弹跳感）
      const bounceY = -Math.abs(Math.sin(phase * 3)) * amp * 0.8;
      if (side === 'top' || side === 'bottom') return { dx: 0, dy: bounceY };
      return { dx: bounceY, dy: 0 };
    }
    default:
      return { dx: 0, dy: 0 };
  }
}

/**
 * 尾巴动画偏移计算
 * @returns {{ dx: number, dy: number, scale?: number }}
 */
function calcTailAnimOffset(block, bIdx, tailLen, pixelSize, effect) {
  const phase = bodyAnimPhase;
  const progress = bIdx / tailLen; // 0=尾尖, 1=尾根
  const amp = pixelSize * 0.5 * progress; // 越靠近尾尖幅度越大... 不对，反过来更自然
  const ampByPos = pixelSize * 0.4 * (1 - progress); // 尾根幅度大，尾尖小
  const side = block.side;

  switch (effect) {
    case 'swish': {
      // 摆尾：沿垂直方向来回摆动，越靠近尾根越明显
      const offset = Math.sin(phase * 3 + bIdx * 0.5) * ampByPos;
      if (side === 'top' || side === 'bottom') return { dx: 0, dy: offset };
      return { dx: offset, dy: 0 };
    }
    case 'curl': {
      // 卷尾：尾巴末端周期性收缩变细
      const curlFactor = Math.sin(phase * 2) * 0.3;
      const extraScale = 1 + (progress < 0.5 ? curlFactor * (1 - progress * 2) : 0);
      return { dx: 0, dy: 0, scale: Math.max(0.2, extraScale) };
    }
    case 'pulse': {
      // 脉动尾：尾巴整体大小周期性变化
      const pulseFactor = 1 + Math.sin(phase * 2.5 + bIdx * 0.3) * 0.25;
      return { dx: 0, dy: 0, scale: pulseFactor };
    }
    case 'flame': {
      // 火焰尾：尾巴末端不规则抖动+缩放模拟火焰
      const flameOff = Math.sin(phase * 5 + bIdx * 1.7) * ampByPos * 0.6;
      const flameScale = 1 + Math.sin(phase * 4 + bIdx * 2.1) * 0.2 * (1 - progress);
      if (side === 'top' || side === 'bottom') return { dx: flameOff, dy: 0, scale: Math.max(0.2, flameScale) };
      return { dx: 0, dy: flameOff, scale: Math.max(0.2, flameScale) };
    }
    case 'flow': {
      // 流动尾：尾巴沿前进方向周期性流动偏移
      const flowOff = Math.sin(phase * 2 + bIdx * 0.8) * ampByPos * 0.5;
      if (side === 'top') return { dx: flowOff, dy: 0 };
      if (side === 'right') return { dx: 0, dy: flowOff };
      if (side === 'bottom') return { dx: -flowOff, dy: 0 };
      return { dx: 0, dy: -flowOff };
    }
    default:
      return { dx: 0, dy: 0 };
  }
}

/**
 * 使用 Sprite 素材绘制蛇头
 */
function drawSpriteHead(headBlock, headSize, dx, dy, variant) {
  // 蛇头跟随鼠标偏移
  let followDx = 0, followDy = 0;
  const ps = config.appearance.pixelSize;
  if (ps > 2) {
    const distToMouse = Math.hypot(mouseX - headBlock.x, mouseY - headBlock.y);
    const followRange = ps * 12;
    if (distToMouse < followRange && distToMouse > 0) {
      const strength = (1 - distToMouse / followRange) * ps * 0.35;
      followDx = (mouseX - headBlock.x) / distToMouse * strength;
      followDy = (mouseY - headBlock.y) / distToMouse * strength;
    }
  }

  const cx = headBlock.x + dx + followDx;
  const cy = headBlock.y + dy + followDy;
  // side 是蛇身所在边，需转换为蛇的前进方向
  const isCCW = (config.appearance.direction) === 'counterclockwise';
  // 顺时针：top→右, right→下, bottom→左, left→上
  // 逆时针：top→左, left→下, bottom→右, right→上
  const sideToDirCW = { top: 'right', right: 'bottom', bottom: 'left', left: 'top' };
  const sideToDirCCW = { top: 'left', left: 'bottom', bottom: 'right', right: 'top' };
  const sideToDir = isCCW ? sideToDirCCW : sideToDirCW;
  const direction = sideToDir[headBlock.side] || 'right';
  const headColor = config.appearance.headColor;

  // 生成精灵图
  const sprite = spriteGen.generateHead(Math.round(headSize), direction, headColor, variant);

  // 绘制蛇头发光
  const headRgb = hexToRgb(headColor);
  ctx.shadowColor = `rgba(${headRgb.r}, ${headRgb.g}, ${headRgb.b}, 0.8)`;
  ctx.shadowBlur = 6;

  ctx.drawImage(sprite, cx - headSize / 2, cy - headSize / 2, headSize, headSize);

  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;
}

/**
 * 使用 Sprite 素材绘制蛇身方块
 */
function drawSpriteBodyBlock(bx, by, size, block, bIdx, variant) {
  const bodyColor = getBlockColor(block);
  // 从 hsla/rgba 字符串提取 hex 颜色给 sprite generator
  let hexColor;
  if (config.appearance.rainbowMode) {
    hexColor = hslToHex((block.progressRatio * 360) % 360, 100, 55);
  } else {
    // 渐变模式 snakeColor 可能是逗号分隔的多色字符串，取第一个颜色
    hexColor = config.appearance.snakeColor.split(',')[0].trim();
  }

  const sprite = spriteGen.generateBody(Math.round(size), hexColor, variant, bIdx);
  ctx.drawImage(sprite, bx, by, size, size);
}

/**
 * HSL 转 Hex（用于 sprite 颜色）
 */
function hslToHex(h, s, l) {
  s /= 100; l /= 100;
  const a = s * Math.min(l, 1 - l);
  const f = n => {
    const k = (n + h / 30) % 12;
    const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
    return Math.round(255 * color).toString(16).padStart(2, '0');
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

/**
 * 鳞片纹理（棋盘格）：相邻方块交替亮/暗
 */
function drawCheckerboardBlock(bx, by, size, block, bIdx) {
  const baseColor = block.isHead ? getHeadColor() : getBlockColor(block);
  ctx.fillStyle = baseColor;
  ctx.fillRect(bx, by, size, size);

  // 奇数位方块叠加半透明暗色，形成棋盘格效果
  if (bIdx % 2 === 1) {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.25)';
    ctx.fillRect(bx, by, size, size);
  }
}

/**
 * 条纹纹理：方块内绘制与边框平行的浅色条纹
 */
function drawStripeBlock(bx, by, size, block) {
  const baseColor = block.isHead ? getHeadColor() : getBlockColor(block);
  ctx.fillStyle = baseColor;
  ctx.fillRect(bx, by, size, size);

  // 条纹方向与蛇身移动方向平行
  const stripeColor = 'rgba(255, 255, 255, 0.2)';
  ctx.fillStyle = stripeColor;

  if (block.side === 'top' || block.side === 'bottom') {
    // 水平蛇身 → 水平条纹
    const stripeH = Math.max(1, size / 3);
    ctx.fillRect(bx, by, size, stripeH);
    ctx.fillRect(bx, by + size - stripeH, size, stripeH);
  } else {
    // 垂直蛇身 → 垂直条纹
    const stripeW = Math.max(1, size / 3);
    ctx.fillRect(bx, by, stripeW, size);
    ctx.fillRect(bx + size - stripeW, by, stripeW, size);
  }
}

/**
 * 圆点纹理：方块内绘制中心圆点
 */
function drawDotsBlock(bx, by, size, block, bIdx) {
  const baseColor = block.isHead ? getHeadColor() : getBlockColor(block);
  ctx.fillStyle = baseColor;
  ctx.fillRect(bx, by, size, size);

  // 每个方块中心画一个小圆点
  const dotRadius = Math.max(1, size * 0.25);
  const cx = bx + size / 2;
  const cy = by + size / 2;

  // 交替亮/暗圆点增加变化
  const dotAlpha = bIdx % 2 === 0 ? 0.35 : 0.15;
  ctx.fillStyle = `rgba(255, 255, 255, ${dotAlpha})`;
  ctx.beginPath();
  ctx.arc(cx, cy, dotRadius, 0, Math.PI * 2);
  ctx.fill();
}

/**
 * 绘制蛇头，支持多种形状：triangle, rectangle, square, circle, diamond
 * 鼠标靠近时蛇头微微偏向鼠标方向
 */
function drawHead(headBlock, headSize, dx, dy) {
  ctx.fillStyle = getHeadColor();
  const headRgb = hexToRgb(config.appearance.headColor);
  ctx.shadowColor = `rgba(${headRgb.r}, ${headRgb.g}, ${headRgb.b}, 0.8)`;
  ctx.shadowBlur = 6;

  // 蛇头跟随鼠标：鼠标靠近时添加偏移
  let followDx = 0, followDy = 0;
  const ps = config.appearance.pixelSize;
  if (ps > 2) {
    const distToMouse = Math.hypot(mouseX - headBlock.x, mouseY - headBlock.y);
    const followRange = ps * 12; // 影响范围
    if (distToMouse < followRange && distToMouse > 0) {
      const strength = (1 - distToMouse / followRange) * ps * 0.35;
      followDx = (mouseX - headBlock.x) / distToMouse * strength;
      followDy = (mouseY - headBlock.y) / distToMouse * strength;
    }
  }

  const cx = headBlock.x + dx + followDx;
  const cy = headBlock.y + dy + followDy;
  const half = headSize / 2;
  const shape = config.appearance.headShape || 'triangle';

  // 根据边框位置确定前进方向
  // 顺时针：top→右, right→下, bottom→左, left→上
  // 逆时针：top→左, left→下, bottom→右, right→上
  const isCCW = (config.appearance.direction) === 'counterclockwise';
  const sideToDirCW = { top: 'right', right: 'bottom', bottom: 'left', left: 'top' };
  const sideToDirCCW = { top: 'left', left: 'bottom', bottom: 'right', right: 'top' };
  const sideToDir = isCCW ? sideToDirCCW : sideToDirCW;
  const dir = sideToDir[headBlock.side] || 'right';

  if (shape === 'triangle') {
    let p1x, p1y, p2x, p2y, p3x, p3y;
    if (dir === 'right') {
      // 朝右：顶点在右
      p1x = cx + half; p1y = cy; p2x = cx - half; p2y = cy - half; p3x = cx - half; p3y = cy + half;
    } else if (dir === 'bottom') {
      // 朝下：顶点在下
      p1x = cx; p1y = cy + half; p2x = cx - half; p2y = cy - half; p3x = cx + half; p3y = cy - half;
    } else if (dir === 'left') {
      // 朝左：顶点在左
      p1x = cx - half; p1y = cy; p2x = cx + half; p2y = cy - half; p3x = cx + half; p3y = cy + half;
    } else {
      // 朝上：顶点在上
      p1x = cx; p1y = cy - half; p2x = cx - half; p2y = cy + half; p3x = cx + half; p3y = cy + half;
    }
    ctx.beginPath();
    ctx.moveTo(p1x, p1y);
    ctx.lineTo(p2x, p2y);
    ctx.lineTo(p3x, p3y);
    ctx.closePath();
    ctx.fill();

  } else if (shape === 'rectangle') {
    // 长方形：前进方向拉伸1.5倍
    const longSide = headSize * 1.5;
    const shortSide = headSize;
    const halfLong = longSide / 2;
    const halfShort = shortSide / 2;
    if (dir === 'right' || dir === 'left') {
      ctx.fillRect(cx - halfLong, cy - halfShort, longSide, shortSide);
    } else {
      ctx.fillRect(cx - halfShort, cy - halfLong, shortSide, longSide);
    }

  } else if (shape === 'square') {
    ctx.fillRect(cx - half, cy - half, headSize, headSize);

  } else if (shape === 'circle') {
    ctx.beginPath();
    ctx.arc(cx, cy, half, 0, Math.PI * 2);
    ctx.fill();

  } else if (shape === 'diamond') {
    // 菱形：前进方向拉长
    const longHalf = half * 1.3;
    let top, right, bottom, left;
    if (dir === 'right') {
      top = { x: cx + longHalf, y: cy }; right = { x: cx, y: cy - half };
      bottom = { x: cx - longHalf, y: cy }; left = { x: cx, y: cy + half };
    } else if (dir === 'bottom') {
      top = { x: cx, y: cy + longHalf }; right = { x: cx - half, y: cy };
      bottom = { x: cx, y: cy - longHalf }; left = { x: cx + half, y: cy };
    } else if (dir === 'left') {
      top = { x: cx - longHalf, y: cy }; right = { x: cx, y: cy - half };
      bottom = { x: cx + longHalf, y: cy }; left = { x: cx, y: cy + half };
    } else {
      top = { x: cx, y: cy - longHalf }; right = { x: cx - half, y: cy };
      bottom = { x: cx, y: cy + longHalf }; left = { x: cx + half, y: cy };
    }
    ctx.beginPath();
    ctx.moveTo(top.x, top.y);
    ctx.lineTo(right.x, right.y);
    ctx.lineTo(bottom.x, bottom.y);
    ctx.lineTo(left.x, left.y);
    ctx.closePath();
    ctx.fill();
  }

  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;
}

function drawHeadGlow(headBlock, pixelSize, timestamp) {
  headGlowPhase = (timestamp / 500) % (Math.PI * 2);
  const glowIntensity = (0.3 + Math.sin(headGlowPhase) * 0.2) * fadeOpacity;
  const glowSize = pixelSize * 3;

  const gradient = ctx.createRadialGradient(
    headBlock.x, headBlock.y, pixelSize / 2,
    headBlock.x, headBlock.y, glowSize
  );

  const headRgb = hexToRgb(config.appearance.headColor);
  gradient.addColorStop(0, `rgba(${headRgb.r}, ${headRgb.g}, ${headRgb.b}, ${glowIntensity})`);
  gradient.addColorStop(1, `rgba(${headRgb.r}, ${headRgb.g}, ${headRgb.b}, 0)`);

  ctx.fillStyle = gradient;
  ctx.fillRect(
    headBlock.x - glowSize,
    headBlock.y - glowSize,
    glowSize * 2,
    glowSize * 2
  );
}

function drawLunchBreakOverlay(w, h) {
  ctx.fillStyle = `rgba(0, 0, 0, ${0.15 * fadeOpacity})`;
  ctx.fillRect(0, 0, w, h);

  ctx.fillStyle = `rgba(255, 255, 255, ${0.5 * fadeOpacity})`;
  ctx.font = '14px "Segoe UI", "Microsoft YaHei", sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('🌙 午休中', w / 2, 30);
  ctx.textAlign = 'start';
}

function drawStatusText(w, h) {
  if (!progressInfo) return;

  // 工作中：在蛇头旁显示实时进度
  if (progressInfo.status === 'Working' || progressInfo.isLunchBreak) {
    const percent = calcRealtimePercent();
    const percentText = percent.toFixed(2) + '%';
    ctx.fillStyle = `rgba(255, 255, 255, ${0.7 * fadeOpacity})`;
    ctx.font = 'bold 11px "Segoe UI", "Microsoft YaHei", sans-serif';
    ctx.textAlign = 'center';

    // 在屏幕右上角显示进度
    const textX = w - 50;
    const textY = 16;
    // 背景半透明底色
    const metrics = ctx.measureText(percentText);
    const padding = 4;
    ctx.fillStyle = `rgba(0, 0, 0, ${0.4 * fadeOpacity})`;
    ctx.fillRect(
      textX - metrics.width / 2 - padding,
      textY - 10 - padding / 2,
      metrics.width + padding * 2,
      14 + padding
    );
    ctx.fillStyle = `rgba(255, 255, 255, ${0.85 * fadeOpacity})`;
    ctx.fillText(percentText, textX, textY);
    ctx.textAlign = 'start';
    return;
  }

  let text = '';
  if (progressInfo.status === 'BeforeWork') {
    text = '☀️ 等待上班';
  } else if (progressInfo.status === 'AfterWork') {
    text = '🎉 今日已完成';
  } else if (progressInfo.status === 'NonWorkday') {
    text = '😴 非工作日';
  }

  if (text) {
    ctx.fillStyle = `rgba(255, 255, 255, ${0.4 * fadeOpacity})`;
    ctx.font = '13px "Segoe UI", "Microsoft YaHei", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(text, w / 2, h / 2);
    ctx.textAlign = 'start';
  }
}

function drawCelebration(timestamp, w, h) {
  if (!celebrationActive) return;

  const elapsed = timestamp - celebrationStart;
  const duration = config.celebration.duration || 3000;

  if (elapsed > duration) {
    celebrationActive = false;
    return;
  }

  const progress = elapsed / duration;
  const particleCount = 50;

  for (let i = 0; i < particleCount; i++) {
    const angle = (i / particleCount) * Math.PI * 2 + progress * 3;
    const speed = 50 + progress * 200;
    const x = w / 2 + Math.cos(angle) * speed * progress;
    const y = h / 2 + Math.sin(angle) * speed * progress - progress * 100;
    const size = 3 + Math.random() * 4;
    const hue = (i * 30 + progress * 360) % 360;
    const alpha = (1 - progress) * fadeOpacity;

    ctx.fillStyle = `hsla(${hue}, 100%, 60%, ${alpha})`;
    ctx.fillRect(x - size / 2, y - size / 2, size, size);
  }
}

// ============ Tooltip ============

canvas.addEventListener('mousemove', (e) => {
  mouseX = e.clientX;
  mouseY = e.clientY;
  if (!config || !progressInfo) return;

  const { pixelSize, margin } = config.appearance;
  const path = calculateBorderPath(window.innerWidth, window.innerHeight, margin, pixelSize);
  const percent = calcRealtimePercent();
  const blocks = getSnakeBlocks(percent, path);

  let nearSnake = false;
  for (const block of blocks) {
    const dist = Math.hypot(e.clientX - block.x, e.clientY - block.y);
    if (dist < pixelSize * 2) {
      nearSnake = true;
      break;
    }
  }

  if (nearSnake) {
    const remaining = progressInfo.remainingMinutes;
    const hours = Math.floor(remaining / 60);
    const mins = remaining % 60;
    let statusText = '';
    if (progressInfo.isLunchBreak) {
      statusText = '🌙 午休中';
    } else if (progressInfo.status === 'Working') {
      statusText = `剩余 ${hours}h ${mins}min`;
    } else if (progressInfo.status === 'AfterWork') {
      statusText = '已完成';
    } else if (progressInfo.status === 'BeforeWork') {
      statusText = '等待上班';
    }

    tooltip.textContent = `工作进度 ${Math.round(percent)}%${statusText ? ' · ' + statusText : ''}`;
    tooltip.style.left = (e.clientX + 12) + 'px';
    tooltip.style.top = (e.clientY - 30) + 'px';
    tooltip.classList.add('visible');
    tooltipVisible = true;

    clearTimeout(tooltipTimer);
    tooltipTimer = setTimeout(() => {
      if (tooltipVisible) {
        tooltip.classList.remove('visible');
        tooltipVisible = false;
      }
    }, 3000);
  } else {
    if (tooltipVisible) {
      tooltip.classList.remove('visible');
      tooltipVisible = false;
    }
  }
});

canvas.addEventListener('mouseleave', () => {
  tooltip.classList.remove('visible');
  tooltipVisible = false;
  mouseX = -9999;
  mouseY = -9999;
});

// ============ 蛇身点击弹窗 ============

let detailOverlay = null;

canvas.addEventListener('click', (e) => {
  if (!config || !progressInfo) return;

  const { pixelSize, margin } = config.appearance;
  const path = calculateBorderPath(window.innerWidth, window.innerHeight, margin, pixelSize);
  const percent = calcRealtimePercent();
  const blocks = getSnakeBlocks(percent, path);

  let clickedSnake = false;
  for (const block of blocks) {
    const dist = Math.hypot(e.clientX - block.x, e.clientY - block.y);
    if (dist < pixelSize * 2.5) {
      clickedSnake = true;
      break;
    }
  }

  if (clickedSnake) {
    showDetailDialog(e.clientX, e.clientY);
  }
});

function showDetailDialog(clickX, clickY) {
  // 关闭已有弹窗
  if (detailOverlay) {
    detailOverlay.remove();
    detailOverlay = null;
    invoke('set_overlay_open', { open: false });
    return;
  }

  const percent = calcRealtimePercent();
  const now = new Date();
  const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;
  const wt = config.workTime;

  let statusLabel = '';
  let statusEmoji = '';
  if (progressInfo.status === 'Working') {
    statusLabel = '工作中'; statusEmoji = '💼';
  } else if (progressInfo.status === 'BeforeWork') {
    statusLabel = '等待上班'; statusEmoji = '☀️';
  } else if (progressInfo.status === 'AfterWork') {
    statusLabel = '已完成'; statusEmoji = '🎉';
  } else if (progressInfo.status === 'NonWorkday') {
    statusLabel = '非工作日'; statusEmoji = '😴';
  } else if (progressInfo.isLunchBreak) {
    statusLabel = '午休中'; statusEmoji = '🌙';
  }

  const remaining = progressInfo.remainingMinutes || 0;
  const rHours = Math.floor(remaining / 60);
  const rMins = remaining % 60;

  // 打卡信息
  const clockIn = localStorage.getItem('snake_clock_in') || '--';
  const clockOut = localStorage.getItem('snake_clock_out') || '--';
  let workDuration = '';
  if (clockIn !== '--') {
    const inTime = new Date(clockIn);
    const diffMs = now - inTime;
    const diffMins = Math.floor(diffMs / 60000);
    workDuration = `${Math.floor(diffMins / 60)}h ${diffMins % 60}min`;
  }

  detailOverlay = document.createElement('div');
  detailOverlay.id = 'detailOverlay';
  detailOverlay.style.cssText = `
    position: fixed; top: 0; left: 0; right: 0; bottom: 0;
    z-index: 100000;
  `;

  const dialog = document.createElement('div');
  dialog.style.cssText = `
    position: absolute;
    left: ${Math.min(clickX + 15, window.innerWidth - 260)}px;
    top: ${Math.min(clickY - 20, window.innerHeight - 320)}px;
    background: rgba(20, 20, 40, 0.95); color: #e0e0e0;
    border-radius: 12px; padding: 20px; min-width: 240px;
    box-shadow: 0 8px 32px rgba(0,0,0,0.5); backdrop-filter: blur(8px);
    border: 1px solid rgba(255,255,255,0.1);
    font-family: "Segoe UI", "Microsoft YaHei", sans-serif;
  `;

  dialog.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;">
      <span style="font-size:16px;font-weight:bold;">${statusEmoji} ${statusLabel}</span>
      <span style="font-size:12px;color:#888;">${timeStr}</span>
    </div>
    <div style="text-align:center;margin-bottom:16px;">
      <div style="font-size:32px;font-weight:bold;color:#4FC3F7;">${percent.toFixed(1)}%</div>
      <div style="margin-top:6px;height:6px;background:rgba(255,255,255,0.1);border-radius:3px;overflow:hidden;">
        <div style="width:${percent}%;height:100%;background:linear-gradient(90deg,#4FC3F7,#00E676);border-radius:3px;"></div>
      </div>
    </div>
    <div style="font-size:13px;line-height:2;color:#bbb;">
      <div>⏰ 工作时段：${wt.start} ~ ${wt.end}</div>
      ${wt.lunch.enabled ? `<div>🌙 午休时段：${wt.lunch.start} ~ ${wt.lunch.end}</div>` : ''}
      <div>⏳ 剩余时间：${rHours}h ${rMins}min</div>
      <div style="border-top:1px solid rgba(255,255,255,0.1);margin-top:6px;padding-top:6px;">
        <div>📍 上班打卡：${clockIn !== '--' ? new Date(clockIn).toLocaleTimeString('zh-CN', {hour:'2-digit',minute:'2-digit',second:'2-digit'}) : '--'}</div>
        <div>📍 下班打卡：${clockOut !== '--' ? new Date(clockOut).toLocaleTimeString('zh-CN', {hour:'2-digit',minute:'2-digit',second:'2-digit'}) : '--'}</div>
        ${workDuration ? `<div>⏱️ 已在岗：${workDuration}</div>` : ''}
      </div>
    </div>
  `;

  detailOverlay.appendChild(dialog);
  document.body.appendChild(detailOverlay);

  // 通知 Rust 端弹窗已打开，阻止后台线程恢复穿透
  invoke('set_overlay_open', { open: true });

  detailOverlay.addEventListener('click', (e) => {
    if (e.target === detailOverlay || e.target === dialog) {
      detailOverlay.remove();
      detailOverlay = null;
      invoke('set_overlay_open', { open: false });
    }
  });

  // 5秒后自动关闭
  setTimeout(() => {
    if (document.getElementById('detailOverlay')) {
      detailOverlay.remove();
      detailOverlay = null;
      invoke('set_overlay_open', { open: false });
    }
  }, 5000);
}

// ============ 事件监听 ============

async function setupEventListeners() {
  await listen('config-changed', (event) => {
    config = event.payload;
  });

  await listen('fade-out', () => {
    fadeTarget = 0;
  });

  await listen('fade-in', () => {
    fadeTarget = 1;
  });

  await listen('show-about', () => {
    showAboutDialog();
  });

  await listen('show-detail', () => {
    // 从托盘菜单触发，弹窗放在右上角
    showDetailDialog(window.innerWidth - 270, 40);
  });

  await listen('clock-event', (event) => {
    const data = event.payload;
    showClockNotification(data.type, data.time);
    // 同步到 localStorage 供点击弹窗读取
    if (data.type === 'clockIn') {
      const now = new Date();
      localStorage.setItem('snake_clock_in', now.toISOString());
      localStorage.removeItem('snake_clock_out');
    } else if (data.type === 'clockOut') {
      const now = new Date();
      localStorage.setItem('snake_clock_out', now.toISOString());
    }
  });
}

// ============ 关于对话框 ============

// ============ 打卡通知 ============

let clockNotification = null;

function showClockNotification(type, time) {
  // 移除已有通知
  if (clockNotification) {
    clockNotification.remove();
    clockNotification = null;
  }

  const isClockIn = type === 'clockIn';
  const emoji = isClockIn ? '📍' : '🏠';
  const label = isClockIn ? '上班打卡' : '下班打卡';
  const color = isClockIn ? '#4FC3F7' : '#FF7043';

  // 如果是下班打卡，显示工时
  let workInfo = '';
  if (!isClockIn) {
    const clockInTime = localStorage.getItem('snake_clock_in');
    if (clockInTime) {
      const inTime = new Date(clockInTime);
      const diffMs = Date.now() - inTime.getTime();
      const diffMins = Math.floor(diffMs / 60000);
      workInfo = `<div style="margin-top:6px;font-size:13px;color:#aaa;">⏱️ 今日工时：${Math.floor(diffMins / 60)}h ${diffMins % 60}min</div>`;
    }
  }

  clockNotification = document.createElement('div');
  clockNotification.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    background: rgba(20, 20, 40, 0.95); color: #e0e0e0;
    border-radius: 12px; padding: 16px 24px;
    box-shadow: 0 8px 32px rgba(0,0,0,0.5); backdrop-filter: blur(8px);
    border: 1px solid rgba(255,255,255,0.1);
    font-family: "Segoe UI", "Microsoft YaHei", sans-serif;
    z-index: 100001;
    animation: slideIn 0.3s ease-out;
    min-width: 180px;
  `;

  clockNotification.innerHTML = `
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;">
      <span style="font-size:20px;">${emoji}</span>
      <span style="font-size:15px;font-weight:bold;color:${color};">${label}成功</span>
    </div>
    <div style="font-size:24px;font-weight:bold;">${time}</div>
    ${workInfo}
  `;

  // 添加动画样式
  if (!document.getElementById('clockNotifStyle')) {
    const style = document.createElement('style');
    style.id = 'clockNotifStyle';
    style.textContent = `
      @keyframes slideIn {
        from { transform: translateX(100px); opacity: 0; }
        to { transform: translateX(0); opacity: 1; }
      }
      @keyframes slideOut {
        from { transform: translateX(0); opacity: 1; }
        to { transform: translateX(100px); opacity: 0; }
      }
    `;
    document.head.appendChild(style);
  }

  document.body.appendChild(clockNotification);

  // 3秒后自动关闭
  setTimeout(() => {
    if (clockNotification) {
      clockNotification.style.animation = 'slideOut 0.3s ease-in forwards';
      setTimeout(() => {
        if (clockNotification) {
          clockNotification.remove();
          clockNotification = null;
        }
      }, 300);
    }
  }, 3000);
}

function showAboutDialog() {
  if (aboutOverlay) {
    aboutOverlay.remove();
    aboutOverlay = null;
    return;
  }

  aboutOverlay = document.createElement('div');
  aboutOverlay.id = 'aboutOverlay';
  aboutOverlay.style.cssText = `
    position: fixed; top: 0; left: 0; right: 0; bottom: 0;
    background: rgba(0,0,0,0.5); display: flex; align-items: center;
    justify-content: center; z-index: 100000;
  `;

  const dialog = document.createElement('div');
  dialog.style.cssText = `
    background: #161b22; color: #b1bac4; border-radius: 14px;
    padding: 28px 32px; text-align: center; min-width: 300px;
    border: 1px solid rgba(255,255,255,0.06);
    box-shadow: 0 8px 32px rgba(0,0,0,0.4);
    pointer-events: auto; position: relative; z-index: 1;
  `;

  const content = document.createElement('div');
  content.innerHTML = `
    <div style="font-size: 36px; margin-bottom: 12px;">🐍</div>
    <h2 style="margin: 0 0 8px; color: #e6edf3; font-size: 20px; font-weight: 600; letter-spacing: -0.01em;">SnakeProgress</h2>
    <p style="margin: 0 0 4px; color: #8b949e; font-size: 13px;">桌面贪吃蛇进度条 v0.1.0</p>
    <p style="margin: 0 0 16px; color: #6e7681; font-size: 12px;">把时间进度变成屏幕边框的一部分</p>
    <div style="border-top: 1px solid rgba(255,255,255,0.06); padding-top: 12px; margin-top: 8px;">
      <p style="margin: 0 0 4px; color: #8b949e; font-size: 11px;">💻 Windows / macOS / Linux</p>
      <p style="margin: 0 0 4px; color: #8b949e; font-size: 11px;">🏗️ Built with Tauri + Canvas 2D</p>
      <p style="margin: 0 0 4px; color: #8b949e; font-size: 11px;">🔒 纯本地运行，无网络请求</p>
    </div>
  `;

  const closeBtn = document.createElement('button');
  closeBtn.textContent = '确定';
  closeBtn.style.cssText = `
    margin-top: 16px; padding: 8px 24px; border: none; border-radius: 6px;
    background: #c4a882; color: #fff; font-size: 13px; cursor: pointer;
    font-weight: 600; user-select: auto; -webkit-user-select: auto;
  `;
  closeBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (aboutOverlay) {
      aboutOverlay.remove();
      aboutOverlay = null;
    }
  });

  dialog.appendChild(content);
  dialog.appendChild(closeBtn);
  aboutOverlay.appendChild(dialog);
  document.body.appendChild(aboutOverlay);

  aboutOverlay.addEventListener('click', (e) => {
    if (e.target === aboutOverlay) {
      aboutOverlay.remove();
      aboutOverlay = null;
    }
  });

  // 通知 Rust 端弹窗已打开，阻止后台线程恢复穿透
  invoke('set_overlay_open', { open: true });

  const observer = new MutationObserver(() => {
    if (!document.getElementById('aboutOverlay')) {
      observer.disconnect();
      invoke('set_overlay_open', { open: false });
    }
  });
  observer.observe(document.body, { childList: true });
}

// ============ 全屏检测 ============

function startFullscreenDetection() {
  fullscreenCheckInterval = setInterval(() => {
    if (!config || !config.display.autoHideFullscreen) return;
    try {
      const isFullscreen = !!document.fullscreenElement;
      if (isFullscreen && !wasFullscreen) {
        fadeTarget = 0;
        wasFullscreen = true;
      } else if (!isFullscreen && wasFullscreen) {
        fadeTarget = 1;
        wasFullscreen = false;
      }
    } catch (e) {}
  }, 500);
}

// ============ 定时更新进度 ============

async function updateProgress() {
  await loadProgress();

  const currentPercent = calcRealtimePercent();
  if (
    currentPercent >= 100 &&
    lastCelebrationPercent < 100 &&
    config.celebration.enabled
  ) {
    celebrationActive = true;
    celebrationStart = performance.now();
  }
  lastCelebrationPercent = currentPercent;
}

// ============ 主入口 ============

async function init() {
  await loadConfig();
  await loadProgress();

  setInterval(updateProgress, PROGRESS_UPDATE_INTERVAL);
  setInterval(loadConfig, 5000);
  startFullscreenDetection();
  animationId = requestAnimationFrame(render);
  await setupEventListeners();

  console.log('SnakeProgress 已启动 🐍');
}

init();

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

// 动画状态
let wiggleOffset = 0;
let headGlowPhase = 0;
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

  // 午休
  const lunchEnabled = config.workTime.lunch.enabled;
  const lunchStartSec = parseTime(config.workTime.lunch.start);
  const lunchEndSec = parseTime(config.workTime.lunch.end);
  const lunchDuration = lunchEnabled ? Math.max(0, lunchEndSec - lunchStartSec) : 0;

  const totalSec = Math.max(0, endSec - startSec);
  const totalWorkSec = totalSec - lunchDuration;

  if (totalWorkSec <= 0) return 0;

  // 上班前
  if (currentTotalSeconds < startSec) return 0;

  // 下班后
  if (currentTotalSeconds >= endSec) return 100;

  // 午休中
  if (lunchEnabled && currentTotalSeconds >= lunchStartSec && currentTotalSeconds < lunchEndSec) {
    const elapsedToLunch = Math.max(0, lunchStartSec - startSec);
    return (elapsedToLunch / totalWorkSec) * 100;
  }

  // 工作中
  let elapsed = currentTotalSeconds - startSec;
  if (lunchEnabled && currentTotalSeconds >= lunchEndSec) {
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
      showTrail: false, headGlow: true, straightMode: false, headShape: 'triangle', skinTexture: 'solid',
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
  // 小像素模式：坐标对齐整数像素，避免亚像素模糊导致线条变粗
  const alignToGrid = ps <= 2;
  const m = alignToGrid
    ? Math.round(margin + ps / 2)
    : margin + ps / 2;
  const path = [];

  for (let x = m; x <= width - m + 0.5; x += ps) {
    path.push({ x: alignToGrid ? Math.round(x) : x, y: m, side: 'top' });
  }
  for (let y = m + ps; y <= height - m + 0.5; y += ps) {
    path.push({ x: width - m, y: alignToGrid ? Math.round(y) : y, side: 'right' });
  }
  for (let x = width - m - ps; x >= m - 0.5; x -= ps) {
    path.push({ x: alignToGrid ? Math.round(x) : x, y: height - m, side: 'bottom' });
  }
  for (let y = height - m - ps; y >= m + ps - 0.5; y -= ps) {
    path.push({ x: m, y: alignToGrid ? Math.round(y) : y, side: 'left' });
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
  const tiny = pixelSize <= 2 || config.appearance.straightMode; // 无摆动
  const snap = tiny;
  const totalBlocks = blocks.length;
  const texture = config.appearance.skinTexture || 'solid';
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
        const wiggle = Math.sin((block.index + wiggleOffset) * 0.5) * Math.min(1, pixelSize * 0.12);
        if (block.side === 'top' || block.side === 'bottom') {
          dy = wiggle;
        } else {
          dx = wiggle;
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
      drawHead(block, headSize, dx, dy);
    } else {
      const scaledSize = Math.max(1, blockSize * scale);
      const bx = snap ? Math.round(block.x - scaledSize / 2 + dx) : block.x - scaledSize / 2 + dx;
      const by = snap ? Math.round(block.y - scaledSize / 2 + dy) : block.y - scaledSize / 2 + dy;

      if (texture === 'solid' || pixelSize <= 3) {
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
    }
  }
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
  // top→右, right→下, bottom→左, left→上
  const side = headBlock.side;

  if (shape === 'triangle') {
    let p1x, p1y, p2x, p2y, p3x, p3y;
    if (side === 'top') {
      p1x = cx + half; p1y = cy; p2x = cx - half; p2y = cy - half; p3x = cx - half; p3y = cy + half;
    } else if (side === 'right') {
      p1x = cx; p1y = cy + half; p2x = cx - half; p2y = cy - half; p3x = cx + half; p3y = cy - half;
    } else if (side === 'bottom') {
      p1x = cx - half; p1y = cy; p2x = cx + half; p2y = cy - half; p3x = cx + half; p3y = cy + half;
    } else {
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
    if (side === 'top' || side === 'bottom') {
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
    if (side === 'top') {
      top = { x: cx + longHalf, y: cy }; right = { x: cx, y: cy - half };
      bottom = { x: cx - longHalf, y: cy }; left = { x: cx, y: cy + half };
    } else if (side === 'right') {
      top = { x: cx, y: cy + longHalf }; right = { x: cx - half, y: cy };
      bottom = { x: cx, y: cy - longHalf }; left = { x: cx + half, y: cy };
    } else if (side === 'bottom') {
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
    justify-content: center; z-index: 100000; backdrop-filter: blur(4px);
  `;

  const dialog = document.createElement('div');
  dialog.style.cssText = `
    background: #1a1a2e; color: #e0e0e0; border-radius: 16px;
    padding: 32px; text-align: center; min-width: 300px;
    border: 1px solid rgba(139,233,253,0.2);
    box-shadow: 0 8px 32px rgba(0,0,0,0.3);
  `;

  const content = document.createElement('div');
  content.innerHTML = `
    <div style="font-size: 36px; margin-bottom: 12px;">🐍</div>
    <h2 style="margin: 0 0 8px; color: #8be9fd; font-size: 20px;">SnakeProgress</h2>
    <p style="margin: 0 0 4px; color: #999; font-size: 13px;">桌面贪吃蛇进度条 v0.1.0</p>
    <p style="margin: 0 0 16px; color: #666; font-size: 12px;">把时间进度变成屏幕边框的一部分</p>
    <div style="border-top: 1px solid rgba(255,255,255,0.08); padding-top: 12px; margin-top: 8px;">
      <p style="margin: 0 0 4px; color: #888; font-size: 11px;">💻 Windows / macOS / Linux</p>
      <p style="margin: 0 0 4px; color: #888; font-size: 11px;">🏗️ Built with Tauri + Canvas 2D</p>
      <p style="margin: 0 0 4px; color: #888; font-size: 11px;">🔒 纯本地运行，无网络请求</p>
    </div>
  `;

  const closeBtn = document.createElement('button');
  closeBtn.textContent = '确定';
  closeBtn.style.cssText = `
    margin-top: 16px; padding: 8px 24px; border: none; border-radius: 8px;
    background: #8be9fd; color: #1a1a2e; font-size: 13px; cursor: pointer;
    font-weight: 600;
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

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
      showTrail: false, headGlow: true,
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
  const tiny = pixelSize <= 2; // 小像素模式：无摆动
  // 小像素时对齐整数网格，避免亚像素抗锯齿导致线条变粗
  const snap = tiny;

  for (const block of blocks) {
    let dx = 0, dy = 0;
    if (!tiny) {
      const wiggle = Math.sin((block.index + wiggleOffset) * 0.5) * Math.min(1, pixelSize * 0.12);
      if (block.side === 'top' || block.side === 'bottom') {
        dy = wiggle;
      } else {
        dx = wiggle;
      }
    }

    if (block.isHead) {
      const headSize = pixelSize + 2;
      const halfHead = headSize / 2;
      ctx.fillStyle = getHeadColor();
      const headRgb = hexToRgb(config.appearance.headColor);
      ctx.shadowColor = `rgba(${headRgb.r}, ${headRgb.g}, ${headRgb.b}, 0.8)`;
      ctx.shadowBlur = 6;
      const hx = snap ? Math.round(block.x - halfHead + dx) : block.x - halfHead + dx;
      const hy = snap ? Math.round(block.y - halfHead + dy) : block.y - halfHead + dy;
      ctx.fillRect(hx, hy, headSize, headSize);
      ctx.shadowColor = 'transparent';
      ctx.shadowBlur = 0;
    } else {
      ctx.fillStyle = getBlockColor(block);
      const bx = snap ? Math.round(block.x - blockSize / 2 + dx) : block.x - blockSize / 2 + dx;
      const by = snap ? Math.round(block.y - blockSize / 2 + dy) : block.y - blockSize / 2 + dy;
      ctx.fillRect(bx, by, blockSize, blockSize);
    }
  }
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
});

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
}

// ============ 关于对话框 ============

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

  // 临时关闭鼠标穿透
  invoke('set_click_through', { enabled: false });

  const observer = new MutationObserver(() => {
    if (!document.getElementById('aboutOverlay')) {
      observer.disconnect();
      invoke('set_click_through', { enabled: config.display.clickThrough });
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

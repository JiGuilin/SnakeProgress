/**
 * SnakeProgress - 入口：状态、配置/进度、定时器与事件编排
 */
import { initRender, render } from './render.js';
import { initUi, showAboutDialog, showDetailDialog, showClockNotification } from './ui.js';

const { invoke } = window.__TAURI__.core;
const { listen } = window.__TAURI__.event;

const PROGRESS_UPDATE_INTERVAL = 30000;
const FADE_SPEED = 0.05;
const SPAWN_ANIM_DURATION = 10.0;
const TARGET_FPS = 60;
const FRAME_INTERVAL = 1000 / TARGET_FPS;

const spriteGen = new window.SpriteGenerator();
const powerUpSystem = new window.PowerUpSystem(spriteGen);
const randomFoodSystem = new window.RandomFoodSystem(spriteGen);

const canvas = document.getElementById('snakeCanvas');
const ctx = canvas.getContext('2d');
const tooltip = document.getElementById('tooltip');

/** 共享可变状态（render / ui 通过 getState 读写） */
const state = {
  config: null,
  progressInfo: null,
  animationId: null,
  lastMilestoneCheck: -1,
  wiggleOffset: 0,
  headGlowPhase: 0,
  bodyAnimPhase: 0,
  celebrationActive: false,
  celebrationStart: 0,
  lastCelebrationPercent: 0,
  cachedGlowGradient: null,
  cachedGlowKey: '',
  celebrationParticles: null,
  fadeOpacity: 1.0,
  fadeTarget: 1.0,
  isHidden: false,
  rafPaused: false,
  spawnAnimActive: false,
  spawnAnimPercent: 0,
  spawnAnimTargetPercent: 0,
  spawnAnimStartTime: 0,
  lastFrameTime: 0,
  cachedPath: null,
  cachedPathKey: '',
  mouseX: -9999,
  mouseY: -9999,
};

let mousePollTimer = null;
let canvasCheckTimer = null;
let progressTimer = null;
let configReloadTimer = null;
let wasFullscreen = false;
let fullscreenCheckInterval = null;

function getState() {
  return state;
}

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

function startMousePoll() {
  if (mousePollTimer) return;
  mousePollTimer = setInterval(async () => {
    try {
      const [x, y] = await invoke('get_cursor_pos');
      const dpr = window.devicePixelRatio || 1;
      state.mouseX = x / dpr;
      state.mouseY = y / dpr;
    } catch (e) {}
  }, 100);
}
function stopMousePoll() {
  if (mousePollTimer) { clearInterval(mousePollTimer); mousePollTimer = null; }
}

function startCanvasCheck() {
  if (canvasCheckTimer) return;
  canvasCheckTimer = setInterval(() => {
    const currentW = parseInt(canvas.style.width);
    const currentH = parseInt(canvas.style.height);
    if (currentW !== window.innerWidth || currentH !== window.innerHeight) {
      resizeCanvas();
    }
  }, 2000);
}
function stopCanvasCheck() {
  if (canvasCheckTimer) { clearInterval(canvasCheckTimer); canvasCheckTimer = null; }
}

async function loadConfig() {
  try {
    const newConfig = await invoke('get_config');
    const appearanceChanged = !state.config
      || JSON.stringify(state.config.appearance) !== JSON.stringify(newConfig.appearance);
    if (appearanceChanged) {
      spriteGen.clearCache();
      state.cachedPathKey = '';
    }
    state.config = newConfig;
  } catch (e) {
    console.error('加载配置失败:', e);
    state.config = getDefaultConfig();
  }
}

async function loadProgress() {
  try {
    state.progressInfo = await invoke('get_progress');
  } catch (e) {
    console.error('获取进度失败:', e);
  }
}

/**
 * 前端实时计算进度百分比（精确到毫秒）
 */
function calcRealtimePercent() {
  if (!state.config) return 0;

  const now = new Date();
  const currentTotalMs = now.getHours() * 3600000 + now.getMinutes() * 60000
    + now.getSeconds() * 1000 + now.getMilliseconds();

  const weekday = now.getDay() === 0 ? 7 : now.getDay();
  const workdays = state.config.workTime.workdays || [1, 2, 3, 4, 5];
  if (!workdays.includes(weekday)) return 0;

  const parseTime = (str) => {
    const [h, m] = str.split(':').map(Number);
    return h * 3600000 + m * 60000;
  };

  const startMs = parseTime(state.config.workTime.start);
  const endMs = parseTime(state.config.workTime.end);
  const lunchEnabled = state.config.workTime.lunch.enabled;
  const lunchStartMs = parseTime(state.config.workTime.lunch.start);
  const lunchEndMs = parseTime(state.config.workTime.lunch.end);
  const lunchDuration = lunchEnabled
    ? Math.max(0, Math.min(lunchEndMs, endMs) - Math.max(lunchStartMs, startMs))
    : 0;

  const totalMs = Math.max(0, endMs - startMs);
  const totalWorkMs = totalMs - lunchDuration;
  if (totalWorkMs <= 0) return 0;
  if (currentTotalMs < startMs) return 0;
  if (currentTotalMs >= endMs) return 100;

  if (lunchEnabled && lunchDuration > 0
      && currentTotalMs >= Math.max(lunchStartMs, startMs)
      && currentTotalMs < Math.min(lunchEndMs, endMs)) {
    const elapsedToLunch = Math.max(0, Math.max(lunchStartMs, startMs) - startMs);
    return (elapsedToLunch / totalWorkMs) * 100;
  }

  let elapsed = currentTotalMs - startMs;
  if (lunchEnabled && currentTotalMs >= Math.min(lunchEndMs, endMs)) {
    elapsed -= lunchDuration;
  }
  elapsed = Math.max(0, elapsed);
  return Math.min(100, (elapsed / totalWorkMs) * 100);
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
      showTrail: false, headGlow: true, straightMode: false, bodyMotionMode: 'wiggle',
      headShape: 'triangle', skinTexture: 'solid',
      showPowerUps: true, bodyAnimEffect: 'none', headAnimEffect: 'none', tailAnimEffect: 'none',
      startPosition: 'top-left', direction: 'clockwise', displayMode: 'full',
      randomFoodEnabled: true, randomFoodInterval: 15,
      randomFoodRangeMin: 0.5, randomFoodRangeMax: 5, randomFoodMaxCount: 5,
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

function triggerSpawnAnim() {
  state.spawnAnimPercent = 0;
  state.spawnAnimTargetPercent = calcRealtimePercent();
  state.spawnAnimStartTime = performance.now();
  state.spawnAnimActive = true;
}

function startFullscreenDetection() {
  if (fullscreenCheckInterval) return;
  fullscreenCheckInterval = setInterval(() => {
    if (!state.config || !state.config.display.autoHideFullscreen) return;
    try {
      const isFullscreen = !!document.fullscreenElement;
      if (isFullscreen && !wasFullscreen) {
        state.fadeTarget = 0;
        wasFullscreen = true;
      } else if (!isFullscreen && wasFullscreen) {
        state.fadeTarget = 1;
        wasFullscreen = false;
        triggerSpawnAnim();
      }
    } catch (e) {}
  }, 500);
}
function stopFullscreenDetection() {
  if (fullscreenCheckInterval) { clearInterval(fullscreenCheckInterval); fullscreenCheckInterval = null; }
}

async function updateProgress() {
  await loadProgress();
  const currentPercent = calcRealtimePercent();
  if (
    currentPercent >= 100 &&
    state.lastCelebrationPercent < 100 &&
    state.config.celebration.enabled
  ) {
    state.celebrationActive = true;
    state.celebrationStart = performance.now();
    state.celebrationParticles = null;
  }
  state.lastCelebrationPercent = currentPercent;
}

function startProgressTimer() {
  if (progressTimer) return;
  progressTimer = setInterval(updateProgress, PROGRESS_UPDATE_INTERVAL);
}
function stopProgressTimer() {
  if (progressTimer) { clearInterval(progressTimer); progressTimer = null; }
}

function startConfigReloadTimer() {
  if (configReloadTimer) return;
  configReloadTimer = setInterval(loadConfig, 10000);
}
function stopConfigReloadTimer() {
  if (configReloadTimer) { clearInterval(configReloadTimer); configReloadTimer = null; }
}

async function setupEventListeners() {
  await listen('config-changed', (event) => {
    state.config = event.payload;
  });

  await listen('fade-out', () => {
    state.fadeTarget = 0;
    state.isHidden = true;
    stopMousePoll();
    stopCanvasCheck();
    stopProgressTimer();
    stopConfigReloadTimer();
    stopFullscreenDetection();
  });

  await listen('fade-in', () => {
    state.fadeTarget = 1;
    state.isHidden = false;
    startMousePoll();
    startCanvasCheck();
    startProgressTimer();
    startConfigReloadTimer();
    startFullscreenDetection();
    if (state.rafPaused || !state.animationId) {
      state.rafPaused = false;
      state.lastFrameTime = 0;
      state.animationId = requestAnimationFrame(render);
    }
    triggerSpawnAnim();
  });

  await listen('show-about', () => {
    showAboutDialog();
  });

  await listen('show-detail', () => {
    showDetailDialog(window.innerWidth - 270, 40);
  });

  await listen('clock-event', (event) => {
    const data = event.payload;
    showClockNotification(data.type, data.time);
    if (data.type === 'clockIn') {
      localStorage.setItem('snake_clock_in', new Date().toISOString());
      localStorage.removeItem('snake_clock_out');
    } else if (data.type === 'clockOut') {
      localStorage.setItem('snake_clock_out', new Date().toISOString());
    }
  });
}

initRender({
  ctx,
  getState,
  calcRealtimePercent,
  spriteGen,
  powerUpSystem,
  randomFoodSystem,
  FRAME_INTERVAL,
  SPAWN_ANIM_DURATION,
  FADE_SPEED,
});

initUi({
  canvas,
  tooltip,
  getState,
  calcRealtimePercent,
  invoke,
});

async function init() {
  await loadConfig();
  await loadProgress();

  startMousePoll();
  startCanvasCheck();
  startProgressTimer();
  startConfigReloadTimer();
  startFullscreenDetection();
  triggerSpawnAnim();
  state.animationId = requestAnimationFrame(render);
  await setupEventListeners();

  console.log('SnakeProgress 已启动 🐍');
}

init();

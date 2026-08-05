/**
 * SnakeProgress - 设置面板逻辑
 */

const { invoke } = window.__TAURI__.core;
const { emit } = window.__TAURI__.event;

let config = null;
let themes = [];
let saveTimer = null;

const $ = (id) => document.getElementById(id);

const els = {
  workStart: $('workStart'),
  workEnd: $('workEnd'),
  lunchEnabled: $('lunchEnabled'),
  lunchStart: $('lunchStart'),
  lunchEnd: $('lunchEnd'),
  lunchRow: $('lunchRow'),
  weekdays: $('weekdays'),
  themeGrid: $('themeGrid'),
  snakeColor: $('snakeColor'),
  headColor: $('headColor'),
  rainbowMode: $('rainbowMode'),
  pixelSize: $('pixelSize'),
  pixelSizeVal: $('pixelSizeVal'),
  opacity: $('opacity'),
  opacityVal: $('opacityVal'),
  margin: $('margin'),
  marginVal: $('marginVal'),
  snakeLengthMode: $('snakeLengthMode'),
  fixedLengthRow: $('fixedLengthRow'),
  fixedLengthPercent: $('fixedLengthPercent'),
  fixedLengthPercentVal: $('fixedLengthPercentVal'),
  animationSpeed: $('animationSpeed'),
  showTrail: $('showTrail'),
  headGlow: $('headGlow'),
  straightMode: $('straightMode'),
  headShape: $('headShape'),
  skinTexture: $('skinTexture'),
  autoHideFullscreen: $('autoHideFullscreen'),
  clickThrough: $('clickThrough'),
  autoStart: $('autoStart'),
  showOnNonWorkdays: $('showOnNonWorkdays'),
  celebrationEnabled: $('celebrationEnabled'),
  previewBar: $('previewBar'),
  previewText: $('previewText'),
  resetBtn: $('resetBtn'),
  saveBtn: $('saveBtn'),
  exportBtn: $('exportBtn'),
  importBtn: $('importBtn'),
  importFileInput: $('importFileInput'),
  configPath: $('configPath'),
};

// ============ Toggle 工具方法 ============

/** 获取 toggle 的开关状态 */
function isToggleOn(el) {
  return el.getAttribute('aria-checked') === 'true';
}

/** 设置 toggle 的开关状态 */
function setToggle(el, on) {
  el.setAttribute('aria-checked', on ? 'true' : 'false');
}

/** 切换 toggle 并返回新状态 */
function toggleSwitch(el) {
  const newVal = !isToggleOn(el);
  setToggle(el, newVal);
  return newVal;
}

// ============ 主题预设 ============

async function loadThemes() {
  try {
    themes = await invoke('get_themes');
  } catch (e) {
    console.error('加载主题失败:', e);
    themes = [];
  }
  renderThemeGrid();
}

function renderThemeGrid() {
  els.themeGrid.innerHTML = '';
  for (const theme of themes) {
    const card = document.createElement('button');
    card.className = 'theme-card' + (config && config.appearance.theme === theme.name ? ' active' : '');
    card.dataset.name = theme.name;
    card.type = 'button';

    const preview = document.createElement('div');
    preview.className = 'theme-preview';
    if (theme.colorMode === 'gradient') {
      const colors = theme.snakeColor.split(',');
      preview.style.background = `linear-gradient(to right, ${colors.join(', ')})`;
    } else {
      preview.style.background = theme.snakeColor;
    }
    card.appendChild(preview);
    card.appendChild(document.createTextNode(theme.label));

    card.addEventListener('click', () => applyTheme(theme.name));
    els.themeGrid.appendChild(card);
  }
}

async function applyTheme(themeName) {
  try {
    config = await invoke('apply_theme', { themeName });
    updateUIFromConfig();
    notifyConfigChanged();
  } catch (e) {
    console.error('应用主题失败:', e);
  }
}

// ============ 配置加载与保存 ============

async function loadConfig() {
  try {
    config = await invoke('get_config');
  } catch (e) {
    console.error('加载配置失败:', e);
    return;
  }
  updateUIFromConfig();
}

function updateUIFromConfig() {
  if (!config) return;

  const wt = config.workTime;
  const ap = config.appearance;
  const dp = config.display;
  const ce = config.celebration;

  els.workStart.value = wt.start;
  els.workEnd.value = wt.end;
  setToggle(els.lunchEnabled, wt.lunch.enabled);
  els.lunchStart.value = wt.lunch.start;
  els.lunchEnd.value = wt.lunch.end;
  els.lunchRow.style.display = wt.lunch.enabled ? 'grid' : 'none';

  document.querySelectorAll('.weekday-btn').forEach((btn) => {
    const day = parseInt(btn.dataset.day);
    btn.classList.toggle('active', wt.workdays.includes(day));
  });

  els.snakeColor.value = ap.snakeColor.startsWith('#') ? ap.snakeColor.substring(0, 7) : '#00FF00';
  els.headColor.value = ap.headColor.startsWith('#') ? ap.headColor.substring(0, 7) : '#FFFF00';
  setToggle(els.rainbowMode, ap.rainbowMode);
  els.pixelSize.value = ap.pixelSize;
  els.pixelSizeVal.textContent = ap.pixelSize + 'px';
  els.opacity.value = ap.opacity;
  els.opacityVal.textContent = ap.opacity + '%';
  els.margin.value = ap.margin;
  els.marginVal.textContent = ap.margin + 'px';
  els.snakeLengthMode.value = ap.snakeLengthMode;
  els.fixedLengthRow.style.display = ap.snakeLengthMode === 'fixed' ? 'flex' : 'none';
  els.fixedLengthPercent.value = ap.fixedLengthPercent;
  els.fixedLengthPercentVal.textContent = ap.fixedLengthPercent + '%';
  els.animationSpeed.value = ap.animationSpeed;
  setToggle(els.showTrail, ap.showTrail);
  setToggle(els.headGlow, ap.headGlow);
  setToggle(els.straightMode, ap.straightMode);
  els.headShape.value = ap.headShape || 'triangle';
  els.skinTexture.value = ap.skinTexture || 'solid';

  setToggle(els.autoHideFullscreen, dp.autoHideFullscreen);
  setToggle(els.clickThrough, dp.clickThrough);
  setToggle(els.autoStart, dp.autoStart);
  setToggle(els.showOnNonWorkdays, dp.showOnNonWorkdays);
  setToggle(els.celebrationEnabled, ce.enabled);

  document.querySelectorAll('.theme-card').forEach((card) => {
    card.classList.toggle('active', card.dataset.name === ap.theme);
  });

  updateProgressPreview();
}

function collectConfigFromUI() {
  const workdays = [];
  document.querySelectorAll('.weekday-btn.active').forEach((btn) => {
    workdays.push(parseInt(btn.dataset.day));
  });

  return {
    version: config ? config.version : '1.0.0',
    workTime: {
      start: els.workStart.value,
      end: els.workEnd.value,
      lunch: {
        enabled: isToggleOn(els.lunchEnabled),
        start: els.lunchStart.value,
        end: els.lunchEnd.value,
      },
      workdays: workdays,
    },
    appearance: {
      theme: config ? config.appearance.theme : 'classic',
      snakeColor: els.snakeColor.value,
      headColor: els.headColor.value,
      colorMode: config ? config.appearance.colorMode : 'solid',
      rainbowMode: isToggleOn(els.rainbowMode),
      pixelSize: parseInt(els.pixelSize.value),
      opacity: parseInt(els.opacity.value),
      margin: parseInt(els.margin.value),
      snakeLengthMode: els.snakeLengthMode.value,
      fixedLengthPercent: parseInt(els.fixedLengthPercent.value),
      animationSpeed: els.animationSpeed.value,
      showTrail: isToggleOn(els.showTrail),
      headGlow: isToggleOn(els.headGlow),
      straightMode: isToggleOn(els.straightMode),
      headShape: els.headShape.value,
      skinTexture: els.skinTexture.value,
    },
    display: {
      monitor: config ? config.display.monitor : 'primary',
      autoHideFullscreen: isToggleOn(els.autoHideFullscreen),
      clickThrough: isToggleOn(els.clickThrough),
      autoStart: isToggleOn(els.autoStart),
      showOnNonWorkdays: isToggleOn(els.showOnNonWorkdays),
      nonWorkdayStyle: config ? config.display.nonWorkdayStyle : 'hidden',
    },
    shortcut: config ? config.shortcut : { toggleVisibility: 'Ctrl+Shift+S' },
    celebration: {
      enabled: isToggleOn(els.celebrationEnabled),
      duration: config ? config.celebration.duration : 3000,
      celebrationType: config ? config.celebration.celebrationType : 'fireworks',
    },
  };
}

async function saveConfig() {
  const newConfig = collectConfigFromUI();
  try {
    await invoke('save_config', { config: newConfig });
    config = newConfig;
    notifyConfigChanged();
  } catch (e) {
    console.error('保存配置失败:', e);
  }
}

function debouncedSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveConfig, 500);
}

async function notifyConfigChanged() {
  try {
    await emit('config-changed', config);
  } catch (e) {
    console.warn('发送配置变更事件失败:', e);
  }
}

// ============ 进度预览 ============

function calcRealtimePercent() {
  if (!config) return 0;

  const now = new Date();
  const currentTotalSeconds = now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds();

  const weekday = now.getDay() === 0 ? 7 : now.getDay();
  const workdays = config.workTime.workdays || [1, 2, 3, 4, 5];
  if (!workdays.includes(weekday)) return 0;

  const parseTime = (str) => {
    const [h, m] = str.split(':').map(Number);
    return h * 3600 + m * 60;
  };

  const startSec = parseTime(config.workTime.start);
  const endSec = parseTime(config.workTime.end);
  const lunchEnabled = config.workTime.lunch.enabled;
  const lunchStartSec = parseTime(config.workTime.lunch.start);
  const lunchEndSec = parseTime(config.workTime.lunch.end);
  const lunchDuration = lunchEnabled ? Math.max(0, lunchEndSec - lunchStartSec) : 0;
  const totalWorkSec = Math.max(0, endSec - startSec - lunchDuration);

  if (totalWorkSec <= 0) return 0;
  if (currentTotalSeconds < startSec) return 0;
  if (currentTotalSeconds >= endSec) return 100;
  if (lunchEnabled && currentTotalSeconds >= lunchStartSec && currentTotalSeconds < lunchEndSec) {
    const elapsedToLunch = Math.max(0, lunchStartSec - startSec);
    return (elapsedToLunch / totalWorkSec) * 100;
  }

  let elapsed = currentTotalSeconds - startSec;
  if (lunchEnabled && currentTotalSeconds >= lunchEndSec) elapsed -= lunchDuration;
  elapsed = Math.max(0, elapsed);
  return Math.min(100, (elapsed / totalWorkSec) * 100);
}

function updateProgressPreview() {
  const percent = calcRealtimePercent().toFixed(2);
  els.previewBar.style.width = percent + '%';
  els.previewBar.style.background = els.snakeColor.value || '#00FF00';
  els.previewText.textContent = percent + '%';
}

// ============ 配置导入导出 ============

async function exportConfig() {
  try {
    const json = await invoke('export_config');
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `snakeprogress-config-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  } catch (e) {
    alert('导出失败: ' + e);
  }
}

function importConfig() {
  els.importFileInput.click();
}

async function handleImportFile(event) {
  const file = event.target.files[0];
  if (!file) return;

  try {
    const text = await file.text();
    const result = await invoke('import_config', { json: text });
    if (result) {
      config = result;
      updateUIFromConfig();
      notifyConfigChanged();
      alert('配置导入成功');
    }
  } catch (e) {
    alert('配置导入失败: ' + e);
  }

  els.importFileInput.value = '';
}

// ============ 事件绑定 ============

function bindEvents() {
  // Tab 导航切换
  const tabNav = document.getElementById('tabNav');
  if (tabNav) {
    tabNav.addEventListener('click', (e) => {
      const btn = e.target.closest('.tab-btn');
      if (!btn) return;
      const tabId = btn.dataset.tab;
      // 更新 tab 按钮状态
      tabNav.querySelectorAll('.tab-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      // 更新 section 显示
      document.querySelectorAll('.settings-section').forEach((sec) => sec.classList.remove('active'));
      const targetSection = document.getElementById(tabId);
      if (targetSection) targetSection.classList.add('active');
    });
  }

  // Toggle 开关 - 统一绑定所有 toggle-switch
  const toggleEls = [
    els.lunchEnabled, els.rainbowMode, els.showTrail, els.headGlow,
    els.straightMode, els.autoHideFullscreen, els.clickThrough,
    els.autoStart, els.showOnNonWorkdays, els.celebrationEnabled,
  ];

  toggleEls.forEach((el) => {
    if (!el) return;
    el.addEventListener('click', () => {
      toggleSwitch(el);
      // 午休开关需要联动
      if (el === els.lunchEnabled) {
        els.lunchRow.style.display = isToggleOn(el) ? 'grid' : 'none';
      }
      debouncedSave();
    });
  });

  // 长度模式切换
  els.snakeLengthMode.addEventListener('change', () => {
    els.fixedLengthRow.style.display = els.snakeLengthMode.value === 'fixed' ? 'flex' : 'none';
    debouncedSave();
  });

  // 固定长度比例
  els.fixedLengthPercent.addEventListener('input', () => {
    els.fixedLengthPercentVal.textContent = els.fixedLengthPercent.value + '%';
    debouncedSave();
  });

  // 工作日按钮
  document.querySelectorAll('.weekday-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      btn.classList.toggle('active');
      debouncedSave();
    });
  });

  // 滑块实时显示
  els.pixelSize.addEventListener('input', () => {
    els.pixelSizeVal.textContent = els.pixelSize.value + 'px';
    debouncedSave();
  });

  els.opacity.addEventListener('input', () => {
    els.opacityVal.textContent = els.opacity.value + '%';
    debouncedSave();
  });

  els.margin.addEventListener('input', () => {
    els.marginVal.textContent = els.margin.value + 'px';
    debouncedSave();
  });

  // 自动保存的输入项 (非 toggle 的 input/select)
  const autoSaveInputs = [
    els.workStart, els.workEnd, els.lunchStart, els.lunchEnd,
    els.snakeColor, els.headColor,
    els.animationSpeed, els.headShape, els.skinTexture,
  ];

  autoSaveInputs.forEach((el) => {
    if (el) {
      el.addEventListener('change', debouncedSave);
      if (el.type === 'color') {
        el.addEventListener('input', debouncedSave);
      }
    }
  });

  // 进度预览定期刷新
  setInterval(updateProgressPreview, 1000);

  // 恢复默认
  els.resetBtn.addEventListener('click', async () => {
    const confirmed = await showConfirmModal(
      '确定要恢复默认设置吗？',
      '所有自定义配置将被清除'
    );
    if (confirmed) {
      try {
        config = await invoke('reset_config');
        updateUIFromConfig();
        notifyConfigChanged();
      } catch (e) {
        console.error('恢复默认配置失败:', e);
      }
    }
  });

  // 保存并关闭
  els.saveBtn.addEventListener('click', async () => {
    await saveConfig();
    try {
      const { getCurrentWindow } = window.__TAURI__.window;
      const win = getCurrentWindow();
      await win.setAlwaysOnTop(false);
      await win.hide();
    } catch (e) {
      console.warn('关闭窗口失败:', e);
    }
  });

  // 导入导出
  els.exportBtn.addEventListener('click', exportConfig);
  els.importBtn.addEventListener('click', importConfig);
  els.importFileInput.addEventListener('change', handleImportFile);

  // 颜色实时预览进度条
  els.snakeColor.addEventListener('input', () => {
    els.previewBar.style.background = els.snakeColor.value;
  });
}

// ============ 自定义确认弹窗 ============

function showConfirmModal(message, sub) {
  return new Promise((resolve) => {
    const overlay = document.getElementById('modalOverlay');
    const msgEl = document.getElementById('modalMessage');
    const subEl = document.getElementById('modalSub');
    const confirmBtn = document.getElementById('modalConfirm');
    const cancelBtn = document.getElementById('modalCancel');

    if (msgEl) msgEl.textContent = message || '确定要执行此操作吗？';
    if (subEl) subEl.textContent = sub || '';

    overlay.classList.add('visible');

    function cleanup(result) {
      overlay.classList.remove('visible');
      confirmBtn.removeEventListener('click', onConfirm);
      cancelBtn.removeEventListener('click', onCancel);
      overlay.removeEventListener('click', onOverlayClick);
      resolve(result);
    }

    function onConfirm() { cleanup(true); }
    function onCancel() { cleanup(false); }
    function onOverlayClick(e) {
      if (e.target === overlay) cleanup(false);
    }

    confirmBtn.addEventListener('click', onConfirm);
    cancelBtn.addEventListener('click', onCancel);
    overlay.addEventListener('click', onOverlayClick);
  });
}

// ============ 设置面板主题切换 ============

const SETTINGS_THEME_KEY = 'sp-settings-theme';

function applySettingsTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem(SETTINGS_THEME_KEY, theme);
}

function getSavedSettingsTheme() {
  return localStorage.getItem(SETTINGS_THEME_KEY) || 'dark';
}

function toggleSettingsTheme() {
  const current = document.documentElement.getAttribute('data-theme') || 'dark';
  applySettingsTheme(current === 'dark' ? 'light' : 'dark');
}

// ============ 主入口 ============

async function init() {
  await loadThemes();
  await loadConfig();
  bindEvents();
  updateProgressPreview();

  // 恢复主题
  applySettingsTheme(getSavedSettingsTheme());

  // 绑定主题切换按钮
  const themeToggleBtn = document.getElementById('settingsThemeToggle');
  if (themeToggleBtn) {
    themeToggleBtn.addEventListener('click', toggleSettingsTheme);
  }

  // 显示配置文件路径
  try {
    await invoke('get_config');
    els.configPath.textContent = '%APPDATA%\\SnakeProgress\\config.json';
  } catch (e) {
    // ignore
  }

  console.log('设置面板已加载');
}

init();

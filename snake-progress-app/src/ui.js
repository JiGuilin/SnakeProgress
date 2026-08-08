/**
 * UI：Tooltip、详情弹窗、关于对话框、打卡通知
 */
import { calculateBorderPath, getSnakeBlocks } from './path.js';

/** @type {object | null} */
let d = null;

let tooltipVisible = false;
let tooltipTimer = null;
let detailOverlay = null;
let aboutOverlay = null;
let clockNotification = null;

export function initUi(deps) {
  d = deps;
  bindCanvasInteractions();
}

function bindCanvasInteractions() {
  const { canvas, tooltip } = d;

  canvas.addEventListener('mousemove', (e) => {
    const s = d.getState();
    s.mouseX = e.clientX;
    s.mouseY = e.clientY;
    if (!s.config || !s.progressInfo) return;

    const { pixelSize } = s.config.appearance;
    const path = s.cachedPath;
    if (!path) return;
    const percent = d.calcRealtimePercent();
    const blocks = getSnakeBlocks(percent, path, {
      appearance: s.config.appearance,
      spawnAnimActive: s.spawnAnimActive,
      spawnAnimTargetPercent: s.spawnAnimTargetPercent,
    });

    let nearSnake = false;
    for (const block of blocks) {
      const dist = Math.hypot(e.clientX - block.x, e.clientY - block.y);
      if (dist < pixelSize * 2) {
        nearSnake = true;
        break;
      }
    }

    if (nearSnake) {
      const remaining = s.progressInfo.remainingMinutes;
      const hours = Math.floor(remaining / 60);
      const mins = remaining % 60;
      let statusText = '';
      if (s.progressInfo.isLunchBreak) {
        statusText = '🌙 午休中';
      } else if (s.progressInfo.status === 'Working') {
        statusText = `剩余 ${hours}h ${mins}min`;
      } else if (s.progressInfo.status === 'AfterWork') {
        statusText = '已完成';
      } else if (s.progressInfo.status === 'BeforeWork') {
        statusText = '等待上班';
      }

      tooltip.textContent = `工作进度 ${percent.toFixed(3)}%${statusText ? ' · ' + statusText : ''}`;
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
    } else if (tooltipVisible) {
      tooltip.classList.remove('visible');
      tooltipVisible = false;
    }
  });

  canvas.addEventListener('mouseleave', () => {
    const s = d.getState();
    tooltip.classList.remove('visible');
    tooltipVisible = false;
    s.mouseX = -9999;
    s.mouseY = -9999;
  });

  canvas.addEventListener('click', (e) => {
    const s = d.getState();
    if (!s.config || !s.progressInfo) return;

    const { pixelSize, margin } = s.config.appearance;
    const path = calculateBorderPath(window.innerWidth, window.innerHeight, margin, pixelSize, s.config.appearance);
    const percent = d.calcRealtimePercent();
    const blocks = getSnakeBlocks(percent, path, {
      appearance: s.config.appearance,
      spawnAnimActive: s.spawnAnimActive,
      spawnAnimTargetPercent: s.spawnAnimTargetPercent,
    });

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
}

export function showDetailDialog(clickX, clickY) {
  const s = d.getState();

  if (detailOverlay) {
    detailOverlay.remove();
    detailOverlay = null;
    d.invoke('set_overlay_open', { open: false });
    return;
  }

  const percent = d.calcRealtimePercent();
  const now = new Date();
  const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;
  const wt = s.config.workTime;

  let statusLabel = '';
  let statusEmoji = '';
  if (s.progressInfo.status === 'Working') {
    statusLabel = '工作中'; statusEmoji = '💼';
  } else if (s.progressInfo.status === 'BeforeWork') {
    statusLabel = '等待上班'; statusEmoji = '☀️';
  } else if (s.progressInfo.status === 'AfterWork') {
    statusLabel = '已完成'; statusEmoji = '🎉';
  } else if (s.progressInfo.status === 'NonWorkday') {
    statusLabel = '非工作日'; statusEmoji = '😴';
  } else if (s.progressInfo.isLunchBreak) {
    statusLabel = '午休中'; statusEmoji = '🌙';
  }

  const remaining = s.progressInfo.remainingMinutes || 0;
  const rHours = Math.floor(remaining / 60);
  const rMins = remaining % 60;

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
      <div style="font-size:32px;font-weight:bold;color:#4FC3F7;">${percent.toFixed(3)}%</div>
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
  d.invoke('set_overlay_open', { open: true });

  detailOverlay.addEventListener('click', (e) => {
    if (e.target === detailOverlay || e.target === dialog) {
      detailOverlay.remove();
      detailOverlay = null;
      d.invoke('set_overlay_open', { open: false });
    }
  });

  setTimeout(() => {
    if (document.getElementById('detailOverlay')) {
      detailOverlay.remove();
      detailOverlay = null;
      d.invoke('set_overlay_open', { open: false });
    }
  }, 5000);
}

export function showClockNotification(type, time) {
  if (clockNotification) {
    clockNotification.remove();
    clockNotification = null;
  }

  const isClockIn = type === 'clockIn';
  const emoji = isClockIn ? '📍' : '🏠';
  const label = isClockIn ? '上班打卡' : '下班打卡';
  const color = isClockIn ? '#4FC3F7' : '#FF7043';

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

export function showAboutDialog() {
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
    <p style="margin: 0 0 4px; color: #8b949e; font-size: 13px;">桌面贪吃蛇进度条 v0.2.0</p>
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

  d.invoke('set_overlay_open', { open: true });

  const observer = new MutationObserver(() => {
    if (!document.getElementById('aboutOverlay')) {
      observer.disconnect();
      d.invoke('set_overlay_open', { open: false });
    }
  });
  observer.observe(document.body, { childList: true });
}

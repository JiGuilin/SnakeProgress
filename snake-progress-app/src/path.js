/**
 * 蛇身边框路径与方块采样
 */

/** 路径点采样步长（px），与 pixelSize 解耦 */
export const PATH_STEP = 1;

/**
 * 计算蛇身沿屏幕边框的路径点（逻辑像素坐标）
 * @param {object} appearance - config.appearance
 */
export function calculateBorderPath(width, height, margin, pixelSize, appearance) {
  const ps = pixelSize;
  const alignToGrid = ps <= 2;
  const m = alignToGrid
    ? Math.round(margin + ps / 2)
    : margin + ps / 2;

  const startPos = appearance.startPosition || 'top-left';
  const direction = appearance.direction || 'clockwise';
  const displayMode = appearance.displayMode || 'full';

  if (displayMode === 'single') {
    return calculateSingleSidePath(width, height, m, PATH_STEP, alignToGrid, startPos, direction);
  }

  const top = [], right = [], bottom = [], left = [];
  for (let x = m; x <= width - m + 0.5; x += PATH_STEP) {
    top.push({ x: alignToGrid ? Math.round(x) : x, y: m, side: 'top' });
  }
  for (let y = m + PATH_STEP; y <= height - m + 0.5; y += PATH_STEP) {
    right.push({ x: width - m, y: alignToGrid ? Math.round(y) : y, side: 'right' });
  }
  for (let x = width - m - PATH_STEP; x >= m - 0.5; x -= PATH_STEP) {
    bottom.push({ x: alignToGrid ? Math.round(x) : x, y: height - m, side: 'bottom' });
  }
  for (let y = height - m - PATH_STEP; y >= m + PATH_STEP - 0.5; y -= PATH_STEP) {
    left.push({ x: m, y: alignToGrid ? Math.round(y) : y, side: 'left' });
  }

  const cwOrder = {
    'top-left': ['top', 'right', 'bottom', 'left'],
    'top-right': ['right', 'bottom', 'left', 'top'],
    'bottom-right': ['bottom', 'left', 'top', 'right'],
    'bottom-left': ['left', 'top', 'right', 'bottom'],
  };
  const ccwOrder = {
    'top-left': ['left', 'bottom', 'right', 'top'],
    'top-right': ['top', 'left', 'bottom', 'right'],
    'bottom-right': ['right', 'top', 'left', 'bottom'],
    'bottom-left': ['bottom', 'right', 'top', 'left'],
  };

  const orderMap = direction === 'counterclockwise' ? ccwOrder : cwOrder;
  const order = orderMap[startPos] || cwOrder['top-left'];
  const sideMap = { top, right, bottom, left };

  const path = [];
  for (const side of order) {
    const points = sideMap[side];
    if (direction === 'counterclockwise') {
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
 * 单边模式路径
 */
export function calculateSingleSidePath(width, height, m, ps, alignToGrid, startPos, direction) {
  const path = [];
  const addPoint = (x, y, s) => path.push({
    x: alignToGrid ? Math.round(x) : x,
    y: alignToGrid ? Math.round(y) : y,
    side: s,
  });

  const cwMap = {
    'top-left': { side: 'top', forward: true },
    'top-right': { side: 'right', forward: true },
    'bottom-right': { side: 'bottom', forward: false },
    'bottom-left': { side: 'left', forward: false },
  };
  const ccwMap = {
    'top-left': { side: 'left', forward: true },
    'top-right': { side: 'top', forward: false },
    'bottom-right': { side: 'right', forward: false },
    'bottom-left': { side: 'bottom', forward: true },
  };

  const map = direction === 'counterclockwise' ? ccwMap : cwMap;
  const cfg = map[startPos] || cwMap['top-left'];
  const side = cfg.side;
  const forward = cfg.forward;

  switch (side) {
    case 'top':
      if (forward) { for (let x = m; x <= width - m + 0.5; x += ps) addPoint(x, m, 'top'); }
      else { for (let x = width - m; x >= m - 0.5; x -= ps) addPoint(x, m, 'top'); }
      break;
    case 'right':
      if (forward) { for (let y = m; y <= height - m + 0.5; y += ps) addPoint(width - m, y, 'right'); }
      else { for (let y = height - m; y >= m - 0.5; y -= ps) addPoint(width - m, y, 'right'); }
      break;
    case 'bottom':
      if (forward) { for (let x = m; x <= width - m + 0.5; x += ps) addPoint(x, height - m, 'bottom'); }
      else { for (let x = width - m; x >= m - 0.5; x -= ps) addPoint(x, height - m, 'bottom'); }
      break;
    case 'left':
      if (forward) { for (let y = m; y <= height - m + 0.5; y += ps) addPoint(m, y, 'left'); }
      else { for (let y = height - m; y >= m - 0.5; y -= ps) addPoint(m, y, 'left'); }
      break;
  }
  return path;
}

/**
 * 按进度从路径采样蛇身方块
 * @param {object} options
 * @param {object} options.appearance
 * @param {boolean} options.spawnAnimActive
 * @param {number} options.spawnAnimTargetPercent
 */
export function getSnakeBlocks(percent, path, options) {
  const { appearance, spawnAnimActive, spawnAnimTargetPercent } = options;
  const totalBlocks = path.length;
  if (totalBlocks === 0) return [];

  const ps = appearance.pixelSize;
  const exactHeadIndex = (percent / 100) * totalBlocks;
  const clampedHead = Math.min(exactHeadIndex, totalBlocks - 1);

  let lengthRefHead = clampedHead;
  if (spawnAnimActive) {
    lengthRefHead = Math.min((spawnAnimTargetPercent / 100) * totalBlocks, totalBlocks - 1);
  }

  let snakeLengthPx;
  if (appearance.snakeLengthMode === 'fixed') {
    snakeLengthPx = Math.max(ps, totalBlocks * (appearance.fixedLengthPercent / 100));
  } else {
    snakeLengthPx = Math.max(ps, lengthRefHead + 1);
  }

  const exactTailIndex = Math.max(0, lengthRefHead - snakeLengthPx + 1);
  const visibleTailIndex = spawnAnimActive
    ? Math.max(0, clampedHead - snakeLengthPx + 1)
    : exactTailIndex;

  const spawnZonePx = ps * 3;
  const blockCount = Math.max(1, Math.floor((clampedHead - visibleTailIndex) / ps) + 1);
  const gap = ps >= 4 ? 1 : 0;
  const headSpacing = ps + Math.ceil((2 + gap) / 2);
  const blocks = [];

  for (let i = 0; i < blockCount; i++) {
    const fi = i === 0 ? clampedHead : clampedHead - headSpacing - (i - 1) * ps;
    if (fi < visibleTailIndex) break;

    const idx = Math.floor(fi);
    const f = fi - idx;
    if (idx < 0 || idx >= totalBlocks) continue;

    const cur = path[idx];
    const next = path[Math.min(idx + 1, totalBlocks - 1)];
    const x = cur.x + (next.x - cur.x) * f;
    const y = cur.y + (next.y - cur.y) * f;

    let spawnScale = 1;
    if (spawnAnimActive) {
      const distFromHead = i === 0 ? 0 : headSpacing + (i - 1) * ps;
      if (distFromHead < spawnZonePx) {
        spawnScale = Math.max(0, distFromHead / spawnZonePx);
      }
    }

    blocks.push({
      x,
      y,
      side: cur.side,
      index: idx,
      isHead: i === 0,
      progressRatio: totalBlocks > 1 ? idx / (totalBlocks - 1) : 0,
      spawnScale,
    });
  }

  blocks.reverse();
  return blocks;
}

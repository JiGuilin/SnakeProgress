/**
 * Canvas 绘制：蛇身、蛇头、轨迹、状态与庆祝动画
 */
import { calculateBorderPath, getSnakeBlocks } from './path.js';
import {
  hexToRgb,
  hslToHex,
  getBlockColor,
  getHeadColor,
  calcHeadAnimOffset,
  calcTailAnimOffset,
  drawBodyAnimEffect,
  sideToDirection,
  calcMouseFollowOffset,
} from './effects.js';

/** @type {object | null} */
let d = null;

export function initRender(deps) {
  d = deps;
}

export function render(timestamp) {
  const s = d.getState();

  if (timestamp - s.lastFrameTime < d.FRAME_INTERVAL) {
    s.animationId = requestAnimationFrame(render);
    return;
  }
  s.lastFrameTime = timestamp;

  const w = window.innerWidth;
  const h = window.innerHeight;
  d.ctx.clearRect(0, 0, w, h);

  if (!s.config || !s.progressInfo) {
    s.animationId = requestAnimationFrame(render);
    return;
  }

  if (!s.progressInfo.isWorkday && !s.config.display.showOnNonWorkdays) {
    s.animationId = requestAnimationFrame(render);
    return;
  }

  if (s.fadeOpacity < 0.01 && s.fadeTarget < 0.01) {
    s.rafPaused = true;
    s.animationId = null;
    return;
  }

  if (s.fadeOpacity < s.fadeTarget) {
    s.fadeOpacity = Math.min(s.fadeOpacity + d.FADE_SPEED, s.fadeTarget);
  } else if (s.fadeOpacity > s.fadeTarget) {
    s.fadeOpacity = Math.max(s.fadeOpacity - d.FADE_SPEED, s.fadeTarget);
  }

  const { pixelSize, margin, showTrail, headGlow } = s.config.appearance;
  const realPercent = d.calcRealtimePercent();
  const pathKey = `${w}x${h}_${margin}_${pixelSize}_${s.config.display.mode}`;
  let path;
  if (pathKey === s.cachedPathKey && s.cachedPath) {
    path = s.cachedPath;
  } else {
    path = calculateBorderPath(w, h, margin, pixelSize, s.config.appearance);
    s.cachedPath = path;
    s.cachedPathKey = pathKey;
  }

  if (s.spawnAnimActive) {
    const elapsed = (timestamp - s.spawnAnimStartTime) / 1000;
    const progress = Math.min(1, elapsed / d.SPAWN_ANIM_DURATION);
    const eased = progress < 0.5
      ? 2 * progress * progress
      : 1 - Math.pow(-2 * progress + 2, 2) / 2;
    s.spawnAnimPercent = s.spawnAnimTargetPercent * eased;
    if (progress >= 1) {
      s.spawnAnimPercent = s.spawnAnimTargetPercent;
      s.spawnAnimActive = false;
    }
  }
  const percent = s.spawnAnimActive ? s.spawnAnimPercent : realPercent;

  const speedMap = { slow: 0.3, normal: 1, fast: 3 };
  const speed = speedMap[s.config.appearance.animationSpeed] || 1;
  const deltaSec = Math.min((timestamp - s.lastFrameTime + d.FRAME_INTERVAL) / 1000, 0.1);
  s.wiggleOffset = (s.wiggleOffset + speed * deltaSec * Math.PI) % (Math.PI * 2);
  s.bodyAnimPhase = (timestamp / 1000) % (Math.PI * 2);

  if (showTrail) {
    drawTrail(path, percent, pixelSize);
  }

  const blocks = getSnakeBlocks(percent, path, {
    appearance: s.config.appearance,
    spawnAnimActive: s.spawnAnimActive,
    spawnAnimTargetPercent: s.spawnAnimTargetPercent,
  });
  drawSnakeBody(blocks, pixelSize);

  if (headGlow && blocks.length > 0) {
    drawHeadGlow(blocks[blocks.length - 1], pixelSize, timestamp);
  }

  const showPowerUps = s.config.appearance.showPowerUps !== false;
  if (showPowerUps) {
    d.powerUpSystem.drawMilestones(d.ctx, path, pixelSize, percent, s.fadeOpacity);
    const roundedPercent = Math.floor(percent);
    if (roundedPercent !== s.lastMilestoneCheck) {
      s.lastMilestoneCheck = roundedPercent;
      d.powerUpSystem.checkCollection(percent);
    }
    d.powerUpSystem.drawEatAnimations(d.ctx, path, pixelSize, s.fadeOpacity);
  }

  const randomFoodEnabled = s.config.appearance.randomFoodEnabled !== false;
  if (randomFoodEnabled) {
    const foodInterval = s.config.appearance.randomFoodInterval || 15;
    if (blocks.length > 0) {
      const headBlock = blocks[blocks.length - 1];
      d.randomFoodSystem.checkCollectionByPosition(headBlock, path, pixelSize);
    }
    const foodRangeMin = s.config.appearance.randomFoodRangeMin ?? 0.5;
    const foodRangeMax = s.config.appearance.randomFoodRangeMax ?? 5;
    const foodMaxCount = s.config.appearance.randomFoodMaxCount ?? 5;
    d.randomFoodSystem.trySpawn(percent, path.length, foodInterval, pixelSize, foodRangeMin, foodRangeMax, foodMaxCount);
    d.randomFoodSystem.drawFoods(d.ctx, path, pixelSize, percent, s.fadeOpacity);
    d.randomFoodSystem.drawEatAnimations(d.ctx, path, pixelSize, s.fadeOpacity);
  }

  if (s.progressInfo.isLunchBreak) {
    drawLunchBreakOverlay(w, h);
  }

  if (s.celebrationActive) {
    drawCelebration(timestamp, w, h);
  }

  drawStatusText(w, h);

  s.animationId = requestAnimationFrame(render);
}

function drawTrail(path, percent, pixelSize) {
  const s = d.getState();
  const totalBlocks = path.length;
  const headBlockIndex = Math.floor((percent / 100) * totalBlocks);
  const opacity = 0.06 * s.fadeOpacity;
  const half = pixelSize / 2;
  const snap = pixelSize <= 2;
  const step = Math.max(2, pixelSize * 2);

  d.ctx.fillStyle = `rgba(255, 255, 255, ${opacity})`;
  for (let i = headBlockIndex + 1; i < totalBlocks; i += step) {
    const p = path[i];
    if (p) {
      const tx = snap ? Math.round(p.x - half) : p.x - half;
      const ty = snap ? Math.round(p.y - half) : p.y - half;
      d.ctx.fillRect(tx, ty, pixelSize, pixelSize);
    }
  }
}

function drawSnakeBody(blocks, pixelSize) {
  const s = d.getState();
  const appearance = s.config.appearance;
  const gap = pixelSize >= 4 ? 1 : 0;
  const blockSize = Math.max(1, pixelSize - gap);
  const motionMode = appearance.bodyMotionMode || (appearance.straightMode ? 'straight' : 'wiggle');
  const tiny = pixelSize <= 2 || motionMode === 'straight';
  const snap = tiny;
  const totalBlocks = blocks.length;
  const texture = appearance.skinTexture || 'solid';
  const _headShape = appearance.headShape || 'triangle';
  const _skinTexture = appearance.skinTexture || 'solid';
  const spriteHeadVariant = _headShape.startsWith('sprite_') ? _headShape.slice(7) : null;
  const spriteBodyVariant = _skinTexture.startsWith('sprite_') ? _skinTexture.slice(7) : null;
  const useSpriteHead = spriteHeadVariant !== null;
  const useSpriteBody = spriteBodyVariant !== null;

  const headAnim = appearance.headAnimEffect || 'none';
  const tailAnim = appearance.tailAnimEffect || 'none';
  const bodyAnim = appearance.bodyAnimEffect || 'none';

  let tailTaperCount = 0;
  if (pixelSize > 2) {
    tailTaperCount = Math.min(Math.max(4, Math.floor(pixelSize * 1.1)), Math.floor(totalBlocks / 3));
  }
  const headNoWiggle = pixelSize > 2 ? 2 : 0;
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
            const wave = Math.sin(bIdx * 0.35 + s.wiggleOffset) * Math.min(2, pixelSize * 0.6);
            if (isVertical) { dy = wave; } else { dx = wave; }
            break;
          }
          case 'bounce': {
            const bounce = Math.abs(Math.sin(bIdx * 0.3 + s.wiggleOffset)) * Math.min(2, pixelSize * 0.25);
            if (isVertical) { dy = -bounce; } else { dx = -bounce; }
            break;
          }
          case 'coil': {
            const c1 = Math.sin(bIdx * 0.4 + s.wiggleOffset) * Math.min(1.5, pixelSize * 0.18);
            const c2 = Math.cos(bIdx * 0.25 + s.wiggleOffset) * Math.min(1, pixelSize * 0.1);
            dx = c1; dy = c2;
            break;
          }
          case 'wiggle':
          default: {
            const wiggle = Math.sin(bIdx * 0.5 + s.wiggleOffset) * Math.min(1, pixelSize * 0.12);
            if (isVertical) { dy = wiggle; } else { dx = wiggle; }
            break;
          }
        }
      }
    }

    let scale = 1;
    if (tailTaperCount > 0 && bodyPos < tailTaperCount) {
      scale = (bodyPos + 1) / tailTaperCount;
      const minScale = pixelSize > 8 ? 0.15 : pixelSize > 4 ? 0.2 : 0.3;
      scale = Math.max(minScale, scale);
    }

    if (block.isHead && pixelSize > 2) {
      const headSize = pixelSize + 2;
      let headDx = 0, headDy = 0;
      if (headAnim !== 'none') {
        const headOff = calcHeadAnimOffset(block, pixelSize, headAnim, s.bodyAnimPhase);
        headDx = headOff.dx;
        headDy = headOff.dy;
      }
      if (useSpriteHead) {
        drawSpriteHead(block, headSize, dx + headDx, dy + headDy, spriteHeadVariant);
      } else {
        drawHead(block, headSize, dx + headDx, dy + headDy);
      }
    } else {
      let tailDx = 0, tailDy = 0, tailScale = 1;
      if (tailAnim !== 'none' && tailTaperCount > 0 && bodyPos < tailTaperCount) {
        const tailOff = calcTailAnimOffset(block, bIdx, tailTaperCount, pixelSize, tailAnim, s.bodyAnimPhase);
        tailDx = tailOff.dx;
        tailDy = tailOff.dy;
        if (tailOff.scale) tailScale = tailOff.scale;
      }
      const scaledSize = Math.max(1, blockSize * scale * tailScale);
      const bx = snap ? Math.round(block.x - scaledSize / 2 + dx + tailDx) : block.x - scaledSize / 2 + dx + tailDx;
      const by = snap ? Math.round(block.y - scaledSize / 2 + dy + tailDy) : block.y - scaledSize / 2 + dy + tailDy;

      if (useSpriteBody) {
        drawSpriteBodyBlock(bx, by, scaledSize, block, bIdx, spriteBodyVariant);
      } else if (texture === 'solid' || pixelSize <= 3) {
        d.ctx.fillStyle = block.isHead
          ? getHeadColor(appearance, s.fadeOpacity)
          : getBlockColor(block, appearance, s.fadeOpacity);
        d.ctx.fillRect(bx, by, scaledSize, scaledSize);
      } else if (texture === 'checkerboard') {
        drawCheckerboardBlock(bx, by, scaledSize, block, bIdx);
      } else if (texture === 'stripe') {
        drawStripeBlock(bx, by, scaledSize, block);
      } else if (texture === 'dots') {
        drawDotsBlock(bx, by, scaledSize, block, bIdx);
      } else if (texture === 'outline') {
        drawOutlineBlock(bx, by, scaledSize, block, bIdx);
      } else if (texture === 'cross') {
        drawCrossBlock(bx, by, scaledSize, block, bIdx);
      }

      if (bodyAnim !== 'none') {
        drawBodyAnimEffect(d.ctx, bx, by, scaledSize, block, bIdx, totalBlocks, bodyAnim, s.bodyAnimPhase, s.fadeOpacity);
      }
    }
  }
}

function drawSpriteHead(headBlock, headSize, dx, dy, variant) {
  const s = d.getState();
  const appearance = s.config.appearance;
  const ps = appearance.pixelSize;
  const { followDx, followDy } = calcMouseFollowOffset(headBlock, s.mouseX, s.mouseY, ps);

  const cx = headBlock.x + dx + followDx;
  const cy = headBlock.y + dy + followDy;
  const isCCW = appearance.direction === 'counterclockwise';
  const direction = sideToDirection(headBlock.side, isCCW);
  const headColor = appearance.headColor;

  const sprite = d.spriteGen.generateHead(Math.max(2, Math.round(headSize)), direction, headColor, variant);
  const headRgb = hexToRgb(headColor);
  d.ctx.shadowColor = `rgba(${headRgb.r}, ${headRgb.g}, ${headRgb.b}, 0.8)`;
  d.ctx.shadowBlur = 6;
  d.ctx.drawImage(sprite, cx - headSize / 2, cy - headSize / 2, headSize, headSize);
  d.ctx.shadowColor = 'transparent';
  d.ctx.shadowBlur = 0;
}

function drawSpriteBodyBlock(bx, by, size, block, bIdx, variant) {
  const s = d.getState();
  const appearance = s.config.appearance;
  let hexColor;
  if (appearance.rainbowMode) {
    hexColor = hslToHex((block.progressRatio * 360) % 360, 100, 55);
  } else {
    hexColor = appearance.snakeColor.split(',')[0].trim();
  }
  const sprite = d.spriteGen.generateBody(Math.round(size), hexColor, variant, bIdx);
  d.ctx.drawImage(sprite, bx, by, size, size);
}

function drawCheckerboardBlock(bx, by, size, block, bIdx) {
  const s = d.getState();
  const appearance = s.config.appearance;
  d.ctx.fillStyle = block.isHead
    ? getHeadColor(appearance, s.fadeOpacity)
    : getBlockColor(block, appearance, s.fadeOpacity);
  d.ctx.fillRect(bx, by, size, size);
  if (bIdx % 2 === 1) {
    d.ctx.fillStyle = 'rgba(0, 0, 0, 0.25)';
    d.ctx.fillRect(bx, by, size, size);
  }
}

function drawStripeBlock(bx, by, size, block) {
  const s = d.getState();
  const appearance = s.config.appearance;
  d.ctx.fillStyle = block.isHead
    ? getHeadColor(appearance, s.fadeOpacity)
    : getBlockColor(block, appearance, s.fadeOpacity);
  d.ctx.fillRect(bx, by, size, size);
  d.ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
  if (block.side === 'top' || block.side === 'bottom') {
    const stripeH = Math.max(1, size / 3);
    d.ctx.fillRect(bx, by, size, stripeH);
    d.ctx.fillRect(bx, by + size - stripeH, size, stripeH);
  } else {
    const stripeW = Math.max(1, size / 3);
    d.ctx.fillRect(bx, by, stripeW, size);
    d.ctx.fillRect(bx + size - stripeW, by, stripeW, size);
  }
}

function drawDotsBlock(bx, by, size, block, bIdx) {
  const s = d.getState();
  const appearance = s.config.appearance;
  d.ctx.fillStyle = block.isHead
    ? getHeadColor(appearance, s.fadeOpacity)
    : getBlockColor(block, appearance, s.fadeOpacity);
  d.ctx.fillRect(bx, by, size, size);
  const dotRadius = Math.max(1, size * 0.25);
  const cx = bx + size / 2;
  const cy = by + size / 2;
  const dotAlpha = bIdx % 2 === 0 ? 0.35 : 0.15;
  d.ctx.fillStyle = `rgba(255, 255, 255, ${dotAlpha})`;
  d.ctx.beginPath();
  d.ctx.arc(cx, cy, dotRadius, 0, Math.PI * 2);
  d.ctx.fill();
}

function drawOutlineBlock(bx, by, size, block) {
  const s = d.getState();
  const appearance = s.config.appearance;
  d.ctx.fillStyle = block.isHead
    ? getHeadColor(appearance, s.fadeOpacity)
    : getBlockColor(block, appearance, s.fadeOpacity);
  d.ctx.fillRect(bx, by, size, size);
  const inset = Math.max(1, size * 0.15);
  d.ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
  d.ctx.lineWidth = Math.max(1, size * 0.08);
  d.ctx.strokeRect(bx + inset, by + inset, size - inset * 2, size - inset * 2);
}

function drawCrossBlock(bx, by, size, block) {
  const s = d.getState();
  const appearance = s.config.appearance;
  d.ctx.fillStyle = block.isHead
    ? getHeadColor(appearance, s.fadeOpacity)
    : getBlockColor(block, appearance, s.fadeOpacity);
  d.ctx.fillRect(bx, by, size, size);
  const lineW = Math.max(1, size * 0.15);
  const cx = bx + size / 2;
  const cy = by + size / 2;
  d.ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
  d.ctx.fillRect(bx, cy - lineW / 2, size, lineW);
  d.ctx.fillRect(cx - lineW / 2, by, lineW, size);
  const dotR = Math.max(1, size * 0.12);
  d.ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
  d.ctx.beginPath();
  d.ctx.arc(cx, cy, dotR, 0, Math.PI * 2);
  d.ctx.fill();
}

function drawHead(headBlock, headSize, dx, dy) {
  const s = d.getState();
  const appearance = s.config.appearance;
  d.ctx.fillStyle = getHeadColor(appearance, s.fadeOpacity);
  const headRgb = hexToRgb(appearance.headColor);
  d.ctx.shadowColor = `rgba(${headRgb.r}, ${headRgb.g}, ${headRgb.b}, 0.8)`;
  d.ctx.shadowBlur = 6;

  const ps = appearance.pixelSize;
  const { followDx, followDy } = calcMouseFollowOffset(headBlock, s.mouseX, s.mouseY, ps);

  const cx = headBlock.x + dx + followDx;
  const cy = headBlock.y + dy + followDy;
  const half = headSize / 2;
  const shape = appearance.headShape || 'triangle';
  const isCCW = appearance.direction === 'counterclockwise';
  const dir = sideToDirection(headBlock.side, isCCW);

  if (shape === 'triangle') {
    let p1x, p1y, p2x, p2y, p3x, p3y;
    if (dir === 'right') {
      p1x = cx + half; p1y = cy; p2x = cx - half; p2y = cy - half; p3x = cx - half; p3y = cy + half;
    } else if (dir === 'bottom') {
      p1x = cx; p1y = cy + half; p2x = cx - half; p2y = cy - half; p3x = cx + half; p3y = cy - half;
    } else if (dir === 'left') {
      p1x = cx - half; p1y = cy; p2x = cx + half; p2y = cy - half; p3x = cx + half; p3y = cy + half;
    } else {
      p1x = cx; p1y = cy - half; p2x = cx - half; p2y = cy + half; p3x = cx + half; p3y = cy + half;
    }
    d.ctx.beginPath();
    d.ctx.moveTo(p1x, p1y);
    d.ctx.lineTo(p2x, p2y);
    d.ctx.lineTo(p3x, p3y);
    d.ctx.closePath();
    d.ctx.fill();
  } else if (shape === 'rectangle') {
    const longSide = headSize * 1.5;
    const shortSide = headSize;
    const halfLong = longSide / 2;
    const halfShort = shortSide / 2;
    if (dir === 'right' || dir === 'left') {
      d.ctx.fillRect(cx - halfLong, cy - halfShort, longSide, shortSide);
    } else {
      d.ctx.fillRect(cx - halfShort, cy - halfLong, shortSide, longSide);
    }
  } else if (shape === 'square') {
    d.ctx.fillRect(cx - half, cy - half, headSize, headSize);
  } else if (shape === 'circle') {
    d.ctx.beginPath();
    d.ctx.arc(cx, cy, half, 0, Math.PI * 2);
    d.ctx.fill();
  } else if (shape === 'diamond') {
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
    d.ctx.beginPath();
    d.ctx.moveTo(top.x, top.y);
    d.ctx.lineTo(right.x, right.y);
    d.ctx.lineTo(bottom.x, bottom.y);
    d.ctx.lineTo(left.x, left.y);
    d.ctx.closePath();
    d.ctx.fill();
  } else if (shape === 'arrow') {
    const longHalf = half * 1.4;
    const wingHalf = half * 0.6;
    let tip, baseL, baseR, wingL, wingR;
    if (dir === 'right') {
      tip = { x: cx + longHalf, y: cy };
      baseR = { x: cx - half * 0.5, y: cy - half };
      baseL = { x: cx - half * 0.5, y: cy + half };
      wingR = { x: cx - longHalf, y: cy - wingHalf };
      wingL = { x: cx - longHalf, y: cy + wingHalf };
    } else if (dir === 'bottom') {
      tip = { x: cx, y: cy + longHalf };
      baseR = { x: cx + half, y: cy - half * 0.5 };
      baseL = { x: cx - half, y: cy - half * 0.5 };
      wingR = { x: cx + wingHalf, y: cy - longHalf };
      wingL = { x: cx - wingHalf, y: cy - longHalf };
    } else if (dir === 'left') {
      tip = { x: cx - longHalf, y: cy };
      baseR = { x: cx + half * 0.5, y: cy + half };
      baseL = { x: cx + half * 0.5, y: cy - half };
      wingR = { x: cx + longHalf, y: cy + wingHalf };
      wingL = { x: cx + longHalf, y: cy - wingHalf };
    } else {
      tip = { x: cx, y: cy - longHalf };
      baseR = { x: cx - half, y: cy + half * 0.5 };
      baseL = { x: cx + half, y: cy + half * 0.5 };
      wingR = { x: cx - wingHalf, y: cy + longHalf };
      wingL = { x: cx + wingHalf, y: cy + longHalf };
    }
    d.ctx.beginPath();
    d.ctx.moveTo(tip.x, tip.y);
    d.ctx.lineTo(baseR.x, baseR.y);
    d.ctx.lineTo(wingR.x, wingR.y);
    d.ctx.lineTo(baseL.x, baseL.y);
    d.ctx.lineTo(wingL.x, wingL.y);
    d.ctx.closePath();
    d.ctx.fill();
  } else if (shape === 'hexagon') {
    const longHalf = half * 1.2;
    const shortHalf = half * 0.85;
    const pts = [];
    if (dir === 'right' || dir === 'left') {
      const sign = dir === 'right' ? 1 : -1;
      pts.push({ x: cx + sign * longHalf, y: cy });
      pts.push({ x: cx + sign * shortHalf, y: cy - half });
      pts.push({ x: cx - sign * shortHalf, y: cy - half });
      pts.push({ x: cx - sign * longHalf, y: cy });
      pts.push({ x: cx - sign * shortHalf, y: cy + half });
      pts.push({ x: cx + sign * shortHalf, y: cy + half });
    } else {
      const sign = dir === 'bottom' ? 1 : -1;
      pts.push({ x: cx, y: cy + sign * longHalf });
      pts.push({ x: cx + half, y: cy + sign * shortHalf });
      pts.push({ x: cx + half, y: cy - sign * shortHalf });
      pts.push({ x: cx, y: cy - sign * longHalf });
      pts.push({ x: cx - half, y: cy - sign * shortHalf });
      pts.push({ x: cx - half, y: cy + sign * shortHalf });
    }
    d.ctx.beginPath();
    d.ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) d.ctx.lineTo(pts[i].x, pts[i].y);
    d.ctx.closePath();
    d.ctx.fill();
  } else if (shape === 'star') {
    const outerR = half * 1.2;
    const innerR = half * 0.5;
    const baseAngle = { right: 0, bottom: Math.PI / 2, left: Math.PI, top: -Math.PI / 2 }[dir] || 0;
    d.ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const r = i % 2 === 0 ? outerR : innerR;
      const angle = baseAngle + (i * Math.PI) / 5;
      const px = cx + Math.cos(angle) * r;
      const py = cy + Math.sin(angle) * r;
      if (i === 0) d.ctx.moveTo(px, py); else d.ctx.lineTo(px, py);
    }
    d.ctx.closePath();
    d.ctx.fill();
  }

  d.ctx.shadowColor = 'transparent';
  d.ctx.shadowBlur = 0;
}

function drawHeadGlow(headBlock, pixelSize, timestamp) {
  const s = d.getState();
  s.headGlowPhase = (timestamp / 500) % (Math.PI * 2);
  const glowIntensity = (0.3 + Math.sin(s.headGlowPhase) * 0.2) * s.fadeOpacity;
  const glowSize = pixelSize * 3;
  const headRgb = hexToRgb(s.config.appearance.headColor);
  const glowKey = `${Math.round(headBlock.x)},${Math.round(headBlock.y)},${headRgb.r},${headRgb.g},${headRgb.b},${glowIntensity.toFixed(2)},${glowSize}`;
  if (glowKey !== s.cachedGlowKey) {
    s.cachedGlowGradient = d.ctx.createRadialGradient(
      headBlock.x, headBlock.y, pixelSize / 2,
      headBlock.x, headBlock.y, glowSize
    );
    s.cachedGlowGradient.addColorStop(0, `rgba(${headRgb.r}, ${headRgb.g}, ${headRgb.b}, ${glowIntensity})`);
    s.cachedGlowGradient.addColorStop(1, `rgba(${headRgb.r}, ${headRgb.g}, ${headRgb.b}, 0)`);
    s.cachedGlowKey = glowKey;
  }
  d.ctx.fillStyle = s.cachedGlowGradient;
  d.ctx.fillRect(headBlock.x - glowSize, headBlock.y - glowSize, glowSize * 2, glowSize * 2);
}

function drawLunchBreakOverlay(w, h) {
  const s = d.getState();
  d.ctx.fillStyle = `rgba(0, 0, 0, ${0.15 * s.fadeOpacity})`;
  d.ctx.fillRect(0, 0, w, h);
  d.ctx.fillStyle = `rgba(255, 255, 255, ${0.5 * s.fadeOpacity})`;
  d.ctx.font = '14px "Segoe UI", "Microsoft YaHei", sans-serif';
  d.ctx.textAlign = 'center';
  d.ctx.fillText('🌙 午休中', w / 2, 30);
  d.ctx.textAlign = 'start';
}

function drawStatusText(w, h) {
  const s = d.getState();
  if (!s.progressInfo) return;

  if (s.progressInfo.status === 'Working' || s.progressInfo.isLunchBreak) {
    const percent = s.spawnAnimActive ? s.spawnAnimPercent : d.calcRealtimePercent();
    const percentText = percent.toFixed(3) + '%';
    d.ctx.font = 'bold 11px "Segoe UI", "Microsoft YaHei", sans-serif';
    d.ctx.textAlign = 'center';
    const textX = w - 50;
    const textY = 16;
    const metrics = d.ctx.measureText(percentText);
    const padding = 4;
    d.ctx.fillStyle = `rgba(0, 0, 0, ${0.4 * s.fadeOpacity})`;
    d.ctx.fillRect(
      textX - metrics.width / 2 - padding,
      textY - 10 - padding / 2,
      metrics.width + padding * 2,
      14 + padding
    );
    d.ctx.fillStyle = `rgba(255, 255, 255, ${0.85 * s.fadeOpacity})`;
    d.ctx.fillText(percentText, textX, textY);
    d.ctx.textAlign = 'start';
    return;
  }

  let text = '';
  if (s.progressInfo.status === 'BeforeWork') text = '☀️ 等待上班';
  else if (s.progressInfo.status === 'AfterWork') text = '🎉 今日已完成';
  else if (s.progressInfo.status === 'NonWorkday') text = '😴 非工作日';

  if (text) {
    d.ctx.fillStyle = `rgba(255, 255, 255, ${0.4 * s.fadeOpacity})`;
    d.ctx.font = '13px "Segoe UI", "Microsoft YaHei", sans-serif';
    d.ctx.textAlign = 'center';
    d.ctx.fillText(text, w / 2, h / 2);
    d.ctx.textAlign = 'start';
  }
}

function drawCelebration(timestamp, w, h) {
  const s = d.getState();
  if (!s.celebrationActive) return;

  const elapsed = timestamp - s.celebrationStart;
  const duration = s.config.celebration.duration || 3000;

  if (elapsed > duration) {
    s.celebrationActive = false;
    s.celebrationParticles = null;
    return;
  }

  const progress = elapsed / duration;
  const particleCount = 50;

  if (!s.celebrationParticles) {
    s.celebrationParticles = [];
    for (let i = 0; i < particleCount; i++) {
      s.celebrationParticles.push({
        size: 3 + Math.random() * 4,
        speedVar: Math.random() * 0.5,
        angleOffset: (i / particleCount) * Math.PI * 2,
      });
    }
  }

  for (let i = 0; i < particleCount; i++) {
    const p = s.celebrationParticles[i];
    const angle = p.angleOffset + progress * 3;
    const speed = 50 + progress * 200 * (1 + p.speedVar);
    const x = w / 2 + Math.cos(angle) * speed * progress;
    const y = h / 2 + Math.sin(angle) * speed * progress - progress * 100;
    const hue = (i * 30 + progress * 360) % 360;
    const alpha = (1 - progress) * s.fadeOpacity;
    d.ctx.fillStyle = `hsla(${hue}, 100%, 60%, ${alpha})`;
    d.ctx.fillRect(x - p.size / 2, y - p.size / 2, p.size, p.size);
  }
}

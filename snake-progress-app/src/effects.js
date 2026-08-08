/**
 * 颜色计算与蛇身/头/尾动效
 */

export function hexToRgb(hex) {
  hex = hex.split(',')[0].trim();
  hex = hex.replace('#', '');
  return {
    r: parseInt(hex.substring(0, 2), 16),
    g: parseInt(hex.substring(2, 4), 16),
    b: parseInt(hex.substring(4, 6), 16),
  };
}

export function interpolateColor(hex1, hex2, ratio, opacity) {
  const c1 = hexToRgb(hex1);
  const c2 = hexToRgb(hex2);
  const r = Math.round(c1.r + (c2.r - c1.r) * ratio);
  const g = Math.round(c1.g + (c2.g - c1.g) * ratio);
  const b = Math.round(c1.b + (c2.b - c1.b) * ratio);
  return `rgba(${r}, ${g}, ${b}, ${opacity})`;
}

export function hslToHex(h, s, l) {
  s /= 100; l /= 100;
  const a = s * Math.min(l, 1 - l);
  const f = n => {
    const k = (n + h / 30) % 12;
    const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
    return Math.round(255 * color).toString(16).padStart(2, '0');
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

export function getBlockColor(block, appearance, fadeOpacity) {
  const opacity = (appearance.opacity / 100) * fadeOpacity;

  if (appearance.rainbowMode) {
    const hue = (block.progressRatio * 360) % 360;
    return `hsla(${hue}, 100%, 55%, ${opacity})`;
  }

  if (appearance.colorMode === 'gradient') {
    const colors = appearance.snakeColor.split(',');
    if (colors.length >= 2) {
      return interpolateColor(colors[0], colors[1], block.progressRatio, opacity);
    }
  }

  const rgb = hexToRgb(appearance.snakeColor);
  return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${opacity})`;
}

export function getHeadColor(appearance, fadeOpacity) {
  const rgb = hexToRgb(appearance.headColor);
  const opacity = (appearance.opacity / 100) * fadeOpacity;
  return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${opacity})`;
}

/**
 * 蛇头动画偏移
 */
export function calcHeadAnimOffset(headBlock, pixelSize, effect, bodyAnimPhase) {
  const phase = bodyAnimPhase;
  const amp = pixelSize * 0.6;
  const side = headBlock.side;

  switch (effect) {
    case 'nod': {
      const offset = Math.sin(phase * 2) * amp;
      if (side === 'top') return { dx: offset, dy: 0 };
      if (side === 'right') return { dx: 0, dy: offset };
      if (side === 'bottom') return { dx: -offset, dy: 0 };
      return { dx: 0, dy: -offset };
    }
    case 'bob': {
      const offset = Math.sin(phase * 2.5) * amp * 0.8;
      if (side === 'top' || side === 'bottom') return { dx: 0, dy: offset };
      return { dx: offset, dy: 0 };
    }
    case 'wobble': {
      const ox = Math.sin(phase * 3) * amp * 0.5;
      const oy = Math.cos(phase * 2.3) * amp * 0.5;
      return { dx: ox, dy: oy };
    }
    case 'shake': {
      const sx = Math.sin(phase * 12) * amp * 0.25;
      const sy = Math.cos(phase * 11) * amp * 0.25;
      return { dx: sx, dy: sy };
    }
    case 'bounce': {
      const bounceY = -Math.abs(Math.sin(phase * 3)) * amp * 0.8;
      if (side === 'top' || side === 'bottom') return { dx: 0, dy: bounceY };
      return { dx: bounceY, dy: 0 };
    }
    default:
      return { dx: 0, dy: 0 };
  }
}

/**
 * 尾巴动画偏移
 */
export function calcTailAnimOffset(block, bIdx, tailLen, pixelSize, effect, bodyAnimPhase) {
  const phase = bodyAnimPhase;
  const progress = bIdx / tailLen;
  const ampByPos = pixelSize * 0.4 * (1 - progress);
  const side = block.side;

  switch (effect) {
    case 'swish': {
      const offset = Math.sin(phase * 3 + bIdx * 0.5) * ampByPos;
      if (side === 'top' || side === 'bottom') return { dx: 0, dy: offset };
      return { dx: offset, dy: 0 };
    }
    case 'curl': {
      const curlFactor = Math.sin(phase * 2) * 0.3;
      const extraScale = 1 + (progress < 0.5 ? curlFactor * (1 - progress * 2) : 0);
      return { dx: 0, dy: 0, scale: Math.max(0.2, extraScale) };
    }
    case 'pulse': {
      const pulseFactor = 1 + Math.sin(phase * 2.5 + bIdx * 0.3) * 0.25;
      return { dx: 0, dy: 0, scale: pulseFactor };
    }
    case 'flame': {
      const flameOff = Math.sin(phase * 5 + bIdx * 1.7) * ampByPos * 0.6;
      const flameScale = 1 + Math.sin(phase * 4 + bIdx * 2.1) * 0.2 * (1 - progress);
      if (side === 'top' || side === 'bottom') return { dx: flameOff, dy: 0, scale: Math.max(0.2, flameScale) };
      return { dx: 0, dy: flameOff, scale: Math.max(0.2, flameScale) };
    }
    case 'flow': {
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
 * 蛇身动画效果叠加（直接绘制到 ctx）
 */
export function drawBodyAnimEffect(ctx, bx, by, size, block, bIdx, total, effect, bodyAnimPhase, fadeOpacity) {
  const phase = bodyAnimPhase;
  const cx = bx + size / 2;
  const cy = by + size / 2;

  switch (effect) {
    case 'breathing': {
      const breathVal = Math.sin(phase * 0.8);
      if (breathVal > 0) {
        ctx.fillStyle = `rgba(255, 255, 255, ${breathVal * 0.35 * fadeOpacity})`;
      } else {
        ctx.fillStyle = `rgba(0, 0, 0, ${-breathVal * 0.25 * fadeOpacity})`;
      }
      ctx.fillRect(bx, by, size, size);
      break;
    }
    case 'pulse': {
      const pulseSpeed = 2;
      const pulseLen = 0.25;
      const headRatio = bIdx / total;
      const pulsePos = (phase * pulseSpeed / (Math.PI * 2)) % 1;
      const dist = Math.abs(headRatio - pulsePos);
      const wrappedDist = Math.min(dist, 1 - dist);
      if (wrappedDist < pulseLen) {
        const intensity = Math.pow(1 - wrappedDist / pulseLen, 1.5) * 0.55;
        ctx.fillStyle = `rgba(255, 255, 255, ${intensity * fadeOpacity})`;
        ctx.fillRect(bx, by, size, size);
      }
      break;
    }
    case 'wave': {
      const waveHue = ((bIdx / total) * 360 + phase * 60) % 360;
      ctx.fillStyle = `hsla(${waveHue}, 90%, 60%, ${0.45 * fadeOpacity})`;
      ctx.fillRect(bx, by, size, size);
      break;
    }
    case 'sparkle': {
      const seed = bIdx * 7 + Math.floor(phase * 4);
      const rand = Math.sin(seed * 12.9898 + seed * 78.233) * 43758.5453;
      const sparkleChance = rand - Math.floor(rand);
      if (sparkleChance > 0.75) {
        const flicker = 0.5 + Math.sin(phase * 5 + bIdx) * 0.5;
        const sparkleAlpha = flicker * 0.8 * fadeOpacity;
        const dotR = Math.max(1.5, size * 0.35);
        ctx.fillStyle = `rgba(255, 255, 255, ${sparkleAlpha})`;
        ctx.beginPath();
        ctx.arc(cx, cy, dotR, 0, Math.PI * 2);
        ctx.fill();
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
      const rainbowHue = ((bIdx / total) * 720 + phase * 80) % 360;
      const lightness = 55 + Math.sin(phase * 1.5 + bIdx * 0.4) * 10;
      ctx.fillStyle = `hsla(${rainbowHue}, 95%, ${lightness}%, ${0.5 * fadeOpacity})`;
      ctx.fillRect(bx, by, size, size);
      break;
    }
    case 'glow': {
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
      const rippleSpeed = 1.5;
      const rippleLen = 0.2;
      const headRatio = bIdx / total;
      const ripplePos = (phase * rippleSpeed / (Math.PI * 2)) % 1;
      const dist = Math.abs(headRatio - ripplePos);
      const wrappedDist = Math.min(dist, 1 - dist);
      if (wrappedDist < rippleLen) {
        const waveVal = Math.sin((wrappedDist / rippleLen) * Math.PI * 2);
        if (waveVal > 0) {
          ctx.strokeStyle = `rgba(100, 200, 255, ${waveVal * 0.35 * fadeOpacity})`;
          ctx.lineWidth = Math.max(1, size * 0.15);
          ctx.beginPath();
          ctx.arc(cx, cy, size * 0.45, 0, Math.PI * 2);
          ctx.stroke();
        }
      }
      break;
    }
    case 'lightning': {
      const seed = bIdx * 13 + Math.floor(phase * 6);
      const rand = Math.sin(seed * 12.9898 + seed * 78.233) * 43758.5453;
      const flashChance = rand - Math.floor(rand);
      if (flashChance > 0.82) {
        const flashAlpha = (0.6 + Math.sin(phase * 8 + bIdx) * 0.3) * fadeOpacity;
        ctx.strokeStyle = `rgba(255, 255, 100, ${Math.max(0, flashAlpha)})`;
        ctx.lineWidth = Math.max(1, size * 0.12);
        ctx.beginPath();
        const segs = 3;
        let px = bx + size * 0.2, py = by;
        ctx.moveTo(px, py);
        for (let s = 1; s <= segs; s++) {
          px = bx + size * (0.2 + 0.6 * (s / segs));
          py = by + size * (s / segs) + (Math.sin(seed + s) * size * 0.15);
          ctx.lineTo(px, py);
        }
        ctx.stroke();
      }
      break;
    }
    case 'neon': {
      const neonHue = (bIdx * 30 + phase * 40) % 360;
      const neonPulse = 0.4 + Math.sin(phase * 2 + bIdx * 0.3) * 0.3;
      ctx.shadowColor = `hsla(${neonHue}, 100%, 60%, ${neonPulse * fadeOpacity})`;
      ctx.shadowBlur = size * 0.5;
      ctx.fillStyle = `hsla(${neonHue}, 100%, 70%, ${0.3 * fadeOpacity})`;
      ctx.fillRect(bx, by, size, size);
      ctx.shadowColor = 'transparent';
      ctx.shadowBlur = 0;
      break;
    }
    case 'fire': {
      const fireSpeed = 1.2;
      const fireLen = 0.3;
      const headRatio = bIdx / total;
      const firePos = (phase * fireSpeed / (Math.PI * 2)) % 1;
      const dist = Math.abs(headRatio - firePos);
      const wrappedDist = Math.min(dist, 1 - dist);
      if (wrappedDist < fireLen) {
        const fireIntensity = Math.pow(1 - wrappedDist / fireLen, 1.2);
        const fireHue = 10 + fireIntensity * 40;
        ctx.fillStyle = `hsla(${fireHue}, 100%, ${50 + fireIntensity * 20}%, ${fireIntensity * 0.6 * fadeOpacity})`;
        ctx.fillRect(bx, by, size, size);
        if (fireIntensity > 0.7) {
          ctx.fillStyle = `rgba(255, 255, 200, ${(fireIntensity - 0.7) * 2 * fadeOpacity})`;
          ctx.fillRect(bx + size * 0.2, by + size * 0.2, size * 0.6, size * 0.6);
        }
      }
      break;
    }
  }
}

/** side → 前进方向 */
export function sideToDirection(side, isCCW) {
  const sideToDirCW = { top: 'right', right: 'bottom', bottom: 'left', left: 'top' };
  const sideToDirCCW = { top: 'left', left: 'bottom', bottom: 'right', right: 'top' };
  const sideToDir = isCCW ? sideToDirCCW : sideToDirCW;
  return sideToDir[side] || 'right';
}

/** 鼠标靠近时蛇头跟随偏移 */
export function calcMouseFollowOffset(headBlock, mouseX, mouseY, pixelSize) {
  let followDx = 0, followDy = 0;
  if (pixelSize > 2) {
    const distToMouse = Math.hypot(mouseX - headBlock.x, mouseY - headBlock.y);
    const followRange = pixelSize * 12;
    if (distToMouse < followRange && distToMouse > 0) {
      const strength = (1 - distToMouse / followRange) * pixelSize * 0.35;
      followDx = (mouseX - headBlock.x) / distToMouse * strength;
      followDy = (mouseY - headBlock.y) / distToMouse * strength;
    }
  }
  return { followDx, followDy };
}

/**
 * SpriteGenerator - 贪吃蛇像素精灵图生成器
 * 程序化生成蛇头、蛇身、食物、道具的像素风格精灵图
 * 无需外部图片资源，所有素材通过 Canvas 程序化绘制
 */

class SpriteGenerator {
  constructor() {
    this.cache = new Map(); // 缓存已生成的 sprite
  }

  /**
   * 获取或生成 sprite，使用缓存避免重复绘制
   */
  _getCacheKey(type, variant, size, direction, color) {
    return `${type}_${variant}_${size}_${direction}_${color}`;
  }

  /**
   * 清除缓存（配置变更时调用）
   */
  clearCache() {
    this.cache.clear();
  }

  // ============ 蛇头精灵 ============

  /**
   * 生成蛇头精灵图
   * @param {number} size - 像素尺寸
   * @param {string} direction - 方向: top, right, bottom, left
   * @param {string} headColor - 蛇头颜色 (hex)
   * @param {string} variant - 变体: 'classic', 'pixel', 'cute', 'dragon', 'robot'
   * @returns {HTMLCanvasElement}
   */
generateHead(size, direction, headColor, variant = 'classic') {
// 防御：多色逗号分隔时取第一个
headColor = headColor.split(',')[0].trim();
const key = this._getCacheKey('head', variant, size, direction, headColor);
    if (this.cache.has(key)) return this.cache.get(key);

    const canvas = document.createElement('canvas');
    const s = size + 4; // 蛇头略大于蛇身
    canvas.width = s;
    canvas.height = s;
    const ctx = canvas.getContext('2d');

    const px = Math.max(1, Math.floor(s / 8)); // 单个像素点大小

    switch (variant) {
      case 'pixel':
        this._drawPixelHead(ctx, s, px, direction, headColor);
        break;
      case 'cute':
        this._drawCuteHead(ctx, s, px, direction, headColor);
        break;
      case 'dragon':
        this._drawDragonHead(ctx, s, px, direction, headColor);
        break;
      case 'robot':
        this._drawRobotHead(ctx, s, px, direction, headColor);
        break;
      default:
        this._drawClassicHead(ctx, s, px, direction, headColor);
    }

    this.cache.set(key, canvas);
    return canvas;
  }

  /**
   * 经典蛇头 - 三角形带眼睛
   */
  _drawClassicHead(ctx, s, px, dir, color) {
    const half = s / 2;
    ctx.fillStyle = color;

    // 三角形蛇头，dir 为前进方向，三角形顶点朝前进方向
    ctx.beginPath();
    if (dir === 'right') {
      // 朝右：顶点在右侧
      ctx.moveTo(s, half); ctx.lineTo(0, 0); ctx.lineTo(0, s);
    } else if (dir === 'bottom') {
      // 朝下：顶点在底部
      ctx.moveTo(half, s); ctx.lineTo(0, 0); ctx.lineTo(s, 0);
    } else if (dir === 'left') {
      // 朝左：顶点在左侧
      ctx.moveTo(0, half); ctx.lineTo(s, 0); ctx.lineTo(s, s);
    } else {
      // 朝上：顶点在顶部
      ctx.moveTo(half, 0); ctx.lineTo(0, s); ctx.lineTo(s, s);
    }
    ctx.closePath();
    ctx.fill();

    // 眼睛
    this._drawEyes(ctx, s, px, dir, '#ffffff', '#000000');
  }

  /**
   * 像素风蛇头 - 方块组成，有清晰的像素感
   */
  _drawPixelHead(ctx, s, px, dir, color) {
    ctx.fillStyle = color;
    const rgb = this._hexToRgb(color);
    const darkColor = `rgb(${Math.floor(rgb.r * 0.7)},${Math.floor(rgb.g * 0.7)},${Math.floor(rgb.b * 0.7)})`;
    const lightColor = `rgb(${Math.min(255, Math.floor(rgb.r * 1.2))},${Math.min(255, Math.floor(rgb.g * 1.2))},${Math.min(255, Math.floor(rgb.b * 1.2))})`;

    // 8x8 像素蛇头模板（朝右）
    // 0=透明, 1=主色, 2=暗色, 3=亮色, 4=白色(眼), 5=黑色(瞳孔)
    const headRight = [
      [0,0,0,1,1,1,1,0],
      [0,0,1,1,3,3,1,1],
      [0,1,1,3,3,4,5,1],
      [0,1,2,2,2,4,5,1],
      [0,1,2,2,2,2,1,1],
      [0,1,1,2,2,1,1,0],
      [0,0,1,1,1,1,0,0],
      [0,0,0,1,1,0,0,0],
    ];

    const colorMap = { 1: color, 2: darkColor, 3: lightColor, 4: '#ffffff', 5: '#111111' };
    const template = this._rotateTemplate(headRight, dir);
    this._drawPixelTemplate(ctx, template, s, px, colorMap);
  }

  /**
   * 可爱蛇头 - 圆润，大眼睛，小舌头
   */
  _drawCuteHead(ctx, s, px, dir, color) {
    const half = s / 2;
    ctx.fillStyle = color;

    // 圆润的头部
    ctx.beginPath();
    ctx.arc(half, half, half * 0.85, 0, Math.PI * 2);
    ctx.fill();

    // 高光
    const rgb = this._hexToRgb(color);
    const highlight = `rgba(255,255,255,0.35)`;
    ctx.fillStyle = highlight;
    ctx.beginPath();
    ctx.arc(half - half * 0.2, half - half * 0.25, half * 0.35, 0, Math.PI * 2);
    ctx.fill();

    // 大眼睛
    this._drawEyes(ctx, s, px, dir, '#ffffff', '#222222', 0.5);

    // 小舌头
    ctx.fillStyle = '#ff6b6b';
    const tongueLen = px * 2;
    ctx.lineWidth = Math.max(1, px * 0.5);
    ctx.strokeStyle = '#ff6b6b';
    ctx.beginPath();
    if (dir === 'right') {
      ctx.moveTo(s, half - px * 0.3);
      ctx.lineTo(s + tongueLen, half - px);
      ctx.moveTo(s, half + px * 0.3);
      ctx.lineTo(s + tongueLen, half + px);
    } else if (dir === 'left') {
      ctx.moveTo(0, half - px * 0.3);
      ctx.lineTo(-tongueLen, half - px);
      ctx.moveTo(0, half + px * 0.3);
      ctx.lineTo(-tongueLen, half + px);
    } else if (dir === 'bottom') {
      ctx.moveTo(half - px * 0.3, s);
      ctx.lineTo(half - px, s + tongueLen);
      ctx.moveTo(half + px * 0.3, s);
      ctx.lineTo(half + px, s + tongueLen);
    } else {
      ctx.moveTo(half - px * 0.3, 0);
      ctx.lineTo(half - px, -tongueLen);
      ctx.moveTo(half + px * 0.3, 0);
      ctx.lineTo(half + px, -tongueLen);
    }
    ctx.stroke();
  }

  /**
   * 龙头 - 更复杂，带角和火焰
   */
  _drawDragonHead(ctx, s, px, dir, color) {
    const rgb = this._hexToRgb(color);
    const darkColor = `rgb(${Math.floor(rgb.r * 0.6)},${Math.floor(rgb.g * 0.6)},${Math.floor(rgb.b * 0.6)})`;
    const fireColor1 = '#ff4500';
    const fireColor2 = '#ff8c00';

    // 龙头像素模板（朝右）
    const headRight = [
      [0,0,6,6,0,0,0,0],
      [0,0,6,6,1,1,1,0],
      [0,1,1,1,1,3,1,1],
      [0,1,1,3,3,4,5,1],
      [7,1,2,2,2,4,5,1],
      [7,1,2,2,2,2,1,1],
      [0,1,1,2,2,1,1,0],
      [0,0,1,1,1,1,0,0],
    ];
    // 6=角色, 7=火色
    const colorMap = {
      1: color, 2: darkColor, 3: `rgb(${Math.min(255,rgb.r+40)},${Math.min(255,rgb.g+40)},${Math.min(255,rgb.b+40)})`,
      4: '#ffffff', 5: '#111111', 6: darkColor, 7: fireColor2
    };

    const template = this._rotateTemplate(headRight, dir);
    this._drawPixelTemplate(ctx, template, s, px, colorMap);
  }

  /**
   * 机器人蛇头 - 方正，LED 眼睛，天线
   */
  _drawRobotHead(ctx, s, px, dir, color) {
    const rgb = this._hexToRgb(color);
    const metalLight = `rgb(${Math.min(255,rgb.r+60)},${Math.min(255,rgb.g+60)},${Math.min(255,rgb.b+60)})`;
    const metalDark = `rgb(${Math.floor(rgb.r*0.5)},${Math.floor(rgb.g*0.5)},${Math.floor(rgb.b*0.5)})`;

    // 机器人头模板（朝右）
    const headRight = [
      [0,0,6,0,6,0,0,0],
      [0,1,1,1,1,1,1,0],
      [0,1,3,3,3,3,1,1],
      [0,1,3,7,3,7,1,1],
      [0,1,3,3,3,3,1,1],
      [0,1,2,2,2,2,1,1],
      [0,1,1,1,1,1,1,0],
      [0,0,1,1,1,1,0,0],
    ];
    // 6=天线色, 7=LED红色
    const colorMap = {
      1: color, 2: metalDark, 3: metalLight,
      4: '#ffffff', 5: '#111111', 6: metalDark, 7: '#ff0000'
    };

    const template = this._rotateTemplate(headRight, dir);
    this._drawPixelTemplate(ctx, template, s, px, colorMap);
  }

  // ============ 蛇身精灵 ============

  /**
   * 生成蛇身段精灵图
   * @param {number} size - 像素尺寸
   * @param {string} bodyColor - 蛇身颜色 (hex)
   * @param {string} variant - 变体: 'classic', 'pixel', 'scale', 'armor', 'glow'
   * @param {number} index - 在蛇身中的位置索引（用于纹理变化）
   * @returns {HTMLCanvasElement}
   */
generateBody(size, bodyColor, variant = 'classic', index = 0) {
// 防御：多色逗号分隔时取第一个
bodyColor = bodyColor.split(',')[0].trim();
const key = this._getCacheKey('body', variant, size, index % 2, bodyColor);
    if (this.cache.has(key)) return this.cache.get(key);

    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    const px = Math.max(1, Math.floor(size / 6));

    switch (variant) {
      case 'pixel':
        this._drawPixelBody(ctx, size, px, bodyColor, index);
        break;
      case 'scale':
        this._drawScaleBody(ctx, size, px, bodyColor, index);
        break;
      case 'armor':
        this._drawArmorBody(ctx, size, px, bodyColor, index);
        break;
      case 'glow':
        this._drawGlowBody(ctx, size, px, bodyColor, index);
        break;
      default:
        this._drawClassicBody(ctx, size, px, bodyColor, index);
    }

    this.cache.set(key, canvas);
    return canvas;
  }

  _drawClassicBody(ctx, s, px, color, index) {
    const rgb = this._hexToRgb(color);
    // 交替深浅色增加变化
    const shade = index % 2 === 0 ? 1.0 : 0.85;
    ctx.fillStyle = `rgb(${Math.floor(rgb.r*shade)},${Math.floor(rgb.g*shade)},${Math.floor(rgb.b*shade)})`;
    ctx.fillRect(0, 0, s, s);
  }

  _drawPixelBody(ctx, s, px, color, index) {
    const rgb = this._hexToRgb(color);
    const dark = `rgb(${Math.floor(rgb.r*0.7)},${Math.floor(rgb.g*0.7)},${Math.floor(rgb.b*0.7)})`;
    const light = `rgb(${Math.min(255,Math.floor(rgb.r*1.15))},${Math.min(255,Math.floor(rgb.g*1.15))},${Math.min(255,Math.floor(rgb.b*1.15))})`;

    // 像素风格蛇身 - 带高光和阴影
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, s, s);

    // 顶部高光线
    ctx.fillStyle = light;
    ctx.fillRect(0, 0, s, Math.max(1, px * 0.5));

    // 底部阴影线
    ctx.fillStyle = dark;
    ctx.fillRect(0, s - Math.max(1, px * 0.5), s, Math.max(1, px * 0.5));

    // 交替亮暗增加像素感
    if (index % 2 === 1) {
      ctx.fillStyle = 'rgba(0,0,0,0.12)';
      ctx.fillRect(0, 0, s, s);
    }
  }

  _drawScaleBody(ctx, s, px, color, index) {
    const rgb = this._hexToRgb(color);
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, s, s);

    // 鳞片纹理 - 半圆弧线
    const dark = `rgba(0,0,0,0.2)`;
    ctx.strokeStyle = dark;
    ctx.lineWidth = Math.max(1, px * 0.3);

    if (index % 2 === 0) {
      ctx.beginPath();
      ctx.arc(s / 2, s, s * 0.4, Math.PI, 0);
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.arc(s / 2, 0, s * 0.4, 0, Math.PI);
      ctx.stroke();
    }

    // 中心高光点
    ctx.fillStyle = `rgba(255,255,255,0.15)`;
    ctx.beginPath();
    ctx.arc(s * 0.35, s * 0.35, s * 0.12, 0, Math.PI * 2);
    ctx.fill();
  }

  _drawArmorBody(ctx, s, px, color, index) {
    const rgb = this._hexToRgb(color);
    const dark = `rgb(${Math.floor(rgb.r*0.5)},${Math.floor(rgb.g*0.5)},${Math.floor(rgb.b*0.5)})`;
    const light = `rgb(${Math.min(255,Math.floor(rgb.r*1.3))},${Math.min(255,Math.floor(rgb.g*1.3))},${Math.min(255,Math.floor(rgb.b*1.3))})`;

    // 装甲板效果
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, s, s);

    // 铆钉
    if (s >= 6) {
      ctx.fillStyle = light;
      const rivetR = Math.max(1, px * 0.3);
      ctx.beginPath(); ctx.arc(px, px, rivetR, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(s - px, px, rivetR, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(px, s - px, rivetR, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(s - px, s - px, rivetR, 0, Math.PI * 2); ctx.fill();
    }

    // 边框
    ctx.strokeStyle = dark;
    ctx.lineWidth = Math.max(1, px * 0.25);
    ctx.strokeRect(0.5, 0.5, s - 1, s - 1);

    // 交替暗色板
    if (index % 3 === 0) {
      ctx.fillStyle = 'rgba(0,0,0,0.15)';
      ctx.fillRect(0, 0, s, s);
    }
  }

  _drawGlowBody(ctx, s, px, color, index) {
    const rgb = this._hexToRgb(color);

    // 发光体 - 中心亮，边缘暗
    const gradient = ctx.createRadialGradient(s/2, s/2, 0, s/2, s/2, s * 0.7);
    gradient.addColorStop(0, `rgba(${Math.min(255,rgb.r+80)},${Math.min(255,rgb.g+80)},${Math.min(255,rgb.b+80)},1)`);
    gradient.addColorStop(0.5, `rgba(${rgb.r},${rgb.g},${rgb.b},1)`);
    gradient.addColorStop(1, `rgba(${Math.floor(rgb.r*0.4)},${Math.floor(rgb.g*0.4)},${Math.floor(rgb.b*0.4)},1)`);

    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, s, s);

    // 外发光
    ctx.shadowColor = `rgba(${rgb.r},${rgb.g},${rgb.b},1)`;
    ctx.shadowBlur = s * 0.5;
    ctx.fillStyle = `rgba(${rgb.r},${rgb.g},${rgb.b},0.3)`;
    ctx.fillRect(s * 0.2, s * 0.2, s * 0.6, s * 0.6);
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
  }

  // ============ 食物/道具精灵 ============

  /**
   * 生成食物/道具精灵图
   * @param {number} size - 像素尺寸
   * @param {string} type - 道具类型: 'apple', 'cherry', 'star', 'mushroom', 'clock', 'diamond', 'lightning', 'heart'
   * @returns {HTMLCanvasElement}
   */
  generateItem(size, type = 'apple') {
    const key = this._getCacheKey('item', type, size, 0, '');
    if (this.cache.has(key)) return this.cache.get(key);

    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    const px = Math.max(1, Math.floor(size / 8));

    switch (type) {
      case 'cherry': this._drawCherry(ctx, size, px); break;
      case 'star': this._drawStar(ctx, size, px); break;
      case 'mushroom': this._drawMushroom(ctx, size, px); break;
      case 'clock': this._drawClock(ctx, size, px); break;
      case 'diamond': this._drawDiamond(ctx, size, px); break;
      case 'lightning': this._drawLightning(ctx, size, px); break;
      case 'heart': this._drawHeart(ctx, size, px); break;
      default: this._drawApple(ctx, size, px);
    }

    this.cache.set(key, canvas);
    return canvas;
  }

  /** 像素苹果 🍎 */
  _drawApple(ctx, s, px) {
    // 苹果体
    ctx.fillStyle = '#e74c3c';
    ctx.fillRect(px * 2, px * 3, px * 4, px * 4);
    ctx.fillRect(px * 1, px * 4, px * 6, px * 2);
    ctx.fillRect(px * 3, px * 2, px * 2, px);

    // 高光
    ctx.fillStyle = '#ff6b6b';
    ctx.fillRect(px * 3, px * 4, px, px);

    // 苹果柄
    ctx.fillStyle = '#8B4513';
    ctx.fillRect(px * 4, px * 1, px, px * 2);

    // 叶子
    ctx.fillStyle = '#27ae60';
    ctx.fillRect(px * 5, px * 2, px * 2, px);
  }

  /** 像素樱桃 🍒 */
  _drawCherry(ctx, s, px) {
    // 梗
    ctx.fillStyle = '#27ae60';
    ctx.fillRect(px * 3, px * 1, px, px * 3);
    ctx.fillRect(px * 5, px * 1, px, px * 2);

    // 左樱桃
    ctx.fillStyle = '#e74c3c';
    ctx.fillRect(px * 2, px * 4, px * 2, px * 3);
    ctx.fillRect(px * 1, px * 5, px, px);

    // 右樱桃
    ctx.fillRect(px * 5, px * 3, px * 2, px * 3);
    ctx.fillRect(px * 7, px * 4, px, px);

    // 高光
    ctx.fillStyle = '#ff6b6b';
    ctx.fillRect(px * 2, px * 4, px, px);
    ctx.fillRect(px * 5, px * 3, px, px);
  }

  /** 像素星星 ⭐ */
  _drawStar(ctx, s, px) {
    ctx.fillStyle = '#f1c40f';
    // 5角星像素画
    ctx.fillRect(px * 3, px * 1, px * 2, px);
    ctx.fillRect(px * 2, px * 2, px * 4, px);
    ctx.fillRect(px * 1, px * 3, px * 6, px);
    ctx.fillRect(px * 0, px * 4, px * 8, px);
    ctx.fillRect(px * 2, px * 5, px * 4, px);
    ctx.fillRect(px * 1, px * 6, px * 2, px);
    ctx.fillRect(px * 5, px * 6, px * 2, px);

    // 高光
    ctx.fillStyle = '#ffeaa7';
    ctx.fillRect(px * 3, px * 2, px, px);
  }

  /** 像素蘑菇 🍄 (穿墙道具) */
  _drawMushroom(ctx, s, px) {
    // 蘑菇帽
    ctx.fillStyle = '#e74c3c';
    ctx.fillRect(px * 1, px * 2, px * 6, px * 2);
    ctx.fillRect(px * 2, px * 1, px * 4, px);
    // 白点
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(px * 2, px * 2, px, px);
    ctx.fillRect(px * 5, px * 2, px, px);
    ctx.fillRect(px * 3, px * 1, px, px);
    // 蘑菇柄
    ctx.fillStyle = '#f5deb3';
    ctx.fillRect(px * 3, px * 4, px * 2, px * 3);
    // 蘑菇脚
    ctx.fillRect(px * 2, px * 6, px * 4, px);
  }

  /** 像素时钟 ⏰ (时光沙漏道具) */
  _drawClock(ctx, s, px) {
    // 外圈
    ctx.fillStyle = '#3498db';
    ctx.fillRect(px * 2, px * 1, px * 4, px);
    ctx.fillRect(px * 1, px * 2, px, px * 4);
    ctx.fillRect(px * 6, px * 2, px, px * 4);
    ctx.fillRect(px * 2, px * 6, px * 4, px);

    // 钟面
    ctx.fillStyle = '#ecf0f1';
    ctx.fillRect(px * 2, px * 2, px * 4, px * 4);

    // 指针
    ctx.fillStyle = '#2c3e50';
    ctx.fillRect(px * 4, px * 3, px, px * 2); // 时针
    ctx.fillRect(px * 4, px * 2, px, px);     // 分针

    // 中心点
    ctx.fillStyle = '#e74c3c';
    ctx.fillRect(px * 4, px * 4, px, px);
  }

  /** 像素钻石 💎 */
  _drawDiamond(ctx, s, px) {
    ctx.fillStyle = '#3498db';
    ctx.fillRect(px * 3, px * 1, px * 2, px);
    ctx.fillRect(px * 2, px * 2, px * 4, px);
    ctx.fillRect(px * 1, px * 3, px * 6, px);
    ctx.fillRect(px * 2, px * 4, px * 4, px);
    ctx.fillRect(px * 3, px * 5, px * 2, px);
    ctx.fillRect(px * 4, px * 6, px, px);

    // 高光
    ctx.fillStyle = '#74b9ff';
    ctx.fillRect(px * 3, px * 2, px, px);
    ctx.fillRect(px * 2, px * 3, px, px);
  }

  /** 像素闪电 ⚡ (加速道具) */
  _drawLightning(ctx, s, px) {
    ctx.fillStyle = '#f1c40f';
    ctx.fillRect(px * 4, px * 1, px * 2, px);
    ctx.fillRect(px * 3, px * 2, px * 3, px);
    ctx.fillRect(px * 2, px * 3, px * 3, px);
    ctx.fillRect(px * 3, px * 4, px * 3, px);
    ctx.fillRect(px * 4, px * 5, px * 2, px);
    ctx.fillRect(px * 5, px * 6, px * 2, px);

    // 高光
    ctx.fillStyle = '#ffeaa7';
    ctx.fillRect(px * 4, px * 2, px, px);
  }

  /** 像素爱心 ❤️ */
  _drawHeart(ctx, s, px) {
    ctx.fillStyle = '#e74c3c';
    ctx.fillRect(px * 1, px * 2, px * 2, px);
    ctx.fillRect(px * 5, px * 2, px * 2, px);
    ctx.fillRect(px * 0, px * 3, px * 3, px);
    ctx.fillRect(px * 5, px * 3, px * 3, px);
    ctx.fillRect(px * 0, px * 4, px * 8, px);
    ctx.fillRect(px * 1, px * 5, px * 6, px);
    ctx.fillRect(px * 2, px * 6, px * 4, px);
    ctx.fillRect(px * 3, px * 7, px * 2, px);

    // 高光
    ctx.fillStyle = '#ff6b6b';
    ctx.fillRect(px * 1, px * 3, px, px);
  }

  // ============ 里程碑标记精灵 ============

  /**
   * 生成里程碑标记精灵
   * @param {number} size - 标记尺寸
   * @param {string} type - 'milestone25', 'milestone50', 'milestone75', 'milestone100'
   * @returns {HTMLCanvasElement}
   */
  generateMilestone(size, type = 'milestone50') {
    const key = this._getCacheKey('milestone', type, size, 0, '');
    if (this.cache.has(key)) return this.cache.get(key);

    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    const half = size / 2;
    const px = Math.max(1, Math.floor(size / 8));

    let color, label;
    switch (type) {
      case 'milestone25': color = '#27ae60'; label = '25'; break;
      case 'milestone50': color = '#f39c12'; label = '50'; break;
      case 'milestone75': color = '#e67e22'; label = '75'; break;
      case 'milestone100': color = '#e74c3c'; label = '100'; break;
      default: color = '#f39c12'; label = '?';
    }

    // 星形标记
    ctx.fillStyle = color;
    ctx.beginPath();
    for (let i = 0; i < 5; i++) {
      const angle = (i * 4 * Math.PI / 5) - Math.PI / 2;
      const x = half + Math.cos(angle) * half * 0.8;
      const y = half + Math.sin(angle) * half * 0.8;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fill();

    // 百分比数字
    if (size >= 12) {
      ctx.fillStyle = '#ffffff';
      ctx.font = `bold ${Math.max(6, Math.floor(size * 0.35))}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, half, half);
    }

    this.cache.set(key, canvas);
    return canvas;
  }

  // ============ 辅助方法 ============

  /**
   * 绘制蛇眼
   */
  _drawEyes(ctx, s, px, dir, eyeColor, pupilColor, sizeFactor = 0.35) {
    const half = s / 2;
    const eyeR = s * sizeFactor * 0.5;
    const pupilR = eyeR * 0.55;
    let eye1x, eye1y, eye2x, eye2y;

    const offset = s * 0.2;
    const forward = s * 0.15;

    if (dir === 'right') {
      eye1x = half + forward; eye1y = half - offset;
      eye2x = half + forward; eye2y = half + offset;
    } else if (dir === 'left') {
      eye1x = half - forward; eye1y = half - offset;
      eye2x = half - forward; eye2y = half + offset;
    } else if (dir === 'bottom') {
      eye1x = half - offset; eye1y = half + forward;
      eye2x = half + offset; eye2y = half + forward;
    } else {
      eye1x = half - offset; eye1y = half - forward;
      eye2x = half + offset; eye2y = half - forward;
    }

    // 眼白
    ctx.fillStyle = eyeColor;
    ctx.beginPath(); ctx.arc(eye1x, eye1y, eyeR, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(eye2x, eye2y, eyeR, 0, Math.PI * 2); ctx.fill();

    // 瞳孔
    ctx.fillStyle = pupilColor;
    ctx.beginPath(); ctx.arc(eye1x, eye1y, pupilR, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(eye2x, eye2y, pupilR, 0, Math.PI * 2); ctx.fill();
  }

  /**
   * 旋转像素模板（根据蛇的移动方向）
   */
  _rotateTemplate(template, dir) {
    const h = template.length;
    const w = template[0].length;

    if (dir === 'right') return template; // 默认朝右

    const rotated = [];
    if (dir === 'left') {
      // 水平翻转
      for (let y = 0; y < h; y++) {
        rotated.push([...template[y]].reverse());
      }
    } else if (dir === 'bottom') {
      // 顺时针90度
      for (let x = 0; x < w; x++) {
        const row = [];
        for (let y = h - 1; y >= 0; y--) {
          row.push(template[y][x]);
        }
        rotated.push(row);
      }
    } else if (dir === 'top') {
      // 逆时针90度
      for (let x = w - 1; x >= 0; x--) {
        const row = [];
        for (let y = 0; y < h; y++) {
          row.push(template[y][x]);
        }
        rotated.push(row);
      }
    }
    return rotated;
  }

  /**
   * 绘制像素模板到 Canvas
   */
  _drawPixelTemplate(ctx, template, canvasSize, px, colorMap) {
    const h = template.length;
    const w = template[0].length;
    // 计算每个模板像素对应的实际像素大小
    const cellW = canvasSize / w;
    const cellH = canvasSize / h;

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const val = template[y][x];
        if (val === 0) continue; // 透明
        const color = colorMap[val];
        if (!color) continue;
        ctx.fillStyle = color;
        ctx.fillRect(Math.floor(x * cellW), Math.floor(y * cellH), Math.ceil(cellW), Math.ceil(cellH));
      }
    }
  }

_hexToRgb(hex) {
// 防御：多色逗号分隔时取第一个
hex = hex.split(',')[0].trim();
hex = hex.replace('#', '');
return {
r: parseInt(hex.substring(0, 2), 16),
g: parseInt(hex.substring(2, 4), 16),
b: parseInt(hex.substring(4, 6), 16),
};
}
}

// ============ 道具系统 ============

/**
 * PowerUpSystem - 进度里程碑道具系统
 * 在 25%/50%/75% 等进度里程碑处显示食物/道具
 */
class PowerUpSystem {
  constructor(spriteGenerator) {
    this.spriteGen = spriteGenerator;
    this.milestones = [
      { percent: 25, type: 'apple', label: '苹果', effect: null },
      { percent: 50, type: 'star', label: '金星', effect: null },
      { percent: 75, type: 'diamond', label: '钻石', effect: null },
    ];
    this.collectedMilestones = new Set(); // 已收集的里程碑
    this.eatAnimations = []; // 吃食物动画
  }

  /**
   * 重置已收集状态（新的一天开始时）
   */
  reset() {
    this.collectedMilestones.clear();
    this.eatAnimations = [];
  }

  /**
   * 获取当前可见的里程碑道具
   * @param {number} currentPercent - 当前进度百分比
   * @returns {Array} 可见的里程碑列表
   */
  getVisibleMilestones(currentPercent) {
    return this.milestones.filter(m => {
      // 里程碑未达到时不显示
      if (currentPercent < m.percent) return false;
      // 已收集的不显示
      if (this.collectedMilestones.has(m.percent)) return false;
      return true;
    });
  }

  /**
   * 检查并收集里程碑
   * @param {number} currentPercent - 当前进度
   * @returns {Object|null} 收集到的里程碑
   */
  checkCollection(currentPercent) {
    for (const m of this.milestones) {
      if (currentPercent >= m.percent && !this.collectedMilestones.has(m.percent)) {
        this.collectedMilestones.add(m.percent);
        // 触发吃食物动画
        this.eatAnimations.push({
          percent: m.percent,
          startTime: Date.now(),
          duration: 800,
          type: m.type,
        });
        return m;
      }
    }
    return null;
  }

  /**
   * 在 Canvas 上绘制里程碑道具
   * @param {CanvasRenderingContext2D} ctx
   * @param {Array} path - 蛇身路径
   * @param {number} pixelSize
   * @param {number} currentPercent
   * @param {number} fadeOpacity
   */
  drawMilestones(ctx, path, pixelSize, currentPercent, fadeOpacity) {
    if (!path || path.length === 0) return;

    const visibleMilestones = this.getVisibleMilestones(currentPercent);

    for (const m of visibleMilestones) {
      const idx = Math.floor((m.percent / 100) * path.length);
      if (idx >= path.length) continue;

      const pos = path[idx];
      const itemSize = pixelSize * 1.5;
      const sprite = this.spriteGen.generateItem(Math.round(itemSize), m.type);

      ctx.globalAlpha = fadeOpacity * 0.9;
      // 添加悬浮动画
      const bobOffset = Math.sin(Date.now() / 300 + m.percent) * pixelSize * 0.3;
      ctx.drawImage(
        sprite,
        pos.x - itemSize / 2,
        pos.y - itemSize / 2 + bobOffset,
        itemSize,
        itemSize
      );
      ctx.globalAlpha = 1;
    }
  }

  /**
   * 绘制吃食物的动画效果
   */
  drawEatAnimations(ctx, path, pixelSize, fadeOpacity) {
    const now = Date.now();
    this.eatAnimations = this.eatAnimations.filter(anim => {
      const elapsed = now - anim.startTime;
      if (elapsed > anim.duration) return false;

      const progress = elapsed / anim.duration;
      const idx = Math.floor((anim.percent / 100) * path.length);
      if (idx >= path.length) return true;

      const pos = path[idx];

      // 爆裂粒子效果
      const particleCount = 8;
      for (let i = 0; i < particleCount; i++) {
        const angle = (i / particleCount) * Math.PI * 2;
        const dist = progress * pixelSize * 4;
        const px = pos.x + Math.cos(angle) * dist;
        const py = pos.y + Math.sin(angle) * dist;
        const size = pixelSize * (1 - progress) * 0.8;
        const alpha = (1 - progress) * fadeOpacity;

        const hue = (i * 45 + anim.percent * 3) % 360;
        ctx.fillStyle = `hsla(${hue}, 80%, 60%, ${alpha})`;
        ctx.fillRect(px - size / 2, py - size / 2, size, size);
      }

      // 缩放消失效果
      if (progress < 0.5) {
        const scale = 1 + progress * 2;
        const itemSize = pixelSize * 1.5 * scale;
        const alpha = (1 - progress * 2) * fadeOpacity;
        ctx.globalAlpha = alpha;
        const sprite = this.spriteGen.generateItem(Math.round(pixelSize * 1.5), anim.type);
        ctx.drawImage(sprite, pos.x - itemSize/2, pos.y - itemSize/2, itemSize, itemSize);
        ctx.globalAlpha = 1;
      }

      return true;
    });
  }
}

/**
 * RandomFoodSystem - 随机食物系统
 * 在蛇头前方路径上随机生成食物，蛇经过时吃掉并触发粒子动画
 */
class RandomFoodSystem {
  constructor(spriteGenerator) {
    this.spriteGen = spriteGenerator;
    this.foods = []; // 当前存活的食物列表
    this.eatAnimations = []; // 吃食物动画
    this.lastSpawnTime = Date.now(); // 上次生成时间，初始化为当前时间避免启动时立刻生成
    this.foodTypes = ['apple', 'cherry', 'star', 'mushroom', 'clock', 'diamond', 'lightning', 'heart'];
    this.totalCollected = 0; // 总共吃掉的食物数
  }

  /**
   * 重置（新的一天）
   */
  reset() {
    this.foods = [];
    this.eatAnimations = [];
    this.lastSpawnTime = Date.now();
    this.totalCollected = 0;
  }

  /**
   * 尝试生成一个随机食物
   * @param {number} currentPercent - 当前进度
   * @param {number} pathLength - 路径总长度（块数）
   * @param {number} intervalSec - 生成间隔（秒）
   * @param {number} pixelSize - 像素大小
   * @param {number} rangeMin - 生成范围最小值（百分比）
   * @param {number} rangeMax - 生成范围最大值（百分比）
   * @param {number} maxCount - 同时存在的最大食物数量
   */
  trySpawn(currentPercent, pathLength, intervalSec, pixelSize, rangeMin, rangeMax, maxCount) {
    const now = Date.now();
    const intervalMs = intervalSec * 1000;
    if (now - this.lastSpawnTime < intervalMs) return;
    if (pathLength === 0) return;
    // 限制同时存在的食物数量
    if (this.foods.length >= maxCount) return;

    // 在蛇头前方指定范围处生成食物
    const lookAhead = rangeMin + Math.random() * (rangeMax - rangeMin);
    const foodPercent = currentPercent + lookAhead;

    // 超过100%不生成
    if (foodPercent >= 100) return;

    // 检查是否与已有食物太近
    for (const f of this.foods) {
      if (Math.abs(f.percent - foodPercent) < 0.2) return;
    }

    const type = this.foodTypes[Math.floor(Math.random() * this.foodTypes.length)];
    this.foods.push({
      percent: foodPercent,
      type: type,
      spawnTime: now,
      bobPhase: Math.random() * Math.PI * 2,
    });
    this.lastSpawnTime = now;
  }

  /**
   * 检查蛇头是否吃到食物
   * @param {number} currentPercent - 当前进度
   */
  checkCollection(currentPercent) {
    // 碰撞容差：蛇头接近食物 0.05% 范围内即触发
    const tolerance = 0.05;
    for (let i = this.foods.length - 1; i >= 0; i--) {
      const f = this.foods[i];
      if (currentPercent >= f.percent - tolerance) {
        // 吃到了
        this.eatAnimations.push({
          percent: f.percent,
          type: f.type,
          startTime: Date.now(),
          duration: 800,
        });
        this.foods.splice(i, 1);
        this.totalCollected++;
      }
    }
  }

  /**
   * 检查蛇头是否吃到食物（基于像素位置碰撞检测）
   * @param {Object} headBlock - 蛇头块 {x, y}
   * @param {Array} path - 蛇身路径
   * @param {number} pixelSize - 像素大小
   */
  checkCollectionByPosition(headBlock, path, pixelSize) {
    const collisionRange = pixelSize * 1.5; // 碰撞范围
    const now = Date.now();
    for (let i = this.foods.length - 1; i >= 0; i--) {
      const f = this.foods[i];
      // 保护期：刚生成的食物 500ms 内不可被碰撞，避免一帧内立刻消失
      if (now - f.spawnTime < 500) continue;
      const idx = Math.floor((f.percent / 100) * path.length);
      if (idx >= path.length) continue;
      const pos = path[idx];
      const dx = headBlock.x - pos.x;
      const dy = headBlock.y - pos.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist <= collisionRange) {
        // 吃到了
        this.eatAnimations.push({
          percent: f.percent,
          type: f.type,
          startTime: Date.now(),
          duration: 800,
        });
        this.foods.splice(i, 1);
        this.totalCollected++;
      }
    }
  }

  /**
   * 绘制随机食物
   * @param {CanvasRenderingContext2D} ctx
   * @param {Array} path - 蛇身路径
   * @param {number} pixelSize
   * @param {number} currentPercent
   * @param {number} fadeOpacity
   */
  drawFoods(ctx, path, pixelSize, currentPercent, fadeOpacity) {
    if (!path || path.length === 0) return;

    for (const f of this.foods) {
      const idx = Math.floor((f.percent / 100) * path.length);
      if (idx >= path.length) continue;

      const pos = path[idx];
      const itemSize = pixelSize * 1.4;
      const sprite = this.spriteGen.generateItem(Math.round(itemSize), f.type);

      // 悬浮 + 闪烁动画
      const elapsed = (Date.now() - f.spawnTime) / 1000;
      const bobOffset = Math.sin(Date.now() / 300 + f.bobPhase) * pixelSize * 0.3;
      const blink = 0.7 + Math.sin(elapsed * 4) * 0.3;

      // 光晕
      ctx.globalAlpha = fadeOpacity * 0.3 * blink;
      const glowSize = itemSize * 1.8;
      const grad = ctx.createRadialGradient(pos.x, pos.y + bobOffset, 0, pos.x, pos.y + bobOffset, glowSize / 2);
      grad.addColorStop(0, 'rgba(255, 220, 100, 0.4)');
      grad.addColorStop(1, 'rgba(255, 220, 100, 0)');
      ctx.fillStyle = grad;
      ctx.fillRect(pos.x - glowSize / 2, pos.y + bobOffset - glowSize / 2, glowSize, glowSize);

      // 食物本体
      ctx.globalAlpha = fadeOpacity * blink;
      ctx.drawImage(
        sprite,
        pos.x - itemSize / 2,
        pos.y - itemSize / 2 + bobOffset,
        itemSize,
        itemSize
      );
      ctx.globalAlpha = 1;
    }
  }

  /**
   * 绘制吃食物的粒子动画
   */
  drawEatAnimations(ctx, path, pixelSize, fadeOpacity) {
    const now = Date.now();
    this.eatAnimations = this.eatAnimations.filter(anim => {
      const elapsed = now - anim.startTime;
      if (elapsed > anim.duration) return false;

      const progress = elapsed / anim.duration;
      const idx = Math.floor((anim.percent / 100) * path.length);
      if (idx >= path.length) return true;

      const pos = path[idx];

      // 爆裂粒子
      const particleCount = 10;
      for (let i = 0; i < particleCount; i++) {
        const angle = (i / particleCount) * Math.PI * 2 + anim.percent;
        const dist = progress * pixelSize * 5;
        const px = pos.x + Math.cos(angle) * dist;
        const py = pos.y + Math.sin(angle) * dist;
        const size = pixelSize * (1 - progress) * 0.7;
        const alpha = (1 - progress) * fadeOpacity;

        const hue = (i * 36 + anim.percent * 5) % 360;
        ctx.fillStyle = `hsla(${hue}, 85%, 65%, ${alpha})`;
        ctx.fillRect(px - size / 2, py - size / 2, size, size);
      }

      // 缩放消失
      if (progress < 0.4) {
        const scale = 1 + progress * 3;
        const itemSize = pixelSize * 1.4 * scale;
        const alpha = (1 - progress * 2.5) * fadeOpacity;
        ctx.globalAlpha = Math.max(0, alpha);
        const sprite = this.spriteGen.generateItem(Math.round(pixelSize * 1.4), anim.type);
        ctx.drawImage(sprite, pos.x - itemSize / 2, pos.y - itemSize / 2, itemSize, itemSize);
        ctx.globalAlpha = 1;
      }

      return true;
    });
  }
}

// 导出
window.SpriteGenerator = SpriteGenerator;
window.PowerUpSystem = PowerUpSystem;
window.RandomFoodSystem = RandomFoodSystem;

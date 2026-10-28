/**
 * @file particles.js
 * 粒子與視覺特效系統 (零卡頓、高幀率特效、連擊浮動文字)
 */

export class ParticleSystem {
  constructor() {
    this.particles = [];
    this.floatTexts = [];
    this.shockwaves = [];
  }

  reset() {
    this.particles.length = 0;
    this.floatTexts.length = 0;
    this.shockwaves.length = 0;
  }

  /**
   * 磚塊擊碎或擊中火花
   */
  burst(x, y, color, count = 14, speedFactor = 1) {
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = (Math.random() * 220 + 80) * speedFactor;
      this.particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        size: Math.random() * 4 + 2,
        color,
        alpha: 1.0,
        decay: Math.random() * 1.5 + 1.2, // 每秒衰減量
        gravity: 120
      });
    }
  }

  /**
   * TNT 爆炸震波與大型烈焰碎屑
   */
  explosion(x, y) {
    this.shockwaves.push({
      x,
      y,
      radius: 5,
      maxRadius: 100,
      alpha: 1.0,
      color: '#ff3333'
    });

    const colors = ['#ff3333', '#ff9900', '#ffff33', '#ff0055'];
    for (let i = 0; i < 36; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = Math.random() * 380 + 100;
      const c = colors[Math.floor(Math.random() * colors.length)];
      this.particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        size: Math.random() * 6 + 3,
        color: c,
        alpha: 1.0,
        decay: Math.random() * 1.8 + 1.0,
        gravity: 90
      });
    }
  }

  /**
   * 浮動分數與連擊文字
   */
  addFloatText(x, y, text, color = '#ffffff', fontSize = 16) {
    this.floatTexts.push({
      x,
      y,
      text,
      color,
      fontSize,
      alpha: 1.0,
      vy: -55,
      lifetime: 0.85
    });
  }

  update(dt) {
    // 更新粒子
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += p.gravity * dt;
      p.alpha -= p.decay * dt;

      if (p.alpha <= 0) {
        this.particles.splice(i, 1);
      }
    }

    // 更新震波
    for (let i = this.shockwaves.length - 1; i >= 0; i--) {
      const s = this.shockwaves[i];
      s.radius += (s.maxRadius - s.radius) * 12 * dt;
      s.alpha -= 2.2 * dt;

      if (s.alpha <= 0 || s.radius >= s.maxRadius - 2) {
        this.shockwaves.splice(i, 1);
      }
    }

    // 更新浮動文字
    for (let i = this.floatTexts.length - 1; i >= 0; i--) {
      const f = this.floatTexts[i];
      f.y += f.vy * dt;
      f.lifetime -= dt;
      f.alpha = Math.max(0, f.lifetime / 0.85);

      if (f.lifetime <= 0) {
        this.floatTexts.splice(i, 1);
      }
    }
  }

  render(ctx) {
    ctx.save();

    // 繪製震波
    for (let i = 0; i < this.shockwaves.length; i++) {
      const s = this.shockwaves[i];
      ctx.beginPath();
      ctx.arc(s.x, s.y, Math.max(1, s.radius), 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(255, 60, 60, ${s.alpha})`;
      ctx.lineWidth = 4 * s.alpha;
      ctx.stroke();
    }

    // 繪製粒子
    for (let i = 0; i < this.particles.length; i++) {
      const p = this.particles[i];
      ctx.globalAlpha = Math.max(0, Math.min(1, p.alpha));
      ctx.fillStyle = p.color;
      ctx.shadowColor = p.color;
      ctx.shadowBlur = 6;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.shadowBlur = 0;

    // 繪製浮動文字
    for (let i = 0; i < this.floatTexts.length; i++) {
      const f = this.floatTexts[i];
      ctx.globalAlpha = Math.max(0, Math.min(1, f.alpha));
      ctx.font = `bold ${f.fontSize}px 'Segoe UI', system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillStyle = f.color;
      ctx.shadowColor = 'black';
      ctx.shadowBlur = 4;
      ctx.fillText(f.text, f.x, f.y);
    }

    ctx.restore();
  }
}

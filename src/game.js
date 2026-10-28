/**
 * @file game.js
 * 霓虹彈射 (Neon Breakout) - 核心遊戲引擎
 * 純 HTML5 Canvas + JavaScript 實作 (無 React / 無 TypeScript)
 */

import { circleRectCollision, calculatePaddleBounce, calculateScore, checkLevelClear, decidePowerUpDrop } from './physics.js';
import { sound } from './audio.js';
import { LEVELS, BRICK_TYPES } from './levels.js';
import { ParticleSystem } from './particles.js';

class BreakoutGame {
  constructor() {
    this.canvas = document.getElementById('game-canvas');
    this.ctx = this.canvas.getContext('2d');

    // 遊戲虛擬解析度
    this.width = 800;
    this.height = 600;

    // 遊戲狀態: 'title' | 'playing' | 'paused' | 'gameover'
    this.state = 'title';
    this.isVictory = false;

    // 關卡與進度
    this.currentLevelIndex = 0;
    this.score = 0;
    this.highScore = 0;
    this.lives = 3;
    this.combo = 0;
    this.maxCombo = 0;

    // 時間與凍結幀
    this.lastTime = 0;
    this.hitstopTimer = 0;
    this.shakeIntensity = 0;

    // 實體
    this.paddle = {
      x: 350,
      y: 545,
      width: 110,
      baseWidth: 110,
      height: 14,
      speed: 650,
      targetX: 350,
      laserTimer: 0,
      wideTimer: 0
    };

    this.balls = [];
    this.bricks = [];
    this.powerUps = [];
    this.lasers = [];
    this.particles = new ParticleSystem();

    // 護網狀態
    this.hasShield = false;

    // 輸入狀態
    this.keys = {
      left: false,
      right: false,
      space: false
    };
    this.pointerX = null;
    this.isPointerControlling = false;

    // 讀取最高分
    try {
      this.highScore = parseInt(localStorage.getItem('neon_breakout_highscore') || '0', 10);
    } catch {
      this.highScore = 0;
    }

    this.initDOM();
    this.bindEvents();
    this.setupLevel(0);

    // 檢查 URL 中的 ?autostart=1 支援直接進入遊戲
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('autostart') === '1') {
      this.startGame();
    } else {
      this.setState('title');
    }

    // 啟動主渲染迴圈
    requestAnimationFrame(this.loop.bind(this));
  }

  initDOM() {
    this.dom = {
      score: document.getElementById('hud-score'),
      highScore: document.getElementById('hud-highscore'),
      lives: document.getElementById('hud-lives'),
      level: document.getElementById('hud-level'),
      combo: document.getElementById('hud-combo'),
      powerupBadge: document.getElementById('hud-powerups'),
      soundBtn: document.getElementById('btn-sound'),
      pauseBtn: document.getElementById('btn-pause'),
      titleModal: document.getElementById('modal-title'),
      pauseModal: document.getElementById('modal-pause'),
      gameoverModal: document.getElementById('modal-gameover'),
      startBtn: document.getElementById('btn-start'),
      resumeBtn: document.getElementById('btn-resume'),
      restartBtn: document.getElementById('btn-restart'),
      gameoverRestartBtn: document.getElementById('btn-gameover-restart'),
      modalTitleText: document.getElementById('gameover-title-text'),
      finalScore: document.getElementById('final-score'),
      finalLevel: document.getElementById('final-level'),
      finalCombo: document.getElementById('final-combo'),
      levelNameBanner: document.getElementById('level-name-banner')
    };

    if (this.dom.highScore) {
      this.dom.highScore.textContent = this.highScore.toLocaleString();
    }
  }

  bindEvents() {
    // 鍵盤按下
    window.addEventListener('keydown', (e) => {
      sound.init(); // 任何按鍵即解鎖音效

      if (e.code === 'ArrowLeft' || e.key === 'a' || e.key === 'A') {
        this.keys.left = true;
        this.isPointerControlling = false;
      }
      if (e.code === 'ArrowRight' || e.key === 'd' || e.key === 'D') {
        this.keys.right = true;
        this.isPointerControlling = false;
      }
      if (e.code === 'Space') {
        this.keys.space = true;
        if (this.state === 'title') {
          this.startGame();
          e.preventDefault();
        } else if (this.state === 'playing') {
          this.releaseStickyBalls();
          this.tryFireLaser();
          e.preventDefault();
        } else if (this.state === 'gameover') {
          this.onGameOverAction();
          e.preventDefault();
        }
      }
      if (e.code === 'KeyP' || e.code === 'Escape') {
        if (this.state === 'playing') {
          this.setState('paused');
        } else if (this.state === 'paused') {
          this.setState('playing');
        }
      }
      if (e.code === 'KeyM') {
        this.toggleSound();
      }
      if (e.code === 'Enter') {
        if (this.state === 'title') {
          this.startGame();
        } else if (this.state === 'gameover') {
          this.onGameOverAction();
        }
      }
    });

    // 鍵盤放開
    window.addEventListener('keyup', (e) => {
      if (e.code === 'ArrowLeft' || e.key === 'a' || e.key === 'A') {
        this.keys.left = false;
      }
      if (e.code === 'ArrowRight' || e.key === 'd' || e.key === 'D') {
        this.keys.right = false;
      }
      if (e.code === 'Space') {
        this.keys.space = false;
      }
    });

    // 視窗失焦防粘鍵
    window.addEventListener('blur', () => {
      this.keys.left = false;
      this.keys.right = false;
      this.keys.space = false;
    });

    // 滑鼠游標移動
    this.canvas.addEventListener('mousemove', (e) => {
      const rect = this.canvas.getBoundingClientRect();
      const scaleX = this.width / rect.width;
      this.pointerX = (e.clientX - rect.left) * scaleX;
      this.isPointerControlling = true;
    });

    // 滑鼠點擊發射
    this.canvas.addEventListener('mousedown', (e) => {
      sound.init();
      if (e.button === 0 && this.state === 'playing') {
        this.releaseStickyBalls();
        this.tryFireLaser();
      }
    });

    // 觸控支援
    const handleTouch = (e) => {
      if (e.touches && e.touches.length > 0) {
        const touch = e.touches[0];
        const rect = this.canvas.getBoundingClientRect();
        const scaleX = this.width / rect.width;
        this.pointerX = (touch.clientX - rect.left) * scaleX;
        this.isPointerControlling = true;
      }
    };

    this.canvas.addEventListener('touchstart', (e) => {
      sound.init();
      handleTouch(e);
      if (this.state === 'playing') {
        this.releaseStickyBalls();
        this.tryFireLaser();
      }
    }, { passive: true });

    this.canvas.addEventListener('touchmove', handleTouch, { passive: true });

    // 虛擬控制按鈕 (行動端介面)
    const mobileLeft = document.getElementById('mobile-left');
    const mobileRight = document.getElementById('mobile-right');
    const mobileFire = document.getElementById('mobile-fire');

    if (mobileLeft) {
      mobileLeft.addEventListener('touchstart', (e) => { e.preventDefault(); this.keys.left = true; this.isPointerControlling = false; });
      mobileLeft.addEventListener('touchend', (e) => { e.preventDefault(); this.keys.left = false; });
    }
    if (mobileRight) {
      mobileRight.addEventListener('touchstart', (e) => { e.preventDefault(); this.keys.right = true; this.isPointerControlling = false; });
      mobileRight.addEventListener('touchend', (e) => { e.preventDefault(); this.keys.right = false; });
    }
    if (mobileFire) {
      mobileFire.addEventListener('touchstart', (e) => {
        e.preventDefault();
        sound.init();
        if (this.state === 'playing') {
          this.releaseStickyBalls();
          this.tryFireLaser();
        }
      });
    }

    // 按鈕監聽 (附帶失焦處理，避免按鈕保留 focus 影響空白鍵)
    if (this.dom.startBtn) {
      this.dom.startBtn.addEventListener('click', (e) => {
        sound.init();
        e.currentTarget.blur();
        this.startGame();
      });
    }

    if (this.dom.resumeBtn) {
      this.dom.resumeBtn.addEventListener('click', (e) => {
        e.currentTarget.blur();
        this.setState('playing');
      });
    }

    if (this.dom.restartBtn) {
      this.dom.restartBtn.addEventListener('click', (e) => {
        e.currentTarget.blur();
        this.restartGame();
      });
    }

    if (this.dom.gameoverRestartBtn) {
      this.dom.gameoverRestartBtn.addEventListener('click', (e) => {
        sound.init();
        e.currentTarget.blur();
        this.onGameOverAction();
      });
    }

    if (this.dom.pauseBtn) {
      this.dom.pauseBtn.addEventListener('click', (e) => {
        e.currentTarget.blur();
        if (this.state === 'playing') {
          this.setState('paused');
        } else if (this.state === 'paused') {
          this.setState('playing');
        }
      });
    }

    if (this.dom.soundBtn) {
      this.dom.soundBtn.addEventListener('click', (e) => {
        e.currentTarget.blur();
        this.toggleSound();
      });
    }
  }

  toggleSound() {
    const isMuted = sound.toggleMute();
    if (this.dom.soundBtn) {
      this.dom.soundBtn.setAttribute('aria-label', isMuted ? '開啟音效' : '靜音');
      const icon = this.dom.soundBtn.querySelector('.sound-icon');
      if (icon) {
        icon.textContent = isMuted ? '🔇' : '🔊';
      }
    }
  }

  setState(newState) {
    this.state = newState;
    document.body.dataset.state = newState;

    if (this.dom.titleModal) this.dom.titleModal.style.display = (newState === 'title') ? 'flex' : 'none';
    if (this.dom.pauseModal) this.dom.pauseModal.style.display = (newState === 'paused') ? 'flex' : 'none';
    if (this.dom.gameoverModal) this.dom.gameoverModal.style.display = (newState === 'gameover') ? 'flex' : 'none';

    // 重新聚焦畫布
    if (newState === 'playing') {
      this.canvas.focus();
    }
  }

  startGame() {
    this.score = 0;
    this.lives = 3;
    this.combo = 0;
    this.maxCombo = 0;
    this.currentLevelIndex = 0;
    this.setupLevel(0);
    this.setState('playing');
  }

  restartGame() {
    this.startGame();
  }

  onGameOverAction() {
    if (this.isVictory && this.currentLevelIndex < LEVELS.length - 1) {
      // 進入下一關
      this.currentLevelIndex++;
      this.setupLevel(this.currentLevelIndex);
      this.setState('playing');
    } else {
      // 重新開始
      this.startGame();
    }
  }

  setupLevel(levelIdx) {
    const levelData = LEVELS[levelIdx] || LEVELS[0];
    this.currentLevelIndex = levelIdx;
    this.bricks = [];
    this.powerUps = [];
    this.lasers = [];
    this.particles.reset();
    this.combo = 0;
    this.hasShield = false;

    // 重設球拍位置與狀態
    this.paddle.width = this.paddle.baseWidth;
    this.paddle.x = (this.width - this.paddle.width) / 2;
    this.paddle.targetX = this.paddle.x;
    this.paddle.laserTimer = 0;
    this.paddle.wideTimer = 0;

    // 建構磚塊佈局
    const paddingX = 40;
    const paddingY = 60;
    const cols = levelData.cols;
    const brickSpacing = 6;
    const totalSpacingX = brickSpacing * (cols - 1);
    const brickWidth = (this.width - paddingX * 2 - totalSpacingX) / cols;
    const brickHeight = 22;

    for (let r = 0; r < levelData.layout.length; r++) {
      const row = levelData.layout[r];
      for (let c = 0; c < row.length; c++) {
        const code = row[c];
        if (code === '0') continue;

        let typeInfo = null;
        for (const key in BRICK_TYPES) {
          if (BRICK_TYPES[key].code === code) {
            typeInfo = BRICK_TYPES[key];
            break;
          }
        }

        if (typeInfo) {
          this.bricks.push({
            x: paddingX + c * (brickWidth + brickSpacing),
            y: paddingY + r * (brickHeight + brickSpacing),
            width: brickWidth,
            height: brickHeight,
            type: code,
            color: typeInfo.color,
            glow: typeInfo.glow,
            hp: typeInfo.hp,
            maxHp: typeInfo.hp,
            points: typeInfo.points,
            isTNT: !!typeInfo.isTNT,
            isGold: !!typeInfo.isGold,
            indestructible: !!typeInfo.indestructible,
            armor: !!typeInfo.armor,
            destroyed: false
          });
        }
      }
    }

    // 初始化主要球
    this.resetBalls();

    // 更新 HUD
    this.updateHUD();

    // 關卡浮動名稱
    if (this.dom.levelNameBanner) {
      this.dom.levelNameBanner.textContent = levelData.name;
      this.dom.levelNameBanner.classList.remove('fade-banner');
      void this.dom.levelNameBanner.offsetWidth; // 強制重繪
      this.dom.levelNameBanner.classList.add('fade-banner');
    }
  }

  resetBalls() {
    this.balls = [{
      x: this.paddle.x + this.paddle.width / 2,
      y: this.paddle.y - 10,
      radius: 8,
      vx: 0,
      vy: 0,
      speed: 480,
      isSticky: true,
      isFireball: false,
      fireTimer: 0,
      trail: []
    }];
  }

  releaseStickyBalls() {
    let releasedAny = false;
    for (const ball of this.balls) {
      if (ball.isSticky) {
        ball.isSticky = false;
        // 隨機偏角發射 (約 -30度 到 30度)
        const angle = (Math.random() * 0.5 - 0.25) * Math.PI;
        ball.vx = ball.speed * Math.sin(angle);
        ball.vy = -ball.speed * Math.cos(angle);
        releasedAny = true;
      }
    }
    if (releasedAny) {
      sound.playPaddleHit(0);
    }
  }

  tryFireLaser() {
    if (this.paddle.laserTimer > 0) {
      const leftX = this.paddle.x + 8;
      const rightX = this.paddle.x + this.paddle.width - 8;
      const y = this.paddle.y - 4;

      this.lasers.push(
        { x: leftX, y, vy: -750, width: 4, height: 16 },
        { x: rightX, y, vy: -750, width: 4, height: 16 }
      );
      sound.playLaser();
    }
  }

  updateHUD() {
    if (this.dom.score) this.dom.score.textContent = this.score.toLocaleString();
    if (this.dom.highScore) this.dom.highScore.textContent = this.highScore.toLocaleString();
    if (this.dom.lives) {
      this.dom.lives.innerHTML = '❤️'.repeat(Math.max(0, this.lives));
    }
    if (this.dom.level) {
      this.dom.level.textContent = `${this.currentLevelIndex + 1} / ${LEVELS.length}`;
    }
    if (this.dom.combo) {
      if (this.combo >= 2) {
        this.dom.combo.textContent = `COMBO x${this.combo}`;
        this.dom.combo.style.opacity = '1';
      } else {
        this.dom.combo.style.opacity = '0';
      }
    }

    // 道具狀態提示
    if (this.dom.powerupBadge) {
      const badges = [];
      if (this.paddle.laserTimer > 0) badges.push(`⚡ 雷射 (${Math.ceil(this.paddle.laserTimer)}s)`);
      if (this.paddle.wideTimer > 0) badges.push(`🟢 加長板 (${Math.ceil(this.paddle.wideTimer)}s)`);
      const hasFire = this.balls.some(b => b.isFireball);
      if (hasFire) badges.push(`🔥 烈焰穿透`);
      if (this.hasShield) badges.push(`🛡️ 底部能量網`);

      this.dom.powerupBadge.textContent = badges.join(' | ');
      this.dom.powerupBadge.style.display = badges.length > 0 ? 'inline-block' : 'none';
    }
  }

  triggerScreenShake(intensity = 10) {
    this.shakeIntensity = Math.max(this.shakeIntensity, intensity);
  }

  /**
   * 收集道具效果
   */
  applyPowerUp(type) {
    sound.playPowerUp();
    this.particles.addFloatText(this.paddle.x + this.paddle.width / 2, this.paddle.y - 20, type.toUpperCase(), '#00ffff', 18);

    switch (type) {
      case 'multiball': {
        const newBalls = [];
        for (const b of this.balls) {
          if (!b.isSticky) {
            newBalls.push(
              {
                ...b,
                vx: b.vx * 0.9 - 140,
                vy: b.vy,
                trail: []
              },
              {
                ...b,
                vx: b.vx * 0.9 + 140,
                vy: b.vy,
                trail: []
              }
            );
          }
        }
        if (newBalls.length > 0) {
          this.balls.push(...newBalls);
        } else {
          // 如果目前處於吸附狀態，直接複製一顆
          this.balls.push({
            ...this.balls[0],
            x: this.paddle.x + this.paddle.width * 0.3,
            trail: []
          });
        }
        break;
      }
      case 'wide': {
        this.paddle.wideTimer = 12;
        this.paddle.width = this.paddle.baseWidth * 1.5;
        break;
      }
      case 'fireball': {
        for (const b of this.balls) {
          b.isFireball = true;
          b.fireTimer = 10;
        }
        break;
      }
      case 'laser': {
        this.paddle.laserTimer = 10;
        break;
      }
      case 'shield': {
        this.hasShield = true;
        break;
      }
      case 'life': {
        this.lives++;
        this.particles.addFloatText(this.paddle.x + this.paddle.width / 2, this.paddle.y - 35, '+1 LIFE!', '#ff3366', 20);
        break;
      }
    }

    this.updateHUD();
  }

  /**
   * 擊破單塊磚塊與連鎖處理
   */
  destroyBrick(brick, isDirectHit = true) {
    brick.destroyed = true;
    const gained = calculateScore(brick.points, this.combo);
    this.score += gained;
    if (this.score > this.highScore) {
      this.highScore = this.score;
      try {
        localStorage.setItem('neon_breakout_highscore', String(this.highScore));
      } catch {
        // ignore
      }
    }

    // 噴出碎屑粒子
    this.particles.burst(
      brick.x + brick.width / 2,
      brick.y + brick.height / 2,
      brick.color,
      brick.isTNT ? 28 : 14
    );

    // 浮動分數
    this.particles.addFloatText(
      brick.x + brick.width / 2,
      brick.y,
      `+${gained}`,
      brick.color
    );

    // TNT 爆炸判定 (波及周圍 3x3 區域)
    if (brick.isTNT) {
      sound.playExplosion();
      this.particles.explosion(brick.x + brick.width / 2, brick.y + brick.height / 2);
      this.triggerScreenShake(14);
      this.hitstopTimer = 0.06;

      const blastRadius = 90;
      const bx = brick.x + brick.width / 2;
      const by = brick.y + brick.height / 2;

      for (const other of this.bricks) {
        if (!other.destroyed && !other.indestructible && other !== brick) {
          const ox = other.x + other.width / 2;
          const oy = other.y + other.height / 2;
          const dist = Math.hypot(bx - ox, by - oy);
          if (dist <= blastRadius) {
            this.destroyBrick(other, false);
          }
        }
      }
    } else {
      sound.playBrickDestroy(this.combo);
    }

    // 道具隨機掉落
    const drop = decidePowerUpDrop(brick.isGold ? 'gold' : (brick.isTNT ? 'tnt' : 'normal'), Math.random());
    if (drop) {
      this.powerUps.push({
        x: brick.x + brick.width / 2,
        y: brick.y + brick.height / 2,
        type: drop,
        vy: 160,
        radius: 12
      });
    }

    // 檢查是否通關
    if (checkLevelClear(this.bricks)) {
      this.onLevelVictory();
    }
  }

  onLevelVictory() {
    this.isVictory = true;
    sound.playVictory();
    const isFinal = this.currentLevelIndex >= LEVELS.length - 1;

    if (this.dom.modalTitleText) {
      this.dom.modalTitleText.textContent = isFinal ? '🏆 全破通關！榮耀加冕' : '✨ 關卡達成！STAGE CLEAR';
    }
    if (this.dom.finalScore) this.dom.finalScore.textContent = this.score.toLocaleString();
    if (this.dom.finalLevel) this.dom.finalLevel.textContent = `${this.currentLevelIndex + 1}`;
    if (this.dom.finalCombo) this.dom.finalCombo.textContent = `${this.maxCombo}`;
    if (this.dom.gameoverRestartBtn) {
      this.dom.gameoverRestartBtn.textContent = isFinal ? '再挑戰一次 (R)' : '進入下一關 (Next Stage)';
    }

    this.setState('gameover');
  }

  onGameOverDefeat() {
    this.isVictory = false;
    sound.playGameOver();

    if (this.dom.modalTitleText) {
      this.dom.modalTitleText.textContent = '💀 遊戲結束 GAME OVER';
    }
    if (this.dom.finalScore) this.dom.finalScore.textContent = this.score.toLocaleString();
    if (this.dom.finalLevel) this.dom.finalLevel.textContent = `${this.currentLevelIndex + 1}`;
    if (this.dom.finalCombo) this.dom.finalCombo.textContent = `${this.maxCombo}`;
    if (this.dom.gameoverRestartBtn) {
      this.dom.gameoverRestartBtn.textContent = '重新挑戰 (R)';
    }

    this.setState('gameover');
  }

  update(dt) {
    if (this.state !== 'playing') {
      this.particles.update(dt);
      return;
    }

    // 處理凍結幀 (Hitstop)
    if (this.hitstopTimer > 0) {
      this.hitstopTimer -= dt;
      this.particles.update(dt);
      return;
    }

    // 衰減震屏
    if (this.shakeIntensity > 0) {
      this.shakeIntensity = Math.max(0, this.shakeIntensity - dt * 25);
    }

    // 道具計時器衰減
    if (this.paddle.laserTimer > 0) {
      this.paddle.laserTimer -= dt;
      if (this.paddle.laserTimer <= 0) this.updateHUD();
    }
    if (this.paddle.wideTimer > 0) {
      this.paddle.wideTimer -= dt;
      if (this.paddle.wideTimer <= 0) {
        this.paddle.width = this.paddle.baseWidth;
        this.updateHUD();
      }
    }

    // 更新球拍位置
    if (this.isPointerControlling && this.pointerX !== null) {
      // 滑鼠/觸控平滑追蹤
      const target = this.pointerX - this.paddle.width / 2;
      this.paddle.x += (target - this.paddle.x) * Math.min(1, 24 * dt);
    } else {
      // 鍵盤移動
      if (this.keys.left) {
        this.paddle.x -= this.paddle.speed * dt;
      }
      if (this.keys.right) {
        this.paddle.x += this.paddle.speed * dt;
      }
    }

    // 邊界防越界
    this.paddle.x = Math.max(10, Math.min(this.width - this.paddle.width - 10, this.paddle.x));

    // 更新掉落道具
    for (let i = this.powerUps.length - 1; i >= 0; i--) {
      const p = this.powerUps[i];
      p.y += p.vy * dt;

      // 與球拍碰撞
      if (
        p.y + p.radius >= this.paddle.y &&
        p.y - p.radius <= this.paddle.y + this.paddle.height &&
        p.x >= this.paddle.x &&
        p.x <= this.paddle.x + this.paddle.width
      ) {
        this.applyPowerUp(p.type);
        this.powerUps.splice(i, 1);
        continue;
      }

      // 超出底端銷毀
      if (p.y > this.height + 20) {
        this.powerUps.splice(i, 1);
      }
    }

    // 更新雷射子彈
    for (let i = this.lasers.length - 1; i >= 0; i--) {
      const l = this.lasers[i];
      l.y += l.vy * dt;

      let hit = false;
      for (const b of this.bricks) {
        if (!b.destroyed) {
          if (
            l.x + l.width >= b.x &&
            l.x <= b.x + b.width &&
            l.y <= b.y + b.height &&
            l.y + l.height >= b.y
          ) {
            hit = true;
            if (!b.indestructible) {
              b.hp--;
              if (b.hp <= 0) {
                this.destroyBrick(b);
              } else {
                sound.playBrickHit(this.combo);
                this.particles.burst(l.x, l.y, b.color, 6);
              }
            } else {
              sound.playPaddleHit(0);
              this.particles.burst(l.x, l.y, '#ffffff', 5);
            }
            break;
          }
        }
      }

      if (hit || l.y < -20) {
        this.lasers.splice(i, 1);
      }
    }

    // 更新球本體物理
    for (let i = this.balls.length - 1; i >= 0; i--) {
      const ball = this.balls[i];

      // 吸附在板子上
      if (ball.isSticky) {
        ball.x = this.paddle.x + this.paddle.width / 2;
        ball.y = this.paddle.y - ball.radius - 1;
        continue;
      }

      // 烈焰球計時
      if (ball.isFireball) {
        ball.fireTimer -= dt;
        if (ball.fireTimer <= 0) {
          ball.isFireball = false;
        }
      }

      // 紀錄軌跡粒子
      ball.trail.push({ x: ball.x, y: ball.y, alpha: 0.6 });
      if (ball.trail.length > 6) {
        ball.trail.shift();
      }

      // 位移前進
      ball.x += ball.vx * dt;
      ball.y += ball.vy * dt;

      // 左右牆壁反彈
      if (ball.x - ball.radius <= 0) {
        ball.x = ball.radius;
        ball.vx = Math.abs(ball.vx);
        sound.playPaddleHit(0);
      } else if (ball.x + ball.radius >= this.width) {
        ball.x = this.width - ball.radius;
        ball.vx = -Math.abs(ball.vx);
        sound.playPaddleHit(0);
      }

      // 頂部天花板反彈
      if (ball.y - ball.radius <= 0) {
        ball.y = ball.radius;
        ball.vy = Math.abs(ball.vy);
        sound.playPaddleHit(0);
      }

      // 底部能量網阻擋
      if (this.hasShield && ball.y + ball.radius >= 585 && ball.vy > 0) {
        ball.vy = -Math.abs(ball.vy);
        this.hasShield = false;
        sound.playPowerUp();
        this.particles.burst(ball.x, 585, '#00ffff', 25);
        this.particles.addFloatText(ball.x, 560, 'SHIELD BROKEN!', '#00ffff', 16);
        this.updateHUD();
      }

      // 掉落底部判定
      if (ball.y - ball.radius > this.height) {
        this.balls.splice(i, 1);
        continue;
      }

      // 與球拍碰撞
      const paddleRect = {
        x: this.paddle.x,
        y: this.paddle.y,
        width: this.paddle.width,
        height: this.paddle.height
      };

      const paddleCollision = circleRectCollision(ball, paddleRect);
      if (paddleCollision.collided && ball.vy > 0) {
        const bounce = calculatePaddleBounce(ball.x, this.paddle.x, this.paddle.width, ball.speed);
        ball.vx = bounce.vx;
        ball.vy = bounce.vy;
        ball.y = this.paddle.y - ball.radius; // 防穿透

        // 輕微加速 (上限 750)
        ball.speed = Math.min(750, ball.speed + 8);

        // 重設連擊
        this.combo = 0;
        this.updateHUD();

        sound.playPaddleHit((ball.x - (this.paddle.x + this.paddle.width / 2)) / (this.paddle.width / 2));
        this.particles.burst(ball.x, ball.y, '#00ffff', 8);
      }

      // 與磚塊碰撞
      for (const brick of this.bricks) {
        if (brick.destroyed) continue;

        const brickRect = {
          x: brick.x,
          y: brick.y,
          width: brick.width,
          height: brick.height
        };

        const col = circleRectCollision(ball, brickRect);
        if (col.collided) {
          // 如果不是烈焰穿透球，反彈球
          if (!ball.isFireball || brick.indestructible) {
            if (col.normalX !== 0) {
              ball.vx = col.normalX * Math.abs(ball.vx);
            }
            if (col.normalY !== 0) {
              ball.vy = col.normalY * Math.abs(ball.vy);
            }
          }

          if (brick.indestructible) {
            sound.playPaddleHit(0);
            this.particles.burst(ball.x, ball.y, '#ffffff', 6);
          } else {
            // 可破壞磚塊
            this.combo++;
            if (this.combo > this.maxCombo) {
              this.maxCombo = this.combo;
            }

            if (ball.isFireball) {
              // 烈焰球一擊必殺
              brick.hp = 0;
            } else {
              brick.hp--;
            }

            if (brick.hp <= 0) {
              this.destroyBrick(brick);
            } else {
              // 磚塊受傷但未粉碎 (如裝甲磚)
              sound.playBrickHit(this.combo);
              this.particles.burst(ball.x, ball.y, brick.color, 8);
            }

            this.updateHUD();
          }

          // 一顆球單幀只碰撞一塊磚塊，避免卡入角縫
          break;
        }
      }
    }

    // 若全部球掉落，失去一條命
    if (this.balls.length === 0) {
      sound.playLifeLost();
      this.lives--;
      this.combo = 0;
      this.updateHUD();

      if (this.lives <= 0) {
        this.onGameOverDefeat();
      } else {
        // 重置吸附球
        this.resetBalls();
      }
    }

    this.particles.update(dt);
  }

  render() {
    this.ctx.save();

    // 處理螢幕震動
    if (this.shakeIntensity > 0) {
      const offsetX = (Math.random() - 0.5) * this.shakeIntensity;
      const offsetY = (Math.random() - 0.5) * this.shakeIntensity;
      this.ctx.translate(offsetX, offsetY);
    }

    // 清屏與暗色霓虹背景
    this.ctx.fillStyle = '#080918';
    this.ctx.fillRect(0, 0, this.width, this.height);

    // 柔和動態網格線
    this.ctx.strokeStyle = 'rgba(30, 41, 75, 0.35)';
    this.ctx.lineWidth = 1;
    const gridSize = 40;
    for (let x = 0; x <= this.width; x += gridSize) {
      this.ctx.beginPath();
      this.ctx.moveTo(x, 0);
      this.ctx.lineTo(x, this.height);
      this.ctx.stroke();
    }
    for (let y = 0; y <= this.height; y += gridSize) {
      this.ctx.beginPath();
      this.ctx.moveTo(0, y);
      this.ctx.lineTo(this.width, y);
      this.ctx.stroke();
    }

    // 繪製底部能量護網
    if (this.hasShield) {
      this.ctx.save();
      this.ctx.strokeStyle = '#00f0ff';
      this.ctx.lineWidth = 4;
      this.ctx.shadowColor = '#00f0ff';
      this.ctx.shadowBlur = 12;
      this.ctx.beginPath();
      this.ctx.moveTo(0, 588);
      this.ctx.lineTo(this.width, 588);
      this.ctx.stroke();
      this.ctx.restore();
    }

    // 繪製磚塊
    for (const b of this.bricks) {
      if (b.destroyed) continue;

      this.ctx.save();
      this.ctx.fillStyle = b.color;
      this.ctx.shadowColor = b.glow;
      this.ctx.shadowBlur = b.indestructible ? 2 : 8;

      // 繪製磚塊主體
      this.ctx.beginPath();
      this.ctx.roundRect(b.x, b.y, b.width, b.height, 4);
      this.ctx.fill();

      // 繪製磚塊頂部高光
      this.ctx.fillStyle = 'rgba(255, 255, 255, 0.28)';
      this.ctx.fillRect(b.x + 2, b.y + 2, b.width - 4, 3);

      // 特殊磚塊紋飾
      if (b.isTNT) {
        this.ctx.fillStyle = '#ffffff';
        this.ctx.font = 'bold 11px system-ui, sans-serif';
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';
        this.ctx.fillText('TNT', b.x + b.width / 2, b.y + b.height / 2 + 1);
      } else if (b.indestructible) {
        // 鋼鐵線條
        this.ctx.strokeStyle = '#343a40';
        this.ctx.lineWidth = 2;
        this.ctx.beginPath();
        this.ctx.moveTo(b.x + 4, b.y + 4);
        this.ctx.lineTo(b.x + b.width - 4, b.y + b.height - 4);
        this.ctx.moveTo(b.x + b.width - 4, b.y + 4);
        this.ctx.lineTo(b.x + 4, b.y + b.height - 4);
        this.ctx.stroke();
      } else if (b.armor && b.hp === 1) {
        // 裝甲磚已裂開
        this.ctx.strokeStyle = '#ffffff';
        this.ctx.lineWidth = 1.5;
        this.ctx.beginPath();
        this.ctx.moveTo(b.x + 8, b.y + 3);
        this.ctx.lineTo(b.x + b.width / 2, b.y + b.height - 3);
        this.ctx.lineTo(b.x + b.width - 8, b.y + 4);
        this.ctx.stroke();
      } else if (b.isGold) {
        this.ctx.fillStyle = '#000000';
        this.ctx.font = 'bold 10px system-ui, sans-serif';
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';
        this.ctx.fillText('★', b.x + b.width / 2, b.y + b.height / 2);
      }

      this.ctx.restore();
    }

    // 繪製掉落道具
    for (const p of this.powerUps) {
      this.ctx.save();
      let pColor = '#00f0ff';
      let symbol = '?';
      if (p.type === 'multiball') { pColor = '#3a86ff'; symbol = '3x'; }
      if (p.type === 'wide') { pColor = '#00ff66'; symbol = '↔'; }
      if (p.type === 'fireball') { pColor = '#ff5400'; symbol = '🔥'; }
      if (p.type === 'laser') { pColor = '#ffd000'; symbol = '⚡'; }
      if (p.type === 'shield') { pColor = '#00f0ff'; symbol = '🛡️'; }
      if (p.type === 'life') { pColor = '#ff0055'; symbol = '❤️'; }

      this.ctx.fillStyle = pColor;
      this.ctx.shadowColor = pColor;
      this.ctx.shadowBlur = 10;
      this.ctx.beginPath();
      this.ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
      this.ctx.fill();

      this.ctx.fillStyle = '#ffffff';
      this.ctx.font = 'bold 11px system-ui, sans-serif';
      this.ctx.textAlign = 'center';
      this.ctx.textBaseline = 'middle';
      this.ctx.shadowBlur = 0;
      this.ctx.fillText(symbol, p.x, p.y);
      this.ctx.restore();
    }

    // 繪製雷射子彈
    for (const l of this.lasers) {
      this.ctx.save();
      this.ctx.fillStyle = '#ffd000';
      this.ctx.shadowColor = '#ffd000';
      this.ctx.shadowBlur = 12;
      this.ctx.fillRect(l.x, l.y, l.width, l.height);
      this.ctx.restore();
    }

    // 繪製球拍
    this.ctx.save();
    const paddleColor = (this.paddle.laserTimer > 0) ? '#ffb703' : '#00f0ff';
    this.ctx.fillStyle = paddleColor;
    this.ctx.shadowColor = paddleColor;
    this.ctx.shadowBlur = 14;

    this.ctx.beginPath();
    this.ctx.roundRect(this.paddle.x, this.paddle.y, this.paddle.width, this.paddle.height, 6);
    this.ctx.fill();

    // 球拍中心發光區
    this.ctx.fillStyle = '#ffffff';
    this.ctx.fillRect(this.paddle.x + this.paddle.width * 0.35, this.paddle.y + 3, this.paddle.width * 0.3, 4);

    // 如果裝備雷射砲，畫出左右砲管
    if (this.paddle.laserTimer > 0) {
      this.ctx.fillStyle = '#ffd700';
      this.ctx.fillRect(this.paddle.x + 4, this.paddle.y - 6, 8, 8);
      this.ctx.fillRect(this.paddle.x + this.paddle.width - 12, this.paddle.y - 6, 8, 8);
    }
    this.ctx.restore();

    // 繪製球與拖尾
    for (const ball of this.balls) {
      this.ctx.save();

      // 拖尾
      for (let t = 0; t < ball.trail.length; t++) {
        const tr = ball.trail[t];
        const alpha = (t / ball.trail.length) * 0.45;
        this.ctx.fillStyle = ball.isFireball ? `rgba(255, 80, 0, ${alpha})` : `rgba(0, 240, 255, ${alpha})`;
        this.ctx.beginPath();
        this.ctx.arc(tr.x, tr.y, ball.radius * 0.8, 0, Math.PI * 2);
        this.ctx.fill();
      }

      // 球核心
      const ballColor = ball.isFireball ? '#ff3b00' : '#ffffff';
      const glowColor = ball.isFireball ? '#ff7700' : '#00f0ff';

      this.ctx.fillStyle = ballColor;
      this.ctx.shadowColor = glowColor;
      this.ctx.shadowBlur = ball.isFireball ? 20 : 12;

      this.ctx.beginPath();
      this.ctx.arc(ball.x, ball.y, ball.radius, 0, Math.PI * 2);
      this.ctx.fill();

      this.ctx.restore();
    }

    // 繪製粒子與戰鬥浮動文字
    this.particles.render(this.ctx);

    // 若在球吸附中，畫出貼心發射提示
    const hasSticky = this.balls.some(b => b.isSticky);
    if (hasSticky && this.state === 'playing') {
      this.ctx.save();
      this.ctx.fillStyle = 'rgba(255, 255, 255, 0.75)';
      this.ctx.font = '13px system-ui, sans-serif';
      this.ctx.textAlign = 'center';
      this.ctx.fillText('按【空白鍵】或【點擊螢幕】發射球', this.paddle.x + this.paddle.width / 2, this.paddle.y - 25);
      this.ctx.restore();
    }

    this.ctx.restore();
  }

  loop(timestamp) {
    if (!this.lastTime) this.lastTime = timestamp;
    const rawDt = (timestamp - this.lastTime) / 1000;
    this.lastTime = timestamp;

    // 鉗制 dt <= 0.05s 防止分頁切換時物件瞬間穿牆
    const dt = Math.min(rawDt, 0.05);

    this.update(dt);
    this.render();

    requestAnimationFrame(this.loop.bind(this));
  }
}

// 頁面載入完成後啟動遊戲
window.addEventListener('DOMContentLoaded', () => {
  window.breakoutGame = new BreakoutGame();
});

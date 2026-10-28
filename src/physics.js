/**
 * @file physics.js
 * 純邏輯與物理運算模組 (無 DOM 依賴，便於單元測試與高效能運算)
 */

/**
 * 圓形與軸對齊矩形 (AABB) 碰撞檢測
 * @param {{x: number, y: number, radius: number}} circle 
 * @param {{x: number, y: number, width: number, height: number}} rect 
 * @returns {{collided: boolean, normalX: number, normalY: number, penetration: number}}
 */
export function circleRectCollision(circle, rect) {
  // 找出矩形上距離圓心最近的點
  const closestX = Math.max(rect.x, Math.min(circle.x, rect.x + rect.width));
  const closestY = Math.max(rect.y, Math.min(circle.y, rect.y + rect.height));

  const distX = circle.x - closestX;
  const distY = circle.y - closestY;
  const distSquared = distX * distX + distY * distY;

  if (distSquared <= circle.radius * circle.radius) {
    const dist = Math.sqrt(distSquared);
    let normalX = 0;
    let normalY = 0;

    if (dist === 0) {
      // 圓心恰在矩形內或角點上，預設向上反彈
      normalY = -1;
    } else {
      // 根據距離最近的邊決定碰撞法線方向
      const overlapLeft = circle.x - rect.x;
      const overlapRight = (rect.x + rect.width) - circle.x;
      const overlapTop = circle.y - rect.y;
      const overlapBottom = (rect.y + rect.height) - circle.y;

      const minOverlap = Math.min(
        Math.abs(overlapLeft),
        Math.abs(overlapRight),
        Math.abs(overlapTop),
        Math.abs(overlapBottom)
      );

      if (minOverlap === Math.abs(overlapLeft)) {
        normalX = -1;
      } else if (minOverlap === Math.abs(overlapRight)) {
        normalX = 1;
      } else if (minOverlap === Math.abs(overlapTop)) {
        normalY = -1;
      } else {
        normalY = 1;
      }
    }

    return {
      collided: true,
      normalX,
      normalY,
      penetration: Math.max(0, circle.radius - dist)
    };
  }

  return { collided: false, normalX: 0, normalY: 0, penetration: 0 };
}

/**
 * 計算球擊中球拍時的反射角度與速度分量
 * 依據球擊中板子的位置 (左側偏左、右側偏右)，提供靈活的操控感
 * @param {number} ballX 球心 X
 * @param {number} paddleX 板子左側 X
 * @param {number} paddleWidth 板子寬度
 * @param {number} currentSpeed 球目前速率
 * @returns {{vx: number, vy: number}}
 */
export function calculatePaddleBounce(ballX, paddleX, paddleWidth, currentSpeed) {
  // 相對碰撞點 (-1.0 到 1.0)
  const relativeHit = (ballX - (paddleX + paddleWidth / 2)) / (paddleWidth / 2);
  const clampedHit = Math.max(-1, Math.min(1, relativeHit));

  // 最大反彈角 60度 (約 1.047 弧度)
  const maxAngle = (Math.PI / 3) * 1.05;
  const bounceAngle = clampedHit * maxAngle;

  const speed = Math.max(currentSpeed, 400);
  const vx = speed * Math.sin(bounceAngle);
  const vy = -speed * Math.cos(bounceAngle); // 向上運動

  return { vx, vy };
}

/**
 * 連擊計分邏輯
 * @param {number} basePoints 磚塊基礎分
 * @param {number} combo 目前連續擊中次數
 * @returns {number}
 */
export function calculateScore(basePoints, combo) {
  const multiplier = Math.min(5, 1 + Math.floor(combo / 3) * 0.5);
  return Math.round(basePoints * multiplier);
}

/**
 * 檢查關卡是否已清空所有可破壞磚塊
 * @param {Array<{destroyed: boolean, indestructible?: boolean}>} bricks 
 * @returns {boolean}
 */
export function checkLevelClear(bricks) {
  if (!bricks || bricks.length === 0) return true;
  for (let i = 0; i < bricks.length; i++) {
    const b = bricks[i];
    if (!b.indestructible && !b.destroyed) {
      return false;
    }
  }
  return true;
}

/**
 * 道具掉落隨機判定
 * @param {string} brickType 
 * @param {number} randomVal 0 到 1 之間的隨機數
 * @returns {string|null} 道具名稱 或 null
 */
export function decidePowerUpDrop(brickType, randomVal) {
  // 特殊磚塊有更高機率掉落道具
  const dropChance = brickType === 'gold' ? 0.45 : (brickType === 'tnt' ? 0.35 : 0.22);
  if (randomVal > dropChance) return null;

  // 道具權重池
  const powerUps = [
    { type: 'multiball', weight: 25 },
    { type: 'wide', weight: 22 },
    { type: 'fireball', weight: 18 },
    { type: 'laser', weight: 15 },
    { type: 'shield', weight: 12 },
    { type: 'life', weight: 8 }
  ];

  const totalWeight = powerUps.reduce((acc, p) => acc + p.weight, 0);
  let threshold = (randomVal / dropChance) * totalWeight;

  for (const item of powerUps) {
    if (threshold < item.weight) {
      return item.type;
    }
    threshold -= item.weight;
  }

  return 'multiball';
}

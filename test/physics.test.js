import test from 'node:test';
import assert from 'node:assert/strict';
import {
  circleRectCollision,
  calculatePaddleBounce,
  calculateScore,
  checkLevelClear,
  decidePowerUpDrop
} from '../src/physics.js';

test('circleRectCollision detects overlapping ball and brick', () => {
  const circle = { x: 50, y: 50, radius: 10 };
  const rect = { x: 45, y: 45, width: 40, height: 20 };

  const result = circleRectCollision(circle, rect);
  assert.equal(result.collided, true);
});

test('circleRectCollision returns false for distant objects', () => {
  const circle = { x: 10, y: 10, radius: 5 };
  const rect = { x: 100, y: 100, width: 40, height: 20 };

  const result = circleRectCollision(circle, rect);
  assert.equal(result.collided, false);
});

test('calculatePaddleBounce deflects ball according to impact offset', () => {
  const paddleX = 100;
  const paddleWidth = 100; // center is 150
  const speed = 500;

  // Center hit -> straight up
  const centerBounce = calculatePaddleBounce(150, paddleX, paddleWidth, speed);
  assert.ok(Math.abs(centerBounce.vx) < 1);
  assert.ok(centerBounce.vy < 0);

  // Right edge hit -> positive vx (rightward), vy upward
  const rightBounce = calculatePaddleBounce(200, paddleX, paddleWidth, speed);
  assert.ok(rightBounce.vx > 100);
  assert.ok(rightBounce.vy < 0);

  // Left edge hit -> negative vx (leftward), vy upward
  const leftBounce = calculatePaddleBounce(100, paddleX, paddleWidth, speed);
  assert.ok(leftBounce.vx < -100);
  assert.ok(leftBounce.vy < 0);
});

test('calculateScore scales with combo count', () => {
  assert.equal(calculateScore(100, 0), 100);
  assert.equal(calculateScore(100, 3), 150);
  assert.equal(calculateScore(100, 6), 200);
});

test('checkLevelClear handles destructible and indestructible bricks', () => {
  const bricksWithRemaining = [
    { destroyed: false, indestructible: false },
    { destroyed: true, indestructible: false }
  ];
  assert.equal(checkLevelClear(bricksWithRemaining), false);

  const allDestructibleGone = [
    { destroyed: true, indestructible: false },
    { destroyed: false, indestructible: true } // metal blocker remains
  ];
  assert.equal(checkLevelClear(allDestructibleGone), true);
});

test('decidePowerUpDrop returns power-up type or null', () => {
  const noDrop = decidePowerUpDrop('normal', 0.99);
  assert.equal(noDrop, null);

  const drop = decidePowerUpDrop('normal', 0.05);
  assert.ok(typeof drop === 'string');
});

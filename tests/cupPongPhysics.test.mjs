import assert from "node:assert/strict";
import test from "node:test";

import {
  CUP_PONG_AIR_RETENTION,
  CUP_PONG_GRAVITY,
  CUP_PONG_MAX_PHYSICS_STEP,
  closestEllipseApproach,
  getCupContactSettlement,
  getOffTableFallVelocity,
  getCupPongLaunchVelocity,
  getPerspectiveTableBounds,
  getTableBounce,
  predictCupPongTrajectory,
  reflectVelocity,
  stepOffTableFlight,
  sweepPointIntoEllipse,
} from "../lib/cupPongPhysics.ts";

test("trajectory preview uses the same half-step integration as live flight", () => {
  const launch = getCupPongLaunchVelocity(34, -146);
  const [preview] = predictCupPongTrajectory(200, 650, launch, 1);
  let x = 200;
  let groundY = 650;
  let height = 0;
  let vx = launch.vx;
  let vy = launch.vy;
  let verticalVelocity = launch.verticalVelocity;

  for (let substep = 0; substep < 2; substep += 1) {
    x += vx * CUP_PONG_MAX_PHYSICS_STEP;
    groundY += vy * CUP_PONG_MAX_PHYSICS_STEP;
    height += verticalVelocity * CUP_PONG_MAX_PHYSICS_STEP;
    verticalVelocity -= CUP_PONG_GRAVITY * CUP_PONG_MAX_PHYSICS_STEP;
    const retention = Math.pow(
      CUP_PONG_AIR_RETENTION,
      CUP_PONG_MAX_PHYSICS_STEP
    );
    vx *= retention;
    vy *= retention;
  }

  assert.ok(Math.abs(preview.x - x) < 1e-10);
  assert.ok(Math.abs(preview.groundY - groundY) < 1e-10);
  assert.ok(Math.abs(preview.height - height) < 1e-10);
  assert.ok(Math.abs(preview.y - (groundY - height)) < 1e-10);
  assert.ok(Math.abs(preview.verticalVelocity - verticalVelocity) < 1e-10);
});

test("repeated cup contacts settle into an opening or release to the table", () => {
  assert.equal(getCupContactSettlement(2, 0.2), "continue");
  assert.equal(getCupContactSettlement(3, 1.1), "cup");
  assert.equal(getCupContactSettlement(3, 1.3), "table");
});

test("off-table flight preserves the rebound's screen-space direction", () => {
  const rightwardDrop = getOffTableFallVelocity(7.4, 2.1, -5.8);
  const risingExit = getOffTableFallVelocity(-4.2, -3.5, 6.2);

  assert.deepEqual(rightwardDrop, { x: 7.4, y: 7.9 });
  assert.deepEqual(risingExit, { x: -4.2, y: -9.7 });
});

test("off-table flight keeps the shared gravity and air resistance", () => {
  const step = stepOffTableFlight(392, 310, 7.4, -5.8, 0.5);
  const retention = Math.pow(CUP_PONG_AIR_RETENTION, 0.5);

  assert.equal(step.x, 395.7);
  assert.equal(step.y, 307.1);
  assert.ok(Math.abs(step.vx - 7.4 * retention) < 1e-10);
  assert.ok(
    Math.abs(step.vy - (-5.8 + CUP_PONG_GRAVITY * 0.5) * retention) < 1e-10
  );
});

test("full-power launch follows a playable far-cup arc", () => {
  const launch = getCupPongLaunchVelocity(0, -190);
  const trajectory = predictCupPongTrajectory(200, 645, launch);
  const highestScreenPoint = Math.min(...trajectory.map((point) => point.y));

  assert.equal(launch.power, 1);
  assert.ok(highestScreenPoint < 140, `arc only reached y=${highestScreenPoint}`);
  assert.ok(trajectory.length > 55, "flight ended before a natural table impact");
});

test("launch clamps excessive sideways and upward drag", () => {
  const launch = getCupPongLaunchVelocity(900, -900);

  assert.equal(launch.vx, 6.2);
  assert.equal(launch.vy, -7.2);
  assert.equal(launch.verticalVelocity, 20.5);
  assert.equal(launch.spinVelocity, -0.18);
});

test("swept ellipse detects a fast rim crossing without tunnelling", () => {
  const hit = sweepPointIntoEllipse(
    { x: 0, y: 0 },
    { x: 120, y: 0 },
    { centerX: 60, centerY: 0, radiusX: 12, radiusY: 4 }
  );

  assert.ok(hit);
  assert.ok(Math.abs(hit.x - 48) < 1e-8);
  assert.ok(Math.abs(hit.normalX + 1) < 1e-8);
});

test("swept ellipse rejects a genuine near miss", () => {
  const hit = sweepPointIntoEllipse(
    { x: 0, y: 8 },
    { x: 120, y: 8 },
    { centerX: 60, centerY: 0, radiusX: 12, radiusY: 4 }
  );

  assert.equal(hit, null);
});

test("opening test measures closest approach in elliptical space", () => {
  const approach = closestEllipseApproach(
    { x: -20, y: 1 },
    { x: 20, y: 1 },
    { centerX: 0, centerY: 0, radiusX: 10, radiusY: 2 }
  );

  assert.ok(Math.abs(approach.t - 0.5) < 1e-8);
  assert.ok(Math.abs(approach.normalizedDistance - 0.5) < 1e-8);
});

test("rim reflection reverses only the incoming normal component", () => {
  const bounce = reflectVelocity(-10, 4, 1, 0, 0.6, 0.75);
  const separating = reflectVelocity(3, 4, 1, 0, 0.6, 0.75);

  assert.equal(bounce.vx, 6);
  assert.equal(bounce.vy, 3);
  assert.deepEqual(
    { vx: separating.vx, vy: separating.vy },
    { vx: 3, vy: 4 }
  );
});

test("table bounds preserve the perspective trapezoid", () => {
  const far = getPerspectiveTableBounds(72, 72, 774, 38, 362, -28, 428);
  const near = getPerspectiveTableBounds(774, 72, 774, 38, 362, -28, 428);
  const outside = getPerspectiveTableBounds(50, 72, 774, 38, 362, -28, 428);

  assert.deepEqual(far, { left: 38, right: 362 });
  assert.deepEqual(near, { left: -28, right: 428 });
  assert.equal(outside, null);
});

test("hard table bounce retains realistic vertical and horizontal energy", () => {
  const bounce = getTableBounce(-12, 4, -6, 0);

  assert.ok(bounce.verticalVelocity >= 8.5 && bounce.verticalVelocity <= 9.8);
  assert.ok(Math.abs(bounce.vx) >= 3.4);
  assert.ok(Math.abs(bounce.vy) >= 5.1);
});

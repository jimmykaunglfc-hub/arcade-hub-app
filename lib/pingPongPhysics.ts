export interface PhysicsVector3 {
  x: number;
  y: number;
  z: number;
}

export interface NetGeometry {
  z: number;
  halfWidth: number;
  height: number;
  tableHeight: number;
  ballRadius: number;
}

export interface SweptNetImpact {
  x: number;
  y: number;
  /** 1 approached from the near side; -1 approached from the far side. */
  approachSide: 1 | -1;
}

export interface PaddleCollisionGeometry {
  x: number;
  y: number;
  z: number;
  radiusX: number;
  radiusY: number;
  tilt: number;
  ballRadius: number;
  /** 1 for a ball travelling toward the near paddle, -1 for the far paddle. */
  approachDirection: 1 | -1;
  /** Paddle pose at the beginning of the physics step, used for moving CCD. */
  previous?: Pick<
    PaddleCollisionGeometry,
    "x" | "y" | "z" | "tilt"
  >;
}

export interface SweptPaddleImpact extends PhysicsVector3 {
  time: number;
  paddleX: number;
  paddleY: number;
  paddleZ: number;
  paddleTilt: number;
}

export interface BallisticState extends PhysicsVector3 {
  vx: number;
  vy: number;
  vz: number;
  spin: number;
}

export interface PredictedTrajectoryPoint extends PhysicsVector3 {
  time: number;
}

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

export function calculateRacketTilt(
  horizontalSwingIntent: number,
  horizontalPositionFromCenter: number,
  maxTilt = 0.62
): number {
  const desiredTilt =
    horizontalSwingIntent * 0.58 + horizontalPositionFromCenter * 0.08;
  return Math.min(maxTilt, Math.max(-maxTilt, desiredTilt));
}

export function dampRacketTilt(
  current: number,
  target: number,
  deltaSeconds: number,
  response = 18
): number {
  const follow = 1 - Math.exp(-response * Math.max(0, deltaSeconds));
  return current + (target - current) * follow;
}

export function calculateSwipeSteering(
  swingX: number,
  tilt: number,
  paddleVelocityX: number
): number {
  return (
    Math.min(1, Math.max(-1, swingX)) * 3 +
    Math.sin(tilt) * 0.9 +
    paddleVelocityX * 0.04
  );
}

/** Converts a lateral swipe into mild side-spin instead of an arcade ricochet. */
export function calculateSwipeSpin(
  swingX: number,
  tilt: number,
  paddleVelocityX: number
): number {
  return clamp(
    clamp(swingX, -1, 1) * 2.2 +
      Math.sin(tilt) * 0.9 +
      paddleVelocityX * 0.06,
    -3.5,
    3.5
  );
}

/** Applies Magnus-style lateral acceleration and frame-rate-independent decay. */
export function applySideSpin(
  horizontalVelocity: number,
  spin: number,
  deltaSeconds: number
): { vx: number; spin: number } {
  return {
    vx: horizontalVelocity + spin * 0.18 * Math.max(0, deltaSeconds),
    spin: spin * Math.exp(-0.55 * Math.max(0, deltaSeconds)),
  };
}

/** Predicts where a ballistic ball reaches a given depth plane. */
export function predictBallAtZPlane(
  ball: BallisticState,
  planeZ: number,
  gravity: number
): PredictedTrajectoryPoint | null {
  if (Math.abs(ball.vz) < 0.0001) return null;
  const time = (planeZ - ball.z) / ball.vz;
  if (time <= 0 || time > 2) return null;

  return {
    x: ball.x + ball.vx * time + 0.5 * ball.spin * 0.18 * time * time,
    y: ball.y + ball.vy * time + 0.5 * gravity * time * time,
    z: planeZ,
    time,
  };
}

/** Predicts the next descending contact with the horizontal tabletop. */
export function predictTableLanding(
  ball: BallisticState,
  tableHeight: number,
  ballRadius: number,
  gravity: number
): PredictedTrajectoryPoint | null {
  const height = ball.y - ballRadius - tableHeight;
  const a = 0.5 * gravity;
  const b = ball.vy;
  const discriminant = b * b - 4 * a * height;
  if (Math.abs(a) < 0.000001 || discriminant < 0) return null;

  const root = Math.sqrt(discriminant);
  const times = [(-b - root) / (2 * a), (-b + root) / (2 * a)]
    .filter((time) => time > 0.001 && time <= 3)
    .filter((time) => ball.vy + gravity * time < 0)
    .sort((left, right) => left - right);
  const time = times[0];
  if (time === undefined) return null;

  return {
    x: ball.x + ball.vx * time + 0.5 * ball.spin * 0.18 * time * time,
    y: tableHeight + ballRadius,
    z: ball.z + ball.vz * time,
    time,
  };
}

/**
 * Sweeps the ball against the racket face instead of checking only its final
 * frame position. This prevents a fast return from tunnelling through the
 * player's hitbox between fixed physics steps.
 */
export function sweepSphereAgainstPaddle(
  previous: PhysicsVector3,
  next: PhysicsVector3,
  paddle: PaddleCollisionGeometry
): SweptPaddleImpact | null {
  const previousPaddle = paddle.previous ?? paddle;
  const previousContactZ =
    previousPaddle.z - paddle.approachDirection * paddle.ballRadius;
  const currentContactZ =
    paddle.z - paddle.approachDirection * paddle.ballRadius;
  const previousSeparation = previous.z - previousContactZ;
  const currentSeparation = next.z - currentContactZ;
  const relativeDeltaZ = currentSeparation - previousSeparation;
  if (
    Math.abs(relativeDeltaZ) < 0.0001 ||
    Math.sign(relativeDeltaZ) !== paddle.approachDirection
  ) {
    return null;
  }

  const time = -previousSeparation / relativeDeltaZ;
  if (time < 0 || time > 1) return null;

  const x = previous.x + (next.x - previous.x) * time;
  const y = previous.y + (next.y - previous.y) * time;
  const paddleX = previousPaddle.x + (paddle.x - previousPaddle.x) * time;
  const paddleY = previousPaddle.y + (paddle.y - previousPaddle.y) * time;
  const paddleZ = previousPaddle.z + (paddle.z - previousPaddle.z) * time;
  const paddleTilt =
    previousPaddle.tilt + (paddle.tilt - previousPaddle.tilt) * time;
  const contactZ =
    paddleZ - paddle.approachDirection * paddle.ballRadius;
  const relativeX = x - paddleX;
  const relativeY = y - paddleY;
  const cosine = Math.cos(-paddleTilt);
  const sine = Math.sin(-paddleTilt);
  const racketX = relativeX * cosine - relativeY * sine;
  const racketY = relativeX * sine + relativeY * cosine;
  const radiusX = paddle.radiusX + paddle.ballRadius;
  const radiusY = paddle.radiusY + paddle.ballRadius;
  const insideFace =
    (racketX * racketX) / (radiusX * radiusX) +
      (racketY * racketY) / (radiusY * radiusY) <=
    1;

  return insideFace
    ? {
        x,
        y,
        z: contactZ,
        time,
        paddleX,
        paddleY,
        paddleZ,
        paddleTilt,
      }
    : null;
}

/**
 * Sweeps a ball sphere against a finite net plane.
 *
 * Interpolating the contact point prevents a fast ball from tunnelling through
 * the mesh when it travels across the plane between physics steps.
 */
export function sweepSphereAgainstNet(
  previous: PhysicsVector3,
  next: PhysicsVector3,
  net: NetGeometry
): SweptNetImpact | null {
  const deltaZ = next.z - previous.z;
  if (Math.abs(deltaZ) < 0.0001) return null;

  const approachSide: 1 | -1 = previous.z >= net.z ? 1 : -1;
  if (
    (approachSide === 1 && deltaZ >= 0) ||
    (approachSide === -1 && deltaZ <= 0)
  ) {
    return null;
  }

  const contactZ = net.z + approachSide * net.ballRadius;
  const time = (contactZ - previous.z) / deltaZ;
  if (time < 0 || time > 1) return null;

  const x = previous.x + (next.x - previous.x) * time;
  const y = previous.y + (next.y - previous.y) * time;
  if (
    Math.abs(x) > net.halfWidth + net.ballRadius ||
    y - net.ballRadius > net.height ||
    y + net.ballRadius < net.tableHeight
  ) {
    return null;
  }

  return { x, y, approachSide };
}

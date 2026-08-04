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

export interface LandingVelocitySolution {
  vx: number;
  vz: number;
  time: number;
}

export type PhysicsSide = "local" | "opponent";

/**
 * An explicit rally phase prevents the renderer and the rules engine from
 * disagreeing about whether the next legal event is a bounce or a return.
 */
export type RallyPhase =
  | "SERVE_SERVER_BOUNCE"
  | "SERVE_RECEIVER_BOUNCE"
  | "RALLY_RECEIVER_BOUNCE"
  | "RALLY_RETURN";

export interface PhysicsRallyState {
  lastHitBy: PhysicsSide;
  requiredBounceSide: PhysicsSide | null;
  validBounce: boolean;
  tableBouncesSinceHit: number;
  lastBounceSide: PhysicsSide | null;
  consecutiveBounces: number;
  isServe: boolean;
  server: PhysicsSide;
  serveBounceCount: number;
  serveTouchedNet: boolean;
  phase: RallyPhase;
}

export type TableBounceResolution =
  | { kind: "CONTINUE"; rally: PhysicsRallyState }
  | { kind: "LET"; rally: PhysicsRallyState }
  | {
      kind: "POINT";
      rally: PhysicsRallyState;
      winner: PhysicsSide;
      reason:
        | "DOUBLE_BOUNCE"
        | "BAD_SERVICE"
        | "WRONG_SIDE"
        | "BAD_DOUBLES_COURT";
    };

const oppositePhysicsSide = (side: PhysicsSide): PhysicsSide =>
  side === "local" ? "opponent" : "local";

export function createPhysicsRally(
  server: PhysicsSide
): PhysicsRallyState {
  return {
    lastHitBy: server,
    requiredBounceSide: server,
    validBounce: false,
    tableBouncesSinceHit: 0,
    lastBounceSide: null,
    consecutiveBounces: 0,
    isServe: true,
    server,
    serveBounceCount: 0,
    serveTouchedNet: false,
    phase: "SERVE_SERVER_BOUNCE",
  };
}

/**
 * Records a legal racket return. A return is legal only after exactly one
 * bounce on the receiver's side; hitting sooner is a volley fault.
 */
export function registerPaddleReturn(
  rally: PhysicsRallyState,
  hitter: PhysicsSide
): PhysicsRallyState | null {
  if (
    rally.phase !== "RALLY_RETURN" ||
    !rally.validBounce ||
    rally.lastHitBy === hitter
  ) {
    return null;
  }

  return {
    lastHitBy: hitter,
    requiredBounceSide: oppositePhysicsSide(hitter),
    validBounce: false,
    tableBouncesSinceHit: 0,
    lastBounceSide: null,
    consecutiveBounces: 0,
    isServe: false,
    server: rally.server,
    serveBounceCount: 0,
    serveTouchedNet: false,
    phase: "RALLY_RECEIVER_BOUNCE",
  };
}

/**
 * Applies the observable ITTF/PongFit bounce rules as one atomic transition.
 * This is intentionally pure so a fast physics substep cannot partially
 * mutate rally state and leave the ball active but impossible to return.
 */
export function resolveTableBounce(
  current: PhysicsRallyState,
  bounceSide: PhysicsSide,
  options: { isDoubles: boolean; ballX: number }
): TableBounceResolution {
  const rally: PhysicsRallyState = {
    ...current,
    tableBouncesSinceHit: current.tableBouncesSinceHit + 1,
    lastBounceSide: bounceSide,
    consecutiveBounces:
      current.lastBounceSide === bounceSide
        ? current.consecutiveBounces + 1
        : 1,
  };

  if (rally.consecutiveBounces >= 2) {
    return {
      kind: "POINT",
      rally,
      winner: oppositePhysicsSide(bounceSide),
      reason: "DOUBLE_BOUNCE",
    };
  }

  if (rally.phase === "SERVE_SERVER_BOUNCE") {
    if (bounceSide !== rally.server) {
      return {
        kind: "POINT",
        rally,
        winner: oppositePhysicsSide(rally.server),
        reason: "BAD_SERVICE",
      };
    }
    if (
      options.isDoubles &&
      (bounceSide === "local" ? options.ballX < 0 : options.ballX > 0)
    ) {
      return {
        kind: "POINT",
        rally,
        winner: oppositePhysicsSide(rally.server),
        reason: "BAD_DOUBLES_COURT",
      };
    }
    return {
      kind: "CONTINUE",
      rally: {
        ...rally,
        requiredBounceSide: oppositePhysicsSide(rally.server),
        serveBounceCount: 1,
        phase: "SERVE_RECEIVER_BOUNCE",
      },
    };
  }

  if (rally.phase === "SERVE_RECEIVER_BOUNCE") {
    if (bounceSide !== oppositePhysicsSide(rally.server)) {
      return {
        kind: "POINT",
        rally,
        winner: oppositePhysicsSide(rally.server),
        reason: "BAD_SERVICE",
      };
    }
    if (
      options.isDoubles &&
      (bounceSide === "local" ? options.ballX < 0 : options.ballX > 0)
    ) {
      return {
        kind: "POINT",
        rally,
        winner: oppositePhysicsSide(rally.server),
        reason: "BAD_DOUBLES_COURT",
      };
    }

    const completedServe: PhysicsRallyState = {
      ...rally,
      isServe: false,
      requiredBounceSide: null,
      validBounce: true,
      serveBounceCount: 2,
      phase: "RALLY_RETURN",
    };
    return rally.serveTouchedNet
      ? { kind: "LET", rally: completedServe }
      : { kind: "CONTINUE", rally: completedServe };
  }

  if (
    rally.phase !== "RALLY_RECEIVER_BOUNCE" ||
    bounceSide !== oppositePhysicsSide(rally.lastHitBy)
  ) {
    return {
      kind: "POINT",
      rally,
      winner: oppositePhysicsSide(rally.lastHitBy),
      reason: "WRONG_SIDE",
    };
  }

  return {
    kind: "CONTINUE",
    rally: {
      ...rally,
      requiredBounceSide: null,
      validBounce: true,
      phase: "RALLY_RETURN",
    },
  };
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
 * Solves horizontal velocity from a desired tabletop landing point. Raw swipe
 * speed must not be used as world velocity: on a phone that routinely sends a
 * valid-looking shot several table widths out of bounds.
 */
export function solveRallyLandingVelocity(
  ball: BallisticState,
  targetX: number,
  targetZ: number,
  tableHeight: number,
  ballRadius: number,
  gravity: number
): LandingVelocitySolution | null {
  const landing = predictTableLanding(
    ball,
    tableHeight,
    ballRadius,
    gravity
  );
  if (!landing || landing.time <= 0.001) return null;

  const curveOffset = 0.5 * ball.spin * 0.18 * landing.time * landing.time;
  return {
    vx: (targetX - ball.x - curveOffset) / landing.time,
    vz: (targetZ - ball.z) / landing.time,
    time: landing.time,
  };
}

/**
 * Solves a legal serve through its server-side and receiver-side bounces.
 * Horizontal speed is chosen so the second bounce stays in front of the
 * receiver's paddle instead of landing behind it.
 */
export function solveServeLandingVelocity(
  ball: BallisticState,
  targetSecondBounceX: number,
  targetSecondBounceZ: number,
  tableHeight: number,
  ballRadius: number,
  gravity: number,
  tableRestitution: number
): LandingVelocitySolution | null {
  const firstBounce = predictTableLanding(
    ball,
    tableHeight,
    ballRadius,
    gravity
  );
  if (!firstBounce || firstBounce.time <= 0.001 || gravity >= 0) return null;

  const impactVelocityY = ball.vy + gravity * firstBounce.time;
  const reboundVelocityY = Math.abs(impactVelocityY) * tableRestitution;
  const secondBounceFlightTime = (2 * reboundVelocityY) / Math.abs(gravity);
  const totalTime = firstBounce.time + secondBounceFlightTime;
  if (!Number.isFinite(totalTime) || totalTime <= 0.001) return null;

  const curveOffset = 0.5 * ball.spin * 0.18 * totalTime * totalTime;
  return {
    vx: (targetSecondBounceX - ball.x - curveOffset) / totalTime,
    vz: (targetSecondBounceZ - ball.z) / totalTime,
    time: totalTime,
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

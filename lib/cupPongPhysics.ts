export interface Point2D {
  x: number;
  y: number;
}

export interface Ellipse {
  centerX: number;
  centerY: number;
  radiusX: number;
  radiusY: number;
}

export interface SweepHit extends Point2D {
  t: number;
  normalX: number;
  normalY: number;
}

export interface ReflectedVelocity {
  vx: number;
  vy: number;
  normalSpeed: number;
  tangentSpeed: number;
}

export interface TableBounds {
  left: number;
  right: number;
}

export type CupContactSettlement = "continue" | "cup" | "table";

export interface CupPongLaunchVelocity {
  vx: number;
  vy: number;
  verticalVelocity: number;
  spinVelocity: number;
  power: number;
}

export interface TrajectoryPoint extends Point2D {
  height: number;
  groundY: number;
  verticalVelocity: number;
}

export interface OffTableFlightStep extends Point2D {
  vx: number;
  vy: number;
}

export const CUP_PONG_GRAVITY = 0.62;
export const CUP_PONG_AIR_RETENTION = 0.995;
export const CUP_PONG_MAX_PHYSICS_STEP = 0.5;

export const clampValue = (
  value: number,
  minimum: number,
  maximum: number
) => Math.max(minimum, Math.min(maximum, value));

export function getCupPongLaunchVelocity(
  dragX: number,
  dragY: number
): CupPongLaunchVelocity {
  const dragDistance = Math.hypot(dragX, dragY);
  const power = clampValue(dragDistance / 190, 0.2, 1);

  return {
    vx: clampValue(dragX * 0.032, -6.2, 6.2),
    vy: clampValue(dragY * 0.032, -7.2, -1.8),
    verticalVelocity: 9.5 + power * 11,
    spinVelocity: clampValue(-dragX * 0.0014, -0.18, 0.18),
    power,
  };
}

export function getCupContactSettlement(
  contactCount: number,
  nearestOpeningDistance: number
): CupContactSettlement {
  if (contactCount < 3) return "continue";
  return nearestOpeningDistance <= 1.18 ? "cup" : "table";
}

/**
 * Converts the separated table-plane/height velocities into continuous
 * screen-space motion when the ball leaves the tabletop.
 */
export function getOffTableFallVelocity(
  vx: number,
  vy: number,
  verticalVelocity: number
): Point2D {
  return {
    x: vx,
    y: vy - verticalVelocity,
  };
}

/** Continues an off-table rebound without swapping to a second gravity model. */
export function stepOffTableFlight(
  x: number,
  y: number,
  vx: number,
  vy: number,
  delta: number
): OffTableFlightStep {
  const retention = Math.pow(CUP_PONG_AIR_RETENTION, delta);

  return {
    x: x + vx * delta,
    y: y + vy * delta,
    vx: vx * retention,
    vy: (vy + CUP_PONG_GRAVITY * delta) * retention,
  };
}

export function predictCupPongTrajectory(
  startX: number,
  startY: number,
  launch: CupPongLaunchVelocity,
  steps = 76
): TrajectoryPoint[] {
  let x = startX;
  let y = startY;
  let height = 0;
  let vx = launch.vx;
  let vy = launch.vy;
  let verticalVelocity = launch.verticalVelocity;
  const points: TrajectoryPoint[] = [];

  for (let frame = 0; frame < steps; frame += 1) {
    // Match the live simulation's two half-frame integration steps. Aiming
    // previews otherwise drift at high power even when they share constants.
    for (let substep = 0; substep < 2; substep += 1) {
      const delta = CUP_PONG_MAX_PHYSICS_STEP;
      x += vx * delta;
      y += vy * delta;
      height += verticalVelocity * delta;
      verticalVelocity -= CUP_PONG_GRAVITY * delta;
      const retention = Math.pow(CUP_PONG_AIR_RETENTION, delta);
      vx *= retention;
      vy *= retention;
    }

    points.push({
      x,
      y: y - Math.max(0, height),
      height,
      groundY: y,
      verticalVelocity,
    });
    if (height < 0 && frame > 2) break;
  }

  return points;
}

/**
 * Returns the first point where a swept point enters an ellipse. Working in
 * normalized ellipse space keeps the quadratic stable for the very flat cup
 * rims used by the renderer.
 */
export function sweepPointIntoEllipse(
  start: Point2D,
  end: Point2D,
  ellipse: Ellipse
): SweepHit | null {
  const radiusX = Math.max(ellipse.radiusX, 0.001);
  const radiusY = Math.max(ellipse.radiusY, 0.001);
  const startX = (start.x - ellipse.centerX) / radiusX;
  const startY = (start.y - ellipse.centerY) / radiusY;
  const deltaX = (end.x - start.x) / radiusX;
  const deltaY = (end.y - start.y) / radiusY;
  const c = startX * startX + startY * startY - 1;
  let t = 0;

  if (c > 0) {
    const a = deltaX * deltaX + deltaY * deltaY;
    if (a < 1e-10) return null;

    const b = 2 * (startX * deltaX + startY * deltaY);
    const discriminant = b * b - 4 * a * c;
    if (discriminant < 0) return null;

    t = (-b - Math.sqrt(discriminant)) / (2 * a);
    if (t < 0 || t > 1) return null;
  }

  const x = start.x + (end.x - start.x) * t;
  const y = start.y + (end.y - start.y) * t;
  const gradientX = (x - ellipse.centerX) / (radiusX * radiusX);
  const gradientY = (y - ellipse.centerY) / (radiusY * radiusY);
  const gradientLength = Math.max(Math.hypot(gradientX, gradientY), 1e-8);

  return {
    x,
    y,
    t,
    normalX: gradientX / gradientLength,
    normalY: gradientY / gradientLength,
  };
}

/** The closest approach of a segment to an ellipse's centre, in ellipse units. */
export function closestEllipseApproach(
  start: Point2D,
  end: Point2D,
  ellipse: Ellipse
) {
  const radiusX = Math.max(ellipse.radiusX, 0.001);
  const radiusY = Math.max(ellipse.radiusY, 0.001);
  const startX = (start.x - ellipse.centerX) / radiusX;
  const startY = (start.y - ellipse.centerY) / radiusY;
  const deltaX = (end.x - start.x) / radiusX;
  const deltaY = (end.y - start.y) / radiusY;
  const denominator = deltaX * deltaX + deltaY * deltaY;
  const t = denominator > 1e-10
    ? clampValue(-(startX * deltaX + startY * deltaY) / denominator, 0, 1)
    : 0;
  const normalizedX = startX + deltaX * t;
  const normalizedY = startY + deltaY * t;

  return {
    t,
    x: start.x + (end.x - start.x) * t,
    y: start.y + (end.y - start.y) * t,
    normalizedDistance: Math.hypot(normalizedX, normalizedY),
  };
}

/** Reflects only an approaching velocity; separating contacts are untouched. */
export function reflectVelocity(
  vx: number,
  vy: number,
  normalX: number,
  normalY: number,
  restitution: number,
  tangentRetention: number,
  tangentKick = 0
): ReflectedVelocity {
  const normalSpeed = vx * normalX + vy * normalY;
  const tangentX = -normalY;
  const tangentY = normalX;
  const tangentSpeed = vx * tangentX + vy * tangentY;

  if (normalSpeed >= 0) {
    return { vx, vy, normalSpeed, tangentSpeed };
  }

  const outgoingNormalSpeed = -normalSpeed * restitution;
  const outgoingTangentSpeed = tangentSpeed * tangentRetention + tangentKick;

  return {
    vx: normalX * outgoingNormalSpeed + tangentX * outgoingTangentSpeed,
    vy: normalY * outgoingNormalSpeed + tangentY * outgoingTangentSpeed,
    normalSpeed,
    tangentSpeed,
  };
}

export function getPerspectiveTableBounds(
  y: number,
  topY: number,
  nearY: number,
  farLeft: number,
  farRight: number,
  nearLeft: number,
  nearRight: number
): TableBounds | null {
  const depth = (y - topY) / (nearY - topY);
  if (depth < 0 || depth > 1) return null;

  return {
    left: farLeft + (nearLeft - farLeft) * depth,
    right: farRight + (nearRight - farRight) * depth,
  };
}

/**
 * Ping-pong balls retain most of their energy on a hard table. The small
 * speed dependency avoids endless micro-bounces without making hard bounce
 * shots feel as though they landed on foam.
 */
export function getTableBounce(
  verticalVelocity: number,
  vx: number,
  vy: number,
  spinVelocity: number
) {
  const verticalImpact = Math.abs(verticalVelocity);
  const impactStrength = clampValue((verticalImpact - 0.8) / 18, 0, 1);
  const restitution = 0.68 + impactStrength * 0.13;
  const tangentRetention = 0.86 + impactStrength * 0.06;
  const spinKick = clampValue(spinVelocity * (1.5 + impactStrength * 2), -1.6, 1.6);

  return {
    verticalVelocity: verticalImpact * restitution,
    vx: (vx + spinKick) * tangentRetention,
    vy: (vy - spinKick * 0.18) * tangentRetention,
    spinVelocity: spinVelocity * -0.36,
  };
}

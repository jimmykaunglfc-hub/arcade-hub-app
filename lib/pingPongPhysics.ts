export const calculateRacketTilt = (swingX: number, horizontalOffset: number, weight = 0.42) => Math.max(-0.62, Math.min(0.62, swingX * weight + horizontalOffset * 0.2));
export const calculateSwipeSteering = (swingX: number, tilt: number, paddleVelocityX: number) => swingX * 1.4 + tilt * 0.75 + paddleVelocityX * 0.06;
export const dampRacketTilt = (current: number, target: number, seconds: number, sharpness = 14) => current + (target - current) * (1 - Math.exp(-sharpness * seconds));

type Position = { x: number; y: number; z: number };
export function sweepSphereAgainstNet(previous: Position, next: Position, config: { z: number; halfWidth: number; height: number; tableHeight: number; ballRadius: number }) {
  const crossed = (previous.z - config.z) * (next.z - config.z) <= 0;
  if (!crossed || Math.abs(next.x) > config.halfWidth + config.ballRadius) return null;
  const distance = next.z - previous.z;
  if (!distance) return null;
  const t = Math.max(0, Math.min(1, (config.z - previous.z) / distance));
  const y = previous.y + (next.y - previous.y) * t;
  if (y - config.ballRadius > config.height || y + config.ballRadius < config.tableHeight) return null;
  return { x: previous.x + (next.x - previous.x) * t, y, approachSide: previous.z < config.z ? -1 : 1 };
}

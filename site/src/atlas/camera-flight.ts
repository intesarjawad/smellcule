/**
 * A camera flight is an eased interpolation between two poses. The clock is injected so the
 * duration and end pose can be checked without waiting, and reduced motion collapses the
 * flight to its destination instead of animating.
 */

export interface Vec3 {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface CameraPose {
  readonly position: Vec3;
  readonly target: Vec3;
}

/** Long enough for the camera to back away, cross the map and let the threads draw in. */
export const CAMERA_FLIGHT_MS = 1400;

export interface CameraFlightOptions {
  readonly from: CameraPose;
  readonly to: CameraPose;
  readonly durationMs?: number;
  readonly reducedMotion?: boolean;
  readonly now: () => number;
}

export interface CameraFlight {
  readonly durationMs: number;
  pose(): CameraPose;
  done(): boolean;
}

export function easeInOutCubic(value: number): number {
  const t = Math.min(1, Math.max(0, value));
  return t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2;
}

function mix(from: Vec3, to: Vec3, t: number): Vec3 {
  if (t <= 0) return from;
  if (t >= 1) return to;
  return {
    x: from.x + (to.x - from.x) * t,
    y: from.y + (to.y - from.y) * t,
    z: from.z + (to.z - from.z) * t,
  };
}

function mixPose(from: CameraPose, to: CameraPose, t: number): CameraPose {
  return {
    position: mix(from.position, to.position, t),
    target: mix(from.target, to.target, t),
  };
}

/** A pose that looks at a point from the same direction the camera already faces. */
export function focusPose(from: Vec3, point: Vec3, distance: number): CameraPose {
  const offset = { x: from.x - point.x, y: from.y - point.y, z: from.z - point.z };
  const size = Math.hypot(offset.x, offset.y, offset.z);
  const direction =
    size === 0
      ? { x: 0, y: 0, z: 1 }
      : { x: offset.x / size, y: offset.y / size, z: offset.z / size };
  return {
    position: {
      x: point.x + direction.x * distance,
      y: point.y + direction.y * distance,
      z: point.z + direction.z * distance,
    },
    target: point,
  };
}

export function createCameraFlight(options: CameraFlightOptions): CameraFlight {
  const durationMs =
    options.reducedMotion === true ? 0 : Math.max(0, options.durationMs ?? CAMERA_FLIGHT_MS);
  const startedAt = options.now();

  return {
    durationMs,
    pose(): CameraPose {
      if (durationMs === 0) return options.to;
      const elapsed = options.now() - startedAt;
      if (elapsed >= durationMs) return options.to;
      return mixPose(options.from, options.to, easeInOutCubic(elapsed / durationMs));
    },
    done(): boolean {
      return durationMs === 0 || options.now() - startedAt >= durationMs;
    },
  };
}

const APPROACH_SAMPLES = 96;

export interface Approach {
  /** Unit vector from the molecule toward where the camera should sit. */
  readonly direction: Vec3;
  /** Distance at which the molecule and its neighbours fill the frame. */
  readonly distance: number;
  /** The middle of the molecule and its neighbours, which the camera should look at. */
  readonly target: Vec3;
}

/**
 * Picks the side to arrive from. Neighbours that line up along the view hide each other, so this
 * samples directions on a sphere and keeps the one that spreads them widest across the screen,
 * leaning toward the direction the camera already faces so the flight does not swing round.
 */
export function bestApproach(
  centre: Vec3,
  neighbours: readonly Vec3[],
  current: Vec3,
  fovDegrees: number,
  limits: { readonly min: number; readonly max: number },
): Approach {
  const facing = normalise({
    x: current.x - centre.x,
    y: current.y - centre.y,
    z: current.z - centre.z,
  });
  const group = [centre, ...neighbours];
  const middle = {
    x: group.reduce((sum, point) => sum + point.x, 0) / group.length,
    y: group.reduce((sum, point) => sum + point.y, 0) / group.length,
    z: group.reduce((sum, point) => sum + point.z, 0) / group.length,
  };
  let best: { direction: Vec3; spread: number; score: number } | null = null;
  for (let index = 0; index < APPROACH_SAMPLES; index += 1) {
    const y = 1 - (2 * (index + 0.5)) / APPROACH_SAMPLES;
    const ring = Math.sqrt(1 - y * y);
    const angle = index * Math.PI * (3 - Math.sqrt(5));
    const direction = { x: Math.cos(angle) * ring, y, z: Math.sin(angle) * ring };
    let spread = 0;
    for (const point of group) {
      const offset = { x: point.x - middle.x, y: point.y - middle.y, z: point.z - middle.z };
      const along = offset.x * direction.x + offset.y * direction.y + offset.z * direction.z;
      spread = Math.max(
        spread,
        Math.hypot(
          offset.x - along * direction.x,
          offset.y - along * direction.y,
          offset.z - along * direction.z,
        ),
      );
    }
    const lean =
      0.55 +
      0.45 * Math.max(0, direction.x * facing.x + direction.y * facing.y + direction.z * facing.z);
    const score = spread * lean;
    if (best === null || score > best.score) best = { direction, spread, score };
  }
  const chosen = best ?? { direction: facing, spread: 0, score: 0 };
  const halfView = Math.tan((fovDegrees * Math.PI) / 360);
  const distance = Math.min(limits.max, Math.max(limits.min, chosen.spread / (halfView * 0.55)));
  return { direction: chosen.direction, distance, target: middle };
}

function normalise(vector: Vec3): Vec3 {
  const size = Math.hypot(vector.x, vector.y, vector.z);
  return size === 0
    ? { x: 0, y: 0, z: 1 }
    : { x: vector.x / size, y: vector.y / size, z: vector.z / size };
}

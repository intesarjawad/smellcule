/**
 * Screen-to-world picking without a GPU: a pixel becomes a camera ray, and the closest point
 * within a world-space radius wins. The camera is described by its pose and field of view so
 * the geometry can be checked without three or a browser.
 */

export interface Vec3 {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface Ray {
  readonly origin: Vec3;
  readonly direction: Vec3;
}

export interface PickingCamera {
  readonly position: Vec3;
  readonly target: Vec3;
  readonly up: Vec3;
  readonly verticalFovRadians: number;
  readonly aspect: number;
}

const DIRECTION_EPSILON = 1e-9;

function subtract(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

function cross(a: Vec3, b: Vec3): Vec3 {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}

function dot(a: Vec3, b: Vec3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

function length(value: Vec3): number {
  return Math.hypot(value.x, value.y, value.z);
}

function normalize(value: Vec3): Vec3 {
  const size = length(value);
  if (size < DIRECTION_EPSILON) return { x: 0, y: 0, z: 0 };
  return { x: value.x / size, y: value.y / size, z: value.z / size };
}

/** A ray through normalised device coordinates, where x and y run from -1 to 1. */
export function cameraRay(camera: PickingCamera, ndcX: number, ndcY: number): Ray {
  const forward = normalize(subtract(camera.target, camera.position));
  const right = normalize(cross(forward, camera.up));
  const up = normalize(cross(right, forward));
  const halfHeight = Math.tan(camera.verticalFovRadians / 2);
  const halfWidth = halfHeight * camera.aspect;
  return {
    origin: camera.position,
    direction: normalize({
      x: forward.x + right.x * ndcX * halfWidth + up.x * ndcY * halfHeight,
      y: forward.y + right.y * ndcX * halfWidth + up.y * ndcY * halfHeight,
      z: forward.z + right.z * ndcX * halfWidth + up.z * ndcY * halfHeight,
    }),
  };
}

/** A ray through a pixel in a viewport of the given size. */
export function screenRay(
  camera: PickingCamera,
  pixelX: number,
  pixelY: number,
  width: number,
  height: number,
): Ray {
  const ndcX = (pixelX / Math.max(1, width)) * 2 - 1;
  const ndcY = 1 - (pixelY / Math.max(1, height)) * 2;
  return cameraRay(camera, ndcX, ndcY);
}

/** World-space radius matching a pixel radius at the camera's target distance. */
export function pickRadiusWorld(
  camera: PickingCamera,
  pixelRadius: number,
  viewportHeightPx: number,
): number {
  const distance = length(subtract(camera.target, camera.position));
  const worldPerPixel =
    (2 * distance * Math.tan(camera.verticalFovRadians / 2)) / Math.max(1, viewportHeightPx);
  return worldPerPixel * pixelRadius;
}

/** Perpendicular distance from a point to the ray, or infinity when the point is behind it. */
export function pointRayDistance(ray: Ray, point: Vec3): number {
  const offset = subtract(point, ray.origin);
  if (dot(offset, ray.direction) <= 0) return Number.POSITIVE_INFINITY;
  return length(cross(offset, ray.direction));
}

/** Index of the closest point under the ray, or null when none is within the radius. */
export function pickNearestPoint(
  ray: Ray,
  positions: ArrayLike<number>,
  maxDistance: number,
): number | null {
  let best: number | null = null;
  let bestDistance = maxDistance;
  let bestAlong = Number.POSITIVE_INFINITY;
  for (let index = 0; index * 3 + 2 < positions.length; index += 1) {
    const point: Vec3 = {
      x: positions[index * 3] ?? 0,
      y: positions[index * 3 + 1] ?? 0,
      z: positions[index * 3 + 2] ?? 0,
    };
    const offset = subtract(point, ray.origin);
    const along = dot(offset, ray.direction);
    if (along <= 0) continue;
    const distance = length(cross(offset, ray.direction));
    const closer = distance < bestDistance || (distance === bestDistance && along < bestAlong);
    if (distance <= maxDistance && (best === null || closer)) {
      best = index;
      bestDistance = distance;
      bestAlong = along;
    }
  }
  return best;
}

import { describe, expect, it } from "vitest";
import {
  cameraRay,
  type PickingCamera,
  pickNearestPoint,
  pickRadiusWorld,
  pointRayDistance,
  screenRay,
} from "../../src/atlas/picking";

const camera: PickingCamera = {
  position: { x: 0, y: 0, z: 10 },
  target: { x: 0, y: 0, z: 0 },
  up: { x: 0, y: 1, z: 0 },
  verticalFovRadians: Math.PI / 2,
  aspect: 1,
};

describe("cameraRay", () => {
  it("points forward through the centre of the view", () => {
    const ray = cameraRay(camera, 0, 0);
    expect(ray.origin).toEqual(camera.position);
    expect(ray.direction.x).toBeCloseTo(0);
    expect(ray.direction.y).toBeCloseTo(0);
    expect(ray.direction.z).toBeCloseTo(-1);
  });

  it("spreads to the edges by the field of view and aspect", () => {
    const right = cameraRay(camera, 1, 0);
    expect(right.direction.x).toBeCloseTo(Math.SQRT1_2);
    expect(right.direction.z).toBeCloseTo(-Math.SQRT1_2);

    const top = cameraRay(camera, 0, 1);
    expect(top.direction.y).toBeCloseTo(Math.SQRT1_2);
    expect(top.direction.z).toBeCloseTo(-Math.SQRT1_2);
  });
});

describe("screenRay", () => {
  it("turns a pixel into the same ray as its device coordinates", () => {
    const centre = screenRay(camera, 50, 50, 100, 100);
    expect(centre.direction.x).toBeCloseTo(0);
    expect(centre.direction.y).toBeCloseTo(0);
    expect(centre.direction.z).toBeCloseTo(-1);

    const topLeft = screenRay(camera, 0, 0, 100, 100);
    const component = 1 / Math.sqrt(3);
    expect(topLeft.direction.x).toBeCloseTo(-component);
    expect(topLeft.direction.y).toBeCloseTo(component);
    expect(topLeft.direction.z).toBeCloseTo(-component);
  });
});

describe("pointRayDistance", () => {
  it("measures perpendicular distance in front of the camera", () => {
    const ray = cameraRay(camera, 0, 0);
    expect(pointRayDistance(ray, { x: 3, y: 0, z: 5 })).toBeCloseTo(3);
  });

  it("ignores points behind the camera", () => {
    const ray = cameraRay(camera, 0, 0);
    expect(pointRayDistance(ray, { x: 0, y: 0, z: 20 })).toBe(Number.POSITIVE_INFINITY);
  });
});

describe("pickNearestPoint", () => {
  const ray = cameraRay(camera, 0, 0);

  it("returns the closest point inside the radius", () => {
    const positions = [4, 0, 5, 1, 0, 3, -2, 0, 6];
    expect(pickNearestPoint(ray, positions, 5)).toBe(1);
  });

  it("returns null when every point is outside the radius", () => {
    const positions = [3, 0, 5, -2, 0, 6];
    expect(pickNearestPoint(ray, positions, 1)).toBeNull();
  });

  it("returns null for a point behind the camera even with a large radius", () => {
    expect(pickNearestPoint(ray, [0, 0, 20], 100)).toBeNull();
  });

  it("prefers the nearer of two points on the same ray", () => {
    expect(pickNearestPoint(ray, [0, 0, 3, 0, 0, 8], 1)).toBe(1);
  });
});

describe("pickRadiusWorld", () => {
  it("turns a pixel radius into world units at the target distance", () => {
    expect(pickRadiusWorld(camera, 10, 100)).toBeCloseTo(2);
  });
});

import { describe, expect, it } from "vitest";
import {
  bestApproach,
  CAMERA_FLIGHT_MS,
  type CameraPose,
  createCameraFlight,
  focusPose,
} from "../../src/atlas/camera-flight";

const from: CameraPose = {
  position: { x: 0, y: 0, z: 0 },
  target: { x: 0, y: 0, z: 0 },
};
const to: CameraPose = {
  position: { x: 100, y: 40, z: -20 },
  target: { x: 50, y: 20, z: 10 },
};

describe("focusPose", () => {
  it("keeps the current viewing direction and moves to the focus distance", () => {
    const pose = focusPose({ x: 0, y: 0, z: 10 }, { x: 0, y: 0, z: 5 }, 2);
    expect(pose.target).toEqual({ x: 0, y: 0, z: 5 });
    expect(pose.position.x).toBeCloseTo(0);
    expect(pose.position.y).toBeCloseTo(0);
    expect(pose.position.z).toBeCloseTo(7);
  });

  it("falls back to the positive z axis when the camera sits on the point", () => {
    const point = { x: 3, y: 4, z: 5 };
    const pose = focusPose(point, point, 2);
    expect(pose.position.x).toBeCloseTo(3);
    expect(pose.position.y).toBeCloseTo(4);
    expect(pose.position.z).toBeCloseTo(7);
  });
});

describe("createCameraFlight", () => {
  it("runs for the requested duration and lands exactly on the end pose", () => {
    let now = 1000;
    const flight = createCameraFlight({
      from,
      to,
      durationMs: 400,
      now: () => now,
    });

    expect(flight.durationMs).toBe(400);
    expect(flight.done()).toBe(false);

    now = 1100;
    expect(flight.pose().position.x).toBe(6.25);

    now = 1200;
    expect(flight.pose().position.x).toBe(50);

    now = 1400;
    expect(flight.pose()).toEqual(to);
    expect(flight.done()).toBe(true);

    now = 2000;
    expect(flight.pose()).toEqual(to);
  });

  it("uses the default duration when none is given", () => {
    const flight = createCameraFlight({ from, to, now: () => 0 });
    expect(flight.durationMs).toBe(CAMERA_FLIGHT_MS);
  });

  it("cuts to the end pose when reduced motion is requested", () => {
    const flight = createCameraFlight({ from, to, reducedMotion: true, now: () => 0 });
    expect(flight.durationMs).toBe(0);
    expect(flight.done()).toBe(true);
    expect(flight.pose()).toEqual(to);
  });
});

describe("bestApproach", () => {
  const centre = { x: 0, y: 0, z: 0 };
  // Neighbours spread along x and y, with almost no depth: the best side to arrive from is z.
  const flat = [
    { x: 6, y: 0, z: 0.2 },
    { x: -6, y: 1, z: -0.2 },
    { x: 0, y: 6, z: 0.1 },
    { x: 1, y: -6, z: 0 },
  ];

  it("arrives face-on to a flat group of neighbours", () => {
    const approach = bestApproach(centre, flat, { x: 0, y: 0, z: 100 }, 50, { min: 10, max: 60 });
    expect(Math.abs(approach.direction.z)).toBeGreaterThan(0.9);
  });

  it("avoids looking along a line of neighbours", () => {
    const line = [6, 5, 4, 3].map((x) => ({ x, y: 0, z: 0 }));
    const approach = bestApproach(centre, line, { x: 100, y: 0, z: 0 }, 50, { min: 10, max: 60 });
    expect(Math.abs(approach.direction.x)).toBeLessThan(0.9);
  });

  it("keeps the distance inside the limits", () => {
    const far = [{ x: 500, y: 0, z: 0 }];
    expect(bestApproach(centre, far, { x: 0, y: 0, z: 1 }, 50, { min: 10, max: 60 }).distance).toBe(
      60,
    );
    expect(bestApproach(centre, [], { x: 0, y: 0, z: 1 }, 50, { min: 10, max: 60 }).distance).toBe(
      10,
    );
  });
});

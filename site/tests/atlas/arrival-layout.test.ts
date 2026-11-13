import { describe, expect, it } from "vitest";
import { type Area, gridLayout, lengthShares, radialLayout } from "../../src/atlas/arrival-layout";

const area: Area = { left: 0, top: 0, width: 1200, height: 700 };
const centre = { x: 600, y: 350 };
const cell = { width: 120, height: 130 };

describe("lengthShares", () => {
  it("puts the closest at 0 and the furthest at 1", () => {
    expect(lengthShares([0.97, 0.93, 0.92])).toEqual([0, expect.closeTo(0.8, 5), 1]);
  });

  it("gives equal scores equal shares", () => {
    const [a, b] = lengthShares([0.94, 0.94, 0.9]);
    expect(a).toBe(b);
  });

  it("sits level when every score is equal", () => {
    expect(lengthShares([0.9, 0.9])).toEqual([0.5, 0.5]);
  });
});

describe("radialLayout", () => {
  const slots = radialLayout(
    lengthShares([0.97, 0.96, 0.94, 0.94, 0.94, 0.93, 0.93, 0.92]),
    centre,
    area,
    110,
    cell,
  );

  it("keeps every item inside the area and clear of the hub", () => {
    for (const slot of slots) {
      expect(slot.x - cell.width / 2).toBeGreaterThanOrEqual(area.left - 0.5);
      expect(slot.x + cell.width / 2).toBeLessThanOrEqual(area.left + area.width + 0.5);
      expect(slot.y - cell.height / 2).toBeGreaterThanOrEqual(area.top - 0.5);
      expect(slot.y + cell.height / 2).toBeLessThanOrEqual(area.top + area.height + 0.5);
      expect(slot.radius).toBeGreaterThanOrEqual(110 + cell.height / 2 - 0.5);
    }
  });

  it("runs ranks clockwise from the top and never to the word's own thread", () => {
    const angles = slots.map((slot) => slot.angle);
    expect(angles).toEqual([...angles].sort((a, b) => a - b));
    expect(Math.min(...angles)).toBeGreaterThan(0);
    expect(Math.max(...angles)).toBeLessThan(360);
  });

  it("gives equal scores equal radii and a farther neighbour a longer thread", () => {
    const [, , third, fourth, fifth, , , last] = slots;
    expect(third?.radius).toBeCloseTo(fourth?.radius ?? 0);
    expect(fourth?.radius).toBeCloseTo(fifth?.radius ?? 0);
    expect(last?.radius).toBeGreaterThan(slots[0]?.radius ?? Number.POSITIVE_INFINITY);
  });
});

describe("gridLayout", () => {
  it("fills two rows of four, ranks left to right then down", () => {
    const points = gridLayout(
      8,
      { left: 0, top: 0, width: 360, height: 600 },
      4,
      { width: 70, height: 90 },
      200,
    );
    expect(points).toHaveLength(8);
    expect(points[0]?.x).toBeLessThan(points[3]?.x ?? 0);
    expect(points[4]?.y).toBeGreaterThan(points[0]?.y ?? 0);
    expect(points[4]?.x).toBe(points[0]?.x);
  });
});

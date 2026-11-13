import { describe, expect, it } from "vitest";
import { FARTHEST_SHARE, NEAREST_SHARE, threadShares } from "../../src/card/threads";

describe("threadShares", () => {
  it("puts the most similar neighbour nearest and the least similar farthest", () => {
    const shares = threadShares([0.97, 0.956, 0.941, 0.939, 0.938, 0.932, 0.93, 0.922]);
    expect(shares[0]).toBeCloseTo(NEAREST_SHARE);
    expect(shares[7]).toBeCloseTo(FARTHEST_SHARE);
  });

  it("orders lengths by similarity even when the odours differ in the third decimal", () => {
    const odours = [0.9, 0.93, 0.97, 0.92];
    const shares = threadShares(odours);
    const byOdour = odours
      .map((odour, index) => [odour, shares[index] ?? 0])
      .sort((a, b) => b[0] - a[0]);
    const lengths = byOdour.map(([, share]) => share);
    expect(lengths).toEqual([...lengths].sort((a, b) => a - b));
    expect(new Set(lengths).size).toBe(odours.length);
  });

  it("keeps ties at the nearest share instead of dividing by zero", () => {
    expect(threadShares([0.5, 0.5])).toEqual([NEAREST_SHARE, NEAREST_SHARE]);
  });
});

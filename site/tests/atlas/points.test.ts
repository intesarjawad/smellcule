import { beforeAll, describe, expect, it } from "vitest";
import { highlightPositions } from "../../src/atlas/points";
import type { Bundle } from "../../src/data/bundle";
import { loadFixtureBundle } from "../support/bundle-fixture";

let bundle: Bundle;

beforeAll(async () => {
  bundle = await loadFixtureBundle();
});

describe("highlightPositions", () => {
  it("takes the highlighted molecules' points in bundle order and skips unknown ids", () => {
    const ids = bundle.atlas.molecules.map((molecule) => molecule.id);
    const [first, second] = ids;
    if (first === undefined || second === undefined) throw new Error("fixture too small");
    const picked = highlightPositions(bundle, [second, "not-a-molecule", first]);
    expect([...picked]).toEqual([...bundle.positions.subarray(0, 6)]);
  });

  it("is empty when nothing is highlighted", () => {
    expect(highlightPositions(bundle, [])).toHaveLength(0);
  });
});

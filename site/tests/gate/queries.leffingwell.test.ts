import { describe, expect, it } from "vitest";
import { EVERYDAY_QUERIES } from "../queries";
import { familyMisses } from "../support/everyday-score";
import { loadGateBundle } from "../support/gate-bundle";

/** At least 85 percent of the 60 everyday queries must land in a family they name. */
const MIN_HITS = 51;

describe("everyday queries on the real bundle", () => {
  it("put a molecule from a named family first often enough", async () => {
    const misses = familyMisses(await loadGateBundle(), EVERYDAY_QUERIES);
    expect(
      EVERYDAY_QUERIES.length - misses.length,
      `missed: ${misses.join(", ")}`,
    ).toBeGreaterThanOrEqual(MIN_HITS);
  });
});

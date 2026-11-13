import { describe, it } from "vitest";
import { normalise } from "../../src/search/fuzzy";
import { EVERYDAY_QUERIES, HELD_OUT_QUERIES, THIRD_QUERIES } from "../queries";
import { familyMisses } from "../support/everyday-score";
import { loadGateBundle } from "../support/gate-bundle";

// Reports only, like the held-out list: a threshold here would invite entries written to the list.
describe("third everyday queries on the real bundle", () => {
  it("reports how many land in a family they name", async () => {
    const misses = new Set(familyMisses(await loadGateBundle(), THIRD_QUERIES));
    const earlier = new Set(
      [...EVERYDAY_QUERIES, ...HELD_OUT_QUERIES].map(({ query }) => normalise(query)),
    );
    const unseen = THIRD_QUERIES.filter(({ query }) => !earlier.has(normalise(query)));
    const unseenHits = unseen.filter(({ query }) => !misses.has(query)).length;
    process.stdout.write(
      `third queries: ${THIRD_QUERIES.length - misses.size} of ${THIRD_QUERIES.length}` +
        ` (${unseenHits} of ${unseen.length} not in the earlier lists)\n` +
        `missed: ${[...misses].join(", ")}\n`,
    );
  });
});

import { describe, it } from "vitest";
import { normalise } from "../../src/search/fuzzy";
import { FOURTH_QUERIES } from "../fourth-queries";
import { EVERYDAY_QUERIES, HELD_OUT_QUERIES, THIRD_QUERIES } from "../queries";
import { familyMisses } from "../support/everyday-score";
import { loadGateBundle } from "../support/gate-bundle";

// The only list the current word table never saw, so it alone measures how search generalises.
describe("fourth everyday queries on the real bundle", () => {
  it("reports how many land in a family they name", async () => {
    const misses = new Set(familyMisses(await loadGateBundle(), FOURTH_QUERIES));
    const earlier = new Set(
      [...EVERYDAY_QUERIES, ...HELD_OUT_QUERIES, ...THIRD_QUERIES].map(({ query }) =>
        normalise(query),
      ),
    );
    const unseen = FOURTH_QUERIES.filter(({ query }) => !earlier.has(normalise(query)));
    const unseenHits = unseen.filter(({ query }) => !misses.has(query)).length;
    process.stdout.write(
      `fourth queries: ${FOURTH_QUERIES.length - misses.size} of ${FOURTH_QUERIES.length}` +
        ` (${unseenHits} of ${unseen.length} not in the earlier lists)\n` +
        `missed: ${[...misses].join(", ")}\n`,
    );
  });
});

import { describe, it } from "vitest";
import { HELD_OUT_QUERIES } from "../queries";
import { familyMisses } from "../support/everyday-score";
import { loadGateBundle } from "../support/gate-bundle";

// Reports only: a threshold here would invite phrases written to the list.
describe("held-out everyday queries on the real bundle", () => {
  it("reports how many land in a family they name", async () => {
    const misses = familyMisses(await loadGateBundle(), HELD_OUT_QUERIES);
    process.stdout.write(
      `held-out queries: ${HELD_OUT_QUERIES.length - misses.length} of ${HELD_OUT_QUERIES.length}\n` +
        `missed: ${misses.join(", ")}\n`,
    );
  });
});

import { describe, expect, it } from "vitest";
import { DEMO_NAMES } from "../../src/synesthesia/demo";
import { deriveMapping, type Mapping, mappingDistance } from "../../src/synesthesia/mapping";
import { voicingOf } from "../../src/synesthesia/view";
import { loadGateBundle } from "../support/gate-bundle";

/** Below this two demo sounds differ, on average, by less than a quarter of a parameter's range. */
const MIN_DISTANCE = 0.25;

describe("demo molecule sounds on the real bundle", () => {
  it("keeps every pair of demo molecules audibly apart", async () => {
    const bundle = await loadGateBundle();
    const demoNames = DEMO_NAMES[bundle.atlas.catalogue];
    const sounds = new Map<string, Mapping>();
    for (const name of demoNames) {
      const molecule = bundle.atlas.molecules.find(
        (candidate) => candidate.name.toLowerCase() === name.toLowerCase(),
      );
      if (molecule === undefined) continue;
      const voicing = voicingOf(bundle, [molecule.id]);
      if (voicing !== null) sounds.set(name, deriveMapping(voicing.families, voicing.x));
    }
    expect(demoNames.filter((name) => !sounds.has(name))).toEqual([]);

    const tooClose: string[] = [];
    const entries = [...sounds];
    for (const [index, [name, mapping]] of entries.entries()) {
      for (const [otherName, other] of entries.slice(index + 1)) {
        const distance = mappingDistance(mapping, other);
        if (distance < MIN_DISTANCE)
          tooClose.push(`${name} / ${otherName}: ${distance.toFixed(3)}`);
      }
    }
    expect(tooClose).toEqual([]);
  });
});

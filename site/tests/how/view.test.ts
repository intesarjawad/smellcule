import { beforeAll, describe, expect, it } from "vitest";
import type { Atlas } from "../../src/data/validate";
import { LIMITS_TEXT } from "../../src/decompiler/view";
import {
  type HowSection,
  howSections,
  howStatGroups,
  PMP_2001_PRICE_USD,
  PMP_2001_SOURCE,
} from "../../src/how/view";
import { loadFixtureBundle } from "../support/bundle-fixture";

describe("howStatGroups", () => {
  it("prints every stat value as the bundle carries it", () => {
    const stats = {
      official_train: 2246,
      "official.mpnn.all_labels.auroc": 0.9058771592886975,
      "calibration.statistics.brier": 0.02331592184880318,
      retiredPuzzles: 0,
    };
    const groups = howStatGroups(stats);
    const printed = groups.flatMap((group) => group.stats);
    expect(printed).toHaveLength(4);
    for (const [key, value] of Object.entries(stats)) {
      expect(printed.find((stat) => stat.key === key)?.value).toBe(String(value));
    }
  });

  it("keeps the named groups in order and gathers the rest", () => {
    const groups = howStatGroups({ retiredPuzzles: 0, official_train: 2 });
    expect(groups.map((group) => group.heading)).toEqual([
      "Official Leffingwell split",
      "Other measurements",
    ]);
  });
});

describe("the PMP 2001 price", () => {
  it("is the recorded price with a dated source", () => {
    expect(PMP_2001_PRICE_USD).toBe(2775);
    expect(PMP_2001_SOURCE.url).toMatch(/^https:\/\//);
    expect(PMP_2001_SOURCE.fetched).toBe("2026-11-10");
  });
});

describe("howSections", () => {
  let leffingwell: Atlas;
  let keller: Atlas;

  beforeAll(async () => {
    leffingwell = (await loadFixtureBundle()).atlas;
    keller = (await loadFixtureBundle("keller")).atlas;
  });

  const text = (sections: readonly HowSection[]): string =>
    sections.flatMap((section) => section.lines.map((line) => line.text)).join("\n");

  it("follows the order the page promises", () => {
    expect(howSections(leffingwell).map((section) => section.heading)).toEqual([
      "Where the descriptors come from",
      "Measured and predicted",
      "What the split badges mean",
      "From a structure to probabilities",
      "Why the map is a projection",
      "What each view claims, and what it does not",
      "What this frees, and its limits",
      "Bend it",
    ]);
  });

  it("takes every count from the bundle", () => {
    const stats = leffingwell.stats;
    const page = text(howSections(leffingwell));
    expect(page).toContain(
      `${stats.leffingwell_molecules} molecules and ${stats.leffingwell_descriptors} descriptors`,
    );
    expect(page).toContain(
      `trained on ${stats.cluster_train} molecules, used ${stats.cluster_validation} others only to decide when to stop, and never saw ${stats.cluster_held_out}`,
    );
    expect(page).toContain(
      `a probability for each of the ${leffingwell.labels.length} descriptors`,
    );
    expect(page).toContain(`${leffingwell.molecules[0]?.neighbours.length} odour neighbours`);
    expect(page).toContain("below 0.30");
    expect(page).toContain(`PMP 2001 database is sold for ${PMP_2001_PRICE_USD} US dollars`);
  });

  it("quotes the map's trustworthiness only when the bundle carries it", () => {
    const stats = { ...leffingwell.stats, "map.trustworthiness": 0.9986, "map.neighbour_count": 8 };
    expect(text(howSections({ ...leffingwell, stats }))).toContain(
      "the map's trustworthiness at k = 8 is 0.999",
    );
    const { "map.trustworthiness": _, ...without } = stats;
    expect(text(howSections({ ...leffingwell, stats: without }))).not.toContain("trustworthiness");
  });

  it("names exactly the split badges the catalogue uses", () => {
    const badges = (atlas: Atlas) =>
      howSections(atlas)
        .find((section) => section.heading === "What the split badges mean")
        ?.lines.filter((line) => line.item === true)
        .map((line) => line.text);
    expect(badges(leffingwell)).toEqual([
      "Seen in training",
      "Validation: used to decide when training stopped, never trained on",
      "Held out: the model never saw this molecule",
    ]);
    expect(badges(keller)).toEqual([
      "Cross-validated: predicted by a model that never saw this molecule",
    ]);
  });

  it("describes the Keller data without the PMP 2001 section, the game or the decompiler", () => {
    const page = text(howSections(keller));
    expect(page).toContain(
      `${keller.stats.keller_molecules} molecules rated on ${keller.stats.keller_descriptors} descriptors`,
    );
    expect(page).not.toContain("PMP 2001");
    expect(page).not.toMatch(/game/);
    expect(page).not.toContain("decompiler");
  });

  it("states the decompiler's limits verbatim", () => {
    expect(text(howSections(leffingwell))).toContain(LIMITS_TEXT);
  });
});

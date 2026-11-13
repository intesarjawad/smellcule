import { describe, expect, it } from "vitest";
import type { Atlas } from "../../src/data/validate";
import type { ParsedNote } from "../../src/decompiler/parse-notes";
import { noteProfile, profileIds } from "../../src/decompiler/profile";

const NEIGHBOURS = Array.from({ length: 8 }, (_, index) => ({
  id: "1",
  odour: 0.5,
  structure: 1 - index / 10,
}));

function molecule(id: string, measured: number[]) {
  return {
    id,
    name: `Molecule ${id}`,
    cas: `000-00-${id}`,
    casCheckDigit: "passes" as const,
    formula: "C",
    split: "train" as const,
    nearestTrainSimilarity: null,
    measured,
    neighbours: NEIGHBOURS,
  };
}

const atlas: Atlas = {
  version: "test",
  exportedOn: "2026-01-01",
  catalogue: "leffingwell",
  model: { id: "test", licence: "MIT", revision: "1" },
  attribution: "Test",
  dataLicence: "CC-BY-NC",
  stats: { retiredPuzzles: 0 },
  labels: ["rose", "musk", "citrus", "green"],
  families: [
    { name: "floral", colour: "#aa0000", labels: ["rose", "musk"] },
    { name: "citrus", colour: "#00aa00", labels: ["citrus"] },
    { name: "green", colour: "#0000aa", labels: ["green"] },
  ],
  molecules: [molecule("1", [0]), molecule("2", [1])],
};

const predictions = new Uint8Array([255, 0, 0, 0, 0, 255, 255, 0]);

describe("noteProfile", () => {
  it("averages prediction rows and scores each family", () => {
    const profile = noteProfile({ atlas, predictions }, ["1", "2"]);
    expect(profile).not.toBeNull();
    expect(Array.from(profile?.mean ?? [])).toEqual([0.5, 0.5, 0.5, 0]);
    expect(profile?.families).toEqual([
      { name: "floral", colour: "#aa0000", score: 0.5 },
      { name: "citrus", colour: "#00aa00", score: 0.5 },
      { name: "green", colour: "#0000aa", score: 0 },
    ]);
  });

  it("skips duplicates and unknown ids", () => {
    const profile = noteProfile({ atlas, predictions }, ["2", "1", "2", "999"]);
    expect(profile?.ids).toEqual(["2", "1"]);
    expect(Array.from(profile?.mean ?? [])).toEqual([0.5, 0.5, 0.5, 0]);
  });

  it("returns null when no id resolves", () => {
    expect(noteProfile({ atlas, predictions }, ["999"])).toBeNull();
  });
});

describe("profileIds", () => {
  it("flattens notes in reading order without duplicates", () => {
    const notes: ParsedNote[] = [
      {
        tier: "top",
        name: "citrus",
        evidence: ["citrus"],
        molecules: [
          { molecule_id: "2", relation: "character", source_url: null },
          { molecule_id: "1", relation: "constituent", source_url: null },
        ],
      },
      {
        tier: "base",
        name: "musk",
        evidence: ["musk"],
        molecules: [{ molecule_id: "2", relation: "character", source_url: null }],
      },
    ];
    expect(profileIds(notes)).toEqual(["2", "1"]);
  });
});

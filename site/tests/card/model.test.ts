import { beforeAll, describe, expect, it } from "vitest";
import { cardAnnouncement, cardModel, moleculeIdentity } from "../../src/card/model";
import type { Bundle } from "../../src/data/bundle";
import { loadFixtureBundle } from "../support/bundle-fixture";

const CARD_FIELDS = [
  "id",
  "name",
  "cas",
  "formula",
  "split",
  "splitLabel",
  "structure",
  "measured",
  "predicted",
  "nearestTrainSimilarity",
  "neighbours",
  "licence",
  "attribution",
  "conditions",
] as const;

let bundle: Bundle;

beforeAll(async () => {
  bundle = await loadFixtureBundle();
});

describe("cardModel", () => {
  it.each([
    ["Ambrettolide", "train"],
    ["Limonene", "validation"],
    ["Cinnamyl alcohol", "held_out"],
  ])("has every card field for %s", (name, split) => {
    const molecule = bundle.atlas.molecules.find((item) => item.name === name);
    if (molecule === undefined) throw new Error(`${name} is missing from the fixture`);
    const model = cardModel(bundle, molecule.id);
    for (const field of CARD_FIELDS) expect(Object.hasOwn(model, field)).toBe(true);
    expect(model.split).toBe(split);
    expect(model.measured.length).toBeGreaterThan(0);
    expect(model.predicted.length).toBeGreaterThan(0);
    expect(model.neighbours).toHaveLength(8);
    expect(model.structure).toContain(`structures/${molecule.id}.svg`);
  });

  it("describes Limonene as validation with a nearest training molecule", () => {
    const molecule = bundle.atlas.molecules.find((item) => item.name === "Limonene");
    if (molecule === undefined) throw new Error("Limonene is missing from the fixture");
    const model = cardModel(bundle, molecule.id);
    expect(model.splitLabel).toBe("Validation");
    expect(model.measured).toEqual([
      "cabbage",
      "cocoa",
      "coumarinic",
      "musk",
      "onion",
      "orange",
      "pungent",
      "violet",
    ]);
    expect(model.nearestTrainSimilarity).toBeCloseTo(0.142857, 6);
    expect(model.predicted[0]?.label).toBe("fruity");
    expect(model.predicted[0]?.probability).toBeCloseTo(0.988235, 6);
  });

  it("states that the source records no concentration or solvent", () => {
    const molecule = bundle.atlas.molecules.find((item) => item.name === "Geosmin");
    if (molecule === undefined) throw new Error("Geosmin is missing from the fixture");
    expect(cardModel(bundle, molecule.id).conditions).toBe(
      "Source records no concentration or solvent",
    );
  });

  it("keeps an absent nearest training molecule as null", () => {
    const molecule = bundle.atlas.molecules.find((item) => item.name === "Ambrettolide");
    if (molecule === undefined) throw new Error("Ambrettolide is missing from the fixture");
    expect(cardModel(bundle, molecule.id).nearestTrainSimilarity).toBeNull();
  });

  it("resolves neighbour names and similarities", () => {
    const molecule = bundle.atlas.molecules.find((item) => item.name === "Geosmin");
    if (molecule === undefined) throw new Error("Geosmin is missing from the fixture");
    const [neighbour] = cardModel(bundle, molecule.id).neighbours;
    expect(neighbour?.id).toBe("1044");
    expect(neighbour?.name).toBe("Furfuryl mercaptan");
    expect(neighbour?.odour).toBeCloseTo(0.538165, 6);
  });

  it("rejects an unknown molecule", () => {
    expect(() => cardModel(bundle, "999999")).toThrow(/Unknown molecule/);
  });
});

describe("cardAnnouncement", () => {
  it("announces Geosmin's measured descriptor count", () => {
    const molecule = bundle.atlas.molecules.find((item) => item.name === "Geosmin");
    if (molecule === undefined) throw new Error("Geosmin is missing from the fixture");
    expect(cardAnnouncement(molecule)).toBe("Geosmin, 7 measured descriptors");
  });

  it("uses the singular for one descriptor", () => {
    expect(cardAnnouncement({ name: "Rose oxide", measured: [0] })).toBe(
      "Rose oxide, 1 measured descriptor",
    );
  });

  it("uses the plural for none", () => {
    expect(cardAnnouncement({ name: "Unknown", measured: [] })).toBe(
      "Unknown, 0 measured descriptors",
    );
  });
});

describe("moleculeIdentity", () => {
  it("joins the CAS number and formula", () => {
    expect(
      moleculeIdentity({
        cas: "121-33-5",
        casCheckDigit: "passes",
        formula: "C8H8O3",
      }),
    ).toBe("121-33-5 · C8H8O3");
  });

  it("marks a CAS number that fails its check digit as the source's", () => {
    expect(
      moleculeIdentity({
        cas: "102-22-70",
        casCheckDigit: "fails",
        formula: "C8H8O3",
      }),
    ).toBe("102-22-70 (as listed in the source) · C8H8O3");
  });

  it("says so when the source lists no CAS number", () => {
    const molecule = bundle.atlas.molecules.find(
      (item) => item.name === "Benzaldehyde ethyl methyl acetal",
    );
    if (molecule === undefined)
      throw new Error("the CAS-less molecule is missing from the fixture");
    const model = cardModel(bundle, molecule.id);
    expect(model.cas).toBeNull();
    expect(moleculeIdentity(model)).toBe(`CAS not listed · ${molecule.formula}`);
  });
});

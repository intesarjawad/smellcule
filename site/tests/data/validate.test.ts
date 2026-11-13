import { describe, expect, it } from "vitest";
import {
  BundleError,
  validateAtlas,
  validateNotes,
  validatePhrases,
  validateWords,
} from "../../src/data/validate";
import { fixtureJson } from "../support/bundle-fixture";

function atlas(): Record<string, unknown> {
  return structuredClone(fixtureJson("fixture-data/atlas.json")) as Record<string, unknown>;
}

function molecules(document: Record<string, unknown>): Record<string, unknown>[] {
  return document.molecules as Record<string, unknown>[];
}

function firstMolecule(document: Record<string, unknown>): Record<string, unknown> {
  const [molecule] = molecules(document);
  if (molecule === undefined) throw new Error("fixture has no molecules");
  return molecule;
}

describe("validateAtlas", () => {
  it("accepts the fixture atlas", () => {
    const value = validateAtlas(atlas());
    expect(value.catalogue).toBe("leffingwell");
    expect(value.labels).toHaveLength(113);
    expect(value.molecules).toHaveLength(11);
    expect(value.molecules[0]?.name).toBe("Ambrettolide");
  });

  it("requires the catalogue's descriptor count", () => {
    const document = atlas();
    document.labels = (document.labels as string[]).slice(0, 112);
    expect(() => validateAtlas(document)).toThrow(
      /leffingwell requires 113 descriptors, found 112/,
    );
  });

  it("rejects cross-validated splits for Leffingwell", () => {
    const document = atlas();
    firstMolecule(document).split = "cross_validated";
    expect(() => validateAtlas(document)).toThrow(/must not carry cross_validated/);
  });

  it("rejects duplicate molecule ids", () => {
    const document = atlas();
    const [first, second] = molecules(document);
    if (first === undefined || second === undefined) throw new Error("fixture is too small");
    second.id = first.id;
    expect(() => validateAtlas(document)).toThrow(/duplicate id/);
  });

  it("rejects a measured descriptor outside the vocabulary", () => {
    const document = atlas();
    firstMolecule(document).measured = [113];
    expect(() => validateAtlas(document)).toThrow(/descriptor index is out of range/);
  });

  it("accepts a molecule whose source lists no CAS number", () => {
    const document = atlas();
    firstMolecule(document).cas = null;
    firstMolecule(document).casCheckDigit = "unlisted";
    expect(validateAtlas(document).molecules[0]?.cas).toBeNull();
  });

  it("keeps a CAS number that fails its check digit, flagged", () => {
    const document = atlas();
    firstMolecule(document).cas = "102-22-70";
    firstMolecule(document).casCheckDigit = "fails";
    const molecule = validateAtlas(document).molecules[0];
    expect([molecule?.cas, molecule?.casCheckDigit]).toEqual(["102-22-70", "fails"]);
  });

  it("marks the check digit unlisted exactly when no CAS number is listed", () => {
    const listed = atlas();
    firstMolecule(listed).casCheckDigit = "unlisted";
    expect(() => validateAtlas(listed)).toThrow(/molecules\[0\]\.casCheckDigit/);
    const unlisted = atlas();
    firstMolecule(unlisted).cas = null;
    expect(() => validateAtlas(unlisted)).toThrow(/molecules\[0\]\.casCheckDigit/);
  });

  it("rejects an empty CAS number", () => {
    const document = atlas();
    firstMolecule(document).cas = "";
    expect(() => validateAtlas(document)).toThrow(
      /molecules\[0\]\.cas: expected a non-empty string/,
    );
  });

  it("requires exactly eight neighbours", () => {
    const document = atlas();
    firstMolecule(document).neighbours = [];
    expect(() => validateAtlas(document)).toThrow(/exactly 8 neighbours/);
  });

  it("rejects a family colour that is not a six-digit hex value", () => {
    const document = atlas();
    const families = document.families as Record<string, unknown>[];
    const family = families[0];
    if (family === undefined) throw new Error("fixture has no families");
    family.colour = "#fff";
    expect(() => validateAtlas(document)).toThrow(/six-digit hex colour/);
  });

  it("rejects a date that is not a calendar day", () => {
    const document = atlas();
    document.exportedOn = "2026-02-30";
    expect(() => validateAtlas(document)).toThrow(/calendar date/);
  });

  it("accepts the Keller fixture atlas", () => {
    const value = validateAtlas(fixtureJson("keller-fixture-data/atlas.json"));
    expect(value.catalogue).toBe("keller");
    expect(value.labels).toHaveLength(20);
    expect(value.molecules).toHaveLength(40);
    expect(value.molecules.every((molecule) => molecule.split === "cross_validated")).toBe(true);
  });

  it("rejects a 20-label bundle marked leffingwell", () => {
    const document = structuredClone(fixtureJson("keller-fixture-data/atlas.json")) as Record<
      string,
      unknown
    >;
    document.catalogue = "leffingwell";
    expect(() => validateAtlas(document)).toThrow(/leffingwell requires 113 descriptors, found 20/);
  });

  it("requires the retired puzzle count", () => {
    const document = atlas();
    document.stats = {};
    expect(() => validateAtlas(document)).toThrow(/missing retiredPuzzles/);
  });

  it("reports a bundle reason", () => {
    const error = new BundleError("predictions.bin: truncated.");
    expect(error.name).toBe("BundleError");
    expect(error.reason).toBe("predictions.bin: truncated.");
  });
});

describe("content validation", () => {
  it("accepts the fixture notes and phrases", () => {
    const notes = validateNotes(fixtureJson("fixture-data/notes.json"));
    const phrases = validatePhrases(fixtureJson("fixture-data/phrases.json"));
    expect(notes.notes).toHaveLength(9);
    expect(phrases).toHaveLength(81);
  });

  it("rejects a non-https source URL", () => {
    const document = structuredClone(fixtureJson("fixture-data/phrases.json")) as Record<
      string,
      unknown
    >[];
    const phrase = document[0];
    if (phrase === undefined) throw new Error("fixture has no phrases");
    phrase.source_url = "http://example.com/source";
    expect(() => validatePhrases(document)).toThrow(/https URL or null/);
  });

  it("accepts the fixture words and rejects a word mapped to an unknown descriptor", () => {
    const labels = (fixtureJson("fixture-data/atlas.json") as { labels: string[] }).labels;
    const document = fixtureJson("fixture-data/words.json");
    expect(validateWords(document, labels).words.toast).toEqual(["bread", "roasted"]);
    const broken = structuredClone(document) as { words: Record<string, string[]> };
    broken.words.pool = ["chlorine"];
    expect(() => validateWords(broken, labels)).toThrow(/'chlorine' is not a descriptor/);
  });
});

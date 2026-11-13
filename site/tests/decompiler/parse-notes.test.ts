import { describe, expect, it } from "vitest";
import type { Note } from "../../src/data/validate";
import { parseNotes } from "../../src/decompiler/parse-notes";

function note(name: string, aliases: string[] = []): Note {
  return {
    name,
    aliases,
    evidence: [name],
    molecules: [{ molecule_id: name, relation: "character", source_url: null }],
  };
}

const NOTES: readonly Note[] = [
  note("bergamot"),
  note("lavender"),
  note("rose"),
  note("clove"),
  note("cedar"),
  note("musk", ["white musk"]),
  note("vanilla"),
  note("jasmine"),
  note("patchouli"),
  note("smoke", ["birch tar"]),
  note("coffee"),
  note("orange", ["sweet orange", "mandarin"]),
];

describe("parseNotes", () => {
  it("splits on newlines, commas, semicolons and slashes", () => {
    const parsed = parseNotes("bergamot\nrose, jasmine; vanilla/coffee", NOTES);
    expect(parsed.map((item) => item.name)).toEqual([
      "bergamot",
      "rose",
      "jasmine",
      "vanilla",
      "coffee",
    ]);
  });

  it("recognises every tier label, including its synonyms", () => {
    const parsed = parseNotes(
      "Top: bergamot\nHead: lavender\nHeart: rose\nMiddle: clove\nBase: cedar\nBottom: musk",
      NOTES,
    );
    expect(parsed.map((item) => item.tier)).toEqual([
      "top",
      "top",
      "heart",
      "heart",
      "base",
      "base",
    ]);
  });

  it("keeps a tier until the next label", () => {
    const parsed = parseNotes("Top: bergamot, lavender\nBase: musk, vanilla", NOTES);
    expect(parsed.map((item) => [item.tier, item.name])).toEqual([
      ["top", "bergamot"],
      ["top", "lavender"],
      ["base", "musk"],
      ["base", "vanilla"],
    ]);
  });

  it("lowercases and strips notes, accord, absolute and essential oil", () => {
    const parsed = parseNotes(
      "Bergamot Notes.\nRose Absolute\nSmoke Accord\nEssential Oil of Vanilla",
      NOTES,
    );
    expect(parsed.map((item) => item.name)).toEqual(["bergamot", "rose", "smoke", "vanilla"]);
  });

  it("resolves aliases as well as names", () => {
    const parsed = parseNotes("white musk, sweet orange, mandarin, birch tar", NOTES);
    expect(parsed.map((item) => item.name)).toEqual(["musk", "orange", "orange", "smoke"]);
  });

  it("accepts a tier label without a following note", () => {
    const parsed = parseNotes("Top notes: bergamot\nBase: vanilla", NOTES);
    expect(parsed.map((item) => [item.tier, item.name])).toEqual([
      ["top", "bergamot"],
      ["base", "vanilla"],
    ]);
  });

  it("drops unknown notes instead of guessing", () => {
    const parsed = parseNotes("bergamot, unicorn, rose", NOTES);
    expect(parsed.map((item) => item.name)).toEqual(["bergamot", "rose"]);
  });

  it("puts an unlabelled list in the heart", () => {
    expect(parseNotes("rose", NOTES)[0]?.tier).toBe("heart");
  });

  it("returns nothing for empty or punctuation-only input", () => {
    expect(parseNotes("", NOTES)).toEqual([]);
    expect(parseNotes(" , ; / ", NOTES)).toEqual([]);
  });

  it("accepts the notes document as the bundle stores it", () => {
    expect(parseNotes("rose", { notes: NOTES, archetypes: [] }).map((item) => item.name)).toEqual([
      "rose",
    ]);
  });

  it("keeps the molecule links with their relation text", () => {
    expect(parseNotes("rose", NOTES)[0]?.molecules).toEqual([
      { molecule_id: "rose", relation: "character", source_url: null },
    ]);
  });

  it("parses the twelve common note formats", () => {
    const formats = [
      "bergamot",
      "Bergamot",
      "bergamot.",
      "bergamot notes",
      "top notes: bergamot",
      "Top: bergamot",
      "HEAD: bergamot",
      "bergamot, lavender",
      "bergamot; lavender",
      "bergamot / lavender",
      "bergamot\nlavender",
      "essential oil of bergamot",
    ];
    for (const text of formats) {
      expect(parseNotes(text, NOTES).map((item) => item.name)[0]).toBe("bergamot");
    }
  });
});

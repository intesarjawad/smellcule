import { describe, expect, it } from "vitest";
import type { Note } from "../../src/data/validate";
import { parseNotes, unrecognisedNotes } from "../../src/decompiler/parse-notes";
import { profileIds } from "../../src/decompiler/profile";
import {
  archetypeText,
  atlasIdsHref,
  LIMITS_TEXT,
  linkedMolecules,
  mixtureHref,
  profileBars,
  tierNotes,
} from "../../src/decompiler/view";

function note(name: string, id: string, evidence: readonly string[] = [name]): Note {
  return {
    name,
    aliases: [],
    evidence,
    molecules: [{ molecule_id: id, relation: "character", source_url: null }],
  };
}

const NOTES: readonly Note[] = [
  note("bergamot", "1557", ["citrus", "orange"]),
  note("lavender", "101"),
  note("rose", "2560"),
  note("clove", "102"),
  note("cedar", "103"),
  note("musk", "133"),
  note("vanilla", "2794"),
];

const CATALOGUE = new Map([
  ["1557", { name: "Limonene", measured: ["citrus", "fresh", "orange", "sweet"] }],
  ["2560", { name: "Rose oxide", measured: ["floral", "green", "rose"] }],
]);

const FOUGERE = archetypeText(
  ["bergamot", "lavender"],
  ["rose", "clove"],
  ["cedar", "musk", "vanilla"],
);

describe("archetypeText", () => {
  it("writes a three-tier note list the parser reads back", () => {
    expect(FOUGERE).toBe("top: bergamot, lavender\nheart: rose, clove\nbase: cedar, musk, vanilla");
    expect(parseNotes(FOUGERE, NOTES).map((item) => item.name)).toEqual([
      "bergamot",
      "lavender",
      "rose",
      "clove",
      "cedar",
      "musk",
      "vanilla",
    ]);
  });
});

describe("tierNotes", () => {
  it("keeps every fougère note in its tier and the fixed column order", () => {
    const tiers = tierNotes(parseNotes(FOUGERE, NOTES));
    expect(tiers.map((tier) => tier.label)).toEqual(["Top notes", "Heart notes", "Base notes"]);
    expect(tiers.map((tier) => tier.notes.map((item) => item.name))).toEqual([
      ["bergamot", "lavender"],
      ["rose", "clove"],
      ["cedar", "musk", "vanilla"],
    ]);
  });
});

describe("linkedMolecules", () => {
  it("names each molecule, links its card and says which measured descriptors justify it", () => {
    const [bergamot] = parseNotes(FOUGERE, NOTES);
    if (bergamot === undefined) throw new Error("fougère has no top notes");
    expect(linkedMolecules(bergamot, CATALOGUE)).toEqual([
      {
        id: "1557",
        name: "Limonene",
        href: "#/molecule/1557",
        relation: "smells citrus, orange in the catalogue",
        sourceUrl: null,
      },
    ]);
  });

  it("keeps a constituent's source and says it was found in the note", () => {
    expect(
      linkedMolecules(
        {
          tier: "heart",
          name: "rose",
          evidence: ["rose"],
          molecules: [
            {
              molecule_id: "2560",
              relation: "constituent",
              source_url: "https://example.org/rose",
            },
          ],
        },
        CATALOGUE,
      ),
    ).toEqual([
      {
        id: "2560",
        name: "Rose oxide",
        href: "#/molecule/2560",
        relation: "found in rose",
        sourceUrl: "https://example.org/rose",
      },
    ]);
  });
});

describe("unrecognisedNotes", () => {
  it("lists the notes the table does not know, in the order written", () => {
    expect(
      unrecognisedNotes("top: bergamot, pink pepper\nheart: Rose / tonka bean absolute", NOTES),
    ).toEqual(["pink pepper", "tonka bean"]);
  });

  it("is empty when every note resolves", () => {
    expect(unrecognisedNotes(FOUGERE, NOTES)).toEqual([]);
  });
});

describe("profileBars", () => {
  it("prints every family score as text with the bar width it fills", () => {
    expect(
      profileBars([
        { name: "floral", colour: "#aa0000", score: 0.5 },
        { name: "citrus", colour: "#00aa00", score: 0 },
      ]),
    ).toEqual([
      { name: "floral", colour: "#aa0000", text: "0.500", percent: 50 },
      { name: "citrus", colour: "#00aa00", text: "0.000", percent: 0 },
    ]);
  });
});

describe("mixtureHref", () => {
  it("opens the fougère molecules in the sound view", () => {
    const ids = profileIds(parseNotes(FOUGERE, NOTES));
    expect(mixtureHref(ids)).toBe("#/synesthesia?mix=1557,101,2560,102,103,133,2794");
    expect(atlasIdsHref(ids)).toBe("#/atlas?ids=1557,101,2560,102,103,133,2794");
  });
});

describe("LIMITS_TEXT", () => {
  it("states the limits of a note list verbatim", () => {
    expect(LIMITS_TEXT).toBe(
      "Perfume formulas are trade secrets and note lists are descriptions, not ingredient lists. " +
        "This shows catalogued molecules linked to each note. It does not tell you what is in this perfume.",
    );
  });
});

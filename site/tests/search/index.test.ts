import { beforeAll, describe, expect, it } from "vitest";
import {
  buildSearchIndex,
  EMPTY_SUGGESTIONS,
  type SearchIndex,
  search,
  searchSuggestions,
} from "../../src/search/index";
import { loadFixtureBundle } from "../support/bundle-fixture";

let index: SearchIndex;

beforeAll(async () => {
  const bundle = await loadFixtureBundle();
  const earthy = bundle.atlas.labels.indexOf("earthy");
  const molecules = bundle.atlas.molecules.map((molecule) => ({
    ...molecule,
    measured:
      molecule.id === "1066" ? [earthy] : molecule.measured.filter((label) => label !== earthy),
  }));
  index = buildSearchIndex({
    ...bundle,
    atlas: { ...bundle.atlas, molecules },
  });
});

function first(query: string) {
  const [hit] = search(index, query);
  if (hit === undefined) throw new Error(`no result for ${query}`);
  return hit;
}

describe("search match types", () => {
  it("finds an exact molecule name", () => {
    const hit = first("Geosmin");
    expect(hit.kind).toBe("molecule");
    expect(hit.match).toBe("exact");
    expect(hit.moleculeId).toBe("1066");
  });

  it("finds a molecule by its CAS number", () => {
    const hit = first("121-33-5");
    expect(hit.label).toBe("Vanillin");
    expect(hit.match).toBe("exact");
  });

  it("finds a molecule the source lists without a CAS number", () => {
    const hit = first("Benzaldehyde ethyl methyl acetal");
    expect(hit.match).toBe("exact");
    expect(hit.detail).toMatch(/^CAS not listed · C/);
  });

  it("finds a prefix", () => {
    expect(first("geos").match).toBe("prefix");
  });

  it("falls back to all words in any order", () => {
    const hit = first("acetate benzyl");
    expect(hit.label).toBe("Benzyl acetate");
    expect(hit.match).toBe("word");
  });

  it("finds a typo within the edit-distance threshold", () => {
    const hit = first("geosmn");
    expect(hit.label).toBe("Geosmin");
    expect(hit.match).toBe("fuzzy");
  });

  it("finds a measured or predicted descriptor", () => {
    const hit = first("earthy");
    expect(hit.kind).toBe("molecule");
    expect(hit.label).toBe("Geosmin");
    expect(hit.badge).toBe("Earthy");
    expect(hit.match).toBe("descriptor");
  });

  it("finds a note through its alias", () => {
    const hit = first("white musk");
    expect(hit.kind).toBe("note");
    expect(hit.label).toBe("Musk");
    expect(hit.moleculeId).toBe("133");
  });
});

describe("search phrases", () => {
  it("turns a sentence into the phrase and its exemplar", () => {
    const hit = first("smells like rain");
    expect(hit.kind).toBe("phrase");
    expect(hit.label).toBe("Rain");
    expect(hit.badge).toBe("Rain");
    expect(hit.moleculeId).toBe("1066");
  });

  it("matches an alias", () => {
    expect(first("petrichor").label).toBe("Rain");
    expect(first("after rain").label).toBe("Rain");
  });

  it("limits the result count", () => {
    expect(search(index, "sweet", 3)).toHaveLength(3);
  });
});

describe("empty and no-result searches", () => {
  it("returns nothing for a blank query", () => {
    expect(search(index, "   ")).toEqual([]);
  });

  it("returns nothing for an unrelated query", () => {
    expect(search(index, "zzzz")).toEqual([]);
  });

  it("offers suggestions that all resolve", () => {
    for (const suggestion of EMPTY_SUGGESTIONS) {
      expect(search(index, suggestion).length).toBeGreaterThan(0);
    }
  });

  it("offers molecule names when the catalogue publishes no phrases", async () => {
    const keller = buildSearchIndex(await loadFixtureBundle("keller"));
    const suggestions = searchSuggestions(keller.phrases, "keller");
    expect(suggestions).toEqual(["Vanillin", "Eugenol", "Guaiacol"]);
    for (const suggestion of suggestions) {
      expect(search(keller, suggestion).length).toBeGreaterThan(0);
    }
  });
});

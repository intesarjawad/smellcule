import { beforeAll, describe, expect, it } from "vitest";
import { normalise } from "../../src/search/fuzzy";
import { buildSearchIndex, type SearchIndex, search } from "../../src/search/index";
import { EVERYDAY_QUERIES, HELD_OUT_QUERIES, QUERY_CASES, THIRD_QUERIES } from "../queries";
import { loadFixtureBundle } from "../support/bundle-fixture";

let index: SearchIndex;
let families: ReadonlySet<string>;

beforeAll(async () => {
  const bundle = await loadFixtureBundle();
  // A controlled synthetic association exercises descriptor matching.
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
  families = new Set(bundle.atlas.families.map((family) => family.name));
});

describe("query gate", () => {
  it.each(QUERY_CASES)("$query lands on $label", (item) => {
    const [hit] = search(index, item.query);
    expect(hit).toBeDefined();
    expect(hit?.kind).toBe(item.kind);
    expect(hit?.label).toBe(item.label);
    if (item.moleculeId !== undefined) expect(hit?.moleculeId).toBe(item.moleculeId);
    if (item.badge !== undefined) expect(hit?.badge).toBe(item.badge);
  });
});

describe("everyday queries", () => {
  it("holds sixty distinct queries", () => {
    expect(EVERYDAY_QUERIES).toHaveLength(60);
    expect(new Set(EVERYDAY_QUERIES.map(({ query }) => normalise(query))).size).toBe(60);
  });

  it.each(EVERYDAY_QUERIES)("$query names families the bundle defines", ({ families: named }) => {
    expect(named.length).toBeGreaterThan(0);
    expect(named.filter((family) => !families.has(family))).toEqual([]);
  });
});

describe("held-out everyday queries", () => {
  it("holds sixty distinct queries the first list does not contain", () => {
    const first = new Set(EVERYDAY_QUERIES.map(({ query }) => normalise(query)));
    const held = HELD_OUT_QUERIES.map(({ query }) => normalise(query));
    expect(new Set(held).size).toBe(60);
    expect(held.filter((query) => first.has(query))).toEqual([]);
  });

  it.each(HELD_OUT_QUERIES)("$query names families the bundle defines", ({ families: named }) => {
    expect(named.length).toBeGreaterThan(0);
    expect(named.filter((family) => !families.has(family))).toEqual([]);
  });
});

describe("third everyday queries", () => {
  it("holds sixty distinct queries", () => {
    expect(new Set(THIRD_QUERIES.map(({ query }) => normalise(query))).size).toBe(60);
  });

  it.each(THIRD_QUERIES)("$query names families the bundle defines", ({ families: named }) => {
    expect(named.length).toBeGreaterThan(0);
    expect(named.filter((family) => !families.has(family))).toEqual([]);
  });
});

import { beforeAll, describe, expect, it } from "vitest";
import type { Bundle } from "../../src/data/bundle";
import {
  buildSearchIndex,
  type SearchIndex,
  search,
  searchSuggestions,
} from "../../src/search/index";
import { loadFixtureBundle } from "../support/bundle-fixture";

let bundle: Bundle;
let index: SearchIndex;

beforeAll(async () => {
  bundle = await loadFixtureBundle();
  index = buildSearchIndex(bundle);
});

describe("phrase and word ranking", () => {
  it("puts the phrase exemplar first among molecule hits with a known-example badge", () => {
    const hits = search(index, "rain");
    expect(hits[0]?.kind).toBe("phrase");
    const exemplar = hits.find((hit) => hit.knownExample === true);
    expect(exemplar?.label).toBe("Geosmin");
    expect(exemplar?.moleculeId).toBe("1066");
  });

  it("names the known example under the phrase and lists it as the first molecule", () => {
    const evidence = Object.keys(
      bundle.phrases.find((phrase) => phrase.name === "rain")?.weights ?? {},
    );
    const hits = search(withMeasured({ "Patchouli alcohol": evidence, Geosmin: evidence }), "rain");
    expect(hits[0]?.detail).toBe("Known example: Geosmin");
    expect(hits[1]?.label).toBe("Geosmin");
    expect(hits[1]?.knownExample).toBe(true);
    expect(hits[2]?.label).toBe("Patchouli alcohol");
  });

  it("says when a phrase has no known example", () => {
    expect(search(index, "candy")[0]?.detail).toBe("No known example molecule");
  });

  it("ranks molecules by how much of the phrase's weight their measured descriptors cover", () => {
    // Candy weighs fruity 1, sweet 1, berry 0.5: Benzyl acetate covers fruity and sweet among
    // six descriptors, Ambrettolide only fruity, so a cosine would rank Ambrettolide first.
    const hits = search(
      withMeasured({
        Ambrettolide: ["fruity"],
        "Benzyl acetate": ["floral", "fruity", "green", "jasmine", "rose", "sweet"],
      }),
      "candy",
    );
    const molecules = hits.filter((hit) => hit.kind === "molecule").map((hit) => hit.label);
    expect(molecules.indexOf("Benzyl acetate")).toBeLessThan(molecules.indexOf("Ambrettolide"));
  });

  it("lets the last word, the head noun, outweigh the words before it", () => {
    const hits = search(
      withMeasured({ Ambrettolide: ["fresh"], Vanillin: ["bread"] }),
      "fresh bread",
    );
    expect(hits[0]?.label).toBe("Vanillin");
  });

  it("sums the weights of every word that names a descriptor", () => {
    // Handcrafted synthetic rows distinguish one matched word from two.
    const hits = search(
      withMeasured({
        "Benzyl acetate": ["smoky", "vanilla"],
        Ambrettolide: ["vanilla"],
      }),
      "smoked vanilla",
    );
    expect(hits[0]?.match).toBe("fuzzy");
    expect(hits[0]?.label).toBe("Benzyl acetate");
    expect(hits[1]?.label).toBe("Ambrettolide");
  });

  it("reads an everyday word through the measured descriptor it names", () => {
    expect(search(withMeasured({ Ambrettolide: ["orange"] }), "tangerines")[0]?.label).toBe(
      "Ambrettolide",
    );
    expect(search(withMeasured({ "Benzyl acetate": ["woody"] }), "cedar chest")[0]?.label).toBe(
      "Benzyl acetate",
    );
  });

  it("reads a qualifier only when no other word names a descriptor", () => {
    const fresh = withMeasured({ Ambrettolide: ["fresh"], Vanillin: ["bread"] });
    expect(search(fresh, "fresh bread")[0]?.label).toBe("Vanillin");
    expect(search(fresh, "fresh air")[0]?.label).toBe("Ambrettolide");
  });

  it("lists a spelling correction after everything matched as typed", () => {
    // "smoky" is a descriptor as typed and one edit from the smoke note.
    const hits = search(index, "smoky");
    expect(hits.findIndex((hit) => hit.kind === "molecule")).toBeLessThan(hits.length - 1);
    expect(hits.at(-1)).toMatchObject({ kind: "note", label: "Smoke", match: "fuzzy" });
  });

  it("offers the three known smells in order", () => {
    expect(searchSuggestions(index.phrases)).toEqual(["rain", "coffee shop", "campfire"]);
  });
});

/** The fixture with controlled synthetic descriptor assignments, to isolate one ranking rule. */
function withMeasured(measured: Readonly<Record<string, readonly string[]>>): SearchIndex {
  const position = new Map(bundle.atlas.labels.map((label, index) => [label, index]));
  const molecules = bundle.atlas.molecules.map((molecule) => {
    const labels = measured[molecule.name];
    return {
      ...molecule,
      measured: (labels ?? []).map((label) => position.get(label) ?? -1),
    };
  });
  return buildSearchIndex({ ...bundle, atlas: { ...bundle.atlas, molecules } });
}

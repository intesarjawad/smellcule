import { describe, expect, it } from "vitest";
import {
  closestMatch,
  editDistance,
  fuzzyThreshold,
  matchType,
  normalise,
  normalisedEditDistance,
  typoMatch,
  words,
} from "../../src/search/fuzzy";

describe("normalise", () => {
  it("lowercases, strips accents and punctuation", () => {
    expect(normalise("  Café, Noir! ")).toBe("cafe noir");
  });

  it("splits words after normalising", () => {
    expect(words("Benzyl-acetate")).toEqual(["benzyl", "acetate"]);
    expect(words("   ")).toEqual([]);
  });
});

describe("editDistance", () => {
  it("counts the usual edits", () => {
    expect(editDistance("kitten", "sitting")).toBe(3);
    expect(editDistance("rain", "rain")).toBe(0);
    expect(editDistance("", "rain")).toBe(4);
    expect(editDistance("rain", "")).toBe(4);
  });

  it("counts a transposition as two edits", () => {
    expect(editDistance("rain", "rani")).toBe(2);
  });
});

describe("fuzzyThreshold", () => {
  it("allows no typo in short words and more in long words", () => {
    expect(fuzzyThreshold("cat")).toBe(0);
    expect(fuzzyThreshold("rain")).toBe(1);
    expect(fuzzyThreshold("orange")).toBe(1);
    expect(fuzzyThreshold("geosmin")).toBe(2);
  });
});

describe("matchType", () => {
  it("matches exactly, ignoring case", () => {
    expect(matchType("Geosmin", "geosmin")).toBe("exact");
  });

  it("matches a prefix", () => {
    expect(matchType("geo", "Geosmin")).toBe("prefix");
  });

  it("matches every word in any order", () => {
    expect(matchType("acetate benzyl", "Benzyl acetate")).toBe("word");
  });

  it("matches a typo inside the threshold", () => {
    expect(matchType("geosmn", "Geosmin")).toBe("fuzzy");
  });

  it("rejects a typo outside the threshold", () => {
    expect(matchType("rani", "rain")).toBeNull();
    expect(matchType("cad", "cat")).toBeNull();
  });

  it("rejects an unrelated word", () => {
    expect(matchType("vanilla", "Geosmin")).toBeNull();
  });

  it("corrects a typo inside a word of a longer name", () => {
    expect(matchType("rose oxyde", "Rose oxide")).toBe("fuzzy");
  });

  it("never swaps one word for a differently spelled one", () => {
    expect(matchType("fish market", "spice market")).toBeNull();
  });

  it("never lets a modifier carry the match when the head noun differs", () => {
    expect(matchType("beer", "Sucrose, Cane sugar, Beet sugar")).toBeNull();
  });
});

describe("typoMatch", () => {
  it("needs every query word to be a typo of a candidate word", () => {
    expect(typoMatch("geosmn", "Geosmin")).toBe(true);
    expect(typoMatch("fish market", "spice market")).toBe(false);
  });

  it("needs the head nouns, the last words, to agree", () => {
    expect(typoMatch("beer", "Beet sugar")).toBe(false);
    expect(typoMatch("beet sugr", "Beet sugar")).toBe(true);
  });
});

describe("normalisedEditDistance", () => {
  it("divides the edit count by the longer word", () => {
    expect(normalisedEditDistance("geosmn", "geosmin")).toBeCloseTo(1 / 7, 10);
    expect(normalisedEditDistance("rain", "rain")).toBe(0);
  });
});

describe("closestMatch", () => {
  it("accepts the nearest candidate within 0.34", () => {
    expect(closestMatch("geosmn", ["musk", "geosmin"])).toEqual({
      candidate: "geosmin",
      distance: 1 / 7,
    });
  });

  it("rejects a candidate beyond the threshold", () => {
    expect(closestMatch("zzzz", ["geosmin", "patchouli"])).toBeNull();
  });

  it("rejects a near spelling that swaps a word", () => {
    expect(closestMatch("fish market", ["spice market"])).toBeNull();
  });
});

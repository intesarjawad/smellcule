import { beforeAll, describe, expect, it } from "vitest";
import { NO_WORDS } from "../../src/data/validate";
import { buildSearchIndex, explainMiss, type SearchIndex } from "../../src/search/index";
import { buildLexicon, nearestDescriptors, readWords, stem } from "../../src/search/words";
import { loadFixtureBundle } from "../support/bundle-fixture";

let index: SearchIndex;

beforeAll(async () => {
  index = buildSearchIndex(await loadFixtureBundle());
});

describe("stem", () => {
  it.each([
    ["tangerines", "tangerine"],
    ["berries", "berry"],
    ["peaches", "peach"],
    ["buttery", "butter"],
    ["buttered", "butter"],
    ["smoked", "smoky"],
    ["smoke", "smoky"],
    ["fried", "frying"],
    ["nutty", "nut"],
    ["spices", "spicy"],
    ["tomatoes", "tomato"],
  ])("folds %s and %s together", (left, right) => {
    expect(stem(left)).toBe(stem(right));
  });

  it.each([
    ["citrus", "citru"],
    ["dry", "dr"],
    ["hay", "ha"],
    ["iris", "iri"],
  ])("keeps %s from becoming %s", (word, wrong) => {
    expect(stem(word)).not.toBe(wrong);
  });
});

describe("readWords", () => {
  it("maps an everyday word to the measured descriptor it names", () => {
    expect(readWords(index.lexicon, "tangerines").weights).toEqual(new Map([["orange", 1]]));
  });

  it("weighs the head noun fully and the words before it half", () => {
    expect(readWords(index.lexicon, "smoked vanilla").weights).toEqual(
      new Map([
        ["smoky", 0.5],
        ["vanilla", 1],
      ]),
    );
  });

  it("skips carriers and function words without reporting them", () => {
    const reading = readWords(index.lexicon, "a cedar chest of chlorine");
    expect(reading.weights).toEqual(new Map([["woody", 1]]));
    expect(reading.unread).toEqual(["chlorine"]);
  });

  it("drops a qualifier next to a word that names a descriptor", () => {
    expect(readWords(index.lexicon, "fresh tangerines").weights).toEqual(new Map([["orange", 1]]));
    expect(readWords(index.lexicon, "fresh air").weights).toEqual(new Map([["fresh", 1]]));
  });

  it("reads nothing when no word has a measured basis", () => {
    expect(readWords(index.lexicon, "swimming pool")).toEqual({
      weights: null,
      unread: ["swimming", "pool"],
    });
  });

  it("lets a descriptor win over an everyday word with the same stem", () => {
    const lexicon = buildLexicon(["smoky"], [], {
      ...NO_WORDS,
      words: { smoke: ["smoky"], smoked: ["smoky"] },
    });
    expect(readWords(lexicon, "smoked").weights).toEqual(new Map([["smoky", 1]]));
  });
});

describe("nearestDescriptors", () => {
  it("offers descriptors spelled close to an unread word", () => {
    expect(nearestDescriptors(index.lexicon, ["vanila"])).toEqual(["vanilla"]);
  });

  it("offers nothing when no descriptor is spelled close", () => {
    expect(nearestDescriptors(index.lexicon, ["chlorine"])).toEqual([]);
  });
});

describe("explainMiss", () => {
  it("names the words the catalogue has no descriptor for", () => {
    expect(explainMiss(index, "smells like swimming pool")).toEqual({
      unread: ["swimming", "pool"],
      nearest: [],
    });
  });
});

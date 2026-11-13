import { beforeAll, describe, expect, it } from "vitest";
import {
  buildSearchIndex,
  EMPTY_SUGGESTIONS,
  type SearchHit,
  type SearchIndex,
} from "../../src/search/index";
import { deepLinkHit, hitHref, searchViewState } from "../../src/search/view";
import { loadFixtureBundle } from "../support/bundle-fixture";

const hit: SearchHit = {
  id: "molecule:1066",
  kind: "molecule",
  label: "Geosmin",
  detail: "4670-05-7 · C12H22O",
  moleculeId: "1066",
  badge: null,
  match: "exact",
  score: 1,
};

describe("searchViewState", () => {
  it("reports results when the search found something", () => {
    expect(searchViewState("geosmin", [hit])).toEqual({
      status: "results",
      message: "1 result",
      suggestions: [],
    });
  });

  it("offers suggestions in the empty state", () => {
    const state = searchViewState("  ", []);
    expect(state.status).toBe("empty");
    expect(state.suggestions).toBe(EMPTY_SUGGESTIONS);
  });

  it("drops the smell and note wording when there are no suggestions", () => {
    const state = searchViewState("", [], []);
    expect(state.status).toBe("empty");
    expect(state.message).toBe("Search the atlas by molecule or descriptor.");
    expect(state.suggestions).toEqual([]);
  });

  it("names the query in the no-results state", () => {
    const state = searchViewState("zzzz", []);
    expect(state.status).toBe("no-results");
    expect(state.message).toContain("zzzz");
    expect(state.suggestions.length).toBeGreaterThan(0);
  });

  it("says it once and offers descriptors spelled like the query", () => {
    const state = searchViewState("swimming pool chlorinne", [], EMPTY_SUGGESTIONS, {
      unread: ["swimming", "pool", "chlorinne"],
      nearest: ["citrus"],
    });
    expect(state.message).toBe("No smell or molecule called 'swimming pool chlorinne'.");
    expect(state.nearest).toEqual(["citrus"]);
    expect(state.suggestions).toBe(EMPTY_SUGGESTIONS);
  });

  it("offers no nearest descriptors when none are close", () => {
    const state = searchViewState("the box", [], EMPTY_SUGGESTIONS, { unread: [], nearest: [] });
    expect(state.nearest).toBeUndefined();
  });
});

describe("hitHref", () => {
  it("opens the hit's card", () => {
    expect(hitHref(hit)).toBe("#/molecule/1066");
  });

  it("carries the phrase a known example answers so the card can badge it", () => {
    expect(hitHref({ ...hit, badge: "Rain", knownExample: true })).toBe(
      "#/molecule/1066?phrase=Rain",
    );
    expect(
      hitHref({ ...hit, id: "phrase:rain", kind: "phrase", label: "Rain", badge: "Rain" }),
    ).toBe("#/molecule/1066?phrase=Rain");
  });

  it("has no card for a hit without a molecule", () => {
    expect(hitHref({ ...hit, moleculeId: null })).toBeNull();
  });
});

describe("deepLinkHit", () => {
  let index: SearchIndex;

  beforeAll(async () => {
    index = buildSearchIndex(await loadFixtureBundle());
  });

  it("opens the first result that names a molecule", () => {
    const opened = deepLinkHit(index, "smells like rain");
    expect(opened?.moleculeId).toBe("1066");
    expect(opened === undefined ? null : hitHref(opened)).toBe("#/molecule/1066?phrase=Rain");
  });

  it("opens nothing for an unmatched query", () => {
    expect(deepLinkHit(index, "wet cardboard xyz")).toBeUndefined();
  });
});

import { describe, expect, it } from "vitest";
import {
  currentStreak,
  EMPTY_RESULTS,
  parseResults,
  readResults,
  STORAGE_KEY,
  saveResult,
  storedResult,
} from "../../src/smellcule/storage";

function memory(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem: (key: string): string | null => values.get(key) ?? null,
    setItem: (key: string, value: string): void => {
      values.set(key, value);
    },
  };
}

describe("parseResults", () => {
  it("starts empty without a stored value", () => {
    expect(parseResults(null)).toBe(EMPTY_RESULTS);
  });

  it("drops malformed JSON and unknown versions", () => {
    expect(parseResults("{")).toBe(EMPTY_RESULTS);
    expect(parseResults(JSON.stringify({ version: 2, results: {} }))).toBe(EMPTY_RESULTS);
  });

  it("keeps valid results and drops invalid entries", () => {
    const parsed = parseResults(
      JSON.stringify({
        version: 1,
        results: {
          "12": { puzzle: 12, score: 2, modelScore: 1, clueShown: false },
          "13": { puzzle: 13, score: "2", modelScore: 1, clueShown: false },
          note: { puzzle: 1, score: 1, modelScore: 1, clueShown: true },
        },
      }),
    );
    expect(Object.keys(parsed.results)).toEqual(["12"]);
    expect(storedResult(parsed, 12)).toEqual({
      puzzle: 12,
      score: 2,
      modelScore: 1,
      clueShown: false,
    });
  });
});

describe("saveResult", () => {
  it("stores one result under the versioned key without losing the others", () => {
    const store = memory({
      [STORAGE_KEY]: JSON.stringify({
        version: 1,
        results: { "2": { puzzle: 2, score: 3, modelScore: 2, clueShown: true } },
      }),
    });
    const next = saveResult(store, {
      puzzle: 3,
      score: 1,
      modelScore: 0,
      clueShown: false,
    });
    expect(storedResult(next, 2)?.score).toBe(3);
    expect(storedResult(next, 3)?.score).toBe(1);
    expect(readResults(store).results["3"]).toEqual({
      puzzle: 3,
      score: 1,
      modelScore: 0,
      clueShown: false,
    });
  });

  it("rejects a result that the schema would discard", () => {
    const store = memory();
    expect(() =>
      saveResult(store, { puzzle: 1, score: -1, modelScore: 0, clueShown: false }),
    ).toThrow(/Invalid stored result/);
  });
});

describe("saveResult and the daily mark", () => {
  it("keeps a puzzle's daily mark when it is replayed from the archive", () => {
    const store = memory();
    saveResult(store, { puzzle: 1, score: 1, modelScore: 2, clueShown: false, daily: true });
    const next = saveResult(store, { puzzle: 1, score: 3, modelScore: 2, clueShown: true });
    expect(storedResult(next, 1)).toEqual({
      puzzle: 1,
      score: 3,
      modelScore: 2,
      clueShown: true,
      daily: true,
    });
  });

  it("drops a daily mark that is not a boolean", () => {
    const parsed = parseResults(
      JSON.stringify({
        version: 1,
        results: { "4": { puzzle: 4, score: 1, modelScore: 1, clueShown: false, daily: "yes" } },
      }),
    );
    expect(parsed.results).toEqual({});
  });
});

describe("currentStreak", () => {
  function results(entries: readonly [number, boolean][]) {
    const store = memory();
    for (const [puzzle, daily] of entries) {
      saveResult(store, { puzzle, score: 1, modelScore: 1, clueShown: false, daily });
    }
    return readResults(store);
  }

  it("counts consecutive puzzles played on their own day, ending today", () => {
    expect(
      currentStreak(
        results([
          [3, true],
          [4, true],
          [5, true],
        ]),
        5,
      ),
    ).toBe(3);
  });

  it("keeps yesterday's streak alive until today's puzzle is played", () => {
    expect(
      currentStreak(
        results([
          [3, true],
          [4, true],
        ]),
        5,
      ),
    ).toBe(2);
  });

  it("never counts archive plays", () => {
    expect(
      currentStreak(
        results([
          [1, false],
          [2, false],
          [3, true],
        ]),
        3,
      ),
    ).toBe(1);
    expect(currentStreak(results([[2, false]]), 3)).toBe(0);
  });

  it("breaks on a missed day", () => {
    expect(
      currentStreak(
        results([
          [1, true],
          [3, true],
        ]),
        3,
      ),
    ).toBe(1);
    expect(currentStreak(results([[1, true]]), 3)).toBe(0);
  });
});

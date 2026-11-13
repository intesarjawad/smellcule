import { beforeAll, describe, expect, it } from "vitest";
import type { Bundle } from "../../src/data/bundle";
import type { SmellculePuzzle } from "../../src/smellcule/data";
import { STORAGE_VERSION } from "../../src/smellcule/storage";
import {
  COPIED,
  COPY_BLOCKED,
  modelTopThree,
  NOT_OUT_YET,
  openingText,
  puzzleResult,
  retiredResultLines,
  STORAGE_BLOCKED,
  streakText,
} from "../../src/smellcule/view";
import { loadFixtureBundle } from "../support/bundle-fixture";

const PUZZLE: SmellculePuzzle = {
  moleculeId: "425",
  options: [10, 25, 112, 29, 0, 1, 2, 3, 4, 5, 6, 7],
  answer: [10, 25, 112, 29],
  clueId: 1,
  clueSimilarity: 0.242424,
};

let bundle: Bundle;

beforeAll(async () => {
  bundle = await loadFixtureBundle();
});

describe("modelTopThree", () => {
  it("ranks the fixture puzzle molecule's three strongest descriptors", () => {
    expect(modelTopThree(bundle, "425")).toEqual([10, 25, 112]);
  });
});

describe("puzzleResult", () => {
  it("writes the exact share line for a clue-first play", () => {
    expect(
      puzzleResult(bundle, PUZZLE, 1, [10, 25, 29], true, "https://example.com/#/smellcule/1"),
    ).toEqual({
      score: 3,
      modelScore: 3,
      modelTop: [10, 25, 112],
      share: "Smellcule 1  you ●●● +clue  model ●●●  https://example.com/#/smellcule/1",
    });
  });

  it("leaves the clue marker off and counts only measured picks", () => {
    const result = puzzleResult(
      bundle,
      PUZZLE,
      1,
      [10, 25, 0],
      false,
      "https://example.com/#/smellcule/1",
    );
    expect(result.score).toBe(2);
    expect(result.share).toBe("Smellcule 1  you ●●○  model ●●●  https://example.com/#/smellcule/1");
  });
});

describe("pre-start text", () => {
  it("says when the first puzzle opens and marks a later number as not out", () => {
    expect(openingText("2026-11-13")).toBe("Smellcule #1 opens on 2026-11-13");
    expect(NOT_OUT_YET).toBe("Not out yet");
  });
});

describe("streakText", () => {
  it("counts days in words", () => {
    expect(streakText(0)).toBe("Streak: 0 days");
    expect(streakText(1)).toBe("Streak: 1 day");
    expect(streakText(4)).toBe("Streak: 4 days");
  });
});

describe("retiredResultLines", () => {
  it("marks each stored result retired, oldest first", () => {
    const lines = retiredResultLines({
      version: STORAGE_VERSION,
      results: {
        "12": { puzzle: 12, score: 1, modelScore: 2, clueShown: false },
        "3": { puzzle: 3, score: 3, modelScore: 3, clueShown: true },
      },
    });
    expect(lines).toEqual([
      "Smellcule 3  you ●●● +clue  model ●●●  retired",
      "Smellcule 12  you ●○○  model ●●○  retired",
    ]);
  });

  it("is empty when nothing was played", () => {
    expect(retiredResultLines({ version: STORAGE_VERSION, results: {} })).toEqual([]);
  });
});

describe("game messages", () => {
  it("says what happened and what to do next", () => {
    expect(STORAGE_BLOCKED).toBe("Streaks are off because this browser blocks storage.");
    expect(COPIED).toBe("Copied to the clipboard.");
    expect(COPY_BLOCKED).toBe("Copy was blocked. The share text is selected below.");
  });
});

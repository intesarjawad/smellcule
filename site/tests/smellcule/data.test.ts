import { beforeAll, describe, expect, it } from "vitest";
import type { Atlas } from "../../src/data/validate";
import { validateSmellcule } from "../../src/smellcule/data";
import { fixtureJson, loadFixtureBundle } from "../support/bundle-fixture";

let atlas: Atlas;

beforeAll(async () => {
  atlas = (await loadFixtureBundle()).atlas;
});

function fixture(): Record<string, unknown> {
  return structuredClone(fixtureJson("fixture-data/smellcule.json")) as Record<string, unknown>;
}

describe("validateSmellcule", () => {
  it("reads the committed puzzle and its start date", () => {
    const game = validateSmellcule(fixture(), atlas);
    expect(game.startDate).toBe("2026-11-13");
    expect(game.puzzles).toHaveLength(1);
    expect(game.puzzles[0]?.options).toHaveLength(12);
    expect(game.puzzles[0]?.answer).toEqual([11, 29, 41, 62, 66]);
    expect(game.puzzles[0]?.moleculeId).toBe("425");
  });

  it("rejects an option outside the descriptor vocabulary", () => {
    const document = fixture();
    const puzzles = document.puzzles as Record<string, unknown>[];
    const [puzzle] = puzzles;
    if (puzzle === undefined) throw new Error("fixture has no puzzle");
    puzzle.options = [113, ...(puzzle.options as number[]).slice(1)];
    expect(() => validateSmellcule(document, atlas)).toThrow(/descriptor index out of range/);
  });

  it("rejects an answer with no descriptor among the options", () => {
    const document = fixture();
    const puzzles = document.puzzles as Record<string, unknown>[];
    const [puzzle] = puzzles;
    if (puzzle === undefined) throw new Error("fixture has no puzzle");
    const options = puzzle.options as number[];
    puzzle.answer = [0, 1, 2, 3].filter((label) => !options.includes(label)).slice(0, 3);
    expect(() => validateSmellcule(document, atlas)).toThrow(
      /at least one answer among the options/,
    );
  });

  it("rejects an answer outside the descriptor vocabulary", () => {
    const document = fixture();
    const puzzles = document.puzzles as Record<string, unknown>[];
    const [puzzle] = puzzles;
    if (puzzle === undefined) throw new Error("fixture has no puzzle");
    puzzle.answer = [...(puzzle.answer as number[]), atlas.labels.length];
    expect(() => validateSmellcule(document, atlas)).toThrow(
      /answer: descriptor index out of range/,
    );
  });

  it("keeps measured descriptors the twelve options had no room for", () => {
    const document = fixture();
    const puzzles = document.puzzles as Record<string, unknown>[];
    const [puzzle] = puzzles;
    if (puzzle === undefined) throw new Error("fixture has no puzzle");
    const options = puzzle.options as number[];
    const unshown = [...atlas.labels.keys()].find((label) => !options.includes(label));
    if (unshown === undefined) throw new Error("every descriptor is an option");
    const answer = [...(puzzle.answer as number[]), unshown];
    puzzle.answer = answer;
    expect(validateSmellcule(document, atlas).puzzles[0]?.answer).toEqual(answer);
  });

  it("rejects a clue id outside the atlas", () => {
    const document = fixture();
    const puzzles = document.puzzles as Record<string, unknown>[];
    const [puzzle] = puzzles;
    if (puzzle === undefined) throw new Error("fixture has no puzzle");
    puzzle.clueId = atlas.molecules.length;
    expect(() => validateSmellcule(document, atlas)).toThrow(/clueId: not in the atlas/);
  });
});

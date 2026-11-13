import { describe, expect, it } from "vitest";
import {
  type GameState,
  gameReducer,
  INITIAL_GAME_STATE,
  scorePicks,
  shareText,
} from "../../src/smellcule/game";

function choose(picks: readonly number[], clueShown = false): GameState {
  return { status: "choosing", picks: [...picks], clueShown };
}

describe("gameReducer", () => {
  it("starts with nothing chosen", () => {
    expect(INITIAL_GAME_STATE).toEqual({ status: "choosing", picks: [], clueShown: false });
  });

  it("picks and unpicks one option at a time", () => {
    const picked = gameReducer(INITIAL_GAME_STATE, { type: "pick", option: 9 });
    expect(picked.picks).toEqual([9]);
    const unpicked = gameReducer(picked, { type: "unpick", option: 9 });
    expect(unpicked.picks).toEqual([]);
  });

  it("does not add the same option twice", () => {
    const once = gameReducer(INITIAL_GAME_STATE, { type: "pick", option: 9 });
    expect(gameReducer(once, { type: "pick", option: 9 })).toBe(once);
  });

  it("keeps at most three picks", () => {
    const state = choose([9, 44, 98]);
    expect(gameReducer(state, { type: "pick", option: 101 })).toBe(state);
  });

  it("submits only with exactly three picks", () => {
    const two = choose([9, 44]);
    expect(gameReducer(two, { type: "submit" })).toBe(two);
    expect(gameReducer(choose([9, 44, 98]), { type: "submit" }).status).toBe("revealed");
  });

  it("reveals the clue before submitting", () => {
    expect(gameReducer(INITIAL_GAME_STATE, { type: "showClue" }).clueShown).toBe(true);
  });

  it("does not reveal a clue after submitting", () => {
    const revealed = gameReducer(choose([9, 44, 98]), { type: "submit" });
    expect(gameReducer(revealed, { type: "showClue" })).toBe(revealed);
  });

  it("ignores every action once revealed", () => {
    const revealed = gameReducer(choose([9, 44, 98], true), { type: "submit" });
    expect(gameReducer(revealed, { type: "pick", option: 101 })).toBe(revealed);
    expect(gameReducer(revealed, { type: "unpick", option: 9 })).toBe(revealed);
    expect(gameReducer(revealed, { type: "submit" })).toBe(revealed);
  });
});

describe("scorePicks", () => {
  it("counts only measured descriptors", () => {
    expect(scorePicks([9, 44, 101], [9, 44, 98, 101])).toBe(3);
    expect(scorePicks([9, 1, 2], [9, 44, 98, 101])).toBe(1);
  });
});

describe("shareText", () => {
  it("writes the exact result line", () => {
    expect(
      shareText({
        puzzle: 12,
        score: 2,
        modelScore: 1,
        clueShown: false,
        url: "https://example.com/#/smellcule",
      }),
    ).toBe("Smellcule 12  you ●●○  model ●○○  https://example.com/#/smellcule");
  });

  it("marks a puzzle played with the clue", () => {
    expect(
      shareText({
        puzzle: 12,
        score: 2,
        modelScore: 1,
        clueShown: true,
        url: "https://example.com/#/smellcule",
      }),
    ).toBe("Smellcule 12  you ●●○ +clue  model ●○○  https://example.com/#/smellcule");
  });
});

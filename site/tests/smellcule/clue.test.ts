import { describe, expect, it } from "vitest";
import { clueText } from "../../src/smellcule/game";

describe("clueText", () => {
  it("names the closest training molecule and what it smells of", () => {
    expect(clueText("Benzyl acetate", 0.242424, ["floral", "sweet"])).toBe(
      "Closest structure the model trained on: Benzyl acetate (structure similarity 0.24) smells floral, sweet",
    );
  });

  it("says when the clue molecule has no measured descriptors", () => {
    expect(clueText("Unknown", 0.1, [])).toBe(
      "Closest structure the model trained on: Unknown (structure similarity 0.10) smells no measured descriptors",
    );
  });
});

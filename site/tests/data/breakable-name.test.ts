import { describe, expect, it } from "vitest";
import { breakableName } from "../../src/data/names";

describe("breakableName", () => {
  it("offers breaks only where chemical parts join", () => {
    expect(breakableName("Ethyltrimethylnorbornanol").split("­")).toEqual([
      "Ethyl",
      "trimethyl",
      "norbornanol",
    ]);
  });

  it("leaves a name with no joins whole and drops the CAS suffix", () => {
    expect(breakableName("Caryophyllene alcohol (472-97-9)")).toBe("Caryophyllene alcohol");
  });
});

import { describe, expect, it } from "vitest";
import { listedNames } from "../../src/data/names";

describe("listedNames", () => {
  it("keeps a unique name as it is", () => {
    expect(listedNames([{ id: "1", name: "Vanillin", cas: "121-33-5" }]).get("1")).toBe("Vanillin");
  });

  it("adds the CAS number to every molecule that shares a name", () => {
    const names = listedNames([
      { id: "1", name: "Menthol", cas: "89-78-1" },
      { id: "2", name: "Menthol", cas: "2216-51-5" },
      { id: "3", name: "Menthol", cas: null },
      { id: "4", name: "Vanillin", cas: "121-33-5" },
    ]);
    expect([...names.values()]).toEqual([
      "Menthol (89-78-1)",
      "Menthol (2216-51-5)",
      "Menthol (CAS not listed)",
      "Vanillin",
    ]);
  });
});

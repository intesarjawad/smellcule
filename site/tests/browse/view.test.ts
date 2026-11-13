import { beforeAll, describe, expect, it } from "vitest";
import { browseGroups } from "../../src/browse/view";
import { moleculeHref } from "../../src/card/link";
import type { Bundle } from "../../src/data/bundle";
import { loadFixtureBundle } from "../support/bundle-fixture";

let bundle: Bundle;
let groups: ReturnType<typeof browseGroups>;

beforeAll(async () => {
  bundle = await loadFixtureBundle();
  groups = browseGroups(bundle);
});

function familyOf(name: string): string | undefined {
  return groups.find((group) => group.molecules.some((molecule) => molecule.name === name))?.name;
}

describe("browseGroups", () => {
  it("lists every fixture molecule exactly once", () => {
    const listed = groups.flatMap((group) => group.molecules.map((molecule) => molecule.id));
    const expected = bundle.atlas.molecules.map((molecule) => molecule.id);
    expect([...listed].sort()).toEqual([...expected].sort());
    expect(new Set(listed).size).toBe(listed.length);
  });

  it("puts each molecule under the family its predictions favour", () => {
    expect(familyOf("Ambrettolide")).toBe("savory");
    expect(familyOf("Limonene")).toBe("fruity");
    expect(familyOf("Geosmin")).toBe("sweet");
    expect(familyOf("Vanillin")).toBe("fruity");
  });

  it("keeps the atlas family order and drops empty families", () => {
    const order = bundle.atlas.families.map((family) => family.name);
    const positions = groups.map((group) => order.indexOf(group.name));
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
    expect(groups.every((group) => group.molecules.length > 0)).toBe(true);
  });

  it("sorts molecules by name inside a family", () => {
    for (const group of groups) {
      const names = group.molecules.map((molecule) => molecule.name);
      expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
    }
  });
});

describe("moleculeHref", () => {
  it("links a molecule to its card", () => {
    expect(moleculeHref("1066")).toBe("#/molecule/1066");
  });
});

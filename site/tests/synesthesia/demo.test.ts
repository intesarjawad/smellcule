import { describe, expect, it } from "vitest";
import { defaultPair } from "../../src/synesthesia/demo";
import { loadFixtureBundle } from "../support/bundle-fixture";

describe("defaultPair", () => {
  it("opens on Vanillin and Limonene in the Leffingwell catalogue", async () => {
    const bundle = await loadFixtureBundle();
    expect(defaultPair(bundle.atlas)).toEqual(["2794", "1557"]);
  });

  it("takes the first two demo names the Keller catalogue has", async () => {
    const bundle = await loadFixtureBundle("keller");
    const names = defaultPair(bundle.atlas).map(
      (id) => bundle.atlas.molecules.find((molecule) => molecule.id === id)?.name,
    );
    expect(names).toEqual(["vanillin", "eugenol"]);
  });

  it("skips demo names the catalogue lacks", () => {
    const molecules = [
      { id: "7", name: "Geosmin" },
      { id: "9", name: "Muscone" },
      { id: "8", name: "Limonene" },
    ];
    expect(defaultPair({ catalogue: "leffingwell", molecules })).toEqual(["8", "7"]);
  });
});

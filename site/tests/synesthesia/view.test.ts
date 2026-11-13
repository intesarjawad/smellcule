import { beforeAll, describe, expect, it } from "vitest";
import type { Bundle } from "../../src/data/bundle";
import { FAMILIES, type FamilyWeights } from "../../src/synesthesia/mapping";
import { DEFAULT_PRESET, withBias } from "../../src/synesthesia/mapping-codec";
import {
  blendText,
  exportFileName,
  glidePosition,
  melodySeed,
  pairHref,
  type SynesthesiaModel,
  soundHref,
  synesthesiaModel,
  voicedAt,
  voicingOf,
} from "../../src/synesthesia/view";
import { loadFixtureBundle } from "../support/bundle-fixture";

let bundle: Bundle;

beforeAll(async () => {
  bundle = await loadFixtureBundle();
  // Controlled synthetic vectors isolate citrus/wood mapping from random fixture predictions.
  for (const [id, label, probability] of [
    ["1557", "citrus", 128],
    ["2279", "woody", 255],
  ] as const) {
    const index = bundle.atlas.molecules.findIndex((molecule) => molecule.id === id);
    const width = bundle.atlas.labels.length;
    bundle.predictions.fill(0, index * width, (index + 1) * width);
    bundle.predictions[index * width + bundle.atlas.labels.indexOf(label)] = probability;
  }
});

/** x coordinates read straight from the fixture's positions.bin. */
const LIMONENE_X = -10.110197067260742;
const PATCHOULI_X = -60.309505462646484;

function ranked(weights: FamilyWeights): string[] {
  return [...FAMILIES].sort((a, b) => weights[b] - weights[a]);
}

function model(ids: readonly string[], mix: boolean): SynesthesiaModel {
  const result = synesthesiaModel(bundle, ids, mix);
  if (result === null) throw new Error(`no model for ${ids.join(",")}`);
  return result;
}

describe("synesthesiaModel", () => {
  it("treats two ids without mix as a morph between them", () => {
    const pair = model(["1557", "2279"], false);
    expect(pair.mode).toBe("pair");
    expect(pair.molecules.map((molecule) => molecule.name)).toEqual([
      "Limonene",
      "Patchouli alcohol",
    ]);
    expect(pair.missing).toEqual([]);
  });

  it("plays the same ids as one mixture when mix is set", () => {
    const mixture = model(["1557", "2560", "133", "2794"], true);
    expect(mixture.mode).toBe("mix");
    expect(mixture.molecules.map((molecule) => molecule.name)).toEqual([
      "Limonene",
      "Rose oxide",
      "Ambrettolide",
      "Vanillin",
    ]);
    expect(mixture.from).toBe(mixture.to);
  });

  it("falls back to one molecule and names the id it could not find", () => {
    const single = model(["1557", "9999"], false);
    expect(single.mode).toBe("single");
    expect(single.missing).toEqual(["9999"]);
    expect(model(["1557", "1557"], true).mode).toBe("single");
  });

  it("has nothing to play when no id is catalogued", () => {
    expect(synesthesiaModel(bundle, ["9999"], false)).toBeNull();
    expect(synesthesiaModel(bundle, [], true)).toBeNull();
  });
});

describe("voicingOf", () => {
  it("leads with the family in each controlled prediction vector", () => {
    expect(ranked(voicingOf(bundle, ["1557"])?.families ?? ({} as FamilyWeights))[0]).toBe(
      "citrus",
    );
    expect(ranked(voicingOf(bundle, ["2279"])?.families ?? ({} as FamilyWeights))[0]).toBe("woody");
  });

  it("averages a mixture before weighting, so both members are heard", () => {
    const families = voicingOf(bundle, ["1557", "2279"])?.families;
    if (families === undefined) throw new Error("no mixture voicing");
    expect(ranked(families).slice(0, 2)).toEqual(["woody", "citrus"]);
    expect(voicingOf(bundle, ["1557", "2279"])?.x).toBeCloseTo((LIMONENE_X + PATCHOULI_X) / 2, 5);
  });
});

describe("voicedAt", () => {
  it("pans from the first molecule's x to the second's", () => {
    const pair = model(["1557", "2279"], false);
    expect(voicedAt(pair, 0).params.pan).toBeCloseTo(LIMONENE_X / 100, 6);
    expect(voicedAt(pair, 1).params.pan).toBe(-0.6);
    expect(voicedAt(pair, 0.5).params.pan).toBeCloseTo((LIMONENE_X + PATCHOULI_X) / 200, 6);
    expect(voicedAt(pair, 2).params.pan).toBe(-0.6);
  });

  it("sounds the citrus vector high and bright and the woody vector low and dark", () => {
    const pair = model(["1557", "2279"], false);
    const citrus = voicedAt(pair, 0).params;
    const woody = voicedAt(pair, 1).params;
    expect(citrus.registerMidi).toBe(72);
    expect(woody.registerMidi).toBe(48);
    expect(citrus.brightness).toBeGreaterThan(0.7);
    expect(woody.brightness).toBeLessThan(0.15);
  });
});

describe("voicedAt with a preset", () => {
  it("applies the edited bias and keeps the rule-based pan", () => {
    const pair = model(["1557", "2279"], false);
    const edited = withBias(DEFAULT_PRESET, "brightness", 2);
    expect(voicedAt(pair, 0, edited).params.brightness).toBe(1);
    expect(voicedAt(pair, 0, edited).params.pan).toBeCloseTo(LIMONENE_X / 100, 6);
    expect(voicedAt(pair, 0, DEFAULT_PRESET).params.registerMidi).toBe(72);
  });
});

describe("soundHref", () => {
  const edited = withBias(DEFAULT_PRESET, "brightness", 0.5);
  const param = Buffer.from(
    JSON.stringify({
      v: 1,
      params: Object.fromEntries(
        Object.entries(DEFAULT_PRESET.params).map(([name, { bias, k }]) => [
          name,
          {
            bias: name === "brightness" ? 0.5 : bias,
            k: Object.fromEntries(
              FAMILIES.filter((family) => family in k).map((family) => [
                family,
                k[family as keyof typeof k],
              ]),
            ),
          },
        ]),
      ),
    }),
    "utf8",
  ).toString("base64url");

  it("reopens each mode without a mapping while the default stands", () => {
    expect(soundHref(model(["1557"], false), DEFAULT_PRESET)).toBe("#/synesthesia?a=1557");
    expect(soundHref(model(["1557", "2279"], false), DEFAULT_PRESET)).toBe(
      "#/synesthesia?a=1557&b=2279",
    );
    expect(soundHref(model(["1557", "2560", "133", "2794"], true), DEFAULT_PRESET)).toBe(
      "#/synesthesia?mix=1557,2560,133,2794",
    );
  });

  it("appends an edited mapping as the map parameter", () => {
    expect(soundHref(model(["1557", "2279"], false), edited)).toBe(
      `#/synesthesia?a=1557&b=2279&map=${param}`,
    );
  });
});

describe("labels", () => {
  it("seeds a morph with both ids and a mixture with the joined list", () => {
    expect(melodySeed(model(["1557", "2279"], false))).toEqual({
      aId: "1557",
      bId: "2279",
    });
    expect(melodySeed(model(["1557", "2279"], true))).toEqual({
      aId: "1557,2279",
      bId: "",
    });
  });

  it("names the WAV after the molecules", () => {
    expect(exportFileName(model(["1557", "2279"], false))).toBe("smellcule-1557-2279.wav");
  });

  it("reads the blend as two percentages", () => {
    expect(blendText(model(["1557", "2279"], false), 0.25)).toBe(
      "Limonene 75%, Patchouli alcohol 25%",
    );
  });

  it("glides at one full sweep per eight seconds and stops at the end", () => {
    expect(glidePosition(0, 1, 0)).toBe(0);
    expect(glidePosition(0, 1, 4000)).toBe(0.5);
    expect(glidePosition(0, 1, 9000)).toBe(1);
    expect(glidePosition(1, 0, 2000)).toBe(0.75);
    expect(glidePosition(0.5, 0, 8000)).toBe(0);
  });

  it("links a picked pair, dropping b when it repeats a", () => {
    expect(pairHref("1557", "2279", DEFAULT_PRESET)).toBe("#/synesthesia?a=1557&b=2279");
    expect(pairHref("1557", "1557", DEFAULT_PRESET)).toBe("#/synesthesia?a=1557");
    expect(pairHref("1557", undefined, withBias(DEFAULT_PRESET, "warmth", 1))).toMatch(
      /^#\/synesthesia\?a=1557&map=/,
    );
  });
});

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_MAPPING,
  DEFAULT_WEIGHTS,
  deriveMapping,
  FAMILIES,
  type FamilyWeights,
} from "../../src/synesthesia/mapping";
import {
  DEFAULT_PRESET,
  decodeMappingPreset,
  encodeMappingPreset,
  MAPPING_PARAMETERS,
  MAX_BIAS,
  MAX_COEFFICIENT,
  MAX_ENCODED_BYTES,
  type MappingPreset,
  MappingPresetError,
  mappingLinkParam,
  PARAMETER_RANGES,
  PRESET_VERSION,
  presetMapping,
  resolveMappingLink,
  validateMappingPreset,
  withBias,
  withCoefficient,
} from "../../src/synesthesia/mapping-codec";
import { mulberry32 } from "../../src/synesthesia/sequencer";

const CONTINUOUS = MAPPING_PARAMETERS;

function seededWeights(seed: number, count: number): FamilyWeights[] {
  const random = mulberry32(seed);
  return Array.from({ length: count }, () => {
    const raw = Object.fromEntries(FAMILIES.map((family) => [family, random()])) as FamilyWeights;
    const total = FAMILIES.reduce((sum, family) => sum + raw[family], 0);
    return Object.fromEntries(
      FAMILIES.map((family) => [family, raw[family] / total]),
    ) as FamilyWeights;
  });
}

function handPreset(): MappingPreset {
  const params = Object.fromEntries(
    MAPPING_PARAMETERS.map((parameter) => [parameter, { bias: 0, k: {} }]),
  );
  return { v: PRESET_VERSION, params } as MappingPreset;
}

describe("DEFAULT_PRESET", () => {
  it("reproduces every authored parameter at fifty seeded weight vectors", () => {
    for (const weights of seededWeights(20261106, 50)) {
      const expected = deriveMapping(weights, 25);
      const actual = presetMapping(DEFAULT_PRESET, weights, 25);
      for (const parameter of CONTINUOUS) {
        expect(actual[parameter]).toBeCloseTo(expected[parameter], 9);
      }
      expect(actual.scale).toBe(expected.scale);
      expect(actual.pan).toBe(expected.pan);
    }
  });

  it("reproduces the concrete default mapping from the default weights", () => {
    const mapping = presetMapping(DEFAULT_PRESET, DEFAULT_WEIGHTS);
    for (const parameter of CONTINUOUS) {
      expect(mapping[parameter]).toBeCloseTo(DEFAULT_MAPPING[parameter], 9);
    }
    expect(mapping.scale).toBe(DEFAULT_MAPPING.scale);
    expect(mapping.pan).toBe(DEFAULT_MAPPING.pan);
  });

  it("keeps every parameter inside its declared range even for saturated weights", () => {
    const saturated = Object.fromEntries(FAMILIES.map((family) => [family, 4])) as FamilyWeights;
    for (const weights of [saturated, DEFAULT_WEIGHTS]) {
      const mapping = presetMapping(DEFAULT_PRESET, weights);
      for (const parameter of MAPPING_PARAMETERS) {
        const [lo, hi] = PARAMETER_RANGES[parameter];
        expect(mapping[parameter]).toBeGreaterThanOrEqual(lo);
        expect(mapping[parameter]).toBeLessThanOrEqual(hi);
      }
    }
  });

  it("rounds the register to a whole MIDI note", () => {
    for (const weights of seededWeights(7, 10)) {
      expect(Number.isInteger(presetMapping(DEFAULT_PRESET, weights).registerMidi)).toBe(true);
    }
  });

  it("stays inside the schema bounds", () => {
    for (const parameter of MAPPING_PARAMETERS) {
      const { bias, k } = DEFAULT_PRESET.params[parameter];
      expect(Math.abs(bias)).toBeLessThanOrEqual(MAX_BIAS);
      for (const coefficient of Object.values(k)) {
        expect(Math.abs(coefficient)).toBeLessThanOrEqual(MAX_COEFFICIENT);
      }
    }
  });
});

describe("presetMapping", () => {
  it("blends the bias and the family coefficients before mapping the range", () => {
    const preset = handPreset();
    const custom: MappingPreset = {
      ...preset,
      params: {
        ...preset.params,
        brightness: { bias: 0.1, k: { citrus: 2 } },
      },
    };
    const weights = Object.fromEntries(FAMILIES.map((family) => [family, 0.1])) as FamilyWeights;
    weights.citrus = 0.4;
    const mapping = presetMapping(custom, weights);
    expect(mapping.brightness).toBeCloseTo(0.1 + 2 * 0.4, 9);
  });

  it("clamps the blend at both ends", () => {
    const preset = handPreset();
    const custom: MappingPreset = {
      ...preset,
      params: {
        ...preset.params,
        warmth: { bias: 1, k: { sweet: 2, musky: -2 } },
      },
    };
    const weights = Object.fromEntries(FAMILIES.map((family) => [family, 0])) as FamilyWeights;
    weights.musky = 1;
    expect(presetMapping(custom, weights).warmth).toBe(0);
    weights.musky = 0;
    weights.sweet = 1;
    expect(presetMapping(custom, weights).warmth).toBe(1);
  });

  it("leaves the rule-based scale and pan untouched", () => {
    const weights = Object.fromEntries(FAMILIES.map((family) => [family, 0])) as FamilyWeights;
    weights.woody = 1;
    expect(presetMapping(DEFAULT_PRESET, weights, 100).scale).toBe("minorPentatonic");
    expect(presetMapping(DEFAULT_PRESET, weights, 100).pan).toBeCloseTo(0.6, 9);
  });
});

describe("preset codec", () => {
  it("round-trips the default preset through base64url", () => {
    const encoded = encodeMappingPreset(DEFAULT_PRESET);
    expect(encoded).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(encoded.length).toBeLessThanOrEqual(MAX_ENCODED_BYTES);
    expect(decodeMappingPreset(encoded)).toEqual(validateMappingPreset(DEFAULT_PRESET));
  });

  it("decodes a hand-written preset and treats absent families as zero", () => {
    const document = {
      v: 1,
      params: Object.fromEntries(
        MAPPING_PARAMETERS.map((parameter) => [parameter, { bias: 0, k: {} }]),
      ),
    };
    document.params.brightness = { bias: 0, k: { citrus: 2 } };
    const encoded = Buffer.from(JSON.stringify(document), "utf8").toString("base64url");
    const preset = decodeMappingPreset(encoded);
    const weights = Object.fromEntries(FAMILIES.map((family) => [family, 0])) as FamilyWeights;
    weights.citrus = 0.5;
    expect(presetMapping(preset, weights).brightness).toBe(1);
  });

  it("rejects malformed JSON, bad base64url and oversized links", () => {
    for (const text of ["", "%%%", Buffer.from("{", "utf8").toString("base64url")]) {
      expect(() => decodeMappingPreset(text)).toThrow(MappingPresetError);
    }
    expect(() => decodeMappingPreset("A".repeat(MAX_ENCODED_BYTES + 1))).toThrow(
      MappingPresetError,
    );
  });

  it("rejects schema violations", () => {
    const valid = validateMappingPreset(DEFAULT_PRESET);
    const withParam = (parameter: string, value: unknown): unknown => ({
      ...valid,
      params: { ...valid.params, [parameter]: value },
    });
    const malformed: unknown[] = [
      null,
      [],
      { v: 2, params: valid.params },
      { ...valid, extra: true },
      { v: 1, params: {} },
      withParam("tempoBpm", { bias: 2.1, k: {} }),
      withParam("tempoBpm", { bias: 0, k: { citrus: 4.1 } }),
      withParam("tempoBpm", { bias: 0, k: { unknown: 1 } }),
      withParam("tempoBpm", { bias: 0, k: {}, extra: 1 }),
      withParam("tempoBpm", { bias: "0", k: {} }),
      withParam("tempoBpm", { bias: Number.POSITIVE_INFINITY, k: {} }),
      withParam("unknown", { bias: 0, k: {} }),
    ];
    for (const value of malformed) {
      expect(() => validateMappingPreset(value)).toThrow(MappingPresetError);
    }
  });

  it("rejects a preset whose encoded form would not fit in a link", () => {
    const long = -4 + 1e-15;
    const padded: MappingPreset = {
      v: PRESET_VERSION,
      params: Object.fromEntries(
        MAPPING_PARAMETERS.map((parameter) => [
          parameter,
          { bias: 0, k: Object.fromEntries(FAMILIES.map((family) => [family, long])) },
        ]),
      ),
    };
    expect(() => encodeMappingPreset(padded)).toThrow(MappingPresetError);
  });
});

describe("mapping links", () => {
  it("plays the default when the link carries no mapping", () => {
    expect(resolveMappingLink(null)).toEqual({ preset: DEFAULT_PRESET, notice: null });
  });

  it("reads an edited mapping from its link", () => {
    const edited = withBias(DEFAULT_PRESET, "brightness", 0.25);
    const param = mappingLinkParam(edited);
    if (param === null) throw new Error("an edited preset needs a link parameter");
    const link = resolveMappingLink(param);
    expect(link.notice).toBeNull();
    expect(link.preset.params.brightness.bias).toBe(0.25);
    expect(link.preset.params.tempoBpm).toEqual(DEFAULT_PRESET.params.tempoBpm);
  });

  it("falls back to the default with a notice naming the problem", () => {
    const unreadable = resolveMappingLink("%%%");
    expect(unreadable.preset).toBe(DEFAULT_PRESET);
    expect(unreadable.notice).toBe(
      "The mapping in this link could not be read, so the default mapping was loaded. mapping: invalid base64url.",
    );
    const wrongVersion = Buffer.from('{"v":2,"params":{}}', "utf8").toString("base64url");
    expect(resolveMappingLink(wrongVersion).notice).toContain("mapping.v: expected 1.");
    expect(resolveMappingLink("").preset).toBe(DEFAULT_PRESET);
  });

  it("needs no link parameter for the default and writes the hand-checked form otherwise", () => {
    expect(mappingLinkParam(DEFAULT_PRESET)).toBeNull();
    const zero = handPreset();
    const names = ["tempoBpm", "brightness", "warmth", "roughness", "notesPerBeat", "registerMidi"];
    const entry = (name: string, bias: number) => `"${name}":{"bias":${bias},"k":{}}`;
    const expected = `{"v":1,"params":{${[
      ...names.map((name) => entry(name, name === "brightness" ? 0.5 : 0)),
      entry("attackMs", 0),
      entry("reverbMix", 0),
    ].join(",")}}}`;
    expect(mappingLinkParam(withBias(zero, "brightness", 0.5))).toBe(
      Buffer.from(expected, "utf8").toString("base64url"),
    );
  });
});

describe("preset edits", () => {
  it("replaces one bias or coefficient and leaves the rest alone", () => {
    const bias = withBias(DEFAULT_PRESET, "warmth", -0.5);
    expect(bias.params.warmth).toEqual({ bias: -0.5, k: DEFAULT_PRESET.params.warmth.k });
    const coefficient = withCoefficient(DEFAULT_PRESET, "warmth", "waxy", 1.5);
    expect(coefficient.params.warmth.k).toEqual({
      sweet: 1,
      woody: 1,
      musky: 1,
      roasted: 0.5,
      waxy: 1.5,
    });
    expect(coefficient.params.warmth.bias).toBe(0);
    expect(DEFAULT_PRESET.params.warmth.k.waxy).toBeUndefined();
  });

  it("refuses values the schema does not allow", () => {
    expect(() => withBias(DEFAULT_PRESET, "warmth", 2.5)).toThrow(MappingPresetError);
    expect(() => withCoefficient(DEFAULT_PRESET, "warmth", "waxy", -4.5)).toThrow(
      MappingPresetError,
    );
    expect(() => withCoefficient(DEFAULT_PRESET, "warmth", "waxy", Number.NaN)).toThrow(
      MappingPresetError,
    );
  });
});

describe("mapping schema", () => {
  const schema = JSON.parse(
    readFileSync(new URL("../../../schemas/mapping.schema.json", import.meta.url), "utf8"),
  );

  it("declares the same parameters and bounds as the codec", () => {
    expect(schema.additionalProperties).toBe(false);
    expect(schema.required).toEqual(["v", "params"]);
    expect(schema.properties.v.const).toBe(PRESET_VERSION);
    expect(schema.properties.params.additionalProperties).toBe(false);
    expect(schema.properties.params.required).toEqual([...MAPPING_PARAMETERS]);
    expect(Object.keys(schema.properties.params.properties)).toEqual([...MAPPING_PARAMETERS]);

    const coefficients = schema.$defs.coefficients;
    expect(coefficients.additionalProperties).toBe(false);
    expect(coefficients.required).toEqual(["bias", "k"]);
    expect(coefficients.properties.bias.minimum).toBe(-MAX_BIAS);
    expect(coefficients.properties.bias.maximum).toBe(MAX_BIAS);
    expect(Object.keys(coefficients.properties.k.properties).sort()).toEqual([...FAMILIES].sort());
    for (const family of FAMILIES) {
      expect(coefficients.properties.k.properties[family]).toEqual({
        type: "number",
        minimum: -MAX_COEFFICIENT,
        maximum: MAX_COEFFICIENT,
      });
    }
  });
});

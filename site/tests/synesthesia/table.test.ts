import { describe, expect, it } from "vitest";
import {
  deriveMapping,
  FAMILIES,
  type FamilyWeights,
  SCALE_THRESHOLD,
} from "../../src/synesthesia/mapping";
import {
  DEFAULT_PRESET,
  presetMapping,
  withCoefficient,
} from "../../src/synesthesia/mapping-codec";
import { mulberry32 } from "../../src/synesthesia/sequencer";
import { formulaText, linearRules, mappingTable, ruleValue } from "../../src/synesthesia/table";

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

describe("the mapping table", () => {
  it("evaluates to what the synthesis plays at fifty seeded weight vectors", () => {
    for (const weights of seededWeights(20261110, 50)) {
      const played = deriveMapping(weights, 0);
      for (const rule of linearRules(DEFAULT_PRESET)) {
        expect(ruleValue(rule, weights)).toBeCloseTo(played[rule.parameter], 9);
      }
    }
  });

  it("follows an edited mapping the same way", () => {
    const edited = withCoefficient(DEFAULT_PRESET, "warmth", "citrus", 2);
    for (const weights of seededWeights(3, 10)) {
      const played = presetMapping(edited, weights, 0);
      for (const rule of linearRules(edited)) {
        expect(ruleValue(rule, weights)).toBeCloseTo(played[rule.parameter], 9);
      }
    }
  });

  it("prints each formula from the coefficients it evaluates", () => {
    const [tempo, brightness, , , , register] = linearRules(DEFAULT_PRESET);
    if (tempo === undefined || brightness === undefined || register === undefined) {
      throw new Error("missing rules");
    }
    expect(formulaText(brightness)).toBe(
      "clamp(1 citrus + 1 fresh + 0.4 fruity + 1 green + 0.6 floral)",
    );
    expect(formulaText(tempo)).toBe(
      "56 + 84 × clamp(0.05 + 0.83 citrus + 0.83 fresh + 0.83 fruity + 0.36 spicy + 0.36 green - 0.12 woody - 0.12 musky - 0.12 earthy)",
    );
    expect(formulaText(register)).toBe(
      "round(48 + 24 × clamp(0.5 + 1 citrus + 1 fresh - 1 woody - 1 musky - 1 earthy + 1 floral))",
    );
  });

  it("shows every parameter with its value, formula and current weights", () => {
    const [weights] = seededWeights(9, 1);
    if (weights === undefined) throw new Error("no weights");
    const params = deriveMapping(weights, 12);
    const rows = mappingTable(DEFAULT_PRESET, weights, params, 12);
    expect(rows.map((row) => row.name)).toEqual([
      "Tempo",
      "Brightness",
      "Warmth",
      "Roughness",
      "Notes per beat",
      "Register",
      "Attack",
      "Reverb",
      "Scale",
      "Pan",
    ]);
    expect(rows[1]?.value).toBe(params.brightness.toFixed(2));
    expect(rows[1]?.weights).toBe(
      ["citrus", "fresh", "fruity", "green", "floral"]
        .map((family) => `${family} ${weights[family as keyof FamilyWeights].toFixed(2)}`)
        .join(", "),
    );
    expect(rows[8]?.formula).toContain(`above ${SCALE_THRESHOLD} major pentatonic`);
    expect(rows[9]?.value).toBe(params.pan.toFixed(2));
  });
});

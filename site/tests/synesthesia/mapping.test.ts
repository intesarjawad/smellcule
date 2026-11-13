import { describe, expect, it } from "vitest";
import {
  DEFAULT_MAPPING,
  DEFAULT_WEIGHTS,
  deriveMapping,
  FAMILIES,
  type Family,
  type FamilyWeights,
  familyScores,
  interpolateWeights,
  type Mapping,
  mappingDistance,
  sharpenedWeights,
} from "../../src/synesthesia/mapping";

const zeroWeights = Object.fromEntries(FAMILIES.map((family) => [family, 0])) as FamilyWeights;

function weights(entries: Partial<FamilyWeights>): FamilyWeights {
  return { ...zeroWeights, ...entries };
}

const uniform = Object.fromEntries(
  FAMILIES.map((family) => [family, 1 / FAMILIES.length]),
) as FamilyWeights;

function bump(family: Family, amount: number): FamilyWeights {
  const raw = { ...uniform, [family]: uniform[family] + amount };
  const total = FAMILIES.reduce((sum, key) => sum + raw[key], 0);
  return Object.fromEntries(FAMILIES.map((key) => [key, raw[key] / total])) as FamilyWeights;
}

describe("familyScores", () => {
  it("takes the strongest label in each family", () => {
    const scores = familyScores({ lemon: 0.9, citrus: 0.2, musk: 0.3, banana: 1 });
    expect(scores.citrus).toBe(0.9);
    expect(scores.musky).toBe(0.3);
    expect(scores.fruity).toBe(0);
  });

  it("scores a family with no predicted labels as zero", () => {
    const scores = familyScores({});
    for (const family of FAMILIES) expect(scores[family]).toBe(0);
  });
});

describe("sharpenedWeights", () => {
  it("squares then normalises the family scores", () => {
    const result = sharpenedWeights({ citrus: 0.9, musk: 0.3 });
    expect(result.citrus).toBeCloseTo(0.9, 12);
    expect(result.musky).toBeCloseTo(0.1, 12);
    expect(result.woody).toBe(0);
  });

  it("falls back to a uniform split when nothing is predicted", () => {
    const result = sharpenedWeights({});
    for (const family of FAMILIES) expect(result[family]).toBeCloseTo(1 / 13, 12);
  });
});

describe("interpolateWeights", () => {
  it("blends linearly at t", () => {
    const result = interpolateWeights(weights({ citrus: 1 }), weights({ woody: 1 }), 0.25);
    expect(result.citrus).toBeCloseTo(0.75, 12);
    expect(result.woody).toBeCloseTo(0.25, 12);
  });

  it("clamps t to the segment", () => {
    expect(interpolateWeights(weights({ citrus: 1 }), weights({ woody: 1 }), 2)).toEqual(
      weights({ woody: 1 }),
    );
    expect(interpolateWeights(weights({ citrus: 1 }), weights({ woody: 1 }), -1)).toEqual(
      weights({ citrus: 1 }),
    );
  });
});

describe("deriveMapping corners", () => {
  it("saturates the bright end for citrus", () => {
    const mapping = deriveMapping(weights({ citrus: 1 }));
    expect(mapping.tempoBpm).toBe(130);
    expect(mapping.brightness).toBe(1);
    expect(mapping.warmth).toBe(0);
    expect(mapping.roughness).toBe(0);
    expect(mapping.notesPerBeat).toBe(4);
    expect(mapping.registerMidi).toBe(72);
    expect(mapping.attackMs).toBe(5);
    expect(mapping.reverbMix).toBe(0.1);
    expect(mapping.scale).toBe("majorPentatonic");
    expect(mapping.pan).toBe(0);
  });

  it("clamps the slow, dark end for woody", () => {
    const mapping = deriveMapping(weights({ woody: 1 }));
    expect(mapping.tempoBpm).toBe(56);
    expect(mapping.brightness).toBe(0);
    expect(mapping.warmth).toBe(1);
    expect(mapping.roughness).toBe(1);
    expect(mapping.notesPerBeat).toBe(0.5);
    expect(mapping.registerMidi).toBe(48);
    expect(mapping.attackMs).toBe(400);
    expect(mapping.reverbMix).toBe(0.1);
    expect(mapping.scale).toBe("minorPentatonic");
  });

  it("keeps the weighted terms at their stated strength", () => {
    const mapping = deriveMapping(weights({ floral: 1 }));
    expect(mapping.brightness).toBeCloseTo(0.6, 12);
    expect(mapping.attackMs).toBeCloseTo(202.5, 12);
    expect(mapping.reverbMix).toBeCloseTo(0.6, 12);
    expect(mapping.registerMidi).toBe(72);
    expect(mapping.scale).toBe("majorPentatonic");
  });

  it("maps the x position to pan inside its limits", () => {
    expect(deriveMapping(uniform, 0).pan).toBe(0);
    expect(deriveMapping(uniform, 50).pan).toBeCloseTo(0.5, 12);
    expect(deriveMapping(uniform, 100).pan).toBe(0.6);
    expect(deriveMapping(uniform, -100).pan).toBe(-0.6);
    expect(deriveMapping(uniform, 1000).pan).toBe(0.6);
    expect(deriveMapping(uniform, -1000).pan).toBe(-0.6);
  });
});

describe("deriveMapping monotonicity", () => {
  const cases: ReadonlyArray<readonly [Family, Exclude<keyof Mapping, "scale">, 1 | -1]> = [
    ["citrus", "tempoBpm", 1],
    ["fresh", "tempoBpm", 1],
    ["fruity", "tempoBpm", 1],
    ["spicy", "tempoBpm", 1],
    ["green", "tempoBpm", 1],
    ["woody", "tempoBpm", -1],
    ["musky", "tempoBpm", -1],
    ["earthy", "tempoBpm", -1],
    ["citrus", "brightness", 1],
    ["fresh", "brightness", 1],
    ["green", "brightness", 1],
    ["floral", "brightness", 1],
    ["fruity", "brightness", 1],
    ["sweet", "warmth", 1],
    ["woody", "warmth", 1],
    ["musky", "warmth", 1],
    ["roasted", "warmth", 1],
    ["savory", "roughness", 1],
    ["roasted", "roughness", 1],
    ["spicy", "roughness", 1],
    ["waxy", "roughness", 1],
    ["woody", "roughness", 1],
    ["fruity", "notesPerBeat", 1],
    ["citrus", "notesPerBeat", 1],
    ["spicy", "notesPerBeat", 1],
    ["green", "notesPerBeat", 1],
    ["citrus", "registerMidi", 1],
    ["fresh", "registerMidi", 1],
    ["floral", "registerMidi", 1],
    ["musky", "registerMidi", -1],
    ["woody", "registerMidi", -1],
    ["earthy", "registerMidi", -1],
    ["sweet", "attackMs", 1],
    ["musky", "attackMs", 1],
    ["woody", "attackMs", 1],
    ["floral", "attackMs", 1],
    ["floral", "reverbMix", 1],
    ["fresh", "reverbMix", 1],
    ["musky", "reverbMix", 1],
    ["earthy", "reverbMix", 1],
    ["woody", "reverbMix", -1],
  ];

  it.each(cases)("%s moves %s by %i", (family, parameter, direction) => {
    const base = Number(deriveMapping(uniform)[parameter]);
    const moved = Number(deriveMapping(bump(family, 0.1))[parameter]);
    if (direction === -1) expect(moved).toBeLessThan(base);
    else expect(moved).toBeGreaterThan(base);
  });
});

describe("deriveMapping scale", () => {
  it("uses major pentatonic when bright families hold more than three quarters", () => {
    expect(deriveMapping(weights({ citrus: 0.76, spicy: 0.24 })).scale).toBe("majorPentatonic");
  });

  it("uses minor pentatonic when dark families hold more than three quarters", () => {
    expect(deriveMapping(weights({ spicy: 0.76, citrus: 0.24 })).scale).toBe("minorPentatonic");
  });

  it("uses dorian inside the balance band", () => {
    expect(deriveMapping(weights({ citrus: 0.5, spicy: 0.5 })).scale).toBe("dorian");
    expect(deriveMapping(weights({ citrus: 0.7, spicy: 0.3 })).scale).toBe("dorian");
    expect(deriveMapping(weights({ spicy: 0.7, citrus: 0.3 })).scale).toBe("dorian");
  });
});

describe("defaults", () => {
  it("reproduces the authored default mapping from the default weights", () => {
    const mapping = deriveMapping(DEFAULT_WEIGHTS);
    expect(mapping.tempoBpm).toBeCloseTo(DEFAULT_MAPPING.tempoBpm, 12);
    expect(mapping.brightness).toBeCloseTo(DEFAULT_MAPPING.brightness, 12);
    expect(mapping.warmth).toBeCloseTo(DEFAULT_MAPPING.warmth, 12);
    expect(mapping.roughness).toBeCloseTo(DEFAULT_MAPPING.roughness, 12);
    expect(mapping.notesPerBeat).toBeCloseTo(DEFAULT_MAPPING.notesPerBeat, 12);
    expect(mapping.registerMidi).toBe(DEFAULT_MAPPING.registerMidi);
    expect(mapping.attackMs).toBeCloseTo(DEFAULT_MAPPING.attackMs, 12);
    expect(mapping.reverbMix).toBeCloseTo(DEFAULT_MAPPING.reverbMix, 12);
    expect(mapping.scale).toBe(DEFAULT_MAPPING.scale);
    expect(mapping.pan).toBe(DEFAULT_MAPPING.pan);
  });

  it("keeps the default weights normalised", () => {
    const total = FAMILIES.reduce((sum, family) => sum + DEFAULT_WEIGHTS[family], 0);
    expect(total).toBeCloseTo(1, 12);
  });
});

describe("mappingDistance", () => {
  const low: Mapping = {
    tempoBpm: 56,
    brightness: 0,
    warmth: 0,
    roughness: 0,
    notesPerBeat: 0.5,
    registerMidi: 48,
    attackMs: 5,
    reverbMix: 0.1,
    scale: "majorPentatonic",
    pan: -0.6,
  };
  const high: Mapping = {
    tempoBpm: 140,
    brightness: 1,
    warmth: 1,
    roughness: 1,
    notesPerBeat: 4,
    registerMidi: 72,
    attackMs: 400,
    reverbMix: 0.6,
    scale: "minorPentatonic",
    pan: 0.6,
  };

  it("is zero for the same mapping", () => {
    expect(mappingDistance(low, low)).toBe(0);
  });

  it("is one when every parameter spans its full range", () => {
    expect(mappingDistance(low, high)).toBeCloseTo(1, 12);
  });

  it("counts a single scale step as half a dimension", () => {
    expect(mappingDistance(low, { ...low, scale: "dorian" })).toBeCloseTo(0.158113883, 9);
    expect(mappingDistance(low, { ...low, scale: "minorPentatonic" })).toBeCloseTo(0.316227766, 9);
  });

  it("is symmetric", () => {
    expect(mappingDistance(high, low)).toBeCloseTo(mappingDistance(low, high), 12);
  });
});

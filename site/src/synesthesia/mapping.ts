/**
 * Pure translation of odour-family weights into sound parameters. Keeping this free of audio
 * objects lets the live graph and the offline WAV render share exactly the same numbers.
 */

export const FAMILIES = [
  "citrus",
  "fresh",
  "fruity",
  "spicy",
  "green",
  "woody",
  "musky",
  "earthy",
  "floral",
  "sweet",
  "roasted",
  "savory",
  "waxy",
] as const;

export type Family = (typeof FAMILIES)[number];

export type FamilyWeights = Record<Family, number>;

/**
 * Descriptor labels that feed each family. A family takes the strongest probability among its
 * labels, so a single confident descriptor is not diluted by weaker synonyms.
 */
export const FAMILY_LABELS: Record<Family, readonly string[]> = {
  citrus: ["citrus", "lemon", "orange"],
  fresh: ["fresh", "mint", "camphoreous", "medicinal", "aromatic"],
  fruity: ["fruity", "berry", "cherry", "apple", "tropical"],
  spicy: ["spicy", "cinnamon", "anisic", "clove", "pungent"],
  green: ["green", "hay", "herbal"],
  woody: ["woody", "pine", "dry", "balsamic"],
  musky: ["musk", "animal"],
  earthy: ["earthy", "musty", "gasoline"],
  floral: ["floral", "rose", "jasmine", "lavender"],
  sweet: ["sweet", "vanilla", "honey", "creamy", "almond", "warm"],
  roasted: ["roasted", "coffee", "burnt", "smoky", "phenolic", "toasted"],
  savory: ["savory", "meaty", "alliaceous", "garlic", "onion", "sulfurous"],
  waxy: ["waxy", "oily", "fatty"],
};

export type ScaleName = "majorPentatonic" | "minorPentatonic" | "dorian";

export const SCALES: Record<ScaleName, readonly number[]> = {
  majorPentatonic: [0, 2, 4, 7, 9],
  minorPentatonic: [0, 3, 5, 7, 10],
  dorian: [0, 2, 3, 5, 7, 9, 10],
};

export interface Mapping {
  tempoBpm: number;
  brightness: number;
  warmth: number;
  roughness: number;
  notesPerBeat: number;
  registerMidi: number;
  attackMs: number;
  reverbMix: number;
  scale: ScaleName;
  pan: number;
}

export const RANGES = {
  tempoBpm: [56, 140],
  brightness: [0, 1],
  warmth: [0, 1],
  roughness: [0, 1],
  notesPerBeat: [0.5, 4],
  registerMidi: [48, 72],
  attackMs: [5, 400],
  reverbMix: [0.1, 0.6],
  pan: [-0.6, 0.6],
} as const satisfies Record<Exclude<keyof Mapping, "scale">, readonly [number, number]>;

/** A balanced starting point with a little more sweet and floral than the rest. */
export const DEFAULT_WEIGHTS: FamilyWeights = Object.freeze({
  citrus: 0.1,
  fresh: 0.1,
  fruity: 0.1,
  spicy: 0.1,
  green: 0.1,
  woody: 0.05,
  musky: 0.05,
  earthy: 0.05,
  floral: 0.1,
  sweet: 0.12,
  roasted: 0.05,
  savory: 0.03,
  waxy: 0.05,
});

/** Families on the bright side of the scale rule; the other seven count as dark. */
export const BRIGHT_FAMILIES: readonly Family[] = [
  "citrus",
  "fruity",
  "sweet",
  "floral",
  "fresh",
  "green",
];

/**
 * How far bright must lead dark, or trail it, before the scale leaves dorian: one side has to
 * hold more than three quarters of the weight, so mixed profiles keep the in-between mode.
 */
export const SCALE_THRESHOLD = 0.5;

/** Atlas x units per unit of stereo pan. */
export const PAN_DIVISOR = 100;

export const DEFAULT_MAPPING: Mapping = Object.freeze({
  tempoBpm: 85.5,
  brightness: 0.4,
  warmth: 0.245,
  roughness: 0.4925,
  notesPerBeat: 2.25,
  registerMidi: 64,
  attackMs: 111.65,
  reverbMix: 0.31875,
  scale: "dorian",
  pan: 0,
});

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function uniformWeights(): FamilyWeights {
  const share = 1 / FAMILIES.length;
  return Object.fromEntries(FAMILIES.map((family) => [family, share])) as FamilyWeights;
}

/** Strongest predicted probability for each family. Missing labels score zero. */
export function familyScores(predictions: Readonly<Record<string, number>>): FamilyWeights {
  return Object.fromEntries(
    FAMILIES.map((family) => {
      const labels = FAMILY_LABELS[family];
      let score = 0;
      for (const label of labels) {
        const probability = predictions[label];
        if (probability !== undefined && probability > score) score = probability;
      }
      return [family, score];
    }),
  ) as FamilyWeights;
}

/**
 * Squares the family scores before normalising. The square keeps a dominant family from being
 * averaged away by a long tail of weak descriptors.
 */
export function sharpenedWeights(predictions: Readonly<Record<string, number>>): FamilyWeights {
  const scores = familyScores(predictions);
  let total = 0;
  for (const family of FAMILIES) total += scores[family] ** 2;
  if (total === 0) return uniformWeights();
  return Object.fromEntries(
    FAMILIES.map((family) => [family, scores[family] ** 2 / total]),
  ) as FamilyWeights;
}

/** Linear blend of two already-normalised weight sets. */
export function interpolateWeights(
  from: Readonly<FamilyWeights>,
  to: Readonly<FamilyWeights>,
  t: number,
): FamilyWeights {
  const amount = clamp(t, 0, 1);
  return Object.fromEntries(
    FAMILIES.map((family) => [family, from[family] + (to[family] - from[family]) * amount]),
  ) as FamilyWeights;
}

/** Bright families minus dark ones. */
export function scaleBalance(weights: Readonly<FamilyWeights>): number {
  return FAMILIES.reduce(
    (sum, family) => sum + (BRIGHT_FAMILIES.includes(family) ? 1 : -1) * weights[family],
    0,
  );
}

export function scaleFor(weights: Readonly<FamilyWeights>): ScaleName {
  const balance = scaleBalance(weights);
  if (balance > SCALE_THRESHOLD) return "majorPentatonic";
  if (balance < -SCALE_THRESHOLD) return "minorPentatonic";
  return "dorian";
}

export function deriveMapping(weights: Readonly<FamilyWeights>, xPosition = 0): Mapping {
  const w = weights;
  const tempoBpm = clamp(
    60 +
      70 * (w.citrus + w.fresh + w.fruity) +
      30 * (w.spicy + w.green) -
      10 * (w.woody + w.musky + w.earthy),
    ...RANGES.tempoBpm,
  );
  const brightness = clamp(
    w.citrus + w.fresh + w.green + 0.6 * w.floral + 0.4 * w.fruity,
    ...RANGES.brightness,
  );
  const warmth = clamp(w.sweet + w.woody + w.musky + 0.5 * w.roasted, ...RANGES.warmth);
  const roughness = clamp(
    w.savory + w.roasted + 3 * w.spicy + w.waxy + 1.25 * w.woody,
    ...RANGES.roughness,
  );
  const density = clamp(w.fruity + w.citrus + 2.5 * w.spicy + 0.5 * w.green, 0, 1);
  const notesPerBeat = clamp(0.5 + 3.5 * density, ...RANGES.notesPerBeat);
  const registerMidi = clamp(
    Math.round(
      48 + 24 * clamp(0.5 + w.citrus + w.fresh + w.floral - w.musky - w.woody - w.earthy, 0, 1),
    ),
    ...RANGES.registerMidi,
  );
  const attackMs = clamp(
    5 + 395 * clamp(w.sweet + w.musky + w.woody + 0.5 * w.floral, 0, 1),
    ...RANGES.attackMs,
  );
  const reverbMix = clamp(
    0.1 + 0.5 * clamp(w.floral + w.fresh + 2 * w.musky + 3 * w.earthy - 0.25 * w.woody, 0, 1),
    ...RANGES.reverbMix,
  );
  const scale = scaleFor(w);
  const pan = clamp(xPosition / PAN_DIVISOR, ...RANGES.pan);

  return {
    tempoBpm,
    brightness,
    warmth,
    roughness,
    notesPerBeat,
    registerMidi,
    attackMs,
    reverbMix,
    scale,
    pan,
  };
}

const SCALE_POSITION: Record<ScaleName, number> = {
  majorPentatonic: 0,
  dorian: 0.5,
  minorPentatonic: 1,
};

/**
 * Euclidean distance over the ten parameters, each divided by its own range so no single
 * parameter dominates. Used to keep the demo molecules audibly distinct.
 */
export function mappingDistance(a: Readonly<Mapping>, b: Readonly<Mapping>): number {
  const deltas = [
    (a.tempoBpm - b.tempoBpm) / (RANGES.tempoBpm[1] - RANGES.tempoBpm[0]),
    a.brightness - b.brightness,
    a.warmth - b.warmth,
    a.roughness - b.roughness,
    (a.notesPerBeat - b.notesPerBeat) / (RANGES.notesPerBeat[1] - RANGES.notesPerBeat[0]),
    (a.registerMidi - b.registerMidi) / (RANGES.registerMidi[1] - RANGES.registerMidi[0]),
    (a.attackMs - b.attackMs) / (RANGES.attackMs[1] - RANGES.attackMs[0]),
    (a.reverbMix - b.reverbMix) / (RANGES.reverbMix[1] - RANGES.reverbMix[0]),
    SCALE_POSITION[a.scale] - SCALE_POSITION[b.scale],
    (a.pan - b.pan) / (RANGES.pan[1] - RANGES.pan[0]),
  ];
  return Math.hypot(...deltas) / Math.sqrt(deltas.length);
}

/**
 * The visible mapping table. Every coefficient it prints is read from the preset the sound uses,
 * and the scale and pan rows from the same constants as the rules, so the table cannot drift
 * from what is heard.
 */

import {
  BRIGHT_FAMILIES,
  FAMILIES,
  type Family,
  type FamilyWeights,
  type Mapping,
  PAN_DIVISOR,
  RANGES,
  SCALE_THRESHOLD,
  scaleBalance,
} from "./mapping";
import {
  MAPPING_PARAMETERS,
  type MappingParameter,
  type MappingPreset,
  PARAMETER_RANGES,
} from "./mapping-codec";

export interface Term {
  readonly family: Family;
  readonly k: number;
}

export interface MappingRow {
  readonly name: string;
  readonly value: string;
  readonly formula: string;
  /** The current weight of every family the formula reads. */
  readonly weights: string;
}

/** A continuous parameter as `lo + span * clamp(bias + sum of k * weight)`. */
export interface LinearRule {
  readonly parameter: MappingParameter;
  readonly lo: number;
  readonly span: number;
  readonly bias: number;
  readonly terms: readonly Term[];
  readonly rounded: boolean;
}

export const PARAMETER_NAMES: Record<MappingParameter, string> = {
  tempoBpm: "Tempo",
  brightness: "Brightness",
  warmth: "Warmth",
  roughness: "Roughness",
  notesPerBeat: "Notes per beat",
  registerMidi: "Register",
  attackMs: "Attack",
  reverbMix: "Reverb",
};

const SCALE_NAMES = {
  majorPentatonic: "major pentatonic",
  minorPentatonic: "minor pentatonic",
  dorian: "dorian",
} as const;

function number(value: number): string {
  return String(Number(value.toFixed(2)));
}

export function linearRules(preset: MappingPreset): LinearRule[] {
  return MAPPING_PARAMETERS.map((parameter) => {
    const [lo, hi] = PARAMETER_RANGES[parameter];
    const { bias, k } = preset.params[parameter];
    const terms = FAMILIES.flatMap((family) => {
      const coefficient = k[family] ?? 0;
      return coefficient === 0 ? [] : [{ family, k: coefficient }];
    });
    return { parameter, lo, span: hi - lo, bias, terms, rounded: parameter === "registerMidi" };
  });
}

export function ruleValue(rule: LinearRule, weights: Readonly<FamilyWeights>): number {
  const blend = rule.terms.reduce((sum, term) => sum + term.k * weights[term.family], rule.bias);
  const value = rule.lo + rule.span * Math.min(1, Math.max(0, blend));
  return rule.rounded ? Math.round(value) : value;
}

export function formulaText(rule: LinearRule): string {
  const sum = rule.terms
    .map((term, index) => {
      const sign = term.k < 0 ? "- " : index === 0 && rule.bias === 0 ? "" : "+ ";
      return `${sign}${number(Math.abs(term.k))} ${term.family}`;
    })
    .join(" ");
  const inner = rule.bias === 0 ? sum : `${number(rule.bias)} ${sum}`;
  const scaled =
    rule.lo === 0 && rule.span === 1
      ? `clamp(${inner})`
      : `${number(rule.lo)} + ${number(rule.span)} × clamp(${inner})`;
  return rule.rounded ? `round(${scaled})` : scaled;
}

function displayValue(parameter: MappingParameter, params: Mapping): string {
  const value = params[parameter];
  if (parameter === "tempoBpm") return `${Math.round(value)} BPM`;
  if (parameter === "registerMidi") return `MIDI ${value}`;
  if (parameter === "attackMs") return `${Math.round(value)} ms`;
  return value.toFixed(2);
}

function weightList(families: readonly Family[], weights: Readonly<FamilyWeights>): string {
  return families.map((family) => `${family} ${weights[family].toFixed(2)}`).join(", ");
}

export function mappingTable(
  preset: MappingPreset,
  weights: Readonly<FamilyWeights>,
  params: Mapping,
  x: number,
): MappingRow[] {
  const linear = linearRules(preset).map((rule) => ({
    name: PARAMETER_NAMES[rule.parameter],
    value: displayValue(rule.parameter, params),
    formula: formulaText(rule),
    weights: weightList(
      rule.terms.map((term) => term.family),
      weights,
    ),
  }));
  const [panLo, panHi] = RANGES.pan;
  return [
    ...linear,
    {
      name: "Scale",
      value: SCALE_NAMES[params.scale],
      formula: `bright (${BRIGHT_FAMILIES.join(", ")}) minus the other families: above ${SCALE_THRESHOLD} major pentatonic, below -${SCALE_THRESHOLD} minor pentatonic, otherwise dorian; changes at bar lines`,
      weights: `bright minus dark ${scaleBalance(weights).toFixed(2)}`,
    },
    {
      name: "Pan",
      value: params.pan.toFixed(2),
      formula: `atlas x / ${PAN_DIVISOR}, held between ${panLo} and ${panHi}`,
      weights: `x ${x.toFixed(1)}`,
    },
  ];
}

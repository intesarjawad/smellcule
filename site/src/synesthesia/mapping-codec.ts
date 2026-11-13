/**
 * Shared mapping presets. The continuous parameters are a linear blend of the family weights
 * clamped to the parameter's own range, so a visitor can share a tweaked sound as one short
 * link while the authored default reproduces the fixed mapping exactly.
 */

import {
  DEFAULT_MAPPING,
  deriveMapping,
  FAMILIES,
  type Family,
  type FamilyWeights,
  type Mapping,
} from "./mapping";

export const MAPPING_PARAMETERS = [
  "tempoBpm",
  "brightness",
  "warmth",
  "roughness",
  "notesPerBeat",
  "registerMidi",
  "attackMs",
  "reverbMix",
] as const;

export type MappingParameter = (typeof MAPPING_PARAMETERS)[number];

/** The range column from the authored table; `scale` and `pan` are rule-based, not editable. */
export const PARAMETER_RANGES: Readonly<Record<MappingParameter, readonly [number, number]>> = {
  tempoBpm: [56, 140],
  brightness: [0, 1],
  warmth: [0, 1],
  roughness: [0, 1],
  notesPerBeat: [0.5, 4],
  registerMidi: [48, 72],
  attackMs: [5, 400],
  reverbMix: [0.1, 0.6],
};

export const PRESET_VERSION = 1;
export const MAX_ENCODED_BYTES = 2048;
export const MAX_BIAS = 2;
export const MAX_COEFFICIENT = 4;

export interface FamilyCoefficients {
  readonly bias: number;
  /** Families that are absent count as zero. */
  readonly k: Readonly<Partial<Record<Family, number>>>;
}

export interface MappingPreset {
  readonly v: typeof PRESET_VERSION;
  readonly params: Readonly<Record<MappingParameter, FamilyCoefficients>>;
}

export class MappingPresetError extends RangeError {
  readonly reason: string;

  constructor(reason: string) {
    super(reason);
    this.name = "MappingPresetError";
    this.reason = reason;
  }
}

const TEMPO_STEP = 70 / 84;
const TEMPO_DARK_STEP = 30 / 84;
const TEMPO_DRAG = -10 / 84;

/** Coefficients that turn every authored formula into `lo + (hi - lo) * clamped blend`. */
export const DEFAULT_PRESET: MappingPreset = Object.freeze({
  v: PRESET_VERSION,
  params: Object.freeze({
    tempoBpm: {
      bias: 4 / 84,
      k: {
        citrus: TEMPO_STEP,
        fresh: TEMPO_STEP,
        fruity: TEMPO_STEP,
        spicy: TEMPO_DARK_STEP,
        green: TEMPO_DARK_STEP,
        woody: TEMPO_DRAG,
        musky: TEMPO_DRAG,
        earthy: TEMPO_DRAG,
      },
    },
    brightness: { bias: 0, k: { citrus: 1, fresh: 1, green: 1, floral: 0.6, fruity: 0.4 } },
    warmth: { bias: 0, k: { sweet: 1, woody: 1, musky: 1, roasted: 0.5 } },
    roughness: { bias: 0, k: { savory: 1, roasted: 1, spicy: 3, waxy: 1, woody: 1.25 } },
    notesPerBeat: { bias: 0, k: { fruity: 1, citrus: 1, spicy: 2.5, green: 0.5 } },
    registerMidi: {
      bias: 0.5,
      k: { citrus: 1, fresh: 1, floral: 1, musky: -1, woody: -1, earthy: -1 },
    },
    attackMs: { bias: 0, k: { sweet: 1, musky: 1, woody: 1, floral: 0.5 } },
    reverbMix: { bias: 0, k: { floral: 1, fresh: 1, musky: 2, earthy: 3, woody: -0.25 } },
  }),
});

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function expectKeys(
  value: Record<string, unknown>,
  allowed: readonly string[],
  path: string,
): void {
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key)) throw new MappingPresetError(`${path}: unknown field ${key}.`);
  }
}

function expectNumber(value: unknown, path: string, limit: number): number {
  const magnitude = typeof value === "number" ? Math.abs(value) : Number.NaN;
  if (!Number.isFinite(value as number) || magnitude > limit) {
    throw new MappingPresetError(
      `${path}: expected a finite number between -${limit} and ${limit}.`,
    );
  }
  return value as number;
}

function parseParam(value: unknown, parameter: MappingParameter): FamilyCoefficients {
  const path = `params.${parameter}`;
  if (!isRecord(value)) throw new MappingPresetError(`${path}: expected an object.`);
  expectKeys(value, ["bias", "k"], path);
  const bias = expectNumber(value.bias, `${path}.bias`, MAX_BIAS);
  if (!isRecord(value.k)) throw new MappingPresetError(`${path}.k: expected an object.`);
  expectKeys(value.k, FAMILIES, `${path}.k`);
  const k: Partial<Record<Family, number>> = {};
  for (const family of FAMILIES) {
    const coefficient = value.k[family];
    if (coefficient === undefined) continue;
    k[family] = expectNumber(coefficient, `${path}.k.${family}`, MAX_COEFFICIENT);
  }
  return { bias, k };
}

/** Reads untrusted JSON into a preset, rejecting anything the schema does not allow. */
export function validateMappingPreset(value: unknown): MappingPreset {
  if (!isRecord(value)) throw new MappingPresetError("mapping: expected an object.");
  expectKeys(value, ["v", "params"], "mapping");
  if (value.v !== PRESET_VERSION) {
    throw new MappingPresetError(`mapping.v: expected ${PRESET_VERSION}.`);
  }
  if (!isRecord(value.params)) throw new MappingPresetError("params: expected an object.");
  const rawParams = value.params;
  expectKeys(rawParams, MAPPING_PARAMETERS, "params");
  const params = Object.fromEntries(
    MAPPING_PARAMETERS.map((parameter) => {
      const raw = rawParams[parameter];
      if (raw === undefined) throw new MappingPresetError(`params.${parameter}: missing.`);
      return [parameter, parseParam(raw, parameter)];
    }),
  ) as Record<MappingParameter, FamilyCoefficients>;
  return { v: PRESET_VERSION, params };
}

function serialize(preset: MappingPreset): string {
  const params = Object.fromEntries(
    MAPPING_PARAMETERS.map((parameter) => {
      const { bias, k } = preset.params[parameter];
      const coefficients = Object.fromEntries(
        FAMILIES.filter((family) => (k[family] ?? 0) !== 0).map((family) => [family, k[family]]),
      );
      return [parameter, { bias, k: coefficients }];
    }),
  );
  return JSON.stringify({ v: PRESET_VERSION, params });
}

function bytes(text: string): number {
  return new TextEncoder().encode(text).byteLength;
}

/** Base64url without padding, the form that survives a URL fragment intact. */
export function encodeMappingPreset(preset: MappingPreset): string {
  const json = serialize(validateMappingPreset(preset));
  if (bytes(json) > MAX_ENCODED_BYTES) {
    throw new MappingPresetError(`mapping: encoded preset exceeds ${MAX_ENCODED_BYTES} bytes.`);
  }
  let binary = "";
  for (const byte of new TextEncoder().encode(json)) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

export function decodeMappingPreset(text: string): MappingPreset {
  if (text.length > MAX_ENCODED_BYTES) {
    throw new MappingPresetError(`mapping: encoded preset exceeds ${MAX_ENCODED_BYTES} bytes.`);
  }
  if (!/^[A-Za-z0-9_-]+$/.test(text)) throw new MappingPresetError("mapping: invalid base64url.");
  let json: string;
  try {
    const padded = text
      .replaceAll("-", "+")
      .replaceAll("_", "/")
      .padEnd(Math.ceil(text.length / 4) * 4, "=");
    json = new TextDecoder("utf-8", { fatal: true }).decode(
      Uint8Array.from(atob(padded), (character) => character.charCodeAt(0)),
    );
  } catch {
    throw new MappingPresetError("mapping: invalid base64url.");
  }
  let value: unknown;
  try {
    value = JSON.parse(json);
  } catch {
    throw new MappingPresetError("mapping: expected JSON.");
  }
  return validateMappingPreset(value);
}

export interface MappingLink {
  readonly preset: MappingPreset;
  /** Set when the link's preset was unreadable and the default stands in for it. */
  readonly notice: string | null;
}

/** An absent parameter is the authored mapping; an unreadable one falls back to it with a notice. */
export function resolveMappingLink(param: string | null): MappingLink {
  if (param === null) return { preset: DEFAULT_PRESET, notice: null };
  try {
    return { preset: decodeMappingPreset(param), notice: null };
  } catch (error) {
    if (!(error instanceof MappingPresetError)) throw error;
    return {
      preset: DEFAULT_PRESET,
      notice: `The mapping in this link could not be read, so the default mapping was loaded. ${error.reason}`,
    };
  }
}

/** The link parameter for a preset, or null for the default, which needs none. */
export function mappingLinkParam(preset: MappingPreset): string | null {
  const valid = validateMappingPreset(preset);
  return serialize(valid) === serialize(DEFAULT_PRESET) ? null : encodeMappingPreset(valid);
}

function withParam(
  preset: MappingPreset,
  parameter: MappingParameter,
  next: FamilyCoefficients,
): MappingPreset {
  return validateMappingPreset({ ...preset, params: { ...preset.params, [parameter]: next } });
}

/** Returns an edited copy, throwing {@link MappingPresetError} when the value is out of bounds. */
export function withBias(
  preset: MappingPreset,
  parameter: MappingParameter,
  bias: number,
): MappingPreset {
  return withParam(preset, parameter, { ...preset.params[parameter], bias });
}

export function withCoefficient(
  preset: MappingPreset,
  parameter: MappingParameter,
  family: Family,
  coefficient: number,
): MappingPreset {
  const current = preset.params[parameter];
  return withParam(preset, parameter, { ...current, k: { ...current.k, [family]: coefficient } });
}

/**
 * Applies a preset to one weight set. `scale` and `pan` come from the shared rules because they
 * describe the molecule, not a knob a visitor should move.
 */
export function presetMapping(
  preset: MappingPreset,
  weights: Readonly<FamilyWeights>,
  xPosition = 0,
): Mapping {
  const rules = deriveMapping(weights, xPosition);
  const values = Object.fromEntries(
    MAPPING_PARAMETERS.map((parameter) => {
      const [lo, hi] = PARAMETER_RANGES[parameter];
      const { bias, k } = preset.params[parameter];
      let blend = bias;
      for (const family of FAMILIES) blend += (k[family] ?? 0) * (weights[family] ?? 0);
      const value = lo + (hi - lo) * clamp01(blend);
      return [parameter, parameter === "registerMidi" ? Math.round(value) : value];
    }),
  ) as Record<MappingParameter, number>;
  return { ...DEFAULT_MAPPING, ...values, scale: rules.scale, pan: rules.pan };
}

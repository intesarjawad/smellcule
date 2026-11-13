/**
 * The contract between the interface and a sound engine. The interface only ever hands over
 * numbers it already derived, so a target can live in the page, in an offline render or in
 * another program without knowing anything about odours.
 */

import { FAMILIES, type FamilyWeights, type Mapping, type ScaleName } from "./mapping";

export type { FamilyWeights, ScaleName };

export type MusicParams = Mapping;

export interface SoundTarget {
  readonly kind: "webaudio" | "ghostband";
  /** Must be called from a user gesture, since browsers gate audio behind one. */
  start(): Promise<void>;
  apply(params: MusicParams, families: FamilyWeights, glideMs: number): void;
  /** Leaves the output silent within 50 ms. */
  stop(): void;
  dispose(): void;
}

export const SOUND_MESSAGE_TYPE = "scent.sound";
export const SOUND_MESSAGE_VERSION = 1;

const SCALES: readonly ScaleName[] = ["majorPentatonic", "minorPentatonic", "dorian"];

export interface SoundSource {
  readonly a: string;
  readonly b: string;
  readonly t: number;
}

/** The versioned message an external target receives instead of a function call. */
export interface SoundMessage {
  readonly type: typeof SOUND_MESSAGE_TYPE;
  readonly v: typeof SOUND_MESSAGE_VERSION;
  readonly params: MusicParams;
  readonly families: FamilyWeights;
  readonly glideMs: number;
  readonly source: SoundSource;
}

export class SoundMessageError extends Error {
  readonly reason: string;

  constructor(reason: string) {
    super(reason);
    this.name = "SoundMessageError";
    this.reason = reason;
  }
}

export function soundMessage(
  params: MusicParams,
  families: FamilyWeights,
  glideMs: number,
  source: SoundSource,
): SoundMessage {
  return {
    type: SOUND_MESSAGE_TYPE,
    v: SOUND_MESSAGE_VERSION,
    params,
    families,
    glideMs,
    source,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function finite(value: unknown, path: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new SoundMessageError(`${path}: expected a finite number.`);
  }
  return value;
}

function record(value: unknown, path: string): Record<string, unknown> {
  if (!isRecord(value)) throw new SoundMessageError(`${path}: expected an object.`);
  return value;
}

const PARAM_FIELDS = [
  "tempoBpm",
  "brightness",
  "warmth",
  "roughness",
  "notesPerBeat",
  "registerMidi",
  "attackMs",
  "reverbMix",
  "pan",
] as const;

function parseParams(value: unknown): MusicParams {
  const item = record(value, "params");
  const params = Object.fromEntries(
    PARAM_FIELDS.map((field) => [field, finite(item[field], `params.${field}`)]),
  ) as Record<(typeof PARAM_FIELDS)[number], number>;
  const scale = item.scale;
  if (typeof scale !== "string" || !SCALES.some((name) => name === scale)) {
    throw new SoundMessageError("params.scale: expected a known scale.");
  }
  return { ...params, scale: scale as ScaleName };
}

function parseFamilies(value: unknown): FamilyWeights {
  const item = record(value, "families");
  for (const key of Object.keys(item)) {
    if (!FAMILIES.some((family) => family === key)) {
      throw new SoundMessageError(`families: unknown family ${key}.`);
    }
  }
  return Object.fromEntries(
    FAMILIES.map((family) => {
      if (!(family in item)) throw new SoundMessageError(`families.${family}: missing.`);
      return [family, finite(item[family], `families.${family}`)];
    }),
  ) as FamilyWeights;
}

export function encodeSoundMessage(message: SoundMessage): string {
  return JSON.stringify(message);
}

export function decodeSoundMessage(text: string): SoundMessage {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new SoundMessageError("message: expected JSON.");
  }
  const item = record(value, "message");
  if (item.type !== SOUND_MESSAGE_TYPE) {
    throw new SoundMessageError(`message.type: expected ${SOUND_MESSAGE_TYPE}.`);
  }
  if (item.v !== SOUND_MESSAGE_VERSION) {
    throw new SoundMessageError(`message.v: expected ${SOUND_MESSAGE_VERSION}.`);
  }
  const source = record(item.source, "source");
  if (typeof source.a !== "string" || typeof source.b !== "string") {
    throw new SoundMessageError("source: expected string ids.");
  }
  const t = finite(source.t, "source.t");
  if (t < 0 || t > 1) throw new SoundMessageError("source.t: expected a fraction in [0, 1].");
  const glideMs = finite(item.glideMs, "glideMs");
  if (glideMs < 0) throw new SoundMessageError("glideMs: expected a non-negative duration.");
  return soundMessage(parseParams(item.params), parseFamilies(item.families), glideMs, {
    a: source.a,
    b: source.b,
    t,
  });
}

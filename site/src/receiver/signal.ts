/**
 * What a station broadcasts when the needle settles: its top predicted descriptors, each with the
 * colour of its family and the ensemble's spread. The embers take their colour and scatter from
 * this, and the dissolve front is a noise field both the shader and the particles read, so a
 * letter disappears in the same frame its embers leave.
 */

import { mulberry32 } from "../synesthesia/sequencer";

export interface SignalWord {
  readonly label: string;
  readonly probability: number;
  readonly spread: number;
  readonly colour: string;
}

export const SIGNAL_WORDS = 8;
/**
 * The front crosses the name in the first part of the dissolve. Each burned pixel then sits as
 * ash for up to ASH_SPAN before its ember lets go, so a letter sheds a curtain rather than
 * dropping whole, and every ember has landed by progress 1.
 */
export const DEPART_SPAN = 0.5;
export const ASH_SPAN = 0.22;
export const FLIGHT_SPAN = 1 - DEPART_SPAN - ASH_SPAN;
export const NOISE_WIDTH = 64;
export const NOISE_HEIGHT = 16;
/** How strongly the front sweeps left to right; the rest of each pixel's turn is noise. */
export const FRONT_LEAN = 0.96;
export const BROADCAST_MS = 4400;
export const GATHER_MS = 850;

export function signalWords(
  labels: readonly string[],
  probabilities: ArrayLike<number>,
  spreads: ArrayLike<number>,
  colourOf: ReadonlyMap<string, string>,
  fallbackColour: string,
): SignalWord[] {
  return labels
    .map((label, index) => ({
      label,
      probability: probabilities[index] ?? 0,
      spread: spreads[index] ?? 0,
      colour: colourOf.get(label) ?? fallbackColour,
    }))
    .filter((word) => word.probability > 0)
    .sort((a, b) => b.probability - a.probability || a.label.localeCompare(b.label))
    .slice(0, SIGNAL_WORDS);
}

/** Picks a word for each ember in proportion to its predicted probability. */
export function pickWords(words: readonly SignalWord[], count: number, seed: number): number[] {
  const total = words.reduce((sum, word) => sum + word.probability, 0);
  const random = mulberry32(seed);
  const picks: number[] = [];
  for (let k = 0; k < count; k += 1) {
    let left = random() * total;
    let chosen = words.length - 1;
    for (let index = 0; index < words.length; index += 1) {
      left -= words[index]?.probability ?? 0;
      if (left <= 0) {
        chosen = index;
        break;
      }
    }
    picks.push(chosen);
  }
  return picks;
}

export function noiseField(seed: number): Uint8Array {
  const random = mulberry32(seed);
  return Uint8Array.from({ length: NOISE_WIDTH * NOISE_HEIGHT }, () => Math.round(random() * 255));
}

/**
 * Bilinear read at texel centres with clamped edges, which is what a linear-filtered texture
 * returns, so JavaScript and the shader agree on every pixel's departure.
 */
export function noiseAt(field: Uint8Array, u: number, v: number): number {
  const x = Math.min(Math.max(u * NOISE_WIDTH - 0.5, 0), NOISE_WIDTH - 1);
  const y = Math.min(Math.max(v * NOISE_HEIGHT - 0.5, 0), NOISE_HEIGHT - 1);
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const x1 = Math.min(x0 + 1, NOISE_WIDTH - 1);
  const y1 = Math.min(y0 + 1, NOISE_HEIGHT - 1);
  const fx = x - x0;
  const fy = y - y0;
  const at = (i: number, j: number) => (field[j * NOISE_WIDTH + i] ?? 0) / 255;
  const top = at(x0, y0) * (1 - fx) + at(x1, y0) * fx;
  const bottom = at(x0, y1) * (1 - fx) + at(x1, y1) * fx;
  return top * (1 - fy) + bottom * fy;
}

/** Dissolve progress at which the pixel at (u, v) of the readout lets go. */
export function departure(field: Uint8Array, u: number, v: number): number {
  return ((1 - FRONT_LEAN) * noiseAt(field, u, v) + FRONT_LEAN * u) * DEPART_SPAN;
}

/** A stable seed from a molecule id, so the same station always burns the same way. */
export function seedOf(id: string): number {
  let hash = 0x811c9dc5;
  for (const char of id) hash = Math.imul(hash ^ (char.codePointAt(0) ?? 0), 0x01000193) >>> 0;
  return hash;
}

export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface River {
  /** The height the embers run at, along the bottom of the glass. */
  readonly y: number;
  /** Where the river leaves the glass, and where it comes into the grille. */
  readonly mouth: readonly [number, number];
  readonly entry: readonly [number, number];
  /** True when the grille sits under the glass and the river drops into it. */
  readonly down: boolean;
  /** The port: the gutter cut on through the bezel and into the grille, in place of one hole. */
  readonly slot: Rect;
  /** The holes left out around the port, in the grille's own coordinates, on whole cells. */
  readonly bare: Rect;
}

/**
 * The grille's holes along one side: as many whole holes as fit, spread to fill the side exactly,
 * the way `background-repeat: space` lays them out, so none is cut by an edge.
 */
export function holeRow(length: number, pitch: number): { count: number; stride: number } {
  const count = Math.max(1, Math.floor(length / pitch));
  return { count, stride: count > 1 ? (length - pitch) / (count - 1) : pitch };
}

/** Distance of the river above the bottom edge of the glass. */
export const RIVER_INSET = 14;
/** Width of the gutter the river runs in, under the last band and on through the bezel. */
export const SLOT_WIDTH = 14;
/** Height above the bottom of the glass that the gutter keeps clear, before it levels with a row. */
export const GUTTER_TOP = RIVER_INSET + SLOT_WIDTH / 2;

/**
 * The river's course: along the bottom of the glass and through a port into the grille, which
 * sits either to the right of the glass (wide screens) or under it (phones). The port takes the
 * place of the first hole in its line, ending one ordinary gap short of the next, so the river
 * runs straight into a real hole. Beside the glass the gutter moves by up to half a hole to run
 * level with the nearest row; under it the port drops onto the column nearest the middle.
 */
export function riverOf(glass: Rect, grille: Rect, pitch: number, hole: number): River {
  const base = glass.y + glass.height - RIVER_INSET;
  const columns = holeRow(grille.width, pitch);
  const rows = holeRow(grille.height, pitch);
  const down = grille.x < glass.x + glass.width - 1;
  const half = SLOT_WIDTH / 2 + 1;
  if (!down) {
    const row = Math.min(
      Math.max(Math.round((base - grille.y - pitch / 2) / rows.stride), 1),
      rows.count - 2,
    );
    const level = grille.y + pitch / 2 + row * rows.stride;
    const y = Math.abs(level - base) <= rows.stride / 2 ? level : base;
    const left = glass.x + glass.width;
    // The bare margin is the port's own hole and the ones just above and below it.
    return {
      y,
      mouth: [left, y],
      entry: [grille.x, y],
      down,
      slot: { x: left, y: y - half, width: grille.x + pitch / 2 + hole - left, height: 2 * half },
      bare: { x: 0, y: (row - 1) * rows.stride, width: pitch, height: 2 * rows.stride + pitch },
    };
  }
  const column = Math.round((grille.width / 2 - pitch / 2) / columns.stride);
  const x = grille.x + pitch / 2 + column * columns.stride;
  const bottom = glass.y + glass.height;
  return {
    y: base,
    mouth: [x, bottom],
    entry: [x, grille.y],
    down,
    slot: { x: x - half, y: bottom, width: 2 * half, height: grille.y + pitch / 2 + hole - bottom },
    bare: {
      x: (column - 1) * columns.stride,
      y: 0,
      width: 2 * columns.stride + pitch,
      height: pitch,
    },
  };
}

/**
 * Deterministic melody generation. A bar depends only on the mapping, the molecule ids and the
 * bar index, so replaying a morph reproduces the same notes without storing them.
 */

import { type Mapping, SCALES } from "./mapping";

export const BEATS_PER_BAR = 4;
export const TIMER_INTERVAL_MS = 25;
export const LOOKAHEAD_SECONDS = 0.1;
export const REST_PROBABILITY = 0.15;

const WALK_STEPS = [-2, -1, 0, 1, 2] as const;

export interface Note {
  /** Offset from the start of the bar, in beats. */
  beat: number;
  midi: number;
}

export interface Bar {
  barIndex: number;
  scale: Mapping["scale"];
  notes: Note[];
  /** Scale-degree position carried into the next bar. */
  endDegree: number;
}

export interface BarTiming {
  barIndex: number;
  startTime: number;
  secondsPerBeat: number;
}

export interface ScheduledNote {
  barIndex: number;
  time: number;
  midi: number;
}

export function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** FNV-1a over the three parts, with separators so adjacent ids cannot collide. */
export function hash(aId: string, bId: string, barIndex: number): number {
  let digest = 0x811c9dc5;
  const key = `${aId}\u0000${bId}\u0000${barIndex}`;
  for (let index = 0; index < key.length; index += 1) {
    digest ^= key.charCodeAt(index);
    digest = Math.imul(digest, 0x01000193);
  }
  return digest >>> 0;
}

export function midiForDegree(
  registerMidi: number,
  scale: readonly number[],
  degree: number,
): number {
  const size = scale.length;
  const octave = Math.floor(degree / size);
  const index = ((degree % size) + size) % size;
  return registerMidi + octave * 12 + (scale[index] ?? 0);
}

/**
 * Builds one bar. The integer part of the density is guaranteed; the fractional part is the
 * chance of one extra note per beat. Rests advance the walk silently so a rest never shifts the
 * melody that follows it.
 */
export function generateBar(
  mapping: Readonly<Mapping>,
  aId: string,
  bId: string,
  barIndex: number,
  startDegree = 0,
): Bar {
  const random = mulberry32(hash(aId, bId, barIndex));
  const scale = SCALES[mapping.scale];
  const whole = Math.floor(mapping.notesPerBeat);
  const fraction = mapping.notesPerBeat - whole;
  const notes: Note[] = [];
  let degree = startDegree;

  for (let beat = 0; beat < BEATS_PER_BAR; beat += 1) {
    const count = whole + (fraction > 0 && random() < fraction ? 1 : 0);
    for (let noteIndex = 0; noteIndex < count; noteIndex += 1) {
      const step = WALK_STEPS[Math.floor(random() * WALK_STEPS.length)] ?? 0;
      degree += step;
      if (random() < REST_PROBABILITY) continue;
      notes.push({
        beat: beat + noteIndex / count,
        midi: midiForDegree(mapping.registerMidi, scale, degree),
      });
    }
  }

  return { barIndex, scale: mapping.scale, notes, endDegree: degree };
}

export function barTiming(barIndex: number, tempoBpm: number, originSeconds = 0): BarTiming {
  const secondsPerBeat = 60 / tempoBpm;
  return {
    barIndex,
    startTime: originSeconds + barIndex * BEATS_PER_BAR * secondsPerBeat,
    secondsPerBeat,
  };
}

/** Note onsets inside a look-ahead window, in absolute seconds. */
export function eventsInWindow(
  bar: Readonly<Bar>,
  timing: Readonly<BarTiming>,
  fromSeconds: number,
  untilSeconds: number,
): ScheduledNote[] {
  return bar.notes
    .map((note) => ({
      barIndex: bar.barIndex,
      time: timing.startTime + note.beat * timing.secondsPerBeat,
      midi: note.midi,
    }))
    .filter((note) => note.time >= fromSeconds && note.time < untilSeconds);
}

/** Time constant for `setTargetAtTime`; three time constants settle a parameter. */
export function glideTimeConstant(glideMs: number): number {
  return Math.max(0, glideMs) / 3000;
}

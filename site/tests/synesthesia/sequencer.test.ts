import { describe, expect, it } from "vitest";
import { DEFAULT_MAPPING, type Mapping } from "../../src/synesthesia/mapping";
import {
  type Bar,
  barTiming,
  eventsInWindow,
  generateBar,
  glideTimeConstant,
  hash,
  LOOKAHEAD_SECONDS,
  midiForDegree,
  mulberry32,
  REST_PROBABILITY,
  TIMER_INTERVAL_MS,
} from "../../src/synesthesia/sequencer";

describe("mulberry32", () => {
  it("matches the reference sequence for seed 42", () => {
    const random = mulberry32(42);
    expect(random()).toBeCloseTo(0.6011037519201636, 15);
    expect(random()).toBeCloseTo(0.44829055899754167, 15);
    expect(random()).toBeCloseTo(0.8524657934904099, 15);
  });

  it("stays inside [0, 1)", () => {
    const random = mulberry32(7);
    for (let index = 0; index < 100; index += 1) {
      const value = random();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });
});

describe("hash", () => {
  it("is stable for the same ids and bar", () => {
    expect(hash("vanillin", "limonene", 0)).toBe(4025877809);
    expect(hash("a", "b", 0)).toBe(2809636434);
    expect(hash("a", "b", 1)).toBe(2826414053);
  });

  it("separates the parts so ids cannot run together", () => {
    expect(hash("ab", "c", 0)).not.toBe(hash("a", "bc", 0));
  });
});

describe("midiForDegree", () => {
  const major = [0, 2, 4, 7, 9];

  it("walks within the scale and continues into the next octave", () => {
    expect(midiForDegree(60, major, 0)).toBe(60);
    expect(midiForDegree(60, major, 4)).toBe(69);
    expect(midiForDegree(60, major, 5)).toBe(72);
    expect(midiForDegree(60, major, 7)).toBe(76);
  });

  it("wraps below the root", () => {
    expect(midiForDegree(60, major, -1)).toBe(57);
    expect(midiForDegree(60, major, -5)).toBe(48);
  });
});

describe("generateBar", () => {
  const mapping: Mapping = {
    ...DEFAULT_MAPPING,
    notesPerBeat: 2,
    registerMidi: 60,
    scale: "majorPentatonic",
  };

  it("reproduces the same bar for the same inputs", () => {
    const first = generateBar(mapping, "vanillin", "limonene", 3);
    const second = generateBar(mapping, "vanillin", "limonene", 3);
    expect(second).toEqual(first);
  });

  it("changes with the bar index", () => {
    expect(generateBar(mapping, "vanillin", "limonene", 4)).not.toEqual(
      generateBar(mapping, "vanillin", "limonene", 3),
    );
  });

  it("places notes on the even grid inside the bar", () => {
    const bar = generateBar(mapping, "geosmin", "cedrol", 0);
    const grid = [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5];
    for (const note of bar.notes) {
      expect(grid).toContain(note.beat);
      expect(Number.isInteger(note.midi)).toBe(true);
    }
    for (let index = 1; index < bar.notes.length; index += 1) {
      expect(bar.notes[index]?.beat).toBeGreaterThan(bar.notes[index - 1]?.beat ?? -1);
    }
  });

  it("rests about as often as the stated probability", () => {
    const dense: Mapping = { ...mapping, notesPerBeat: 4 };
    let notes = 0;
    const bars = 200;
    for (let barIndex = 0; barIndex < bars; barIndex += 1) {
      notes += generateBar(dense, "a", "b", barIndex).notes.length;
    }
    const restRate = 1 - notes / (bars * 4 * 4);
    expect(restRate).toBeGreaterThan(REST_PROBABILITY - 0.03);
    expect(restRate).toBeLessThan(REST_PROBABILITY + 0.03);
  });
});

describe("barTiming", () => {
  it("counts four beats per bar from the origin", () => {
    const timing = barTiming(3, 90, 2);
    expect(timing.secondsPerBeat).toBeCloseTo(2 / 3, 12);
    expect(timing.startTime).toBeCloseTo(10, 12);
  });
});

describe("eventsInWindow", () => {
  const bar: Bar = {
    barIndex: 2,
    scale: "majorPentatonic",
    notes: [
      { beat: 0, midi: 60 },
      { beat: 1.5, midi: 62 },
      { beat: 2, midi: 64 },
    ],
    endDegree: 0,
  };

  it("returns onsets inside a half-open look-ahead window", () => {
    const timing = barTiming(2, 120, 10);
    const due = eventsInWindow(bar, timing, 14.5, 15.1);
    expect(due).toEqual([
      { barIndex: 2, time: 14.75, midi: 62 },
      { barIndex: 2, time: 15, midi: 64 },
    ]);
  });

  it("keeps the window end exclusive", () => {
    const timing = barTiming(2, 120, 10);
    expect(eventsInWindow(bar, timing, 14, 14.75)).toEqual([{ barIndex: 2, time: 14, midi: 60 }]);
  });
});

describe("scheduler constants", () => {
  it("uses a 25 ms timer and a 100 ms look-ahead", () => {
    expect(TIMER_INTERVAL_MS).toBe(25);
    expect(LOOKAHEAD_SECONDS).toBe(0.1);
  });

  it("settles a glide in three time constants", () => {
    expect(glideTimeConstant(300)).toBeCloseTo(0.1, 12);
    expect(glideTimeConstant(0)).toBe(0);
    expect(glideTimeConstant(-30)).toBe(0);
  });
});

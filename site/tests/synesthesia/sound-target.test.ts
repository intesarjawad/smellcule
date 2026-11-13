import { describe, expect, it } from "vitest";
import { DEFAULT_MAPPING, DEFAULT_WEIGHTS } from "../../src/synesthesia/mapping";
import {
  decodeSoundMessage,
  encodeSoundMessage,
  SOUND_MESSAGE_TYPE,
  SOUND_MESSAGE_VERSION,
  type SoundMessage,
  SoundMessageError,
  soundMessage,
} from "../../src/synesthesia/sound-target";

const source = { a: "425", b: "2279", t: 0.25 };

function message(): SoundMessage {
  return soundMessage(DEFAULT_MAPPING, DEFAULT_WEIGHTS, 300, source);
}

describe("soundMessage", () => {
  it("builds the versioned wire shape", () => {
    expect(message()).toEqual({
      type: "scent.sound",
      v: 1,
      params: DEFAULT_MAPPING,
      families: DEFAULT_WEIGHTS,
      glideMs: 300,
      source,
    });
  });

  it("round-trips through JSON without losing any field", () => {
    const encoded = encodeSoundMessage(message());
    expect(encoded).toContain(`"type":"${SOUND_MESSAGE_TYPE}"`);
    expect(encoded).toContain(`"v":${SOUND_MESSAGE_VERSION}`);
    expect(decodeSoundMessage(encoded)).toEqual(message());
  });

  it("rejects malformed messages", () => {
    const valid = message();
    const cases: unknown[] = [
      "{",
      { ...valid, type: "scent.other" },
      { ...valid, v: 2 },
      { ...valid, params: { ...valid.params, scale: "lydian" } },
      { ...valid, params: { ...valid.params, tempoBpm: "fast" } },
      { ...valid, families: { citrus: Number.POSITIVE_INFINITY } },
      { ...valid, families: { citrus: 1 } },
      { ...valid, source: { ...source, t: 1.5 } },
      { ...valid, source: { ...source, a: 425 } },
      { ...valid, glideMs: -1 },
    ];
    for (const value of cases) {
      const text = typeof value === "string" ? value : JSON.stringify(value);
      expect(() => decodeSoundMessage(text)).toThrow(SoundMessageError);
    }
  });
});

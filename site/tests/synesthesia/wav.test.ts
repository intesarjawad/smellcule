import { describe, expect, it } from "vitest";
import { encodeWav, toPcm16 } from "../../src/synesthesia/wav";

function ascii(bytes: Uint8Array, offset: number, length: number): string {
  return String.fromCharCode(...bytes.subarray(offset, offset + length));
}

describe("toPcm16", () => {
  it("uses the full 16-bit range", () => {
    expect(toPcm16(0)).toBe(0);
    expect(toPcm16(1)).toBe(32767);
    expect(toPcm16(-1)).toBe(-32768);
    expect(toPcm16(0.5)).toBe(16384);
    expect(toPcm16(-0.5)).toBe(-16384);
    expect(toPcm16(0.25)).toBe(8192);
  });

  it("clamps samples outside the float range", () => {
    expect(toPcm16(2)).toBe(32767);
    expect(toPcm16(-2)).toBe(-32768);
  });
});

describe("encodeWav", () => {
  it("writes a mono PCM header and samples", () => {
    const bytes = encodeWav([new Float32Array([0, 0.5, -0.5, 1, -1])], 8000);
    const view = new DataView(bytes.buffer);

    expect(bytes.length).toBe(54);
    expect(ascii(bytes, 0, 4)).toBe("RIFF");
    expect(view.getUint32(4, true)).toBe(46);
    expect(ascii(bytes, 8, 4)).toBe("WAVE");
    expect(ascii(bytes, 12, 4)).toBe("fmt ");
    expect(view.getUint32(16, true)).toBe(16);
    expect(view.getUint16(20, true)).toBe(1);
    expect(view.getUint16(22, true)).toBe(1);
    expect(view.getUint32(24, true)).toBe(8000);
    expect(view.getUint32(28, true)).toBe(16000);
    expect(view.getUint16(32, true)).toBe(2);
    expect(view.getUint16(34, true)).toBe(16);
    expect(ascii(bytes, 36, 4)).toBe("data");
    expect(view.getUint32(40, true)).toBe(10);
    expect(view.getInt16(44, true)).toBe(0);
    expect(view.getInt16(46, true)).toBe(16384);
    expect(view.getInt16(48, true)).toBe(-16384);
    expect(view.getInt16(50, true)).toBe(32767);
    expect(view.getInt16(52, true)).toBe(-32768);
  });

  it("interleaves stereo channels", () => {
    const left = new Float32Array([0.5, -0.5]);
    const right = new Float32Array([-1, 1]);
    const bytes = encodeWav([left, right], 44100);
    const view = new DataView(bytes.buffer);

    expect(bytes.length).toBe(52);
    expect(view.getUint16(22, true)).toBe(2);
    expect(view.getUint32(28, true)).toBe(176400);
    expect(view.getUint16(32, true)).toBe(4);
    expect(view.getUint32(40, true)).toBe(8);
    expect(view.getInt16(44, true)).toBe(16384);
    expect(view.getInt16(46, true)).toBe(-32768);
    expect(view.getInt16(48, true)).toBe(-16384);
    expect(view.getInt16(50, true)).toBe(32767);
  });

  it("rejects empty or mismatched input", () => {
    expect(() => encodeWav([], 44100)).toThrow(RangeError);
    expect(() => encodeWav([new Float32Array(2), new Float32Array(3)], 44100)).toThrow(RangeError);
    expect(() => encodeWav([new Float32Array(1)], 0)).toThrow(RangeError);
    expect(() => encodeWav([new Float32Array(1)], 44100.5)).toThrow(RangeError);
  });
});

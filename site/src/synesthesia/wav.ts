/**
 * Minimal 16-bit PCM WAV encoder. The offline renderer produces float samples; this is the only
 * place that turns them into a file, with no audio context involved.
 */

const HEADER_BYTES = 44;
const BITS_PER_SAMPLE = 16;
const PCM_FORMAT = 1;

function writeAscii(view: DataView, offset: number, text: string): void {
  for (let index = 0; index < text.length; index += 1) {
    view.setUint8(offset + index, text.charCodeAt(index));
  }
}

/** Symmetric around zero: the negative side gets one extra step, as 16-bit PCM expects. */
export function toPcm16(sample: number): number {
  const clamped = Math.min(1, Math.max(-1, sample));
  return Math.round(clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff);
}

export function encodeWav(channels: readonly Float32Array[], sampleRate: number): Uint8Array {
  const channelCount = channels.length;
  if (channelCount === 0) throw new RangeError("encodeWav needs at least one channel");
  if (!Number.isInteger(sampleRate) || sampleRate <= 0) {
    throw new RangeError(`encodeWav needs a positive integer sample rate, got ${sampleRate}`);
  }

  const frames = channels[0]?.length ?? 0;
  for (const channel of channels) {
    if (channel.length !== frames) throw new RangeError("encodeWav channels must be equal length");
  }

  const blockAlign = channelCount * (BITS_PER_SAMPLE / 8);
  const dataBytes = frames * blockAlign;
  const buffer = new ArrayBuffer(HEADER_BYTES + dataBytes);
  const view = new DataView(buffer);

  writeAscii(view, 0, "RIFF");
  view.setUint32(4, HEADER_BYTES - 8 + dataBytes, true);
  writeAscii(view, 8, "WAVE");
  writeAscii(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, PCM_FORMAT, true);
  view.setUint16(22, channelCount, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, BITS_PER_SAMPLE, true);
  writeAscii(view, 36, "data");
  view.setUint32(40, dataBytes, true);

  let offset = HEADER_BYTES;
  for (let frame = 0; frame < frames; frame += 1) {
    for (const channel of channels) {
      view.setInt16(offset, toPcm16(channel[frame] ?? 0), true);
      offset += 2;
    }
  }

  return new Uint8Array(buffer);
}

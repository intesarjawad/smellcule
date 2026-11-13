/**
 * The Web Audio target. The graph is built from an injected `BaseAudioContext`, so the live page
 * passes an `AudioContext` and the export passes an `OfflineAudioContext` without this module
 * knowing which one it got.
 */

import { DEFAULT_MAPPING, type FamilyWeights, type Mapping } from "./mapping";
import {
  type BarTiming,
  BEATS_PER_BAR,
  eventsInWindow,
  generateBar,
  glideTimeConstant,
  LOOKAHEAD_SECONDS,
  mulberry32,
  TIMER_INTERVAL_MS,
} from "./sequencer";
import type { MusicParams, SoundTarget } from "./sound-target";

export const MASTER_DBFS = -12;
export const IMPULSE_SECONDS = 2.5;
export const IMPULSE_SEED = 0x5eed_5eed;
export const STOP_FADE_SECONDS = 0.05;
export const MODULATOR_RATIO = 2;
export const MAX_FM_INDEX = 3;
export const CUTOFF_HZ: readonly [number, number] = [300, 8000];
export const PAD_GAIN_RANGE: readonly [number, number] = [0.05, 0.35];
export const PAD_DETUNE_CENTS = 12;

const NOTE_PEAK = 0.5;
const SUSTAIN_LEVEL = 0.6;
const DECAY_SECONDS = 0.08;
const RELEASE_SECONDS = 0.12;
const LEAD_SECONDS = 0.02;

export function masterGain(): number {
  return 10 ** (MASTER_DBFS / 20);
}

export function midiToFrequency(midi: number): number {
  return 440 * 2 ** ((midi - 69) / 12);
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

/** Brightness opens the low-pass logarithmically, so the middle of the range sounds centred. */
export function cutoffFor(brightness: number): number {
  const [low, high] = CUTOFF_HZ;
  return low * (high / low) ** clamp01(brightness);
}

export function padGainFor(warmth: number): number {
  const [low, high] = PAD_GAIN_RANGE;
  return low + (high - low) * clamp01(warmth);
}

export function padDetuneFor(warmth: number): number {
  return PAD_DETUNE_CENTS * clamp01(warmth);
}

export function fmIndexFor(roughness: number): number {
  return MAX_FM_INDEX * clamp01(roughness);
}

/** Stereo noise with an exponential tail, seeded so every render of a pair sounds the same. */
export function createImpulse(
  context: BaseAudioContext,
  seconds = IMPULSE_SECONDS,
  seed = IMPULSE_SEED,
): AudioBuffer {
  const frames = Math.max(1, Math.round(seconds * context.sampleRate));
  const buffer = context.createBuffer(2, frames, context.sampleRate);
  const random = mulberry32(seed);
  for (let channel = 0; channel < 2; channel += 1) {
    const data = buffer.getChannelData(channel);
    for (let frame = 0; frame < frames; frame += 1) {
      data[frame] = (random() * 2 - 1) * Math.exp((-6 * frame) / frames);
    }
  }
  return buffer;
}

export interface WebAudioGraph {
  readonly master: GainNode;
  /** After the compressor, so a stop also silences the reverb tail. */
  readonly output: GainNode;
  readonly dry: GainNode;
  readonly wet: GainNode;
  readonly convolver: ConvolverNode;
  readonly compressor: DynamicsCompressorNode;
  readonly padFilter: BiquadFilterNode;
  readonly padGain: GainNode;
  readonly pad: readonly [OscillatorNode, OscillatorNode];
}

export interface WebAudioOptions {
  readonly aId?: string;
  readonly bId?: string;
}

export interface WebAudioTarget extends SoundTarget {
  readonly kind: "webaudio";
  readonly graph: WebAudioGraph;
  /**
   * Schedules every note up to `untilSeconds` in one go. An offline context's clock only moves
   * while it renders, so the timer-driven look-ahead would never get past the first window.
   */
  scheduleThrough(untilSeconds: number): void;
}

export function buildWebAudioGraph(context: BaseAudioContext): WebAudioGraph {
  const master = context.createGain();
  master.gain.value = masterGain();
  const dry = context.createGain();
  dry.gain.value = 1;
  const wet = context.createGain();
  wet.gain.value = DEFAULT_MAPPING.reverbMix;
  const convolver = context.createConvolver();
  convolver.buffer = createImpulse(context);
  const compressor = context.createDynamicsCompressor();
  const output = context.createGain();
  output.gain.value = 1;

  master.connect(dry);
  dry.connect(compressor);
  master.connect(wet);
  wet.connect(convolver);
  convolver.connect(compressor);
  compressor.connect(output);
  output.connect(context.destination);

  const padFilter = context.createBiquadFilter();
  padFilter.type = "lowpass";
  padFilter.frequency.value = cutoffFor(DEFAULT_MAPPING.brightness);
  const padGain = context.createGain();
  padGain.gain.value = padGainFor(DEFAULT_MAPPING.warmth);
  const padFrequency = midiToFrequency(DEFAULT_MAPPING.registerMidi - 12);
  const padA = context.createOscillator();
  padA.type = "sawtooth";
  padA.frequency.value = padFrequency;
  const padB = context.createOscillator();
  padB.type = "sawtooth";
  padB.frequency.value = padFrequency;
  padA.connect(padFilter);
  padB.connect(padFilter);
  padFilter.connect(padGain);
  padGain.connect(master);

  return {
    master,
    output,
    dry,
    wet,
    convolver,
    compressor,
    padFilter,
    padGain,
    pad: [padA, padB],
  };
}

interface Voice {
  readonly carrier: OscillatorNode;
  readonly modulator: OscillatorNode;
}

/** Builds a running target; nothing is audible until `start`. */
export function createWebAudioTarget(
  context: BaseAudioContext,
  options: WebAudioOptions = {},
): WebAudioTarget {
  const graph = buildWebAudioGraph(context);
  const aId = options.aId ?? "";
  const bId = options.bId ?? "";
  const voices = new Set<Voice>();
  let params: Mapping = DEFAULT_MAPPING;
  let running = false;
  let disposed = false;
  let padStarted = false;
  let barIndex = 0;
  let degree = 0;
  let nextBarStart = 0;
  let timer: ReturnType<typeof setInterval> | null = null;

  function playNote(midi: number, time: number, secondsPerBeat: number, voice: Mapping): void {
    const frequency = midiToFrequency(midi);
    const carrier = context.createOscillator();
    carrier.type = "triangle";
    carrier.frequency.setValueAtTime(frequency, time);

    const modulator = context.createOscillator();
    modulator.type = "sine";
    modulator.frequency.setValueAtTime(frequency * MODULATOR_RATIO, time);
    const index = context.createGain();
    index.gain.setValueAtTime(fmIndexFor(voice.roughness) * frequency, time);
    modulator.connect(index);
    index.connect(carrier.frequency);

    const filter = context.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(cutoffFor(voice.brightness), time);

    const envelope = context.createGain();
    const attack = Math.max(0.001, voice.attackMs / 1000);
    const sustain = NOTE_PEAK * SUSTAIN_LEVEL;
    const held = Math.max(attack + DECAY_SECONDS + 0.02, secondsPerBeat);
    envelope.gain.setValueAtTime(0, time);
    envelope.gain.linearRampToValueAtTime(NOTE_PEAK, time + attack);
    envelope.gain.linearRampToValueAtTime(sustain, time + attack + DECAY_SECONDS);
    envelope.gain.setValueAtTime(sustain, time + held);
    envelope.gain.linearRampToValueAtTime(0, time + held + RELEASE_SECONDS);

    const panner = context.createStereoPanner();
    panner.pan.setValueAtTime(voice.pan, time);

    carrier.connect(filter);
    filter.connect(envelope);
    envelope.connect(panner);
    panner.connect(graph.master);

    const endsAt = time + held + RELEASE_SECONDS;
    carrier.start(time);
    modulator.start(time);
    carrier.stop(endsAt);
    modulator.stop(endsAt);
    const entry = { carrier, modulator };
    voices.add(entry);
    carrier.onended = () => {
      voices.delete(entry);
      carrier.disconnect();
      modulator.disconnect();
    };
  }

  function schedule(now: number, horizon: number): void {
    while (nextBarStart < horizon) {
      const bar = generateBar(params, aId, bId, barIndex, degree);
      degree = bar.endDegree;
      const timing: BarTiming = {
        barIndex,
        startTime: nextBarStart,
        secondsPerBeat: 60 / params.tempoBpm,
      };
      for (const note of eventsInWindow(bar, timing, now, horizon)) {
        playNote(note.midi, note.time, timing.secondsPerBeat, params);
      }
      barIndex += 1;
      nextBarStart += BEATS_PER_BAR * timing.secondsPerBeat;
    }
  }

  function tick(): void {
    if (!running) return;
    const now = context.currentTime;
    schedule(now, now + LOOKAHEAD_SECONDS);
  }

  function begin(): void {
    running = true;
    const now = context.currentTime;
    for (const [param, value] of [
      [graph.master.gain, masterGain()],
      [graph.output.gain, 1],
    ] as const) {
      param.cancelScheduledValues(now);
      param.setValueAtTime(value, now);
    }
    if (!padStarted) {
      graph.pad[0].start(now);
      graph.pad[1].start(now);
      padStarted = true;
    }
    barIndex = 0;
    degree = 0;
    nextBarStart = now + LEAD_SECONDS;
  }

  /** A zero glide jumps; some engines reject a zero time constant. */
  function ramp(param: AudioParam, value: number, now: number, glideMs: number): void {
    param.cancelScheduledValues(now);
    if (glideMs <= 0) {
      param.setValueAtTime(value, now);
      return;
    }
    param.setTargetAtTime(value, now, glideTimeConstant(glideMs));
  }

  function applyParams(next: MusicParams, glideMs: number): void {
    params = next;
    const now = context.currentTime;
    const detune = padDetuneFor(next.warmth) / 2;
    const padFrequency = midiToFrequency(next.registerMidi - 12);
    ramp(graph.padFilter.frequency, cutoffFor(next.brightness), now, glideMs);
    ramp(graph.padGain.gain, padGainFor(next.warmth), now, glideMs);
    ramp(graph.wet.gain, next.reverbMix, now, glideMs);
    ramp(graph.pad[0].frequency, padFrequency, now, glideMs);
    ramp(graph.pad[1].frequency, padFrequency, now, glideMs);
    ramp(graph.pad[0].detune, -detune, now, glideMs);
    ramp(graph.pad[1].detune, detune, now, glideMs);
  }

  function stop(): void {
    if (timer !== null) {
      clearInterval(timer);
      timer = null;
    }
    running = false;
    const now = context.currentTime;
    const silentAt = now + STOP_FADE_SECONDS;
    for (const param of [graph.output.gain, graph.master.gain]) {
      param.cancelScheduledValues(now);
      param.setValueAtTime(param.value, now);
      param.linearRampToValueAtTime(0, silentAt);
    }
    for (const voice of voices) {
      voice.carrier.stop(silentAt);
      voice.modulator.stop(silentAt);
    }
    voices.clear();
  }

  return {
    kind: "webaudio",
    graph,
    async start(): Promise<void> {
      if (disposed) throw new Error("This sound target has been disposed.");
      if (running) return;
      const resumable = context as BaseAudioContext & { resume?: () => Promise<void> };
      await resumable.resume?.();
      begin();
      tick();
      timer = setInterval(tick, TIMER_INTERVAL_MS);
    },
    apply(next: MusicParams, _families: FamilyWeights, glideMs: number): void {
      applyParams(next, glideMs);
    },
    scheduleThrough(untilSeconds: number): void {
      if (disposed) throw new Error("This sound target has been disposed.");
      if (!running) begin();
      schedule(context.currentTime, untilSeconds);
    },
    stop,
    dispose(): void {
      if (disposed) return;
      stop();
      disposed = true;
      for (const oscillator of graph.pad) {
        oscillator.stop();
        oscillator.disconnect();
      }
      for (const node of [
        graph.padFilter,
        graph.padGain,
        graph.dry,
        graph.wet,
        graph.convolver,
        graph.compressor,
        graph.output,
        graph.master,
      ]) {
        node.disconnect();
      }
    },
  };
}

/**
 * Renders the whole length of an offline context with fixed parameters. The caller builds the
 * context, which decides the duration, channel count and sample rate.
 */
export async function renderOffline(
  context: OfflineAudioContext,
  params: MusicParams,
  families: FamilyWeights,
  options: WebAudioOptions = {},
): Promise<AudioBuffer> {
  const target = createWebAudioTarget(context, options);
  target.apply(params, families, 0);
  target.scheduleThrough(context.length / context.sampleRate);
  return context.startRendering();
}

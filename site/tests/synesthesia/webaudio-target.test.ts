import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_MAPPING, DEFAULT_WEIGHTS, type Mapping } from "../../src/synesthesia/mapping";
import { hash } from "../../src/synesthesia/sequencer";
import {
  createImpulse,
  createWebAudioTarget,
  IMPULSE_SECONDS,
  masterGain,
  midiToFrequency,
  renderOffline,
  STOP_FADE_SECONDS,
} from "../../src/synesthesia/webaudio-target";

type Event = {
  readonly kind: string;
  readonly value: number;
  readonly time: number;
  readonly constant?: number;
};

class FakeParam {
  value = 0;
  readonly events: Event[] = [];

  setValueAtTime(value: number, time: number): this {
    this.value = value;
    this.events.push({ kind: "set", value, time });
    return this;
  }

  cancelScheduledValues(time: number): this {
    this.events.push({ kind: "cancel", value: 0, time });
    return this;
  }

  setTargetAtTime(value: number, time: number, constant: number): this {
    this.events.push({ kind: "target", value, time, constant });
    return this;
  }

  linearRampToValueAtTime(value: number, time: number): this {
    this.value = value;
    this.events.push({ kind: "ramp", value, time });
    return this;
  }

  last(): Event {
    const event = this.events[this.events.length - 1];
    if (event === undefined) throw new Error("No parameter events");
    return event;
  }
}

class FakeNode {
  readonly connections: FakeNode[] = [];

  connect(target: FakeNode): FakeNode {
    this.connections.push(target);
    return target;
  }

  disconnect(): void {
    this.connections.length = 0;
  }
}

class FakeOscillator extends FakeNode {
  type = "sine";
  readonly frequency = new FakeParam();
  readonly detune = new FakeParam();
  readonly starts: number[] = [];
  readonly stops: number[] = [];
  onended: (() => void) | null = null;

  start(time = 0): void {
    this.starts.push(time);
  }

  stop(time = 0): void {
    this.stops.push(time);
  }
}

class FakeGain extends FakeNode {
  readonly gain = new FakeParam();
}

class FakeBiquad extends FakeNode {
  type = "lowpass";
  readonly frequency = new FakeParam();
  readonly Q = new FakeParam();
}

class FakePanner extends FakeNode {
  readonly pan = new FakeParam();
}

class FakeConvolver extends FakeNode {
  buffer: unknown = null;
}

class FakeCompressor extends FakeNode {}

class FakeBuffer {
  readonly channels: Float32Array[];

  constructor(
    readonly numberOfChannels: number,
    readonly length: number,
    readonly sampleRate: number,
  ) {
    this.channels = Array.from(
      { length: numberOfChannels },
      () => new Float32Array(length) as Float32Array,
    );
  }

  get duration(): number {
    return this.length / this.sampleRate;
  }

  getChannelData(channel: number): Float32Array {
    const data = this.channels[channel];
    if (data === undefined) throw new RangeError("No such channel");
    return data;
  }
}

class FakeContext {
  currentTime = 0;
  readonly sampleRate = 8000;
  readonly destination = new FakeNode();
  readonly oscillators: FakeOscillator[] = [];
  readonly gains: FakeGain[] = [];
  readonly filters: FakeBiquad[] = [];
  readonly panners: FakePanner[] = [];
  readonly convolvers: FakeConvolver[] = [];
  readonly compressors: FakeCompressor[] = [];
  readonly buffers: FakeBuffer[] = [];

  createOscillator(): FakeOscillator {
    const node = new FakeOscillator();
    this.oscillators.push(node);
    return node;
  }

  createGain(): FakeGain {
    const node = new FakeGain();
    this.gains.push(node);
    return node;
  }

  createBiquadFilter(): FakeBiquad {
    const node = new FakeBiquad();
    this.filters.push(node);
    return node;
  }

  createStereoPanner(): FakePanner {
    const node = new FakePanner();
    this.panners.push(node);
    return node;
  }

  createConvolver(): FakeConvolver {
    const node = new FakeConvolver();
    this.convolvers.push(node);
    return node;
  }

  createDynamicsCompressor(): FakeCompressor {
    const node = new FakeCompressor();
    this.compressors.push(node);
    return node;
  }

  createBuffer(channels: number, length: number, sampleRate: number): FakeBuffer {
    const buffer = new FakeBuffer(channels, length, sampleRate);
    this.buffers.push(buffer);
    return buffer;
  }
}

function contextOf(fake: FakeContext): BaseAudioContext {
  return fake as unknown as BaseAudioContext;
}

function audioParam(param: unknown): FakeParam {
  return param as FakeParam;
}

function node(value: unknown): FakeNode {
  return value as FakeNode;
}

function scheduleMapping(): Mapping {
  return {
    ...DEFAULT_MAPPING,
    tempoBpm: 120,
    notesPerBeat: 2,
    registerMidi: 60,
    scale: "majorPentatonic",
  };
}

describe("createImpulse", () => {
  it("builds a deterministic exponentially decaying stereo tail", () => {
    const fake = new FakeContext();
    const first = createImpulse(contextOf(fake), IMPULSE_SECONDS, 7);
    const second = createImpulse(contextOf(fake), IMPULSE_SECONDS, 7);
    const other = createImpulse(contextOf(fake), IMPULSE_SECONDS, 8);

    expect(first.numberOfChannels).toBe(2);
    expect(first.length).toBe(Math.round(IMPULSE_SECONDS * fake.sampleRate));
    expect(first.getChannelData(0)).toEqual(second.getChannelData(0));
    expect(first.getChannelData(0)).not.toEqual(other.getChannelData(0));
    expect(first.getChannelData(0)).not.toEqual(first.getChannelData(1));

    const data = first.getChannelData(0);
    const head = Math.abs(data[0] ?? 0);
    const tail = Math.abs(data[data.length - 1] ?? 0);
    expect(head).toBeGreaterThan(0);
    expect(tail).toBeLessThan(head / 100);
  });
});

describe("createWebAudioTarget", () => {
  it("wires a master through a dry path and a convolved wet path", () => {
    const fake = new FakeContext();
    const target = createWebAudioTarget(contextOf(fake));
    const graph = target.graph;

    expect(target.kind).toBe("webaudio");
    expect(audioParam(graph.master.gain).value).toBeCloseTo(10 ** (-12 / 20), 12);
    expect(node(graph.master).connections).toEqual([graph.dry, graph.wet]);
    expect(node(graph.wet).connections).toEqual([graph.convolver]);
    expect(node(graph.convolver).connections).toEqual([graph.compressor]);
    expect(node(graph.compressor).connections).toEqual([graph.output]);
    expect(node(graph.output).connections).toEqual([fake.destination]);
    expect(audioParam(graph.output.gain).value).toBe(1);
    expect(node(graph.dry).connections).toEqual([graph.compressor]);
    expect(graph.convolver.buffer).not.toBeNull();
    expect(node(graph.padGain).connections).toEqual([graph.master]);
  });

  it("ramps the shared nodes with a three-constant glide", () => {
    const fake = new FakeContext();
    fake.currentTime = 4;
    const target = createWebAudioTarget(contextOf(fake));
    target.apply(
      {
        ...DEFAULT_MAPPING,
        brightness: 0.5,
        warmth: 0.4,
        reverbMix: 0.25,
        registerMidi: 72,
      },
      DEFAULT_WEIGHTS,
      300,
    );

    expect(audioParam(target.graph.padFilter.frequency).last()).toEqual({
      kind: "target",
      value: 300 * (8000 / 300) ** 0.5,
      time: 4,
      constant: 0.1,
    });
    expect(audioParam(target.graph.padGain.gain).last().value).toBeCloseTo(0.17, 12);
    expect(audioParam(target.graph.wet.gain).last().value).toBeCloseTo(0.25, 12);
    expect(audioParam(target.graph.pad[0].frequency).last().value).toBeCloseTo(
      midiToFrequency(60),
      12,
    );
    expect(audioParam(target.graph.pad[0].detune).last().value).toBeCloseTo(-2.4, 12);
    expect(audioParam(target.graph.pad[1].detune).last().value).toBeCloseTo(2.4, 12);
  });
});

describe("scheduling", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("schedules the deterministic first note inside the look-ahead window", async () => {
    const fake = new FakeContext();
    const target = createWebAudioTarget(contextOf(fake), { aId: "a", bId: "b" });
    target.apply(scheduleMapping(), DEFAULT_WEIGHTS, 0);
    await target.start();

    const carriers = fake.oscillators.filter((oscillator) => oscillator.type === "triangle");
    expect(carriers).toHaveLength(1);
    expect(carriers[0]?.starts).toEqual([0.02]);
    expect(audioParam(carriers[0]?.frequency).last().value).toBeCloseTo(195.9977179908746, 6);
    expect(fake.oscillators.slice(0, 2).map((oscillator) => oscillator.type)).toEqual([
      "sawtooth",
      "sawtooth",
    ]);
    expect(hash("a", "b", 0)).toBe(2809636434);
    expect(vi.getTimerCount()).toBe(1);
  });

  it("repeats the same notes for the same ids and bar", async () => {
    const first = new FakeContext();
    const second = new FakeContext();
    const one = createWebAudioTarget(contextOf(first), { aId: "a", bId: "b" });
    const two = createWebAudioTarget(contextOf(second), { aId: "a", bId: "b" });
    one.apply(scheduleMapping(), DEFAULT_WEIGHTS, 0);
    two.apply(scheduleMapping(), DEFAULT_WEIGHTS, 0);
    await one.start();
    await two.start();

    const melody = (fake: FakeContext) =>
      fake.oscillators
        .filter((oscillator) => oscillator.type === "triangle")
        .map((oscillator) => [oscillator.starts[0], audioParam(oscillator.frequency).last().value]);
    expect(melody(second)).toEqual(melody(first));
  });

  it("moves on to the next bar when the clock reaches it", async () => {
    const fake = new FakeContext();
    const target = createWebAudioTarget(contextOf(fake), { aId: "a", bId: "b" });
    target.apply(scheduleMapping(), DEFAULT_WEIGHTS, 0);
    await target.start();
    const before = fake.oscillators.filter((oscillator) => oscillator.type === "triangle").length;

    fake.currentTime = 2;
    vi.advanceTimersByTime(25);

    const after = fake.oscillators.filter((oscillator) => oscillator.type === "triangle").length;
    expect(after).toBeGreaterThan(before);
  });

  it("fades the master within fifty milliseconds and stops the clock", async () => {
    const fake = new FakeContext();
    const target = createWebAudioTarget(contextOf(fake), { aId: "a", bId: "b" });
    target.apply(scheduleMapping(), DEFAULT_WEIGHTS, 0);
    await target.start();
    fake.currentTime = 1;
    target.stop();

    expect(audioParam(target.graph.master.gain).last()).toEqual({
      kind: "ramp",
      value: 0,
      time: 1 + STOP_FADE_SECONDS,
    });
    expect(audioParam(target.graph.output.gain).last()).toEqual({
      kind: "ramp",
      value: 0,
      time: 1 + STOP_FADE_SECONDS,
    });
    expect(STOP_FADE_SECONDS).toBeLessThanOrEqual(0.05);
    expect(vi.getTimerCount()).toBe(0);
    const count = fake.oscillators.length;
    fake.currentTime = 5;
    vi.advanceTimersByTime(1000);
    expect(fake.oscillators).toHaveLength(count);
  });

  it("opens the output again when restarted after a stop", async () => {
    const fake = new FakeContext();
    const target = createWebAudioTarget(contextOf(fake), { aId: "a", bId: "b" });
    await target.start();
    fake.currentTime = 1;
    target.stop();
    fake.currentTime = 2;
    await target.start();

    expect(audioParam(target.graph.output.gain).last()).toEqual({ kind: "set", value: 1, time: 2 });
    expect(audioParam(target.graph.master.gain).last().value).toBeCloseTo(0.251188643150958, 12);
    expect(fake.oscillators[0]?.starts).toEqual([0]);
  });

  it("stops the pad oscillators when disposed", async () => {
    const fake = new FakeContext();
    const target = createWebAudioTarget(contextOf(fake));
    await target.start();
    target.dispose();

    expect(fake.oscillators[0]?.stops).toHaveLength(1);
    expect(fake.oscillators[1]?.stops).toHaveLength(1);
    await expect(target.start()).rejects.toThrow(/disposed/);
  });
});

class FakeOfflineContext extends FakeContext {
  renders = 0;

  constructor(readonly length: number) {
    super();
  }

  async startRendering(): Promise<FakeBuffer> {
    this.renders += 1;
    return new FakeBuffer(2, this.length, this.sampleRate);
  }
}

describe("renderOffline", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("schedules every bar of the render up front without a timer", async () => {
    const fake = new FakeOfflineContext(5 * 8000);
    const buffer = await renderOffline(
      fake as unknown as OfflineAudioContext,
      scheduleMapping(),
      DEFAULT_WEIGHTS,
      { aId: "a", bId: "b" },
    );

    expect(fake.renders).toBe(1);
    expect(buffer.length).toBe(40000);
    expect(vi.getTimerCount()).toBe(0);
    const starts = fake.oscillators
      .filter((oscillator) => oscillator.type === "triangle")
      .map((oscillator) => oscillator.starts[0] ?? -1);
    expect(starts[0]).toBe(0.02);
    expect(Math.min(...starts)).toBeGreaterThanOrEqual(0.02);
    expect(Math.max(...starts)).toBeLessThan(5);
    expect(starts.some((start) => start >= 4.02)).toBe(true);
    expect(fake.oscillators[0]?.starts).toEqual([0]);
  });

  it("sets the shared parameters at once instead of gliding", async () => {
    const fake = new FakeOfflineContext(8000);
    await renderOffline(fake as unknown as OfflineAudioContext, scheduleMapping(), DEFAULT_WEIGHTS);
    const padFilter = fake.filters[0];

    expect(audioParam(padFilter?.frequency).last()).toEqual({
      kind: "set",
      value: 300 * (8000 / 300) ** 0.4,
      time: 0,
    });
  });
});

describe("parameter helpers", () => {
  it("uses the stated ranges", () => {
    expect(masterGain()).toBeCloseTo(0.251188643150958, 12);
    expect(midiToFrequency(69)).toBe(440);
    expect(midiToFrequency(60)).toBeCloseTo(261.6255653005986, 9);
  });
});

import { describe, expect, it } from "vitest";
import {
  createArrivalGate,
  FIRST_FLIGHT_MS,
  flightPlan,
  REPEAT_FLIGHT_MS,
  type Timers,
} from "../../src/atlas/arrival";

function fakeTimers() {
  const callbacks = new Map<number, () => void>();
  let next = 1;
  const timers: Timers = {
    set(callback) {
      callbacks.set(next, callback);
      return next++;
    },
    clear(id) {
      callbacks.delete(id);
    },
  };
  return {
    timers,
    fire: () => {
      for (const run of [...callbacks.values()]) run();
    },
    count: () => callbacks.size,
  };
}

describe("flightPlan", () => {
  it("keeps the long flight for the first one and shortens repeats", () => {
    expect(flightPlan(0).durationMs).toBe(FIRST_FLIGHT_MS);
    expect(flightPlan(1).durationMs).toBe(REPEAT_FLIGHT_MS);
    expect(flightPlan(5).holdMs).toBeLessThan(flightPlan(0).holdMs);
  });
});

describe("createArrivalGate", () => {
  it("lands once after the hold", () => {
    const clock = fakeTimers();
    const landed: string[] = [];
    const gate = createArrivalGate<string>((a) => landed.push(a), clock.timers);
    gate.begin("geosmin");
    gate.land(450);
    clock.fire();
    clock.fire();
    expect(landed).toEqual(["geosmin"]);
    expect(gate.busy()).toBe(false);
  });

  it("skips straight to the destination mid-flight and never lands twice", () => {
    const clock = fakeTimers();
    const landed: string[] = [];
    const gate = createArrivalGate<string>((a) => landed.push(a), clock.timers);
    gate.begin("geosmin");
    expect(gate.busy()).toBe(true);
    gate.skip();
    expect(landed).toEqual(["geosmin"]);
    gate.land(450);
    clock.fire();
    expect(landed).toEqual(["geosmin"]);
  });

  it("skips during the hold and cancels its timer", () => {
    const clock = fakeTimers();
    const landed: string[] = [];
    const gate = createArrivalGate<string>((a) => landed.push(a), clock.timers);
    gate.begin("geosmin");
    gate.land(450);
    gate.skip();
    expect(clock.count()).toBe(0);
    expect(landed).toEqual(["geosmin"]);
  });

  it("does nothing when skipped with no flight", () => {
    const gate = createArrivalGate<string>(() => expect.fail("landed"), fakeTimers().timers);
    gate.skip();
  });
});

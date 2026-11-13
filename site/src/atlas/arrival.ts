/**
 * Timing and skipping for the flight to a molecule. The first flight of a session is the
 * showpiece; later ones are shorter, and any key, press or second search lands at once.
 */

export const FIRST_FLIGHT_MS = 1400;
export const REPEAT_FLIGHT_MS = 700;
export const FIRST_HOLD_MS = 1500;
export const REPEAT_HOLD_MS = 600;

export interface FlightPlan {
  readonly durationMs: number;
  readonly holdMs: number;
}

export function flightPlan(flightsSoFar: number): FlightPlan {
  return flightsSoFar === 0
    ? { durationMs: FIRST_FLIGHT_MS, holdMs: FIRST_HOLD_MS }
    : { durationMs: REPEAT_FLIGHT_MS, holdMs: REPEAT_HOLD_MS };
}

export interface Timers {
  set(callback: () => void, ms: number): number;
  clear(id: number): void;
}

/** Runs `go` once per flight, whether the hold runs out or a visitor skips it. */
export function createArrivalGate<T>(go: (arrival: T) => void, timers: Timers) {
  let pending: { readonly arrival: T } | null = null;
  let timer: number | null = null;

  const finish = (): void => {
    if (timer !== null) timers.clear(timer);
    timer = null;
    const current = pending;
    pending = null;
    if (current !== null) go(current.arrival);
  };

  return {
    busy: (): boolean => pending !== null,
    begin(arrival: T): void {
      pending = { arrival };
    },
    /** The camera has arrived: hold the frame, then go. */
    land(holdMs: number): void {
      if (pending !== null) timer = timers.set(finish, holdMs);
    },
    skip: finish,
    cancel(): void {
      if (timer !== null) timers.clear(timer);
      timer = null;
      pending = null;
    },
  };
}

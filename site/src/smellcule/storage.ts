/**
 * Daily results live in one versioned local key. A malformed or older value is discarded rather
 * than repaired, because a result is small and a half-trusted score is worse than no score.
 * A result played on its own day carries `daily`; only those count toward the streak, so the
 * archive can store a replay without changing it.
 */

export const STORAGE_KEY = "scent.smellcule.v1";
export const STORAGE_VERSION = 1;

export interface StoredResult {
  readonly puzzle: number;
  readonly score: number;
  readonly modelScore: number;
  readonly clueShown: boolean;
  readonly daily?: true;
}

export interface StoredResults {
  readonly version: typeof STORAGE_VERSION;
  readonly results: Readonly<Record<string, StoredResult>>;
}

export const EMPTY_RESULTS: StoredResults = { version: STORAGE_VERSION, results: {} };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validResult(value: unknown): value is StoredResult {
  if (!isRecord(value)) return false;
  return (
    typeof value.puzzle === "number" &&
    Number.isInteger(value.puzzle) &&
    value.puzzle >= 1 &&
    typeof value.score === "number" &&
    Number.isInteger(value.score) &&
    value.score >= 0 &&
    typeof value.modelScore === "number" &&
    Number.isInteger(value.modelScore) &&
    value.modelScore >= 0 &&
    typeof value.clueShown === "boolean" &&
    (value.daily === undefined || value.daily === true)
  );
}

export function parseResults(raw: string | null): StoredResults {
  if (raw === null) return EMPTY_RESULTS;
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return EMPTY_RESULTS;
  }
  if (!isRecord(value) || value.version !== STORAGE_VERSION || !isRecord(value.results)) {
    return EMPTY_RESULTS;
  }
  const results: Record<string, StoredResult> = {};
  for (const [key, result] of Object.entries(value.results)) {
    if (!/^\d+$/.test(key) || !validResult(result)) continue;
    results[key] = result;
  }
  return { version: STORAGE_VERSION, results };
}

export function readResults(storage: Pick<Storage, "getItem">): StoredResults {
  try {
    return parseResults(storage.getItem(STORAGE_KEY));
  } catch {
    return EMPTY_RESULTS;
  }
}

export function storedResult(results: StoredResults, puzzle: number): StoredResult | null {
  return results.results[String(puzzle)] ?? null;
}

export interface PlayedResult extends Omit<StoredResult, "daily"> {
  readonly daily?: boolean;
}

export function saveResult(
  storage: Pick<Storage, "getItem" | "setItem">,
  played: PlayedResult,
): StoredResults {
  const current = readResults(storage);
  const { daily, ...rest } = played;
  const kept = daily === true || storedResult(current, played.puzzle)?.daily === true;
  const result: StoredResult = kept ? { ...rest, daily: true } : rest;
  if (!validResult(result)) throw new RangeError("Invalid stored result");
  const next: StoredResults = {
    version: STORAGE_VERSION,
    results: { ...current.results, [String(result.puzzle)]: result },
  };
  storage.setItem(STORAGE_KEY, JSON.stringify(next));
  return next;
}

/**
 * Consecutive puzzles played on their own day, ending today, or yesterday while today's puzzle
 * is still unplayed.
 */
export function currentStreak(results: StoredResults, todayNumber: number): number {
  const playedOnDay = (puzzle: number): boolean => storedResult(results, puzzle)?.daily === true;
  let puzzle = playedOnDay(todayNumber) ? todayNumber : todayNumber - 1;
  let streak = 0;
  while (puzzle >= 1 && playedOnDay(puzzle)) {
    streak += 1;
    puzzle -= 1;
  }
  return streak;
}

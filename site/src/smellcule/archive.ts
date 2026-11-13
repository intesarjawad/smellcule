/**
 * The archive of finished daily puzzles. It turns the published start date and puzzle count into
 * the dates and numbers the archive page shows, so the calendar rules stay in one place next to
 * the schedule that opens today's puzzle.
 */

import { puzzleNumber } from "./schedule";

const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

/** A puzzle whose playable data is published and whose day has passed. */
export interface ArchiveEntry {
  readonly number: number;
  readonly date: string;
}

/** `reserved` numbers are past their day but were retired before publication. */
export type PuzzleStatus = "upcoming" | "today" | "archived" | "reserved";

function parseStartDate(value: string): readonly [number, number, number] {
  const match = DATE_PATTERN.exec(value);
  if (match === null) throw new RangeError(`Invalid start date: ${value}`);
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const time = Date.UTC(year, month - 1, day);
  if (new Date(time).toISOString().slice(0, 10) !== value) {
    throw new RangeError(`Invalid start date: ${value}`);
  }
  return [year, month, day];
}

function expectNumber(number: number): void {
  if (!Number.isInteger(number) || number < 1) {
    throw new RangeError(`Invalid puzzle number: ${number}`);
  }
}

/** The local calendar date a puzzle number opens on, as YYYY-MM-DD. */
export function puzzleDate(startDate: string, number: number): string {
  const [year, month, day] = parseStartDate(startDate);
  expectNumber(number);
  return new Date(Date.UTC(year, month - 1, day + number - 1)).toISOString().slice(0, 10);
}

export function puzzleStatus(
  startDate: string,
  today: Date,
  puzzleCount: number,
  number: number,
): PuzzleStatus {
  expectNumber(number);
  const current = puzzleNumber(today, startDate);
  if (current === null || number > current) return "upcoming";
  if (number === current) return "today";
  return number <= puzzleCount ? "archived" : "reserved";
}

/**
 * Past puzzles with published data, newest first. Numbers past the end of the published list are
 * left out rather than listed as broken links.
 */
export function archiveEntries(
  startDate: string,
  today: Date,
  puzzleCount: number,
): ArchiveEntry[] {
  const current = puzzleNumber(today, startDate);
  if (current === null || puzzleCount < 1) return [];
  const entries: ArchiveEntry[] = [];
  for (let number = Math.min(current - 1, puzzleCount); number >= 1; number -= 1) {
    entries.push({ number, date: puzzleDate(startDate, number) });
  }
  return entries;
}

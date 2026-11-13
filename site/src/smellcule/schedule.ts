/**
 * Maps a visitor's local calendar day to a puzzle number. The schedule is anchored to local
 * midnight, not to a UTC instant, so a visitor on either side of the date line cannot open the
 * next puzzle early or have the previous one wrapped back to puzzle one.
 */

const MILLISECONDS_PER_DAY = 86_400_000;
const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

interface CalendarDate {
  readonly year: number;
  readonly month: number;
  readonly day: number;
}

function parseStartDate(value: string): CalendarDate {
  const match = DATE_PATTERN.exec(value);
  if (match === null) throw new RangeError(`Invalid start date: ${value}`);
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const probe = new Date(Date.UTC(year, month - 1, day));
  if (
    probe.getUTCFullYear() !== year ||
    probe.getUTCMonth() !== month - 1 ||
    probe.getUTCDate() !== day
  ) {
    throw new RangeError(`Invalid start date: ${value}`);
  }
  return { year, month, day };
}

function utcDay(date: Date): number {
  return Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
}

/**
 * Returns the one-based puzzle number for `today`, or null before the first puzzle's date.
 */
export function puzzleNumber(today: Date, startDate: string): number | null {
  if (Number.isNaN(today.getTime())) throw new RangeError("Invalid date");
  const start = parseStartDate(startDate);
  const offset = Math.round(
    (utcDay(today) - Date.UTC(start.year, start.month - 1, start.day)) / MILLISECONDS_PER_DAY,
  );
  return offset < 0 ? null : offset + 1;
}

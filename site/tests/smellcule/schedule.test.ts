import { afterEach, describe, expect, it } from "vitest";
import { puzzleNumber } from "../../src/smellcule/schedule";

const START_DATE = "2026-12-01";
const originalTimeZone = process.env.TZ;

afterEach(() => {
  if (originalTimeZone === undefined) {
    delete process.env.TZ;
  } else {
    process.env.TZ = originalTimeZone;
  }
});

describe("puzzleNumber", () => {
  it("returns null the day before startDate", () => {
    expect(puzzleNumber(new Date(2026, 10, 30, 12), START_DATE)).toBeNull();
  });

  it("returns null a year before startDate", () => {
    expect(puzzleNumber(new Date(2025, 11, 1, 12), START_DATE)).toBeNull();
  });

  it("returns null late on the day before startDate in UTC+14", () => {
    process.env.TZ = "Pacific/Kiritimati";
    expect(puzzleNumber(new Date(2026, 10, 30, 23, 59), START_DATE)).toBeNull();
  });

  it("returns null late on the day before startDate in UTC-12", () => {
    process.env.TZ = "Etc/GMT+12";
    expect(puzzleNumber(new Date(2026, 10, 30, 23, 59), START_DATE)).toBeNull();
  });

  it("opens the first puzzle on startDate", () => {
    expect(puzzleNumber(new Date(2026, 11, 1, 0, 0), START_DATE)).toBe(1);
  });

  it("counts calendar days across month and year boundaries", () => {
    expect(puzzleNumber(new Date(2026, 11, 31, 23, 59), START_DATE)).toBe(31);
    expect(puzzleNumber(new Date(2027, 0, 1, 0, 0), START_DATE)).toBe(32);
  });

  it("does not use the UTC date of a late local evening", () => {
    process.env.TZ = "Etc/GMT+12";
    const lateOnStartDateEve = new Date(2026, 10, 30, 23, 59);
    expect(lateOnStartDateEve.toISOString().slice(0, 10)).toBe("2026-12-01");
    expect(puzzleNumber(lateOnStartDateEve, START_DATE)).toBeNull();
  });

  it("rejects an impossible start date", () => {
    expect(() => puzzleNumber(new Date(2026, 0, 1), "2026-02-30")).toThrow(/Invalid start date/);
  });
});

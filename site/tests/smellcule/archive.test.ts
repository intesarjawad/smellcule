import { afterEach, describe, expect, it } from "vitest";
import { archiveEntries, puzzleDate, puzzleStatus } from "../../src/smellcule/archive";

const START_DATE = "2026-12-01";
const originalTimeZone = process.env.TZ;

afterEach(() => {
  if (originalTimeZone === undefined) {
    delete process.env.TZ;
  } else {
    process.env.TZ = originalTimeZone;
  }
});

describe("puzzleDate", () => {
  it("counts local calendar days from the start date", () => {
    expect(puzzleDate(START_DATE, 1)).toBe("2026-12-01");
    expect(puzzleDate(START_DATE, 31)).toBe("2026-12-31");
    expect(puzzleDate(START_DATE, 32)).toBe("2027-01-01");
    expect(puzzleDate("2028-02-28", 2)).toBe("2028-02-29");
  });

  it("rejects impossible dates and numbers", () => {
    expect(() => puzzleDate("2026-02-30", 1)).toThrow(/Invalid start date/);
    expect(() => puzzleDate(START_DATE, 0)).toThrow(/Invalid puzzle number/);
    expect(() => puzzleDate(START_DATE, 1.5)).toThrow(/Invalid puzzle number/);
  });
});

describe("puzzleStatus", () => {
  it("separates upcoming, today and archived numbers", () => {
    const today = new Date(2026, 11, 4, 12);
    expect(puzzleStatus(START_DATE, today, 40, 1)).toBe("archived");
    expect(puzzleStatus(START_DATE, today, 40, 3)).toBe("archived");
    expect(puzzleStatus(START_DATE, today, 40, 4)).toBe("today");
    expect(puzzleStatus(START_DATE, today, 40, 5)).toBe("upcoming");
  });

  it("reports retired numbers as reserved when the published list ends early", () => {
    const today = new Date(2026, 11, 10, 12);
    expect(puzzleStatus(START_DATE, today, 4, 4)).toBe("archived");
    expect(puzzleStatus(START_DATE, today, 4, 5)).toBe("reserved");
    expect(puzzleStatus(START_DATE, today, 4, 10)).toBe("today");
  });

  it("keeps every number upcoming before launch", () => {
    expect(puzzleStatus(START_DATE, new Date(2026, 10, 30, 23, 59), 40, 1)).toBe("upcoming");
  });
});

describe("archiveEntries", () => {
  it("lists finished puzzles with published data newest first", () => {
    expect(archiveEntries(START_DATE, new Date(2026, 11, 4, 12), 40)).toEqual([
      { number: 3, date: "2026-12-03" },
      { number: 2, date: "2026-12-02" },
      { number: 1, date: "2026-12-01" },
    ]);
  });

  it("is empty on launch day and before it", () => {
    expect(archiveEntries(START_DATE, new Date(2026, 11, 1, 9), 40)).toEqual([]);
    expect(archiveEntries(START_DATE, new Date(2026, 10, 20, 9), 40)).toEqual([]);
  });

  it("does not link to numbers with no published puzzle", () => {
    expect(archiveEntries(START_DATE, new Date(2026, 11, 10, 12), 2)).toEqual([
      { number: 2, date: "2026-12-02" },
      { number: 1, date: "2026-12-01" },
    ]);
  });

  it("uses the visitor's local calendar day", () => {
    process.env.TZ = "Pacific/Kiritimati";
    const lateEvening = new Date(2026, 11, 3, 23, 30);
    expect(lateEvening.toISOString().slice(0, 10)).toBe("2026-12-03");
    expect(archiveEntries(START_DATE, lateEvening, 40)).toEqual([
      { number: 2, date: "2026-12-02" },
      { number: 1, date: "2026-12-01" },
    ]);
  });
});

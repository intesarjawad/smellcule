import { readFileSync } from "node:fs";
import { expect, type Locator, type Page } from "@playwright/test";

/** The fixture bundle the preview server serves, read once for expectations. */
export function fixture<T>(file: string): T {
  return JSON.parse(
    readFileSync(new URL(`../public/fixture-data/${file}`, import.meta.url), "utf8"),
  ) as T;
}

export const START_DATE = fixture<{ startDate: string }>("smellcule.json").startDate;

/** Local noon `offsetDays` after the first puzzle's day, clear of any date boundary. */
export function localNoon(offsetDays: number): Date {
  const date = new Date(`${START_DATE}T12:00:00`);
  date.setDate(date.getDate() + offsetDays);
  return date;
}

export interface View {
  readonly name: string;
  readonly hash: string;
  readonly ready: (page: Page) => Locator;
}

/** The views; the clock sits on the first puzzle's day so the game is playable. */
export const VIEWS: readonly View[] = [
  { name: "home", hash: "#/", ready: (page) => page.locator("#rx-query") },
  { name: "atlas", hash: "#/atlas", ready: (page) => page.locator("#atlas-search") },
  { name: "card", hash: "#/m/1066", ready: (page) => page.locator("article.card[data-ready]") },
  {
    name: "browse",
    hash: "#/browse",
    ready: (page) => page.locator("#main details").first(),
  },
  {
    name: "smellcule",
    hash: "#/smellcule",
    ready: (page) => page.getByRole("button", { name: "Submit" }),
  },
  {
    name: "decompile",
    hash: "#/decompile",
    ready: (page) => page.getByLabel("Notes from a perfume description"),
  },
  {
    name: "synesthesia",
    hash: "#/synesthesia",
    ready: (page) => page.getByRole("button", { name: "Play" }),
  },
  {
    name: "how",
    hash: "#/how",
    ready: (page) => page.getByRole("heading", { name: "How it works" }),
  },
];

export async function openView(page: Page, view: View): Promise<void> {
  await page.clock.setFixedTime(localNoon(0));
  await page.goto(`/${view.hash}`);
  await expect(view.ready(page)).toBeVisible();
  await expect(page.locator("#site-footer a").first()).toBeVisible();
}

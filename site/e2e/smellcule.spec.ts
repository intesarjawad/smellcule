import { readFileSync } from "node:fs";
import { expect, type Page, test } from "@playwright/test";
import { fixture as readFixture } from "./views";

const startDate = (
  JSON.parse(
    readFileSync(new URL("../public/fixture-data/smellcule.json", import.meta.url), "utf8"),
  ) as { startDate: string }
).startDate;

const fixture = JSON.parse(
  readFileSync(new URL("../public/fixture-data/smellcule.json", import.meta.url), "utf8"),
) as {
  startDate: string;
  puzzles: {
    moleculeId: string;
    options: number[];
    answer: number[];
    clueId: number;
    clueSimilarity: number;
  }[];
};

const atlas = readFixture<{
  labels: string[];
  molecules: { id: string; name: string; formula: string; measured: number[] }[];
}>("atlas.json");
const puzzle = fixture.puzzles[0];
if (puzzle === undefined) throw new Error("The fixture has no first puzzle");
const molecule = atlas.molecules.find((entry) => entry.id === puzzle.moleculeId);
const clue = atlas.molecules[puzzle.clueId];
if (molecule === undefined || clue === undefined) throw new Error("Puzzle molecules are missing");

const secondPuzzle = {
  moleculeId: "206",
  options: [44, 46, 58, 101, 0, 1, 2, 3, 4, 5, 6, 7],
  answer: [44, 46, 58, 101],
  clueId: 0,
  clueSimilarity: 0.5,
};

function sharedBase(): string {
  return `${window.location.origin}${window.location.pathname}`;
}

function localNoon(offsetDays: number): Date {
  const date = new Date(`${startDate}T12:00:00`);
  date.setDate(date.getDate() + offsetDays);
  return date;
}

async function twoPuzzleBundle(page: Page): Promise<void> {
  await page.route("**/smellcule.json", (route) =>
    route.fulfill({ json: { ...fixture, puzzles: [...fixture.puzzles, secondPuzzle] } }),
  );
}

async function playFirstPuzzle(page: Page, clueFirst: boolean): Promise<string> {
  await page.goto("/#/smellcule");
  await page.reload();
  await expect(page.locator("#main h1")).toHaveText("Smellcule 1");
  if (clueFirst) {
    await page.getByRole("button", { name: "Show a clue" }).click();
    await expect(page.locator(".clue")).toHaveText(
      `Closest structure the model trained on: ${clue.name} (structure similarity ${puzzle.clueSimilarity.toFixed(2)}) smells ${clue.measured.map((index) => atlas.labels[index]).join(", ")}`,
    );
  }
  for (const name of ["beefy", "citrus", "fatty"]) {
    await page.getByRole("button", { name, exact: true }).click();
  }
  await page.getByRole("button", { name: "Submit" }).click();
  const share = await page.locator("pre.share").textContent();
  return share ?? "";
}

test("plays a full puzzle and shares the exact text @smellcule", async ({ page }) => {
  await page.clock.setFixedTime(localNoon(0));
  const share = await playFirstPuzzle(page, false);
  const base = await page.evaluate(sharedBase);
  expect(share).toBe(`Smellcule 1  you ●●●  model ○○○  ${base}#/smellcule/1`);
  await expect(page.locator(".reveal h3")).toHaveText(molecule.name);
  await expect(page.locator("button[aria-pressed]").first()).toBeDisabled();
});

test("a second play that shows the clue first shares +clue @smellcule", async ({ page }) => {
  await page.clock.setFixedTime(localNoon(0));
  await playFirstPuzzle(page, false);
  const share = await playFirstPuzzle(page, true);
  const base = await page.evaluate(sharedBase);
  expect(share).toBe(`Smellcule 1  you ●●● +clue  model ○○○  ${base}#/smellcule/1`);
});

test("the next day shows a different puzzle @smellcule", async ({ page }) => {
  await twoPuzzleBundle(page);
  await page.clock.setFixedTime(localNoon(0));
  await page.goto("/#/smellcule");
  await expect(page.locator("#main h1")).toHaveText("Smellcule 1");
  const first = await page.locator("figure img").getAttribute("src");

  await page.clock.setFixedTime(localNoon(1));
  await page.reload();
  await expect(page.locator("#main h1")).toHaveText("Smellcule 2");
  await expect(page.locator("figure img")).not.toHaveAttribute("src", first ?? "");
  await expect(page.locator("button[aria-pressed='true']")).toHaveCount(0);
});

test("shows opens-on before startDate @smellcule", async ({ page }) => {
  const before = new Date(`${startDate}T12:00:00`);
  before.setDate(before.getDate() - 1);
  await page.clock.setFixedTime(before);

  await page.goto("/#/smellcule");
  await expect(page.locator("#main")).toContainText(`Smellcule #1 opens on ${startDate}`);
  await expect(page.locator("button[aria-pressed]")).toHaveCount(0);

  await page.goto("/#/smellcule/1");
  await expect(page.locator("#main")).toContainText("Not out yet");
});

test("Copy puts the share text on the clipboard and says so @smellcule", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.clock.setFixedTime(localNoon(0));
  const share = await playFirstPuzzle(page, false);
  await page.getByRole("button", { name: "Copy" }).click();
  await expect(page.getByRole("status")).toHaveText("Copied to the clipboard.");
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(share);
});

test("a blocked copy says so and selects the share text @smellcule", async ({ page }) => {
  await page.addInitScript(() => {
    navigator.clipboard.writeText = () =>
      Promise.reject(new DOMException("Write permission denied.", "NotAllowedError"));
  });
  await page.clock.setFixedTime(localNoon(0));
  const share = await playFirstPuzzle(page, false);
  await page.getByRole("button", { name: "Copy" }).click();
  await expect(page.getByRole("status")).toHaveText(
    "Copy was blocked. The share text is selected below.",
  );
  expect(await page.evaluate(() => window.getSelection()?.toString())).toBe(share);
});

test("blocked storage turns streaks off and the game still plays @smellcule", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, "localStorage", {
      get() {
        throw new DOMException("The operation is insecure.", "SecurityError");
      },
    });
  });
  await page.clock.setFixedTime(localNoon(0));
  await page.goto("/#/smellcule");
  await expect(page.getByText("Streaks are off because this browser blocks storage.")).toHaveCount(
    1,
  );
  const share = await playFirstPuzzle(page, false);
  expect(share).toContain("Smellcule 1");
  await expect(page.getByText(/^Streak: /)).toHaveCount(0);
});

test("the puzzle shows the structure and formula, and hides the name until the reveal @smellcule", async ({
  page,
}) => {
  await page.clock.setFixedTime(localNoon(0));
  await page.goto("/#/smellcule");
  await expect(page.locator(".game figure img")).toBeVisible();
  await expect(page.locator(".game figcaption")).toHaveText(molecule.formula);
  await expect(page.locator("#main")).not.toContainText(molecule.name);
});

test("share text stays inside its box at narrow and wide widths @smellcule", async ({ page }) => {
  await page.clock.setFixedTime(localNoon(0));
  await playFirstPuzzle(page, false);
  const share = page.locator("pre.share");
  await share.evaluate((box) => {
    box.textContent += ` https://example.com/${"long-unbroken-path".repeat(12)}#/smellcule`;
  });
  for (const width of [320, 390, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await share.evaluate((box) => box.scrollWidth <= box.clientWidth)).toBe(true);
  }
});

test("a daily share opens the same puzzle on a later day", async ({ page }) => {
  await page.clock.setFixedTime(localNoon(0));
  const share = await playFirstPuzzle(page, false);
  const url = share.split("  ").at(-1);
  if (url === undefined) throw new Error("Missing share URL");
  await page.clock.setFixedTime(localNoon(1));
  await page.goto(url);
  await expect(page.locator("#main h1")).toHaveText("Smellcule 1");
});

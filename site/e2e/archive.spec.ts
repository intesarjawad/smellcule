import { expect, type Page, test } from "@playwright/test";
import { localNoon, START_DATE } from "./views";

const STORAGE_KEY = "scent.smellcule.v1";
const THIRD_DAY = 2;

/** Publishes three puzzles so the third day has two finished ones in the archive. */
async function threePuzzles(page: Page): Promise<void> {
  await page.route("**/smellcule.json", async (route) => {
    const response = await route.fetch();
    const game = (await response.json()) as { puzzles: unknown[] };
    const [first] = game.puzzles;
    await route.fulfill({ response, json: { ...game, puzzles: [first, first, first] } });
  });
}

async function playOpenPuzzle(page: Page): Promise<void> {
  const options = page.locator(".options button");
  for (let index = 0; index < 3; index += 1) await options.nth(index).click();
  await page.getByRole("button", { name: "Submit" }).click();
  await expect(page.locator("pre.share")).toBeVisible();
}

test("an archive play of puzzle 1 on day 3 leaves the streak unchanged @cross", async ({
  page,
}) => {
  await threePuzzles(page);
  await page.clock.setFixedTime(localNoon(THIRD_DAY));

  await page.goto("/#/smellcule");
  await expect(page.locator("#main h1")).toHaveText("Smellcule 3");
  await playOpenPuzzle(page);
  await expect(page.getByText(/^Streak: /)).toHaveText("Streak: 1 day");

  await page.goto("/#/smellcule/archive");
  const entries = page.locator("#main ol > li");
  await expect(entries.getByRole("link")).toHaveText(["Smellcule 2", "Smellcule 1"]);
  await entries.getByRole("link", { name: "Smellcule 1", exact: true }).click();
  await expect(page.locator("#main h1")).toHaveText("Smellcule 1");
  await playOpenPuzzle(page);
  await expect(page.getByText(/^Streak: /)).toHaveText("Streak: 1 day");

  // Puzzle 2 sits next to today's, so counting archive plays would lengthen the streak.
  await page.goto("/#/smellcule/2");
  await playOpenPuzzle(page);
  await expect(page.getByText(/^Streak: /)).toHaveText("Streak: 1 day");

  const stored = await page.evaluate((key) => window.localStorage.getItem(key), STORAGE_KEY);
  const results = (JSON.parse(stored ?? "{}") as { results: Record<string, { daily?: true }> })
    .results;
  expect(results["3"]?.daily).toBe(true);
  expect(results["1"]?.daily).toBeUndefined();
  expect(results["2"]?.daily).toBeUndefined();

  await page.goto("/#/smellcule/archive");
  await expect(entries.locator(".mono")).toHaveText([
    /^you [●○]{3} {2}model [●○]{3}$/,
    /^you [●○]{3} {2}model [●○]{3}$/,
  ]);
});

test("a future puzzle number is not out yet and links to today's", async ({ page }) => {
  await page.clock.setFixedTime(localNoon(0));
  await page.goto("/#/smellcule/9");
  await expect(page.locator("#main")).toContainText("Not out yet");
  await expect(page.getByRole("link", { name: "Play today's puzzle" })).toHaveAttribute(
    "href",
    "#/smellcule",
  );
});

test("the archive lists nothing the day before startDate", async ({ page }) => {
  await page.clock.setFixedTime(localNoon(-1));
  await page.goto("/#/smellcule/archive");
  await expect(page.locator("#main")).toContainText(`Smellcule #1 opens on ${START_DATE}`);
  await expect(page.locator('#main a[href^="#/smellcule/"]')).toHaveCount(0);
});

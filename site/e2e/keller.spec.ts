import { expect, type Page, test } from "@playwright/test";

const STORAGE_KEY = "scent.smellcule.v1";
const RETIRED_COUNT = 19;

const storedResults = {
  version: 1,
  results: {
    "3": { puzzle: 3, score: 2, modelScore: 1, clueShown: true },
    "1": { puzzle: 1, score: 3, modelScore: 3, clueShown: false },
  },
};

async function retireGame(page: Page): Promise<void> {
  await page.route("**/atlas.json", async (route) => {
    const response = await route.fetch();
    const atlas = (await response.json()) as { stats: Record<string, number> };
    atlas.stats.retiredPuzzles = RETIRED_COUNT;
    await route.fulfill({ response, json: atlas });
  });
}

test("a name search opens a card with the Keller source and the cross-validated badge @keller", async ({
  page,
}) => {
  await page.goto("/#/atlas");
  await page.locator("#atlas-search").fill("vanillin");
  await page
    .locator("#atlas-search-results")
    .getByRole("option", { name: /vanillin/i })
    .first()
    .click();
  await expect(page.locator("article.card h1")).toHaveText("vanillin");
  await expect(page.locator("article.card .source")).toHaveText(
    "Keller 2016 via Pyrfume, CC BY 4.0",
  );
  await expect(page.locator("article.card .split .badge")).toContainText("Cross-validated");
});

test("no page links to the game or the decompiler @keller", async ({ page }) => {
  for (const hash of ["#/", "#/atlas", "#/browse", "#/how"]) {
    await page.goto(`/${hash}`);
    await expect(page.locator("#site-footer a").first()).toBeVisible();
    await expect(page.locator('a[href^="#/smellcule"], a[href^="#/decompile"]')).toHaveCount(0);
  }
});

test("the decompiler redirects to the atlas @keller", async ({ page }) => {
  await page.goto("/#/decompile");
  await expect(page).toHaveURL(/#\/atlas$/);
  await expect(page.locator("#atlas-search")).toBeVisible();
});

test("the game redirects to the atlas when no puzzle was retired @keller", async ({ page }) => {
  for (const hash of ["#/smellcule", "#/smellcule/2", "#/smellcule/archive"]) {
    await page.goto(`/${hash}`);
    await expect(page).toHaveURL(/#\/atlas$/);
  }
});

test("the game shows the retired page with stored results marked retired @keller", async ({
  page,
}) => {
  await retireGame(page);
  await page.addInitScript(([key, value]) => window.localStorage.setItem(key, value), [
    STORAGE_KEY,
    JSON.stringify(storedResults),
  ] as const);
  await page.goto("/#/smellcule");
  await expect(page.locator("#main h1")).toHaveText("Smellcule has retired");
  await expect(page.locator("#main li")).toHaveText([
    "Smellcule 1  you ●●●  model ●●● retired",
    "Smellcule 3  you ●●○ +clue  model ●○○ retired",
  ]);
  await expect(page).toHaveURL(/#\/smellcule$/);
});

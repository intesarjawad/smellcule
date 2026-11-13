import { expect, test } from "@playwright/test";
import { localNoon } from "./views";

test("the atlas shows the notice and points at Browse @no-webgl", async ({ page }) => {
  await page.goto("/#/atlas");
  const notice = page.getByText(
    "Your browser can't draw the 3D map. Browse every molecule as a list instead.",
  );
  await expect(notice).toBeVisible();
  await expect(notice.getByRole("link")).toHaveAttribute("href", "#/browse");
  await expect(page.locator("canvas")).toHaveCount(0);
  await expect(page.locator("#atlas-search")).toBeVisible();
});

test("search still opens a card without WebGL @no-webgl", async ({ page }) => {
  await page.goto("/#/atlas");
  await page.locator("#atlas-search").fill("smells like rain");
  await page.locator("#atlas-search").press("Enter");
  await expect(page.locator("article.card h1")).toContainText("Geosmin");
});

test("Browse lists molecules and a card opens separately @no-webgl", async ({ page }) => {
  await page.goto("/#/browse");
  const family = page.locator("#main details").first();
  await family.locator("summary").click();
  await expect(family.locator("li a").first()).toBeVisible();

  await page.goto("/#/m/1066");
  await expect(page.locator("#main details")).toHaveCount(0);
  await expect(page.locator("article.card h1")).toHaveText("Geosmin");
});

test("Smellcule plays to the reveal without WebGL @no-webgl", async ({ page }) => {
  await page.clock.setFixedTime(localNoon(0));
  await page.goto("/#/smellcule");
  const options = page.locator(".options button");
  for (let index = 0; index < 3; index += 1) await options.nth(index).click();
  await page.getByRole("button", { name: "Submit" }).click();
  await expect(page.locator("pre.share")).toContainText("Smellcule 1");
});

test("a search deep link opens its card without WebGL @no-webgl", async ({ page }) => {
  await page.goto("/#/atlas?q=smells%20like%20rain");
  await expect(page.locator("article.card h1 .badge")).toHaveText("Known example: rain");
});

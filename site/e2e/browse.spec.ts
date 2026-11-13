import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";
import { fixture } from "./views";

const atlas = fixture<{ molecules: { id: string; name: string }[] }>("atlas.json");

async function seriousViolations(page: Page): Promise<string[]> {
  const { violations } = await new AxeBuilder({ page }).analyze();
  return violations
    .filter((violation) => violation.impact === "serious" || violation.impact === "critical")
    .map((violation) => violation.id);
}

test("lists every molecule once as a link under its family @cross", async ({ page }) => {
  await page.goto("/#/browse");
  const families = page.locator("#main details");
  await expect(families.first()).toBeVisible();
  expect(await seriousViolations(page)).toEqual([]);

  const listed: { id: string; name: string }[] = [];
  for (const family of await families.all()) {
    await family.locator("summary").click();
    const links = family.locator("li a");
    await expect(links.first()).toBeVisible();
    const count = await links.count();
    await expect(family.locator("summary")).toHaveText(new RegExp(`^\\S.* \\(${count}\\)$`));
    for (const link of await links.all()) {
      const href = (await link.getAttribute("href")) ?? "";
      listed.push({
        id: decodeURIComponent(href.slice(href.lastIndexOf("/") + 1)),
        name: (await link.textContent()) ?? "",
      });
    }
  }

  const byId = (a: { id: string }, b: { id: string }) => a.id.localeCompare(b.id);
  expect(listed.sort(byId)).toEqual(
    atlas.molecules.map(({ id, name }) => ({ id, name })).sort(byId),
  );
  expect(await seriousViolations(page)).toEqual([]);
});

test("a molecule link opens its card", async ({ page }) => {
  await page.goto("/#/browse");
  const family = page.locator("#main details").first();
  await family.locator("summary").click();
  const link = family.locator("li a").first();
  const name = (await link.textContent()) ?? "";
  await link.click();
  await expect(page.locator("article.card h1")).toHaveText(name);
});

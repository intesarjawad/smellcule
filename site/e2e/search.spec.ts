import { expect, test } from "@playwright/test";

test("a deep link opens Geosmin's card with no typing @cross", async ({ page }) => {
  await page.goto("/#/browse");
  await page.goto("/#/atlas?q=smells%20like%20rain");
  await expect(page.locator("article.card h1")).toContainText("Geosmin", { timeout: 15000 });
  await expect(page.locator("article.card h1 .badge")).toHaveText("Known example: rain");

  // The deep link replaces itself, so Back does not reopen the same card.
  await page.goBack();
  await expect(page).toHaveURL(/#\/browse$/);
});

test("an unmatched deep link shows the no-results state and stays on the atlas", async ({
  page,
}) => {
  await page.goto("/#/atlas?q=wet%20cardboard%20xyz");
  await expect(page.getByText("No smell or molecule called 'wet cardboard xyz'.")).toBeVisible();
  await expect(page.locator(".search-suggestions button")).toHaveText([
    "rain",
    "coffee shop",
    "campfire",
  ]);
  await expect(page).toHaveURL(/#\/atlas\?q=/);
});

test("the empty search offers three suggestions and one click opens the card", async ({ page }) => {
  await page.goto("/#/atlas");
  const suggestions = page.locator(".search-suggestions button");
  await expect(suggestions).toHaveText(["rain", "coffee shop", "campfire"]);
  await suggestions.first().click();
  await expect(page.locator("article.card h1")).toContainText("Geosmin", { timeout: 15000 });
});

test("Enter on a phrase without a known example opens the molecule its deep link opens", async ({
  page,
}) => {
  await page.goto("/#/atlas?q=bakery");
  const expected = await page.locator("article.card h1").textContent();
  expect(expected).not.toBeNull();

  await page.goto("/#/browse");
  await page.goto("/#/atlas");
  const field = page.getByRole("combobox");
  await field.fill("bakery");
  await expect(page.locator('[role="listbox"] > *').first()).toContainText("Bakery");
  await field.press("Enter");
  await expect(page.locator("article.card h1")).toHaveText(expected ?? "");
});

test("the search label stays clear of the focused field", async ({ page }) => {
  await page.goto("/#/atlas");
  const input = page.getByLabel("Search the atlas");
  await input.focus();
  const label = await page.locator(".search label").boundingBox();
  const field = await input.boundingBox();
  if (label === null || field === null) throw new Error("the search field is not laid out");
  // The focus ring draws 3px outside a 2px offset, so the label keeps 5px from the field.
  const ring = 5;
  const apart =
    label.y + label.height <= field.y - ring ||
    label.x + label.width <= field.x - ring ||
    field.y + field.height + ring <= label.y;
  expect(apart).toBe(true);
});

test("the combobox exposes and scrolls its active option", async ({ page }) => {
  await page.goto("/#/atlas");
  const field = page.getByRole("combobox");
  await expect(field).toHaveAttribute("aria-expanded", "false");
  await field.fill("a");
  await expect(field).toHaveAttribute("aria-expanded", "true");
  await field.press("ArrowDown");
  const active = await field.getAttribute("aria-activedescendant");
  expect(active).not.toBeNull();
  const option = page.locator(`[id="${active}"]`);
  await expect(option).toHaveAttribute("aria-selected", "true");
  await expect(option).toBeInViewport();
  await field.fill("zzzzzzzzzz");
  await expect(field).toHaveAttribute("aria-expanded", "false");
  await expect(field).not.toHaveAttribute("aria-activedescendant");
});

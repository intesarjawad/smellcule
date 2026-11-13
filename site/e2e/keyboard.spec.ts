import { expect, test } from "@playwright/test";

test("the search field takes focus on load and / brings it back", async ({ page }) => {
  await page.goto("/#/atlas");
  const search = page.getByRole("combobox");
  await expect(search).toBeFocused();
  await page.locator(".atlas-instructions").click();
  await expect(search).not.toBeFocused();
  await page.keyboard.press("/");
  await expect(search).toBeFocused();
  await expect(search).toHaveValue("");
});

test("/ from another view goes to the atlas search", async ({ page }) => {
  await page.goto("/#/browse");
  await page.locator("h1").first().click();
  await page.keyboard.press("/");
  await expect(page).toHaveURL(/#\/atlas$/);
  await expect(page.getByRole("combobox")).toBeFocused();
});

test("search, card, neighbour and Esc work from the keyboard alone", async ({ page }) => {
  await page.goto("/#/atlas");
  await expect(page.getByRole("combobox")).toBeFocused();
  await page.keyboard.type("smells like rain");
  await page.keyboard.press("Enter");
  await expect(page.locator("article.card h1")).toContainText("Geosmin", { timeout: 15000 });

  const neighbour = page.locator("ul.neighbours a").first();
  const name = await neighbour.textContent();
  await page.locator("body").focus();
  for (let stop = 0; stop < 200; stop += 1) {
    await page.keyboard.press("Tab");
    if (await neighbour.evaluate((link) => link === document.activeElement)) break;
  }
  await expect(neighbour).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator("article.card h1")).toContainText(name ?? "", { timeout: 15000 });

  await page.keyboard.press("Escape");
  await expect(page).toHaveURL(/#\/browse$/);
  await expect(page.locator("article.card")).toHaveCount(0);
});

test("arrow keys turn the focused map and + and - zoom it", async ({ page }) => {
  await page.goto("/#/atlas");
  const canvas = page.getByRole("img", { name: "Interactive 3D map of molecules" });
  await canvas.focus();
  await expect(canvas).toBeFocused();

  for (const key of ["ArrowRight", "ArrowUp", "+", "-"]) {
    const before = await canvas.screenshot();
    await page.keyboard.press(key);
    await expect
      .poll(async () => (await canvas.screenshot()).equals(before), { message: key })
      .toBe(false);
  }
  await expect(page).toHaveURL(/#\/atlas$/);
});

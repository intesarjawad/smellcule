import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { openView, VIEWS } from "./views";

const BLOCKING_IMPACTS = new Set(["serious", "critical"]);

for (const view of VIEWS) {
  test(`the ${view.name} view has no serious or critical axe violations`, async ({ page }) => {
    await openView(page, view);
    if (view.name === "card") {
      await page
        .locator(".thread-tile")
        .last()
        .evaluate(async (tile) => {
          await Promise.all(tile.getAnimations().map((animation) => animation.finished));
        });
    }
    const { violations } = await new AxeBuilder({ page }).analyze();
    const blocking = violations
      .filter((violation) => BLOCKING_IMPACTS.has(violation.impact ?? ""))
      .map(
        (violation) => `${violation.id}: ${violation.nodes.map((node) => node.target).join(" ")}`,
      );
    expect(blocking).toEqual([]);
  });
}

test("skip link focuses the current main region without changing routes", async ({ page }) => {
  await page.goto("/#/browse");
  await page.getByRole("link", { name: "Skip to content" }).focus();
  await page.keyboard.press("Enter");
  await expect(page.locator("#main")).toBeFocused();
  await expect(page).toHaveURL(/#\/browse$/);
});

test("search results have no serious axe violations", async ({ page }) => {
  await page.goto("/#/atlas");
  await page.getByRole("combobox").fill("rain");
  const { violations } = await new AxeBuilder({ page }).analyze();
  expect(violations.filter((v) => BLOCKING_IMPACTS.has(v.impact ?? ""))).toEqual([]);
});

test("each view has a primary heading and a route-specific title", async ({ page }) => {
  for (const view of VIEWS) {
    await openView(page, view);
    await expect(page.locator("#main h1")).toHaveCount(1);
    await expect(page).toHaveTitle(/.+ \| Smellcule/);
  }
});

import { expect, type Page, test } from "@playwright/test";
import { SITE_STATES, type SiteState, VIEWPORTS } from "../tests/states";
import { localNoon } from "./views";

async function render(page: Page, state: SiteState): Promise<void> {
  await state.before?.(page);
  await page.clock.setFixedTime(localNoon(state.day ?? 0));
  await page.goto(`/${state.route}`);
  await state.act?.(page);
  await expect(state.ready(page)).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
}

for (const viewport of VIEWPORTS) {
  const size = `${viewport.width}x${viewport.height}`;
  test.describe(size, () => {
    test.use({ viewport });

    for (const state of SITE_STATES) {
      test(`renders ${state.id}`, async ({ page }) => {
        await render(page, state);
      });

      test(`${state.id} matches its golden @golden`, async ({ page }) => {
        await render(page, state);
        await expect(page).toHaveScreenshot(`${state.id}-${size}.png`, {
          fullPage: true,
          maxDiffPixelRatio: 0.01,
        });
      });
    }
  });
}

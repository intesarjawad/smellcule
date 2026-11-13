import { expect, type Page, test } from "@playwright/test";
import { openView, VIEWS } from "./views";

const MIN_OUTLINE_PX = 2;
const MAX_TAB_STOPS = 400;

interface FocusRing {
  readonly repeat: boolean;
  readonly control: string;
  readonly style: string;
  readonly widthPx: number;
}

/** The outline of whatever the keyboard has focused, or null when focus left the controls. */
function focusedRing(page: Page): Promise<FocusRing | null> {
  return page.evaluate(() => {
    const active = document.activeElement;
    if (active === null || active === document.body) return null;
    const probe = window as unknown as { focusSeen?: WeakSet<Element> };
    probe.focusSeen ??= new WeakSet();
    const repeat = probe.focusSeen.has(active);
    probe.focusSeen.add(active);
    const style = getComputedStyle(active);
    const label =
      (active.textContent ?? "").trim().slice(0, 40) || active.getAttribute("aria-label");
    return {
      repeat,
      control: `${active.tagName.toLowerCase()}#${active.id} ${label ?? ""}`.trim(),
      style: style.outlineStyle,
      widthPx: Number.parseFloat(style.outlineWidth),
    };
  });
}

for (const view of VIEWS) {
  test(`every control in the ${view.name} view shows a focus ring`, async ({ page }) => {
    await openView(page, view);
    await page.locator("body").focus();
    const seen: FocusRing[] = [];
    for (let stop = 0; stop < MAX_TAB_STOPS; stop += 1) {
      await page.keyboard.press("Tab");
      const ring = await focusedRing(page);
      if (ring === null || ring.repeat) break;
      seen.push(ring);
    }
    expect(seen.length).toBeGreaterThan(0);
    const missing = seen.filter((ring) => ring.style === "none" || ring.widthPx < MIN_OUTLINE_PX);
    expect(missing).toEqual([]);
  });
}

test("the focus ring matches its golden @golden", async ({ page }) => {
  const decompile = VIEWS.find((view) => view.name === "decompile");
  if (decompile === undefined) throw new Error("The decompile view is missing");
  await openView(page, decompile);
  await page.evaluate(() => document.fonts.ready);
  const archetype = page.locator(".archetypes button").first();
  await archetype.focus();
  await page.keyboard.press("Shift+Tab");
  await page.keyboard.press("Tab");
  await expect(archetype).toBeFocused();
  await expect(page.locator(".archetypes")).toHaveScreenshot("focus-ring.png", {
    maxDiffPixelRatio: 0.01,
  });
});

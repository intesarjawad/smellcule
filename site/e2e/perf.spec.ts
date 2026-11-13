import { expect, test } from "@playwright/test";
import { frameTimes, markTime, percentile95 } from "./timing";

// Desktop budgets: the overview drawn within 2.5 s of a cold load, and orbiting at a p95 frame
// time under 20 ms.
const MAX_COLD_LOAD_MS = 2500;
const MAX_P95_FRAME_MS = 20;
const DRAG_STEPS = 60;

test.beforeEach(async ({ isMobile, page }) => {
  test.skip(isMobile, "the phone budgets live in atlas-perf.spec.ts");
  const session = await page.context().newCDPSession(page);
  await session.send("Network.setCacheDisabled", { cacheDisabled: true });
});

test("the overview draws within the cold-load budget @gate", async ({ page }) => {
  await page.goto("/#/atlas");
  const canvas = page.getByRole("img", { name: "Interactive 3D map of molecules" });
  await expect(canvas).toBeVisible({ timeout: MAX_COLD_LOAD_MS * 4 });
  await expect.poll(() => markTime(page, "atlas-first-frame")).not.toBeNull();
  const firstFrame = (await markTime(page, "atlas-first-frame")) ?? Number.POSITIVE_INFINITY;
  console.log(`desktop cold load to first frame: ${Math.round(firstFrame)} ms`);
  expect(firstFrame).toBeLessThanOrEqual(MAX_COLD_LOAD_MS);
});

test("orbiting keeps the p95 frame time within budget @gate", async ({ page }) => {
  await page.goto("/#/atlas");
  const canvas = page.getByRole("img", { name: "Interactive 3D map of molecules" });
  await expect(canvas).toBeVisible({ timeout: MAX_COLD_LOAD_MS * 4 });
  const box = await canvas.boundingBox();
  if (box === null) throw new Error("The atlas canvas has no box");
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;

  const frames = await frameTimes(page, async () => {
    await page.mouse.move(x, y);
    await page.mouse.down();
    for (let step = 1; step <= DRAG_STEPS; step += 1) {
      await page.mouse.move(x + step * 3, y + step, { steps: 2 });
    }
    await page.mouse.up();
  });
  expect(frames.length).toBeGreaterThan(0);
  const p95 = percentile95(frames);
  console.log(`desktop orbit p95 frame time: ${p95.toFixed(1)} ms over ${frames.length} frames`);
  expect(p95).toBeLessThanOrEqual(MAX_P95_FRAME_MS);
});

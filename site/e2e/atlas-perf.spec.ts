import { expect, test } from "@playwright/test";
import { markWhenShown, shownAt } from "./timing";
import { localNoon } from "./views";

// A mid-range phone should reach the map in 2.5 s with a cold cache and keep dragging under
// 33 ms a frame with its CPU throttled four times.
const MAX_TIME_TO_MAP_MS = 2500;
const MAX_P95_FRAME_MS = 33;
const CPU_THROTTLE_RATE = 4;
const DRAG_STEPS = 40;
const MAX_SMELLCULE_INTERACTIVE_MS = 3000;

test.beforeEach(async ({ isMobile, page }) => {
  test.skip(!isMobile, "the frame budget is set for the mobile profile");
  const session = await page.context().newCDPSession(page);
  await session.send("Network.setCacheDisabled", { cacheDisabled: true });
  await session.send("Emulation.setCPUThrottlingRate", { rate: CPU_THROTTLE_RATE });
});

test("the atlas draws within the load budget on the real bundle @perf @gate", async ({ page }) => {
  await page.goto("/#/atlas");
  const canvas = page.getByRole("img", { name: "Interactive 3D map of molecules" });
  await expect(canvas).toBeVisible({ timeout: MAX_TIME_TO_MAP_MS * 2 });
  const firstFrame = await page.evaluate(
    () => performance.getEntriesByName("atlas-first-frame", "mark")[0]?.startTime ?? null,
  );
  if (firstFrame === null) throw new Error("The atlas did not mark its first frame");
  console.log(`phone load to first frame: ${Math.round(firstFrame)} ms`);
  expect(firstFrame).toBeLessThanOrEqual(MAX_TIME_TO_MAP_MS);
  const box = await canvas.boundingBox();
  expect(box?.width ?? 0).toBeGreaterThan(0);
  expect(box?.height ?? 0).toBeGreaterThan(0);
});

test("dragging the atlas keeps frames within the budget @perf @gate", async ({ page }) => {
  await page.goto("/#/atlas");
  const canvas = page.getByRole("img", { name: "Interactive 3D map of molecules" });
  await expect(canvas).toBeVisible({ timeout: MAX_TIME_TO_MAP_MS * 2 });
  const box = await canvas.boundingBox();
  if (box === null) throw new Error("The atlas canvas has no box");

  await page.evaluate(() => {
    const frames: number[] = [];
    const probe = window as unknown as { frameProbe: { frames: number[]; stop: boolean } };
    probe.frameProbe = { frames, stop: false };
    let last = performance.now();
    const tick = (now: number): void => {
      frames.push(now - last);
      last = now;
      if (!probe.frameProbe.stop) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });

  const centreX = box.x + box.width / 2;
  const centreY = box.y + box.height / 2;
  await page.mouse.move(centreX, centreY);
  await page.mouse.down();
  for (let step = 1; step <= DRAG_STEPS; step += 1) {
    await page.mouse.move(centreX + step * 3, centreY + step, { steps: 2 });
  }
  await page.mouse.up();

  const frames = await page.evaluate(() => {
    const probe = (window as unknown as { frameProbe: { frames: number[]; stop: boolean } })
      .frameProbe;
    probe.stop = true;
    return probe.frames.slice(1);
  });
  expect(frames.length).toBeGreaterThan(0);
  const sorted = [...frames].sort((a, b) => a - b);
  const p95 = sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1)] ?? 0;
  console.log(`phone orbit p95 frame time: ${p95.toFixed(1)} ms over ${frames.length} frames`);
  expect(p95).toBeLessThanOrEqual(MAX_P95_FRAME_MS);
});

test("Smellcule is interactive within its budget @perf @gate", async ({ page }) => {
  await page.clock.setFixedTime(localNoon(0));
  await markWhenShown(page, ".options button:enabled", "smellcule-interactive");
  await page.goto("/#/smellcule");
  await expect(page.locator(".options button").first()).toBeEnabled({
    timeout: MAX_SMELLCULE_INTERACTIVE_MS * 3,
  });
  const interactive = (await shownAt(page, "smellcule-interactive")) ?? Number.POSITIVE_INFINITY;
  console.log(`phone Smellcule interactive: ${Math.round(interactive)} ms`);
  expect(interactive).toBeLessThanOrEqual(MAX_SMELLCULE_INTERACTIVE_MS);
});

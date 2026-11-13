import { readFileSync } from "node:fs";
import { expect, type Page, test } from "@playwright/test";
import { SITE_STATES } from "../tests/states";
import { fixture, localNoon } from "./views";

// The scene's starting camera: on the z axis, looking at the origin with a 50 degree field.
const CAMERA_DISTANCE = 260;
const CAMERA_FOV_DEGREES = 50;
const CAMERA_FLIGHT_MS = 600;

const molecules = fixture<{ molecules: { id: string }[] }>("atlas.json").molecules;
const positions = (() => {
  const bytes = readFileSync(new URL("../public/fixture-data/positions.bin", import.meta.url));
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return molecules.map((_, index) => ({
    x: view.getFloat32(index * 12, true),
    y: view.getFloat32(index * 12 + 4, true),
    z: view.getFloat32(index * 12 + 8, true),
  }));
})();

interface Target {
  readonly id: string;
  readonly x: number;
  readonly y: number;
}

/** The point that stands furthest from its neighbours on screen, so a click cannot miss it. */
async function clearestPoint(page: Page): Promise<Target> {
  const canvas = page.getByRole("img", { name: "Interactive 3D map of molecules" });
  await expect(canvas).toBeVisible();
  const box = await canvas.boundingBox();
  if (box === null) throw new Error("The atlas canvas has no box");
  const halfHeight = Math.tan((CAMERA_FOV_DEGREES * Math.PI) / 360);
  const aspect = box.width / box.height;
  const projected = positions.map((point, index) => {
    const depth = CAMERA_DISTANCE - point.z;
    return {
      id: molecules[index]?.id ?? "",
      x: box.x + ((point.x / (depth * halfHeight * aspect) + 1) / 2) * box.width,
      y: box.y + ((1 - point.y / (depth * halfHeight)) / 2) * box.height,
    };
  });
  const gap = (point: Target) =>
    Math.min(
      ...projected
        .filter((other) => other !== point)
        .map((other) => Math.hypot(other.x - point.x, other.y - point.y)),
    );
  const [best] = [...projected].sort((a, b) => gap(b) - gap(a));
  if (best === undefined) throw new Error("The fixture has no points");
  return best;
}

/**
 * Counts animation frames and time from the visitor's action (`pointerup` for a click,
 * `keydown` for Enter) until the card's route replaces the atlas.
 */
async function measureArrival(
  page: Page,
  trigger: "pointerup" | "keydown",
  act: () => Promise<void>,
  cardId: string,
): Promise<{ frames: number; ms: number }> {
  await page.evaluate((startEvent) => {
    const probe = { frames: 0, start: 0, end: 0, running: false };
    (window as unknown as { flightProbe: typeof probe }).flightProbe = probe;
    window.addEventListener(
      startEvent,
      () => {
        probe.start = performance.now();
        probe.running = true;
        const tick = (): void => {
          if (!probe.running) return;
          probe.frames += 1;
          requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      },
      { capture: true, once: true },
    );
    window.addEventListener(
      "hashchange",
      () => {
        probe.end = performance.now();
        probe.running = false;
      },
      { once: true },
    );
  }, trigger);
  await act();
  await expect(page).toHaveURL(new RegExp(`#/molecule/${cardId}(\\?.*)?$`), {
    timeout: 15000,
  });
  return page.evaluate(() => {
    const probe = (
      window as unknown as { flightProbe: { frames: number; start: number; end: number } }
    ).flightProbe;
    return { frames: probe.frames, ms: probe.end - probe.start };
  });
}

function clickPoint(page: Page, target: Target): Promise<{ frames: number; ms: number }> {
  return measureArrival(page, "pointerup", () => page.mouse.click(target.x, target.y), target.id);
}

async function searchAndEnter(page: Page): Promise<{ frames: number; ms: number }> {
  const field = page.locator("#atlas-search");
  await field.fill("smells like rain");
  return measureArrival(page, "keydown", () => field.press("Enter"), "1066");
}

test("selecting a point flies the camera before the card opens", async ({ page }) => {
  await page.goto("/#/atlas");
  const flight = await clickPoint(page, await clearestPoint(page));
  expect(flight.ms).toBeGreaterThanOrEqual(CAMERA_FLIGHT_MS);
});

test("Enter on a search result flies the camera before the card opens", async ({ page }) => {
  await page.goto("/#/atlas");
  await expect(page.getByRole("img", { name: "Interactive 3D map of molecules" })).toBeVisible();
  const flight = await searchAndEnter(page);
  expect(flight.ms).toBeGreaterThanOrEqual(CAMERA_FLIGHT_MS);
  await expect(page.locator("article.card h1 .badge")).toHaveText("Known example: rain");
});

async function expectStillArrival(page: Page): Promise<void> {
  const open = page.getByRole("button", { name: "Open the card" });
  await expect(open).toBeVisible();
  await expect(page.locator(".arrival-item")).toHaveCount(8);
  await expect(page.locator(".arrival-hub")).toHaveCount(1);
  // The frame stays put: no timer carries the visitor on to the card.
  await page.waitForTimeout(2000);
  await expect(open).toBeVisible();
  await open.click();
  await expect(page.locator("article.card[data-ready]")).toBeVisible();
}

test.describe("under reduced motion", () => {
  test.use({ reducedMotion: "reduce" });

  test("selecting a point shows the arrival still, and the card opens on request", async ({
    page,
  }) => {
    await page.goto("/#/atlas");
    const target = await clearestPoint(page);
    await page.mouse.click(target.x, target.y);
    await expectStillArrival(page);
  });

  test("Enter on a search result shows the arrival still, and the card opens on request", async ({
    page,
  }) => {
    await page.goto("/#/atlas");
    await expect(page.getByRole("img", { name: "Interactive 3D map of molecules" })).toBeVisible();
    await page.locator("#atlas-search").fill("smells like rain");
    await page.locator("#atlas-search").press("Enter");
    await expectStillArrival(page);
  });

  for (const state of SITE_STATES.filter((entry) => entry.motionOnly !== true)) {
    test(`nothing animates in the ${state.id} state`, async ({ page }) => {
      await state.before?.(page);
      await page.clock.setFixedTime(localNoon(state.day ?? 0));
      await page.goto(`/${state.route}`);
      await state.act?.(page);
      await expect(state.ready(page)).toBeVisible();
      expect(await page.evaluate(() => document.getAnimations().length)).toBe(0);
    });
  }
});

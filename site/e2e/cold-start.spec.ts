import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type BrowserContext, chromium, expect, type Page, test } from "@playwright/test";
import { markWhenShown, shownAt } from "./timing";

// Time to demo from a clean profile: no cache, no storage, no service worker.
const DEEP_LINK_MS = 5000;
const TYPED_MS = 8000;
const OWN_INPUT_MS = 8000;
const PHONE_MS = 10000;
const TYPING_DELAY_MS = 90;
const CPU_THROTTLE_RATE = 4;
const CARD = "article.card[data-ready]";
const ARRIVED = "arrived";

async function cleanProfile(
  use: Parameters<typeof chromium.launchPersistentContext>[1],
  run: (page: Page, context: BrowserContext) => Promise<void>,
): Promise<void> {
  const profile = await mkdtemp(join(tmpdir(), "smellcule-cold-"));
  const context = await chromium.launchPersistentContext(profile, use);
  try {
    const page = context.pages()[0] ?? (await context.newPage());
    await run(page, context);
  } finally {
    await context.close();
    await rm(profile, { recursive: true, force: true });
  }
}

async function timeTo(page: Page, label: string, budgetMs: number): Promise<void> {
  await expect.poll(() => shownAt(page, ARRIVED), { timeout: budgetMs * 3 }).not.toBeNull();
  const ms = (await shownAt(page, ARRIVED)) ?? Number.POSITIVE_INFINITY;
  console.log(`${label}: ${Math.round(ms)} ms (budget ${budgetMs} ms)`);
  expect(ms).toBeLessThanOrEqual(budgetMs);
}

test.describe("desktop", () => {
  test.beforeEach(({ isMobile }) => {
    test.skip(isMobile, "the phone case is below");
  });

  test("the deep link reaches the Geosmin card @gate", async ({ baseURL }) => {
    await cleanProfile({ baseURL }, async (page) => {
      await markWhenShown(page, CARD, ARRIVED);
      await page.goto("/#/atlas?q=smells%20like%20rain");
      await expect(page.locator(`${CARD} h1`)).toContainText("Geosmin", {
        timeout: DEEP_LINK_MS * 3,
      });
      await timeTo(page, "deep link", DEEP_LINK_MS);
    });
  });

  test("typing the phrase reaches the Geosmin card @gate", async ({ baseURL }) => {
    await cleanProfile({ baseURL }, async (page) => {
      await markWhenShown(page, CARD, ARRIVED);
      await page.goto("/");
      await page.getByRole("link", { name: "Atlas" }).first().click();
      const search = page.getByRole("combobox");
      await search.pressSequentially("smells like rain", { delay: TYPING_DELAY_MS });
      await search.press("Enter");
      await expect(page.locator(`${CARD} h1`)).toContainText("Geosmin", { timeout: TYPED_MS * 3 });
      await timeTo(page, "typed", TYPED_MS);
    });
  });

  for (const query of ["vanilla", "fresh bread"]) {
    test(`"${query}" reaches its first result's card @gate`, async ({ baseURL }) => {
      await cleanProfile({ baseURL }, async (page) => {
        await markWhenShown(page, CARD, ARRIVED);
        await page.goto("/#/atlas");
        const search = page.getByRole("combobox");
        await search.pressSequentially(query, { delay: TYPING_DELAY_MS });
        await search.press("Enter");
        await expect(page.locator(CARD)).toBeVisible({ timeout: OWN_INPUT_MS * 3 });
        await timeTo(page, `own input "${query}"`, OWN_INPUT_MS);
      });
    });
  }

  test("a pasted note list reaches the decompiler result @gate", async ({ baseURL }) => {
    await cleanProfile({ baseURL }, async (page) => {
      await markWhenShown(page, ".decompiler a[href^='#/synesthesia?mix=']", ARRIVED);
      await page.goto("/#/decompile");
      await page
        .getByLabel("Notes from a perfume description")
        .fill("Top: bergamot / Heart: rose / Base: vanilla, musk");
      await expect(page.getByRole("link", { name: "Play this" })).toBeVisible({
        timeout: OWN_INPUT_MS * 3,
      });
      await timeTo(page, "own input decompiler", OWN_INPUT_MS);
    });
  });
});

test("the phone deep link reaches the Geosmin card @perf @gate", async ({
  baseURL,
  isMobile,
  viewport,
  userAgent,
  deviceScaleFactor,
  hasTouch,
}) => {
  test.skip(!isMobile, "the phone budget is set for the mobile profile");
  await cleanProfile(
    { baseURL, isMobile, viewport, userAgent, deviceScaleFactor, hasTouch },
    async (page, context) => {
      const session = await context.newCDPSession(page);
      await session.send("Emulation.setCPUThrottlingRate", { rate: CPU_THROTTLE_RATE });
      await markWhenShown(page, CARD, ARRIVED);
      await page.goto("/#/atlas?q=smells%20like%20rain");
      await expect(page.locator(`${CARD} h1`)).toContainText("Geosmin", { timeout: PHONE_MS * 3 });
      await timeTo(page, "phone deep link", PHONE_MS);
    },
  );
});

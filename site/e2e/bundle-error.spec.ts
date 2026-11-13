import { expect, test } from "@playwright/test";
import { fixture } from "./views";

const TRUNCATED_BYTES = 10;

test("a truncated predictions file shows the reason, and Retry loads the atlas", async ({
  page,
}) => {
  const atlas = fixture<{ molecules: unknown[]; labels: unknown[] }>("atlas.json");
  const expectedBytes = atlas.molecules.length * atlas.labels.length;
  let requests = 0;
  await page.route("**/predictions.bin", async (route) => {
    requests += 1;
    const response = await route.fetch();
    const body = await response.body();
    await route.fulfill({
      response,
      body: requests === 1 ? body.subarray(0, body.length - TRUNCATED_BYTES) : body,
    });
  });

  await page.goto("/#/atlas");
  const panel = page.getByRole("alert");
  await expect(panel).toContainText("The atlas didn't load.");
  await expect(panel.getByText("predictions.bin")).toBeHidden();
  await panel.getByText("What went wrong").click();
  await expect(panel).toContainText(
    `predictions.bin: expected ${expectedBytes} bytes for ${atlas.molecules.length} molecules x ${atlas.labels.length} descriptors, found ${expectedBytes - TRUNCATED_BYTES}`,
  );

  await panel.getByRole("button", { name: "Try again" }).click();
  await expect(page.locator("#atlas-search")).toBeVisible();
  await expect(page.getByRole("alert")).toHaveCount(0);
  expect(requests).toBe(2);
});

test("an unreachable bundle shows the same panel on the game and the decompiler", async ({
  page,
}) => {
  await page.route("**/atlas.json", (route) => route.fulfill({ status: 503 }));
  for (const hash of ["#/smellcule", "#/decompile"]) {
    await page.goto(`/${hash}`);
    await expect(page.getByRole("alert")).toContainText("The atlas didn't load.");
    await expect(page.getByRole("button", { name: "Try again" })).toBeVisible();
  }
});

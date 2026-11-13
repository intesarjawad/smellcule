import { expect, test } from "@playwright/test";
import { openView, VIEWS } from "./views";

test("no view sends a request to another origin", async ({ page, baseURL }) => {
  const own = new URL(baseURL ?? "http://localhost:4173/").origin;
  const foreign: string[] = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.protocol !== "data:" && url.protocol !== "blob:" && url.origin !== own) {
      foreign.push(request.url());
    }
  });

  for (const view of VIEWS) {
    await openView(page, view);
    await page.waitForLoadState("networkidle");
  }
  expect(foreign).toEqual([]);
});

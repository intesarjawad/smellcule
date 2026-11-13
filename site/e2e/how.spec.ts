import { expect, test } from "@playwright/test";
import { fixture } from "./views";

const atlas = fixture<{ version: string; dataLicence: string; stats: Record<string, number> }>(
  "atlas.json",
);

test("every measurement on the page is the bundle's own value @no-webgl", async ({ page }) => {
  await page.goto("/#/how");
  await expect(page.getByRole("heading", { name: "How it works" })).toBeVisible();

  const shown = await page
    .locator("article.how dl")
    .evaluateAll((lists) =>
      lists.flatMap((list) =>
        [...list.querySelectorAll("dt")].map((term) => [
          term.textContent ?? "",
          term.nextElementSibling?.textContent ?? "",
        ]),
      ),
    );
  const expected = Object.entries(atlas.stats).map(([key, value]) => [key, String(value)]);
  const byKey = (a: string[], b: string[]) => (a[0] ?? "").localeCompare(b[0] ?? "");
  expect(shown.sort(byKey)).toEqual(expected.sort(byKey));
});

test("the footer downloads the release asset for the bundle's version @no-webgl", async ({
  page,
}) => {
  await page.goto("/#/how");
  const download = page
    .locator("#site-footer")
    .getByRole("link", { name: `Download all data (${atlas.dataLicence})` });
  await expect(download).toHaveAttribute(
    "href",
    `https://github.com/intesarjawad/smellcule/releases/download/v${atlas.version}/atlas-data-${atlas.version}.tar.gz`,
  );
  await expect(
    page.locator("#site-footer").getByRole("link", { name: "How it works" }),
  ).toHaveAttribute("href", "#/how");
});

test("the page covers each part in the order it promises @no-webgl", async ({ page }) => {
  await page.goto("/#/how");
  await expect(page.locator("article.how h2")).toHaveText([
    "Where the descriptors come from",
    "Measured and predicted",
    "What the split badges mean",
    "From a structure to probabilities",
    "Why the map is a projection",
    "What each view claims, and what it does not",
    "What this frees, and its limits",
    "Bend it",
    "The measurements",
  ]);
  const stats = atlas.stats;
  await expect(page.locator("article.how")).toContainText(
    `trained on ${stats.cluster_train} molecules, used ${stats.cluster_validation} others only to decide when to stop, and never saw ${stats.cluster_held_out}`,
  );
  await expect(page.locator("article.how li").filter({ hasText: "Held out:" })).toHaveText(
    "Held out: the model never saw this molecule",
  );
});

test("the map section quotes the trustworthiness a bundle carries @no-webgl", async ({ page }) => {
  await page.route("**/atlas.json", async (route) => {
    const response = await route.fetch();
    const atlas = (await response.json()) as { stats: Record<string, number> };
    const stats = { ...atlas.stats, "map.trustworthiness": 0.9986, "map.neighbour_count": 8 };
    await route.fulfill({ response, json: { ...atlas, stats } });
  });
  await page.goto("/#/how");
  await expect(page.getByText("the map's trustworthiness at k = 8 is 0.999")).toBeVisible();
});

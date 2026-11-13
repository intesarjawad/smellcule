import { expect, type Page, test } from "@playwright/test";
import { fixture } from "./views";

const atlas = fixture<{ molecules: { id: string; name: string }[] }>("atlas.json");

/** Everything the polite live region says, in order, from the first page load on. */
async function recordAnnouncements(page: Page): Promise<() => Promise<string[]>> {
  await page.addInitScript(() => {
    const said: string[] = [];
    (window as unknown as { said: string[] }).said = said;
    document.addEventListener("DOMContentLoaded", () => {
      const live = document.querySelector("#live");
      if (live === null) return;
      new MutationObserver(() => said.push(live.textContent ?? "")).observe(live, {
        childList: true,
        characterData: true,
        subtree: true,
      });
    });
  });
  return () => page.evaluate(() => (window as unknown as { said: string[] }).said);
}

test("the live region says loading, flying and arrived", async ({ page }) => {
  const announcements = await recordAnnouncements(page);
  await page.goto("/#/atlas");
  await expect(page.getByRole("combobox")).toBeFocused();
  await page.keyboard.type("smells like rain");
  await page.keyboard.press("Enter");
  await expect(page.locator("article.card h1")).toContainText("Geosmin");
  const said = await announcements();
  expect(said[0]).toBe("Loading the atlas…");
  expect(said).toContain("Flying to Geosmin.");
  expect(said.indexOf("Flying to Geosmin.")).toBeLessThan(said.length - 1);
  expect(said.at(-1)).toMatch(/^Geosmin, \d+ measured descriptors?$/);
});

test("Enter on a neighbour flies the camera there and opens its card", async ({ page }) => {
  const announcements = await recordAnnouncements(page);
  await page.goto("/#/browse");
  await page.goto(`/#/m/${atlas.molecules.find((m) => m.name === "Geosmin")?.id}`);
  const neighbour = page.locator("ul.neighbours a").first();
  const name = (await neighbour.textContent()) ?? "";
  await neighbour.focus();
  await page.keyboard.press("Enter");

  await expect(page.locator("article.card h1")).toContainText(name, { timeout: 15000 });
  expect(await announcements()).toContain(`Flying to ${name}.`);
  // The flight replaces its own entry, so Back returns to the card it started from.
  await page.goBack();
  await expect(page.locator("article.card h1")).toContainText("Geosmin");
});

test("a neighbour shows its arrival still under reduced motion, then opens its card", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(`/#/m/${atlas.molecules.find((m) => m.name === "Geosmin")?.id}`);
  const neighbour = page.locator("ul.neighbours a").first();
  const name = (await neighbour.textContent()) ?? "";
  await neighbour.click();
  await page.getByRole("button", { name: "Open the card" }).click();
  await expect(page.locator("article.card h1")).toContainText(name);
});

test("Show on atlas marks the molecules in the scene and lists them as text", async ({ page }) => {
  const ids = atlas.molecules.slice(0, 3).map((molecule) => molecule.id);
  const canvas = page.getByRole("img", { name: "Interactive 3D map of molecules" });

  await page.goto("/#/atlas");
  await expect(canvas).toBeVisible();
  const plain = await canvas.screenshot();

  await page.goto(`/#/atlas?ids=${ids.join(",")}`);
  await expect(canvas).toBeVisible();
  await expect
    .poll(async () => (await canvas.screenshot()).equals(plain), {
      message: "the highlighted points are drawn",
    })
    .toBe(false);
  await expect(page.getByText("Highlighted by the decompiler:").getByRole("link")).toHaveText(
    atlas.molecules.slice(0, 3).map((molecule) => molecule.name),
  );
});

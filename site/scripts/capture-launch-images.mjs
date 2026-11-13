import { copyFile, readFile } from "node:fs/promises";
import { resolve, sep } from "node:path";
import { chromium } from "playwright";

// Serve the site with VITE_DATA_URL=fixture-data/; point this at the real bundle.
const data = resolve(process.env.SMELLCULE_CAPTURE_DATA ?? "site/public/data");
const base = process.env.SMELLCULE_CAPTURE_URL ?? "http://localhost:5173/";
const atlas = JSON.parse(await readFile(resolve(data, "atlas.json"), "utf8"));
if (atlas.molecules.length < 1000) throw new Error("Capture requires the real data bundle.");
const browser = await chromium.launch({
  executablePath:
    process.env.BRAVE_PATH ?? "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser",
  headless: true,
});
try {
  const page = await browser.newPage({ reducedMotion: "reduce", deviceScaleFactor: 1 });
  await page.route("**/fixture-data/**", async (route) => {
    const name = decodeURIComponent(
      new URL(route.request().url()).pathname.split("/fixture-data/")[1],
    );
    const file = resolve(data, name);
    if (!file.startsWith(data + sep)) throw new Error("Invalid data path");
    const contentType = file.endsWith(".json")
      ? "application/json"
      : file.endsWith(".svg")
        ? "image/svg+xml"
        : "application/octet-stream";
    await route.fulfill({ body: await readFile(file), contentType });
  });
  const geosmin = atlas.molecules.find((molecule) => molecule.name === "Geosmin");
  if (!geosmin) throw new Error("Missing Geosmin in the bundle.");
  for (const [file, width, height] of [
    ["docs/hero.png", 1440, 810],
    ["docs/social-preview.png", 1280, 640],
  ]) {
    await page.setViewportSize({ width, height });
    await page.goto(`${base}#/?tune=${geosmin.id}`);
    await page.locator("#rx-query").fill("rain");
    await page.locator("#rx-query").blur();
    await page.waitForFunction(
      () => document.querySelector(".rx-read-name")?.textContent === "Geosmin",
    );
    await page.locator(".receiver.burning").waitFor({ state: "hidden" });
    await page.screenshot({ path: file });
  }
  await copyFile("docs/social-preview.png", "site/public/social-preview.png");
} finally {
  await browser.close();
}

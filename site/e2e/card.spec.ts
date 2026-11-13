import { expect, type Page, test } from "@playwright/test";
import { fixture } from "./views";

interface FixtureMolecule {
  readonly id: string;
  readonly name: string;
  readonly cas: string | null;
  readonly formula: string;
  readonly split: string;
  readonly measured: readonly number[];
  readonly nearestTrainSimilarity: number | null;
  readonly neighbours: readonly { id: string; odour: number; structure: number }[];
}

const atlas = fixture<{ labels: string[]; molecules: FixtureMolecule[] }>("atlas.json");

const SPLIT_BADGES: Readonly<Record<string, string>> = {
  train: "Seen in training",
  validation: "Validation: used to decide when training stopped, never trained on",
  held_out: "Held out: the model never saw this molecule",
};

function molecule(name: string): FixtureMolecule {
  const found = atlas.molecules.find((item) => item.name === name);
  if (found === undefined) throw new Error(`${name} is missing from the fixture`);
  return found;
}

async function openCard(page: Page, id: string): Promise<void> {
  await page.goto(`/#/m/${id}`);
  await expect(page.locator("article.card[data-ready]")).toBeVisible();
}

for (const [name, split] of [
  ["Geosmin", "train"],
  ["Limonene", "validation"],
  ["Cinnamyl alcohol", "held_out"],
  ["Benzaldehyde ethyl methyl acetal", "train"],
] as const) {
  test(`the ${split} card for ${name} shows every field`, async ({ page }) => {
    const entry = molecule(name);
    expect(entry.split).toBe(split);
    await openCard(page, entry.id);
    const card = page.locator("article.card");

    await expect(card.locator("h1")).toHaveText(name);
    await expect(card.locator(".identity")).toHaveText(
      `${entry.cas ?? "CAS not listed"} · ${entry.formula}`,
    );
    const structure = card.getByRole("img", { name: `2D structure of ${name}` });
    await structure.scrollIntoViewIfNeeded();
    await expect(structure).toHaveAttribute("src", new RegExp(`structures/${entry.id}\\.svg$`));
    await expect
      .poll(() => structure.evaluate((image: HTMLImageElement) => image.naturalWidth))
      .toBeGreaterThan(0);

    await expect(card.locator(".chips li")).toHaveText(
      entry.measured.map((index) => atlas.labels[index] ?? ""),
    );
    await expect(card.locator(".source")).toHaveText([
      "Leffingwell PMP 2001 via Pyrfume, CC-BY-NC",
      "Source records no concentration or solvent",
    ]);

    const predictions = card.locator(".predictions li");
    await expect(predictions).toHaveCount(10);
    for (const prediction of await predictions.all()) {
      await expect(prediction.locator(".prediction-label")).not.toBeEmpty();
      await expect(prediction.locator(".bar-fill")).toHaveCount(1);
      await expect(prediction.locator(".mono")).toHaveText(/^[01]\.\d{3}$/);
    }
    expect(await card.locator(".predictions .whisker").count()).toBeGreaterThan(0);

    await expect(card.locator(".split .badge")).toHaveText(SPLIT_BADGES[split] ?? "");
    const nearest = card.locator(".split p:not(.badge)");
    if (entry.nearestTrainSimilarity === null) {
      await expect(nearest).toHaveCount(0);
    } else {
      await expect(nearest).toHaveText(
        entry.nearestTrainSimilarity < 0.3
          ? `Far from training data (nearest training molecule: ${entry.nearestTrainSimilarity.toFixed(2)})`
          : `Nearest training molecule: ${entry.nearestTrainSimilarity.toFixed(2)}`,
      );
    }

    const neighbours = card.locator(".neighbours li");
    await expect(neighbours).toHaveCount(8);
    for (const [index, neighbour] of entry.neighbours.entries()) {
      const item = neighbours.nth(index);
      await expect(item.getByRole("link")).toHaveAttribute("href", `#/atlas?fly=${neighbour.id}`);
      await expect(item.locator(".mono")).toHaveText(
        `odour ${neighbour.odour.toFixed(2)}, structure ${neighbour.structure.toFixed(2)}`,
      );
    }
    await expect(card.getByRole("link", { name: "Play in Synesthesia" })).toBeVisible();
  });
}

test("a held-out molecule far from training says so", async ({ page }) => {
  const entry = molecule("Cinnamyl alcohol");
  await page.route("**/atlas.json", async (route) => {
    const response = await route.fetch();
    const json = (await response.json()) as { molecules: FixtureMolecule[] };
    const molecules = json.molecules.map((item) =>
      item.id === entry.id ? { ...item, nearestTrainSimilarity: 0.12 } : item,
    );
    await route.fulfill({ response, json: { ...json, molecules } });
  });
  await openCard(page, entry.id);
  await expect(page.locator("article.card .split p:not(.badge)")).toHaveText(
    "Far from training data (nearest training molecule: 0.12)",
  );
});

test("the live region announces the molecule and its measured count", async ({ page }) => {
  const entry = molecule("Geosmin");
  await openCard(page, entry.id);
  const live = page.locator("#live");
  await expect(live).toHaveAttribute("aria-live", "polite");
  await expect(live).toHaveText(`Geosmin, ${entry.measured.length} measured descriptors`);
});

test("a phrase search opens its exemplar with the known-example badge", async ({ page }) => {
  await page.goto("/#/atlas");
  await page.locator("#atlas-search").fill("smells like rain");
  await page.locator("#atlas-search").press("Enter");
  await expect(page.locator("article.card h1")).toContainText("Geosmin");
  await expect(page.locator("article.card h1 .badge")).toHaveText("Known example: rain");
});

test("an unknown molecule id shows the not-found page", async ({ page }) => {
  await page.goto("/#/m/999999");
  await expect(page.getByRole("heading", { name: "Page not found" })).toBeVisible();
});

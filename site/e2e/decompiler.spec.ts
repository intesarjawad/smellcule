import { expect, type Page, test } from "@playwright/test";
import { fixture } from "./views";

const LIMITS_TEXT =
  "Perfume formulas are trade secrets and note lists are descriptions, not ingredient lists. " +
  "This shows catalogued molecules linked to each note. It does not tell you what is in this perfume.";

const FOUGERE = "top: bergamot, lavender\nheart: rose, clove\nbase: cedar, musk, vanilla";

interface FixtureNote {
  readonly name: string;
  readonly evidence: readonly string[];
  readonly molecules: readonly { molecule_id: string; relation: string }[];
}

const atlas = fixture<{
  labels: string[];
  families: unknown[];
  molecules: { id: string; name: string; measured: number[] }[];
}>("atlas.json");
const notes = fixture<{ notes: FixtureNote[]; archetypes: { name: string }[] }>("notes.json");

/** Each linked molecule and the relation text the note table justifies for it. */
function expectedLinks(noteName: string): string[] {
  const note = notes.notes.find((item) => item.name === noteName);
  if (note === undefined) throw new Error(`${noteName} is missing from the fixture notes`);
  return note.molecules.map((link) => {
    const molecule = atlas.molecules.find((item) => item.id === link.molecule_id);
    if (molecule === undefined) throw new Error(`${link.molecule_id} is not in the fixture`);
    const shared = molecule.measured
      .map((index) => atlas.labels[index] ?? "")
      .filter((label) => note.evidence.includes(label));
    return `${molecule.name}smells ${shared.join(", ")} in the catalogue`;
  });
}

async function decompile(page: Page, text: string): Promise<void> {
  await page.goto("/#/decompile");
  await page.getByLabel("Notes from a perfume description").fill(text);
}

test("the fougère lists each note with its molecules and relation text @cross", async ({
  page,
}) => {
  await decompile(page, FOUGERE);
  const tiers = page.locator(".tiers > section");
  await expect(tiers.locator("h3")).toHaveText(["Top notes", "Heart notes", "Base notes"]);
  await expect(tiers.nth(0).locator("h4")).toHaveText(["bergamot"]);
  await expect(tiers.nth(1).locator("h4")).toHaveText(["rose"]);
  await expect(tiers.nth(2).locator("h4")).toHaveText(["musk", "vanilla"]);

  for (const note of ["bergamot", "rose", "musk", "vanilla"]) {
    const links = page.locator(".tiers h4", { hasText: note }).locator("+ ul > li");
    await expect(links).toHaveText(expectedLinks(note));
  }
  await expect(page.locator(".unrecognised")).toHaveText(
    "Not in the note table: lavender, clove, cedar",
  );
});

test("the limits text sits directly above the result", async ({ page }) => {
  await decompile(page, FOUGERE);
  await expect(page.locator(".disclaimer")).toHaveText(LIMITS_TEXT);
  await expect(page.locator(".disclaimer + div > .note-result")).toBeVisible();
});

test("the family profile prints every bar's value as text", async ({ page }) => {
  await decompile(page, FOUGERE);
  const bars = page.locator(".family-bars li");
  await expect(bars).toHaveCount(atlas.families.length);
  for (const bar of await bars.all()) {
    await expect(bar.locator(".family-name")).not.toBeEmpty();
    await expect(bar.locator(".mono")).toHaveText(/^[01]\.\d{3}$/);
  }
  await expect(
    page.getByText("Average of single molecules, not a mixture prediction"),
  ).toBeVisible();
});

test("the result links to the atlas and to Synesthesia with its molecules", async ({ page }) => {
  await decompile(page, FOUGERE);
  const ids = ["bergamot", "rose", "musk", "vanilla"].flatMap(
    (name) =>
      notes.notes.find((note) => note.name === name)?.molecules.map((link) => link.molecule_id) ??
      [],
  );
  const unique = [...new Set(ids)].join(",");
  await expect(page.getByRole("link", { name: "Play this" })).toHaveAttribute(
    "href",
    `#/synesthesia?mix=${unique}`,
  );
  await expect(page.getByRole("link", { name: "Show on atlas" })).toHaveAttribute(
    "href",
    `#/atlas?ids=${unique}`,
  );
});

test("an archetype button fills the notes and shows its result", async ({ page }) => {
  const [archetype] = notes.archetypes;
  if (archetype === undefined) throw new Error("The fixture has no archetype");
  await page.goto("/#/decompile");
  await page.getByRole("button", { name: archetype.name }).click();
  await expect(page.getByLabel("Notes from a perfume description")).not.toHaveValue("");
  await expect(page.locator(".note-result")).toBeVisible();
  await expect(page.locator(".disclaimer")).toHaveText(LIMITS_TEXT);
});

test("a list with no known notes says so and names them", async ({ page }) => {
  await decompile(page, "Top: pink pepper / Base: tonka bean absolute");
  await expect(page.getByText("No catalogued notes were found in that description.")).toBeVisible();
  await expect(page.locator(".unrecognised")).toHaveText(
    "Not in the note table: pink pepper, tonka bean",
  );
});

test("an unbroken unknown note does not widen the page", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/#/decompile");
  await page.getByLabel("Notes from a perfume description").fill("x".repeat(1000));
  await expect(page.locator(".unrecognised")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});

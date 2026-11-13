/**
 * Every user-facing state of the site, rendered by `e2e/states.spec.ts` at desktop and phone
 * sizes. Each entry opens its route on a fixed day of the fixture bundle and waits for the one
 * element that proves the state is on screen.
 */

import type { Locator, Page } from "@playwright/test";

export interface SiteState {
  readonly id: string;
  readonly route: string;
  /** Days after the first puzzle's day that the page clock is fixed to. */
  readonly day?: number;
  readonly before?: (page: Page) => Promise<void>;
  readonly act?: (page: Page) => Promise<void>;
  readonly ready: (page: Page) => Locator;
  /** A state that exists only while motion is allowed; reduced motion cuts past it. */
  readonly motionOnly?: boolean;
}

export const VIEWPORTS = [
  { width: 1280, height: 800 },
  { width: 390, height: 844 },
] as const;

async function failBundle(page: Page): Promise<void> {
  await page.route("**/atlas.json", (route) => route.fulfill({ status: 503 }));
}

async function withoutWebGL(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const getContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (
      this: HTMLCanvasElement,
      type: string,
      ...rest: unknown[]
    ) {
      if (type === "webgl2" || type === "webgl") return null;
      return (getContext as (...args: unknown[]) => unknown).call(this, type, ...rest);
    } as typeof HTMLCanvasElement.prototype.getContext;
  });
}

async function withThreePuzzles(page: Page): Promise<void> {
  await page.route("**/smellcule.json", async (route) => {
    const response = await route.fetch();
    const game = (await response.json()) as { puzzles: unknown[] };
    const [first] = game.puzzles;
    await route.fulfill({ response, json: { ...game, puzzles: [first, first, first] } });
  });
}

/** The catalogue's longest name is 62 characters; this stand-in has the same length. */
export const LONGEST_NAME =
  "(E)-2-Methyl-4-(2,2,3-trimethyl-3-cyclopenten-1-yl)but-2-en-1-ol".slice(0, 62);

async function withLongestName(page: Page): Promise<void> {
  await page.route("**/atlas.json", async (route) => {
    const response = await route.fetch();
    const atlas = (await response.json()) as { molecules: { id: string; name: string }[] };
    const molecules = atlas.molecules.map((molecule) =>
      molecule.id === "1066" ? { ...molecule, name: LONGEST_NAME } : molecule,
    );
    await route.fulfill({ response, json: { ...atlas, molecules } });
  });
}

async function holdBundle(page: Page): Promise<void> {
  await page.route("**/atlas.json", () => undefined);
}

async function searchRain(page: Page): Promise<void> {
  await page.getByRole("combobox").fill("smells like rain");
  await page.getByRole("combobox").press("Enter");
}

/** Under reduced motion the arrival frame holds still until the visitor opens the card. */
async function searchRainAndOpen(page: Page): Promise<void> {
  await searchRain(page);
  const hold = page.locator(".arrival-continue");
  const card = page.locator("article.card[data-ready]");
  await hold.or(card).first().waitFor();
  if (await hold.isVisible()) await hold.click();
}

async function pickThree(page: Page): Promise<void> {
  const options = page.locator(".options button");
  for (let index = 0; index < 3; index += 1) await options.nth(index).click();
}

export const SITE_STATES: readonly SiteState[] = [
  { id: "home", route: "#/", ready: (page) => page.getByRole("heading", { name: "Smellcule" }) },
  {
    id: "unknown-route",
    route: "#/nowhere",
    ready: (page) => page.getByRole("heading", { name: "Page not found" }),
  },
  {
    id: "bundle-error",
    route: "#/atlas",
    before: failBundle,
    ready: (page) => page.getByRole("button", { name: "Try again" }),
  },
  {
    id: "atlas-empty-search",
    route: "#/atlas",
    ready: (page) => page.locator(".search-suggestions"),
  },
  {
    id: "atlas-results",
    route: "#/atlas",
    act: (page) => page.locator("#atlas-search").fill("citrus"),
    ready: (page) => page.getByRole("listbox"),
  },
  {
    id: "atlas-no-results",
    route: "#/atlas?q=wet%20cardboard%20xyz",
    ready: (page) => page.getByText("No smell or molecule called"),
  },
  {
    id: "atlas-loading",
    route: "#/atlas",
    before: holdBundle,
    ready: (page) => page.locator("#main").getByText("Loading the atlas…"),
  },
  {
    id: "atlas-flying",
    route: "#/atlas",
    motionOnly: true,
    before: (page) => page.clock.install(),
    act: async (page) => {
      await searchRain(page);
      await page.clock.runFor(300);
    },
    ready: (page) => page.locator("canvas[aria-busy='true']"),
  },
  {
    id: "atlas-arrived",
    route: "#/atlas",
    act: searchRainAndOpen,
    ready: (page) => page.locator("article.card[data-ready] h1", { hasText: "Geosmin" }),
  },
  {
    id: "atlas-no-webgl",
    route: "#/atlas",
    before: withoutWebGL,
    ready: (page) => page.getByText("Your browser can't draw the 3D map."),
  },
  {
    id: "card-train",
    route: "#/m/1066",
    ready: (page) => page.locator("article.card[data-ready]"),
  },
  {
    id: "card-validation",
    route: "#/m/1557",
    ready: (page) => page.locator("article.card[data-ready]"),
  },
  {
    id: "card-held-out",
    route: "#/m/425",
    ready: (page) => page.locator("article.card[data-ready]"),
  },
  {
    id: "card-known-example",
    route: "#/m/1066?phrase=rain",
    ready: (page) => page.locator("article.card .badge", { hasText: "Known example: rain" }),
  },
  {
    id: "card-longest-name",
    route: "#/m/1066",
    before: withLongestName,
    ready: (page) => page.locator("article.card[data-ready] h1", { hasText: LONGEST_NAME }),
  },
  {
    id: "browse-collapsed",
    route: "#/browse",
    ready: (page) => page.locator("#main details").first(),
  },
  {
    id: "browse-family-open",
    route: "#/browse",
    act: (page) => page.locator("#main summary").first().click(),
    ready: (page) => page.locator("#main details[open] li").first(),
  },
  {
    id: "smellcule-opens-on",
    route: "#/smellcule",
    day: -1,
    ready: (page) => page.getByText("Smellcule #1 opens on"),
  },
  {
    id: "smellcule-choosing",
    route: "#/smellcule",
    ready: (page) => page.getByRole("button", { name: "Submit" }),
  },
  {
    id: "smellcule-three-picked",
    route: "#/smellcule",
    act: pickThree,
    ready: (page) => page.locator(".controls button:enabled", { hasText: "Submit" }),
  },
  {
    id: "smellcule-clue",
    route: "#/smellcule",
    act: (page) => page.getByRole("button", { name: "Show a clue" }).click(),
    ready: (page) => page.locator(".clue"),
  },
  {
    id: "smellcule-revealed",
    route: "#/smellcule",
    act: async (page) => {
      await pickThree(page);
      await page.getByRole("button", { name: "Submit" }).click();
    },
    ready: (page) => page.locator("pre.share"),
  },
  {
    id: "smellcule-archive",
    route: "#/smellcule/archive",
    day: 2,
    before: withThreePuzzles,
    ready: (page) => page.getByRole("link", { name: "Smellcule 1", exact: true }),
  },
  {
    id: "smellcule-not-out-yet",
    route: "#/smellcule/9",
    ready: (page) => page.getByText("Not out yet"),
  },
  {
    id: "decompiler-empty",
    route: "#/decompile",
    ready: (page) => page.getByText("No catalogued notes were found"),
  },
  {
    id: "decompiler-result",
    route: "#/decompile",
    act: (page) => page.locator(".archetypes button").first().click(),
    ready: (page) => page.locator(".family-bars"),
  },
  {
    id: "decompiler-unrecognised",
    route: "#/decompile",
    act: (page) =>
      page.getByLabel("Notes from a perfume description").fill("top: bergamot, pink pepper"),
    ready: (page) => page.getByText("Not in the note table: pink pepper"),
  },
  {
    id: "synesthesia-idle",
    route: "#/synesthesia",
    ready: (page) => page.getByRole("button", { name: "Play" }),
  },
  {
    id: "how",
    route: "#/how",
    ready: (page) => page.getByRole("heading", { name: "How it works" }),
  },
];

import { existsSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { LONGEST_NAME, SITE_STATES, VIEWPORTS } from "./states";

const GOLDENS = new URL("../e2e/__goldens__/states.spec.ts/", import.meta.url);

describe("the state inventory", () => {
  it("names every state once", () => {
    const ids = SITE_STATES.map((state) => state.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("renders a card name as long as the catalogue's longest", () => {
    expect(LONGEST_NAME).toHaveLength(62);
  });

  // Goldens are rendered only by `make goldens`; before that run there is nothing to count.
  it.skipIf(!existsSync(GOLDENS))("has one golden per state and viewport", () => {
    const goldens = readdirSync(GOLDENS).filter((file) => file.endsWith("-chromium.png"));
    expect(goldens).toHaveLength(SITE_STATES.length * VIEWPORTS.length);
  });
});

import { existsSync, readFileSync } from "node:fs";
import { type Bundle, loadBundle } from "../../src/data/bundle";

const PUBLIC_ROOT = new URL("../../public/", import.meta.url);

export type FixtureCatalogue = "leffingwell" | "keller";

export function fixtureDirectory(catalogue: FixtureCatalogue): string {
  return catalogue === "keller" ? "keller-fixture-data/" : "fixture-data/";
}

export function fixtureBytes(file: string): Uint8Array {
  return new Uint8Array(readFileSync(new URL(file, PUBLIC_ROOT)));
}

export function fixtureJson(file: string): unknown {
  return JSON.parse(new TextDecoder().decode(fixtureBytes(file)));
}

export function fixtureFetcher(
  catalogue: FixtureCatalogue = "leffingwell",
): (url: string) => Promise<Response> {
  const directory = fixtureDirectory(catalogue);
  return async (url: string) => {
    const file = url.startsWith(directory) ? url.slice(directory.length) : url;
    const path = `${directory}${file}`;
    if (!existsSync(new URL(path, PUBLIC_ROOT))) return new Response(null, { status: 404 });
    return new Response(fixtureBytes(path), { status: 200 });
  };
}

export function loadFixtureBundle(catalogue: FixtureCatalogue = "leffingwell"): Promise<Bundle> {
  return loadBundle(fixtureDirectory(catalogue), fixtureFetcher(catalogue));
}

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { type Bundle, loadBundle } from "../../src/data/bundle";

/** The real bundle `make gate-site` stages; gate tests never run against fixtures. */
export function loadGateBundle(): Promise<Bundle> {
  const directory = resolve(process.env.SMELLCULE_GATE_DATA ?? "public/data");
  return loadBundle("./", async (url) => {
    const path = resolve(directory, url);
    if (!existsSync(path)) return new Response(null, { status: 404 });
    return new Response(new Uint8Array(readFileSync(path)), { status: 200 });
  });
}

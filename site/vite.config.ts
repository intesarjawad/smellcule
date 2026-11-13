import { readFileSync } from "node:fs";
import { loadEnv } from "vite";
import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig(({ command, mode }) => {
  const dataUrl = loadEnv(mode, process.cwd()).VITE_DATA_URL;
  if (command === "build" && !dataUrl) {
    throw new Error(
      "MissingDataUrlError: VITE_DATA_URL is empty\nnext: set VITE_DATA_URL=fixture-data/ or data/",
    );
  }
  if (dataUrl && (dataUrl.startsWith("/") || /^[a-z][a-z0-9+.-]*:/i.test(dataUrl))) {
    throw new Error(
      "InvalidDataUrlError: VITE_DATA_URL must be relative\nnext: use fixture-data/ or data/",
    );
  }
  const catalogue =
    process.env.SMELLCULE_CATALOGUE ??
    readFileSync(new URL("../config/catalogue", import.meta.url), "utf8").trim();
  return {
    base: "./",
    build: { outDir: "dist" },
    test: {
      exclude: [
        ...configDefaults.exclude,
        // Gate tests need the real bundle, so only a run that names its directory includes them.
        ...(process.env.SMELLCULE_GATE_DATA ? [] : ["tests/gate/**"]),
        "e2e/**",
        ...(catalogue === "keller" ? ["**/*.leffingwell.test.ts"] : []),
      ],
    },
  };
});

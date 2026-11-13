import { existsSync, readFileSync } from "node:fs";
import { defineConfig, devices, type PlaywrightTestProject } from "@playwright/test";

const catalogue =
  process.env.SMELLCULE_CATALOGUE ??
  readFileSync(new URL("../config/catalogue", import.meta.url), "utf8").trim();
const baseURL = process.env.SMELLCULE_BASE_URL;
const realData = process.env.SMELLCULE_E2E_DATA === "real";
// Goldens come only from `make goldens`, which renders them in the CI image; until that has run,
// the screenshot comparisons have nothing to compare against.
const goldens =
  process.env.SMELLCULE_GOLDENS === "update" ||
  existsSync(new URL("./e2e/__goldens__", import.meta.url));
const dataUrl = realData
  ? "data/"
  : catalogue === "keller"
    ? "keller-fixture-data/"
    : "fixture-data/";

const allProjects: PlaywrightTestProject[] = [
  { name: "chromium", testIgnore: "no-webgl.spec.ts", use: { browserName: "chromium" } },
  { name: "webkit", grep: /@cross|@offline-audio/, use: { browserName: "webkit" } },
  { name: "firefox", grep: /@cross/, use: { browserName: "firefox" } },
  { name: "mobile", grep: /@perf|@smellcule/, use: { ...devices["Pixel 7"] } },
  {
    name: "no-webgl",
    grep: /@no-webgl/,
    use: {
      browserName: "chromium",
      launchOptions: { args: ["--disable-webgl", "--disable-3d-apis"] },
    },
  },
];

export default defineConfig({
  testDir: "./e2e",
  snapshotPathTemplate: "{testDir}/__goldens__/{testFilePath}/{arg}-{projectName}{ext}",
  ...(catalogue === "keller" ? { grep: /@keller/ } : {}),
  grepInvert: [
    ...(catalogue === "keller" ? [] : [/@keller/]),
    ...(!realData && !baseURL ? [/@gate/] : []),
    ...(goldens ? [] : [/@golden/]),
  ],
  use: { baseURL: baseURL ?? "http://localhost:4173/" },
  ...(baseURL
    ? {}
    : {
        webServer: {
          command: "npm run build && npx vite preview --port 4173 --strictPort",
          url: "http://localhost:4173/",
          env: { VITE_DATA_URL: dataUrl },
        },
      }),
  projects: allProjects.filter((project) => catalogue !== "keller" || project.name === "chromium"),
});

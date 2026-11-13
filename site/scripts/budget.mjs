#!/usr/bin/env node
/**
 * Budget for the atlas bundle. It checks the files the page loads before the first frame and
 * the number of points the renderer has to draw; frame timing needs a browser and is not
 * measured here.
 */

import { existsSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";

// Keep the atlas usable on a mid-range laptop and a mobile connection.
const MAX_RAW_BYTES = 12 * 1024 * 1024;
const MAX_GZIP_BYTES = 4 * 1024 * 1024;
const MAX_POINTS = 10_000;

const REQUIRED_FILES = ["atlas.json", "predictions.bin", "spread.bin", "positions.bin"];
const OPTIONAL_FILES = ["notes.json", "phrases.json", "words.json"];

const root = fileURLToPath(new URL("..", import.meta.url));
const dataPath = resolve(root, process.env.SMELLCULE_BUDGET_DATA ?? "public/fixture-data");

function fail(message) {
  console.error(`budget: ${message}`);
  process.exitCode = 1;
}

function formatBytes(bytes) {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MiB`;
  return `${Math.ceil(bytes / 1024)} KiB`;
}

if (!existsSync(dataPath)) {
  fail(`data directory not found: ${dataPath}`);
  process.exit();
}

for (const file of REQUIRED_FILES) {
  if (!existsSync(resolve(dataPath, file))) {
    fail(`missing ${file} in ${dataPath}`);
    process.exit();
  }
}

const atlas = JSON.parse(readFileSync(resolve(dataPath, "atlas.json"), "utf8"));
const molecules = Array.isArray(atlas.molecules) ? atlas.molecules.length : 0;
const labels = Array.isArray(atlas.labels) ? atlas.labels.length : 0;
if (molecules === 0 || labels === 0) {
  fail("atlas.json has no molecules or descriptors");
  process.exit();
}

const expectedSizes = new Map([
  ["predictions.bin", molecules * labels],
  ["spread.bin", molecules * labels],
  ["positions.bin", molecules * 3 * 4],
]);
for (const [file, expected] of expectedSizes) {
  const path = resolve(dataPath, file);
  const actual = statSync(path).size;
  if (actual !== expected) {
    fail(`${file}: expected ${expected} bytes for ${molecules} x ${labels}, found ${actual}`);
  }
}

const loadedFiles = [
  ...REQUIRED_FILES,
  ...OPTIONAL_FILES.filter((file) => existsSync(resolve(dataPath, file))),
];
let rawBytes = 0;
let gzipBytes = 0;
console.log(`budget: ${molecules} points, ${labels} descriptors`);
for (const file of loadedFiles) {
  const bytes = readFileSync(resolve(dataPath, file));
  rawBytes += bytes.byteLength;
  gzipBytes += gzipSync(bytes, { level: 9 }).byteLength;
  console.log(`  ${file.padEnd(16)} ${formatBytes(bytes.byteLength).padStart(9)} raw`);
}

if (molecules > MAX_POINTS) {
  fail(`${molecules} points exceeds the ${MAX_POINTS} point budget`);
}
if (rawBytes > MAX_RAW_BYTES) {
  fail(`${formatBytes(rawBytes)} raw exceeds the ${formatBytes(MAX_RAW_BYTES)} budget`);
}
if (gzipBytes > MAX_GZIP_BYTES) {
  fail(`${formatBytes(gzipBytes)} gzip exceeds the ${formatBytes(MAX_GZIP_BYTES)} budget`);
}

console.log(`  total raw   ${formatBytes(rawBytes).padStart(9)}`);
console.log(`  total gzip  ${formatBytes(gzipBytes).padStart(9)}`);
if (process.exitCode !== 1) console.log("budget: ok");

/**
 * The daily puzzles are published beside the atlas. Every id and descriptor index is checked
 * against the atlas before the game renders, so a broken bundle fails loudly instead of showing
 * a puzzle with missing options.
 */

import type { Atlas } from "../data/validate";
import { BundleError } from "../data/validate";

export interface SmellculePuzzle {
  readonly moleculeId: string;
  readonly options: readonly number[];
  readonly answer: readonly number[];
  readonly clueId: number;
  readonly clueSimilarity: number;
}

export interface SmellculeBundle {
  readonly startDate: string;
  readonly puzzles: readonly SmellculePuzzle[];
}

const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const OPTION_COUNT = 12;
const ANSWER_COUNT = 3;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function record(value: unknown, path: string): Record<string, unknown> {
  if (!isRecord(value)) throw new BundleError(`${path}: expected an object.`);
  return value;
}

function integer(value: unknown, path: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    throw new BundleError(`${path}: expected a non-negative integer.`);
  }
  return value;
}

function indices(value: unknown, path: string, count: number): number[] {
  if (!Array.isArray(value)) throw new BundleError(`${path}: expected an array.`);
  const items = value.map((item, index) => integer(item, `${path}[${index}]`));
  if (items.length !== count) {
    throw new BundleError(`${path}: expected ${count} entries, found ${items.length}.`);
  }
  if (new Set(items).size !== items.length) {
    throw new BundleError(`${path}: entries must be unique.`);
  }
  return items;
}

function answerIndices(value: unknown, path: string): number[] {
  if (!Array.isArray(value)) throw new BundleError(`${path}: expected an array.`);
  const items = value.map((item, index) => integer(item, `${path}[${index}]`));
  if (items.length < ANSWER_COUNT) {
    throw new BundleError(`${path}: expected at least ${ANSWER_COUNT} entries.`);
  }
  if (new Set(items).size !== items.length) {
    throw new BundleError(`${path}: entries must be unique.`);
  }
  return items;
}

function validateDate(value: unknown, path: string): string {
  if (typeof value !== "string" || !DATE_PATTERN.test(value)) {
    throw new BundleError(`${path}: expected a date as YYYY-MM-DD.`);
  }
  const probe = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(probe.getTime()) || probe.toISOString().slice(0, 10) !== value) {
    throw new BundleError(`${path}: expected a calendar date.`);
  }
  return value;
}

export function validateSmellcule(value: unknown, atlas: Atlas): SmellculeBundle {
  const root = record(value, "smellcule.json");
  if (!Array.isArray(root.puzzles))
    throw new BundleError("smellcule.json.puzzles: expected an array.");
  const ids = new Set(atlas.molecules.map((molecule) => molecule.id));

  const puzzles = root.puzzles.map((item, index) => {
    const path = `smellcule.json.puzzles[${index}]`;
    const puzzle = record(item, path);
    const moleculeId = puzzle.moleculeId;
    if (typeof moleculeId !== "string" || !ids.has(moleculeId)) {
      throw new BundleError(`${path}.moleculeId: not in the atlas.`);
    }
    const options = indices(puzzle.options, `${path}.options`, OPTION_COUNT);
    for (const option of options) {
      if (option >= atlas.labels.length) {
        throw new BundleError(`${path}.options: descriptor index out of range.`);
      }
    }
    const answer = answerIndices(puzzle.answer, `${path}.answer`);
    if (answer.some((label) => label >= atlas.labels.length)) {
      throw new BundleError(`${path}.answer: descriptor index out of range.`);
    }
    // The answer is every measured descriptor; the options show at most six of them.
    if (!answer.some((label) => options.includes(label))) {
      throw new BundleError(`${path}.answer: expected at least one answer among the options.`);
    }
    const clueId = integer(puzzle.clueId, `${path}.clueId`);
    if (clueId >= atlas.molecules.length) {
      throw new BundleError(`${path}.clueId: not in the atlas.`);
    }
    const similarity = puzzle.clueSimilarity;
    if (
      typeof similarity !== "number" ||
      !Number.isFinite(similarity) ||
      similarity < 0 ||
      similarity > 1
    ) {
      throw new BundleError(`${path}.clueSimilarity: expected a number between 0 and 1.`);
    }
    return { moleculeId, options, answer, clueId, clueSimilarity: similarity };
  });

  return { startDate: validateDate(root.startDate, "smellcule.json.startDate"), puzzles };
}

function join(baseUrl: string, file: string): string {
  return `${baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`}${file}`;
}

export async function loadSmellcule(
  baseUrl: string,
  atlas: Atlas,
  fetcher: (url: string) => Promise<Response> = fetch,
): Promise<SmellculeBundle> {
  const response = await fetcher(join(baseUrl, "smellcule.json"));
  if (!response.ok) throw new BundleError(`smellcule.json: HTTP ${response.status}.`);
  return validateSmellcule(await response.json(), atlas);
}

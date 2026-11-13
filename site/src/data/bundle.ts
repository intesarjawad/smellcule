/**
 * Loads and decodes the published atlas bundle. Fetching is injected so the loader can be
 * retried by the interface and exercised without a server.
 */

import {
  type Atlas,
  BundleError,
  NO_WORDS,
  type NotesDocument,
  type Phrase,
  validateAtlas,
  validateNotes,
  validatePhrases,
  validateWords,
  type WordsDocument,
} from "./validate";

export type {
  Archetype,
  Atlas,
  CatalogueName,
  DataLicence,
  Family,
  ModelInfo,
  Molecule,
  Neighbour,
  Note,
  NoteMolecule,
  NotesDocument,
  Phrase,
  Split,
  WordsDocument,
} from "./validate";
export { BundleError } from "./validate";

export interface Bundle {
  readonly baseUrl: string;
  readonly atlas: Atlas;
  readonly notes: NotesDocument;
  readonly phrases: readonly Phrase[];
  readonly words: WordsDocument;
  /** Row-major probabilities, `round(probability * 255)`. */
  readonly predictions: Uint8Array;
  /** Row-major uncertainty, `round(min(std, 0.5) * 510)`. */
  readonly spread: Uint8Array;
  /** Interleaved x, y, z positions, little-endian float32. */
  readonly positions: Float32Array;
}

export type Fetcher = (url: string) => Promise<Response>;

const FILES = {
  atlas: "atlas.json",
  notes: "notes.json",
  phrases: "phrases.json",
  words: "words.json",
  predictions: "predictions.bin",
  spread: "spread.bin",
  positions: "positions.bin",
} as const;

function join(baseUrl: string, file: string): string {
  return `${baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`}${file}`;
}

async function fetchOk(fetcher: Fetcher, url: string, file: string): Promise<Response> {
  const response = await fetcher(url);
  if (!response.ok) throw new BundleError(`${file}: HTTP ${response.status}.`);
  return response;
}

async function fetchJson(fetcher: Fetcher, url: string, file: string): Promise<unknown> {
  const response = await fetchOk(fetcher, url, file);
  return response.json();
}

const HTML_CONTENT_TYPE = /^\s*text\/html/i;

/** Notes, phrases and words are optional content; Keller publishes the atlas without them. */
async function fetchOptionalJson(
  fetcher: Fetcher,
  url: string,
  file: string,
): Promise<unknown | null> {
  const response = await fetcher(url);
  if (response.status === 404) return null;
  if (!response.ok) throw new BundleError(`${file}: HTTP ${response.status}.`);
  // A preview server's single-page fallback answers a missing file with the page itself.
  if (HTML_CONTENT_TYPE.test(response.headers.get("content-type") ?? "")) return null;
  return response.json();
}

async function fetchBytes(fetcher: Fetcher, url: string, file: string): Promise<Uint8Array> {
  const response = await fetchOk(fetcher, url, file);
  return new Uint8Array(await response.arrayBuffer());
}

function expectLength(
  bytes: Uint8Array,
  file: string,
  expected: number,
  shape: string,
): Uint8Array {
  if (bytes.byteLength !== expected) {
    throw new BundleError(
      `${file}: expected ${expected} bytes for ${shape}, found ${bytes.byteLength}.`,
    );
  }
  return bytes;
}

function positionsOf(bytes: Uint8Array, moleculeCount: number): Float32Array {
  expectLength(bytes, FILES.positions, moleculeCount * 3 * 4, `${moleculeCount} x 3 float32`);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const positions = new Float32Array(moleculeCount * 3);
  for (let index = 0; index < positions.length; index += 1) {
    positions[index] = view.getFloat32(index * 4, true);
  }
  return positions;
}

export async function loadBundle(baseUrl: string, fetcher: Fetcher = fetch): Promise<Bundle> {
  const [atlasJson, notesJson, phrasesJson, wordsJson] = await Promise.all([
    fetchJson(fetcher, join(baseUrl, FILES.atlas), FILES.atlas),
    fetchOptionalJson(fetcher, join(baseUrl, FILES.notes), FILES.notes),
    fetchOptionalJson(fetcher, join(baseUrl, FILES.phrases), FILES.phrases),
    fetchOptionalJson(fetcher, join(baseUrl, FILES.words), FILES.words),
  ]);
  const atlas = validateAtlas(atlasJson);
  const notes = notesJson === null ? { notes: [], archetypes: [] } : validateNotes(notesJson);
  const phrases = phrasesJson === null ? [] : validatePhrases(phrasesJson);
  const words = wordsJson === null ? NO_WORDS : validateWords(wordsJson, atlas.labels);

  const [predictions, spread, positions] = await Promise.all([
    fetchBytes(fetcher, join(baseUrl, FILES.predictions), FILES.predictions),
    fetchBytes(fetcher, join(baseUrl, FILES.spread), FILES.spread),
    fetchBytes(fetcher, join(baseUrl, FILES.positions), FILES.positions),
  ]);

  const shape = `${atlas.molecules.length} molecules x ${atlas.labels.length} descriptors`;
  expectLength(predictions, FILES.predictions, atlas.molecules.length * atlas.labels.length, shape);
  expectLength(spread, FILES.spread, atlas.molecules.length * atlas.labels.length, shape);
  return {
    baseUrl,
    atlas,
    notes,
    phrases,
    words,
    predictions,
    spread,
    positions: positionsOf(positions, atlas.molecules.length),
  };
}

export function predictionRow(
  bundle: Pick<Bundle, "atlas" | "predictions">,
  moleculeIndex: number,
): Float32Array {
  const width = bundle.atlas.labels.length;
  const row = new Float32Array(width);
  for (let label = 0; label < width; label += 1) {
    row[label] = (bundle.predictions[moleculeIndex * width + label] ?? 0) / 255;
  }
  return row;
}

export function spreadRow(
  bundle: Pick<Bundle, "atlas" | "spread">,
  moleculeIndex: number,
): Float32Array {
  const width = bundle.atlas.labels.length;
  const row = new Float32Array(width);
  for (let label = 0; label < width; label += 1) {
    row[label] = (bundle.spread[moleculeIndex * width + label] ?? 0) / 510;
  }
  return row;
}

export function structureUrl(bundle: Pick<Bundle, "baseUrl">, moleculeId: string): string {
  return join(bundle.baseUrl, `structures/${moleculeId}.svg`);
}

/**
 * Builds the search index from molecules, notes and phrases. A hit carries the molecule it
 * resolves to so the interface can open a card, and the phrase or note name as its badge.
 *
 * Descriptor, phrase and word queries rank molecules by how much of their measured odour they
 * explain. Predictions only break ties, because a prediction that was never measured is not
 * evidence that the molecule smells of anything.
 */

import { moleculeIdentity } from "../card/model";
import { type Bundle, predictionRow } from "../data/bundle";
import type { CatalogueName, Molecule, Phrase } from "../data/validate";
import {
  CLOSEST_DISTANCE,
  closestMatch,
  MATCH_RANK,
  type MatchType,
  matchType,
  normalise,
} from "./fuzzy";
import { stripIntent } from "./query";
import { buildLexicon, type Lexicon, nearestDescriptors, readWords } from "./words";

export type SearchKind = "molecule" | "note" | "phrase";
export type SearchMatch = MatchType | "descriptor";

export interface SearchHit {
  readonly id: string;
  readonly kind: SearchKind;
  readonly label: string;
  readonly detail: string;
  readonly moleculeId: string | null;
  readonly badge: string | null;
  readonly match: SearchMatch;
  readonly score: number;
  readonly knownExample?: boolean;
}

interface Entry {
  readonly id: string;
  readonly kind: SearchKind;
  readonly label: string;
  readonly detail: string;
  readonly moleculeId: string | null;
  readonly badge: string | null;
  readonly candidates: readonly string[];
}

export interface SearchIndex {
  readonly entries: readonly Entry[];
  readonly labels: readonly string[];
  readonly molecules: readonly Molecule[];
  readonly measured: readonly ReadonlySet<number>[];
  readonly probabilities: readonly Float32Array[];
  readonly phrases: readonly Phrase[];
  readonly lexicon: Lexicon;
}

const DESCRIPTOR_RANK = 4;
const DEFAULT_LIMIT = 20;
const MATCH_SCORE: Readonly<Record<MatchType, number>> = {
  exact: 1,
  prefix: 0.9,
  word: 0.8,
  fuzzy: 0.7,
};

export const EMPTY_SUGGESTIONS: readonly string[] = ["rain", "coffee shop", "campfire"];
export const SUGGESTION_ORDER: readonly string[] = ["rain", "coffee shop", "campfire"];
/** Keller publishes no phrase list, so its empty state offers molecules by name. */
export const KELLER_SUGGESTIONS: readonly string[] = ["Vanillin", "Eugenol", "Guaiacol"];

function titleCase(value: string): string {
  return value
    .split(/\s+/)
    .map((word) => `${word.slice(0, 1).toUpperCase()}${word.slice(1)}`)
    .join(" ");
}

/** Phrase suggestions with a known example, in the order the empty state needs them. */
export function searchSuggestions(
  phrases: readonly Phrase[],
  catalogue: CatalogueName = "leffingwell",
): string[] {
  if (catalogue === "keller") return [...KELLER_SUGGESTIONS];
  const withExemplar = phrases.filter((phrase) => phrase.exemplar !== null);
  return SUGGESTION_ORDER.filter((name) => withExemplar.some((phrase) => phrase.name === name));
}

export function buildSearchIndex(bundle: Bundle): SearchIndex {
  const names = new Map(bundle.atlas.molecules.map((molecule) => [molecule.id, molecule.name]));
  const entries: Entry[] = [];
  const measured: ReadonlySet<number>[] = [];
  const probabilities: Float32Array[] = [];

  for (const molecule of bundle.atlas.molecules) {
    entries.push({
      id: `molecule:${molecule.id}`,
      kind: "molecule",
      label: molecule.name,
      detail: moleculeIdentity(molecule),
      moleculeId: molecule.id,
      badge: null,
      candidates: molecule.cas === null ? [molecule.name] : [molecule.name, molecule.cas],
    });
    measured.push(new Set(molecule.measured));
  }

  for (const note of bundle.notes.notes) {
    const label = titleCase(note.name);
    const first = note.molecules[0];
    entries.push({
      id: `note:${note.name}`,
      kind: "note",
      label,
      detail: `${note.molecules.length} molecules`,
      moleculeId: first?.molecule_id ?? null,
      badge: label,
      candidates: [note.name, ...note.aliases],
    });
  }

  for (const phrase of bundle.phrases) {
    const label = titleCase(phrase.name);
    const exemplar = phrase.exemplar === null ? null : (names.get(phrase.exemplar) ?? null);
    entries.push({
      id: `phrase:${phrase.name}`,
      kind: "phrase",
      label,
      detail: exemplar === null ? "No known example molecule" : `Known example: ${exemplar}`,
      moleculeId: phrase.exemplar,
      badge: label,
      candidates: [phrase.name, ...phrase.aliases],
    });
  }

  bundle.atlas.molecules.forEach((_, moleculeIndex) => {
    probabilities.push(predictionRow(bundle, moleculeIndex));
  });

  return {
    entries,
    labels: bundle.atlas.labels,
    molecules: bundle.atlas.molecules,
    measured,
    probabilities,
    phrases: bundle.phrases,
    lexicon: buildLexicon(bundle.atlas.labels, bundle.phrases, bundle.words),
  };
}

function rank(match: SearchMatch): number {
  return match === "descriptor" ? DESCRIPTOR_RANK : MATCH_RANK[match];
}

function descriptorMatch(query: string, label: string): MatchType | null {
  const match = matchType(query, label);
  return match === "exact" || match === "fuzzy" ? match : null;
}

function weightVector(index: SearchIndex, weights: ReadonlyMap<string, number>): Float32Array {
  const vector = new Float32Array(index.labels.length);
  index.labels.forEach((label, position) => {
    vector[position] = weights.get(label) ?? 0;
  });
  return vector;
}

function cosine(left: Float32Array, right: Float32Array): number {
  let dot = 0;
  let leftLength = 0;
  let rightLength = 0;
  for (let position = 0; position < left.length; position += 1) {
    const a = left[position] ?? 0;
    const b = right[position] ?? 0;
    dot += a * b;
    leftLength += a * a;
    rightLength += b * b;
  }
  if (leftLength === 0 || rightLength === 0) return 0;
  return dot / Math.sqrt(leftLength * rightLength);
}

function measuredVector(index: SearchIndex, moleculeIndex: number): Float32Array {
  const vector = new Float32Array(index.labels.length);
  for (const position of index.measured[moleculeIndex] ?? []) {
    if (position >= 0 && position < vector.length) vector[position] = 1;
  }
  return vector;
}

function dot(left: Float32Array, right: Float32Array): number {
  let total = 0;
  for (let position = 0; position < left.length; position += 1) {
    total += (left[position] ?? 0) * (right[position] ?? 0);
  }
  return total;
}

interface VectorResult {
  readonly moleculeIndex: number;
  /** The share of the query's weight that falls on descriptors the molecule was measured with. */
  readonly evidence: number;
  readonly cosine: number;
  readonly prediction: number;
}

/** Keeps the secondary order inside the score without letting it outweigh any evidence step. */
const TIE_BREAK_SCALE = 1e-3;

function vectorResults(
  index: SearchIndex,
  weights: Float32Array,
  order: "cosine" | "prediction" = "cosine",
): VectorResult[] {
  const results: VectorResult[] = [];
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  index.molecules.forEach((_, moleculeIndex) => {
    const measured = measuredVector(index, moleculeIndex);
    const evidence = total > 0 ? dot(weights, measured) / total : 0;
    if (evidence <= 0) return;
    results.push({
      moleculeIndex,
      evidence,
      cosine: cosine(weights, measured),
      prediction: dot(weights, index.probabilities[moleculeIndex] ?? new Float32Array(0)),
    });
  });
  return results.sort((a, b) =>
    order === "prediction"
      ? b.evidence - a.evidence ||
        b.prediction - a.prediction ||
        b.cosine - a.cosine ||
        (index.molecules[a.moleculeIndex]?.name ?? "").localeCompare(
          index.molecules[b.moleculeIndex]?.name ?? "",
        )
      : b.evidence - a.evidence ||
        b.cosine - a.cosine ||
        b.prediction - a.prediction ||
        (index.molecules[a.moleculeIndex]?.name ?? "").localeCompare(
          index.molecules[b.moleculeIndex]?.name ?? "",
        ),
  );
}

function moleculeHit(
  index: SearchIndex,
  moleculeIndex: number,
  match: SearchMatch,
  score: number,
  badge: string | null,
  knownExample = false,
): SearchHit {
  const molecule = index.molecules[moleculeIndex];
  if (molecule === undefined) throw new Error(`Missing molecule at ${moleculeIndex}`);
  const hit: SearchHit = {
    id: `molecule:${molecule.id}`,
    kind: "molecule",
    label: molecule.name,
    detail: moleculeIdentity(molecule),
    moleculeId: molecule.id,
    badge,
    match,
    score,
  };
  return knownExample ? { ...hit, knownExample: true } : hit;
}

function vectorHits(
  index: SearchIndex,
  weights: Float32Array,
  match: SearchMatch,
  badge: string | null,
  exemplarId: string | null,
  limit: number,
  order: "cosine" | "prediction" = "cosine",
): SearchHit[] {
  const all = vectorResults(index, weights, order);
  const exemplar = all.find((result) => index.molecules[result.moleculeIndex]?.id === exemplarId);
  const results = (
    exemplar === undefined ? all : [exemplar, ...all.filter((result) => result !== exemplar)]
  ).slice(0, limit);
  return results.map((result) =>
    moleculeHit(
      index,
      result.moleculeIndex,
      match,
      result.evidence +
        TIE_BREAK_SCALE * (order === "prediction" ? result.prediction : result.cosine),
      badge,
      result === exemplar,
    ),
  );
}

function phraseWeights(phrase: Phrase): Map<string, number> {
  return new Map(Object.entries(phrase.weights));
}

function bestPhrase(index: SearchIndex, query: string): Phrase | null {
  let best: { phrase: Phrase; match: MatchType } | null = null;
  for (const phrase of index.phrases) {
    for (const candidate of [phrase.name, ...phrase.aliases]) {
      const match = matchType(query, candidate);
      if (match === null) continue;
      if (best === null || MATCH_RANK[match] < MATCH_RANK[best.match]) {
        best = { phrase, match };
      }
    }
  }
  return best?.phrase ?? null;
}

function bestDescriptor(index: SearchIndex, query: string): string | null {
  let best: { label: string; match: MatchType } | null = null;
  for (const label of index.labels) {
    const match = descriptorMatch(query, label);
    if (match === null) continue;
    if (best === null || MATCH_RANK[match] < MATCH_RANK[best.match]) best = { label, match };
  }
  return best?.label ?? null;
}

function wordHits(index: SearchIndex, rawQuery: string, limit: number): SearchHit[] {
  const { weights } = readWords(index.lexicon, stripIntent(rawQuery));
  if (weights === null) return [];
  return vectorHits(index, weightVector(index, weights), "fuzzy", null, null, limit);
}

/** Why a query found nothing: the words no descriptor names, and descriptors spelled like them. */
export interface Miss {
  readonly unread: readonly string[];
  readonly nearest: readonly string[];
}

export function explainMiss(index: SearchIndex, rawQuery: string): Miss {
  const { unread } = readWords(index.lexicon, stripIntent(rawQuery));
  return { unread, nearest: nearestDescriptors(index.lexicon, unread) };
}

function closestHits(index: SearchIndex, rawQuery: string, limit: number): SearchHit[] {
  const query = stripIntent(rawQuery);
  const candidates = [
    ...index.labels,
    ...index.phrases.flatMap((phrase) => [phrase.name, ...phrase.aliases]),
    ...index.entries.map((entry) => entry.label),
    ...index.entries.map((entry) => entry.id.split(":")[1] ?? ""),
  ].filter((candidate) => candidate.length > 0);
  const closest = closestMatch(query, candidates);
  if (closest === null || closest.distance > CLOSEST_DISTANCE) return [];

  const label = index.labels.find((item) => item === closest.candidate);
  if (label !== undefined) {
    return vectorHits(
      index,
      weightVector(index, new Map([[label, 1]])),
      "fuzzy",
      titleCase(label),
      null,
      limit,
    );
  }
  const phrase = index.phrases.find(
    (item) =>
      item.name === closest.candidate || item.aliases.some((alias) => alias === closest.candidate),
  );
  if (phrase !== undefined) {
    return vectorHits(
      index,
      weightVector(index, phraseWeights(phrase)),
      "fuzzy",
      titleCase(phrase.name),
      phrase.exemplar,
      limit,
    );
  }
  const entry = index.entries.find(
    (item) =>
      item.label === closest.candidate ||
      item.candidates.some((candidate) => candidate === closest.candidate),
  );
  if (entry === undefined || entry.moleculeId === null) return [];
  return [
    {
      id: entry.id,
      kind: entry.kind,
      label: entry.label,
      detail: entry.detail,
      moleculeId: entry.moleculeId,
      badge: entry.badge,
      match: "fuzzy",
      score: 1 - closest.distance,
    },
  ];
}

export function search(index: SearchIndex, rawQuery: string, limit = DEFAULT_LIMIT): SearchHit[] {
  const query = stripIntent(rawQuery);
  if (normalise(query).length === 0) return [];

  const hits = new Map<string, SearchHit>();
  const keep = (key: string, hit: SearchHit): void => {
    const existing = hits.get(key);
    if (existing !== undefined && rank(existing.match) <= rank(hit.match)) return;
    hits.set(key, hit);
  };

  for (const entry of index.entries) {
    let best: MatchType | null = null;
    for (const candidate of entry.candidates) {
      const match = matchType(query, candidate);
      if (match !== null && (best === null || MATCH_RANK[match] < MATCH_RANK[best])) {
        best = match;
      }
    }
    if (best === null) continue;
    keep(entry.id, {
      id: entry.id,
      kind: entry.kind,
      label: entry.label,
      detail: entry.detail,
      moleculeId: entry.moleculeId,
      badge: entry.badge,
      match: best,
      score: MATCH_SCORE[best],
    });
  }

  const phrase = bestPhrase(index, query);
  if (phrase !== null) {
    for (const hit of vectorHits(
      index,
      weightVector(index, phraseWeights(phrase)),
      "descriptor",
      titleCase(phrase.name),
      phrase.exemplar,
      limit,
    )) {
      keep(hit.id, hit);
    }
  }

  const descriptor = bestDescriptor(index, query);
  if (descriptor !== null) {
    for (const hit of vectorHits(
      index,
      weightVector(index, new Map([[descriptor, 1]])),
      "descriptor",
      titleCase(descriptor),
      null,
      limit,
      "prediction",
    )) {
      keep(hit.id, hit);
    }
  }

  // A spelling correction is a guess: it follows anything matched as typed, and gives way to a
  // reading of the query's words, which only ever lands on measured descriptors.
  const typed = [...hits.values()].some((hit) => hit.match !== "fuzzy");
  if (!typed) {
    const words = wordHits(index, rawQuery, limit);
    if (words.length > 0) hits.clear();
    const fallback =
      words.length > 0 || hits.size > 0 ? words : closestHits(index, rawQuery, limit);
    for (const hit of fallback) keep(hit.id, hit);
  }
  const corrected = (hit: SearchHit): number => (typed && hit.match === "fuzzy" ? 1 : 0);

  const sorted = [...hits.values()].sort(
    (a, b) =>
      corrected(a) - corrected(b) ||
      rank(a.match) - rank(b.match) ||
      b.score - a.score ||
      a.label.localeCompare(b.label) ||
      a.id.localeCompare(b.id),
  );
  // A phrase's known example leads the molecules, ahead of names that merely spell alike.
  const exemplar = sorted.find((hit) => hit.knownExample === true);
  if (exemplar === undefined) return sorted.slice(0, limit);
  const rest = sorted.filter((hit) => hit !== exemplar);
  const firstMolecule = rest.findIndex((hit) => hit.kind === "molecule");
  const at = firstMolecule === -1 ? rest.length : firstMolecule;
  return [...rest.slice(0, at), exemplar, ...rest.slice(at)].slice(0, limit);
}

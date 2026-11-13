/**
 * Reads a query one word at a time. Each word is folded to a stem so plurals and simple
 * inflections meet the descriptor they come from (tangerines, buttery, smoked), then looked up
 * as a descriptor, a phrase or phrase alias, or an everyday word from `words.json`. Every target
 * is a measured catalogue descriptor, so a word with no entry stays unread rather than guessed.
 */

import type { Phrase, WordsDocument } from "../data/validate";
import { normalisedEditDistance, words as splitWords } from "./fuzzy";

type Weights = readonly (readonly [string, number])[];

export interface Lexicon {
  /** Words as typed, so a phrase alias such as "smoke" keeps its own weights. */
  readonly exact: ReadonlyMap<string, Weights>;
  readonly stems: ReadonlyMap<string, Weights>;
  readonly carriers: ReadonlySet<string>;
  readonly qualifiers: ReadonlySet<string>;
}

export interface Reading {
  /** Descriptor weights summed over the words read, or null when no word names a descriptor. */
  readonly weights: Map<string, number> | null;
  /** Words that name no descriptor, phrase or everyday entry, in query order. */
  readonly unread: readonly string[];
}

/** How much a word before the head noun counts. */
export const MODIFIER_WEIGHT = 0.5;
/** Looser than a typo match, which has already failed by the time this is asked. */
const NEAREST_DISTANCE = 0.4;
const NEAREST_LIMIT = 3;
/** Shorter stems collide too freely: "hay" must not become "ha". */
const MIN_STEM_LENGTH = 3;
/** Function words and smell talk; none of them names a smell. */
const STOP_WORDS: ReadonlySet<string> = new Set([
  "a",
  "after",
  "an",
  "and",
  "aroma",
  "at",
  "for",
  "from",
  "in",
  "is",
  "it",
  "like",
  "my",
  "of",
  "odor",
  "odour",
  "on",
  "or",
  "our",
  "s",
  "scent",
  "smell",
  "some",
  "the",
  "this",
  "whiff",
  "with",
  "your",
]);

/**
 * Folds plurals (berries, peaches, tangerines), verb endings (fried, smoked, roasting), the
 * adjective -y (buttery, smoky), a silent e (smoke, spice) and a doubled final consonant (nutty),
 * so a word and the descriptor it comes from share a stem. Words ending in ss, us or is (moss,
 * citrus, iris) are not plurals.
 */
export function stem(word: string): string {
  let result = word;
  const cut = (suffix: string, replacement = ""): boolean => {
    const length = result.length - suffix.length + replacement.length;
    if (!result.endsWith(suffix) || length < MIN_STEM_LENGTH) return false;
    result = `${result.slice(0, result.length - suffix.length)}${replacement}`;
    return true;
  };
  if (!cut("ies", "y") && !/(?:ss|us|is)$/.test(result)) {
    if (/(?:sh|ch|[sxz])es$/.test(result)) cut("es");
    else cut("s");
  }
  if (!cut("ied", "y") && !cut("ed")) cut("ing");
  cut("y");
  cut("e");
  return result.replace(/([b-df-hj-np-tv-z])\1$/, "$1");
}

/** Earlier sources win: a descriptor over a phrase, a phrase over an everyday word. */
export function buildLexicon(
  labels: readonly string[],
  phrases: readonly Phrase[],
  document: WordsDocument,
): Lexicon {
  const exact = new Map<string, Weights>();
  const stems = new Map<string, Weights>();
  const add = (word: string, weights: Weights): void => {
    if (word.includes(" ")) return;
    if (!exact.has(word)) exact.set(word, weights);
    if (!stems.has(stem(word))) stems.set(stem(word), weights);
  };
  for (const label of labels) add(label, [[label, 1]]);
  for (const phrase of phrases) {
    const weights = Object.entries(phrase.weights);
    for (const name of [phrase.name, ...phrase.aliases]) add(splitWords(name).join(" "), weights);
  }
  for (const [word, targets] of Object.entries(document.words)) {
    add(
      word,
      targets.map((target) => [target, 1] as const),
    );
  }
  return {
    exact,
    stems,
    carriers: new Set(document.carriers),
    qualifiers: new Set(document.qualifiers),
  };
}

/**
 * Sums the weights of every word that names a descriptor. The last such word is the head noun
 * ("fresh bread" is bread), so the words before it count half. A qualifier ("fresh", "warm")
 * counts only when it is the only word read, because "fresh bread" says how new the bread is.
 */
export function readWords(lexicon: Lexicon, query: string): Reading {
  const read: { readonly word: string; readonly weights: Weights }[] = [];
  const unread: string[] = [];
  for (const word of splitWords(query)) {
    if (STOP_WORDS.has(word) || lexicon.carriers.has(word)) continue;
    const weights = lexicon.exact.get(word) ?? lexicon.stems.get(stem(word));
    if (weights === undefined) unread.push(word);
    else read.push({ word, weights });
  }
  const isQualifier = ({ weights }: { readonly weights: Weights }): boolean =>
    weights.length === 1 && lexicon.qualifiers.has(weights[0]?.[0] ?? "");
  const kept = read.every(isQualifier) ? read : read.filter((item) => !isQualifier(item));
  if (kept.length === 0) return { weights: null, unread };
  const weights = new Map<string, number>();
  kept.forEach(({ weights: entries }, position) => {
    const scale = position === kept.length - 1 ? 1 : MODIFIER_WEIGHT;
    for (const [label, weight] of entries) {
      weights.set(label, (weights.get(label) ?? 0) + weight * scale);
    }
  });
  return { weights, unread };
}

/**
 * Descriptors spelled close to words search could not read, closest first. Spelling is the only
 * nearness offered: the catalogue has no measure of which descriptor a missing smell resembles.
 */
export function nearestDescriptors(lexicon: Lexicon, unread: readonly string[]): string[] {
  const scored: { readonly label: string; readonly distance: number }[] = [];
  for (const word of unread) {
    for (const [candidate, weights] of lexicon.exact) {
      const distance = normalisedEditDistance(word, candidate);
      const strongest = [...weights].sort((a, b) => b[1] - a[1])[0];
      if (distance <= NEAREST_DISTANCE && strongest !== undefined) {
        scored.push({ label: strongest[0], distance });
      }
    }
  }
  scored.sort((a, b) => a.distance - b.distance || a.label.localeCompare(b.label));
  return [...new Set(scored.map(({ label }) => label))].slice(0, NEAREST_LIMIT);
}

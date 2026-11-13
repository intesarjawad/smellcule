/**
 * Text matching for the atlas search. Matching is deliberately small and dependency-free:
 * exact, prefix, all-words and a bounded edit distance for typos.
 */

export type MatchType = "exact" | "prefix" | "word" | "fuzzy";

/** Lowercase, strip accents and reduce punctuation to single spaces. */
export function normalise(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function words(value: string): string[] {
  const normalised = normalise(value);
  return normalised.length === 0 ? [] : normalised.split(" ");
}

/** Levenshtein distance over Unicode code points. */
export function editDistance(a: string, b: string): number {
  const left = Array.from(a);
  const right = Array.from(b);
  if (left.length === 0) return right.length;
  if (right.length === 0) return left.length;

  let previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let row = 1; row <= left.length; row += 1) {
    const current = [row];
    for (let column = 1; column <= right.length; column += 1) {
      const substitution =
        (previous[column - 1] ?? 0) + (left[row - 1] === right[column - 1] ? 0 : 1);
      const deletion = (previous[column] ?? 0) + 1;
      const insertion = (current[column - 1] ?? 0) + 1;
      current[column] = Math.min(substitution, deletion, insertion);
    }
    previous = current;
  }
  return previous[right.length] ?? 0;
}

/**
 * A short word tolerates no typo, because every three-letter word is one edit from another.
 * Longer words allow one edit, and words of seven characters or more allow two.
 */
export function fuzzyThreshold(word: string): number {
  const length = Array.from(word).length;
  if (length <= 3) return 0;
  if (length <= 6) return 1;
  return 2;
}

function withinThreshold(term: string, candidate: string): boolean {
  const threshold = fuzzyThreshold(term);
  return threshold > 0 && editDistance(term, candidate) <= threshold;
}

/**
 * A typo match corrects spelling inside words; it never swaps one word for another. Every query
 * word must be within its typo threshold of a candidate word, and the query's last word, the head
 * noun of an English compound, must match the candidate's last word, so a modifier never carries
 * the match: "fish market" is not "spice market", and "beer" is not "Beet sugar".
 */
export function typoMatch(query: string, candidate: string): boolean {
  const wanted = words(query);
  const text = words(candidate);
  const head = wanted.at(-1);
  const candidateHead = text.at(-1);
  if (head === undefined || candidateHead === undefined) return false;
  const close = (word: string, item: string): boolean =>
    word === item || withinThreshold(word, item);
  return (
    close(head, candidateHead) && wanted.every((word) => text.some((item) => close(word, item)))
  );
}

export function matchType(query: string, candidate: string): MatchType | null {
  const wanted = normalise(query);
  const text = normalise(candidate);
  if (wanted.length === 0 || text.length === 0) return null;
  if (wanted === text) return "exact";
  if (text.startsWith(wanted)) return "prefix";

  const wantedWords = words(wanted);
  const candidateWords = words(text);
  if (wantedWords.every((word) => candidateWords.includes(word))) return "word";
  return typoMatch(wanted, text) ? "fuzzy" : null;
}

export const MATCH_RANK: Readonly<Record<MatchType, number>> = {
  exact: 0,
  prefix: 1,
  word: 2,
  fuzzy: 3,
};

export interface ClosestMatch {
  readonly candidate: string;
  readonly distance: number;
}

/** Edit distance divided by the longer string, so short words are not favoured by accident. */
export function normalisedEditDistance(a: string, b: string): number {
  const left = normalise(a);
  const right = normalise(b);
  const longest = Math.max(Array.from(left).length, Array.from(right).length);
  if (longest === 0) return 0;
  return editDistance(left, right) / longest;
}

export const CLOSEST_DISTANCE = 0.34;

export function closestMatch(query: string, candidates: readonly string[]): ClosestMatch | null {
  let best: ClosestMatch | null = null;
  for (const candidate of candidates) {
    if (normalise(candidate).length === 0 || !typoMatch(query, candidate)) continue;
    const distance = normalisedEditDistance(query, candidate);
    if (distance > CLOSEST_DISTANCE) continue;
    if (best === null || distance < best.distance) best = { candidate, distance };
  }
  return best;
}

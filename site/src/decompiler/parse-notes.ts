/**
 * Turns a free-form note list into catalogue notes, keeping the tier each note was written
 * under. Perfume copy mixes separators and tier labels, so parsing is deliberately forgiving:
 * a tier label stays in force until the next one appears.
 */

import type { Note, NoteMolecule, NotesDocument } from "../data/validate";

export type NoteTier = "top" | "heart" | "base";

export interface ParsedNote {
  readonly tier: NoteTier;
  readonly name: string;
  readonly evidence: readonly string[];
  readonly molecules: readonly NoteMolecule[];
}

const SEPARATORS = /[\n,;/]+/;
const TIER_PREFIX = /^(top|head|heart|middle|base|bottom)(?:\s+notes?)?\s*:\s*|^(?:notes?)\s*:\s*/i;
const NOISE = /\b(?:notes?|accords?|absolutes?|essential\s+oils?)\b/gi;
const DEFAULT_TIER: NoteTier = "heart";

const TIER_NAMES: Readonly<Record<string, NoteTier>> = {
  top: "top",
  head: "top",
  heart: "heart",
  middle: "heart",
  base: "base",
  bottom: "base",
};

function clean(value: string): string {
  return value
    .toLowerCase()
    .replace(NOISE, " ")
    .replace(/^\s*of\s+/, "")
    .replace(/\s+/g, " ")
    .replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "")
    .trim();
}

interface TierChunk {
  readonly tier: NoteTier | null;
  readonly rest: string;
}

function takeTier(chunk: string): TierChunk {
  const match = TIER_PREFIX.exec(chunk);
  if (match === null) return { tier: null, rest: chunk };
  return {
    tier: TIER_NAMES[(match[1] ?? "").toLowerCase()] ?? null,
    rest: chunk.slice(match[0].length),
  };
}

function noteIndex(notes: readonly Note[]): ReadonlyMap<string, Note> {
  const index = new Map<string, Note>();
  for (const note of notes) {
    index.set(clean(note.name), note);
    for (const alias of note.aliases) index.set(clean(alias), note);
  }
  return index;
}

interface ScannedNote {
  readonly tier: NoteTier;
  readonly name: string;
  readonly note: Note | undefined;
}

function scanNotes(text: string, source: readonly Note[] | NotesDocument): ScannedNote[] {
  const index = noteIndex("notes" in source ? source.notes : source);
  const scanned: ScannedNote[] = [];
  let tier = DEFAULT_TIER;

  for (const chunk of text.split(SEPARATORS)) {
    const trimmed = chunk.trim();
    if (trimmed.length === 0) continue;
    const { tier: nextTier, rest } = takeTier(trimmed);
    if (nextTier !== null) tier = nextTier;
    const name = clean(rest);
    if (name.length === 0) continue;
    scanned.push({ tier, name, note: index.get(name) });
  }
  return scanned;
}

/**
 * Resolves every recognised note in `text`. Unknown notes are left out rather than guessed:
 * the decompiler only claims catalogue links that exist.
 */
export function parseNotes(text: string, source: readonly Note[] | NotesDocument): ParsedNote[] {
  return scanNotes(text, source).flatMap(({ tier, note }) =>
    note === undefined
      ? []
      : [{ tier, name: note.name, evidence: note.evidence, molecules: note.molecules }],
  );
}

/** The notes in `text` that the note table does not know, as cleaned and in reading order. */
export function unrecognisedNotes(text: string, source: readonly Note[] | NotesDocument): string[] {
  return scanNotes(text, source)
    .filter(({ note }) => note === undefined)
    .map(({ name }) => name);
}

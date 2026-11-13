/**
 * Runtime validation for the bundle. The atlas is a network boundary, so every field the site
 * reads is checked once here instead of being trusted through a type assertion.
 */

export type CatalogueName = "leffingwell" | "keller";
export type Split = "train" | "validation" | "held_out" | "cross_validated";
export type DataLicence = "CC-BY-NC" | "CC BY 4.0";
export type CasCheckDigit = "passes" | "fails" | "unlisted";

export interface Neighbour {
  readonly id: string;
  readonly odour: number;
  readonly structure: number;
}

export interface Molecule {
  readonly id: string;
  readonly name: string;
  /** Null where the source catalogue lists no CAS number for the molecule. */
  readonly cas: string | null;
  /** A failing check digit keeps the source's number, flagged rather than corrected. */
  readonly casCheckDigit: CasCheckDigit;
  readonly formula: string;
  readonly split: Split;
  readonly nearestTrainSimilarity: number | null;
  readonly measured: readonly number[];
  readonly neighbours: readonly Neighbour[];
}

export interface Family {
  readonly name: string;
  readonly colour: string;
  readonly labels: readonly string[];
}

export interface ModelInfo {
  readonly id: string;
  readonly licence: string;
  readonly revision: string;
}

export interface Atlas {
  readonly version: string;
  readonly exportedOn: string;
  readonly catalogue: CatalogueName;
  readonly model: ModelInfo;
  readonly attribution: string;
  readonly dataLicence: DataLicence;
  readonly stats: Readonly<Record<string, number>>;
  readonly labels: readonly string[];
  readonly families: readonly Family[];
  readonly molecules: readonly Molecule[];
}

export interface NoteMolecule {
  readonly molecule_id: string;
  readonly relation: "character" | "constituent";
  readonly source_url: string | null;
}

export interface Note {
  readonly name: string;
  readonly aliases: readonly string[];
  readonly evidence: readonly string[];
  readonly molecules: readonly NoteMolecule[];
}

export interface Archetype {
  readonly name: string;
  readonly top: readonly string[];
  readonly heart: readonly string[];
  readonly base: readonly string[];
}

export interface NotesDocument {
  readonly notes: readonly Note[];
  readonly archetypes: readonly Archetype[];
}

export interface Phrase {
  readonly name: string;
  readonly aliases: readonly string[];
  readonly weights: Readonly<Record<string, number>>;
  readonly exemplar: string | null;
  readonly source_url: string | null;
}

/** Everyday words and the measured descriptors search reads each of them as. */
export interface WordsDocument {
  readonly words: Readonly<Record<string, readonly string[]>>;
  readonly carriers: readonly string[];
  readonly qualifiers: readonly string[];
}

export const NO_WORDS: WordsDocument = { words: {}, carriers: [], qualifiers: [] };

export class BundleError extends Error {
  readonly reason: string;

  constructor(reason: string) {
    super(reason);
    this.name = "BundleError";
    this.reason = reason;
  }
}

const CATALOGUES: readonly CatalogueName[] = ["leffingwell", "keller"];
const SPLITS: readonly Split[] = ["train", "validation", "held_out", "cross_validated"];
const CAS_CHECK_DIGITS: readonly CasCheckDigit[] = ["passes", "fails", "unlisted"];
const LABEL_COUNTS: Readonly<Record<CatalogueName, number>> = {
  leffingwell: 113,
  keller: 20,
};
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const ID_PATTERN = /^\d+$/;
const COLOUR_PATTERN = /^#[0-9a-fA-F]{6}$/;
const HTTPS_PATTERN = /^https:\/\//;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function expectRecord(value: unknown, path: string): Record<string, unknown> {
  if (!isRecord(value)) throw new BundleError(`${path}: expected an object.`);
  return value;
}

function expectArray(value: unknown, path: string): unknown[] {
  if (!Array.isArray(value)) throw new BundleError(`${path}: expected an array.`);
  return value;
}

function expectText(value: unknown, path: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new BundleError(`${path}: expected a non-empty string.`);
  }
  return value;
}

function expectOptionalText(value: unknown, path: string): string | null {
  if (value === null) return null;
  if (typeof value !== "string") throw new BundleError(`${path}: expected a string or null.`);
  return value;
}

function expectNumber(value: unknown, path: string, min: number, max: number): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max) {
    throw new BundleError(`${path}: expected a number between ${min} and ${max}.`);
  }
  return value;
}

function expectFiniteNumber(value: unknown, path: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new BundleError(`${path}: expected a finite number.`);
  }
  return value;
}

function expectInteger(value: unknown, path: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    throw new BundleError(`${path}: expected a non-negative integer.`);
  }
  return value;
}

function expectDate(value: unknown, path: string): string {
  const text = expectText(value, path);
  const time = Date.parse(`${text}T00:00:00Z`);
  if (
    !DATE_PATTERN.test(text) ||
    Number.isNaN(time) ||
    new Date(time).toISOString().slice(0, 10) !== text
  ) {
    throw new BundleError(`${path}: expected a calendar date as YYYY-MM-DD.`);
  }
  return text;
}

function expectEnum<T extends string>(value: unknown, path: string, allowed: readonly T[]): T {
  const match = typeof value === "string" ? allowed.find((item) => item === value) : undefined;
  if (match === undefined) {
    throw new BundleError(`${path}: expected one of ${allowed.join(", ")}.`);
  }
  return match;
}

function expectTextArray(
  value: unknown,
  path: string,
  options: { readonly unique?: boolean; readonly minItems?: number } = {},
): string[] {
  const items = expectArray(value, path).map((item, index) =>
    expectText(item, `${path}[${index}]`),
  );
  if (options.minItems !== undefined && items.length < options.minItems) {
    throw new BundleError(`${path}: expected at least ${options.minItems} items.`);
  }
  if (options.unique && new Set(items).size !== items.length) {
    throw new BundleError(`${path}: items must be unique.`);
  }
  return items;
}

function expectHttpsOrNull(value: unknown, path: string): string | null {
  const text = expectOptionalText(value, path);
  if (text !== null && !HTTPS_PATTERN.test(text)) {
    throw new BundleError(`${path}: expected an https URL or null.`);
  }
  return text;
}

function expectId(value: unknown, path: string): string {
  const text = expectText(value, path);
  if (!ID_PATTERN.test(text)) throw new BundleError(`${path}: expected a numeric id.`);
  return text;
}

function validateNeighbour(value: unknown, path: string): Neighbour {
  const item = expectRecord(value, path);
  return {
    id: expectId(item.id, `${path}.id`),
    odour: expectNumber(item.odour, `${path}.odour`, -1, 1),
    structure: expectNumber(item.structure, `${path}.structure`, 0, 1),
  };
}

function validateMolecule(
  value: unknown,
  path: string,
  catalogue: CatalogueName,
  labelCount: number,
): Molecule {
  const item = expectRecord(value, path);
  const split = expectEnum(item.split, `${path}.split`, SPLITS);
  if (catalogue === "leffingwell" && split === "cross_validated") {
    throw new BundleError(`${path}.split: ${catalogue} must not carry cross_validated.`);
  }
  if (catalogue === "keller" && split !== "cross_validated") {
    throw new BundleError(`${path}.split: ${catalogue} molecules must be cross_validated.`);
  }
  const nearest = item.nearestTrainSimilarity;
  const measured = expectArray(item.measured, `${path}.measured`).map((label, index) => {
    const value = expectInteger(label, `${path}.measured[${index}]`);
    if (value >= labelCount) {
      throw new BundleError(`${path}.measured[${index}]: descriptor index is out of range.`);
    }
    return value;
  });
  if (new Set(measured).size !== measured.length) {
    throw new BundleError(`${path}.measured: descriptor indices must be unique.`);
  }
  const neighbours = expectArray(item.neighbours, `${path}.neighbours`).map((neighbour, index) =>
    validateNeighbour(neighbour, `${path}.neighbours[${index}]`),
  );
  if (neighbours.length !== 8) {
    throw new BundleError(`${path}.neighbours: expected exactly 8 neighbours.`);
  }
  const cas = item.cas === null ? null : expectText(item.cas, `${path}.cas`);
  const casCheckDigit = expectEnum(item.casCheckDigit, `${path}.casCheckDigit`, CAS_CHECK_DIGITS);
  if ((cas === null) !== (casCheckDigit === "unlisted")) {
    throw new BundleError(`${path}.casCheckDigit: "unlisted" must match a missing CAS number.`);
  }
  return {
    id: expectId(item.id, `${path}.id`),
    name: expectText(item.name, `${path}.name`),
    cas,
    casCheckDigit,
    formula: expectText(item.formula, `${path}.formula`),
    split,
    nearestTrainSimilarity:
      nearest === null ? null : expectNumber(nearest, `${path}.nearestTrainSimilarity`, 0, 1),
    measured,
    neighbours,
  };
}

function validateFamily(value: unknown, path: string, labels: ReadonlySet<string>): Family {
  const item = expectRecord(value, path);
  const colour = expectText(item.colour, `${path}.colour`);
  if (!COLOUR_PATTERN.test(colour)) {
    throw new BundleError(`${path}.colour: expected a six-digit hex colour.`);
  }
  const familyLabels = expectTextArray(item.labels, `${path}.labels`, {
    unique: true,
    minItems: 1,
  });
  for (const label of familyLabels) {
    if (!labels.has(label)) {
      throw new BundleError(`${path}.labels: ${label} is not in the atlas vocabulary.`);
    }
  }
  return { name: expectText(item.name, `${path}.name`), colour, labels: familyLabels };
}

function validateModel(value: unknown, path: string): ModelInfo {
  const item = expectRecord(value, path);
  return {
    id: expectText(item.id, `${path}.id`),
    licence: expectText(item.licence, `${path}.licence`),
    revision: expectText(item.revision, `${path}.revision`),
  };
}

function validateStats(value: unknown, path: string): Record<string, number> {
  const item = expectRecord(value, path);
  const stats: Record<string, number> = {};
  for (const [key, raw] of Object.entries(item)) {
    stats[key] = expectFiniteNumber(raw, `${path}.${key}`);
  }
  if (!("retiredPuzzles" in stats)) {
    throw new BundleError(`${path}: missing retiredPuzzles.`);
  }
  return stats;
}

export function validateAtlas(value: unknown): Atlas {
  const root = expectRecord(value, "atlas.json");
  const catalogue = expectEnum(root.catalogue, "atlas.json.catalogue", CATALOGUES);
  const labels = expectTextArray(root.labels, "atlas.json.labels", { unique: true });
  const expectedCount = LABEL_COUNTS[catalogue];
  if (labels.length !== expectedCount) {
    throw new BundleError(
      `atlas.json.labels: ${catalogue} requires ${expectedCount} descriptors, found ${labels.length}.`,
    );
  }
  const labelSet = new Set(labels);
  const families = expectArray(root.families, "atlas.json.families").map((family, index) =>
    validateFamily(family, `atlas.json.families[${index}]`, labelSet),
  );
  const molecules = expectArray(root.molecules, "atlas.json.molecules").map((molecule, index) =>
    validateMolecule(molecule, `atlas.json.molecules[${index}]`, catalogue, labels.length),
  );
  if (molecules.length < 9) {
    throw new BundleError("atlas.json.molecules: expected at least 9 molecules.");
  }
  const ids = new Set<string>();
  for (const molecule of molecules) {
    if (ids.has(molecule.id)) {
      throw new BundleError(`atlas.json.molecules: duplicate id ${molecule.id}.`);
    }
    ids.add(molecule.id);
  }
  return {
    version: expectText(root.version, "atlas.json.version"),
    exportedOn: expectDate(root.exportedOn, "atlas.json.exportedOn"),
    catalogue,
    model: validateModel(root.model, "atlas.json.model"),
    attribution: expectText(root.attribution, "atlas.json.attribution"),
    dataLicence: expectEnum(root.dataLicence, "atlas.json.dataLicence", [
      "CC-BY-NC",
      "CC BY 4.0",
    ] as const),
    stats: validateStats(root.stats, "atlas.json.stats"),
    labels,
    families,
    molecules,
  };
}

function validateNoteMolecule(value: unknown, path: string): NoteMolecule {
  const item = expectRecord(value, path);
  return {
    molecule_id: expectId(item.molecule_id, `${path}.molecule_id`),
    relation: expectEnum(item.relation, `${path}.relation`, ["character", "constituent"] as const),
    source_url: expectHttpsOrNull(item.source_url, `${path}.source_url`),
  };
}

function validateNote(value: unknown, path: string): Note {
  const item = expectRecord(value, path);
  const molecules = expectArray(item.molecules, `${path}.molecules`).map((molecule, index) =>
    validateNoteMolecule(molecule, `${path}.molecules[${index}]`),
  );
  if (molecules.length === 0) {
    throw new BundleError(`${path}.molecules: expected at least one molecule.`);
  }
  return {
    name: expectText(item.name, `${path}.name`),
    aliases: expectTextArray(item.aliases, `${path}.aliases`),
    evidence: expectTextArray(item.evidence, `${path}.evidence`, { minItems: 1 }),
    molecules,
  };
}

function validateArchetype(value: unknown, path: string): Archetype {
  const item = expectRecord(value, path);
  return {
    name: expectText(item.name, `${path}.name`),
    top: expectTextArray(item.top, `${path}.top`, { minItems: 1 }),
    heart: expectTextArray(item.heart, `${path}.heart`, { minItems: 1 }),
    base: expectTextArray(item.base, `${path}.base`, { minItems: 1 }),
  };
}

export function validateNotes(value: unknown): NotesDocument {
  const root = expectRecord(value, "notes.json");
  return {
    notes: expectArray(root.notes, "notes.json.notes").map((note, index) =>
      validateNote(note, `notes.json.notes[${index}]`),
    ),
    archetypes: expectArray(root.archetypes, "notes.json.archetypes").map((item, index) =>
      validateArchetype(item, `notes.json.archetypes[${index}]`),
    ),
  };
}

function validatePhrase(value: unknown, path: string): Phrase {
  const item = expectRecord(value, path);
  const weights = expectRecord(item.weights, `${path}.weights`);
  const parsedWeights: Record<string, number> = {};
  for (const [label, weight] of Object.entries(weights)) {
    parsedWeights[label] = expectFiniteNumber(weight, `${path}.weights.${label}`);
  }
  return {
    name: expectText(item.name, `${path}.name`),
    aliases: expectTextArray(item.aliases, `${path}.aliases`),
    weights: parsedWeights,
    exemplar: item.exemplar === null ? null : expectId(item.exemplar, `${path}.exemplar`),
    source_url: expectHttpsOrNull(item.source_url, `${path}.source_url`),
  };
}

export function validatePhrases(value: unknown): Phrase[] {
  return expectArray(value, "phrases.json").map((phrase, index) =>
    validatePhrase(phrase, `phrases.json[${index}]`),
  );
}

export function validateWords(value: unknown, labels: readonly string[]): WordsDocument {
  const root = expectRecord(value, "words.json");
  const known = new Set(labels);
  const descriptors = (targets: string[], path: string): string[] => {
    const unknown = targets.find((target) => !known.has(target));
    if (unknown !== undefined) throw new BundleError(`${path}: '${unknown}' is not a descriptor.`);
    return targets;
  };
  const words: Record<string, readonly string[]> = {};
  for (const [word, targets] of Object.entries(expectRecord(root.words, "words.json.words"))) {
    const path = `words.json.words.${word}`;
    words[word] = descriptors(expectTextArray(targets, path, { unique: true, minItems: 1 }), path);
  }
  return {
    words,
    carriers: expectTextArray(root.carriers, "words.json.carriers", { unique: true }),
    qualifiers: descriptors(
      expectTextArray(root.qualifiers, "words.json.qualifiers", { unique: true }),
      "words.json.qualifiers",
    ),
  };
}

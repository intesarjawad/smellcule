/**
 * The card model is the plain description of one molecule's entry: identity, split, structure,
 * measured descriptors, model predictions, nearest training neighbour and odour neighbours.
 */

import { type Bundle, predictionRow, spreadRow, structureUrl } from "../data/bundle";
import { listedNames, plainName } from "../data/names";
import type { CasCheckDigit, CatalogueName, Molecule, Split } from "../data/validate";

export const TOP_DESCRIPTORS = 10;

/** Tanimoto below which a molecule is far from training, or a neighbour has a different structure. */
export const LOW_STRUCTURE_SIMILARITY = 0.3;

const SPLIT_LABELS: Readonly<Record<Split, string>> = {
  train: "Train",
  validation: "Validation",
  held_out: "Held out",
  cross_validated: "Cross-validated",
};

const SPLIT_MESSAGES: Readonly<Record<Split, string>> = {
  train: "Seen in training",
  validation: "Validation: used to decide when training stopped, never trained on",
  held_out: "Held out: the model never saw this molecule",
  cross_validated: "Cross-validated: predicted by a model that never saw this molecule",
};

const SOURCE_LINES: Readonly<Record<CatalogueName, string>> = {
  leffingwell: "Leffingwell PMP 2001 via Pyrfume, CC-BY-NC",
  keller: "Keller 2016 via Pyrfume, CC BY 4.0",
};

/** Keller rated every molecule at stated dilutions; Leffingwell's descriptors carry none. */
const CONDITION_LINES: Readonly<Record<CatalogueName, string | null>> = {
  leffingwell: "Source records no concentration or solvent",
  keller: null,
};

export interface DescriptorPrediction {
  readonly label: string;
  readonly probability: number;
  readonly spread: number;
  readonly measured: boolean;
}

export interface MeasuredDescriptor {
  readonly label: string;
  readonly colour: string | null;
}

export interface CardNeighbour {
  readonly id: string;
  readonly name: string;
  readonly odour: number;
  readonly structure: number;
  readonly structureUrl: string;
}

export interface CardModel {
  readonly id: string;
  readonly name: string;
  readonly cas: string | null;
  readonly casCheckDigit: CasCheckDigit;
  readonly formula: string;
  readonly split: Split;
  readonly splitLabel: string;
  readonly splitMessage: string;
  readonly structure: string;
  readonly measured: readonly string[];
  readonly measuredDescriptors: readonly MeasuredDescriptor[];
  readonly predicted: readonly DescriptorPrediction[];
  readonly nearestTrainSimilarity: number | null;
  readonly neighbours: readonly CardNeighbour[];
  readonly licence: string;
  readonly attribution: string;
  readonly source: string;
  readonly conditions: string | null;
}

/** The identifier line under a molecule's name, shared by the card and search results. */
export function moleculeIdentity(
  molecule: Pick<Molecule, "cas" | "casCheckDigit" | "formula">,
): string {
  const cas =
    molecule.cas === null
      ? "CAS not listed"
      : molecule.casCheckDigit === "passes"
        ? molecule.cas
        : `${molecule.cas} (as listed in the source)`;
  return `${cas} · ${molecule.formula}`;
}

export function splitMessage(split: Split): string {
  return SPLIT_MESSAGES[split];
}

export function farFromTraining(split: Split, nearest: number | null): string | null {
  if (split === "train" || nearest === null || nearest >= LOW_STRUCTURE_SIMILARITY) return null;
  return `Far from training data (nearest training molecule: ${nearest.toFixed(2)})`;
}

/** Similarity to the nearest training molecule, for every molecule the model never trained on. */
export function nearestTrainingLine(split: Split, nearest: number | null): string | null {
  if (split === "train" || nearest === null) return null;
  return farFromTraining(split, nearest) ?? `Nearest training molecule: ${nearest.toFixed(2)}`;
}

export function neighbourLabel(neighbour: CardNeighbour): string {
  return `odour ${neighbour.odour.toFixed(2)}, structure ${neighbour.structure.toFixed(2)}`;
}

function familyColours(bundle: Bundle): Map<string, string> {
  const colours = new Map<string, string>();
  for (const family of bundle.atlas.families) {
    for (const label of family.labels) {
      if (!colours.has(label)) colours.set(label, family.colour);
    }
  }
  return colours;
}

export function cardModel(bundle: Bundle, moleculeId: string): CardModel {
  const moleculeIndex = bundle.atlas.molecules.findIndex((molecule) => molecule.id === moleculeId);
  const molecule = bundle.atlas.molecules[moleculeIndex];
  if (molecule === undefined) {
    throw new Error(`Unknown molecule: ${moleculeId}`);
  }
  const probabilities = predictionRow(bundle, moleculeIndex);
  const spreads = spreadRow(bundle, moleculeIndex);
  const measured = new Set(molecule.measured);
  const names = listedNames(bundle.atlas.molecules);
  const colours = familyColours(bundle);
  const measuredLabels = molecule.measured
    .map((index) => bundle.atlas.labels[index])
    .filter((label): label is string => label !== undefined);

  const predicted = bundle.atlas.labels
    .map((label, index) => ({
      label,
      probability: probabilities[index] ?? 0,
      spread: spreads[index] ?? 0,
      measured: measured.has(index),
    }))
    .filter((descriptor) => descriptor.probability > 0)
    .sort((a, b) => b.probability - a.probability || a.label.localeCompare(b.label))
    .slice(0, TOP_DESCRIPTORS);

  return {
    id: molecule.id,
    name: molecule.name,
    cas: molecule.cas,
    casCheckDigit: molecule.casCheckDigit,
    formula: molecule.formula,
    split: molecule.split,
    splitLabel: SPLIT_LABELS[molecule.split],
    splitMessage: splitMessage(molecule.split),
    structure: structureUrl(bundle, molecule.id),
    measured: measuredLabels,
    measuredDescriptors: measuredLabels.map((label) => ({
      label,
      colour: colours.get(label) ?? null,
    })),
    predicted,
    nearestTrainSimilarity: molecule.nearestTrainSimilarity,
    neighbours: molecule.neighbours.map((neighbour) => ({
      id: neighbour.id,
      name: plainName(names.get(neighbour.id) ?? neighbour.id),
      odour: neighbour.odour,
      structure: neighbour.structure,
      structureUrl: structureUrl(bundle, neighbour.id),
    })),
    licence: bundle.atlas.dataLicence,
    attribution: bundle.atlas.attribution,
    source: SOURCE_LINES[bundle.atlas.catalogue],
    conditions: CONDITION_LINES[bundle.atlas.catalogue],
  };
}

export function cardAnnouncement(molecule: Pick<Molecule, "name" | "measured">): string {
  const count = molecule.measured.length;
  return `${molecule.name}, ${count} measured descriptor${count === 1 ? "" : "s"}`;
}

/**
 * A note list describes several molecules. The decompiler averages their predicted vectors and
 * reports the odour families of that average; it never pretends the average is a mixture.
 */

import { type Bundle, predictionRow } from "../data/bundle";
import type { ParsedNote } from "./parse-notes";

export interface FamilyProfileScore {
  readonly name: string;
  readonly colour: string;
  readonly score: number;
}

export interface NoteProfile {
  readonly ids: readonly string[];
  readonly mean: Float32Array;
  readonly families: readonly FamilyProfileScore[];
}

export function profileIds(notes: readonly ParsedNote[]): string[] {
  const ids: string[] = [];
  const seen = new Set<string>();
  for (const note of notes) {
    for (const molecule of note.molecules) {
      if (seen.has(molecule.molecule_id)) continue;
      seen.add(molecule.molecule_id);
      ids.push(molecule.molecule_id);
    }
  }
  return ids;
}

export function noteProfile(
  bundle: Pick<Bundle, "atlas" | "predictions">,
  ids: readonly string[],
): NoteProfile | null {
  const positions = new Map(bundle.atlas.molecules.map((molecule, index) => [molecule.id, index]));
  const resolved = [...new Set(ids)].filter((id) => positions.has(id));
  if (resolved.length === 0) return null;

  const mean = new Float32Array(bundle.atlas.labels.length);
  for (const id of resolved) {
    const row = predictionRow(bundle, positions.get(id) ?? 0);
    for (let position = 0; position < mean.length; position += 1) {
      mean[position] = (mean[position] ?? 0) + (row[position] ?? 0) / resolved.length;
    }
  }

  const labelPositions = new Map(bundle.atlas.labels.map((label, index) => [label, index]));
  const families = bundle.atlas.families.map((family) => {
    let total = 0;
    let count = 0;
    for (const label of family.labels) {
      const position = labelPositions.get(label);
      if (position === undefined) continue;
      total += mean[position] ?? 0;
      count += 1;
    }
    return {
      name: family.name,
      colour: family.colour,
      score: count === 0 ? 0 : total / count,
    };
  });

  return { ids: resolved, mean, families };
}

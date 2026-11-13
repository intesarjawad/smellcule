/**
 * The receiver's dial. Each odour family is a band; a molecule is a station on the band its
 * measured descriptors name most often. Along a band, stations follow that band's first principal
 * axis in the map projection, so the order is a way to sweep, not a measurement.
 */

import type { Atlas } from "../data/validate";

export interface Station {
  readonly index: number;
  readonly id: string;
  readonly name: string;
  /** Position along the band, 0 to 1. */
  readonly at: number;
}

export interface Band {
  readonly name: string;
  readonly colour: string;
  readonly stations: readonly Station[];
}

export interface Dial {
  readonly bands: readonly Band[];
  /** Band index for every molecule on the dial. */
  readonly bandOf: ReadonlyMap<string, number>;
  /** Molecules with no measured descriptor in any family, so no band to sit on. */
  readonly offDial: number;
}

type DialAtlas = Pick<Atlas, "labels" | "families" | "molecules">;

/** The family named by most of the measured descriptors; a tie goes to the one named first. */
export function primaryFamily(
  measured: readonly number[],
  labels: readonly string[],
  familyOf: ReadonlyMap<string, string>,
): string | null {
  const counts = new Map<string, number>();
  for (const index of measured) {
    const family = familyOf.get(labels[index] ?? "");
    if (family !== undefined) counts.set(family, (counts.get(family) ?? 0) + 1);
  }
  let best: string | null = null;
  for (const [family, count] of counts) {
    if (best === null || count > (counts.get(best) ?? 0)) best = family;
  }
  return best;
}

const AXIS_ITERATIONS = 50;

type Point = readonly [number, number, number];

const dot = (a: Point, b: Point): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/** Projection of each point on the first principal axis of the set, by power iteration. */
function principalProjection(points: readonly Point[]): number[] {
  let mx = 0;
  let my = 0;
  let mz = 0;
  for (const [x, y, z] of points) {
    mx += x / points.length;
    my += y / points.length;
    mz += z / points.length;
  }
  const centred: Point[] = points.map(([x, y, z]) => [x - mx, y - my, z - mz]);
  let axis: Point = [1, 0.3, 0.1];
  for (let step = 0; step < AXIS_ITERATIONS; step += 1) {
    let nx = 0;
    let ny = 0;
    let nz = 0;
    for (const point of centred) {
      const t = dot(point, axis);
      nx += t * point[0];
      ny += t * point[1];
      nz += t * point[2];
    }
    const length = Math.hypot(nx, ny, nz);
    if (length === 0) break;
    axis = [nx / length, ny / length, nz / length];
  }
  return centred.map((point) => dot(point, axis));
}

export function buildDial(atlas: DialAtlas, positions: Float32Array): Dial {
  const familyOf = new Map<string, string>();
  for (const family of atlas.families) {
    for (const label of family.labels) if (!familyOf.has(label)) familyOf.set(label, family.name);
  }
  const members = new Map<string, number[]>(atlas.families.map((family) => [family.name, []]));
  let offDial = 0;
  atlas.molecules.forEach((molecule, index) => {
    const family = primaryFamily(molecule.measured, atlas.labels, familyOf);
    if (family === null) offDial += 1;
    else members.get(family)?.push(index);
  });

  const bandOf = new Map<string, number>();
  const bands = atlas.families
    .map((family) => {
      const indices = members.get(family.name) ?? [];
      const projection = principalProjection(
        indices.map(
          (index): Point => [
            positions[index * 3] ?? 0,
            positions[index * 3 + 1] ?? 0,
            positions[index * 3 + 2] ?? 0,
          ],
        ),
      );
      const low = Math.min(...projection);
      const range = Math.max(...projection) - low;
      const stations = indices
        .map((index, k) => ({
          index,
          id: atlas.molecules[index]?.id ?? "",
          name: atlas.molecules[index]?.name ?? "",
          at: range > 0 ? ((projection[k] ?? 0) - low) / range : 0.5,
        }))
        .sort((a, b) => a.at - b.at || a.id.localeCompare(b.id));
      return { name: family.name, colour: family.colour, stations };
    })
    .filter((band) => band.stations.length > 0);
  bands.forEach((band, bandIndex) => {
    for (const station of band.stations) bandOf.set(station.id, bandIndex);
  });
  return { bands, bandOf, offDial };
}

/** Index of the station nearest a dial position; the band's stations are sorted by `at`. */
export function nearestStation(band: Band, at: number): number {
  const stations = band.stations;
  let low = 0;
  let high = stations.length - 1;
  while (low < high) {
    const middle = (low + high) >> 1;
    if ((stations[middle]?.at ?? 0) < at) low = middle + 1;
    else high = middle;
  }
  const before = stations[low - 1];
  const here = stations[low];
  if (before !== undefined && here !== undefined && at - before.at <= here.at - at) return low - 1;
  return low;
}

export interface StationPlace {
  readonly band: number;
  readonly station: number;
}

export function placeOf(dial: Dial, id: string): StationPlace | null {
  const band = dial.bandOf.get(id);
  if (band === undefined) return null;
  const station = dial.bands[band]?.stations.findIndex((item) => item.id === id) ?? -1;
  return station === -1 ? null : { band, station };
}

export interface MemoryEntry {
  readonly id: string;
  readonly name: string;
  readonly odour: number;
}

export interface Memory {
  readonly entries: readonly MemoryEntry[];
  /** Other isomers that share the station's own name, with the CAS that tells them apart. */
  readonly isomers: readonly string[];
}

/**
 * The station memory: odour neighbours with the station's own isomers taken out, and isomers
 * that share a name folded into the closest one, so no name is listed twice.
 */
export function memoryOf(
  name: string,
  neighbours: readonly MemoryEntry[],
  casOf: (id: string) => string | null,
): Memory {
  const seen = new Set([name]);
  const entries: MemoryEntry[] = [];
  const isomers: string[] = [];
  for (const neighbour of neighbours) {
    if (neighbour.name === name) isomers.push(casOf(neighbour.id) ?? "CAS not listed");
    if (seen.has(neighbour.name)) continue;
    seen.add(neighbour.name);
    entries.push(neighbour);
  }
  return { entries, isomers };
}

export interface Label {
  readonly x: number;
  readonly width: number;
  /** Centred labels sit across x; the rest start at x. */
  readonly centred: boolean;
}

export interface PlacedLabel {
  readonly index: number;
  readonly lane: number;
}

/**
 * Stacks labels on up to `lanes` printed lines, taken in priority order: each goes on the first
 * line where it clears every label already there by `gap` and stays between `min` and `max`.
 */
export function stackLabels(
  labels: readonly Label[],
  order: readonly number[],
  lanes: number,
  gap: number,
  min: number,
  max: number,
): PlacedLabel[] {
  const kept: { left: number; right: number }[][] = Array.from({ length: lanes }, () => []);
  const result: PlacedLabel[] = [];
  for (const index of order) {
    const label = labels[index];
    if (label === undefined) continue;
    const left = label.centred ? label.x - label.width / 2 : label.x;
    const right = left + label.width;
    if (left < min || right > max) continue;
    const lane = kept.findIndex((line) =>
      line.every((other) => left >= other.right + gap || right <= other.left - gap),
    );
    if (lane === -1) continue;
    kept[lane]?.push({ left, right });
    result.push({ index, lane });
  }
  return result;
}

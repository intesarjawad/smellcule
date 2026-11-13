/**
 * Browse groups every molecule under the odour family its predictions favour most. Each molecule
 * appears once, and the fallback uses measured descriptors when the model has no opinion.
 *
 * The list inside each family is built on first open so a catalogue with many families does not
 * create every link before anyone asks for it.
 */

import { moleculeHref } from "../card/link";
import { type Bundle, predictionRow } from "../data/bundle";
import { listedNames } from "../data/names";
import { element } from "../ui/dom";

export interface BrowseMolecule {
  readonly id: string;
  readonly name: string;
}

export interface BrowseGroup {
  readonly name: string;
  readonly colour: string;
  readonly molecules: readonly BrowseMolecule[];
}

interface FamilyBucket {
  readonly name: string;
  readonly colour: string;
  readonly labels: readonly string[];
  readonly molecules: BrowseMolecule[];
}

export function browseGroups(bundle: Bundle): BrowseGroup[] {
  const buckets: FamilyBucket[] = bundle.atlas.families.map((family) => ({
    name: family.name,
    colour: family.colour,
    labels: family.labels,
    molecules: [],
  }));

  const labelIndex = new Map(bundle.atlas.labels.map((label, index) => [label, index]));

  const names = listedNames(bundle.atlas.molecules);
  bundle.atlas.molecules.forEach((molecule, moleculeIndex) => {
    const probabilities = predictionRow(bundle, moleculeIndex);
    let best = 0;
    let bestScore = -1;
    buckets.forEach((bucket, index) => {
      let score = 0;
      for (const label of bucket.labels) {
        const position = labelIndex.get(label);
        const probability = position === undefined ? 0 : (probabilities[position] ?? 0);
        if (probability > score) score = probability;
      }
      if (score > bestScore) {
        best = index;
        bestScore = score;
      }
    });

    if (bestScore === 0) {
      const measured = new Set(
        molecule.measured
          .map((index) => bundle.atlas.labels[index])
          .filter((label): label is string => label !== undefined),
      );
      const fallback = buckets.findIndex((bucket) =>
        bucket.labels.some((label) => measured.has(label)),
      );
      if (fallback !== -1) best = fallback;
    }

    const bucket = buckets[best];
    if (bucket !== undefined)
      bucket.molecules.push({ id: molecule.id, name: names.get(molecule.id) ?? molecule.name });
  });

  return buckets
    .filter((bucket) => bucket.molecules.length > 0)
    .map((bucket) => ({
      name: bucket.name,
      colour: bucket.colour,
      molecules: [...bucket.molecules].sort(
        (a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id),
      ),
    }));
}

export function familySummary(name: string, count: number): string {
  return `${name} (${count})`;
}

function familyList(group: BrowseGroup): HTMLUListElement {
  const list = element("ul");
  for (const molecule of group.molecules) {
    const item = element("li");
    const anchor = element("a", molecule.name);
    anchor.href = moleculeHref(molecule.id);
    item.append(anchor);
    list.append(item);
  }
  return list;
}

export function renderBrowse(container: HTMLElement, groups: readonly BrowseGroup[]): void {
  if (groups.length === 0) {
    container.replaceChildren(element("p", "No molecules are available."));
    return;
  }

  const detailsList = groups.map((group) => {
    const details = element("details", undefined, "family");
    details.style.setProperty("--family", group.colour);
    const summary = element("summary", familySummary(group.name, group.molecules.length));
    details.append(summary);

    let rendered = false;
    const show = (): void => {
      if (rendered || !details.open) return;
      rendered = true;
      details.append(familyList(group));
      details.removeEventListener("toggle", show);
    };
    details.addEventListener("toggle", show);
    return details;
  });
  container.replaceChildren(...detailsList);
}

import type { Bundle } from "../../src/data/bundle";
import { buildSearchIndex } from "../../src/search/index";
import { deepLinkHit } from "../../src/search/view";
import type { EverydayQuery } from "../queries";

/**
 * The queries whose first molecule, the one Enter and a `?q=` link open, has no measured
 * descriptor in a family the query names.
 */
export function familyMisses(bundle: Bundle, queries: readonly EverydayQuery[]): string[] {
  const index = buildSearchIndex(bundle);
  const familyOf = new Map(
    bundle.atlas.families.flatMap((family) =>
      family.labels.map((label) => [label, family.name] as const),
    ),
  );
  const molecules = new Map(bundle.atlas.molecules.map((molecule) => [molecule.id, molecule]));
  return queries
    .filter(({ query, families }) => {
      const moleculeId = deepLinkHit(index, query)?.moleculeId ?? null;
      const measured = moleculeId === null ? [] : (molecules.get(moleculeId)?.measured ?? []);
      return !measured.some((position) => {
        const family = familyOf.get(bundle.atlas.labels[position] ?? "");
        return family !== undefined && families.includes(family);
      });
    })
    .map(({ query }) => query);
}

import type { Molecule } from "./validate";

/**
 * Names for listing molecules by id. The source catalogue gives some distinct molecules the same
 * name (stereoisomers, mostly), so a shared name carries its CAS number to tell them apart.
 */
export function listedNames(
  molecules: readonly Pick<Molecule, "id" | "name" | "cas">[],
): Map<string, string> {
  const counts = new Map<string, number>();
  for (const { name } of molecules) counts.set(name, (counts.get(name) ?? 0) + 1);
  return new Map(
    molecules.map(({ id, name, cas }) => [
      id,
      (counts.get(name) ?? 0) > 1 ? `${name} (${cas ?? "CAS not listed"})` : name,
    ]),
  );
}

/** A listed name without the CAS suffix `listedNames` adds, for places that have room for one name only. */
export function plainName(name: string): string {
  return name.replace(/ \(\d+-\d{2}-\d\)$/, "");
}

const SOFT_HYPHEN = "­";
const CHEMICAL_JOINS =
  /(methyl|ethyl|propyl|butyl|pentyl|hexyl|phenyl|benzyl|hydroxy|hydro|cyclo)(?=[a-z]{3})/gi;

/** A name that may wrap only where its chemical parts join (Ethyl-trimethyl-norbornanol), never mid-syllable. */
export function breakableName(name: string): string {
  return plainName(name).replace(CHEMICAL_JOINS, `$1${SOFT_HYPHEN}`);
}

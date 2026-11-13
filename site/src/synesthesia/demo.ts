/**
 * The molecules the listening check plays, in the order the sound mapping lists them. The first
 * two the catalogue has open Synesthesia when no molecule is named.
 */

import type { CatalogueName } from "../data/validate";

export const DEMO_NAMES: Readonly<Record<CatalogueName, readonly string[]>> = {
  leffingwell: [
    "Vanillin",
    "Limonene",
    "Geosmin",
    "Cedrol",
    "Muscone",
    "Eugenol",
    "Furfuryl mercaptan",
    "Calone®",
  ],
  keller: [
    "Vanillin",
    "Eugenol",
    "isovaleric acid",
    "Dimethyl trisulfide",
    "Guaiacol",
    "ethyl butyrate",
    "Hexanal",
    "geraniol",
  ],
};

export interface DemoCatalogue {
  readonly catalogue: CatalogueName;
  readonly molecules: readonly { readonly id: string; readonly name: string }[];
}

/** The first catalogue row with each of the first two demo names present, without case. */
export function defaultPair(atlas: DemoCatalogue): string[] {
  return DEMO_NAMES[atlas.catalogue]
    .flatMap((name) => {
      const molecule = atlas.molecules.find(
        (candidate) => candidate.name.toLowerCase() === name.toLowerCase(),
      );
      return molecule === undefined ? [] : [molecule.id];
    })
    .slice(0, 2);
}

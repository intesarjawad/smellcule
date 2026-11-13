/**
 * The note decompiler reads a pasted note list, shows the catalogued molecules linked to each
 * note, and averages their predictions into a family profile. It is a description of molecules,
 * not an ingredient list for the perfume.
 */

import { moleculeHref } from "../card/link";
import type { Bundle } from "../data/bundle";
import { listedNames } from "../data/names";
import { element, link } from "../ui/dom";
import { type NoteTier, type ParsedNote, parseNotes, unrecognisedNotes } from "./parse-notes";
import { type FamilyProfileScore, noteProfile, profileIds } from "./profile";

export const LIMITS_TEXT =
  "Perfume formulas are trade secrets and note lists are descriptions, not ingredient lists. " +
  "This shows catalogued molecules linked to each note. It does not tell you what is in this perfume.";

const TIERS: readonly { readonly key: NoteTier; readonly label: string }[] = [
  { key: "top", label: "Top notes" },
  { key: "heart", label: "Heart notes" },
  { key: "base", label: "Base notes" },
];

export interface TierNotes {
  readonly key: NoteTier;
  readonly label: string;
  readonly notes: readonly ParsedNote[];
}

/** What the decompiler needs to know about a catalogue molecule to justify a link. */
export interface CatalogueEntry {
  readonly name: string;
  readonly measured: readonly string[];
}

export interface LinkedMolecule {
  readonly id: string;
  readonly name: string;
  readonly href: string;
  readonly relation: string;
  readonly sourceUrl: string | null;
}

export interface ProfileBar {
  readonly name: string;
  readonly colour: string;
  readonly text: string;
  readonly percent: number;
}

/** The notes in each tier, keeping the fixed top, heart and base order. */
export function tierNotes(notes: readonly ParsedNote[]): TierNotes[] {
  return TIERS.map((tier) => ({
    key: tier.key,
    label: tier.label,
    notes: notes.filter((note) => note.tier === tier.key),
  }));
}

/**
 * Catalogue links for one note. A `character` link is justified by the molecule's measured
 * descriptors that the note lists as evidence; a `constituent` link by its source.
 */
export function linkedMolecules(
  note: ParsedNote,
  catalogue: ReadonlyMap<string, CatalogueEntry>,
): LinkedMolecule[] {
  const evidence = new Set(note.evidence);
  return note.molecules.map((molecule) => {
    const entry = catalogue.get(molecule.molecule_id);
    const shared = (entry?.measured ?? []).filter((label) => evidence.has(label));
    return {
      id: molecule.molecule_id,
      name: entry?.name ?? molecule.molecule_id,
      href: moleculeHref(molecule.molecule_id),
      relation:
        molecule.relation === "constituent"
          ? `found in ${note.name}`
          : `smells ${shared.join(", ")} in the catalogue`,
      sourceUrl: molecule.source_url,
    };
  });
}

export function profileBars(families: readonly FamilyProfileScore[]): ProfileBar[] {
  return families.map((family) => ({
    name: family.name,
    colour: family.colour,
    text: family.score.toFixed(3),
    percent: Math.round(family.score * 1000) / 10,
  }));
}

export function mixtureHref(ids: readonly string[]): string {
  return `#/synesthesia?mix=${ids.map(encodeURIComponent).join(",")}`;
}

export function atlasIdsHref(ids: readonly string[]): string {
  return `#/atlas?ids=${ids.map(encodeURIComponent).join(",")}`;
}

export function archetypeText(
  top: readonly string[],
  heart: readonly string[],
  base: readonly string[],
): string {
  return [`top: ${top.join(", ")}`, `heart: ${heart.join(", ")}`, `base: ${base.join(", ")}`].join(
    "\n",
  );
}

export function renderDecompiler(container: HTMLElement, bundle: Bundle): void {
  const section = element("section", undefined, "decompiler");
  section.append(element("h1", "Note decompiler"));

  const label = element("label", "Notes from a perfume description");
  label.htmlFor = "note-input";
  const input = element("textarea");
  input.id = "note-input";
  input.rows = 8;
  input.placeholder = "top: bergamot, lemon\nheart: rose, jasmine\nbase: patchouli, musk";

  const archetypes = element("div", undefined, "archetypes");
  archetypes.append(element("p", "Start from an archetype:"));
  for (const archetype of bundle.notes.archetypes) {
    const button = element("button", archetype.name);
    button.type = "button";
    button.addEventListener("click", () => {
      input.value = archetypeText(archetype.top, archetype.heart, archetype.base);
      input.dispatchEvent(new Event("input"));
    });
    archetypes.append(button);
  }

  const disclaimer = element("p", LIMITS_TEXT, "disclaimer");
  const result = element("div");

  const names = listedNames(bundle.atlas.molecules);
  const catalogue = new Map(
    bundle.atlas.molecules.map((molecule) => [
      molecule.id,
      {
        name: names.get(molecule.id) ?? molecule.name,
        measured: molecule.measured
          .map((index) => bundle.atlas.labels[index])
          .filter((label): label is string => label !== undefined),
      },
    ]),
  );

  const update = (): void => {
    const parsed = parseNotes(input.value, bundle.notes);
    const unknown = unrecognisedNotes(input.value, bundle.notes);
    const unknownLine =
      unknown.length === 0
        ? []
        : [element("p", `Not in the note table: ${unknown.join(", ")}`, "unrecognised")];
    const ids = profileIds(parsed);
    const profile = noteProfile(bundle, ids);
    if (parsed.length === 0 || profile === null) {
      result.replaceChildren(
        element("p", "No catalogued notes were found in that description."),
        ...unknownLine,
      );
      return;
    }

    const os = element("div", undefined, "note-result");
    const columns = element("div", undefined, "tiers");
    for (const tier of tierNotes(parsed)) {
      const column = element("section");
      column.append(element("h3", tier.label));
      if (tier.notes.length === 0) column.append(element("p", "No notes in this tier."));
      for (const note of tier.notes) {
        column.append(element("h4", note.name));
        const list = element("ul");
        for (const molecule of linkedMolecules(note, catalogue)) {
          const item = element("li");
          item.append(
            link(molecule.name, molecule.href),
            element("span", molecule.relation, "detail"),
          );
          if (molecule.sourceUrl !== null) {
            item.append(link("source", molecule.sourceUrl));
          }
          list.append(item);
        }
        column.append(list);
      }
      columns.append(column);
    }
    os.append(columns, ...unknownLine);

    const profileSection = element("section");
    profileSection.append(element("h3", "Family profile"));
    const bars = element("ol", undefined, "family-bars");
    for (const family of profileBars(profile.families)) {
      const item = element("li");
      const bar = element("span", undefined, "bar");
      const fill = element("span", undefined, "bar-fill");
      fill.style.width = `${family.percent}%`;
      fill.style.backgroundColor = family.colour;
      bar.append(fill);
      item.append(
        element("span", family.name, "family-name"),
        bar,
        element("span", family.text, "mono"),
      );
      bars.append(item);
    }
    profileSection.append(
      bars,
      element("p", "Average of single molecules, not a mixture prediction", "caption"),
    );
    os.append(profileSection);

    const actions = element("p", undefined, "actions");
    const atlas = link("Show on atlas", atlasIdsHref(profile.ids));
    const play = link("Play this", mixtureHref(profile.ids));
    actions.append(atlas, " ", play);
    os.append(actions);

    result.replaceChildren(os);
  };

  input.addEventListener("input", update);
  section.append(label, input, archetypes, disclaimer, result);
  container.replaceChildren(section);
  update();
}

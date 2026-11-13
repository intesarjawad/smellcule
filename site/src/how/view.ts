/**
 * How it works. Every number on the page is read from the bundle, so it cannot drift from the
 * data the rest of the site reads; the authored text only says what the numbers mean. Sections
 * follow the order the page promises, and a sentence whose number the bundle lacks is left out.
 */

import { LOW_STRUCTURE_SIMILARITY, splitMessage } from "../card/model";
import type { Bundle } from "../data/bundle";
import type { Atlas, Split } from "../data/validate";
import { LIMITS_TEXT } from "../decompiler/view";
import { featuresFor } from "../router";
import { element, link } from "../ui/dom";
import { EVALUATION_URL, REPO_URL, releaseAssetUrl } from "../ui/footer";

export const PMP_2001_PRICE_USD = 2775;
export const PMP_2001_SOURCE = {
  url: "https://www.leffingwell.com/bacispmp.htm",
  fetched: "2026-11-10",
} as const;

export interface HowStat {
  readonly key: string;
  readonly value: string;
}

export interface HowStatGroup {
  readonly heading: string;
  readonly stats: readonly HowStat[];
}

const GROUP_ORDER: readonly { readonly prefix: string; readonly heading: string }[] = [
  { prefix: "official", heading: "Official Leffingwell split" },
  { prefix: "cluster", heading: "Cluster split" },
  { prefix: "calibration", heading: "Calibration and uncertainty" },
  { prefix: "cross_source", heading: "Cross-source check" },
  { prefix: "gslf", heading: "GS-LF comparison" },
  { prefix: "keller", heading: "Keller cross-validation" },
  { prefix: "leakage", heading: "Leakage audit" },
];

export function howStatGroups(stats: Readonly<Record<string, number>>): HowStatGroup[] {
  const entries = Object.entries(stats)
    .map(([key, value]) => ({ key, value: String(value) }))
    .sort((a, b) => a.key.localeCompare(b.key));
  const groups: HowStatGroup[] = [];
  const used = new Set<string>();

  for (const group of GROUP_ORDER) {
    const members = entries.filter(
      (entry) =>
        entry.key === group.prefix ||
        entry.key.startsWith(`${group.prefix}.`) ||
        entry.key.startsWith(`${group.prefix}_`),
    );
    if (members.length === 0) continue;
    for (const member of members) used.add(member.key);
    groups.push({ heading: group.heading, stats: members });
  }

  const rest = entries.filter((entry) => !used.has(entry.key));
  if (rest.length > 0) groups.push({ heading: "Other measurements", stats: rest });
  return groups;
}

export interface HowLine {
  readonly text: string;
  /** Rendered as a list item rather than a paragraph. */
  readonly item?: boolean;
  readonly link?: { readonly label: string; readonly href: string };
}

export interface HowSection {
  readonly heading: string;
  readonly lines: readonly HowLine[];
}

const SPLITS: Readonly<Record<Atlas["catalogue"], readonly Split[]>> = {
  leffingwell: ["train", "validation", "held_out"],
  keller: ["cross_validated"],
};

function docsUrl(path: string): string {
  return `${REPO_URL}/blob/main/${path}`;
}

function sources(atlas: Atlas): HowSection {
  const stats = atlas.stats;
  const lines: HowLine[] =
    atlas.catalogue === "leffingwell"
      ? [
          {
            text: `Every measured descriptor comes from the research release of the Leffingwell PMP 2001 database, published through Pyrfume under ${atlas.dataLicence}: ${stats.leffingwell_molecules} molecules and ${stats.leffingwell_descriptors} descriptors, for non-commercial use.`,
          },
          {
            text: `The full PMP 2001 database is sold for ${PMP_2001_PRICE_USD} US dollars and also records stability, application and supplier data. The research release has none of that, so neither does this site.`,
            link: {
              label: `Source, checked ${PMP_2001_SOURCE.fetched}`,
              href: PMP_2001_SOURCE.url,
            },
          },
        ]
      : [
          {
            text: `Every measured descriptor comes from Keller and Vosshall 2016, published through Pyrfume under ${atlas.dataLicence}: ${stats.keller_molecules} molecules rated on ${stats.keller_descriptors} descriptors. A card lists each molecule's three highest-rated descriptors.`,
          },
        ];
  lines.push(
    { text: `Credit: ${atlas.attribution}.` },
    {
      text: `This copy of the atlas is bundle ${atlas.version}, exported on ${atlas.exportedOn}, with ${atlas.molecules.length} molecules.`,
    },
  );
  return { heading: "Where the descriptors come from", lines };
}

function splits(atlas: Atlas): HowSection {
  const stats = atlas.stats;
  const lines: HowLine[] = SPLITS[atlas.catalogue].map((split) => ({
    text: splitMessage(split),
    item: true,
  }));
  const counts = [stats.cluster_train, stats.cluster_validation, stats.cluster_held_out];
  if (counts.every((count) => count !== undefined)) {
    lines.unshift({
      text: `Molecules are split by structure cluster before training. The model trained on ${counts[0]} molecules, used ${counts[1]} others only to decide when to stop, and never saw ${counts[2]}. A card carries one badge:`,
    });
  } else {
    lines.unshift({
      text: "Each molecule's predictions come from a model that left that molecule out. A card carries the badge:",
    });
  }
  lines.push({
    text: `For a molecule the model never trained on, the card gives the structure similarity of the nearest training molecule, and below ${LOW_STRUCTURE_SIMILARITY.toFixed(2)} says it is far from training data.`,
  });
  return { heading: "What the split badges mean", lines };
}

function viewClaims(atlas: Atlas): HowSection {
  const features = featuresFor(atlas.catalogue);
  const lines: HowLine[] = [
    {
      text: "Atlas and Browse place every catalogue molecule by its predicted smell. Families are groups of descriptors, not chemical classes.",
      item: true,
    },
    {
      text:
        atlas.catalogue === "leffingwell"
          ? "A card shows what the source measured and what the model predicts, side by side. The source records no concentration or solvent, so neither does the card."
          : "A card shows what the source measured and what the model predicts, side by side.",
      item: true,
    },
    {
      text: "Synesthesia turns predicted families into sound through an authored mapping. It is a way to hear the predictions, not a measurement of how a smell sounds.",
      item: true,
    },
  ];
  if (features.game) {
    lines.push({
      text: "The daily game scores your three picks against measured descriptors only. Its optional clue uses measured data, never the model.",
      item: true,
    });
  }
  if (features.decompiler) lines.push({ text: `The note decompiler: ${LIMITS_TEXT}`, item: true });
  return { heading: "What each view claims, and what it does not", lines };
}

/** The page's explanatory sections, in the order the page promises them. */
export function howSections(atlas: Atlas): HowSection[] {
  const features = featuresFor(atlas.catalogue);
  const neighbours = atlas.molecules[0]?.neighbours.length;
  const trust = atlas.stats["map.trustworthiness"];
  const trustK = atlas.stats["map.neighbour_count"];
  return [
    sources(atlas),
    {
      heading: "Measured and predicted",
      lines: [
        {
          text: "Measured descriptors are what the source records for a molecule. Predicted descriptors are the model's probability for each descriptor, with a whisker for how far the ensemble's members disagree. The two are never mixed.",
        },
      ],
    },
    splits(atlas),
    {
      heading: "From a structure to probabilities",
      lines: [
        {
          text: `The model is a message-passing neural network. It reads a molecule as a graph of atoms and bonds, passes information along the bonds, pools the atoms into one embedding, and turns that embedding into a probability for each of the ${atlas.labels.length} descriptors.`,
        },
        {
          text: `Your browser does not run the model. The bundle carries the predictions the released ${atlas.model.id} ensemble (${atlas.model.licence}) computed once.`,
        },
      ],
    },
    {
      heading: "Why the map is a projection",
      lines: [
        {
          text: `Each point sits where a t-SNE projection of the model's embeddings puts it. A projection keeps close neighbours close but bends long distances, so the map is for finding your way, not for measuring.${neighbours === undefined ? "" : ` The ${neighbours} odour neighbours on a card and the receiver's station memory are ranked by cosine similarity in the full embedding, never on the map, and not by human ratings.`}`,
        },
        ...(trust === undefined || trustK === undefined
          ? []
          : [
              {
                text: `How far to trust it: the map's trustworthiness at k = ${trustK} is ${trust.toFixed(3)}, where 1 means every molecule's ${trustK} nearest points on the map are among its nearest in the full embedding.`,
              },
            ]),
      ],
    },
    viewClaims(atlas),
    {
      heading: "What this frees, and its limits",
      lines: [
        {
          text: `No account, cookie or analytics. The page sends no request to any other site${features.game ? ", and game results stay in your browser" : ""}.`,
          item: true,
        },
        {
          text: `The whole bundle is a download, including atlas.csv for a spreadsheet. The data is ${atlas.dataLicence}; the code is MIT.`,
          item: true,
          link: {
            label: `Download all data (${atlas.dataLicence})`,
            href: releaseAssetUrl(atlas.version),
          },
        },
        {
          text: "Single molecules only: nothing here predicts a finished perfume or a mixture.",
          item: true,
        },
      ],
    },
    {
      heading: "Bend it",
      lines: [
        {
          text: "Phrases and notes: one line in config/phrases.yaml or config/notes.yaml.",
          item: true,
          link: { label: "config", href: `${REPO_URL}/tree/main/config` },
        },
        {
          text: "Sound presets: edit the mapping in Synesthesia and share its link.",
          item: true,
          link: { label: "Sound mapping", href: docsUrl("docs/sound-target.md") },
        },
        {
          text: "Models: score your own predictions on the same splits.",
          item: true,
          link: {
            label: "Submitting predictions",
            href: docsUrl("docs/submitting-predictions.md"),
          },
        },
        {
          text: "Code: the Python lookup API and the SoundTarget interface.",
          item: true,
          link: { label: "Lookup API", href: docsUrl("docs/extend.md") },
        },
      ],
    },
  ];
}

function line(content: HowLine): HTMLElement {
  const node = element(content.item === true ? "li" : "p", content.text);
  if (content.link !== undefined) node.append(" ", link(content.link.label, content.link.href));
  return node;
}

function statList(group: HowStatGroup): HTMLElement {
  const section = element("section");
  section.append(element("h3", group.heading));
  const list = element("dl");
  for (const stat of group.stats) {
    list.append(element("dt", stat.key), element("dd", stat.value, "mono"));
  }
  section.append(list);
  return section;
}

export function renderHow(container: HTMLElement, bundle: Bundle): void {
  const page = element("article", undefined, "how");
  page.append(element("h1", "How it works"));

  for (const section of howSections(bundle.atlas)) {
    page.append(element("h2", section.heading));
    let list: HTMLUListElement | null = null;
    for (const content of section.lines) {
      if (content.item === true) {
        if (list === null) {
          list = element("ul");
          page.append(list);
        }
        list.append(line(content));
      } else {
        list = null;
        page.append(line(content));
      }
    }
  }

  page.append(
    element("h2", "The measurements"),
    element(
      "p",
      "Every number below is read from the bundle this page loaded, which copies it from the evaluation results.",
    ),
  );
  for (const group of howStatGroups(bundle.atlas.stats)) page.append(statList(group));
  const report = element("p");
  report.append(link("Read the evaluation report", EVALUATION_URL));
  page.append(report);

  container.replaceChildren(page);
}

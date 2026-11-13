/**
 * Renders a molecule card. The structure image, measured and predicted descriptors, split and
 * neighbours are all shown as text so the card remains readable without colour or canvas.
 */

import type { Molecule } from "../data/validate";
import { element, link } from "../ui/dom";
import { moleculeHref } from "./link";
import {
  type CardModel,
  cardAnnouncement,
  moleculeIdentity,
  nearestTrainingLine,
  neighbourLabel,
} from "./model";
import { threadShares } from "./threads";

export interface CardOptions {
  readonly badge?: string | null;
  readonly badgeHref?: string | null;
  /** Where a neighbour leads; the atlas passes a flight when it can draw one. */
  readonly neighbourHref?: (id: string) => string;
}

function chip(descriptor: { label: string; colour: string | null }): HTMLLIElement {
  const item = element("li", undefined, "chip");
  const dot = element("span", undefined, "swatch");
  dot.setAttribute("aria-hidden", "true");
  if (descriptor.colour !== null) dot.style.backgroundColor = descriptor.colour;
  item.append(dot, element("span", descriptor.label));
  return item;
}

const SVG_NS = "http://www.w3.org/2000/svg";
// The drawing is 100 units wide. Tiles sit between these radii; a thread's length is its
// neighbour's share of that range, so the most alike molecule sits nearest the hub.
const HUB_RADIUS = 29;
const OUTER_RADIUS = 40;
const FIRST_SHARE = 0.4;

function svgElement(tag: string, attributes: Record<string, string>): SVGElement {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [name, value] of Object.entries(attributes)) node.setAttribute(name, value);
  return node;
}

/**
 * The molecule's structure at the hub and each neighbour's structure at the end of a thread,
 * drawn on a window of ground. Unlike shapes joined by a thread is the point: they smell alike.
 * Every thread is drawn the same way: only its length carries meaning. Names stay in the list beside it, so the
 * drawing is decoration for assistive technology.
 */
export function neighbourThreads(model: CardModel): HTMLElement {
  const neighbours = model.neighbours;
  const figure = element("figure", undefined, "threads");
  figure.setAttribute("aria-hidden", "true");
  const shares = threadShares(
    neighbours.map((neighbour) => Math.round(neighbour.odour * 100) / 100),
  );
  const svg = svgElement("svg", { viewBox: "0 0 100 100", focusable: "false" });
  figure.append(svg);

  const hub = element("div", undefined, "thread-hub");
  const hubImage = element("img");
  hubImage.src = model.structure;
  hubImage.alt = "";
  hub.append(hubImage);
  figure.append(hub);

  neighbours.forEach((neighbour, index) => {
    const angle = -Math.PI / 2 + (index * 2 * Math.PI) / neighbours.length;
    const radius =
      HUB_RADIUS +
      (((shares[index] ?? 1) - FIRST_SHARE) / (1 - FIRST_SHARE)) * (OUTER_RADIUS - HUB_RADIUS);
    const x = 50 + Math.cos(angle) * radius;
    const y = 50 + Math.sin(angle) * radius;
    const style = `--i: ${index}`;
    svg.append(
      svgElement("line", {
        class: "thread",
        x1: "50",
        y1: "50",
        x2: x.toFixed(2),
        y2: y.toFixed(2),
        pathLength: "100",
        style,
      }),
    );
    const tile = element("div", undefined, "thread-tile");
    tile.style.cssText = `--i: ${index}; left: ${x.toFixed(2)}%; top: ${y.toFixed(2)}%`;
    const image = element("img");
    image.src = neighbour.structureUrl;
    image.alt = "";
    image.loading = "lazy";
    tile.append(
      image,
      element("span", String(index + 1), "thread-number"),
      element("span", neighbour.odour.toFixed(2), "thread-score"),
    );
    figure.append(tile);
  });

  figure.append(
    element(
      "figcaption",
      `Numbers are cosine similarity to ${model.name} in the model's embedding. A shorter thread is a closer smell.`,
      "detail",
    ),
  );
  return figure;
}

export function renderCard(
  container: HTMLElement,
  model: CardModel,
  options: CardOptions = {},
): void {
  const article = element("article", undefined, "card");

  const header = element("header");
  const heading = element("h1", model.name);
  if (options.badge !== undefined && options.badge !== null) {
    const badge =
      options.badgeHref !== undefined && options.badgeHref !== null
        ? link(options.badge, options.badgeHref)
        : element("span", options.badge);
    badge.className = "badge";
    heading.append(" ", badge);
  }
  header.append(heading);
  const identity = element("p", undefined, "identity");
  const line = moleculeIdentity(model);
  const formulaAt = line.lastIndexOf(" · ") + 3;
  identity.append(line.slice(0, formulaAt));
  // Digits in a formula are subscripts: C12H22O reads as C₁₂H₂₂O.
  line
    .slice(formulaAt)
    .split(/(\d+)/)
    .forEach((part, at) => {
      identity.append(at % 2 === 1 ? element("sub", part) : part);
    });
  header.append(identity);

  const figure = element("figure");
  const image = element("img");
  image.src = model.structure;
  image.alt = `2D structure of ${model.name}`;
  image.loading = "lazy";
  image.width = 240;
  image.height = 180;
  figure.append(image);

  const measured = element("section");
  measured.append(element("h3", "Measured descriptors"));
  const measuredList = element("ul", undefined, "chips");
  for (const descriptor of model.measuredDescriptors) measuredList.append(chip(descriptor));
  measured.append(measuredList, element("p", model.source, "source"));
  if (model.conditions !== null) measured.append(element("p", model.conditions, "source"));

  const predicted = element("section");
  predicted.append(element("h3", "Predicted descriptors"));
  const predictedList = element("ol", undefined, "predictions");
  for (const descriptor of model.predicted) {
    const item = element("li");
    const bar = element("span", undefined, "bar");
    const fill = element("span", undefined, "bar-fill");
    fill.style.width = `${Math.round(descriptor.probability * 100)}%`;
    bar.append(fill);
    if (descriptor.spread > 0) {
      const whisker = element("span", undefined, "whisker");
      whisker.style.width = `${Math.round(descriptor.spread * 200)}%`;
      bar.append(whisker);
    }
    item.append(
      element("span", descriptor.label, "prediction-label"),
      bar,
      element("span", descriptor.probability.toFixed(3), "mono"),
    );
    item.append(descriptor.measured ? element("span", "measured", "badge") : element("span"));
    predictedList.append(item);
  }
  predicted.append(predictedList);
  if (model.predicted.some((descriptor) => descriptor.spread > 0)) {
    predicted.append(
      element(
        "p",
        "Thick bar: predicted probability. Thin line: how far the ensemble's members disagree.",
        "caption",
      ),
    );
  }

  const split = element("section", undefined, "split");
  split.append(element("h3", "Training split"), element("p", model.splitMessage, "badge"));
  const nearest = nearestTrainingLine(model.split, model.nearestTrainSimilarity);
  if (nearest !== null) split.append(element("p", nearest));

  const neighbours = element("section");
  neighbours.append(
    element("h3", "Odour neighbours"),
    element(
      "p",
      "Ranked by cosine similarity in the model's embedding, not by human ratings.",
      "detail",
    ),
  );
  if (model.neighbours.length > 0) neighbours.append(neighbourThreads(model));
  const neighbourList = element("ul", undefined, "neighbours");
  for (const neighbour of model.neighbours) {
    const item = element("li");
    const heading = link(neighbour.name, (options.neighbourHref ?? moleculeHref)(neighbour.id));
    item.append(heading, element("span", neighbourLabel(neighbour), "mono"));
    neighbourList.append(item);
  }
  neighbours.append(neighbourList);

  const actions = element("p", undefined, "actions");
  actions.append(link("Play in Synesthesia", `#/synesthesia?a=${encodeURIComponent(model.id)}`));

  const attribution = element("p", model.attribution, "attribution");

  const left = element("div", undefined, "card-left");
  left.append(figure, measured, predicted, split);
  const right = element("div", undefined, "card-right");
  right.append(neighbours);
  article.append(header, left, right, actions, attribution);
  article.dataset.ready = "true";
  container.replaceChildren(article);
}

export function announceMolecule(
  live: HTMLElement,
  molecule: Pick<Molecule, "name" | "measured">,
): void {
  live.setAttribute("aria-live", "polite");
  live.textContent = cardAnnouncement(molecule);
}

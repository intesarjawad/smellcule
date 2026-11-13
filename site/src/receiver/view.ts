/**
 * The home page is a world receiver. Every molecule with a measured family is a station on that
 * family's band; one needle sweeps the band, the station plate shows what the source measured,
 * and six gauges show what the model predicts, shaking by how far its ensemble disagrees.
 */

import { moleculeHref } from "../card/link";
import "./receiver.css";
import { cardModel } from "../card/model";
import { type Bundle, predictionRow, type Split, spreadRow } from "../data/bundle";
import {
  buildSearchIndex,
  explainMiss,
  type SearchIndex,
  search,
  searchSuggestions,
} from "../search/index";
import { searchHref } from "../search/query";
import { deriveMapping } from "../synesthesia/mapping";
import { mulberry32 } from "../synesthesia/sequencer";
import { voicingOf } from "../synesthesia/view";
import { createWebAudioTarget, type WebAudioTarget } from "../synesthesia/webaudio-target";
import { element, link } from "../ui/dom";
import {
  type Band,
  buildDial,
  type Dial,
  type Label,
  memoryOf,
  nearestStation,
  placeOf,
  stackLabels,
} from "./bands";
import type { EmberStage } from "./embers";
import {
  BROADCAST_MS,
  FLIGHT_SPAN,
  GUTTER_TOP,
  riverOf,
  type SignalWord,
  SLOT_WIDTH,
  seedOf,
  signalWords,
} from "./signal";

export interface ReceiverOptions {
  readonly announce: (text: string) => void;
  readonly headerSlot: HTMLElement | null;
  readonly tune: string | null;
  readonly webgl: boolean;
}

export interface Receiver {
  dispose(): void;
}

const SVG_NS = "http://www.w3.org/2000/svg";
const METERS = 6;
const READ_WORDS = 3;
const SCALE_LEFT = 110;
const SCALE_RIGHT_PAD = 44;
/** Below this dial width the scale is wider than the glass and slides under a fixed needle. */
const SLIDING_SCALE = 760;
const LANES = 3;
const LANE_TOP = 2;
const LANE_HEIGHT = 17;
const RULER_TOP = LANE_TOP + LANES * LANE_HEIGHT + 4;
const LABEL_GAP = 16;
/** Names step down toward the faint ink within twice this of the needle, so the tuned one stands alone. */
const NEAR_FADE = 80;
/** Width of the fade at each edge of a sliding scale, matching its mask. */
const EDGE_FADE = 24;
const PRINT_FONT = "Chivo, 'Helvetica Neue', Arial, sans-serif";
const NAME_MIN_PX = 30;
const SPRING = 70;
const DAMPING = 2 * Math.sqrt(SPRING);
const SETTLE_MS = 220;
const TUNING_SOUND_TAIL_MS = 1600;
const INTRO_FROM = 0.08;
const TRAIL = 5;
const TRAIL_STEP = 2;
const SIGNAL_FALLBACK = "#f0501e";
/** Ember arrivals spread over the second half of the flight; one click for each burst. */
const CLICKS = 22;
/** The station window has room for a few words; the card carries the full split wording. */
const SPLIT_SHORT: Readonly<Record<Split, string>> = {
  train: "seen in training",
  validation: "validation, unseen",
  held_out: "held out, never seen",
  cross_validated: "cross-validated",
};

function svg<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attributes: Record<string, string | number>,
  text?: string,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [name, value] of Object.entries(attributes)) node.setAttribute(name, String(value));
  if (text !== undefined) node.textContent = text;
  return node;
}

function formatCount(value: number): string {
  return value.toLocaleString("en");
}

/** Chemical formula with its counts lowered, built as nodes. */
function formulaNode(formula: string): HTMLElement {
  const node = element("span", undefined, "rx-formula");
  for (const part of formula.split(/(\d+)/)) {
    if (part.length === 0) continue;
    node.append(/^\d+$/.test(part) ? element("sub", part) : document.createTextNode(part));
  }
  return node;
}

/** Smooth noise in -1 to 1: two incommensurate sines, phase-shifted per meter. */
function tremor(seconds: number, phase: number): number {
  return 0.62 * Math.sin(seconds * 11.3 + phase) + 0.38 * Math.sin(seconds * 23.7 + phase * 2.3);
}

interface Meter {
  readonly figure: HTMLElement;
  readonly needle: SVGLineElement;
  readonly wedge: SVGPathElement;
  readonly label: HTMLElement;
  readonly value: HTMLElement;
  shown: number;
  velocity: number;
  target: number;
  spread: number;
  readonly phase: number;
}

const METER_CX = 88;
const METER_CY = 92;
const METER_R = 72;

function meterPoint(value: number, radius: number): [number, number] {
  const angle = Math.PI * (1 - value);
  return [METER_CX + radius * Math.cos(angle), METER_CY - radius * Math.sin(angle)];
}

function buildMeter(index: number): Meter {
  const figure = element("figure", undefined, "rx-meter");
  const face = svg("svg", {
    viewBox: "0 6 176 100",
    "aria-hidden": "true",
    focusable: "false",
  });
  const [ax, ay] = meterPoint(0, METER_R);
  const [bx, by] = meterPoint(1, METER_R);
  face.append(
    svg("path", { d: `M${ax} ${ay}A${METER_R} ${METER_R} 0 0 1 ${bx} ${by}`, class: "rx-arc" }),
  );
  for (let tick = 0; tick <= 20; tick += 1) {
    const major = tick % 10 === 0;
    const [x1, y1] = meterPoint(tick / 20, METER_R);
    const [x2, y2] = meterPoint(tick / 20, METER_R - (major ? 10 : tick % 2 === 0 ? 6 : 4));
    face.append(svg("line", { x1, y1, x2, y2, class: major ? "rx-tick major" : "rx-tick" }));
  }
  for (const [text, at] of [
    ["0", 0],
    [".5", 0.5],
    ["1", 1],
  ] as const) {
    const [x, y] = meterPoint(at, METER_R - 21);
    face.append(svg("text", { x, y: y + 3, class: "rx-scale-figure" }, text));
  }
  const wedge = svg("path", { class: "rx-wedge", d: "" });
  const needle = svg("line", {
    x1: METER_CX,
    y1: METER_CY,
    x2: METER_CX - (METER_R - 4),
    y2: METER_CY,
    class: "rx-meter-needle",
  });
  face.append(
    wedge,
    needle,
    svg("circle", { cx: METER_CX, cy: METER_CY, r: 3.5, class: "rx-pivot" }),
  );
  const caption = element("figcaption");
  const label = element("span", undefined, "rx-meter-label");
  const value = element("span", undefined, "rx-meter-value");
  caption.append(label, value);
  figure.append(caption, face);
  return {
    figure,
    needle,
    wedge,
    label,
    value,
    shown: 0,
    velocity: 0,
    target: 0,
    spread: 0,
    phase: index * 1.7,
  };
}

function wedgePath(value: number, spread: number): string {
  const low = Math.max(0, value - spread);
  const high = Math.min(1, value + spread);
  const radius = METER_R - 2;
  const [lx, ly] = meterPoint(low, radius);
  const [hx, hy] = meterPoint(high, radius);
  return `M${METER_CX} ${METER_CY}L${lx.toFixed(2)} ${ly.toFixed(2)}A${radius} ${radius} 0 0 1 ${hx.toFixed(2)} ${hy.toFixed(2)}Z`;
}

/** A measurer for printed scale labels, so collision checks use the real glyph widths. */
function labelWidths(): (text: string, weight: number) => number {
  const context = document.createElement("canvas").getContext("2d");
  const cache = new Map<string, number>();
  const size = Number.parseFloat(
    getComputedStyle(document.documentElement).getPropertyValue("--text-micro"),
  );
  const px = (Number.isFinite(size) ? size : 0.6875) * 16;
  return (text, weight) => {
    const key = `${weight}:${text}`;
    let width = cache.get(key);
    if (width === undefined) {
      if (context === null) width = text.length * px * 0.56;
      else {
        context.font = `${weight} ${weight > 500 ? px * 1.1 : px}px ${PRINT_FONT}`;
        width = context.measureText(text).width;
      }
      cache.set(key, width);
    }
    return width;
  };
}

export function mountReceiver(
  host: HTMLElement,
  bundle: Bundle,
  options: ReceiverOptions,
): Receiver {
  const dial: Dial = buildDial(bundle.atlas, bundle.positions);
  const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
  const familyColour = new Map<string, string>();
  for (const family of bundle.atlas.families) {
    for (const label of family.labels)
      if (!familyColour.has(label)) familyColour.set(label, family.colour);
  }
  const moleculeIndex = new Map(
    bundle.atlas.molecules.map((molecule, index) => [molecule.id, index]),
  );
  const casOf = (id: string) => bundle.atlas.molecules[moleculeIndex.get(id) ?? -1]?.cas ?? null;
  let index: SearchIndex | null = null;
  const searchIndex = () => {
    index ??= buildSearchIndex(bundle);
    return index;
  };
  let widthOf = labelWidths();

  const stationCount = dial.bands.reduce((sum, band) => sum + band.stations.length, 0);

  const root = element("section", undefined, "receiver");
  root.setAttribute("aria-labelledby", "rx-title");
  const title = element("h1", "Smellcule, an odour receiver", "visually-hidden");
  title.id = "rx-title";
  const lede = element(
    "p",
    `${formatCount(stationCount)} molecules on ${dial.bands.length} bands, one band per odour family. Type a smell and the needle finds the molecule behind it.`,
    "rx-lede",
  );

  const tuneForm = element("form", undefined, "rx-tune");
  tuneForm.setAttribute("role", "search");
  const tuneLabel = element("label", "Tune to");
  tuneLabel.htmlFor = "rx-query";
  const tuneInput = element("input");
  tuneInput.id = "rx-query";
  tuneInput.type = "search";
  tuneInput.autocomplete = "off";
  tuneInput.placeholder = "smell or molecule";
  tuneInput.enterKeyHint = "go";
  tuneInput.setAttribute("aria-describedby", "rx-tune-status");
  const tuneButton = element("button", "Tune");
  tuneButton.type = "submit";
  // The window and its key sit flush in one recessed channel, like the band keys.
  const tuneUnit = element("div", undefined, "rx-tune-unit");
  tuneUnit.append(tuneInput, tuneButton);
  tuneForm.append(tuneLabel, tuneUnit);
  const tuneStatus = element("p", undefined, "rx-tune-status");
  tuneStatus.id = "rx-tune-status";
  tuneStatus.setAttribute("aria-live", "polite");
  // The suggestions are preset keys, numbered the way a receiver's memory buttons are.
  const memories = element("div", undefined, "rx-memories");
  memories.setAttribute("role", "group");
  memories.setAttribute("aria-labelledby", "rx-presets");
  const presetsLabel = element("span", "Presets", "rx-engrave");
  presetsLabel.id = "rx-presets";
  const presetKeys = element("div", undefined, "rx-preset-keys");
  for (const suggestion of searchSuggestions(bundle.phrases, bundle.atlas.catalogue)) {
    const button = element("button", suggestion);
    button.type = "button";
    button.addEventListener("click", () => {
      tuneInput.value = suggestion;
      tuneByQuery(suggestion);
    });
    presetKeys.append(button);
  }
  memories.append(presetsLabel, presetKeys);
  const tuneBlock = element("div", undefined, "rx-tune-block");
  tuneBlock.append(tuneForm, memories, tuneStatus);

  const face = element("div", undefined, "rx-face");

  const glass = element("div", undefined, "rx-glass");
  glass.tabIndex = 0;
  glass.setAttribute("role", "slider");
  glass.setAttribute("aria-valuemin", "1");
  const dialArea = element("div", undefined, "rx-dial");
  const scaleHead = element("p", undefined, "rx-scale-head");
  scaleHead.setAttribute("aria-hidden", "true");
  const readout = element("div", undefined, "rx-readout");
  readout.setAttribute("aria-hidden", "true");
  const readName = element("p", undefined, "rx-read-name");
  const readWords = element("p", undefined, "rx-read-words");
  readout.append(readName, readWords);
  const scaleBox = element("div", undefined, "rx-scale-box");
  const needle = element("div", undefined, "rx-needle");
  needle.setAttribute("aria-hidden", "true");
  // Ghost needles that lag behind a moving needle, the way a fast sweep smears on glass.
  const trail = Array.from({ length: TRAIL }, () => {
    const ghost = element("div", undefined, "rx-trail");
    ghost.setAttribute("aria-hidden", "true");
    return ghost;
  });
  const sweep: number[] = [];
  const scale = svg("svg", { class: "rx-scale", "aria-hidden": "true", focusable: "false" });
  const fixedLayer = svg("g", {});
  const activeLayer = svg("g", { class: "rx-names" });
  scale.append(fixedLayer, activeLayer);
  // The needle runs under the printed scale, so every label cuts it instead of the other way.
  scaleBox.append(...trail, needle, scale);
  const rowKey = element("div", undefined, "rx-row-key");
  rowKey.setAttribute("aria-hidden", "true");
  dialArea.append(scaleHead, readout, scaleBox, rowKey);

  const knobs = element("div", undefined, "rx-knobs");
  knobs.setAttribute("aria-hidden", "true");
  const knob = element("div", undefined, "rx-knob");
  knob.append(element("i"));
  const lamp = element("p", undefined, "rx-lamp");
  lamp.append(element("i"), element("span", "On air"));
  knobs.append(knob, element("p", "Tuning", "rx-engrave"), lamp);
  glass.append(dialArea, knobs);

  const grilleBox = element("div", undefined, "rx-grille-box");
  const grille = element("button", undefined, "rx-grille");
  grille.type = "button";
  grille.setAttribute("aria-pressed", "false");
  grille.setAttribute("aria-label", "Listen to the station");
  const grilleLabel = element("p", "Listen", "rx-engrave");
  grilleLabel.setAttribute("aria-hidden", "true");
  grilleBox.append(grille, grilleLabel);

  const bandGroup = element("div", undefined, "rx-bands");
  bandGroup.setAttribute("role", "group");
  bandGroup.setAttribute("aria-label", "Band");
  const bandButtons = dial.bands.map((band, bandIndex) => {
    const key = element("button");
    key.type = "button";
    key.setAttribute("aria-pressed", "false");
    const swatch = element("i", undefined, "rx-key-swatch");
    swatch.style.setProperty("--family", band.colour);
    key.append(swatch, element("span", band.name));
    key.addEventListener("click", () => switchBand(bandIndex, true));
    bandGroup.append(key);
    return key;
  });
  // On a phone the keys scroll; the left edge fades only once there is something past it.
  bandGroup.addEventListener(
    "scroll",
    () => bandGroup.classList.toggle("scrolled", bandGroup.scrollLeft > 0),
    { passive: true },
  );

  const meterPanel = element("section", undefined, "rx-gauges");
  meterPanel.setAttribute("aria-labelledby", "rx-meter-head");
  const meterHead = element("h2", "Predicted", "rx-label");
  meterHead.id = "rx-meter-head";
  const meterStrip = element("div", undefined, "rx-gauge-strip");
  const meters = Array.from({ length: METERS }, (_, k) => buildMeter(k));
  for (const meter of meters) meterStrip.append(meter.figure);
  const meterKey = element("p", "Also in the measured ratings", "rx-meter-key");
  meterKey.hidden = true;
  meterPanel.append(meterHead, meterStrip, meterKey);

  const station = element("section", undefined, "rx-station");
  station.setAttribute("aria-labelledby", "rx-station-name");
  const oled = element("div", undefined, "rx-oled");
  const structure = element("img");
  structure.alt = "";
  structure.width = 240;
  structure.height = 180;
  const oledFacts = element("div", undefined, "rx-oled-facts");
  oled.append(structure, oledFacts);
  const stationText = element("div", undefined, "rx-station-text");
  const stationHead = element("h2", "Station", "rx-label");
  const stationName = element("p", undefined, "rx-station-name");
  stationName.id = "rx-station-name";
  const isomerNote = element("p", undefined, "rx-isomers");
  const measuredHead = element("h3", undefined, "rx-label");
  const measuredList = element("ul", undefined, "rx-engraved");
  const stationLinks = element("p", undefined, "rx-links");
  stationText.append(
    stationHead,
    stationName,
    isomerNote,
    measuredHead,
    measuredList,
    stationLinks,
  );
  station.append(oled, stationText);

  const memory = element("section", undefined, "rx-memory");
  memory.setAttribute("aria-labelledby", "rx-memory-head");
  const memoryHead = element("h2", "Station memory", "rx-label");
  memoryHead.id = "rx-memory-head";
  const memoryNote = element(
    "p",
    "The nearest stations, ranked by cosine similarity in the model's embedding, not by human ratings.",
    "rx-note",
  );
  const memoryList = element("ol", undefined, "rx-memory-list");
  memory.append(memoryHead, memoryNote, memoryList);

  // The cut in the bezel the embers run through on their way to the grille.
  const slot = element("div", undefined, "rx-slot");
  slot.setAttribute("aria-hidden", "true");
  face.append(glass, slot, grilleBox, bandGroup, meterPanel, station, memory);

  const foot = element(
    "p",
    `Gauge needles shake by the ensemble's spread. Order along a band follows the map projection, not a measurement. ${formatCount(dial.offDial)} molecules with no measured family sit off the dial; Browse lists every one. Ratings: ${bundle.atlas.attribution}.`,
    "rx-foot",
  );

  root.append(title, lede, face, foot);
  if (options.headerSlot !== null) options.headerSlot.replaceChildren(tuneBlock);
  else root.prepend(tuneBlock);
  host.replaceChildren(root);

  let band = 0;
  let at = INTRO_FROM;
  let velocity = 0;
  let target = INTRO_FROM;
  let tuned = -1;
  let settledId: string | null = null;
  let holding = false;
  let stillSince = 0;
  let frame = 0;
  let last = 0;
  let visible = true;
  let scaleWidth = 1;
  let boxWidth = 1;
  let offset = 0;
  let rowTop = RULER_TOP;
  let rowHeight = 1;
  /** How far above the bottom of the glass the gutter starts. */
  let gutterTop = GUTTER_TOP;
  let embers: EmberStage | null = null;
  let broadcasting: string | null = null;
  let disposed = false;

  const span = () => scaleWidth - SCALE_LEFT - SCALE_RIGHT_PAD;
  const xOf = (value: number) => SCALE_LEFT + value * span();
  const atOf = (x: number) => Math.min(1, Math.max(0, (x - SCALE_LEFT) / span()));
  const currentBand = (): Band => dial.bands[band] as Band;
  const rowY = (row: number) => rowTop + (row + 0.5) * rowHeight;

  /** Names on the tuned band, stacked over a few printed lines; the tuned one goes first. */
  function bandLabels() {
    const stations = currentBand().stations;
    const first = tuned >= 0 ? tuned : null;
    const labels: Label[] = stations.map((item, k) => ({
      x: xOf(item.at),
      width: widthOf(item.name, k === first ? 700 : 500),
      centred: k === first,
    }));
    const from = stations[first ?? 0]?.at ?? 0;
    const order = stations
      .map((item, k) => ({ k, gap: k === first ? -1 : Math.abs(item.at - from) }))
      .sort((a, b) => a.gap - b.gap)
      .map((item) => item.k)
      // Isomers share a name; print it once, at the one nearest the needle.
      .filter(
        (k, at, all) =>
          all.findIndex((other) => stations[other]?.name === stations[k]?.name) === at,
      );
    // A sliding scale shows only the window around the tuned station, and its edges fade over
    // 24 px; a name is printed only where it fits whole inside that window.
    const sliding = scaleWidth > boxWidth;
    const view = sliding
      ? Math.min(Math.max(xOf(from) - boxWidth / 2, 0), scaleWidth - boxWidth)
      : 0;
    const edge = sliding ? EDGE_FADE : 8;
    const right = view + Math.min(boxWidth, scaleWidth) - edge;
    return stackLabels(labels, order, LANES, LABEL_GAP, view + edge, right).map((placed) => ({
      ...placed,
      label: labels[placed.index] as Label,
      name: stations[placed.index]?.name ?? "",
    }));
  }

  function drawFixed(): void {
    const height = scaleBox.clientHeight;
    boxWidth = scaleBox.clientWidth;
    scaleWidth = Math.max(boxWidth, SLIDING_SCALE);
    scaleBox.classList.toggle("sliding", scaleWidth > boxWidth);
    scale.setAttribute("width", String(scaleWidth));
    scale.setAttribute("height", String(height));
    scale.setAttribute("viewBox", `0 0 ${scaleWidth} ${height}`);
    scaleBox.style.setProperty("--needle-top", `${RULER_TOP}px`);
    scaleBox.style.setProperty("--needle-bottom", `${gutterTop + 1}px`);
    rowTop = RULER_TOP + 14;
    // The last band stops above the gutter, so the river never runs across a strip.
    rowHeight = (height - rowTop - gutterTop - 2) / dial.bands.length;
    const nodes: SVGElement[] = [];

    // Graduations: a fine ruler under the printed names, longer every fifth and tenth mark.
    let ruler = "";
    for (let mark = 0; mark <= 100; mark += 1) {
      const length = mark % 10 === 0 ? 9 : mark % 5 === 0 ? 6 : 3;
      ruler += `M${xOf(mark / 100).toFixed(1)} ${RULER_TOP}v${length}`;
    }
    nodes.push(svg("path", { d: ruler, class: "rx-ruler" }));

    // Every band is a strip of ticks in its family's colour, one tick per station.
    dial.bands.forEach((item, row) => {
      const y = rowY(row);
      const active = row === band;
      const half = rowHeight * (active ? 0.42 : 0.26);
      const group = svg("g", { class: active ? "rx-row active" : "rx-row" });
      group.style.setProperty("--family", item.colour);
      const ticks = item.stations
        .map(
          (station) =>
            `M${xOf(station.at).toFixed(1)} ${(y - half).toFixed(1)}v${(2 * half).toFixed(1)}`,
        )
        .join("");
      group.append(svg("path", { d: ticks, class: "rx-strip" }));
      nodes.push(group);
    });
    fixedLayer.replaceChildren(...nodes);

    // Band names stay put while a phone's scale slides under them.
    rowKey.style.top = `${scaleBox.offsetTop + rowTop}px`;
    rowKey.style.gridAutoRows = `${rowHeight}px`;
    rowKey.replaceChildren(
      ...dial.bands.map((item, row) => {
        const line = element("p", undefined, row === band ? "active" : undefined);
        const dot = element("i");
        dot.style.setProperty("--family", item.colour);
        line.append(dot, element("span", item.name), element("span", String(item.stations.length)));
        return line;
      }),
    );
    scaleHead.textContent = `${currentBand().name} band, ${formatCount(currentBand().stations.length)} stations`;
    drawActive();
    place();
  }

  /** Names on the tuned band with leaders down to its strip; the ones beside the needle fade. */
  function drawActive(): void {
    const stripTop = rowY(band) - rowHeight * 0.42;
    const needleX = xOf(currentBand().stations[tuned]?.at ?? at);
    const nodes: SVGElement[] = [];
    for (const { index, lane, label, name } of bandLabels()) {
      const isTuned = index === tuned;
      const left = label.centred ? label.x - label.width / 2 : label.x;
      const baseline = LANE_TOP + (lane + 1) * LANE_HEIGHT - 4;
      const clearance = Math.min(Math.abs(left - needleX), Math.abs(left + label.width - needleX));
      // Graded by distance from the needle, from the faint ink to the dim ink, never lower.
      const over = left < needleX && left + label.width > needleX;
      const share = over ? 0 : Math.min(1, clearance / (2 * NEAR_FADE));
      const lead = svg("line", {
        x1: label.x,
        x2: label.x,
        y1: baseline + 3,
        y2: stripTop,
        class: "rx-lead",
      });
      const text = svg(
        "text",
        { x: left, y: baseline, class: isTuned ? "rx-print tuned" : "rx-print" },
        name,
      );
      if (!isTuned) {
        lead.style.opacity = String(0.4 + 0.6 * share);
        text.style.fill = `color-mix(in srgb, var(--glass-dim) ${Math.round(share * 100)}%, var(--glass-faint))`;
      }
      nodes.push(lead, text);
    }
    activeLayer.replaceChildren(...nodes);
  }

  function place(): void {
    const x = xOf(at);
    const sliding = scaleWidth > boxWidth;
    offset = sliding ? Math.min(Math.max(x - boxWidth / 2, 0), scaleWidth - boxWidth) : 0;
    scale.style.transform = `translateX(${-offset}px)`;
    needle.style.transform = `translateX(${x - offset}px)`;
    sweep.unshift(x - offset);
    sweep.length = Math.min(sweep.length, TRAIL * TRAIL_STEP + 1);
    trail.forEach((ghost, k) => {
      const past = sweep[(k + 1) * TRAIL_STEP] ?? x - offset;
      const gap = Math.abs(past - (x - offset));
      ghost.style.transform = `translateX(${past}px)`;
      ghost.style.opacity = gap > 1 ? String((0.34 / (k + 1)).toFixed(3)) : "0";
    });
    knob.style.transform = `rotate(${-135 + 270 * at}deg)`;
  }

  function wordsFor(id: string): SignalWord[] {
    const row = moleculeIndex.get(id) ?? 0;
    return signalWords(
      bundle.atlas.labels,
      predictionRow(bundle, row),
      spreadRow(bundle, row),
      familyColour,
      SIGNAL_FALLBACK,
    );
  }

  /** Sets the name as large as the glass allows, up to the readout token. */
  function fitReadout(): void {
    readName.style.fontSize = "";
    const room = readout.clientWidth;
    const full = readName.scrollWidth;
    if (room > 0 && full > room) {
      const size = Number.parseFloat(getComputedStyle(readName).fontSize);
      readName.style.fontSize = `${Math.max(NAME_MIN_PX, Math.floor((size * room * 0.97) / full))}px`;
    }
    const words = (readWords.dataset.words ?? "").split("\n").filter((word) => word.length > 0);
    for (let count = words.length; count > 0; count -= 1) {
      readWords.textContent = words.slice(0, count).join("    ");
      if (readWords.scrollWidth <= room) break;
    }
  }

  function showReadout(id: string): void {
    const molecule = bundle.atlas.molecules[moleculeIndex.get(id) ?? 0];
    if (molecule === undefined) return;
    readName.textContent = molecule.name;
    readWords.dataset.words = wordsFor(id)
      .slice(0, READ_WORDS)
      .map((word) => `${word.label} ${word.probability.toFixed(2)} ±${word.spread.toFixed(2)}`)
      .join("\n");
    fitReadout();
  }

  function fillStation(id: string): void {
    const model = cardModel(bundle, id);
    const bandItem = currentBand();
    structure.src = model.structure;
    oledFacts.replaceChildren(
      formulaNode(model.formula),
      element("span", model.cas === null ? "CAS not listed" : `CAS ${model.cas}`),
      element("span", `${bandItem.name} band`),
      element("span", SPLIT_SHORT[model.split]),
    );
    stationName.textContent = model.name;
    measuredHead.textContent = `Measured by ${bundle.atlas.catalogue === "keller" ? "Keller" : "Leffingwell"}`;
    measuredList.replaceChildren(
      ...(model.measured.length > 0
        ? model.measured.map((label) => element("li", label))
        : [element("li", "No descriptor measured", "none")]),
    );
    const stored = memoryOf(model.name, model.neighbours, casOf);
    isomerNote.textContent =
      stored.isomers.length === 0
        ? ""
        : `Shares its name with ${stored.isomers.length === 1 ? "another isomer" : `${stored.isomers.length} other isomers`}: CAS ${stored.isomers.join(", ")}.`;
    const card = link("Open the card", moleculeHref(id));
    const listen = link("Hear it in Synesthesia", `#/synesthesia?a=${encodeURIComponent(id)}`);
    stationLinks.replaceChildren(card, listen);

    const words = wordsFor(id);
    meters.forEach((meter, k) => {
      const word = words[k];
      meter.figure.hidden = word === undefined;
      if (word === undefined) return;
      meter.target = word.probability;
      meter.spread = word.spread;
      meter.label.textContent = word.label;
      meter.value.textContent = `${word.probability.toFixed(2)} ±${word.spread.toFixed(2)}`;
      meter.figure.classList.toggle("measured", model.measured.includes(word.label));
      meter.wedge.setAttribute("d", wedgePath(word.probability, word.spread));
    });
    meterKey.hidden = !meters.some(
      (meter) => !meter.figure.hidden && meter.figure.classList.contains("measured"),
    );

    memoryList.replaceChildren(
      ...stored.entries.map((entry, k) => {
        const item = element("li");
        const onDial = dial.bandOf.has(entry.id);
        const key = element("span", String(k + 1), "rx-memory-key");
        key.setAttribute("aria-hidden", "true");
        const name = element("span", entry.name, "rx-memory-name");
        const score = element("span", entry.odour.toFixed(2), "rx-memory-score");
        if (onDial) {
          const button = element("button");
          button.type = "button";
          button.append(key, name, score);
          button.addEventListener("click", () => tuneTo(entry.id, true));
          item.append(button);
        } else {
          const anchor = link("", moleculeHref(entry.id));
          anchor.append(key, name, score);
          item.append(anchor);
        }
        return item;
      }),
    );
  }

  function updateSlider(): void {
    const bandItem = currentBand();
    const item = bandItem.stations[tuned];
    glass.setAttribute("aria-label", `Tuning dial, ${bandItem.name} band`);
    glass.setAttribute("aria-valuemax", String(bandItem.stations.length));
    glass.setAttribute("aria-valuenow", String(tuned + 1));
    glass.setAttribute(
      "aria-valuetext",
      item === undefined
        ? "No station"
        : `${item.name}, station ${tuned + 1} of ${bandItem.stations.length}`,
    );
    bandButtons.forEach((button, k) => {
      button.setAttribute("aria-pressed", String(k === band));
    });
  }

  let audio: AudioContext | null = null;
  let voice: WebAudioTarget | null = null;
  let listening = false;
  let soundOn = false;
  let tailTimer: ReturnType<typeof setTimeout> | null = null;
  let clicks: AudioBufferSourceNode[] = [];

  function voiceFor(id: string) {
    const voicing = voicingOf(bundle, [id]);
    if (voicing === null || voice === null) return;
    voice.apply(deriveMapping(voicing.families, voicing.x), voicing.families, 120);
  }

  /** Only ever called from a press or a hand on the dial, which is what lets the audio start. */
  function sound(on: boolean): void {
    if (tailTimer !== null) clearTimeout(tailTimer);
    tailTimer = null;
    if (!on) {
      voice?.stop();
      soundOn = false;
      grille.classList.remove("playing");
      return;
    }
    if (typeof AudioContext === "undefined") return;
    if (audio === null) {
      audio = new AudioContext();
      voice = createWebAudioTarget(audio, { aId: "receiver", bId: "receiver" });
    }
    const id = currentBand().stations[tuned]?.id;
    if (id !== undefined) voiceFor(id);
    if (!soundOn) void voice?.start();
    soundOn = true;
    grille.classList.add("playing");
  }

  function tuningSound(): void {
    if (listening) return;
    sound(true);
  }

  function endTuningSound(): void {
    if (listening || !soundOn) return;
    if (tailTimer !== null) clearTimeout(tailTimer);
    tailTimer = setTimeout(() => sound(false), TUNING_SOUND_TAIL_MS);
  }

  function stopClicks(): void {
    for (const source of clicks) {
      try {
        source.stop();
      } catch {
        // Already finished.
      }
    }
    clicks = [];
  }

  /**
   * Soft ticks as the embers land in the grille. The context only exists once a press or a hand
   * on the dial has made it, so a page that was never touched stays silent.
   */
  function scheduleClicks(seed: number): void {
    if (audio === null || audio.state !== "running") return;
    stopClicks();
    const random = mulberry32(seed);
    const length = Math.round(audio.sampleRate * 0.006);
    const buffer = audio.createBuffer(1, length, audio.sampleRate);
    const data = buffer.getChannelData(0);
    for (let k = 0; k < length; k += 1) data[k] = (random() * 2 - 1) * (1 - k / length) ** 3;
    const start = audio.currentTime;
    for (let k = 0; k < CLICKS; k += 1) {
      const land = FLIGHT_SPAN + (1 - FLIGHT_SPAN) * ((random() + random()) / 2);
      const source = audio.createBufferSource();
      source.buffer = buffer;
      source.playbackRate.value = 0.7 + random() * 0.8;
      const gain = audio.createGain();
      gain.gain.value = 0.05 + random() * 0.09;
      source.connect(gain).connect(audio.destination);
      source.start(start + (land * BROADCAST_MS) / 1000);
      clicks.push(source);
    }
  }

  grille.addEventListener("click", () => {
    listening = !listening;
    grille.setAttribute("aria-pressed", String(listening));
    grilleLabel.textContent = listening ? "Listening" : "Listen";
    sound(listening);
  });

  function broadcast(id: string): void {
    // The dark only means something while the name is on screen; scrolled away, the lamp just lights.
    const shown = readout.getBoundingClientRect();
    const onScreen = shown.top >= 0 && shown.bottom <= window.innerHeight;
    if (embers === null || reduced || !onScreen) {
      lamp.classList.add("on");
      return;
    }
    showReadout(id);
    broadcasting = id;
    const words = wordsFor(id);
    // The gutter floor takes a faint tint of each lane's colour: middle, upper, lower.
    for (const [k, name] of ["--lane-mid", "--lane-up", "--lane-down"].entries())
      glass.style.setProperty(name, words[k]?.colour ?? "transparent");
    embers.broadcast({
      seed: seedOf(id),
      lines: [readName, readWords],
      readout,
      grille,
      glass,
      legend: rowKey,
      words,
    });
  }

  function onBroadcastStart(): void {
    readout.classList.add("sent");
    root.classList.add("burning");
    lamp.classList.remove("on");
    if (broadcasting !== null) scheduleClicks(seedOf(broadcasting));
  }

  function onBroadcastEnd(): void {
    root.classList.remove("burning");
    readout.classList.remove("sent");
    lamp.classList.add("on");
  }

  function onGathered(): void {
    broadcasting = null;
    readout.classList.remove("sent");
    const id = currentBand().stations[tuned]?.id;
    if (id !== undefined) showReadout(id);
  }

  function leaveStation(): void {
    if (settledId === null) return;
    settledId = null;
    root.classList.add("tuning");
    root.classList.remove("burning");
    lamp.classList.remove("on");
    for (const meter of meters) meter.target = 0;
    stopClicks();
    if (broadcasting !== null) {
      readout.classList.add("sent");
      embers?.gather();
    }
  }

  function settle(): void {
    const item = currentBand().stations[tuned];
    if (item === undefined || settledId === item.id) return;
    settledId = item.id;
    root.classList.remove("tuning");
    fillStation(item.id);
    updateSlider();
    broadcast(item.id);
    try {
      history.replaceState(null, "", `#/?tune=${encodeURIComponent(item.id)}`);
    } catch {
      // A sandboxed frame can refuse; the station still shows.
    }
    options.announce(`${item.name}, ${currentBand().name} band, on air`);
    endTuningSound();
  }

  function retune(): void {
    const next = nearestStation(currentBand(), at);
    if (next === tuned) return;
    tuned = next;
    const id = currentBand().stations[tuned]?.id;
    if (id === undefined) return;
    drawActive();
    updateSlider();
    if (broadcasting === null) showReadout(id);
    if (soundOn) voiceFor(id);
  }

  function step(now: number): void {
    frame = 0;
    if (disposed) return;
    const dt = Math.min(Math.max(now - last, 0) / 1000, 0.05);
    last = now;
    if (!reduced) {
      const force = SPRING * (target - at) - DAMPING * velocity;
      velocity += force * dt;
      at += velocity * dt;
      if (Math.abs(target - at) < 0.0004 && Math.abs(velocity) < 0.002) {
        at = target;
        velocity = 0;
      }
    } else {
      at = target;
    }
    place();
    retune();
    const moving = at !== target || holding;
    if (moving) {
      stillSince = now;
      if (settledId !== null && currentBand().stations[tuned]?.id !== settledId) leaveStation();
    } else if (now - stillSince > SETTLE_MS) {
      settle();
    }
    const seconds = now / 1000;
    // While a broadcast pours, each needle rises with the share of embers already in the grille.
    const pour = embers?.landed() ?? 1;
    for (const meter of meters) {
      if (reduced) meter.shown = meter.target;
      else {
        const aim = meter.target * pour;
        const force = 90 * (aim - meter.shown) - 2 * Math.sqrt(90) * meter.velocity;
        meter.velocity += force * dt;
        meter.shown += meter.velocity * dt;
      }
      const shake =
        settledId !== null && !reduced ? tremor(seconds, meter.phase) * meter.spread : 0;
      const value = Math.min(1.02, Math.max(-0.02, meter.shown + shake));
      meter.needle.setAttribute(
        "transform",
        `rotate(${(value * 180).toFixed(2)} ${METER_CX} ${METER_CY})`,
      );
    }
    // Settled meters keep trembling; with reduced motion the loop sleeps once the station holds.
    if (!(reduced && !moving && settledId !== null)) schedule();
  }

  function schedule(): void {
    if (frame !== 0 || disposed || !visible) return;
    last = performance.now();
    frame = requestAnimationFrame(step);
  }

  function setTarget(value: number): void {
    target = Math.min(1, Math.max(0, value));
    schedule();
  }

  function switchBand(next: number, byHand: boolean): void {
    if (next === band || dial.bands[next] === undefined) return;
    leaveStation();
    band = next;
    tuned = nearestStation(currentBand(), at);
    drawFixed();
    updateSlider();
    const stationItem = currentBand().stations[tuned];
    if (stationItem !== undefined) setTarget(stationItem.at);
    if (byHand) tuningSound();
    stillSince = performance.now();
    schedule();
  }

  function tuneTo(id: string, byHand: boolean): void {
    const where = placeOf(dial, id);
    if (where === null) return;
    if (where.band !== band) {
      leaveStation();
      band = where.band;
      tuned = where.station;
      drawFixed();
    }
    leaveStation();
    if (byHand) tuningSound();
    setTarget(currentBand().stations[where.station]?.at ?? at);
    stillSince = performance.now();
  }

  function stepStation(delta: number): void {
    const stations = currentBand().stations;
    const next = Math.min(stations.length - 1, Math.max(0, tuned + delta));
    const item = stations[next];
    if (item === undefined) return;
    tuningSound();
    leaveStation();
    setTarget(item.at);
    stillSince = performance.now();
  }

  function tuneByQuery(query: string): void {
    const trimmed = query.trim();
    if (trimmed.length === 0) return;
    const hits = search(searchIndex(), trimmed);
    const hit = hits.find(
      (candidate) => candidate.moleculeId !== null && dial.bandOf.has(candidate.moleculeId),
    );
    const all = link("every match", searchHref(trimmed));
    if (hit?.moleculeId == null) {
      const miss = explainMiss(searchIndex(), trimmed);
      const nearest = miss.nearest.length > 0 ? ` Try ${miss.nearest.slice(0, 3).join(", ")}.` : "";
      tuneStatus.replaceChildren(`No station for “${trimmed}”.${nearest} `, all, ".");
      return;
    }
    const name = bundle.atlas.molecules[moleculeIndex.get(hit.moleculeId) ?? 0]?.name ?? hit.label;
    tuneStatus.replaceChildren(`“${trimmed}”: ${name}. See `, all, ".");
    tuneTo(hit.moleculeId, true);
  }

  tuneForm.addEventListener("submit", (event) => {
    event.preventDefault();
    tuneByQuery(tuneInput.value);
  });

  let dragFrom = 0;
  let dragAt = 0;
  scaleBox.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    scaleBox.setPointerCapture(event.pointerId);
    holding = true;
    tuningSound();
    leaveStation();
    const rect = scaleBox.getBoundingClientRect();
    dragFrom = event.clientX;
    dragAt = target;
    if (scaleWidth <= boxWidth) setTarget(atOf(event.clientX - rect.left + offset));
    schedule();
  });
  scaleBox.addEventListener("pointermove", (event) => {
    if (!holding) return;
    const rect = scaleBox.getBoundingClientRect();
    if (scaleWidth > boxWidth) setTarget(dragAt - (event.clientX - dragFrom) / span());
    else setTarget(atOf(event.clientX - rect.left + offset));
  });
  const letGo = () => {
    if (!holding) return;
    holding = false;
    const item = currentBand().stations[nearestStation(currentBand(), target)];
    if (item !== undefined) setTarget(item.at);
    stillSince = performance.now();
  };
  scaleBox.addEventListener("pointerup", letGo);
  scaleBox.addEventListener("pointercancel", letGo);

  let knobAngle = 0;
  knob.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    knob.setPointerCapture(event.pointerId);
    const rect = knob.getBoundingClientRect();
    knobAngle = Math.atan2(
      event.clientY - rect.top - rect.height / 2,
      event.clientX - rect.left - rect.width / 2,
    );
    holding = true;
    tuningSound();
    leaveStation();
    schedule();
  });
  knob.addEventListener("pointermove", (event) => {
    if (!holding) return;
    const rect = knob.getBoundingClientRect();
    const angle = Math.atan2(
      event.clientY - rect.top - rect.height / 2,
      event.clientX - rect.left - rect.width / 2,
    );
    let delta = angle - knobAngle;
    if (delta > Math.PI) delta -= 2 * Math.PI;
    if (delta < -Math.PI) delta += 2 * Math.PI;
    knobAngle = angle;
    setTarget(target + delta / (1.5 * Math.PI));
  });
  knob.addEventListener("pointerup", letGo);
  knob.addEventListener("pointercancel", letGo);

  glass.addEventListener("keydown", (event) => {
    const moves: Record<string, () => void> = {
      ArrowRight: () => stepStation(1),
      ArrowLeft: () => stepStation(-1),
      PageUp: () => stepStation(10),
      PageDown: () => stepStation(-10),
      Home: () => stepStation(-Number.MAX_SAFE_INTEGER / 2),
      End: () => stepStation(Number.MAX_SAFE_INTEGER / 2),
      ArrowUp: () => switchBand(Math.max(0, band - 1), true),
      ArrowDown: () => switchBand(Math.min(dial.bands.length - 1, band + 1), true),
    };
    const move = moves[event.key];
    if (move === undefined) return;
    event.preventDefault();
    move();
  });

  function placeSlot(): void {
    // Measured from inside the face's border, where its absolutely placed children start.
    const host = face.getBoundingClientRect();
    const box = (node: Element) => {
      const rect = node.getBoundingClientRect();
      return {
        x: rect.left - host.left - face.clientLeft,
        y: rect.top - host.top - face.clientTop,
        width: rect.width,
        height: rect.height,
      };
    };
    const glassRect = box(glass);
    const grilleRect = box(grille);
    const style = getComputedStyle(grille);
    const pitch = Number.parseFloat(style.getPropertyValue("--perf-pitch")) || 9;
    const hole = Number.parseFloat(style.getPropertyValue("--perf-hole")) || 2.4;
    const { slot: cut, y, down, bare } = riverOf(glassRect, grilleRect, pitch, hole);
    // One pixel longer on the glass side, so the port cuts through the glass's own edge.
    slot.style.transform = down
      ? `translate(${cut.x}px, ${cut.y - 1}px)`
      : `translate(${cut.x - 1}px, ${cut.y}px)`;
    slot.style.width = `${cut.width + (down ? 0 : 1)}px`;
    slot.style.height = `${cut.height + (down ? 1 : 0)}px`;
    slot.classList.toggle("down", down);
    gutterTop = glassRect.y + glassRect.height - (y - SLOT_WIDTH / 2);
    glass.style.setProperty("--gutter", `${SLOT_WIDTH}px`);
    glass.style.setProperty("--gutter-top", `${y - glassRect.y - 1 - SLOT_WIDTH / 2}px`);
    // The knob panel's divider stops two pixels above the gutter.
    glass.style.setProperty("--gutter-clear", `${gutterTop + 2}px`);
    grille.style.setProperty("--clear-x", `${bare.x}px`);
    grille.style.setProperty("--clear-y", `${bare.y}px`);
    grille.style.setProperty("--clear-width", `${bare.width}px`);
    grille.style.setProperty("--clear-height", `${bare.height}px`);
  }

  // The slot first: the bands stop above the gutter wherever it levels out.
  const resize = new ResizeObserver(() => {
    placeSlot();
    drawFixed();
    fitReadout();
  });
  resize.observe(scaleBox);
  resize.observe(face);
  const seen = new IntersectionObserver((entries) => {
    visible = entries.some((entry) => entry.isIntersecting);
    if (visible) schedule();
  });
  seen.observe(root);
  const onVisibility = () => {
    visible = !document.hidden;
    if (visible) schedule();
  };
  document.addEventListener("visibilitychange", onVisibility);
  // Label widths measured before the face loads are the fallback font's; measure again once it has.
  void document.fonts?.ready.then(() => {
    if (disposed) return;
    widthOf = labelWidths();
    drawFixed();
    fitReadout();
  });

  const start =
    (options.tune !== null && dial.bandOf.has(options.tune) ? options.tune : null) ??
    bundle.phrases.find((phrase) => phrase.name === "coffee shop" && phrase.exemplar !== null)
      ?.exemplar ??
    dial.bands[0]?.stations[0]?.id ??
    null;
  const startPlace = start === null ? null : placeOf(dial, start);
  if (startPlace !== null) {
    band = startPlace.band;
    tuned = startPlace.station;
  }
  drawFixed();
  updateSlider();
  const startAt = currentBand().stations[tuned]?.at ?? 0.5;
  if (reduced) {
    at = startAt;
    target = startAt;
  } else {
    at = Math.abs(startAt - INTRO_FROM) < 0.2 ? Math.min(1, startAt + 0.4) : INTRO_FROM;
    target = startAt;
    root.classList.add("tuning");
  }
  tuned = nearestStation(currentBand(), at);
  const firstId = currentBand().stations[tuned]?.id;
  if (firstId !== undefined) showReadout(firstId);
  if (startPlace !== null) {
    tuned = startPlace.station;
    fillStation(currentBand().stations[tuned]?.id ?? "");
    tuned = nearestStation(currentBand(), at);
  }
  drawActive();
  place();
  stillSince = performance.now();
  schedule();

  // The renderer waits for the first paint, so the faceplate reads before the GPU starts.
  if (options.webgl && !reduced) {
    requestAnimationFrame(() =>
      setTimeout(() => {
        void import("./embers")
          .then(({ mountEmbers }) => {
            if (disposed) return;
            embers = mountEmbers(root, { onBroadcastStart, onBroadcastEnd, onGathered });
            if (settledId !== null) broadcast(settledId);
          })
          .catch(() => {
            // Without the renderer the readout simply stays on the glass.
          });
      }, 0),
    );
  }

  return {
    dispose() {
      disposed = true;
      cancelAnimationFrame(frame);
      resize.disconnect();
      seen.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      if (tailTimer !== null) clearTimeout(tailTimer);
      stopClicks();
      voice?.dispose();
      void audio?.close();
      embers?.dispose();
      tuneBlock.remove();
    },
  };
}

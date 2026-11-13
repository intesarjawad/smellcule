/**
 * The atlas route with a WebGL renderer. Three draws one point cloud; picking, label placement
 * and camera movement live in their own pure modules. Selecting a point flies the camera in and
 * then opens the molecule card, while reduced motion holds the arrival still until the visitor opens the card.
 */

import { PerspectiveCamera, Scene, Spherical, Vector3, WebGLRenderer } from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { browseGroups, renderBrowse } from "../browse/view";
import { moleculeHref } from "../card/link";
import type { Bundle } from "../data/bundle";
import { structureUrl } from "../data/bundle";
import { breakableName, listedNames, plainName } from "../data/names";
import { navigate } from "../router";
import {
  buildSearchIndex,
  type SearchHit,
  type SearchIndex,
  searchSuggestions,
} from "../search/index";
import { stripIntent } from "../search/query";
import { deepLinkHit, hitHref, mountSearch } from "../search/view";
import { element, link } from "../ui/dom";
import { cameraNudge, nudgeOrbit } from "../ui/keyboard";
import { createArrivalGate, flightPlan } from "./arrival";
import { gridLayout, lengthShares, radialLayout } from "./arrival-layout";
import {
  bestApproach,
  type CameraFlight,
  type CameraPose,
  createCameraFlight,
  focusPose,
  type Vec3,
} from "./camera-flight";
import { placeLabels } from "./labels";
import { type PickingCamera, pickNearestPoint, pickRadiusWorld, screenRay } from "./picking";
import {
  type AtlasCloud,
  createFlightTrace,
  createHighlight,
  createPointCloud,
  type FlightTrace,
} from "./points";

const CAMERA_FOV_DEGREES = 50;
const CAMERA_NEAR = 0.1;
const CAMERA_FAR = 2000;
const CAMERA_START_DISTANCE = 260;
const FOCUS_MIN_DISTANCE = 8;
const FOCUS_MAX_DISTANCE = 60;
const MIN_ZOOM_DISTANCE = 20;
const MAX_ZOOM_DISTANCE = 600;
const MAX_PIXEL_RATIO = 2;
const PICK_RADIUS_PX = 12;
const CLICK_SLOP_PX = 5;
// How far the camera backs away from the map mid-flight, as a share of its distance.
const FLIGHT_LIFT = 0.35;
// Extra field of view at mid-flight: the map streams past faster than the camera moves.
const FLIGHT_FOV_KICK_DEGREES = 8;
const REVEAL_MS = 1100;
const RESULT_DIM = 0.75;
const WORD_LINE_SHARE = 0.45;
const TRACE_FROM = 0.45;
const TRACE_TO = 0.95;

export interface AtlasSceneOptions {
  readonly query: string | null;
  readonly highlighted: readonly string[];
  /** A molecule to fly to as soon as the map is drawn, as a neighbour link asks. */
  readonly fly: string | null;
  readonly announce: (text: string) => void;
}

interface Arrival {
  readonly href: string;
  readonly replace: boolean;
  /** The word that started the flight, shown on the thread while the camera travels. */
  readonly word?: string | null;
}

export interface AtlasScene {
  dispose(): void;
}

function pointAt(positions: Float32Array, index: number): Vec3 {
  return {
    x: positions[index * 3] ?? 0,
    y: positions[index * 3 + 1] ?? 0,
    z: positions[index * 3 + 2] ?? 0,
  };
}

function cameraModel(camera: PerspectiveCamera, target: Vec3): PickingCamera {
  return {
    position: { x: camera.position.x, y: camera.position.y, z: camera.position.z },
    target,
    up: { x: camera.up.x, y: camera.up.y, z: camera.up.z },
    verticalFovRadians: (camera.fov * Math.PI) / 180,
    aspect: camera.aspect,
  };
}

// Flights so far in this tab; only the first is the long one.
let flightsFlown = 0;

function themeColour(): string {
  return getComputedStyle(document.documentElement).getPropertyValue("--glass-ink").trim();
}

function prefersReducedMotion(): boolean {
  return (
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

function renderPage(
  container: HTMLElement,
  bundle: Bundle,
  index: SearchIndex,
  options: AtlasSceneOptions,
  onOpen: (id: string, hit: SearchHit) => void,
  onResults: (hits: readonly SearchHit[]) => void,
  instructionsId: string,
): HTMLElement {
  const page = element("section", undefined, "atlas-scene");
  const frame = element("div", undefined, "atlas-frame");
  const search = element("div", undefined, "atlas-search");
  const stage = element("div", undefined, "atlas-stage");
  frame.append(stage, search);
  page.append(element("h1", "Atlas", "visually-hidden"));
  page.append(frame);

  const instructions = element(
    "p",
    "Drag to turn the map, scroll to zoom. Select a point to open its card. On the focused map, arrow keys turn it and + and - zoom.",
    "atlas-instructions",
  );
  instructions.id = instructionsId;
  page.append(instructions);

  if (options.highlighted.length > 0) {
    const names = listedNames(bundle.atlas.molecules);
    const highlighted = element("p", "Highlighted by the decompiler: ");
    options.highlighted.forEach((id, index) => {
      if (index > 0) highlighted.append(", ");
      highlighted.append(link(names.get(id) ?? id, moleculeHref(id)));
    });
    page.append(highlighted);
  }

  const details = element("details", undefined, "atlas-list");
  details.append(element("summary", "List every molecule"));
  const families = element("div", undefined, "families");
  renderBrowse(families, browseGroups(bundle));
  details.append(families);
  page.append(details);

  container.replaceChildren(page);

  mountSearch(search, {
    index,
    suggestions: searchSuggestions(bundle.phrases, bundle.atlas.catalogue),
    initialQuery: options.query,
    placeholder: "smells like rain",
    onOpen,
    onResults,
  });

  return stage;
}

export function mountAtlasScene(
  container: HTMLElement,
  bundle: Bundle,
  options: AtlasSceneOptions,
): AtlasScene {
  let flight: CameraFlight | null = null;
  let frame: number | null = null;
  let flightStart = 0;
  let holdMs = 0;
  const gate = createArrivalGate<Arrival>(
    (arrival) => {
      stage.parentElement?.querySelector(".arrival-continue")?.remove();
      if (frame !== null) cancelAnimationFrame(frame);
      frame = null;
      flight = null;
      canvas.removeAttribute("aria-busy");
      camera.fov = CAMERA_FOV_DEGREES;
      camera.updateProjectionMatrix();
      navigate(arrival.href, { replace: arrival.replace });
    },
    {
      set: (callback, ms) => window.setTimeout(callback, ms),
      clear: (id) => window.clearTimeout(id),
    },
  );
  let trace: FlightTrace | null = null;
  let cloudRef: AtlasCloud | null = null;
  const baseDim = 0;
  const moleculeIndexById = new Map(
    bundle.atlas.molecules.map((molecule, at) => [molecule.id, at]),
  );

  const index = buildSearchIndex(bundle);
  const names = listedNames(bundle.atlas.molecules);
  // Search results fly like a picked point; `flyTo` is ready before any result can be opened.
  const onOpen = (id: string, hit: SearchHit): void => {
    const typed = document.querySelector<HTMLInputElement>("#atlas-search")?.value.trim() ?? "";
    flyTo(id, {
      href: hitHref(hit) ?? moleculeHref(id),
      replace: false,
      word: typed.length > 0 ? stripIntent(typed) : null,
    });
  };

  const instructionsId = "atlas-instructions";
  // Typing a word lights the molecules it finds and quiets the rest of the map.
  const onResults = (hits: readonly SearchHit[]): void => {
    const lit = hits.flatMap((hit) => {
      const at = hit.moleculeId === null ? undefined : moleculeIndexById.get(hit.moleculeId);
      return at === undefined ? [] : [at];
    });
    cloudRef?.boost(lit);
    cloudRef?.setDim(lit.length > 0 ? RESULT_DIM : baseDim);
    drawRef?.();
  };
  let drawRef: (() => void) | null = null;
  const stage = renderPage(container, bundle, index, options, onOpen, onResults, instructionsId);

  const scene = new Scene();
  const camera = new PerspectiveCamera(CAMERA_FOV_DEGREES, 1, CAMERA_NEAR, CAMERA_FAR);
  camera.position.set(0, 0, CAMERA_START_DISTANCE);
  camera.lookAt(0, 0, 0);

  const cloud = createPointCloud(bundle);
  cloudRef = cloud;
  cloud.setDim(baseDim);
  scene.add(cloud.points);
  const highlight =
    options.highlighted.length === 0
      ? null
      : createHighlight(bundle, options.highlighted, themeColour());
  if (highlight !== null) scene.add(highlight.points);

  const renderer = new WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO));
  const canvas = renderer.domElement;
  canvas.setAttribute("role", "img");
  canvas.setAttribute("aria-label", "Interactive 3D map of molecules");
  canvas.setAttribute("aria-describedby", instructionsId);
  canvas.tabIndex = 0;

  const labelBox = element("div", undefined, "atlas-label");
  labelBox.setAttribute("aria-hidden", "true");
  labelBox.hidden = true;

  stage.append(canvas, labelBox);

  // Everything drawn over the canvas during a flight: the word's line, then the arrival.
  const overlay = element("div", undefined, "flight-overlay");
  overlay.setAttribute("aria-hidden", "true");
  const overlaySvg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  overlay.append(overlaySvg);
  const wordLine = document.createElementNS("http://www.w3.org/2000/svg", "path");
  wordLine.setAttribute("class", "flight-path");
  wordLine.setAttribute("pathLength", "1");
  overlaySvg.append(wordLine);
  const wordLabel = element("span", undefined, "flight-word");
  overlay.append(wordLabel);
  stage.parentElement?.append(overlay);
  const projected = new Vector3();
  let wordStart: { x: number; y: number } | null = null;
  let hubPoint: Vector3 | null = null;

  const toScreen = (point: Vector3): { x: number; y: number } => {
    projected.copy(point).project(camera);
    return {
      x: (projected.x * 0.5 + 0.5) * stage.clientWidth,
      y: (-projected.y * 0.5 + 0.5) * stage.clientHeight,
    };
  };

  const drawWordLine = (progress: number): void => {
    if (wordStart === null || hubPoint === null) return;
    const end = toScreen(hubPoint);
    wordLine.setAttribute("d", `M${wordStart.x} ${wordStart.y} L${end.x} ${end.y}`);
    const reach = Math.min(1, progress / WORD_LINE_SHARE);
    wordLine.style.strokeDashoffset = String(1 - reach);
  };

  let firstFrameMarked = false;
  const draw = (): void => {
    cloud.setFocus(camera.position.distanceTo(controls.target));
    renderer.render(scene, camera);
    if (!firstFrameMarked) {
      firstFrameMarked = true;
      performance.mark("atlas-first-frame");
    }
  };

  drawRef = draw;

  const resize = (): void => {
    const width = stage.clientWidth;
    const height = stage.clientHeight;
    if (width === 0 || height === 0) return;
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height, false);
    draw();
  };

  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = false;
  controls.minDistance = MIN_ZOOM_DISTANCE;
  controls.maxDistance = MAX_ZOOM_DISTANCE;
  controls.target.set(0, 0, 0);
  controls.addEventListener("change", draw);
  controls.update();

  resize();
  const observer = new ResizeObserver(resize);
  observer.observe(stage);

  // The map opens from its middle outward; reduced motion shows it whole.
  let revealFrame: number | null = null;
  if (!prefersReducedMotion()) {
    const revealStart = performance.now();
    cloud.setReveal(0);
    const reveal = (): void => {
      const t = Math.min(1, (performance.now() - revealStart) / REVEAL_MS);
      cloud.setReveal(1 - (1 - t) ** 3);
      draw();
      revealFrame = t < 1 ? requestAnimationFrame(reveal) : null;
    };
    revealFrame = requestAnimationFrame(reveal);
  }

  const hideLabel = (): void => {
    labelBox.hidden = true;
  };

  const currentPose = (): CameraPose => ({
    position: { x: camera.position.x, y: camera.position.y, z: camera.position.z },
    target: { x: controls.target.x, y: controls.target.y, z: controls.target.z },
  });

  const animate = (): void => {
    frame = null;
    const active = flight;
    if (active === null) return;
    const pose = active.pose();
    const progress = Math.min(1, (performance.now() - flightStart) / active.durationMs);
    controls.target.set(pose.target.x, pose.target.y, pose.target.z);
    camera.position.set(pose.position.x, pose.position.y, pose.position.z);
    // Backing away from the map mid-flight shows how far apart the two molecules sit.
    const lift = 1 + FLIGHT_LIFT * Math.sin(Math.PI * progress);
    camera.position.sub(controls.target).multiplyScalar(lift).add(controls.target);
    camera.lookAt(controls.target);
    trace?.setProgress((progress - TRACE_FROM) / (TRACE_TO - TRACE_FROM));
    cloud.setDim(baseDim + (1 - baseDim) * Math.min(1, Math.max(0, (progress - 0.05) / 0.5)));
    camera.fov = CAMERA_FOV_DEGREES + FLIGHT_FOV_KICK_DEGREES * Math.sin(Math.PI * progress);
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();
    drawWordLine(progress);
    draw();
    if (!active.done()) {
      frame = requestAnimationFrame(animate);
      return;
    }
    flight = null;
    canvas.removeAttribute("aria-busy");
    showArrival();
  };

  let arrivalMolecule = -1;
  let arrivalWord: string | null = null;

  const svgNode = (name: string, attributes: Record<string, string>): SVGElement => {
    const node = document.createElementNS("http://www.w3.org/2000/svg", name);
    for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, value);
    return node;
  };

  /** Puts a structure drawing in `into` as inline SVG, so its bonds can draw in one by one. */
  const drawStructure = async (url: string, into: HTMLElement): Promise<void> => {
    try {
      const response = await fetch(url);
      if (!response.ok) return;
      const parsed = new DOMParser().parseFromString(await response.text(), "image/svg+xml");
      const drawing = document.importNode(parsed.documentElement, true) as unknown as SVGElement;
      drawing.removeAttribute("width");
      drawing.removeAttribute("height");
      drawing.setAttribute("aria-hidden", "true");
      drawing.querySelector("title")?.remove();
      for (const bond of drawing.querySelectorAll<SVGPathElement>("path[class^='bond-']")) {
        const order = Number.parseInt(bond.getAttribute("class")?.split(/[ -]/)[1] ?? "0", 10);
        bond.style.setProperty("--b", String(order));
        // The files draw bonds at 1px for a small window; at this size they need weight.
        bond.style.strokeWidth = "2.2px";
        if (bond.style.fill === "none") {
          bond.setAttribute("pathLength", "1");
          bond.classList.add("is-stroked");
        }
      }
      into.replaceChildren(drawing);
    } catch {
      // The plain image already in place stays.
    }
  };

  /** The camera has landed: the structure at the hub, each neighbour's on its own thread. */
  const showArrival = (): void => {
    const current = trace;
    const subject = bundle.atlas.molecules[arrivalMolecule];
    if (current === null || subject === undefined) return;
    // The drawn frame replaces the 3D threads and the lit neighbour points.
    for (const object of current.objects) object.visible = false;
    cloud.boost([], sameFamily(arrivalMolecule));
    draw();
    const width = stage.clientWidth;
    const height = stage.clientHeight;
    const narrow = width < 640;
    const stageTop = stage.getBoundingClientRect().top;
    const headerHeight =
      document.querySelector(".site-header")?.getBoundingClientRect().height ?? 0;
    const top = Math.max(0, headerHeight - stageTop) + 16;
    const bottom = Math.min(height, window.innerHeight - stageTop) - 16;
    const hubName = breakableName(names.get(subject.id) ?? subject.name);
    const rank = subject.neighbours;
    // Scores are shown to two places, so ties are drawn as ties.
    const shares = lengthShares(rank.map((neighbour) => Math.round(neighbour.odour * 100) / 100));

    const frame = element("div", undefined, "arrival");
    frame.style.setProperty("--arrival-top", `${top}px`);
    const svg = svgNode("svg", { viewBox: `0 0 ${width} ${height}`, class: "arrival-threads" });
    frame.append(svg);

    const caption = element(
      "p",
      arrivalWord === null
        ? `${hubName} and the eight smells closest to it.`
        : `${arrivalWord} smells like ${hubName}, and these eight.`,
      "arrival-caption",
    );
    const key = element(
      "p",
      "Numbers are cosine similarity to " +
        `${plainName(names.get(subject.id) ?? subject.name)} in the model's embedding, not human ratings.`,
      "arrival-key",
    );
    frame.append(caption, key);

    const hubWidth = narrow ? 150 : 190;
    const cell = narrow ? { width: 86, height: 100 } : { width: 132, height: 128 };
    const centre = { x: width / 2, y: 0 };
    let hubRadius = hubWidth * 0.7;
    let slots: readonly { x: number; y: number; angle?: number; radius?: number }[];
    if (narrow) {
      const hubHeight = hubWidth * 0.75 + 44;
      const content = 64 + hubHeight + 28 + 2 * cell.height + 24 + 32;
      const start = top + Math.max(0, (bottom - top - content) / 2) + 56;
      centre.y = start + 40 + hubHeight / 2;
      hubRadius = hubHeight / 2;
      slots = gridLayout(
        rank.length,
        { left: 8, top: 0, width: width - 16, height },
        4,
        cell,
        centre.y + hubHeight / 2 + 28,
      );
    } else {
      const area = { left: 16, top, width: width - 32, height: bottom - top };
      centre.y = area.top + area.height / 2;
      slots = radialLayout(shares, centre, area, hubRadius, cell);
    }

    // Geosmin's own thread: the word comes down to the hub from straight above.
    const wordTop = narrow ? top + 70 : top + 8;
    const hubTop = centre.y - (narrow ? hubRadius : hubRadius * 0.8);
    const spine = svgNode("path", {
      d: `M${centre.x} ${wordTop + 22} L${centre.x} ${hubTop}`,
      class: "arrival-thread arrival-spine",
      pathLength: "1",
    });
    svg.append(spine);
    if (arrivalWord !== null) {
      const label = element("span", arrivalWord, "arrival-word");
      label.style.cssText = `left: ${centre.x}px; top: ${wordTop}px`;
      frame.append(label);
    }

    const hub = element("div", undefined, "arrival-hub");
    hub.style.cssText = `left: ${centre.x}px; top: ${centre.y}px; width: ${hubWidth}px`;
    const hubDrawing = element("div", undefined, "arrival-hub-structure");
    const hubImage = element("img");
    hubImage.src = structureUrl(bundle, subject.id);
    hubImage.alt = "";
    hubDrawing.append(hubImage);
    hub.append(hubDrawing, element("span", hubName, "arrival-hub-name"));
    frame.append(hub);
    void drawStructure(structureUrl(bundle, subject.id), hubDrawing);

    rank.forEach((neighbour, order) => {
      const slot = slots[order];
      if (slot === undefined) return;
      if (!narrow && slot.angle !== undefined && slot.radius !== undefined) {
        const direction = {
          x: Math.sin((slot.angle * Math.PI) / 180),
          y: -Math.cos((slot.angle * Math.PI) / 180),
        };
        const from = hubRadius;
        const to = slot.radius - cell.width * 0.4;
        svg.append(
          svgNode("path", {
            d: `M${centre.x + direction.x * from} ${centre.y + direction.y * from} L${centre.x + direction.x * to} ${centre.y + direction.y * to}`,
            class: "arrival-thread",
            pathLength: "1",
            style: `--i: ${order}`,
          }),
        );
      }
      const item = element("figure", undefined, "arrival-item");
      item.style.cssText = `left: ${slot.x}px; top: ${slot.y}px; width: ${cell.width}px; --i: ${order}`;
      const image = element("img");
      image.src = structureUrl(
        bundle,
        bundle.atlas.molecules[current.neighbourIndices[order] ?? 0]?.id ?? neighbour.id,
      );
      image.alt = "";
      item.append(
        image,
        element("figcaption", breakableName(names.get(neighbour.id) ?? neighbour.id)),
        element("span", neighbour.odour.toFixed(2), "arrival-score"),
      );
      frame.append(item);
    });

    overlay.append(frame);
    overlay.classList.add("is-arrived");
    if (prefersReducedMotion()) offerContinue();
    else gate.land(holdMs);
  };

  /** Reduced motion holds the arrival frame still until the visitor asks for the card. */
  const offerContinue = (): void => {
    const open = element("button", "Open the card", "arrival-continue");
    open.type = "button";
    open.addEventListener("click", () => gate.skip());
    // Outside the aria-hidden overlay, so assistive tech and the keyboard can reach it.
    overlay.after(open);
    open.focus();
  };

  // Lights the molecule's own odour family and leaves every other family dim.
  const sameFamily = (moleculeIndex: number): number[] => {
    const id = bundle.atlas.molecules[moleculeIndex]?.id;
    const group = browseGroups(bundle).find((entry) =>
      entry.molecules.some((molecule) => molecule.id === id),
    );
    const ids = new Set(group?.molecules.map((molecule) => molecule.id) ?? [id]);
    return bundle.atlas.molecules.flatMap((molecule, at) => (ids.has(molecule.id) ? [at] : []));
  };

  const flyTo = (id: string, arrival: Arrival): void => {
    if (gate.busy()) return;
    const moleculeIndex = bundle.atlas.molecules.findIndex((molecule) => molecule.id === id);
    if (moleculeIndex === -1) return;
    hideLabel();
    // On a narrow screen the stage is taller than the view: start from the top so the arrival frame fits.
    if (stage.clientWidth < 640) window.scrollTo(0, 0);
    const plan = flightPlan(flightsFlown);
    const centre = pointAt(bundle.positions, moleculeIndex);
    const around = (bundle.atlas.molecules[moleculeIndex]?.neighbours ?? []).flatMap(
      (neighbour) => {
        const at = bundle.atlas.molecules.findIndex((molecule) => molecule.id === neighbour.id);
        return at === -1 ? [] : [pointAt(bundle.positions, at)];
      },
    );
    const approach = bestApproach(
      centre,
      around,
      { x: camera.position.x, y: camera.position.y, z: camera.position.z },
      CAMERA_FOV_DEGREES,
      { min: FOCUS_MIN_DISTANCE, max: FOCUS_MAX_DISTANCE },
    );
    // Aim at the molecule itself so its plate sits mid-screen and the labels ring it evenly.
    const aim = centre;
    const approachFrom = {
      x: aim.x + approach.direction.x,
      y: aim.y + approach.direction.y,
      z: aim.z + approach.direction.z,
    };
    const cameraFlight = createCameraFlight({
      from: currentPose(),
      to: focusPose(approachFrom, aim, approach.distance),
      durationMs: plan.durationMs,
      reducedMotion: prefersReducedMotion(),
      now: () => performance.now(),
    });
    if (cameraFlight.durationMs === 0 && !prefersReducedMotion()) {
      navigate(arrival.href, { replace: arrival.replace });
      return;
    }
    controls.enabled = false;
    canvas.setAttribute("aria-busy", "true");
    options.announce(`Flying to ${names.get(id) ?? id}.`);
    flight = cameraFlight;
    flightsFlown += 1;
    holdMs = plan.holdMs;
    startedBy = window.event;
    gate.begin(arrival);
    flightStart = performance.now();
    trace?.dispose();
    trace = createFlightTrace(bundle, moleculeIndex, themeColour());
    scene.add(...trace.objects);
    cloud.boost(trace.neighbourIndices, sameFamily(moleculeIndex));
    arrivalMolecule = moleculeIndex;
    arrivalWord = arrival.word ?? null;
    hubPoint = new Vector3(centre.x, centre.y, centre.z);
    overlay.querySelector(".arrival")?.remove();
    overlay.classList.remove("is-arrived");
    stage.parentElement?.querySelector(".arrival-continue")?.remove();
    const typed = arrival.word ?? null;
    wordLabel.textContent = typed;
    const frameBox = stage.getBoundingClientRect();
    const inputBox = document
      .querySelector<HTMLInputElement>("#atlas-search")
      ?.getBoundingClientRect();
    const target = toScreen(hubPoint);
    wordStart =
      inputBox === undefined
        ? { x: frameBox.width / 2, y: frameBox.height }
        : {
            x: inputBox.left - frameBox.left + inputBox.width / 2,
            // Leave from the edge that faces the molecule, so the line never crosses the field.
            y:
              target.y < inputBox.top - frameBox.top + inputBox.height / 2
                ? inputBox.top - frameBox.top
                : inputBox.bottom - frameBox.top,
          };
    wordLabel.style.transform = `translate(${wordStart.x}px, ${wordStart.y}px)`;
    wordLabel.classList.toggle("is-above", target.y < wordStart.y);
    stage.parentElement?.classList.add("is-flying");
    frame = requestAnimationFrame(animate);
  };

  // Any key or press after a flight starts lands at once, except the event that started it.
  let startedBy: Event | undefined;
  const skipFlight = (event: Event): void => {
    if (gate.busy() && event !== startedBy && !prefersReducedMotion()) gate.skip();
  };
  window.addEventListener("keydown", skipFlight);
  window.addEventListener("pointerdown", skipFlight);

  const select = (pointIndex: number): void => {
    const molecule = bundle.atlas.molecules[pointIndex];
    if (molecule !== undefined)
      flyTo(molecule.id, { href: moleculeHref(molecule.id), replace: false });
  };

  const pickAt = (clientX: number, clientY: number): number | null => {
    const rect = canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return null;
    const model = cameraModel(camera, controls.target);
    const ray = screenRay(model, clientX - rect.left, clientY - rect.top, rect.width, rect.height);
    const radius = pickRadiusWorld(model, PICK_RADIUS_PX, rect.height);
    return pickNearestPoint(ray, bundle.positions, radius);
  };

  const showLabel = (event: PointerEvent, index: number | null): void => {
    if (index === null) {
      hideLabel();
      canvas.style.cursor = "grab";
      return;
    }
    const molecule = bundle.atlas.molecules[index];
    if (molecule === undefined) {
      hideLabel();
      return;
    }
    const name = names.get(molecule.id) ?? molecule.name;
    labelBox.textContent = name;
    labelBox.hidden = false;
    labelBox.style.visibility = "hidden";
    const rect = stage.getBoundingClientRect();
    const placed = placeLabels(
      [
        {
          id: molecule.id,
          text: name,
          x: event.clientX - rect.left,
          y: event.clientY - rect.top,
          width: labelBox.offsetWidth,
          height: labelBox.offsetHeight,
        },
      ],
      { width: rect.width, height: rect.height },
    )[0];
    if (placed === undefined) {
      hideLabel();
      return;
    }
    labelBox.style.left = `${placed.left}px`;
    labelBox.style.top = `${placed.top}px`;
    labelBox.style.visibility = "visible";
    canvas.style.cursor = "pointer";
  };

  let pressed: { readonly x: number; readonly y: number } | null = null;

  const onPointerMove = (event: PointerEvent): void => {
    if (flight !== null || event.buttons !== 0) {
      hideLabel();
      return;
    }
    showLabel(event, pickAt(event.clientX, event.clientY));
  };

  const onPointerLeave = (): void => {
    hideLabel();
    canvas.style.cursor = "grab";
  };

  const onPointerDown = (event: PointerEvent): void => {
    if (event.button !== 0) return;
    pressed = { x: event.clientX, y: event.clientY };
    canvas.style.cursor = "grabbing";
  };

  const onPointerUp = (event: PointerEvent): void => {
    const start = pressed;
    pressed = null;
    canvas.style.cursor = "grab";
    if (start === null) return;
    if (Math.hypot(event.clientX - start.x, event.clientY - start.y) > CLICK_SLOP_PX) return;
    const index = pickAt(event.clientX, event.clientY);
    if (index !== null) select(index);
  };

  const onPointerCancel = (): void => {
    pressed = null;
    canvas.style.cursor = "grab";
  };

  const linked = options.query === null ? undefined : deepLinkHit(index, options.query);
  if (linked?.moleculeId !== null && linked?.moleculeId !== undefined) {
    flyTo(linked.moleculeId, {
      href: hitHref(linked) ?? moleculeHref(linked.moleculeId),
      replace: true,
      word: options.query === null ? null : stripIntent(options.query),
    });
  }

  if (options.fly !== null) flyTo(options.fly, { href: moleculeHref(options.fly), replace: true });

  canvas.style.cursor = "grab";
  canvas.addEventListener("pointermove", onPointerMove);
  canvas.addEventListener("pointerleave", onPointerLeave);
  canvas.addEventListener("pointerdown", onPointerDown);
  canvas.addEventListener("pointerup", onPointerUp);
  canvas.addEventListener("pointercancel", onPointerCancel);

  const onKeyDown = (event: KeyboardEvent): void => {
    const nudge = cameraNudge(event.key);
    if (nudge === null || !controls.enabled) return;
    event.preventDefault();
    const offset = new Spherical().setFromVector3(camera.position.clone().sub(controls.target));
    const next = nudgeOrbit(offset, nudge, { min: MIN_ZOOM_DISTANCE, max: MAX_ZOOM_DISTANCE });
    offset.set(next.radius, next.phi, next.theta);
    camera.position.setFromSpherical(offset).add(controls.target);
    controls.update();
  };
  canvas.addEventListener("keydown", onKeyDown);

  return {
    dispose(): void {
      if (frame !== null) cancelAnimationFrame(frame);
      gate.cancel();
      if (revealFrame !== null) cancelAnimationFrame(revealFrame);
      overlay.parentElement?.querySelector(".arrival-continue")?.remove();
      overlay.remove();
      window.removeEventListener("keydown", skipFlight);
      window.removeEventListener("pointerdown", skipFlight);
      observer.disconnect();
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerleave", onPointerLeave);
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointerup", onPointerUp);
      canvas.removeEventListener("pointercancel", onPointerCancel);
      canvas.removeEventListener("keydown", onKeyDown);
      controls.dispose();
      cloud.dispose();
      highlight?.dispose();
      trace?.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      canvas.remove();
      labelBox.remove();
    },
  };
}

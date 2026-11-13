/**
 * The broadcast. When the needle settles, the name on the glass burns from left to right like
 * paper: crisp ahead of a 2 px white-hot line, grey ash behind it. The ash crumbles a pixel at a
 * time, each one leaving as an ember that drops plumb under its own letter into a gutter along the
 * bottom of the glass. There the top three descriptors keep a lane each, and the river runs through
 * a port in the bezel into the speaker grille, where each ember lights the hole it lands in. Once
 * the name is back the holes cool, the far ones first. Tuning away runs the same frames backwards: the
 * grille heats up again, the embers pour back out of it and the old name re-forms.
 *
 * Positions are pure functions of one progress value, which is what makes the reverse exact and
 * lets the loop sleep whenever nothing moves.
 */

import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Color,
  DataTexture,
  DoubleSide,
  LinearFilter,
  Mesh,
  NearestFilter,
  NormalBlending,
  OrthographicCamera,
  PlaneGeometry,
  Points,
  RedFormat,
  RGBAFormat,
  Scene,
  ShaderMaterial,
  Vector4,
  WebGLRenderer,
} from "three";
import { mulberry32 } from "../synesthesia/sequencer";
import {
  ASH_SPAN,
  BROADCAST_MS,
  DEPART_SPAN,
  departure,
  FLIGHT_SPAN,
  FRONT_LEAN,
  GATHER_MS,
  holeRow,
  NOISE_HEIGHT,
  NOISE_WIDTH,
  noiseField,
  pickWords,
  type Rect,
  riverOf,
  type SignalWord,
  SLOT_WIDTH,
} from "./signal";

export interface Broadcast {
  readonly seed: number;
  /** The readout lines, drawn onto the burn texture with their own computed fonts. */
  readonly lines: readonly HTMLElement[];
  readonly readout: HTMLElement;
  /** The glass the name burns on; embers stay inside it, the slot and the grille. */
  readonly glass: HTMLElement;
  readonly grille: HTMLElement;
  /** The band legend; embers pass behind it, so its names and counts stay legible. */
  readonly legend: HTMLElement;
  readonly words: readonly SignalWord[];
}

export interface EmberStage {
  broadcast(signal: Broadcast): void;
  gather(): void;
  /** Jumps to the end of whatever is running, for a hidden tab or a resize. */
  finish(): void;
  /** Share of the embers now in the grille; 1 when nothing is in flight. */
  landed(): number;
  dispose(): void;
}

export interface EmberCallbacks {
  /** The texture now carries the readout, so the DOM copy can hide without a visible swap. */
  onBroadcastStart(): void;
  onBroadcastEnd(): void;
  onGathered(): void;
}

/** Enough embers that every lit column of a letter sheds its own curtain. */
const MAX_EMBERS = 3000;
/** Core diameter runs from this to twice this, in CSS pixels. */
const EMBER_SIZE = 2;
const HALO_SCALE = 2.6;
/** Share of an ember's flight spent falling from its letter to the gutter. */
const FALL = 0.45;
/** Core diameter once an ember is in the river, small enough that the three lanes stay apart. */
const RIVER_SIZE = 2.4;
/** How many holes the plume lights, nearest the port first. */
const PLUME_HOLES = 72;
/** Share of a descriptor's embers that it takes to light its whole ring of the plume. */
const PLUME_FILL = 0.3;
/** How long the grille takes to cool once the name is back. */
const AFTERGLOW_MS = 1800;
/** Tuning away heats the grille back up over this share of the cooling time before the pour. */
const REHEAT = 0.15;
const INK = new Color("#ecebe6");
/** The three lanes in the gutter, 3 px wide with 2 px between: middle, upper, lower. */
const LANES = [0, -5, 5] as const;
/** Total sideways scatter inside a lane, in CSS pixels. */
const LANE_WANDER = 0.6;
/** What is left of the name on the glass while the river pours: a faint ash imprint. */
const IMPRINT = 0.08;

const TEXT_VERTEX = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const TEXT_FRAGMENT = /* glsl */ `
  uniform sampler2D uText;
  uniform sampler2D uNoise;
  uniform float uProgress;
  uniform float uPerPx;
  uniform vec2 uSize;
  uniform vec3 uInk;
  varying vec2 vUv;
  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
  }
  float soft(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
      mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x),
      f.y
    );
  }
  void main() {
    float coverage = texture2D(uText, vUv).a;
    float n = texture2D(uNoise, vUv).r;
    vec2 at = vUv * uSize;
    float leaves = ((1.0 - ${FRONT_LEAN.toFixed(2)}) * n + ${FRONT_LEAN.toFixed(2)} * vUv.x) * ${DEPART_SPAN.toFixed(2)};
    // Distance from the front in CSS pixels: ahead of it the letters are untouched.
    float px = (leaves - uProgress) / uPerPx;
    float lit = step(0.0005, uProgress);
    // Behind the front: an unbroken 2 px white-hot line, a few pixels of flame, then ash.
    float behind = -px;
    float white = (1.0 - smoothstep(1.0, 1.4, abs(behind - 1.0))) * lit;
    float flame = smoothstep(1.5, 2.5, behind) * (1.0 - smoothstep(3.5, 6.0, behind)) * lit;
    // Ash is one continuous grey, mottled softly, with a dark char rim where the letter ends.
    float mottle = 0.6 * soft(at / 6.0) + 0.4 * soft(at / 2.5);
    vec3 ash = vec3(0.42, 0.4, 0.37) * (0.78 + 0.4 * mottle);
    vec2 step1 = 1.5 / uSize;
    float core = min(
      min(texture2D(uText, vUv + vec2(step1.x, 0.0)).a, texture2D(uText, vUv - vec2(step1.x, 0.0)).a),
      min(texture2D(uText, vUv + vec2(0.0, step1.y)).a, texture2D(uText, vUv - vec2(0.0, step1.y)).a)
    );
    ash = mix(vec3(0.09, 0.075, 0.06), ash, smoothstep(0.15, 0.85, core));
    // The ash thins in soft patches as its embers leave, down to a faint grey imprint of the name.
    float since = uProgress - leaves;
    float hold = 0.03 + ${(ASH_SPAN - 0.03).toFixed(3)} * soft(at / 9.0 + 7.0);
    float gone = smoothstep(hold - 0.05, hold, since);
    ash = mix(ash, vec3(0.5, 0.48, 0.45), gone);
    // The hot line is yellow-white, so it reads against the pale ink ahead of it.
    vec3 colour = px > 0.0 ? uInk : mix(ash, vec3(0.95, 0.35, 0.05), flame);
    colour = mix(colour, vec3(1.0, 0.86, 0.5), white);
    float alpha = px > 0.0 ? 1.0 : mix(0.92, ${IMPRINT.toFixed(2)}, gone);
    gl_FragColor = vec4(colour, coverage * alpha);
  }
`;

/**
 * Keeps a fragment only inside the glass or the port, or inside one of the grille's holes, so
 * nothing smears over the metal between them. Embers pass behind the band legend, and the name's
 * embers behind the score line under it, so neither is scrambled while it is still to be read.
 */
const CLIP = /* glsl */ `
  uniform vec4 uClip[3];
  uniform vec4 uBehind[2];
  uniform float uFloor;
  varying float vFrom;
  uniform vec4 uBare;
  uniform vec2 uStride;
  uniform float uPitch;
  uniform float uHole;
  uniform float uRatio;
  uniform float uHeight;
  bool within(vec2 at, vec4 r) {
    return at.x >= r.x && at.x <= r.x + r.z && at.y >= r.y && at.y <= r.y + r.w;
  }
  bool clipped() {
    vec2 at = vec2(gl_FragCoord.x, uHeight * uRatio - gl_FragCoord.y) / uRatio;
    if (within(at, uBehind[0]) || (vFrom < uBehind[1].y && within(at, uBehind[1]))) return true;
    if (within(at, uClip[1])) return false;
    // Nothing spills past the gutter's floor into the strip of glass below it.
    if (within(at, uClip[0])) return at.y > uFloor;
    if (!within(at, uClip[2])) return true;
    vec2 local = at - uClip[2].xy;
    if (within(local, uBare)) return true;
    vec2 centre = floor((local - uPitch * 0.5) / uStride + 0.5) * uStride + uPitch * 0.5;
    return length(local - centre) > uHole + 0.5;
  }
`;

const EMBER_VERTEX = /* glsl */ `
  attribute vec2 aStart;
  attribute float aDrop;
  attribute float aLane;
  attribute vec2 aEnd;
  attribute vec3 aColour;
  attribute float aDepart;
  attribute float aSeed;
  attribute float aSpread;
  uniform float uProgress;
  uniform float uPixelRatio;
  uniform float uScale;
  uniform float uRiver;
  uniform vec2 uCorner;
  uniform vec2 uMouth;
  uniform vec2 uAcross;
  uniform vec2 uOut;
  varying vec3 vColour;
  varying float vAlpha;
  varying float vFrom;
  void main() {
    vFrom = aStart.y;
    float t = clamp((uProgress - aDepart) / ${FLIGHT_SPAN.toFixed(2)}, 0.0, 1.0);
    float live = step(0.0001, t) * (1.0 - step(0.9999, t));
    float lean = sign(uCorner.x - aDrop) * 5.0;
    vec2 d = vec2(aDrop + lean, uRiver + aLane);
    vec2 p;
    float river = 0.0;
    if (t < ${FALL.toFixed(2)}) {
      // Plumb under its letter, falling from rest like a dropped flake; it only leans towards the
      // port in the last stretch above the gutter.
      float f = t / ${FALL.toFixed(2)};
      float g = f * f;
      float bend = smoothstep(0.7, 1.0, g);
      p = vec2(aDrop + lean * bend * bend, mix(aStart.y, d.y, g));
    } else {
      // Along the gutter in its lane, round the corner, out through the port and into its hole.
      float r = (t - ${FALL.toFixed(2)}) / (1.0 - ${FALL.toFixed(2)});
      river = smoothstep(0.0, 0.12, r);
      vec2 c = uCorner + uAcross * aLane;
      vec2 m = uMouth + uAcross * aLane;
      float l1 = length(c - d);
      float l2 = length(m - c);
      float l3 = length(aEnd - m);
      float s = r * r * (3.0 - 2.0 * r) * (l1 + l2 + l3);
      if (s < l1) {
        p = mix(d, c, s / max(l1, 0.001));
      } else if (s < l1 + l2) {
        p = mix(c, m, (s - l1) / max(l2, 0.001));
      } else {
        float q = (s - l1 - l2) / max(l3, 0.001);
        vec2 k = m + uOut * min(12.0, l3 * 0.5);
        p = (1.0 - q) * (1.0 - q) * m + 2.0 * (1.0 - q) * q * k + q * q * aEnd;
      }
      p += uAcross * sin(r * 14.0 + aSeed * 40.0) * aSpread * sin(3.14159 * r);
    }
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 0.0, 1.0);
    // At one device pixel per CSS pixel a larger point is a visible square, so every core is 2 px.
    float size = uPixelRatio < 1.5
      ? ${EMBER_SIZE.toFixed(1)}
      : mix(${EMBER_SIZE.toFixed(1)} * (1.0 + aSeed), ${RIVER_SIZE.toFixed(1)}, river);
    gl_PointSize = size * uScale * uPixelRatio * live;
    vAlpha = live * smoothstep(0.0, 0.04, t) * (1.0 - smoothstep(0.9, 1.0, t));
    // A halo would smear the lanes together, so it fades once the ember is in the gutter.
    if (uScale > 1.5) vAlpha *= 1.0 - 0.85 * river;
    // White-hot as it leaves the letter, cooling through amber as it falls to its descriptor's
    // colour by the time it reaches the gutter.
    float heat = 1.0 - clamp(t / ${FALL.toFixed(2)}, 0.0, 1.0);
    vColour = mix(aColour, vec3(1.0, 0.6, 0.25), smoothstep(0.0, 0.55, heat));
    vColour = mix(vColour, vec3(1.0, 0.97, 0.9), smoothstep(0.45, 1.0, heat));
  }
`;

const CORE_FRAGMENT = /* glsl */ `
  ${CLIP}
  varying vec3 vColour;
  varying float vAlpha;
  void main() {
    if (clipped()) discard;
    float r = length(gl_PointCoord - 0.5) * 2.0;
    if (r > 1.0) discard;
    gl_FragColor = vec4(vColour, vAlpha);
  }
`;

/** The glow is added light, kept faint so it never washes a core's colour to white. */
const HALO_FRAGMENT = /* glsl */ `
  ${CLIP}
  varying vec3 vColour;
  varying float vAlpha;
  void main() {
    if (clipped()) discard;
    float r = length(gl_PointCoord - 0.5) * 2.0;
    if (r > 1.0) discard;
    float fall = (1.0 - r) * (1.0 - r);
    gl_FragColor = vec4(vColour, vAlpha * fall * 0.2);
  }
`;

/**
 * The grille's holes. Each ember lights the hole it lands in, white-hot for a moment and then its
 * descriptor's colour, so the lit holes are the river's own proportions. Once the name is back the
 * holes cool from the far edge of the plume back to the port, and the grille is dark again.
 */
const GLOW_FRAGMENT = /* glsl */ `
  uniform sampler2D uHoles;
  uniform vec2 uCells;
  uniform vec2 uSize;
  uniform vec2 uEntry;
  uniform float uReach;
  uniform float uPlume;
  uniform float uPitch;
  uniform vec2 uStride;
  uniform float uHole;
  uniform float uProgress;
  uniform float uAfter;
  varying vec2 vUv;
  void main() {
    vec2 local = vUv * uSize;
    vec2 cell = clamp(floor((local - uPitch * 0.5) / uStride + 0.5), vec2(0.0), uCells - 1.0);
    vec4 landing = texture2D(uHoles, (cell + 0.5) / uCells);
    float arrival = landing.a * 255.0 / 254.0;
    if (landing.a > 0.999 || uProgress < arrival) discard;
    vec2 centre = cell * uStride + uPitch * 0.5;
    float d = length(local - centre);
    // A lit hole glows a little past its edge, inside a dark rim, so it reads on bare metal.
    float disc = 1.0 - smoothstep(uHole, uHole + 0.7, d);
    float hole = 1.0 - smoothstep(uHole + 0.7, uHole + 1.6, d);
    float heat = 1.0 - smoothstep(0.0, 0.06, uProgress - arrival);
    float far = length(centre - uEntry);
    // Brightest at the port, dimming towards the plume's edge.
    vec3 colour = landing.rgb * (1.0 - 0.3 * clamp(far / uPlume, 0.0, 1.0));
    colour = mix(colour, vec3(1.0, 0.93, 0.8), 0.7 * heat);
    colour = mix(vec3(0.07, 0.07, 0.065), colour, disc);
    float turn = 0.8 * (1.0 - clamp(far / uReach, 0.0, 1.0));
    float cool = 1.0 - smoothstep(turn, turn + 0.2, uAfter);
    gl_FragColor = vec4(colour, hole * cool);
  }
`;

function relativeRect(element: Element, host: DOMRect): DOMRect {
  const rect = element.getBoundingClientRect();
  return new DOMRect(rect.left - host.left, rect.top - host.top, rect.width, rect.height);
}

const clipOf = (rect: Rect) => new Vector4(rect.x, rect.y, rect.width, rect.height);

/** Draws each line where the page draws it, with the font the page computed for it. */
function burnTexture(signal: Broadcast, area: DOMRect, ratio: number): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.ceil(area.width * ratio));
  canvas.height = Math.max(1, Math.ceil(area.height * ratio));
  const context = canvas.getContext("2d");
  if (context === null) return canvas;
  context.scale(ratio, ratio);
  context.fillStyle = "#fff";
  const origin = signal.readout.getBoundingClientRect();
  for (const line of signal.lines) {
    const style = getComputedStyle(line);
    const rect = line.getBoundingClientRect();
    context.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
    context.letterSpacing = style.letterSpacing === "normal" ? "0px" : style.letterSpacing;
    context.textBaseline = "alphabetic";
    const text = line.textContent ?? "";
    const metrics = context.measureText(text);
    const ascent = metrics.fontBoundingBoxAscent;
    const descent = metrics.fontBoundingBoxDescent;
    const baseline = rect.top - origin.top + (rect.height - (ascent + descent)) / 2 + ascent;
    context.fillText(text, rect.left - origin.left, baseline);
  }
  return canvas;
}

interface Flight {
  readonly mesh: Mesh<PlaneGeometry, ShaderMaterial>;
  readonly cores: Points<BufferGeometry, ShaderMaterial>;
  readonly halos: Points<BufferGeometry, ShaderMaterial>;
  readonly glow: Mesh<PlaneGeometry, ShaderMaterial>;
  readonly texture: CanvasTexture;
  readonly holes: DataTexture;
  /** When each ember lands, as dissolve progress, in order. */
  readonly arrivals: Float32Array;
}

/** Share of the values in a sorted array that are at most `value`. */
function shareBelow(sorted: Float32Array, value: number): number {
  let low = 0;
  let high = sorted.length;
  while (low < high) {
    const middle = (low + high) >> 1;
    if ((sorted[middle] ?? 0) <= value) low = middle + 1;
    else high = middle;
  }
  return sorted.length === 0 ? 1 : low / sorted.length;
}

export function mountEmbers(host: HTMLElement, callbacks: EmberCallbacks): EmberStage {
  const canvas = document.createElement("canvas");
  canvas.className = "rx-embers";
  canvas.setAttribute("aria-hidden", "true");
  host.append(canvas);

  const renderer = new WebGLRenderer({ canvas, alpha: true, antialias: false });
  renderer.setClearColor(0x000000, 0);
  const ratio = Math.min(window.devicePixelRatio || 1, window.innerWidth < 720 ? 1 : 2);
  renderer.setPixelRatio(ratio);
  const scene = new Scene();
  const camera = new OrthographicCamera(0, 1, 0, 1, -1, 1);

  const noiseTexture = new DataTexture(
    new Uint8Array(NOISE_WIDTH * NOISE_HEIGHT),
    NOISE_WIDTH,
    NOISE_HEIGHT,
    RedFormat,
  );
  noiseTexture.magFilter = LinearFilter;
  noiseTexture.minFilter = LinearFilter;

  let flight: Flight | null = null;
  let pending: Broadcast | null = null;
  let progress = 0;
  /** The grille's cooling after a broadcast ends, from 0 to 1. */
  let after = 0;
  let direction: 1 | -1 | 0 = 0;
  let frame = 0;
  let last = 0;
  let disposed = false;

  function size(): DOMRect {
    const rect = host.getBoundingClientRect();
    renderer.setSize(rect.width, rect.height, false);
    canvas.style.width = `${rect.width}px`;
    canvas.style.height = `${rect.height}px`;
    camera.right = rect.width;
    camera.bottom = rect.height;
    camera.updateProjectionMatrix();
    return rect;
  }

  function release(): void {
    if (flight === null) return;
    scene.remove(flight.mesh, flight.cores, flight.halos, flight.glow);
    flight.mesh.geometry.dispose();
    flight.mesh.material.dispose();
    flight.glow.geometry.dispose();
    flight.glow.material.dispose();
    flight.cores.geometry.dispose();
    flight.cores.material.dispose();
    flight.halos.material.dispose();
    flight.texture.dispose();
    flight.holes.dispose();
    flight = null;
  }

  function build(signal: Broadcast): void {
    release();
    const hostRect = size();
    // The front crosses the ink, not the empty glass beside it, so a short name burns as slowly as a long one.
    const box = relativeRect(signal.readout, hostRect);
    const inkRight = Math.max(
      ...signal.lines.map((line) => {
        const range = document.createRange();
        range.selectNodeContents(line);
        return range.getBoundingClientRect().right - hostRect.left;
      }),
    );
    const area = new DOMRect(
      box.x,
      box.y,
      Math.min(box.width, Math.max(inkRight - box.x + 6, 1)),
      box.height,
    );
    const glass = relativeRect(signal.glass, hostRect);
    const grille = relativeRect(signal.grille, hostRect);
    const style = getComputedStyle(signal.grille);
    const pitch = Number.parseFloat(style.getPropertyValue("--perf-pitch")) || 9;
    const hole = Number.parseFloat(style.getPropertyValue("--perf-hole")) || 2.4;
    const river = riverOf(glass, grille, pitch, hole);
    const field = noiseField(signal.seed);
    noiseTexture.image.data?.set(field);
    noiseTexture.needsUpdate = true;

    const textCanvas = burnTexture(signal, area, ratio);
    const texture = new CanvasTexture(textCanvas);
    texture.flipY = false;
    texture.minFilter = LinearFilter;
    texture.generateMipmaps = false;

    const mesh = new Mesh(
      new PlaneGeometry(area.width, area.height),
      new ShaderMaterial({
        uniforms: {
          uText: { value: texture },
          uNoise: { value: noiseTexture },
          uProgress: { value: 0 },
          uPerPx: { value: (FRONT_LEAN * DEPART_SPAN) / Math.max(area.width, 1) },
          uSize: { value: [area.width, area.height] },
          uInk: { value: INK },
        },
        vertexShader: TEXT_VERTEX,
        fragmentShader: TEXT_FRAGMENT,
        transparent: true,
        depthTest: false,
        side: DoubleSide,
      }),
    );
    mesh.position.set(area.x + area.width / 2, area.y + area.height / 2, 0);

    // Embers start on lit pixels of the burn texture, spread evenly over the letters.
    const pixels = textCanvas
      .getContext("2d")
      ?.getImageData(0, 0, textCanvas.width, textCanvas.height);
    const lit: number[] = [];
    if (pixels !== undefined) {
      for (let y = 0; y < pixels.height; y += 1) {
        for (let x = 0; x < pixels.width; x += 1) {
          if ((pixels.data[(y * pixels.width + x) * 4 + 3] ?? 0) > 160)
            lit.push(x / ratio, y / ratio);
        }
      }
    }
    const random = mulberry32(signal.seed ^ 0x9e3779b9);
    const total = lit.length / 2;
    const keep = Math.min(total, MAX_EMBERS);
    // Three lanes, so only the top three descriptors ride the river, in their proportions.
    const lead = signal.words.slice(0, LANES.length);
    const picks = pickWords(lead, keep, signal.seed);
    const start = new Float32Array(keep * 2);
    const drop = new Float32Array(keep);
    const lane = new Float32Array(keep);
    const end = new Float32Array(keep * 2);
    const colour = new Float32Array(keep * 3);
    const depart = new Float32Array(keep);
    const seed = new Float32Array(keep);
    const spreadPx = new Float32Array(keep);
    const [entryX, entryY] = river.entry;
    const [mouthX, mouthY] = river.mouth;
    const { down, bare } = river;
    // Holes are counted from the grille's corner; embers land only past the port's bare margin.
    const { count: columns, stride: strideX } = holeRow(grille.width, pitch);
    const { count: rows, stride: strideY } = holeRow(grille.height, pitch);
    const firstColumn = down ? 0 : Math.round((bare.x + bare.width - pitch) / strideX) + 1;
    const firstRow = down ? Math.round((bare.y + bare.height - pitch) / strideY) + 1 : 0;
    const centreOf = (cell: number) =>
      [
        grille.x + (cell % columns) * strideX + pitch / 2,
        grille.y + Math.floor(cell / columns) * strideY + pitch / 2,
      ] as const;
    const reachOf = (cell: number) => {
      const [x, y] = centreOf(cell);
      return Math.hypot(x - entryX, y - entryY);
    };
    const landing = new Uint8Array(columns * rows * 4).fill(255);
    const order: number[] = [];
    const cellOf = new Int32Array(keep);
    const swatch = new Color();
    for (let k = 0; k < keep; k += 1) {
      const source = Math.floor((k + random()) * (total / keep));
      const px = lit[source * 2] ?? 0;
      const py = lit[source * 2 + 1] ?? 0;
      const rank = picks[k] ?? 0;
      const word = lead[rank];
      start.set([area.x + px, area.y + py], k * 2);
      drop[k] = area.x + px + (random() - 0.5) * 1.5;
      // Its descriptor's lane; an unsure descriptor wanders a little inside it.
      lane[k] = (LANES[rank] ?? 0) + (random() - 0.5) * LANE_WANDER;
      spreadPx[k] = Math.min(0.6, 0.15 + (word?.spread ?? 0) * 3);
      swatch.set(word?.colour ?? "#f0501e");
      colour.set([swatch.r, swatch.g, swatch.b], k * 3);
      // The front reaches the pixel, then its ash holds for a while before the ember lets go.
      depart[k] =
        departure(field, px / area.width, py / area.height) + 0.02 + random() * (ASH_SPAN - 0.02);
      seed[k] = random();
      order.push(k);
    }
    // The plume is the holes nearest the port. Each descriptor takes a ring of it in proportion to
    // its share, the largest nearest the port. Its first embers light that ring from the inside
    // out, so the plume spreads ahead of the pour; the rest land in holes already lit.
    const plume: number[] = [];
    for (let row = firstRow; row < rows; row += 1)
      for (let column = firstColumn; column < columns; column += 1)
        plume.push(row * columns + column);
    const reaches = new Float32Array(columns * rows);
    for (const cell of plume) reaches[cell] = reachOf(cell);
    plume.sort((a, b) => (reaches[a] ?? 0) - (reaches[b] ?? 0));
    plume.length = Math.min(plume.length, PLUME_HOLES);
    const rings = [...order].sort(
      (a, b) => (picks[a] ?? 0) - (picks[b] ?? 0) || (depart[a] ?? 0) - (depart[b] ?? 0),
    );
    let first = 0;
    while (first < keep) {
      const rank = picks[rings[first] ?? 0];
      let last = first;
      while (last < keep && picks[rings[last] ?? 0] === rank) last += 1;
      const inner = Math.floor((first / keep) * plume.length);
      const size = Math.max(1, Math.floor((last / keep) * plume.length) - inner);
      const spread = Math.max(1, (last - first) * PLUME_FILL);
      for (let index = first; index < last; index += 1) {
        const step = index - first;
        const hole = step < spread ? Math.floor((step / spread) * size) : step % size;
        const cell = plume[Math.min(inner + hole, plume.length - 1)] ?? 0;
        const k = rings[index] ?? 0;
        cellOf[k] = cell;
        end.set(centreOf(cell), k * 2);
      }
      first = last;
    }
    // The first ember into a hole lights it, in its colour, at the moment it lands.
    order.sort((a, b) => (depart[a] ?? 0) - (depart[b] ?? 0));
    const arrivals = Float32Array.from(order, (k) => (depart[k] ?? 0) + FLIGHT_SPAN);
    for (const k of order) {
      const at = (cellOf[k] ?? 0) * 4;
      if (landing[at + 3] !== 255) continue;
      landing.set(
        [
          Math.round((colour[k * 3] ?? 0) * 255),
          Math.round((colour[k * 3 + 1] ?? 0) * 255),
          Math.round((colour[k * 3 + 2] ?? 0) * 255),
          Math.round(Math.min(1, (depart[k] ?? 0) + FLIGHT_SPAN) * 254),
        ],
        at,
      );
    }
    const holes = new DataTexture(landing, columns, rows, RGBAFormat);
    holes.magFilter = NearestFilter;
    holes.minFilter = NearestFilter;
    holes.needsUpdate = true;
    const geometry = new BufferGeometry();
    geometry.setAttribute("position", new BufferAttribute(new Float32Array(keep * 3), 3));
    geometry.setAttribute("aStart", new BufferAttribute(start, 2));
    geometry.setAttribute("aDrop", new BufferAttribute(drop, 1));
    geometry.setAttribute("aLane", new BufferAttribute(lane, 1));
    geometry.setAttribute("aEnd", new BufferAttribute(end, 2));
    geometry.setAttribute("aColour", new BufferAttribute(colour, 3));
    geometry.setAttribute("aDepart", new BufferAttribute(depart, 1));
    geometry.setAttribute("aSeed", new BufferAttribute(seed, 1));
    geometry.setAttribute("aSpread", new BufferAttribute(spreadPx, 1));

    // A dropped port is open from the gutter down, through the glass below the gutter's floor.
    const { slot } = river;
    const port = down ? { ...slot, y: river.y, height: slot.y + slot.height - river.y } : slot;
    const clip = [clipOf(glass), clipOf(port), clipOf(grille)];
    const scores = signal.lines.at(-1) ?? signal.readout;
    const behind = [
      clipOf(relativeRect(signal.legend, hostRect)),
      clipOf(relativeRect(scores, hostRect)),
    ];
    const emberMaterial = (scale: number, fragmentShader: string, additive: boolean) =>
      new ShaderMaterial({
        uniforms: {
          uProgress: { value: 0 },
          uPixelRatio: { value: ratio },
          uScale: { value: scale },
          uRiver: { value: river.y },
          uCorner: { value: down ? [mouthX, river.y] : [mouthX, mouthY] },
          uMouth: { value: river.mouth },
          uAcross: { value: down ? [1, 0] : [0, 1] },
          uOut: { value: down ? [0, 1] : [1, 0] },
          uClip: { value: clip },
          uBehind: { value: behind },
          uFloor: { value: river.y + SLOT_WIDTH / 2 },
          uBare: { value: clipOf(bare) },
          uStride: { value: [strideX, strideY] },
          uPitch: { value: pitch },
          uHole: { value: hole },
          uRatio: { value: ratio },
          uHeight: { value: hostRect.height },
        },
        vertexShader: EMBER_VERTEX,
        fragmentShader,
        transparent: true,
        blending: additive ? AdditiveBlending : NormalBlending,
        depthTest: false,
        depthWrite: false,
      });
    const halos = new Points(geometry, emberMaterial(HALO_SCALE, HALO_FRAGMENT, true));
    const cores = new Points(geometry, emberMaterial(1, CORE_FRAGMENT, false));
    halos.frustumCulled = false;
    // A halo at one device pixel smears the lanes into one band, so there the cores go alone.
    halos.visible = ratio > 1;
    cores.frustumCulled = false;

    const entry = [entryX - grille.x, entryY - grille.y];
    const reach = Math.max(
      ...[0, grille.width].flatMap((x) =>
        [0, grille.height].map((y) => Math.hypot(x - (entry[0] ?? 0), y - (entry[1] ?? 0))),
      ),
    );
    const glow = new Mesh(
      new PlaneGeometry(grille.width, grille.height),
      new ShaderMaterial({
        uniforms: {
          uHoles: { value: holes },
          uCells: { value: [columns, rows] },
          uSize: { value: [grille.width, grille.height] },
          uEntry: { value: entry },
          uReach: { value: reach },
          uPlume: { value: Math.max(reachOf(plume.at(-1) ?? 0), 1) },
          uPitch: { value: pitch },
          uStride: { value: [strideX, strideY] },
          uHole: { value: hole },
          uProgress: { value: 0 },
          uAfter: { value: 0 },
        },
        vertexShader: TEXT_VERTEX,
        fragmentShader: GLOW_FRAGMENT,
        transparent: true,
        depthTest: false,
        depthWrite: false,
        side: DoubleSide,
      }),
    );
    glow.position.set(grille.x + grille.width / 2, grille.y + grille.height / 2, 0);
    scene.add(glow, mesh, halos, cores);
    flight = { mesh, cores, halos, glow, texture, holes, arrivals };
  }

  function draw(): void {
    if (flight !== null) {
      const { mesh, cores, halos, glow } = flight;
      for (const material of [mesh.material, cores.material, halos.material, glow.material]) {
        const uniform = material.uniforms.uProgress;
        if (uniform !== undefined) uniform.value = progress;
      }
      mesh.visible = progress < 1;
      const cooling = glow.material.uniforms.uAfter;
      if (cooling !== undefined) cooling.value = after;
    }
    renderer.render(scene, camera);
  }

  /** Ends a finished run; true while frames are still needed. */
  function settle(): boolean {
    if (direction === 1 && progress >= 1) {
      direction = 0;
      callbacks.onBroadcastEnd();
      return true;
    }
    if (direction === 0) return flight !== null && after < 1;
    if (direction === -1 && progress <= 0) {
      direction = 0;
      release();
      draw();
      if (pending !== null) {
        const next = pending;
        pending = null;
        begin(next);
      } else {
        callbacks.onGathered();
      }
    }
    return direction !== 0;
  }

  function tick(now: number): void {
    frame = 0;
    if (disposed || (direction === 0 && after >= 1)) return;
    const elapsed = Math.min(Math.max(now - last, 0), 64);
    last = now;
    if (direction === 0) after = Math.min(1, after + elapsed / AFTERGLOW_MS);
    else if (direction === -1 && after > 0)
      after = Math.max(0, after - elapsed / (AFTERGLOW_MS * REHEAT));
    else progress += direction === 1 ? elapsed / BROADCAST_MS : -elapsed / GATHER_MS;
    progress = Math.min(1, Math.max(0, progress));
    draw();
    if (settle()) frame = requestAnimationFrame(tick);
  }

  function run(): void {
    if (frame !== 0) return;
    if (document.hidden) {
      finishNow();
      return;
    }
    last = performance.now();
    frame = requestAnimationFrame(tick);
  }

  function begin(signal: Broadcast): void {
    build(signal);
    progress = 0;
    after = 0;
    direction = 1;
    draw();
    callbacks.onBroadcastStart();
    run();
  }

  function finishNow(): void {
    after = 1;
    if (direction === 0) {
      draw();
      return;
    }
    progress = direction === 1 ? 1 : 0;
    draw();
    settle();
  }

  function onVisibility(): void {
    if (document.hidden) {
      cancelAnimationFrame(frame);
      frame = 0;
      finishNow();
    }
  }
  document.addEventListener("visibilitychange", onVisibility);
  // A new width moves the readout and the grille, so a running flight jumps to its end; a new
  // height only grows the page below them.
  let width = host.getBoundingClientRect().width;
  const resize = new ResizeObserver(() => {
    const next = host.getBoundingClientRect().width;
    if (next !== width) {
      width = next;
      cancelAnimationFrame(frame);
      frame = 0;
      finishNow();
    }
    size();
    draw();
  });
  resize.observe(host);

  return {
    broadcast(signal) {
      if (flight === null) {
        begin(signal);
        return;
      }
      pending = signal;
      direction = -1;
      run();
    },
    gather() {
      pending = null;
      if (flight === null) return;
      direction = -1;
      run();
    },
    finish() {
      cancelAnimationFrame(frame);
      frame = 0;
      finishNow();
    },
    landed() {
      return flight === null ? 1 : shareBelow(flight.arrivals, progress);
    },
    dispose() {
      disposed = true;
      cancelAnimationFrame(frame);
      document.removeEventListener("visibilitychange", onVisibility);
      resize.disconnect();
      release();
      noiseTexture.dispose();
      renderer.dispose();
      canvas.remove();
    },
  };
}

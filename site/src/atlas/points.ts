/**
 * The atlas point cloud. Positions come from the bundle and colour is the odour family that
 * Browse already assigns, so the map and the molecule list agree without a second mapping.
 */

import {
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Color,
  LineSegments,
  type Object3D,
  Points,
  PointsMaterial,
  ShaderMaterial,
} from "three";
import { browseGroups } from "../browse/view";
import type { Bundle } from "../data/bundle";

const POINT_SIZE_PX = 4;
const HIGHLIGHT_SIZE_PX = 11;
const TRACE_SIZE_PX = 22;
const TEXTURE_PX = 64;

/** A filled disc or an outline, so points read as round drops rather than square pixels. */
function discTexture(ring: boolean): CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = TEXTURE_PX;
  canvas.height = TEXTURE_PX;
  const context = canvas.getContext("2d");
  if (context !== null) {
    const half = TEXTURE_PX / 2;
    context.fillStyle = "#fff";
    context.strokeStyle = "#fff";
    context.beginPath();
    if (ring) {
      context.lineWidth = TEXTURE_PX / 10;
      context.arc(half, half, half - context.lineWidth, 0, Math.PI * 2);
      context.stroke();
    } else {
      context.arc(half, half, half - 1, 0, Math.PI * 2);
      context.fill();
    }
  }
  return new CanvasTexture(canvas);
}

export interface PointCloud {
  readonly points: Points;
  dispose(): void;
}

function familyColours(bundle: Bundle): Map<string, string> {
  const colours = new Map<string, string>();
  for (const group of browseGroups(bundle)) {
    for (const molecule of group.molecules) colours.set(molecule.id, group.colour);
  }
  return colours;
}

export function pointColours(bundle: Bundle): Float32Array {
  const colours = new Float32Array(bundle.atlas.molecules.length * 3);
  const families = familyColours(bundle);
  bundle.atlas.molecules.forEach((molecule, index) => {
    const hex = families.get(molecule.id);
    if (hex === undefined) return;
    const colour = new Color(hex);
    colours[index * 3] = colour.r;
    colours[index * 3 + 1] = colour.g;
    colours[index * 3 + 2] = colour.b;
  });
  return colours;
}

export interface AtlasCloud extends PointCloud {
  /** 0 shows the whole map; 1 dims everything that is not boosted. */
  setDim(value: number): void;
  /** 0 hides every point; 1 shows them all, spreading outward from the middle. */
  setReveal(value: number): void;
  /** The camera's distance to what it looks at; points off that plane soften. */
  setFocus(distance: number): void;
  /** Lights these points up and enlarges them; an empty list clears it. */
  boost(indices: readonly number[], quiet?: readonly number[]): void;
}

const QUIET_BOOST = 0.45;

const CLOUD_VERTEX = `
attribute vec3 aColor;
attribute float aBoost;
uniform float uSize;
uniform float uPixel;
uniform float uDim;
uniform float uReveal;
uniform float uFocus;
varying vec3 vColor;
varying float vAlpha;
void main() {
  vec4 view = modelViewMatrix * vec4(position, 1.0);
  float off = abs(-view.z - uFocus) / max(uFocus, 1.0);
  float sharp = 1.0 - smoothstep(0.0, 1.6, off);
  float lit = mix(1.0, aBoost, uDim);
  float reveal = clamp(uReveal * 1.7 - length(position.xy) / 90.0, 0.0, 1.0);
  vColor = aColor;
  vAlpha = mix(0.3, 1.0, sharp) * mix(0.28, 1.0, lit);
  gl_PointSize = uSize * uPixel * mix(0.75, 1.5, sharp) * (1.0 + step(0.99, aBoost) * uDim * 1.6) * reveal;
  gl_Position = projectionMatrix * view;
}`;

const CLOUD_FRAGMENT = `
varying vec3 vColor;
varying float vAlpha;
void main() {
  float d = length(gl_PointCoord - 0.5);
  if (d > 0.5) discard;
  float core = smoothstep(0.5, 0.3, d);
  float halo = (1.0 - d * 2.0) * 0.3;
  gl_FragColor = vec4(vColor, (core * 0.95 + halo) * vAlpha);
  #include <colorspace_fragment>
}`;

export function createPointCloud(bundle: Bundle): AtlasCloud {
  const count = bundle.atlas.molecules.length;
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(bundle.positions, 3));
  geometry.setAttribute("aColor", new BufferAttribute(pointColours(bundle), 3));
  const boosts = new BufferAttribute(new Float32Array(count), 1);
  geometry.setAttribute("aBoost", boosts);

  const uniforms = {
    uSize: { value: POINT_SIZE_PX },
    uPixel: { value: Math.min(window.devicePixelRatio || 1, 2) },
    uDim: { value: 0 },
    uReveal: { value: 1 },
    uFocus: { value: 260 },
  };
  const material = new ShaderMaterial({
    vertexShader: CLOUD_VERTEX,
    fragmentShader: CLOUD_FRAGMENT,
    transparent: true,
    depthWrite: false,
    uniforms,
  });
  const points = new Points(geometry, material);
  points.frustumCulled = false;

  return {
    points,
    setDim: (value) => {
      uniforms.uDim.value = value;
    },
    setReveal: (value) => {
      uniforms.uReveal.value = value;
    },
    setFocus: (distance) => {
      uniforms.uFocus.value = distance;
    },
    boost(indices, quiet = []) {
      (boosts.array as Float32Array).fill(0);
      // `quiet` points stay readable but are not enlarged, as a whole family would crowd the frame.
      for (const index of quiet) (boosts.array as Float32Array)[index] = QUIET_BOOST;
      for (const index of indices) (boosts.array as Float32Array)[index] = 1;
      boosts.needsUpdate = true;
    },
    dispose(): void {
      geometry.dispose();
      material.dispose();
    },
  };
}

/** Positions of the highlighted molecules, in bundle order; unknown ids are skipped. */
export function highlightPositions(bundle: Bundle, ids: readonly string[]): Float32Array {
  const wanted = new Set(ids);
  const picked: number[] = [];
  bundle.atlas.molecules.forEach((molecule, index) => {
    if (wanted.has(molecule.id))
      picked.push(...bundle.positions.subarray(index * 3, index * 3 + 3));
  });
  return new Float32Array(picked);
}

/** Larger points in one colour, drawn over the cloud; static, so reduced motion needs nothing. */
export function createHighlight(
  bundle: Bundle,
  ids: readonly string[],
  colour: string,
): PointCloud {
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(highlightPositions(bundle, ids), 3));
  const map = discTexture(false);
  const material = new PointsMaterial({
    size: HIGHLIGHT_SIZE_PX,
    sizeAttenuation: false,
    color: new Color(colour),
    depthTest: false,
    map,
    alphaTest: 0.5,
  });
  const points = new Points(geometry, material);
  points.renderOrder = 1;
  return {
    points,
    dispose(): void {
      geometry.dispose();
      material.dispose();
      map.dispose();
    },
  };
}

export interface FlightTrace {
  readonly objects: readonly Object3D[];
  /** Molecule indices the threads run to, nearest odour first. */
  readonly neighbourIndices: readonly number[];
  readonly centreIndex: number;
  /** 0 hides the trace, 1 shows every thread and ring. */
  setProgress(progress: number): void;
  dispose(): void;
}

const THREAD_VERTEX = `
attribute float aAlong;
attribute float aDelay;
varying float vAlong;
varying float vDelay;
void main() {
  vAlong = aAlong;
  vDelay = aDelay;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const THREAD_FRAGMENT = `
uniform vec3 uColor;
uniform float uDraw;
varying float vAlong;
varying float vDelay;
void main() {
  float reach = clamp((uDraw - vDelay) / (1.0 - 0.45), 0.0, 1.0);
  if (vAlong > reach) discard;
  gl_FragColor = vec4(uColor, 0.9);
  #include <colorspace_fragment>
}`;

/**
 * Threads from the molecule a flight is heading to out to its odour neighbours, with a ring on
 * each end. The threads grow from the molecule outward, one after another, as the camera
 * arrives, so the flight ends on the neighbourhood.
 */
export function createFlightTrace(
  bundle: Bundle,
  moleculeIndex: number,
  colour: string,
): FlightTrace {
  const molecule = bundle.atlas.molecules[moleculeIndex];
  const at = (index: number): number[] => [...bundle.positions.subarray(index * 3, index * 3 + 3)];
  const centre = at(moleculeIndex);
  const ringed = [...centre];
  const threads: number[] = [];
  const along: number[] = [];
  const delay: number[] = [];
  const neighbourIndices: number[] = [];
  const neighbours = molecule?.neighbours ?? [];
  neighbours.forEach((neighbour, order) => {
    const index = bundle.atlas.molecules.findIndex((item) => item.id === neighbour.id);
    if (index === -1) return;
    neighbourIndices.push(index);
    ringed.push(...at(index));
    threads.push(...centre, ...at(index));
    along.push(0, 1);
    delay.push(
      (order / Math.max(1, neighbours.length)) * 0.45,
      (order / Math.max(1, neighbours.length)) * 0.45,
    );
  });

  const lineGeometry = new BufferGeometry();
  lineGeometry.setAttribute("position", new BufferAttribute(new Float32Array(threads), 3));
  lineGeometry.setAttribute("aAlong", new BufferAttribute(new Float32Array(along), 1));
  lineGeometry.setAttribute("aDelay", new BufferAttribute(new Float32Array(delay), 1));
  const threadUniforms = { uColor: { value: new Color(colour) }, uDraw: { value: 0 } };
  const lineMaterial = new ShaderMaterial({
    vertexShader: THREAD_VERTEX,
    fragmentShader: THREAD_FRAGMENT,
    transparent: true,
    depthTest: false,
    uniforms: threadUniforms,
  });
  const lines = new LineSegments(lineGeometry, lineMaterial);
  lines.renderOrder = 2;
  lines.frustumCulled = false;

  const ringGeometry = new BufferGeometry();
  ringGeometry.setAttribute("position", new BufferAttribute(new Float32Array(ringed), 3));
  const map = discTexture(true);
  const ringMaterial = new PointsMaterial({
    size: TRACE_SIZE_PX,
    sizeAttenuation: false,
    color: new Color(colour),
    transparent: true,
    opacity: 0,
    depthTest: false,
    map,
    alphaTest: 0.2,
  });
  const rings = new Points(ringGeometry, ringMaterial);
  rings.renderOrder = 2;
  rings.frustumCulled = false;

  return {
    objects: [lines, rings],
    neighbourIndices,
    centreIndex: moleculeIndex,
    setProgress(progress: number): void {
      const value = Math.min(1, Math.max(0, progress));
      threadUniforms.uDraw.value = value;
      ringMaterial.opacity = Math.min(1, value * 2);
    },
    dispose(): void {
      lineGeometry.dispose();
      lineMaterial.dispose();
      ringGeometry.dispose();
      ringMaterial.dispose();
      map.dispose();
    },
  };
}

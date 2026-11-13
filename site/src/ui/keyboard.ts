/** Page-wide shortcuts and the atlas camera keys, kept free of the DOM so they can be tested. */

export type Shortcut = "focus-search" | "close-card";

export interface KeyPress {
  readonly key: string;
  /** True while the user is typing in a field, where `/` is just a character. */
  readonly typing: boolean;
  readonly modified: boolean;
  readonly onCard: boolean;
}

export function shortcutFor(press: KeyPress): Shortcut | null {
  if (press.modified) return null;
  if (press.key === "/" && !press.typing) return "focus-search";
  if (press.key === "Escape" && press.onCard) return "close-card";
  return null;
}

const ORBIT_STEP_RADIANS = Math.PI / 24;
const ZOOM_STEP = 0.85;
// Keeps the camera off the poles, where the orbit's up vector flips.
const POLE_MARGIN_RADIANS = 0.01;

export type CameraNudge =
  | { readonly kind: "orbit"; readonly azimuth: number; readonly polar: number }
  | { readonly kind: "zoom"; readonly factor: number };

export function cameraNudge(key: string): CameraNudge | null {
  switch (key) {
    case "ArrowLeft":
      return { kind: "orbit", azimuth: -ORBIT_STEP_RADIANS, polar: 0 };
    case "ArrowRight":
      return { kind: "orbit", azimuth: ORBIT_STEP_RADIANS, polar: 0 };
    case "ArrowUp":
      return { kind: "orbit", azimuth: 0, polar: -ORBIT_STEP_RADIANS };
    case "ArrowDown":
      return { kind: "orbit", azimuth: 0, polar: ORBIT_STEP_RADIANS };
    case "+":
    case "=":
      return { kind: "zoom", factor: ZOOM_STEP };
    case "-":
    case "_":
      return { kind: "zoom", factor: 1 / ZOOM_STEP };
    default:
      return null;
  }
}

/** Camera position around its target, in three.js `Spherical` terms. */
export interface Orbit {
  readonly radius: number;
  readonly phi: number;
  readonly theta: number;
}

export function nudgeOrbit(
  orbit: Orbit,
  nudge: CameraNudge,
  distance: { readonly min: number; readonly max: number },
): Orbit {
  if (nudge.kind === "zoom") {
    const radius = Math.min(distance.max, Math.max(distance.min, orbit.radius * nudge.factor));
    return { ...orbit, radius };
  }
  const phi = Math.min(
    Math.PI - POLE_MARGIN_RADIANS,
    Math.max(POLE_MARGIN_RADIANS, orbit.phi + nudge.polar),
  );
  return { ...orbit, phi, theta: orbit.theta + nudge.azimuth };
}

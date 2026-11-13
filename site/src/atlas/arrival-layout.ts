/**
 * Where the eight neighbours sit when a flight lands. Wide screens use a ring around the hub:
 * ranks run clockwise from the word's own thread, and a thread's length follows the odour
 * distance, so equal scores sit at equal radii. Narrow screens use a 4 by 2 field under the hub.
 * Radial threads never cross each other or enter the hub.
 */

export interface Point {
  readonly x: number;
  readonly y: number;
}

export interface Size {
  readonly width: number;
  readonly height: number;
}

export interface Area extends Size {
  readonly left: number;
  readonly top: number;
}

export interface Slot extends Point {
  /** Clockwise from straight up, in degrees. */
  readonly angle: number;
  /** Distance from the hub's centre. */
  readonly radius: number;
}

/** The word's own thread comes from straight up; ranks start this far clockwise of it. */
const WORD_GAP_DEGREES = 40;

/** Even the closest neighbour keeps a thread long enough to read as one. */
const MIN_THREAD_PX = 30;

/** Each odour score as a 0..1 share of the longest thread: the closest is 0, the furthest 1. */
export function lengthShares(odour: readonly number[]): number[] {
  const distances = odour.map((score) => 1 - score);
  const nearest = Math.min(...distances);
  const span = Math.max(...distances) - nearest;
  return distances.map((distance) => (span === 0 ? 0.5 : (distance - nearest) / span));
}

/**
 * Places `shares.length` items on rays from the hub, clockwise by rank. `hubRadius` is the
 * clear space around the hub, `cell` the item's size, and `reach` how much extra room an item
 * needs below itself for its label. The ring grows until the farthest item touches the area.
 */
export function radialLayout(
  shares: readonly number[],
  centre: Point,
  area: Area,
  hubRadius: number,
  cell: Size,
): Slot[] {
  const count = shares.length;
  const step = (360 - WORD_GAP_DEGREES) / count;
  const angles = shares.map((_, rank) => WORD_GAP_DEGREES / 2 + step * (rank + 0.5));
  const nearestRadius = hubRadius + cell.height / 2 + MIN_THREAD_PX;
  // The largest radius at which every item still fits inside the area.
  let farthestRadius = Number.POSITIVE_INFINITY;
  for (const angle of angles) {
    const sin = Math.sin((angle * Math.PI) / 180);
    const cos = Math.cos((angle * Math.PI) / 180);
    const room = {
      x: sin >= 0 ? area.left + area.width - centre.x : centre.x - area.left,
      y: cos >= 0 ? centre.y - area.top : area.top + area.height - centre.y,
    };
    if (Math.abs(sin) > 1e-6) {
      farthestRadius = Math.min(farthestRadius, (room.x - cell.width / 2) / Math.abs(sin));
    }
    if (Math.abs(cos) > 1e-6) {
      farthestRadius = Math.min(farthestRadius, (room.y - cell.height / 2) / Math.abs(cos));
    }
  }
  const outer = Math.max(nearestRadius, farthestRadius);
  return shares.map((share, rank) => {
    const angle = angles[rank] as number;
    const radius = nearestRadius + share * (outer - nearestRadius);
    return {
      x: centre.x + radius * Math.sin((angle * Math.PI) / 180),
      y: centre.y - radius * Math.cos((angle * Math.PI) / 180),
      angle,
      radius,
    };
  });
}

/** A field of `columns` per row under the hub, ranks left to right and top to bottom. */
export function gridLayout(
  count: number,
  area: Area,
  columns: number,
  cell: Size,
  top: number,
): Point[] {
  const column = area.width / columns;
  return Array.from({ length: count }, (_, rank) => ({
    x: area.left + column * ((rank % columns) + 0.5),
    y: top + cell.height / 2 + Math.floor(rank / columns) * (cell.height + 24),
  }));
}

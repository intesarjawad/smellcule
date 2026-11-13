/**
 * Labels are DOM boxes laid over the canvas. Anchors come from projected points, and the
 * placer keeps each box inside the stage, flipping it to the left near the right edge and
 * dropping any box that would cover one already placed.
 */

export interface LabelCandidate {
  readonly id: string;
  readonly text: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface LabelBounds {
  readonly width: number;
  readonly height: number;
}

export interface PlacedLabel extends LabelCandidate {
  readonly left: number;
  readonly top: number;
}

const LABEL_GAP_PX = 8;
const LABEL_MARGIN_PX = 4;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function overlaps(a: PlacedLabel, left: number, top: number, candidate: LabelCandidate): boolean {
  return (
    left < a.left + a.width &&
    left + candidate.width > a.left &&
    top < a.top + a.height &&
    top + candidate.height > a.top
  );
}

export function placeLabels(
  candidates: readonly LabelCandidate[],
  bounds: LabelBounds,
): PlacedLabel[] {
  const placed: PlacedLabel[] = [];

  for (const candidate of candidates) {
    if (
      candidate.x < 0 ||
      candidate.y < 0 ||
      candidate.x > bounds.width ||
      candidate.y > bounds.height
    ) {
      continue;
    }

    let left = candidate.x + LABEL_GAP_PX;
    if (left + candidate.width > bounds.width - LABEL_MARGIN_PX) {
      left = candidate.x - LABEL_GAP_PX - candidate.width;
    }
    left = clamp(
      left,
      LABEL_MARGIN_PX,
      Math.max(LABEL_MARGIN_PX, bounds.width - LABEL_MARGIN_PX - candidate.width),
    );

    const top = clamp(
      candidate.y - candidate.height / 2,
      LABEL_MARGIN_PX,
      Math.max(LABEL_MARGIN_PX, bounds.height - LABEL_MARGIN_PX - candidate.height),
    );

    if (placed.some((other) => overlaps(other, left, top, candidate))) continue;
    placed.push({ ...candidate, left, top });
  }

  return placed;
}

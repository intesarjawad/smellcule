/** Thread lengths for the neighbour diagram, as shares of the diagram's radius. */

export const NEAREST_SHARE = 0.4;
export const FARTHEST_SHARE = 1;

/**
 * Min-max over the neighbours: the most similar odour sits at 40% of the radius and the least
 * similar at 100%. A tie for every neighbour puts them all at the nearest share.
 */
export function threadShares(odours: readonly number[]): number[] {
  const best = Math.max(...odours);
  const worst = Math.min(...odours);
  const span = best - worst;
  return odours.map((odour) =>
    span === 0
      ? NEAREST_SHARE
      : NEAREST_SHARE + ((best - odour) / span) * (FARTHEST_SHARE - NEAREST_SHARE),
  );
}

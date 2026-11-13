/** Card routes are shared by search and browse so every molecule link lands in the same place. */
export function moleculeHref(id: string): string {
  return `#/molecule/${encodeURIComponent(id)}`;
}

/** The atlas flies to the molecule, then opens its card in place of this link. */
export function flyHref(id: string): string {
  return `#/atlas?fly=${encodeURIComponent(id)}`;
}

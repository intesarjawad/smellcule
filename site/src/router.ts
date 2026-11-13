/**
 * Hash routing keeps every view addressable without a server rewrite. Parsing is pure so the
 * route table can be checked without a browser.
 */

import type { CatalogueName } from "./data/validate";

export type Route =
  | { readonly name: "home" }
  | { readonly name: "browse" }
  | { readonly name: "atlas"; readonly query: string | null }
  | { readonly name: "card"; readonly id: string }
  | { readonly name: "smellcule"; readonly number: number | null }
  | { readonly name: "smellcule-archive" }
  | { readonly name: "smellcule-retired" }
  | { readonly name: "decompile" }
  | { readonly name: "how" }
  | { readonly name: "synesthesia"; readonly ids: readonly string[] }
  | { readonly name: "not-found"; readonly path: string };

function decode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function parseIds(params: string): string[] {
  const search = new URLSearchParams(params);
  const mixed = search.get("mix");
  if (mixed !== null) {
    return mixed
      .split(",")
      .map((id) => id.trim())
      .filter((id) => id.length > 0);
  }
  return [search.get("a"), search.get("b")].filter(
    (id): id is string => id !== null && id.length > 0,
  );
}

export function parseRoute(hash: string): Route {
  const raw = hash.startsWith("#") ? hash.slice(1) : hash;
  const queryIndex = raw.indexOf("?");
  const path = (queryIndex === -1 ? raw : raw.slice(0, queryIndex)).replace(/^\/+/, "");
  const params = queryIndex === -1 ? "" : raw.slice(queryIndex + 1);
  const parts = path.split("/").filter((part) => part.length > 0);

  if (parts.length === 0) return { name: "home" };

  const [head, second] = parts;
  switch (head) {
    case "browse":
      return { name: "browse" };
    case "atlas":
    case "search": {
      const query = new URLSearchParams(params).get("q")?.trim();
      return { name: "atlas", query: query !== undefined && query.length > 0 ? query : null };
    }
    case "m":
    case "molecule":
      if (second === undefined) return { name: "not-found", path };
      return { name: "card", id: decode(second) };
    case "smellcule":
      if (second === "archive") return { name: "smellcule-archive" };
      if (second === undefined) return { name: "smellcule", number: null };
      if (!/^\d+$/.test(second)) return { name: "not-found", path };
      return { name: "smellcule", number: Number(second) };
    case "decompile":
      return { name: "decompile" };
    case "how":
      return { name: "how" };
    case "synesthesia":
      return { name: "synesthesia", ids: parseIds(params) };
    default:
      return { name: "not-found", path: parts.join("/") };
  }
}

export interface Features {
  readonly game: boolean;
  readonly decompiler: boolean;
}

/** The daily game and the note decompiler need Leffingwell's puzzles and note content. */
export function featuresFor(catalogue: CatalogueName): Features {
  const leffingwell = catalogue === "leffingwell";
  return { game: leffingwell, decompiler: leffingwell };
}

export interface Redirect {
  readonly redirect: string;
}

/**
 * Replaces a view the catalogue cannot back. A retired game keeps one page so a shared puzzle
 * link explains itself; with nothing ever published the link goes to the atlas instead.
 */
export function gateRoute(
  route: Route,
  catalogue: CatalogueName,
  retiredPuzzles: number,
): Route | Redirect {
  const features = featuresFor(catalogue);
  switch (route.name) {
    case "decompile":
      return features.decompiler ? route : { redirect: "#/atlas" };
    case "smellcule":
    case "smellcule-archive":
      if (features.game) return route;
      return retiredPuzzles > 0 ? { name: "smellcule-retired" } : { redirect: "#/atlas" };
    default:
      return route;
  }
}

/** Prefix and suffix of a hash with the query part removed, for route-specific parameters. */
export function hashParams(hash: string): URLSearchParams {
  const raw = hash.startsWith("#") ? hash.slice(1) : hash;
  const index = raw.indexOf("?");
  return new URLSearchParams(index === -1 ? "" : raw.slice(index + 1));
}

export function currentRoute(): Route {
  return parseRoute(window.location.hash);
}

/**
 * Moves to a view. `replace` swaps the current history entry, so a link that opens another view
 * on arrival does not trap the Back button on itself.
 */
export function navigate(hash: string, { replace = false } = {}): void {
  if (window.location.hash === hash) {
    window.dispatchEvent(new HashChangeEvent("hashchange"));
    return;
  }
  if (replace) window.location.replace(hash);
  else window.location.hash = hash;
}

export function followHash(render: (route: Route) => void): () => void {
  const update = (): void => render(currentRoute());
  window.addEventListener("hashchange", update);
  update();
  return () => window.removeEventListener("hashchange", update);
}

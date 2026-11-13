/**
 * The atlas route without its 3D renderer. It keeps search working, points visitors at Browse
 * when WebGL is unavailable, and lists the same families so no molecule becomes unreachable.
 */

import { browseGroups, renderBrowse } from "../browse/view";
import { moleculeHref } from "../card/link";
import type { Bundle } from "../data/bundle";
import { listedNames } from "../data/names";
import { navigate } from "../router";
import type { SearchHit } from "../search/index";
import { buildSearchIndex, searchSuggestions } from "../search/index";
import { deepLinkHit, hitHref, mountSearch } from "../search/view";
import { element, link } from "../ui/dom";

export interface AtlasFallbackOptions {
  readonly query: string | null;
  readonly highlighted: readonly string[];
  readonly webgl: boolean;
}

export function renderAtlasFallback(
  container: HTMLElement,
  bundle: Bundle,
  options: AtlasFallbackOptions,
): void {
  const page = element("section", undefined, "atlas-fallback");
  page.append(element("h1", "Atlas"));

  if (!options.webgl) {
    const notice = element("p");
    notice.append(
      "Your browser can't draw the 3D map. Browse every molecule as a list instead. ",
      link("Open Browse", "#/browse"),
    );
    page.append(notice);
  }

  const search = element("div");
  page.append(search);
  const index = buildSearchIndex(bundle);
  const onOpen = (id: string, hit: SearchHit): void => {
    navigate(hitHref(hit) ?? moleculeHref(id));
  };
  mountSearch(search, {
    index,
    suggestions: searchSuggestions(bundle.phrases, bundle.atlas.catalogue),
    initialQuery: options.query,
    placeholder: "smells like rain",
    onOpen,
  });

  if (options.highlighted.length > 0) {
    const names = listedNames(bundle.atlas.molecules);
    const highlighted = element("p", "Highlighted by the decompiler: ");
    options.highlighted.forEach((id, index) => {
      if (index > 0) highlighted.append(", ");
      highlighted.append(link(names.get(id) ?? id, moleculeHref(id)));
    });
    page.append(highlighted);
  }

  const families = element("div", undefined, "families");
  renderBrowse(families, browseGroups(bundle));
  page.append(families);

  container.replaceChildren(page);

  const linked = options.query === null ? undefined : deepLinkHit(index, options.query);
  const linkedHref = linked === undefined ? null : hitHref(linked);
  if (linkedHref !== null) navigate(linkedHref, { replace: true });
}

/** Shared footer. The data download follows the bundle version, not a hand-edited link. */

import type { Atlas } from "../data/validate";
import { element, link } from "./dom";

export const REPO_URL = "https://github.com/intesarjawad/smellcule";
export const EVALUATION_URL = `${REPO_URL}/blob/main/docs/evaluation.md`;

export function releaseAssetUrl(version: string): string {
  return `${REPO_URL}/releases/download/v${version}/atlas-data-${version}.tar.gz`;
}

export function renderFooter(container: HTMLElement, atlas: Atlas): void {
  const nav = element("nav", undefined, "footer-links");
  nav.setAttribute("aria-label", "About and data");
  const list = element("ul");
  for (const item of [
    link("How it works", "#/how"),
    link("Source code", REPO_URL),
    link("Evaluation report", EVALUATION_URL),
  ]) {
    const entry = element("li");
    entry.append(item);
    list.append(entry);
  }
  const download = element("li");
  download.append(link(`Download all data (${atlas.dataLicence})`, releaseAssetUrl(atlas.version)));
  list.append(download);
  nav.append(list);
  container.replaceChildren(nav);
}

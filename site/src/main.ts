/**
 * The site shell. One bundle is loaded for the whole session, the footer follows it, and every
 * route renders into the same main region. The 3D atlas is replaced by a list until its renderer
 * is available; everything else works without WebGL.
 */

import "./styles.css";
import type { AtlasScene } from "./atlas/scene";
import { renderAtlasFallback } from "./atlas/view";
import { supportsWebGL2 } from "./atlas/webgl-support";
import { browseGroups, renderBrowse } from "./browse/view";
import { flyHref, moleculeHref } from "./card/link";
import { cardAnnouncement, cardModel } from "./card/model";
import { renderCard } from "./card/view";
import { type Bundle, loadBundle } from "./data/bundle";
import type { Phrase } from "./data/validate";
import { renderDecompiler } from "./decompiler/view";
import { renderHow } from "./how/view";
import { mountReceiver, type Receiver } from "./receiver/view";
import {
  currentRoute,
  featuresFor,
  followHash,
  gateRoute,
  hashParams,
  navigate,
  type Route,
} from "./router";
import { loadSmellcule, type SmellculeBundle } from "./smellcule/data";
import { puzzleNumber } from "./smellcule/schedule";
import {
  renderSmellcule,
  renderSmellculeArchive,
  renderSmellculeRetired,
  type SmellculeContext,
} from "./smellcule/view";
import { renderSynesthesia, type SynesthesiaView } from "./synesthesia/view";
import { element, link } from "./ui/dom";
import { mountErrorPanel } from "./ui/error-panel";
import { renderFooter } from "./ui/footer";
import { shortcutFor } from "./ui/keyboard";

const DATA_URL = import.meta.env.VITE_DATA_URL ?? "fixture-data/";

const main = document.querySelector<HTMLElement>("#main");
const footer = document.querySelector<HTMLElement>("#site-footer");
const live = document.querySelector<HTMLElement>("#live");
if (main === null) throw new Error("Missing #main");

let bundle: Bundle | null = null;
let game: SmellculeBundle | null = null;
let gamePromise: Promise<SmellculeBundle> | null = null;
let stopRouter: (() => void) | null = null;
let atlasScene: AtlasScene | null = null;
let synesthesia: SynesthesiaView | null = null;
let receiver: Receiver | null = null;
let renderToken = 0;

function storage(): Pick<Storage, "getItem" | "setItem"> | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function announce(text: string): void {
  if (live !== null) live.textContent = text;
}

function notFound(path: string): void {
  document.title = "Page not found | Smellcule";
  const page = element("section");
  page.append(element("h1", "Page not found"));
  page.append(element("p", `There is no view at ${path}.`));
  page.append(link("Go home", "#/"));
  main?.replaceChildren(page);
}

function cardPage(current: Bundle, id: string): void {
  const molecule = current.atlas.molecules.find((item) => item.id === id);
  if (molecule === undefined) {
    notFound(`m/${id}`);
    return;
  }
  const params = hashParams(window.location.hash);
  // Search links carry the phrase as its title-cased badge, so match it without case.
  const phraseName = params.get("phrase")?.toLowerCase();
  const phrase: Phrase | undefined =
    phraseName === undefined
      ? undefined
      : current.phrases.find((item) => item.name.toLowerCase() === phraseName);
  const badge =
    phrase !== undefined && phrase.exemplar === id ? `Known example: ${phrase.name}` : null;
  const options = {
    badge,
    badgeHref: badge === null ? null : (phrase?.source_url ?? null),
    neighbourHref: supportsWebGL2() ? flyHref : moleculeHref,
  };

  const card = element("section", undefined, "card-region");
  const back = element("p");
  back.append(link("Back to the atlas", "#/atlas"));
  const body = element("div");
  card.append(back, body);
  main?.replaceChildren(card);
  renderCard(body, cardModel(current, id), options);

  document.title = `${molecule.name} | Smellcule`;
  announce(cardAnnouncement(molecule));
}

function gameContext(
  current: Bundle,
  puzzles: SmellculeBundle,
  number: number | null,
): SmellculeContext {
  const today = new Date();
  const suffix = `/${number ?? puzzleNumber(today, puzzles.startDate)}`;
  const base = `${window.location.origin}${window.location.pathname}#/smellcule${suffix}`;
  return {
    bundle: current,
    game: puzzles,
    today,
    storage: storage(),
    clipboard: navigator.clipboard,
    url: base,
  };
}

async function ensureGame(current: Bundle): Promise<SmellculeBundle> {
  if (game !== null) return game;
  if (gamePromise === null) {
    gamePromise = loadSmellcule(DATA_URL, current.atlas).then((loaded) => {
      game = loaded;
      return loaded;
    });
  }
  try {
    return await gamePromise;
  } catch (error) {
    gamePromise = null;
    throw error;
  }
}

const NAV_HREF: Partial<Record<Route["name"], string>> = {
  browse: "#/browse",
  card: "#/browse",
  atlas: "#/atlas",
  smellcule: "#/smellcule",
  "smellcule-archive": "#/smellcule",
  decompile: "#/decompile",
  how: "#/how",
};

function markNav(route: Route): void {
  for (const anchor of document.querySelectorAll<HTMLAnchorElement>("nav[aria-label='Main'] a")) {
    if (anchor.getAttribute("href") === NAV_HREF[route.name])
      anchor.setAttribute("aria-current", "page");
    else anchor.removeAttribute("aria-current");
  }
}

async function renderRoute(requested: Route): Promise<void> {
  const token = ++renderToken;
  atlasScene?.dispose();
  atlasScene = null;
  synesthesia?.dispose();
  synesthesia = null;
  receiver?.dispose();
  receiver = null;
  if (bundle === null) return;
  const current = bundle;
  const route = gateRoute(
    requested,
    current.atlas.catalogue,
    current.atlas.stats.retiredPuzzles ?? 0,
  );
  if ("redirect" in route) {
    window.location.replace(route.redirect);
    return;
  }

  markNav(route);
  const titles: Record<Route["name"], string> = {
    home: "Home",
    browse: "Browse",
    atlas: "Atlas",
    card: "Molecule",
    decompile: "Note decompiler",
    how: "How it works",
    smellcule: "Daily game",
    "smellcule-archive": "Smellcule archive",
    "smellcule-retired": "Smellcule retired",
    synesthesia: "Synesthesia",
    "not-found": "Page not found",
  };
  document.title = `${titles[route.name]} | Smellcule`;
  switch (route.name) {
    case "home": {
      main?.replaceChildren();
      receiver = mountReceiver(main ?? document.body, current, {
        announce,
        headerSlot: document.querySelector<HTMLElement>("#header-slot"),
        tune: hashParams(window.location.hash).get("tune"),
        webgl: supportsWebGL2(),
      });
      return;
    }
    case "browse": {
      const page = element("section");
      page.append(element("h1", "Browse"));
      const list = element("div");
      renderBrowse(list, browseGroups(current));
      page.append(list);
      main?.replaceChildren(page);
      return;
    }
    case "atlas": {
      const params = hashParams(window.location.hash);
      const fly = params.get("fly");
      const highlighted = (params.get("ids") ?? "")
        .split(",")
        .map((id) => id.trim())
        .filter((id) => id.length > 0);
      main?.replaceChildren();
      if (supportsWebGL2()) {
        loading();
        try {
          const { mountAtlasScene } = await import("./atlas/scene");
          if (token !== renderToken || bundle === null) return;
          atlasScene = mountAtlasScene(main ?? document.body, current, {
            query: route.query,
            highlighted,
            fly,
            announce,
          });
          return;
        } catch {
          if (token !== renderToken) return;
          // The probe can pass while context creation fails; the list still works.
        }
      }
      if (fly !== null) {
        navigate(moleculeHref(fly), { replace: true });
        return;
      }
      renderAtlasFallback(main ?? document.body, current, {
        query: route.query,
        highlighted,
        webgl: false,
      });
      return;
    }
    case "card":
      cardPage(current, route.id);
      return;
    case "decompile": {
      main?.replaceChildren();
      renderDecompiler(main ?? document.body, current);
      return;
    }
    case "how": {
      main?.replaceChildren();
      renderHow(main ?? document.body, current);
      return;
    }
    case "smellcule-retired":
      renderSmellculeRetired(
        main ?? document.body,
        current.atlas.stats.retiredPuzzles ?? 0,
        storage(),
      );
      return;
    case "smellcule":
    case "smellcule-archive": {
      main?.replaceChildren(element("p", "Loading the puzzle…", "loading"));
      let puzzles: SmellculeBundle;
      try {
        puzzles = await ensureGame(current);
      } catch (error) {
        if (token === renderToken) {
          mountErrorPanel(main ?? document.body, error, () => renderRoute(route));
        }
        return;
      }
      if (token !== renderToken || bundle === null) return;
      const number = route.name === "smellcule" ? route.number : null;
      if (route.name === "smellcule-archive") {
        renderSmellculeArchive(main ?? document.body, gameContext(current, puzzles, null));
      } else {
        renderSmellcule(main ?? document.body, gameContext(current, puzzles, number), number);
      }
      return;
    }
    case "synesthesia": {
      const params = hashParams(window.location.hash);
      synesthesia = renderSynesthesia(
        main ?? document.body,
        current,
        route.ids,
        params.has("mix"),
        params.get("map"),
      );
      return;
    }
    default:
      notFound(route.path);
  }
}

function gateNav(current: Bundle): void {
  const features = featuresFor(current.atlas.catalogue);
  for (const anchor of document.querySelectorAll<HTMLAnchorElement>("nav[aria-label='Main'] a")) {
    const href = anchor.getAttribute("href");
    const unavailable =
      (href === "#/smellcule" && !features.game) ||
      (href === "#/decompile" && !features.decompiler);
    if (unavailable) anchor.closest("li")?.remove();
  }
}

const LOADING = "Loading the atlas…";

function loading(): void {
  const notice = element("p", LOADING, "loading");
  const dots = element("span", undefined, "loading-dots");
  dots.setAttribute("aria-hidden", "true");
  dots.append(element("span"), element("span"), element("span"));
  notice.append(dots);
  main?.replaceChildren(notice);
  announce(LOADING);
}

async function boot(): Promise<void> {
  atlasScene?.dispose();
  atlasScene = null;
  synesthesia?.dispose();
  synesthesia = null;
  receiver?.dispose();
  receiver = null;
  bundle = null;
  game = null;
  gamePromise = null;
  loading();
  try {
    const loaded = await loadBundle(DATA_URL);
    bundle = loaded;
    if (footer !== null) renderFooter(footer, loaded.atlas);
    gateNav(loaded);
    stopRouter?.();
    stopRouter = followHash((route) => void renderRoute(route));
  } catch (error) {
    if (main !== null) mountErrorPanel(main, error, () => void boot());
  }
}

document.querySelector<HTMLAnchorElement>(".skip-link")?.addEventListener("click", (event) => {
  event.preventDefault();
  main.focus();
  main.scrollIntoView();
});

document.addEventListener("keydown", (event) => {
  const target = event.target;
  const typing =
    target instanceof HTMLElement &&
    (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName));
  const action = shortcutFor({
    key: event.key,
    typing,
    modified: event.ctrlKey || event.metaKey || event.altKey,
    onCard: currentRoute().name === "card",
  });
  if (action === null) return;
  event.preventDefault();
  if (action === "close-card") {
    navigate("#/browse");
    return;
  }
  const search = document.querySelector<HTMLInputElement>("input[type='search']");
  if (search === null) navigate("#/atlas");
  else search.focus();
});

void boot();

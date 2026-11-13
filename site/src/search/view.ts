/**
 * Search states and rendering. Empty and no-result states both offer the same suggestions, each
 * of which fills the field so a suggestion follows the same path as a typed query.
 */

import { moleculeHref } from "../card/link";
import { element } from "../ui/dom";
import type { Miss, SearchHit, SearchIndex } from "./index";
import { EMPTY_SUGGESTIONS, explainMiss, search } from "./index";
import { searchHref } from "./query";

export interface SearchViewState {
  readonly status: "empty" | "results" | "no-results";
  readonly message: string;
  readonly suggestions: readonly string[];
  /** Descriptors spelled like those words, offered in their place. */
  readonly nearest?: readonly string[];
}

export interface SearchOptions {
  readonly index: SearchIndex;
  readonly suggestions?: readonly string[];
  readonly initialQuery?: string | null;
  readonly onOpen: (moleculeId: string, hit: SearchHit) => void;
  /** A page with several fields gives each its own id and label. */
  readonly id?: string;
  readonly label?: string;
  readonly autofocus?: boolean;
  readonly placeholder?: string;
  /** Called with every new set of hits, so a page can show where they are. */
  readonly onResults?: (hits: readonly SearchHit[]) => void;
}

export const MAX_RESULTS = 8;

/** The card a hit opens, naming the phrase it is a known example of so the card can badge it. */
export function hitHref(hit: SearchHit): string | null {
  if (hit.moleculeId === null) return null;
  const phrase =
    hit.kind === "phrase" || hit.knownExample === true ? (hit.badge ?? hit.label) : null;
  const suffix = phrase === null ? "" : `?phrase=${encodeURIComponent(phrase)}`;
  return `${moleculeHref(hit.moleculeId)}${suffix}`;
}

/** What `#/atlas?q=` opens: the first result that names a molecule, as Enter would. */
export function deepLinkHit(index: SearchIndex, query: string): SearchHit | undefined {
  return search(index, query, MAX_RESULTS).find((hit) => hit.moleculeId !== null);
}

export function searchViewState(
  query: string,
  hits: readonly SearchHit[],
  suggestions: readonly string[] = EMPTY_SUGGESTIONS,
  miss?: Miss,
): SearchViewState {
  if (hits.length > 0) {
    return {
      status: "results",
      message: `${hits.length} result${hits.length === 1 ? "" : "s"}`,
      suggestions: [],
    };
  }
  const trimmed = query.trim();
  if (trimmed.length === 0) {
    return {
      status: "empty",
      message:
        suggestions.length > 0
          ? "Search the atlas by smell, molecule or note."
          : "Search the atlas by molecule or descriptor.",
      suggestions,
    };
  }
  const state: SearchViewState = {
    status: "no-results",
    message: `No smell or molecule called '${trimmed}'.`,
    suggestions,
  };
  // One sentence says it: the nearest descriptors, when there are any, follow below it.
  if (miss === undefined || miss.nearest.length === 0) return state;
  return { ...state, nearest: miss.nearest };
}

function suggestionList(
  items: readonly string[],
  className: string,
  onSuggestion: ((suggestion: string) => void) | undefined,
): HTMLUListElement {
  const list = element("ul", undefined, className);
  for (const suggestion of items) {
    const item = element("li");
    if (onSuggestion === undefined) {
      const anchor = element("a", suggestion);
      anchor.href = searchHref(suggestion);
      item.append(anchor);
    } else {
      const button = element("button", suggestion);
      button.type = "button";
      button.addEventListener("click", () => onSuggestion(suggestion));
      item.append(button);
    }
    list.append(item);
  }
  return list;
}

function resultItem(
  hit: SearchHit,
  onOpen: ((moleculeId: string, hit: SearchHit) => void) | undefined,
  active: boolean,
  index: number,
  optionPrefix: string,
  showBadge: boolean,
): HTMLLIElement {
  const item = element("li");
  item.id = `${optionPrefix}-${index}`;
  item.setAttribute("role", "option");
  item.setAttribute("aria-selected", active ? "true" : "false");
  if (active) item.classList.add("active");

  const target = element("span", undefined, "result-link");
  if (hit.moleculeId !== null && onOpen !== undefined) {
    item.addEventListener("click", () => onOpen(hit.moleculeId ?? "", hit));
  }
  target.append(element("strong", hit.label));
  if (showBadge && hit.badge !== null) target.append(element("span", hit.badge, "badge"));
  if (hit.knownExample === true) target.append(element("span", "known example", "badge"));
  item.append(target, element("span", hit.detail, "detail"));
  return item;
}

export function renderSearch(
  container: HTMLElement,
  state: SearchViewState,
  hits: readonly SearchHit[],
  onOpen?: (moleculeId: string, hit: SearchHit) => void,
  onSuggestion?: (suggestion: string) => void,
  optionPrefix = "search-option",
): void {
  if (state.status === "results") {
    const wrapper = element("div");
    const first = hits[0];
    if (first !== undefined && first.match === "fuzzy") {
      wrapper.append(element("p", `Closest: ${first.label}`, "closest"));
    }
    const shown = hits.slice(0, MAX_RESULTS);
    // One phrase naming every row is said once, above them.
    const shared = shown[0]?.badge ?? null;
    const grouped =
      shared !== null && shown.length > 1 && shown.every((hit) => hit.badge === shared);
    // The phrase's own row already names it, so a header would say it twice.
    if (grouped && first?.kind !== "phrase") wrapper.append(element("p", shared, "search-group"));
    const list = element("ul", undefined, "search-results");
    list.setAttribute("role", "listbox");
    shown.forEach((hit, index) => {
      list.append(resultItem(hit, onOpen, index === 0, index, optionPrefix, !grouped));
    });
    list.id = `${optionPrefix === "search-option" ? "atlas-search" : optionPrefix.replace(/-option$/, "")}-listbox`;
    wrapper.append(list);
    container.replaceChildren(wrapper);
    return;
  }

  const wrapper = element("div");
  // The two sentences read as one: what was searched, then which of its words found nothing.
  // An empty field needs no sentence: the label above it already says what to type.
  if (state.status !== "empty") {
    wrapper.append(element("p", state.message));
  }
  if (state.nearest !== undefined && state.nearest.length > 0) {
    wrapper.append(
      element("p", "Nearest descriptors:"),
      suggestionList(state.nearest, "search-nearest", onSuggestion),
    );
  }
  if (state.suggestions.length > 0) {
    wrapper.append(
      element("p", "Try a known smell:"),
      suggestionList(state.suggestions, "search-suggestions", onSuggestion),
    );
  }
  container.replaceChildren(wrapper);
}

/**
 * The atlas uses this field for search. Results are options in a listbox; arrows move the
 * active option, Enter opens it. The field takes focus on a fine pointer only.
 */
export function mountSearch(container: HTMLElement, options: SearchOptions): HTMLInputElement {
  const suggestions = options.suggestions ?? EMPTY_SUGGESTIONS;
  const id = options.id ?? "atlas-search";
  const root = element("div", undefined, "search");
  const label = element("label", options.label ?? "Search the atlas");
  label.htmlFor = id;
  const input = element("input");
  input.id = id;
  input.type = "search";
  input.autocomplete = "off";
  if (options.placeholder !== undefined) input.placeholder = options.placeholder;
  input.value = options.initialQuery ?? "";
  input.setAttribute("role", "combobox");
  input.setAttribute("aria-expanded", "false");
  input.setAttribute("aria-controls", `${id}-listbox`);
  const results = element("div");
  results.id = `${id}-results`;
  const optionPrefix = id === "atlas-search" ? "search-option" : `${id}-option`;

  let hits: SearchHit[] = [];
  let active = 0;

  const open = (hit: SearchHit | undefined): void => {
    if (hit?.moleculeId !== null && hit?.moleculeId !== undefined) {
      options.onOpen(hit.moleculeId, hit);
    }
  };

  const update = (): void => {
    hits = search(options.index, input.value, MAX_RESULTS);
    active = 0;
    options.onResults?.(hits);
    const miss = hits.length === 0 ? explainMiss(options.index, input.value) : undefined;
    renderSearch(
      results,
      searchViewState(input.value, hits, suggestions, miss),
      hits,
      (moleculeId, hit) => options.onOpen(moleculeId, hit),
      fill,
      optionPrefix,
    );
    input.setAttribute("aria-expanded", String(hits.length > 0));
    if (hits.length > 0) input.setAttribute("aria-activedescendant", `${optionPrefix}-0`);
    else input.removeAttribute("aria-activedescendant");
  };

  // A suggestion is a known smell with an exemplar, so one click opens it as Enter would.
  const fill = (suggestion: string): void => {
    input.value = suggestion;
    update();
    open(hits.find((hit) => hit.moleculeId !== null));
  };

  input.addEventListener("input", update);
  input.addEventListener("keydown", (event) => {
    if (hits.length === 0) return;
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const direction = event.key === "ArrowDown" ? 1 : -1;
      active = (active + direction + hits.length) % hits.length;
      const list = results.querySelector('[role="listbox"]');
      if (list !== null) {
        [...list.children].forEach((child, index) => {
          child.setAttribute("aria-selected", index === active ? "true" : "false");
          child.classList.toggle("active", index === active);
        });
        const selected = list.children.item(active);
        if (selected instanceof HTMLElement) {
          input.setAttribute("aria-activedescendant", selected.id);
          selected.scrollIntoView({ block: "nearest" });
        }
      }
    }
    if (event.key === "Enter") {
      event.preventDefault();
      // A phrase with no known example has no card of its own; Enter goes where its deep link does.
      const chosen = hits[active];
      open(chosen?.moleculeId === null ? hits.find((hit) => hit.moleculeId !== null) : chosen);
    }
  });

  root.append(label, input, results);
  container.replaceChildren(root);
  if (options.initialQuery !== null && options.initialQuery !== undefined) update();
  else
    renderSearch(
      results,
      searchViewState("", [], suggestions),
      [],
      (moleculeId, hit) => options.onOpen(moleculeId, hit),
      fill,
      optionPrefix,
    );

  const fine =
    typeof window.matchMedia === "function" && window.matchMedia("(pointer: fine)").matches;
  if (fine && options.autofocus !== false) {
    input.focus();
  }
  return input;
}

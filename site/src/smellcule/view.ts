/**
 * The daily game: a structure, twelve descriptors, and three picks. The view owns only the DOM;
 * scheduling, scoring, share text and storage stay in their own modules.
 */

import { moleculeHref } from "../card/link";
import { type Bundle, predictionRow, structureUrl } from "../data/bundle";
import { listedNames } from "../data/names";
import { copyText } from "../ui/clipboard";
import { element, link } from "../ui/dom";
import { archiveEntries, puzzleDate } from "./archive";
import type { SmellculeBundle, SmellculePuzzle } from "./data";
import {
  clueText,
  type GameState,
  gameReducer,
  INITIAL_GAME_STATE,
  PICKS_REQUIRED,
  SCORE_MAX,
  scorePicks,
  shareText,
} from "./game";
import { puzzleNumber } from "./schedule";
import {
  currentStreak,
  readResults,
  type StoredResults,
  saveResult,
  storedResult,
} from "./storage";

export interface SmellculeContext {
  readonly bundle: Bundle;
  readonly game: SmellculeBundle;
  readonly today: Date;
  readonly storage: Pick<Storage, "getItem" | "setItem"> | null;
  readonly clipboard: Pick<Clipboard, "writeText"> | undefined;
  readonly url: string;
}

function moleculeName(bundle: Bundle, id: string): string {
  return listedNames(bundle.atlas.molecules).get(id) ?? id;
}

function descriptorName(bundle: Bundle, index: number): string {
  return bundle.atlas.labels[index] ?? String(index);
}

function measuredDescriptors(bundle: Bundle, moleculeIndex: number): string[] {
  const molecule = bundle.atlas.molecules[moleculeIndex];
  if (molecule === undefined) return [];
  return molecule.measured
    .map((index) => bundle.atlas.labels[index])
    .filter((label): label is string => label !== undefined);
}

/** The three descriptors the model ranks highest for the puzzle molecule. */
export function modelTopThree(bundle: Bundle, moleculeId: string): number[] {
  const moleculeIndex = bundle.atlas.molecules.findIndex((molecule) => molecule.id === moleculeId);
  if (moleculeIndex === -1) return [];
  const row = predictionRow(bundle, moleculeIndex);
  return [...row.keys()].sort((a, b) => (row[b] ?? 0) - (row[a] ?? 0) || a - b).slice(0, 3);
}

export const NOT_OUT_YET = "Not out yet";
export const STORAGE_BLOCKED = "Streaks are off because this browser blocks storage.";
export const COPIED = "Copied to the clipboard.";
export const COPY_BLOCKED = "Copy was blocked. The share text is selected below.";

export function streakText(days: number): string {
  return `Streak: ${days} day${days === 1 ? "" : "s"}`;
}

export function openingText(startDate: string): string {
  return `Smellcule #1 opens on ${startDate}`;
}

export interface PuzzleResult {
  readonly score: number;
  readonly modelScore: number;
  readonly modelTop: readonly number[];
  readonly share: string;
}

/** The scored result and the exact share line for one played puzzle. */
export function puzzleResult(
  bundle: Bundle,
  puzzle: SmellculePuzzle,
  number: number,
  picks: readonly number[],
  clueShown: boolean,
  url: string,
): PuzzleResult {
  const score = scorePicks(picks, puzzle.answer);
  const modelTop = modelTopThree(bundle, puzzle.moleculeId);
  const modelScore = modelTop.filter((index) => puzzle.answer.includes(index)).length;
  return {
    score,
    modelScore,
    modelTop,
    share: shareText({ puzzle: number, score, modelScore, clueShown, url }),
  };
}

function dots(score: number): string {
  const filled = Math.max(0, Math.min(SCORE_MAX, Math.round(score)));
  return `${"●".repeat(filled)}${"○".repeat(SCORE_MAX - filled)}`;
}

function notOutYet(container: HTMLElement): void {
  const message = element("p", NOT_OUT_YET);
  message.append(" ", link("Play today's puzzle", "#/smellcule"));
  container.replaceChildren(element("h1", "Smellcule"), message);
}

export function renderSmellcule(
  container: HTMLElement,
  context: SmellculeContext,
  number: number | null,
): void {
  const todayNumber = puzzleNumber(context.today, context.game.startDate);
  if (todayNumber === null) {
    if (number !== null) {
      notOutYet(container);
      return;
    }
    const opens = element("h1", "Smellcule");
    const message = element("p", openingText(context.game.startDate));
    container.replaceChildren(opens, message);
    return;
  }

  const puzzleNumberToday = number ?? todayNumber;
  if (puzzleNumberToday > todayNumber) {
    notOutYet(container);
    return;
  }
  if (puzzleNumberToday < 1) {
    container.replaceChildren(
      element("h1", "Smellcule"),
      element("p", "That puzzle does not exist."),
    );
    return;
  }
  const puzzle: SmellculePuzzle | undefined = context.game.puzzles[puzzleNumberToday - 1];
  if (puzzle === undefined) {
    const message = element("p", `Puzzle ${puzzleNumberToday} is not published.`);
    message.append(" ", link("Play today's puzzle", "#/smellcule"));
    container.replaceChildren(element("h1", "Smellcule"), message);
    return;
  }

  const section = element("section", undefined, "game");
  section.append(
    element("h1", `Smellcule ${puzzleNumberToday}`),
    element("p", `Puzzle for ${puzzleDate(context.game.startDate, puzzleNumberToday)}`),
  );

  const figure = element("figure");
  const image = element("img");
  image.src = structureUrl(context.bundle, puzzle.moleculeId);
  image.alt = "Structure of the day's molecule";
  image.width = 240;
  image.height = 180;
  const formula = context.bundle.atlas.molecules.find(
    (molecule) => molecule.id === puzzle.moleculeId,
  )?.formula;
  figure.append(image);
  if (formula !== undefined) figure.append(element("figcaption", formula, "mono"));
  section.append(figure);

  const storageNotice = element("p", STORAGE_BLOCKED, "notice");
  const showStorageNotice = (): void => {
    if (!storageNotice.isConnected) section.insertBefore(storageNotice, figure);
  };
  if (context.storage === null) showStorageNotice();

  let state: GameState = INITIAL_GAME_STATE;
  let stored = false;
  let saved: StoredResults | null = null;
  const options = element("div", undefined, "options");
  const optionButtons = new Map<number, HTMLButtonElement>();
  for (const option of puzzle.options) {
    const button = element("button", descriptorName(context.bundle, option));
    button.type = "button";
    button.setAttribute("aria-pressed", "false");
    button.addEventListener("click", () => {
      state = gameReducer(state, {
        type: state.picks.includes(option) ? "unpick" : "pick",
        option,
      });
      draw();
    });
    optionButtons.set(option, button);
    options.append(button);
  }
  section.append(options);

  const controls = element("div", undefined, "controls");
  const clueButton = element("button", "Show a clue");
  clueButton.type = "button";
  const submit = element("button", "Submit");
  submit.type = "button";
  controls.append(clueButton, submit);
  section.append(controls);

  const clue = element("p", undefined, "clue");
  clue.hidden = true;
  const reveal = element("div", undefined, "reveal");
  section.append(clue, reveal);

  clueButton.addEventListener("click", () => {
    state = gameReducer(state, { type: "showClue" });
    draw();
  });
  submit.addEventListener("click", () => {
    state = gameReducer(state, { type: "submit" });
    draw();
  });

  const describeClue = (): string => {
    const clueMolecule = context.bundle.atlas.molecules[puzzle.clueId];
    const name =
      clueMolecule === undefined
        ? "Unknown molecule"
        : moleculeName(context.bundle, clueMolecule.id);
    return clueText(
      name,
      puzzle.clueSimilarity,
      measuredDescriptors(context.bundle, puzzle.clueId),
    );
  };

  const renderReveal = (): void => {
    const outcome = puzzleResult(
      context.bundle,
      puzzle,
      puzzleNumberToday,
      state.picks,
      state.clueShown,
      context.url,
    );
    if (!stored) {
      stored = true;
      if (context.storage !== null) {
        try {
          saved = saveResult(context.storage, {
            puzzle: puzzleNumberToday,
            score: outcome.score,
            modelScore: outcome.modelScore,
            clueShown: state.clueShown,
            daily: puzzleNumberToday === todayNumber,
          });
        } catch {
          // A full or disabled store must not hide the result the visitor just earned.
          showStorageNotice();
        }
      }
    }

    const result = element("div");
    result.append(element("h3", moleculeName(context.bundle, puzzle.moleculeId)));
    result.append(
      element("p", `You: ${dots(outcome.score)}  Model: ${dots(outcome.modelScore)}`, "mono"),
    );

    const measured = element(
      "p",
      `Measured: ${measuredDescriptors(
        context.bundle,
        context.bundle.atlas.molecules.findIndex((molecule) => molecule.id === puzzle.moleculeId),
      ).join(", ")}`,
    );
    result.append(measured);
    result.append(
      element(
        "p",
        `Model top 3: ${outcome.modelTop
          .map((index) => descriptorName(context.bundle, index))
          .join(", ")}`,
      ),
    );

    if (saved !== null) result.append(element("p", streakText(currentStreak(saved, todayNumber))));

    const shared = element("pre", outcome.share);
    shared.className = "share";
    const copy = element("button", "Copy");
    copy.type = "button";
    const copyStatus = element("p", undefined, "copy-status");
    copyStatus.setAttribute("role", "status");
    const copyShare = async (): Promise<void> => {
      const copied = await copyText(outcome.share, context.clipboard);
      copyStatus.textContent = copied === "copied" ? COPIED : COPY_BLOCKED;
      if (copied === "blocked") window.getSelection()?.selectAllChildren(shared);
    };
    copy.addEventListener("click", () => void copyShare());
    result.append(copy, copyStatus, shared);
    result.append(link("Open in atlas", moleculeHref(puzzle.moleculeId)));
    reveal.replaceChildren(result);
  };

  const draw = (): void => {
    for (const [option, button] of optionButtons) {
      const picked = state.picks.includes(option);
      button.setAttribute("aria-pressed", picked ? "true" : "false");
      button.disabled = state.status === "revealed";
    }
    submit.disabled = state.picks.length !== PICKS_REQUIRED || state.status === "revealed";
    clueButton.hidden = state.clueShown || state.status === "revealed";
    if (state.clueShown) {
      clue.hidden = false;
      clue.textContent = describeClue();
    }
    if (state.status === "revealed") renderReveal();
  };

  container.replaceChildren(section);
  draw();
}

export function renderSmellculeArchive(container: HTMLElement, context: SmellculeContext): void {
  const todayNumber = puzzleNumber(context.today, context.game.startDate);
  const section = element("section", undefined, "archive");
  section.append(element("h1", "Smellcule archive"));
  section.append(link("Play today's puzzle", "#/smellcule"));

  if (todayNumber === null) {
    section.append(element("p", openingText(context.game.startDate)));
    container.replaceChildren(section);
    return;
  }

  const results = context.storage === null ? null : readResults(context.storage);
  const entries = archiveEntries(
    context.game.startDate,
    context.today,
    context.game.puzzles.length,
  );
  if (entries.length === 0) {
    section.append(element("p", "No finished puzzles yet."));
    container.replaceChildren(section);
    return;
  }

  const list = element("ol");
  for (const entry of entries) {
    const item = element("li");
    item.append(link(`Smellcule ${entry.number}`, `#/smellcule/${entry.number}`));
    item.append(element("span", entry.date, "detail"));
    const result = results === null ? null : storedResult(results, entry.number);
    if (result !== null) {
      const clue = result.clueShown ? " +clue" : "";
      item.append(
        element(
          "span",
          `you ${dots(result.score)}${clue}  model ${dots(result.modelScore)}`,
          "mono",
        ),
      );
    }
    list.append(item);
  }
  section.append(list);
  container.replaceChildren(section);
}

/** One line per stored result, oldest first, each marked retired. */
export function retiredResultLines(results: StoredResults): string[] {
  return Object.values(results.results)
    .sort((a, b) => a.puzzle - b.puzzle)
    .map((result) => {
      const clue = result.clueShown ? " +clue" : "";
      return `Smellcule ${result.puzzle}  you ${dots(result.score)}${clue}  model ${dots(result.modelScore)}  retired`;
    });
}

export function renderSmellculeRetired(
  container: HTMLElement,
  retiredPuzzles: number,
  storage: Pick<Storage, "getItem"> | null,
): void {
  const section = element("section", undefined, "archive");
  section.append(
    element("h1", "Smellcule has retired"),
    element(
      "p",
      `The daily game is not part of this catalogue, and its ${retiredPuzzles} reserved puzzle numbers will not be played.`,
    ),
    link("Search the atlas", "#/atlas"),
  );
  const lines = storage === null ? [] : retiredResultLines(readResults(storage));
  if (lines.length > 0) {
    section.append(element("h3", "Your results"));
    const list = element("ol");
    for (const line of lines) list.append(element("li", line, "mono"));
    section.append(list);
  }
  container.replaceChildren(section);
}

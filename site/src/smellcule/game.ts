/**
 * The daily puzzle's state machine. It is pure so the interface can render any state and tests
 * can play a puzzle without a browser.
 */

export const PICKS_REQUIRED = 3;
export const SCORE_MAX = 3;

export type GameStatus = "choosing" | "revealed";

export interface GameState {
  readonly status: GameStatus;
  readonly picks: number[];
  readonly clueShown: boolean;
}

export type GameAction =
  | { readonly type: "pick"; readonly option: number }
  | { readonly type: "unpick"; readonly option: number }
  | { readonly type: "showClue" }
  | { readonly type: "submit" };

export const INITIAL_GAME_STATE: GameState = {
  status: "choosing",
  picks: [],
  clueShown: false,
};

function pick(state: GameState, option: number): GameState {
  if (state.picks.includes(option) || state.picks.length >= PICKS_REQUIRED) return state;
  return { ...state, picks: [...state.picks, option] };
}

function unpick(state: GameState, option: number): GameState {
  if (!state.picks.includes(option)) return state;
  return { ...state, picks: state.picks.filter((picked) => picked !== option) };
}

export function gameReducer(state: GameState, action: GameAction): GameState {
  if (state.status === "revealed") return state;
  switch (action.type) {
    case "pick":
      return pick(state, action.option);
    case "unpick":
      return unpick(state, action.option);
    case "showClue":
      return state.clueShown ? state : { ...state, clueShown: true };
    case "submit":
      return state.picks.length === PICKS_REQUIRED ? { ...state, status: "revealed" } : state;
  }
}

/** Counts picks that name one of the puzzle's measured descriptors. */
export function scorePicks(picks: readonly number[], answer: readonly number[]): number {
  const correct = new Set(answer);
  return picks.filter((pick) => correct.has(pick)).length;
}

export interface ShareResult {
  readonly puzzle: number;
  readonly score: number;
  readonly modelScore: number;
  readonly clueShown: boolean;
  readonly url: string;
}

function dots(score: number): string {
  const filled = Math.max(0, Math.min(SCORE_MAX, Math.round(score)));
  return `${"●".repeat(filled)}${"○".repeat(SCORE_MAX - filled)}`;
}

export function shareText(result: ShareResult): string {
  const you = result.clueShown ? `you ${dots(result.score)} +clue` : `you ${dots(result.score)}`;
  return [`Smellcule ${result.puzzle}`, you, `model ${dots(result.modelScore)}`, result.url].join(
    "  ",
  );
}

export function clueText(name: string, similarity: number, descriptors: readonly string[]): string {
  const smells = descriptors.length === 0 ? "no measured descriptors" : descriptors.join(", ");
  return `Closest structure the model trained on: ${name} (structure similarity ${similarity.toFixed(2)}) smells ${smells}`;
}

/**
 * The bundle error panel. Its content is a pure value so the wording can be checked without a
 * DOM, and the mount function is the only part that touches the page. The plain sentence comes
 * first; the file-level reason sits behind a disclosure for anyone who needs it.
 */

export interface ErrorPanelContent {
  readonly what: string;
  readonly hint: string;
  readonly reason: string;
  readonly retryLabel: string;
}

export function errorPanelContent(error: unknown): ErrorPanelContent {
  const reason = (error instanceof Error ? error.message : String(error)).replace(/\.$/, "");
  return {
    what: "The atlas didn't load.",
    hint: "The map data didn't arrive in full. Check your connection and try again.",
    reason,
    retryLabel: "Try again",
  };
}

export function mountErrorPanel(container: HTMLElement, error: unknown, retry: () => void): void {
  const content = errorPanelContent(error);
  const section = document.createElement("section");
  section.setAttribute("role", "alert");

  const what = document.createElement("h1");
  what.textContent = content.what;
  const hint = document.createElement("p");
  hint.textContent = content.hint;

  const button = document.createElement("button");
  button.type = "button";
  button.textContent = content.retryLabel;
  button.addEventListener("click", retry);

  const more = document.createElement("details");
  const summary = document.createElement("summary");
  summary.textContent = "What went wrong";
  const detail = document.createElement("p");
  detail.textContent = content.reason;
  more.append(summary, detail);

  section.append(what, hint, button, more);
  container.replaceChildren(section);
}

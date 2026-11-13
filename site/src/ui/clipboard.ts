/**
 * Copying is a permission the browser may refuse, so the outcome is a value the view can turn
 * into a visible message instead of an exception.
 */

export type CopyOutcome = "copied" | "blocked";

export async function copyText(
  text: string,
  clipboard: Pick<Clipboard, "writeText"> | undefined,
): Promise<CopyOutcome> {
  if (clipboard === undefined) return "blocked";
  try {
    await clipboard.writeText(text);
    return "copied";
  } catch {
    return "blocked";
  }
}

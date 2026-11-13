import type { Page } from "@playwright/test";

/**
 * Records when `selector` first matches, in milliseconds from navigation start. It keeps its own
 * record because a page clock replaces the performance timeline's marks.
 */
export async function markWhenShown(page: Page, selector: string, name: string): Promise<void> {
  await page.addInitScript(
    ([wanted, mark]) => {
      const record = window as unknown as { shownAt?: Record<string, number> };
      record.shownAt ??= {};
      const shown = record.shownAt;
      new MutationObserver((_, observer) => {
        if (document.querySelector(wanted) === null) return;
        shown[mark] = performance.now();
        observer.disconnect();
      }).observe(document, { childList: true, subtree: true, attributes: true });
    },
    [selector, name] as const,
  );
}

export function shownAt(page: Page, name: string): Promise<number | null> {
  return page.evaluate(
    (mark) => (window as unknown as { shownAt?: Record<string, number> }).shownAt?.[mark] ?? null,
    name,
  );
}

/** A mark the site itself sets, such as the atlas's first frame. */
export function markTime(page: Page, name: string): Promise<number | null> {
  return page.evaluate(
    (mark) => performance.getEntriesByName(mark, "mark")[0]?.startTime ?? null,
    name,
  );
}

/** Frame times while `act` runs, from a requestAnimationFrame probe. */
export async function frameTimes(page: Page, act: () => Promise<void>): Promise<number[]> {
  await page.evaluate(() => {
    const probe = window as unknown as { frameProbe: { frames: number[]; stop: boolean } };
    probe.frameProbe = { frames: [], stop: false };
    let last = performance.now();
    const tick = (now: number): void => {
      probe.frameProbe.frames.push(now - last);
      last = now;
      if (!probe.frameProbe.stop) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  await act();
  return page.evaluate(() => {
    const probe = (window as unknown as { frameProbe: { frames: number[]; stop: boolean } })
      .frameProbe;
    probe.stop = true;
    return probe.frames.slice(1);
  });
}

export function percentile95(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1)] ?? 0;
}

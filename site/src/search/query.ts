/**
 * Query handling for the atlas route. A sample sentence such as "smells like rain" is reduced
 * to the phrase it names, and `?q=` is read from either the hash route or the search string.
 */

const INTENT = /^(?:smells?\s+(?:like|of)|smells?|like)\s+/i;

export function stripIntent(query: string): string {
  const stripped = query
    .trim()
    .replace(INTENT, "")
    .replace(/[.,;:!?]+$/u, "")
    .trim();
  return stripped.length === 0 ? query.trim() : stripped;
}

function queryAfter(value: string): string | null {
  const index = value.indexOf("?");
  return index === -1 ? null : value.slice(index + 1);
}

export function parseQuery(href: string): string | null {
  const hashIndex = href.indexOf("#");
  const hash = hashIndex === -1 ? null : href.slice(hashIndex + 1);
  const beforeHash = hashIndex === -1 ? href : href.slice(0, hashIndex);
  const raw = (hash === null ? null : queryAfter(hash)) ?? queryAfter(beforeHash);
  if (raw === null) return null;
  const query = new URLSearchParams(raw).get("q")?.trim();
  return query ? query : null;
}

export function searchHref(query: string): string {
  return `#/atlas?q=${encodeURIComponent(query)}`;
}

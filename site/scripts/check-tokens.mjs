#!/usr/bin/env node
/**
 * Keeps the type scale, spacing and palette in `src/tokens.css`. Every other stylesheet must
 * reach sizes, spacing, radii and colours through a `var(--…)` token, so a one-off value cannot
 * drift in. `0` needs no token, and media-query widths are not declarations, so they pass.
 */

import { readdirSync, readFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const TOKEN_FILE = "tokens.css";

const SIZED_PROPERTIES =
  /^(font-size|line-height|letter-spacing|gap|row-gap|column-gap|border-radius|border-(top|bottom)-(left|right)-radius|margin|margin-(top|right|bottom|left|block|inline)(-(start|end))?|padding|padding-(top|right|bottom|left|block|inline)(-(start|end))?)$/;

const COLOUR_LITERAL = /#[0-9a-f]{3,8}\b|\b(rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)\(/i;

/** Removes `var(...)` calls, including nested fallbacks, so only literal values remain. */
function withoutTokens(value) {
  let previous;
  let current = value;
  do {
    previous = current;
    current = current.replace(/var\(--[\w-]+(?:\s*,[^()]*)?\)/g, "");
  } while (current !== previous);
  return current;
}

/** A unitless factor is allowed beside a token, as in `calc(var(--space-2) * 2)`. */
function hasLiteralSize(value) {
  const scaled = value.includes("var(--");
  const numbers = withoutTokens(value).match(/-?(?:\d*\.)?\d+[a-z%]*/gi) ?? [];
  return numbers.some(
    (number) =>
      !/^-?0(?:\.0+)?[a-z%]*$/i.test(number) && !(scaled && /^-?(?:\d*\.)?\d+$/.test(number)),
  );
}

/** Every rule that breaks the token contract in one stylesheet, as `file:line message`. */
export function tokenViolations(css, file) {
  const violations = [];
  const source = css.replace(/\/\*[\s\S]*?\*\//g, (comment) => comment.replace(/[^\n]/g, " "));
  const declaration = /([a-z-]+)\s*:\s*([^;{}]+);/gi;
  for (const match of source.matchAll(declaration)) {
    const property = match[1].toLowerCase();
    const value = match[2].trim();
    const line = source.slice(0, match.index).split("\n").length;
    if (SIZED_PROPERTIES.test(property) && hasLiteralSize(value)) {
      violations.push(`${file}:${line} ${property}: ${value} must use a var(--…) token`);
    }
    if (COLOUR_LITERAL.test(withoutTokens(value))) {
      violations.push(`${file}:${line} ${property}: ${value} has a colour outside ${TOKEN_FILE}`);
    }
  }
  return violations;
}

function stylesheets(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return stylesheets(path);
    return entry.name.endsWith(".css") && entry.name !== TOKEN_FILE ? [path] : [];
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const root = fileURLToPath(new URL("..", import.meta.url));
  const sourceRoot = resolve(root, process.argv[2] ?? "src");
  const violations = stylesheets(sourceRoot).flatMap((path) =>
    tokenViolations(readFileSync(path, "utf8"), relative(root, path)),
  );
  for (const violation of violations) console.error(`check-tokens: ${violation}`);
  if (violations.length > 0) {
    console.error(`next: add the value to src/${TOKEN_FILE} and use it through var(--…)`);
    process.exitCode = 1;
  }
}

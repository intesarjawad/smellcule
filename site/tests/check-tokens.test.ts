import { describe, expect, it } from "vitest";
import { tokenViolations } from "../scripts/check-tokens.mjs";

const STYLESHEET = `
/* 14px in a comment is not a rule */
.title {
  font-size: 14px;
  margin: 0 auto;
}

@media (max-width: 900px) {
  .card {
    color: #f1e9dc;
    padding: var(--space-4) 0;
    gap: calc(var(--space-2) * 2);
  }
}

.badge {
  border-radius: var(--radius-small);
  background: rgba(0, 0, 0, 0.5);
  line-height: 1.5;
  color: var(--ink);
}
`;

describe("tokenViolations", () => {
  const violations = tokenViolations(STYLESHEET, "fixture.css");

  it("rejects a raw px font size", () => {
    expect(violations).toContain("fixture.css:4 font-size: 14px must use a var(--…) token");
  });

  it("rejects a hex colour and a colour function outside tokens.css", () => {
    expect(violations).toContain("fixture.css:10 color: #f1e9dc has a colour outside tokens.css");
    expect(violations).toContain(
      "fixture.css:18 background: rgba(0, 0, 0, 0.5) has a colour outside tokens.css",
    );
  });

  it("rejects a unitless line height", () => {
    expect(violations).toContain("fixture.css:19 line-height: 1.5 must use a var(--…) token");
  });

  it("accepts tokens, zero, keywords and media-query widths", () => {
    expect(violations).toHaveLength(4);
  });
});

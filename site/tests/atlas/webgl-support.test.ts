import { describe, expect, it } from "vitest";
import { supportsWebGL2 } from "../../src/atlas/webgl-support";

describe("supportsWebGL2", () => {
  it("accepts a canvas that returns a context", () => {
    expect(supportsWebGL2({ getContext: () => ({}) })).toBe(true);
  });

  it("rejects a canvas without a context", () => {
    expect(supportsWebGL2({ getContext: () => null })).toBe(false);
  });

  it("rejects a browser that throws while probing", () => {
    expect(
      supportsWebGL2({
        getContext: () => {
          throw new Error("blocked");
        },
      }),
    ).toBe(false);
  });
});

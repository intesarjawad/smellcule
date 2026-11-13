import { describe, expect, it } from "vitest";
import { BundleError } from "../../src/data/validate";
import { errorPanelContent } from "../../src/ui/error-panel";

describe("errorPanelContent", () => {
  it("says it in plain words and keeps the file-level reason apart", () => {
    const content = errorPanelContent(
      new BundleError("predictions.bin: expected 1130 bytes for 10 molecules x 113 descriptors."),
    );
    expect(content.what).toBe("The atlas didn't load.");
    expect(content.what + content.hint).not.toMatch(/\.bin|\.json|HTTP/);
    expect(content.reason).toBe(
      "predictions.bin: expected 1130 bytes for 10 molecules x 113 descriptors",
    );
    expect(content.retryLabel).toBe("Try again");
  });

  it("keeps a plain thrown value readable", () => {
    expect(errorPanelContent("offline").reason).toBe("offline");
  });
});

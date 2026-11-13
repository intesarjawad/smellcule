import { describe, expect, it } from "vitest";
import { releaseAssetUrl } from "../../src/ui/footer";

describe("releaseAssetUrl", () => {
  it("points at the release asset built from the bundle version", () => {
    expect(releaseAssetUrl("0.1.0")).toBe(
      "https://github.com/intesarjawad/smellcule/releases/download/v0.1.0/atlas-data-0.1.0.tar.gz",
    );
  });
});

import { describe, expect, it } from "vitest";
import { copyText } from "../../src/ui/clipboard";

describe("copyText", () => {
  it("reports a copy the clipboard accepted", async () => {
    const written: string[] = [];
    const clipboard = { writeText: async (text: string) => void written.push(text) };
    expect(await copyText("Smellcule 1", clipboard)).toBe("copied");
    expect(written).toEqual(["Smellcule 1"]);
  });

  it("reports a refused write as blocked", async () => {
    const clipboard = {
      writeText: () => Promise.reject(new DOMException("denied", "NotAllowedError")),
    };
    expect(await copyText("Smellcule 1", clipboard)).toBe("blocked");
  });

  it("reports a browser without a clipboard as blocked", async () => {
    expect(await copyText("Smellcule 1", undefined)).toBe("blocked");
  });
});

import { describe, expect, it } from "vitest";
import { cameraNudge, nudgeOrbit, shortcutFor } from "../../src/ui/keyboard";

const press = { key: "/", typing: false, modified: false, onCard: false };
const distance = { min: 40, max: 600 };

describe("shortcutFor", () => {
  it("focuses search on / unless the user is typing", () => {
    expect(shortcutFor(press)).toBe("focus-search");
    expect(shortcutFor({ ...press, typing: true })).toBeNull();
    expect(shortcutFor({ ...press, modified: true })).toBeNull();
  });

  it("closes the card on Escape only when a card is open", () => {
    expect(shortcutFor({ ...press, key: "Escape", onCard: true })).toBe("close-card");
    expect(shortcutFor({ ...press, key: "Escape" })).toBeNull();
  });
});

describe("nudgeOrbit", () => {
  const orbit = { radius: 300, phi: Math.PI / 2, theta: 0 };

  it("turns the camera around the target with the arrow keys", () => {
    const left = cameraNudge("ArrowLeft");
    const up = cameraNudge("ArrowUp");
    if (left === null || up === null) throw new Error("arrow keys must orbit");
    expect(nudgeOrbit(orbit, left, distance).theta).toBeLessThan(0);
    expect(nudgeOrbit(orbit, up, distance).phi).toBeLessThan(orbit.phi);
    expect(nudgeOrbit(orbit, left, distance).radius).toBe(300);
  });

  it("zooms in with + and out with -, inside the distance limits", () => {
    const zoomIn = cameraNudge("+");
    const zoomOut = cameraNudge("-");
    if (zoomIn === null || zoomOut === null) throw new Error("+ and - must zoom");
    expect(nudgeOrbit(orbit, zoomIn, distance).radius).toBeLessThan(300);
    expect(nudgeOrbit(orbit, zoomOut, distance).radius).toBeGreaterThan(300);
    expect(nudgeOrbit({ ...orbit, radius: 41 }, zoomIn, distance).radius).toBe(40);
    expect(nudgeOrbit({ ...orbit, radius: 590 }, zoomOut, distance).radius).toBe(600);
  });

  it("stops short of the poles", () => {
    const up = cameraNudge("ArrowUp");
    if (up === null) throw new Error("ArrowUp must orbit");
    const top = nudgeOrbit({ ...orbit, phi: 0.02 }, up, distance);
    expect(top.phi).toBeGreaterThan(0);
  });

  it("ignores other keys", () => {
    expect(cameraNudge("a")).toBeNull();
  });
});

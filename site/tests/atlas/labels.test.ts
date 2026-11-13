import { describe, expect, it } from "vitest";
import { type LabelCandidate, placeLabels } from "../../src/atlas/labels";

const bounds = { width: 400, height: 300 };
const first: LabelCandidate = {
  id: "a",
  text: "First",
  x: 100,
  y: 100,
  width: 40,
  height: 12,
};

describe("placeLabels", () => {
  it("puts a label beside its anchor with a small gap", () => {
    expect(placeLabels([first], bounds)).toEqual([{ ...first, left: 108, top: 94 }]);
  });

  it("flips a label to the left near the right edge", () => {
    const nearEdge = { ...first, x: 380 };
    expect(placeLabels([nearEdge], bounds)[0]?.left).toBe(332);
  });

  it("keeps a label inside the top and bottom margins", () => {
    expect(placeLabels([{ ...first, y: 2 }], bounds)[0]?.top).toBe(4);
    expect(placeLabels([{ ...first, y: 299 }], bounds)[0]?.top).toBe(284);
  });

  it("drops a candidate whose anchor is outside the stage", () => {
    expect(placeLabels([{ ...first, x: 401 }], bounds)).toEqual([]);
    expect(placeLabels([{ ...first, y: -1 }], bounds)).toEqual([]);
  });

  it("keeps the first label and drops one that would cover it", () => {
    const overlapping = { ...first, id: "b", text: "Second", x: 110 };
    const separate = { ...first, id: "c", text: "Third", y: 200 };
    const placed = placeLabels([first, overlapping, separate], bounds);
    expect(placed.map((label) => label.id)).toEqual(["a", "c"]);
  });
});

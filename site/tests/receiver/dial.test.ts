import { describe, expect, it } from "vitest";
import {
  buildDial,
  memoryOf,
  nearestStation,
  placeOf,
  primaryFamily,
  stackLabels,
} from "../../src/receiver/bands";
import {
  DEPART_SPAN,
  departure,
  holeRow,
  noiseAt,
  noiseField,
  pickWords,
  RIVER_INSET,
  riverOf,
  SLOT_WIDTH,
  signalWords,
} from "../../src/receiver/signal";

const labels = ["lemon", "orange", "pine", "cedar", "smoke"];
const families = [
  { name: "citrus", colour: "#f2c53d", labels: ["lemon", "orange"] },
  { name: "woody", colour: "#b98250", labels: ["pine", "cedar"] },
];

function molecule(id: string, measured: number[]) {
  return {
    id,
    name: `M${id}`,
    cas: null,
    casCheckDigit: "unlisted" as const,
    formula: "C",
    split: "train" as const,
    nearestTrainSimilarity: null,
    measured,
    neighbours: [],
  };
}

describe("primaryFamily", () => {
  const familyOf = new Map([
    ["lemon", "citrus"],
    ["orange", "citrus"],
    ["pine", "woody"],
    ["cedar", "woody"],
  ]);

  it("takes the family most measured descriptors name", () => {
    expect(primaryFamily([2, 0, 3], labels, familyOf)).toBe("woody");
  });

  it("breaks a tie in favour of the family named first", () => {
    expect(primaryFamily([2, 0], labels, familyOf)).toBe("woody");
    expect(primaryFamily([0, 2], labels, familyOf)).toBe("citrus");
  });

  it("has no family when no measured descriptor belongs to one", () => {
    expect(primaryFamily([4], labels, familyOf)).toBeNull();
    expect(primaryFamily([], labels, familyOf)).toBeNull();
  });
});

describe("buildDial", () => {
  // Citrus stations lie on a line along x; woody ones along y; one molecule has no family.
  const molecules = [
    molecule("a", [0]),
    molecule("b", [1]),
    molecule("c", [0, 1]),
    molecule("d", [2]),
    molecule("e", [3]),
    molecule("f", [4]),
  ];
  const positions = new Float32Array([0, 0, 0, 2, 0, 0, 1, 0, 0, 5, 0, 0, 5, 3, 0, 9, 9, 9]);
  const dial = buildDial({ labels, families, molecules }, positions);

  it("puts every molecule with a family on exactly one band and counts the rest", () => {
    expect(dial.bands.map((band) => band.stations.length)).toEqual([3, 2]);
    expect(dial.offDial).toBe(1);
    expect(dial.bandOf.has("f")).toBe(false);
  });

  it("orders a band along its principal axis and spans 0 to 1", () => {
    const citrus = dial.bands[0]?.stations ?? [];
    const order = citrus.map((station) => station.id);
    expect([order, [...order].reverse()]).toContainEqual(["a", "c", "b"]);
    expect(citrus.map((station) => station.at)).toEqual([0, 0.5, 1]);
  });

  it("finds the nearest station and where a molecule sits", () => {
    const citrus = dial.bands[0];
    if (citrus === undefined) throw new Error("missing band");
    expect(nearestStation(citrus, 0.2)).toBe(0);
    expect(nearestStation(citrus, 0.3)).toBe(1);
    expect(nearestStation(citrus, 0.99)).toBe(2);
    expect(placeOf(dial, "e")?.band).toBe(1);
    expect(placeOf(dial, "f")).toBeNull();
  });
});

describe("signal", () => {
  const colours = new Map([
    ["lemon", "#f2c53d"],
    ["pine", "#b98250"],
  ]);
  const words = signalWords(
    labels,
    [0.9, 0, 0.3, 0.05, 0.6],
    [0.1, 0, 0.2, 0, 0.05],
    colours,
    "#f0501e",
  );

  it("keeps the predicted descriptors in falling order with their colour and spread", () => {
    expect(words.map((word) => word.label)).toEqual(["lemon", "smoke", "pine", "cedar"]);
    expect(words[0]).toMatchObject({ colour: "#f2c53d", spread: 0.1 });
    expect(words[1]?.colour).toBe("#f0501e");
  });

  it("picks embers in proportion to probability, the same way every time", () => {
    const picks = pickWords(words, 4000, 7);
    expect(pickWords(words, 4000, 7)).toEqual(picks);
    const share = picks.filter((pick) => pick === 0).length / picks.length;
    expect(share).toBeGreaterThan(0.45);
    expect(share).toBeLessThan(0.55);
  });

  it("reads the noise field the way a linear texture does and departs within the span", () => {
    const field = noiseField(3);
    expect(noiseAt(field, 0, 0)).toBeCloseTo((field[0] ?? 0) / 255, 6);
    for (const [u, v] of [
      [0, 0],
      [0.5, 0.5],
      [1, 1],
    ] as const) {
      const leaves = departure(field, u, v);
      expect(leaves).toBeGreaterThanOrEqual(0);
      expect(leaves).toBeLessThanOrEqual(DEPART_SPAN);
    }
  });
});

describe("memoryOf", () => {
  const neighbours = [
    { id: "2", name: "Rose oxide", odour: 0.98 },
    { id: "3", name: "Nerol oxide", odour: 0.94 },
    { id: "4", name: "Limonene", odour: 0.9 },
    { id: "5", name: "Limonene", odour: 0.89 },
  ];
  const memory = memoryOf("Rose oxide", neighbours, (id) => (id === "2" ? "16409-43-1" : null));

  it("leaves out the station's own isomers and names each by its CAS", () => {
    expect(memory.entries.map((entry) => entry.id)).toEqual(["3", "4"]);
    expect(memory.isomers).toEqual(["16409-43-1"]);
  });
});

describe("stackLabels", () => {
  const labels = [
    { x: 50, width: 40, centred: true },
    { x: 60, width: 30, centred: false },
    { x: 100, width: 30, centred: false },
    { x: 190, width: 30, centred: false },
    { x: 62, width: 20, centred: false },
  ];

  it("puts each label on the first line it clears, in priority order", () => {
    expect(stackLabels(labels, [0, 1, 2, 3, 4], 2, 6, 0, 230)).toEqual([
      { index: 0, lane: 0 },
      { index: 1, lane: 1 },
      { index: 2, lane: 0 },
      { index: 3, lane: 0 },
    ]);
  });

  it("drops labels that run past the edges", () => {
    expect(stackLabels(labels, [3], 1, 6, 0, 210)).toEqual([]);
  });
});

describe("riverOf", () => {
  const glass = { x: 20, y: 10, width: 600, height: 400 };
  const beside = { x: 650, y: 10, width: 200, height: 600 };
  const below = { x: 20, y: 440, width: 600, height: 60 };

  it("runs out of the right side of the glass, level with the nearest row of holes", () => {
    const river = riverOf(glass, beside, 9, 2.4);
    const { stride } = holeRow(beside.height, 9);
    expect(river.down).toBe(false);
    expect(Math.abs(river.y - (410 - RIVER_INSET))).toBeLessThanOrEqual(stride / 2);
    const row = (river.y - beside.y - 4.5) / stride;
    expect(row).toBeCloseTo(Math.round(row));
    expect(river.mouth).toEqual([620, river.y]);
    expect(river.entry).toEqual([650, river.y]);
    expect(410 - (river.y + SLOT_WIDTH / 2)).toBeGreaterThan(0);
  });

  it("cuts the port in place of the first hole, an ordinary gap short of the next", () => {
    const river = riverOf(glass, beside, 9, 2.4);
    const { stride } = holeRow(beside.width, 9);
    const end = river.slot.x + river.slot.width;
    expect(river.slot.y + river.slot.height / 2).toBe(river.y);
    expect(river.slot.height).toBe(SLOT_WIDTH + 2);
    expect(end).toBeCloseTo(650 + 4.5 + 2.4);
    expect(650 + 4.5 + stride - 2.4 - end).toBeCloseTo(stride - 2 * 2.4);
  });

  it("leaves out the port's hole and the ones just above and below it", () => {
    const { bare, y } = riverOf(glass, beside, 9, 2.4);
    const { stride } = holeRow(beside.height, 9);
    const centre = y - beside.y;
    expect(bare).toMatchObject({ x: 0, width: 9 });
    expect(centre - bare.y).toBeCloseTo(stride + 4.5);
    expect(bare.y + bare.height - centre).toBeCloseTo(stride + 4.5);
  });

  it("drops through the bottom of the glass onto the hole column nearest the middle", () => {
    const river = riverOf(glass, below, 9, 2.4);
    const { stride } = holeRow(below.width, 9);
    expect(river.down).toBe(true);
    expect(river.mouth[1]).toBe(410);
    expect(river.entry[1]).toBe(440);
    expect(river.slot).toMatchObject({ y: 410 });
    expect(Math.abs(river.entry[0] - (20 + 300))).toBeLessThanOrEqual(stride / 2 + 1e-9);
    expect((river.entry[0] - 20 - 4.5) / stride).toBeCloseTo(
      Math.round((river.entry[0] - 24.5) / stride),
    );
  });

  it("ends the dropped port at its first hole and leaves out the holes either side", () => {
    const river = riverOf(glass, below, 9, 2.4);
    const { stride } = holeRow(below.width, 9);
    const centre = river.entry[0] - below.x;
    expect(river.slot.y + river.slot.height).toBeCloseTo(440 + 4.5 + 2.4);
    expect(river.bare).toMatchObject({ y: 0, height: 9 });
    expect(centre - river.bare.x).toBeCloseTo(stride + 4.5);
    expect(river.bare.x + river.bare.width - centre).toBeCloseTo(stride + 4.5);
  });
});

describe("holeRow", () => {
  it("fits whole holes and spreads them so the last one ends at the edge", () => {
    const { count, stride } = holeRow(285, 9);
    expect(count).toBe(31);
    expect((count - 1) * stride + 9).toBeCloseTo(285);
    expect(stride).toBeGreaterThanOrEqual(9);
  });

  it("keeps one hole on a side shorter than two pitches", () => {
    expect(holeRow(12, 9)).toEqual({ count: 1, stride: 9 });
  });
});

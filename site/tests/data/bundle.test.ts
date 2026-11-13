import { describe, expect, it } from "vitest";
import { loadBundle, predictionRow, spreadRow, structureUrl } from "../../src/data/bundle";
import { fixtureBytes, fixtureDirectory, loadFixtureBundle } from "../support/bundle-fixture";

describe("loadBundle", () => {
  it("loads the fixture atlas and binary arrays", async () => {
    const bundle = await loadFixtureBundle();
    expect(bundle.atlas.molecules).toHaveLength(11);
    expect(bundle.predictions).toHaveLength(1243);
    expect(bundle.spread).toHaveLength(1243);
    expect(bundle.positions).toHaveLength(33);
    expect(bundle.notes.notes).toHaveLength(9);
    expect(bundle.phrases).toHaveLength(81);
    expect(bundle.words.words.tangerine).toEqual(["orange"]);
  });

  it("decodes Geosmin's prediction and spread rows", async () => {
    const bundle = await loadFixtureBundle();
    const index = bundle.atlas.molecules.findIndex((molecule) => molecule.name === "Geosmin");
    const woody = bundle.atlas.labels.indexOf("woody");
    expect(woody).toBeGreaterThan(-1);
    expect(predictionRow(bundle, index)[woody]).toBeCloseTo(198 / 255, 6);
    expect(spreadRow(bundle, index)[woody]).toBeGreaterThanOrEqual(0);
  });

  it("builds the structure path from the data root", async () => {
    const bundle = await loadFixtureBundle();
    expect(structureUrl(bundle, "1066")).toBe("fixture-data/structures/1066.svg");
  });

  it("treats an HTML fallback for an optional file as absent", async () => {
    const directory = fixtureDirectory("keller");
    const fetcher = async (url: string) => {
      const file = url.startsWith(directory) ? url.slice(directory.length) : url;
      if (file === "notes.json" || file === "phrases.json" || file === "words.json") {
        return new Response("<!doctype html><title>index</title>", {
          status: 200,
          headers: { "content-type": "text/html" },
        });
      }
      return new Response(fixtureBytes(`${directory}${file}`), { status: 200 });
    };

    const bundle = await loadBundle(directory, fetcher);
    expect(bundle.notes.notes).toEqual([]);
    expect(bundle.phrases).toEqual([]);
    expect(bundle.words.words).toEqual({});
  });

  it("loads the Keller fixture with its own label width and splits", async () => {
    const bundle = await loadFixtureBundle("keller");
    expect(bundle.atlas.labels).toHaveLength(20);
    expect(bundle.atlas.molecules.every((molecule) => molecule.split === "cross_validated")).toBe(
      true,
    );
    expect(bundle.positions).toHaveLength(bundle.atlas.molecules.length * 3);
  });

  it("reports a truncated predictions file with its reason and refetches on retry", async () => {
    const directory = fixtureDirectory("leffingwell");
    const predictions = fixtureBytes(`${directory}predictions.bin`);
    const state = { predictions: predictions.slice(0, predictions.length - 1) };
    let predictionCalls = 0;
    const fetcher = async (url: string) => {
      const file = url.startsWith(directory) ? url.slice(directory.length) : url;
      if (file === "predictions.bin") {
        predictionCalls += 1;
        return new Response(state.predictions, { status: 200 });
      }
      return new Response(fixtureBytes(`${directory}${file}`), { status: 200 });
    };

    await expect(loadBundle(directory, fetcher)).rejects.toThrow(
      /predictions\.bin: expected 1243 bytes .* found 1242/,
    );

    state.predictions = predictions;
    const bundle = await loadBundle(directory, fetcher);
    expect(bundle.predictions).toHaveLength(1243);
    expect(predictionCalls).toBe(2);
  });

  it("rejects a positions file with the wrong length", async () => {
    const directory = fixtureDirectory("leffingwell");
    const short = fixtureBytes(`${directory}positions.bin`).slice(0, 8);
    const fetcher = async (url: string) => {
      const file = url.startsWith(directory) ? url.slice(directory.length) : url;
      return new Response(file === "positions.bin" ? short : fixtureBytes(`${directory}${file}`), {
        status: 200,
      });
    };
    await expect(loadBundle(directory, fetcher)).rejects.toThrow(
      /positions\.bin: expected 132 bytes .* found 8/,
    );
  });

  it("reports an HTTP failure with the file name", async () => {
    const directory = fixtureDirectory("leffingwell");
    const fetcher = async (url: string) => {
      if (url.endsWith("atlas.json")) return new Response(null, { status: 404 });
      const file = url.startsWith(directory) ? url.slice(directory.length) : url;
      return new Response(fixtureBytes(`${directory}${file}`), { status: 200 });
    };
    await expect(loadBundle(directory, fetcher)).rejects.toThrow(/atlas\.json: HTTP 404/);
  });
});

import { readFileSync } from "node:fs";
import { expect, type Locator, type Page, test } from "@playwright/test";

interface AudioProbe {
  created: number;
  analysers: AnalyserNode[];
}

/**
 * Counts live audio contexts and taps everything that reaches a live destination, so the test
 * can listen to the page. Offline contexts are left alone.
 */
function parameterValue(page: Page, name: string): Locator {
  return page
    .locator("table.sound-parameters tbody tr")
    .filter({ has: page.getByRole("rowheader", { name, exact: true }) })
    .locator("td")
    .first();
}

async function instrumentAudio(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const probe: AudioProbe = { created: 0, analysers: [] };
    (window as unknown as { audioProbe: AudioProbe }).audioProbe = probe;
    const Live = window.AudioContext;
    if (Live === undefined) return;
    window.AudioContext = class extends Live {
      constructor(options?: AudioContextOptions) {
        super(options);
        probe.created += 1;
      }
    };
    const connect = AudioNode.prototype.connect as (
      this: AudioNode,
      destination: AudioNode | AudioParam,
      ...rest: number[]
    ) => AudioNode | undefined;
    AudioNode.prototype.connect = function (
      this: AudioNode,
      destination: AudioNode | AudioParam,
      ...rest: number[]
    ) {
      if (destination instanceof AudioDestinationNode && this.context instanceof Live) {
        const analyser = this.context.createAnalyser();
        analyser.fftSize = 2048;
        connect.call(this, analyser);
        probe.analysers.push(analyser);
      }
      return connect.call(this, destination, ...rest);
    } as typeof AudioNode.prototype.connect;
  });
}

function contextsCreated(page: Page): Promise<number> {
  return page.evaluate(() => (window as unknown as { audioProbe: AudioProbe }).audioProbe.created);
}

function peak(page: Page): Promise<number> {
  return page.evaluate(() => {
    const probe = (window as unknown as { audioProbe: AudioProbe }).audioProbe;
    const samples = new Float32Array(2048);
    let loudest = 0;
    for (const analyser of probe.analysers) {
      analyser.getFloatTimeDomainData(samples);
      for (const sample of samples) loudest = Math.max(loudest, Math.abs(sample));
    }
    return loudest;
  });
}

/** Mono samples from a 16-bit PCM WAV, checking the header the export promises. */
function wavSamples(bytes: Uint8Array): { samples: Float32Array; sampleRate: number } {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const ascii = (offset: number) =>
    String.fromCharCode(...bytes.subarray(offset, offset + 4).values());
  expect(ascii(0)).toBe("RIFF");
  expect(ascii(8)).toBe("WAVE");
  expect(ascii(36)).toBe("data");
  const channels = view.getUint16(22, true);
  const sampleRate = view.getUint32(24, true);
  expect(view.getUint16(34, true)).toBe(16);
  const frames = view.getUint32(40, true) / (channels * 2);
  const samples = new Float32Array(frames);
  for (let frame = 0; frame < frames; frame += 1) {
    let sum = 0;
    for (let channel = 0; channel < channels; channel += 1) {
      sum += view.getInt16(44 + (frame * channels + channel) * 2, true) / 32768;
    }
    samples[frame] = sum / channels;
  }
  return { samples, sampleRate };
}

/** Magnitude-weighted mean frequency over Hann-windowed frames, by a plain DFT. */
function spectralCentroid(samples: Float32Array, sampleRate: number): number {
  const size = 1024;
  const hop = 4096;
  // The trig and the window depend only on position in the frame, so they are computed once:
  // a 20 second render is hundreds of frames, and recomputing them per frame made this test
  // slow enough to hit its timeout whenever other workers were busy.
  const window = Float32Array.from(
    { length: size },
    (_, n) => 0.5 - 0.5 * Math.cos((2 * Math.PI * n) / (size - 1)),
  );
  const cosine = Float32Array.from({ length: size }, (_, k) => Math.cos((2 * Math.PI * k) / size));
  const sine = Float32Array.from({ length: size }, (_, k) => Math.sin((2 * Math.PI * k) / size));
  const windowed = new Float32Array(size);
  let weighted = 0;
  let total = 0;
  for (let start = Math.floor(sampleRate / 2); start + size <= samples.length; start += hop) {
    for (let n = 0; n < size; n += 1) windowed[n] = (samples[start + n] ?? 0) * (window[n] ?? 0);
    for (let bin = 1; bin < size / 2; bin += 1) {
      let real = 0;
      let imaginary = 0;
      for (let n = 0; n < size; n += 1) {
        const at = (bin * n) % size;
        real += (windowed[n] ?? 0) * (cosine[at] ?? 0);
        imaginary -= (windowed[n] ?? 0) * (sine[at] ?? 0);
      }
      const magnitude = Math.hypot(real, imaginary);
      weighted += magnitude * ((bin * sampleRate) / size);
      total += magnitude;
    }
  }
  return weighted / total;
}

async function renderedCentroid(page: Page, id: string): Promise<number> {
  await page.goto(`/#/synesthesia?a=${id}`);
  await page.getByRole("button", { name: "Make a WAV" }).click();
  const save = page.getByRole("link", { name: "Save the 20-second WAV" });
  const [download] = await Promise.all([page.waitForEvent("download"), save.click()]);
  expect(download.suggestedFilename()).toBe(`smellcule-${id}.wav`);
  const { samples, sampleRate } = wavSamples(new Uint8Array(readFileSync(await download.path())));
  expect(sampleRate).toBe(44100);
  expect(samples.length).toBe(20 * 44100);
  return spectralCentroid(samples, sampleRate);
}

test("an offline render of citrus sits above one of patchouli @offline-audio", async ({ page }) => {
  const citrus = await renderedCentroid(page, "1557");
  const woody = await renderedCentroid(page, "2279");
  expect(citrus).toBeGreaterThan(woody);
});

test("the fougère's Play this opens its mixture and plays it", async ({ page }) => {
  await instrumentAudio(page);
  await page.goto("/#/decompile");
  await page
    .getByLabel("Notes from a perfume description")
    .fill("top: bergamot, lavender\nheart: rose, clove\nbase: cedar, musk, vanilla");
  await page.getByRole("link", { name: "Play this" }).click();

  await expect(page).toHaveURL(/#\/synesthesia\?mix=1557,2560,133,2794$/);
  await expect(page.locator("#main h1")).toHaveText("Synesthesia");
  await expect(page.locator("#main li a")).toHaveText([
    "Limonene",
    "Rose oxide",
    "Ambrettolide",
    "Vanillin",
  ]);
  await page.getByRole("button", { name: "Play" }).click();
  await expect(page.getByRole("status")).toHaveText("Playing.");
  expect(await contextsCreated(page)).toBe(1);
  await expect.poll(() => peak(page), { timeout: 5000 }).toBeGreaterThan(0.001);
});

test("Stop leaves the output silent, reverb tail included", async ({ page }) => {
  await instrumentAudio(page);
  await page.goto("/#/synesthesia?a=1557");
  await page.getByRole("button", { name: "Play" }).click();
  await expect.poll(() => peak(page), { timeout: 5000 }).toBeGreaterThan(0.001);

  await page.getByRole("button", { name: "Stop" }).click();
  await expect(page.getByRole("status")).toHaveText("Stopped.");
  await expect.poll(() => peak(page), { timeout: 500, intervals: [50] }).toBeLessThan(1e-4);
  await page.waitForTimeout(500);
  expect(await peak(page)).toBeLessThan(1e-4);
});

test("no audio context exists before the visitor presses Play @cross", async ({ page }) => {
  await instrumentAudio(page);
  await page.goto("/#/synesthesia?a=1557&b=2279");
  await expect(page.locator("#main h1")).toHaveText("Synesthesia");
  await page.getByLabel("Blend").fill("50");
  await expect(page.locator("#main output")).toHaveText("Limonene 50%, Patchouli alcohol 50%");
  expect(await contextsCreated(page)).toBe(0);

  await page.getByRole("button", { name: "Play" }).click();
  expect(await contextsCreated(page)).toBe(1);
});

test("an edited mapping survives its own link @cross", async ({ page }) => {
  await page.goto("/#/synesthesia?a=1557");
  const brightness = parameterValue(page, "Brightness");
  const authored = await brightness.textContent();

  await page.getByText("Edit mapping").click();
  await page.getByLabel("Parameter").selectOption("brightness");
  await page.getByLabel("Bias", { exact: true }).fill("-2");
  await page.getByLabel("Bias", { exact: true }).blur();
  await expect(brightness).toHaveText("0.00");

  const href = await page.getByRole("link", { name: "Link to this sound" }).getAttribute("href");
  expect(href).toMatch(/^#\/synesthesia\?a=1557&map=[A-Za-z0-9_-]+$/);

  await page.goto("about:blank");
  await page.goto(`/${href}`);
  await expect(parameterValue(page, "Brightness")).toHaveText("0.00");
  expect(authored).not.toBe("0.00");
  await page.getByText("Edit mapping").click();
  await page.getByLabel("Parameter").selectOption("brightness");
  await expect(page.getByLabel("Bias", { exact: true })).toHaveValue("-2");
  await expect(page.getByRole("alert")).toHaveCount(0);
});

test("an unreadable mapping link shows a notice and plays the default @cross", async ({ page }) => {
  await page.goto("/#/synesthesia?a=1557");
  const authored = await page.locator("table.sound-parameters tbody").textContent();

  await page.goto("/#/synesthesia?a=1557&map=%25%25%25");
  await expect(page.getByRole("alert")).toContainText(
    "The mapping in this link could not be read, so the default mapping was loaded.",
  );
  await expect(page.locator("table.sound-parameters tbody")).toHaveText(authored ?? "");
});

test("the bare route opens on Vanillin and Limonene @cross", async ({ page }) => {
  await page.goto("/#/synesthesia");
  await expect(page.locator("#main li a")).toHaveText(["Vanillin", "Limonene"]);
  await expect(page.getByLabel("Blend")).toBeVisible();
  await expect(page.getByRole("button", { name: "Play" })).toBeVisible();
});

test("a link to unknown molecules plays the default pair with a notice", async ({ page }) => {
  await page.goto("/#/synesthesia?mix=999998,999999");
  await expect(page.getByRole("alert")).toHaveText(
    "None of these molecules are in the catalogue: 999998, 999999. The default pair is playing.",
  );
  await expect(page.locator("#main li a")).toHaveText(["Vanillin", "Limonene"]);
});

test("the pickers choose molecule A and B @cross", async ({ page }) => {
  await page.goto("/#/synesthesia");
  await page.getByLabel("Molecule B: Limonene").fill("Geosmin");
  await page.getByLabel("Molecule B: Limonene").press("Enter");
  await expect(page).toHaveURL(/#\/synesthesia\?a=2794&b=1066$/);
  await expect(page.locator("#main > section > ul a")).toHaveText(["Vanillin", "Geosmin"]);

  await page.getByLabel("Molecule A: Vanillin").fill("Patchouli alcohol");
  await page.getByLabel("Molecule A: Vanillin").press("Enter");
  await expect(page).toHaveURL(/#\/synesthesia\?a=2279&b=1066$/);
  await expect(page.locator("#main > section > ul a")).toHaveText(["Patchouli alcohol", "Geosmin"]);
});

test("Glide sweeps from A to B in eight seconds", async ({ page }) => {
  await page.clock.install();
  await page.goto("/#/synesthesia");
  const blend = page.locator("#main output");
  await expect(blend).toHaveText("Vanillin 100%, Limonene 0%");
  await page.clock.pauseAt(Date.now() + 5000);
  await page.getByRole("button", { name: "Glide (8 s)" }).click();
  await page.clock.runFor(4000);
  await expect(blend).toHaveText(/Vanillin (49|50|51)%/);
  await page.clock.runFor(4200);
  await expect(blend).toHaveText("Vanillin 0%, Limonene 100%");
  await expect(page.getByLabel("Blend")).toHaveValue("100");
});

test("the mapping table shows each formula with the weights that drive it", async ({ page }) => {
  await page.goto("/#/synesthesia");
  const row = page
    .locator("table.sound-parameters tbody tr")
    .filter({ has: page.getByRole("rowheader", { name: "Brightness", exact: true }) });
  await expect(row.locator("td").nth(1)).toHaveText(
    "clamp(1 citrus + 1 fresh + 0.4 fruity + 1 green + 0.6 floral)",
  );
  await expect(row.locator("td").nth(2)).toHaveText(
    /^citrus \d\.\d\d, fresh \d\.\d\d, fruity \d\.\d\d, green \d\.\d\d, floral \d\.\d\d$/,
  );
  await expect(page.locator("table.sound-parameters tbody th")).toHaveText([
    "Tempo",
    "Brightness",
    "Warmth",
    "Roughness",
    "Notes per beat",
    "Register",
    "Attack",
    "Reverb",
    "Scale",
    "Pan",
  ]);
});

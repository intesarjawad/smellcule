import { spawnSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";
import { chromium } from "playwright";

// Run from the repository root after a real-data build: node site/scripts/record-receiver-demo.mjs
const root = resolve("site/dist");
const out = resolve("dist/demo-capture");
await mkdir(out, { recursive: true });
const atlas = JSON.parse(await readFile(`${root}/data/atlas.json`, "utf8"));
const game = JSON.parse(await readFile(`${root}/data/smellcule.json`, "utf8"));
if (atlas.molecules.length < 1000 || !game.puzzles.length)
  throw new Error("Build site/dist with the real data bundle first.");
const id = (name) => {
  const molecule = atlas.molecules.find((entry) => entry.name === name);
  if (!molecule) throw new Error(`Missing ${name} in the bundle`);
  return molecule.id;
};
const mime = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".bin": "application/octet-stream",
};
const origin = "https://intesarjawad.github.io/smellcule/";
const browser = await chromium.launch({
  executablePath:
    process.env.BRAVE_PATH ?? "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser",
  headless: true,
  args: ["--autoplay-policy=no-user-gesture-required"],
});
const context = await browser.newContext({
  viewport: { width: 1280, height: 720 },
  deviceScaleFactor: 1,
  recordVideo: { dir: out, size: { width: 1280, height: 720 } },
});
try {
  await context.route(`${origin}**`, async (route) => {
    const pathname = decodeURIComponent(new URL(route.request().url()).pathname);
    const path = resolve(root, `.${pathname.slice("/smellcule".length)}`);
    if (!path.startsWith(root + sep) && path !== root) {
      await route.fulfill({ status: 403 });
      return;
    }
    try {
      const file = path === root ? `${root}/index.html` : path;
      await route.fulfill({
        body: await readFile(file),
        contentType: mime[extname(file)] ?? "application/octet-stream",
      });
    } catch {
      await route.fulfill({ status: 404 });
    }
  });
  const page = await context.newPage();
  const started = performance.now();
  await page.clock.setFixedTime(new Date(`${game.startDate}T12:00:00`));
  await page.addInitScript(() => {
    document.addEventListener("DOMContentLoaded", () => {
      const style = document.createElement("style");
      style.textContent =
        "body { padding-top: 38px !important } #demo-browser { position: fixed; z-index: 2147483647; top: 0; left: 0; width: 100%; height: 38px; box-sizing: border-box; background: #dad8d2; border-bottom: 1px solid #999; display: flex; align-items: center; padding: 0 18px; font: 15px sans-serif; color: #333; } #demo-browser span { margin: auto; width: 62%; text-align: center; border-radius: 5px; background: #f8f7f4; padding: 4px; }";
      const chrome = document.createElement("div");
      chrome.id = "demo-browser";
      chrome.textContent = "●  ●  ●";
      const address = document.createElement("span");
      address.textContent = "https://intesarjawad.github.io/smellcule/";
      chrome.append(address);
      document.head.append(style);
      document.body.append(chrome);
    });
    const connect = AudioNode.prototype.connect;
    AudioNode.prototype.connect = function (destination, ...args) {
      if (destination instanceof AudioDestinationNode && this.context instanceof AudioContext) {
        const capture = this.context.createMediaStreamDestination();
        connect.call(this, capture);
        const recorder = new MediaRecorder(capture.stream);
        const chunks = [];
        recorder.ondataavailable = (event) => chunks.push(event.data);
        window.demoAudio = { recorder, chunks };
        recorder.start();
      }
      return connect.call(this, destination, ...args);
    };
  });
  await page.goto(`${origin}#/atlas`, { waitUntil: "networkidle" });
  await page.getByRole("searchbox").focus();
  await page.waitForTimeout(8000);
  await page.screenshot({ path: `${out}/opening.png` });
  await page.goto(origin);
  await page.locator("#rx-query").focus();
  await page.waitForTimeout(8000);
  const trim = (performance.now() - started) / 1000;
  await page.waitForTimeout(500);
  await page.keyboard.type("smells like rain", { delay: 65 });
  await page.keyboard.press("Enter");
  await page
    .locator("#rx-tune-status")
    .getByText(/Geosmin/)
    .waitFor();
  await page.waitForTimeout(5000);
  await page.getByRole("link", { name: "Open the card" }).click();
  await page.locator("article.card h2").waitFor();
  await page.locator("section", { hasText: "Odour neighbours" }).last().scrollIntoViewIfNeeded();
  await page.locator("ul.neighbours a").first().hover();
  await page.waitForTimeout(1800);
  await page.goto(`${origin}#/smellcule`);
  await page.getByRole("button", { name: "Show a clue" }).click();
  await page.waitForTimeout(600);
  for (const button of await page
    .locator(".options button")
    .all()
    .then((buttons) => buttons.slice(0, 3))) {
    await button.click();
    await page.waitForTimeout(250);
  }
  await page.getByRole("button", { name: "Submit" }).click();
  await page.locator(".reveal").scrollIntoViewIfNeeded();
  const reveal = (await page.locator(".reveal").textContent()) ?? "";
  if (!reveal.includes(`${origin}#/smellcule`) || /127\.0\.0\.1|localhost/i.test(reveal))
    throw new Error("Share text must use the planned public address");
  await page.waitForTimeout(2000);
  const gifEnd = (performance.now() - started) / 1000;
  await page.goto(`${origin}#/synesthesia?a=${id("Geosmin")}&b=${id("Vanillin")}`);
  await page.getByRole("button", { name: "Play", exact: true }).click();
  const audioStart = (performance.now() - started) / 1000;
  await page.getByRole("button", { name: /Glide/ }).click();
  await page.locator("table.sound-parameters").scrollIntoViewIfNeeded();
  await page.waitForTimeout(8500);
  const audio = await page.evaluate(async () => {
    const { recorder, chunks } = window.demoAudio;
    await new Promise((done) => {
      recorder.onstop = done;
      recorder.stop();
    });
    const bytes = new Uint8Array(await new Blob(chunks, { type: recorder.mimeType }).arrayBuffer());
    let binary = "";
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return btoa(binary);
  });
  await writeFile(`${out}/glide.webm`, Buffer.from(audio, "base64"));
  const video = page.video();
  await page.close();
  const file = await video.path();
  const ffmpeg = (...args) => {
    const result = spawnSync("ffmpeg", ["-y", "-loglevel", "error", ...args], {
      stdio: "inherit",
    });
    if (result.status !== 0) throw new Error("ffmpeg failed");
  };
  ffmpeg(
    "-loop",
    "1",
    "-t",
    "0.5",
    "-i",
    `${out}/opening.png`,
    "-ss",
    String(trim),
    "-i",
    file,
    "-filter_complex",
    "[0:v]fps=25,setsar=1[a];[1:v]fps=25,setsar=1,setpts=PTS-STARTPTS[b];[a][b]concat=n=2:v=1:a=0[v]",
    "-map",
    "[v]",
    "-c:v",
    "libx264",
    "-crf",
    "12",
    "-pix_fmt",
    "yuv420p",
    `${out}/framed.mp4`,
  );
  ffmpeg(
    "-t",
    String(gifEnd - trim + 0.1),
    "-i",
    `${out}/framed.mp4`,
    "-vf",
    "fps=12,scale=896:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=96[p];[b][p]paletteuse=dither=bayer",
    "docs/demo.gif",
  );
  ffmpeg(
    "-i",
    `${out}/framed.mp4`,
    "-itsoffset",
    String(audioStart - trim + 0.5),
    "-i",
    `${out}/glide.webm`,
    "-filter_complex",
    "[1:a]volume=0.6[a]",
    "-map",
    "0:v",
    "-map",
    "[a]",
    "-c:v",
    "copy",
    "-c:a",
    "aac",
    "-shortest",
    "docs/demo.mp4",
  );
  console.log(
    JSON.stringify({
      trim,
      gifDuration: gifEnd - trim,
      audioOffset: audioStart - trim,
      rawVideo: file,
    }),
  );
} finally {
  await context.close();
  await browser.close();
}

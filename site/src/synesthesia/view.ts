/**
 * The sound view. One molecule plays on its own, two can be morphed with a slider, and a mixture
 * plays the average of its members' predictions, the same average the decompiler shows. No audio
 * context exists until the visitor presses Play, since browsers block sound before a gesture.
 */

import { moleculeHref } from "../card/link";
import type { Bundle } from "../data/bundle";
import { listedNames } from "../data/names";
import { noteProfile } from "../decompiler/profile";
import { navigate } from "../router";
import { buildSearchIndex } from "../search/index";
import { mountSearch } from "../search/view";
import { element, link } from "../ui/dom";
import { defaultPair } from "./demo";
import {
  deriveMapping,
  FAMILIES,
  type FamilyWeights,
  interpolateWeights,
  type Mapping,
  sharpenedWeights,
} from "./mapping";
import {
  DEFAULT_PRESET,
  MAPPING_PARAMETERS,
  MAX_BIAS,
  MAX_COEFFICIENT,
  type MappingParameter,
  type MappingPreset,
  MappingPresetError,
  mappingLinkParam,
  presetMapping,
  resolveMappingLink,
  withBias,
  withCoefficient,
} from "./mapping-codec";
import { mappingTable, PARAMETER_NAMES } from "./table";
import { encodeWav } from "./wav";
import { createWebAudioTarget, renderOffline, type WebAudioTarget } from "./webaudio-target";

export const GLIDE_MS = 300;
/** A full sweep from one molecule to the other. */
export const GLIDE_SWEEP_MS = 8000;
/** The table and the sound follow a glide at this rate, not every frame. */
export const TABLE_UPDATE_MS = 100;
export const EXPORT_SECONDS = 20;
export const EXPORT_SAMPLE_RATE = 44100;

export type SoundMode = "single" | "pair" | "mix";

export interface SoundMolecule {
  readonly id: string;
  readonly name: string;
  readonly href: string;
}

/** Family weights and the atlas x position that sets the pan. */
export interface Voicing {
  readonly families: FamilyWeights;
  readonly x: number;
}

export interface SynesthesiaModel {
  readonly mode: SoundMode;
  readonly molecules: readonly SoundMolecule[];
  readonly missing: readonly string[];
  readonly from: Voicing;
  readonly to: Voicing;
}

export interface Voiced {
  readonly params: Mapping;
  readonly families: FamilyWeights;
}

/** Averages the members' predicted probabilities, then sharpens them into family weights. */
export function voicingOf(
  bundle: Pick<Bundle, "atlas" | "predictions" | "positions">,
  ids: readonly string[],
): Voicing | null {
  const profile = noteProfile(bundle, ids);
  if (profile === null) return null;
  const predictions = Object.fromEntries(
    bundle.atlas.labels.map((label, index) => [label, profile.mean[index] ?? 0]),
  );
  const positions = new Map(bundle.atlas.molecules.map((molecule, index) => [molecule.id, index]));
  let x = 0;
  for (const id of profile.ids) {
    x += (bundle.positions[(positions.get(id) ?? 0) * 3] ?? 0) / profile.ids.length;
  }
  return { families: sharpenedWeights(predictions), x };
}

/**
 * Two ids without `mix` are a morph. A mixture of any size, or a pair with a missing member,
 * plays as one fixed sound.
 */
export function synesthesiaModel(
  bundle: Pick<Bundle, "atlas" | "predictions" | "positions">,
  ids: readonly string[],
  mix: boolean,
): SynesthesiaModel | null {
  const names = listedNames(bundle.atlas.molecules);
  const unique = [...new Set(ids)];
  const found = unique.filter((id) => names.has(id));
  const missing = unique.filter((id) => !names.has(id));
  const molecules = found.map((id) => ({
    id,
    name: names.get(id) ?? id,
    href: moleculeHref(id),
  }));

  const [first, second] = found;
  if (first === undefined) return null;
  if (!mix && second !== undefined && found.length === 2) {
    const from = voicingOf(bundle, [first]);
    const to = voicingOf(bundle, [second]);
    if (from === null || to === null) return null;
    return { mode: "pair", molecules, missing, from, to };
  }
  const voicing = voicingOf(bundle, found);
  if (voicing === null) return null;
  return {
    mode: mix && found.length > 1 ? "mix" : "single",
    molecules,
    missing,
    from: voicing,
    to: voicing,
  };
}

/** Without a preset the authored rules apply exactly. */
export function voicedAt(model: SynesthesiaModel, t: number, preset?: MappingPreset): Voiced {
  const amount = Math.min(1, Math.max(0, t));
  const families = interpolateWeights(model.from.families, model.to.families, amount);
  const x = model.from.x + (model.to.x - model.from.x) * amount;
  const params =
    preset === undefined ? deriveMapping(families, x) : presetMapping(preset, families, x);
  return { params, families };
}

/** The hash that reopens this sound, carrying the mapping only when it differs from the default. */
export function soundHref(model: SynesthesiaModel, preset: MappingPreset): string {
  const ids = model.molecules.map((molecule) => molecule.id);
  if (model.mode === "mix") return mixHref(ids, preset);
  return pairHref(ids[0] ?? "", model.mode === "pair" ? ids[1] : undefined, preset);
}

/** The morph between `a` and `b`, or `a` alone. */
export function pairHref(a: string, b: string | undefined, preset: MappingPreset): string {
  const query = new URLSearchParams({ a });
  if (b !== undefined && b !== a) query.set("b", b);
  return withMapping(query, preset);
}

function mixHref(ids: readonly string[], preset: MappingPreset): string {
  return withMapping(new URLSearchParams({ mix: ids.join(",") }), preset);
}

function withMapping(query: URLSearchParams, preset: MappingPreset): string {
  const mapping = mappingLinkParam(preset);
  if (mapping !== null) query.set("map", mapping);
  return `#/synesthesia?${query.toString().replaceAll("%2C", ",")}`;
}

/** The ids that seed the melody, so the same molecules always play the same notes. */
export function melodySeed(model: SynesthesiaModel): {
  readonly aId: string;
  readonly bId: string;
} {
  const ids = model.molecules.map((molecule) => molecule.id);
  if (model.mode === "pair") return { aId: ids[0] ?? "", bId: ids[1] ?? "" };
  return { aId: ids.join(","), bId: "" };
}

export function exportFileName(model: SynesthesiaModel): string {
  return `smellcule-${model.molecules.map((molecule) => molecule.id).join("-")}.wav`;
}

export function blendText(model: SynesthesiaModel, t: number): string {
  const [a, b] = model.molecules;
  const towardB = Math.round(Math.min(1, Math.max(0, t)) * 100);
  return `${a?.name ?? ""} ${100 - towardB}%, ${b?.name ?? ""} ${towardB}%`;
}

/** Where a glide stands after `elapsedMs`: a steady sweep toward `to`, stopping there. */
export function glidePosition(from: number, to: number, elapsedMs: number): number {
  const travelled = elapsedMs / GLIDE_SWEEP_MS;
  return to >= from ? Math.min(to, from + travelled) : Math.max(to, from - travelled);
}

const INTRO: Record<SoundMode, string> = {
  single: "The sound of one molecule's predicted smell.",
  pair: "Move the slider to morph from the first molecule's sound to the second's.",
  mix: "The sound of the averaged predictions of these molecules, not a prediction for the mixture.",
};

export interface SynesthesiaView {
  dispose(): void;
}

function emptyView(container: HTMLElement, text: string): SynesthesiaView {
  const section = element("section", undefined, "synesthesia");
  section.append(element("h1", "Synesthesia"), element("p", text));
  const back = element("p");
  back.append(link("Search the atlas", "#/atlas"));
  section.append(back);
  container.replaceChildren(section);
  return { dispose() {} };
}

export function renderSynesthesia(
  container: HTMLElement,
  bundle: Bundle,
  ids: readonly string[],
  mix: boolean,
  mappingParam: string | null = null,
): SynesthesiaView {
  const requested = synesthesiaModel(bundle, ids, mix);
  const model = requested ?? synesthesiaModel(bundle, defaultPair(bundle.atlas), false);
  if (model === null) {
    return emptyView(container, "Open a molecule card and choose Play in Synesthesia to hear it.");
  }
  const fallbackNotice =
    requested === null && ids.length > 0
      ? `None of these molecules are in the catalogue: ${ids.join(", ")}. The default pair is playing.`
      : null;

  const section = element("section", undefined, "synesthesia");
  section.append(element("h1", "Synesthesia"), element("p", INTRO[model.mode]));

  const list = element("ul");
  for (const molecule of model.molecules) {
    const item = element("li");
    item.append(link(molecule.name, molecule.href));
    list.append(item);
  }
  section.append(list);
  if (model.missing.length > 0) {
    section.append(element("p", `Not in the catalogue: ${model.missing.join(", ")}.`));
  }
  if (fallbackNotice !== null) {
    const notice = element("p", fallbackNotice);
    notice.setAttribute("role", "alert");
    section.append(notice);
  }

  const resolved = resolveMappingLink(mappingParam);
  let preset = resolved.preset;

  if (model.mode !== "mix") {
    const [a, b] = model.molecules;
    const index = buildSearchIndex(bundle);
    const pickers = element("div", undefined, "molecule-pickers");
    for (const [slot, current] of [
      ["a", a],
      ["b", b],
    ] as const) {
      const field = element("div");
      pickers.append(field);
      mountSearch(field, {
        index,
        suggestions: [],
        id: `molecule-${slot}`,
        label:
          current === undefined
            ? "Add molecule B"
            : `Molecule ${slot.toUpperCase()}: ${current.name}`,
        autofocus: false,
        onOpen: (id) =>
          navigate(slot === "a" ? pairHref(id, b?.id, preset) : pairHref(a?.id ?? id, id, preset)),
      });
    }
    section.append(pickers);
  }
  const voiced = (at: number): Voiced =>
    voicedAt(model, at, mappingLinkParam(preset) === null ? undefined : preset);
  if (resolved.notice !== null) {
    const notice = element("p", resolved.notice);
    notice.setAttribute("role", "alert");
    section.append(notice);
  }

  let t = 0;
  const glide = element("button", `Glide (${GLIDE_SWEEP_MS / 1000} s)`);
  glide.type = "button";
  const slider = element("input");
  const blendOutput = element("output");
  if (model.mode === "pair") {
    const label = element("label", "Blend");
    label.htmlFor = "blend";
    slider.id = "blend";
    slider.type = "range";
    slider.min = "0";
    slider.max = "100";
    slider.step = "0.1";
    slider.value = "0";
    slider.setAttribute("aria-valuetext", blendText(model, 0));
    blendOutput.htmlFor.add("blend");
    blendOutput.textContent = blendText(model, 0);
    const row = element("p");
    row.append(label, " ", slider, " ", blendOutput, " ", glide);
    section.append(row);
  }

  const play = element("button", "Play");
  play.type = "button";
  const stop = element("button", "Stop");
  stop.type = "button";
  stop.disabled = true;
  const render = element("button", "Make a WAV");
  render.type = "button";
  const controls = element("p", undefined, "actions");
  controls.append(play, " ", stop, " ", render);
  const save = element("p");
  const status = element("p");
  status.setAttribute("role", "status");
  const readout = element("tbody");
  const table = element("table", undefined, "sound-parameters");
  const head = element("tr");
  for (const heading of ["Parameter", "Value", "Formula", "Family weights now"]) {
    const cell = element("th", heading);
    cell.scope = "col";
    head.append(cell);
  }
  const thead = element("thead");
  thead.append(head);
  table.append(element("caption", "How the predicted families set the sound"), thead, readout);
  section.append(controls, save, status, element("h3", "Sound parameters"), table);

  const editor = element("details", undefined, "mapping-editor");
  const summary = element("summary", "Edit mapping");
  const hint = element(
    "p",
    `Each sound parameter is its bias plus a coefficient for every odour family times that family's weight, held inside the parameter's range. Biases run from -${MAX_BIAS} to ${MAX_BIAS}, coefficients from -${MAX_COEFFICIENT} to ${MAX_COEFFICIENT}.`,
  );
  const picker = element("select");
  picker.id = "mapping-parameter";
  for (const parameter of MAPPING_PARAMETERS) {
    const option = element("option", PARAMETER_NAMES[parameter]);
    option.value = parameter;
    picker.append(option);
  }
  const pickerLabel = element("label", "Parameter");
  pickerLabel.htmlFor = picker.id;
  const pickerRow = element("p");
  pickerRow.append(pickerLabel, " ", picker);
  const fields = element("fieldset");
  const reset = element("button", "Reset to default mapping");
  reset.type = "button";
  const editStatus = element("p");
  editStatus.setAttribute("role", "status");
  const shared = element("p");
  editor.append(summary, hint, pickerRow, fields, reset, editStatus, shared);
  section.append(editor);

  const showParameters = (sound: Voiced): void => {
    const x = model.from.x + (model.to.x - model.from.x) * t;
    readout.replaceChildren(
      ...mappingTable(preset, sound.families, sound.params, x).map((row) => {
        const tr = element("tr");
        const name = element("th", row.name);
        name.scope = "row";
        tr.append(
          name,
          element("td", row.value, "mono"),
          element("td", row.formula, "mono"),
          element("td", row.weights, "mono"),
        );
        return tr;
      }),
    );
  };
  showParameters(voiced(t));

  const seed = melodySeed(model);
  let context: AudioContext | null = null;
  let target: WebAudioTarget | null = null;
  let savedUrl: string | null = null;

  const forgetWav = (): void => {
    if (savedUrl !== null) URL.revokeObjectURL(savedUrl);
    savedUrl = null;
    save.replaceChildren();
  };

  const moveTo = (next: number, glideMs: number): void => {
    t = next;
    const text = blendText(model, t);
    slider.setAttribute("aria-valuetext", text);
    blendOutput.textContent = text;
    const sound = voiced(t);
    showParameters(sound);
    target?.apply(sound.params, sound.families, glideMs);
    forgetWav();
  };

  let glideFrame: number | null = null;
  const stopGlide = (): void => {
    if (glideFrame !== null) cancelAnimationFrame(glideFrame);
    glideFrame = null;
  };

  slider.addEventListener("input", () => {
    stopGlide();
    moveTo(Number(slider.value) / 100, GLIDE_MS);
  });

  glide.addEventListener("click", () => {
    stopGlide();
    const from = t;
    const to = t < 1 ? 1 : 0;
    const started = performance.now();
    let shown = started;
    const step = (now: number): void => {
      const next = glidePosition(from, to, now - started);
      slider.value = String(next * 100);
      if (now - shown >= TABLE_UPDATE_MS || next === to) {
        shown = now;
        moveTo(next, TABLE_UPDATE_MS);
      }
      glideFrame = next === to ? null : requestAnimationFrame(step);
    };
    glideFrame = requestAnimationFrame(step);
  });

  const showShared = (): void => {
    const href = soundHref(model, preset);
    shared.replaceChildren(link("Link to this sound", href));
    history.replaceState(null, "", `${window.location.pathname}${window.location.search}${href}`);
  };

  const applyPreset = (next: MappingPreset): void => {
    preset = next;
    const sound = voiced(t);
    showParameters(sound);
    target?.apply(sound.params, sound.families, GLIDE_MS);
    forgetWav();
    showShared();
  };

  const numberField = (
    id: string,
    labelText: string,
    value: number,
    limit: number,
    edit: (current: MappingPreset, next: number) => MappingPreset,
  ): HTMLParagraphElement => {
    const input = element("input");
    input.id = id;
    input.type = "number";
    input.min = String(-limit);
    input.max = String(limit);
    input.step = "0.05";
    input.value = String(value);
    input.addEventListener("change", () => {
      try {
        const next = edit(preset, input.valueAsNumber);
        input.removeAttribute("aria-invalid");
        editStatus.textContent = "";
        applyPreset(next);
      } catch (error) {
        if (!(error instanceof MappingPresetError)) throw error;
        input.setAttribute("aria-invalid", "true");
        editStatus.textContent = `Not applied. ${error.reason}`;
      }
    });
    const label = element("label", labelText);
    label.htmlFor = id;
    const row = element("p");
    row.append(label, " ", input);
    return row;
  };

  const showFields = (): void => {
    const parameter = picker.value as MappingParameter;
    const current = preset.params[parameter];
    const legend = element("legend", `${PARAMETER_NAMES[parameter]} coefficients`);
    fields.replaceChildren(
      legend,
      numberField(`mapping-${parameter}-bias`, "Bias", current.bias, MAX_BIAS, (from, next) =>
        withBias(from, parameter, next),
      ),
      ...FAMILIES.map((family) =>
        numberField(
          `mapping-${parameter}-${family}`,
          family,
          current.k[family] ?? 0,
          MAX_COEFFICIENT,
          (from, next) => withCoefficient(from, parameter, family, next),
        ),
      ),
    );
  };

  picker.addEventListener("change", () => {
    editStatus.textContent = "";
    showFields();
  });

  reset.addEventListener("click", () => {
    editStatus.textContent = "The default mapping is restored.";
    applyPreset(DEFAULT_PRESET);
    showFields();
  });

  showFields();
  if (mappingParam !== null) showShared();

  play.addEventListener("click", async () => {
    if (typeof AudioContext === "undefined") {
      status.textContent = "This browser has no Web Audio, so the sound cannot play here.";
      return;
    }
    play.disabled = true;
    try {
      if (context === null || target === null) {
        context = new AudioContext();
        target = createWebAudioTarget(context, seed);
      }
      const sound = voiced(t);
      target.apply(sound.params, sound.families, 0);
      await target.start();
      stop.disabled = false;
      status.textContent = "Playing.";
    } catch (error) {
      play.disabled = false;
      status.textContent = `The sound could not start: ${error instanceof Error ? error.message : String(error)}`;
    }
  });

  stop.addEventListener("click", () => {
    target?.stop();
    stop.disabled = true;
    play.disabled = false;
    status.textContent = "Stopped.";
    play.focus();
  });

  render.addEventListener("click", async () => {
    if (typeof OfflineAudioContext === "undefined") {
      status.textContent = "This browser cannot render audio offline.";
      return;
    }
    render.disabled = true;
    forgetWav();
    status.textContent = "Rendering the WAV…";
    try {
      const offline = new OfflineAudioContext(
        2,
        EXPORT_SECONDS * EXPORT_SAMPLE_RATE,
        EXPORT_SAMPLE_RATE,
      );
      const sound = voiced(t);
      const buffer = await renderOffline(offline, sound.params, sound.families, seed);
      const wav = encodeWav(
        [buffer.getChannelData(0), buffer.getChannelData(1)],
        buffer.sampleRate,
      );
      savedUrl = URL.createObjectURL(new Blob([new Uint8Array(wav)], { type: "audio/wav" }));
      const download = link(`Save the ${EXPORT_SECONDS}-second WAV`, savedUrl);
      download.download = exportFileName(model);
      save.replaceChildren(download);
      status.textContent = "The WAV is ready.";
    } catch (error) {
      status.textContent = `The WAV could not be rendered: ${error instanceof Error ? error.message : String(error)}`;
    } finally {
      render.disabled = false;
    }
  });

  container.replaceChildren(section);
  return {
    dispose() {
      stopGlide();
      target?.dispose();
      target = null;
      void context?.close();
      context = null;
      forgetWav();
    },
  };
}

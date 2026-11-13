# Sound targets

A sound target is the only thing between the mapping and an audio engine. The interface derives
every number; a target receives those numbers and turns them into sound.

```ts
interface SoundTarget {
  readonly kind: "webaudio" | "ghostband";
  start(): Promise<void>;
  apply(params: MusicParams, families: FamilyWeights, glideMs: number): void;
  stop(): void;
  dispose(): void;
}
```

`start` must be called from a user gesture, because browsers do not let a page make noise before
one. `apply` may be called as often as the interface likes; a target ramps toward the new values
rather than jumping, and `glideMs` says how long that should take. `stop` must leave the output
silent within 50 ms, and `dispose` stops and disconnects every node it built. The audio context
belongs to the caller, which closes it after `dispose`.

`MusicParams` is the mapping from `mapping.ts`. `scale` and `pan` are rule-based: the scale comes
from the bright and dark balance and the pan from the molecule's x position, so neither is part of
an editable preset.

## The Web Audio target

`createWebAudioTarget(context)` builds the graph from any `BaseAudioContext`, so an `AudioContext`
and an `OfflineAudioContext` go through the same builder. Nothing in the module constructs a
context itself.

- A melody note is a triangle carrier whose frequency input is modulated by a sine at twice the
  carrier frequency. The modulation depth is the FM index, from 0 to 3. The carrier passes through
  a low-pass filter, an ADSR gain and a stereo panner.
- The pad is two sawtooth oscillators an octave below the register root, detuned apart by up to 12
  cents, through one shared low-pass filter and a constant gain.
- The master node sits at -12 dBFS and feeds a dry gain and a wet gain. The wet path runs through a
  `ConvolverNode` whose impulse is 2.5 seconds of exponentially decaying stereo noise from a seeded
  PRNG, so every render sounds the same. Both paths meet at a `DynamicsCompressorNode`, then an
  output gain, then the destination. `stop` ramps both the master and the output gain to zero
  over 50 ms; the output gain sits after the convolver, so the reverb tail is cut too.
- The scheduler wakes every 25 ms and schedules the next 100 ms of notes against
  `context.currentTime`. A parameter change uses `setTargetAtTime(value, now, glideMs / 3000)`, so
  roughly 95% of the move is done after one glide.

Parameters that belong to a note (filter cutoff, envelope attack, FM index, pan) are fixed when
the note starts. Parameters shared by the whole graph (pad filter, pad level and detune, wet gain)
are ramped on `apply`, so moving a blend is heard on the next note and in the pad immediately. A
`glideMs` of zero sets the values at once.

`renderOffline(context, params, families)` renders the whole length of an `OfflineAudioContext`.
An offline clock only advances while rendering, so instead of the 25 ms timer it calls
`scheduleThrough(seconds)`, which schedules every note of the render before `startRendering`.

## The Synesthesia view

`#/synesthesia` plays what its query names:

| URL | sound |
| --- | --- |
| `?a=<id>` | one molecule |
| `?a=<id>&b=<id>` | a morph; a slider moves `t` from the first molecule to the second |
| `?mix=<id>,<id>,…` | one fixed sound for the average of the listed molecules |

A molecule's family weights come from its predicted probabilities through `sharpenedWeights`,
and its pan from its atlas x position. A morph interpolates the two weight sets and x positions
and derives the mapping at `t`. A mixture averages the predicted probabilities first, as the note
decompiler's family profile does, and then weights the average; it is not a prediction for the
mixture. Unknown ids are listed and skipped. The melody seed is the two ids of a morph, or the
comma-joined list for one molecule or a mixture, so a page always plays the same notes.

The page creates no `AudioContext` until Play is pressed. Moving the slider while playing glides
over 300 ms. Stop calls `stop` and keeps the context for the next Play; leaving the page disposes
the target and closes the context. "Make a WAV" renders 20 seconds at 44.1 kHz with
`renderOffline` and offers the result as a 16-bit stereo WAV download.

### Edit mapping

The view's "Edit mapping" disclosure edits the preset behind the sound. Pick a sound parameter
and set its bias and one coefficient per odour family; each value is checked against the bounds in
`schemas/mapping.schema.json` and a value outside them is refused with the reason. The sound, the
parameter readout and a running playback follow each accepted edit. "Reset to default mapping"
restores the authored mapping.

"Link to this sound" carries the edited preset as `&map=<base64url JSON>` (at most 2048 bytes);
the default needs no parameter. A `map` value that cannot be read leaves a notice on the page and
plays the default mapping.

## Wire message

An external target never receives a function call. It receives one JSON message per update:

```json
{
  "type": "scent.sound",
  "v": 1,
  "params": {
    "tempoBpm": 85.5,
    "brightness": 0.4,
    "warmth": 0.245,
    "roughness": 0.4925,
    "notesPerBeat": 2.25,
    "registerMidi": 64,
    "attackMs": 111.65,
    "reverbMix": 0.31875,
    "scale": "dorian",
    "pan": 0
  },
  "families": { "citrus": 0.1, "fresh": 0.1, "fruity": 0.1, "spicy": 0.1, "green": 0.1,
    "woody": 0.05, "musky": 0.05, "earthy": 0.05, "floral": 0.1, "sweet": 0.12,
    "roasted": 0.05, "savory": 0.03, "waxy": 0.05 },
  "glideMs": 300,
  "source": { "a": "425", "b": "2279", "t": 0.25 }
}
```

`source` names the two molecules being compared and the position between them. Receivers reject a
different `type` or `v` instead of guessing.

## Ghostband

Ghostband v1.1 needs two additions and nothing else:

1. On its conductor WebSocket at `127.0.0.1:7777`, accept a `blend` message `{ "weights": number[6] }`
   and forward it to the engine's existing `blend` command. Its UI protocol already accepts
   `prompt { slot, text }`.
2. Add `http://localhost:5173` to the Origin allowlist.

The Smellcule side then sends six `prompt` messages, one per top family, using this text:

| family | prompt |
| --- | --- |
| citrus | bright plucked marimba, airy |
| green | acoustic guitar harmonics, open |
| floral | soft strings and harp |
| fruity | playful synth pluck, bouncy |
| sweet | warm Rhodes, lush |
| woody | upright bass and cello, close |
| musky | slow analog pad, intimate |
| earthy | low drones and hand drums |
| spicy | tabla and sitar, bright attack |
| fresh | glass bells, clean |
| roasted | dusty lo-fi drums, vinyl |
| savory | gritty bass, overdriven |
| waxy | detuned organ, wobbly |

Prompts are resent only when the set of six families changes, so a slow morph does not spam the
conductor. The matching `blend` carries the six weights renormalised to sum to one, sent at most
once every 200 ms.

Drive Ghostband from Smellcule running on localhost (`npm run dev`). Chrome's local network access
rules gate a public origin talking to `127.0.0.1`, so a deployed page cannot reach the conductor.
The behaviour in Safari has not been verified.

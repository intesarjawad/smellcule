# Design direction

Smellcule describes how catalogued molecules smell. It never proposes or designs a molecule, and the visual language never implies it does.

## Audience action

Type a smell word and the needle tunes to the molecule behind it. From the station, open its card, hear it, step to its neighbours, or leave for Browse, the Map, the daily game, the note decompiler and How it works.

## What it steals

Dieter Rams's Braun T 1000 world receiver (1963), built the way teenage.engineering builds a product page: the page is the object. From the T 1000 we take its proportions and its mechanism: one milled faceplate; a black scale window across most of its width, printed with a strip of ticks per band, names printed only for the band in use, graduated along the top and crossed by one needle; light knurled knobs set into that window; a perforated speaker panel running the full height of the set; gauges and push keys on the plate below. You do not search a list; you sweep, and names slide past the needle. No Braun or teenage.engineering marks, layouts or type.

Mapped onto the data:

- **Bands** are the odour families. A molecule is a station on the band its measured descriptors name most often (ties go to the family named first). Molecules with no measured family sit off the dial and stay in Browse.
- **Order along a band** is the band's first principal axis in the map projection, so it is a way to sweep, not a measurement. The glass says so.
- **The station plate** shows what the source measured, engraved: it never moves.
- **Six gauges** on one strip show the top predicted descriptors. The needle sits at the mean, the wedge spans the ensemble's spread, and a settled needle trembles by that spread. A sure guess barely moves; an unsure one shakes. Every word on the glass and on a gauge carries its number.
- **The station memory** is printed on the plate: the odour neighbours, ranked by cosine similarity in the model's embedding, not by human ratings. The station's own isomers are left out (the plate names them by CAS instead), and isomers that share a name appear once. The page, the card, the map and the README all carry the cosine wording.
- **The on-air lamp** in the glass lights when a station is on air.
- **The grille** plays the station through the Synesthesia mapping. Sound starts only when the visitor presses the grille or tunes by hand, never on load.

## Signature moment

The name is set as large as the glass allows, up to 128 px. When the needle settles, everything but the burn steps back: the tick strips and the band legend to a quarter, the station names, the header text and the labels to about a third, the keys to half, the gauges to about 60%. The tuning window stays black and only its ink dims, so it still reads as live and still takes typing. Then the name and its top predicted words burn from left to right. The letters ahead of the front stay crisp, so the name reads until the front reaches it. The front is an unbroken 2 px yellow-white line down the full height of each letter, then a few pixels of flame, and behind it the letters turn to one continuous grey ash, softly mottled, with a dark char rim where each letter ends, the way paper burns. The front crosses the ink, not the empty glass, so it takes about 2.1 s whatever the name's length. The ash then thins in soft patches over up to 1 s, and each ember drops plumb under its own letter, from rest, like something falling; it leans towards the port only in the last stretch above the gutter. An ember leaves white-hot and cools through amber to its descriptor's colour by the time it reaches the gutter. The embers pass behind the band legend, and the name's embers behind the score line under it, so neither is scrambled while it is still to be read. Because a letter sheds for most of a second, every burned letter hangs its own curtain down to the gutter while the front is still moving; nothing rises above the letters. The ash never goes entirely: an 8% grey imprint of the name stays on the glass through the pour, so the window is never empty.

The phases overlap: the first embers reach the grille when the front is 60% of the way across the name, so one frame holds the front, the ash, the curtains, the river and a growing plume. The gutter is milled along the bottom of the glass, under the last band, so the river never crosses a tick strip or the needle, and the knob panel's divider stops above it. In it the top three descriptors keep a lane each, 3 px wide with 2 px between them, middle lane for the strongest; while a station plays, the gutter floor carries a 16% tint of each lane's colour. Beside the glass the gutter runs level with the nearest row of holes, moving by at most half a hole. It carries on through the bezel into the speaker panel as a single milled port with a rounded mouth, in place of that row's first hole, so it ends one ordinary gap short of the next hole and the river runs straight into it. The port's own hole and the ones just above and below it are left out, the same on both sides, and every hole on the panel is whole. The plume is the 72 holes nearest the port. Each of the three descriptors takes a ring of it in proportion to its share, the largest nearest the port, and its first embers light that ring from the inside out, so the plume spreads ahead of the pour. Each hole glows white-hot for a moment and then in its descriptor's colour inside a dark rim, brightest at the port and dimming towards the plume's edge; in the grille an ember shows only inside a hole, never on the metal between. The gauges answer the river: their needles dip to zero as the burn starts and rise with the share of embers already in the grille, reaching the station's predicted values as the last one lands. Once the name is back, the plume cools over 1.8 s from its far edge back to the port and the panel is dark again; after a hand on the dial or a press, each landing ticks. Then the header and keys come back, the full-size name returns and the on-air lamp comes on, so the frame after the broadcast is as strong as the one before it. Tuning away runs the whole sequence backwards: the plume heats up again, the embers pour back out of the holes, up the gutter and the curtains, the needles fall with them, and the old name re-forms from its ash.

Every ember carries real data. Each picks one of the station's top three predicted descriptors in proportion to its probability, takes that descriptor's family colour and rides its lane; a descriptor the model is unsure of wanders a little more inside its lane. Each ember is drawn twice: a hard-edged core of 2 to 4 px in its family colour, alpha-blended, and a faint additive halo, so phenolic, smoky and sweet stay separate hues instead of washing to white. In the gutter the core shrinks to 2.4 px and the halo fades, which keeps the three lanes apart. At one device pixel per CSS pixel every core is 2 px and there is no halo, and nothing spills past the gutter's floor. Up to 3,000 embers leave, spread evenly over the letters.

Technique, rewritten from Thibault Introvigne's gommage effect (Codrops, January 2026): a noise-thresholded dissolve with a hot edge and a desaturating remainder, and particles born where the text dies. Ours differs in three ways: the text is drawn into a canvas texture from the page's own fonts, so no font atlas ships; particles start on the lit pixels of that texture and the front reaches them in the same frame it reaches their pixel, because JavaScript and the shader read the same linear-filtered noise grid (`src/receiver/signal.ts`); each then waits out its ash before it leaves; and every position is a pure function of one progress value, which makes the reverse exact and lets the loop sleep when nothing moves.

Engineering: three 0.187.0, `WebGLRenderer` with `ShaderMaterial` (WebGL2), one transparent canvas over the faceplate, loaded after first paint. Four draws: the burning text, the ember halos (additive), the ember cores (normal blending, up to 3,000 points) and the grille's lit holes. Which hole each ember lights, and when, is worked out once per broadcast into a small texture, one texel per hole, laid out by `holeRow` in `src/receiver/signal.ts` exactly as the CSS lays out the perforation (`background-repeat: space`), so each glow sits in a real hole. Embers are clipped to the glass, the port and the grille's hole discs (`riverOf` and `holeRow` in `src/receiver/signal.ts`), so nothing crosses the band keys or the metal between holes. The burn is skipped, and the lamp simply lights, when the name is scrolled off screen. It renders only while a flight runs, stops when the tab is hidden and caps the pixel ratio at 2 (1 on narrow screens). The ticks are 6 ms noise bursts scheduled on the Web Audio clock; they need an audio context, which only a press or a hand on the dial creates.

Reduced motion: no intro sweep, no flight, no tremor, no ticks. The needle lands on the station, the name stays printed on the glass, the on-air lamp lights and the gauges hold still with the spread drawn as a wedge. Without WebGL the same still frame shows.

## Hierarchy

1. The glass: the name, its words, the needle on the printed scale.
2. The speaker panel and the gauges.
3. Band keys.
4. The station plate and the station memory.
5. Sources and caveats, once each, small and quiet.

## Tokens

All in `site/src/tokens.css`; `site/scripts/check-tokens.mjs` enforces them.

- Page: brushed aluminium `--ground` `#c9cac7`. Faceplate: `--face` `#d4d5d1` with a `--face-edge` `#8e8f8b` hairline and a lit top edge; hairline rules `--face-rule`.
- Engraved ink `--on-ground` `#161616`, soft ink `#464744`.
- Black glass: `--glass` `#0d0e0e`, glass ink `#ecebe6`, glass dim `#a3a29c` (names on the tuned band), glass faint `#7d7c75` (band counts).
- Signal: `--signal` `#f0501e`, the only hue on the set. The needle, the knob dot, the on-air lamp, the gauge needles and the measured tick (`--signal-ink` `#962b08` on light metal).
- Burn: `--dim-data` (0.25) for the tick strips and band legend, `--dim-furniture` (0.35) for the station names, header text and labels, `--dim-keys` (0.5) for every key and `--dim-gauges` (0.6) for the gauges while a name burns. The tuning window's ink drops to glass dim unless it has focus. Nothing else dims.
- Family colours come from the data and appear only on glass (band names and tick strips) or as small colour bars on the band keys with the family name beside them in ink.
- Band keys: `--key` `#dcdcd8`, flush in one recessed channel split by `--channel-rule` hairlines. Nothing travels: a pressed key darkens to `--key-down` and its colour bar lights. The tuning window and its Tune key, and the three preset keys, sit in channels cut the same way.
- The gutter and the port are milled to the same depth with a `--glass-raised` floor. The port is recessed into the faceplate (`--shadow-port`, `--shadow-port-side` on a phone, where the port drops): the metal breaks into a `--face-edge` shadow wall above the cut and catches a 1 px `--paper-lift` lip below it. The port cuts through the glass's own edge and takes the place of the first hole in its row, ending in a rounded mouth one ordinary gap short of the next hole, so gutter, port and hole read as one channel.
- The grille at rest is plain dark holes, whole ones only. The port's hole and its two neighbours across the river are left out. Nothing outlines them.

Contrast, computed from the tokens: band names on glass 4.7:1 (roasted) to 13.9:1 (sweet), glass dim on glass 7.6:1, glass faint on glass 4.6:1, signal on glass 5.4:1, soft ink on the faceplate 6.3:1, soft ink on aluminium 5.7:1, signal ink on aluminium 4.8:1 (hover text).

## Type

Chivo (variable, 100 to 900) for names, labels and controls; Chivo Mono for numbers, the tuning slot and the glass scale. The control names are engraved, the way the hardware would mark them (uppercase, 0.14 em tracking): Tune to, Tune, Presets, Tuning, On air and, on wide screens, Listen. Section names on the plate (Predicted, Station, Station memory) are sentence case. Tabular figures everywhere. Both are SIL Open Font License 1.1, self-hosted from `site/src/fonts/` with the licence in `site/src/fonts/OFL.txt` (source: Omnibus-Type, packaged by Fontsource 5.3.0).

## Motion

- The needle follows a critically damped spring; a ghost trail of five needles lags behind a fast sweep. It starts below the printed names, so it never crosses one.
- Only the tuned band prints names: up to three staggered lines above the ruler (`stackLabels` in `src/receiver/bands.ts`), each on a leader down to its tick. The tuned name is bold, centred on the needle and kept at least 16 px from any neighbour; the other names step down from the dim ink to the faint ink (4.6:1) as they near the needle, graded over 160 px, and never lower. Isomers that share a name print once. Every other band is a strip of ticks in its family colour. The band names sit in a fixed key at the left of the scale, each with its family's colour dot; on a phone the scale slides under the key.
- Gauge needles drop toward zero while tuning (signal lost between stations) and swing up on arrival.
- Broadcast: 4.4 s out (front 2.1 s, ash up to 1 s, each ember 1.2 s from letter to hole, overlapping); back, 0.27 s for the grille to heat up and 0.85 s for the pour. Nothing else animates on load except the intro sweep to the first station.

## Numbers and where they come from

Every number on the home page is computed in the browser from the published bundle, which `scripts/make_bundle.sh` (`smellcule export`) writes:

- Stations per band, the band count and the molecules off the dial: `buildDial` in `site/src/receiver/bands.ts`, over `atlas.json`.
- Predicted probability and spread on the meters and the glass: `predictions.bin` and `spread.bin`.
- Memory scores: the cosine similarities in `atlas.json` neighbours, filtered by `memoryOf` in `site/src/receiver/bands.ts`.
- CAS numbers (including the isomers named on the plate), formulas and splits: `atlas.json`.

## What must not change

- Measured and predicted descriptors are never mixed. Measured is engraved and still; predicted moves.
- Neighbours are always described as cosine similarity in the model's embedding, not human ratings.
- The order along a band is never presented as a measurement.
- No sound before a press or a hand on the dial.
- The canvas never holds the only copy of any text: the station plate and meter captions carry it in the DOM.

## Rules

- Tokens only. One theme. No drop shadows and no offsets: edges are hairlines, and the port's recess is the only shadow. No gradients except the aluminium brushing, the knob's knurling, the grille's perforation and the fade at the ends of a sliding scale.
- Each caveat is said once: the cosine wording on the station memory, the projection and spread notes in the footnote.
- No pills, no chip buttons, no tags. Underline means a link and nothing else. The suggestions are three numbered preset keys beside the tuning window, the way a receiver's memory buttons are.
- A predicted word that the measured ratings also list carries a small filled tick before it; the line under the gauges shows the same tick.
- No decorative icons.
- Focus ring: 3 px ink on aluminium and plates, glass ink inside the map.

## Known limits

- Structure bond colour is baked into the exported SVGs, so structures sit on glass windows.
- The ember flight is WebGL only; without it the name stays printed on the glass and the lamp lights.
- On a phone the knob row moves to the top of the glass, so the river along the bottom never crosses Tuning or On air. The grille runs the full width with the port dropping onto its middle hole column; the panel is itself the button, so the Listen caption is left off.
- On a phone the scale is wider than the glass and slides under the needle. Its edges fade over 24 px and a name is printed only where it fits whole inside the window, so the names far from the needle are left off until the needle moves to them. The band keys show four whole keys and a 30 px peek of the fifth, which sits wholly inside a 38 px fade; the links in the header row fade over 48 px the same way, so a peeking item reads as more to come rather than a cut.
- On a phone the brand and the links share one row; each link is a 44 px target in 13 px type, and the row scrolls under a fade at the right. The intro sentence sits above the receiver.
- The ticks were checked as scheduled, not listened to on every device.
- Browse groups molecules by its own rule, so its family counts differ from the band counts on the dial.

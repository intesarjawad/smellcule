# Listening check

`make gate-site` checks that no two demo molecules map to nearly the same sound parameters
(`site/tests/gate/distance.test.ts`). Numbers cannot say whether the sounds are pleasant or
recognisably different, so a person listens once on the real bundle before release.

## How to listen

Takes about 20 minutes.

1. Unpack the atlas bundle into `site/public/data`, then run
   `cd site && VITE_DATA_URL=data/ npm run build && npm run demo`.
2. Open each molecule below on `#/synesthesia?a=<id>`. Find its id with the atlas search. Press
   Play and listen for at least 10 seconds.
3. Open each glide on `#/synesthesia?a=<first id>&b=<second id>` and move the slider slowly
   from one end to the other while it plays.
4. Write the result under "Verdict".

Molecules: Geosmin, Vanillin, Limonene, Cedrol, Muscone, Eugenol, Furfuryl mercaptan, Calone®.

Glides: Limonene to Vanillin, and Geosmin to Calone®.

## What to confirm after the retune

The mapping was retuned so that the closest demo pairs differ in sound (ADR 0013). Listen for
each difference it is meant to make, and note any pair where you cannot hear it:

1. Vanillin against Calone®: Vanillin is grainier and busier and sits in the in-between (dorian)
   mode; Calone® is smooth and major.
2. Geosmin against Cedrol: Geosmin is wet, with a long reverb tail, and dorian; Cedrol is dry,
   grainy and minor.
3. Cedrol against Muscone: Muscone washes out in reverb; Cedrol stays dry.
4. Eugenol against Furfuryl mercaptan: Eugenol is busier and dorian; Furfuryl mercaptan is
   sparser and minor.
5. The added grit on Eugenol and Furfuryl mercaptan and the long reverb on Geosmin and Muscone
   stay pleasant: no harsh buzzing, no muddy wash. In the Geosmin to Calone® glide the reverb
   fades smoothly and the scale changes on a bar line without a jump.

## If molecules sound alike

Change only the coefficients in `deriveMapping` (`site/src/synesthesia/mapping.ts`) and the
matching `DEFAULT_PRESET` in `mapping-codec.ts`. Never change the molecules, their predictions
or the family labels to make them sound apart. Record each coefficient change and the reason in a
new ADR under `docs/adr/`, then run `make check` and `make gate-site` again and listen again.

## Verdict

Status: pending.

Replace the status line with the past tense of "approve", or list the changes you want: which
molecules sounded alike, and which glide jumped or stalled.

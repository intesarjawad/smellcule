# 0013: Retune the sound mapping so the demo molecules sound apart

## Context

On the real bundle, five of the 28 demo pairs fell below the distance gate: Vanillin and
Calone®, Geosmin and Cedrol, Cedrol and Muscone, Geosmin and Muscone, Eugenol and Furfuryl
mercaptan. The predictions put most of each pair's weight in one shared family (sweet for
Vanillin and Calone®, woody for Geosmin and Cedrol), and the formulas gave woody and musky the
same coefficient wherever both appeared. The families that tell these pairs apart (spicy,
earthy, and musky against woody) barely moved the sound.

## Decision

Change only coefficients. The molecules, their predictions and the family labels stay as they
are.

- Scale threshold from 0.2 to 0.5: the scale leaves dorian only when bright or dark families hold
  more than three quarters of the weight. At 0.2 nearly every profile was major or minor; mixed
  profiles such as Vanillin, Geosmin and Eugenol now keep the in-between mode.
- Roughness: spicy from 1 to 3, woody from 0 to 1.25, waxy from 0.5 to 1. Pungency and dry wood
  grain become FM grit. Waxy rises so that a larger waxy share still adds roughness next to the
  higher spicy and woody terms.
- Notes per beat: spicy from 1 to 2.5.
- Reverb: musky from 1 to 2, earthy from 0 to 3, woody from 0 to −0.25. Musk is diffuse, earth
  damp and cavernous, wood dry.

Tempo, brightness, warmth, register and attack keep their formulas. `DEFAULT_PRESET` in
`mapping-codec.ts` carries the same coefficients, and the mapping table test still checks it
against `deriveMapping`.

## Consequence

All 28 demo pairs clear the gate on the current bundle. A molecule whose weight is a third spicy
or more now reaches full roughness, so strongly spicy molecules share the same grit. Vanillin sits
just inside dorian and Cedrol just inside minor, and two pairs rely on that difference in scale:
new predictions can move either molecule across the threshold and bring Vanillin and Calone® or
Geosmin and Cedrol back under the gate, so `make gate-site` runs again after any retraining. The
listening check in `docs/listening-check.md` still decides whether the sounds are pleasant and
recognisably different.

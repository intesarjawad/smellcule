# Bend it

Smellcule has four extension points: content presets, sound presets, your own model's predictions
and the Python API. Each is worked through below with the commands that were run and the output
they printed. Long output is cut at a line reading `...`.

## Content presets: phrases, notes and words

A phrase is a few lines in `config/phrases.yaml`. Its weights name catalogue descriptors, and it
needs an exemplar only when a primary source says that molecule is the smell. Add one:

```yaml
attic:
  aliases:
  - dusty attic
  weights:
    musty: 1.0
    woody: 0.6
    dusty: 0.4
  exemplar: null
```

Validate authored molecule-evidence links against the locally fetched catalogue before opening a pull request. Synthetic fixtures exercise validators but do not validate real odour associations:

```console
$ uv run python -c '
from pathlib import Path
from smellcule import sources
from smellcule.catalogue import read_leffingwell
from smellcule.export.phrases import load_phrases
labels, rows = read_leffingwell(sources.fetch("leffingwell"))
print(len(load_phrases(Path("config/phrases.yaml"), labels, rows)), "phrases valid")'
...
ValueError: Unknown or empty descriptor evidence: ['musty', 'woody', 'dusty'].
```

`dusty` is not a catalogue descriptor; the nearest is `earthy`. With that one word changed, the same command prints:

```console
83 phrases valid
```

The phrase tests count the entries, so update the count in `tests/test_content.py` and
`tests/test_content_data.py` in the same pull request. Notes in `config/notes.yaml` follow the
same rule: a `constituent` link needs an `https` source, a `character` link needs the descriptor
in the catalogue.

Search reads a query word by word when no name, note or phrase matches it whole, so one everyday
word often does more than a new phrase. `config/words.yaml` lists, under each catalogue
descriptor, the words that name it or name a thing that smells of it. A smell the catalogue never
measured has no descriptor to sit under:

```yaml
referents:
  ozone: [thunderstorm]
```

```console
$ uv run python -c '
from pathlib import Path
from smellcule import sources
from smellcule.catalogue import read_leffingwell
from smellcule.export.phrases import load_phrases
from smellcule.export.words import load_words
labels, rows = read_leffingwell(sources.fetch("leffingwell"))
phrases = load_phrases(Path("config/phrases.yaml"), labels, rows)
print(len(load_words(Path("config/words.yaml"), labels, phrases).words), "words valid")'
...
ValueError: 'ozone' is not a catalogue descriptor; list only measured descriptors.
```

Without that entry the same command prints `116 words valid`, and a search for "thunderstorm"
says no descriptor in the catalogue names it.

## Sound presets: Synesthesia mapping links

In Synesthesia, open "Edit mapping", pick a parameter and change its bias or a family's
coefficient. The page rewrites its own link, and "Link to this sound" carries the whole mapping in
the `map` parameter as base64url JSON. Raising warmth's citrus coefficient to 2 gives:

```text
#/synesthesia?a=2794&b=1557&map=eyJ2IjoxLCJwYXJhbXMiOnsidGVtcG9CcG0iOnsiYmlhcyI6MC4wNDc2MTkwNDc2MTkwNDc2MTYsImsiOnsiY2l0cnVzIjowLjgzMzMzMzMzMzMzMzMzMzQsImZyZXNoIjowLjgzMzMzMzMzMzMzMzMzMzQsImZydWl0eSI6MC44MzMzMzMzMzMzMzMzMzM0LCJzcGljeSI6MC4zNTcxNDI4NTcxNDI4NTcxNSwiZ3JlZW4iOjAuMzU3MTQyODU3MTQyODU3MTUsIndvb2R5IjotMC4xMTkwNDc2MTkwNDc2MTkwNCwibXVza3kiOi0wLjExOTA0NzYxOTA0NzYxOTA0LCJlYXJ0aHkiOi0wLjExOTA0NzYxOTA0NzYxOTA0fX0sImJyaWdodG5lc3MiOnsiYmlhcyI6MCwiayI6eyJjaXRydXMiOjEsImZyZXNoIjoxLCJmcnVpdHkiOjAuNCwiZ3JlZW4iOjEsImZsb3JhbCI6MC42fX0sIndhcm10aCI6eyJiaWFzIjowLCJrIjp7ImNpdHJ1cyI6Miwid29vZHkiOjEsIm11c2t5IjoxLCJzd2VldCI6MSwicm9hc3RlZCI6MC41fX0sInJvdWdobmVzcyI6eyJiaWFzIjowLCJrIjp7InNwaWN5IjoxLCJyb2FzdGVkIjoxLCJzYXZvcnkiOjEsIndheHkiOjAuNX19LCJub3Rlc1BlckJlYXQiOnsiYmlhcyI6MCwiayI6eyJjaXRydXMiOjEsImZydWl0eSI6MSwic3BpY3kiOjEsImdyZWVuIjowLjV9fSwicmVnaXN0ZXJNaWRpIjp7ImJpYXMiOjAuNSwiayI6eyJjaXRydXMiOjEsImZyZXNoIjoxLCJ3b29keSI6LTEsIm11c2t5IjotMSwiZWFydGh5IjotMSwiZmxvcmFsIjoxfX0sImF0dGFja01zIjp7ImJpYXMiOjAsImsiOnsid29vZHkiOjEsIm11c2t5IjoxLCJmbG9yYWwiOjAuNSwic3dlZXQiOjF9fSwicmV2ZXJiTWl4Ijp7ImJpYXMiOjAsImsiOnsiZnJlc2giOjEsIm11c2t5IjoxLCJmbG9yYWwiOjF9fX19
```

Anyone can read a shared link before opening it. With the link's `map` value in `MAP`:

```console
$ python3 -c 'import base64, json, sys; s = sys.argv[1]; print(json.loads(base64.urlsafe_b64decode(s + "=" * (-len(s) % 4)))["params"]["warmth"])' "$MAP"
{'bias': 0, 'k': {'citrus': 2, 'woody': 1, 'musky': 1, 'sweet': 1, 'roasted': 0.5}}
```

The page validates every link against `schemas/mapping.schema.json` and loads the default
mapping, with a notice, when one is malformed or too large. Playback requires pressing Play.

## Your model's predictions

`smellcule evaluate --predictions` scores a CSV of probabilities on the official split and the
cluster split, with no model code loaded. The format and the pull-request route are in
[submitting-predictions.md](submitting-predictions.md). This example scores the simplest possible
model: every molecule gets the share of training molecules that carry each descriptor. It is the
floor a real model has to clear.

Export the splits from the pinned Leffingwell fetch:

```console
$ uv run smellcule splits --out scratch/splits
Splits: scratch/splits
```

Write the predictions. `scratch/prevalence.py` keys each row by InChIKey, as the scorer requires:

```python
import csv
import json
from pathlib import Path

from rdkit import Chem

from smellcule import sources
from smellcule.catalogue import read_leffingwell

labels, rows = read_leffingwell(sources.fetch("leffingwell"))
assert list(labels) == json.loads(Path("scratch/splits/labels.json").read_text())
split = {r["inchikey"]: r["split"] for r in csv.DictReader(open("scratch/splits/official.csv"))}
keyed = [(Chem.MolToInchiKey(Chem.MolFromSmiles(r.smiles)), r.measured) for r in rows]
train = [m for k, m in keyed if split[k] == "train"]
rate = [sum(m[i] for m in train) / len(train) for i in range(len(labels))]
with open("scratch/predictions.csv", "w", newline="") as out:
    w = csv.writer(out)
    w.writerow(["inchikey", *labels])
    for k, _ in keyed:
        w.writerow([k, *rate])
print(len(keyed), "rows,", len(labels), "descriptors")
```

```console
$ uv run python scratch/prevalence.py
3523 rows, 113 descriptors
```

Score it on the official split. The command prints the stored result as JSON:

```console
$ uv run smellcule evaluate --predictions scratch/predictions.csv \
    --name 'Train prevalence' --licence MIT --source-url https://example.org/prevalence \
    --results scratch/results.json --split official | head -12
{
  "Train prevalence": {
    "name": "Train prevalence",
    "licence": "MIT",
    "source_url": "https://example.org/prevalence",
    "official": {
      "all_labels": {
        "auroc": 0.5,
        "auprc": 0.03341259529821293,
        "label_count": 113,
        "ci": {
          "lower": 0.5,
...
```

A constant model ranks every molecule equally, so its AUROC is exactly 0.5 and its AUPRC equals the
mean prevalence. To read the headline numbers from the results file:

```console
$ uv run python -c '
import json
r = json.load(open("scratch/results.json"))["submissions"]["Train prevalence"]["official"]
for k in ("all_labels", "stable_labels"):
    print(k, r[k]["label_count"], "labels, AUROC", round(r[k]["auroc"], 3), "AUPRC", round(r[k]["auprc"], 3))
print(r["molecule_count"], "held-out molecules scored")'
all_labels 113 labels, AUROC 0.5 AUPRC 0.033
stable_labels 105 labels, AUROC 0.5 AUPRC 0.036
722 held-out molecules scored
```

`stable_labels` keeps only descriptors with at least five positives among the scored molecules.
A malformed file is refused before anything is written, with the row and the fix:

```console
$ printf 'inchikey,alcoholic\nAAAAAAAAAAAAAA-AAAAAAAAAA-A,0.5\n' > scratch/bad.csv
$ uv run smellcule evaluate --predictions scratch/bad.csv --name x --licence MIT \
    --source-url https://example.org --results scratch/r2.json --split official
error: row 1, column header: expected inchikey then labels in labels.json order
next: smellcule splits --out splits; see docs/submitting-predictions.md
$ echo $?
2
```

## Python API: catalogue lookup

`lookup(query, model="lf")` resolves an exact case-insensitive name or CAS first,
then a name prefix. Multiple matches are returned together, including stereo
variants. Unrecognised inputs raise `NotInCatalogue`; suggestions use catalogue
names. Lookup reads recorded predictions and never evaluates a model.

`lookup` returns a frozen `LookupResult`. `smellcule lookup --json <name>` serialises
it with sorted keys. The root contains `model`, `revision`, `labels` and
`matches`. Each match contains `molecule_id`, `name`, `cas`, `measured`, `prob`,
`spread`, `split` and `nearest_train_similarity`. All descriptor arrays follow
`labels` order. `measured` contains binary observations for Leffingwell and
normalised mean ratings for Keller. Missing Keller observations and unavailable
nearest-train similarities are JSON `null`. `prob` contains predictions and
`spread` contains ensemble standard deviations. Keller predictions are out of
fold; their split is `cross_validated:<fold>`.

Both model revisions are pending publication. Downloads refuse unpublished
releases and require a pinned revision and a SHA-256 for each requested file.
Text output uses a plain renderer.

The local Keller CSV reader expects `CID`, `name`, `CAS`, `fold`,
`nearest_train_similarity`, and `measured_<label>`, `prob_<label>` and
`spread_<label>` for every label in `labels.json`. Ratings use the normalised
source scale; an empty measured field denotes a missing observation. This file
has not yet been produced or validated against a published release.

`weights.load_model("lf")` requires the research extra and restores the released
seed ensemble on CPU in evaluation mode. Release files contain no training
history. Restored members use an empty history, zero epoch and elapsed time,
and NaN validation score to denote unavailable training metadata.

### Worked example

`lookup` reads released predictions, and neither model is published yet, so it refuses today:

```console
$ uv run python -c '
from smellcule.lookup import lookup
lookup("geosmin")'
...
smellcule.errors.ModelNotPublishedError: smellcule-lf is not published
```

The matching rules do not need a release. `resolve` accepts `LookupMatch` rows.
This example uses the committed synthetic fixture; its descriptor associations
are test data, not measurements. Predictions are left empty:

```console
$ uv run python -c '
from pathlib import Path
from smellcule.catalogue import read_leffingwell
from smellcule.errors import NotInCatalogue
from smellcule.lookup import LookupMatch, resolve

labels, rows = read_leffingwell(Path("tests/fixtures/leffingwell_fixture.csv"))
matches = tuple(
    LookupMatch(r.molecule_id, r.name, r.cas, tuple(map(float, r.measured)), (), (), "train", None)
    for r in rows
)
for hit in resolve("geosmin", matches):
    print(hit.name, hit.cas, [l for l, v in zip(labels, hit.measured) if v])
print(len(resolve("vanill", matches)), "names start with vanill")
try:
    resolve("geosmn", matches)
except NotInCatalogue as error:
    print(error, "|", error.next_step)'
Geosmin 19700-21-1 ['buttery', 'citrus', 'fishy', 'melon', 'mushroom', 'rum', 'violet']
1 names start with vanill
not in the catalogue: Smellcule v1 predicts only for catalogued fragrance and flavour molecules | smellcule lookup "Geosmin"
```

An exact name or CAS wins, a name prefix returns every match, and a near miss raises
`NotInCatalogue` with the closest catalogue names as the next step. Once a release is published,
`lookup("geosmin")` returns catalogue observations with `prob`, `spread` and `split` filled in.

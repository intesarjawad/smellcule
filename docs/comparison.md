# How Smellcule compares

Checked on 2026-11-10. Each of these does something Smellcule does not.

| | What it is | Access | What it does better than Smellcule |
| --- | --- | --- | --- |
| [Osmo](https://www.osmo.ai/) | A company that makes custom fragrances for brands, built on its own scent data and perfumers | Through the company; the pages describe a partnership, sample shipments and an advisor | Turns a brief into a finished, manufacturable fragrance, backed by a much larger private data set and in-house perfumers. It publishes no map, model or API that I could find on its site. |
| [Wikiparfum](https://www.wikiparfum.com/en/ingredients) | A directory of perfumes, perfumers and ingredients | Free to browse, with a log-in | Covers finished fragrances and ingredient families, so you can start from a perfume. Smellcule covers single molecules and note links. |
| [Leffingwell PMP 2001](http://www.leffingwell.com/bacispmp.htm) | A CD-ROM database of perfumery materials | Paid licence, listed on the vendor's page | Holds more materials plus stability, application and supplier records. Smellcule has only the descriptor labels. |
| [OpenPOM](https://github.com/BioMachineLearning/openpom) | An MIT-licensed replication of the Principal Odor Map in DeepChem | Free; needs `Python 3.10`, DeepChem nightly and DGL | Trained on the larger GS-LF set, which Smellcule cannot release. It is a training library, not a map or a game. |
| [Pyrfume](https://pyrfume.org/) | Curated olfaction data sets and a Python package | Free | The home of the data Smellcule starts from, and other olfaction data sets. It has no map or model. |
| Smellcule | A browsable map, a daily game and a scoring harness for descriptors of 3,523 catalogued molecules | Free in a browser, from a clone today; no account | Runs with no account or install once hosted, shows measured and predicted apart, and scores anyone's model on the same splits. |

Notes on how this was checked. Osmo and Pyrfume were read live on 2026-11-10. The Wikiparfum site refused an automated request
that day, so its row rests on an Internet Archive snapshot of the ingredients page from 2026-07-07; the Leffingwell page was
read live over HTTP the same day. I did not compare accuracy with any of them: their models are not available to score.

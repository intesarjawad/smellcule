import json
import math
from pathlib import Path
from statistics import median

import numpy as np
import pytest

from smellcule.experiments import RUNS

ROOT = Path(__file__).resolve().parents[1]


@pytest.mark.data
def test_completed_reproduction_metrics_and_support() -> None:
    results = json.loads((ROOT / "eval/results.json").read_text(encoding="utf-8"))
    assert set(RUNS) <= results.keys()
    for name in RUNS:
        row = results[name]
        assert row["ensemble_size"] == 10
        assert math.isfinite(row["wall_time_s"])
        assert row["wall_time_s"] > 0
        assert row["machine"]
        assert set(row["versions"]) == {"python", "numpy", "torch", "rdkit", "scikit-learn"}
        metrics = row.get("mpnn", row)
        for threshold in ("all_labels", "stable_labels"):
            summary = metrics[threshold]
            assert summary["label_count"] > 0
            if name != "keller_cv":
                assert 0 <= summary["auroc"] <= 1
                assert 0 <= summary["auprc"] <= 1
                assert 0 <= summary["ci"]["lower"] <= summary["ci"]["upper"] <= 1
                assert 0 < summary["ci"]["resamples"] <= 1000
        if name in {"official", "official_minus_leaked", "cluster", "cross_source"}:
            assert "paired_auroc_difference_ci" in metrics["stable_labels"]
            assert row["rf_ensemble_size"] == 1
    assert results["official"]["molecule_count"] == 722
    assert results["official_minus_leaked"]["molecule_count"] == 682
    assert results["official"]["mpnn"]["all_labels"]["label_count"] == 113
    assert results["official"]["mpnn"]["stable_labels"]["label_count"] == 105
    assert results["cross_source"]["molecule_count"] == 1644
    assert len(results["cross_source"]["labels"]) == 105
    assert (
        sum(item["molecule_count"] for item in results["domain"]["bins"])
        == results["cluster"]["molecule_count"]
    )
    assert sum(item["molecule_count"] for item in results["cross_source"]["bins"]) == 1644


@pytest.mark.data
def test_completed_keller_oof_and_final_epoch_protocol() -> None:
    results = json.loads((ROOT / "eval/results.json").read_text(encoding="utf-8"))
    row = results["keller_cv"]
    assert row["molecule_count"] == row["final_training_rows"] == 478
    assert row["all_labels"]["label_count"] == row["stable_labels"]["label_count"] == 20
    assert -1 <= row["ci"]["lower"] <= row["ci"]["upper"] <= 1
    assert row["ci"]["resamples"] == 1000
    assert row["final_epochs"] == int(median(row["fold_best_epochs"]))
    with np.load(ROOT / "artifacts/keller_oof.npz", allow_pickle=False) as data:
        assert data["prob"].shape == data["spread"].shape == data["observed"].shape == (478, 20)
        assert len(set(data["cid"].tolist())) == 478
        assert np.isfinite(data["prob"]).all()
        assert ((data["prob"] >= 0) & (data["prob"] <= 1)).all()
        assert (data["spread"] >= 0).all()
        assert int((~data["observed"]).sum()) == row["missing_rating_count"]
        tested: set[int] = set()
        for fold in row["folds"]:
            train, validation, test = (
                set(fold[key]) for key in ("train_indices", "validation_indices", "test_indices")
            )
            assert not train & validation
            assert not train & test
            assert not validation & test
            assert train | validation | test == set(range(478))
            assert not tested & test
            tested.update(test)
            np.testing.assert_array_equal(
                np.flatnonzero(data["fold"] == fold["fold"]), sorted(test)
            )
        assert tested == set(range(478))
    final = json.loads((ROOT / "artifacts/smellcule-open/config.json").read_text(encoding="utf-8"))
    assert all(member["best_epoch"] == row["final_epochs"] for member in final["members"])

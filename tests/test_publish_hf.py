import hashlib
import importlib.util
import json
import shutil
from pathlib import Path
from types import ModuleType, SimpleNamespace

import huggingface_hub
import numpy as np
import pytest
from safetensors.torch import save

from smellcule import catalogue, releases, sources
from smellcule.export.keller_rows import fixture_rows
from smellcule.lookup import lookup
from smellcule.model import OdourMPNN
from smellcule.weights import load_model

ROOT = Path(__file__).resolve().parents[1]
LEFFINGWELL = ROOT / "tests/fixtures/export_catalogue.csv"
FIXTURE_DEMO_NAMES = ("Geosmin", "Vanillin", "Limonene", "Furfuryl mercaptan")
PUZZLE_IDS = ("425", "2279")
LF_FILES = {
    "config.json",
    "labels.json",
    "model.safetensors",
    "predictions.safetensors",
    "split.csv",
}
OPEN_FILES = {"catalogue.csv", "config.json", "labels.json", "model.safetensors"}

pytestmark = pytest.mark.leffingwell_fixture


def load_script(name: str) -> ModuleType:
    spec = importlib.util.spec_from_file_location(name, ROOT / f"scripts/{name}.py")
    assert spec is not None
    assert spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def write_checkpoint(directory: Path, labels: tuple[str, ...]) -> None:
    directory.mkdir(parents=True)
    model = OdourMPNN(len(labels), 8, 1, 4)
    (directory / "model.safetensors").write_bytes(
        save({f"seed0.{key}": value for key, value in model.state_dict().items()})
    )
    (directory / "labels.json").write_text(json.dumps(list(labels)))
    (directory / "config.json").write_text(
        json.dumps(
            {
                "arch": "OdourMPNN",
                "version": 1,
                "feature_spec": "atom34-bond10-v1",
                "config": {"hidden": 8, "steps": 1, "embed_dim": 4},
            }
        )
    )


@pytest.fixture
def release_root(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    root = tmp_path / "repo"
    (root / "eval").mkdir(parents=True)
    (root / "tests/golden").mkdir(parents=True)
    (root / "dist/bundle").mkdir(parents=True)
    shutil.copy(ROOT / "CITATION.cff", root)
    shutil.copy(ROOT / "eval/results.json", root / "eval")
    (root / "dist/bundle/smellcule.json").write_text(
        json.dumps({"puzzles": [{"moleculeId": molecule_id} for molecule_id in PUZZLE_IDS]})
    )
    rng = np.random.default_rng(7)

    labels, rows = catalogue.read_leffingwell(LEFFINGWELL)
    write_checkpoint(root / "artifacts/cluster", labels)
    np.savez(
        root / "artifacts/cluster.npz",
        molecule_id=np.array([row.molecule_id for row in rows]),
        labels=np.array(labels),
        prob=rng.random((len(rows), len(labels))),
        spread=rng.random((len(rows), len(labels))) / 4,
        split=np.resize(["train", "validation", "held_out", "train", "held_out"], len(rows)),
        nearest_train_similarity=rng.random(len(rows)),
    )

    keller = fixture_rows(ROOT)
    write_checkpoint(root / "artifacts/smellcule-open", catalogue.KELLER_DESCRIPTORS)
    shape = (len(keller), len(catalogue.KELLER_DESCRIPTORS))
    np.savez(
        root / "artifacts/keller_oof.npz",
        cid=np.array([row.molecule_id for row in reversed(keller)]),
        labels=np.array(catalogue.KELLER_DESCRIPTORS),
        prob=rng.random(shape),
        spread=rng.random(shape) / 4,
        fold=np.arange(len(keller)) % 5,
        nearest_train_similarity=rng.random(len(keller)),
    )

    # The Keller paths are never opened: read_keller returns the reconciled fixture rows.
    def local_source(key: str) -> Path:
        return LEFFINGWELL if key == "leffingwell" else tmp_path / key

    monkeypatch.setattr(sources, "fetch", local_source)

    def fixture_keller(*_paths: Path) -> tuple[catalogue.KellerRow, ...]:
        return keller

    monkeypatch.setattr(catalogue, "read_keller", fixture_keller)
    return root


@pytest.fixture
def publish_hf(monkeypatch: pytest.MonkeyPatch) -> ModuleType:
    module = load_script("publish_hf")
    monkeypatch.setattr(module, "DEMO_NAMES", FIXTURE_DEMO_NAMES)
    return module


class FakeHub:
    def __init__(self) -> None:
        self.private: dict[str, bool] = {}
        self.uploaded: dict[str, set[str]] = {}

    def create_repo(self, repo_id: str, *, private: bool, exist_ok: bool) -> None:
        assert exist_ok
        self.private[repo_id] = private

    def upload_folder(
        self, *, repo_id: str, folder_path: Path, commit_message: str
    ) -> SimpleNamespace:
        assert commit_message.startswith("Release smellcule ")
        self.uploaded[repo_id] = {path.name for path in folder_path.iterdir()}
        return SimpleNamespace(oid=hashlib.sha1(repo_id.encode()).hexdigest())  # noqa: S324


def refuse_hub() -> None:
    pytest.fail("a dry run must not construct a Hugging Face client")


def test_dry_run_stages_both_repositories_and_uploads_nothing(
    release_root: Path,
    publish_hf: ModuleType,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    monkeypatch.setattr(huggingface_hub, "HfApi", refuse_hub)
    out = tmp_path / "staged"

    assert publish_hf.main(["--root", str(release_root), "--out", str(out)]) == 0

    assert {path.name for path in (out / "lf").iterdir()} == LF_FILES | {"README.md"}
    assert {path.name for path in (out / "open").iterdir()} == OPEN_FILES | {"README.md"}
    assert not (release_root / "tests/golden/released_predictions.json").exists()
    printed = capsys.readouterr().out
    assert "Dry run: nothing uploaded" in printed
    digest = hashlib.sha256((out / "lf/predictions.safetensors").read_bytes()).hexdigest()
    assert f"{digest}  predictions.safetensors" in printed


def test_staged_files_satisfy_the_lookup_and_weights_contract(
    release_root: Path,
    publish_hf: ModuleType,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    out = tmp_path / "staged"
    assert publish_hf.main(["--root", str(release_root), "--out", str(out)]) == 0
    hashes = publish_hf.pins(out)
    assert set(hashes["lf"]) == LF_FILES
    assert set(hashes["open"]) == OPEN_FILES
    revisions = {"lf": "a" * 40, "open": "b" * 40}
    monkeypatch.setattr(releases, "RELEASED_REVISIONS", revisions)
    monkeypatch.setattr(releases, "RELEASED_SHA256", hashes)

    def staged_download(*, repo_id: str, filename: str, revision: str) -> str:
        name = repo_id.removeprefix("intesarjawad/smellcule-")
        assert revision == revisions[name]
        return str(out / name / filename)

    monkeypatch.setattr(releases.huggingface_hub, "hf_hub_download", staged_download)

    with np.load(release_root / "artifacts/cluster.npz") as saved:
        row = saved["molecule_id"].tolist().index("1066")
        expected_prob = saved["prob"][row]
        expected_split = str(saved["split"][row])
    geosmin = lookup("Geosmin").matches[0]
    np.testing.assert_allclose(geosmin.prob, expected_prob, atol=1e-7)
    assert geosmin.split == expected_split

    with np.load(release_root / "artifacts/keller_oof.npz") as saved:
        cid = str(saved["cid"][0])
        expected_open = saved["prob"][0]
        expected_fold = int(saved["fold"][0])
    keller = next(row for row in fixture_rows(ROOT) if row.molecule_id == cid)
    match = next(m for m in lookup(keller.cas, "open").matches if m.molecule_id == cid)
    np.testing.assert_allclose(match.prob, expected_open, atol=1e-12)
    assert match.measured == keller.measured
    assert match.split == f"cross_validated:{expected_fold}"

    assert len(load_model("lf").members) == 1
    assert len(load_model("open").members) == 1


def test_upload_creates_private_repositories_and_writes_the_golden(
    release_root: Path,
    publish_hf: ModuleType,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    hub = FakeHub()
    monkeypatch.setattr(huggingface_hub, "HfApi", lambda: hub)
    monkeypatch.setenv("HF_TOKEN", "test-token")

    code = publish_hf.main(
        ["--root", str(release_root), "--out", str(tmp_path / "staged"), "--upload"]
    )

    assert code == 0
    assert hub.private == {"intesarjawad/smellcule-lf": True, "intesarjawad/smellcule-open": True}
    assert hub.uploaded == {
        "intesarjawad/smellcule-lf": LF_FILES | {"README.md"},
        "intesarjawad/smellcule-open": OPEN_FILES | {"README.md"},
    }
    printed = capsys.readouterr().out
    assert hashlib.sha1(b"intesarjawad/smellcule-lf").hexdigest() in printed  # noqa: S324
    golden = json.loads((release_root / "tests/golden/released_predictions.json").read_text())
    ids = ["1066", "2794", "1557", "1044", *PUZZLE_IDS]
    assert list(golden["molecules"]) == ids
    with np.load(release_root / "artifacts/cluster.npz") as saved:
        order = saved["molecule_id"].tolist()
        for molecule_id in ids:
            np.testing.assert_allclose(
                golden["molecules"][molecule_id]["prob"],
                saved["prob"][order.index(molecule_id)],
                atol=1e-7,
            )


def test_upload_without_a_token_stops_before_staging(
    release_root: Path,
    publish_hf: ModuleType,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    monkeypatch.setattr(huggingface_hub, "HfApi", refuse_hub)
    monkeypatch.delenv("HF_TOKEN", raising=False)
    out = tmp_path / "staged"

    code = publish_hf.main(["--root", str(release_root), "--out", str(out), "--upload"])

    assert code == 1
    error, next_step = capsys.readouterr().err.splitlines()
    assert error == "error: HF_TOKEN is not set, so nothing can be uploaded"
    assert next_step.startswith("next: HF_TOKEN=<write token> ")
    assert not out.exists()


def test_missing_artifacts_name_the_command_that_makes_them(
    release_root: Path,
    publish_hf: ModuleType,
    tmp_path: Path,
    capsys: pytest.CaptureFixture[str],
) -> None:
    (release_root / "artifacts/cluster.npz").unlink()

    code = publish_hf.main(["--root", str(release_root), "--out", str(tmp_path / "staged")])

    assert code == 1
    error, next_step = capsys.readouterr().err.splitlines()
    assert error.startswith("error: could not stage the release from local artifacts: ")
    assert next_step == "next: make reproduce && make export, then run this again"


def test_model_cards_state_scope_licence_and_only_recorded_numbers(
    publish_hf: ModuleType, tmp_path: Path
) -> None:
    check_numbers = load_script("check_numbers")
    results = json.loads((ROOT / "eval/results.json").read_text())
    (tmp_path / "scripts").mkdir()
    shutil.copytree(ROOT / "eval", tmp_path / "eval")
    shutil.copy(ROOT / "scripts/number_allowlist.txt", tmp_path / "scripts")
    for name, licence in (("lf", "cc-by-nc-4.0"), ("open", "cc-by-4.0")):
        card = publish_hf.model_card(name, results, "https://example.com/smellcule")
        assert f"license: {licence}" in card
        assert publish_hf.SCOPE in card
        assert "Cross-source" in card
        assert "Chemprop" in card
        assert card.endswith("Questions and issues: https://example.com/smellcule\n")
        (tmp_path / "README.md").write_text(card)
        assert check_numbers.check(tmp_path) == []

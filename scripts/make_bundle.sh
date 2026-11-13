#!/bin/sh
set -eu
export SMELLCULE_CACHE="${SMELLCULE_CACHE:-$PWD/.cache/smellcule}"
uv run smellcule export --out dist/bundle "$@"
uv run python - <<'PY'
import gzip
import hashlib
import io
import json
import tarfile
from pathlib import Path

bundle = Path("dist/bundle")
version = json.loads((bundle / "atlas.json").read_text())["version"]
archive = Path("dist") / f"atlas-data-{version}.tar.gz"
with (
    archive.open("wb") as destination,
    gzip.GzipFile(fileobj=destination, mode="wb", filename="", mtime=0) as compressed,
    tarfile.open(fileobj=compressed, mode="w") as tar,
):
    for path in sorted(bundle.rglob("*")):
        if path.is_file():
            content = path.read_bytes()
            info = tarfile.TarInfo(str(path.relative_to(bundle)))
            info.size = len(content)
            info.mode = 0o644
            tar.addfile(info, io.BytesIO(content))
with archive.open("rb") as source:
    print(f"SHA-256: {hashlib.file_digest(source, 'sha256').hexdigest()}  {archive}")
print(f"Size: {archive.stat().st_size} bytes")
PY

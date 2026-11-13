#!/bin/sh
set -eu
python3 - "$1" <<'PY'
import json
import os
import sys
from datetime import UTC, date, datetime
from pathlib import Path

exported = date.fromisoformat(json.loads(Path(sys.argv[1]).read_text())["exportedOn"])
instant = os.environ.get("SMELLCULE_NOW")
now = datetime.fromisoformat(instant.replace("Z", "+00:00")) if instant else datetime.now(UTC)
if now.tzinfo is None:
    sys.exit("error: SMELLCULE_NOW must include a UTC offset\nnext: set SMELLCULE_NOW to an ISO 8601 instant")
if (now.astimezone(UTC).date() - exported).days > 6:
    sys.exit(f"error: bundle exported on {exported}, more than 6 days ago\nnext: make export, then a patch release")
PY

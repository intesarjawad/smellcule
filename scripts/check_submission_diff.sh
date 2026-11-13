#!/usr/bin/env bash
set -euo pipefail

if [[ $# != 2 ]]; then
    echo 'usage: scripts/check_submission_diff.sh <base> <head>' >&2
    exit 1
fi

changed=$(mktemp)
trap 'rm -f "$changed"' EXIT
git diff --no-renames --name-only -z "$1...$2" > "$changed"
files=()
while IFS= read -r -d '' path; do
    files+=("$path")
done < "$changed"

if [[ ${#files[@]} != 2 ]] ||
    [[ ! ${files[0]} =~ ^submissions/([a-z0-9-]{1,40})/meta\.toml$ ]]; then
    echo 'Change only predictions.csv and meta.toml in one submissions/<slug>/ folder.' >&2
    exit 1
fi
slug=${BASH_REMATCH[1]}
if [[ ${files[1]} != "submissions/$slug/predictions.csv" ]]; then
    echo 'Both submission files must belong to the same slug.' >&2
    exit 1
fi
for path in "${files[@]}"; do
    entry=$(git ls-tree "$2" -- "$path")
    if [[ ! $entry =~ ^100(644|755)[[:space:]]blob[[:space:]] ]]; then
        echo 'Submission paths must be regular files present in the head commit.' >&2
        exit 1
    fi
done
printf '%s\n' "$slug"

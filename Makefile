SMELLCULE_CATALOGUE ?= $(shell cat config/catalogue)
export SMELLCULE_CATALOGUE
export UV_CACHE_DIR ?= $(CURDIR)/.cache/uv
export npm_config_cache ?= $(CURDIR)/.cache/npm
export PRE_COMMIT_HOME ?= $(CURDIR)/.cache/pre-commit
export PLAYWRIGHT_BROWSERS_PATH ?= $(CURDIR)/.cache/ms-playwright

.PHONY: setup check gate gate-site goldens secrets reproduce submissions chemprop export map
setup:
	uv sync --all-groups --all-extras --locked
	npm --prefix site ci
	cd site && npx playwright install chromium firefox webkit
	@if hooks_path="$$(git config --get core.hooksPath)"; then \
		printf 'Skipping hook installation: core.hooksPath is externally managed (%s).\n' "$$hooks_path"; \
	else \
		uv run pre-commit install; \
	fi

check:
	uv run ruff format --check
	uv run ruff check
	uv run pyright
	uv run pytest -m "not data"
	npm --prefix site run check
	npm --prefix site test

gate:
	uv run pytest -m data

gate-site:
	@test -f site/public/data/atlas.json || { \
		echo "site/public/data/atlas.json not found: unpack the atlas bundle into site/public/data first" >&2; \
		exit 1; }
	cd site && SMELLCULE_GATE_DATA=public/data npx vitest run --dir tests/gate
	cd site && SMELLCULE_E2E_DATA=real npx playwright test --project=chromium --grep @gate
	cd site && SMELLCULE_E2E_DATA=real npx playwright test --project=mobile --grep @gate
	cd site && SMELLCULE_BUDGET_DATA=public/data node scripts/budget.mjs

# Goldens are rendered in the image and CPU architecture CI uses, never on the Mac itself. The
# named volume keeps the container's Linux node_modules apart from the Mac's.
goldens:
	@docker info >/dev/null 2>&1 || orb start || { \
		echo "error: Docker engine not running" >&2; \
		echo "next: open -a OrbStack" >&2; \
		exit 1; }
	docker run --rm --platform linux/amd64 -e SMELLCULE_GOLDENS=update \
		-v "$(CURDIR):/w" -v smellcule-node-modules:/w/site/node_modules -w /w/site \
		mcr.microsoft.com/playwright:v1.64.1-noble \
		sh -c "npm ci && npx playwright test --project=chromium --grep @golden --update-snapshots"

secrets:
	gitleaks git --redact --no-banner

reproduce:
	uv run smellcule reproduce --results eval/results.json --report docs/evaluation.md

chemprop:
	uv run python scripts/chemprop_baseline.py

export:
	sh scripts/make_bundle.sh

submissions:
	@set -e; for submission in submissions/*; do \
		[ -d "$$submission" ] || continue; \
		uv run smellcule evaluate --predictions "$$submission/predictions.csv" \
			--meta "$$submission/meta.toml" --results eval/results.json; \
	done

map:
	SMELLCULE_CACHE="$(CURDIR)/.cache/smellcule" uv run smellcule evaluate --run map --bundle dist/bundle --results eval/results.json --report docs/evaluation.md

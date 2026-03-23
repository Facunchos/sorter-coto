#!/usr/bin/env bash
set -euo pipefail

# Warn when src changes are made without likely ai-context updates.
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

if ! command -v git >/dev/null 2>&1; then
  echo "git not found"
  exit 1
fi

filter_paths() {
  if command -v rg >/dev/null 2>&1; then
    rg '^src/|^content\.js|^popup/' || true
  else
    grep -E '^src/|^content\.js|^popup/' || true
  fi
}

contains_literal() {
  local needle="$1"
  if command -v rg >/dev/null 2>&1; then
    rg -Fq "$needle"
  else
    grep -Fq "$needle"
  fi
}

changed_src="$(git diff --name-only -- '*.js' '*.css' '*.json' | filter_paths)"
if [[ -z "$changed_src" ]]; then
  echo "No relevant source changes detected."
  exit 0
fi

declare -A map
map[content.js]='docs/ai-context/features/f01-bootstrap-observer.md docs/ai-context/features/f07-ui-panel-actions.md'
map[src/badges.js]='docs/ai-context/features/f02-badges-price-extraction.md docs/ai-context/features/f08-utils-and-normalization.md'
map[src/sorter.js]='docs/ai-context/features/f03-sorting-and-order-state.md'
map[src/api.js]='docs/ai-context/features/f04-api-capture-and-scraping.md'
map[src/revista.js]='docs/ai-context/features/f05-revista-generation.md'
map[src/vistaLigera.js]='docs/ai-context/features/f06-vista-ligera-rendering.md'
map[src/ui.js]='docs/ai-context/features/f07-ui-panel-actions.md'
map[src/utils.js]='docs/ai-context/features/f08-utils-and-normalization.md'
map[popup/popup.js]='docs/ai-context/index.md'

changed_docs="$(git diff --name-only -- 'docs/ai-context/**' '.github/copilot-instructions.md' || true)"

echo "Changed source files:"
echo "$changed_src"
echo

missing=0
for f in $changed_src; do
  expected="${map[$f]:-}"
  if [[ -z "$expected" ]]; then
    continue
  fi

  hit=0
  for doc in $expected; do
    if echo "$changed_docs" | contains_literal "$doc"; then
      hit=1
      break
    fi
  done

  if [[ "$hit" -eq 0 ]]; then
    echo "[WARN] $f changed but no mapped ai-context doc changed. Expected one of: $expected"
    missing=1
  fi
done

if [[ "$missing" -eq 0 ]]; then
  echo "AI-context coverage check: OK"
else
  echo "AI-context coverage check: WARN"
fi

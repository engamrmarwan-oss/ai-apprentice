#!/usr/bin/env bash
# The gate: typecheck, lint, test, build. Run before every commit; CI runs the same script.
set -euo pipefail
cd "$(dirname "$0")/.."

step() {
  printf '\n== gate: %s ==\n' "$1"
}

step typecheck
npm run --silent typecheck

step lint
npm run --silent lint

step test
npm run --silent test

step build
npm run --silent build

printf '\ngate: green\n'

#!/usr/bin/env bash
# Run the CI jobs of .github/workflows/ci.yml locally, one OK/FAIL line per job.
# Usage: scripts/ci-local.sh [job ...]   (no args = all jobs)
# Jobs: gitleaks osv ruff mypy backend-tests frontend-build frontend-tests
# Needs: uvx, gitleaks, osv-scanner, .venv with backend deps, frontend/node_modules,
# and the local listfm-db container running (backend-tests).
# Keep commands in sync with ci.yml when a job changes there.
set -uo pipefail

ROOT=$(git rev-parse --show-toplevel)
cd "$ROOT"
LOGS=$(mktemp -d)
VENV="$ROOT/.venv/bin"
failed=0

gitleaks_job()  { gitleaks detect --redact --no-banner --source .; }
osv_job()       { osv-scanner scan source -r . --format json --output "$LOGS/osv.json" >/dev/null 2>&1
                  python3 scripts/osv_gate.py "$LOGS/osv.json"; }
ruff_job()      { uvx ruff@0.16.8 check backend; }
# CI installs mypy alone (no project deps); mirror that, or results differ.
mypy_job()      { uvx --python 3.12 mypy@2.3.1 backend --ignore-missing-imports; }
backend_job()   { "$VENV/python" -m pytest backend/tests/ -q --cov=backend --cov-report=xml:coverage.xml &&
                  "$VENV/diff-cover" coverage.xml --compare-branch=origin/dev --fail-under=80; }
# shortcut: reuses existing node_modules instead of `npm ci`; run `npm ci` after lockfile changes.
fbuild_job()    { (cd frontend && npm run check:fast && npm run build); }
ftests_job()    { (cd frontend && npx vitest run --coverage --coverage.reporter=cobertura --coverage.reporter=text &&
                  "$VENV/diff-cover" coverage/cobertura-coverage.xml --compare-branch=origin/dev --fail-under=80); }

run() {
  local name=$1 fn=$2 start=$SECONDS
  if "$fn" >"$LOGS/$name.log" 2>&1; then
    printf 'OK    %-15s %3ss\n' "$name" $((SECONDS - start))
  else
    printf 'FAIL  %-15s %3ss  log: %s\n' "$name" $((SECONDS - start)) "$LOGS/$name.log"
    tail -n 15 "$LOGS/$name.log" | sed 's/^/      /'
    failed=1
  fi
}

declare -A JOBS=(
  [gitleaks]=gitleaks_job [osv]=osv_job [ruff]=ruff_job [mypy]=mypy_job
  [backend-tests]=backend_job [frontend-build]=fbuild_job [frontend-tests]=ftests_job
)
ORDER=(gitleaks osv ruff mypy frontend-build frontend-tests backend-tests)

git fetch -q origin dev || echo "warn: git fetch failed, diff-cover compares against a stale origin/dev"
for job in "${@:-${ORDER[@]}}"; do
  [[ -n ${JOBS[$job]:-} ]] || { echo "unknown job: $job (jobs: ${ORDER[*]})"; exit 2; }
  run "$job" "${JOBS[$job]}"
done
exit $failed

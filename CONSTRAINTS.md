# Constraints — ListFM

Last reviewed: 2026-11-03 (solo + agents).
Read before writing code. Never weaken this file to get a change through.
Mode: **Block** — any failure of the baseline or of an enforced dimension blocks the task.
Non-negotiable rule: the agent never merges on its own. It opens the PR, gets CI green and waits for the owner.
Only exception: a "go merge #N" from the owner naming the PR. The agent then squash-merges, checks that the remote branch is deleted and deletes the local branch.

## Baseline (always enforced, no setup)

- No new check suppression: `eslint-disable`, `@ts-ignore`, `# noqa`
  (the 9 `# noqa: BLE001` in `backend/services/lastfm.py` are grandfathered,
  justified and purged by RUF100 — any new `noqa` needs a justifying comment
  and a review), `# type: ignore`, `istanbul ignore`,
  `Stryker disable`, `nosemgrep`, `gitleaks:allow`.
- No unimplemented stub: `NotImplementedError`, `throw new Error("Not implemented")`,
  empty `except: pass` / `catch {}` (logging is enough to justify a handler for ruff; silence is not).
- No skipped or deleted test without a reason in the commit message
  (`pytest.mark.skip`, `describe.skip`, `it.skip`, a deleted test file).
- No secret in source (see the gitleaks gate; `--redact` is mandatory: never the value, only the rule and the location).
- This file only changes in a dedicated PR or in a PR paragraph explicitly reviewed;
  loosening = loud, tightening = silent.

## Enforced (blocking, checked 2026-09-27)

| Dimension | Rule + reason | Checked by | Runs at |
|-----------|---------------|-----------|---------|
| Backend lint | 0 ruff errors. `ruff.toml`, `B008` ignored = the FastAPI `Depends()` idiom. Reason: CI gate already blocking (38 findings triaged to 0). | `ruff check backend` (pinned in `requirements.txt` and CI) | every edit (touched files), CI job `ruff` |
| Frontend lint | 0 errors, 0 warnings. Reason: free, `eslint . --max-warnings 0` is green today. | `npx eslint . --max-warnings 0` (in `frontend/`, alias `npm run check:fast`) | every edit, CI job `frontend-build` (Lint step) |
| Frontend design | 0 Impeccable anti-patterns. Reason: the pixel art direction is the site's identity; a drift toward generic styling must break the build. Text scan only (no rendered page): contrast and sizes are left to `impeccable audit`. | `npm run check:design` (in `frontend/`, exact `impeccable` pin) | task end, CI job `frontend-build` (Design anti-patterns step) |
| Backend types | 0 mypy errors. Reason: the backlog was purged (10 errors → 0 on 2026-09-27); a strict gate keeps new code from leaning on wrong types. | `mypy backend --ignore-missing-imports` (pinned) | every edit, task end, CI job `mypy` |
| Frontend build | Green. Reason: syntax and bundling net; no `tsc`, the project is JS without a `tsconfig` (see Measured). | `npm run build` (in `frontend/`) | task end, CI job `frontend-build` (Build step) |
| Backend tests | Suite green. Reason: proof of non-regression on JWT/cookie auth and Last.fm. | `python -m pytest backend/tests/ -q` (DB `listfm-db:5433` locally, a Postgres service in CI) | task end (90 s budget), CI job `backend-tests` |
| Frontend tests | Suite green (vitest). Reason: the same net on the UI side. | `npx vitest run` (in `frontend/`, after `npm ci`) | task end, CI job `frontend-tests` |
| Backend diff coverage | ≥ 80% of changed lines. Reason: forces a test on new code without demanding 80% of legacy code. | `pytest --cov=backend --cov-report=xml` + `diff-cover coverage.xml --compare-branch=origin/main --fail-under=80` | task end (scope = diff), CI job `backend-tests` |
| Frontend diff coverage | ≥ 80% of changed lines. Reason: same, on the UI side where global coverage is low. | `vitest run --coverage --coverage.reporter=cobertura` + `diff-cover coverage/cobertura-coverage.xml --compare-branch=origin/main --fail-under=80` (in `frontend/`) | task end (scope = diff), CI job `frontend-tests` |
| Secrets | 0 leaks. Reason: JWT and Last.fm tokens; external, the agent can't negotiate with it. | `gitleaks detect --redact --no-banner --source .` | every edit, CI job `gitleaks` |
| Dependencies | **0 Critical, 0 High** (reached 2026-09-27). Medium/Low tolerated. The CI job gates on `max_severity >= 7.0` (osv exits 1 on any finding, even Low). | `osv-scanner scan source -r . --format json` + a Python gate on `max_severity` (see the `osv-scanner` job in `ci.yml`) | task end, CI job `osv-scanner` |

## Measured, not enforced yet (ratchets + targets)

| Metric | Today | Direction |
|--------|-------|-----------|
| Backend project coverage | **93%** (measured 2026-09-27) | don't regress (0.5% tolerance) |
| Frontend project coverage | **1.58%** (measured 2026-09-27) | don't regress; the ≥ 80% diff target raises it PR by PR |
| Frontend types (`tsc`) | N/A — JS project, no `tsconfig`; current net = `vite build` | enable `tsc --noEmit` only with a TS migration |
| JS bundle | `dist/assets/index-*.js` **785 kB** (243 kB gzip, Vite warning > 500 kB) | don't grow; code splitting to study |
| Code security (semgrep) | not installed | considered later (`p/default` + `p/owasp-top-ten` on the diff's files) |
| Page a11y / perf | no preview URL | out of scope while there is no URL to test; don't invent a check |

## Budgets and placement (cost decides where a check runs)

| Phase | Command | Budget |
|-------|---------|--------|
| BUILD (after each edit) | ruff / eslint on touched files + baseline (diff) | < 5 s |
| VERIFY (task end) | related tests, `mypy`, `npm run build`, diff-cover on the diff, `osv-scanner`, `gitleaks` | < 90 s, scope = diff |
| REVIEW (PR) | everything + the guards below, against the merge base | minutes |
| SHIP (CI) | `backend-tests`, `ruff`, `mypy`, `gitleaks`, `osv-scanner`, `frontend-build`, `frontend-tests` | unlimited |

Always scope to the diff: coverage of touched lines, semgrep on touched files.
`npm run check:fast` (in `frontend/`) = what runs after an edit; `scripts/ci-local.sh` = every CI job locally, to run before each push (`scripts/ci-local.sh ruff mypy` for a subset).
`CONSTRAINTS.md` is the canonical source; the scripts are shortcuts that must mirror it.

## Threshold guards (diff review, `git diff` is enough)

1. A threshold moved (lower budget, lower severity, a check moved out of the fast stage).
2. A test got easier (`.skip`, deleted file, removed assertions).
3. A checker was silenced (new `eslint-disable`, `noqa`, `istanbul ignore`, `nosemgrep`, `gitleaks:allow`, `impeccable-disable`).
4. Unfinished work (stub, empty `catch`, a `TODO` in place of the implementation).
5. An exception appeared in the table below without discussion.

At least one constraint is external (gitleaks, osv-scanner: external databases, not the agent's judgment of itself).

## Exceptions

| ID | Rule | Path | Reason | Owner | Expires |
|----|------|------|--------|-------|---------|

Maximum exception length: 90 days, with a named owner.

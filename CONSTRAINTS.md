# Constraints — ListFM

Last reviewed: 2026-09-27 (solo + agents, voir `PLAN-git-github-conventions.md`).
Lire avant d'écrire du code. Ne jamais affaiblir ce fichier pour faire passer un changement.
Mode : **Block** — tout échec du socle ou d'une dimension enforced bloque la tâche.
Règle non négociable rappelée : l'agent n'a JAMAIS le droit de merger, il ouvre la PR et attend l'owner.

## Socle (toujours enforced, sans setup)

- Pas de nouvelle suppression de check : `eslint-disable`, `@ts-ignore`, `# noqa`
  (les 9 `# noqa: BLE001` de `backend/services/lastfm.py` sont grandfathered,
  justifiés et purgés par RUF100 — tout nouveau `noqa` exige un commentaire
  de justification + revue), `# type: ignore`, `istanbul ignore`,
  `Stryker disable`, `nosemgrep`, `gitleaks:allow`.
- Pas de stub non implémenté : `NotImplementedError`, `throw new Error("Not implemented")`,
  `except: pass` / `catch {}` vide (logger suffit à justifier un handler côté ruff, le silence non).
- Pas de test skippé ou supprimé sans motif dans le message de commit
  (`pytest.mark.skip`, `describe.skip`, `it.skip`, fichier de test supprimé).
- Pas de secret en source (voir gate gitleaks, `--redact` obligatoire : jamais la valeur, seulement règle + emplacement).
- Ce fichier ne se modifie que dans une PR dédiée ou un paragraphe de PR explicitement relu ;
  assouplir = fort, durcir = silencieux.

## Enforced (bloquant, vérifié le 2026-09-27)

| Dimension | Règle + raison | Checked by | Runs at |
|-----------|----------------|-----------|---------|
| Lint backend | 0 erreur ruff. `ruff.toml` pin `0.16.8`, `B008` ignoré = idiome FastAPI `Depends()`. Raison : gate CI déjà bloquant (Phase 3 close, 38 findings triés → 0). | `ruff check backend` (pin `ruff==0.16.8`, local : `uvx ruff@0.16.8 check backend`) | every edit (fichiers touchés), CI job `ruff` |
| Lint frontend | 0 erreur, 0 warning. Raison : coût nul, `eslint . --max-warnings 0` vert aujourd'hui. | `npx eslint . --max-warnings 0` (dans `frontend/`, alias `npm run check:fast`) | every edit, CI job `frontend-build` (step Lint) |
| Types backend | 0 erreur mypy. Raison : volume purgé (10 erreurs → 0 le 2026-09-27), un gate strict immédiat empêche le nouveau code de s'appuyer sur des types faux. | `mypy backend --ignore-missing-imports` (pin `mypy==2.3.1`) | every edit, task end, CI job `mypy` |
| Build frontend | Vert. Raison : filet syntax/bundling ; pas de `tsc` car projet JS sans `tsconfig` (voir Mesuré). | `npm run build` (dans `frontend/`) | task end, CI job `frontend-build` (step Build) |
| Tests backend | Suite verte (159 tests). Raison : preuve de non-régression sur auth JWT/cookies + Last.fm. | `python -m pytest backend/tests/ -q` (DB `listfm-db:5433` en local, service Postgres en CI) | task end (~45 s, budget 90 s), CI job `backend-tests` |
| Tests frontend | Suite verte (7 tests, vitest). Raison : même filet côté UI, inexistant en CI jusqu'au 2026-09-27. | `npx vitest run` (dans `frontend/`, après `npm ci`) | task end, CI job `frontend-tests` |
| Coverage diff backend | ≥ 80 % des lignes modifiées. Raison : force un test sur le nouveau code sans exiger 80 % sur un héritage. Vérifié : 100 % sur le diff du PR de verrouillage. | `pytest --cov=backend --cov-report=xml` + `diff-cover coverage.xml --compare-branch=origin/dev --fail-under=80` | task end (scope = diff), CI job `backend-tests` |
| Coverage diff frontend | ≥ 80 % des lignes modifiées. Raison : idem, côté UI où la couverture globale est quasi nulle. | `vitest run --coverage --coverage.reporter=cobertura` + `diff-cover coverage/cobertura-coverage.xml --compare-branch=origin/dev --fail-under=80` (dans `frontend/`) | task end (scope = diff), CI job `frontend-tests` |
| Secrets | 0 leak. Raison : JWT + tokens Last.fm ; externe, l'agent ne peut pas négocier avec. Vérifié : 229 commits, 0 leak. | `gitleaks detect --redact --no-banner --source .` | every edit, CI job `gitleaks` |
| Dépendances | **0 Critical, 0 High** (atteint le 2026-09-27 : bumps `click`, `pygments`, overrides `hono`/`qs`/`fast-uri`/`js-yaml` + transitifs npm). Raison : cible ambitieuse tenue, plus de build rouge permanent. Medium résiduels = vitest dev uniquement, voir W1. Le job CI gate sur `max_severity >= 7.0` (osv exit 1 dès le moindre finding, même Low). | `osv-scanner scan source -r . --format json` + gate Python sur `max_severity` (voir job `osv-scanner` de `ci.yml`) | task end, CI job `osv-scanner` |

## Mesuré, pas encore enforced (ratchets + cibles)

| Métrique | Aujourd'hui | Direction |
|----------|-------------|-----------|
| Coverage projet backend | **93 %** (mesuré 2026-09-27, 159 tests) | ne pas régresser (tolérance 0,5 %) |
| Coverage projet frontend | **1,58 %** (mesuré 2026-09-27, 7 tests) | ne pas régresser ; la cible diff ≥ 80 % fait monter ce chiffre PR par PR |
| Types frontend (`tsc`) | N/A — projet JS, pas de `tsconfig` ; filet actuel = `vite build` | activer `tsc --noEmit` uniquement si migration TS |
| Bundle JS | `dist/assets/index-*.js` **785 kB** (gzip 243 kB, warning Vite > 500 kB) | ne pas grossir ; code-splitting à étudier |
| Sécu code (semgrep) | non installé | envisagé plus tard (`p/default` + `p/owasp-top-ten` sur fichiers du diff) |
| a11y / perf page | pas d'URL preview (single-VPS, pas de déploiement preview) | hors scope tant qu'il n'y a pas d'URL à tester ; ne pas inventer de check |

## Budgets et placement (coût décide de l'emplacement)

| Phase | Commande | Budget |
|-------|----------|--------|
| BUILD (après chaque edit) | ruff / eslint sur fichiers touchés + socle (diff) | < 5 s |
| VERIFY (fin de tâche) | tests liés, `mypy`, `npm run build`, diff-cover sur le diff, `osv-scanner`, `gitleaks` | < 90 s, scope = diff |
| REVIEW (PR) | tout + gardes ci-dessous, comparé au merge-base | minutes |
| SHIP (CI) | `backend-tests`, `ruff`, `mypy`, `gitleaks`, `osv-scanner`, `frontend-build`, `frontend-tests` | illimité |

Toujours scoper au diff : coverage des lignes touchées, semgrep sur fichiers touchés.
`check:fast` = ce qui tourne après un edit, `check:task` = fin de tâche, `check:full` = CI.
`CONSTRAINTS.md` est la source canonique ; les scripts sont des raccourcis qui doivent la refléter.

## Gardes du seuil (revue du diff, `git diff` suffit)

1. Le seuil a bougé (budget baissé, sévérité descendue, check sorti du fast stage).
2. Un test est devenu plus facile (`.skip`, fichier supprimé, assertions retirées).
3. Un checker est réduit au silence (nouveau `eslint-disable`, `noqa`, `istanbul ignore`, `nosemgrep`, `gitleaks:allow`).
4. Travail inachevé (stub, `catch` vide, `TODO` à la place de l'implémentation).
5. Une exception est apparue au tableau ci-dessous sans discussion.

Au moins une contrainte est externe (gitleaks, osv-scanner : bases externes, pas le jugement de l'agent sur lui-même).

## Exceptions

| ID | Règle | Path | Raison | Owner | Expires |
|----|-------|------|--------|-------|---------|
| W1 | `vitest`+`@vitest/mocker` 3.2.7 gardés (2 Medium `GHSA-82fw-gwwq-j7x9`, dev-only, fix = majeur 4.x) | `frontend/package.json` | Majeur vitest 4 à évaluer à part ; ne retient pas la baseline 0 High. | owner | 2026-12-26 |

Durée max d'exception : 90 jours, avec owner nommé.

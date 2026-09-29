# Plan de correction — conventions Git & GitHub

> Établi le 2026-09-24 par entretien (audit complet du repo). Objectif : repo conforme
> aux conventions git/GitHub sans frictionner le flux solo + agents (PR → `dev`).
> Décisions : modèle C en 2 temps (voir Phases), protection règles A, ruff bloquant,
> release-please au v0.1.0, templates/CONTRIBUTING différés.
>
> **RÈGLE NON NÉGOCIABLE (2026-09-24)** : l'agent n'a JAMAIS le droit de merger.
> Il ouvre la PR, fait passer la CI, puis **attend la validation de l'owner**.
> Même pour une PR "évidente". (Violation constatée : PR #32 mergée sans accord.)
>
> **Exception (2026-09-27)** : sur autorisation explicite de l'owner citant la PR
> (« go merge #N »), l'agent peut squash-merger lui-même, puis doit vérifier la
> suppression distante (auto-delete) et supprimer la branche locale. Sans autorisation
> explicite citant la PR, l'interdiction reste totale.

## Phase 0 — Vérification des commits

- [x] Re-lancer l'audit Conventional Commits sur tout l'historique
      (`git log --pretty=%s | grep -vE '^(feat|fix|docs|test|refactor|chore|perf|style|build|ci)(\(.+\))?: '`)
      — comparer avec l'état de départ (2/224 hors-standard).
      → **Résultat : `origin/dev` = 2 violations (les merge #9/#11, hors scope). OK.**
      Les 9 violations vues en local venaient de la branche stale `test-p30-31`
      (état d'avant-renommage, upstream gone) → supprimée en Phase 2.
- [x] Détecter les réécritures d'historique : SHA changés, branches divergentes
      local/remote, force-push éventuel de l'agent de correction.
      → **OK : reflog clean, aucun force-push sur `origin/dev`. PR #30/#31 renommées
      proprement puis squash-merge. `origin/main` : 0 commit unique, FF garanti.**
- [x] Corriger ce qui reste hors-standard (ex : commit `fixup:`) **sans réécrire
      l'historique merge** — les squash-merges futurs nettoient naturellement.
      → **Rien à corriger dans l'historique partagé.**

## Phase 1 — README (avant tout le reste) ✅ TERMINÉE (PR #32 → merge `1086687`)

- [x] Entretien `interview-me` dédié au README (audience, sections, ton, ce qui garde).
      → Décisions : vitrine+manuel (C) · banner seul (C) · pitch A+B en anglais ·
      structure storytelling (How it works) · ancien README en checklist (B) ·
      install = quickstart local avec emplacement CTA live réservé (A).
- [x] Rédaction : `human-writer` pour la prose + gate `slopless` jusqu'à exit 0.
      → exit 0 (loop 1), revérifié exit 0 après 2 correctifs factuels
      (`docker run` pour clone frais, note API repositionnée).
      Findings : `.slopless/findings/2026-09-24-*--*.json`.
- [x] Ligne de statut en haut : en développement, code de `main` non déployable
      (à retirer au v0.1.0 — voir checklist Phase 4).
- [x] Description GitHub : "Turn your Last.fm listening history into playlists. FastAPI + React."
- [x] Topics GitHub : `lastfm`, `playlists`, `automation`, `fastapi`, `react`, `postgresql`
- [x] Commit `docs(readme): ...` → PR → `dev` → PR #32, CI verte, squash-merge.

## Phase 2 — Protections et branches

- [x] Protection `dev` (règles A) : Require pull request (0 approval) + status checks
      `backend-tests` et `frontend-build` + bloquer push direct et force-push.
      → Appliquée et vérifiée via API le 2026-09-24 : enforce_admins=true (les règles
      s'appliquent aussi à toi — un bypass urgent passe par la désactivation temporaire
      de la protection dans les settings).
- [ ] Nettoyage branches (option A) :
  - [x] Se checker sur `dev` d'abord (branche courante trackée sur une mauvaise upstream).
  - [x] Vérifier `git worktree list` (dossier `.worktrees`).
        → 1 worktree actif : `~/.local/share/opencode/worktree/.../disco-toucan` = branche
        `wip`, seul `?? tasks/` non tracké à traiter avant suppression.
  - [x] Audit des commits uniques de `wip` / `test-p27` / `test-p28` / `test-p30` /
        `test-p30-31` / `verif-p0` / `disco-toucan` — présenté avant suppression.
        → Résultat : tout le contenu est déjà dans `dev` (versions pré-squash des PR
        #27/#28/#30/#31) ; `wip`/`verif-p0`/`disco-toucan` = 0 commit unique.
  - [x] Suppression locale + `git fetch --prune`. → **Fait le 2026-09-24** : les 7
        branches supprimées. `tasks/plan.md` + `tasks/todo.md` préservés en double
        copie HORS repo : `/tmp/opencode/tasks-disco-toucan/` et
        `~/.local/share/opencode/tasks-disco-toucan/` — jamais commités.
  - [x] Réglage GitHub : auto-delete des branches après merge.
- [x] Fast-forward `main` ← `dev` (vérifier d'abord qu'`origin/main` a 0 commit unique).
      → Vérifié 0 unique, poussé `51b0759..1086687`, `main` == `dev` (0/0).

## Phase 3 — Ruff bloquant

- [x] Config ruff : ignore `B008` (idiome FastAPI `Depends()`), ajout aux deps.
      → `ruff.toml` à la racine + `ruff==0.16.8` dans `backend/requirements.txt`
      (pas de `select` : le pin verrouille le jeu de règles, pas de dérive CI).
- [x] Commit isolé `chore(backend): apply ruff autofixes` (157 fixes, 0 changement
      de comportement) → PR.
      → Réel : **282 fixes** sur 62 fichiers (l'audit initial avait sous-compté),
      2 commits séparés (config / fixes), **157 tests verts**,
      **PR #34 mergeée le 2026-09-25** (validation owner explicite).
      38 findings restants = le triage manuel de l'étape suivante.
- [x] Suivi revue Codacy sur #34 : anyio 4.13.0 → 4.14.2 (CVE-2026-63374,
      CVE-2026-64847) + commentaires ruff.toml en anglais + imports fusionnés
      (dans #34, CI verte) ; colonnes tokens en clair d'`auth_providers`
      supprimées par migration `a9c4e2f1b7d3` → **PR #35 mergeée le
      2026-09-25** (conflit `auth_provider.py` résolu, aller-retour
      upgrade/downgrade vérifié, 157 tests verts).
- [x] PR #33 (retrait `./dev.sh` du README) — mergeée le 2026-09-25.
- [x] Tri manuel des 38 restants → **PR #36 mergeée le 2026-09-25 (`dd37faa`,
      squash, CI verte, ruff job inclus)** :
      10 commit-handlers `except Exception` → `SQLAlchemyError`, 9 catch-alls
      upstream gardés avec `# noqa: BLE001` justifié, 7 swallow silencieux de
      `lastfm.py` loggés en debug (le log satisfait aussi BLE001/S110/S112 —
      ruff exempte les handlers qui loggent, RUF100 a purgé les noqas devenus
      inutiles), nits `__all__`/`with` triés. 38 → **0**, 157 tests verts.
- [x] Étape ruff bloquante dans le CI → **job `ruff` séparé** dans `ci.yml`
      (`ruff check backend`, pin 0.16.8) plutôt qu'une step dans
      `backend-tests` : un check nommé distinct est nécessaire pour l'étape
      suivante. Livré dans PR #36 (gate = findings à 0 dans la même PR).
- [x] Ajouter le check `ruff` aux status checks obligatoires de `dev` → fait le
      2026-09-25 via l'API (le nom de check existait depuis PR #36) :
      `["backend-tests", "frontend-build", "ruff"]`, require PR (0 approval),
      `enforce_admins`, pas de force-push.
- [x] Revue Codacy sur #36 : fix accepté (`get_lastfm_provider` absent des
      imports de `repositories/__init__.py` — défaut préexistant, pas une
      régression, invisible de ruff car `F822` ignore les `__all__` des
      `__init__.py`) ; remarque « noqas manquantes dans `lastfm.py` » refusée
      avec preuve (ruff 0.16.8 exempte les handlers qui loggent, `--select
      BLE001` = 0 et gate vert sur le HEAD de la PR).

**Phase 3 close le 2026-09-25** : `dev` = `dd37faa`, gate ruff bloquant actif
(3 checks requis : `backend-tests`, `frontend-build`, `ruff`), CI post-merge
succès, remote de la PR supprimée automatiquement.

## Phase 4 — Différé

- [x] Templates PR / issue + `CONTRIBUTING.md` : `interview-me` → `human-writer` → `slopless`.
      → **PR #37 mergeée le 2026-09-25 → `9a80378`** (squash, CI verte, Codacy
      `pass`). Interview : audience = toi + agents, périmètre PR + bug + feature,
      CONTRIBUTING **autonome** (workflow + conventions de code, les AGENTS.md
      ne sont pas push), v0.1.0 reporté à plus tard. Slopless exit 0 sur les 2
      markdown (JSON dans `.slopless/findings/`). Rappel : les templates ne
      s'activent (choix "New issue", pré-remplissage PR, lien contributing)
      qu'une fois sur `main`, branche par défaut → à la checklist v0.1.0.
- [ ] Checklist `v0.1.0` (premier jalon déployable) :
  - [ ] Merge `dev` → `main`
  - [ ] Activation release-please (workflow + config, sur `main`)
  - [ ] Protection de `main`
  - [ ] Retrait de la ligne de statut du README

## Hors scope (confirmé)

- Pas de réécriture des anciens commits ni des merge #9/#11.
- Aucune action sur les PR ouvertes (elles ciblent `dev`).
- Pas de déploiement, pas de durcissement option B (1 approval + linear history),
  pas de changelog manuel.

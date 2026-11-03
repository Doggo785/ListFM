# ListFM

Machine à playlists auto depuis Last.fm : FastAPI + async SQLAlchemy + Postgres, React 19 + Vite en JSX.

Lire avant d'agir :
- `VISION.md` : le cap et les non-objectifs. Une feature hors cap se demande à l'owner.
- `ROADMAP.md` : le statut, et la seule liste de ce qu'on fait ensuite.
- `CONSTRAINTS.md` avant d'écrire du code : la barre qualité, les checks, la règle de merge.
- `CONTRIBUTING.md` : setup, workflow de branche, conventions de code.

## Travailler avec l'owner

- Parler en français à l'owner. Expliquer un point technique avec une image vulgarisée d'une phrase.
- Une PR par changement, commits Conventional Commits atomiques.
- Commits et PR en anglais : titre `type(scope): summary`, corps `Summary` / `Changes` / `Test plan` comme les PR mergées. Aucun lien de session ni ligne d'attribution.
- `scripts/ci-local.sh` passe vert avant chaque push, même pour une PR de docs.
- Merge seulement sur « go merge #N » citant la PR (détail dans `CONSTRAINTS.md`).
- Suivre seulement les jobs GitHub Actions d'une PR ; Codacy n'est pas un check requis, ne pas l'attendre.

## Pièges backend

- `services/lastfm.py` est du `pylast` synchrone : l'appeler via `asyncio.to_thread` (routers) ou `run_in_executor` (runner), jamais directement dans du code async.
- Les appels d'enrichissement passent par `_throttled_call` (cadence `LASTFM_MIN_INTERVAL`, repli sur l'erreur 29). Les tests patchent l'intervalle à 0.
- Le moteur de filtres existe en deux copies de même sémantique : `frontend/src/lib/filter-engine.js` (aperçu instantané) et `backend/services/filter_engine.py` (preview et sweep). Un opérateur ajouté va dans les deux.
- Cache enrich (`services/enrich_cache.py`) : fraîcheur par groupe de données. Un filtre ne lit jamais un champ qui n'a pas été cherché ; chaque fetch partiel réécrit son groupe en base.
- Les repositories ne commitent pas : l'appelant commit, et rattrape `SQLAlchemyError` avec un rollback.
- Soft-delete par `deleted_at` sur `User`, `Automation`, `GeneratedPlaylist` : chaque requête filtre `deleted_at IS NULL`.
- Les modèles ne déclarent aucun `relationship()` ; les jointures sont des `select().join()` explicites.
- `Automation.source` est stocké à plat (`source_type`, `source_period`, `output_max_size`) et reconstruit par un `model_validator`.
- Tokens de provider : aucune colonne en clair. Les rajouter seulement chiffrées au repos.
- `TokenResponse` a un body vide exprès (tokens en cookies httpOnly uniquement) : ce n'est pas du code mort.
- Le scheduler du sweep ne démarre qu'avec `ENABLE_SCHEDULER` ; le rate limiter vit en mémoire du process. L'app suppose un seul worker.

## Pièges frontend

- JSX sans TypeScript malgré la dépendance TS ; imports via l'alias `@/`.
- `src/lib/api.js` est l'unique client HTTP (refresh JWT auto, cache module `_username`). Pas de second client.

## Base de données locale

Postgres en Docker, conteneur `listfm-db` sur le port **5433**, bases `listfm` (dev) et `listfm_test` (tests). Après un reboot : `docker start listfm-db`. Une erreur de connexion en test vient d'abord d'un conteneur arrêté.

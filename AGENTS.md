# ListFM

Machine à playlists auto depuis Last.fm : FastAPI + async SQLAlchemy + Postgres, React 19 + Vite en JSX.

Lire avant d'agir :
- `VISION.md` : le cap et les non-objectifs. Une feature hors cap se demande à l'owner.
- `ROADMAP.md` : le statut, et la seule liste de ce qu'on fait ensuite.
- `CONSTRAINTS.md` avant d'écrire du code : la barre qualité, les checks, la règle de merge.
- `CONTRIBUTING.md` : setup, workflow de branche, conventions de code.
- `GLOSSARY.md` : le vocabulaire du domaine ; `docs/adr/` : les décisions structurantes et leur pourquoi.

## Travailler avec l'owner

- Parler en français à l'owner. Expliquer un point technique avec une image vulgarisée d'une phrase.
- Le moins de PR possible : regrouper les changements qui peuvent aller ensemble et limiter les pushs, car chaque CI et chaque merge coûtent du temps. Commits Conventional Commits atomiques dans la PR.
- Commits et PR en anglais : titre `type(scope): summary`, corps `Summary` / `Changes` / `Test plan` comme les PR mergées. Aucun lien de session ni ligne d'attribution.
- `scripts/ci-local.sh` passe vert avant chaque push, même pour une PR de docs.
- Merge seulement sur « go merge #N » citant la PR (détail dans `CONSTRAINTS.md`).
- Suivre seulement les jobs GitHub Actions d'une PR ; Codacy n'est pas un check requis, ne pas l'attendre.

## Pièges backend

- `services/lastfm.py` est du `pylast` synchrone : l'appeler via `asyncio.to_thread` (routers) ou `run_in_executor` (runner), jamais directement dans du code async.
- La console passe par `services/activity_log.py` : une ligne lisible par étape. Jamais d'URL Last.fm ni de message d'exception dedans : une erreur httpx porte l'URL, donc la clé API (#86).
- Les appels Last.fm de la synchro passent par `_throttled_call` (cadence `LASTFM_MIN_INTERVAL`, repli sur l'erreur 29). Les tests patchent l'intervalle à 0.
- Le moteur de filtres n'existe que côté serveur (`services/filter_engine.py`) : l'écran affiche la réponse de l'aperçu sans la retravailler. Une condition sans valeur et un groupe vide sont ignorés.
- `filter_groups` est validé à la lecture en base : retirer un champ ou un opérateur demande une migration qui réécrit les automations stockées.
- Le pipeline et les filtres ne font aucun appel Last.fm (ADR 0003) : ils lisent les écoutes et le catalogue de tags en base. Un champ jamais cherché reste absent de la piste et ne passe aucun filtre, pas même `not_contains`.
- Les repositories ne commitent pas : l'appelant commit, et rattrape `SQLAlchemyError` avec un rollback.
- Soft-delete par `deleted_at` sur `User`, `Automation`, `GeneratedPlaylist` : chaque requête filtre `deleted_at IS NULL`.
- Les modèles ne déclarent aucun `relationship()` ; les jointures sont des `select().join()` explicites.
- `Automation.output` est stocké à plat (`output_max_size`) et reconstruit par un `model_validator`.
- Tokens de provider : aucune colonne en clair. Les rajouter seulement chiffrées au repos.
- `TokenResponse` a un body vide exprès (tokens en cookies httpOnly uniquement) : ce n'est pas du code mort.
- Un cron se lit toujours via `schemas.cron_trigger`, jamais `CronTrigger.from_crontab` : APScheduler compte les jours depuis lundi, donc `1` tomberait un mardi.
- Le scheduler du sweep ne démarre qu'avec `ENABLE_SCHEDULER` ; le rate limiter vit en mémoire du process. L'app suppose un seul worker.

## Pièges frontend

- JSX sans TypeScript malgré la dépendance TS ; imports via l'alias `@/`.
- `src/lib/api.js` est l'unique client HTTP (refresh JWT auto). Pas de second client.
- Couleurs, typo et mouvement viennent des tokens de `src/index.css`, pas de valeur en dur dans un nouvel écran. La direction est dans `PRODUCT.md`.
- Polices pixel : Tiny5 pour les titres et chiffres, Jersey 20 pour le texte, sans `letter-spacing` ni tailles hors de l'échelle `--text-*`, sinon les lettres deviennent floues. Aucune graisse n'existe : la hiérarchie passe par la taille et la couleur.
- Le ruban de pixels (`lib/pixelRibbon.js`) se monte une seule fois dans `App` et n'a pas de raison d'être remonté. Tout bloc de contenu porte `data-quiet` (12 au plus à l'écran) : le ruban se dissout autour et ne passe jamais sous un texte. Un élément vide `data-chain="412,120,50"` le couche droit dans cette bande, avec une largeur par étage de la chaîne.
- `DESIGN.md` décrit le monde visuel, écrit depuis le Créateur. Les écrans pas encore refaits ne sont pas une référence.

## Base de données locale

Postgres en Docker, conteneur `listfm-db` sur le port **5433**, bases `listfm` (dev) et `listfm_test` (tests). Après un reboot : `docker start listfm-db`. Après une nouvelle migration, migrer aussi la base de test : `DATABASE_URL=postgresql+asyncpg://listfm:listfm@localhost:5433/listfm_test alembic upgrade head` (depuis `backend/`) ; `ci-local.sh` ne le fait pas. Une erreur de connexion en test vient d'abord d'un conteneur arrêté.

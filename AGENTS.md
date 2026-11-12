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
- Suivre les jobs GitHub Actions d'une PR et `Codacy Static Code Analysis` : l'attendre, et regarder ses alertes et ses duplications (`newIssues` et `deltaClonesCount`) avant d'annoncer une PR prête. Une alerte se corrige ou se montre à l'owner, jamais en silence.

## Pièges backend

- `services/lastfm.py` est du `pylast` synchrone : l'appeler via `asyncio.to_thread` (routers) ou `run_in_executor` (runner), jamais directement dans du code async.
- La console passe par `services/activity_log.py` : une ligne lisible par étape. Jamais d'URL Last.fm ni de message d'exception dedans : une erreur httpx porte l'URL, donc la clé API (#86).
- Les appels Last.fm de la synchro passent par `_throttled_call` (cadence `LASTFM_MIN_INTERVAL`, repli sur l'erreur 29). Les tests patchent l'intervalle à 0.
- Le moteur de filtres n'existe que côté serveur (`services/filter_engine.py`) : l'écran affiche la réponse de l'aperçu sans la retravailler. Une condition sans valeur et un groupe vide sont ignorés.
- `filter_groups` est validé à la lecture en base : retirer un champ ou un opérateur demande une migration qui réécrit les automations stockées.
- Le pipeline et les filtres ne font aucun appel Last.fm (ADR 0003) : ils lisent les écoutes et le catalogue de tags en base. Un champ jamais cherché reste absent de la piste et ne passe aucun filtre, pas même `not_contains`.
- Les repositories ne commitent pas : l'appelant commit, et rattrape `SQLAlchemyError` avec un rollback.
- Soft-delete par `deleted_at` sur `User`, `Automation`, `GeneratedPlaylist` : chaque requête filtre `deleted_at IS NULL`. La suppression d'un compte, elle, efface pour de vrai tout ce qu'il contient (`erase_user_automations`, `delete_user`) : seule reste une ligne `users` vide.
- Les modèles ne déclarent aucun `relationship()` ; les jointures sont des `select().join()` explicites.
- `Automation.output` est stocké à plat (`output_max_size`) et reconstruit par un `model_validator`.
- Tokens de provider : aucune colonne en clair. Les rajouter seulement chiffrées au repos.
- Last.fm se lie par son autorisation web : le jeton de retour ne sert qu'une fois, la clé de session n'est pas gardée. Un test lie un compte avec `link_lastfm` de `tests/conftest.py`.
- Les écoutes stockées forment toujours un seul bloc, pour qu'une synchro coupée reprenne où elle s'est arrêtée : ce qui est plus récent que la dernière écoute se lit du plus ancien au plus récent, et un premier import lit le reste du plus récent au plus ancien, depuis avant la plus ancienne. Dans ce sens-là, une page ne remplace jamais l'album d'un morceau (`store_track_albums(older=True)`).
- La synchro et la recherche de tags donnent leur avancement par `progress_store` : `since` (début de l'historique, dit avant la première page) et `reached` (jusqu'où l'import a lu en remontant le temps), et `eta_seconds()` (au rythme mesuré). Sur le Dashboard, le front d'un import part de la droite (aujourd'hui) et ne fait que reculer. `BackgroundTasks` le pose sur `ribbonStage.work`, que le ruban fait glisser entre deux lectures (`lib/backgroundWork.js`). Le front dessiné (`shown`) passe d'une lecture à l'autre et n'avance que vers l'avant ; sur le Dashboard la tête passe par `moveHead`, et ce qui sort de la flamme part de `waveCentre`, copie JS du calcul du shader : changer l'un demande de changer l'autre.
- Un run qui ne peut pas partir (premier import en cours, ou recherche de tags en cours pour un run qui filtre par tags, voir `_check_ready`) attend sur sa ligne d'historique (`waiting`), sans compter d'essai. Tout nouveau départ de l'automation reprend cette ligne. Il repart à la fin de l'import ou de la recherche de tags (`after_sync`, `after_pass`), et à chaque passage du sweep (après un redémarrage, rien d'autre ne le relancerait).
- Chaque run, manuel ou planifié, passe par `run_automation` et s'inscrit dans `_in_flight` (mémoire du process, un seul worker) avec un ticket de progression : `GET /api/scrobbles/sync` les liste avec `next_run_at`. Un run fini y reste `RUN_LINGER_SECONDS`, et le front envoie `RUNS_DONE` sur `window` quand il en voit un partir : les pages qui montrent des runs ou des playlists relisent.
- Pendant un premier import (`scrobbles_complete_at` vide), le Dashboard ne cherche aucune pochette : ses albums changent à chaque lecture. La recherche part sur les albums finaux.
- `users.timezone` vide veut dire « pas encore connu », lu comme UTC : le navigateur ne le remplit que dans ce cas, pour ne jamais écraser un choix fait dans les réglages.
- `POST /api/public/listener` (scène 7 de la page d'accueil) ne demande aucun compte et dépense le budget Last.fm des synchros : limité par visiteur et pour tout le site, gardé 1 h en mémoire seulement. En POST pour que le pseudo reste hors des logs d'accès ; il n'est écrit ni en base ni dans la console.
- `users.guide_done_at` : le guide des nouveaux arrivants a été fini ou passé. Il ne repart alors plus tout seul, sur aucun appareil ; « Replay the guide » dans les Réglages le relance sans toucher à la colonne.
- `TokenResponse` a un body vide exprès (tokens en cookies httpOnly uniquement) : ce n'est pas du code mort.
- Un cron se lit toujours via `schemas.cron_trigger`, jamais `CronTrigger.from_crontab` : APScheduler compte les jours depuis lundi, donc `1` tomberait un mardi.
- Le scheduler du sweep ne démarre qu'avec `ENABLE_SCHEDULER` ; le rate limiter vit en mémoire du process. L'app suppose un seul worker.
- L'IP d'un visiteur vient de `TRUSTED_IP_HEADER` (`CF-Connecting-IP` derrière Cloudflare), sinon du socket : jamais de `X-Forwarded-For`, qu'un visiteur écrit lui-même. Le login vérifie `failed_login_limiter` (par compte) avant le mot de passe, sinon une réponse 200 trahirait un bon essai.
- S'inscrire n'ouvre aucune session : `/register` envoie un lien (`mail_links`, seul le hash est gardé, il sert une fois) et la session s'ouvre en le suivant (`/confirm`). Un login sur une adresse jamais confirmée répond 403. Une inscription non confirmée ne possède pas son adresse : une nouvelle inscription ou un login Google/Discord vérifié la reprend (`release_unconfirmed_email`), et la purge horaire l'efface après 7 jours. Les demandes de lien répondent la même chose que l'adresse existe ou non.
- `services/mailer.py` envoie par le SMTP d'OVH. Sans `SMTP_HOST` il imprime le mail en local (pour suivre ses liens) et refuse en prod (`COOKIE_SECURE`) : un lien ouvre un compte. Les tests ne passent jamais par lui : `SENT_MAILS` et `mailed_token` dans `conftest.py`.
- Garde-fous d'un serveur à la maison : `MAX_AUTOMATIONS` (20), un planning au plus une fois par jour (minute et heure fixes, `_validate_cron` et `isValidCron` jugent les cas de `frontend/src/lib/cron-cases.json`), Run now et Re-run limités par `manual_run_limiter` juste avant le run (un appel refusé ne compte pas), et `PLAYLISTS_KEPT` (50) playlists par automation, que `noRepeatPlaylists` ne peut pas dépasser.

## Pièges frontend

- JSX sans TypeScript malgré la dépendance TS ; imports via l'alias `@/`.
- `src/lib/api.js` est l'unique client HTTP (refresh JWT auto). Pas de second client. Chaque appel abandonne après 30 s ; l'aperçu, Run now et Re-run ont 10 min (ils donnent leur avancement sur un ticket).
- Couleurs, typo et mouvement viennent des tokens de `src/index.css`, pas de valeur en dur dans un nouvel écran. La direction est dans `PRODUCT.md`.
- Polices pixel : Tiny5 pour les titres et chiffres, Jersey 20 pour le texte, sans `letter-spacing` ni tailles hors de l'échelle `--text-*`, sinon les lettres deviennent floues. Aucune graisse n'existe : la hiérarchie passe par la taille et la couleur.
- Le ruban de pixels (`lib/pixelRibbon.js`) se monte une seule fois dans `App` et n'a pas de raison d'être remonté. Tout bloc de contenu porte `data-quiet` (12 au plus à l'écran) : le ruban se dissout autour et ne passe jamais sous un texte, sauf le nom forgé du Dashboard. Une page qui porte `data-ribbon-hot` le fait chauffer (une génération en échec). Un élément vide `data-chain="412,120,50"` le couche droit dans cette bande, avec une largeur par étage de la chaîne.
- Le Dashboard pilote le ruban par `ribbonStage` et le lui rend en partant : c'est le seul écran à y poser une piste. Ses cartes vivent dans `#under-ribbon`, sous le canvas, montées par un portail, en enfants directs : la perspective du calque n'atteint que ceux-là.
- La page d'accueil a son propre canvas (`lib/landing/stage.js`) et le shader se tait sous elle (`silent` dans sa scène) : c'est la seule exception au ruban unique, parce que le fil doit pouvoir se défaire en pixels. Le spectacle suit le scroll avec un léger retard lissé, et quand le scroll s'arrête la page glisse jusqu'à l'étape suivante dans le sens du geste (`storyBeats`, `beatToSettle`), à l'envers aussi. Pas de `scroll-snap` CSS : il saccade avec les trackpads.
- `lib/landing/demo.json` sort de `scripts/landing_demo.py`, à travers le vrai moteur, et il est public à vie une fois commité : l'owner le relit avant. Ne pas le modifier à la main.
- Le guide des nouveaux arrivants (`components/elements/Guide.jsx`, étapes dans `lib/guide.js`) pointe les vrais écrans par `data-guide-step` et par des classes existantes (`.background-task`, `.poster__line`) : renommer l'une demande de changer l'étape. Pendant ses étapes, l'éditeur affiche ses champs vides (le brouillon garde ses valeurs par défaut dessous) et cache les recettes. La mascotte s'appelle « the thread » partout, comme sur la page d'accueil ; sur le Dashboard elle brûle en flamme.
- Un artiste, un album ou un morceau affiché ouvre sa page Last.fm (`LastfmLink`, `lastfmUrl`), et une page qui montre des données Last.fm porte `LastfmCredit` : les conditions de l'API le demandent (§2.7).
- `views/Privacy.jsx` décrit ce que le site garde et à qui il parle : une nouvelle donnée stockée, un cookie, un service tiers ou un journal doit y être ajouté dans la même PR, sinon la page ment. Elle promet aussi qu'aucune IP n'est gardée (pas de journal d'accès sur disque en prod).
- `DESIGN.md` décrit le monde visuel, écrit depuis le Créateur. Les écrans pas encore refaits ne sont pas une référence.

## Base de données locale

Postgres en Docker, conteneur `listfm-db` sur le port **5433**, bases `listfm` (dev) et `listfm_test` (tests). Après un reboot : `docker start listfm-db`. Après une nouvelle migration, migrer aussi la base de test : `DATABASE_URL=postgresql+asyncpg://listfm:listfm@localhost:5433/listfm_test alembic upgrade head` (depuis `backend/`) ; `ci-local.sh` ne le fait pas. Une erreur de connexion en test vient d'abord d'un conteneur arrêté.

# ListFM — Roadmap (proposition à valider, 2026-09-09)

Référence cap: `VISION.md`. Ordre voulu: **fonctionnel d'abord**, P0 vital court puis boucle feature/stable (budget dette ~20% par itération). Échelle: petit VPS potes, single-worker OK, Last.fm-only à vie.

## Rappel Last.fm (vérifié 2026-09-09)

- Pas de quota chiffré public. Doc officielle: "soyez raisonnable, ne frappez pas l'API au chargement de chaque page".
- Pratique communauté/pylast: **~1 seconde entre appels**. Notre `enrich_tracks` actuel (~300 appels/preview en ThreadPool 5) est l'inverse de ça: c'est ce qui impose le cache + la throttle.
- Conséquence: chaque stratégie ci-dessous vise à **réduire le nombre d'appels**, pas à les relancer plus vite en cas d'échec.

## P0 — stop-the-bleeding (✅ terminé 2026-09-23, PR #22-25 + #26)

1. **Vue /playlists manquante** ✅ fait (#21 ; entrée de création unique #26). (`frontend/src/App.jsx` redirige vers `/` alors que create/delete/back + sidebar pointent vers `/playlists`). Créer la liste ou corriger les redirects. Sans ça, la BASE n'est pas navigable.
2. **AuthCallback sans succès** ✅ fait (#16 + proxy `/api/*` et routage #23). (`frontend/src/views/AuthCallback.jsx` tombe toujours sur erreur). Rejouer le flux Google/Discord réel et fixer le path succès + proxy `/api/*` (aujourd'hui seul `/api/auth` est proxifié, le reste part en direct `localhost:8000` = cookies/CORS cassés en dev).
3. **Preview durcie** ✅ fait (#24) : valider via `AutomationCreate` (plus de `body: dict` brut), passer en `async + run_in_executor`, borner `limit=Query(ge=1,le=200)`, `period: Literal`, `username` (1-64 + regex, insensible à la casse), `cron` + `output.maxSize` typés. Corriger `maxSize=0 → 50` et supporter `top_artists` partout ou 422 partout.
4. **Auth VPS-ready** ✅ fait (#13, #14, #18 + #25 ; body sans aucun token en fixup) : migrer `python-jose` → PyJWT + claim `typ`, ne plus renvoyer `refresh` en body (cookies seuls), `delete_cookie` avec mêmes flags `secure/path`, garde 72B aussi sur `UserUpdate`, timeout `httpx` 10s + message 502 générique, `cors_origins` + méthodes explicites.
5. **Migrations sûres** ✅ fait (#22) : supprimer la no-op `fb0adb...`, squasher/marquer la `DROP CASCADE f0e1d2...` pour ne jamais la rejouer en prod.

## P1 — fermer la boucle Automations → playlists → historique

6. **Runner qui produit vraiment**: `run_automation` crée/maj `GeneratedPlaylist + PlaylistTracks` (aujourd'hui history seule), `GET /automations/{id}/history` + bouton Run-now + UI historique (date, avant/après filtre, erreur lisible, détail ouvrable avec tracks + tags figés).
7. **Échecs Last.fm — validé: B avec fenêtre d'origine (2026-09-09)**:
   Contexte owner: automatisation tous les 3 mois (playlists de saison). Si on rate un mois et qu'on relance à la main un mois plus tard, analyser 4 mois au lieu de 3 ou 3 mois décalés biaise la saison.
   Décision: **retry borné 2-3 essais (5min → 20min → 1h) en gardant `scheduled_for` d'origine**, puis `failed` visible + bouton "Relancer avec la période d'origine".
   *Exemple vulgarisé: si le photographe rate la photo de l'équipe en septembre, on ne prend pas l'équipe d'octobre en disant "c'est pareil" — on garde l'étiquette "photo de septembre" et on la refait vite avec les mêmes présents.*
   Limite honnête Last.fm: les sources `top_tracks 3m/6m` sont des fenêtres **relatives** ("3 derniers mois à partir de maintenant"), pas des dates calendaires. Un retry un mois plus tard glisse forcément. Vrai correctif en 2 temps: (a) d'abord retry rapide borné pour limiter le glissement à quelques heures max, (b) plus tard si besoin saison stricte: passer les sources saisonnières en `recent_tracks` avec `from/to` ancrés à `scheduled_for` (ou cache incrémental), au lieu de `top 3m` relatif. En attendant, l'historique affiche `prévu le / exécuté le` pour rendre le décalage visible.
8. **Cache DB 24h (validé: oui)**: réutiliser `tracks/albums/tags/user_tracks` au lieu de live-only. Plan: `get_or_create_track` + TTL 24h sur enrich (tags/artist_tags inclus pour figer l'historique), throttle ~1s entre appels Last.fm sortants, compteur de calls en logs. Effet attendu: preview + sweep + dashboard puisent dans le même stock au lieu de 300 appels à chaque fois. *Exemple: carnet de courses réutilisé 24h au lieu de retourner au marché à chaque recette.*
9. **Dashboard 50 recents — validé: A immédiat puis B après cache (2026-09-09)**.
10. **Durcir sweep**: commit par automation (plus de rollback global), ordre déterministe, resync `lastfm_username` au link, `scheduled_for` conservé en échec (retry B), `last_run` = heure d'exécution réelle, log structuré, `max_instances=1` documenté single-worker.
11. **DB/obs**: pool `pool_pre_ping + timeout`, `get_db` avec rollback, handler `SQLAlchemyError` → JSON (plus de HTML 500), pins `==` + `pip-audit`, `ruff + mypy + --cov --fail-under=80` en CI.

## P2 — hygiène

12. Unifier contrat `filterGroups` camel partout (ou snake documenté), vérifier `track_count`/`automation_id` ownership, cascade soft-delete, RBAC ou suppression du rôle, dédupliquer frontend (SVG OAuth, Grainient props, SOURCE_OPTIONS, Sidebar), trancher dark-only, a11y modals (role/focus/Escape), timeout/abort côté `api.js`, `isValidCron` stricte partagée front/back, borne récursion filtres.

## P3 — vitesse (perf Last.fm, ouverte 2026-09-29)

Constat owner (test manuel) : preview avec filtres de ~4 min pour 50 morceaux
(~300 appels Last.fm : jusqu'à 7 par morceau + ~1s d'attente entre appels),
spinner aveugle, cancel sans effet visible. Tranche 1 mergée (#42) : skip
enrich quand les filtres n'en ont pas besoin (cas "dsf" sans filtres : ~300 → ~1 appel).

Leçons de `felhag/lastfm-stats-web` (étudié 2026-10-02, voir notes ci-dessous) :
gros paquets (1000/page), jamais de détails morceau par morceau (stats
calculées en local), tags par artiste en arrière-plan, stockage local +
reprise incrémentale (ne recharger que le nouveau). Eux font des stats
(comptages locaux) ; nous on filtre (besoin des champs filtrés) : on ne
fera jamais zéro appel avec un filtre tag actif, mais on s'en rapproche.

Tranches (une petite PR chacune, rituel habituel : tests + CI verte + "go merge #N") :

- **T2 — retour en direct (mergé #43)** : run async + compteur/barre
  sur run et preview (polling ticket), cancel preview qui arrête le serveur,
  logs `pipeline:`/`enrich cache:` visibles, états done/error/cancelled.
- **T3 — vitesse pure (en cours, PR à venir)** : paquets à 200, `extended=1` sur recents (loved +
  images offerts), cadence ~1s → ~0,25s avec repli auto sur erreur 29.
  Cible : cas filtré type ~300 → ~50-100 appels en moins d'une minute.
- **T4 — cache malin** : fini le TTL qui jette tout → recents incrémentaux
  (stocker avec date, ne recharger que le nouveau depuis `from`), fraîcheur
  par groupe (noyau global / tags globaux / données perso) + colonne
  `tags_fetched_at`, règle d'or (jamais filtrer sur du non-cherché), tags
  par artiste persistants et partagés entre users. Brancher le `only=`
  (déjà prêt et testé depuis #42) avec write-back par groupe.
- **T5 — retry honnête** : vraie route retry avec `scheduled_for` d'origine +
  fenêtre `from/to` ancrée (réelle grâce à T4, plus un label), états "nouvel
  essai prévu" vs "échec définitif". Le bouton Re-run actuel refait un run
  neuf (même appel que Run now) : à rebrancher sur cette route.
- **T6 — alertes auto (promesse en suspens)** : `dependabot.yml` (màj hebdo)
  + scan `osv-scanner` planifié, pour ne plus découvrir les failles par
  hasard (cf. `fast-uri`, `brace-expansion` tombés en pleine PR).

Règle : ne jamais casser le réchauffement du cache des runs répétés pour
gagner sur un run isolé (leçon de #42 : le partiel sans write-back coûtait
plus cher sur 30 jours). Mesurer avant/après sur "dsf" à chaque tranche.

## Explicitement après

Export Spotify/YouTube, social/partage, presets, multi-provider. Ne pas attaquer sans feu vert.

## Notes owner (2026-09-09, à travailler plus tard)

- **Onglet Playlists = playlists générées, pas automations**: retour owner après test — la liste actuelle (automations) est OK pour l'instant, mais à terme l'onglet doit montrer les playlists générées par les automations. Ne pas refaire maintenant, garder en tête pour la boucle produit P1 (item 6).
- **BUG preview charge à l'infini (compte laetitiaplayhey@gmail.com, automation "dsf")**: diagnostiqué 2026-09-09, pas fixé. Mesure repro: `dispatch` 50 tracks en 2.9s, `enrich` 50 tracks en **139.2s** (total 142s) — `get_track_full_info` fait jusqu'à 6 appels Last.fm par track (listeners, playcount, userplaycount, userloved, artist tags, album+tags) avec `ThreadPoolExecutor(max_workers=5)`, et le frontend n'a aucun timeout (`api.js` sans AbortController) donc spinner de 2.5+ min = perçu infini. Pistes: cache DB 24h P1 (vrai fix, validé 2026-09-09 — pas de hotfix, on attend l'implémentation propre). Automation "dsf": source `recent_tracks`, filtres vides, user Last.fm `assawolf`.

## Validations owner (2026-09-09, figées)

- Retry: **B borné avec `scheduled_for` d'origine** (pas A seul). Relance manuelle = même période d'origine.
- Dashboard: **A immédiat puis B après cache**.
- Cache 24h avec tags figés pour historique ouvrable: **oui**.
- Domaine/HTTPS repoussé, préparer `COOKIE_SECURE` + CORS strict: **oui**.


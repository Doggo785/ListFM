# ListFM — Roadmap

Seul endroit où le statut est écrit. Le cap est dans `VISION.md`, la barre qualité dans `CONSTRAINTS.md`.
Une PR par point, dans l'ordre. Ce qui n'est pas listé ici attend le feu vert de l'owner.

## Versions

- release-please sur `main`. On reste en **0.x.x** jusqu'à la première release propre, la **v1.0.0**.
- `feat` → 0.(x+1).0, `fix` → 0.x.(y+1). `bump-minor-pre-major: true` garde un commit cassant (`feat!`) en 0.x.
- La v1.0.0 se fait par un commit `Release-As: 1.0.0`, seulement quand la section « Avant v1.0.0 » est vide et que l'owner le dit.

## Fait

- **Socle produit** (automations → playlists générées → historique) : un run raté ne repart plus en boucle, flows cassés et sécu bloquante (#13–#26), runner qui produit des playlists et un historique lisible (#20, #27), retry borné qui garde le `scheduled_for` d'origine (#30), sweep avec commit par automation, pool DB et erreurs DB en JSON (#39), recents du dashboard étiquetés « aperçu partiel » (#41).
- **Vitesse Last.fm** : enrich sauté quand les filtres n'en ont pas besoin (#42), progression en direct et cancel réel (#43), paquets de 200 et cadence 0,25 s avec repli sur l'erreur 29 (#45), cache à fraîcheur différenciée par groupe de données (#46, #47).
- **Hygiène du repo** : ruff, mypy, gitleaks, osv-scanner et diff-cover bloquants en CI, Dependabot, `scripts/ci-local.sh` (#34–#63), docs remises à plat (#66), routes mortes supprimées (#67), `main` seule branche (#69), release-please et v0.1.0 (#80).

## Maintenant

Les points « Avant v1.0.0 » dans l'ordre, une PR chacun. La PR de release ouverte par release-please se merge quand l'owner le dit.

## Avant v1.0.0

Bugs de l'audit du 2026-11-03, par priorité :

2. **Cache empoisonné** : un appel Last.fm raté garde sa valeur par défaut (0, aucun tag, pas loved) et `_write_back` la stocke fraîche 7 jours. Ne stocker que les champs réellement obtenus.
3. **Prise de compte** : la connexion Google/Discord se rattache à un compte local au même email même si ce compte n'a jamais vérifié son email (`repositories/users.py`). Exiger `user.email_verified`.
4. **Changement de compte Last.fm** : `link-lastfm` laisse l'ancien `lastfm_username` sur les automations et l'ancien cache perso (`user_tracks`) en place.
5. **Aperçu qui rétrécit** : le navigateur refiltre des morceaux déjà filtrés par le serveur ; retirer un filtre ne ramène rien. Afficher le résultat serveur et proposer de relancer l'aperçu ; supprimer alors `frontend/src/lib/filter-engine.js` (garder `countActiveConditions`).
6. **Taille ignorée** : `min(maxSize, 50)` plafonne à 50 et la source n'est lue qu'à hauteur de la taille avant filtres. Couper à `maxSize` après filtres, lire une source plus large quand un filtre est actif.
7. **Cron en UTC** : l'UI affiche « 08:00 » sans fuseau, le serveur lit en UTC. Fuseau configurable (`Europe/Paris`) au scheduler et à la validation.
8. **Récents figés** : le dashboard sert les récents en base tant que la dernière écoute a moins de 24 h. Juger la fraîcheur sur l'heure de la dernière lecture Last.fm.
9. **Deux onglets déconnectent** : un refresh concurrent du même jeton est pris pour un vol et révoque la famille. Tolérer 30 s après rotation.
10. **Erreurs internes affichées** : `str(exc)` va dans l'historique et la progression. Message générique, détail en log.
11. **`playcount` ambigu** : en source `top_artists` il vaut le compteur mondial, pas le tien. Ne pas le remplir dans `get_top_artists_tracks`.
12. **Code testé mais jamais appelé** : `run_automation_pipeline` (sync), `count_active_conditions` (Python), `get_user_tracks_needing_sync`, `update_last_played`, `upsert_last_played_at`, `upsert_track_tag`, `get_track_by_id`.
13. **Session expirée** : après un refresh raté, l'UI montre des 401 au lieu de revenir au login. Remettre `user` à null.
14. **`requireUsername()`** dans `api.js` double la vérification serveur : supprimer `_username` et ses appels.

Vitesse de l'aperçu (mesuré le 2026-11-03 : 48 morceaux sans cache = 326 appels, 83 s ; le temps suit appels × 0,25 s) :

15. **5 × `track.getInfo` par morceau** : listeners, playcount, userplaycount, userloved et album passent chacun par leur getter pylast, qui refait le même appel (240 appels sur 326). Un seul `track.getInfo` JSON avec `username=` comme `get_recent_tracks_extended` : 326 → ~134 appels.
16. **Tags artiste/album redemandés** : le cache est tout-ou-rien par morceau, un nouveau morceau d'un artiste connu refait `artist.getTopTags` et `album.getTopTags`. Date de fetch par artiste et par album, appel sauté sous 7 j.
17. **Clé API dans les logs** : les logs INFO de `httpx` impriment l'URL avec `api_key`. `logging.getLogger("httpx").setLevel(logging.WARNING)` dans `main.py`.
18. **Profil appelé 4 fois** : `get_user_info` fait 2 `user.getInfo`, et `AppSidebar` comme `Dashboard` appellent `/api/info`. Un appel JSON côté serveur, un appel partagé côté client.

Produit et hygiène :

- **Playlist en grand** : une playlist générée doit pouvoir s'ouvrir en plein écran.
- **Onglet Playlists** : il montre les playlists générées, pas les automations.
- **Retry honnête (T5)** : vraie route de retry qui garde le `scheduled_for` d'origine et une fenêtre `from/to` ancrée, états « nouvel essai prévu » et « échec définitif ». Le bouton Re-run actuel refait un run neuf (même appel que Run now) : le rebrancher sur cette route.
- **Scan sécu planifié** : osv-scanner chaque semaine via un `schedule` dans `ci.yml` (aujourd'hui il ne tourne que sur push et PR).
- **Hygiène UI** : modales accessibles (role, focus, Échap), timeout et abort dans `frontend/src/lib/api.js`, `isValidCron` strict et identique front/back, dédoublonner le frontend (SVG OAuth, props Grainient, `SOURCE_OPTIONS`, Sidebar), trancher dark-only.
- **Hygiène backend** : un seul contrat `filterGroups` (camel partout), borne de récursion des filtres, soft-delete en cascade, RBAC réel ou suppression du rôle.

## Plus tard (feu vert owner requis)

Export Spotify/YouTube, social et partage, presets, stats au-delà des 50 recents, domaine + HTTPS (`COOKIE_SECURE` et CORS strict sont prêts).

## Leçons Last.fm

- Pas de quota public, la doc demande d'être raisonnable : chaque changement vise **moins d'appels**, pas des appels plus rapides.
- Un filtre ne s'applique jamais sur une donnée qui n'a pas été cherchée.
- Garder le réchauffement du cache des runs répétés, même si un run isolé y perd : le partiel sans write-back de #42 coûtait plus cher sur 30 jours. Mesurer avant/après sur l'automation de test « dsf ».

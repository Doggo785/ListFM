# ListFM — Roadmap

Seul endroit où le statut est écrit. Le cap est dans `VISION.md`, la barre qualité dans `CONSTRAINTS.md`.
Une PR par point, dans l'ordre. Ce qui n'est pas listé ici attend le feu vert de l'owner.

## Versions

- release-please sur `main`. On reste en **0.x.x** jusqu'à la première release propre, la **v1.0.0**.
- `feat` → 0.(x+1).0, `fix` → 0.x.(y+1). `bump-minor-pre-major: true` garde un commit cassant (`feat!`) en 0.x.
- La v1.0.0 se fait par un commit `Release-As: 1.0.0`, seulement quand la section « Avant v1.0.0 » est vide et que l'owner le dit.
- Quand publier : la PR de release se merge par lot cohérent (un bloc de la ROADMAP fini et testé en vrai), tout de suite si elle porte un correctif de sécurité. L'agent peut la merger seul quand ses checks sont verts, son changelog juste et le changement testé en vrai.

## Fait

- **Socle produit** (automations → playlists générées → historique) : un run raté ne repart plus en boucle (#82), relier un autre compte Last.fm bascule les automations et vide le cache perso (#90), cron lu dans le fuseau de l'utilisateur, envoyé par son navigateur (#92), recents du dashboard toujours lus en direct (la base sert de secours si Last.fm tombe) (#93), deux onglets qui rafraîchissent la session en même temps ne se déconnectent plus (grâce de 30 s après rotation) (#94), erreurs internes masquées dans l'UI (#95), session expirée renvoyée au login (#96), plus de compteur mondial pris pour tes écoutes en source top artists (#97), code mort supprimé (#98, #99), OAuth rattaché à un compte local seulement si les deux emails sont vérifiés (#87), flows cassés et sécu bloquante (#13–#26), runner qui produit des playlists et un historique lisible (#20, #27), retry borné qui garde le `scheduled_for` d'origine (#30), sweep avec commit par automation, pool DB et erreurs DB en JSON (#39), recents du dashboard étiquetés « aperçu partiel » (#41).
- **Vitesse Last.fm** : enrich sauté quand les filtres n'en ont pas besoin (#42), progression en direct et cancel réel (#43), paquets de 200 et cadence 0,25 s avec repli sur l'erreur 29 (#45), cache à fraîcheur différenciée par groupe de données (#46, #47), un appel raté n'est plus mis en cache (#83), un seul `track.getInfo` par morceau (#88), tags d'artiste et d'album réutilisés entre morceaux pendant 7 jours.
- **Hygiène du repo** : ruff, mypy, gitleaks, osv-scanner et diff-cover bloquants en CI, Dependabot, `scripts/ci-local.sh` (#34–#63), docs remises à plat (#66), routes mortes supprimées (#67), `main` seule branche (#69), release-please et v0.1.0 (#80), clé API hors des logs (#86), CI locale en parallèle et tests backend 3× plus rapides (#85).

## Maintenant

Les points « Avant v1.0.0 » dans l'ordre, une PR chacun. La PR de release ouverte par release-please se merge quand l'owner le dit.

## Avant v1.0.0

Vitesse de l'aperçu (mesuré le 2026-11-03 : 48 morceaux sans cache = 326 appels, 83 s ; le temps suit appels × 0,25 s) :

- **Profil appelé 4 fois** : `get_user_info` fait 2 `user.getInfo`, et `AppSidebar` comme `Dashboard` appellent `/api/info`. Un appel JSON côté serveur, un appel partagé côté client.

Refonte du créateur de playlist (le refaire de zéro, après les bugs ci-dessus ; grilling de l'owner avant de coder) :

- **Constats** : le menu promet ce que le serveur ne fait pas.
  - La période s'affiche pour toutes les sources, mais seules `top_tracks` et `top_artists` la lisent : `recent_tracks` et `loved_tracks` prennent les derniers morceaux quoi qu'on choisisse (`dispatch_source_tracks`). « Recent tracks + 12 mois » ne lit donc que les 50 dernières écoutes.
  - La source n'est lue qu'à hauteur de `min(maxSize, 50)` avant filtres : un filtre sélectif ne voit que 50 morceaux et rend souvent zéro.
  - L'aperçu qui rétrécit : le navigateur refiltre des morceaux déjà filtrés par le serveur, retirer un filtre ne ramène rien. Supprimer `frontend/src/lib/filter-engine.js` (garder `countActiveConditions`).
- **Cible** : l'utilisateur voit ce qui sera lu et a plus de liberté.
  - Chaque source n'affiche que les réglages qu'elle lit ; `recent_tracks` lit une vraie fenêtre de dates (`time_from`/`time_to` existent déjà dans `get_recent_tracks`).
  - Profondeur de lecture de la source et taille de playlist réglables, sans plafond caché à 50 ; couper à la taille après filtres.
  - L'aperçu montre le résultat serveur, combien de morceaux lus et combien gardés, et se relance explicitement.
  - Lire plus de morceaux coûte plus d'appels Last.fm : afficher l'estimation avant de lancer.

Produit et hygiène :

- **Playlist en grand** : une playlist générée doit pouvoir s'ouvrir en plein écran.
- **Onglet Playlists** : il montre les playlists générées, pas les automations.
- **Retry honnête (T5)** : vraie route de retry qui garde le `scheduled_for` d'origine et une fenêtre `from/to` ancrée, états « nouvel essai prévu » et « échec définitif ». Le bouton Re-run actuel refait un run neuf (même appel que Run now) : le rebrancher sur cette route.
- **Scan sécu planifié** : osv-scanner chaque semaine via un `schedule` dans `ci.yml` (aujourd'hui il ne tourne que sur push et PR).
- **Hygiène UI** : modales accessibles (role, focus, Échap), timeout et abort dans `frontend/src/lib/api.js`, `isValidCron` strict et identique front/back, dédoublonner le frontend (SVG OAuth, props Grainient, `SOURCE_OPTIONS`, Sidebar), trancher dark-only. Réactiver la règle ESLint `react-hooks/set-state-in-effect` (coupée en attendant la refonte du créateur, 9 effets de chargement à réécrire).
- **Hygiène backend** : un seul contrat `filterGroups` (camel partout), borne de récursion des filtres, soft-delete en cascade, RBAC réel ou suppression du rôle.

## Plus tard (feu vert owner requis)

Export Spotify/YouTube, social et partage, presets, stats au-delà des 50 recents, domaine + HTTPS (`COOKIE_SECURE` et CORS strict sont prêts).

## Leçons Last.fm

- Pas de quota public, la doc demande d'être raisonnable : chaque changement vise **moins d'appels**, pas des appels plus rapides.
- Un filtre ne s'applique jamais sur une donnée qui n'a pas été cherchée.
- Garder le réchauffement du cache des runs répétés, même si un run isolé y perd : le partiel sans write-back de #42 coûtait plus cher sur 30 jours. Mesurer avant/après sur l'automation de test « dsf ».

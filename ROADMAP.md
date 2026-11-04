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
- **Vitesse Last.fm** : enrich sauté quand les filtres n'en ont pas besoin (#42), progression en direct et cancel réel (#43), paquets de 200 et cadence 0,25 s avec repli sur l'erreur 29 (#45), cache à fraîcheur différenciée par groupe de données (#46, #47), un appel raté n'est plus mis en cache (#83), un seul `track.getInfo` par morceau (#88), tags d'artiste et d'album réutilisés entre morceaux pendant 7 jours (#102), profil en un appel par chargement au lieu de 4 (#103).
- **Hygiène du repo** : ruff, mypy, gitleaks, osv-scanner et diff-cover bloquants en CI, Dependabot, `scripts/ci-local.sh` (#34–#63), docs remises à plat (#66), routes mortes supprimées (#67), `main` seule branche (#69), release-please et v0.1.0 (#80), clé API hors des logs (#86), CI locale en parallèle et tests backend 3× plus rapides (#85).

## Maintenant

Phase A, dans l'ordre, une PR par point. Le vocabulaire est dans `GLOSSARY.md`, les décisions structurantes dans `docs/adr/`. La PR de release ouverte par release-please se merge quand l'owner le dit, une release par phase finie et testée en vrai (0.3.0 après A, 0.4.0 après B, 0.5.0 après C).

## Avant v1.0.0

Règle : identité d'abord, écrans ensuite. Aucun travail visuel sur un écran actuel avant la phase B ; une feature UI en attente se construit directement dans la nouvelle identité. Un bug trouvé passe en PR `fix` tout de suite (release immédiate si sécu), une idée nouvelle va dans « Plus tard ».

### Phase A : fondations (sans visuel)

1. **Docs** : `GLOSSARY.md`, ADR 0001 et 0002, cette ROADMAP.
2. **Synchro des écoutes** (ADR 0001) : table des écoutes, synchro complète puis incrémentale (`user.getRecentTracks` par pages de 1000, repli à 200), progression, liste des loved relue en entier. Toujours avant un run, au plus toutes les 10 min pour l'aperçu. Pendant le premier chargement, l'aperçu est partiel (bandeau) et les runs attendent la fin.
3. **Moteur de la chaîne** (ADR 0002) : une seule source, les écoutes, puis Fenêtre → Filtres → Tri → Limites.
   - Fenêtre comptée depuis la date prévue du run : glissante, décalée (« le même mois il y a un an »), toutes les écoutes. Pas de dates fixes.
   - Filtres : l'existant + première écoute, artiste dans ton top N, moment d'écoute (jour, tranche horaire). Groupes ET/OU sur 2 niveaux maximum, même contrôle front et back. Un seul contrat `filterGroups` (camel partout).
   - Tris : les plus écoutés, écoutés le plus récemment, découverts le plus récemment, au hasard (pondérable par les écoutes). Le tri choisit les morceaux gardés et fixe leur ordre.
   - Limites : taille, maximum par artiste, maximum par album, pas de répétition sur les N dernières playlists de l'automation.
   - Moins de morceaux que la taille : playlist plus courte, historique « 32/50 ». Zéro : run vide.
   - Table rase des automations, playlists et historique existants (des tests), aucune migration.
4. **Catalogue de tags** (ADR 0003) : tâche de fond après la synchro, un appel par artiste, les plus écoutés d'abord, partagé entre utilisateurs, valable 90 jours. À trancher : les filtres auditeurs et popularité mondiale, qui demandent un appel par morceau. Tags d'album plus tard (la synchro doit d'abord garder l'album de chaque écoute).
5. **Aperçu serveur** : ce que le run produirait maintenant, avec le compte de chaque étage et le taux de tags connus. Aucun appel Last.fm. Supprime le besoin de `frontend/src/lib/filter-engine.js`.
6. **Retry honnête (T5)** côté serveur : vraie route de retry qui garde le `scheduled_for` d'origine, donc la même fenêtre.
7. Petites PR indépendantes, glissées quand on veut : **scan sécu planifié** (osv-scanner hebdo via `schedule` dans `ci.yml`), **timeout et abort** dans `frontend/src/lib/api.js`, `isValidCron` strict et identique front/back, **soft-delete en cascade**, **RBAC réel ou suppression du rôle**.

### Phase B : identité visuelle avec [Impeccable](https://github.com/pbakaus/impeccable)

Une identité forte, claire et marquée, pas l'allure générique des pages faites par IA.

1. `impeccable init` → `PRODUCT.md`. Nouvelle identité écrite dans `DESIGN.md` (pas `document`, qui décrirait l'ancien style). Trancher dark-only ici.
2. **Tokens** (couleurs, typo, espacements, rayons, mouvement) à un seul endroit, branchés sur tout le site : toutes les pages changent de peau en une PR.
3. **Composants de base** refaits sur ces tokens : Button, Select, modales accessibles (role, focus, Échap), Sidebar, SVG OAuth, props Grainient et `SOURCE_OPTIONS` dédoublonnés.
4. **Détecteur bloquant** : `npx impeccable detect` dans `scripts/ci-local.sh` et en CI.

Garde-fou : le mode `live` d'Impeccable seulement avec `IMPECCABLE_LIVE_COPY_AGENT=chat` (sinon il relance un agent sans permissions).

### Phase C : écrans refaits, une PR par écran

Chaque PR passe `impeccable critique` et `audit` avant le merge.

1. **Créateur** : une seule page, réglages et aperçu Live côte à côte (relance seule ~0,4 s après chaque changement), chaque étage avec son compteur, filtres et planning repliés dans « Affiner » et « Planifier ». Nom proposé depuis les réglages, modifiable. 7 presets : Top tracks, Récents, Aimés, Top artistes, Découvertes du mois, Redécouvertes, Saisonnier (tous les 3 mois, les X plus écoutés des 3 mois précédents). Planning : même logique (`CronEditor`, fuseau de #92), UI/UX fortement améliorée. Supprimer `frontend/src/lib/filter-engine.js` (garder `countActiveConditions`).
2. **Playlists** : l'onglet montre les playlists générées, pas les automations ; une playlist s'ouvre en plein écran.
3. **Historique** : états « nouvel essai prévu », « échec définitif », run vide, « 32/50 ». Le bouton Re-run passe par la route de retry de T5.
4. **Dashboard**.
5. **Connexion et réglages**.
6. Réactiver la règle ESLint `react-hooks/set-state-in-effect`.

### Phase D : finition

Animations, `impeccable polish` et `harden` sur tout le site. Puis v1.0.0 quand l'owner le dit.

## Plus tard (feu vert owner requis)

Export Spotify/YouTube, social et partage, presets partagés, découverte (morceaux jamais écoutés), stats au-delà des 50 recents, domaine + HTTPS (`COOKIE_SECURE` et CORS strict sont prêts).

## Leçons Last.fm

- Pas de quota public, la doc demande d'être raisonnable : chaque changement vise **moins d'appels**, pas des appels plus rapides.
- Un filtre ne s'applique jamais sur une donnée qui n'a pas été cherchée.
- Garder le réchauffement du cache des runs répétés, même si un run isolé y perd : le partiel sans write-back de #42 coûtait plus cher sur 30 jours. Mesurer avant/après sur l'automation de test « dsf ».

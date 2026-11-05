# ListFM — Roadmap

Seul endroit où le statut est écrit. Le cap est dans `VISION.md`, la barre qualité dans `CONSTRAINTS.md`.
Dans l'ordre, en regroupant les points dans une même PR dès que possible. Ce qui n'est pas listé ici attend le feu vert de l'owner.

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

Phase A, dans l'ordre. Le vocabulaire est dans `GLOSSARY.md`, les décisions structurantes dans `docs/adr/`. La PR de release ouverte par release-please se merge quand l'owner le dit, une release par phase finie et testée en vrai (0.3.0 après A, 0.4.0 après B, 0.5.0 après C).

## Avant v1.0.0

Règle : identité d'abord, écrans ensuite. Aucun travail visuel sur un écran actuel avant la phase B ; une feature UI en attente se construit directement dans la nouvelle identité. Un bug trouvé passe en PR `fix` tout de suite (release immédiate si sécu), une idée nouvelle va dans « Plus tard ».

### Phase A : fondations (sans visuel)

1. *(fait, #106)* **Docs** : `GLOSSARY.md`, ADR 0001 et 0002, cette ROADMAP.
2. *(fait, #107)* **Synchro des écoutes** (ADR 0001) : table des écoutes, synchro complète puis incrémentale (`user.getRecentTracks` par pages de 1000, repli à 200), progression, liste des loved relue en entier. Toujours avant un run, au plus toutes les 10 min pour l'aperçu. Pendant le premier chargement, l'aperçu est partiel (bandeau) et les runs attendent la fin.
3. *(fait, #109, #111, #112, #113)* **Moteur de la chaîne** (ADR 0002) : une seule source, les écoutes, puis Fenêtre → Filtres → Tri → Limites.
   - Fenêtre comptée depuis la date prévue du run : glissante, décalée (« le même mois il y a un an »), toutes les écoutes. Pas de dates fixes.
   - Filtres : l'existant (sans auditeurs, popularité mondiale ni Rank ; opérateurs au moins, au plus, exactement, entre) + première écoute, artiste dans ton top N (calculé sur la fenêtre par défaut, ou sur tout l'historique, une période relative, des dates fixes), moment d'écoute (de tel jour à tel jour, de telle heure à telle heure, passage de minuit accepté, au moins X écoutes, fuseau de l'utilisateur ; le tri compte au choix toutes les écoutes de la fenêtre ou seulement celles de ce moment). Groupes ET/OU sur 2 niveaux maximum, même contrôle front et back. Un seul contrat `filterGroups` (camel partout).
   - Tris : les plus écoutés, écoutés le plus récemment, découverts le plus récemment, au hasard (pondérable par les écoutes). Le tri choisit les morceaux gardés et fixe leur ordre.
   - Limites : taille, maximum par artiste, maximum par album, une réédition (Bonus, Deluxe, Remaster…) comptant comme l'album d'origine (la synchro garde l'album de chaque morceau, l'historique est relu une fois), pas de répétition sur les N dernières playlists de l'automation.
   - Moins de morceaux que la taille : playlist plus courte, historique « 32/50 ». Zéro : run vide.
   - Table rase des automations, playlists et historique existants (des tests), aucune migration.
4. *(fait)* **Catalogue de tags** (ADR 0003) : tâche de fond après la synchro, un appel par artiste, les plus écoutés d'abord, partagé entre utilisateurs, valable 90 jours. Tags d'album plus tard.
5. *(fait)* **Aperçu serveur** : ce que le run produirait maintenant, avec le compte de chaque étage et le taux de tags connus. Aucun appel Last.fm. L'écran affiche cette réponse sans la retravailler et signale quand les réglages ont changé depuis. L'API expose aussi l'avancement des tâches de fond (écoutes, tags) pour le suivi de la phase B.
6. *(fait, côté serveur ; le bouton arrive en phase C)* **Retry honnête (T5)** côté serveur : vraie route de retry qui garde le `scheduled_for` d'origine, donc la même fenêtre.
7. *(fait, côté console ; l'écran arrive en phase B)* **Logs lisibles** : une ligne par page de synchro, tous les 100 artistes, par run, aperçu et appel Last.fm, sans clé API.
8. Petites PR indépendantes, glissées quand on veut : **scan sécu planifié** (osv-scanner hebdo via `schedule` dans `ci.yml`), **timeout et abort** dans `frontend/src/lib/api.js`, `isValidCron` strict et identique front/back, **soft-delete en cascade**, **RBAC réel ou suppression du rôle**.

### Phase B : identité visuelle avec [Impeccable](https://github.com/pbakaus/impeccable)

But : une seule DA sur tout le site, animée partout, avec un style qui évolue de page en page. DA choisie par l'owner sur prototype (2026-11-04) : **pixel, palette Braise, dark-only**. Un ruban de pixels tramé se balade sur chaque page, guide le regard et change de forme et de chaleur selon la page, en restant secondaire. Changer de page est immédiat : seul le ruban voyage, rien ne recouvre l'écran. On repart de zéro côté front : plus de sidebar, l'ancien style n'est une référence pour rien, et chaque écran est réécrit en phase C. L'API et `lib/api.js` restent.

1. *(fait)* `impeccable init` → `PRODUCT.md`, direction validée, contrat dans le brief de surface.
2. *(fait)* **Socle** : tokens (couleurs, typo, mouvement) à un seul endroit, ruban de pixels, navigation en haut à la place de la sidebar, changement de page immédiat. Les anciens écrans restent utilisables, ruban autour de leur contenu, jusqu'à leur tour en phase C.
3. *(fait)* **Composants de base** sur ces tokens : Button, Select, modale accessible (role, focus, Échap), SVG OAuth. Les options de fenêtre et de tri n'ont déjà plus qu'une source (`lib/automation-rules.js`).
4. *(fait)* **Suivi des tâches de fond** : indicateur discret visible sur toutes les pages, qui remplace `SyncBanner`, reste tant qu'une tâche peut changer les résultats (« Recherche des tags : 1 200 / 9 552 artistes. Les filtres de tag peuvent être incomplets d'ici là. ») et reste muet pour les petites synchros de routine.
5. *(fait)* **Détecteur bloquant** : `npm run check:design` dans `scripts/ci-local.sh` et en CI (job `frontend-build`).

Garde-fou : le mode `live` d'Impeccable seulement avec `IMPECCABLE_LIVE_COPY_AGENT=chat` (sinon il relance un agent sans permissions).

### Phase C : écrans réécrits

Chaque PR branche le ruban sur les vraies données de l'écran et supprime l'ancien code qu'elle remplace. Le Créateur vient en premier : `DESIGN.md` s'écrit à sa fin, depuis le résultat construit (pas `document`, qui décrirait l'ancien style).

1. *(fait)* **Créateur** : le but est une liberté quasi infinie dans une UI soignée, intuitive et jamais chargée (réglages avancés repliés par défaut). Une seule page, réglages et aperçu Live côte à côte (relance seule ~0,4 s après chaque changement), chaque étage avec son compteur, filtres et planning repliés dans « Affiner » et « Planifier ». Nom proposé depuis les réglages, modifiable. 7 presets : Top tracks, Récents, Aimés, Top artistes, Découvertes du mois, Redécouvertes, Saisonnier (tous les 3 mois, les X plus écoutés des 3 mois précédents). Planning : même logique (`CronEditor`, fuseau de #92), UI/UX fortement améliorée. Filtres : remplacer les blocs par une liste qui se lit comme une phrase, groupes repliés dans « Avancé », et ajouter à l'écran première écoute, top artistes et moment d'écoute. Le ruban dessine les compteurs de la chaîne.
2. *(fait)* **Finition du Créateur**. L'owner garde Tiny5 pour les chiffres, comparaison faite avec Jersey 20. Écartés : le « or » modifiable entre groupes (le moteur fait un OU entre groupes par construction, un ET s'écrit dans un même groupe) et l'effilement du ruban aligné sur les étapes (le ruban est horizontal, les étapes verticales).
3. *(fait)* **Playlists** : menu Dashboard, Automations, Playlists. L'onglet Playlists range les playlists sur une étagère par automation, chacune avec une pochette (deux albums séparés par le ruban) et la période qu'elle couvre. Elle s'ouvre en plein écran, sa pochette, son nom et sa période glissant de l'étagère à la page, avec copie de la liste, lien vers l'automation et suppression. Les automations passent à `/automations`, en cartes pixel.
4. *(fait)* **Historique** : intégré à l'automation plutôt qu'en onglet, choix de l'owner. Chaque carte d'Automations dit l'état de sa dernière génération ; la page d'une automation montre son historique par jour, une ligne par génération, essais repliés, avec « Retrying at 14:32 », échec définitif, run vide et « 32/50 » (taille demandée enregistrée à chaque run). Re-run passe par la route de retry de T5, sur la dernière génération en échec seulement. Les réglages se modifient dans le Créateur : l'ancienne page `PlaylistDetail` a disparu. Le ruban chauffe tant qu'une dernière génération est en échec.
5. *(fait)* **Dashboard** : une affiche, puis l'année en vol. Le nom de l'artiste du moment en géant prend feu depuis la tête de lecture du ruban (la forge), au-dessus de la largeur du ruban qui suit les écoutes jour par jour, des braises qui en montent, des albums du moment, des derniers runs et des totaux. Plus bas, le scroll rembobine l'année : les pochettes sortent de la gauche sur un arc 3D, chacune celle de l'artiste du mois, à travers la flamme. Le même arc montre les automations. Les images d'artistes de Last.fm étant mortes, seules les pochettes d'albums servent.
6. *(fait)* **Connexion et réglages** : « ListFM » en géant sur le ruban et le formulaire à côté, sur tous les écrans avant le site. Réglages s'ouvre depuis le nom d'utilisateur : fuseau, compte Last.fm, mot de passe (les autres appareils sont déconnectés), suppression du compte (écoutes et lien Last.fm vraiment effacés, l'email libéré). Last.fm se lie par l'autorisation officielle, plus aucun pseudo à taper, et seul le pseudo est gardé. Le navigateur ne pose le fuseau qu'une fois, ensuite seuls les réglages le changent.
7. **Page d'accueil** : refaite à 100 % avant le login, avec une présentation propre de ListFM. Elle retire `Grainient` et `ogl`, qui ne servent plus qu'à elle.
8. Réactiver la règle ESLint `react-hooks/set-state-in-effect`.

### Phase D : finition

**Guide interactif pour les nouveaux arrivants** (demande de l'owner) : obligatoire avant la v1.0.0, une fois les écrans de la phase C refaits. Sa forme reste à définir avec l'owner.

Animations restantes, mesure de charge du ruban sur petit PC et mobile, `impeccable polish` et `harden` sur tout le site. Puis v1.0.0 quand l'owner le dit, et seulement là migration du VPS : le site doit être utilisable par un utilisateur classique.

## Plus tard (feu vert owner requis)

**Mot de passe oublié** : à faire avant toute ouverture publique, il demande l'envoi d'emails.

Comptes : se connecter avec Last.fm, changer d'email, lier ou délier Google et Discord depuis les réglages.

Export Spotify/YouTube, social et partage, presets partagés, découverte (morceaux jamais écoutés), filtres auditeurs et popularité mondiale (un appel par morceau), domaine + HTTPS (`COOKIE_SECURE` et CORS strict sont prêts).

**Noms qui se mettent à jour** (idée de l'owner, utile surtout une fois les playlists envoyées sur les apps de streaming) : un nom d'automation peut contenir des variables résolues à chaque run, par exemple `Seasonal {season} {year}` donne « Seasonal Winter 2026 ». À trancher : la liste des variables, l'hémisphère pour les saisons, et l'année d'un hiver à cheval sur deux ans.

## Leçons Last.fm

- Pas de quota public, la doc demande d'être raisonnable : chaque changement vise **moins d'appels**, pas des appels plus rapides.
- Un filtre ne s'applique jamais sur une donnée qui n'a pas été cherchée.
- Garder le réchauffement du cache des runs répétés, même si un run isolé y perd : le partiel sans write-back de #42 coûtait plus cher sur 30 jours. Mesurer avant/après sur l'automation de test « dsf ».

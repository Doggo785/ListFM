# ListFM — Vision validée (2026-09-09, owner: Doggo)

Source: entretien review complète + 4 explores (backend, frontend, dette/sécu, moteur automations).
Ce fichier est la référence de cap pour tous les runs d'agents. En cas de doute, le respecter plutôt qu'inventer une feature.

## 1. Cap produit (BASE, non-négociable)

ListFM = **machine à playlists auto depuis Last.fm**.
Le socle DU projet, dans l'ordre:
1. **Automatisations** visibles (CRUD + scheduling récurrent + exécution auto).
2. **Playlists** générées par ces automatisations, sauvegardées et consultables.
3. **Historique** des runs (quoi, quand, combien de tracks, erreur si échec).

Tant que 1→2→3 ne marche pas de bout en bout de façon fiable, ne pas partir sur autre chose.

## 2. Non-objectifs (ne pas faire maintenant)

- **Social / partage public**: idée future, BIEN plus tard. Ne pas l'architecturer par anticipation.
- **Export Spotify / YouTube**: jugé complexe et risqué à l'échelle (quotas, OAuth tiers, mapping IDs). Mis de côté. Ne pas l'implémenter sans feu vert explicite.
- **Multi-provider (Spotify/Apple/Deezer comme source)**: NON, Last.fm seul à vie. Justification produit: seul Last.fm log TOUT ce que l'user écoute, les autres ne donnent qu'un historique limité donc pas viable comme source.
- **Sur-abstraction provider**: ne pas créer une couche "multi-source" générique. Rester Last.fm-first, code simple.

## 3. Cibles et principes UX

- **Cibles**: power users Last.fm ET grand public façon Spotify. Concrètement: simple par défaut pour tout le monde, mais les automatisations complexes restent possibles (progressive disclosure: wizard simple + builder avancé).
- **Ordre qualité**: **fonctionnel d'abord**, beau/animé après. Au début moche mais qui marche > beau mais cassé.
- **Non-négociables finaux**: beau + animé + rapide + précis (filtres justes, résultats attendus). "Privé" compris comme: pas d'exposition de données internes/erreurs aux clients, pas de tracking superflu, tokens en httpOnly uniquement.
- **Vocabulaire tranché (2026-09-09)**: côté user on dit **Automation** pour l'objet qui définit comment une playlist va être générée (source + schedule + filtres), et playlist générée / historique pour le résultat. Garder ce mot dans le menu et l'UI, ne pas mélanger avec "Playlist auto".
- **Sessions**: multi-device simple = **revoke-all au login** gardé pour l'instant (comme Netflix qui déconnecte le salon quand tu te connectes sur tel). Suffisant à l'échelle potes, ne pas complexifier.
- **Historique voulu**: date, nombre de tracks après filtre (+ avant filtre en bonus), et ouverture du détail avec **tracks + tags figés au moment de la génération** pour voir la génération proprement. Cron vide = manuel sans auto-update, validé.
- **Cache**: OUI, cache DB 24h pour ne pas inonder Last.fm (carnet réutilisé 24h plutôt que retour au marché à chaque fois). Tables mortes `tracks/albums/tags` à réutiliser dans ce but, pas à supprimer aveuglément.
- **Retry validé (2026-09-09)**: retry borné avec `scheduled_for` d'origine (pas de décalage silencieux de saison), relance manuelle = même période d'origine. Historique affiche `prévu le / exécuté le`.

## 4. Contraintes déploiement et confort

- Side-project plaisir MAIS déployé sur petit VPS perso (owner + potes, jamais 1000 users visés). Donc: single-worker acceptable, pas de Redis/K8s par défaut, migrations sûres (jamais de DROP CASCADE en prod), backups Postgres minimales (dump nightly suffit).
- Infra validée: **Docker Compose sur petit Linux**. Domaine + HTTPS (Let's Encrypt) en réflexion (flemme de payer un domaine pour l'instant, décision repoussée, prévoir `COOKIE_SECURE` + CORS strict quand ce sera tranché).
- OAuth Google/Discord + password: on garde tel quel tant que ça marche, pas de nouvel OAuth, pas de simplification forcée.
- En attendant l'export: **playlists 100% in-app**, suffisant. Dashboard: ne pas tromper sur les 50 recents (voir ROADMAP: soit mention "aperçu partiel", soit cache permettant un plus gros appel mutualisé avec previews).
- Dette: l'owner a passé du temps à corriger sans fin et craint le puits sans fond. Règle: **stop-the-bleeding P0 d'abord, puis boucle feature/stable par petits incréments**, pas de big-bang sécu. Budget dette ~20% par itération après P0.

## 5. Ordre roadmap (proposition à valider, ne pas inverser sans accord)

- **P0 — flows cassés + sécu bloquante**: vue /playlists manquante, AuthCallback sans succès, proxy /api/* incomplet, preview sans validation + bloquant, bornes limit/period/username/cron/output, auth (PyJWT, typ claim, refresh hors body, delete_cookie avec flags, garde 72B, timeout httpx).
- **P1 — fermer la boucle produit**: runner qui crée vraiment des GeneratedPlaylist + GET history + Run-now + UI history/last_run/next_run, durcir sweep (commit par run, backoff échec, resync pseudo Last.fm, lock ou single-worker assumé), Last.fm en to_thread + logs, pool DB + handler SQLAlchemyError, pins == + audit, ruff/mypy/cov en CI.
- **P2 — hygiène**: trancher tables mortes (tracks/albums/tags/user_tracks: supprimer ou vrai cache 24h), unifier contrat filterGroups camel vs snake, cascade deletes, RBAC ou suppression du rôle, squash migration DROP, dédupliquer frontend, trancher dark-only, a11y modals.
- Seulement ensuite: export, partage, presets, stats au-delà de 50 recents.

## 6. Règles pour les agents

- Avant toute feature hors P0/P1, relire ce fichier et vérifier que 1→2→3 marche.
- Ne jamais proposer: export Spotify/YouTube, social, multi-provider, sans demander d'abord.
- Préférer petits diffs vérifiés (RED→GREEN + surface réelle) à la refactor large.
- Expliquer les points très techniques avec un exemple vulgarisé (une phrase image) quand on parle à l'owner non-expert du sujet.
- Si ambiguïté produit (vocabulaire, cache, multi-device, history UI), poser la question plutôt que deviner.

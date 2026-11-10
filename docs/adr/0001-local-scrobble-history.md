# Historique d'écoute complet stocké en local

Les sources lisaient Last.fm en direct, plafonnées à 50 morceaux : un filtre sélectif voyait trop peu de morceaux, l'aperçu ne pouvait pas refléter le run, et chaque lecture plus profonde coûtait des appels. On stocke maintenant toutes les écoutes de chaque utilisateur en base : un chargement complet au premier lien Last.fm (`user.getRecentTracks` par pages de 1000, repli à 200, méthode reprise de felhag/lastfm-stats-web), puis une synchro incrémentale (seulement ce qui est plus récent que la dernière écoute connue) avant chaque run et chaque aperçu. Les sources deviennent des requêtes en base, sans appel Last.fm.

## Considered Options

- **Lecture en direct avec une profondeur réglable** : coût par run proportionnel à la profondeur, et l'aperçu diverge du run dès que les deux lisent différemment.
- **Lecture en direct jusqu'à remplir la playlist** : coût imprévisible d'un run à l'autre.

## Consequences

- Place mesurée sur Postgres 16 (1 M de lignes insérées dans l'ordre chronologique, clé `(user_id, played_at, track_id)`) : environ 220 octets par écoute avec les ids `varchar(36)` du projet (contre 120 avec des `uuid` natifs). 150 000 écoutes ≈ 33 Mo, 5 M ≈ 1,1 Go, plus les morceaux distincts dans `tracks`.
- Les pages de 1000 dépassent le maximum documenté par Last.fm (200) : le repli à 200 est obligatoire.
- Le premier chargement prend plusieurs minutes pour un gros compte et doit afficher sa progression.
- Depuis le guide des nouveaux arrivants (2026-11), le premier chargement lit du plus récent au plus ancien : les mois récents qu'une playlist demande sont là en quelques secondes, et l'aperçu dit jusqu'où l'historique est lu. Un run demandé pendant ce chargement attend sur sa ligne et part tout seul à la fin, au lieu d'échouer.

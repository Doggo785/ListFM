# Une seule source et une chaîne Fenêtre → Filtres → Tri → Limites

Les 4 sources (top tracks, recent, loved, top artists) n'étaient que des combinaisons figées de fenêtre, de filtre et de tri, et chacune lisait des réglages différents sans le dire. Depuis que les écoutes sont stockées en local (ADR 0001), une automation part toujours des écoutes de l'utilisateur et les fait passer par la même chaîne : Fenêtre, Filtres, Tri, Limites. Les anciennes sources deviennent des presets qui préremplissent cette chaîne.

## Consequences

- Aucune migration des automations existantes : ce sont des tests, l'ancien format est abandonné.
- La source « top artists » ne fait plus de découverte (morceaux populaires jamais écoutés) : elle devient le filtre « artiste dans ton top N ». La découverte, si elle revient, sera une feature à part.

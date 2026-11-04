# Les filtres ne lisent que la base, un catalogue de tags se remplit à part

Filtrer sur un tag appelait Last.fm morceau par morceau pendant le run ou l'aperçu : jusqu'à 3000 appels et 12 minutes pour un seul filtre, ce qui rend un aperçu Live impossible. Les filtres et le pipeline ne font plus aucun appel Last.fm et ne lisent que la base. Une tâche de fond remplit un catalogue de tags par artiste, en commençant par les artistes les plus écoutés : un appel couvre tous les morceaux d'un artiste, et le catalogue est partagé entre utilisateurs.

## Considered Options

- **Un appel par morceau, avec cache** : 26 968 appels pour un compte de 153 000 écoutes, contre 9 561 par artiste.
- **Chercher sur clic avec une estimation d'appels** (décision initiale de l'aperçu) : même à un appel par artiste, 12 minutes pour une fenêtre de 3 mois.

## Consequences

- Une donnée jamais cherchée ne passe aucun filtre, pas même « ne contient pas » : inconnu n'est pas « sans tag ». Tant que le catalogue n'est pas plein, une playlist filtrée sur un tag peut sortir incomplète, et seul le taux de tags connus l'indique.
- Les tags sont valables 90 jours : relire tous les artistes chaque semaine ferait tourner la tâche en continu.
- Seuls les tags d'artiste sont proposés : un artiste qui change de style entre deux albums est mal classé jusqu'à l'arrivée des tags d'album (la synchro garde déjà l'album de chaque morceau).
- Les filtres auditeurs et popularité mondiale sont retirés : ils demandent un appel par morceau, soit environ 2 h pour un compte de 150 000 écoutes, sans partage entre artistes.

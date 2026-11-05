# ListFM

Machine à playlists automatiques construites depuis l'historique d'écoute Last.fm d'un utilisateur.

## Language

**Automation** :
La recette qui définit comment une playlist sera générée : une source, des filtres, une taille et un planning optionnel. C'est ce que le créateur fabrique.
_Avoid_ : Playlist, Playlist auto, recette

**Playlist** :
Le résultat figé d'un run d'une automation : une liste de morceaux avec leurs tags tels qu'au moment de la génération.
_Avoid_ : Playlist générée (quand le contexte suffit), automation

**Run** :
Une exécution d'une automation, planifiée ou manuelle, qui produit au plus une playlist et laisse une ligne d'historique.
_Avoid_ : Exécution, génération, job

**Historique** :
La liste des runs d'une automation : quand, combien de morceaux, et l'erreur en cas d'échec.
_Avoid_ : Historique d'écoute (dire Écoutes)

**Run vide** :
Un run qui ne trouve aucun morceau : il ne crée pas de playlist, ce n'est pas un échec et il n'est pas retenté.
_Avoid_ : Échec, erreur

## Écoutes

**Écoute** :
Un passage d'un morceau enregistré par Last.fm pour un utilisateur, avec sa date.
_Avoid_ : Scrobble, play, lecture

**Écoutes** :
L'ensemble des écoutes d'un utilisateur, recopiées depuis Last.fm. C'est le seul point de départ d'une automation.
_Avoid_ : Historique, source, scrobbles

**Synchro** :
La mise à jour des écoutes d'un utilisateur depuis Last.fm : complète la première fois, puis seulement les nouvelles.
_Avoid_ : Import, fetch, refresh

**Catalogue de tags** :
Les tags connus par artiste, partagés entre utilisateurs et remplis en tâche de fond. Un artiste absent du catalogue a des tags inconnus, ce qui diffère d'un artiste sans tag.
_Avoid_ : Cache, enrichissement

## La chaîne d'une automation

**Fenêtre** :
Le choix des écoutes qu'une automation regarde, comptée depuis la date prévue du run, soit le dernier passage de son planning même si le run part en retard ou juste après la création (un nouvel essai garde la même fenêtre ; un run manuel compte depuis maintenant) : glissante (« les 30 derniers jours »), décalée (« le même mois il y a un an ») ou toutes les écoutes.
_Avoid_ : Période, plage de dates, source

**Filtre** :
Une règle qui garde ou exclut des morceaux de la fenêtre.
_Avoid_ : Condition (sauf pour une ligne d'un groupe de filtres), critère

**Tri** :
L'ordre dans lequel les morceaux gardés sont classés avant d'être pris.
_Avoid_ : Classement, ordre

**Limite** :
Un plafond appliqué en prenant les morceaux dans l'ordre du tri : la taille de la playlist, ou un maximum par artiste, par album, etc.
_Avoid_ : Contrainte, cap

**Preset** :
Une automation préremplie (ex. « Top tracks », « Loved ») que l'utilisateur part modifier.
_Avoid_ : Source, template, modèle

**Aperçu** :
Ce que le run produirait s'il avait lieu maintenant, avec le compte de chaque étage de la chaîne.
_Avoid_ : Preview, simulation

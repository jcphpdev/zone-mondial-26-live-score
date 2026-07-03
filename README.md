# Zone Mondial 26 — Live Score

- `index.html` : overlay destiné à OBS.
- `admin.html` : interface de mise à jour manuelle des matchs.
- `scores.json` : données affichées par l’overlay.

## Publication instantanée avec Firebase

1. Créer un projet Firebase et une Realtime Database.
2. Activer Firebase Authentication avec le fournisseur E-mail/Mot de passe.
3. Créer le compte administrateur.
4. Copier la configuration Web dans `firebase-config.js`.
5. Publier le projet sur GitHub Pages.
6. Se connecter dans `admin.html`, puis cliquer sur **Publier en direct**.

L’overlay écoute `/liveScores` en temps réel. `scores.json` reste disponible
comme secours si Firebase n’est pas configuré ou temporairement indisponible.

## Matchs archivés et classements

- `admin.html` est le point d’entrée avec trois modules : Matchs, Groupes et
  Publication.
- Un match possède une phase, un groupe éventuel, un tour et une date/heure.
- Décochez **Publié** pour retirer un ancien match du live sans le supprimer.
- Les matchs dépubliés restent enregistrés dans Firebase et peuvent être
  republiés ultérieurement.
- Utilisez **Ajouter un groupe** pour saisir un classement.
- Chaque classement possède également son propre interrupteur **Publié**.
- J, G, N, P, BP, BC et Pts sont calculés automatiquement dès que le statut
  d’un match de groupe est différent de `À venir`.
- Le profil FIFA 2026 applique 3/1/0 et les critères de départage de l’article
  13 : confrontations directes, différence de buts, buts marqués, discipline,
  puis classement FIFA.
- L’overlay affiche uniquement les matchs publiés.
- Un classement est affiché uniquement si son groupe est publié et qu’un match
  publié de la phase de groupes lui est rattaché.
- Tous les matchs de groupe dont le statut diffère de `À venir` sont pris en
  compte dans le classement, y compris les matchs dépubliés.
- La publication/dépublication contrôle uniquement la visibilité dans
  l’overlay.

## Automatisation serveur avec Cloud Functions

Le dossier `functions/` contient une Cloud Function Firebase planifiée :

- source API : `https://worldcup26.ir/get/games` ;
- fréquence : toutes les minutes ;
- comportement : deux passages par minute, un au lancement puis un second après
  30 secondes ;
- cible : `/liveScores` dans Firebase Realtime Database ;
- matchs synchronisés : uniquement les matchs possédant `external_match_id` ;
- matchs dépubliés : synchronisés aussi, car la publication contrôle seulement
  l’affichage overlay ;
- champs mis à jour : score, statut, minute, buteurs, tirs au but et tireurs TAB.

Commandes utiles :

```bash
cd functions
npm install
npm run lint
cd ..
firebase deploy --only functions --project zone-mondial-26
```

Important : Cloud Functions v2 nécessite le plan Firebase Blaze
pay-as-you-go. Si le projet reste en plan gratuit Spark, Firebase refusera
l’activation de certaines APIs nécessaires comme `artifactregistry.googleapis.com`.

Après déploiement, l’admin n’a plus besoin de rester ouvert pour synchroniser les
scores. L’overlay continue simplement d’écouter Firebase en temps réel.

## Alternative gratuite : synchroniseur local PC OBS

Si le projet Firebase reste en plan gratuit Spark, utilisez le dossier
`sync-server/`.

Ce mode lance un petit script Node.js sur le PC OBS :

```text
API World Cup → script local PC OBS → Firebase Realtime Database → overlay OBS
```

Avantages :

- gratuit ;
- synchronisation toutes les 15 à 30 secondes ;
- pas besoin de laisser `admin.html` ouvert ;
- conserve Firebase comme source centrale.

Voir `sync-server/README.md` pour l’installation.

Le synchroniseur local supporte aussi `football-data.org` comme source
optionnelle d’informations complémentaires si vous ajoutez un token dans
`sync-server/.env`.

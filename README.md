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
- Les anciens matchs dépubliés restent pris en compte dans le calcul du
  classement du groupe.

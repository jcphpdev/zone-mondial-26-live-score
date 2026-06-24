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

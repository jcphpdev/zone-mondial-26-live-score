# Zone Mondial 26 — Live Score

- `index.html` : overlay destiné à OBS.
- `admin.html` : interface de mise à jour manuelle des matchs.
- `scores.json` : données affichées par l’overlay.

## Mise à jour manuelle

1. Ouvrir `admin.html` depuis le site publié.
2. Modifier les équipes, les scores, la minute et le statut.
3. Cliquer sur **Télécharger scores.json**.
4. Remplacer `scores.json` dans le dépôt GitHub par le fichier téléchargé.
5. Valider la modification sur GitHub.

L’overlay vérifie automatiquement le fichier toutes les 30 secondes.

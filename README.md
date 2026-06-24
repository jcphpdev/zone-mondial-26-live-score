# Zone Mondial 26 — Live Score

- `index.html` : overlay destiné à OBS.
- `admin.html` : interface de mise à jour manuelle des matchs.
- `scores.json` : données affichées par l’overlay.

## Publication directe depuis l’administration

1. Ouvrir `admin.html` depuis le site publié.
2. Créer un token GitHub fine-grained limité à ce dépôt, avec la permission
   `Contents: Read and write`.
3. Saisir le token et cliquer sur **Vérifier la connexion**.
4. Modifier les équipes, les scores, la minute et le statut.
5. Cliquer sur **Publier sur GitHub**.

Le token est stocké uniquement dans `sessionStorage` et disparaît à la
fermeture de l’onglet. L’overlay vérifie automatiquement le fichier toutes les
30 secondes après sa publication par GitHub Pages.

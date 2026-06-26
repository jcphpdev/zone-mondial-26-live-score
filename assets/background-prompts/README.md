# Background prompts — Zone Mondial 26

Ces prompts servent à générer trois backgrounds différents, un par type de scène :

- `01-match-score-bg.md` → scène score / match
- `02-group-standings-bg.md` → scène classement
- `03-live-updates-bg.md` → scène Live Updates

Après génération, placer les images dans `assets/`, par exemple :

- `assets/bg-scene-match.png`
- `assets/bg-scene-standings.png`
- `assets/bg-scene-live-updates.png`

Ensuite, dans `admin.html` → `Paramètres live`, renseigner les chemins :

- Background score / match : `assets/bg-scene-match.png`
- Background classement : `assets/bg-scene-standings.png`
- Background Live Updates : `assets/bg-scene-live-updates.png`

L’overlay changera alors automatiquement de background selon le type de scène.

# Sync local Zone Mondial 26

Ce dossier contient le synchroniseur gratuit à lancer sur le PC OBS.

## Installation

```powershell
cd D:\Developpement\zone-mondial-26-live-score\sync-server
copy .env.example .env
notepad .env
npm start
```

Dans `.env`, renseigner le même compte administrateur Firebase que celui utilisé
dans `admin.html` :

```env
FIREBASE_EMAIL=votre-email-admin
FIREBASE_PASSWORD=votre-mot-de-passe
SYNC_INTERVAL_SECONDS=30
```

## Fonctionnement

Le script :

1. se connecte à Firebase avec email/mot de passe ;
2. lit `/liveScores` ;
3. récupère les matchs depuis les sources API activées ;
4. applique les scores avec la priorité `live-score-api.com` → `football-data.org` → `worldcup26.ir` ;
5. écrit les changements dans Firebase Realtime Database.

Seuls les matchs publiés sont interrogés par les API pour limiter les requêtes.
La publication reste uniquement un filtre d’affichage dans l’overlay.

## Source prioritaire live-score-api.com

`live-score-api.com` est la source prioritaire pour les scores live. Selon sa
documentation, l’endpoint live renvoie uniquement les matchs en cours et les
matchs terminés récemment.

Activer dans `.env` :

```env
LIVE_SCORE_API_ENABLED=true
LIVE_SCORE_API_KEY=votre-key
LIVE_SCORE_API_SECRET=votre-secret
LIVE_SCORE_API_COMPETITION_IDS=362
LIVE_SCORE_API_FIXTURE_COMPETITION_IDS=362
LIVE_SCORE_API_LANG=
LIVE_SCORE_API_EVENTS_ENABLED=true
LIVE_SCORE_API_LINEUPS_ENABLED=true
```

Dans `admin.html`, chaque match peut être lié avec :

- `ID match LiveScore` : l’identifiant du match live ;
- `ID fixture LiveScore` : l’identifiant calendrier, différent de l’ID match.

Si aucun ID LiveScore n’est saisi, le serveur essaie aussi de faire un matching
simple par noms d’équipes dans le flux live.

Pour afficher les matchs actuellement présents dans le flux LiveScore et copier
les bons identifiants :

```powershell
npm run list:live-score
```

Pour afficher les fixtures de la compétition World Cup LiveScore (`362`) :

```powershell
npm run list:live-score-fixtures
```

Ou pour une autre compétition :

```powershell
npm run list:live-score-fixtures -- 362
```

Le serveur peut aussi utiliser automatiquement ces fixtures pour renseigner
`live_score_fixture_id` sur les matchs publiés à venir, si
`LIVE_SCORE_API_FIXTURE_COMPETITION_IDS` est configuré.

Quand `LIVE_SCORE_API_EVENTS_ENABLED=true`, le serveur interroge aussi
`/matches/events.json` pour chaque match publié lié à un `ID match LiveScore`.
Ces événements alimentent automatiquement :

- `timeline_events` : buts, cartons, remplacements, penalties ratés ;
- `home_scorers` / `away_scorers` : buteurs affichés dans les scènes ;
- les informations de score/statut si la réponse événement contient le bloc
  `match`.

L’endpoint events utilise l’ID match LiveScore, pas l’ID fixture. Pour les
matchs à venir, la liste peut être vide au début : elle se remplira pendant le
match.

Quand `LIVE_SCORE_API_LINEUPS_ENABLED=true`, le serveur interroge aussi
`/matches/lineups.json` pour chaque match publié lié à un `ID match LiveScore`.
Les titulaires récupérés remplissent automatiquement :

- `home_lineup` ;
- `away_lineup`.

Ces champs sont utilisés par les scènes “Avant-match” et “Compositions”.
Comme pour les événements, cet endpoint utilise l’ID match LiveScore.
Selon la compétition, LiveScore peut renvoyer une composition vide tant que les
feuilles de match officielles ne sont pas publiées.

Si le log affiche par exemple `LiveScore : 10 match(s)` mais
`LiveScore 0` dans les matchs liés, cela signifie que l’API renvoie bien des
matchs live, mais pas les matchs publiés dans l’overlay — ou que leurs noms ne
correspondent pas assez pour le matching automatique. Dans ce cas, copiez
`ID_Match` ou `ID_Fixture` dans la fiche du match.

## Source optionnelle football-data.org

Le script peut aussi utiliser `football-data.org` comme source d’informations
complémentaires : stade, arbitre, statut brut, stage, groupe et identifiant
football-data.

Créer un token sur :

```text
https://www.football-data.org/client/register
```

Puis activer dans `.env` :

```env
FOOTBALL_DATA_ENABLED=true
FOOTBALL_DATA_API_TOKEN=votre-token
FOOTBALL_DATA_COMPETITIONS=WC
FOOTBALL_DATA_LOOKBACK_DAYS=2
FOOTBALL_DATA_LOOKAHEAD_DAYS=7
```

`football-data.org` sert désormais de fallback/enrichissement quand LiveScore ne
renvoie pas le match. Pour utiliser explicitement football-data comme source
score d’un match, il faut définir sur ce match :

```json
{
  "external_api": "football-data",
  "external_match_id": "ID_DU_MATCH_FOOTBALL_DATA"
}
```

Le header utilisé est `X-Auth-Token`, conformément à la documentation officielle
football-data.org.

Pour trouver les IDs officiels à copier dans `admin.html`, lancer :

```powershell
npm run list:football-data
```

La colonne `ID` correspond au champ `ID football-data` dans l’admin.

Si `worldcup26.ir` est temporairement indisponible, par exemple erreur `502`,
vous pouvez le désactiver temporairement :

```env
WORLD_CUP_ENABLED=false
FOOTBALL_DATA_ENABLED=true
```

Le script continuera alors avec `football-data.org` si un token est configuré.
S’il n’y a aucune source disponible, il n’arrête pas le serveur : il écrit un
état `source-error` dans Firebase et retente au cycle suivant.

## Test sans écrire

Mettre dans `.env` :

```env
DRY_RUN=true
```

Puis lancer :

```powershell
npm start
```

## Lancement automatique Windows

Créer un fichier `start-sync.bat` sur le Bureau :

```bat
cd /d D:\Developpement\zone-mondial-26-live-score\sync-server
npm start
```

Ensuite, placer un raccourci vers ce fichier dans :

```text
shell:startup
```

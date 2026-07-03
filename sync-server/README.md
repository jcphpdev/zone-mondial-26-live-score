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
3. récupère les matchs depuis `https://worldcup26.ir/get/games` ;
4. met à jour tous les matchs qui possèdent `external_match_id` ;
5. écrit les changements dans Firebase Realtime Database.

Les matchs dépubliés sont aussi synchronisés. La publication reste uniquement un
filtre d’affichage dans l’overlay.

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

Par défaut, `worldcup26.ir` reste la source principale pour les scores live.
`football-data.org` enrichit seulement les infos. Pour utiliser explicitement
football-data comme source score d’un match, il faut définir sur ce match :

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

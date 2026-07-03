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

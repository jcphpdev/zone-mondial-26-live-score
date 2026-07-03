"use strict";

const fs = require("node:fs");
const path = require("node:path");

const ENV_PATH = path.join(__dirname, ".env");
const DEFAULTS = {
  FIREBASE_API_KEY: "AIzaSyDIjQ5lfPcahptcaihe099tIYOCJ9IUnFk",
  FIREBASE_DATABASE_URL: "https://zone-mondial-26-default-rtdb.europe-west1.firebasedatabase.app",
  WORLD_CUP_API_URL: "https://worldcup26.ir/get/games",
  SYNC_INTERVAL_SECONDS: "30",
  DRY_RUN: "false"
};

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {};
  return fs.readFileSync(filePath, "utf8")
    .split(/\r?\n/)
    .reduce((env, line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) return env;
      const separator = trimmed.indexOf("=");
      if (separator < 0) return env;
      const key = trimmed.slice(0, separator).trim();
      const rawValue = trimmed.slice(separator + 1).trim();
      env[key] = rawValue.replace(/^["']|["']$/g, "");
      return env;
    }, {});
}

const env = { ...DEFAULTS, ...loadEnvFile(ENV_PATH), ...process.env };

const value = (input, fallback = "") => {
  if (input === undefined || input === null || input === "null") return fallback;
  return String(input);
};

const scoreNumber = input => {
  const parsed = Number.parseInt(value(input, "0"), 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
};

const intervalSeconds = Math.max(15, Math.min(120, Number.parseInt(env.SYNC_INTERVAL_SECONDS, 10) || 30));
const dryRun = value(env.DRY_RUN).toLowerCase() === "true";
let authSession = null;
let syncRunning = false;

function log(message, meta = undefined) {
  const time = new Intl.DateTimeFormat("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  }).format(new Date());
  if (meta) console.log(`[${time}] ${message}`, meta);
  else console.log(`[${time}] ${message}`);
}

function requireConfig() {
  const missing = ["FIREBASE_API_KEY", "FIREBASE_DATABASE_URL", "FIREBASE_EMAIL", "FIREBASE_PASSWORD"]
    .filter(key => !value(env[key]).trim());
  if (missing.length) {
    throw new Error(`Configuration manquante dans sync-server/.env : ${missing.join(", ")}`);
  }
}

async function firebaseSignIn() {
  const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${env.FIREBASE_API_KEY}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: env.FIREBASE_EMAIL,
      password: env.FIREBASE_PASSWORD,
      returnSecureToken: true
    })
  });
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(`Connexion Firebase impossible : ${payload?.error?.message || response.status}`);
  }
  authSession = {
    idToken: payload.idToken,
    refreshToken: payload.refreshToken,
    expiresAt: Date.now() + (Number(payload.expiresIn || 3600) - 90) * 1000
  };
  log(`Connecté à Firebase avec ${env.FIREBASE_EMAIL}.`);
}

async function firebaseToken() {
  if (!authSession || Date.now() >= authSession.expiresAt) {
    await firebaseSignIn();
  }
  return authSession.idToken;
}

function firebaseUrl(pathname = "liveScores.json") {
  const base = value(env.FIREBASE_DATABASE_URL).replace(/\/$/, "");
  return `${base}/${pathname}`;
}

async function firebaseReadLiveScores() {
  const token = await firebaseToken();
  const response = await fetch(`${firebaseUrl("liveScores.json")}?auth=${encodeURIComponent(token)}`, {
    cache: "no-store"
  });
  if (!response.ok) throw new Error(`Lecture Firebase impossible (${response.status})`);
  return response.json();
}

async function firebasePatchLiveScores(patch) {
  if (dryRun) {
    log("DRY_RUN actif : écriture Firebase ignorée.", patch.automation || patch);
    return;
  }
  const token = await firebaseToken();
  const response = await fetch(`${firebaseUrl("liveScores.json")}?auth=${encodeURIComponent(token)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch)
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Écriture Firebase impossible (${response.status}) : ${body}`);
  }
}

function apiStatus(game) {
  const elapsed = value(game.time_elapsed).trim().toLowerCase();
  const status = value(game.status || game.match_status || game.state).trim().toLowerCase();
  const statusText = `${elapsed} ${status}`;
  const finished = value(game.finished).toUpperCase() === "TRUE";
  if (finished || ["finished", "ft", "fulltime", "full-time", "full time"].some(item => statusText.includes(item))) return "Terminé";
  if (["notstarted", "not_started", "not started", "scheduled", "fixture"].some(item => statusText.includes(item))) return "À venir";
  if (["halftime", "half-time", "half time", "ht", "mi-temps"].some(item => statusText.includes(item))) return "Mi-temps";
  if (["postponed", "delayed", "suspended"].some(item => statusText.includes(item))) return "Reporté";
  return "En direct";
}

function apiMinute(game) {
  const status = apiStatus(game);
  const elapsed = value(game.time_elapsed).trim().toLowerCase();
  if (status === "Terminé") return "FT";
  if (status === "À venir") return "";
  if (status === "Mi-temps") return "45'";
  const numeric = Number.parseInt(elapsed, 10);
  return Number.isFinite(numeric) ? `${numeric}'` : elapsed || "live";
}

function formatApiScorerEntry(entry) {
  if (entry === undefined || entry === null || entry === "null") return "";
  if (typeof entry === "string" || typeof entry === "number") return String(entry).trim();
  const name = value(
    entry.name
    || entry.player
    || entry.player_name
    || entry.scorer
    || entry.scorer_name
    || entry.label
  ).trim();
  const minute = value(entry.minute || entry.time || entry.time_elapsed || entry.elapsed).trim();
  if (!name) return "";
  return minute ? `${name} ${minute.replace(/'$/, "")}'` : name;
}

function formatApiScorers(input) {
  if (input === undefined || input === null || input === "null") return "";
  if (Array.isArray(input)) {
    return input.map(formatApiScorerEntry).filter(Boolean).join(" • ");
  }
  if (typeof input === "object") {
    return Object.values(input).map(formatApiScorerEntry).filter(Boolean).join(" • ");
  }
  return String(input)
    .trim()
    .replace(/^\{|\}$/g, "")
    .split(/","|',\s*'|,\s*(?=[A-ZÀ-Ý])/)
    .map(item => item.replace(/^["']|["']$/g, "").trim())
    .filter(Boolean)
    .join(" • ");
}

function apiScorers(game, side) {
  const fields = [
    `${side}_scorers`,
    `${side}_goals`,
    `${side}_goal_scorers`,
    `${side}_goalscorers`,
    `${side}_goal_scorers_names`,
    `${side}_scorer_names`
  ];
  for (const field of fields) {
    const scorers = formatApiScorers(game[field]);
    if (scorers) return scorers;
  }
  return "";
}

function apiMatchPatch(game) {
  return {
    home_score: scoreNumber(game.home_score),
    away_score: scoreNumber(game.away_score),
    home_penalty_score: scoreNumber(game.home_penalty_score),
    away_penalty_score: scoreNumber(game.away_penalty_score),
    home_scorers: apiScorers(game, "home"),
    away_scorers: apiScorers(game, "away"),
    home_penalty_scorers: value(game.home_penalty_scorers),
    away_penalty_scorers: value(game.away_penalty_scorers),
    home_penalty_misses: value(game.home_penalty_misses),
    away_penalty_misses: value(game.away_penalty_misses),
    status: apiStatus(game),
    minute: apiMinute(game)
  };
}

function hasChanged(match, patch) {
  return Object.entries(patch).some(([key, next]) => {
    if (typeof next === "number") return scoreNumber(match[key]) !== next;
    return value(match[key]) !== value(next);
  });
}

async function fetchApiGames() {
  const response = await fetch(env.WORLD_CUP_API_URL, { cache: "no-store" });
  if (!response.ok) throw new Error(`API World Cup indisponible (${response.status})`);
  const payload = await response.json();
  const games = Array.isArray(payload?.games) ? payload.games : [];
  if (!games.length) throw new Error("Aucun match reçu depuis l’API.");
  return games;
}

async function syncOnce() {
  const [data, games] = await Promise.all([firebaseReadLiveScores(), fetchApiGames()]);
  if (!data || !Array.isArray(data.matches)) {
    throw new Error("Firebase /liveScores ne contient pas de tableau matches.");
  }

  const gameById = new Map(games.map(game => [value(game.id), game]));
  let linked = 0;
  let changed = 0;
  const changedMatches = [];

  const matches = data.matches.map(match => {
    const apiId = value(match.external_match_id).trim();
    if (!apiId) return match;
    const game = gameById.get(apiId);
    if (!game) return match;
    linked += 1;
    const patch = apiMatchPatch(game);
    if (!hasChanged(match, patch)) return match;
    changed += 1;
    changedMatches.push(`${match.home || "Équipe 1"} - ${match.away || "Équipe 2"} → ${patch.home_score}-${patch.away_score} / ${patch.status}`);
    return { ...match, ...patch };
  });

  const now = new Date().toISOString();
  const automation = {
    enabled: true,
    mode: "local-pc",
    source: "worldcup26.ir",
    last_sync_at: now,
    last_result: changed ? "updated" : "no-change",
    linked_matches: linked,
    api_matches: games.length,
    interval_seconds: intervalSeconds,
    dry_run: dryRun,
    changed_matches: changedMatches.slice(0, 8)
  };

  await firebasePatchLiveScores(changed ? { matches, updated_at: now, automation } : { automation });
  log(changed
    ? `Synchronisation appliquée : ${changed} match(s) mis à jour.`
    : `Aucun changement. Matchs liés : ${linked}/${games.length}.`);
  changedMatches.forEach(item => log(`  - ${item}`));
}

async function runLoop() {
  if (syncRunning) return;
  syncRunning = true;
  try {
    await syncOnce();
  } catch (error) {
    log(`Erreur : ${error.message}`);
  } finally {
    syncRunning = false;
  }
}

async function main() {
  requireConfig();
  log(`Serveur local Zone Mondial 26 démarré. Fréquence : ${intervalSeconds}s${dryRun ? " / DRY_RUN" : ""}.`);
  await runLoop();
  setInterval(runLoop, intervalSeconds * 1000);
}

main().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});

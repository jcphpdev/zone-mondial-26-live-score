"use strict";

const { initializeApp } = require("firebase-admin/app");
const { getDatabase } = require("firebase-admin/database");
const { logger } = require("firebase-functions");
const { onSchedule } = require("firebase-functions/v2/scheduler");

initializeApp();

const DATABASE_PATH = "liveScores";
const WORLD_CUP_API_URL = "https://worldcup26.ir/get/games";
const REGION = "europe-west1";
const TIME_ZONE = "Africa/Casablanca";
const SECOND_PASS_DELAY_MS = 30_000;

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

const value = (input, fallback = "") => {
  if (input === undefined || input === null || input === "null") return fallback;
  return String(input);
};

const scoreNumber = input => {
  const parsed = Number.parseInt(value(input, "0"), 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
};

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
  const response = await fetch(WORLD_CUP_API_URL, { cache: "no-store" });
  if (!response.ok) throw new Error(`World Cup API HTTP ${response.status}`);
  const payload = await response.json();
  const games = Array.isArray(payload?.games) ? payload.games : [];
  if (!games.length) throw new Error("World Cup API returned no games.");
  return games;
}

async function syncWorldCupScoresPass(passLabel = "single") {
  const [snapshot, games] = await Promise.all([
    getDatabase().ref(DATABASE_PATH).get(),
    fetchApiGames()
  ]);
  const data = snapshot.val();
  if (!data || !Array.isArray(data.matches)) {
    logger.warn("No liveScores.matches array found; sync skipped.", { passLabel });
    return { changed: 0, linked: 0, total: 0 };
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
    changedMatches.push({
      id: match.id || "",
      external_match_id: apiId,
      home: match.home || "",
      away: match.away || "",
      status: patch.status,
      score: `${patch.home_score}-${patch.away_score}`
    });
    return { ...match, ...patch };
  });

  if (!changed) {
    await getDatabase().ref(`${DATABASE_PATH}/automation`).set({
      enabled: true,
      source: "worldcup26.ir",
      last_sync_at: new Date().toISOString(),
      last_pass: passLabel,
      last_result: "no-change",
      linked_matches: linked,
      api_matches: games.length
    });
    logger.info("World Cup sync completed without changes.", { passLabel, linked, apiMatches: games.length });
    return { changed, linked, total: games.length };
  }

  await getDatabase().ref(DATABASE_PATH).update({
    matches,
    updated_at: new Date().toISOString(),
    automation: {
      enabled: true,
      source: "worldcup26.ir",
      last_sync_at: new Date().toISOString(),
      last_pass: passLabel,
      last_result: "updated",
      linked_matches: linked,
      api_matches: games.length,
      changed_matches: changedMatches
    }
  });
  logger.info("World Cup sync applied changes.", { passLabel, changed, linked, changedMatches });
  return { changed, linked, total: games.length };
}

exports.syncWorldCupScores = onSchedule({
  schedule: "every 1 minutes",
  timeZone: TIME_ZONE,
  region: REGION,
  memory: "256MiB",
  timeoutSeconds: 90
}, async () => {
  const first = await syncWorldCupScoresPass("minute-start");
  await sleep(SECOND_PASS_DELAY_MS);
  const second = await syncWorldCupScoresPass("minute-plus-30s");
  logger.info("Scheduled World Cup sync finished.", { first, second });
});

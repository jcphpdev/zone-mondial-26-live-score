"use strict";

const fs = require("node:fs");
const path = require("node:path");

const ENV_PATH = path.join(__dirname, ".env");
const DEFAULTS = {
  LIVE_SCORE_API_BASE_URL: "https://livescore-api.com/api-client",
  LIVE_SCORE_API_COMPETITION_IDS: "",
  LIVE_SCORE_API_LANG: ""
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

function value(input, fallback = "") {
  return input === undefined || input === null ? fallback : String(input);
}

function scoreLabel(match) {
  return value(match?.scores?.score, "-") || "-";
}

function matchDateLabel(match) {
  const added = value(match.added || match.last_changed).trim();
  if (!added) return "";
  const date = new Date(`${added.replace(" ", "T")}Z`);
  if (Number.isNaN(date.getTime())) return added;
  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

async function fetchLiveScoreMatches() {
  const key = value(env.LIVE_SCORE_API_KEY).trim();
  const secret = value(env.LIVE_SCORE_API_SECRET).trim();
  if (!key || !secret) {
    throw new Error("LIVE_SCORE_API_KEY ou LIVE_SCORE_API_SECRET est vide. Ajoutez-les dans sync-server/.env.");
  }

  const base = value(env.LIVE_SCORE_API_BASE_URL).replace(/\/$/, "");
  const url = new URL(`${base}/matches/live.json`);
  url.searchParams.set("key", key);
  url.searchParams.set("secret", secret);
  const competitionIds = value(env.LIVE_SCORE_API_COMPETITION_IDS).trim();
  if (competitionIds) url.searchParams.set("competition_id", competitionIds);
  const lang = value(env.LIVE_SCORE_API_LANG).trim();
  if (lang) url.searchParams.set("lang", lang);

  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`live-score-api.com HTTP ${response.status}: ${body.slice(0, 200)}`);
  }
  const payload = await response.json();
  if (payload?.success === false) {
    throw new Error(`live-score-api.com: ${value(payload?.error || payload?.message, "réponse non réussie")}`);
  }
  return Array.isArray(payload?.data?.match) ? payload.data.match : [];
}

async function main() {
  const matches = await fetchLiveScoreMatches();
  console.log(`live-score-api.com — ${matches.length} match(s) dans le flux live`);
  console.log("Copiez ID_Match dans admin.html > match > ID match LiveScore.");
  console.log("Copiez ID_Fixture dans admin.html > match > ID fixture LiveScore si disponible.");
  console.log("");
  console.table(matches.map(match => ({
    ID_Match: match.id || "",
    ID_Fixture: match.fixture_id || "",
    Ajout: matchDateLabel(match),
    Statut: match.status || "",
    Minute: match.time || "",
    Competition: match.competition?.name || "",
    Domicile: match.home?.name || "",
    Score: scoreLabel(match),
    Exterieur: match.away?.name || "",
    Stade: match.location || ""
  })));
}

main().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});

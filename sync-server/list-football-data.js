"use strict";

const fs = require("node:fs");
const path = require("node:path");

const ENV_PATH = path.join(__dirname, ".env");
const DEFAULTS = {
  FOOTBALL_DATA_COMPETITIONS: "WC",
  FOOTBALL_DATA_LOOKBACK_DAYS: "7",
  FOOTBALL_DATA_LOOKAHEAD_DAYS: "14"
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

function isoDate(date) {
  return date.toISOString().slice(0, 10);
}

function addDays(date, days) {
  const copy = new Date(date);
  copy.setUTCDate(copy.getUTCDate() + days);
  return copy;
}

function formatDate(input) {
  const date = new Date(input);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

function scoreLabel(match) {
  const score = match.score || {};
  const home = score.fullTime?.home ?? score.regularTime?.home ?? "";
  const away = score.fullTime?.away ?? score.regularTime?.away ?? "";
  return home === "" || away === "" ? "-" : `${home}-${away}`;
}

async function fetchCompetitionMatches(competition, dateFrom, dateTo) {
  const url = new URL(`https://api.football-data.org/v4/competitions/${encodeURIComponent(competition)}/matches`);
  url.searchParams.set("dateFrom", dateFrom);
  url.searchParams.set("dateTo", dateTo);
  const response = await fetch(url, {
    headers: {
      "X-Auth-Token": env.FOOTBALL_DATA_API_TOKEN,
      "X-Unfold-Goals": "true"
    },
    cache: "no-store"
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`football-data.org ${competition} HTTP ${response.status}: ${body.slice(0, 200)}`);
  }
  const payload = await response.json();
  return Array.isArray(payload.matches) ? payload.matches : [];
}

async function main() {
  if (!value(env.FOOTBALL_DATA_API_TOKEN).trim()) {
    throw new Error("FOOTBALL_DATA_API_TOKEN est vide. Ajoutez votre token dans sync-server/.env.");
  }

  const now = new Date();
  const dateFrom = isoDate(addDays(now, -Math.max(0, Number.parseInt(env.FOOTBALL_DATA_LOOKBACK_DAYS, 10) || 0)));
  const dateTo = isoDate(addDays(now, Math.max(1, Number.parseInt(env.FOOTBALL_DATA_LOOKAHEAD_DAYS, 10) || 14)));
  const competitions = value(env.FOOTBALL_DATA_COMPETITIONS, "WC")
    .split(",")
    .map(item => item.trim())
    .filter(Boolean);

  const matches = [];
  for (const competition of competitions) {
    matches.push(...await fetchCompetitionMatches(competition, dateFrom, dateTo));
  }

  console.log(`football-data.org — ${matches.length} match(s) du ${dateFrom} au ${dateTo}`);
  console.log("Copiez la valeur ID dans admin.html > match > ID football-data.");
  console.log("");
  console.table(matches.map(match => ({
    ID: match.id,
    Date: formatDate(match.utcDate),
    Statut: match.status,
    Phase: match.stage || "",
    Groupe: match.group || "",
    Domicile: match.homeTeam?.name || match.homeTeam?.shortName || "",
    Score: scoreLabel(match),
    Exterieur: match.awayTeam?.name || match.awayTeam?.shortName || ""
  })));
}

main().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});

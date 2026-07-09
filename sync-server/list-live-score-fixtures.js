"use strict";

const fs = require("node:fs");
const path = require("node:path");

const ENV_PATH = path.join(__dirname, ".env");
const DEFAULTS = {
  LIVE_SCORE_API_BASE_URL: "https://livescore-api.com/api-client",
  LIVE_SCORE_API_COMPETITION_IDS: "362",
  LIVE_SCORE_API_FIXTURE_COMPETITION_IDS: "",
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

function formatFixtureDate(fixture) {
  const raw = `${value(fixture.date)}T${value(fixture.time, "00:00:00")}Z`;
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return `${value(fixture.date)} ${value(fixture.time)}`.trim();
  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

async function fetchFixtures(competitionId) {
  const key = value(env.LIVE_SCORE_API_KEY).trim();
  const secret = value(env.LIVE_SCORE_API_SECRET).trim();
  if (!key || !secret) {
    throw new Error("LIVE_SCORE_API_KEY ou LIVE_SCORE_API_SECRET est vide. Ajoutez-les dans sync-server/.env.");
  }

  const base = value(env.LIVE_SCORE_API_BASE_URL).replace(/\/$/, "");
  const url = new URL(`${base}/fixtures/matches.json`);
  url.searchParams.set("key", key);
  url.searchParams.set("secret", secret);
  url.searchParams.set("competition_id", competitionId);
  const lang = value(env.LIVE_SCORE_API_LANG).trim();
  if (lang) url.searchParams.set("lang", lang);

  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`live-score-api.com fixtures ${competitionId} HTTP ${response.status}: ${body.slice(0, 200)}`);
  }
  const payload = await response.json();
  if (payload?.success === false) {
    throw new Error(`live-score-api.com fixtures ${competitionId}: ${value(payload?.error || payload?.message, "réponse non réussie")}`);
  }
  return Array.isArray(payload?.data?.fixtures) ? payload.data.fixtures : [];
}

async function main() {
  const competitionIds = (process.argv[2] || value(env.LIVE_SCORE_API_FIXTURE_COMPETITION_IDS || env.LIVE_SCORE_API_COMPETITION_IDS, "362"))
    .split(",")
    .map(item => item.trim())
    .filter(Boolean);
  const fixtures = [];
  for (const competitionId of competitionIds) {
    fixtures.push(...await fetchFixtures(competitionId));
  }

  console.log(`live-score-api.com fixtures — ${fixtures.length} match(s)`);
  console.log("Copiez ID_Fixture dans admin.html > match > ID fixture LiveScore.");
  console.log("");
  console.table(fixtures.map(fixture => ({
    ID_Fixture: fixture.id || "",
    Date: formatFixtureDate(fixture),
    Round: fixture.round || "",
    Competition: fixture.competition?.name || fixture.competition_id || "",
    Domicile: fixture.home_translations?.fr || fixture.home_name || "",
    Exterieur: fixture.away_translations?.fr || fixture.away_name || "",
    Stade: fixture.location || ""
  })));
}

main().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});

"use strict";

const fs = require("node:fs");
const path = require("node:path");

const ENV_PATH = path.join(__dirname, ".env");
const DEFAULTS = {
  FIREBASE_API_KEY: "AIzaSyDIjQ5lfPcahptcaihe099tIYOCJ9IUnFk",
  FIREBASE_DATABASE_URL: "https://zone-mondial-26-default-rtdb.europe-west1.firebasedatabase.app",
  WORLD_CUP_ENABLED: "true",
  WORLD_CUP_API_URL: "https://worldcup26.ir/get/games",
  LIVE_SCORE_API_ENABLED: "false",
  LIVE_SCORE_API_BASE_URL: "https://livescore-api.com/api-client",
  LIVE_SCORE_API_COMPETITION_IDS: "",
  LIVE_SCORE_API_FIXTURE_COMPETITION_IDS: "",
  LIVE_SCORE_API_LANG: "",
  LIVE_SCORE_API_EVENTS_ENABLED: "true",
  LIVE_SCORE_API_LINEUPS_ENABLED: "true",
  FOOTBALL_DATA_ENABLED: "false",
  FOOTBALL_DATA_COMPETITIONS: "WC",
  FOOTBALL_DATA_LOOKBACK_DAYS: "2",
  FOOTBALL_DATA_LOOKAHEAD_DAYS: "7",
  FOOTBALL_DATA_RETRY_ATTEMPTS: "3",
  FOOTBALL_DATA_RETRY_DELAY_MS: "1200",
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
const worldCupEnabled = value(env.WORLD_CUP_ENABLED, "true").toLowerCase() !== "false";
const liveScoreApiEnabled = value(env.LIVE_SCORE_API_ENABLED).toLowerCase() === "true";
const liveScoreApiEventsEnabled = value(env.LIVE_SCORE_API_EVENTS_ENABLED, "true").toLowerCase() !== "false";
const liveScoreApiLineupsEnabled = value(env.LIVE_SCORE_API_LINEUPS_ENABLED, "true").toLowerCase() !== "false";
const footballDataEnabled = value(env.FOOTBALL_DATA_ENABLED).toLowerCase() === "true";
const footballDataRetryAttempts = Math.max(1, Math.min(5, Number.parseInt(env.FOOTBALL_DATA_RETRY_ATTEMPTS, 10) || 3));
const footballDataRetryDelayMs = Math.max(250, Math.min(5000, Number.parseInt(env.FOOTBALL_DATA_RETRY_DELAY_MS, 10) || 1200));
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

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchWithRetry(url, options = {}, label = "requête", retryOptions = {}) {
  const attempts = Math.max(1, Number.parseInt(retryOptions.attempts, 10) || 1);
  const delayMs = Math.max(0, Number.parseInt(retryOptions.delayMs, 10) || 0);
  let lastError = null;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(url, options);
      if (response.ok || ![408, 425, 429, 500, 502, 503, 504].includes(response.status) || attempt === attempts) {
        return response;
      }
      lastError = new Error(`${label} HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
      if (attempt === attempts) break;
    }

    await sleep(delayMs * attempt);
  }

  throw lastError || new Error(`${label} indisponible`);
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

function parseScoreLine(scoreLine) {
  const match = value(scoreLine).match(/(-?\d+)\s*[-:]\s*(-?\d+)/);
  if (!match) return { home: 0, away: 0 };
  return {
    home: scoreNumber(match[1]),
    away: scoreNumber(match[2])
  };
}

function liveScoreStatus(match) {
  const status = value(match.status).trim().toUpperCase();
  if (["NOT STARTED"].includes(status)) return "À venir";
  if (["HALF TIME BREAK"].includes(status) || value(match.time).trim().toUpperCase() === "HT") return "Mi-temps";
  if (["FINISHED"].includes(status) || ["FT", "AET", "AP"].includes(value(match.time).trim().toUpperCase())) return "Terminé";
  if (["INSUFFICIENT DATA"].includes(status)) return "En direct";
  return "En direct";
}

function liveScoreMinute(match) {
  const status = liveScoreStatus(match);
  const time = value(match.time).trim();
  if (status === "Terminé") return time || "FT";
  if (status === "À venir") return "";
  if (status === "Mi-temps") return "45'";
  const numeric = Number.parseInt(time, 10);
  return Number.isFinite(numeric) ? `${numeric}'` : "live";
}

function liveScoreTeamName(match, side) {
  return value(match?.[side]?.name);
}

function liveScoreEventMinuteValue(event, fallback = 0) {
  const minute = Number.parseInt(event?.time ?? event?.minute, 10);
  return Number.isFinite(minute) ? minute : fallback;
}

function liveScoreEventMinuteLabel(event, fallback = "") {
  const minute = Number.parseInt(event?.time ?? event?.minute, 10);
  return Number.isFinite(minute) ? String(minute) : fallback;
}

function liveScoreEventTeam(event, localMatch) {
  if (event?.is_home) return value(localMatch.home, "Équipe 1");
  if (event?.is_away) return value(localMatch.away, "Équipe 2");
  return "";
}

function liveScoreEventType(event) {
  const type = value(event?.event || event?.label).toUpperCase();
  if (["GOAL", "GOAL_PENALTY", "OWN_GOAL"].includes(type)) return "goal";
  if (type === "YELLOW_CARD") return "yellow-card";
  if (["RED_CARD", "YELLOW_RED_CARD"].includes(type)) return "red-card";
  if (type === "SUBSTITUTION") return "substitution";
  if (type === "MISSED_PENALTY") return "penalty-missed";
  return "event";
}

function liveScoreEventText(event, localMatch) {
  const rawType = value(event?.event || event?.label).toUpperCase();
  const player = value(event?.player?.name, "Joueur");
  const info = value(event?.info?.name).trim();
  const team = liveScoreEventTeam(event, localMatch);
  const teamSuffix = team ? ` (${team})` : "";

  if (rawType === "GOAL_PENALTY") return `But sur penalty : ${player}${teamSuffix}`;
  if (rawType === "OWN_GOAL") return `But contre son camp : ${player}${teamSuffix}`;
  if (rawType === "GOAL") return `But : ${player}${teamSuffix}`;
  if (rawType === "YELLOW_CARD") return `Carton jaune : ${player}${teamSuffix}`;
  if (rawType === "RED_CARD") return `Carton rouge : ${player}${teamSuffix}`;
  if (rawType === "YELLOW_RED_CARD") return `Deuxième jaune / rouge : ${player}${teamSuffix}`;
  if (rawType === "SUBSTITUTION") {
    return info
      ? `Changement : ${player} remplace ${info}${teamSuffix}`
      : `Changement : ${player}${teamSuffix}`;
  }
  if (rawType === "MISSED_PENALTY") return `Penalty raté : ${player}${teamSuffix}`;
  return `${value(event?.label || event?.event, "Événement")} : ${player}${teamSuffix}`;
}

function compactLiveScoreEvents(events, localMatch) {
  return (Array.isArray(events) ? events : [])
    .map((event, index) => ({
      minute: liveScoreEventMinuteLabel(event),
      sort: liveScoreEventMinuteValue(event, index) + ((Number.parseInt(event?.sort, 10) || index) / 1000),
      type: liveScoreEventType(event),
      team: liveScoreEventTeam(event, localMatch),
      player: value(event?.player?.name),
      text: liveScoreEventText(event, localMatch)
    }))
    .filter(event => event.minute && event.text)
    .sort((left, right) => left.sort - right.sort)
    .map(({ sort, ...event }) => event);
}

function liveScoreScorersFromEvents(events, side) {
  return (Array.isArray(events) ? events : [])
    .filter(event => {
      const eventType = value(event?.event).toUpperCase();
      if (!["GOAL", "GOAL_PENALTY", "OWN_GOAL"].includes(eventType)) return false;
      if (eventType === "OWN_GOAL") return side === "home" ? event?.is_away : event?.is_home;
      return side === "home" ? event?.is_home : event?.is_away;
    })
    .map(event => {
      const eventType = value(event?.event).toUpperCase();
      const player = value(event?.player?.name).trim();
      if (!player) return "";
      const minute = liveScoreEventMinuteLabel(event);
      const tag = eventType === "GOAL_PENALTY"
        ? " p."
        : (eventType === "OWN_GOAL" ? " c.s.c." : "");
      return `${player}${tag}${minute ? ` ${minute}'` : ""}`;
    })
    .filter(Boolean)
    .join(" • ");
}

function liveScoreEventsPatch(eventPayload, localMatch) {
  if (!eventPayload || typeof eventPayload !== "object") return {};
  const apiMatch = eventPayload.match || {};
  const events = Array.isArray(eventPayload.event) ? eventPayload.event : [];
  const timelineEvents = compactLiveScoreEvents(events, localMatch);
  const patch = {
    ...(apiMatch?.id ? liveScorePatch(apiMatch) : {}),
    live_score_events_last_changed: value(apiMatch.last_changed || new Date().toISOString())
  };
  if (timelineEvents.length) patch.timeline_events = timelineEvents;
  const homeScorers = liveScoreScorersFromEvents(events, "home");
  const awayScorers = liveScoreScorersFromEvents(events, "away");
  if (homeScorers) patch.home_scorers = homeScorers;
  if (awayScorers) patch.away_scorers = awayScorers;
  return patch;
}

function compactLiveScoreLineupPlayers(players) {
  return (Array.isArray(players) ? players : [])
    .filter(player => value(player?.substitution).trim() !== "1")
    .slice(0, 11)
    .map(player => ({
      id: value(player.id),
      name: value(player.name),
      shirtNumber: value(player.shirt_number || player.shirtNumber || player.number),
      position: value(player.position || "Titulaire")
    }))
    .filter(player => player.name);
}

function liveScoreLineupsPatch(lineupPayload) {
  if (!lineupPayload || typeof lineupPayload !== "object") return {};
  const lineup = lineupPayload.lineup || lineupPayload;
  const home = lineup.home || {};
  const away = lineup.away || {};
  const homeLineup = compactLiveScoreLineupPlayers(home.players);
  const awayLineup = compactLiveScoreLineupPlayers(away.players);
  const patch = {};
  if (homeLineup.length) patch.home_lineup = homeLineup;
  if (awayLineup.length) patch.away_lineup = awayLineup;
  if (home.team?.location || home.team?.stadium) patch.venue = value(home.team.location || home.team.stadium);
  if (!patch.venue && (away.team?.location || away.team?.stadium)) patch.venue = value(away.team.location || away.team.stadium);
  return patch;
}

function liveScorePatch(apiMatch) {
  const regularScore = parseScoreLine(apiMatch.scores?.score);
  const penaltyScore = parseScoreLine(apiMatch.scores?.ps_score);
  const patch = {
    live_score_match_id: value(apiMatch.id),
    live_score_fixture_id: value(apiMatch.fixture_id),
    live_score_status: value(apiMatch.status),
    live_score_last_changed: value(apiMatch.last_changed),
    status: liveScoreStatus(apiMatch),
    minute: liveScoreMinute(apiMatch)
  };
  if (apiMatch.scores?.score) {
    patch.home_score = regularScore.home;
    patch.away_score = regularScore.away;
  }
  if (apiMatch.location) patch.venue = value(apiMatch.location);
  if (apiMatch.scores?.ps_score) {
    patch.home_penalty_score = penaltyScore.home;
    patch.away_penalty_score = penaltyScore.away;
  }
  if (apiMatch.urls?.events) patch.live_score_events_url = value(apiMatch.urls.events);
  if (apiMatch.urls?.statistics) patch.live_score_statistics_url = value(apiMatch.urls.statistics);
  if (apiMatch.urls?.lineups) patch.live_score_lineups_url = value(apiMatch.urls.lineups);
  return patch;
}

function hasChanged(match, patch) {
  return Object.entries(patch).some(([key, next]) => {
    if (typeof next === "number") return scoreNumber(match[key]) !== next;
    if (next && typeof next === "object") {
      return JSON.stringify(match[key] ?? null) !== JSON.stringify(next);
    }
    return value(match[key]) !== value(next);
  });
}

function isoDate(date) {
  return date.toISOString().slice(0, 10);
}

function addDays(date, days) {
  const copy = new Date(date);
  copy.setUTCDate(copy.getUTCDate() + days);
  return copy;
}

function footballDataStatus(match) {
  const status = value(match.status).toUpperCase();
  if (["SCHEDULED", "TIMED"].includes(status)) return "À venir";
  if (["PAUSED"].includes(status)) return "Mi-temps";
  if (["FINISHED", "AWARDED"].includes(status)) return "Terminé";
  if (["POSTPONED", "SUSPENDED", "CANCELLED"].includes(status)) return "Reporté";
  return "En direct";
}

function footballDataMinute(match) {
  const status = footballDataStatus(match);
  if (status === "Terminé") return "FT";
  if (status === "À venir") return "";
  if (status === "Mi-temps") return "45'";
  return "live";
}

function footballDataScore(match, side) {
  const score = match.score || {};
  const candidates = [
    score.fullTime?.[side],
    score.regularTime?.[side],
    score.extraTime?.[side]
  ];
  const first = candidates.find(item => item !== undefined && item !== null);
  return scoreNumber(first);
}

const TEAM_NAME_ALIASES = new Map(Object.entries({
  afrique_du_sud: "south africa",
  algerie: "algeria",
  allemagne: "germany",
  angleterre: "england",
  arabie_saoudite: "saudi arabia",
  argentine: "argentina",
  australie: "australia",
  autriche: "austria",
  belgique: "belgium",
  bosnie_herzegovine: "bosnia and herzegovina",
  bresil: "brazil",
  cameroun: "cameroon",
  canada: "canada",
  chili: "chile",
  chine: "china",
  colombie: "colombia",
  coree_du_sud: "korea republic",
  costa_rica: "costa rica",
  cote_d_ivoire: "cote d ivoire",
  croatie: "croatia",
  danemark: "denmark",
  egypte: "egypt",
  emirats_arabes_unis: "united arab emirates",
  equateur: "ecuador",
  ecosse: "scotland",
  espagne: "spain",
  etats_unis: "united states",
  france: "france",
  ghana: "ghana",
  grece: "greece",
  honduras: "honduras",
  inde: "india",
  iran: "iran",
  irak: "iraq",
  irlande: "republic of ireland",
  islande: "iceland",
  italie: "italy",
  japon: "japan",
  maroc: "morocco",
  mexique: "mexico",
  nigeria: "nigeria",
  norvege: "norway",
  nouvelle_zelande: "new zealand",
  ouzbekistan: "uzbekistan",
  pays_bas: "netherlands",
  paraguay: "paraguay",
  pays_de_galles: "wales",
  perou: "peru",
  pologne: "poland",
  portugal: "portugal",
  qatar: "qatar",
  rdc: "dr congo",
  republique_democratique_du_congo: "dr congo",
  roumanie: "romania",
  senegal: "senegal",
  serbie: "serbia",
  slovaquie: "slovakia",
  slovenie: "slovenia",
  suede: "sweden",
  suisse: "switzerland",
  tunisie: "tunisia",
  turquie: "turkey",
  ukraine: "ukraine",
  uruguay: "uruguay"
}));

function normalizeTeamName(input) {
  const normalized = value(input)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\b(fc|cf|national|team|selection|the)\b/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  const aliasKey = normalized.replace(/\s+/g, "_");
  return TEAM_NAME_ALIASES.get(aliasKey) || normalized;
}

function teamNamesMatch(left, right) {
  if (!left || !right) return false;
  return left === right
    || left.includes(right)
    || right.includes(left);
}

function sameMatchDay(left, right) {
  if (!left || !right) return false;
  const leftDate = new Date(left);
  const rightDate = new Date(right);
  if (Number.isNaN(leftDate.getTime()) || Number.isNaN(rightDate.getTime())) return false;
  return isoDate(leftDate) === isoDate(rightDate);
}

function footballDataInfo(match) {
  const parts = [];
  if (match.venue) parts.push(match.venue);
  const referee = Array.isArray(match.referees)
    ? match.referees.find(item => value(item.type || item.role).toUpperCase().includes("REFEREE")) || match.referees[0]
    : null;
  if (referee?.name) parts.push(`Arbitre : ${referee.name}`);
  return parts.join(" • ");
}

function footballDataReferee(match) {
  if (!Array.isArray(match.referees)) return "";
  const referee = match.referees.find(item => value(item.type || item.role).toUpperCase() === "REFEREE")
    || match.referees.find(item => value(item.type || item.role).toUpperCase().includes("REFEREE"))
    || match.referees[0];
  return value(referee?.name);
}

function compactLineup(players) {
  if (!Array.isArray(players)) return [];
  return players.slice(0, 11).map(player => ({
    id: player.id ?? "",
    name: value(player.name),
    position: value(player.position),
    shirtNumber: player.shirtNumber ?? player.shirt_number ?? ""
  })).filter(player => player.name);
}

function compactStatistics(stats) {
  if (!stats || typeof stats !== "object") return {};
  const keys = [
    "ball_possession",
    "shots",
    "shots_on_goal",
    "shots_off_goal",
    "corner_kicks",
    "free_kicks",
    "goal_kicks",
    "offsides",
    "fouls",
    "saves",
    "throw_ins",
    "yellow_cards",
    "yellow_red_cards",
    "red_cards"
  ];
  return Object.fromEntries(
    keys
      .filter(key => stats[key] !== undefined && stats[key] !== null)
      .map(key => [key, stats[key]])
  );
}

function eventMinuteValue(event, fallback = 0) {
  const minute = Number.parseInt(event?.minute, 10);
  if (!Number.isFinite(minute)) return fallback;
  const injury = Number.parseInt(event?.injuryTime, 10);
  return Number.isFinite(injury) ? minute + injury / 100 : minute;
}

function eventMinuteLabel(event, fallback = "") {
  const minute = Number.parseInt(event?.minute, 10);
  if (!Number.isFinite(minute)) return fallback;
  const injury = Number.parseInt(event?.injuryTime, 10);
  return Number.isFinite(injury) && injury > 0 ? `${minute}+${injury}` : String(minute);
}

function teamShortName(team) {
  return value(team?.shortName || team?.tla || team?.name);
}

function compactTimelineEvents(match) {
  const events = [];

  (Array.isArray(match.goals) ? match.goals : []).forEach(goal => {
    const scorer = value(goal.scorer?.name, "Buteur");
    const team = teamShortName(goal.team);
    const type = value(goal.type).toUpperCase();
    const tags = [];
    if (type.includes("PENALTY")) tags.push("penalty");
    if (type.includes("OWN")) tags.push("csc");
    const score = goal.score && (goal.score.home !== undefined || goal.score.away !== undefined)
      ? ` — ${scoreNumber(goal.score.home)}-${scoreNumber(goal.score.away)}`
      : "";
    events.push({
      minute: eventMinuteLabel(goal),
      sort: eventMinuteValue(goal),
      type: "goal",
      team,
      player: scorer,
      text: `But : ${scorer}${team ? ` (${team})` : ""}${tags.length ? ` [${tags.join(", ")}]` : ""}${score}`
    });
  });

  (Array.isArray(match.bookings) ? match.bookings : []).forEach(booking => {
    const player = value(booking.player?.name, "Joueur");
    const team = teamShortName(booking.team);
    const card = value(booking.card).toUpperCase().includes("RED")
      ? "Carton rouge"
      : "Carton jaune";
    events.push({
      minute: eventMinuteLabel(booking),
      sort: eventMinuteValue(booking),
      type: card === "Carton rouge" ? "red-card" : "yellow-card",
      team,
      player,
      text: `${card} : ${player}${team ? ` (${team})` : ""}`
    });
  });

  (Array.isArray(match.substitutions) ? match.substitutions : []).forEach(substitution => {
    const playerIn = value(substitution.playerIn?.name, "entrant");
    const playerOut = value(substitution.playerOut?.name, "sortant");
    const team = teamShortName(substitution.team);
    events.push({
      minute: eventMinuteLabel(substitution),
      sort: eventMinuteValue(substitution),
      type: "substitution",
      team,
      player: playerIn,
      text: `Changement : ${playerIn} remplace ${playerOut}${team ? ` (${team})` : ""}`
    });
  });

  (Array.isArray(match.penalties) ? match.penalties : []).forEach(penalty => {
    const player = value(penalty.player?.name || penalty.scorer?.name, "Tireur");
    const team = teamShortName(penalty.team);
    const scored = penalty.scored === false || value(penalty.outcome).toUpperCase().includes("MISSED")
      ? "raté"
      : "marqué";
    events.push({
      minute: eventMinuteLabel(penalty, "TAB"),
      sort: eventMinuteValue(penalty, 120),
      type: scored === "marqué" ? "penalty-scored" : "penalty-missed",
      team,
      player,
      text: `Tir au but ${scored} : ${player}${team ? ` (${team})` : ""}`
    });
  });

  const status = footballDataStatus(match);
  if (["Mi-temps", "Terminé"].includes(status) && match.score?.halfTime) {
    events.push({
      minute: "45",
      sort: 45,
      type: "half-time",
      text: `Mi-temps : ${scoreNumber(match.score.halfTime.home)}-${scoreNumber(match.score.halfTime.away)}`
    });
  }
  if (status === "Terminé" && match.score?.fullTime) {
    events.push({
      minute: "90",
      sort: 90,
      type: "full-time",
      text: `Fin du match : ${scoreNumber(match.score.fullTime.home)}-${scoreNumber(match.score.fullTime.away)}`
    });
  }

  return events
    .filter(event => event.minute && event.text)
    .sort((left, right) => left.sort - right.sort)
    .map(({ sort, ...event }) => event);
}

function footballDataPatch(apiMatch, localMatch, explicitScoreSource = false) {
  const patch = {
    football_data_match_id: value(apiMatch.id),
    football_data_status: value(apiMatch.status),
    football_data_stage: value(apiMatch.stage),
    football_data_group: value(apiMatch.group),
    football_data_last_updated: value(apiMatch.lastUpdated)
  };
  if (apiMatch.venue) patch.venue = value(apiMatch.venue);
  const referee = footballDataReferee(apiMatch);
  if (referee) patch.referee = referee;
  if (apiMatch.homeTeam?.coach?.name) patch.home_coach = value(apiMatch.homeTeam.coach.name);
  if (apiMatch.awayTeam?.coach?.name) patch.away_coach = value(apiMatch.awayTeam.coach.name);
  if (apiMatch.homeTeam?.formation) patch.home_formation = value(apiMatch.homeTeam.formation);
  if (apiMatch.awayTeam?.formation) patch.away_formation = value(apiMatch.awayTeam.formation);
  const homeLineup = compactLineup(apiMatch.homeTeam?.lineup);
  const awayLineup = compactLineup(apiMatch.awayTeam?.lineup);
  if (homeLineup.length) patch.home_lineup = homeLineup;
  if (awayLineup.length) patch.away_lineup = awayLineup;
  const homeStatistics = compactStatistics(apiMatch.homeTeam?.statistics);
  const awayStatistics = compactStatistics(apiMatch.awayTeam?.statistics);
  if (Object.keys(homeStatistics).length) patch.home_statistics = homeStatistics;
  if (Object.keys(awayStatistics).length) patch.away_statistics = awayStatistics;
  const timelineEvents = compactTimelineEvents(apiMatch);
  if (timelineEvents.length) patch.timeline_events = timelineEvents;
  const info = footballDataInfo(apiMatch);
  if (info && !value(localMatch.info).trim()) patch.info = info;
  if (apiMatch.utcDate && !value(localMatch.kickoff).trim()) patch.kickoff = apiMatch.utcDate;

  if (explicitScoreSource) {
    patch.home_score = footballDataScore(apiMatch, "home");
    patch.away_score = footballDataScore(apiMatch, "away");
    patch.status = footballDataStatus(apiMatch);
    patch.minute = footballDataMinute(apiMatch);
  }
  return patch;
}

function matchFootballDataGame(localMatch, footballMatches) {
  const explicitId = value(localMatch.football_data_match_id).trim()
    || (value(localMatch.external_api) === "football-data" ? value(localMatch.external_match_id).trim() : "");
  if (explicitId) {
    return footballMatches.find(match => value(match.id) === explicitId) || null;
  }

  const localHome = normalizeTeamName(localMatch.home);
  const localAway = normalizeTeamName(localMatch.away);
  if (!localHome || !localAway || !localMatch.kickoff) return null;

  return footballMatches.find(match => {
    if (!sameMatchDay(localMatch.kickoff, match.utcDate)) return false;
    const apiHome = normalizeTeamName(match.homeTeam?.shortName || match.homeTeam?.name);
    const apiAway = normalizeTeamName(match.awayTeam?.shortName || match.awayTeam?.name);
    return teamNamesMatch(apiHome, localHome) && teamNamesMatch(apiAway, localAway);
  }) || null;
}

function liveScoreExplicitIds(match) {
  return {
    matchId: value(match.live_score_match_id).trim()
      || (["live-score-api", "live-score", "livescore"].includes(value(match.external_api)) ? value(match.external_match_id).trim() : ""),
    fixtureId: value(match.live_score_fixture_id).trim()
  };
}

function hasLiveScoreLink(match) {
  const ids = liveScoreExplicitIds(match);
  return Boolean(ids.matchId || ids.fixtureId);
}

function matchLiveScoreGame(localMatch, liveScoreMatches) {
  const ids = liveScoreExplicitIds(localMatch);
  if (ids.matchId || ids.fixtureId) {
    return liveScoreMatches.find(match =>
      (ids.matchId && value(match.id) === ids.matchId)
      || (ids.fixtureId && value(match.fixture_id) === ids.fixtureId)
    ) || null;
  }

  const localHome = normalizeTeamName(localMatch.home);
  const localAway = normalizeTeamName(localMatch.away);
  if (!localHome || !localAway) return null;

  return liveScoreMatches.find(match => {
    const apiHome = normalizeTeamName(liveScoreTeamName(match, "home"));
    const apiAway = normalizeTeamName(liveScoreTeamName(match, "away"));
    return teamNamesMatch(apiHome, localHome) && teamNamesMatch(apiAway, localAway);
  }) || null;
}

function liveScoreFixtureKickoff(fixture) {
  const date = value(fixture.date).trim();
  const time = value(fixture.time).trim();
  if (!date) return "";
  return time ? `${date}T${time.replace(/Z$/i, "")}Z` : `${date}T00:00:00Z`;
}

function matchLiveScoreFixture(localMatch, fixtures) {
  const ids = liveScoreExplicitIds(localMatch);
  if (ids.fixtureId) {
    return fixtures.find(fixture => value(fixture.id) === ids.fixtureId) || null;
  }

  const localHome = normalizeTeamName(localMatch.home);
  const localAway = normalizeTeamName(localMatch.away);
  if (!localHome || !localAway) return null;

  return fixtures.find(fixture => {
    if (localMatch.kickoff && !sameMatchDay(localMatch.kickoff, liveScoreFixtureKickoff(fixture))) return false;
    const apiHome = normalizeTeamName(fixture.home_translations?.fr || fixture.home_name);
    const apiAway = normalizeTeamName(fixture.away_translations?.fr || fixture.away_name);
    return teamNamesMatch(apiHome, localHome) && teamNamesMatch(apiAway, localAway);
  }) || null;
}

function liveScoreFixturePatch(fixture, localMatch) {
  const patch = {
    live_score_fixture_id: value(fixture.id),
    live_score_fixture_competition_id: value(fixture.competition_id || fixture.competition?.id),
    live_score_fixture_round: value(fixture.round)
  };
  if (fixture.location) patch.venue = value(fixture.location);
  const kickoff = liveScoreFixtureKickoff(fixture);
  if (kickoff && !value(localMatch.kickoff).trim()) patch.kickoff = kickoff;
  return patch;
}

function hasFootballDataLink(match) {
  return Boolean(value(match.football_data_match_id).trim())
    || value(match.external_api) === "football-data";
}

async function fetchLiveScoreMatches() {
  if (!liveScoreApiEnabled) return [];
  const key = value(env.LIVE_SCORE_API_KEY).trim();
  const secret = value(env.LIVE_SCORE_API_SECRET).trim();
  if (!key || !secret) {
    log("live-score-api.com activé mais LIVE_SCORE_API_KEY ou LIVE_SCORE_API_SECRET est vide : source ignorée.");
    return [];
  }

  const base = value(env.LIVE_SCORE_API_BASE_URL, "https://livescore-api.com/api-client").replace(/\/$/, "");
  const url = new URL(`${base}/matches/live.json`);
  url.searchParams.set("key", key);
  url.searchParams.set("secret", secret);
  const competitionIds = value(env.LIVE_SCORE_API_COMPETITION_IDS).trim();
  if (competitionIds) url.searchParams.set("competition_id", competitionIds);
  const lang = value(env.LIVE_SCORE_API_LANG).trim();
  if (lang) url.searchParams.set("lang", lang);

  const response = await fetchWithRetry(url, { cache: "no-store" }, "live-score-api.com", {
    attempts: footballDataRetryAttempts,
    delayMs: footballDataRetryDelayMs
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`live-score-api.com HTTP ${response.status}: ${body.slice(0, 160)}`);
  }
  const payload = await response.json();
  if (payload?.success === false) {
    throw new Error(`live-score-api.com: ${value(payload?.error || payload?.message, "réponse non réussie")}`);
  }
  return Array.isArray(payload?.data?.match) ? payload.data.match : [];
}

async function fetchLiveScoreFixtures() {
  if (!liveScoreApiEnabled) return [];
  const key = value(env.LIVE_SCORE_API_KEY).trim();
  const secret = value(env.LIVE_SCORE_API_SECRET).trim();
  if (!key || !secret) return [];

  const competitionIds = value(env.LIVE_SCORE_API_FIXTURE_COMPETITION_IDS || env.LIVE_SCORE_API_COMPETITION_IDS).trim();
  if (!competitionIds) return [];

  const base = value(env.LIVE_SCORE_API_BASE_URL, "https://livescore-api.com/api-client").replace(/\/$/, "");
  const results = [];
  for (const competitionId of competitionIds.split(",").map(item => item.trim()).filter(Boolean)) {
    const url = new URL(`${base}/fixtures/matches.json`);
    url.searchParams.set("key", key);
    url.searchParams.set("secret", secret);
    url.searchParams.set("competition_id", competitionId);
    const lang = value(env.LIVE_SCORE_API_LANG).trim();
    if (lang) url.searchParams.set("lang", lang);

    const response = await fetchWithRetry(url, { cache: "no-store" }, `live-score-api.com fixtures ${competitionId}`, {
      attempts: footballDataRetryAttempts,
      delayMs: footballDataRetryDelayMs
    });
    if (!response.ok) {
      const body = await response.text();
      throw new Error(`live-score-api.com fixtures ${competitionId} HTTP ${response.status}: ${body.slice(0, 160)}`);
    }
    const payload = await response.json();
    if (payload?.success === false) {
      throw new Error(`live-score-api.com fixtures ${competitionId}: ${value(payload?.error || payload?.message, "réponse non réussie")}`);
    }
    results.push(...(Array.isArray(payload?.data?.fixtures) ? payload.data.fixtures : []));
  }
  return results;
}

async function fetchLiveScoreEvents(matchIds = []) {
  if (!liveScoreApiEnabled || !liveScoreApiEventsEnabled) return new Map();
  const key = value(env.LIVE_SCORE_API_KEY).trim();
  const secret = value(env.LIVE_SCORE_API_SECRET).trim();
  if (!key || !secret) return new Map();

  const base = value(env.LIVE_SCORE_API_BASE_URL, "https://livescore-api.com/api-client").replace(/\/$/, "");
  const lang = value(env.LIVE_SCORE_API_LANG).trim();
  const uniqueIds = [...new Set(matchIds.map(id => value(id).trim()).filter(Boolean))];
  const results = new Map();

  for (const matchId of uniqueIds) {
    try {
      const url = new URL(`${base}/matches/events.json`);
      url.searchParams.set("key", key);
      url.searchParams.set("secret", secret);
      url.searchParams.set("id", matchId);
      url.searchParams.set("match_id", matchId);
      if (lang) url.searchParams.set("lang", lang);

      const response = await fetchWithRetry(url, { cache: "no-store" }, `live-score-api.com events ${matchId}`, {
        attempts: footballDataRetryAttempts,
        delayMs: footballDataRetryDelayMs
      });
      if (!response.ok) {
        const body = await response.text();
        log(`LiveScore événements ignorés pour ${matchId} : HTTP ${response.status} ${body.slice(0, 120)}`);
        continue;
      }
      const payload = await response.json();
      if (payload?.success === false) {
        log(`LiveScore événements ignorés pour ${matchId} : ${value(payload?.error || payload?.message, "réponse non réussie")}`);
        continue;
      }
      if (payload?.data) results.set(matchId, payload.data);
    } catch (error) {
      log(`LiveScore événements ignorés pour ${matchId} après ${footballDataRetryAttempts} tentative(s) : ${error.message}`);
    }
  }

  return results;
}

async function fetchLiveScoreLineups(matchIds = []) {
  if (!liveScoreApiEnabled || !liveScoreApiLineupsEnabled) return new Map();
  const key = value(env.LIVE_SCORE_API_KEY).trim();
  const secret = value(env.LIVE_SCORE_API_SECRET).trim();
  if (!key || !secret) return new Map();

  const base = value(env.LIVE_SCORE_API_BASE_URL, "https://livescore-api.com/api-client").replace(/\/$/, "");
  const lang = value(env.LIVE_SCORE_API_LANG).trim();
  const uniqueIds = [...new Set(matchIds.map(id => value(id).trim()).filter(Boolean))];
  const results = new Map();

  for (const matchId of uniqueIds) {
    try {
      const url = new URL(`${base}/matches/lineups.json`);
      url.searchParams.set("key", key);
      url.searchParams.set("secret", secret);
      url.searchParams.set("match_id", matchId);
      url.searchParams.set("id", matchId);
      if (lang) url.searchParams.set("lang", lang);

      const response = await fetchWithRetry(url, { cache: "no-store" }, `live-score-api.com lineups ${matchId}`, {
        attempts: footballDataRetryAttempts,
        delayMs: footballDataRetryDelayMs
      });
      if (!response.ok) {
        const body = await response.text();
        log(`LiveScore compositions ignorées pour ${matchId} : HTTP ${response.status} ${body.slice(0, 120)}`);
        continue;
      }
      const payload = await response.json();
      if (payload?.success === false) {
        log(`LiveScore compositions ignorées pour ${matchId} : ${value(payload?.error || payload?.message, "réponse non réussie")}`);
        continue;
      }
      if (payload?.data) results.set(matchId, payload.data);
    } catch (error) {
      log(`LiveScore compositions ignorées pour ${matchId} après ${footballDataRetryAttempts} tentative(s) : ${error.message}`);
    }
  }

  return results;
}

async function fetchFootballDataMatches() {
  if (!footballDataEnabled) return [];
  if (!value(env.FOOTBALL_DATA_API_TOKEN).trim()) {
    log("football-data.org activé mais FOOTBALL_DATA_API_TOKEN est vide : source ignorée.");
    return [];
  }

  const now = new Date();
  const dateFrom = isoDate(addDays(now, -Math.max(0, Number.parseInt(env.FOOTBALL_DATA_LOOKBACK_DAYS, 10) || 0)));
  const dateTo = isoDate(addDays(now, Math.max(1, Number.parseInt(env.FOOTBALL_DATA_LOOKAHEAD_DAYS, 10) || 7)));
  const competitions = value(env.FOOTBALL_DATA_COMPETITIONS, "WC")
    .split(",")
    .map(item => item.trim())
    .filter(Boolean);

  const results = [];
  for (const competition of competitions) {
    const url = new URL(`https://api.football-data.org/v4/competitions/${encodeURIComponent(competition)}/matches`);
    url.searchParams.set("dateFrom", dateFrom);
    url.searchParams.set("dateTo", dateTo);
    const response = await fetchWithRetry(url, {
      headers: {
        "X-Auth-Token": env.FOOTBALL_DATA_API_TOKEN,
        "X-Unfold-Goals": "true"
      },
      cache: "no-store"
    }, `football-data.org ${competition}`, {
      attempts: footballDataRetryAttempts,
      delayMs: footballDataRetryDelayMs
    });
    if (!response.ok) {
      const body = await response.text();
      throw new Error(`football-data.org ${competition} HTTP ${response.status}: ${body.slice(0, 160)}`);
    }
    const payload = await response.json();
    results.push(...(Array.isArray(payload.matches) ? payload.matches : []));
  }
  return results;
}

async function fetchFootballDataMatchDetails(ids = []) {
  if (!footballDataEnabled) return [];
  if (!value(env.FOOTBALL_DATA_API_TOKEN).trim()) return [];
  const uniqueIds = [...new Set(ids.map(id => value(id).trim()).filter(Boolean))];
  const results = [];

  for (const id of uniqueIds) {
    try {
      const response = await fetchWithRetry(`https://api.football-data.org/v4/matches/${encodeURIComponent(id)}`, {
        headers: {
          "X-Auth-Token": env.FOOTBALL_DATA_API_TOKEN,
          "X-Unfold-Goals": "true"
        },
        cache: "no-store"
      }, `football-data.org détail ${id}`, {
        attempts: footballDataRetryAttempts,
        delayMs: footballDataRetryDelayMs
      });
      if (!response.ok) {
        const body = await response.text();
        log(`football-data.org détail ignoré pour ${id} : HTTP ${response.status} ${body.slice(0, 120)}`);
        continue;
      }
      results.push(await response.json());
    } catch (error) {
      log(`football-data.org détail ignoré pour ${id} après ${footballDataRetryAttempts} tentative(s) : ${error.message}`);
    }
  }

  return results;
}

async function fetchApiGames() {
  if (!worldCupEnabled) return [];
  const response = await fetch(env.WORLD_CUP_API_URL, { cache: "no-store" });
  if (!response.ok) throw new Error(`API World Cup indisponible (${response.status})`);
  const payload = await response.json();
  const games = Array.isArray(payload?.games) ? payload.games : [];
  if (!games.length) throw new Error("Aucun match reçu depuis l’API.");
  return games;
}

async function settleSource(label, task) {
  try {
    return { label, ok: true, data: await task() };
  } catch (error) {
    return { label, ok: false, data: [], error: error.message };
  }
}

async function syncOnce() {
  const data = await firebaseReadLiveScores();
  if (!data || !Array.isArray(data.matches)) {
    throw new Error("Firebase /liveScores ne contient pas de tableau matches.");
  }

  const publishedMatches = data.matches.filter(match => match.published !== false);
  const needsLiveScoreSource = liveScoreApiEnabled && publishedMatches.some(match =>
    hasLiveScoreLink(match)
    || ["En direct", "Mi-temps"].includes(value(match.status))
    || (!["Terminé", "Reporté"].includes(value(match.status)) && match.kickoff)
  );
  const needsLiveScoreFixtures = liveScoreApiEnabled && publishedMatches.some(match =>
    !value(match.live_score_fixture_id).trim()
    && !["Terminé", "Reporté"].includes(value(match.status))
    && value(match.home).trim()
    && value(match.away).trim()
  );
  const needsWorldCupSource = publishedMatches.some(match =>
    !hasLiveScoreLink(match) &&
    !hasFootballDataLink(match)
    && value(match.external_match_id).trim()
    && value(match.external_api) !== "football-data"
  );
  const needsFootballDataList = publishedMatches.some(match =>
    !hasLiveScoreLink(match) &&
    !value(match.football_data_match_id).trim()
    && value(match.external_api) !== "football-data"
    && match.kickoff
  );
  const explicitFootballIds = publishedMatches
    .map(match => value(match.football_data_match_id).trim()
      || (value(match.external_api) === "football-data" ? value(match.external_match_id).trim() : ""))
    .filter(Boolean);

  const [liveScoreSource, liveScoreFixturesSource, worldCupSource, footballDataSource, footballDataDetailsSource] = await Promise.all([
    needsLiveScoreSource
      ? settleSource("live-score-api.com", fetchLiveScoreMatches)
      : Promise.resolve({ label: "live-score-api.com", ok: true, data: [] }),
    needsLiveScoreFixtures
      ? settleSource("live-score-api.com/fixtures", fetchLiveScoreFixtures)
      : Promise.resolve({ label: "live-score-api.com/fixtures", ok: true, data: [] }),
    needsWorldCupSource
      ? settleSource("worldcup26.ir", fetchApiGames)
      : Promise.resolve({ label: "worldcup26.ir", ok: true, data: [] }),
    needsFootballDataList
      ? settleSource("football-data.org", fetchFootballDataMatches)
      : Promise.resolve({ label: "football-data.org", ok: true, data: [] }),
    explicitFootballIds.length
      ? settleSource("football-data.org/details", () => fetchFootballDataMatchDetails(explicitFootballIds))
      : Promise.resolve({ label: "football-data.org/details", ok: true, data: [] })
  ]);

  const liveScoreMatches = liveScoreSource.data;
  const liveScoreFixtures = liveScoreFixturesSource.data;

  const liveScoreMatchIds = liveScoreApiEnabled && (liveScoreApiEventsEnabled || liveScoreApiLineupsEnabled)
    ? [...new Set(publishedMatches
      .map(match => liveScoreExplicitIds(match).matchId || value(matchLiveScoreGame(match, liveScoreMatches)?.id).trim())
      .filter(Boolean))]
    : [];
  const liveScoreEventsSource = liveScoreMatchIds.length && liveScoreApiEventsEnabled
    ? await settleSource("live-score-api.com/events", () => fetchLiveScoreEvents(liveScoreMatchIds))
    : { label: "live-score-api.com/events", ok: true, data: new Map() };
  const liveScoreEventsById = liveScoreEventsSource.data instanceof Map ? liveScoreEventsSource.data : new Map();
  const liveScoreLineupsSource = liveScoreMatchIds.length && liveScoreApiLineupsEnabled
    ? await settleSource("live-score-api.com/lineups", () => fetchLiveScoreLineups(liveScoreMatchIds))
    : { label: "live-score-api.com/lineups", ok: true, data: new Map() };
  const liveScoreLineupsById = liveScoreLineupsSource.data instanceof Map ? liveScoreLineupsSource.data : new Map();

  const games = worldCupSource.data;
  const footballMatchesById = new Map([
    ...footballDataSource.data,
    ...footballDataDetailsSource.data
  ].map(match => [value(match.id), match]));
  const footballMatches = [...footballMatchesById.values()];
  const sourceErrors = [liveScoreSource, liveScoreFixturesSource, liveScoreEventsSource, liveScoreLineupsSource, worldCupSource, footballDataSource, footballDataDetailsSource]
    .filter(source => !source.ok)
    .map(source => `${source.label}: ${source.error}`);

  if (sourceErrors.length) {
    sourceErrors.forEach(error => log(`Source indisponible : ${error}`));
  }

  if (!liveScoreMatches.length && !liveScoreFixtures.length && !liveScoreEventsById.size && !liveScoreLineupsById.size && !games.length && !footballMatches.length) {
    const noApiNeeded = !needsLiveScoreSource && !needsLiveScoreFixtures && !liveScoreMatchIds.length && !needsWorldCupSource && !needsFootballDataList && !explicitFootballIds.length;
    const now = new Date().toISOString();
    await firebasePatchLiveScores({
      automation: {
        enabled: true,
        mode: "local-pc",
        source: "live-score-api.com + football-data.org + worldcup26.ir",
        last_sync_at: now,
        last_result: noApiNeeded ? "no-api-needed" : "source-error",
        source_errors: noApiNeeded
          ? []
          : (sourceErrors.length ? sourceErrors : ["Aucune source active ou aucun match reçu."]),
        live_score_api_enabled: liveScoreApiEnabled,
        live_score_api_matches: liveScoreMatches.length,
        live_score_api_fixtures: liveScoreFixtures.length,
        live_score_api_events: liveScoreEventsById.size,
        live_score_api_lineups: liveScoreLineupsById.size,
        world_cup_enabled: worldCupEnabled,
        football_data_enabled: footballDataEnabled,
        interval_seconds: intervalSeconds,
        dry_run: dryRun
      }
    });
    log(noApiNeeded
      ? `Aucune requête API nécessaire. Matchs publiés : ${publishedMatches.length}.`
      : "Aucune source disponible pour cette passe. Nouvelle tentative au prochain cycle.");
    return;
  }

  const gameById = new Map(games.map(game => [value(game.id), game]));
  let linked = 0;
  let liveScoreLinked = 0;
  let liveScoreFixturesLinked = 0;
  let worldCupLinked = 0;
  let footballDataLinked = 0;
  let changed = 0;
  const changedMatches = [];

  const matches = data.matches.map(match => {
    if (match.published === false) return match;
    const apiId = value(match.external_match_id).trim();
    const liveScoreMatch = matchLiveScoreGame(match, liveScoreMatches);
    const liveScoreFixture = liveScoreMatch ? null : matchLiveScoreFixture(match, liveScoreFixtures);
    const liveScoreEventId = liveScoreExplicitIds(match).matchId || value(liveScoreMatch?.id).trim();
    const liveScoreEventPayload = liveScoreEventId ? liveScoreEventsById.get(liveScoreEventId) : null;
    const liveScoreLineupPayload = liveScoreEventId ? liveScoreLineupsById.get(liveScoreEventId) : null;
    const footballMatch = matchFootballDataGame(match, footballMatches);
    const game = liveScoreMatch || hasFootballDataLink(match)
      ? null
      : (value(match.external_api) === "football-data" ? null : gameById.get(apiId));
    const explicitFootballScoreSource = value(match.external_api) === "football-data" && !liveScoreMatch;
    const patch = {
      ...(game ? apiMatchPatch(game) : {}),
      ...(footballMatch && !liveScoreMatch ? footballDataPatch(footballMatch, match, explicitFootballScoreSource) : {}),
      ...(liveScoreFixture ? liveScoreFixturePatch(liveScoreFixture, match) : {}),
      ...(liveScoreMatch ? liveScorePatch(liveScoreMatch) : {}),
      ...(liveScoreEventPayload ? liveScoreEventsPatch(liveScoreEventPayload, match) : {}),
      ...(liveScoreLineupPayload ? liveScoreLineupsPatch(liveScoreLineupPayload) : {})
    };
    if (liveScoreMatch || liveScoreFixture || liveScoreEventPayload || liveScoreLineupPayload || game || footballMatch) linked += 1;
    if (liveScoreMatch) liveScoreLinked += 1;
    if (liveScoreFixture) liveScoreFixturesLinked += 1;
    if (game) worldCupLinked += 1;
    if (footballMatch && !liveScoreMatch) footballDataLinked += 1;
    if (!Object.keys(patch).length) return match;
    if (!hasChanged(match, patch)) return match;
    changed += 1;
    changedMatches.push(`${match.home || "Équipe 1"} - ${match.away || "Équipe 2"} → ${value(patch.home_score, match.home_score)}-${value(patch.away_score, match.away_score)} / ${patch.status || match.status || "infos"}`);
    return { ...match, ...patch };
  });

  const now = new Date().toISOString();
  const automation = {
    enabled: true,
    mode: "local-pc",
    source: "live-score-api.com + football-data.org + worldcup26.ir",
    last_sync_at: now,
    last_result: sourceErrors.length ? (changed ? "updated-with-source-warning" : "source-warning") : (changed ? "updated" : "no-change"),
    source_errors: sourceErrors,
    linked_matches: linked,
    live_score_linked_matches: liveScoreLinked,
    live_score_fixture_linked_matches: liveScoreFixturesLinked,
    world_cup_linked_matches: worldCupLinked,
    football_data_linked_matches: footballDataLinked,
    live_score_api_enabled: liveScoreApiEnabled,
    live_score_api_matches: liveScoreMatches.length,
    live_score_api_fixtures: liveScoreFixtures.length,
    live_score_api_events: liveScoreEventsById.size,
    live_score_api_lineups: liveScoreLineupsById.size,
    world_cup_enabled: worldCupEnabled,
    api_matches: games.length,
    football_data_enabled: footballDataEnabled,
    football_data_matches: footballMatches.length,
    interval_seconds: intervalSeconds,
    dry_run: dryRun,
    changed_matches: changedMatches.slice(0, 8)
  };

  await firebasePatchLiveScores(changed ? { matches, updated_at: now, automation } : { automation });
  log(changed
    ? `Synchronisation appliquée : ${changed} match(s) mis à jour.`
    : `Aucun changement. Matchs liés : ${linked} (LiveScore ${liveScoreLinked}, fixtures ${liveScoreFixturesLinked}, events ${liveScoreEventsById.size}, lineups ${liveScoreLineupsById.size}, WorldCup ${worldCupLinked}, football-data ${footballDataLinked}). LiveScore : ${liveScoreMatches.length} match(s), fixtures : ${liveScoreFixtures.length}, events : ${liveScoreEventsById.size}, lineups : ${liveScoreLineupsById.size}, API World Cup : ${games.length} match(s), football-data : ${footballMatches.length} match(s).`);
  if (liveScoreMatches.length && !liveScoreLinked) {
    log("Info LiveScore : le flux contient des matchs, mais aucun ne correspond aux matchs publiés. Lancez `npm run list:live-score` pour voir les IDs à lier.");
  }
  changedMatches.forEach(item => log(`  - ${item}`));
}

async function runLoop() {
  if (syncRunning) return;
  syncRunning = true;
  try {
    await syncOnce();
  } catch (error) {
    const message = error?.message || String(error);
    const isNetworkError = /fetch failed|network|timeout|econnreset|enotfound|etimedout/i.test(message);
    log(isNetworkError
      ? `Erreur réseau temporaire : ${message}. Nouvelle tentative au prochain cycle.`
      : `Erreur : ${message}`);
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

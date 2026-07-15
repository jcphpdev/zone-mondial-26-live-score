import { initializeApp } from "https://www.gstatic.com/firebasejs/12.15.0/firebase-app.js";
import { getDatabase, onValue, ref } from "https://www.gstatic.com/firebasejs/12.15.0/firebase-database.js";
import { firebaseConfig, firebaseConfigured } from "./firebase-config.js";
import { calculateStandings, inferGroupId } from "./standings-engine.js?v=20260626-15";
import { flagUrl } from "./team-utils.js?v=20260626-15";

const JSON_REFRESH_INTERVAL = 30_000;
const SCENE_EXIT_DURATION = 260;
const SCENE_ENTER_DURATION = 620;
const GOAL_ALERT_DURATION = 4_200;
const AUTO_CLOCK_INTERVAL = 15_000;
const KICKOFF_ALERT_WINDOW = 90_000;
const params = new URLSearchParams(window.location.search);
const DEFAULT_SETTINGS = {
  score_scene_duration: 10,
  pre_match_scene_duration: 12,
  lineups_scene_duration: 12,
  stats_scene_duration: 10,
  info_scene_duration: 12,
  info_title_font_size: 64,
  info_details_font_size: 28,
  info_date_font_size: 20,
  live_updates_font_size: 26,
  live_updates_score_font_size: 24,
  goal_detail_scene_duration: 6,
  event_detail_scene_duration: 6,
  standings_scene_duration: 8,
  video_scene_duration: 15,
  score_scene_before_minutes: 30,
  score_scene_after_minutes: 30,
  auto_rotate: true,
  show_ticker: true,
  show_goal_alert: true,
  enable_goal_sound: true,
  auto_start_matches: true,
  scene_mode: "auto",
  selected_match_id: "",
  selected_group_id: "",
  include_prematch_scenes: true,
  include_lineup_scenes: false,
  include_stats_scenes: false,
  include_info_scenes: false,
  include_goal_detail_scenes: false,
  include_event_detail_scenes: false,
  include_match_scenes: true,
  include_match_video_scenes: false,
  include_group_scenes: true,
  include_ticker_scene: false,
  include_video_scene: false,
  enable_video_sound: true,
  video_playlist_urls: "",
  match_background_url: "assets/bg-ambience-score.svg",
  match_video_background_url: "assets/bg-ambience-score-video.svg",
  standings_background_url: "assets/bg-ambience-standings.svg",
  info_background_url: "assets/bg-ambience-live-updates.svg",
  ticker_background_url: "assets/bg-ambience-live-updates.svg"
};

const LEGACY_SCOREBOARD_BACKGROUNDS = new Set([
  "assets/bg-scene-match.png",
  "assets/bg-scene-match-video.png",
  "assets/bg-scene-standings.png",
  "assets/bg-scene-live-updates.png",
  "assets/bg-v2-score.png",
  "assets/bg-v2-score-video.png",
  "assets/bg-v2-standings.png",
  "assets/bg-v2-live-updates.png",
  "assets/bg-scoreboard-16-9-v2.png",
  "assets/bg-scoreboard-16-9.png"
]);

const SCENE_DEFAULT_BACKGROUNDS = new Set([
  DEFAULT_SETTINGS.match_background_url,
  DEFAULT_SETTINGS.match_video_background_url,
  DEFAULT_SETTINGS.standings_background_url,
  DEFAULT_SETTINGS.info_background_url,
  DEFAULT_SETTINGS.ticker_background_url
]);

const elements = {
  scoreboard: document.querySelector(".scoreboard"),
  competition: document.getElementById("competition"),
  status: document.getElementById("status"),
  homeFlag: document.getElementById("homeFlag"),
  homeName: document.getElementById("homeName"),
  homeQualifiedBadge: document.getElementById("homeQualifiedBadge"),
  homeScore: document.getElementById("homeScore"),
  awayScore: document.getElementById("awayScore"),
  homeScorers: document.getElementById("homeScorers"),
  awayScorers: document.getElementById("awayScorers"),
  penaltyScore: document.getElementById("penaltyScore"),
  awayFlag: document.getElementById("awayFlag"),
  awayName: document.getElementById("awayName"),
  awayQualifiedBadge: document.getElementById("awayQualifiedBadge"),
  matchVideoFrame: document.getElementById("matchVideoFrame"),
  matchPlaylistVideo: document.getElementById("matchPlaylistVideo"),
  matchPlaylistEmpty: document.getElementById("matchPlaylistEmpty"),
  minute: document.getElementById("minute"),
  matchInfo: document.getElementById("matchInfo"),
  matchTimeline: document.getElementById("matchTimeline"),
  matchTimelineRows: document.getElementById("matchTimelineRows"),
  pagination: document.getElementById("pagination"),
  groupName: document.getElementById("groupName"),
  groupSubtitle: document.getElementById("groupSubtitle"),
  standingsRows: document.getElementById("standingsRows"),
  liveUpdatesView: document.getElementById("liveUpdatesView"),
  liveUpdatesRows: document.getElementById("liveUpdatesRows"),
  videoUpdatesView: document.getElementById("videoUpdatesView"),
  videoUpdatesRows: document.getElementById("videoUpdatesRows"),
  infoSceneView: document.getElementById("infoSceneView"),
  infoSceneImage: document.getElementById("infoSceneImage"),
  infoSceneDate: document.getElementById("infoSceneDate"),
  infoSceneTitle: document.getElementById("infoSceneTitle"),
  infoSceneDetails: document.getElementById("infoSceneDetails"),
  infoScenePagination: document.getElementById("infoScenePagination"),
  preMatchView: document.getElementById("preMatchView"),
  preMatchHomeFlag: document.getElementById("preMatchHomeFlag"),
  preMatchHomeName: document.getElementById("preMatchHomeName"),
  preMatchHomeFormation: document.getElementById("preMatchHomeFormation"),
  preMatchHomeCoach: document.getElementById("preMatchHomeCoach"),
  preMatchAwayFlag: document.getElementById("preMatchAwayFlag"),
  preMatchAwayName: document.getElementById("preMatchAwayName"),
  preMatchAwayFormation: document.getElementById("preMatchAwayFormation"),
  preMatchAwayCoach: document.getElementById("preMatchAwayCoach"),
  preMatchKickoff: document.getElementById("preMatchKickoff"),
  preMatchStage: document.getElementById("preMatchStage"),
  preMatchVenue: document.getElementById("preMatchVenue"),
  preMatchReferee: document.getElementById("preMatchReferee"),
  preMatchHomeLineup: document.getElementById("preMatchHomeLineup"),
  preMatchAwayLineup: document.getElementById("preMatchAwayLineup"),
  lineupsView: document.getElementById("lineupsView"),
  lineupsHomeFlag: document.getElementById("lineupsHomeFlag"),
  lineupsHomeName: document.getElementById("lineupsHomeName"),
  lineupsHomeFormation: document.getElementById("lineupsHomeFormation"),
  lineupsAwayFlag: document.getElementById("lineupsAwayFlag"),
  lineupsAwayName: document.getElementById("lineupsAwayName"),
  lineupsAwayFormation: document.getElementById("lineupsAwayFormation"),
  lineupsMatchMeta: document.getElementById("lineupsMatchMeta"),
  lineupsHomeRows: document.getElementById("lineupsHomeRows"),
  lineupsAwayRows: document.getElementById("lineupsAwayRows"),
  lineupsHomeCoach: document.getElementById("lineupsHomeCoach"),
  lineupsAwayCoach: document.getElementById("lineupsAwayCoach"),
  lineupsReferee: document.getElementById("lineupsReferee"),
  statsView: document.getElementById("statsView"),
  statsHomeFlag: document.getElementById("statsHomeFlag"),
  statsHomeName: document.getElementById("statsHomeName"),
  statsAwayFlag: document.getElementById("statsAwayFlag"),
  statsAwayName: document.getElementById("statsAwayName"),
  statsMatchMeta: document.getElementById("statsMatchMeta"),
  statsRows: document.getElementById("statsRows"),
  statsHomeScore: document.getElementById("statsHomeScore"),
  statsAwayScore: document.getElementById("statsAwayScore"),
  statsMinute: document.getElementById("statsMinute"),
  goalDetailView: document.getElementById("goalDetailView"),
  goalDetailFlag: document.getElementById("goalDetailFlag"),
  goalDetailTeam: document.getElementById("goalDetailTeam"),
  goalDetailMinute: document.getElementById("goalDetailMinute"),
  goalDetailScorer: document.getElementById("goalDetailScorer"),
  goalDetailType: document.getElementById("goalDetailType"),
  goalDetailHome: document.getElementById("goalDetailHome"),
  goalDetailAway: document.getElementById("goalDetailAway"),
  goalDetailMatch: document.getElementById("goalDetailMatch"),
  eventDetailView: document.getElementById("eventDetailView"),
  eventDetailLabel: document.getElementById("eventDetailLabel"),
  eventDetailFlag: document.getElementById("eventDetailFlag"),
  eventDetailTeam: document.getElementById("eventDetailTeam"),
  eventDetailMinute: document.getElementById("eventDetailMinute"),
  eventDetailMain: document.getElementById("eventDetailMain"),
  eventDetailType: document.getElementById("eventDetailType"),
  eventDetailHome: document.getElementById("eventDetailHome"),
  eventDetailAway: document.getElementById("eventDetailAway"),
  eventDetailMatch: document.getElementById("eventDetailMatch"),
  playlistVideo: document.getElementById("playlistVideo"),
  playlistEmpty: document.getElementById("playlistEmpty"),
  ticker: document.querySelector(".ticker"),
  goalAlert: document.getElementById("goalAlert"),
  goalLabel: document.querySelector(".goal-alert__label"),
  goalTeam: document.getElementById("goalTeam"),
  goalScoreLine: document.getElementById("goalScoreLine"),
  tickerTrack: document.getElementById("tickerTrack"),
  soundUnlock: document.getElementById("soundUnlock"),
  connectionState: document.getElementById("connectionState")
};

let scenes = [];
let activeScene = 0;
let jsonFallbackTimer;
let sceneRenderToken = 0;
let hasRenderedScene = false;
let goalAlertTimer;
let rotationTimer;
let autoClockTimer;
let previousScoreByMatch = new Map();
let previousTimelineEventKeys = new Set();
let timelineEventBaselineReady = false;
let scoreBaselineReady = false;
let previousAutoLiveByMatch = new Map();
let autoLiveBaselineReady = false;
let kickoffAlertShown = new Set();
let latestData;
let currentVideoPlaylist = [];
let currentVideoIndex = 0;
let videoPlaybackBlocked = false;
let audioContext;
let soundUnlocked = false;
let currentSettings = { ...DEFAULT_SETTINGS };

const value = (input, fallback = "") =>
  input === undefined || input === null ? fallback : String(input);

const scoreNumber = input => {
  const parsed = Number.parseInt(value(input, "0"), 10);
  return Number.isFinite(parsed) ? parsed : 0;
};

function boundedNumber(input, fallback, min, max) {
  const parsed = Number.parseInt(input, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function normalizeSettings(settings = {}) {
  return {
    score_scene_duration: boundedNumber(settings.score_scene_duration, DEFAULT_SETTINGS.score_scene_duration, 3, 60),
    pre_match_scene_duration: boundedNumber(settings.pre_match_scene_duration, DEFAULT_SETTINGS.pre_match_scene_duration, 3, 60),
    lineups_scene_duration: boundedNumber(settings.lineups_scene_duration, DEFAULT_SETTINGS.lineups_scene_duration, 3, 60),
    stats_scene_duration: boundedNumber(settings.stats_scene_duration, DEFAULT_SETTINGS.stats_scene_duration, 3, 60),
    info_scene_duration: boundedNumber(settings.info_scene_duration, DEFAULT_SETTINGS.info_scene_duration, 3, 60),
    info_title_font_size: boundedNumber(settings.info_title_font_size, DEFAULT_SETTINGS.info_title_font_size, 34, 92),
    info_details_font_size: boundedNumber(settings.info_details_font_size, DEFAULT_SETTINGS.info_details_font_size, 16, 42),
    info_date_font_size: boundedNumber(settings.info_date_font_size, DEFAULT_SETTINGS.info_date_font_size, 12, 30),
    live_updates_font_size: boundedNumber(settings.live_updates_font_size, DEFAULT_SETTINGS.live_updates_font_size, 14, 42),
    live_updates_score_font_size: boundedNumber(settings.live_updates_score_font_size, DEFAULT_SETTINGS.live_updates_score_font_size, 14, 38),
    goal_detail_scene_duration: boundedNumber(settings.goal_detail_scene_duration, DEFAULT_SETTINGS.goal_detail_scene_duration, 3, 30),
    event_detail_scene_duration: boundedNumber(settings.event_detail_scene_duration, DEFAULT_SETTINGS.event_detail_scene_duration, 3, 30),
    standings_scene_duration: boundedNumber(settings.standings_scene_duration, DEFAULT_SETTINGS.standings_scene_duration, 3, 60),
    video_scene_duration: boundedNumber(settings.video_scene_duration, DEFAULT_SETTINGS.video_scene_duration, 5, 180),
    score_scene_before_minutes: boundedNumber(settings.score_scene_before_minutes, DEFAULT_SETTINGS.score_scene_before_minutes, 0, 240),
    score_scene_after_minutes: boundedNumber(settings.score_scene_after_minutes, DEFAULT_SETTINGS.score_scene_after_minutes, 0, 240),
    auto_rotate: settings.auto_rotate !== false,
    show_ticker: settings.show_ticker !== false,
    show_goal_alert: settings.show_goal_alert !== false,
    enable_goal_sound: settings.enable_goal_sound !== false,
    auto_start_matches: settings.auto_start_matches !== false,
    scene_mode: ["auto", "pre-match", "lineups", "stats", "info", "goal-detail", "card-detail", "substitution-detail", "half-time-detail", "full-time-detail", "match", "match-video", "group", "ticker", "video"].includes(settings.scene_mode) ? settings.scene_mode : "auto",
    selected_match_id: value(settings.selected_match_id),
    selected_group_id: value(settings.selected_group_id),
    include_prematch_scenes: settings.include_prematch_scenes !== false,
    include_lineup_scenes: settings.include_lineup_scenes === true,
    include_stats_scenes: settings.include_stats_scenes === true,
    include_info_scenes: settings.include_info_scenes === true,
    include_goal_detail_scenes: settings.include_goal_detail_scenes === true,
    include_event_detail_scenes: settings.include_event_detail_scenes === true,
    include_match_scenes: settings.include_match_scenes !== false,
    include_match_video_scenes: settings.include_match_video_scenes === true,
    include_group_scenes: settings.include_group_scenes !== false,
    include_ticker_scene: settings.include_ticker_scene === true,
    include_video_scene: settings.include_video_scene === true,
    enable_video_sound: settings.enable_video_sound !== false,
    video_playlist_urls: settings.video_playlist_urls ?? "",
    match_background_url: sceneBackgroundSetting(settings.match_background_url, DEFAULT_SETTINGS.match_background_url),
    match_video_background_url: sceneBackgroundSetting(settings.match_video_background_url, DEFAULT_SETTINGS.match_video_background_url),
    standings_background_url: sceneBackgroundSetting(settings.standings_background_url, DEFAULT_SETTINGS.standings_background_url),
    info_background_url: sceneBackgroundSetting(settings.info_background_url, DEFAULT_SETTINGS.info_background_url),
    ticker_background_url: sceneBackgroundSetting(settings.ticker_background_url, DEFAULT_SETTINGS.ticker_background_url)
  };
}

function sceneBackgroundSetting(input, fallback) {
  const url = value(input, fallback).trim();
  if (SCENE_DEFAULT_BACKGROUNDS.has(url) && url !== fallback) return fallback;
  return LEGACY_SCOREBOARD_BACKGROUNDS.has(url) ? fallback : url;
}

function cssUrl(url) {
  return `url("${value(url).replaceAll("\\", "/").replaceAll('"', "%22")}")`;
}

function normalizeScorers(input) {
  if (Array.isArray(input)) {
    return input
      .map(item => typeof item === "string"
        ? item
        : value(item?.label || item?.name || item?.player || item?.player_name || item?.scorer)
      )
      .map(item => item.trim())
      .filter(Boolean)
      .join(" • ");
  }
  if (input && typeof input === "object") {
    return normalizeScorers(Object.values(input));
  }
  const raw = value(input).trim();
  if (!raw || raw.toLowerCase() === "null") return "";
  return raw
    .replace(/^\{|\}$/g, "")
    .split(/","|',\s*'|,\s*(?=[A-ZÀ-Ý])/)
    .map(item => item.replace(/^["']|["']$/g, "").trim())
    .filter(Boolean)
    .join(" • ");
}

function matchScorers(match, side) {
  const direct = normalizeScorers(
    match[`${side}_scorers`]
    || match[`${side}_goals`]
    || match[`${side}_goal_scorers`]
    || match[`${side}_goalscorers`]
  );
  if (direct) return direct;

  const generic = normalizeScorers(match.scorers);
  if (!generic) return "";
  const team = value(match[side]).toLocaleLowerCase("fr");
  if (!team) return generic;
  return generic
    .split(/[|;\n]/)
    .map(item => item.trim())
    .filter(item => item.toLocaleLowerCase("fr").includes(team))
    .map(item => item.replace(new RegExp(`^${team}\\s*[:\\-–—]?\\s*`, "i"), ""))
    .join(" • ");
}

function parseTimelineText(input) {
  return value(input)
    .split(/\n|;/)
    .map(item => item.trim())
    .filter(Boolean)
    .map(item => {
      const match = item.match(/^(\d{1,3})\s*['’′]?\s*(.*)$/);
      if (!match) return { minute: "", text: item };
      return {
        minute: `${match[1].padStart(2, "0")}’`,
        text: match[2].replace(/^[-–—:]\s*/, "").trim()
      };
    })
    .filter(item => item.text);
}

function timelineEventLabel(event) {
  return value(
    event?.text
    || event?.label
    || event?.description
    || event?.event
    || event?.title
  ).trim();
}

function normalizeTimeline(match) {
  const source = match.timeline || match.timeline_events || match.highlights || match.events || match.live_timeline || match.match_events;
  if (Array.isArray(source)) {
    return source
      .map(event => {
        if (typeof event === "string") return parseTimelineText(event)[0];
        const minute = value(event?.minute_label || event?.minute || event?.time || event?.elapsed).replace(/['’′]?$/, "");
        return {
          id: value(event?.id),
          minute: minute ? `${minute.padStart(2, "0")}’` : "",
          type: value(event?.type || event?.kind).trim(),
          raw_type: value(event?.raw_type || event?.event).trim(),
          team: value(event?.team).trim(),
          player: value(event?.player || event?.scorer || event?.name).trim(),
          info: value(event?.info || event?.assist || event?.player_in || event?.playerOut).trim(),
          text: timelineEventLabel(event)
        };
      })
      .filter(item => item?.text);
  }
  return parseTimelineText(source);
}

function goalTimelineEvents(match) {
  return normalizeTimeline(match)
    .filter(event => value(event.type).toLowerCase() === "goal" || /^but\s*:/i.test(value(event.text)));
}

function goalEventMinuteNumber(event) {
  const minute = Number.parseInt(value(event.minute), 10);
  return Number.isFinite(minute) ? minute : -1;
}

function latestGoalTimelineEvent(match, side = "") {
  const teamName = value(match?.[side]).toLocaleLowerCase("fr");
  const candidates = goalTimelineEvents(match)
    .filter(event => {
      if (!teamName) return true;
      const text = value(event.text).toLocaleLowerCase("fr");
      const eventTeam = value(event.team).toLocaleLowerCase("fr");
      return !eventTeam || eventTeam === teamName || text.includes(teamName);
    })
    .sort((left, right) => goalEventMinuteNumber(right) - goalEventMinuteNumber(left));
  return candidates[0] || goalTimelineEvents(match).sort((left, right) => goalEventMinuteNumber(right) - goalEventMinuteNumber(left))[0] || null;
}

function scorerFromGoalEvent(event) {
  const explicit = value(event?.player || event?.scorer || event?.name).trim();
  if (explicit) return explicit;
  return value(event?.text)
    .replace(/^but\s*:\s*/i, "")
    .replace(/\s*[([][^)\]]+[)\]].*$/g, "")
    .replace(/\s*—.*$/g, "")
    .trim();
}

function timelineEventKey(match, event) {
  return [
    matchKey(match),
    value(event.id),
    value(event.type).toLowerCase(),
    value(event.minute),
    value(event.team),
    value(event.player),
    value(event.text)
  ].join("|");
}

function eventSceneType(type) {
  const normalized = value(type).toLowerCase();
  if (["yellow-card", "red-card"].includes(normalized)) return "card-detail";
  if (normalized === "substitution") return "substitution-detail";
  if (normalized === "half-time") return "half-time-detail";
  if (normalized === "full-time") return "full-time-detail";
  return "";
}

function eventSceneLabel(type) {
  const normalized = value(type).toLowerCase();
  if (normalized === "yellow-card") return "CARTON JAUNE";
  if (normalized === "red-card") return "CARTON ROUGE";
  if (normalized === "substitution") return "REMPLACEMENT";
  if (normalized === "half-time") return "MI-TEMPS";
  if (normalized === "full-time") return "FIN DU MATCH";
  return "TEMPS FORT";
}

function eventSceneSubtype(type) {
  const normalized = value(type).toLowerCase();
  if (normalized === "yellow-card") return "Avertissement";
  if (normalized === "red-card") return "Exclusion";
  if (normalized === "substitution") return "Changement";
  if (normalized === "half-time") return "Pause";
  if (normalized === "full-time") return "Résumé";
  return "Live";
}

function eventTeamSide(match, event) {
  const eventTeam = value(event.team).toLocaleLowerCase("fr");
  if (eventTeam && eventTeam.includes(value(match.away).toLocaleLowerCase("fr"))) return "away";
  if (eventTeam && eventTeam.includes(value(match.home).toLocaleLowerCase("fr"))) return "home";
  return "";
}

function eventMainText(event) {
  return value(event.player).trim()
    || value(event.text)
      .replace(/^(carton jaune|carton rouge|deuxième jaune\s*\/\s*rouge|changement|mi-temps|fin du match)\s*:\s*/i, "")
      .trim()
    || "Temps fort";
}

function makeEventScene(match, event) {
  const type = eventSceneType(event.type);
  if (!type) return null;
  const side = eventTeamSide(match, event);
  return {
    type,
    id: `${type}-${timelineEventKey(match, event)}`,
    data: {
      match,
      event,
      side,
      team: side ? value(match[side], "Équipe") : "Match",
      minute: value(event.minute),
      label: eventSceneLabel(event.type),
      subtype: eventSceneSubtype(event.type),
      main: eventMainText(event),
      text: value(event.text),
      score: matchScore(match)
    }
  };
}

function eventDetailScenesForMatch(match) {
  return normalizeTimeline(match)
    .map(event => makeEventScene(match, event))
    .filter(Boolean);
}

function detectTimelineEventScenes(matches) {
  const nextKeys = new Set();
  const scenes = [];
  matches.forEach(match => {
    normalizeTimeline(match).forEach(event => {
      const scene = makeEventScene(match, event);
      if (!scene) return;
      const key = timelineEventKey(match, event);
      nextKeys.add(key);
      if (timelineEventBaselineReady && !previousTimelineEventKeys.has(key)) {
        scenes.push(scene);
      }
    });
  });
  previousTimelineEventKeys = nextKeys;
  timelineEventBaselineReady = true;
  return scenes;
}

function scorerTimelineRows(scorers, sideName) {
  if (!scorers) return [];
  return scorers
    .split(" • ")
    .map(item => {
      const minute = item.match(/(\d{1,3})(?:\+\d+)?\s*['’′]/)?.[0]?.replace(/['′]/g, "’") || "";
      const player = item.replace(/\s*\d{1,3}(?:\+\d+)?\s*['’′].*$/, "").trim();
      return {
        minute,
        text: `But ${sideName}${player ? ` : ${player}` : ""}.`
      };
    })
    .filter(item => item.minute || item.text);
}

function fallbackTimelineRows(match) {
  if (isUpcoming(match)) return [];
  const rows = [];
  rows.push(...scorerTimelineRows(matchScorers(match, "home"), value(match.home, "équipe 1")));
  rows.push(...scorerTimelineRows(matchScorers(match, "away"), value(match.away, "équipe 2")));
  if (isHalfTime(match) || isFinished(match)) {
    rows.push({ minute: "45’", text: `Mi-temps : ${scoreNumber(match.home_score)}–${scoreNumber(match.away_score)}.` });
  }
  return rows
    .filter((row, index, list) => list.findIndex(item => item.minute === row.minute && item.text === row.text) === index)
    .slice(-5);
}

function matchTimelineRows(match) {
  const manualRows = normalizeTimeline(match);
  return manualRows.length ? manualRows.slice(-6) : fallbackTimelineRows(match);
}

function formatMatchDateTime(input) {
  if (!input) return "";
  const date = new Date(input);
  if (Number.isNaN(date.getTime())) return value(input);
  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

function normalizeLineup(input) {
  if (!input) return [];
  if (Array.isArray(input)) return input;
  if (typeof input === "object") return Object.values(input);
  const raw = value(input).trim();
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed;
  } catch {
    // Texte libre : une ligne ou un séparateur par joueur.
  }
  return raw
    .split(/\n|;|\|/)
    .map(name => ({ name: name.trim() }))
    .filter(player => player.name);
}

function lineupHtml(input) {
  const players = normalizeLineup(input).slice(0, 11);
  if (!players.length) {
    return `<div class="pre-match-lineup-empty">Composition à confirmer</div>`;
  }

  return players.map((player, index) => {
    const shirt = value(player.shirtNumber || player.shirt_number || player.number).trim();
    const name = value(player.name || player.player || player.player_name, `Joueur ${index + 1}`);
    const position = value(player.position).trim();
    return `
      <div class="pre-match-player">
        <span>${escapeHtml(shirt || String(index + 1))}</span>
        <strong>${escapeHtml(name)}</strong>
        ${position ? `<small>${escapeHtml(position)}</small>` : ""}
      </div>
    `;
  }).join("");
}

function lineupPositionGroup(player, index) {
  const position = value(player.position || player.role || player.type).trim().toUpperCase();
  if (/\b(GK|GOAL|KEEPER|GARDIEN)\b/.test(position)) return "gk";
  if (/\b(DF|DEF|BACK|DÉF|DEFENDER|DÉFENSEUR)\b/.test(position)) return "df";
  if (/\b(MF|MID|MIL|MIDFIELDER|MILIEU)\b/.test(position)) return "mf";
  if (/\b(FW|FWD|ATT|STRIKER|FORWARD|WINGER|ATTAQUANT)\b/.test(position)) return "fw";
  if (index === 0) return "gk";
  if (index <= 4) return "df";
  if (index <= 8) return "mf";
  return "fw";
}

function lineupPitchPlayerHtml(player, index) {
  const shirt = value(player.shirtNumber || player.shirt_number || player.number).trim();
  const name = value(player.name || player.player || player.player_name, `Joueur ${index + 1}`);
  const position = value(player.position).trim();
  return `
    <div class="lineups-pitch-player">
      <span>${escapeHtml(shirt || String(index + 1))}</span>
      <strong>${escapeHtml(name)}</strong>
      ${position ? `<small>${escapeHtml(position)}</small>` : ""}
    </div>
  `;
}

function detailedLineupHtml(input) {
  const players = normalizeLineup(input).slice(0, 11);
  if (!players.length) {
    return `<div class="lineups-empty">Composition à confirmer</div>`;
  }

  const groups = { fw: [], mf: [], df: [], gk: [] };
  players.forEach((player, index) => {
    groups[lineupPositionGroup(player, index)].push({ player, index });
  });

  return `
    <div class="lineups-pitch">
      ${["fw", "mf", "df", "gk"].map(group => `
        <div class="lineups-pitch-row lineups-pitch-row-${group}" style="--players:${Math.max(groups[group].length, 1)}">
          ${groups[group].map(({ player, index }) => lineupPitchPlayerHtml(player, index)).join("")}
        </div>
      `).join("")}
    </div>
  `;
}

function normalizeStats(input) {
  if (!input) return {};
  if (typeof input === "object" && !Array.isArray(input)) return input;
  const raw = value(input).trim();
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function statValue(stats, keys) {
  for (const key of keys) {
    const direct = stats[key];
    if (direct !== undefined && direct !== null && direct !== "") return direct;
  }
  return null;
}

function numericStat(stats, keys) {
  const raw = statValue(stats, keys);
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function percentStat(stats, keys) {
  const value = numericStat(stats, keys);
  return value === null ? null : Math.max(0, Math.min(100, value));
}

function statsRows(match) {
  const home = normalizeStats(match.home_statistics || match.home_stats);
  const away = normalizeStats(match.away_statistics || match.away_stats);
  const rows = [
    { label: "Possession", type: "percent", home: percentStat(home, ["ball_possession", "possession"]), away: percentStat(away, ["ball_possession", "possession"]) },
    { label: "Tirs", home: numericStat(home, ["shots", "total_shots"]), away: numericStat(away, ["shots", "total_shots"]) },
    { label: "Tirs cadrés", home: numericStat(home, ["shots_on_goal", "shots_on_target"]), away: numericStat(away, ["shots_on_goal", "shots_on_target"]) },
    { label: "Corners", home: numericStat(home, ["corner_kicks", "corners"]), away: numericStat(away, ["corner_kicks", "corners"]) },
    { label: "Fautes", home: numericStat(home, ["fouls"]), away: numericStat(away, ["fouls"]) },
    { label: "Hors-jeu", home: numericStat(home, ["offsides"]), away: numericStat(away, ["offsides"]) },
    { label: "Cartons jaunes", home: numericStat(home, ["yellow_cards"]), away: numericStat(away, ["yellow_cards"]) },
    { label: "Arrêts", home: numericStat(home, ["saves"]), away: numericStat(away, ["saves"]) }
  ];
  return rows.filter(row => row.home !== null || row.away !== null);
}

function statRowHtml(row) {
  const home = row.home ?? 0;
  const away = row.away ?? 0;
  const total = row.type === "percent" ? 100 : Math.max(1, home + away);
  const homeWidth = row.type === "percent" ? home : Math.round((home / total) * 100);
  const awayWidth = row.type === "percent" ? away : Math.round((away / total) * 100);
  const suffix = row.type === "percent" ? "%" : "";
  return `
    <div class="stats-row">
      <span class="stats-value">${home}${suffix}</span>
      <div class="stats-meter">
        <div class="stats-meter__home" style="width:${homeWidth}%"></div>
        <strong>${escapeHtml(row.label)}</strong>
        <div class="stats-meter__away" style="width:${awayWidth}%"></div>
      </div>
      <span class="stats-value">${away}${suffix}</span>
    </div>
  `;
}

function matchStageLabel(match) {
  const stage = value(match.round || match.stage || match.football_data_stage || match.phase).trim();
  if (!stage) return "Avant-match";
  return stage
    .replaceAll("_", " ")
    .replace(/\bround of\b/i, "Round of")
    .toUpperCase();
}

function sceneBackgroundUrl(type) {
  if (type === "group") return currentSettings.standings_background_url;
  if (type === "ticker") return currentSettings.ticker_background_url;
  if (type === "video") return currentSettings.ticker_background_url;
  if (type === "info") return currentSettings.info_background_url;
  if (type === "match-video") return currentSettings.match_video_background_url;
  return currentSettings.match_background_url;
}

function applySceneBackground(type) {
  const background = cssUrl(sceneBackgroundUrl(type));
  document.documentElement.style.setProperty("--scene-bg", background);
  document.body.style.setProperty("background", `#020817 ${background} center / cover no-repeat`, "important");
}

function applyDisplaySettings() {
  const root = document.documentElement.style;
  root.setProperty("--info-title-font-size", `${currentSettings.info_title_font_size}px`);
  root.setProperty("--info-details-font-size", `${currentSettings.info_details_font_size}px`);
  root.setProperty("--info-date-font-size", `${currentSettings.info_date_font_size}px`);
  root.setProperty("--live-updates-font-size", `${currentSettings.live_updates_font_size}px`);
  root.setProperty("--live-updates-score-font-size", `${currentSettings.live_updates_score_font_size}px`);
}

function escapeHtml(input) {
  return value(input)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function isFinished(match) {
  const values = ["FT", "FIN", "TERMINÉ", "TERMINE"];
  return values.includes(value(match.minute).trim().toUpperCase())
    || values.includes(value(match.status).trim().toUpperCase());
}

function isHalfTime(match) {
  const values = ["HT", "HALF", "HALFTIME", "HALF-TIME", "HALF TIME", "MT", "MI-TEMPS", "MI TEMPS", "PAUSE"];
  return values.includes(value(match.minute).trim().toUpperCase())
    || values.includes(value(match.status).trim().toUpperCase());
}

function isUpcoming(match) {
  const status = value(match.status).trim().toUpperCase();
  const minute = value(match.minute).trim().toUpperCase();
  return ["À VENIR", "A VENIR", "AVENIR", "PROGRAMMÉ", "PROGRAMME"].includes(status)
    || ["À VENIR", "A VENIR", "AVENIR"].includes(minute);
}

function isLive(match) {
  return !isUpcoming(match) && !isHalfTime(match) && !isFinished(match);
}

function displayStatus(match) {
  if (isFinished(match)) return "TERMINÉ";
  if (isHalfTime(match)) return "MI-TEMPS";
  if (isUpcoming(match)) return "À VENIR";
  return value(match.status, "EN DIRECT");
}

function shouldShowMatchMinute(match) {
  if (isUpcoming(match) || isHalfTime(match) || isFinished(match)) return false;
  return Boolean(matchDisplayMinute(match));
}

function matchDisplayMinute(match) {
  if (isUpcoming(match) || isHalfTime(match) || isFinished(match)) return "";
  const minute = value(match.minute).trim();
  if (["EN DIRECT", "LIVE"].includes(minute.toUpperCase())) return "EN DIRECT";
  if (minute && !["EN DIRECT", "LIVE"].includes(minute.toUpperCase())) return minute;
  return "";
}

function isKnockoutMatch(match) {
  if (match.phase === "group") return false;
  if (match.phase === "knockout") return true;
  return !["group", ""].includes(value(match.type || match.round || match.phase).toLowerCase());
}

function hasPenaltyShootout(match) {
  return isKnockoutMatch(match)
    && scoreNumber(match.home_score) === scoreNumber(match.away_score)
    && (scoreNumber(match.home_penalty_score) > 0 || scoreNumber(match.away_penalty_score) > 0);
}

function winnerSide(match) {
  const homeScore = scoreNumber(match.home_score);
  const awayScore = scoreNumber(match.away_score);
  if (homeScore > awayScore) return "home";
  if (awayScore > homeScore) return "away";
  if (!hasPenaltyShootout(match)) return "";
  const homePens = scoreNumber(match.home_penalty_score);
  const awayPens = scoreNumber(match.away_penalty_score);
  if (homePens > awayPens) return "home";
  if (awayPens > homePens) return "away";
  return "";
}

function qualifiedTeamName(match) {
  const side = winnerSide(match);
  return side === "home"
    ? value(match.home, "Équipe 1")
    : side === "away"
      ? value(match.away, "Équipe 2")
      : "";
}

function shouldShowQualifiedBadge(match) {
  return isFinished(match) && isKnockoutMatch(match) && Boolean(winnerSide(match));
}

function scoreWithPenalties(match) {
  const base = `${scoreNumber(match.home_score)} - ${scoreNumber(match.away_score)}`;
  return hasPenaltyShootout(match)
    ? `${base} (TAB ${scoreNumber(match.home_penalty_score)}-${scoreNumber(match.away_penalty_score)})`
    : base;
}

function kickoffTime(match) {
  if (!match?.kickoff) return null;
  const date = new Date(match.kickoff);
  const time = date.getTime();
  return Number.isNaN(time) ? null : time;
}

function finishedTime(match) {
  if (match?.finished_at) {
    const explicitEnd = new Date(match.finished_at).getTime();
    if (!Number.isNaN(explicitEnd)) return explicitEnd;
  }

  const kickoffMs = kickoffTime(match);
  if (!kickoffMs) return null;

  const estimatedDurationMinutes = match.phase === "knockout" ? 150 : 120;
  return kickoffMs + estimatedDurationMinutes * 60_000;
}

function isVisibleInScoreScenes(match, now = Date.now()) {
  const kickoffMs = kickoffTime(match);

  if (isFinished(match)) {
    const finishedMs = finishedTime(match);
    if (!finishedMs) return false;
    return now <= finishedMs + currentSettings.score_scene_after_minutes * 60_000;
  }

  if (isLive(match) || isHalfTime(match)) return true;

  if (isUpcoming(match)) {
    if (!kickoffMs) return false;
    const beforeWindowMs = currentSettings.score_scene_before_minutes * 60_000;
    return kickoffMs >= now && kickoffMs - now <= beforeWindowMs;
  }

  return true;
}

function autoMinute(kickoffMs, now = Date.now()) {
  const elapsedMinutes = Math.floor((now - kickoffMs) / 60_000) + 1;
  return `${Math.max(1, elapsedMinutes)}'`;
}

function withAutoMatchState(match, now = Date.now()) {
  if (!currentSettings.auto_start_matches || isFinished(match)) return match;
  const kickoffMs = kickoffTime(match);
  if (!kickoffMs || now < kickoffMs) return match;
  if (!isUpcoming(match)) {
    const minute = value(match.minute).trim().toUpperCase();
    if (isLive(match) && ["", "LIVE", "EN DIRECT"].includes(minute)) {
      return {
        ...match,
        minute: "live",
        _autoStarted: true,
        _kickoffMs: kickoffMs
      };
    }
    return match;
  }

  return {
    ...match,
    status: "En direct",
    minute: "live",
    _autoStarted: true,
    _kickoffMs: kickoffMs
  };
}

function matchKey(match) {
  return value(
    match.id,
    [
      match.kickoff,
      match.phase,
      match.group_id,
      match.home_code,
      match.home,
      match.away_code,
      match.away
    ].map(part => value(part).trim().toLowerCase()).join("|")
  );
}

function matchScore(match) {
  return {
    home: scoreNumber(match.home_score),
    away: scoreNumber(match.away_score)
  };
}

function detectGoalEvents(matches) {
  const nextScores = new Map();
  const events = [];

  matches.forEach(match => {
    const key = matchKey(match);
    const current = matchScore(match);
    nextScores.set(key, current);

    if (!scoreBaselineReady) return;

    const previous = previousScoreByMatch.get(key);
    if (!previous) return;

    const homeDelta = current.home - previous.home;
    const awayDelta = current.away - previous.away;
    if (homeDelta <= 0 && awayDelta <= 0) return;

    if (homeDelta > 0) {
      const goal = latestGoalTimelineEvent(match, "home");
      events.push({
        key,
        match,
        side: "home",
        team: value(match.home, "Équipe 1"),
        scorer: scorerFromGoalEvent(goal) || "Buteur",
        minute: value(goal?.minute),
        goalText: value(goal?.text),
        score: current
      });
    }

    if (awayDelta > 0) {
      const goal = latestGoalTimelineEvent(match, "away");
      events.push({
        key,
        match,
        side: "away",
        team: value(match.away, "Équipe 2"),
        scorer: scorerFromGoalEvent(goal) || "Buteur",
        minute: value(goal?.minute),
        goalText: value(goal?.text),
        score: current
      });
    }
  });

  previousScoreByMatch = nextScores;
  scoreBaselineReady = true;
  return events;
}

function detectKickoffEvents(matches) {
  const nextAutoLive = new Map();
  const events = [];
  const now = Date.now();

  matches.forEach(match => {
    const key = matchKey(match);
    const autoLive = match._autoStarted === true;
    nextAutoLive.set(key, autoLive);

    if (!autoLive || kickoffAlertShown.has(key)) return;

    const startedRecently = match._kickoffMs && now - match._kickoffMs >= 0 && now - match._kickoffMs <= KICKOFF_ALERT_WINDOW;
    const wasAutoLive = previousAutoLiveByMatch.get(key) === true;
    const justStarted = autoLiveBaselineReady && !wasAutoLive;
    if (!justStarted && !startedRecently) return;

    kickoffAlertShown.add(key);
    events.push({
      key,
      match,
      side: "kickoff",
      label: "COUP D’ENVOI",
      team: `${value(match.home, "Équipe 1")} - ${value(match.away, "Équipe 2")}`,
      score: {
        home: scoreNumber(match.home_score),
        away: scoreNumber(match.away_score)
      }
    });
  });

  previousAutoLiveByMatch = nextAutoLive;
  autoLiveBaselineReady = true;
  return events;
}

function shouldShowSoundUnlock() {
  if (!currentSettings.enable_goal_sound && !currentSettings.enable_video_sound) return false;
  if (videoPlaybackBlocked) return true;
  return params.get("sound") === "unlock" || params.get("debug") === "1";
}

async function unlockSound() {
  if (params.get("sound") === "0" || (!currentSettings.enable_goal_sound && !currentSettings.enable_video_sound)) return false;

  try {
    if (currentSettings.enable_goal_sound) {
      audioContext ||= new (window.AudioContext || window.webkitAudioContext)();
      await audioContext.resume?.();
      soundUnlocked = audioContext.state === "running";
    } else {
      soundUnlocked = true;
    }
    videoPlaybackBlocked = false;
    playPlaylistVideo();
    elements.soundUnlock.hidden = !shouldShowSoundUnlock() || soundUnlocked;
    return soundUnlocked;
  } catch {
    elements.soundUnlock.hidden = !shouldShowSoundUnlock();
    return false;
  }
}

async function playGoalSound() {
  if (params.get("sound") === "0" || !currentSettings.enable_goal_sound) return;

  try {
    const unlocked = soundUnlocked || await unlockSound();
    if (!unlocked) return;

    const now = audioContext.currentTime;
    const master = audioContext.createGain();
    master.gain.setValueAtTime(0.0001, now);
    master.gain.exponentialRampToValueAtTime(0.18, now + 0.025);
    master.gain.exponentialRampToValueAtTime(0.0001, now + 1.18);
    master.connect(audioContext.destination);

    [
      { frequency: 196, start: 0, duration: 0.16 },
      { frequency: 392, start: 0.08, duration: 0.24 },
      { frequency: 587.33, start: 0.18, duration: 0.42 }
    ].forEach(tone => {
      const oscillator = audioContext.createOscillator();
      const gain = audioContext.createGain();
      oscillator.type = "sawtooth";
      oscillator.frequency.setValueAtTime(tone.frequency, now + tone.start);
      oscillator.frequency.exponentialRampToValueAtTime(tone.frequency * 1.08, now + tone.start + tone.duration);
      gain.gain.setValueAtTime(0.0001, now + tone.start);
      gain.gain.exponentialRampToValueAtTime(0.35, now + tone.start + 0.025);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + tone.start + tone.duration);
      oscillator.connect(gain);
      gain.connect(master);
      oscillator.start(now + tone.start);
      oscillator.stop(now + tone.start + tone.duration + 0.04);
    });
  } catch {
    // Certains navigateurs bloquent le son sans interaction utilisateur.
    // L'animation visuelle reste active dans tous les cas.
    elements.soundUnlock.hidden = !shouldShowSoundUnlock();
  }
}

function triggerGoalAlert(event) {
  if (!event) return;
  if (!currentSettings.show_goal_alert) return;

  elements.goalTeam.textContent = event.team;
  elements.goalScoreLine.textContent = `${event.score.home} - ${event.score.away}`;
  elements.goalLabel.textContent = event.label || "BUT";
  elements.goalAlert.classList.remove("is-visible", "goal-home", "goal-away", "kickoff-alert");
  if (event.side === "kickoff") {
    elements.goalAlert.classList.add("kickoff-alert");
  } else {
    elements.goalAlert.classList.add(event.side === "home" ? "goal-home" : "goal-away");
  }
  elements.scoreboard.classList.toggle("goal-home", event.side === "home");
  elements.scoreboard.classList.toggle("goal-away", event.side === "away");
  elements.goalAlert.setAttribute("aria-hidden", "false");
  void elements.goalAlert.offsetWidth;
  elements.goalAlert.classList.add("is-visible");
  elements.scoreboard.classList.remove("goal-flash");
  void elements.scoreboard.offsetWidth;
  elements.scoreboard.classList.add("goal-flash");
  playGoalSound();

  window.clearTimeout(goalAlertTimer);
  goalAlertTimer = window.setTimeout(() => {
    elements.goalAlert.classList.remove("is-visible", "goal-home", "goal-away");
    elements.goalAlert.classList.remove("kickoff-alert");
    elements.goalAlert.setAttribute("aria-hidden", "true");
    elements.scoreboard.classList.remove("goal-flash", "goal-home", "goal-away");
  }, GOAL_ALERT_DURATION);
}

function renderPagination() {
  elements.pagination.innerHTML = scenes
    .map((_, index) => `<span class="${index === activeScene ? "active" : ""}"></span>`)
    .join("");
}

function groupLabel(match, groups) {
  const groupId = inferGroupId(match, groups);
  const group = groups.find(item => item.id === groupId);
  if (group?.name) return group.name;
  if (match.phase === "group") return value(match.group_id, "Phase de groupes");
  return value(match.round, match.phase === "knockout" ? "Élimination directe" : "");
}

function kickoffLabel(match) {
  if (!match.kickoff) return "";
  const date = new Date(match.kickoff);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

function tickerMessage(match, groups) {
  const home = value(match.home, "Équipe 1");
  const away = value(match.away, "Équipe 2");
  const score = scoreWithPenalties(match);
  const label = groupLabel(match, groups);
  const qualified = qualifiedTeamName(match);

  if (isFinished(match)) {
    return `<strong>Terminé</strong> ${escapeHtml(label)} — ${escapeHtml(home)} ${escapeHtml(score)} ${escapeHtml(away)}${qualified ? ` • ${escapeHtml(qualified)} qualifié` : ""}`;
  }

  if (isUpcoming(match)) {
    const kickoff = kickoffLabel(match);
    return `<strong>À venir</strong> ${escapeHtml(label)} — ${escapeHtml(home)} - ${escapeHtml(away)}${kickoff ? ` • ${escapeHtml(kickoff)}` : ""}`;
  }

  return `<strong>En direct</strong> ${escapeHtml(label)} — ${escapeHtml(home)} ${score} ${escapeHtml(away)} • ${escapeHtml(matchDisplayMinute(match) || value(match.status, "LIVE"))}`;
}

function tickerEventLabel(event) {
  const type = value(event.type).toLowerCase();
  if (type === "goal") return "But";
  if (type === "yellow-card") return "Carton jaune";
  if (type === "red-card") return "Carton rouge";
  if (type === "substitution") return "Remplacement";
  if (type === "half-time") return "Mi-temps";
  if (type === "full-time") return "Fin";
  if (type === "penalty-scored") return "TAB marqué";
  if (type === "penalty-missed") return "TAB raté";
  return "Temps fort";
}

function tickerEventMessages(match, groups) {
  const label = groupLabel(match, groups);
  const fixture = `${value(match.home, "Équipe 1")} - ${value(match.away, "Équipe 2")}`;
  return normalizeTimeline(match)
    .filter(event => value(event.type))
    .slice(-4)
    .reverse()
    .map(event => {
      const minute = value(event.minute);
      return `<strong>${escapeHtml(tickerEventLabel(event))}</strong> ${escapeHtml(label)} — ${escapeHtml(fixture)}${minute ? ` • ${escapeHtml(minute)}’` : ""} • ${escapeHtml(value(event.text))}`;
    });
}

function tickerStatsMessage(match) {
  if (!isLive(match)) return "";
  const rows = statsRows(match);
  if (!rows.length) return "";
  const possession = rows.find(row => row.label === "Possession");
  const shots = rows.find(row => row.label === "Tirs cadrés") || rows.find(row => row.label === "Tirs");
  const bits = [];
  if (possession) bits.push(`Possession ${possession.home ?? 0}% - ${possession.away ?? 0}%`);
  if (shots) bits.push(`${shots.label} ${shots.home ?? 0}-${shots.away ?? 0}`);
  if (!bits.length) return "";
  return `<strong>Stats live</strong> ${escapeHtml(value(match.home, "Équipe 1"))} - ${escapeHtml(value(match.away, "Équipe 2"))} • ${escapeHtml(bits.join(" • "))}`;
}

function enrichedTickerMessages(matches, groups) {
  const orderedMatches = [...matches].sort((left, right) => {
    const statusRank = match => isLive(match) ? 0 : isUpcoming(match) ? 1 : 2;
    const rankDiff = statusRank(left) - statusRank(right);
    if (rankDiff) return rankDiff;
    return value(left.kickoff).localeCompare(value(right.kickoff));
  });

  const baseMessages = orderedMatches.slice(0, 14).map(match => tickerMessage(match, groups));
  const eventMessages = orderedMatches.flatMap(match => tickerEventMessages(match, groups)).slice(0, 10);
  const statMessages = orderedMatches.map(tickerStatsMessage).filter(Boolean).slice(0, 4);

  return [
    ...eventMessages.slice(0, 5),
    ...baseMessages,
    ...eventMessages.slice(5),
    ...statMessages
  ].filter(Boolean);
}

function liveUpdateRows(matches, groups) {
  const orderedMatches = [...matches].sort((left, right) => {
    const statusRank = match => isLive(match) ? 0 : isUpcoming(match) ? 1 : 2;
    const rankDiff = statusRank(left) - statusRank(right);
    if (rankDiff) return rankDiff;
    return value(left.kickoff).localeCompare(value(right.kickoff));
  });

  return orderedMatches.slice(0, 5).map(match => {
    const status = isFinished(match) ? "Terminé" : isUpcoming(match) ? "À venir" : "En direct";
    const upcoming = isUpcoming(match);
    const score = isUpcoming(match)
      ? kickoffLabel(match) || value(match.status, "À venir")
      : scoreWithPenalties(match);
    const qualified = qualifiedTeamName(match);
    return {
      status,
      group: groupLabel(match, groups),
      home: value(match.home, "Équipe 1"),
      away: value(match.away, "Équipe 2"),
      score,
      scoreType: upcoming ? "date" : "score",
      minute: qualified ? "" : isLive(match) ? (matchDisplayMinute(match) || value(match.status, "LIVE")) : "",
      qualified
    };
  });
}

function liveUpdateMetaHtml(row) {
  if (row.qualified) {
    return `<span class="live-update-qualified"><i aria-hidden="true">✓</i>${escapeHtml(row.qualified)}</span>`;
  }
  return `<span class="live-update-minute">${escapeHtml(row.minute)}</span>`;
}

function playlistUrls(input) {
  const raw = Array.isArray(input) ? input.join("\n") : value(input);
  return raw
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(line => line && !line.startsWith("#"));
}

function playPlaylistVideo(index = currentVideoIndex) {
  const players = [
    { video: elements.playlistVideo, empty: elements.playlistEmpty },
    { video: elements.matchPlaylistVideo, empty: elements.matchPlaylistEmpty }
  ].filter(player => player.video);

  if (!players.length) return;
  if (!currentVideoPlaylist.length) {
    players.forEach(({ video, empty }) => {
      video.removeAttribute("src");
      video.load();
      video.hidden = true;
      if (empty) empty.hidden = false;
    });
    return;
  }

  currentVideoIndex = ((index % currentVideoPlaylist.length) + currentVideoPlaylist.length) % currentVideoPlaylist.length;
  const nextSrc = currentVideoPlaylist[currentVideoIndex];

  players.forEach(({ video, empty }, index) => {
    if (empty) empty.hidden = true;
    video.hidden = false;
    video.loop = currentVideoPlaylist.length === 1;
    video.muted = currentSettings.enable_video_sound === false || index > 0;
    video.volume = currentSettings.enable_video_sound === false || index > 0 ? 0 : 1;

    if (video.getAttribute("src") !== nextSrc) {
      video.src = nextSrc;
      video.load();
    }

    video.play().then(() => {
      videoPlaybackBlocked = false;
      elements.soundUnlock.hidden = !shouldShowSoundUnlock() || soundUnlocked;
    }).catch(() => {
      videoPlaybackBlocked = currentSettings.enable_video_sound !== false;
      elements.soundUnlock.hidden = !shouldShowSoundUnlock();
      if (currentSettings.enable_video_sound !== false) {
        video.muted = true;
        video.play().catch(() => {});
      }
    });
  });
}

function syncVideoPlaylist(input) {
  const nextPlaylist = playlistUrls(input);
  const unchanged = nextPlaylist.length === currentVideoPlaylist.length
    && nextPlaylist.every((url, index) => url === currentVideoPlaylist[index]);

  if (unchanged) return;
  currentVideoPlaylist = nextPlaylist;
  currentVideoIndex = 0;
  playPlaylistVideo(0);
}

function renderTicker(matches, groups) {
  if (!elements.tickerTrack) return;
  elements.ticker.hidden = !currentSettings.show_ticker;
  if (!currentSettings.show_ticker) return;

  const messages = enrichedTickerMessages(matches, groups);

  if (!messages.length) {
    messages.push("<strong>Zone Mondial 26</strong> Aucun match publié pour le moment");
  }

  const content = messages.map(message => `<span class="ticker__item">${message}</span>`).join("");
  elements.tickerTrack.innerHTML = `${content}${content}`;
  elements.tickerTrack.style.setProperty("--ticker-duration", `${Math.max(28, messages.length * 6.4)}s`);
}

function renderLiveUpdates(data) {
  elements.scoreboard.classList.remove("show-standings");
  elements.scoreboard.classList.remove("show-video-updates");
  elements.scoreboard.classList.remove("show-info-scene");
  elements.scoreboard.classList.remove("show-match-video");
  elements.scoreboard.classList.remove("show-pre-match");
  elements.scoreboard.classList.remove("show-lineups");
  elements.scoreboard.classList.remove("show-stats");
  elements.scoreboard.classList.remove("show-goal-detail");
  elements.scoreboard.classList.remove("show-event-detail");
  elements.scoreboard.classList.add("show-live-updates");
  elements.competition.textContent = "ZONE MONDIAL 26";
  elements.status.textContent = "LIVE UPDATES";

  const rows = Array.isArray(data.rows) ? data.rows : [];
  elements.liveUpdatesRows.innerHTML = rows.length
    ? rows.map(row => `
        <div class="live-update-row">
          <span class="live-update-status">${escapeHtml(row.status)}</span>
          <span class="live-update-group">${escapeHtml(row.group)}</span>
          <strong>${escapeHtml(row.home)}</strong>
          <span class="live-update-score live-update-score--${escapeHtml(row.scoreType || "score")}">${escapeHtml(row.score)}</span>
          <strong>${escapeHtml(row.away)}</strong>
          ${liveUpdateMetaHtml(row)}
        </div>
      `).join("")
    : `<div class="live-update-empty">Aucun match publié pour le moment</div>`;
}

function renderVideoUpdates(data) {
  elements.scoreboard.classList.remove("show-standings", "show-live-updates", "show-info-scene", "show-match-video", "show-pre-match", "show-lineups", "show-stats", "show-goal-detail", "show-event-detail");
  elements.scoreboard.classList.add("show-video-updates");
  elements.competition.textContent = "ZONE MONDIAL 26";
  elements.status.textContent = "VIDÉOS LIVE";

  const rows = Array.isArray(data.rows) ? data.rows.slice(0, 5) : [];
  elements.videoUpdatesRows.innerHTML = rows.length
    ? rows.map(row => `
        <div class="live-update-row">
          <span class="live-update-status">${escapeHtml(row.status)}</span>
          <span class="live-update-group">${escapeHtml(row.group)}</span>
          <strong>${escapeHtml(row.home)}</strong>
          <span class="live-update-score live-update-score--${escapeHtml(row.scoreType || "score")}">${escapeHtml(row.score)}</span>
          <strong>${escapeHtml(row.away)}</strong>
          ${liveUpdateMetaHtml(row)}
        </div>
      `).join("")
    : `<div class="live-update-empty">Aucun match publié pour le moment</div>`;

  playPlaylistVideo();
}

function renderInfoScene(info) {
  elements.scoreboard.classList.remove("show-standings", "show-live-updates", "show-video-updates", "show-info-scene", "show-match-video", "show-pre-match", "show-lineups", "show-stats", "show-goal-detail", "show-event-detail");
  elements.scoreboard.classList.add("show-info-scene");
  elements.competition.textContent = "ZONE MONDIAL 26";
  elements.status.textContent = "INFO";

  const image = value(info.image || info.image_url || info.picture).trim();
  elements.infoSceneImage.src = image || "logo.png";
  elements.infoSceneImage.alt = value(info.title, "Information Zone Mondial 26");
  elements.infoSceneTitle.textContent = value(info.title, "Information Zone Mondial 26");
  elements.infoSceneDetails.textContent = value(info.details || info.description, "Information à compléter dans admin.html.");
  elements.infoSceneDate.textContent = infoDateLabel(info.date);
  renderInfoScenePagination(info);
}

function renderInfoScenePagination(info) {
  if (!elements.infoScenePagination) return;
  const infoScenes = scenes.filter(scene => scene.type === "info");
  if (infoScenes.length <= 1) {
    elements.infoScenePagination.innerHTML = "";
    return;
  }
  const currentInfoId = value(info.id);
  const currentIndex = Math.max(0, infoScenes.findIndex(scene => value(scene.data?.id) === currentInfoId));
  elements.infoScenePagination.innerHTML = infoScenes.map((scene, index) => `
    <span class="${index === currentIndex ? "active" : ""}">${index + 1}</span>
  `).join("");
}

function infoDateLabel(input) {
  const raw = value(input).trim();
  if (!raw) return "Zone Mondial 26";
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return raw;
  return new Intl.DateTimeFormat("fr-FR", { dateStyle: "long" }).format(date);
}

function animate() {
  elements.scoreboard.classList.remove("is-changing", "is-entering", "is-leaving");
  void elements.scoreboard.offsetWidth;
  elements.scoreboard.classList.add("is-changing", "is-entering");
  window.setTimeout(() => {
    elements.scoreboard.classList.remove("is-changing", "is-entering");
  }, SCENE_ENTER_DURATION);
}

function renderPreMatch(match) {
  elements.scoreboard.classList.remove("show-standings", "show-live-updates", "show-video-updates", "show-info-scene", "show-match-video", "show-lineups", "show-stats", "show-goal-detail", "show-event-detail");
  elements.scoreboard.classList.add("show-pre-match");
  elements.competition.textContent = value(match.competition, "COUPE DU MONDE 2026");
  elements.status.textContent = "AVANT-MATCH";

  elements.preMatchHomeFlag.src = flagUrl(match.home_code, match.home);
  elements.preMatchHomeName.textContent = value(match.home, "Équipe 1");
  elements.preMatchHomeFormation.textContent = value(match.home_formation, "Formation à confirmer");
  elements.preMatchHomeCoach.textContent = value(match.home_coach, "Sélectionneur à confirmer");

  elements.preMatchAwayFlag.src = flagUrl(match.away_code, match.away);
  elements.preMatchAwayName.textContent = value(match.away, "Équipe 2");
  elements.preMatchAwayFormation.textContent = value(match.away_formation, "Formation à confirmer");
  elements.preMatchAwayCoach.textContent = value(match.away_coach, "Sélectionneur à confirmer");

  elements.preMatchKickoff.textContent = match.kickoff
    ? `Coup d’envoi : ${formatMatchDateTime(match.kickoff)}`
    : "Coup d’envoi à confirmer";
  elements.preMatchStage.textContent = matchStageLabel(match);
  elements.preMatchVenue.textContent = value(match.venue, "Stade à confirmer");
  elements.preMatchReferee.textContent = value(match.referee, "Arbitre à confirmer");
  elements.preMatchHomeLineup.innerHTML = lineupHtml(match.home_lineup);
  elements.preMatchAwayLineup.innerHTML = lineupHtml(match.away_lineup);
}

function renderLineups(match) {
  elements.scoreboard.classList.remove("show-standings", "show-live-updates", "show-video-updates", "show-info-scene", "show-match-video", "show-pre-match", "show-stats", "show-goal-detail", "show-event-detail");
  elements.scoreboard.classList.add("show-lineups");
  elements.competition.textContent = value(match.competition, "COUPE DU MONDE 2026");
  elements.status.textContent = "COMPOSITIONS";

  elements.lineupsHomeFlag.src = flagUrl(match.home_code, match.home);
  elements.lineupsHomeName.textContent = value(match.home, "Équipe 1");
  elements.lineupsHomeFormation.textContent = value(match.home_formation, "Formation à confirmer");
  elements.lineupsAwayFlag.src = flagUrl(match.away_code, match.away);
  elements.lineupsAwayName.textContent = value(match.away, "Équipe 2");
  elements.lineupsAwayFormation.textContent = value(match.away_formation, "Formation à confirmer");
  elements.lineupsMatchMeta.textContent = [
    matchStageLabel(match),
    match.kickoff ? formatMatchDateTime(match.kickoff) : "",
    value(match.venue)
  ].filter(Boolean).join(" • ") || "Informations du match à confirmer";
  elements.lineupsHomeRows.innerHTML = detailedLineupHtml(match.home_lineup);
  elements.lineupsAwayRows.innerHTML = detailedLineupHtml(match.away_lineup);
  elements.lineupsHomeCoach.textContent = `Coach : ${value(match.home_coach, "à confirmer")}`;
  elements.lineupsAwayCoach.textContent = `Coach : ${value(match.away_coach, "à confirmer")}`;
  elements.lineupsReferee.textContent = `Arbitre : ${value(match.referee, "à confirmer")}`;
}

function renderStats(match) {
  elements.scoreboard.classList.remove("show-standings", "show-live-updates", "show-video-updates", "show-info-scene", "show-match-video", "show-pre-match", "show-lineups", "show-goal-detail", "show-event-detail");
  elements.scoreboard.classList.add("show-stats");
  elements.competition.textContent = value(match.competition, "COUPE DU MONDE 2026");
  elements.status.textContent = "STATS LIVE";

  elements.statsHomeFlag.src = flagUrl(match.home_code, match.home);
  elements.statsHomeName.textContent = value(match.home, "Équipe 1");
  elements.statsAwayFlag.src = flagUrl(match.away_code, match.away);
  elements.statsAwayName.textContent = value(match.away, "Équipe 2");
  elements.statsHomeScore.textContent = scoreNumber(match.home_score);
  elements.statsAwayScore.textContent = scoreNumber(match.away_score);
  elements.statsMinute.textContent = matchDisplayMinute(match) || displayStatus(match);
  elements.statsMatchMeta.textContent = [
    matchStageLabel(match),
    value(match.venue),
    match.kickoff ? formatMatchDateTime(match.kickoff) : ""
  ].filter(Boolean).join(" • ") || "Statistiques du match";

  const rows = statsRows(match);
  elements.statsRows.innerHTML = rows.length
    ? rows.map(statRowHtml).join("")
    : `<div class="stats-empty">Stats live à confirmer</div>`;
}

function renderGoalDetail(event) {
  const match = event?.match || {};
  elements.scoreboard.classList.remove("show-standings", "show-live-updates", "show-video-updates", "show-info-scene", "show-match-video", "show-pre-match", "show-lineups", "show-stats", "show-event-detail");
  elements.scoreboard.classList.add("show-goal-detail");
  elements.competition.textContent = value(match.competition, "COUPE DU MONDE 2026");
  elements.status.textContent = "BUT";

  const side = event?.side === "away" ? "away" : "home";
  elements.goalDetailFlag.src = flagUrl(match[`${side}_code`], match[side]);
  elements.goalDetailTeam.textContent = value(event?.team || match[side], "Équipe");
  elements.goalDetailMinute.textContent = value(event?.minute, matchDisplayMinute(match) || "BUT");
  elements.goalDetailScorer.textContent = value(event?.scorer, "Buteur");
  elements.goalDetailType.textContent = value(event?.goalText).toLowerCase().includes("penalty")
    ? "Penalty"
    : value(event?.goalText).toLowerCase().includes("csc")
      ? "Contre son camp"
      : "But";
  elements.goalDetailHome.textContent = scoreNumber(event?.score?.home ?? match.home_score);
  elements.goalDetailAway.textContent = scoreNumber(event?.score?.away ?? match.away_score);
  elements.goalDetailMatch.textContent = `${value(match.home, "Équipe 1")} - ${value(match.away, "Équipe 2")}`;
}

function renderEventDetail(data) {
  const match = data?.match || {};
  const side = data?.side;
  elements.scoreboard.classList.remove("show-standings", "show-live-updates", "show-video-updates", "show-info-scene", "show-match-video", "show-pre-match", "show-lineups", "show-stats", "show-goal-detail");
  elements.scoreboard.classList.add("show-event-detail");
  elements.competition.textContent = value(match.competition, "COUPE DU MONDE 2026");
  elements.status.textContent = value(data?.label, "TEMPS FORT");
  elements.eventDetailLabel.textContent = value(data?.label, "TEMPS FORT");
  elements.eventDetailFlag.src = side ? flagUrl(match[`${side}_code`], match[side]) : "logo.png";
  elements.eventDetailTeam.textContent = value(data?.team, "Match");
  elements.eventDetailMinute.textContent = value(data?.minute, displayStatus(match));
  elements.eventDetailMain.textContent = value(data?.main, "Temps fort");
  elements.eventDetailType.textContent = value(data?.subtype, "Live");
  elements.eventDetailHome.textContent = scoreNumber(data?.score?.home ?? match.home_score);
  elements.eventDetailAway.textContent = scoreNumber(data?.score?.away ?? match.away_score);
  elements.eventDetailMatch.textContent = value(data?.text) || `${value(match.home, "Équipe 1")} - ${value(match.away, "Équipe 2")}`;
}

function renderMatch(match) {
  elements.scoreboard.classList.remove("show-standings", "show-live-updates", "show-video-updates", "show-info-scene", "show-match-video", "show-pre-match", "show-lineups", "show-stats", "show-goal-detail", "show-event-detail");
  elements.competition.textContent = value(match.competition, "COUPE DU MONDE 2026");
  elements.status.textContent = displayStatus(match);
  elements.homeFlag.src = flagUrl(match.home_code, match.home);
  elements.homeName.textContent = value(match.home, "Équipe 1");
  elements.homeScore.textContent = value(match.home_score, "0");
  elements.awayScore.textContent = value(match.away_score, "0");
  const homeScorers = matchScorers(match, "home");
  const awayScorers = matchScorers(match, "away");
  if (elements.homeScorers) {
    elements.homeScorers.textContent = homeScorers;
    elements.homeScorers.hidden = !homeScorers;
  }
  if (elements.awayScorers) {
    elements.awayScorers.textContent = awayScorers;
    elements.awayScorers.hidden = !awayScorers;
  }
  elements.penaltyScore.textContent = `TAB ${scoreNumber(match.home_penalty_score)} - ${scoreNumber(match.away_penalty_score)}`;
  elements.penaltyScore.hidden = !hasPenaltyShootout(match);
  elements.awayFlag.src = flagUrl(match.away_code, match.away);
  elements.awayName.textContent = value(match.away, "Équipe 2");
  const winner = shouldShowQualifiedBadge(match) ? winnerSide(match) : "";
  elements.homeQualifiedBadge.hidden = winner !== "home";
  elements.awayQualifiedBadge.hidden = winner !== "away";
  elements.scoreboard.classList.toggle("has-penalties", hasPenaltyShootout(match));
  elements.scoreboard.classList.toggle("winner-home", winner === "home");
  elements.scoreboard.classList.toggle("winner-away", winner === "away");
  elements.minute.textContent = matchDisplayMinute(match);
  elements.minute.hidden = !shouldShowMatchMinute(match);
  elements.minute.classList.toggle("is-finished", isFinished(match));
  elements.minute.classList.toggle("is-live", matchDisplayMinute(match) === "EN DIRECT");
  const timelineRows = matchTimelineRows(match);
  if (elements.matchTimeline && elements.matchTimelineRows) {
    elements.matchTimeline.hidden = !timelineRows.length;
    elements.matchTimelineRows.innerHTML = timelineRows.map(row => `
      <div class="match-timeline__row ${row.type ? `match-timeline__row--${value(row.type).toLowerCase().replace(/[^a-z0-9_-]/g, "")}` : ""}">
        <span>${escapeHtml(row.minute)}</span>
        <p>${escapeHtml(row.text)}</p>
      </div>
    `).join("");
  }
  elements.matchInfo.textContent = value(
    match.info || match.scorers || match.venue || (
      match.kickoff
        ? new Intl.DateTimeFormat("fr-FR", { dateStyle: "long", timeStyle: "short" }).format(new Date(match.kickoff))
        : ""
    ),
    "Scores mis à jour automatiquement"
  );
}

function renderMatchVideo(match) {
  renderMatch(match);
  elements.scoreboard.classList.add("show-match-video");
  playPlaylistVideo();
}

function renderGroup(group) {
  elements.scoreboard.classList.remove("show-live-updates", "show-video-updates", "show-info-scene", "show-match-video", "show-pre-match", "show-lineups", "show-stats", "show-goal-detail", "show-event-detail");
  elements.scoreboard.classList.add("show-standings");
  elements.competition.textContent = value(group.subtitle, "COUPE DU MONDE 2026");
  elements.status.textContent = "CLASSEMENT";
  elements.groupName.textContent = value(group.name, "GROUPE");
  elements.groupSubtitle.textContent = value(group.subtitle, "COUPE DU MONDE 2026");
  const teams = Array.isArray(group.teams) ? group.teams : [];
  elements.standingsRows.innerHTML = teams.map((team, index) => {
    const difference = Number(team.gf || 0) - Number(team.ga || 0);
    const diffLabel = difference > 0 ? `+${difference}` : difference;
    return `
      <div class="standing-row">
        <span>${index + 1}</span>
        <span class="standing-country">
          <img src="${flagUrl(team.code, team.name)}" alt="">
          <strong>${escapeHtml(team.name || "Équipe")}</strong>
        </span>
        <span>${Number(team.played || 0)}</span>
        <span>${Number(team.wins || 0)}</span>
        <span>${Number(team.draws || 0)}</span>
        <span>${Number(team.losses || 0)}</span>
        <span>${Number(team.gf || 0)}</span>
        <span>${Number(team.ga || 0)}</span>
        <span>${diffLabel}</span>
        <span class="standing-points">${Number(team.points || 0)}</span>
      </div>
    `;
  }).join("");
}

function renderScene(options = {}) {
  const shouldAnimate = options.animate !== false;
  if (shouldAnimate) clearTimeout(rotationTimer);
  const token = ++sceneRenderToken;
  if (!scenes.length) {
    elements.scoreboard.classList.remove("show-standings", "show-live-updates", "show-video-updates", "show-info-scene", "show-match-video", "show-pre-match", "show-lineups", "show-stats", "show-goal-detail", "show-event-detail", "scene-group", "scene-live-updates", "scene-video-updates", "scene-info", "scene-match-video", "scene-pre-match", "scene-lineups", "scene-stats", "scene-goal-detail", "scene-event-detail", "scene-card-detail", "scene-substitution-detail", "scene-half-time-detail", "scene-full-time-detail");
    elements.scoreboard.classList.add("scene-match");
    applySceneBackground("match");
    elements.matchInfo.textContent = "Aucun contenu publié";
    return;
  }

  const renderCurrentScene = () => {
    if (token !== sceneRenderToken) return;
    const scene = scenes[activeScene];
    elements.scoreboard.classList.toggle("scene-group", scene.type === "group");
    elements.scoreboard.classList.toggle("scene-live-updates", scene.type === "ticker");
    elements.scoreboard.classList.toggle("scene-video-updates", scene.type === "video");
    elements.scoreboard.classList.toggle("scene-info", scene.type === "info");
    elements.scoreboard.classList.toggle("scene-match", ["match", "match-video"].includes(scene.type));
    elements.scoreboard.classList.toggle("scene-match-video", scene.type === "match-video");
    elements.scoreboard.classList.toggle("scene-pre-match", scene.type === "pre-match");
    elements.scoreboard.classList.toggle("scene-lineups", scene.type === "lineups");
    elements.scoreboard.classList.toggle("scene-stats", scene.type === "stats");
    elements.scoreboard.classList.toggle("scene-goal-detail", scene.type === "goal-detail");
    elements.scoreboard.classList.toggle("scene-event-detail", ["card-detail", "substitution-detail", "half-time-detail", "full-time-detail"].includes(scene.type));
    elements.scoreboard.classList.toggle("scene-card-detail", scene.type === "card-detail");
    elements.scoreboard.classList.toggle("scene-substitution-detail", scene.type === "substitution-detail");
    elements.scoreboard.classList.toggle("scene-half-time-detail", scene.type === "half-time-detail");
    elements.scoreboard.classList.toggle("scene-full-time-detail", scene.type === "full-time-detail");
    applySceneBackground(scene.type);
    if (scene.type === "group") renderGroup(scene.data);
    else if (scene.type === "ticker") renderLiveUpdates(scene.data);
    else if (scene.type === "video") renderVideoUpdates(scene.data);
    else if (scene.type === "info") renderInfoScene(scene.data);
    else if (scene.type === "match-video") renderMatchVideo(scene.data);
    else if (scene.type === "pre-match") renderPreMatch(scene.data);
    else if (scene.type === "lineups") renderLineups(scene.data);
    else if (scene.type === "stats") renderStats(scene.data);
    else if (scene.type === "goal-detail") renderGoalDetail(scene.data);
    else if (["card-detail", "substitution-detail", "half-time-detail", "full-time-detail"].includes(scene.type)) renderEventDetail(scene.data);
    else renderMatch(scene.data);
    renderPagination();
    elements.scoreboard.classList.remove("is-leaving");
    if (shouldAnimate) animate();
    hasRenderedScene = true;
    if (shouldAnimate) scheduleRotation();
  };

  if (!hasRenderedScene) {
    renderCurrentScene();
    return;
  }

  if (!shouldAnimate) {
    renderCurrentScene();
    return;
  }

  elements.scoreboard.classList.remove("is-changing", "is-entering");
  elements.scoreboard.classList.add("is-leaving");
  window.setTimeout(renderCurrentScene, SCENE_EXIT_DURATION);
}

function applyData(data, options = {}) {
  const previousScene = scenes[activeScene] || null;
  latestData = data;
  currentSettings = normalizeSettings(data?.settings);
  applyDisplaySettings();
  elements.soundUnlock.hidden = !shouldShowSoundUnlock() || soundUnlocked;
  const allMatches = Array.isArray(data?.matches) ? data.matches : [];
  const allGroups = Array.isArray(data?.groups) ? data.groups : [];
  const publishedInfos = (Array.isArray(data?.infos) ? data.infos : [])
    .filter(info => info.published !== false)
    .filter(info => value(info.title || info.details || info.image).trim());
  const effectiveMatches = allMatches.map(match => withAutoMatchState(match));
  const publishedMatches = effectiveMatches.filter(match => match.published !== false);
  syncVideoPlaylist(currentSettings.video_playlist_urls);
  const goalEvents = detectGoalEvents(publishedMatches);
  const timelineEventScenes = detectTimelineEventScenes(publishedMatches);
  const kickoffEvents = detectKickoffEvents(publishedMatches);
  renderTicker(publishedMatches, allGroups);
  const publishedGroupsById = new Map(
    allGroups
      .filter(group => group.published !== false)
      .map(group => [group.id, group])
  );
  const displayedGroupIds = new Set();

  const scoreSceneMatches = publishedMatches.filter(match => isVisibleInScoreScenes(match));
  const liveScoreSceneMatches = scoreSceneMatches.filter(match => isLive(match));
  const liveScoreSceneMatchIds = new Set(liveScoreSceneMatches.map(match => match.id));
  const preMatchScenes = scoreSceneMatches
    .filter(match => isUpcoming(match))
    .map(match => ({ type: "pre-match", id: match.id, data: match }));
  const lineupScenes = scoreSceneMatches.map(match => ({ type: "lineups", id: match.id, data: match }));
  const statsScenes = scoreSceneMatches.map(match => ({ type: "stats", id: match.id, data: match }));
  const goalDetailScenes = scoreSceneMatches
    .map(match => {
      const goal = latestGoalTimelineEvent(match);
      if (!goal) return null;
      const side = value(goal.team).toLocaleLowerCase("fr").includes(value(match.away).toLocaleLowerCase("fr")) ? "away" : "home";
      return {
        type: "goal-detail",
        id: match.id,
        data: {
          key: matchKey(match),
          match,
          side,
          team: side === "away" ? value(match.away, "Équipe 2") : value(match.home, "Équipe 1"),
          scorer: scorerFromGoalEvent(goal) || "Buteur",
          minute: value(goal.minute),
          goalText: value(goal.text),
          score: matchScore(match)
        }
      };
    })
    .filter(Boolean);
  const eventDetailScenes = scoreSceneMatches.flatMap(eventDetailScenesForMatch);
  const matchScenes = scoreSceneMatches.map(match => ({ type: "match", id: match.id, data: match }));
  const matchVideoScenes = scoreSceneMatches.map(match => ({ type: "match-video", id: match.id, data: match }));
  const groupScenes = [];
  publishedMatches.forEach(match => {

    const groupId = inferGroupId(match, allGroups);
    if (match.phase !== "group" || !groupId) return;
    if (displayedGroupIds.has(groupId)) return;

    const group = publishedGroupsById.get(groupId);
    if (!group) return;

    groupScenes.push({
      type: "group",
      id: group.id,
      data: {
        ...group,
        // La publication contrôle uniquement la visibilité des matchs.
        // Tous les résultats du groupe alimentent son classement.
        teams: calculateStandings(group, effectiveMatches, group.rules_profile)
      }
    });
    displayedGroupIds.add(groupId);
  });

  const tickerScene = {
    type: "ticker",
    id: "ticker",
    data: { rows: liveUpdateRows(publishedMatches, allGroups) }
  };
  const videoScene = {
    type: "video",
    id: "video",
    data: { rows: liveUpdateRows(publishedMatches, allGroups) }
  };
  const infoScenes = publishedInfos.map((info, index) => {
    const infoId = value(info.id).trim() || `info-${index}-${value(info.title || info.date).trim().toLocaleLowerCase("fr").replace(/[^a-z0-9]+/g, "-")}`;
    return {
      type: "info",
      id: infoId,
      data: { ...info, id: infoId }
    };
  });
  const requestedScene = new URLSearchParams(window.location.search).get("scene");
  const hasForcedUrlScene = Boolean(requestedScene);

  if (currentSettings.scene_mode === "pre-match") {
    scenes = [
      preMatchScenes.find(scene => scene.id === currentSettings.selected_match_id) || preMatchScenes[0]
    ].filter(Boolean);
  } else if (currentSettings.scene_mode === "lineups") {
    scenes = [
      lineupScenes.find(scene => scene.id === currentSettings.selected_match_id) || lineupScenes[0]
    ].filter(Boolean);
  } else if (currentSettings.scene_mode === "stats") {
    scenes = [
      statsScenes.find(scene => scene.id === currentSettings.selected_match_id) || statsScenes[0]
    ].filter(Boolean);
  } else if (currentSettings.scene_mode === "info") {
    scenes = infoScenes;
  } else if (currentSettings.scene_mode === "goal-detail") {
    scenes = [
      goalDetailScenes.find(scene => scene.id === currentSettings.selected_match_id) || goalDetailScenes[0]
    ].filter(Boolean);
  } else if (["card-detail", "substitution-detail", "half-time-detail", "full-time-detail"].includes(currentSettings.scene_mode)) {
    scenes = [
      eventDetailScenes.find(scene => scene.type === currentSettings.scene_mode && scene.id.includes(currentSettings.selected_match_id || "__none__"))
      || eventDetailScenes.find(scene => scene.type === currentSettings.scene_mode)
    ].filter(Boolean);
  } else if (currentSettings.scene_mode === "match") {
    scenes = [
      matchScenes.find(scene => scene.id === currentSettings.selected_match_id) || matchScenes[0]
    ].filter(Boolean);
  } else if (currentSettings.scene_mode === "match-video") {
    scenes = [
      matchVideoScenes.find(scene => scene.id === currentSettings.selected_match_id) || matchVideoScenes[0]
    ].filter(Boolean);
  } else if (currentSettings.scene_mode === "group") {
    scenes = [
      groupScenes.find(scene => scene.id === currentSettings.selected_group_id) || groupScenes[0]
    ].filter(Boolean);
  } else if (currentSettings.scene_mode === "ticker") {
    scenes = [tickerScene];
  } else if (currentSettings.scene_mode === "video") {
    scenes = [videoScene];
  } else {
    const hasLiveMatchContext = !hasForcedUrlScene && liveScoreSceneMatches.length > 0;
    const liveLineupScenes = lineupScenes.filter(scene => liveScoreSceneMatchIds.has(scene.id));
    const liveStatsScenes = statsScenes.filter(scene => liveScoreSceneMatchIds.has(scene.id));
    const liveGoalDetailScenes = goalDetailScenes.filter(scene => liveScoreSceneMatchIds.has(scene.id));
    const liveEventDetailScenes = eventDetailScenes.filter(scene => liveScoreSceneMatchIds.has(scene.data?.match?.id));
    const liveMatchScenes = matchScenes.filter(scene => liveScoreSceneMatchIds.has(scene.id));
    const liveMatchVideoScenes = matchVideoScenes.filter(scene => liveScoreSceneMatchIds.has(scene.id));

    scenes = hasLiveMatchContext
      ? [
        ...(currentSettings.include_goal_detail_scenes ? liveGoalDetailScenes : []),
        ...(currentSettings.include_event_detail_scenes ? liveEventDetailScenes : []),
        ...(currentSettings.include_match_scenes ? liveMatchScenes : []),
        ...(currentSettings.include_stats_scenes ? liveStatsScenes : []),
        ...(currentSettings.include_lineup_scenes ? liveLineupScenes : []),
        ...(currentSettings.include_match_video_scenes ? liveMatchVideoScenes : [])
      ]
      : [
        ...(currentSettings.include_prematch_scenes ? preMatchScenes : []),
        ...(currentSettings.include_lineup_scenes ? lineupScenes : []),
        ...(currentSettings.include_stats_scenes ? statsScenes : []),
        ...(currentSettings.include_info_scenes ? infoScenes : []),
        ...(currentSettings.include_goal_detail_scenes ? goalDetailScenes : []),
        ...(currentSettings.include_event_detail_scenes ? eventDetailScenes : []),
        ...(currentSettings.include_match_scenes ? matchScenes : []),
        ...(currentSettings.include_match_video_scenes ? matchVideoScenes : []),
        ...(currentSettings.include_group_scenes ? groupScenes : []),
        ...(currentSettings.include_ticker_scene ? [tickerScene] : []),
        ...(currentSettings.include_video_scene ? [videoScene] : [])
      ];
    if (!scenes.length) scenes = hasLiveMatchContext
      ? (liveMatchScenes.length ? liveMatchScenes : matchScenes)
      : (matchScenes.length ? matchScenes : [tickerScene]);
  }

  if (requestedScene === "pre-match") {
    activeScene = scenes.findIndex(scene => scene.type === "pre-match");
    if (activeScene < 0) activeScene = 0;
  } else if (requestedScene === "lineups") {
    activeScene = scenes.findIndex(scene => scene.type === "lineups");
    if (activeScene < 0) activeScene = 0;
  } else if (requestedScene === "stats") {
    activeScene = scenes.findIndex(scene => scene.type === "stats");
    if (activeScene < 0) activeScene = 0;
  } else if (requestedScene === "info") {
    const previousInfoIndex = previousScene?.type === "info"
      ? scenes.findIndex(scene => scene.type === "info" && scene.id === previousScene.id)
      : -1;
    activeScene = previousInfoIndex >= 0
      ? previousInfoIndex
      : scenes.findIndex(scene => scene.type === "info");
    if (activeScene < 0) activeScene = 0;
  } else if (requestedScene === "goal-detail") {
    activeScene = scenes.findIndex(scene => scene.type === "goal-detail");
    if (activeScene < 0) activeScene = 0;
  } else if (["card-detail", "substitution-detail", "half-time-detail", "full-time-detail"].includes(requestedScene)) {
    activeScene = scenes.findIndex(scene => scene.type === requestedScene);
    if (activeScene < 0) activeScene = 0;
  } else if (requestedScene === "match") {
    activeScene = scenes.findIndex(scene => scene.type === "match");
    if (activeScene < 0) activeScene = 0;
  } else if (requestedScene === "ticker") {
    activeScene = scenes.findIndex(scene => scene.type === "ticker");
    if (activeScene < 0) activeScene = 0;
  } else if (requestedScene === "video") {
    activeScene = scenes.findIndex(scene => scene.type === "video");
    if (activeScene < 0) activeScene = 0;
  } else if (requestedScene === "match-video") {
    activeScene = scenes.findIndex(scene => scene.type === "match-video");
    if (activeScene < 0) activeScene = 0;
  } else if (requestedScene === "group") {
    activeScene = scenes.findIndex(scene => scene.type === "group");
    if (activeScene < 0) activeScene = 0;
  } else if (kickoffEvents.length || goalEvents.length) {
    const featuredEvent = kickoffEvents[0] || goalEvents[0];
    const eventSceneIndex = goalEvents.length
      ? scenes.unshift({ type: "goal-detail", id: `goal-${Date.now()}`, data: goalEvents[0] }) && 0
      : scenes.findIndex(scene =>
        ["match", "match-video"].includes(scene.type) && matchKey(scene.data) === featuredEvent.key
      );
    if (eventSceneIndex >= 0) activeScene = eventSceneIndex;
  } else if (timelineEventScenes.length) {
    scenes.unshift(timelineEventScenes[0]);
    activeScene = 0;
  } else {
    activeScene = Math.min(activeScene, Math.max(scenes.length - 1, 0));
  }
  elements.connectionState.hidden = true;
  renderScene({ animate: options.animate !== false || kickoffEvents.length > 0 || goalEvents.length > 0 || timelineEventScenes.length > 0 });

  if ((kickoffEvents.length || goalEvents.length) && currentSettings.show_goal_alert) {
    window.setTimeout(() => triggerGoalAlert(kickoffEvents[0] || goalEvents[0]), SCENE_EXIT_DURATION + 180);
  }
}

async function loadJsonFallback() {
  try {
    const response = await fetch(`scores.json?t=${Date.now()}`, { cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    applyData(await response.json());
  } catch (error) {
    elements.connectionState.textContent = "Connexion aux données impossible";
    elements.connectionState.hidden = false;
  }
}

function startJsonFallback() {
  loadJsonFallback();
  if (!jsonFallbackTimer) {
    jsonFallbackTimer = setInterval(loadJsonFallback, JSON_REFRESH_INTERVAL);
  }
}

function startRealtime() {
  if (params.get("source") === "json") {
    startJsonFallback();
    return;
  }
  if (!firebaseConfigured) return startJsonFallback();
  const database = getDatabase(initializeApp(firebaseConfig));
  onValue(ref(database, "liveScores"), snapshot => {
    const data = snapshot.val();
    if (!data) return startJsonFallback();
    clearInterval(jsonFallbackTimer);
    jsonFallbackTimer = undefined;
    applyData(data);
  }, startJsonFallback);
}

function rotateScene() {
  if (!currentSettings.auto_rotate || scenes.length < 2) return;
  activeScene = (activeScene + 1) % scenes.length;
  renderScene();
}

function sceneDuration(scene) {
  const seconds = scene?.type === "group"
    ? currentSettings.standings_scene_duration
    : scene?.type === "video"
      ? currentSettings.video_scene_duration
      : scene?.type === "info"
        ? currentSettings.info_scene_duration
      : scene?.type === "pre-match"
        ? currentSettings.pre_match_scene_duration
        : scene?.type === "lineups"
          ? currentSettings.lineups_scene_duration
          : scene?.type === "stats"
            ? currentSettings.stats_scene_duration
          : scene?.type === "goal-detail"
            ? currentSettings.goal_detail_scene_duration
            : ["card-detail", "substitution-detail", "half-time-detail", "full-time-detail"].includes(scene?.type)
              ? currentSettings.event_detail_scene_duration
              : currentSettings.score_scene_duration;
  return seconds * 1000;
}

function scheduleRotation() {
  clearTimeout(rotationTimer);
  if (!currentSettings.auto_rotate || scenes.length < 2) return;
  rotationTimer = window.setTimeout(rotateScene, sceneDuration(scenes[activeScene]));
}

function startAutoClock() {
  if (autoClockTimer) return;
  autoClockTimer = window.setInterval(() => {
    if (currentSettings.auto_start_matches && latestData) applyData(latestData, { animate: false });
  }, AUTO_CLOCK_INTERVAL);
}

startRealtime();
startAutoClock();
if (elements.playlistVideo) {
  elements.playlistVideo.addEventListener("ended", () => playPlaylistVideo(currentVideoIndex + 1));
  elements.playlistVideo.addEventListener("error", () => {
    if (currentVideoPlaylist.length > 1) playPlaylistVideo(currentVideoIndex + 1);
  });
}
if (elements.soundUnlock) {
  elements.soundUnlock.hidden = !shouldShowSoundUnlock();
  elements.soundUnlock.addEventListener("click", unlockSound);
}

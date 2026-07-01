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
  penaltyScore: document.getElementById("penaltyScore"),
  awayFlag: document.getElementById("awayFlag"),
  awayName: document.getElementById("awayName"),
  awayQualifiedBadge: document.getElementById("awayQualifiedBadge"),
  matchVideoFrame: document.getElementById("matchVideoFrame"),
  matchPlaylistVideo: document.getElementById("matchPlaylistVideo"),
  matchPlaylistEmpty: document.getElementById("matchPlaylistEmpty"),
  minute: document.getElementById("minute"),
  matchInfo: document.getElementById("matchInfo"),
  pagination: document.getElementById("pagination"),
  groupName: document.getElementById("groupName"),
  groupSubtitle: document.getElementById("groupSubtitle"),
  standingsRows: document.getElementById("standingsRows"),
  liveUpdatesView: document.getElementById("liveUpdatesView"),
  liveUpdatesRows: document.getElementById("liveUpdatesRows"),
  videoUpdatesView: document.getElementById("videoUpdatesView"),
  videoUpdatesRows: document.getElementById("videoUpdatesRows"),
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
    standings_scene_duration: boundedNumber(settings.standings_scene_duration, DEFAULT_SETTINGS.standings_scene_duration, 3, 60),
    video_scene_duration: boundedNumber(settings.video_scene_duration, DEFAULT_SETTINGS.video_scene_duration, 5, 180),
    score_scene_before_minutes: boundedNumber(settings.score_scene_before_minutes, DEFAULT_SETTINGS.score_scene_before_minutes, 0, 240),
    score_scene_after_minutes: boundedNumber(settings.score_scene_after_minutes, DEFAULT_SETTINGS.score_scene_after_minutes, 0, 240),
    auto_rotate: settings.auto_rotate !== false,
    show_ticker: settings.show_ticker !== false,
    show_goal_alert: settings.show_goal_alert !== false,
    enable_goal_sound: settings.enable_goal_sound !== false,
    auto_start_matches: settings.auto_start_matches !== false,
    scene_mode: ["auto", "match", "match-video", "group", "ticker", "video"].includes(settings.scene_mode) ? settings.scene_mode : "auto",
    selected_match_id: value(settings.selected_match_id),
    selected_group_id: value(settings.selected_group_id),
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

function sceneBackgroundUrl(type) {
  if (type === "group") return currentSettings.standings_background_url;
  if (type === "ticker") return currentSettings.ticker_background_url;
  if (type === "video") return currentSettings.ticker_background_url;
  if (type === "match-video") return currentSettings.match_video_background_url;
  return currentSettings.match_background_url;
}

function applySceneBackground(type) {
  const background = cssUrl(sceneBackgroundUrl(type));
  document.documentElement.style.setProperty("--scene-bg", background);
  document.body.style.setProperty("background", `#020817 ${background} center / cover no-repeat`, "important");
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
  const values = ["HT", "MT", "MI-TEMPS", "MI TEMPS", "PAUSE"];
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
  const minute = value(match.minute).trim();
  return Boolean(minute) && !["EN DIRECT", "LIVE"].includes(minute.toUpperCase());
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
  if (!isUpcoming(match)) return match;

  return {
    ...match,
    status: "En direct",
    minute: autoMinute(kickoffMs, now),
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
      events.push({
        key,
        match,
        side: "home",
        team: value(match.home, "Équipe 1"),
        score: current
      });
    }

    if (awayDelta > 0) {
      events.push({
        key,
        match,
        side: "away",
        team: value(match.away, "Équipe 2"),
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

  return `<strong>En direct</strong> ${escapeHtml(label)} — ${escapeHtml(home)} ${score} ${escapeHtml(away)} • ${escapeHtml(value(match.minute, value(match.status, "LIVE")))}`;
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
      minute: qualified ? `${qualified} qualifié` : isLive(match) ? value(match.minute, value(match.status, "LIVE")) : ""
    };
  });
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

  const orderedMatches = [...matches].sort((left, right) => {
    const statusRank = match => isLive(match) ? 0 : isUpcoming(match) ? 1 : 2;
    const rankDiff = statusRank(left) - statusRank(right);
    if (rankDiff) return rankDiff;
    return value(left.kickoff).localeCompare(value(right.kickoff));
  });

  const messages = orderedMatches
    .slice(0, 14)
    .map(match => tickerMessage(match, groups));

  if (!messages.length) {
    messages.push("<strong>Zone Mondial 26</strong> Aucun match publié pour le moment");
  }

  const content = messages.map(message => `<span class="ticker__item">${message}</span>`).join("");
  elements.tickerTrack.innerHTML = `${content}${content}`;
  elements.tickerTrack.style.setProperty("--ticker-duration", `${Math.max(24, messages.length * 7)}s`);
}

function renderLiveUpdates(data) {
  elements.scoreboard.classList.remove("show-standings");
  elements.scoreboard.classList.remove("show-video-updates");
  elements.scoreboard.classList.remove("show-match-video");
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
          <span class="live-update-score">${escapeHtml(row.score)}</span>
          <strong>${escapeHtml(row.away)}</strong>
          <span class="live-update-minute">${escapeHtml(row.minute)}</span>
        </div>
      `).join("")
    : `<div class="live-update-empty">Aucun match publié pour le moment</div>`;
}

function renderVideoUpdates(data) {
  elements.scoreboard.classList.remove("show-standings", "show-live-updates", "show-match-video");
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
          <span class="live-update-score">${escapeHtml(row.score)}</span>
          <strong>${escapeHtml(row.away)}</strong>
          <span class="live-update-minute">${escapeHtml(row.minute)}</span>
        </div>
      `).join("")
    : `<div class="live-update-empty">Aucun match publié pour le moment</div>`;

  playPlaylistVideo();
}

function animate() {
  elements.scoreboard.classList.remove("is-changing", "is-entering", "is-leaving");
  void elements.scoreboard.offsetWidth;
  elements.scoreboard.classList.add("is-changing", "is-entering");
  window.setTimeout(() => {
    elements.scoreboard.classList.remove("is-changing", "is-entering");
  }, SCENE_ENTER_DURATION);
}

function renderMatch(match) {
  elements.scoreboard.classList.remove("show-standings", "show-live-updates", "show-video-updates", "show-match-video");
  elements.competition.textContent = value(match.competition, "COUPE DU MONDE 2026");
  elements.status.textContent = displayStatus(match);
  elements.homeFlag.src = flagUrl(match.home_code, match.home);
  elements.homeName.textContent = value(match.home, "Équipe 1");
  elements.homeScore.textContent = value(match.home_score, "0");
  elements.awayScore.textContent = value(match.away_score, "0");
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
  elements.minute.textContent = value(match.minute);
  elements.minute.hidden = !shouldShowMatchMinute(match);
  elements.minute.classList.toggle("is-finished", isFinished(match));
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
  elements.scoreboard.classList.remove("show-live-updates", "show-video-updates", "show-match-video");
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
    elements.scoreboard.classList.remove("show-standings", "show-live-updates", "show-video-updates", "show-match-video", "scene-group", "scene-live-updates", "scene-video-updates", "scene-match-video");
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
    elements.scoreboard.classList.toggle("scene-match", ["match", "match-video"].includes(scene.type));
    elements.scoreboard.classList.toggle("scene-match-video", scene.type === "match-video");
    applySceneBackground(scene.type);
    if (scene.type === "group") renderGroup(scene.data);
    else if (scene.type === "ticker") renderLiveUpdates(scene.data);
    else if (scene.type === "video") renderVideoUpdates(scene.data);
    else if (scene.type === "match-video") renderMatchVideo(scene.data);
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
  latestData = data;
  currentSettings = normalizeSettings(data?.settings);
  elements.soundUnlock.hidden = !shouldShowSoundUnlock() || soundUnlocked;
  const allMatches = Array.isArray(data?.matches) ? data.matches : [];
  const allGroups = Array.isArray(data?.groups) ? data.groups : [];
  const effectiveMatches = allMatches.map(match => withAutoMatchState(match));
  const publishedMatches = effectiveMatches.filter(match => match.published !== false);
  syncVideoPlaylist(currentSettings.video_playlist_urls);
  const goalEvents = detectGoalEvents(publishedMatches);
  const kickoffEvents = detectKickoffEvents(publishedMatches);
  renderTicker(publishedMatches, allGroups);
  const publishedGroupsById = new Map(
    allGroups
      .filter(group => group.published !== false)
      .map(group => [group.id, group])
  );
  const displayedGroupIds = new Set();

  const scoreSceneMatches = publishedMatches.filter(match => isVisibleInScoreScenes(match));
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

  if (currentSettings.scene_mode === "match") {
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
    scenes = [
      ...(currentSettings.include_match_scenes ? matchScenes : []),
      ...(currentSettings.include_match_video_scenes ? matchVideoScenes : []),
      ...(currentSettings.include_group_scenes ? groupScenes : []),
      ...(currentSettings.include_ticker_scene ? [tickerScene] : []),
      ...(currentSettings.include_video_scene ? [videoScene] : [])
    ];
    if (!scenes.length) scenes = matchScenes.length ? matchScenes : [tickerScene];
  }

  const requestedScene = new URLSearchParams(window.location.search).get("scene");
  if (requestedScene === "match") {
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
    const eventSceneIndex = scenes.findIndex(scene =>
      ["match", "match-video"].includes(scene.type) && matchKey(scene.data) === featuredEvent.key
    );
    if (eventSceneIndex >= 0) activeScene = eventSceneIndex;
  } else {
    activeScene = Math.min(activeScene, Math.max(scenes.length - 1, 0));
  }
  elements.connectionState.hidden = true;
  renderScene({ animate: options.animate !== false || kickoffEvents.length > 0 || goalEvents.length > 0 });

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

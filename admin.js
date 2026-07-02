import { initializeApp } from "https://www.gstatic.com/firebasejs/12.15.0/firebase-app.js";
import {
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut
} from "https://www.gstatic.com/firebasejs/12.15.0/firebase-auth.js";
import { get, getDatabase, ref, set } from "https://www.gstatic.com/firebasejs/12.15.0/firebase-database.js";
import { firebaseConfig, firebaseConfigured } from "./firebase-config.js";
import { calculateStandings, inferGroupId } from "./standings-engine.js?v=20260626-15";
import { flagUrl } from "./team-utils.js?v=20260626-15";

window.addEventListener("error", event => {
  console.error(event.error || event.message);
});
window.addEventListener("unhandledrejection", event => {
  console.error(event.reason);
});

const DRAFT_KEY = "zone-mondial-26-live-data-draft";
const AUTO_PUBLISH_DELAY = 650;
const WORLD_CUP_API_BASE_URL = "https://worldcup26.ir";

const editor = document.getElementById("matchesEditor");
const groupsEditor = document.getElementById("groupsEditor");
const matchTemplate = document.getElementById("matchTemplate");
const groupTemplate = document.getElementById("groupTemplate");
const standingTeamTemplate = document.getElementById("standingTeamTemplate");
const updatedAtInput = document.getElementById("updatedAt");
const notice = document.getElementById("notice");
const matchCount = document.getElementById("matchCount");
const groupCount = document.getElementById("groupCount");
const firebaseEmailInput = document.getElementById("firebaseEmail");
const firebasePasswordInput = document.getElementById("firebasePassword");
const firebaseState = document.getElementById("firebaseState");
const autoPublishToggle = document.getElementById("autoPublishToggle");
const publishButton = document.getElementById("publishButton");
const matchSearch = document.getElementById("matchSearch");
const matchPhaseFilter = document.getElementById("matchPhaseFilter");
const matchStatusFilter = document.getElementById("matchStatusFilter");
const matchGroupFilter = document.getElementById("matchGroupFilter");
const showUnpublishedMatches = document.getElementById("showUnpublishedMatches");
const matchResultsInfo = document.getElementById("matchResultsInfo");
const loadMoreMatches = document.getElementById("loadMoreMatches");
const scoreSceneDurationInput = document.getElementById("scoreSceneDuration");
const standingsSceneDurationInput = document.getElementById("standingsSceneDuration");
const videoSceneDurationInput = document.getElementById("videoSceneDuration");
const scoreSceneBeforeMinutesInput = document.getElementById("scoreSceneBeforeMinutes");
const scoreSceneAfterMinutesInput = document.getElementById("scoreSceneAfterMinutes");
const autoRotateScenesInput = document.getElementById("autoRotateScenes");
const showTickerInput = document.getElementById("showTicker");
const showGoalAlertInput = document.getElementById("showGoalAlert");
const autoStartMatchesInput = document.getElementById("autoStartMatches");
const enableGoalSoundInput = document.getElementById("enableGoalSound");
const sceneModeInput = document.getElementById("sceneMode");
const selectedMatchSceneInput = document.getElementById("selectedMatchScene");
const selectedGroupSceneInput = document.getElementById("selectedGroupScene");
const includeMatchScenesInput = document.getElementById("includeMatchScenes");
const includeMatchVideoScenesInput = document.getElementById("includeMatchVideoScenes");
const includeGroupScenesInput = document.getElementById("includeGroupScenes");
const includeTickerSceneInput = document.getElementById("includeTickerScene");
const includeVideoSceneInput = document.getElementById("includeVideoScene");
const enableVideoSoundInput = document.getElementById("enableVideoSound");
const matchBackgroundUrlInput = document.getElementById("matchBackgroundUrl");
const matchVideoBackgroundUrlInput = document.getElementById("matchVideoBackgroundUrl");
const standingsBackgroundUrlInput = document.getElementById("standingsBackgroundUrl");
const tickerBackgroundUrlInput = document.getElementById("tickerBackgroundUrl");
const videoPlaylistUrlsInput = document.getElementById("videoPlaylistUrls");
const controlCurrentScene = document.getElementById("controlCurrentScene");
const controlCurrentTarget = document.getElementById("controlCurrentTarget");
const controlPublishState = document.getElementById("controlPublishState");
const controlFirebaseState = document.getElementById("controlFirebaseState");
const controlUpdatedAt = document.getElementById("controlUpdatedAt");
const controlMatchSceneInput = document.getElementById("controlMatchScene");
const controlGroupSceneInput = document.getElementById("controlGroupScene");
const controlPublishButton = document.getElementById("controlPublishButton");
const controlAutoRotateButton = document.getElementById("controlAutoRotateButton");
const controlAutoPublishButton = document.getElementById("controlAutoPublishButton");
const apiTestButton = document.getElementById("apiTestButton");
const apiLoadGamesButton = document.getElementById("apiLoadGamesButton");
const apiApplyScoresButton = document.getElementById("apiApplyScoresButton");
const apiAutoSyncToggle = document.getElementById("apiAutoSyncToggle");
const apiAutoSyncIntervalInput = document.getElementById("apiAutoSyncInterval");
const apiAutoSyncModeInput = document.getElementById("apiAutoSyncMode");
const apiAutoOnlyPublishedInput = document.getElementById("apiAutoOnlyPublished");
const apiAutoOnlyActiveInput = document.getElementById("apiAutoOnlyActive");
const apiAutoPublishFirebaseInput = document.getElementById("apiAutoPublishFirebase");
const apiSyncStatus = document.getElementById("apiSyncStatus");
const apiSyncPreview = document.getElementById("apiSyncPreview");
const apiSyncLogRows = document.getElementById("apiSyncLogRows");

let draftTimer;
let autoPublishTimer;
let currentUser = null;
let rendering = false;
let firebaseAuth;
let firebaseDatabase;
let visibleMatchLimit = 30;
let apiGames = [];
let apiAutoSyncTimer;
let apiAutoSyncRunning = false;
let apiSyncLog = [];

if (firebaseConfigured) {
  const app = initializeApp(firebaseConfig);
  firebaseAuth = getAuth(app);
  firebaseDatabase = getDatabase(app);
}

const text = (value, fallback = "") =>
  value === undefined || value === null ? fallback : String(value);

const NUMERIC_MATCH_FIELDS = new Set([
  "home_score",
  "away_score",
  "home_penalty_score",
  "away_penalty_score"
]);

const DEFAULT_SETTINGS = {
  score_scene_duration: 10,
  standings_scene_duration: 8,
  video_scene_duration: 15,
  score_scene_before_minutes: 30,
  score_scene_after_minutes: 30,
  auto_rotate: true,
  show_ticker: true,
  show_goal_alert: true,
  auto_start_matches: true,
  enable_goal_sound: true,
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

function escapeHtml(value) {
  return text(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function number(value) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

const scoreNumber = number;

function boundedNumber(value, fallback, min, max) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function readSettings() {
  return {
    score_scene_duration: boundedNumber(scoreSceneDurationInput.value, DEFAULT_SETTINGS.score_scene_duration, 3, 60),
    standings_scene_duration: boundedNumber(standingsSceneDurationInput.value, DEFAULT_SETTINGS.standings_scene_duration, 3, 60),
    video_scene_duration: boundedNumber(videoSceneDurationInput.value, DEFAULT_SETTINGS.video_scene_duration, 5, 180),
    score_scene_before_minutes: boundedNumber(scoreSceneBeforeMinutesInput.value, DEFAULT_SETTINGS.score_scene_before_minutes, 0, 240),
    score_scene_after_minutes: boundedNumber(scoreSceneAfterMinutesInput.value, DEFAULT_SETTINGS.score_scene_after_minutes, 0, 240),
    auto_rotate: autoRotateScenesInput.checked,
    show_ticker: showTickerInput.checked,
    show_goal_alert: showGoalAlertInput.checked,
    auto_start_matches: autoStartMatchesInput.checked,
    enable_goal_sound: enableGoalSoundInput.checked,
    scene_mode: sceneModeInput.value || "auto",
    selected_match_id: selectedMatchSceneInput.value,
    selected_group_id: selectedGroupSceneInput.value,
    include_match_scenes: includeMatchScenesInput.checked,
    include_match_video_scenes: includeMatchVideoScenesInput.checked,
    include_group_scenes: includeGroupScenesInput.checked,
    include_ticker_scene: includeTickerSceneInput.checked,
    include_video_scene: includeVideoSceneInput.checked,
    enable_video_sound: enableVideoSoundInput.checked,
    video_playlist_urls: videoPlaylistUrlsInput.value.trim(),
    match_background_url: sceneBackgroundSetting(matchBackgroundUrlInput.value, DEFAULT_SETTINGS.match_background_url),
    match_video_background_url: sceneBackgroundSetting(matchVideoBackgroundUrlInput.value, DEFAULT_SETTINGS.match_video_background_url),
    standings_background_url: sceneBackgroundSetting(standingsBackgroundUrlInput.value, DEFAULT_SETTINGS.standings_background_url),
    ticker_background_url: sceneBackgroundSetting(tickerBackgroundUrlInput.value, DEFAULT_SETTINGS.ticker_background_url)
  };
}

function sceneBackgroundSetting(input, fallback) {
  const url = text(input, fallback).trim();
  if (SCENE_DEFAULT_BACKGROUNDS.has(url) && url !== fallback) return fallback;
  return LEGACY_SCOREBOARD_BACKGROUNDS.has(url) ? fallback : url;
}

function fillSettings(settings = {}) {
  const merged = { ...DEFAULT_SETTINGS, ...settings };
  scoreSceneDurationInput.value = boundedNumber(merged.score_scene_duration, DEFAULT_SETTINGS.score_scene_duration, 3, 60);
  standingsSceneDurationInput.value = boundedNumber(merged.standings_scene_duration, DEFAULT_SETTINGS.standings_scene_duration, 3, 60);
  videoSceneDurationInput.value = boundedNumber(merged.video_scene_duration, DEFAULT_SETTINGS.video_scene_duration, 5, 180);
  scoreSceneBeforeMinutesInput.value = boundedNumber(merged.score_scene_before_minutes, DEFAULT_SETTINGS.score_scene_before_minutes, 0, 240);
  scoreSceneAfterMinutesInput.value = boundedNumber(merged.score_scene_after_minutes, DEFAULT_SETTINGS.score_scene_after_minutes, 0, 240);
  autoRotateScenesInput.checked = merged.auto_rotate !== false;
  showTickerInput.checked = merged.show_ticker !== false;
  showGoalAlertInput.checked = merged.show_goal_alert !== false;
  autoStartMatchesInput.checked = merged.auto_start_matches !== false;
  enableGoalSoundInput.checked = merged.enable_goal_sound !== false;
  sceneModeInput.value = ["auto", "match", "match-video", "group", "ticker", "video"].includes(merged.scene_mode) ? merged.scene_mode : "auto";
  selectedMatchSceneInput.dataset.selectedValue = text(merged.selected_match_id);
  selectedGroupSceneInput.dataset.selectedValue = text(merged.selected_group_id);
  includeMatchScenesInput.checked = merged.include_match_scenes !== false;
  includeMatchVideoScenesInput.checked = merged.include_match_video_scenes === true;
  includeGroupScenesInput.checked = merged.include_group_scenes !== false;
  includeTickerSceneInput.checked = merged.include_ticker_scene === true;
  includeVideoSceneInput.checked = merged.include_video_scene === true;
  enableVideoSoundInput.checked = merged.enable_video_sound !== false;
  videoPlaylistUrlsInput.value = Array.isArray(merged.video_playlist_urls)
    ? merged.video_playlist_urls.join("\n")
    : text(merged.video_playlist_urls);
  matchBackgroundUrlInput.value = sceneBackgroundSetting(merged.match_background_url, DEFAULT_SETTINGS.match_background_url);
  matchVideoBackgroundUrlInput.value = sceneBackgroundSetting(merged.match_video_background_url, DEFAULT_SETTINGS.match_video_background_url);
  standingsBackgroundUrlInput.value = sceneBackgroundSetting(merged.standings_background_url, DEFAULT_SETTINGS.standings_background_url);
  tickerBackgroundUrlInput.value = sceneBackgroundSetting(merged.ticker_background_url, DEFAULT_SETTINGS.ticker_background_url);
  syncControlRoom();
}

function formatCasablancaDate() {
  const parts = new Intl.DateTimeFormat("fr-CA", {
    timeZone: "Africa/Casablanca",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day} ${values.hour}:${values.minute}`;
}

function showNotice(message, isError = false) {
  notice.textContent = message;
  notice.classList.toggle("error", isError);
  notice.hidden = false;
  clearTimeout(showNotice.timeout);
  showNotice.timeout = setTimeout(() => { notice.hidden = true; }, 4500);
}

function setFirebaseState(connected, label = "") {
  firebaseState.classList.toggle("online", connected);
  firebaseState.classList.toggle("offline", !connected);
  firebaseState.textContent = label || (connected ? "Connecté" : "Non connecté");
  syncControlRoom();
}

function emptyMatch() {
  return {
    id: crypto.randomUUID(),
    published: true,
    competition: "Coupe du Monde 2026",
    phase: "group",
    group_id: "",
    round: "group-day-1",
    kickoff: "",
    home: "",
    home_code: "",
    away: "",
    away_code: "",
    home_score: 0,
    away_score: 0,
    home_penalty_score: 0,
    away_penalty_score: 0,
    home_scorers: "",
    away_scorers: "",
    home_penalty_scorers: "",
    away_penalty_scorers: "",
    home_penalty_misses: "",
    away_penalty_misses: "",
    minute: "0'",
    status: "À venir",
    info: "",
    external_api: "worldcup2026",
    external_match_id: ""
  };
}

function emptyTeam() {
  return { code: "", name: "", fair_play: 0, ranking: 9999 };
}

function emptyGroup() {
  return {
    id: crypto.randomUUID(),
    published: true,
    name: "Groupe A",
    subtitle: "Coupe du Monde 2026",
    rules_profile: "fifa-world-cup-2026",
    teams: [emptyTeam(), emptyTeam(), emptyTeam(), emptyTeam()]
  };
}

function readMatch(card) {
  const match = { id: card.dataset.matchId || crypto.randomUUID() };
  card.querySelectorAll("[data-field]").forEach(input => {
    const key = input.dataset.field;
    if (input.type === "checkbox") match[key] = input.checked;
    else if (key === "external_match_id") match[key] = (input.value || input.dataset.selectedValue || "").trim();
    else match[key] = NUMERIC_MATCH_FIELDS.has(key) ? number(input.value) : input.value.trim();
  });
  match.external_api = match.external_match_id ? (match.external_api || "worldcup2026") : "";
  return match;
}

function readTeam(row) {
  const team = {};
  row.querySelectorAll("[data-team-field]").forEach(input => {
    const key = input.dataset.teamField;
    if (["code", "name"].includes(key)) team[key] = input.value.trim();
    else if (key === "fair_play") team[key] = Number.parseInt(input.value, 10) || 0;
    else team[key] = number(input.value);
  });
  return team;
}

function readGroup(card) {
  const group = {
    id: card.dataset.groupId || crypto.randomUUID(),
    teams: [...card.querySelectorAll(".standing-team-row")].map(readTeam)
  };
  card.querySelectorAll("[data-group-field]").forEach(input => {
    const key = input.dataset.groupField;
    group[key] = input.type === "checkbox" ? input.checked : input.value.trim();
  });
  return group;
}

function buildData() {
  const matches = [...editor.querySelectorAll(".match-editor")].map(readMatch);
  const groups = [...groupsEditor.querySelectorAll(".group-editor")].map(readGroup);
  return {
    updated_at: updatedAtInput.value.trim() || formatCasablancaDate(),
    settings: readSettings(),
    matches,
    groups: groups.map(group => ({
      ...group,
      standings: calculateStandings(group, matches, group.rules_profile)
    }))
  };
}

function validateData(data) {
  const errors = [];
  const groupIds = new Set(data.groups.map(group => group.id));

  data.groups.forEach(group => {
    const codes = group.teams.map(team => team.code.toLowerCase()).filter(Boolean);
    const duplicates = codes.filter((code, index) => codes.indexOf(code) !== index);
    if (!group.name) errors.push("Un groupe ne possède pas de nom.");
    if (duplicates.length) {
      errors.push(`${group.name || "Un groupe"} contient plusieurs fois le code ${duplicates[0]}.`);
    }
  });

  data.matches.forEach(match => {
    if (!match.published) return;
    if (!match.home_code || !match.away_code) {
      errors.push(`${match.home || "Équipe 1"} – ${match.away || "Équipe 2"} : sélectionnez les équipes depuis les suggestions.`);
    }
    if (match.home_code && match.home_code === match.away_code) {
      errors.push(`${match.home || "Match"} : une équipe ne peut pas jouer contre elle-même.`);
    }
    if (match.phase === "group") {
      const resolvedGroupId = match.group_id || inferGroupId(match, data.groups);
      if (!resolvedGroupId || !groupIds.has(resolvedGroupId)) {
        errors.push(`${match.home || "Équipe 1"} – ${match.away || "Équipe 2"} : groupe manquant ou invalide.`);
      } else {
        match.group_id = resolvedGroupId;
      }
    }
  });
  return errors;
}

function buildJson() {
  return `${JSON.stringify(buildData(), null, 2)}\n`;
}

function saveDraft() {
  if (rendering) return;
  localStorage.setItem(DRAFT_KEY, JSON.stringify(buildData()));
}

function scheduleAutoPublish() {
  if (rendering || !autoPublishToggle.checked || !currentUser) return;
  clearTimeout(autoPublishTimer);
  autoPublishTimer = setTimeout(() => publishToFirebase(true), AUTO_PUBLISH_DELAY);
}

function scheduleSave() {
  if (rendering) return;
  clearTimeout(draftTimer);
  refreshCalculatedStandings();
  draftTimer = setTimeout(saveDraft, 200);
  scheduleAutoPublish();
}

function updateMatchAppearance(card) {
  const published = card.querySelector('[data-field="published"]').checked;
  card.classList.toggle("is-unpublished", !published);
  card.querySelector(".publish-switch span").textContent = published ? "Publié" : "Dépublié";
}

function formatKickoffSummary(value) {
  if (!value) return "Date à définir";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

function updateMatchSummary(card) {
  const match = readMatch(card);
  const groupName = groupsEditor
    .querySelector(`.group-editor[data-group-id="${CSS.escape(match.group_id || "")}"]`)
    ?.querySelector('[data-group-field="name"]')?.value;
  card.querySelector(".summary-date").textContent = formatKickoffSummary(match.kickoff);
  card.querySelector(".summary-home").textContent = match.home || "Équipe 1";
  card.querySelector(".summary-away").textContent = match.away || "Équipe 2";
  card.querySelector(".summary-score").textContent = `${match.home_score} – ${match.away_score}`;
  card.querySelector(".summary-meta").textContent = match.phase === "group"
    ? `${groupName || "Groupe non défini"} • ${match.status || "À venir"}`
    : `Élimination directe • ${match.status || "À venir"}`;
  updateSceneSelectors();
}

function updateGroupSummary(card) {
  const name = card.querySelector('[data-group-field="name"]').value.trim() || "Nouveau groupe";
  const count = card.querySelectorAll(".standing-team-row").length;
  card.querySelector(".group-summary-name").textContent = name;
  card.querySelector(".group-summary-teams").textContent = `${count} équipe${count > 1 ? "s" : ""}`;
  updateSceneSelectors();
}

function updateSceneSelectors() {
  if (!selectedMatchSceneInput || !selectedGroupSceneInput) return;

  const selectedMatch = selectedMatchSceneInput.value || selectedMatchSceneInput.dataset.selectedValue || "";
  const selectedGroup = selectedGroupSceneInput.value || selectedGroupSceneInput.dataset.selectedValue || "";

  const matches = [...editor.querySelectorAll(".match-editor")].map(readMatch);
  selectedMatchSceneInput.innerHTML = `<option value="">Premier match publié</option>` + matches
    .filter(match => match.published !== false)
    .map(match => {
      const label = `${match.home || "Équipe 1"} ${match.home_score} - ${match.away_score} ${match.away || "Équipe 2"} • ${match.status || "Statut"}`;
      return `<option value="${escapeHtml(match.id)}">${escapeHtml(label)}</option>`;
    })
    .join("");
  selectedMatchSceneInput.value = [...selectedMatchSceneInput.options].some(option => option.value === selectedMatch)
    ? selectedMatch
    : "";
  selectedMatchSceneInput.dataset.selectedValue = selectedMatchSceneInput.value;

  const groups = [...groupsEditor.querySelectorAll(".group-editor")].map(readGroup);
  selectedGroupSceneInput.innerHTML = `<option value="">Premier classement disponible</option>` + groups
    .filter(group => group.published !== false)
    .map(group => `<option value="${escapeHtml(group.id)}">${escapeHtml(group.name || "Groupe")}</option>`)
    .join("");
  selectedGroupSceneInput.value = [...selectedGroupSceneInput.options].some(option => option.value === selectedGroup)
    ? selectedGroup
    : "";
  selectedGroupSceneInput.dataset.selectedValue = selectedGroupSceneInput.value;
  syncControlRoom();
}

function sceneModeLabel(mode) {
  return {
    auto: "Automatique",
    match: "Score match",
    "match-video": "Score + vidéos 9:16",
    group: "Classement",
    ticker: "Live updates",
    video: "Vidéos 9:16"
  }[mode] || "Automatique";
}

function selectedOptionLabel(select, fallback) {
  return select?.selectedOptions?.[0]?.textContent?.trim() || fallback;
}

function mirrorSelectOptions(source, target) {
  if (!source || !target) return;
  const selected = target.value || source.value;
  target.innerHTML = source.innerHTML;
  target.value = [...target.options].some(option => option.value === selected) ? selected : source.value;
}

function syncControlRoom() {
  if (!controlCurrentScene) return;
  mirrorSelectOptions(selectedMatchSceneInput, controlMatchSceneInput);
  mirrorSelectOptions(selectedGroupSceneInput, controlGroupSceneInput);
  if (controlMatchSceneInput) controlMatchSceneInput.value = selectedMatchSceneInput.value;
  if (controlGroupSceneInput) controlGroupSceneInput.value = selectedGroupSceneInput.value;

  const mode = sceneModeInput.value || "auto";
  controlCurrentScene.textContent = sceneModeLabel(mode);
  controlCurrentTarget.textContent = ["match", "match-video"].includes(mode)
    ? selectedOptionLabel(selectedMatchSceneInput, "Premier match publié")
    : mode === "group"
      ? selectedOptionLabel(selectedGroupSceneInput, "Premier classement disponible")
      : mode === "auto"
        ? "Rotation selon les paramètres"
        : "Scène plein écran";
  controlPublishState.textContent = autoPublishToggle.checked ? "Automatique" : "Manuelle";
  controlFirebaseState.textContent = currentUser ? `Connecté : ${currentUser.email || ""}` : "Firebase non connecté";
  controlUpdatedAt.textContent = updatedAtInput.value || "—";
  controlAutoRotateButton.textContent = autoRotateScenesInput.checked ? "Rotation activée" : "Rotation désactivée";
  controlAutoPublishButton.textContent = autoPublishToggle.checked ? "Auto-publication activée" : "Auto-publication désactivée";

  document.querySelectorAll("[data-control-scene]").forEach(button => {
    button.classList.toggle("primary", button.dataset.controlScene === mode);
    button.classList.toggle("secondary", button.dataset.controlScene !== mode);
  });
}

function publishOrSaveFromControl() {
  scheduleSave();
  if (autoPublishToggle.checked && currentUser) publishToFirebase(true);
}

function setControlScene(mode) {
  sceneModeInput.value = mode;
  if (mode === "ticker") includeTickerSceneInput.checked = true;
  if (mode === "video") includeVideoSceneInput.checked = true;
  if (mode === "match-video") includeMatchVideoScenesInput.checked = true;
  syncControlRoom();
  publishOrSaveFromControl();
  showNotice(`Scène ${sceneModeLabel(mode).toLowerCase()} sélectionnée.`);
}

function apiValue(value, fallback = "") {
  if (value === undefined || value === null || value === "null") return fallback;
  return String(value);
}

function apiScore(value) {
  const parsed = Number.parseInt(apiValue(value, "0"), 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

function apiTeamName(game, side) {
  return apiValue(game[`${side}_team_name_en`])
    || apiValue(game[`${side}_team_label`])
    || `Équipe ${side === "home" ? "1" : "2"}`;
}

function apiStatus(game) {
  const elapsed = apiValue(game.time_elapsed).toLowerCase();
  const finished = apiValue(game.finished).toUpperCase() === "TRUE";
  if (finished || elapsed === "finished") return "Terminé";
  if (["notstarted", "not_started", "scheduled"].includes(elapsed)) return "À venir";
  if (["halftime", "half-time", "ht"].includes(elapsed)) return "Mi-temps";
  if (["postponed", "delayed"].includes(elapsed)) return "Reporté";
  return "En direct";
}

function isFinished(match) {
  const values = ["FT", "FIN", "TERMINÉ", "TERMINE"];
  return values.includes(text(match.minute).trim().toUpperCase())
    || values.includes(text(match.status).trim().toUpperCase());
}

function apiMinute(game) {
  const elapsed = apiValue(game.time_elapsed).toLowerCase();
  if (apiStatus(game) === "Terminé") return "FT";
  if (apiStatus(game) === "À venir") return "";
  if (apiStatus(game) === "Mi-temps") return "45'";
  const numeric = Number.parseInt(elapsed, 10);
  return Number.isFinite(numeric) ? `${numeric}'` : elapsed || "0'";
}

function formatApiScorerEntry(entry) {
  if (entry === undefined || entry === null || entry === "null") return "";
  if (typeof entry === "string" || typeof entry === "number") return String(entry).trim();
  const name = apiValue(
    entry.name
    || entry.player
    || entry.player_name
    || entry.scorer
    || entry.scorer_name
    || entry.label
  ).trim();
  const minute = apiValue(entry.minute || entry.time || entry.time_elapsed || entry.elapsed).trim();
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
  return String(input).trim();
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

function isKnockoutMatch(match) {
  if (match.phase === "group") return false;
  if (match.phase === "knockout") return true;
  return !["group", ""].includes(text(match.type || match.round || match.phase).toLowerCase());
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
  return side === "home" ? text(match.home) : side === "away" ? text(match.away) : "";
}

function scoreWithPenalties(match) {
  const base = `${scoreNumber(match.home_score)}-${scoreNumber(match.away_score)}`;
  return hasPenaltyShootout(match)
    ? `${base} TAB ${scoreNumber(match.home_penalty_score)}-${scoreNumber(match.away_penalty_score)}`
    : base;
}

function apiGameLabel(game) {
  const score = scoreWithPenalties({
    phase: game.type === "group" ? "group" : "knockout",
    type: game.type,
    home_score: apiScore(game.home_score),
    away_score: apiScore(game.away_score),
    home_penalty_score: apiScore(game.home_penalty_score),
    away_penalty_score: apiScore(game.away_penalty_score)
  });
  const stage = apiValue(game.type, "match").toUpperCase();
  const group = apiValue(game.group);
  const date = apiValue(game.local_date);
  return `#${apiValue(game.id)} • ${group || stage} • ${apiTeamName(game, "home")} ${score} ${apiTeamName(game, "away")} • ${apiStatus(game)}${date ? ` • ${date}` : ""}`;
}

function setApiStatus(message, isError = false) {
  if (!apiSyncStatus) return;
  apiSyncStatus.textContent = message;
  apiSyncStatus.classList.toggle("error", isError);
}

function populateApiMatchSelects() {
  const options = `<option value="">Non lié à l’API</option>` + apiGames
    .map(game => `<option value="${escapeHtml(apiValue(game.id))}">${escapeHtml(apiGameLabel(game))}</option>`)
    .join("");
  editor.querySelectorAll("[data-api-link-select]").forEach(select => {
    const selected = select.value || select.dataset.selectedValue || "";
    select.innerHTML = options;
    select.value = [...select.options].some(option => option.value === selected) ? selected : "";
    select.dataset.selectedValue = select.value;
  });
}

async function fetchApiGames() {
  const response = await fetch(`${WORLD_CUP_API_BASE_URL}/get/games`, { cache: "no-store" });
  if (!response.ok) throw new Error(`API indisponible (${response.status})`);
  const payload = await response.json();
  const games = Array.isArray(payload?.games) ? payload.games : [];
  if (!games.length) throw new Error("Aucun match reçu depuis l’API.");
  apiGames = games.sort((a, b) => Number(apiValue(a.id, 0)) - Number(apiValue(b.id, 0)));
  populateApiMatchSelects();
  return apiGames;
}

function linkedApiDiffs() {
  const gameById = new Map(apiGames.map(game => [apiValue(game.id), game]));
  return [...editor.querySelectorAll(".match-editor")].map(card => {
    const match = readMatch(card);
    const game = gameById.get(text(match.external_match_id));
    if (!game) return null;
    const next = {
      home_score: apiScore(game.home_score),
      away_score: apiScore(game.away_score),
      home_penalty_score: apiScore(game.home_penalty_score),
      away_penalty_score: apiScore(game.away_penalty_score),
      home_scorers: apiScorers(game, "home"),
      away_scorers: apiScorers(game, "away"),
      home_penalty_scorers: apiValue(game.home_penalty_scorers),
      away_penalty_scorers: apiValue(game.away_penalty_scorers),
      home_penalty_misses: apiValue(game.home_penalty_misses),
      away_penalty_misses: apiValue(game.away_penalty_misses),
      status: apiStatus(game),
      minute: apiMinute(game)
    };
    const changed = match.home_score !== next.home_score
      || match.away_score !== next.away_score
      || scoreNumber(match.home_penalty_score) !== next.home_penalty_score
      || scoreNumber(match.away_penalty_score) !== next.away_penalty_score
      || text(match.home_scorers) !== next.home_scorers
      || text(match.away_scorers) !== next.away_scorers
      || text(match.home_penalty_scorers) !== next.home_penalty_scorers
      || text(match.away_penalty_scorers) !== next.away_penalty_scorers
      || text(match.home_penalty_misses) !== next.home_penalty_misses
      || text(match.away_penalty_misses) !== next.away_penalty_misses
      || match.status !== next.status
      || text(match.minute) !== next.minute;
    return { card, match, game, next, changed };
  }).filter(Boolean);
}

function renderApiPreview() {
  if (!apiSyncPreview) return;
  const diffs = linkedApiDiffs();
  apiSyncPreview.hidden = !diffs.length;
  apiSyncPreview.innerHTML = diffs.length
    ? diffs.slice(0, 12).map(item => {
      const currentQualified = qualifiedTeamName(item.match);
      const nextMatch = { ...item.match, ...item.next };
      const nextQualified = qualifiedTeamName(nextMatch);
      return `
      <div class="api-sync-row ${item.changed ? "has-change" : ""}">
        <strong>${escapeHtml(item.match.home || apiTeamName(item.game, "home"))} - ${escapeHtml(item.match.away || apiTeamName(item.game, "away"))}</strong>
        <span>
          ${escapeHtml(scoreWithPenalties(item.match))} / ${escapeHtml(item.match.status)}
          ${currentQualified ? ` / ${escapeHtml(currentQualified)} qualifié` : ""}
          →
          ${escapeHtml(scoreWithPenalties(nextMatch))} / ${escapeHtml(item.next.status)}
          ${nextQualified ? ` / ${escapeHtml(nextQualified)} qualifié` : ""}
        </span>
      </div>
    `;
    }).join("")
    : "";
}

function apiAutoSyncOptions() {
  return {
    intervalSeconds: boundedNumber(apiAutoSyncIntervalInput?.value, 30, 15, 120),
    mode: apiAutoSyncModeInput?.value === "apply" ? "apply" : "detect",
    onlyPublished: apiAutoOnlyPublishedInput?.checked !== false,
    onlyActive: apiAutoOnlyActiveInput?.checked !== false,
    publishFirebase: apiAutoPublishFirebaseInput?.checked !== false
  };
}

function filteredApiDiffs(options = {}) {
  return linkedApiDiffs().filter(item => {
    if (options.onlyPublished && item.match.published === false) return false;
    if (options.onlyActive && isFinished(item.match) && isFinished({ ...item.match, ...item.next })) {
      const penaltyChanged = scoreNumber(item.match.home_penalty_score) !== item.next.home_penalty_score
        || scoreNumber(item.match.away_penalty_score) !== item.next.away_penalty_score
        || text(item.match.home_scorers) !== item.next.home_scorers
        || text(item.match.away_scorers) !== item.next.away_scorers
        || text(item.match.home_penalty_scorers) !== item.next.home_penalty_scorers
        || text(item.match.away_penalty_scorers) !== item.next.away_penalty_scorers
        || text(item.match.home_penalty_misses) !== item.next.home_penalty_misses
        || text(item.match.away_penalty_misses) !== item.next.away_penalty_misses;
      if (!penaltyChanged) return false;
    }
    return item.changed;
  });
}

function apiChangeLabel(item) {
  const nextMatch = { ...item.match, ...item.next };
  const qualified = qualifiedTeamName(nextMatch);
  return `${item.match.home || apiTeamName(item.game, "home")} - ${item.match.away || apiTeamName(item.game, "away")} : ${scoreWithPenalties(item.match)} → ${scoreWithPenalties(nextMatch)} / ${item.next.status}${qualified ? ` / ${qualified} qualifié` : ""}`;
}

function addApiLog(message, type = "info") {
  const time = new Intl.DateTimeFormat("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  }).format(new Date());
  apiSyncLog.unshift({ time, message, type });
  apiSyncLog = apiSyncLog.slice(0, 30);
  renderApiLog();
}

function renderApiLog() {
  if (!apiSyncLogRows) return;
  apiSyncLogRows.innerHTML = apiSyncLog.length
    ? apiSyncLog.map(entry => `
      <div class="api-sync-log-row ${entry.type}">
        <span>${escapeHtml(entry.time)}</span>
        <strong>${escapeHtml(entry.message)}</strong>
      </div>
    `).join("")
    : `<div class="api-sync-log-empty">Aucun événement pour le moment.</div>`;
}

function applyApiDiffs(diffs, { log = true } = {}) {
  let updated = 0;
  diffs.forEach(item => {
    item.card.querySelector('[data-field="home_score"]').value = item.next.home_score;
    item.card.querySelector('[data-field="away_score"]').value = item.next.away_score;
    item.card.querySelector('[data-field="home_penalty_score"]').value = item.next.home_penalty_score;
    item.card.querySelector('[data-field="away_penalty_score"]').value = item.next.away_penalty_score;
    item.card.querySelector('[data-field="home_scorers"]').value = item.next.home_scorers;
    item.card.querySelector('[data-field="away_scorers"]').value = item.next.away_scorers;
    item.card.querySelector('[data-field="home_penalty_scorers"]').value = item.next.home_penalty_scorers;
    item.card.querySelector('[data-field="away_penalty_scorers"]').value = item.next.away_penalty_scorers;
    item.card.querySelector('[data-field="home_penalty_misses"]').value = item.next.home_penalty_misses;
    item.card.querySelector('[data-field="away_penalty_misses"]').value = item.next.away_penalty_misses;
    item.card.querySelector('[data-field="status"]').value = item.next.status;
    item.card.querySelector('[data-field="minute"]').value = item.next.minute;
    updateMatchSummary(item.card);
    if (log) addApiLog(apiChangeLabel(item), "applied");
    updated++;
  });
  if (updated) {
    refreshCalculatedStandings();
    renderApiPreview();
    scheduleSave();
  }
  return updated;
}

async function testApiConnection() {
  apiTestButton.disabled = true;
  setApiStatus("Test de connexion API…");
  try {
    const games = await fetchApiGames();
    setApiStatus(`API OK : ${games.length} matchs reçus.`);
    renderApiPreview();
    showNotice("Connexion API World Cup 2026 réussie.");
  } catch (error) {
    setApiStatus(firebaseErrorMessage(error), true);
    showNotice(firebaseErrorMessage(error), true);
  } finally {
    apiTestButton.disabled = false;
  }
}

async function loadApiGames() {
  apiLoadGamesButton.disabled = true;
  setApiStatus("Chargement des matchs API…");
  try {
    const games = await fetchApiGames();
    setApiStatus(`${games.length} matchs API chargés. Vous pouvez maintenant lier les matchs locaux.`);
    renderApiPreview();
  } catch (error) {
    setApiStatus(firebaseErrorMessage(error), true);
    showNotice(firebaseErrorMessage(error), true);
  } finally {
    apiLoadGamesButton.disabled = false;
  }
}

async function applyLinkedApiScores() {
  if (!apiGames.length) {
    await loadApiGames();
    if (!apiGames.length) return;
  }
  const updated = applyApiDiffs(filteredApiDiffs({
    onlyPublished: false,
    onlyActive: false
  }));
  showNotice(updated ? `${updated} match${updated > 1 ? "s" : ""} synchronisé${updated > 1 ? "s" : ""} depuis l’API.` : "Aucun score lié à mettre à jour.");
}

function scheduleApiAutoSync(immediate = false) {
  clearTimeout(apiAutoSyncTimer);
  if (!apiAutoSyncToggle?.checked) return;
  const delay = immediate ? 0 : apiAutoSyncOptions().intervalSeconds * 1000;
  apiAutoSyncTimer = setTimeout(runApiAutoSync, delay);
}

function stopApiAutoSync(message = "Auto-sync API arrêtée.") {
  clearTimeout(apiAutoSyncTimer);
  apiAutoSyncTimer = null;
  apiAutoSyncRunning = false;
  if (apiAutoSyncToggle) apiAutoSyncToggle.checked = false;
  setApiStatus(message);
  addApiLog(message, "info");
}

async function runApiAutoSync() {
  if (!apiAutoSyncToggle?.checked || apiAutoSyncRunning) return;
  apiAutoSyncRunning = true;
  const options = apiAutoSyncOptions();
  try {
    await fetchApiGames();
    const diffs = filteredApiDiffs(options);
    if (!diffs.length) {
      setApiStatus(`Auto-sync actif : aucun changement détecté. Prochain contrôle dans ${options.intervalSeconds}s.`);
      addApiLog("Aucun changement détecté.", "info");
      return;
    }

    if (options.mode === "detect") {
      renderApiPreview();
      setApiStatus(`Auto-sync détection : ${diffs.length} changement${diffs.length > 1 ? "s" : ""} détecté${diffs.length > 1 ? "s" : ""}.`);
      diffs.slice(0, 5).forEach(item => addApiLog(`Détecté — ${apiChangeLabel(item)}`, "detected"));
      return;
    }

    const updated = applyApiDiffs(diffs);
    setApiStatus(`Auto-sync appliqué : ${updated} match${updated > 1 ? "s" : ""} mis à jour.`);
    if (updated && options.publishFirebase) {
      if (currentUser) await publishToFirebase(true);
      else addApiLog("Publication Firebase ignorée : non connecté.", "warning");
    }
  } catch (error) {
    setApiStatus(firebaseErrorMessage(error), true);
    addApiLog(`Erreur auto-sync : ${firebaseErrorMessage(error)}`, "error");
  } finally {
    apiAutoSyncRunning = false;
    scheduleApiAutoSync(false);
  }
}

function setCardExpanded(card, expanded) {
  card.classList.toggle("is-collapsed", !expanded);
  card.querySelector(".summary-toggle").setAttribute("aria-expanded", String(expanded));
  if (expanded) {
    const container = card.classList.contains("group-editor") ? groupsEditor : editor;
    container.querySelectorAll(".match-editor").forEach(other => {
      if (other !== card) {
        other.classList.add("is-collapsed");
        other.querySelector(".summary-toggle")?.setAttribute("aria-expanded", "false");
      }
    });
  }
}

function fillMatch(card, match, index) {
  card.dataset.matchId = match.id || crypto.randomUUID();
  card.dataset.desiredGroupId = match.group_id || "";
  card.querySelectorAll("[data-field]").forEach(input => {
    const key = input.dataset.field;
    if (input.type === "checkbox") {
      input.checked = match[key] !== false;
      return;
    }
    let fallback = key.endsWith("_score") ? 0 : "";
    if (key === "phase") fallback = "group";
    if (key === "round") fallback = "group-day-1";
    if (key === "status") {
      fallback = ["FT", "FIN"].includes(text(match.minute).toUpperCase()) ? "Terminé" : "À venir";
    }
    if (key === "external_api") fallback = "worldcup2026";
    if (key === "group_id") {
      populateGroupSelect(input, match[key] || "");
    } else if (key === "external_match_id") {
      input.dataset.selectedValue = text(match[key], fallback);
      input.value = text(match[key], fallback);
    } else {
      input.value = text(match[key], fallback);
    }
  });
  if (apiGames.length) populateApiMatchSelects();
  ["home", "away"].forEach(side => {
    const code = card.querySelector(`[data-field="${side}_code"]`).value.trim().toLowerCase();
    const name = card.querySelector(`[data-field="${side}"]`).value;
    card.querySelector(`[data-preview="${side}"]`).src = flagUrl(code, name);
  });
  updateMatchAppearance(card);
  updatePhaseFields(card);
  updateMatchSummary(card);
}

function populateGroupSelect(select, selected = "") {
  const groups = [...groupsEditor.querySelectorAll(".group-editor")].map(card => ({
    id: card.dataset.groupId,
    name: card.querySelector('[data-group-field="name"]').value || "Groupe"
  }));
  select.innerHTML = `<option value="">Sélectionner un groupe</option>`
    + groups.map(group => `<option value="${group.id}">${group.name}</option>`).join("");
  select.value = selected;
}

function updateAllGroupSelects() {
  editor.querySelectorAll('[data-field="group_id"]').forEach(select => {
    const desired = select.value || select.closest(".match-editor").dataset.desiredGroupId || "";
    populateGroupSelect(select, desired);
    select.closest(".match-editor").dataset.desiredGroupId = select.value;
  });
  const activeFilter = matchGroupFilter.value;
  matchGroupFilter.innerHTML = `<option value="">Tous</option>` + [...groupsEditor.querySelectorAll(".group-editor")]
    .map(card => `<option value="${card.dataset.groupId}">${escapeHtml(card.querySelector('[data-group-field="name"]').value || "Groupe")}</option>`)
    .join("");
  matchGroupFilter.value = activeFilter;

  const groups = [...groupsEditor.querySelectorAll(".group-editor")].map(readGroup);
  editor.querySelectorAll(".match-editor").forEach(card => {
    const select = card.querySelector('[data-field="group_id"]');
    if (select.value || card.querySelector('[data-field="phase"]').value !== "group") return;
    const inferred = inferGroupId(readMatch(card), groups);
    if (inferred) {
      select.value = inferred;
      card.dataset.desiredGroupId = inferred;
      updateMatchSummary(card);
    }
  });
}

function allRegisteredTeams() {
  const unique = new Map();
  groupsEditor.querySelectorAll(".group-editor").forEach(card => {
    const groupId = card.dataset.groupId;
    const groupName = card.querySelector('[data-group-field="name"]').value.trim();
    card.querySelectorAll(".standing-team-row").forEach(row => {
      const code = row.querySelector('[data-team-field="code"]').value.trim().toLowerCase();
      const name = row.querySelector('[data-team-field="name"]').value.trim();
      if (!code || !name) return;
      unique.set(`${groupId}:${code}`, { code, name, groupId, groupName });
    });
  });
  return [...unique.values()];
}

function teamsForMatch(card) {
  const phase = card.querySelector('[data-field="phase"]').value;
  const groupId = card.querySelector('[data-field="group_id"]').value;
  const teams = allRegisteredTeams();
  return phase === "group" && groupId
    ? teams.filter(team => team.groupId === groupId)
    : teams.filter((team, index, source) =>
        source.findIndex(candidate => candidate.code === team.code) === index
      );
}

function selectSuggestedTeam(card, side, team) {
  card.querySelector(`[data-field="${side}"]`).value = team.name;
  card.querySelector(`[data-field="${side}_code"]`).value = team.code;
  card.querySelector(`[data-preview="${side}"]`).src = flagUrl(team.code, team.name);
  card.querySelector(`[data-suggestions="${side}"]`).hidden = true;
  scheduleSave();
}

function renderTeamSuggestions(card, side) {
  const input = card.querySelector(`[data-field="${side}"]`);
  const suggestions = card.querySelector(`[data-suggestions="${side}"]`);
  const query = input.value.trim().toLocaleLowerCase("fr");
  const opponentSide = side === "home" ? "away" : "home";
  const opponentCode = card.querySelector(`[data-field="${opponentSide}_code"]`).value;
  const candidates = teamsForMatch(card)
    .filter(team => team.code !== opponentCode)
    .filter(team => !query
      || team.name.toLocaleLowerCase("fr").includes(query)
      || team.code.includes(query)
    );

  if (!candidates.length) {
    suggestions.innerHTML = `<div class="team-suggestions-empty">Aucune équipe disponible dans ce groupe</div>`;
  } else {
    suggestions.innerHTML = candidates.map(team => `
      <button class="team-suggestion" type="button" data-team-code="${team.code}">
        <img src="${flagUrl(team.code, team.name)}" alt="">
        <strong>${escapeHtml(team.name)}</strong>
        <small>${escapeHtml(team.groupName || team.code)}</small>
      </button>
    `).join("");
    suggestions.querySelectorAll(".team-suggestion").forEach(button => {
      button.addEventListener("mousedown", event => {
        event.preventDefault();
        selectSuggestedTeam(
          card,
          side,
          candidates.find(team => team.code === button.dataset.teamCode)
        );
      });
    });
  }
  suggestions.hidden = false;
}

function clearInvalidSelectedTeam(card, side) {
  const codeInput = card.querySelector(`[data-field="${side}_code"]`);
  if (!codeInput.value) return;
  const valid = teamsForMatch(card).some(team => team.code === codeInput.value);
  if (!valid) {
    card.querySelector(`[data-field="${side}"]`).value = "";
    codeInput.value = "";
    card.querySelector(`[data-preview="${side}"]`).src = "";
  }
}

function updatePhaseFields(card) {
  const isGroup = card.querySelector('[data-field="phase"]').value === "group";
  card.querySelector(".group-reference-field").hidden = !isGroup;
}

function bindMatch(card) {
  card.querySelector(".summary-toggle").addEventListener("click", () => {
    setCardExpanded(card, card.classList.contains("is-collapsed"));
  });
  card.addEventListener("input", event => {
    for (const side of ["home", "away"]) {
      if (event.target.matches(`[data-field="${side}_code"]`)) {
        const code = event.target.value.trim().toLowerCase();
        const name = card.querySelector(`[data-field="${side}"]`).value;
        card.querySelector(`[data-preview="${side}"]`).src = flagUrl(code, name);
      }
    }
    for (const side of ["home", "away"]) {
      if (event.target.matches(`[data-field="${side}"]`)) {
        card.querySelector(`[data-field="${side}_code"]`).value = "";
        card.querySelector(`[data-preview="${side}"]`).src = "";
        renderTeamSuggestions(card, side);
      }
    }
    updateMatchSummary(card);
    scheduleSave();
  });
  card.addEventListener("change", event => {
    if (event.target.matches('[data-field="published"]')) updateMatchAppearance(card);
    if (event.target.matches("[data-api-link-select]")) {
      event.target.dataset.selectedValue = event.target.value;
      card.querySelector('[data-field="external_api"]').value = event.target.value ? "worldcup2026" : "";
      renderApiPreview();
    }
    if (event.target.matches('[data-field="phase"], [data-field="group_id"]')) {
      updatePhaseFields(card);
      clearInvalidSelectedTeam(card, "home");
      clearInvalidSelectedTeam(card, "away");
    }
    updateMatchSummary(card);
    applyMatchFilters();
    scheduleSave();
  });
  ["home", "away"].forEach(side => {
    const input = card.querySelector(`[data-field="${side}"]`);
    const suggestions = card.querySelector(`[data-suggestions="${side}"]`);
    input.addEventListener("focus", () => renderTeamSuggestions(card, side));
    input.addEventListener("keydown", event => {
      if (event.key === "Escape") suggestions.hidden = true;
    });
    input.addEventListener("blur", () => {
      setTimeout(() => { suggestions.hidden = true; }, 120);
    });
  });
  card.querySelectorAll("[data-score-action]").forEach(button => {
    button.addEventListener("click", () => {
      const [side, delta] = button.dataset.scoreAction.split(":");
      const input = card.querySelector(`[data-field="${side}_score"]`);
      input.value = Math.max(0, number(input.value) + Number(delta));
      updateMatchSummary(card);
      scheduleSave();
    });
  });
  card.querySelector(".duplicate-match").addEventListener("click", () => {
    addMatch({ ...readMatch(card), id: crypto.randomUUID() }, card);
    showNotice("Le match a été dupliqué.");
  });
  card.querySelector(".remove-match").addEventListener("click", () => {
    if (!confirm("Supprimer définitivement ce match ? Cette action est irréversible après publication.")) return;
    card.remove();
    refreshNumbers();
    updateSceneSelectors();
    applyMatchFilters();
    scheduleSave();
  });
}

function addMatch(match = emptyMatch(), afterCard = null, expand = true) {
  const fragment = matchTemplate.content.cloneNode(true);
  const card = fragment.querySelector(".match-editor");
  fillMatch(card, match, editor.children.length);
  bindMatch(card);
  if (afterCard) afterCard.insertAdjacentElement("afterend", card);
  else if (expand && !rendering) editor.prepend(card);
  else editor.appendChild(card);
  refreshNumbers();
  updateSceneSelectors();
  if (expand) {
    setCardExpanded(card, true);
    card.classList.remove("is-beyond-limit", "is-filtered");
  }
  applyMatchFilters();
  scheduleSave();
  return card;
}

function fillTeamRow(row, team) {
  row.querySelectorAll("[data-team-field]").forEach(input => {
    const key = input.dataset.teamField;
    input.value = text(team[key], ["code", "name"].includes(key) ? "" : 0);
  });
}

function addTeam(groupCard, team = emptyTeam()) {
  const fragment = standingTeamTemplate.content.cloneNode(true);
  const row = fragment.querySelector(".standing-team-row");
  fillTeamRow(row, team);
  row.addEventListener("input", scheduleSave);
  row.querySelector(".remove-team").addEventListener("click", () => {
    row.remove();
    updateGroupSummary(groupCard);
    scheduleSave();
  });
  groupCard.querySelector(".group-teams").appendChild(row);
  updateGroupSummary(groupCard);
}

function updateGroupAppearance(card) {
  const published = card.querySelector('[data-group-field="published"]').checked;
  card.classList.toggle("is-unpublished", !published);
  card.querySelector(".publish-switch span").textContent = published ? "Publié" : "Dépublié";
}

function fillGroup(card, group, index) {
  card.dataset.groupId = group.id || crypto.randomUUID();
  card.querySelector('[data-group-field="published"]').checked = group.published !== false;
  card.querySelector('[data-group-field="name"]').value = text(group.name, `Groupe ${String.fromCharCode(65 + index)}`);
  card.querySelector('[data-group-field="subtitle"]').value = text(group.subtitle, "Coupe du Monde 2026");
  card.querySelector('[data-group-field="rules_profile"]').value = text(group.rules_profile, "fifa-world-cup-2026");
  (Array.isArray(group.teams) ? group.teams : []).forEach(team => addTeam(card, team));
  updateGroupAppearance(card);
  updateGroupSummary(card);
}

function bindGroup(card) {
  card.querySelector(".summary-toggle").addEventListener("click", () => {
    setCardExpanded(card, card.classList.contains("is-collapsed"));
  });
  card.addEventListener("input", event => {
    if (event.target.matches('[data-group-field="name"]')) updateAllGroupSelects();
    updateGroupSummary(card);
    scheduleSave();
  });
  card.addEventListener("change", event => {
    if (event.target.matches('[data-group-field="published"]')) updateGroupAppearance(card);
    scheduleSave();
  });
  card.querySelector(".add-team").addEventListener("click", () => {
    addTeam(card);
    updateGroupSummary(card);
    scheduleSave();
  });
  card.querySelector(".duplicate-group").addEventListener("click", () => {
    addGroup({ ...readGroup(card), id: crypto.randomUUID() }, card);
    showNotice("Le classement a été dupliqué.");
  });
  card.querySelector(".remove-group").addEventListener("click", () => {
    if (!confirm("Supprimer définitivement ce classement ?")) return;
    card.remove();
    refreshNumbers();
    updateAllGroupSelects();
    updateSceneSelectors();
    scheduleSave();
  });
}

function addGroup(group = emptyGroup(), afterCard = null) {
  const fragment = groupTemplate.content.cloneNode(true);
  const card = fragment.querySelector(".group-editor");
  bindGroup(card);
  fillGroup(card, group, groupsEditor.children.length);
  if (afterCard) afterCard.insertAdjacentElement("afterend", card);
  else if (!rendering) groupsEditor.prepend(card);
  else groupsEditor.appendChild(card);
  refreshNumbers();
  updateAllGroupSelects();
  updateSceneSelectors();
  if (!rendering) setCardExpanded(card, true);
  scheduleSave();
  return card;
}

function refreshNumbers() {
  matchCount.textContent = editor.children.length;
  groupCount.textContent = groupsEditor.children.length;
}

function applyMatchFilters(resetLimit = false) {
  if (resetLimit) visibleMatchLimit = 30;
  const query = matchSearch.value.trim().toLocaleLowerCase("fr");
  const phase = matchPhaseFilter.value;
  const status = matchStatusFilter.value;
  const groupId = matchGroupFilter.value;
  const includeUnpublished = showUnpublishedMatches.checked;
  let filteredCount = 0;
  let visibleCount = 0;

  [...editor.querySelectorAll(".match-editor")].forEach(card => {
    const match = readMatch(card);
    const haystack = [
      match.home, match.away, match.competition, match.kickoff, match.status, match.info
    ].join(" ").toLocaleLowerCase("fr");
    const matchesFilter = (!query || haystack.includes(query))
      && (!phase || match.phase === phase)
      && (!status || match.status === status)
      && (!groupId || match.group_id === groupId)
      && (includeUnpublished || match.published);
    card.classList.toggle("is-filtered", !matchesFilter);
    if (!matchesFilter) {
      card.classList.remove("is-beyond-limit");
      return;
    }
    filteredCount++;
    visibleCount++;
    card.classList.toggle("is-beyond-limit", visibleCount > visibleMatchLimit);
  });

  const displayed = Math.min(filteredCount, visibleMatchLimit);
  matchResultsInfo.textContent = `${displayed} affiché${displayed > 1 ? "s" : ""} sur ${filteredCount} résultat${filteredCount > 1 ? "s" : ""} — ${editor.children.length} match${editor.children.length > 1 ? "s" : ""} au total`;
  loadMoreMatches.hidden = filteredCount <= visibleMatchLimit;
}

function refreshCalculatedStandings() {
  const matches = [...editor.querySelectorAll(".match-editor")].map(readMatch);
  groupsEditor.querySelectorAll(".group-editor").forEach(card => {
    const group = readGroup(card);
    const standings = calculateStandings(group, matches, group.rules_profile);
    const rows = [...card.querySelectorAll(".standing-team-row")];
    standings.forEach(stats => {
      const row = rows.find(item => item.querySelector('[data-team-field="code"]').value.trim() === stats.code);
      if (!row) return;
      row.querySelectorAll("[data-stat]").forEach(output => {
        output.textContent = stats[output.dataset.stat];
      });
      card.querySelector(".group-teams").appendChild(row);
    });
  });
}

function render(data) {
  rendering = true;
  editor.innerHTML = "";
  groupsEditor.innerHTML = "";
  updatedAtInput.value = text(data.updated_at, formatCasablancaDate());
  fillSettings(data.settings);
  const sourceMatches = Array.isArray(data.matches) && data.matches.length ? data.matches : [emptyMatch()];
  sourceMatches.forEach(match => addMatch(match, null, false));
  (Array.isArray(data.groups) ? data.groups : []).forEach(group => addGroup(group));
  refreshNumbers();
  updateAllGroupSelects();
  updateSceneSelectors();
  refreshCalculatedStandings();
  applyMatchFilters(true);
  rendering = false;
  saveDraft();
}

function firebaseErrorMessage(error) {
  const messages = {
    "auth/invalid-credential": "E-mail ou mot de passe incorrect.",
    "auth/invalid-email": "Adresse e-mail invalide.",
    "auth/too-many-requests": "Trop de tentatives. Réessayez plus tard.",
    "auth/network-request-failed": "Connexion réseau impossible.",
    "PERMISSION_DENIED": "Écriture refusée par les règles Firebase."
  };
  return messages[error.code] || messages[error.message] || error.message;
}

async function loginToFirebase() {
  if (!firebaseConfigured) return showNotice("Firebase n’est pas configuré.", true);
  const email = firebaseEmailInput.value.trim();
  const password = firebasePasswordInput.value;
  if (!email || !password) return showNotice("Saisissez l’e-mail et le mot de passe.", true);
  const button = document.getElementById("firebaseLoginButton");
  button.disabled = true;
  button.textContent = "Connexion…";
  try {
    await signInWithEmailAndPassword(firebaseAuth, email, password);
    firebasePasswordInput.value = "";
    showNotice("Connexion Firebase réussie.");
  } catch (error) {
    showNotice(firebaseErrorMessage(error), true);
  } finally {
    button.disabled = false;
    button.textContent = "Se connecter";
  }
}

async function publishToFirebase(silent = false) {
  if (!currentUser) return showNotice("Connectez-vous à Firebase avant de publier.", true);
  const original = publishButton.textContent;
  if (!silent) {
    publishButton.disabled = true;
    publishButton.textContent = "Publication…";
  }
  try {
    updatedAtInput.value = formatCasablancaDate();
    const data = buildData();
    const errors = validateData(data);
    if (errors.length) {
      throw new Error(errors.slice(0, 3).join(" "));
    }
    await set(ref(firebaseDatabase, "liveScores"), data);
    localStorage.removeItem(DRAFT_KEY);
    if (!silent) showNotice("Matchs et classements publiés instantanément.");
  } catch (error) {
    showNotice(firebaseErrorMessage(error), true);
  } finally {
    if (!silent) {
      publishButton.disabled = false;
      publishButton.textContent = original;
    }
  }
}

async function loadData(ignoreDraft = false) {
  try {
    if (!ignoreDraft) {
      const draft = localStorage.getItem(DRAFT_KEY);
      if (draft) {
        render(JSON.parse(draft));
        return showNotice("Brouillon local restauré.");
      }
    }
    if (firebaseConfigured && new URLSearchParams(location.search).get("source") !== "json") {
      const snapshot = await get(ref(firebaseDatabase, "liveScores"));
      if (snapshot.exists()) {
        render(snapshot.val());
        return showNotice("Les données Firebase ont été chargées.");
      }
    }
    const response = await fetch(`scores.json?t=${Date.now()}`, { cache: "no-store" });
    render(await response.json());
    showNotice("Le fichier de secours a été chargé.");
  } catch (error) {
    render({ matches: [emptyMatch()], groups: [] });
    showNotice("Les données n’ont pas pu être chargées.", true);
  }
}

function downloadJson() {
  const blob = new Blob([buildJson()], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "scores.json";
  link.click();
  URL.revokeObjectURL(url);
}

document.getElementById("addMatchButton").addEventListener("click", () => {
  matchSearch.value = "";
  matchPhaseFilter.value = "";
  matchStatusFilter.value = "";
  matchGroupFilter.value = "";
  showUnpublishedMatches.checked = true;
  const card = addMatch();
  card.scrollIntoView({ behavior: "smooth", block: "start" });
});
document.getElementById("addGroupButton").addEventListener("click", () => {
  const card = addGroup();
  card.scrollIntoView({ behavior: "smooth", block: "start" });
});
[
  matchSearch,
  matchPhaseFilter,
  matchStatusFilter,
  matchGroupFilter,
  showUnpublishedMatches
].forEach(control => {
  control.addEventListener(control === matchSearch ? "input" : "change", () => applyMatchFilters(true));
});
loadMoreMatches.addEventListener("click", () => {
  visibleMatchLimit += 30;
  applyMatchFilters();
});
document.getElementById("setNowButton").addEventListener("click", () => {
  updatedAtInput.value = formatCasablancaDate();
  syncControlRoom();
  scheduleSave();
});
document.getElementById("reloadButton").addEventListener("click", () => {
  if (!confirm("Remplacer le brouillon par les données Firebase ?")) return;
  localStorage.removeItem(DRAFT_KEY);
  loadData(true);
});
document.getElementById("downloadButton").addEventListener("click", downloadJson);
document.getElementById("copyButton").addEventListener("click", async () => {
  await navigator.clipboard.writeText(buildJson());
  showNotice("Le JSON a été copié.");
});
document.getElementById("firebaseLoginButton").addEventListener("click", loginToFirebase);
document.getElementById("firebaseLogoutButton").addEventListener("click", () => signOut(firebaseAuth));
publishButton.addEventListener("click", () => publishToFirebase(false));
updatedAtInput.addEventListener("input", () => {
  syncControlRoom();
  scheduleSave();
});
[scoreSceneDurationInput, standingsSceneDurationInput, videoSceneDurationInput, scoreSceneBeforeMinutesInput, scoreSceneAfterMinutesInput].forEach(input => {
  input.addEventListener("input", scheduleSave);
  input.addEventListener("change", scheduleSave);
});
[matchBackgroundUrlInput, matchVideoBackgroundUrlInput, standingsBackgroundUrlInput, tickerBackgroundUrlInput].forEach(input => {
  input.addEventListener("input", scheduleSave);
  input.addEventListener("change", scheduleSave);
});
videoPlaylistUrlsInput.addEventListener("input", scheduleSave);
videoPlaylistUrlsInput.addEventListener("change", scheduleSave);
[autoRotateScenesInput, showTickerInput, showGoalAlertInput, autoStartMatchesInput, enableGoalSoundInput, includeMatchScenesInput, includeMatchVideoScenesInput, includeGroupScenesInput, includeTickerSceneInput, includeVideoSceneInput, enableVideoSoundInput].forEach(input => {
  input.addEventListener("change", scheduleSave);
});
[sceneModeInput, selectedMatchSceneInput, selectedGroupSceneInput].forEach(input => {
  input.addEventListener("change", () => {
    syncControlRoom();
    scheduleSave();
  });
});
autoPublishToggle.addEventListener("change", () => {
  if (autoPublishToggle.checked && !currentUser) {
    autoPublishToggle.checked = false;
    showNotice("Connectez-vous avant d’activer la publication automatique.", true);
  } else if (autoPublishToggle.checked) publishToFirebase(true);
  syncControlRoom();
});
firebasePasswordInput.addEventListener("keydown", event => {
  if (event.key === "Enter") loginToFirebase();
});

document.querySelectorAll("[data-control-scene]").forEach(button => {
  button.addEventListener("click", () => setControlScene(button.dataset.controlScene));
});
controlMatchSceneInput?.addEventListener("change", () => {
  selectedMatchSceneInput.value = controlMatchSceneInput.value;
  selectedMatchSceneInput.dataset.selectedValue = controlMatchSceneInput.value;
  if (sceneModeInput.value === "auto") sceneModeInput.value = "match";
  syncControlRoom();
  publishOrSaveFromControl();
});
controlGroupSceneInput?.addEventListener("change", () => {
  selectedGroupSceneInput.value = controlGroupSceneInput.value;
  selectedGroupSceneInput.dataset.selectedValue = controlGroupSceneInput.value;
  if (sceneModeInput.value === "auto") sceneModeInput.value = "group";
  syncControlRoom();
  publishOrSaveFromControl();
});
controlPublishButton?.addEventListener("click", () => publishToFirebase(false));
controlAutoRotateButton?.addEventListener("click", () => {
  autoRotateScenesInput.checked = !autoRotateScenesInput.checked;
  syncControlRoom();
  publishOrSaveFromControl();
});
controlAutoPublishButton?.addEventListener("click", () => {
  autoPublishToggle.checked = !autoPublishToggle.checked;
  autoPublishToggle.dispatchEvent(new Event("change"));
});
apiTestButton?.addEventListener("click", testApiConnection);
apiLoadGamesButton?.addEventListener("click", loadApiGames);
apiApplyScoresButton?.addEventListener("click", applyLinkedApiScores);
apiAutoSyncToggle?.addEventListener("change", () => {
  if (apiAutoSyncToggle.checked) {
    const options = apiAutoSyncOptions();
    if (options.mode === "apply" && options.publishFirebase && !currentUser) {
      showNotice("Auto-sync activé, mais connectez-vous à Firebase pour publier automatiquement.", true);
    }
    setApiStatus(`Auto-sync API activé : mode ${options.mode === "apply" ? "application" : "détection"}, toutes les ${options.intervalSeconds}s.`);
    addApiLog("Auto-sync API activé.", "info");
    scheduleApiAutoSync(true);
  } else {
    stopApiAutoSync();
  }
});
[apiAutoSyncIntervalInput, apiAutoSyncModeInput, apiAutoOnlyPublishedInput, apiAutoOnlyActiveInput, apiAutoPublishFirebaseInput].forEach(input => {
  input?.addEventListener("change", () => {
    if (!apiAutoSyncToggle?.checked) return;
    const options = apiAutoSyncOptions();
    setApiStatus(`Auto-sync mis à jour : mode ${options.mode === "apply" ? "application" : "détection"}, toutes les ${options.intervalSeconds}s.`);
    addApiLog("Paramètres auto-sync modifiés.", "info");
    scheduleApiAutoSync(false);
  });
});

document.querySelectorAll(".section-tab").forEach(button => {
  button.addEventListener("click", () => {
    document.querySelectorAll(".section-tab").forEach(tab => tab.classList.toggle("active", tab === button));
    document.querySelectorAll(".admin-section").forEach(section => {
      section.classList.toggle("active", section.id === button.dataset.sectionTarget);
    });
  });
});

const requestedSection = new URLSearchParams(window.location.search).get("section");
if (requestedSection) {
  document.querySelector(`.section-tab[data-section-target="${requestedSection}Section"]`)?.click();
}

if (firebaseConfigured) {
  onAuthStateChanged(firebaseAuth, user => {
    currentUser = user;
    setFirebaseState(Boolean(user), user ? `Connecté : ${user.email}` : "");
    if (user) firebaseEmailInput.value = user.email || "";
    else autoPublishToggle.checked = false;
  });
}

loadData();

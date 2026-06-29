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
const includeGroupScenesInput = document.getElementById("includeGroupScenes");
const includeTickerSceneInput = document.getElementById("includeTickerScene");
const matchBackgroundUrlInput = document.getElementById("matchBackgroundUrl");
const standingsBackgroundUrlInput = document.getElementById("standingsBackgroundUrl");
const tickerBackgroundUrlInput = document.getElementById("tickerBackgroundUrl");

let draftTimer;
let autoPublishTimer;
let currentUser = null;
let rendering = false;
let firebaseAuth;
let firebaseDatabase;
let visibleMatchLimit = 30;

if (firebaseConfigured) {
  const app = initializeApp(firebaseConfig);
  firebaseAuth = getAuth(app);
  firebaseDatabase = getDatabase(app);
}

const text = (value, fallback = "") =>
  value === undefined || value === null ? fallback : String(value);

const DEFAULT_SETTINGS = {
  score_scene_duration: 10,
  standings_scene_duration: 8,
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
  include_group_scenes: true,
  include_ticker_scene: false,
  match_background_url: "assets/bg-scene-match.png",
  standings_background_url: "assets/bg-scene-standings.png",
  ticker_background_url: "assets/bg-scene-live-updates.png"
};

const LEGACY_SCOREBOARD_BACKGROUNDS = new Set([
  "assets/bg-scoreboard-16-9-v2.png",
  "assets/bg-scoreboard-16-9.png"
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

function boundedNumber(value, fallback, min, max) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function readSettings() {
  return {
    score_scene_duration: boundedNumber(scoreSceneDurationInput.value, DEFAULT_SETTINGS.score_scene_duration, 3, 60),
    standings_scene_duration: boundedNumber(standingsSceneDurationInput.value, DEFAULT_SETTINGS.standings_scene_duration, 3, 60),
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
    include_group_scenes: includeGroupScenesInput.checked,
    include_ticker_scene: includeTickerSceneInput.checked,
    match_background_url: sceneBackgroundSetting(matchBackgroundUrlInput.value, DEFAULT_SETTINGS.match_background_url),
    standings_background_url: sceneBackgroundSetting(standingsBackgroundUrlInput.value, DEFAULT_SETTINGS.standings_background_url),
    ticker_background_url: sceneBackgroundSetting(tickerBackgroundUrlInput.value, DEFAULT_SETTINGS.ticker_background_url)
  };
}

function sceneBackgroundSetting(input, fallback) {
  const url = text(input, fallback).trim();
  return LEGACY_SCOREBOARD_BACKGROUNDS.has(url) ? fallback : url;
}

function fillSettings(settings = {}) {
  const merged = { ...DEFAULT_SETTINGS, ...settings };
  scoreSceneDurationInput.value = boundedNumber(merged.score_scene_duration, DEFAULT_SETTINGS.score_scene_duration, 3, 60);
  standingsSceneDurationInput.value = boundedNumber(merged.standings_scene_duration, DEFAULT_SETTINGS.standings_scene_duration, 3, 60);
  scoreSceneBeforeMinutesInput.value = boundedNumber(merged.score_scene_before_minutes, DEFAULT_SETTINGS.score_scene_before_minutes, 0, 240);
  scoreSceneAfterMinutesInput.value = boundedNumber(merged.score_scene_after_minutes, DEFAULT_SETTINGS.score_scene_after_minutes, 0, 240);
  autoRotateScenesInput.checked = merged.auto_rotate !== false;
  showTickerInput.checked = merged.show_ticker !== false;
  showGoalAlertInput.checked = merged.show_goal_alert !== false;
  autoStartMatchesInput.checked = merged.auto_start_matches !== false;
  enableGoalSoundInput.checked = merged.enable_goal_sound !== false;
  sceneModeInput.value = ["auto", "match", "group", "ticker"].includes(merged.scene_mode) ? merged.scene_mode : "auto";
  selectedMatchSceneInput.dataset.selectedValue = text(merged.selected_match_id);
  selectedGroupSceneInput.dataset.selectedValue = text(merged.selected_group_id);
  includeMatchScenesInput.checked = merged.include_match_scenes !== false;
  includeGroupScenesInput.checked = merged.include_group_scenes !== false;
  includeTickerSceneInput.checked = merged.include_ticker_scene === true;
  matchBackgroundUrlInput.value = sceneBackgroundSetting(merged.match_background_url, DEFAULT_SETTINGS.match_background_url);
  standingsBackgroundUrlInput.value = sceneBackgroundSetting(merged.standings_background_url, DEFAULT_SETTINGS.standings_background_url);
  tickerBackgroundUrlInput.value = sceneBackgroundSetting(merged.ticker_background_url, DEFAULT_SETTINGS.ticker_background_url);
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
    minute: "0'",
    status: "À venir",
    info: ""
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
    else match[key] = key.endsWith("_score") ? number(input.value) : input.value.trim();
  });
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
    if (key === "group_id") {
      populateGroupSelect(input, match[key] || "");
    } else {
      input.value = text(match[key], fallback);
    }
  });
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
updatedAtInput.addEventListener("input", scheduleSave);
[scoreSceneDurationInput, standingsSceneDurationInput, scoreSceneBeforeMinutesInput, scoreSceneAfterMinutesInput].forEach(input => {
  input.addEventListener("input", scheduleSave);
  input.addEventListener("change", scheduleSave);
});
[matchBackgroundUrlInput, standingsBackgroundUrlInput, tickerBackgroundUrlInput].forEach(input => {
  input.addEventListener("input", scheduleSave);
  input.addEventListener("change", scheduleSave);
});
[autoRotateScenesInput, showTickerInput, showGoalAlertInput, autoStartMatchesInput, enableGoalSoundInput, includeMatchScenesInput, includeGroupScenesInput, includeTickerSceneInput].forEach(input => {
  input.addEventListener("change", scheduleSave);
});
[sceneModeInput, selectedMatchSceneInput, selectedGroupSceneInput].forEach(input => {
  input.addEventListener("change", scheduleSave);
});
autoPublishToggle.addEventListener("change", () => {
  if (autoPublishToggle.checked && !currentUser) {
    autoPublishToggle.checked = false;
    showNotice("Connectez-vous avant d’activer la publication automatique.", true);
  } else if (autoPublishToggle.checked) publishToFirebase(true);
});
firebasePasswordInput.addEventListener("keydown", event => {
  if (event.key === "Enter") loginToFirebase();
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

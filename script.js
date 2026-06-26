import { initializeApp } from "https://www.gstatic.com/firebasejs/12.15.0/firebase-app.js";
import { getDatabase, onValue, ref } from "https://www.gstatic.com/firebasejs/12.15.0/firebase-database.js";
import { firebaseConfig, firebaseConfigured } from "./firebase-config.js";
import { calculateStandings, inferGroupId } from "./standings-engine.js?v=20260626-4";
import { flagUrl } from "./team-utils.js?v=20260626-4";

const ROTATION_INTERVAL = 10_000;
const JSON_REFRESH_INTERVAL = 30_000;
const SCENE_EXIT_DURATION = 260;
const SCENE_ENTER_DURATION = 620;
const GOAL_ALERT_DURATION = 4_200;
const params = new URLSearchParams(window.location.search);

const elements = {
  scoreboard: document.querySelector(".scoreboard"),
  competition: document.getElementById("competition"),
  status: document.getElementById("status"),
  homeFlag: document.getElementById("homeFlag"),
  homeName: document.getElementById("homeName"),
  homeScore: document.getElementById("homeScore"),
  awayScore: document.getElementById("awayScore"),
  awayFlag: document.getElementById("awayFlag"),
  awayName: document.getElementById("awayName"),
  minute: document.getElementById("minute"),
  matchInfo: document.getElementById("matchInfo"),
  pagination: document.getElementById("pagination"),
  groupName: document.getElementById("groupName"),
  groupSubtitle: document.getElementById("groupSubtitle"),
  standingsRows: document.getElementById("standingsRows"),
  goalAlert: document.getElementById("goalAlert"),
  goalTeam: document.getElementById("goalTeam"),
  goalScoreLine: document.getElementById("goalScoreLine"),
  soundUnlock: document.getElementById("soundUnlock"),
  connectionState: document.getElementById("connectionState")
};

let scenes = [];
let activeScene = 0;
let jsonFallbackTimer;
let sceneRenderToken = 0;
let hasRenderedScene = false;
let goalAlertTimer;
let previousScoreByMatch = new Map();
let scoreBaselineReady = false;
let audioContext;
let soundUnlocked = false;

const value = (input, fallback = "") =>
  input === undefined || input === null ? fallback : String(input);

const scoreNumber = input => {
  const parsed = Number.parseInt(value(input, "0"), 10);
  return Number.isFinite(parsed) ? parsed : 0;
};

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

function shouldShowSoundUnlock() {
  return params.get("sound") === "unlock" || params.get("debug") === "1";
}

async function unlockSound() {
  if (params.get("sound") === "0") return false;

  try {
    audioContext ||= new (window.AudioContext || window.webkitAudioContext)();
    await audioContext.resume?.();
    soundUnlocked = audioContext.state === "running";
    elements.soundUnlock.hidden = !shouldShowSoundUnlock() || soundUnlocked;
    return soundUnlocked;
  } catch {
    elements.soundUnlock.hidden = !shouldShowSoundUnlock();
    return false;
  }
}

async function playGoalSound() {
  if (params.get("sound") === "0") return;

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

  elements.goalTeam.textContent = event.team;
  elements.goalScoreLine.textContent = `${event.score.home} - ${event.score.away}`;
  elements.goalAlert.classList.remove("is-visible", "goal-home", "goal-away");
  elements.goalAlert.classList.add(event.side === "home" ? "goal-home" : "goal-away");
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
    elements.goalAlert.setAttribute("aria-hidden", "true");
    elements.scoreboard.classList.remove("goal-flash", "goal-home", "goal-away");
  }, GOAL_ALERT_DURATION);
}

function renderPagination() {
  elements.pagination.innerHTML = scenes
    .map((_, index) => `<span class="${index === activeScene ? "active" : ""}"></span>`)
    .join("");
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
  elements.scoreboard.classList.remove("show-standings");
  const finished = isFinished(match);
  elements.competition.textContent = value(match.competition, "COUPE DU MONDE 2026");
  elements.status.textContent = finished ? "TERMINÉ" : value(match.status, "EN DIRECT");
  elements.homeFlag.src = flagUrl(match.home_code, match.home);
  elements.homeName.textContent = value(match.home, "Équipe 1");
  elements.homeScore.textContent = value(match.home_score, "0");
  elements.awayScore.textContent = value(match.away_score, "0");
  elements.awayFlag.src = flagUrl(match.away_code, match.away);
  elements.awayName.textContent = value(match.away, "Équipe 2");
  elements.minute.textContent = finished ? "TERMINÉ" : value(match.minute, "EN DIRECT");
  elements.minute.classList.toggle("is-finished", finished);
  elements.matchInfo.textContent = value(
    match.info || match.scorers || match.venue || (
      match.kickoff
        ? new Intl.DateTimeFormat("fr-FR", { dateStyle: "long", timeStyle: "short" }).format(new Date(match.kickoff))
        : ""
    ),
    "Scores mis à jour automatiquement"
  );
}

function renderGroup(group) {
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

function renderScene() {
  const token = ++sceneRenderToken;
  if (!scenes.length) {
    elements.scoreboard.classList.remove("show-standings", "scene-group");
    elements.scoreboard.classList.add("scene-match");
    elements.matchInfo.textContent = "Aucun contenu publié";
    return;
  }

  const renderCurrentScene = () => {
    if (token !== sceneRenderToken) return;
    const scene = scenes[activeScene];
    elements.scoreboard.classList.toggle("scene-group", scene.type === "group");
    elements.scoreboard.classList.toggle("scene-match", scene.type !== "group");
    scene.type === "group" ? renderGroup(scene.data) : renderMatch(scene.data);
    renderPagination();
    elements.scoreboard.classList.remove("is-leaving");
    animate();
    hasRenderedScene = true;
  };

  if (!hasRenderedScene) {
    renderCurrentScene();
    return;
  }

  elements.scoreboard.classList.remove("is-changing", "is-entering");
  elements.scoreboard.classList.add("is-leaving");
  window.setTimeout(renderCurrentScene, SCENE_EXIT_DURATION);
}

function applyData(data) {
  const allMatches = Array.isArray(data?.matches) ? data.matches : [];
  const allGroups = Array.isArray(data?.groups) ? data.groups : [];
  const publishedMatches = allMatches.filter(match => match.published !== false);
  const goalEvents = detectGoalEvents(publishedMatches);
  const publishedGroupsById = new Map(
    allGroups
      .filter(group => group.published !== false)
      .map(group => [group.id, group])
  );
  const displayedGroupIds = new Set();

  scenes = [];
  publishedMatches.forEach(match => {
    scenes.push({ type: "match", data: match });

    const groupId = inferGroupId(match, allGroups);
    if (match.phase !== "group" || !groupId) return;
    if (displayedGroupIds.has(groupId)) return;

    const group = publishedGroupsById.get(groupId);
    if (!group) return;

    scenes.push({
      type: "group",
      data: {
        ...group,
        // La publication contrôle uniquement la visibilité des matchs.
        // Tous les résultats du groupe alimentent son classement.
        teams: calculateStandings(group, allMatches, group.rules_profile)
      }
    });
    displayedGroupIds.add(groupId);
  });

  const requestedScene = new URLSearchParams(window.location.search).get("scene");
  if (requestedScene === "group") {
    activeScene = scenes.findIndex(scene => scene.type === "group");
    if (activeScene < 0) activeScene = 0;
  } else if (goalEvents.length) {
    const goalSceneIndex = scenes.findIndex(scene =>
      scene.type === "match" && matchKey(scene.data) === goalEvents[0].key
    );
    if (goalSceneIndex >= 0) activeScene = goalSceneIndex;
  } else {
    activeScene = Math.min(activeScene, Math.max(scenes.length - 1, 0));
  }
  elements.connectionState.hidden = true;
  renderScene();

  if (goalEvents.length) {
    window.setTimeout(() => triggerGoalAlert(goalEvents[0]), SCENE_EXIT_DURATION + 180);
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
  if (scenes.length < 2) return;
  activeScene = (activeScene + 1) % scenes.length;
  renderScene();
}

startRealtime();
if (elements.soundUnlock) {
  elements.soundUnlock.hidden = !shouldShowSoundUnlock();
  elements.soundUnlock.addEventListener("click", unlockSound);
}
setInterval(rotateScene, ROTATION_INTERVAL);

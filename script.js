import { initializeApp } from "https://www.gstatic.com/firebasejs/12.15.0/firebase-app.js";
import { getDatabase, onValue, ref } from "https://www.gstatic.com/firebasejs/12.15.0/firebase-database.js";
import { firebaseConfig, firebaseConfigured } from "./firebase-config.js";
import { calculateStandings } from "./standings-engine.js";

const ROTATION_INTERVAL = 10_000;
const JSON_REFRESH_INTERVAL = 30_000;

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
  connectionState: document.getElementById("connectionState")
};

let scenes = [];
let activeScene = 0;
let jsonFallbackTimer;

const value = (input, fallback = "") =>
  input === undefined || input === null ? fallback : String(input);

function flagUrl(code) {
  const normalized = value(code).trim().toLowerCase();
  return normalized ? `https://flagcdn.com/${normalized}.svg` : "";
}

function isFinished(match) {
  const values = ["FT", "FIN", "TERMINÉ", "TERMINE"];
  return values.includes(value(match.minute).trim().toUpperCase())
    || values.includes(value(match.status).trim().toUpperCase());
}

function renderPagination() {
  elements.pagination.innerHTML = scenes
    .map((_, index) => `<span class="${index === activeScene ? "active" : ""}"></span>`)
    .join("");
}

function animate() {
  elements.scoreboard.classList.remove("is-changing");
  void elements.scoreboard.offsetWidth;
  elements.scoreboard.classList.add("is-changing");
}

function renderMatch(match) {
  elements.scoreboard.classList.remove("show-standings");
  const finished = isFinished(match);
  elements.competition.textContent = value(match.competition, "COUPE DU MONDE 2026");
  elements.status.textContent = finished ? "TERMINÉ" : value(match.status, "EN DIRECT");
  elements.homeFlag.src = flagUrl(match.home_code);
  elements.homeName.textContent = value(match.home, "Équipe 1");
  elements.homeScore.textContent = value(match.home_score, "0");
  elements.awayScore.textContent = value(match.away_score, "0");
  elements.awayFlag.src = flagUrl(match.away_code);
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
          <img src="${flagUrl(team.code)}" alt="">
          <strong>${value(team.name, "Équipe")}</strong>
        </span>
        <span>${Number(team.played || 0)}</span>
        <span>${Number(team.wins || 0)}</span>
        <span>${Number(team.draws || 0)}</span>
        <span>${Number(team.losses || 0)}</span>
        <span>${diffLabel}</span>
        <span class="standing-points">${Number(team.points || 0)}</span>
      </div>
    `;
  }).join("");
}

function renderScene() {
  if (!scenes.length) {
    elements.scoreboard.classList.remove("show-standings");
    elements.matchInfo.textContent = "Aucun contenu publié";
    return;
  }
  const scene = scenes[activeScene];
  scene.type === "group" ? renderGroup(scene.data) : renderMatch(scene.data);
  renderPagination();
  animate();
}

function applyData(data) {
  const allMatches = Array.isArray(data?.matches) ? data.matches : [];
  const allGroups = Array.isArray(data?.groups) ? data.groups : [];
  const publishedMatches = allMatches.filter(match => match.published !== false);
  const publishedGroupsById = new Map(
    allGroups
      .filter(group => group.published !== false)
      .map(group => [group.id, group])
  );
  const displayedGroupIds = new Set();

  scenes = [];
  publishedMatches.forEach(match => {
    scenes.push({ type: "match", data: match });

    if (match.phase !== "group" || !match.group_id) return;
    if (displayedGroupIds.has(match.group_id)) return;

    const group = publishedGroupsById.get(match.group_id);
    if (!group) return;

    scenes.push({
      type: "group",
      data: {
        ...group,
        // Les matchs dépubliés restent pris en compte dans l'historique
        // du classement, mais seuls les groupes liés à un match publié
        // apparaissent dans le live.
        teams: calculateStandings(group, allMatches, group.rules_profile)
      }
    });
    displayedGroupIds.add(match.group_id);
  });

  const requestedScene = new URLSearchParams(window.location.search).get("scene");
  if (requestedScene === "group") {
    activeScene = scenes.findIndex(scene => scene.type === "group");
    if (activeScene < 0) activeScene = 0;
  } else {
    activeScene = Math.min(activeScene, Math.max(scenes.length - 1, 0));
  }
  elements.connectionState.hidden = true;
  renderScene();
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
  if (new URLSearchParams(window.location.search).get("source") === "json") {
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
setInterval(rotateScene, ROTATION_INTERVAL);

const REFRESH_INTERVAL = 30_000;
const ROTATION_INTERVAL = 10_000;

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
  connectionState: document.getElementById("connectionState")
};

let matches = [];
let activeMatch = 0;

function escapeText(value, fallback = "") {
  return value === undefined || value === null ? fallback : String(value);
}

function isFinished(match) {
  const finishedValues = ["FT", "FIN", "TERMINÉ", "TERMINE"];
  return finishedValues.includes(escapeText(match.minute).trim().toUpperCase())
    || finishedValues.includes(escapeText(match.status).trim().toUpperCase());
}

function flagUrl(match, side) {
  const directUrl = escapeText(match[`${side}_flag_url`]).trim();
  if (directUrl) return directUrl;

  const code = escapeText(match[`${side}_code`]).trim().toLowerCase();
  return code ? `https://flagcdn.com/${code}.svg` : "";
}

function createMatchInfo(match) {
  if (match.info) return escapeText(match.info);
  if (match.scorers) return escapeText(match.scorers);

  const venue = escapeText(match.venue);
  const updated = escapeText(match.updated_at);
  if (venue && updated) return `${venue} • Mis à jour ${updated}`;
  if (venue) return venue;
  return "Scores mis à jour automatiquement";
}

function renderPagination() {
  elements.pagination.innerHTML = matches
    .map((_, index) => `<span class="${index === activeMatch ? "active" : ""}"></span>`)
    .join("");
}

function renderMatch() {
  if (!matches.length) {
    elements.matchInfo.textContent = "Aucun match disponible";
    return;
  }

  const match = matches[activeMatch];
  const finished = isFinished(match);

  elements.competition.textContent = escapeText(
    match.competition,
    "COUPE DU MONDE 2026"
  );
  elements.status.textContent = finished ? "TERMINÉ" : escapeText(match.status, "EN DIRECT");
  elements.homeFlag.src = flagUrl(match, "home");
  elements.homeFlag.alt = `Drapeau ${escapeText(match.home, "équipe 1")}`;
  elements.homeName.textContent = escapeText(match.home, "Équipe 1");
  elements.homeScore.textContent = escapeText(match.home_score, "0");
  elements.awayScore.textContent = escapeText(match.away_score, "0");
  elements.awayFlag.src = flagUrl(match, "away");
  elements.awayFlag.alt = `Drapeau ${escapeText(match.away, "équipe 2")}`;
  elements.awayName.textContent = escapeText(match.away, "Équipe 2");
  elements.minute.textContent = finished
    ? "TERMINÉ"
    : escapeText(match.minute, "EN DIRECT");
  elements.minute.classList.toggle("is-finished", finished);
  elements.matchInfo.textContent = createMatchInfo(match);

  renderPagination();
  elements.scoreboard.classList.remove("is-changing");
  void elements.scoreboard.offsetWidth;
  elements.scoreboard.classList.add("is-changing");
}

async function loadScores() {
  try {
    const response = await fetch(`scores.json?t=${Date.now()}`, {
      cache: "no-store"
    });

    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const data = await response.json();
    matches = Array.isArray(data.matches)
      ? data.matches.map(match => ({ ...match, updated_at: data.updated_at }))
      : [];
    activeMatch = Math.min(activeMatch, Math.max(matches.length - 1, 0));
    elements.connectionState.hidden = true;
    renderMatch();
  } catch (error) {
    console.error("Impossible de charger scores.json :", error);
    elements.connectionState.hidden = false;
  }
}

function rotateMatch() {
  if (matches.length < 2) return;
  activeMatch = (activeMatch + 1) % matches.length;
  renderMatch();
}

loadScores();
setInterval(loadScores, REFRESH_INTERVAL);
setInterval(rotateMatch, ROTATION_INTERVAL);

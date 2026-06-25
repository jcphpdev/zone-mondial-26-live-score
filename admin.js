import { initializeApp } from "https://www.gstatic.com/firebasejs/12.15.0/firebase-app.js";
import {
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut
} from "https://www.gstatic.com/firebasejs/12.15.0/firebase-auth.js";
import { get, getDatabase, ref, set } from "https://www.gstatic.com/firebasejs/12.15.0/firebase-database.js";
import { firebaseConfig, firebaseConfigured } from "./firebase-config.js";
import { calculateStandings } from "./standings-engine.js";

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

let draftTimer;
let autoPublishTimer;
let currentUser = null;
let rendering = false;
let firebaseAuth;
let firebaseDatabase;

if (firebaseConfigured) {
  const app = initializeApp(firebaseConfig);
  firebaseAuth = getAuth(app);
  firebaseDatabase = getDatabase(app);
}

const text = (value, fallback = "") =>
  value === undefined || value === null ? fallback : String(value);

function number(value) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
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
    matches,
    groups: groups.map(group => ({
      ...group,
      standings: calculateStandings(group, matches, group.rules_profile)
    }))
  };
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

function fillMatch(card, match, index) {
  card.dataset.matchId = match.id || crypto.randomUUID();
  card.dataset.desiredGroupId = match.group_id || "";
  card.querySelector(".match-number").textContent = `Match ${index + 1}`;
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
    card.querySelector(`[data-preview="${side}"]`).src = code ? `https://flagcdn.com/${code}.svg` : "";
  });
  updateMatchAppearance(card);
  updatePhaseFields(card);
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
}

function updatePhaseFields(card) {
  const isGroup = card.querySelector('[data-field="phase"]').value === "group";
  card.querySelector(".group-reference-field").hidden = !isGroup;
}

function bindMatch(card) {
  card.addEventListener("input", event => {
    for (const side of ["home", "away"]) {
      if (event.target.matches(`[data-field="${side}_code"]`)) {
        const code = event.target.value.trim().toLowerCase();
        card.querySelector(`[data-preview="${side}"]`).src = code ? `https://flagcdn.com/${code}.svg` : "";
      }
    }
    scheduleSave();
  });
  card.addEventListener("change", event => {
    if (event.target.matches('[data-field="published"]')) updateMatchAppearance(card);
    if (event.target.matches('[data-field="phase"]')) updatePhaseFields(card);
    scheduleSave();
  });
  card.querySelectorAll("[data-score-action]").forEach(button => {
    button.addEventListener("click", () => {
      const [side, delta] = button.dataset.scoreAction.split(":");
      const input = card.querySelector(`[data-field="${side}_score"]`);
      input.value = Math.max(0, number(input.value) + Number(delta));
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
    scheduleSave();
  });
}

function addMatch(match = emptyMatch(), afterCard = null) {
  const fragment = matchTemplate.content.cloneNode(true);
  const card = fragment.querySelector(".match-editor");
  fillMatch(card, match, editor.children.length);
  bindMatch(card);
  afterCard ? afterCard.insertAdjacentElement("afterend", card) : editor.appendChild(card);
  refreshNumbers();
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
    scheduleSave();
  });
  groupCard.querySelector(".group-teams").appendChild(row);
}

function updateGroupAppearance(card) {
  const published = card.querySelector('[data-group-field="published"]').checked;
  card.classList.toggle("is-unpublished", !published);
  card.querySelector(".publish-switch span").textContent = published ? "Publié" : "Dépublié";
}

function fillGroup(card, group, index) {
  card.dataset.groupId = group.id || crypto.randomUUID();
  card.querySelector(".group-number").textContent = `Classement ${index + 1}`;
  card.querySelector('[data-group-field="published"]').checked = group.published !== false;
  card.querySelector('[data-group-field="name"]').value = text(group.name, `Groupe ${String.fromCharCode(65 + index)}`);
  card.querySelector('[data-group-field="subtitle"]').value = text(group.subtitle, "Coupe du Monde 2026");
  card.querySelector('[data-group-field="rules_profile"]').value = text(group.rules_profile, "fifa-world-cup-2026");
  (Array.isArray(group.teams) ? group.teams : []).forEach(team => addTeam(card, team));
  updateGroupAppearance(card);
}

function bindGroup(card) {
  card.addEventListener("input", event => {
    if (event.target.matches('[data-group-field="name"]')) updateAllGroupSelects();
    scheduleSave();
  });
  card.addEventListener("change", event => {
    if (event.target.matches('[data-group-field="published"]')) updateGroupAppearance(card);
    scheduleSave();
  });
  card.querySelector(".add-team").addEventListener("click", () => {
    addTeam(card);
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
    scheduleSave();
  });
}

function addGroup(group = emptyGroup(), afterCard = null) {
  const fragment = groupTemplate.content.cloneNode(true);
  const card = fragment.querySelector(".group-editor");
  bindGroup(card);
  fillGroup(card, group, groupsEditor.children.length);
  afterCard ? afterCard.insertAdjacentElement("afterend", card) : groupsEditor.appendChild(card);
  refreshNumbers();
  updateAllGroupSelects();
  scheduleSave();
  return card;
}

function refreshNumbers() {
  [...editor.children].forEach((card, index) => {
    card.querySelector(".match-number").textContent = `Match ${index + 1}`;
  });
  [...groupsEditor.children].forEach((card, index) => {
    card.querySelector(".group-number").textContent = `Classement ${index + 1}`;
  });
  matchCount.textContent = editor.children.length;
  groupCount.textContent = groupsEditor.children.length;
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
  const sourceMatches = Array.isArray(data.matches) && data.matches.length ? data.matches : [emptyMatch()];
  sourceMatches.forEach(match => addMatch(match));
  (Array.isArray(data.groups) ? data.groups : []).forEach(group => addGroup(group));
  refreshNumbers();
  updateAllGroupSelects();
  refreshCalculatedStandings();
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
    await set(ref(firebaseDatabase, "liveScores"), buildData());
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
    if (firebaseConfigured) {
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

document.getElementById("addMatchButton").addEventListener("click", () => addMatch().scrollIntoView({ behavior: "smooth" }));
document.getElementById("addGroupButton").addEventListener("click", () => addGroup().scrollIntoView({ behavior: "smooth" }));
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

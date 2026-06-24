import { initializeApp } from "https://www.gstatic.com/firebasejs/12.15.0/firebase-app.js";
import {
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut
} from "https://www.gstatic.com/firebasejs/12.15.0/firebase-auth.js";
import {
  get,
  getDatabase,
  ref,
  set
} from "https://www.gstatic.com/firebasejs/12.15.0/firebase-database.js";
import {
  firebaseConfig,
  firebaseConfigured
} from "./firebase-config.js";

const DRAFT_KEY = "zone-mondial-26-scores-draft";
const AUTO_PUBLISH_DELAY = 650;

const editor = document.getElementById("matchesEditor");
const template = document.getElementById("matchTemplate");
const updatedAtInput = document.getElementById("updatedAt");
const notice = document.getElementById("notice");
const matchCount = document.getElementById("matchCount");
const firebaseEmailInput = document.getElementById("firebaseEmail");
const firebasePasswordInput = document.getElementById("firebasePassword");
const firebaseState = document.getElementById("firebaseState");
const autoPublishToggle = document.getElementById("autoPublishToggle");
const publishButton = document.getElementById("publishButton");

let matches = [];
let draftTimer;
let autoPublishTimer;
let firebaseAuth;
let firebaseDatabase;
let currentUser = null;

if (firebaseConfigured) {
  const app = initializeApp(firebaseConfig);
  firebaseAuth = getAuth(app);
  firebaseDatabase = getDatabase(app);
}

function text(value, fallback = "") {
  return value === undefined || value === null ? fallback : String(value);
}

function number(value) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

function flagUrl(code) {
  const normalized = text(code).trim().toLowerCase();
  return normalized ? `https://flagcdn.com/${normalized}.svg` : "";
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
  window.clearTimeout(showNotice.timeout);
  showNotice.timeout = window.setTimeout(() => {
    notice.hidden = true;
  }, 4500);
}

function setFirebaseState(connected, label = "") {
  firebaseState.classList.toggle("online", connected);
  firebaseState.classList.toggle("offline", !connected);
  firebaseState.textContent = label || (connected ? "Connecté" : "Non connecté");
}

function emptyMatch() {
  return {
    competition: "Coupe du Monde 2026",
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

function readCard(card) {
  const match = {};
  card.querySelectorAll("[data-field]").forEach(input => {
    const key = input.dataset.field;
    match[key] = key.endsWith("_score") ? number(input.value) : input.value.trim();
  });
  return match;
}

function syncStateFromEditor() {
  matches = [...editor.querySelectorAll(".match-editor")].map(readCard);
  matchCount.textContent = matches.length;
}

function saveDraft() {
  syncStateFromEditor();
  localStorage.setItem(DRAFT_KEY, JSON.stringify({
    updated_at: updatedAtInput.value.trim(),
    matches
  }));
}

function scheduleAutoPublish() {
  if (!autoPublishToggle.checked || !currentUser) return;
  window.clearTimeout(autoPublishTimer);
  autoPublishTimer = window.setTimeout(() => publishToFirebase(true), AUTO_PUBLISH_DELAY);
}

function scheduleDraftSave() {
  window.clearTimeout(draftTimer);
  draftTimer = window.setTimeout(saveDraft, 250);
  scheduleAutoPublish();
}

function updateFlagPreview(card, side) {
  const code = card.querySelector(`[data-field="${side}_code"]`).value;
  card.querySelector(`[data-preview="${side}"]`).src = flagUrl(code);
}

function fillCard(card, match, index) {
  card.querySelector(".match-number").textContent = `Match ${index + 1}`;

  card.querySelectorAll("[data-field]").forEach(input => {
    const key = input.dataset.field;
    let fallback = key.endsWith("_score") ? 0 : "";
    if (key === "status") {
      fallback = ["FT", "FIN"].includes(text(match.minute).trim().toUpperCase())
        ? "Terminé"
        : "À venir";
    }
    input.value = text(match[key], fallback);
  });

  updateFlagPreview(card, "home");
  updateFlagPreview(card, "away");
}

function bindCard(card) {
  card.addEventListener("input", event => {
    if (event.target.matches('[data-field="home_code"]')) updateFlagPreview(card, "home");
    if (event.target.matches('[data-field="away_code"]')) updateFlagPreview(card, "away");
    scheduleDraftSave();
  });

  card.addEventListener("change", scheduleDraftSave);

  card.querySelectorAll("[data-score-action]").forEach(button => {
    button.addEventListener("click", () => {
      const [side, delta] = button.dataset.scoreAction.split(":");
      const input = card.querySelector(`[data-field="${side}_score"]`);
      input.value = Math.max(0, number(input.value) + Number(delta));
      scheduleDraftSave();
    });
  });

  card.querySelector(".remove-match").addEventListener("click", () => {
    if (editor.children.length === 1) {
      showNotice("Il faut conserver au moins un match.", true);
      return;
    }
    card.remove();
    refreshCardNumbers();
    saveDraft();
    scheduleAutoPublish();
  });

  card.querySelector(".duplicate-match").addEventListener("click", () => {
    addMatch(readCard(card), card);
    showNotice("Le match a été dupliqué.");
  });
}

function addMatch(match = emptyMatch(), afterCard = null) {
  const fragment = template.content.cloneNode(true);
  const card = fragment.querySelector(".match-editor");
  fillCard(card, match, editor.children.length);
  bindCard(card);

  if (afterCard) {
    afterCard.insertAdjacentElement("afterend", card);
  } else {
    editor.appendChild(card);
  }

  refreshCardNumbers();
  scheduleDraftSave();
  return card;
}

function refreshCardNumbers() {
  [...editor.children].forEach((card, index) => {
    card.querySelector(".match-number").textContent = `Match ${index + 1}`;
  });
  matchCount.textContent = editor.children.length;
}

function render(data) {
  editor.innerHTML = "";
  updatedAtInput.value = text(data.updated_at, formatCasablancaDate());
  const sourceMatches = Array.isArray(data.matches) && data.matches.length
    ? data.matches
    : [emptyMatch()];

  sourceMatches.forEach(match => addMatch(match));
  saveDraft();
}

function buildData() {
  syncStateFromEditor();
  return {
    updated_at: updatedAtInput.value.trim() || formatCasablancaDate(),
    matches
  };
}

function buildJson() {
  return `${JSON.stringify(buildData(), null, 2)}\n`;
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
  if (!firebaseConfigured) {
    showNotice("Firebase n’est pas encore configuré dans firebase-config.js.", true);
    return;
  }

  const email = firebaseEmailInput.value.trim();
  const password = firebasePasswordInput.value;
  if (!email || !password) {
    showNotice("Saisissez l’e-mail et le mot de passe administrateur.", true);
    return;
  }

  const button = document.getElementById("firebaseLoginButton");
  button.disabled = true;
  button.textContent = "Connexion…";
  try {
    await signInWithEmailAndPassword(firebaseAuth, email, password);
    firebasePasswordInput.value = "";
    showNotice("Connexion Firebase réussie.");
  } catch (error) {
    console.error(error);
    showNotice(firebaseErrorMessage(error), true);
  } finally {
    button.disabled = false;
    button.textContent = "Se connecter";
  }
}

async function logoutFromFirebase() {
  if (!firebaseAuth) return;
  await signOut(firebaseAuth);
  autoPublishToggle.checked = false;
  showNotice("Vous êtes déconnecté de Firebase.");
}

async function publishToFirebase(silent = false) {
  if (!firebaseConfigured) {
    showNotice("Configurez d’abord firebase-config.js.", true);
    return;
  }
  if (!currentUser) {
    showNotice("Connectez-vous à Firebase avant de publier.", true);
    return;
  }

  const originalLabel = publishButton.textContent;
  if (!silent) {
    publishButton.disabled = true;
    publishButton.textContent = "Publication…";
  }

  try {
    updatedAtInput.value = formatCasablancaDate();
    const data = buildData();
    await set(ref(firebaseDatabase, "liveScores"), data);
    localStorage.removeItem(DRAFT_KEY);
    if (!silent) showNotice("Scores publiés instantanément dans Firebase.");
  } catch (error) {
    console.error(error);
    showNotice(firebaseErrorMessage(error), true);
  } finally {
    if (!silent) {
      publishButton.disabled = false;
      publishButton.textContent = originalLabel;
    }
  }
}

function downloadJson() {
  updatedAtInput.value = formatCasablancaDate();
  saveDraft();
  const blob = new Blob([buildJson()], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "scores.json";
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  showNotice("Le fichier scores.json de secours a été téléchargé.");
}

async function copyJson() {
  try {
    updatedAtInput.value = formatCasablancaDate();
    await navigator.clipboard.writeText(buildJson());
    saveDraft();
    showNotice("Le contenu JSON a été copié.");
  } catch (error) {
    console.error(error);
    showNotice("Impossible de copier automatiquement le JSON.", true);
  }
}

async function loadScores(ignoreDraft = false) {
  try {
    if (!ignoreDraft) {
      const draft = localStorage.getItem(DRAFT_KEY);
      if (draft) {
        render(JSON.parse(draft));
        showNotice("Brouillon local restauré.");
        return;
      }
    }

    if (firebaseConfigured) {
      const snapshot = await get(ref(firebaseDatabase, "liveScores"));
      if (snapshot.exists()) {
        render(snapshot.val());
        showNotice("Les scores Firebase ont été chargés.");
        return;
      }
    }

    const response = await fetch(`scores.json?t=${Date.now()}`, { cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    render(await response.json());
    showNotice("Le fichier scores.json de secours a été chargé.");
  } catch (error) {
    console.error(error);
    render({ updated_at: formatCasablancaDate(), matches: [emptyMatch()] });
    showNotice("Les données n’ont pas pu être chargées.", true);
  }
}

document.getElementById("addMatchButton").addEventListener("click", () => {
  const card = addMatch();
  card.scrollIntoView({ behavior: "smooth", block: "center" });
});

document.getElementById("setNowButton").addEventListener("click", () => {
  updatedAtInput.value = formatCasablancaDate();
  scheduleDraftSave();
});

document.getElementById("reloadButton").addEventListener("click", () => {
  if (!window.confirm("Recharger les données distantes et remplacer le brouillon ?")) return;
  localStorage.removeItem(DRAFT_KEY);
  loadScores(true);
});

document.getElementById("downloadButton").addEventListener("click", downloadJson);
document.getElementById("copyButton").addEventListener("click", copyJson);
document.getElementById("firebaseLoginButton").addEventListener("click", loginToFirebase);
document.getElementById("firebaseLogoutButton").addEventListener("click", logoutFromFirebase);
publishButton.addEventListener("click", () => publishToFirebase(false));
updatedAtInput.addEventListener("input", scheduleDraftSave);
autoPublishToggle.addEventListener("change", () => {
  if (autoPublishToggle.checked && !currentUser) {
    autoPublishToggle.checked = false;
    showNotice("Connectez-vous avant d’activer la publication automatique.", true);
    return;
  }
  if (autoPublishToggle.checked) publishToFirebase(true);
});

firebasePasswordInput.addEventListener("keydown", event => {
  if (event.key === "Enter") loginToFirebase();
});

if (firebaseConfigured) {
  onAuthStateChanged(firebaseAuth, user => {
    currentUser = user;
    if (user) {
      firebaseEmailInput.value = user.email || "";
      setFirebaseState(true, `Connecté : ${user.email}`);
    } else {
      setFirebaseState(false);
    }
  });
} else {
  setFirebaseState(false, "Configuration requise");
}

loadScores();

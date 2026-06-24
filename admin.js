const DRAFT_KEY = "zone-mondial-26-scores-draft";
const TOKEN_KEY = "zone-mondial-26-github-token";
const GITHUB_OWNER = "jcphpdev";
const GITHUB_REPO = "zone-mondial-26-live-score";
const GITHUB_FILE = "scores.json";
const GITHUB_API = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}`;

const editor = document.getElementById("matchesEditor");
const template = document.getElementById("matchTemplate");
const updatedAtInput = document.getElementById("updatedAt");
const notice = document.getElementById("notice");
const matchCount = document.getElementById("matchCount");
const githubTokenInput = document.getElementById("githubToken");
const githubState = document.getElementById("githubState");
const publishButton = document.getElementById("publishButton");

let matches = [];
let draftTimer;

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

function scheduleDraftSave() {
  window.clearTimeout(draftTimer);
  draftTimer = window.setTimeout(saveDraft, 250);
}

function updateFlagPreview(card, side) {
  const code = card.querySelector(`[data-field="${side}_code"]`).value;
  const preview = card.querySelector(`[data-preview="${side}"]`);
  preview.src = flagUrl(code);
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
    if (event.target.matches('[data-field="home_code"]')) {
      updateFlagPreview(card, "home");
    }
    if (event.target.matches('[data-field="away_code"]')) {
      updateFlagPreview(card, "away");
    }
    scheduleDraftSave();
  });

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

function encodeBase64Utf8(value) {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  bytes.forEach(byte => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary);
}

function getToken() {
  return githubTokenInput.value.trim();
}

function setGithubState(connected, label = "") {
  githubState.classList.toggle("online", connected);
  githubState.classList.toggle("offline", !connected);
  githubState.textContent = label || (connected ? "Connecté" : "Non connecté");
}

function githubHeaders(token) {
  return {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${token}`,
    "X-GitHub-Api-Version": "2022-11-28"
  };
}

async function githubRequest(path, options = {}) {
  const token = getToken();
  if (!token) {
    throw new Error("Saisissez d’abord votre token GitHub.");
  }

  const response = await fetch(`${GITHUB_API}${path}`, {
    ...options,
    headers: {
      ...githubHeaders(token),
      ...(options.headers || {})
    }
  });

  let data = {};
  try {
    data = await response.json();
  } catch {
    // Certaines réponses GitHub peuvent ne pas contenir de JSON.
  }

  if (!response.ok) {
    const message = data.message || `Erreur GitHub ${response.status}`;
    if (response.status === 401) {
      throw new Error("Token invalide ou expiré.");
    }
    if (response.status === 403) {
      throw new Error(
        "Accès refusé. Vérifiez la permission « Contents: Read and write » du token."
      );
    }
    if (response.status === 409) {
      throw new Error(
        "Le fichier a changé sur GitHub. Rechargez les données puis réessayez."
      );
    }
    throw new Error(message);
  }

  return data;
}

async function verifyGithubToken() {
  const button = document.getElementById("verifyTokenButton");
  const originalLabel = button.textContent;
  button.disabled = true;
  button.textContent = "Vérification…";

  try {
    const repository = await githubRequest("");
    sessionStorage.setItem(TOKEN_KEY, getToken());
    setGithubState(true, `Connecté : ${repository.full_name}`);
    showNotice("Connexion GitHub vérifiée. Vous pouvez publier les scores.");
    return true;
  } catch (error) {
    console.error(error);
    sessionStorage.removeItem(TOKEN_KEY);
    setGithubState(false);
    showNotice(error.message, true);
    return false;
  } finally {
    button.disabled = false;
    button.textContent = originalLabel;
  }
}

async function publishToGithub() {
  if (!getToken()) {
    showNotice("Saisissez et vérifiez d’abord votre token GitHub.", true);
    githubTokenInput.focus();
    return;
  }

  const originalLabel = publishButton.textContent;
  publishButton.disabled = true;
  publishButton.textContent = "Publication…";

  try {
    updatedAtInput.value = formatCasablancaDate();
    saveDraft();

    const currentFile = await githubRequest(
      `/contents/${encodeURIComponent(GITHUB_FILE)}?ref=main`
    );
    const result = await githubRequest(
      `/contents/${encodeURIComponent(GITHUB_FILE)}`,
      {
        method: "PUT",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          message: `Mise à jour des scores — ${updatedAtInput.value}`,
          content: encodeBase64Utf8(buildJson()),
          sha: currentFile.sha,
          branch: "main"
        })
      }
    );

    sessionStorage.setItem(TOKEN_KEY, getToken());
    localStorage.removeItem(DRAFT_KEY);
    setGithubState(true);

    const commitUrl = result.commit?.html_url;
    notice.innerHTML = commitUrl
      ? `Scores publiés avec succès. <a href="${commitUrl}" target="_blank" rel="noopener noreferrer">Voir le commit GitHub</a>.`
      : "Scores publiés avec succès sur GitHub.";
    notice.classList.remove("error");
    notice.hidden = false;
  } catch (error) {
    console.error(error);
    showNotice(error.message, true);
  } finally {
    publishButton.disabled = false;
    publishButton.textContent = originalLabel;
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
  showNotice("Le nouveau fichier scores.json a été téléchargé.");
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

    const response = await fetch(`scores.json?t=${Date.now()}`, {
      cache: "no-store"
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    render(await response.json());
    showNotice("Le fichier scores.json a été chargé.");
  } catch (error) {
    console.error(error);
    render({ updated_at: formatCasablancaDate(), matches: [emptyMatch()] });
    showNotice("Le fichier n’a pas pu être chargé. Un formulaire vide a été créé.", true);
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
  const confirmed = window.confirm(
    "Recharger scores.json et remplacer le brouillon actuellement affiché ?"
  );
  if (!confirmed) return;
  localStorage.removeItem(DRAFT_KEY);
  loadScores(true);
});

document.getElementById("downloadButton").addEventListener("click", downloadJson);
document.getElementById("copyButton").addEventListener("click", copyJson);
document.getElementById("verifyTokenButton").addEventListener("click", verifyGithubToken);
publishButton.addEventListener("click", publishToGithub);

document.getElementById("toggleTokenButton").addEventListener("click", event => {
  const visible = githubTokenInput.type === "text";
  githubTokenInput.type = visible ? "password" : "text";
  event.currentTarget.textContent = visible ? "Afficher" : "Masquer";
});

document.getElementById("forgetTokenButton").addEventListener("click", () => {
  sessionStorage.removeItem(TOKEN_KEY);
  githubTokenInput.value = "";
  githubTokenInput.type = "password";
  document.getElementById("toggleTokenButton").textContent = "Afficher";
  setGithubState(false);
  showNotice("Le token a été supprimé de cet onglet.");
});

githubTokenInput.addEventListener("input", () => {
  sessionStorage.setItem(TOKEN_KEY, getToken());
  setGithubState(false, getToken() ? "À vérifier" : "Non connecté");
});

updatedAtInput.addEventListener("input", scheduleDraftSave);

githubTokenInput.value = sessionStorage.getItem(TOKEN_KEY) || "";
if (githubTokenInput.value) {
  setGithubState(false, "Token mémorisé dans cet onglet");
}

loadScores();

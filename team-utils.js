const FLAG_CODE_ALIASES = {
  eq: "ec",
  cu: "cw",
  uk: "gb"
};

const TEAM_NAME_FLAG_CODES = {
  "equateur": "ec",
  "ecuador": "ec",
  "curacao": "cw",
  "curaçao": "cw"
};

function normalizeName(value) {
  return String(value || "")
    .trim()
    .toLocaleLowerCase("fr")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");
}

export function normalizeTeamCode(value) {
  return String(value || "").trim().toLowerCase();
}

export function flagCode(code, name = "") {
  const normalizedCode = normalizeTeamCode(code);
  const normalizedName = normalizeName(name);
  return TEAM_NAME_FLAG_CODES[normalizedName]
    || FLAG_CODE_ALIASES[normalizedCode]
    || normalizedCode;
}

export function flagUrl(code, name = "") {
  const resolved = flagCode(code, name).replace(/[^a-z-]/g, "");
  return resolved ? `https://flagcdn.com/${resolved}.svg` : "";
}

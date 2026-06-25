export const COMPETITION_RULES = {
  "fifa-world-cup-2026": {
    label: "Coupe du Monde FIFA 2026",
    winPoints: 3,
    drawPoints: 1,
    lossPoints: 0,
    tieBreakers: ["headToHeadPoints", "headToHeadGoalDifference", "headToHeadGoalsFor", "goalDifference", "goalsFor", "fairPlay", "ranking"]
  },
  "standard": {
    label: "Règles standard",
    winPoints: 3,
    drawPoints: 1,
    lossPoints: 0,
    tieBreakers: ["goalDifference", "goalsFor", "headToHeadPoints", "fairPlay", "ranking"]
  }
};

const n = value => Number.isFinite(Number(value)) ? Number(value) : 0;
const countsInStandings = match => {
  const status = String(match.status || "").trim().toUpperCase();
  return Boolean(status) && !["À VENIR", "A VENIR"].includes(status);
};

function createStats(team) {
  return {
    code: team.code || "",
    name: team.name || "",
    played: 0,
    wins: 0,
    draws: 0,
    losses: 0,
    gf: 0,
    ga: 0,
    gd: 0,
    points: 0,
    fair_play: n(team.fair_play),
    ranking: n(team.ranking) || 9999
  };
}

function applyMatch(stats, match, rules) {
  const home = stats.get(match.home_code);
  const away = stats.get(match.away_code);
  if (!home || !away || !countsInStandings(match)) return;
  const hs = n(match.home_score);
  const as = n(match.away_score);
  home.played++; away.played++;
  home.gf += hs; home.ga += as;
  away.gf += as; away.ga += hs;
  if (hs > as) {
    home.wins++; away.losses++;
    home.points += rules.winPoints; away.points += rules.lossPoints;
  } else if (hs < as) {
    away.wins++; home.losses++;
    away.points += rules.winPoints; home.points += rules.lossPoints;
  } else {
    home.draws++; away.draws++;
    home.points += rules.drawPoints; away.points += rules.drawPoints;
  }
  home.gd = home.gf - home.ga;
  away.gd = away.gf - away.ga;
}

function miniTable(codes, matches, rules) {
  const map = new Map(codes.map(code => [code, createStats({ code })]));
  matches.filter(match => codes.includes(match.home_code) && codes.includes(match.away_code))
    .forEach(match => applyMatch(map, match, rules));
  return map;
}

function globalCompare(a, b) {
  return (b.gd - a.gd)
    || (b.gf - a.gf)
    || (b.fair_play - a.fair_play)
    || (a.ranking - b.ranking)
    || a.name.localeCompare(b.name, "fr");
}

function rankFifaTie(teams, matches, rules) {
  if (teams.length < 2) return teams;
  const mini = miniTable(teams.map(team => team.code), matches, rules);
  const buckets = new Map();
  teams.forEach(team => {
    const row = mini.get(team.code);
    const key = `${row.points}|${row.gd}|${row.gf}`;
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(team);
  });

  if (buckets.size === 1) return [...teams].sort(globalCompare);

  return [...buckets.entries()]
    .sort(([keyA], [keyB]) => {
      const a = keyA.split("|").map(Number);
      const b = keyB.split("|").map(Number);
      return (b[0] - a[0]) || (b[1] - a[1]) || (b[2] - a[2]);
    })
    .flatMap(([, bucket]) => bucket.length > 1 ? rankFifaTie(bucket, matches, rules) : bucket);
}

export function calculateStandings(group, allMatches, profile = "fifa-world-cup-2026") {
  const rules = COMPETITION_RULES[profile] || COMPETITION_RULES.standard;
  const teams = Array.isArray(group.teams) ? group.teams : [];
  const stats = new Map(teams.map(team => [team.code, createStats(team)]));
  const matches = (Array.isArray(allMatches) ? allMatches : []).filter(match =>
    match.phase === "group"
    && match.group_id === group.id
    && match.cancelled !== true
  );
  matches.forEach(match => applyMatch(stats, match, rules));
  const rows = [...stats.values()];

  rows.sort((a, b) => b.points - a.points);
  let start = 0;
  while (start < rows.length) {
    let end = start + 1;
    while (end < rows.length && rows[end].points === rows[start].points) end++;
    if (end - start > 1) {
      const tied = profile === "fifa-world-cup-2026"
        ? rankFifaTie(rows.slice(start, end), matches, rules)
        : rows.slice(start, end).sort(globalCompare);
      rows.splice(start, tied.length, ...tied);
    }
    start = end;
  }
  return rows;
}

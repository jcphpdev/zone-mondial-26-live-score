async function loadScores() {
  const response = await fetch("scores.json?time=" + new Date().getTime());
  const data = await response.json();

  const matchesContainer = document.getElementById("matches");

  matchesContainer.innerHTML = "";

  data.matches.forEach(match => {
    matchesContainer.innerHTML += `
      <div class="match-card">
        <div class="team">${match.home}</div>

        <div class="score">
          ${match.home_score} - ${match.away_score}
        </div>

        <div class="team">${match.away}</div>

        <div class="minute">${match.minute}</div>
      </div>
    `;
  });
}

loadScores();

setInterval(loadScores, 30000);
# Prompt background v3 — Scène score match

Create a premium 16:9 football live scoreboard background for a YouTube sports broadcast, official visual identity of Zone Mondial 26.

Use case: stylized-concept.

Canvas/layout reference: 1920×1080.

Style:

- hybrid anime and postcard art;
- hand-drawn high-budget sports broadcast illustration;
- cinematic stadium atmosphere;
- World Cup 2026 inspired broadcast package;
- premium glassmorphism panels;
- dark navy blue stadium, subtle floodlights, field lines, crowd silhouettes, subtle particles;
- elegant red and green streaks, controlled energy, not noisy.

Colors:

- `#E61D25`
- `#3CAC3B`
- `#2A398D`
- `#FFFFFF`

Exact empty layout zones:

- Top title/status panel: x=513, y=118, w=895, h=100.
- Team 1 panel: x=107, y=272, w=526, h=382.
- Score panel: x=656, y=283, w=609, h=343.
- Team 2 panel: x=1293, y=272, w=526, h=382.
- Bottom match info panel: x=500, y=719, w=920, h=117.
- Bottom ticker safe area: x=48, y=1019, w=1560, h=52.
- Bottom-right logo circle: center x=1771, y=950, diameter 182.

Score panel requirements:

- create two separated dark empty score compartments inside the score panel;
- leave a clean central vertical separator area between the two score compartments;
- the central separator may contain two subtle small diamond/colon-like decorative marks only, but no readable numbers or text;
- ensure enough empty space for two very large white HTML score numbers;
- do not draw a dash/hyphen between the scores.

Panel style:

- subtle glassmorphism borders;
- dark transparent backgrounds;
- soft shadows;
- high contrast for white HTML text;
- panels must align visually with the exact zones above;
- do not place important decorative details behind the text areas.

Logo rule:

- do not generate the logo;
- do not create any alternative logo;
- keep a clean empty circular reserved area at the bottom right for the real HTML logo.

Negative prompt:

No readable text, no numbers, no flags, no team names, no player faces, no alternative logo, no ZM26 logo, no watermark, no fake UI labels.


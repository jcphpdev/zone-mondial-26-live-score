# Zone Mondial 26 — Layout background V2

Canvas: 1600 × 900, 16:9.

Design goal: flat professional sports broadcast package, rounded panels, thick white borders, dark navy surfaces, red/green/blue accents. All content is rendered by HTML. Backgrounds contain only empty panels and decoration.

Global rules:

- No readable text in the background.
- No numbers.
- No flags.
- No team names.
- No logos inside the background.
- Logo is rendered by HTML in the reserved circle.
- All main panels use a dark navy fill with white border around 8–12 px.
- Accent colors: red `#E61D25`, green `#3CAC3B`, blue `#2A398D`, cyan score/video cells `#22E3EA`, white `#FFFFFF`.
- Ticker zone is shared by all scenes: `x=118 y=820 w=1215 h=72`.
- Logo reserved circle: `x=1385 y=690 w=155 h=155`.

## Scene: score

Background file: `assets/bg-v2-score.png`

Reserved HTML zones:

- Header: `x=245 y=78 w=730 h=72`
- Main board: `x=70 y=185 w=1370 h=410`
- Home flag: `x=145 y=230 w=130 h=105`
- Home name: `x=305 y=230 w=565 h=105`
- Home score: `x=918 y=225 w=145 h=118`
- Home info/scorers: `x=1090 y=230 w=355 h=105`
- Away flag: `x=145 y=420 w=130 h=105`
- Away name: `x=305 y=420 w=565 h=105`
- Away score: `x=918 y=415 w=145 h=118`
- Away info/scorers: `x=1090 y=420 w=355 h=105`
- Match info footer: `x=430 y=620 w=670 h=78`
- Small status box: `x=1130 y=620 w=105 h=78`

## Scene: score + video

Background file: `assets/bg-v2-score-video.png`

Reserved HTML zones:

- Header: `x=175 y=112 w=640 h=68`
- Main score board: `x=65 y=205 w=1080 h=370`
- Video panel: `x=1190 y=115 w=350 h=585`
- Home flag: `x=110 y=250 w=110 h=92`
- Home name: `x=245 y=250 w=445 h=92`
- Home score: `x=730 y=245 w=112 h=102`
- Home info/scorers: `x=865 y=250 w=265 h=92`
- Away flag: `x=110 y=420 w=110 h=92`
- Away name: `x=245 y=420 w=445 h=92`
- Away score: `x=730 y=415 w=112 h=102`
- Away info/scorers: `x=865 y=420 w=265 h=92`
- Match info footer: `x=340 y=610 w=610 h=72`
- Small status box: `x=980 y=610 w=100 h=72`

## Scene: live updates

Background file: `assets/bg-v2-live-updates.png`

Reserved HTML zones:

- Header: `x=320 y=55 w=620 h=64`
- Main updates panel: `x=110 y=135 w=1380 h=540`
- 5 row zones:
  - Row 1: `x=165 y=175 w=1280 h=82`
  - Row 2: `x=165 y=270 w=1280 h=82`
  - Row 3: `x=165 y=365 w=1280 h=82`
  - Row 4: `x=165 y=460 w=1280 h=82`
  - Row 5: `x=165 y=555 w=1280 h=82`
- Row columns:
  - status: width 190
  - group/phase: width 215
  - teams/score area: width 650
  - qualified/minute: width 225

## Scene: standings

Background file: `assets/bg-v2-standings.png`

Reserved HTML zones:

- Header: `x=300 y=72 w=650 h=64`
- Main standings panel: `x=95 y=150 w=1410 h=535`
- Group title: `x=150 y=185 w=520 h=70`
- Table header: `x=150 y=275 w=1285 h=60`
- 4 team rows:
  - Row 1: `x=150 y=350 w=1285 h=70`
  - Row 2: `x=150 y=425 w=1285 h=70`
  - Row 3: `x=150 y=500 w=1285 h=70`
  - Row 4: `x=150 y=575 w=1285 h=70`
- Table columns:
  - rank: 70
  - team: 510
  - J/G/N/P/BP/BC/+/-: 90 each
  - Pts: 130


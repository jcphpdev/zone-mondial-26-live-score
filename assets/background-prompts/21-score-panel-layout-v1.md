# Prompt background — Scène score panel v1

Create a premium flat 16:9 football match score background inspired by a simple World Cup TV score panel, designed for HTML overlay.

Use case: stylized-concept.

Canvas: 1920x1080.

Style:

- flat sports broadcast scoreboard UI;
- clean modern 2D design;
- large rounded rectangle panel;
- thick bold borders around 10px to 20px;
- high contrast;
- no 3D;
- no glossy effects;
- no glassmorphism;
- no complex stadium illustration.

Color palette:

- black / very dark navy main panel;
- #E61D25 red accent;
- #3CAC3B green accent;
- #2A398D blue accent;
- #FFFFFF white;
- bright turquoise score boxes.

Background:

- blurred football pitch / broadcast camera atmosphere behind the score panel;
- soft and out of focus;
- no readable text;
- no clear player faces;
- central score panel must remain the visual priority.

Main layout:

One large rounded scoreboard panel centered horizontally, like a clean flat TV score card.

Exact empty layout zones:

- Top status pill: x=150, y=75, w=680, h=58, white rounded pill for match status.
- Main score panel: x=90, y=140, w=1320, h=310, dark rounded rectangle with thick colored border.
- Team 1 row: x=140, y=165, w=1220, h=120.
- Team 2 row: x=140, y=290, w=1220, h=120.
- Left flag slot team 1: x=155, y=190, w=82, h=58.
- Left flag slot team 2: x=155, y=315, w=82, h=58.
- Team name area 1: x=255, y=170, w=560, h=105.
- Team name area 2: x=255, y=295, w=560, h=105.
- Score box team 1: x=830, y=165, w=115, h=115.
- Score box team 2: x=830, y=290, w=115, h=115.
- Scorers/minute area team 1: x=980, y=185, w=330, h=70.
- Scorers/minute area team 2: x=980, y=310, w=330, h=70.
- Bottom competition pill: x=455, y=445, w=600, h=70.
- Small logo zone: x=1065, y=440, w=95, h=95.
- Bottom ticker safe zone: x=80, y=1000, w=1500, h=60.
- Bottom right reserved logo circle: center x=1780, y=880, diameter 170.

Panel design:

- main panel dark black/navy with slight transparency;
- thick rounded border using red, green, and blue segments;
- team rows separated by a thin light line;
- score boxes bright turquoise with rounded corners;
- top status pill white;
- bottom competition pill green/blue;
- all zones empty for HTML text and flags.

Important constraints:

- do not generate readable text;
- do not generate numbers;
- do not generate flags;
- do not generate team names;
- do not generate logos;
- do not generate trophy;
- do not generate player faces;
- do not generate FIFA text;
- do not generate Zone Mondial text;
- leave all information areas empty for HTML overlay.

Negative prompt:

Text, numbers, flags, logos, trophy, FIFA logo, player faces, team names, watermark, fake UI labels, 3D glossy effects, glass panels, crowded background, unreadable panels.

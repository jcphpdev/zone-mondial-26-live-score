# Prompt background — Scène live updates panel v1

Create a premium flat 16:9 football live updates background, matching the validated simple World Cup TV score panel style, designed for HTML overlay.

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
- bright turquoise score/status highlights.

Background:

- blurred football pitch / broadcast camera atmosphere behind the panel;
- soft and out of focus;
- no readable text;
- no clear player faces;
- central live updates panel must remain the visual priority.

Main layout:

One large rounded live updates panel centered horizontally, same design family as a flat TV score panel.

Exact empty layout zones:

- Top title/status pill: x=250, y=70, w=680, h=58, white rounded pill for live updates title/status.
- Main live updates panel: x=120, y=145, w=1320, h=620, dark rounded rectangle with thick colored border.
- Row 1: x=175, y=190, w=1210, h=82.
- Row 2: x=175, y=285, w=1210, h=82.
- Row 3: x=175, y=380, w=1210, h=82.
- Row 4: x=175, y=475, w=1210, h=82.
- Row 5: x=175, y=570, w=1210, h=82.
- Row 6: x=175, y=665, w=1210, h=62.
- Status badge slot in each row: x=195, w=150.
- Group/phase slot in each row: x=365, w=180.
- Teams slot in each row: x=565, w=520.
- Score/time slot in each row: x=1100, w=250, bright turquoise or white rounded capsule.
- Bottom competition pill: x=470, y=785, w=560, h=68.
- Small logo zone near competition pill: x=1050, y=777, w=90, h=90.
- Bottom ticker safe zone: x=80, y=1000, w=1500, h=60.
- Bottom right reserved logo circle: center x=1780, y=880, diameter 170.

Panel design:

- main panel dark black/navy with slight transparency;
- thick rounded border using red, green, and blue segments;
- row cards with thick white outlines;
- clean row separators;
- no pre-rendered text;
- no numbers;
- no flags;
- no team names;
- simple flat shapes only;
- score/time cells may be bright turquoise rounded rectangles, all empty.

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

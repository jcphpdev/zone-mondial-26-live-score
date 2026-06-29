# Zone Mondial 26 — Background layout system v3

Reference canvas: 16:9, designed for 1920×1080.

All generated backgrounds must match the same visual language:

- premium football broadcast package;
- hybrid anime and postcard art;
- hand-drawn high-budget sports illustration;
- dark navy stadium atmosphere;
- official Zone Mondial 26 colors: `#E61D25`, `#3CAC3B`, `#2A398D`, `#FFFFFF`;
- glassmorphism panels with dark transparent interiors;
- no readable text, no numbers, no flags, no team names, no faces, no watermark;
- no generated logo, no ZM26 mark, no badge pretending to be the logo;
- bottom-right logo area must stay empty because the real `logo.png` is overlaid by HTML.

Important:

The background must provide the graphic containers only. All variable information is rendered by HTML/CSS.

Use these recurring fixed zones:

- top title/status panel: x=513, y=118, w=895, h=100 for match scenes; x=513, y=68, w=895, h=89 for full-screen information scenes;
- ticker safe area: x=48, y=1019, w=1560, h=52;
- logo reserved circle: center x=1771, y=950, diameter about 182.


# Signature-derived brand

The supplied photo is a 1280 × 1093 RGB JPEG on white, not the transparent PNG
measured in the original prompt. Blue ink bounds are 242..1036 × 415..791; median
ink is **#265B9A**. This updates the reference seed only. Accessible accent colors
remain #2268BF / #5A9CED, with white filled labels on #2268BF / #236DC7.

Full source and cropped intermediate outlines live only in ignored `brand/source/`.
Public masters contain isolated opening/terminal strokes, never the whole signature.
`trace-brand.py` uses the verified MIT VisionCortex vtracer 0.6.15 tool for outlines,
Zhang–Suen skeletonization, ordered graph strokes and simplified quadratic curves.
Regular weight is 3/100, bold 6/100; round caps/joins. Each stroke is well below
150 nodes. Python tracing needs Pillow, numpy, scipy and vtracer; normal builds
regenerate all assets from the public SVGs and need no photo/Python installation.

![A, B, C directions](exports/monogram-directions.png)

A: opening K plus an isolated rising tail accent. B: opening K alone. C: terminal
loop plus tail. These directions were shown before replacing the temporary leaf.
**A is selected**, as required by the default: it retains the characteristic sweep
and remains identifiable at 32px. Scores below are visual judgments, 1–5, not a
claim of user testing or a logo-recognition experiment.

| Direction | 16px | 32px | Distinctness from Notes/Calendar/Notion | One color | Fidelity |
| --- | ---: | ---: | ---: | ---: | ---: |
| A | 3 | 5 | 5 | 5 | 5 |
| B | 4 | 5 | 5 | 5 | 5 |
| C | 4 | 4 | 4 | 5 | 5 |

At 16px the joint/sweep is less readable as a letter; use the bold favicon and
retain the handwritten character rather than substitute a font. See
[the full contact sheet](exports/monogram-review.png): each direction at 1024,
180, 64, 32 and 16px on light, dark and icon-gradient backgrounds.

`pnpm brand:build` generates mark/mark-bold/mark-mono/lockup/icon SVGs, currentColor
React BrandMark, adaptive SVG and 16/32/48 ICO favicons, 180px opaque full-bleed
Apple touch icon, 192/512 any and 512 maskable PWA icons, social images, Windows
16..512 PNGs and 16/24/32/48/64/128/256 ICO, and 150×57/164×314 NSIS BMP artwork.
The 1024px master has original smooth corners; iOS/maskable exports are opaque
squares with the mark in the central 80%. Tray assets are Phase 3. Optional iOS
startup images require a demonstrated device white flash. No delayed splash.

Minimum mark 16px, lockup 96px. Preserve clear space; keep normal surrounding
layout away from the stem, and use the documented icon safe area at small sizes.
Gradient #3C7BC8 → #1E4A85 gives white at least 4.32:1. Physical Windows display
scaling, pinned taskbar and iOS masking still need the device checklist.

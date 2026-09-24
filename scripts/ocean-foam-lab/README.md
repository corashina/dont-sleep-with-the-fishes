# Integrated ocean material

The full-water material is active in both High and Low quality.
It adds dark blue water, branching wave foam, and fine ripple normals.
Hull and edge foam are removed. Hull clipping and water contact remain active.
The shader has no hull foam mask, projected border, or separate hull foam blend.

## Run and compare

```powershell
node node_modules/vite/bin/vite.js --port 5188
```

Game: http://127.0.0.1:5188/dont-sleep-with-the-fishes/

Water: http://127.0.0.1:5188/dont-sleep-with-the-fishes/scripts/ocean-foam-lab/index.html?view=06-water-close

Hull edge without surface detail: http://127.0.0.1:5188/dont-sleep-with-the-fishes/scripts/ocean-foam-lab/index.html?view=03-no-edge

The lab uses the production shader. One lab-only switch enables A/B comparisons of surface detail.
Select a case and press Play to inspect motion.

## Verification

```powershell
node scripts/render-ocean-foam.mjs artifacts/ocean-foam/no-hull-foam
```

This saves 18 cases and three comparison or motion sheets.
Checks cover High and Low, night, blood, fog, pause, and production context recovery.
The baseline and hull-edge cases have no added foam when wave detail is disabled.
A 48-frame check covers twelve seconds of rough waves and checks that surface detail remains visible.
Importance: 95/100. GPU rendering detects shader errors that TypeScript cannot find.
An unavailable context restoration extension produces a labeled placeholder.

Full-game 60 FPS remains unverified.

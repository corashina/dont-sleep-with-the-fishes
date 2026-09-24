# Integrated ocean material and hull foam

The latest full-water material is active in the game, in both High and Low quality.
It adds dark blue water, branching surface streaks, and fine ripple normals.
The production formulas match the latest prototype. The old lab-only shader path is removed.

Hull foam is wider and denser. It follows the projected hull through wave motion.
Local water height no longer turns it off. It remains on the water when a hull rises above a trough.
This is a stylized surface footprint. Geometry can still hide foam behind the boat or a wave.
The inner mask stays open to avoid a gap between hull and foam.
No simulation targets, textures, or per-frame allocations are added.

## Run and compare

```powershell
node node_modules/vite/bin/vite.js --port 5188
```

Game: http://127.0.0.1:5188/dont-sleep-with-the-fishes/

Integrated water: http://127.0.0.1:5188/dont-sleep-with-the-fishes/scripts/ocean-foam-lab/index.html?view=06-water-close

Hull-only inspection: http://127.0.0.1:5188/dont-sleep-with-the-fishes/scripts/ocean-foam-lab/index.html?view=17-contact-close

The lab uses production shader code. Only A/B visibility switches are lab-specific.
Select a case and press Play to inspect motion.

## Verification

```powershell
node scripts/render-ocean-foam.mjs artifacts/ocean-foam/integrated-final
```

This saves 18 cases and three comparison or motion sheets.
Checks cover High and Low, night, blood, fog, pause, and production context recovery.
A 48-frame check covers twelve seconds of rough wave motion and requires visible hull foam in every sample.
A raised-hull check reproduced the missing foam before the fix and passes after it.
Importance: 95/100. Single still images miss height-dependent foam dropout.
An unavailable context restoration extension produces a labeled placeholder.

Lint, type checking, production build, and 15 ocean tests pass.
Full-game 60 FPS remains unverified. Previous foam simulation timings do not describe this shader.

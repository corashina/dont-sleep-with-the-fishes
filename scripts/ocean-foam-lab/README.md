# Ocean foam lab

This lab renders the production ocean shaders with the real lifeboat.
Only the foam switches are specific to this lab.

## Capture and verify

Run from this worktree:

```powershell
node scripts/render-ocean-foam.mjs
```

Output: `artifacts/ocean-foam/`.
The script captures twelve cases, a comparison sheet, and four motion frames.
It fails on shader errors, WebGL errors, missing foam, and foam below an airborne hull.
It compares each case with foam disabled at the same wave time and camera position.
Importance: 95/100. Shader compilation alone cannot detect missing or misplaced foam.

Set `CHROME_PATH` if Chrome or Edge is installed elsewhere.
Pass an output directory as the first argument to change the destination.

## Interactive inspection

```powershell
node node_modules/vite/bin/vite.js --port 5188
```

Open:
<http://127.0.0.1:5188/dont-sleep-with-the-fishes/scripts/ocean-foam-lab/index.html>

Select a case. Press Play to inspect motion.

## Cases

- Foam disabled, crest foam only, hull foam only, and both effects.
- Close view, calm sea, night, Low quality, blood ocean, and fog.
- Raised hull and a translated, rotated hull.
- Four close views at 0.6-second intervals.

The captures use production materials without game post-processing.
They verify rendering and contact behavior, not total game frame rate.

## Implementation

`src/ocean/oceanFoam.ts` contains the shared foam shading.
Crest foam uses existing wave compression and height.
Hull foam uses each existing exclusion profile and transform.
Fine pores and irregular patches drift across the water.
High quality adds cellular pores. Low quality uses fewer texture calculations.
Subpixel detail averages out. Clear and distant water skip detailed foam shading.
Foam receives light before the existing blood and fog effects.
There are no new particles, textures, render targets, or per-frame CPU allocations.

Foam is procedural surface shading. It is not a persistent fluid simulation.

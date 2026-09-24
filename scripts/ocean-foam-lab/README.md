# Ocean foam lab

The lab uses the production ocean renderer and the real lifeboat.
Only the visibility and deposition switches are specific to the lab.

## Capture and verify

Run from this worktree:

```powershell
node scripts/render-ocean-foam.mjs artifacts/ocean-foam/persistent-final
```

This captures 18 cases and five comparison or motion sheets.
Checks cover shader errors, coverage, aging, contact, pause, scrolling, and context recovery.
Both the isolated field and the complete production renderer lose and recover their WebGL context.
The restoration image shows the recovered production renderer.
An unavailable restoration extension produces a labeled placeholder.
Importance: 98/100 for GPU behavior; 95/100 for image coverage.

Set CHROME_PATH if Chrome or Edge is installed elsewhere.
Add --benchmark for four timing runs. Each has ten seconds warmup and thirty seconds sampling.
Nonblocking GPU queries measure simulation preparation, including frames without a simulation step.
They exclude foam shading in the final water pass. Unavailable results are null, never zero.

## Interactive inspection

```powershell
node node_modules/vite/bin/vite.js --port 5188
```

Open http://127.0.0.1:5188/dont-sleep-with-the-fishes/scripts/ocean-foam-lab/index.html.
Select a case. Press Play to inspect motion.
The normal game runs at http://127.0.0.1:5188/dont-sleep-with-the-fishes/.
The full-game timing page is scripts/ocean-foam-game-benchmark.html.
Start gameplay before measuring. Keep the tab visible during measurements.

## Implementation

OceanFoamSimulation owns two RGBA half-float targets over a 256-metre square.
High uses 1024 by 1024 texels: 16 MiB for both targets.
Low uses 512 by 512 texels: 4 MiB for both targets.
Crest coverage, crest freshness, hull coverage, and hull freshness occupy separate channels.
The field updates at 30 Hz. Rendering interpolates between the two fields with separate world origins.
Foam follows wave flow, spreads, and fades. Hull motion adds foam at water contact.
A generated 256 by 256 texture supplies porous coverage and relief.
Fresh foam is dense. Aging foam breaks into thin patches.
Lighting precedes the existing blood and fog effects.
Production update paths reuse their CPU storage.

## Evidence and limits

Latest screenshots: artifacts/ocean-foam/persistent-final.
Before screenshots: artifacts/ocean-foam/persistent-before.
Timing report: artifacts/ocean-foam/persistent-final/performance.json.

On the RTX 4070 Ti, the 1440 by 900 headless lab measured these simulation preparation costs:

| Quality | Calm GPU p95 | Rough GPU p95 |
| --- | --- | --- |
| High | 0.352 ms | 0.310 ms |
| Low | 0.137 ms | 0.165 ms |

These measurements are below the 1.5 ms simulation budget.
The lab frame p95 was 7.1 ms. This excludes full-game effects and cannot establish the game frame rate.
The in-app browser did not complete the full-game pointer lock request.
Baseline, changed, delta, and full-game target fields remain null. The 60 FPS target is unverified.
The saved baseline build is artifacts/ocean-foam/baseline-build.

Lint, type checking, production build, 31 ocean tests, and GPU checks pass.
The full suite has 1307 passes and one existing AnchorItem pose failure.
A dedicated interpolation regression at mix values 0, 0.5, and 1 remains deferred.
Current scrolling evidence checks field centroid displacement and rendered motion sheets.

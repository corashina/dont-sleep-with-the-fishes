# Cartoon hull foam and water prototype

The game now uses a narrow, broken cartoon foam edge around water contact.
Crest patches, persistent foam targets, and the porous foam texture were removed.
The hull edge uses the existing exclusion profile, with an offset for the outer timber.
It has a solid inner edge and small broken outer ribbons. Its visible width is about 10–25 cm.
Rough waves can lift sections of the hull clear of water. Those sections have no foam.
The same shader works in High and Low quality. No foam simulation or per-frame allocations remain.

## Lab

Run the worktree server:

```powershell
node node_modules/vite/bin/vite.js --port 5188
```

Game: http://127.0.0.1:5188/dont-sleep-with-the-fishes/

Cartoon contact: http://127.0.0.1:5188/dont-sleep-with-the-fishes/scripts/ocean-foam-lab/index.html?view=17-contact-close

Water prototype: http://127.0.0.1:5188/dont-sleep-with-the-fishes/scripts/ocean-foam-lab/index.html?view=06-prototype-close

Select a case and press Play to inspect motion. Both views use the real lifeboat and production ocean.
The whole-water prototype adds dark blue water and fine, branching surface streaks.
It uses warped cellular lines with thin, broken secondary fibers. The pattern follows displaced wave coordinates.
It is installed only in the lab. The game does not use this prototype.

## Capture and verify

```powershell
node scripts/render-ocean-foam.mjs artifacts/ocean-foam/cartoon-final
```

The script saves 17 cases and three comparison or motion sheets.
GPU checks compare each frame with effects disabled at the same time and camera.
They verify contact visibility, no foam without a hull, no foam beneath an airborne hull,
High and Low shader compilation, pause stability, and actual production context restoration.
Importance: 95/100. Shader compilation alone cannot prove correct placement.
The unwanted crest check failed before the change and now passes.
An unavailable restoration extension produces a labeled placeholder.

Old screenshots remain in artifacts/ocean-foam/persistent-final for comparison.
Old simulation timing does not describe these revised shaders.
Full-game 60 FPS remains unverified. Use scripts/ocean-foam-game-benchmark.html for a visible gameplay timing run.

Verification: lint, types, build, and all 20 captures pass. The full suite has 1291 passes and one existing AnchorItem pose failure.

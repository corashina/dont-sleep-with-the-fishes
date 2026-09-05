# Performance results: 2026-09-05

This change removes repeated frame work and loads assets when each game phase needs them.

## Frame work

- Scavenging reuses inventory records until item state changes.
- Raycasts reuse target and hit arrays.
- Survival anchors separate position updates from tooltip content updates.
- Anchor layout reads viewport dimensions during construction and resize.
- Boat projection prepares the required object roots instead of the full scene.

Automated tests verify identity reuse, invalidation, mutable anchor input, viewport caching, and local matrix preparation.
No frame profile was recorded. These results do not claim an FPS change.

## Loading and ownership

Normal startup has these loader call counts before menu activation:

| Loader | Calls |
| --- | ---: |
| `AudioSystem` creation | 1 |
| Menu models | 1 |
| Menu sand | 1 |
| Menu display font | 1 |
| Ship models | 0 |
| Survival models | 0 |
| Ship furniture | 0 |
| Sky assets | 0 |
| Lifeboat textures | 0 |
| Ship textures | 0 |
| Physics runtime | 0 |

The menu group requires 12 model files, one sand texture, one display font, and six sound files.
These are 20 required files. Vite inlines the 3,696-byte pause sound into application code.

The production menu requested 12 GLBs and five external MP3 files.
It did not request Rapier or gameplay GLBs.
The request history was complete.

The browser also requested menu sand, the display font, the instruction image, and CSS fonts.
Embedded GLB images produced blob decode requests.

Each resource slot shares one pending load among overlapping leases.
The final release disposes its asset. Failed slots can retry after all waiting owners release.
Ship and survival share sky and lifeboat slots during their handoff.
They use separate prop libraries, so common item templates can load again at the handoff.

## Measured asset bytes

| Asset set | Before | After | Reduction |
| --- | ---: | ---: | ---: |
| Startup-selected audio files | 32,647,732 | 2,977,460 | 29,670,272 bytes (90.9%) |
| Map GLB | 1,309,892 | 41,448 | 1,268,444 bytes (96.84%) |
| Starfish GLB | 3,456,468 | 58,396 | 3,398,072 bytes (98.31%) |
| Map and starfish | 4,766,360 | 99,844 | 4,666,516 bytes (97.91%) |

The prior audio set had 53 sound IDs and 52 unique files.
The menu set has six unique files: `menuAmbient`, `confirm`, `denied`, `pause`, `resume`, and `journal`.

The map and starfish use embedded WebP color textures with a 512-pixel limit.
Color quality is 85. Normal-map quality is 95 when a processed model has normal textures.

## Validation

- Full suite: 96 files and 1,615 tests passed.
- TypeScript: passed with `tsc --noEmit`.
- ESLint: passed with zero warnings.
- Production build: passed with 540 transformed modules.
- Model checks: 96 models passed across five groups.
- Texture checks: nine committed texture maps passed.
- Thumbnail check: 20 item thumbnails passed.

The build emits the map at 41.45 kB and the starfish at 58.40 kB.
It retains the existing large-chunk warning.
Rapier tests retain the existing deprecated initialization warning.

## Browser smoke

The production menu and Item Animation Lab rendered after texture compression.
The menu font, starfish, and in-game map rendered without missing assets or console errors.

Earlier browser checks covered direct survival, event entry, restart to Dorothy, and return to menu.
Drifting Supplies displayed its barrel model. The Dorothy ending preview displayed its ship and ocean.

The in-app browser blocked pointer lock, so it could not complete normal **START** movement.
Automated loading tests cover **START**, natural survival handoff, **Continue**, and pointer-lock retry during loading.

No cold-load timing was recorded. No natural locked-pointer run was completed in this browser.

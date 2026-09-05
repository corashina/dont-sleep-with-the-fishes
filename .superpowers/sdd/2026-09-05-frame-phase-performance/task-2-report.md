# Task 2 report: Phase asset and audio acquisition

Implementation commit: `995af96de60a7749c302a23437358db96b241a2c`.
Base: `c9b15d08` on `codex/frame-phase-performance`.
Workspace: `.worktrees/frame-phase-performance` only.

## Changes

- Replaced the eager Game constructor with a required PhaseResourceSource.
- Split common renderer/settings context from required menu, ship, and survival contexts.
- Added PhaseResources. Each group returns assets and an idempotent lease.
- Menu starts after menu models, sand, display font, and menu audio resolve.
- START loads ship resources. Handoff loads survival resources.
- Continue, browser playtests, and survival event previews bypass ship resources.
- Dorothy preview still uses the ship group.
- A generation guard controls activation and error reporting. Stale loads release their leases.
- Loading uses the existing system screen with an indeterminate progress bar.
- Incoming acquisition retains outgoing resources. Phase disposal precedes lease disposal.
- Shared sky and lifeboat slots survive overlapping ship/survival owners.
- PropModelLibrary accepts an explicit event model subset. Ship needs riggedHand; survival receives the other world/event models.
- Required model failures now reject the group and clean successful models. The obsolete optional-event failure path was removed.
- AudioSystem startup acquires no sound buffers. Phase leases acquire their own sets through backend reference counts.
- Phase audio release does not stop voices in other scopes. Event audio keeps its existing scoped-event clearing behavior.
- Renamed EventAudioLease to AudioLease and updated EventBundle's type references.
- Removed the eager production constructor and global menu-disposal WeakSet.
- Moved eager test assets into tests/helpers/game.ts. Updated director and lifecycle tests to await phase work.

## Font correction from parent browser review

The faster menu exposed a canvas font race. MenuSigns painted before Bowlby One SC loaded.
The fallback font remained in the canvas texture. Return to menu later used the correct font.

Menu acquisition now awaits `document.fonts.load('400 150px "Bowlby One SC"')`.
The deferred-font test failed before this fix and passed afterward.
No sign layout, font choice, color, material, or animation changed.

## Ownership contract

Launch owns PhaseResources until Game construction succeeds. Game then uses that owner for its lifetime.
The launch cleanup path can also call the idempotent owner after a failed constructor or start.

Each asset slot shares one pending load among overlapping leases. Each successful acquisition adds one reference.
The last release clears the slot and disposes its asset. A failed slot clears after all waiting owners reject.
A later acquisition can retry with a fresh load.

Each group tracks all started loads. If one fails, it waits for siblings and releases every successful lease.
Owner disposal invalidates pending groups. Late results release their assets and cannot activate a phase.
Active group leases release once, including repeated disposal and constructor failures.

Game holds a phase and its lease separately. It does not replace or mutate phase disposal methods.
Game disposes phase clones, audio scopes, and UI before releasing that phase's backing assets.
A failed phase factory cannot transfer its resource lease. Game releases that incoming lease.
Phase constructors remain responsible for cleanup of their own partially built objects, as before.

Sky and lifeboat textures share slots across gameplay phases. Lifeboat textures also support ship evacuation visuals.
Ship and survival prop libraries own their templates separately because their event model subsets differ.
This can reload common item/equipment templates at handoff. It avoids retaining ship-only event models in survival.

The physics runtime and CSS font have no matching unload API here. Their slot release has no disposal operation.
Physics worlds remain phase-owned. The browser owns the loaded CSS font for the document lifetime.
No dependency or compatibility layer was added.

## Startup counts and menu audio size

Loader assertions prove these normal-start calls:

| Loader | Calls before menu activation |
| --- | ---: |
| AudioSystem creation | 1 |
| Menu model library | 1 |
| Menu sand texture | 1 |
| Menu display font | 1 |
| Ship models | 0 |
| Survival models | 0 |
| Ship furniture | 0 |
| Sky assets | 0 |
| Lifeboat textures | 0 |
| Ship textures | 0 |
| Physics runtime | 0 |

The menu group declares 12 model files, one sand texture, one font, and six sound files.
This is 20 required asset files. This count excludes application code, styles, and browser-driven font requests.
Parent will confirm production network requests during integration.

The menu sound set is exactly:
`menuAmbient`, `confirm`, `denied`, `pause`, `resume`, `journal`.

Parent measured six unique sound files totaling **2,977,460 bytes**.
The previous eager set had 53 sound IDs, 52 unique files, and **32,647,732 bytes**.
The required sign font is the existing 54,152-byte Bowlby One SC file.

## Red evidence

1. Before implementation:
   `node node_modules/vitest/vitest.mjs run tests/PhaseResources.test.ts`
   exited 1. Vite could not resolve the new PhaseResources module. No production owner existed yet.
2. Before the font correction:
   `node node_modules/vitest/vitest.mjs run tests/PhaseResources.test.ts -t 'waits for the display font'`
   exited 1. The test received `acquired === true` while the font promise remained pending.
3. Intermediate integration runs exposed synchronous test assumptions and a mutated phase-dispose spy.
   Tests now await phase work. Game now keeps the lease separate from the phase object.
4. Intermediate model tests caught the old optional-event failure expectation.
   The updated test requires rejection. A subset test proves ship loading requests only riggedHand among event models.

## Verification

All Vite/Vitest commands used approved elevated execution because esbuild reads ancestor paths.
Bun was unavailable. No shared node_modules files changed.

Final focused command:

```text
node node_modules/vitest/vitest.mjs run tests/GameDirector.test.ts tests/GameLifecycle.test.ts tests/MainMenuPhase.test.ts tests/SurvivalPhase.test.ts tests/AudioSystem.test.ts tests/PropModelLibraryTextures.test.ts tests/GameConstruction.test.ts tests/GamePhaseLoading.test.ts tests/PhaseResources.test.ts tests/launchGame.test.ts tests/EventBundle.test.ts tests/EventBundleManager.test.ts tests/MenuSigns.test.ts --reporter=json --outputFile=.superpowers/sdd/2026-09-05-frame-phase-performance/test-results-final.json
```

Result: exit 0; **310 tests passed**, zero failures, across 11 matched files.
EventBundle.test.ts and MenuSigns.test.ts are unmatched filters; relevant coverage resides in the matched suites.

| Suite | Passed |
| --- | ---: |
| AudioSystem | 22 |
| EventBundleManager | 20 |
| GameConstruction | 3 |
| GameDirector | 13 |
| GameLifecycle | 70 |
| GamePhaseLoading | 8 |
| launchGame | 11 |
| MainMenuPhase | 14 |
| PhaseResources | 7 |
| PropModelLibraryTextures | 5 |
| SurvivalPhase | 137 |

After removing obsolete survival fixture-field assertions:
`node node_modules/vitest/vitest.mjs run tests/GameLifecycle.test.ts --reporter=dot`
exited 0; 70 tests passed.

Final full typecheck: `node node_modules/typescript/bin/tsc --noEmit` exited 0, no output.
Final full lint: `node node_modules/eslint/bin/eslint.js . --max-warnings 0` exited 0, no output.
`git diff --check` and staged diff checks passed.
No production build or full repository suite ran for Task 2. Parent owns the integration gate.

## Removed launch-test coverage mapping

The old launch suite assumed every gameplay asset loaded before Game construction.
That assumption and its many eager-argument assertions are obsolete.
Meaningful ownership checks moved to these boundaries:

| Removed eager case | Replacement coverage |
| --- | --- |
| Asset group failure and successful-sibling cleanup | PhaseResources failure, late disposal, and retry tests; menu launch failure; PropModelLibrary required failure |
| Startup while gameplay loads wait | launchGame deferred ship/physics test; PhaseResources menu loader counts |
| Cancel before Game exists | launchGame deferred AudioSystem cancellation |
| Cancel during model load | launchGame late menu cancellation; PhaseResources late ship cancellation |
| Detached mount before launch | launchGame disconnected-mount test |
| Detached mount during load | launchGame late detached-menu test |
| Game constructor throws | launchGame constructor/WebGL cases; GameConstruction renderer rollback |
| Game start throws | launchGame start-failure cleanup |
| Phase constructor throws | GamePhaseLoading incoming-lease failure; GameLifecycle constructor/override failure |
| Phase start throws | launchGame menu phase-start failure |
| Error forwarding and error screen | launchGame error logging/screen assertions and GameLifecycle onFatalError checks |
| Disposal continues after cleanup throws | GameLifecycle owned-cleanup cases and existing runCleanupSteps behavior |
| Gameplay transition ownership | GameDirector, GameLifecycle, and GamePhaseLoading |
| Direct survival without ship | GamePhaseLoading Continue/event loader counts; launchGame browser-playtest direct survival |
| Saved-run and gameplay behavior embedded in launch fixtures | GameLifecycle and SurvivalPhase suites |

Error renderers and localization routing remain in launchGame. Resource ownership no longer depends on those renderer branches.

## Self-review and behavior limits

- Checked required contexts and all production/test constructor callers.
- Checked disposal order, shared-slot overlap, failed-slot retry, stale rejection, and repeated disposal.
- Added generation checks after factory/override work and before start, including replacement during construction or resize.
- Kept pointer-lock acquisition in the existing input flow. Added a pending-load loss test using the existing Resume button.
- Verified shared backend buffers survive outgoing phase release, and outgoing-only menu buffers leave memory.
- Verified Continue and event loading do not request ship models, furniture, textures, or physics.
- Verified ending previews, settings, saves, and existing event audio through focused suites.
- A failed outgoing phase disposal now blocks incoming activation and reports the failure. Its incoming lease still releases.
  The old restart test expected a new phase to start despite that disposal failure; its expectation now follows explicit ownership.
- No gameplay rule, timer, frame loop, or reduced-motion behavior changed.

## Parent browser evidence

See `browser-results.md` in this directory for the parent-owned smoke notes.
Menu, direct Item Animation Lab, MAP/READ MAP, Start over to ship, Back to menu, and Dorothy preview rendered successfully.
No runtime error appeared. Rapier emitted its existing init-parameter warning.

The in-app browser blocked pointer lock, including visible retry controls.
Normal movement and natural ship-to-survival handoff therefore remain unverified in that browser.
Automated lifecycle tests cover those boundaries and the pointer-lock retry path.
Parent will verify the font correction and production request counts during integration.

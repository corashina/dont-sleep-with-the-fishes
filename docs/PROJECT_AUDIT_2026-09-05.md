# Project audit — 5 September 2026

The project has a useful test base and clear resource ownership in many systems. The first work should fix timing and lifecycle bugs. Then reduce startup work and repeated frame work. Split large modules as those systems change.

This report proposes changes. It does not implement them.

## Scope and evidence

Mapped all 314 TypeScript source modules. Reviewed startup, phase changes, input, scavenging, physics, survival rules, saves, events, fishing, audio, rendering, UI, assets, and build checks. Inspected dependency reachability and cycles. This was a source review with automated checks and targeted runtime probes. It was not a line-by-line proof of every module.

The working tree contained substantial pending work. Five files initially had unmerged index entries. Those entries cleared during the review. Findings apply to the working files inspected, not a clean committed release.

| Check | Result |
| --- | --- |
| TypeScript | Passed: `node node_modules/typescript/bin/tsc --noEmit` |
| ESLint | Passed with zero warnings |
| Tests | 92 files and 1,605 tests passed; 64.08 seconds |
| Production bundle | Passed; Vite reported large chunks |
| Asset checks | Item, ship, fishing, event, menu, texture, and thumbnail checks passed |
| Runtime imports | No cycles found after removing type-only imports |
| Balance sample | 240 main runs across the first 12 loadouts; no blocked runs |

Bun was absent from the shell path. Checks used the installed Node tools. The sandbox blocked the test configuration loader. Tests and production bundling then passed with approved access. Production output went to a temporary directory.

No browser playtest or GPU profile ran. Frame-rate gains, browser cache behavior, shader behavior, and GPU memory use still need browser checks. Temporary probes called the actual project methods with controlled clocks, storage, and presentation substitutes.

## Bugs and risks

### 1. Countdown duration depends on frame rate — confirmed

Evidence: `src/Game.ts:1082` and `src/phases/ScavengePhase.ts:406`.

The game caps each frame delta at 0.05 seconds. That same value drives the scavenging timer. At 10 FPS, 60 seconds of frame input advances the game by only 30 seconds. The probe left 30 seconds on the countdown.

Impact: slow devices get longer scavenging runs. Fishing and event timing also receive capped time. Audio follows a separate clock, which can create timing differences.

Use separate elapsed time for gameplay deadlines and bounded steps for physics. Exclude paused and hidden time explicitly. Test 60, 30, 15, and 10 FPS, plus a long frame and tab resume. Define how visual motion catches up with deadlines before changing it.

### 2. Frame errors bypass the error screen — confirmed by fault injection

Evidence: `src/Game.ts:1082`, `src/app/launchGame.ts:454`.

The animation callback has no error boundary. An exception in update or render escapes before the next frame is scheduled. The existing fatal-error path does not receive it.

The probe injected an update exception. Results: exception escaped, zero fatal-error reports, and zero new frames.

Route frame errors through the existing fatal-error handler. Stop the failed game and show its existing error screen. Verify update and render failures each report once and release resources.

### 3. Restored radio signals have no expiry lifecycle — confirmed

Evidence: `src/survival/SurvivalPhase.ts:426` and `src/survival/SurvivalPhase.ts:986`.

Save data can contain `radioSignalAvailable: true`. Phase startup restores this flag but does not start the radio audio. The expiry callback is installed only through the dawn path.

A valid day-six checkpoint retained the signal after 30 seconds of updates. The audio-start count stayed zero. This violates the rule that answering is available while the incoming audio plays.

Choose one restore rule: resume a saved remaining window, or start a fresh bounded window. Apply it during restored phase startup. Also emit a stable checkpoint when the signal expires. The current expiry callback changes the session and UI without saving that change.

Test save, expiry, reload, and Continue as one lifecycle.

### 4. Failed saves remain marked enabled — confirmed

Evidence: `src/browser/SurvivalSaveStore.ts:33`.

Storage write errors are swallowed. The state reports the feature as enabled without reporting whether the latest checkpoint reached storage. The probe forced a quota error. The result was `{ enabled: true, checkpoint: null }` with no failure signal. With an older save, the older checkpoint can remain available.

Return a save result and expose the last successful checkpoint. Show a short failure message when persistence fails. Keep quota and unavailable-storage tests separate from successful-save tests.

### 5. Browser history restore can return a disposed game — source-based risk

Evidence: `src/main.ts:13`, `src/app/launchGame.ts:538`.

Every `pagehide` calls `launch.cancel()`. Cancellation disposes the game and removes its canvas. There is no `pageshow` restore handler or check of `event.persisted`.

Browsers can preserve a page in the back/forward cache. This path can therefore restore the disposed page. Actual eligibility and symptoms need a browser reproduction. [MDN pagehide](https://developer.mozilla.org/en-US/docs/Web/API/Window/pagehide_event) and [MDN pageshow](https://developer.mozilla.org/en-US/docs/Web/API/Window/pageshow_event) describe this lifecycle.

Handle persisted navigation explicitly. Suspend and resume a retained game, or recreate it on restored page entry. Test Back and Forward with a running game and during loading.

## Performance work, in order

### 1. Reduce work before the menu

Evidence: `src/app/launchGame.ts:204`, `src/audio/AudioSystem.ts:92`, `src/audio/audioManifest.ts:109`.

Startup waits for nine asset groups, including ship furniture, physics, boat assets, and shared audio. Shared audio contains 53 sound IDs backed by 52 unique files. Those files total **32.65 MB** before decoding.

The main script is **2.148 MB**, or **575.62 kB gzip**. The separate Rapier script is **2.279 MB**, or **842.27 kB gzip**. Splitting Rapier alone does not defer its startup cost because startup awaits it.

Load the menu first. Load ship resources for the ship transition. Acquire survival resources for the survival transition. Keep explicit loading and failure states at each boundary. Reuse the existing event bundle ownership pattern.

Audio is decoded into memory. Compressed file sizes do not measure decoded memory. Split audio ownership by phase before considering streaming long loops. Measure decoded buffers as samples × channels × four bytes. [MDN AudioBuffer](https://developer.mozilla.org/en-US/docs/Web/API/AudioBuffer)

### 2. Separate anchor movement from tooltip content

Evidence: `src/survival/SurvivalEventFlow.ts:555`, `src/ui/BoatAnchorView.ts:281`, `src/ui/BoatAnchorView.ts:943`.

Each survival update projects anchors and calls `setAnchors`. That method creates a Set, creates layout records, and rebuilds tooltip content. Moving anchors write dimensions and transforms before reading `getBoundingClientRect()`.

This is a concrete layout-work risk. Browser profiling must establish its cost.

Read the viewport once before writes, or update a cached viewport on resize. Update position each frame. Update labels and action data only when inventory, eligibility, language, or state changes. Reuse layout storage.

### 3. Stop cloning scavenging inventory on timer changes

Evidence: `src/game/ScavengeSession.ts:74` and `src/game/ScavengeSession.ts:163`.

Every timer tick changes the snapshot revision. The next snapshot clones every item, even when no item changed. A timer-only probe replaced all 22 current item records.

Keep a separate inventory revision. Reuse immutable inventory records when only the timer changes. Preserve the snapshot API. Verify item identity remains stable across timer ticks and changes after pickup, drop, or deposit.

### 4. Reduce duplicate matrix traversal and raycast allocation

Evidence: `src/survival/BoatWorld.ts:1569`, `src/survival/BoatInteractionProjector.ts:358`, `src/interaction/InteractionSystem.ts:214`.

BoatWorld updates all world matrices. Anchor projection then forces another complete update. Rendering performs its own traversal. Some event projection paths force additional updates.

Give one frame stage ownership of matrix preparation. Update local targets only when later animation changes them. Do not disable updates globally without checking animated targets.

Scavenging also creates a target array for each raycast. Reuse that array and the result array. Three.js already accepts an output array; clear it before reuse. [Three.js Raycaster](https://threejs.org/docs/pages/Raycaster.html)

### 5. Add a render-resolution control and measure the ocean

Evidence: `src/Game.ts:1071`, `src/ocean/OceanRenderer.ts:44`, `src/rendering/ItemAmbientOcclusion.ts:26`.

Pixel ratio remains capped at two regardless of quality. A ratio of two produces four times the pixels of a ratio of one. Low quality lowers effect settings but does not lower the main render resolution.

The default high ocean uses 288 segments per side. Its central panel alone contains 165,888 triangles. Low uses 73,728; ultra uses 294,912. The horizon adds more geometry. These counts identify a profiling target, not a measured GPU bottleneck.

Add an explicit render scale. Profile ocean vertex cost, fragment cost, AO, outlines, and menu bloom separately. Preserve silhouettes, contact shading, and the authored sea style. Consider a camera-focused ocean grid only if measurements justify the change.

### 6. Budget texture bytes as well as triangles

The starfish has only 780 triangles but occupies **3.456 MB**. Its three embedded PNG images account for **3.445 MB**. The map model occupies **1.310 MB**; its JPEG accounts for **1.300 MB**.

Reduce unnecessary texture resolution and unused material maps through the existing asset pipeline. Add file-size and texture-dimension checks beside triangle checks. Consider KTX2 only after measuring runtime texture memory and reviewing image quality. Three.js provides the loader. [Three.js KTX2Loader](https://threejs.org/docs/pages/KTX2Loader.html)

Keep the existing Freesound-only rule for any new sound assets.

### 7. Extend performance measurements

`src/ui/PerformanceStats.ts` shows average FPS. It does not report frame-time percentiles, loading time, draw calls, or memory trends. It also discards frames longer than 250 milliseconds.

Record median and 95th-percentile frame time, long frames, draw calls, triangles, geometry count, and texture count. Count all post-processing passes together. Three.js supports explicit `renderer.info` reset timing. [Three.js WebGLRenderer](https://threejs.org/docs/pages/WebGLRenderer.html)

Compare menu, ship, calm survival, rough weather, and a heavy event at fixed resolution. Repeat scene changes to detect resource growth. Record hardware and quality settings with each result.

## Project structure

Keep the current phase model, deterministic rules, inventory ownership, and event bundle ownership. The dependency scan found no runtime cycles. Three modules are outside the main entry graph: route planning, balance simulation, and event validation. Their absence from runtime reachability does not prove they are unused.

The main problem is concentrated responsibility:

| Module | Approximate lines | Recommended boundary |
| --- | ---: | --- |
| SurvivalEventFlow | 2,740 | Reveal, response execution, and dawn transition |
| SurvivalSession | 2,184 | State owner plus focused action and event reducers |
| BoatWorld | 1,911 | Scene construction, frame update, and presentation ports |
| BoatAnchorView | 1,566 | Anchor layout, tooltip content, and Carlitos card |
| Game | 1,096 | Director, settings binding, and startup construction |
| main.css | 3,073 | Shared tokens plus styles owned by each UI feature |

Suggested organization as these modules change:

```text
src/app/                    startup, director, settings, browser lifecycle
src/survival/domain/        session, rules, inventory, random, checkpoint data
src/survival/flows/         event, fishing, day actions, phase coordination
src/survival/presentation/  boat scene, cameras, event actors, animation
src/ui/                    DOM views and feature styles
src/rendering/             shared renderer and passes
src/world/                 shared models, geometry, and asset ownership
```

Use required production interfaces for flow dependencies. Keep partial mocks in test helpers. Current optional method calls and test constructors make missing production behavior harder to detect.

Keep text references in domain outcomes. Resolve translated text at presentation boundaries. Avoid making rule decisions depend on displayed strings.

Remove the deprecated type-based pickup and loss overloads in ScavengeSession. Remove `carriedItem`. Convert remaining callers to instance IDs and `carriedItems`. These compatibility paths conflict with the project rules.

Move test renderer, clock, and fixture construction out of production classes when changing those classes. Split large test files by behavior, while keeping shared fixture construction small.

## Checks and documentation

The ESLint configuration enables only cyclomatic complexity. It does not enable the usual correctness rules. Add selected recommended TypeScript rules and enforce dependency direction between domain, flows, and presentation. Avoid arbitrary file-length gates.

Deployment currently depends on the macOS test job. Tests are therefore part of deployment verification. Add pull-request verification so failures appear before changes reach master. Declare the supported Bun version and keep dependency installation reproducible.

The normal test suite does not run the full balance simulation. The first-12-loadout sample used 20 seeds per loadout and 90% fishing reaction success. It produced 174 rescues and 66 deaths, with no blocked runs. Mean rescue day was 35.69. The separate no-signal control averaged 39.91.

This ordered sample is not representative of all loadouts. The exhaustive run was stopped without a result. Do not use the sample to approve or reject the full balance targets. Add a small representative deterministic balance check to normal verification. Keep the exhaustive balance run separate and bounded against non-progressing sessions.

README references missing `DriftingItemFlow`, `DriftingItemView`, and `docs/VISUAL_AUDIT.md`. It says saves are excluded despite documenting auto-save. It also describes removed motion preferences and 23 pickups; the current catalog probe produced 22. Update documentation after the pending changes settle.

## Recommended sequence

1. Fix frame error reporting, radio restore, save failure reporting, and countdown timing.
2. Check browser history restore and add the missing lifecycle behavior.
3. Establish browser performance baselines before changing visual quality.
4. Remove repeated tooltip, snapshot, matrix, and raycast work.
5. Load assets by phase and reduce oversized textures.
6. Split large owners during those changes and enforce dependency direction.
7. Update documentation and add pull-request verification.

An incremental approach keeps each step testable and reviewable. A broad folder move first would add review work before resolving the confirmed bugs. A larger engine rewrite has no support in the current evidence.

# Remove Reduced-Motion Support Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove reduced-motion detection, parameters, branches, and CSS overrides so every player receives the authored full-motion game and survival-event fades.

**Architecture:** Delete the policy at its root (`Game` and `PhaseContext`), then simplify render/world APIs to their normal-motion expressions. Remove the same dependency from survival presentation and UI ownership while preserving their existing cancellable promises, generation guards, timings, and disposal behavior.

**Tech Stack:** TypeScript 5.9, Three.js 0.180, Vite 7, Vitest 3, jsdom

## Global Constraints

- Stop querying `matchMedia('(prefers-reduced-motion: reduce)')`.
- The resulting TypeScript API must have no reduced-motion parameter to pass, store, or synchronize.
- Keep the existing full-motion branch everywhere; do not change authored timings or amplitudes.
- Delete every `@media (prefers-reduced-motion: reduce)` block from `src/styles/main.css`.
- Preserve UI timer/listener cancellation, phase generation guards, resource ownership, deterministic game rules, and allocation-free frame paths.
- Verify `src` and `tests` contain no `reducedMotion`, `REDUCED_TRANSITION_MS`, or `prefers-reduced-motion` references.

---

### Task 1: Remove the Core, Scavenging, Rendering, and Ship-World Policy

**Files:**
- Modify: `src/app/GamePhase.ts`
- Modify: `src/Game.ts`
- Modify: `src/phases/ScavengePhase.ts`
- Modify: `src/player/PlayerController.ts`
- Modify: `src/rendering/SceneRenderer.ts`
- Modify: `src/rendering/postProcessingProfiles.ts`
- Modify: `src/world/BoatDepositSmoke.ts`
- Modify: `src/world/Ship.ts`
- Modify: `src/world/ShipRigging.ts`
- Modify: `src/world/ShipSmoke.ts`
- Modify: `src/world/World.ts`
- Test: `tests/GameLifecycle.test.ts`
- Test: `tests/PostProcessingPipeline.test.ts`

**Interfaces:**
- Consumes: the existing `Game.initialize`, `PhaseContext`, `SceneVisualState`, `World.update`, and owned effect-update APIs.
- Produces: `PhaseContext` without a media query; `ScavengeVisualState` and `SurvivalVisualState` without policy flags; parameter-free normal-motion update APIs; `PlayerController.update(delta, input, cameraShake)` and `placeCamera(cameraShake)`.

- [ ] **Step 1: Write the failing normal-motion tests and fixtures**

Update scene-state fixtures to the intended parameter-free form:

```ts
const visualState: ScavengeVisualState = {
  kind: 'scavenge',
  elapsedSeconds: 90,
  sinkingProgress: 0.75,
};
```

Replace the scavenging render assertion with the parameter-free state:

```ts
expect(render).toHaveBeenCalledWith(scene, camera, {
  kind: 'scavenge',
  elapsedSeconds: 90,
  sinkingProgress: 0.75,
});
```

Update post-processing state literals to omit the removed property, and add:

```ts
expect(resolveGrainTime({
  kind: 'scavenge',
  elapsedSeconds: 1.26,
  sinkingProgress: 0,
})).toBe(1.25);
```

- [ ] **Step 2: Run the focused tests to verify the old API fails**

Run:

```powershell
npm test -- tests/GameLifecycle.test.ts tests/PostProcessingPipeline.test.ts
```

Expected: FAIL because production types and runtime fixtures still require or read the removed policy.

- [ ] **Step 3: Remove the root policy and retain the authored expressions**

Make these exact API changes:

```ts
export interface PhaseContext {
  mount: HTMLElement;
  renderer: WebGLRenderer;
  sceneRenderer: SceneRenderer;
  camera: PerspectiveCamera;
  propModels: PropModelLibrary;
  shipFurniture: ShipFurnitureLibrary;
  maxTextureAnisotropy: number;
  skyAssets: SkyAssets;
  lifeboatAssets: LifeboatAssets;
  shipAssets: ShipAssets;
}
```

Remove the `window.matchMedia(...)` call and the `reducedMotion` argument from both production and `Game.forTest` initialization paths.

Use policy-free visual states:

```ts
export interface ScavengeVisualState {
  kind: 'scavenge';
  elapsedSeconds: number;
  sinkingProgress: number;
}

export interface SurvivalVisualState {
  kind: 'survival';
  elapsedSeconds: number;
  phase: 'day' | 'night';
  weather: WeatherId;
}
```

Keep grain animated:

```ts
export function resolveGrainTime(state: Readonly<SceneVisualState>): number {
  const seconds = clampPostProcessingValue(state.elapsedSeconds, 0, 86_400, 0);
  return Math.floor(seconds * 8) / 8;
}
```

Rename the misleading player-controller value while preserving behavior:

```ts
update(delta: number, input: InputController, cameraShake = 0): void
placeCamera(cameraShake = 0): void
```

In `ScavengePhase`, always calculate:

```ts
const shake = Math.sin(this.elapsed * 37) * sinking.cameraShake;
```

Remove policy parameters through `World.update`, ship effect updates, rigging, ship smoke, and deposit smoke. Keep only the former full-motion formulas: elapsed rigging sway, ordinary smoke spawn interval/horizontal scale/lifetime, and deposit-smoke motion based on `this.age`.

- [ ] **Step 4: Run focused tests and typecheck**

Run:

```powershell
npm test -- tests/GameLifecycle.test.ts tests/PostProcessingPipeline.test.ts
npm run typecheck
```

Expected: both test files PASS and TypeScript reports no errors from core/render/world call sites.

- [ ] **Step 5: Commit the core removal**

```powershell
git add src/app/GamePhase.ts src/Game.ts src/phases/ScavengePhase.ts src/player/PlayerController.ts src/rendering/SceneRenderer.ts src/rendering/postProcessingProfiles.ts src/world/BoatDepositSmoke.ts src/world/Ship.ts src/world/ShipRigging.ts src/world/ShipSmoke.ts src/world/World.ts tests/GameLifecycle.test.ts tests/PostProcessingPipeline.test.ts
git commit -m "refactor: remove reduced motion from core rendering"
```

### Task 2: Remove the Survival Presentation and World Policy

**Files:**
- Modify: `src/survival/BoatSupplyDisplay.ts`
- Modify: `src/survival/BoatWorld.ts`
- Modify: `src/survival/EventPresentationLayer.ts`
- Modify: `src/survival/SurvivalPhase.ts`
- Test: `tests/EventPresentationLayer.test.ts`
- Test: `tests/SurvivalPhase.test.ts`

**Interfaces:**
- Consumes: Task 1's policy-free `PhaseContext` and `SurvivalVisualState`.
- Produces: `new BoatWorld(camera, propModels, moonTexture, savedItems, lifeboatAssets)`, `new BoatSupplyDisplay(propModels, parent, savedItems)`, `new EventPresentationLayer()`, and `SurvivalPhase.forTest` dependencies without a policy flag.

- [ ] **Step 1: Rewrite tests around the permanent authored path**

Change the event layer helper to:

```ts
function createLayer(): EventPresentationLayer {
  return new EventPresentationLayer();
}
```

Replace the instant-settlement test with a duration-sensitive authored reveal:

```ts
it('holds an authored reveal pose until its full animation completes', async () => {
  const layer = createLayer();
  layer.stage('other-people');
  const reveal = layer.reveal('other-people');
  let settled = false;
  void reveal.then(() => { settled = true; });

  layer.update(0.1, 0);
  await Promise.resolve();
  expect(settled).toBe(false);

  layer.update(1, 0.9);
  await reveal;
  expect(settled).toBe(true);
  layer.dispose();
});
```

Remove `reducedMotion` from fishing-rig options and `SurvivalPhase.forTest` calls. Collapse policy-parameterized fishing cases into one normal-motion case and assert `animations.fade` remains empty because the normal camera path owns entry/exit. Rename the reveal-order test to:

```ts
it('keeps event reveal ordering through authored transitions', async () => {
  const event = SURVIVAL_EVENTS.find(({ phase }) => phase === 'night')!;
  let current = snapshot();
  const calls: string[] = [];
  const phase = SurvivalPhase.forTest({
    session: {
      snapshot: vi.fn(() => current),
      perform: vi.fn(() => {
        current = snapshot({ state: 'nightEvent', pendingEventId: event.id });
        return accepted({ code: 'event-opened', cue: 'nightfall', deltas: {} });
      }),
    },
    world: {
      play: vi.fn(async (cue) => { calls.push(cue); }),
      stageEvent: vi.fn(() => { calls.push('stage'); }),
      revealEvent: vi.fn(async () => { calls.push('reveal-tableau'); }),
      dispose: vi.fn(),
    },
    ui: {
      beginEventPresentation: vi.fn(() => { calls.push('begin-event'); }),
      setSleepCovered: vi.fn(async (covered) => { calls.push(covered ? 'cover' : 'uncover'); }),
      showEventReveal: vi.fn(async () => { calls.push('caption'); }),
      setEventSelection: vi.fn(() => { calls.push('selection'); }),
      setBusy: vi.fn(),
      render: vi.fn(),
      setJournalUnread: vi.fn(),
      dispose: vi.fn(),
    },
  });

  phase.handleAction('endDay');
  await flushPromises();

  expect(calls).toEqual([
    'begin-event', 'nightfall', 'cover', 'stage', 'caption',
    'reveal-tableau', 'uncover', 'selection',
  ]);
});
```

- [ ] **Step 2: Run focused tests to verify constructors and fixtures fail**

Run:

```powershell
npm test -- tests/EventPresentationLayer.test.ts tests/SurvivalPhase.test.ts
```

Expected: FAIL while constructors, visual state, and test dependencies still expose reduced-motion inputs.

- [ ] **Step 3: Simplify survival APIs to full motion**

Remove the boolean constructor field from `BoatSupplyDisplay`; always use:

```ts
const duration = EVENT_ITEM_USE_DURATION;
```

Remove `MediaQueryList` ownership from `BoatWorld` and shift its constructor arguments left. Delete `FISHING_REDUCED_DURATION` and use the existing authored durations for enter, cast, reel, miss, and exit animations. Always apply ordinary wave, spray, cue, bubble, ripple, line-arc, and catch-swing motion.

Construct presentation objects without policy arguments:

```ts
this.supplyDisplay = new BoatSupplyDisplay(propModels, build.storageRoot, savedItems);
this.eventPresentation = new EventPresentationLayer();
```

Remove the boolean constructor field and instant branches from `EventPresentationLayer`; always select `REVEAL_DURATION` or `REACTION_DURATION` and initialize with the existing reveal/reaction poses.

Remove the test dependency and test-context policy from `SurvivalPhase`. Construct the world and UI using the parameter-free APIs. In `transitionFishingView`, retain only the normal camera transition plus the existing generation check:

```ts
await (direction === 'enter'
  ? this.world.enterFishingView?.() ?? Promise.resolve()
  : this.world.exitFishingView?.() ?? Promise.resolve());
return this.isContinuationActive(generation);
```

Stop writing a policy property into survival visual state.

- [ ] **Step 4: Run survival tests and typecheck**

Run:

```powershell
npm test -- tests/EventPresentationLayer.test.ts tests/SurvivalPhase.test.ts
npm run typecheck
```

Expected: both test files PASS and all survival constructor/call-site types compile.

- [ ] **Step 5: Commit the survival removal**

```powershell
git add src/survival/BoatSupplyDisplay.ts src/survival/BoatWorld.ts src/survival/EventPresentationLayer.ts src/survival/SurvivalPhase.ts tests/EventPresentationLayer.test.ts tests/SurvivalPhase.test.ts
git commit -m "refactor: remove reduced motion from survival"
```

### Task 3: Make UI and CSS Always Use Authored Timing

**Files:**
- Modify: `src/ui/SurvivalUI.ts`
- Modify: `src/styles/main.css`
- Test: `tests/SurvivalUI.test.ts`

**Interfaces:**
- Consumes: Task 2's parameter-free `new SurvivalUI(mount)`.
- Produces: sleep cover `2_500ms`, event choice beat `240ms`, fishing fade `180ms`, quiet-night hold at its existing full duration, and event outcome hold `2_000ms`, all with existing cancellation and disposal semantics.

- [ ] **Step 1: Replace reduced-path tests with authored-duration tests**

Construct every UI with:

```ts
const ui = new SurvivalUI(mount);
```

For the event outcome hold, assert it does not settle early:

```ts
let settled = false;
const pending = ui.holdEventOutcome();
void pending.then(() => { settled = true; });
await vi.advanceTimersByTimeAsync(1_999);
expect(settled).toBe(false);
await vi.advanceTimersByTimeAsync(1);
await pending;
expect(settled).toBe(true);
```

For sleep cover, preserve supersession/disposal assertions and drive the authored fallback:

```ts
let firstSettled = false;
const first = ui.setSleepCovered(true);
void first.then(() => { firstSettled = true; });
await vi.advanceTimersByTimeAsync(2_499);
expect(firstSettled).toBe(false);
await vi.advanceTimersByTimeAsync(1);
await first;
```

For fishing fade, use `179ms` then `1ms`. Replace CSS assertions with:

```ts
expect(mainStyles).toMatch(/\.sleep-cover\s*\{[^}]*transition:\s*opacity 2\.5s/s);
expect(mainStyles).not.toMatch(/prefers-reduced-motion/);
```

- [ ] **Step 2: Run UI tests to verify the old 1ms path or constructor fails**

Run:

```powershell
npm test -- tests/SurvivalUI.test.ts
```

Expected: FAIL while `SurvivalUI` still accepts and reads the removed policy and CSS still contains media-query overrides.

- [ ] **Step 3: Delete UI policy plumbing and CSS overrides**

Change the constructor to:

```ts
constructor(private readonly mount: HTMLElement) {
```

Delete `REDUCED_TRANSITION_MS`. Use the existing authored constants directly in `playEventChoiceBeat`, `setSleepCovered`, `setFishingFade`, `holdSleep`, and `holdEventOutcome`. Do not change pending-operation `finish()` behavior, transition listeners, fallback timers, or disposal.

Delete all three `@media (prefers-reduced-motion: reduce)` blocks from `src/styles/main.css`, leaving surrounding normal rules unchanged.

- [ ] **Step 4: Run UI tests and the source-policy scan**

Run:

```powershell
npm test -- tests/SurvivalUI.test.ts
rg -n "reducedMotion|REDUCED_TRANSITION_MS|prefers-reduced-motion" src tests
```

Expected: UI tests PASS; `rg` exits with code 1 and prints no matches.

- [ ] **Step 5: Run whole-project verification**

Run:

```powershell
npm test
npm run typecheck
npm run build
git diff --check
```

Expected: every test passes, typecheck and production build succeed, and `git diff --check` emits no errors. The existing Vite chunk-size warning is non-blocking.

- [ ] **Step 6: Verify the live transition**

Using the already-running `http://127.0.0.1:4173/dont-sleep-with-the-fishes/`, confirm:

1. Clicking **End Day** starts a visible 2.5-second fade instead of instant black.
2. The event scene is staged only after the cover is opaque.
3. Resolving an event shows its cue and outcome for 2 seconds.
4. The next 2.5-second cover reaches black before the day scene changes.
5. The day scene reveals over 2.5 seconds, with no console errors.

- [ ] **Step 7: Commit the UI policy removal**

```powershell
git add src/ui/SurvivalUI.ts src/styles/main.css tests/SurvivalUI.test.ts
git commit -m "fix: always use authored transition timing"
```

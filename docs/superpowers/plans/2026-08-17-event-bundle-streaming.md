# Event Bundle Streaming Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Load each survival event during its preceding fade-out and release its owned runtime resources under the exit cover.

**Architecture:** A complete event manifest drives one strict `EventBundleManager`. Each bundle acquires decoded sounds, model templates, generated scene content, and one presenter. `SurvivalPhase` starts bundle work with the cover transition, while `BoatWorld` hosts only the active presenter.

**Tech Stack:** TypeScript 5.9, Three.js 0.180, Web Audio API, Vite 7, Vitest 3.

## Global Constraints

- Apply the lifecycle to every event in `EVENT_PRESENTATION_ROUTES`.
- Start loading when the preceding fade-out starts.
- Do not start fade-in before the complete bundle is staged and settled.
- Keep the cover visible and report a fatal error after any required load failure.
- Do not use placeholder models, silent substitutes, or partial event fallbacks.
- Release event-owned CPU, GPU, and decoded audio resources after full cover.
- Keep normal boat resources loaded.
- Do not add packages.
- Preserve existing event presentation and interaction behavior.

---

### Task 1: Complete event resource manifest

**Files:**
- Create: `src/survival/eventBundleManifest.ts`
- Create: `tests/EventBundleManifest.test.ts`
- Modify: `src/audio/audioManifest.ts`

**Interfaces:**
- Consumes: `SurvivalEventId`, `EventModelId`, `SurvivalEventModelId`, and `SoundId`.
- Produces: `EventBundleSpec`, `EventBundleModelId`, `EVENT_BUNDLE_SPECS`, `EVENT_ONLY_SOUND_IDS`, and `SHARED_SOUND_IDS`.

- [x] **Step 1: Write the manifest completeness test**

```ts
it('declares one immutable bundle for every routed event', () => {
  expect(Object.keys(EVENT_BUNDLE_SPECS).sort())
    .toEqual(Object.keys(EVENT_PRESENTATION_ROUTES).sort());
  for (const spec of Object.values(EVENT_BUNDLE_SPECS)) {
    expect(Object.isFrozen(spec)).toBe(true);
    expect(Object.isFrozen(spec.models)).toBe(true);
    expect(Object.isFrozen(spec.sounds)).toBe(true);
  }
});
```

- [x] **Step 2: Run the focused test and verify the missing module failure**

Run: `vitest run tests/EventBundleManifest.test.ts`

Expected: FAIL because `eventBundleManifest.ts` does not exist.

- [x] **Step 3: Add sound ownership groups**

Add these exact event-owned sound IDs to `audioManifest.ts`:

```ts
export const EVENT_ONLY_SOUND_IDS = Object.freeze([
  'yawn',
  'thunderLightning',
  'thunderLightningCrack',
  'thunderLightningDry',
  'leak',
  'tentacleMovement',
  'eerieMelody',
  'chest',
  'driftingCargo',
] as const satisfies readonly SoundId[]);

const eventOnlySounds = new Set<SoundId>(EVENT_ONLY_SOUND_IDS);
export const SHARED_SOUND_IDS = Object.freeze(
  SOUND_IDS.filter((id) => !eventOnlySounds.has(id)),
);
```

- [x] **Step 4: Add the complete event manifest**

Define the immutable type:

```ts
export type EventBundleModelId = EventModelId | SurvivalEventModelId;

export interface EventBundleSpec {
  readonly models: readonly EventBundleModelId[];
  readonly sounds: readonly SoundId[];
}
```

Map event-only assets exactly as follows. Events absent from this list get frozen empty arrays.

```ts
const RESOURCES = {
  leak: { models: ['leakPlanks'], sounds: ['leak'] },
  'school-of-fish': { models: ['schoolFish'], sounds: [] },
  snatcher: { models: ['snatcher'], sounds: ['tentacleMovement'] },
  'death-stare': { models: ['deathStareBlob'], sounds: [] },
  'swarm-of-anglerfish': { models: ['anglerFish'], sounds: [] },
  whirlpool: { models: ['whirlpoolCore'], sounds: [] },
  'man-in-the-fog': { models: ['fogMan'], sounds: [] },
  ghosts: { models: ['ghost'], sounds: [] },
  'eerie-melody': { models: ['siren', 'sirenRock'], sounds: ['eerieMelody'] },
  thunderstorm: {
    models: [],
    sounds: ['thunderLightning', 'thunderLightningCrack', 'thunderLightningDry'],
  },
  'bad-sleep': { models: [], sounds: ['yawn'] },
  'drifting-barrel': { models: ['driftingBarrel'], sounds: ['driftingCargo'] },
  'drifting-chest': { models: ['mysteryChest'], sounds: ['driftingCargo'] },
  'drifting-bottle': { models: ['driftingBottle'], sounds: [] },
  'check-the-back': { models: ['checkBackFish'], sounds: [] },
  flowers: { models: ['flowers'], sounds: [] },
  'chest-attack': { models: [], sounds: ['chest'] },
} as const;
```

Build `EVENT_BUNDLE_SPECS` from every `EVENT_PRESENTATION_ROUTES` key. Freeze each entry and both arrays.

- [x] **Step 5: Run the focused tests**

Run: `vitest run tests/EventBundleManifest.test.ts tests/EventPresentationRoutes.test.ts`

Expected: PASS.

- [x] **Step 6: Commit the manifest**

```bash
git add src/audio/audioManifest.ts src/survival/eventBundleManifest.ts tests/EventBundleManifest.test.ts
git commit -m "feat: declare event bundle resources"
```

---

### Task 2: Disposable event audio leases

**Files:**
- Modify: `src/audio/AudioBackend.ts`
- Modify: `src/audio/WebAudioBackend.ts`
- Modify: `src/audio/AudioSystem.ts`
- Modify: `tests/AudioSystem.test.ts`
- Modify: `tests/WebAudioBackend.test.ts`

**Interfaces:**
- Consumes: `SHARED_SOUND_IDS`, event manifest sound arrays, and existing `AudioVoice` ownership.
- Produces: `AudioBackend.acquire(ids)`, `AudioBackend.release(ids)`, `EventAudioLease`, `AudioSystem.loadWithBackend(backend)`, and `AudioSystem.acquireEventAudio(ids)`.

- [x] **Step 1: Add failing audio lease tests**

```ts
it('loads only shared sounds during system startup', async () => {
  await AudioSystem.loadWithBackend(backend);
  expect(backend.acquire).toHaveBeenCalledWith(SHARED_SOUND_IDS);
});

it('releases event buffers after owned voices stop', async () => {
  const lease = await system.acquireEventAudio(['leak']);
  const voice = system.createScope().startLoop('leak') as FakeVoice;
  lease.dispose();
  expect(voice.stop).toHaveBeenCalled();
  expect(backend.release).toHaveBeenCalledWith(['leak']);
});
```

Add a backend test that acquires `leak`, releases it, and verifies `play('leak')` returns `null` afterward.

- [x] **Step 2: Run tests and verify interface failures**

Run: `vitest run tests/AudioSystem.test.ts tests/WebAudioBackend.test.ts`

Expected: FAIL because acquire, release, and event leases do not exist.

- [x] **Step 3: Replace whole-manifest loading with sound acquisition**

Change `AudioBackend` to:

```ts
acquire(ids: readonly SoundId[]): Promise<void>;
release(ids: readonly SoundId[]): void;
```

Remove `load()`. In `WebAudioBackend`, keep a reference count per sound. Fetch and decode only sounds that change from zero to one owner. Share one in-flight promise per ID. On the last release, stop active voices for that ID and delete its decoded buffer.

If one acquisition fails, decrement every reference acquired by that call. Preserve the first failure.

- [x] **Step 4: Add the event audio lease**

```ts
export interface EventAudioLease {
  readonly sounds: readonly SoundId[];
  dispose(): void;
}

async acquireEventAudio(sounds: readonly SoundId[]): Promise<EventAudioLease> {
  await this.backend.acquire(sounds);
  let disposed = false;
  return {
    sounds,
    dispose: () => {
      if (disposed) return;
      disposed = true;
      this.stopSounds(sounds);
      this.backend.release(sounds);
    },
  };
}
```

Make `AudioSystem.load()` acquire only `SHARED_SOUND_IDS`. Release shared sounds during system disposal.

Implement `static loadWithBackend(backend, storage = null)` as the shared production and test construction path. `load()` creates a `WebAudioBackend` and delegates to it.

- [x] **Step 5: Run audio tests**

Run: `vitest run tests/AudioSystem.test.ts tests/WebAudioBackend.test.ts`

Expected: PASS.

- [x] **Step 6: Commit audio leases**

```bash
git add src/audio tests/AudioSystem.test.ts tests/WebAudioBackend.test.ts
git commit -m "feat: lease event audio buffers"
```

---

### Task 3: Load strict model subsets

**Files:**
- Modify: `src/survival/EventModelLibrary.ts`
- Modify: `src/survival/SurvivalEventModelLibrary.ts`
- Modify: `tests/EventModelLibrary.test.ts`
- Modify: `tests/SurvivalEventModelLibrary.test.ts`

**Interfaces:**
- Consumes: event manifest model arrays.
- Produces: `EventModelLibrary.load(ids, loader)`, `SurvivalEventModelLibrary.load(ids, loader)`, and strict disposal for partial loads.

- [x] **Step 1: Add failing subset tests**

```ts
const library = await EventModelLibrary.load(['ghost'], loader);
expect(loader.load).toHaveBeenCalledOnce();
expect(() => library.create('leakPlanks')).toThrow('Missing event model template');
```

Add the same test for `SurvivalEventModelLibrary.load(['flowers'], loader)`. Add a failure test that verifies completed roots dispose when a sibling load fails.

- [x] **Step 2: Run model tests and verify signature failures**

Run: `vitest run tests/EventModelLibrary.test.ts tests/SurvivalEventModelLibrary.test.ts`

Expected: FAIL because both loaders always load all model IDs.

- [x] **Step 3: Implement strict subset loading**

Change both static loaders to accept a readonly ID list first. Validate only requested specs. Load requested entries in parallel.

Remove the featured model fallback path. A missing or invalid required model must throw `EventModelLoadError` with the requested ID.

Keep instance disposal idempotent. Dispose all completed templates after any partial failure.

- [x] **Step 4: Run model tests**

Run: `vitest run tests/EventModelLibrary.test.ts tests/SurvivalEventModelLibrary.test.ts tests/EventModelAudit.test.ts`

Expected: PASS.

- [x] **Step 5: Commit model subsets**

```bash
git add src/survival/EventModelLibrary.ts src/survival/SurvivalEventModelLibrary.ts tests/EventModelLibrary.test.ts tests/SurvivalEventModelLibrary.test.ts
git commit -m "feat: load event model subsets"
```

---

### Task 4: One active event presenter

**Files:**
- Create: `src/survival/ActiveEventPresenter.ts`
- Modify: `src/survival/EventPresentationCoordinator.ts`
- Modify: `src/survival/EventPresentationLayer.ts`
- Modify: `src/survival/FeaturedEventPresentations.ts`
- Modify: `src/survival/WeatherEventAnimator.ts`
- Modify: `src/survival/SupernaturalEventAnimator.ts`
- Modify: `src/survival/BoatWorld.ts`
- Create: `tests/ActiveEventPresenter.test.ts`
- Modify: `tests/BoatWorld.test.ts`

**Interfaces:**
- Consumes: one event ID and its two partial model libraries.
- Produces: `ActiveEventPresenter`, `BoatWorld.createEventPresenter(resources)`, `attachEventPresenter`, and `detachEventPresenter`.

- [x] **Step 1: Add failing single-presenter tests**

Record constructor calls through test factories. Verify one `flowers` presenter creates only Flowers content. Verify switching from Flowers to Leak disposes Flowers before Leak attaches. Verify interaction roots come only from the active presenter.

- [x] **Step 2: Run focused presenter tests**

Run: `vitest run tests/ActiveEventPresenter.test.ts tests/BoatWorld.test.ts`

Expected: FAIL because `BoatWorld` constructs every event system at startup.

- [x] **Step 3: Define the unified presenter boundary**

```ts
export interface ActiveEventPresenter {
  readonly eventId: SurvivalEventId;
  readonly roots: readonly Object3D[];
  stage(context: EventStageContext): void;
  reveal(): Promise<void>;
  playChoice(choice: EventChoicePresentation): Promise<void>;
  playItemUse(choiceId: string, instanceId: ItemInstanceId): Promise<boolean>;
  react(outcome: ActionOutcome, response: EventPhysicalResponsePresentation, presentation: EventOutcomePresentation): Promise<void>;
  interactionRoots(): readonly Object3D[];
  itemAimTarget(): Object3D | null;
  resultRoot(): Object3D | null;
  update(time: number, delta: number): void;
  settleForVisibilityChange(): void;
  dispose(): void;
}
```

- [x] **Step 4: Make each route construct only one event**

Change the existing route coordinators to accept one event ID. Build only that event's tableau, generated effects, models, and listeners.

Remove permanent event presenter fields from `BoatWorld`. Keep one `activeEventPresenter`. Attach its roots to the current boat and scene. Delegate existing `stageEvent`, `revealEvent`, choice, reaction, target, update, settle, and clear methods to it.

`detachEventPresenter()` must remove roots and dispose the presenter once.

- [x] **Step 5: Run presenter tests**

Run: `vitest run tests/ActiveEventPresenter.test.ts tests/BoatWorld.test.ts tests/EventPresentationCoordinator.test.ts tests/WeatherAndSupernaturalItemUse.test.ts`

Expected: PASS.

- [x] **Step 6: Commit presenter ownership**

```bash
git add src/survival tests/ActiveEventPresenter.test.ts tests/BoatWorld.test.ts
git commit -m "refactor: own one event presenter"
```

---

### Task 5: Event bundle loader and manager

**Files:**
- Create: `src/survival/EventBundle.ts`
- Create: `src/survival/EventBundleManager.ts`
- Create: `tests/EventBundleManager.test.ts`

**Interfaces:**
- Consumes: `EVENT_BUNDLE_SPECS`, model subset loaders, `AudioSystem.acquireEventAudio`, and `BoatWorld.createEventPresenter`.
- Produces: `EventBundle`, `EventBundleLoader`, and `EventBundleManager`.

- [x] **Step 1: Add failing manager order tests**

```ts
manager.beginLoad('leak');
expect(log).toEqual(['audio:begin', 'models:begin']);
await manager.activate('leak');
expect(log).toEqual([
  'audio:begin', 'models:begin', 'audio:ready', 'models:ready',
  'presenter:create', 'presenter:attach',
]);
await manager.releaseActive();
expect(log.slice(-4)).toEqual([
  'presenter:detach', 'presenter:dispose', 'models:dispose', 'audio:dispose',
]);
```

Add tests for idempotent disposal, conflicting IDs, partial failure cleanup, and late completion after cancellation.

- [x] **Step 2: Run the manager tests**

Run: `vitest run tests/EventBundleManager.test.ts`

Expected: FAIL because the manager does not exist.

- [x] **Step 3: Implement bundle loading**

Partition model IDs by the two model manifests. Start audio and both model loads in one `Promise.allSettled`. Create the presenter only after all resources succeed.

An `EventBundle` disposes in this order: detach, presenter, featured models, dedicated models, audio lease.

- [x] **Step 4: Implement strict manager generations**

`beginLoad(eventId)` must return the existing promise for the same pending ID. It must throw for a different pending ID.

`activate(eventId)` waits for the matching pending bundle, attaches it, and makes it active. `releaseActive()` detaches and disposes the active bundle. `dispose()` invalidates the generation and cleans pending late results.

- [x] **Step 5: Run manager tests**

Run: `vitest run tests/EventBundleManager.test.ts`

Expected: PASS.

- [x] **Step 6: Commit the manager**

```bash
git add src/survival/EventBundle.ts src/survival/EventBundleManager.ts tests/EventBundleManager.test.ts
git commit -m "feat: manage event bundle ownership"
```

---

### Task 6: Wire bundles to covered transitions

**Files:**
- Modify: `src/survival/SurvivalPhase.ts`
- Modify: `src/app/GamePhase.ts`
- Modify: `src/Game.ts`
- Modify: `src/app/launchGame.ts`
- Modify: `tests/SurvivalPhase.test.ts`
- Modify: `tests/GameLifecycle.test.ts`
- Modify: `tests/launchGame.test.ts`

**Interfaces:**
- Consumes: `EventBundleManager.beginLoad`, `activate`, `releaseActive`, and `dispose`.
- Produces: the covered entry, exit, chaining, cancellation, and fatal error lifecycle.

- [x] **Step 1: Add failing transition order tests**

Use deferred bundle promises. Assert this entry order:

```ts
expect(log).toEqual([
  'bundle:begin:leak',
  'cover:begin',
  'cover:complete',
  'bundle:release-old',
  'bundle:ready:leak',
  'bundle:activate:leak',
  'world:stage:leak',
  'world:render-covered',
  'scene:settled',
  'cover:reveal',
]);
```

Add tests that fade-in stays blocked, chained load starts with exit fade, disposal occurs after full cover, and a rejected load calls the fatal handler while the cover stays active.

- [x] **Step 2: Run phase lifecycle tests**

Run: `vitest run tests/SurvivalPhase.test.ts tests/GameLifecycle.test.ts`

Expected: FAIL because event resources are globally resident.

- [x] **Step 3: Start loads with fade-out**

In `runPendingEventReveal`, call `beginLoad(event.id)` immediately before `setSleepCovered(true)`. After full cover, release the old bundle, await activation, stage, render, settle, then reveal the cover.

For an already covered chained event, reuse the pending load started by the prior exit path.

- [x] **Step 4: Release bundles under exit cover**

After event resolution determines the next snapshot, start the next bundle load before the exit cover promise. After full cover, release the old bundle. Activate the next bundle or render normal play.

Route drifting cargo continuation through the same covered exit. Keep a terminal tableau active only while the terminal screen still displays it. Phase disposal releases it.

- [x] **Step 5: Remove startup event loads**

Remove event model libraries from `LoadedGameAssets`, `PhaseContext`, `Game`, and `LaunchDependencies`. Reduce `GAME_ASSET_LOAD_COUNT` from 11 to 9. Construct model loaders only through event bundle loading.

Keep `AudioSystem.load()` in startup because it acquires shared sounds only.

- [x] **Step 6: Run lifecycle tests**

Run: `vitest run tests/SurvivalPhase.test.ts tests/GameLifecycle.test.ts tests/launchGame.test.ts`

Expected: PASS.

- [x] **Step 7: Commit transition wiring**

```bash
git add src/survival/SurvivalPhase.ts src/app/GamePhase.ts src/Game.ts src/app/launchGame.ts tests/SurvivalPhase.test.ts tests/GameLifecycle.test.ts tests/launchGame.test.ts
git commit -m "feat: stream events under transitions"
```

---

### Task 7: Full verification and obsolete path removal

**Files:**
- Modify: any tests that still construct obsolete global event libraries.
- Delete: obsolete empty event model adapters and startup fallback paths.
- Modify: `docs/superpowers/plans/2026-08-17-event-bundle-streaming.md` to mark completed steps.

**Interfaces:**
- Consumes: the complete bundle lifecycle.
- Produces: a clean build and regression suite without compatibility layers.

- [x] **Step 1: Search for obsolete global ownership**

Run: `rg -n "featuredEventModels|supernaturalEventModels|EMPTY_SURVIVAL_EVENT_MODELS|createEmptyEventModelLibraryForTest|EventModelLibrary\.load\(\)" src tests`

Expected: only focused model-library unit tests can reference direct library loading.

- [x] **Step 2: Remove obsolete paths and update direct test setup**

Delete compatibility aliases, empty model libraries, global disposal fields, and startup loader branches. Test setup must inject an `EventBundleLoader` or manager fake.

- [x] **Step 3: Run type checking**

Run: `tsc --noEmit`

Expected: PASS with no diagnostics.

- [x] **Step 4: Run the full test suite**

Run: `vitest run`

Expected: all test files pass.

- [x] **Step 5: Run the production build**

Run: `vite build`

Expected: PASS. Event presenter modules and event assets appear outside the startup chunk where Vite can split them.

- [x] **Step 6: Review the final diff**

Run: `git diff --check master...HEAD` and `git status --short`.

Expected: no whitespace errors and only the plan completion edit remains uncommitted.

- [x] **Step 7: Commit final cleanup**

```bash
git add src tests docs/superpowers/plans/2026-08-17-event-bundle-streaming.md
git commit -m "test: verify event bundle streaming"
```

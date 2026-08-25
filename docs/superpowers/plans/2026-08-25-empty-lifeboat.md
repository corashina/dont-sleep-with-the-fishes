# Empty Lifeboat Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a day-10 Empty Lifeboat event that uses shared drifting-item focus and always grants one food or one bait.

**Architecture:** Event data stays in the survival catalog. `DriftingItemFlow` owns focus, validation, result order, and camera return. A featured `EmptyLifeboatPresentation` owns wave motion and raft animation without treating the raft as recovered cargo.

**Tech Stack:** TypeScript 5.9, Three.js 0.180, Vitest 3, Vite 7, PowerShell model pipeline.

**Spec:** `docs/superpowers/specs/2026-08-25-empty-lifeboat-design.md`

## Global Constraints

- The event is eligible from day 10.
- Search costs exactly one player energy.
- Search always grants exactly one food or one bait.
- Food and bait have equal 50 percent odds.
- Event weight is 1 and cooldown is three days.
- Reuse the shared drifting-item focus flow.
- Keep barrel and chest retrieval behavior unchanged.
- Use `https://poly.pizza/m/Hgf0R8s4Uo` and a 2,000-triangle limit.
- Add no sound, UI art, lighting, weather, or post-processing.
- Create no per-frame allocations.
- Add no compatibility route or procedural model fallback.
- Add no reduced-motion behavior.

---

### Task 1: Event Rules and Session Outcomes

**Files:**
- Modify: `src/survival/eventCatalog.ts`
- Modify: `src/survival/survivalTypes.ts`
- Modify: `src/survival/eventPresentationRoutes.ts`
- Modify: `src/survival/balanceSimulation.ts`
- Modify: `tests/survivalEvents.test.ts`
- Modify: `tests/SurvivalSession.test.ts`

**Interfaces:**
- Produces: `SurvivalEventId` member `empty-lifeboat`.
- Produces: `EventPresentationKey` members `empty-lifeboat.search` and `empty-lifeboat.drift`.
- Produces: one catalog choice `search` and one catalog choice `sleep`.
- Consumes: existing `event`, `contextualChoice`, `featuredOutcome`, `effects`, `subtract`, and `add` helpers.

- [ ] **Step 1: Write the failing catalog contract test**

Add this test to `tests/survivalEvents.test.ts`:

```ts
it('defines Empty Lifeboat as a guaranteed one-supply search from day ten', () => {
  const lifeboat = event('empty-lifeboat');

  expect(lifeboat).toMatchObject({
    phase: 'day',
    title: 'Empty Lifeboat',
    danger: 'safe',
    cue: 'sighting',
    weight: 1,
    earliestDay: 10,
    cooldownDays: 3,
  });
  expect(lifeboat.choices).toEqual([
    {
      id: 'search',
      label: 'Search It',
      requirements: [{ resource: 'energy', minimum: 1 }],
      outcomes: [
        {
          weight: 1,
          message: 'You find one food in the empty lifeboat.',
          presentationKey: 'empty-lifeboat.search',
          effects: { resources: [subtract('energy', 1), add('food', 1)] },
        },
        {
          weight: 1,
          message: 'You find one bait in the empty lifeboat.',
          presentationKey: 'empty-lifeboat.search',
          effects: { resources: [subtract('energy', 1), add('bait', 1)] },
        },
      ],
    },
    {
      id: 'sleep',
      label: 'Let It Drift',
      outcomes: [{
        weight: 1,
        message: 'The empty lifeboat drifts away.',
        presentationKey: 'empty-lifeboat.drift',
        effects: {},
      }],
    },
  ]);
});
```

Add `empty-lifeboat` to the exact day-event, weight, and risk expectations.

- [ ] **Step 2: Write failing session tests for both rewards and rejection**

Add deterministic sessions in `tests/SurvivalSession.test.ts`:

```ts
it.each([
  [0, { energy: 0, food: 1, bait: 0 }],
  [0.999, { energy: 0, food: 0, bait: 1 }],
] as const)('searches Empty Lifeboat with roll %s', (roll, resources) => {
  const session = new SurvivalSession(saved(), {
    random: sequenceRandom([roll]),
    initialEventId: 'empty-lifeboat',
  });

  expect(session.resolveEvent({ kind: 'choice', choiceId: 'search' })).toMatchObject({
    accepted: true,
    deltas: roll === 0 ? { energy: -1, food: 1 } : { energy: -1, bait: 1 },
    rewardSummary: roll === 0
      ? { kind: 'resource', id: 'food', quantity: 1 }
      : { kind: 'resource', id: 'bait', quantity: 1 },
    eventPresentationKey: 'empty-lifeboat.search',
  });
  expect(session.snapshot()).toMatchObject(resources);
});

it('rejects Empty Lifeboat search without changing resources', () => {
  const session = new SurvivalSession(saved(), {
    seed: 1,
    initialEventId: 'empty-lifeboat',
    initial: { energy: 0 },
  });
  const before = session.snapshot();

  expect(session.resolveEvent({ kind: 'choice', choiceId: 'search' }))
    .toMatchObject({ accepted: false });
  expect(session.snapshot()).toEqual(before);
});
```

- [ ] **Step 3: Run the new tests and verify they fail**

Run:

```powershell
bun run test -- tests/survivalEvents.test.ts tests/SurvivalSession.test.ts
```

Expected: FAIL because `empty-lifeboat` is absent.

- [ ] **Step 4: Add the event ID, keys, route, and exact catalog data**

Add these members:

```ts
// eventCatalog.ts
'drifting-barrel', 'drifting-chest', 'empty-lifeboat', 'check-the-back',

// survivalTypes.ts
| 'empty-lifeboat.search'
| 'empty-lifeboat.drift'

// eventPresentationRoutes.ts
'empty-lifeboat': 'featured',

// balanceSimulation.ts
'empty-lifeboat': ['search', 'sleep'],
```

Add the reveal text and event definition:

```ts
'empty-lifeboat': 'An empty lifeboat drifts close enough to search.',

event('empty-lifeboat', 'day', 'Empty Lifeboat', 'safe', 'sighting', 1, 10, 3, [
  {
    ...contextualChoice('search', 'Search It',
      featuredOutcome(
        'empty-lifeboat.search',
        1,
        'You find one food in the empty lifeboat.',
        effects([subtract('energy', 1), add('food', 1)]),
      ),
      featuredOutcome(
        'empty-lifeboat.search',
        1,
        'You find one bait in the empty lifeboat.',
        effects([subtract('energy', 1), add('bait', 1)]),
      ),
    ),
    requirements: [{ resource: 'energy', minimum: 1 }],
  },
  contextualChoice('sleep', 'Let It Drift',
    featuredOutcome(
      'empty-lifeboat.drift',
      1,
      'The empty lifeboat drifts away.',
    )),
]),
```

Adjust existing weighted day-event test rolls so they still select their named event after the third day event joins the pool.

- [ ] **Step 5: Run the focused rule and session tests**

Run:

```powershell
bun run test -- tests/survivalEvents.test.ts tests/SurvivalSession.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit the rule layer**

```powershell
git add src/survival/eventCatalog.ts src/survival/survivalTypes.ts src/survival/eventPresentationRoutes.ts src/survival/balanceSimulation.ts tests/survivalEvents.test.ts tests/SurvivalSession.test.ts
git commit -m "feat: add empty lifeboat event rules"
```

---

### Task 2: Shared Drifting-Item Search Flow

**Files:**
- Modify: `src/survival/eventCatalog.ts`
- Modify: `src/survival/DriftingItemFlow.ts`
- Modify: `src/survival/SurvivalEventFlow.ts`
- Modify: `tests/DriftingItemFlow.test.ts`
- Modify: `tests/SurvivalPhase.test.ts`

**Interfaces:**
- Produces: `DriftingItemEventId = DriftingCargoEventId | 'empty-lifeboat'`.
- Produces: `DriftingItemWorldPort.searchDriftingItem(eventId): Promise<void>`.
- Consumes: `DriftingItemChoiceResolution.afterAnimation` for the reward view.
- Consumes: `ActionOutcome.rewardSummary` from session resolution.

- [ ] **Step 1: Write the failing shared-flow order test**

Add `searchDriftingItem` to the test world rig:

```ts
searchDriftingItem: vi.fn(async (eventId: string) => {
  calls.push(`search:${eventId}`);
}),
```

Add this test:

```ts
it('uses the shared focus flow for Empty Lifeboat search', async () => {
  const rig = createRig();
  await rig.flow.enter('empty-lifeboat', [
    { id: 'search', label: 'Search It', unavailableReason: null },
    { id: 'sleep', label: 'Let It Drift', unavailableReason: null },
  ]);
  rig.calls.length = 0;

  await rig.flow.choose('search');

  expect(rig.calls).toEqual([
    'confirm',
    'event-resolving',
    'busy',
    'beat:search',
    'resolve:search',
    'hide-focus',
    'search:empty-lifeboat',
    'after-animation',
    'busy',
    'exit',
    'hide-focus',
    'clear-event',
    'render',
    'ready',
    'restore-focus',
  ]);
});
```

- [ ] **Step 2: Write failing integration tests for cost metadata and reward order**

Extend the existing drifting-item focus test in `tests/SurvivalPhase.test.ts` with an Empty Lifeboat rig. Assert:

```ts
expect(contextualChoices).toContainEqual({
  id: 'search',
  label: 'Search It',
  unavailableReason: null,
  anchorId: 'event:empty-lifeboat',
  energyCost: 1,
  energyOwner: 'player',
});
```

In `tests/SurvivalPhase.test.ts`, add a resolved lifeboat search and assert this order:

```ts
expect(calls.indexOf('search:empty-lifeboat')).toBeLessThan(calls.indexOf('show-reward'));
expect(showRewardResult).toHaveBeenCalledExactlyOnceWith({
  title: 'LIFEBOAT SUPPLY',
  reward: { kind: 'resource', id: 'food', quantity: 1 },
  lines: [],
});
expect(world.exitDriftingItemView).toHaveBeenCalledAfter(showRewardResult);
```

- [ ] **Step 3: Run the shared-flow tests and verify they fail**

Run:

```powershell
bun run test -- tests/DriftingItemFlow.test.ts tests/SurvivalPhase.test.ts
```

Expected: FAIL because Empty Lifeboat is not a drifting-item event and `search` is unsupported.

- [ ] **Step 4: Extend drifting-item types without changing cargo types**

Change `eventCatalog.ts` to:

```ts
export type DriftingItemEventId = DriftingCargoEventId | Extract<
  SurvivalEventId,
  'empty-lifeboat'
>;

export function isDriftingItemEventId(
  eventId: string,
): eventId is DriftingItemEventId {
  return isDriftingCargoEventId(eventId) || eventId === 'empty-lifeboat';
}

export function driftingItemLeaveKey(eventId: DriftingItemEventId): EventPresentationKey {
  if (eventId === 'drifting-barrel') return 'drifting-barrel.drift';
  if (eventId === 'drifting-chest') return 'drifting-chest.drift';
  return 'empty-lifeboat.drift';
}
```

Keep `driftingItemRetrieveKey` restricted to `DriftingCargoEventId`. Update its parameter type.

- [ ] **Step 5: Add the explicit search world command**

Update `DriftingItemWorldPort` and flow routing:

```ts
export type DriftingItemWorldPort = Pick<
  BoatWorld,
  | 'enterDriftingItemView'
  | 'exitDriftingItemView'
  | 'retrieveDriftingItem'
  | 'delegateDriftingItem'
  | 'searchDriftingItem'
  | 'recedeDriftingItem'
  | 'projectEventInteractionBounds'
>;

private playChoiceAnimation(
  eventId: DriftingItemEventId,
  choiceId: EventResponseId,
): Promise<void> {
  if (choiceId === 'retrieve') {
    return this.dependencies.world.retrieveDriftingItem?.(eventId) ?? Promise.resolve();
  }
  if (choiceId === 'delegate-carlitos') {
    return this.dependencies.world.delegateDriftingItem?.(eventId) ?? Promise.resolve();
  }
  if (choiceId === 'search') {
    return this.dependencies.world.searchDriftingItem?.(eventId) ?? Promise.resolve();
  }
  return this.dependencies.world.recedeDriftingItem?.(eventId) ?? Promise.resolve();
}

private isSupportedChoice(choiceId: EventResponseId): boolean {
  return choiceId === 'retrieve'
    || choiceId === 'delegate-carlitos'
    || choiceId === 'search'
    || choiceId === 'sleep';
}
```

- [ ] **Step 6: Generalize focus metadata and show the reward**

In `SurvivalEventFlow.contextualChoicesFor`, derive player energy metadata from any drifting-item choice with an energy requirement:

```ts
const playerEnergyCost = isDriftingItemEventId(event.id)
  ? choice.requirements?.find(({ resource }) => resource === 'energy')?.minimum
  : undefined;

// In the returned choice object:
...(playerEnergyCost === undefined ? {} : {
  energyCost: playerEnergyCost,
  energyOwner: 'player' as const,
}),
```

Return `event:empty-lifeboat` from `contextualEventAnchorId` for `search`.

In `resolveDriftingItemChoice`, validate the reward summary and show it after search motion:

```ts
const lifeboatSearch = eventId === 'empty-lifeboat' && choiceId === 'search';
if (lifeboatSearch && outcome.rewardSummary === undefined) {
  this.dependencies.onInvariantError(new Error(
    'Empty Lifeboat search requires a reward summary.',
  ));
}

// Inside afterAnimation:
if (lifeboatSearch && outcome.rewardSummary !== undefined) {
  await (this.dependencies.ui.showRewardResult?.({
    title: 'LIFEBOAT SUPPLY',
    reward: outcome.rewardSummary,
    lines: [],
  }) ?? Promise.resolve());
}
```

Do not add new audio.

- [ ] **Step 7: Run the shared-flow regression tests**

Run:

```powershell
bun run test -- tests/DriftingItemFlow.test.ts tests/SurvivalPhase.test.ts
```

Expected: PASS.

- [ ] **Step 8: Commit the shared flow**

```powershell
git add src/survival/eventCatalog.ts src/survival/DriftingItemFlow.ts src/survival/SurvivalEventFlow.ts tests/DriftingItemFlow.test.ts tests/SurvivalPhase.test.ts
git commit -m "feat: focus empty lifeboat through drifting flow"
```

---

### Task 3: Featured Lifeboat Presentation and World Bridge

**Files:**
- Create: `src/survival/EmptyLifeboatPresentation.ts`
- Modify: `src/survival/FeaturedEventPresentations.ts`
- Modify: `src/survival/BoatWorld.ts`
- Create: `tests/EmptyLifeboatPresentation.test.ts`
- Modify: `tests/EventPresentationRegistry.test.ts`
- Modify: `tests/BoatWorld.test.ts`

**Interfaces:**
- Consumes: `FeaturedEventPresentation`, `DriftingWater`, `applyDriftingWavePose`, and `eventSideFromSeed`.
- Produces: interaction, aim, and result roots through the existing featured presenter interface.
- Produces: `BoatWorld.searchDriftingItem(eventId): Promise<void>`.

- [ ] **Step 1: Write failing presentation tests**

Create `tests/EmptyLifeboatPresentation.test.ts` with a fixed wave source and a model group. Assert:

```ts
const presentation = new EmptyLifeboatPresentation(model, water);
presentation.stage(8);
presentation.update(1.25, 0);

expect(presentation.root.userData.eventSide).toBe('left');
expect(presentation.interactionRoot()).toBe(presentation.itemAimTarget());
expect(presentation.resultRoot()?.userData.motionSource).toBe('shared-wave-field');
expect(water.sampleInto).toHaveBeenCalled();
```

Add animation tests:

```ts
const search = presentation.react('empty-lifeboat.search');
presentation.update(0, 0.63);
expect(Math.abs(modelRoot.position.x)).toBeLessThan(Math.abs(startX));
presentation.update(0, 3);
await search;
expect(presentation.root.visible).toBe(false);

presentation.stage(9);
const drift = presentation.react('empty-lifeboat.drift');
presentation.update(0, 3);
await drift;
expect(presentation.root.visible).toBe(false);
```

- [ ] **Step 2: Write failing registry and world bridge tests**

In `tests/EventPresentationRegistry.test.ts`, assert the featured bundle clones `emptyLifeboat`, stages it, and exposes its interaction root.

In `tests/BoatWorld.test.ts`, assert:

```ts
await world.searchDriftingItem('empty-lifeboat');
expect(featured.react).toHaveBeenCalledWith(
  expect.objectContaining({ presentationKey: 'empty-lifeboat.search' }),
);
```

Also assert a cargo event passed to `searchDriftingItem` does nothing.

- [ ] **Step 3: Run the presentation tests and verify they fail**

Run:

```powershell
bun run test -- tests/EmptyLifeboatPresentation.test.ts tests/EventPresentationRegistry.test.ts tests/BoatWorld.test.ts
```

Expected: FAIL because the presenter and world command do not exist.

- [ ] **Step 4: Implement the featured presenter**

Create a `KeyedEventPresentation` subclass with these fixed values:

```ts
const FLOAT_POSITION = Object.freeze({ x: 4.8, y: 0.06, z: -5.2 });
const SEARCH_APPROACH = 1.7;
const SEARCH_DURATION = 1.8;
const DRIFT_DURATION = 0.9;
const EXIT_OFFSET = Object.freeze({ x: 2.8, y: -0.32, z: 2.2 });
```

Use persistent scratch objects:

```ts
private readonly basePosition = new Vector3();
private readonly animatedPosition = new Vector3();
private readonly baseQuaternion = new Quaternion();
private readonly waveSample: WaveSample = {
  height: 0,
  displacementX: 0,
  displacementZ: 0,
  normal: { x: 0, y: 1, z: 0 },
};
```

Implement keyed motion with no allocations:

```ts
protected applyAnimation(kind: string, progress: number, time: number): void {
  if (kind === 'reveal') {
    const reveal = smoothstep(progress);
    this.animatedPosition.copy(this.basePosition);
    this.animatedPosition.x += this.side * (1 - reveal) * 1.8;
    this.animatedPosition.y -= (1 - reveal) * 0.16;
    this.applyFloatingPose(time, this.animatedPosition);
    return;
  }
  if (kind === 'empty-lifeboat.drift') {
    this.applyExit(time, smoothstep(progress));
    return;
  }
  if (kind === 'empty-lifeboat.search') this.applySearch(time, progress);
}

private applySearch(time: number, progress: number): void {
  if (progress < 0.45) {
    const approach = smoothstep(progress / 0.45);
    this.animatedPosition.copy(this.basePosition);
    this.animatedPosition.x -= this.side * SEARCH_APPROACH * approach;
    this.applyFloatingPose(time, this.animatedPosition);
    return;
  }
  if (progress < 0.62) {
    this.animatedPosition.copy(this.basePosition);
    this.animatedPosition.x -= this.side * SEARCH_APPROACH;
    this.applyFloatingPose(time, this.animatedPosition);
    return;
  }
  this.applyExit(time, smoothstep((progress - 0.62) / 0.38));
}
```

`finishAnimation` must set state to `searched` or `drifted` and hide the root. `clear`, visibility settlement, and disposal must resolve active promises through the base class.

- [ ] **Step 5: Register the presenter and bridge the world command**

In `FeaturedEventPresentations`, construct and register:

```ts
if (include('empty-lifeboat')) {
  if (driftingWater === undefined) {
    throw new Error('Empty Lifeboat requires the world wave source.');
  }
  this.presentations.set('empty-lifeboat', new EmptyLifeboatPresentation(
    models.clone('emptyLifeboat'),
    driftingWater,
  ));
}
```

In `BoatWorld`, add:

```ts
searchDriftingItem(eventId: DriftingItemEventId): Promise<void> {
  if (
    this.disposed
    || eventId !== 'empty-lifeboat'
    || this.activeFeaturedEventId !== eventId
  ) return Promise.resolve();
  this.toolHoverOutline.setTarget(null);
  return this.playFeaturedPresentation('empty-lifeboat.search');
}
```

Update `recedeDriftingItem` through the revised `driftingItemLeaveKey` from Task 2.

- [ ] **Step 6: Run presentation and world tests**

Run:

```powershell
bun run test -- tests/EmptyLifeboatPresentation.test.ts tests/EventPresentationRegistry.test.ts tests/BoatWorld.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit the presentation layer**

```powershell
git add src/survival/EmptyLifeboatPresentation.ts src/survival/FeaturedEventPresentations.ts src/survival/BoatWorld.ts tests/EmptyLifeboatPresentation.test.ts tests/EventPresentationRegistry.test.ts tests/BoatWorld.test.ts
git commit -m "feat: present empty lifeboat search"
```

---

### Task 4: Model Pipeline, Bundle, and Attribution

**Files:**
- Modify: `scripts/poly-pizza-event-models.mjs`
- Modify: `scripts/event-model-lock.json`
- Modify: `scripts/fetch-event-models.ps1`
- Modify: `src/survival/eventModelManifest.ts`
- Modify: `src/survival/eventBundleManifest.ts`
- Create: `src/assets/models/events/emptyLifeboat.glb`
- Modify: `src/assets/models/events/event-model-metadata.json`
- Modify: `src/assets/ATTRIBUTION.md`
- Modify: `tests/EventModelLibrary.test.ts`
- Modify: `tests/EventPresentationRegistry.test.ts`

**Interfaces:**
- Produces: runtime model ID `emptyLifeboat`.
- Produces: event bundle model dependency for `empty-lifeboat`.
- Consumes: the existing Poly Pizza discovery, lock, transform, metadata, and validation pipeline.

- [ ] **Step 1: Write failing model and bundle tests**

Add assertions:

```ts
expect(SURVIVAL_EVENT_MODEL_IDS).toContain('emptyLifeboat');
expect(SURVIVAL_EVENT_MODEL_SPECS.emptyLifeboat).toMatchObject({
  targetLongestDimension: 4.6,
  rotation: [0, 0, 0],
});
expect(eventBundleSpec('empty-lifeboat')).toEqual({
  models: ['emptyLifeboat'],
  sounds: [],
});
```

- [ ] **Step 2: Run model wiring tests and verify they fail**

Run:

```powershell
bun run test -- tests/EventModelLibrary.test.ts tests/EventPresentationRegistry.test.ts
```

Expected: FAIL because `emptyLifeboat` is not registered.

- [ ] **Step 3: Add the pinned model source and runtime wiring**

Add to `POLY_PIZZA_EVENT_MODEL_PAGES` and limits:

```js
emptyLifeboat: 'https://poly.pizza/m/Hgf0R8s4Uo',

emptyLifeboat: 2_000,
```

Raise `EVENT_MODEL_TOTAL_TRIANGLE_LIMIT` from `20_000` to `22_000`.

Add committed output hash routing:

```js
: id === 'emptyLifeboat'
  ? '99FA2EDD3431AC0D9D3AB975F0AB3170AE0549D0F0B31D34FCC47D3622F870ED'
```

Add `emptyLifeboat` to `$modelIds` in `fetch-event-models.ps1`.

Add runtime model data:

```ts
emptyLifeboat: Object.freeze({
  url: new URL('../assets/models/events/emptyLifeboat.glb', import.meta.url).href,
  targetLongestDimension: 4.6,
  rotation: NO_ROTATION,
  maxTriangles: generatedMetadataJson.emptyLifeboat.triangles,
}),
```

Add the bundle:

```ts
'empty-lifeboat': {
  models: ['emptyLifeboat'],
  sounds: [],
},
```

- [ ] **Step 4: Refresh the lock and publish the model**

Run:

```powershell
node scripts/poly-pizza-event-models.mjs --write-lock
powershell -ExecutionPolicy Bypass -File scripts/fetch-event-models.ps1
```

Expected lock data for the supplied model:

```text
resourceId: 9c276a46-9174-48ee-9624-3944d5b0d3ef
source asset: poly-pizza:9c276a46-9174-48ee-9624-3944d5b0d3ef
title: Raft
author: Quaternius
license: CC0 1.0
source SHA-256: 722C09E839EDB2A300208CCCB324A11F4D93F8946F7270E2DAED54DF306CC77D
processed SHA-256: 99FA2EDD3431AC0D9D3AB975F0AB3170AE0549D0F0B31D34FCC47D3622F870ED
triangles: 1036
```

Stop if discovery returns different ownership, license, or hashes. Do not accept an unreviewed asset change.

- [ ] **Step 5: Add attribution**

Add one event-model ledger row to `src/assets/ATTRIBUTION.md` with the exact title, author, CC0 license link, Poly Pizza page, source hash, output hash, and 1,036 triangle count.

- [ ] **Step 6: Run model and bundle verification**

Run:

```powershell
node scripts/check-event-models.mjs
bun run test -- tests/EventModelLibrary.test.ts tests/EventPresentationRegistry.test.ts
```

Expected: model check reports `emptyLifeboat.glb: 1036 / 2000 triangles`; tests PASS.

- [ ] **Step 7: Commit the asset layer**

```powershell
git add scripts/poly-pizza-event-models.mjs scripts/event-model-lock.json scripts/fetch-event-models.ps1 src/survival/eventModelManifest.ts src/survival/eventBundleManifest.ts src/assets/models/events/emptyLifeboat.glb src/assets/models/events/event-model-metadata.json src/assets/ATTRIBUTION.md tests/EventModelLibrary.test.ts tests/EventPresentationRegistry.test.ts
git commit -m "feat: add empty lifeboat model bundle"
```

---

### Task 5: Documentation and Full Verification

**Files:**
- Modify: `README.md`
- Review: every file changed by Tasks 1 through 4.

**Interfaces:**
- Consumes: completed rule, shared-flow, presentation, and asset layers.
- Produces: documented player behavior and release evidence.

- [ ] **Step 1: Document the player-facing event**

Add this concise README entry in the survival events section:

```markdown
- **Empty Lifeboat:** From day 10, spend one energy to search a drifting raft. Every search grants one food or one bait.
```

- [ ] **Step 2: Run the focused regression suite**

Run:

```powershell
bun run test -- tests/survivalEvents.test.ts tests/SurvivalSession.test.ts tests/DriftingItemFlow.test.ts tests/SurvivalPhase.test.ts tests/EmptyLifeboatPresentation.test.ts tests/EventPresentationRegistry.test.ts tests/EventModelLibrary.test.ts tests/BoatWorld.test.ts
```

Expected: PASS.

- [ ] **Step 3: Run static and asset verification**

Run:

```powershell
bun run typecheck
bun run build
node scripts/check-event-models.mjs
git diff --check
```

Expected: every command exits zero. The build lists `emptyLifeboat` as a bundled GLB asset.

- [ ] **Step 4: Run the full test suite**

Run:

```powershell
bun run test
```

Expected: all tests pass. If unrelated baseline tests fail, rerun them on the plan worktree's base commit and record the comparison.

- [ ] **Step 5: Inspect the event in the game**

Start the local game and use System Tuning → Event Test → Empty Lifeboat.

Verify:

```text
Reveal: raft stays in the midground and follows waves.
Focus: selecting the raft opens shared drifting-item choices.
Cost: Search It displays one player energy.
Search: raft approaches, result shows exactly one supply, then raft leaves.
Leave: raft leaves without a reward.
Return: camera and command focus restore.
Logs: no new browser errors.
```

- [ ] **Step 6: Review requirements against the specification**

Confirm each Global Constraint and each specification test bullet has code or fresh evidence. Remove any obsolete generic Empty Lifeboat route found during review.

- [ ] **Step 7: Commit documentation and final adjustments**

```powershell
git add README.md
git commit -m "docs: describe empty lifeboat event"
```

- [ ] **Step 8: Invoke branch completion**

Use `superpowers:finishing-a-development-branch`. Present its integration choices after fresh verification.

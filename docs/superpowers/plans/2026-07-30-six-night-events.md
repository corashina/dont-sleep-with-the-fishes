# Six Night Events Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add clear physical presentation for Leak, School of Fish, Snatcher, Death Stare, Swarm of Anglerfish, and Whirlpool.

**Architecture:** A dedicated coordinator routes these six events to focused presentation classes. Pure choreography samplers drive fixed Three.js pools, while a shared vortex state drives both CPU buoyancy sampling and the ocean shader.

**Tech Stack:** TypeScript 5.9, Three.js 0.180, Vite 7, Vitest 3, PowerShell asset tools, glTF Transform 4.

## Global Constraints

- Preserve all existing worktree changes.
- Stage only files named by each task.
- Use `apply_patch` for manual file edits.
- Keep gameplay rules deterministic without a renderer.
- Keep randomness behind the current injectable source.
- Keep rules, phase flow, input, UI, rendering, and world construction separate.
- Give every Three.js resource one owner that disposes it once.
- Use the shared wave field for ocean rendering, buoyancy, and vessel motion.
- Create no objects or setup work in per-frame paths.
- Do not add reduced-motion behavior.
- Do not add new audio files.
- Do not download assets during play.
- Keep School at 24 fish or fewer.
- Keep Swarm at 18 fish or fewer.
- Follow `docs/VISUAL_STYLE_GUIDE.md`.
- Follow `docs/superpowers/specs/2026-07-30-six-night-events-design.md`.

---

## File map

### Asset pipeline

- `scripts/poly-pizza-event-models.mjs`: Pins, processes, and reports the five selected Poly Pizza sources.
- `scripts/event-model-lock.json`: Pins source asset IDs, licenses, and SHA-256 values.
- `scripts/fetch-event-models.ps1`: Downloads, validates, stages, and publishes event GLBs.
- `scripts/check-event-models.mjs`: Checks filenames, hashes, bounds, triangle limits, and attribution.
- `src/assets/models/events/`: Stores five processed GLBs and generated metadata.
- `src/assets/ATTRIBUTION.md`: Records exact sources and licenses.
- `src/survival/eventModelManifest.ts`: Defines bundled URLs, normalization, and budgets.
- `src/survival/EventModelLibrary.ts`: Loads, validates, clones, and disposes event templates.

### Shared state and routing

- `src/survival/eventPresentationTypes.ts`: Defines event context, result changes, and the presentation interface.
- `src/survival/eventPresentationOutcome.ts`: Derives exact changed instance IDs from snapshots.
- `src/survival/EventPresentationCoordinator.ts`: Routes six event IDs and owns two scene roots.
- `src/ocean/WaveField.ts`: Adds deterministic vortex sampling.
- `src/ocean/OceanRenderer.ts`: Applies the same vortex state in the vertex shader.
- `src/survival/BoatSupplyDisplay.ts`: Exposes borrowed item actors and additive event poses.

### Event modules

- `src/survival/events/leakChoreography.ts`
- `src/survival/events/LeakPresentation.ts`
- `src/survival/events/schoolOfFishChoreography.ts`
- `src/survival/events/SchoolOfFishPresentation.ts`
- `src/survival/events/snatcherChoreography.ts`
- `src/survival/events/SnatcherPresentation.ts`
- `src/survival/events/deathStareChoreography.ts`
- `src/survival/events/DeathStarePresentation.ts`
- `src/survival/events/anglerfishSwarmChoreography.ts`
- `src/survival/events/AnglerfishSwarmPresentation.ts`
- `src/survival/events/whirlpoolChoreography.ts`
- `src/survival/events/WhirlpoolPresentation.ts`

### Integration

- `src/app/GamePhase.ts`: Adds preloaded event models to phase context.
- `src/app/launchGame.ts`: Preloads event models and reports model failures.
- `src/Game.ts`: Passes event models through game construction.
- `src/survival/BoatWorld.ts`: Attaches coordinator roots and routes event calls.
- `src/survival/SurvivalPhase.ts`: Builds contexts and exact result changes.
- `src/survival/survivalTypes.ts`: Owns the target snapshot field.
- `src/survival/SurvivalSession.ts`: Removes the local snapshot augmentation.
- `src/survival/events.ts`: Adds missing eligibility limits.
- `src/ui/SurvivalUI.ts`: Shows exact event result lines.
- `src/styles/main.css`: Styles concise result lines without covering the scene.
- `src/audio/SurvivalAudio.ts`: Reuses current event action cues.

---

### Task 1: Align event rules and result data

**Files:**
- Modify: `src/survival/events.ts`
- Modify: `src/survival/survivalTypes.ts`
- Modify: `src/survival/SurvivalSession.ts`
- Create: `src/survival/eventPresentationTypes.ts`
- Create: `src/survival/eventPresentationOutcome.ts`
- Modify: `tests/survivalEvents.test.ts`
- Modify: `tests/SurvivalSession.test.ts`
- Create: `tests/eventPresentationOutcome.test.ts`

**Interfaces:**
- Produces: `EventSceneContext`
- Produces: `EventOutcomePresentation`
- Produces: `deriveEventVariantSeed(seed, day, eventId)`
- Produces: `deriveEventOutcomePresentation(before, after, outcome, selectedInstanceId)`
- Consumes: `SurvivalSnapshot`, `ActionOutcome`, `ItemInstanceId`, `ItemCondition`

- [ ] **Step 1: Write failing rule tests**

Add exact assertions:

```ts
const leak = survivalEventById('leak')!;
const school = survivalEventById('school-of-fish')!;
const death = survivalEventById('death-stare')!;
const swarm = survivalEventById('swarm-of-anglerfish')!;
const whirlpool = survivalEventById('whirlpool')!;

expect(leak.maximumAppearances).toBe(1);
expect(school.minimumPressure).toBe(1);
expect(death.minimumPressure).toBe(1);
expect(swarm.minimumPressure).toBe(1);
expect(whirlpool.minimumPressure).toBe(1);
```

- [ ] **Step 2: Run rule tests and confirm failure**

Run:

```powershell
bunx vitest run tests/survivalEvents.test.ts
```

Expected: failure on the five missing constraints.

- [ ] **Step 3: Add the exact catalog constraints**

Use the existing `event` helper eligibility argument.

```ts
event('leak', 'Leak', 'impact', 10, 4, 0, choices, undefined, {
  maximumAppearances: 1,
});

event('school-of-fish', 'School of Fish', 'fish', 66, 8, 39, choices, undefined, {
  minimumPressure: 1,
});
```

Apply the same `minimumPressure: 1` shape to Death Stare, Swarm, and Whirlpool.

- [ ] **Step 4: Move the target field into the main snapshot type**

Add this field to `SurvivalSnapshot`:

```ts
readonly pendingEventTargetId: ItemInstanceId | null;
```

Remove this block from `SurvivalSession.ts`:

```ts
declare module './survivalTypes' {
  interface SurvivalSnapshot {
    readonly pendingEventTargetId?: ItemInstanceId | null;
  }
}
```

Keep `snapshot()` returning `pendingEventTargetId`.

- [ ] **Step 5: Write failing outcome-diff tests**

Test sorted, exact changes:

```ts
const result = deriveEventOutcomePresentation(
  before,
  after,
  {
    accepted: true,
    code: 'event-resolved',
    message: 'The leak takes two items.',
    deltas: { hull: -18 },
    cue: 'impact',
  },
  'bucket-1',
);

expect(result.resourceDeltas).toEqual({ hull: -18 });
expect(result.brokenInstanceIds).toEqual(['bucket-1']);
expect(result.lostInstanceIds).toEqual(['map-1']);
expect(result.consumedInstanceIds).toEqual(['ductTape-1']);
expect(result.selectedInstanceId).toBe('bucket-1');
expect(result.selectedCondition).toBe('broken');
```

- [ ] **Step 6: Run the diff test and confirm failure**

Run:

```powershell
bunx vitest run tests/eventPresentationOutcome.test.ts
```

Expected: module import failure.

- [ ] **Step 7: Add presentation types and pure diff logic**

Define:

```ts
export const DEDICATED_EVENT_IDS = [
  'leak',
  'school-of-fish',
  'snatcher',
  'death-stare',
  'swarm-of-anglerfish',
  'whirlpool',
] as const;

export type DedicatedEventId = typeof DEDICATED_EVENT_IDS[number];

export interface EventSceneContext {
  readonly eventId: DedicatedEventId;
  readonly targetInstanceId: ItemInstanceId | null;
  readonly variantSeed: number;
}

export interface EventOutcomePresentation {
  readonly outcome: ActionOutcome;
  readonly resourceDeltas: Readonly<ResourceDelta>;
  readonly brokenInstanceIds: readonly ItemInstanceId[];
  readonly lostInstanceIds: readonly ItemInstanceId[];
  readonly consumedInstanceIds: readonly ItemInstanceId[];
  readonly selectedInstanceId: ItemInstanceId | null;
  readonly selectedCondition: ItemCondition | null;
  readonly targetInstanceId: ItemInstanceId | null;
}
```

Add a pure `deriveEventVariantSeed` helper.
Mix the session seed, day, and event ID into one unsigned 32-bit value.
Use this value only when `stage` creates stable event variants.

`deriveEventOutcomePresentation` compares matching IDs before and after.
Sort every returned ID with `localeCompare`.

- [ ] **Step 8: Run focused tests**

Run:

```powershell
bunx vitest run tests/survivalEvents.test.ts tests/SurvivalSession.test.ts tests/eventPresentationOutcome.test.ts
```

Expected: all pass.

- [ ] **Step 9: Commit the task**

```powershell
git add src/survival/events.ts src/survival/survivalTypes.ts src/survival/SurvivalSession.ts src/survival/eventPresentationTypes.ts src/survival/eventPresentationOutcome.ts tests/survivalEvents.test.ts tests/SurvivalSession.test.ts tests/eventPresentationOutcome.test.ts
git commit -m "feat: align six night event rules"
```

---

### Task 2: Add the event model pipeline and library

**Files:**
- Create: `scripts/poly-pizza-event-models.mjs`
- Create: `scripts/event-model-lock.json`
- Create: `scripts/fetch-event-models.ps1`
- Create: `scripts/check-event-models.mjs`
- Modify: `package.json`
- Create: `src/assets/models/events/event-model-metadata.json`
- Create: `src/assets/models/events/leakPlanks.glb`
- Create: `src/assets/models/events/schoolFish.glb`
- Create: `src/assets/models/events/snatcher.glb`
- Create: `src/assets/models/events/anglerFish.glb`
- Create: `src/assets/models/events/whirlpoolCore.glb`
- Modify: `src/assets/ATTRIBUTION.md`
- Create: `src/survival/eventModelManifest.ts`
- Create: `src/survival/EventModelLibrary.ts`
- Create: `tests/EventModelLibrary.test.ts`

**Interfaces:**
- Produces: `EventModelId`
- Produces: `EVENT_MODEL_SPECS`
- Produces: `EventModelLibrary.load(loader?)`
- Produces: `EventModelLibrary.create(id): EventModelInstance`
- Produces: `EventModelLoadError`

- [ ] **Step 1: Write failing library tests**

Test exact IDs, normalized clones, validation, rollback, and disposal:

```ts
expect(EVENT_MODEL_IDS).toEqual([
  'leakPlanks',
  'schoolFish',
  'snatcher',
  'anglerFish',
  'whirlpoolCore',
]);

const library = await EventModelLibrary.load(loader);
const first = library.create('anglerFish');
const second = library.create('anglerFish');
expect(first.root).not.toBe(second.root);
expect(first.root.children[0]).not.toBe(second.root.children[0]);
first.dispose();
second.dispose();
library.dispose();
expect(disposeSpies.every((spy) => spy.mock.calls.length === 1)).toBe(true);
```

- [ ] **Step 2: Run the library test and confirm failure**

Run:

```powershell
bunx vitest run tests/EventModelLibrary.test.ts
```

Expected: module import failure.

- [ ] **Step 3: Add the five pinned source pages**

Define this immutable source map in `poly-pizza-event-models.mjs`:

```js
export const POLY_PIZZA_EVENT_MODEL_PAGES = Object.freeze({
  leakPlanks: 'https://poly.pizza/m/hwQ1Fx5P8U',
  schoolFish: 'https://poly.pizza/m/HkUAXudvBt',
  snatcher: 'https://poly.pizza/m/4LjT020LQh',
  anglerFish: 'https://poly.pizza/m/85n5_RiSeSf',
  whirlpoolCore: 'https://poly.pizza/m/2TBzV_5N0ci',
});
```

Add `--discover` to resolve each page’s current static GLB.
Add `--write-lock` to update `scripts/event-model-lock.json`.
Store each source asset ID, model name, author, license, and SHA-256 value.
Normal processing must reject any changed source hash.

- [ ] **Step 4: Add guarded download and publication**

Mirror `fetch-fishing-models.ps1`.

Publish only these exact files:

```powershell
$modelIds = @(
  'leakPlanks'
  'schoolFish'
  'snatcher'
  'anglerFish'
  'whirlpoolCore'
)
```

Use a unique stage, backup, and temporary directory.
Validate resolved paths before recursive cleanup.

- [ ] **Step 5: Add model processing**

For every GLB:

- Prune unused data.
- Deduplicate accessors and materials.
- Unpartition meshes.
- Weld safe static meshes.
- Keep skin and animation data only when the source uses them.
- Embed all resources.
- Generate `event-model-metadata.json`.

Use maximum triangle limits:

```js
export const EVENT_MODEL_TRIANGLE_LIMITS = Object.freeze({
  leakPlanks: 2_000,
  schoolFish: 2_000,
  snatcher: 4_000,
  anglerFish: 4_000,
  whirlpoolCore: 3_000,
});
```

Use a 12,000 aggregate limit.

- [ ] **Step 6: Fetch and validate the assets**

Run:

```powershell
bun run models:fetch:events
bun run models:check:events
```

Expected: five GLBs pass bounds, triangles, filenames, metadata, and hashes.

- [ ] **Step 7: Add attribution rows**

Record the exact model name, author, page URL, source asset ID, license,
source hash, source triangles, output triangles, processing notes, and date.

Read each exact license from its selected Poly Pizza page.
Reject a source when its license differs from the lock file.
Keep required attribution for every Creative Commons Attribution source.

- [ ] **Step 8: Add the runtime manifest**

Define:

```ts
export const EVENT_MODEL_IDS = [
  'leakPlanks',
  'schoolFish',
  'snatcher',
  'anglerFish',
  'whirlpoolCore',
] as const;

export type EventModelId = typeof EVENT_MODEL_IDS[number];
```

Use these target longest dimensions:

```ts
const presentation = {
  leakPlanks: { targetLongestDimension: 1.7, rotation: [0, 0, 0], offset: [0, 0, 0] },
  schoolFish: { targetLongestDimension: 0.62, rotation: [0, Math.PI / 2, 0], offset: [0, 0, 0] },
  snatcher: { targetLongestDimension: 1.25, rotation: [0, 0, 0], offset: [0, 0.5, 0] },
  anglerFish: { targetLongestDimension: 1.0, rotation: [0, Math.PI / 2, 0], offset: [0, 0, 0] },
  whirlpoolCore: { targetLongestDimension: 7.0, rotation: [Math.PI / 2, 0, 0], offset: [0, -0.45, 0] },
} as const;
```

- [ ] **Step 9: Implement the model library**

Follow `PropModelLibrary` validation and rollback rules.

Define an owned clone:

```ts
export interface EventModelInstance {
  readonly root: Group;
  dispose(): void;
}

create(id: EventModelId): EventModelInstance {
  const template = this.templates.get(id);
  if (!template) throw new Error(`Missing event model template: ${id}`);
  return cloneOwnedEventTemplate(template);
}
```

Deep-clone geometry and materials for each instance.
The presentation owns each returned instance and disposes it once.
`EventModelLibrary` owns only source templates and disposes them once.

- [ ] **Step 10: Run focused checks**

Run:

```powershell
bun run models:check:events
bunx vitest run tests/EventModelLibrary.test.ts
bun run typecheck
```

Expected: all pass.

- [ ] **Step 11: Commit the task**

```powershell
git add scripts/poly-pizza-event-models.mjs scripts/event-model-lock.json scripts/fetch-event-models.ps1 scripts/check-event-models.mjs package.json src/assets/models/events src/assets/ATTRIBUTION.md src/survival/eventModelManifest.ts src/survival/EventModelLibrary.ts tests/EventModelLibrary.test.ts
git commit -m "feat: add six event model assets"
```

---

### Task 3: Add the shared vortex wave disturbance

**Files:**
- Modify: `src/ocean/WaveField.ts`
- Modify: `src/ocean/OceanRenderer.ts`
- Modify: `src/survival/BoatWorld.ts`
- Modify: `tests/WaveField.test.ts`
- Modify: `tests/OceanRenderer.test.ts`
- Modify: `tests/BoatBuoyancy.test.ts`

**Interfaces:**
- Produces: `VortexWaveState`
- Produces: `createInactiveVortexWaveState()`
- Extends: `sampleWaveFieldInto(..., amplitudeScale, vortex?)`
- Produces: `OceanRenderer.setVortex(state)`

- [ ] **Step 1: Write failing CPU wave tests**

Add:

```ts
const inactive = createInactiveVortexWaveState();
const active = {
  centerX: 0,
  centerZ: -7,
  radius: 8,
  depression: 1.1,
  tangentStrength: 0.8,
  phase: 0.4,
  strength: 1,
};

sampleWaveFieldInto(base, DEFAULT_WAVES, 2, 1, -6, 1, inactive);
sampleWaveFieldInto(disturbed, DEFAULT_WAVES, 2, 1, -6, 1, active);
expect(disturbed).not.toEqual(base);
expect(Object.values(disturbed.normal).every(Number.isFinite)).toBe(true);
```

- [ ] **Step 2: Run wave tests and confirm failure**

Run:

```powershell
bunx vitest run tests/WaveField.test.ts tests/BoatBuoyancy.test.ts
```

Expected: missing vortex exports or unchanged samples.

- [ ] **Step 3: Implement allocation-free CPU disturbance math**

Add:

```ts
export interface VortexWaveState {
  centerX: number;
  centerZ: number;
  radius: number;
  depression: number;
  tangentStrength: number;
  phase: number;
  strength: number;
}
```

After Gerstner sampling:

```ts
const dx = x - vortex.centerX;
const dz = z - vortex.centerZ;
const distance = Math.hypot(dx, dz);
const envelopeT = Math.min(1, Math.max(0, 1 - distance / Math.max(0.001, vortex.radius)));
const envelope = envelopeT * envelopeT * (3 - 2 * envelopeT) * vortex.strength;
const inverseDistance = distance > 0.0001 ? 1 / distance : 0;
const radialX = dx * inverseDistance;
const radialZ = dz * inverseDistance;
const swirl = 0.78 + 0.22 * Math.sin(vortex.phase + distance * 0.65);
height -= vortex.depression * envelope;
displacementX += -radialZ * vortex.tangentStrength * envelope * swirl;
displacementZ += radialX * vortex.tangentStrength * envelope * swirl;
```

Include the depression derivative in the output normal.

- [ ] **Step 4: Write failing ocean uniform tests**

Assert:

```ts
renderer.setVortex(active);
expect(renderer.vortexStateForTest()).toEqual(active);
renderer.setVortex(inactive);
expect(renderer.vortexStateForTest()!.strength).toBe(0);
```

- [ ] **Step 5: Add matching shader uniforms and deformation**

Add uniforms for center, radius, depression, tangent strength, phase, and
strength.

Use the same envelope and displacement equations in the vertex shader.

`OceanRenderer.setVortex` copies finite values into uniforms.
It does not retain the caller’s object.

- [ ] **Step 6: Route one mutable state through BoatWorld**

Add:

```ts
private readonly vortexWave = createInactiveVortexWaveState();
```

Pass it to:

- Boat buoyancy sampling.
- Fishing wave sampling.
- Dedicated event world sampling.
- `OceanRenderer.setVortex`.

- [ ] **Step 7: Run focused tests**

Run:

```powershell
bunx vitest run tests/WaveField.test.ts tests/OceanRenderer.test.ts tests/BoatBuoyancy.test.ts
bun run typecheck
```

Expected: all pass.

- [ ] **Step 8: Commit the task**

```powershell
git add src/ocean/WaveField.ts src/ocean/OceanRenderer.ts src/survival/BoatWorld.ts tests/WaveField.test.ts tests/OceanRenderer.test.ts tests/BoatBuoyancy.test.ts
git commit -m "feat: add shared vortex wave field"
```

---

### Task 4: Add the presentation coordinator and borrowed-item API

**Files:**
- Create: `src/survival/EventPresentationCoordinator.ts`
- Modify: `src/survival/eventPresentationTypes.ts`
- Modify: `src/survival/BoatSupplyDisplay.ts`
- Create: `tests/EventPresentationCoordinator.test.ts`
- Modify: `tests/BoatWorld.test.ts`

**Interfaces:**
- Produces: `DedicatedEventPresentation`
- Produces: `EventPresentationCoordinator`
- Produces: `BoatSupplyDisplay.borrowEventActor(instanceId)`
- Produces: `BoatSupplyDisplay.applyEventItemPose(instanceId, pose)`

- [ ] **Step 1: Write failing coordinator tests**

Use fake presentations:

```ts
expect(coordinator.handles('leak')).toBe(true);
expect(coordinator.handles('shower-night')).toBe(false);

coordinator.stage({
  eventId: 'snatcher',
  targetInstanceId: 'map-1',
  variantSeed: 42,
});
expect(snatcher.stage).toHaveBeenCalledOnce();
expect(leak.clear).toHaveBeenCalledOnce();
```

Test `clear`, hidden settling, update routing, and one-time disposal.

- [ ] **Step 2: Run coordinator tests and confirm failure**

Run:

```powershell
bunx vitest run tests/EventPresentationCoordinator.test.ts
```

Expected: module import failure.

- [ ] **Step 3: Define the presentation contract**

Add:

```ts
export interface DedicatedEventPresentation {
  readonly eventId: DedicatedEventId;
  readonly worldRoot: Group;
  readonly boatRoot: Group;
  stage(context: EventSceneContext): void;
  reveal(): Promise<void>;
  playItemUse(choiceId: string, instanceId: ItemInstanceId): Promise<boolean>;
  react(result: EventOutcomePresentation): Promise<void>;
  update(time: number, delta: number): void;
  settleForVisibilityChange(): void;
  clear(): void;
  dispose(): void;
}
```

- [ ] **Step 4: Implement exact coordinator routing**

Store presentations in a `Map<DedicatedEventId, DedicatedEventPresentation>`.

`stage` clears the prior presentation, sets the active presentation, and
stages only that module.

Unknown IDs return `false` without changing the active route.

- [ ] **Step 5: Add a safe borrowed-item API**

Return a stable actor handle:

```ts
export interface BorrowedSupplyActor {
  readonly instanceId: ItemInstanceId;
  readonly root: Group;
  applyPose(pose: SupplyAdditivePose): void;
  releaseOnNextSync(): void;
  release(): void;
}
```

The handle delegates to the existing pin, pose, and release logic.
It never owns the supply geometry or material.

- [ ] **Step 6: Run focused tests**

Run:

```powershell
bunx vitest run tests/EventPresentationCoordinator.test.ts tests/BoatWorld.test.ts
bun run typecheck
```

Expected: all pass.

- [ ] **Step 7: Commit the task**

```powershell
git add src/survival/EventPresentationCoordinator.ts src/survival/eventPresentationTypes.ts src/survival/BoatSupplyDisplay.ts tests/EventPresentationCoordinator.test.ts tests/BoatWorld.test.ts
git commit -m "feat: add dedicated event presentation routing"
```

---

### Task 5: Implement Leak presentation

**Files:**
- Create: `src/survival/events/leakChoreography.ts`
- Create: `src/survival/events/LeakPresentation.ts`
- Create: `tests/leakChoreography.test.ts`
- Create: `tests/LeakPresentation.test.ts`

**Interfaces:**
- Consumes: `EventModelLibrary.create('leakPlanks')`
- Consumes: `BoatSupplyDisplay.borrowEventActor`
- Produces: `sampleLeakReveal`, `sampleLeakItemUse`, `sampleLeakReaction`
- Produces: `LeakPresentation`

- [ ] **Step 1: Write failing pure choreography tests**

Test identity, visible middle motion, held reveal, and distinct choices:

```ts
expect(sampleLeakReveal(0, sample)).toBe(true);
expect(sample).toEqual(identityLeakSample());

sampleLeakReveal(0.56, sample);
expect(sample.jetStrength).toBeGreaterThan(0.6);
expect(sample.cameraPush).toBeGreaterThan(0.08);

sampleLeakItemUse('ductTape', 0.7, sample);
expect(sample.effectKind).toBe('press-patch');

sampleLeakItemUse('bucket', 0.7, sample);
expect(sample.effectKind).toBe('bail-water');
```

- [ ] **Step 2: Run the sampler test and confirm failure**

Run:

```powershell
bunx vitest run tests/leakChoreography.test.ts
```

Expected: module import failure.

- [ ] **Step 3: Implement the pure Leak samplers**

Use:

- Reveal duration: 2.4 seconds.
- Item duration: 1.1 seconds.
- Reaction duration: 1.0 seconds.

Return exact identity at progress zero.
Return borrowed item pose to identity at progress one.
Keep reaction output in its final held state.

- [ ] **Step 4: Write failing presentation tests**

Assert fixed pool sizes and lifecycle:

```ts
expect(root.getObjectByName('leak-water-jet')).toBeDefined();
expect(root.getObjectByName('leak-interior-water')).toBeDefined();
expect(root.children.filter(({ name }) => name.startsWith('leak-drip-'))).toHaveLength(8);
presentation.clear();
expect(jetMaterial.opacity).toBe(0);
expect(interiorWater.visible).toBe(false);
```

- [ ] **Step 5: Build the Leak scene**

Attach the planks, seam, jet, eight drips, six splashes, and interior water to
`boatRoot`.

Use flat-shaded wood and translucent cyan water.
Add a local wet band around the seam.

Map outcomes by exact changed IDs:

- Safe: jet becomes drips.
- Broken selected item: actor buckles and holds.
- Hull damage: one surge and boat-root kick.
- Lost item: borrowed actor slides over starboard.

- [ ] **Step 6: Run Leak tests**

Run:

```powershell
bunx vitest run tests/leakChoreography.test.ts tests/LeakPresentation.test.ts
```

Expected: all pass.

- [ ] **Step 7: Commit the task**

```powershell
git add src/survival/events/leakChoreography.ts src/survival/events/LeakPresentation.ts tests/leakChoreography.test.ts tests/LeakPresentation.test.ts
git commit -m "feat: stage the leak event"
```

---

### Task 6: Implement School of Fish presentation

**Files:**
- Create: `src/survival/events/schoolOfFishChoreography.ts`
- Create: `src/survival/events/SchoolOfFishPresentation.ts`
- Create: `tests/schoolOfFishChoreography.test.ts`
- Create: `tests/SchoolOfFishPresentation.test.ts`

**Interfaces:**
- Consumes: `EventModelLibrary.create('schoolFish')`
- Consumes: shared wave sample provider
- Produces: `sampleSchoolReveal`, `sampleSchoolItemUse`, `sampleSchoolReaction`
- Produces: `SchoolOfFishPresentation`

- [ ] **Step 1: Write failing sampler tests**

Test stable variants:

```ts
const first = createSchoolVariants(24, 19);
const second = createSchoolVariants(24, 19);
expect(first).toEqual(second);
expect(first).toHaveLength(24);
expect(first.every(({ scale }) => scale >= 0.72 && scale <= 1.18)).toBe(true);
```

Test Net sweep, Bucket dip, Telescope track, catch, and scatter.

- [ ] **Step 2: Run the sampler tests and confirm failure**

Run:

```powershell
bunx vitest run tests/schoolOfFishChoreography.test.ts
```

Expected: module import failure.

- [ ] **Step 3: Implement deterministic schooling samplers**

Use `variantSeed` only during `stage`.

Use:

- Reveal duration: 2.6 seconds.
- Item duration: 1.25 seconds.
- Reaction duration: 1.1 seconds.

Gather fish from scattered positions into one elliptical orbit.
Scatter them outward during the result.

- [ ] **Step 4: Write failing presentation tests**

Assert:

```ts
expect(fishRoots).toHaveLength(24);
presentation.stage(context);
presentation.update(3, 1 / 60);
expect(sampleWaveInto).toHaveBeenCalledTimes(24);
presentation.update(3.016, 1 / 60);
expect(createdObjectCount).toBe(0);
```

- [ ] **Step 5: Build the School scene**

Create 24 fish during construction.
Use 18 to 24 according to stable variants.

Add:

- Silver highlight materials.
- One fixed catch actor.
- Eight fixed surface-flash meshes.
- Six fixed splash meshes.

Sample the shared wave field into reusable records.

Show the exact `food` delta through the result data.

- [ ] **Step 6: Run School tests**

Run:

```powershell
bunx vitest run tests/schoolOfFishChoreography.test.ts tests/SchoolOfFishPresentation.test.ts
```

Expected: all pass.

- [ ] **Step 7: Commit the task**

```powershell
git add src/survival/events/schoolOfFishChoreography.ts src/survival/events/SchoolOfFishPresentation.ts tests/schoolOfFishChoreography.test.ts tests/SchoolOfFishPresentation.test.ts
git commit -m "feat: stage the school of fish event"
```

---

### Task 7: Implement Snatcher presentation

**Files:**
- Create: `src/survival/events/snatcherChoreography.ts`
- Create: `src/survival/events/SnatcherPresentation.ts`
- Create: `tests/snatcherChoreography.test.ts`
- Create: `tests/SnatcherPresentation.test.ts`

**Interfaces:**
- Consumes: `EventModelLibrary.create('snatcher')`
- Consumes: `EventSceneContext.targetInstanceId`
- Consumes: `BoatSupplyDisplay.borrowEventActor`
- Produces: `SnatcherPresentation`

- [ ] **Step 1: Write failing sampler tests**

Test reveal beats:

```ts
sampleSnatcherReveal(0.2, sample);
expect(sample.fingerVisibility).toBeGreaterThan(0);
expect(sample.headVisibility).toBe(0);

sampleSnatcherReveal(0.58, sample);
expect(sample.headVisibility).toBeGreaterThan(0.8);
expect(sample.pointStrength).toBeGreaterThan(0.5);
```

Test Telescope club, Ring throw, late Net, Harpoon recoil, target theft, and
backward glance.

- [ ] **Step 2: Run sampler tests and confirm failure**

Run:

```powershell
bunx vitest run tests/snatcherChoreography.test.ts
```

Expected: module import failure.

- [ ] **Step 3: Implement pure Snatcher choreography**

Use:

- Reveal duration: 2.5 seconds.
- Item duration: 1.15 seconds.
- Reaction duration: 1.2 seconds.

The final reveal pose stays crouched.
The stolen target pauses on the rail before leaving.

- [ ] **Step 4: Write failing target tests**

Assert:

```ts
presentation.stage({
  eventId: 'snatcher',
  targetInstanceId: 'map-1',
  variantSeed: 7,
});
expect(targetOutline.targetIdForTest()).toBe('map-1');

await presentation.react(lostTargetResult);
expect(borrowedTarget.releaseOnNextSync).toHaveBeenCalledOnce();
```

- [ ] **Step 5: Build the Snatcher scene**

Attach the creature to `boatRoot`.

Add:

- Two authored finger extensions.
- Large uneven eye shells.
- Wet, rough, dark skin materials.
- One target outline with a distinct warning value.

Borrow the exact target actor during stage.
Never infer the target from item type.

- [ ] **Step 6: Run Snatcher tests**

Run:

```powershell
bunx vitest run tests/snatcherChoreography.test.ts tests/SnatcherPresentation.test.ts
```

Expected: all pass.

- [ ] **Step 7: Commit the task**

```powershell
git add src/survival/events/snatcherChoreography.ts src/survival/events/SnatcherPresentation.ts tests/snatcherChoreography.test.ts tests/SnatcherPresentation.test.ts
git commit -m "feat: stage the snatcher event"
```

---

### Task 8: Implement Death Stare presentation

**Files:**
- Create: `src/survival/events/deathStareChoreography.ts`
- Create: `src/survival/events/DeathStarePresentation.ts`
- Create: `tests/deathStareChoreography.test.ts`
- Create: `tests/DeathStarePresentation.test.ts`

**Interfaces:**
- Consumes: `EventModelLibrary.create('anglerFish')`
- Consumes: shared wave sample provider
- Produces: `DeathStarePresentation`

- [ ] **Step 1: Write failing sampler tests**

Assert the long stop:

```ts
const first = identityDeathStareSample();
const second = identityDeathStareSample();
sampleDeathStareReveal(0.72, first);
sampleDeathStareReveal(0.88, second);
expect(second.fishX).toBeCloseTo(first.fishX);
expect(second.fishY).toBeCloseTo(first.fishY);
expect(second.eyeTarget).toBe(1);
```

Test blink, sink, lunge, camera hit, and hull roll.

- [ ] **Step 2: Run sampler tests and confirm failure**

Run:

```powershell
bunx vitest run tests/deathStareChoreography.test.ts
```

Expected: module import failure.

- [ ] **Step 3: Implement Death Stare choreography**

Use:

- Reveal duration: 3.2 seconds.
- Item duration: 1.25 seconds.
- Reaction duration: 1.25 seconds.

Hold the fish without keyed position change from normalized 0.68 through 0.94.

- [ ] **Step 4: Write failing presentation tests**

Assert one fish, fixed water strands, and outcome mapping:

```ts
expect(root.getObjectByName('death-stare-angler')).toBeDefined();
expect(drainStrands).toHaveLength(12);
await presentation.react(attackResult);
expect(cameraRig.rotation.x).not.toBe(0);
```

- [ ] **Step 5: Build the Death Stare scene**

Scale Angler Fish to a 5.6-unit face.

Add:

- One dominant emissive eye.
- One smaller recessed eye.
- Uneven teeth.
- Dark jaw interior.
- Wet lure material.
- Twelve fixed draining-water strands.

Map lost supplies into the mouth.
Return Flashlight, Umbrella, Food, Harpoon, and Net item poses to identity
before the reaction begins.

- [ ] **Step 6: Run Death Stare tests**

Run:

```powershell
bunx vitest run tests/deathStareChoreography.test.ts tests/DeathStarePresentation.test.ts
```

Expected: all pass.

- [ ] **Step 7: Commit the task**

```powershell
git add src/survival/events/deathStareChoreography.ts src/survival/events/DeathStarePresentation.ts tests/deathStareChoreography.test.ts tests/DeathStarePresentation.test.ts
git commit -m "feat: stage the death stare event"
```

---

### Task 9: Implement Swarm of Anglerfish presentation

**Files:**
- Create: `src/survival/events/anglerfishSwarmChoreography.ts`
- Create: `src/survival/events/AnglerfishSwarmPresentation.ts`
- Create: `tests/anglerfishSwarmChoreography.test.ts`
- Create: `tests/AnglerfishSwarmPresentation.test.ts`

**Interfaces:**
- Consumes: `EventModelLibrary.create('anglerFish')`
- Consumes: shared wave sample provider
- Produces: `createSwarmVariants`
- Produces: `AnglerfishSwarmPresentation`

- [ ] **Step 1: Write failing sampler tests**

Test three lights first:

```ts
const early = createSwarmSample();
const middle = createSwarmSample();
sampleSwarmReveal(0.18, variants, early);
sampleSwarmReveal(0.62, variants, middle);
expect(early.visibleCount).toBe(3);
expect(middle.visibleCount).toBeGreaterThan(9);
expect(middle.cameraYaw).not.toBe(0);
```

Test Net pull, Harpoon opening, Flashlight sweep, Bait diversion, and attack.

- [ ] **Step 2: Run sampler tests and confirm failure**

Run:

```powershell
bunx vitest run tests/anglerfishSwarmChoreography.test.ts
```

Expected: module import failure.

- [ ] **Step 3: Implement deterministic Swarm choreography**

Create 18 stable variants during stage.

Use:

- Reveal duration: 2.9 seconds.
- Item duration: 1.2 seconds.
- Reaction duration: 1.15 seconds.

Add fish in groups of 3, 4, 5, and 6.
Keep approach timing uneven.

- [ ] **Step 4: Write failing presentation tests**

Assert:

```ts
expect(anglerRoots).toHaveLength(18);
expect(new Set(anglerRoots.map(({ scale }) => scale.x)).size).toBeGreaterThan(6);
expect(lureLights).toHaveLength(18);
```

Test two catch actors and no allocation during update.

- [ ] **Step 5: Build the Swarm scene**

Create:

- 18 Angler Fish clones.
- 18 lure lights.
- Two fixed catch actors.
- Eight fixed splash meshes.

Use darker bodies and colder lures than Death Stare.
Keep every fish below the Death Stare scale.

- [ ] **Step 6: Run Swarm tests**

Run:

```powershell
bunx vitest run tests/anglerfishSwarmChoreography.test.ts tests/AnglerfishSwarmPresentation.test.ts
```

Expected: all pass.

- [ ] **Step 7: Commit the task**

```powershell
git add src/survival/events/anglerfishSwarmChoreography.ts src/survival/events/AnglerfishSwarmPresentation.ts tests/anglerfishSwarmChoreography.test.ts tests/AnglerfishSwarmPresentation.test.ts
git commit -m "feat: stage the anglerfish swarm event"
```

---

### Task 10: Implement Whirlpool presentation

**Files:**
- Create: `src/survival/events/whirlpoolChoreography.ts`
- Create: `src/survival/events/WhirlpoolPresentation.ts`
- Create: `tests/whirlpoolChoreography.test.ts`
- Create: `tests/WhirlpoolPresentation.test.ts`

**Interfaces:**
- Consumes: `EventModelLibrary.create('whirlpoolCore')`
- Consumes: mutable `VortexWaveState`
- Consumes: `BoatSupplyDisplay.borrowEventActor`
- Produces: `WhirlpoolPresentation`

- [ ] **Step 1: Write failing sampler tests**

Test three inward beats:

```ts
sampleWhirlpoolReveal(0.28, sample);
const firstPull = sample.vortexStrength;
sampleWhirlpoolReveal(0.54, sample);
expect(sample.vortexStrength).toBeGreaterThan(firstPull);
sampleWhirlpoolReveal(0.82, sample);
expect(sample.boatYaw).not.toBe(0);
```

Test Anchor catch, chain snap, Ring compression, severe roll, and two-item
loss.

- [ ] **Step 2: Run sampler tests and confirm failure**

Run:

```powershell
bunx vitest run tests/whirlpoolChoreography.test.ts
```

Expected: module import failure.

- [ ] **Step 3: Implement Whirlpool choreography**

Use:

- Reveal duration: 3.0 seconds.
- Item duration: 1.25 seconds.
- Reaction duration: 1.4 seconds.

Write vortex strength, depression, phase, camera roll, boat yaw, and supply
travel into caller-owned output.

- [ ] **Step 4: Write failing presentation tests**

Assert:

```ts
presentation.stage(context);
await advance(presentation.reveal(), presentation, 3.0);
expect(vortex.strength).toBeGreaterThan(0.8);
presentation.clear();
expect(vortex.strength).toBe(0);
```

Assert 14 foam ribbons, 12 debris objects, 10 chain links, and two exact lost
actors.

- [ ] **Step 5: Build the Whirlpool scene**

Flatten Whirlpool Core beneath the surface.

Add:

- 14 foam ribbons.
- 12 irregular debris objects.
- 10 chain links.
- One compressed Ring effect shell.

The core is visual only.
Write all water and vessel state through `VortexWaveState`.

- [ ] **Step 6: Run Whirlpool tests**

Run:

```powershell
bunx vitest run tests/whirlpoolChoreography.test.ts tests/WhirlpoolPresentation.test.ts tests/WaveField.test.ts
```

Expected: all pass.

- [ ] **Step 7: Commit the task**

```powershell
git add src/survival/events/whirlpoolChoreography.ts src/survival/events/WhirlpoolPresentation.ts tests/whirlpoolChoreography.test.ts tests/WhirlpoolPresentation.test.ts
git commit -m "feat: stage the whirlpool event"
```

---

### Task 11: Integrate assets, routing, feedback, and audio

**Files:**
- Modify: `src/app/GamePhase.ts`
- Modify: `src/app/launchGame.ts`
- Modify: `src/Game.ts`
- Modify: `src/survival/BoatWorld.ts`
- Modify: `src/survival/SurvivalPhase.ts`
- Modify: `src/ui/SurvivalUI.ts`
- Modify: `src/styles/main.css`
- Modify: `src/audio/SurvivalAudio.ts`
- Modify: `tests/GameLifecycle.test.ts`
- Modify: `tests/BoatWorld.test.ts`
- Modify: `tests/SurvivalPhase.test.ts`
- Modify: `tests/SurvivalUI.test.ts`
- Modify: `tests/SurvivalAudio.test.ts`

**Interfaces:**
- Consumes: `EventModelLibrary`
- Consumes: `EventPresentationCoordinator`
- Consumes: `deriveEventOutcomePresentation`
- Produces: exact UI result lines

- [ ] **Step 1: Write failing launch and disposal tests**

Add `loadEventModels` to launch dependencies.

Test:

```ts
expect(loadEventModels).toHaveBeenCalledOnce();
expect(createGame).toHaveBeenCalledWith(
  expect.anything(),
  expect.anything(),
  expect.anything(),
  expect.anything(),
  expect.anything(),
  expect.anything(),
  eventModels,
  expect.anything(),
  expect.anything(),
  expect.anything(),
);
```

Test sibling cleanup when event model loading fails.

- [ ] **Step 2: Add event models to application construction**

Add `eventModels: EventModelLibrary` to `PhaseContext`.

Preload it with other assets.

Render this failure:

```ts
{
  kind: 'error',
  kicker: 'EVENT MODELS UNAVAILABLE',
  title: `Unable to prepare ${error.modelId}`,
  lead: 'A night event model could not be prepared.',
  detail: error.message,
}
```

- [ ] **Step 3: Write failing BoatWorld routing tests**

Test:

- Dedicated events clear generic and weather paths.
- Other events keep current paths.
- Dedicated item use returns before generic fallback.
- Clear resets coordinator, supplies, and vortex.

- [ ] **Step 4: Attach and register all six presentations**

Create the coordinator after `BoatSupplyDisplay`.

Add its `boatRoot` to the boat.
Add its `worldRoot` to the scene.

Register:

```ts
[
  new LeakPresentation(environment),
  new SchoolOfFishPresentation(environment),
  new SnatcherPresentation(environment),
  new DeathStarePresentation(environment),
  new AnglerfishSwarmPresentation(environment),
  new WhirlpoolPresentation(environment),
]
```

- [ ] **Step 5: Write failing phase-order and context tests**

Assert:

```ts
expect(stageEvent).toHaveBeenCalledWith({
  eventId: 'snatcher',
  targetInstanceId: 'map-1',
  variantSeed: deriveEventVariantSeed(snapshot.seed, snapshot.day, 'snatcher'),
});
expect(calls).toEqual([
  'cover:on',
  'stage:snatcher',
  'ui:reveal',
  'render:settle',
  'cover:off',
  'world:reveal',
  'choices:on',
]);
```

Test exact before/after snapshot diff reaches `reactToEventOutcome`.

- [ ] **Step 6: Update phase flow**

Before resolution:

```ts
const before = this.session.snapshot();
```

After resolution:

```ts
const after = this.session.snapshot();
const presentation = deriveEventOutcomePresentation(
  before,
  after,
  outcome,
  physicalResponse?.instanceId ?? null,
);
```

Pass `presentation` to `BoatWorld.reactToEventOutcome`.

- [ ] **Step 7: Write failing exact feedback tests**

Define:

```ts
export interface EventResultView {
  readonly message: string;
  readonly lines: readonly string[];
}
```

Assert lines:

```ts
expect(formatEventResult(result).lines).toEqual([
  'FOOD +3',
  'BUCKET BROKEN',
]);
```

Also test Hull damage, lost items, consumed items, and two-item loss.

- [ ] **Step 8: Add concise result feedback**

Render a compact result group below the event caption.

Use current role fonts.
Use an icon or text prefix for broken and lost states.
Do not use color alone.

- [ ] **Step 9: Reuse current audio cues**

Add one method:

```ts
eventAction(eventId: DedicatedEventId, choiceId: string): void
```

Map:

- Leak Duct Tape to `tapeRepair`.
- School result to `fishCatch`.
- Harpoon choices to `harpoonGun`.
- Whirlpool Anchor to `anchorChain`.
- Damage reactions to `hardWaveImpact`.
- Other item actions to `itemHandling`.

- [ ] **Step 10: Run integration tests**

Run:

```powershell
bunx vitest run tests/GameLifecycle.test.ts tests/BoatWorld.test.ts tests/SurvivalPhase.test.ts tests/SurvivalUI.test.ts tests/SurvivalAudio.test.ts
bun run typecheck
```

Expected: all pass.

- [ ] **Step 11: Commit the task**

```powershell
git add src/app/GamePhase.ts src/app/launchGame.ts src/Game.ts src/survival/BoatWorld.ts src/survival/SurvivalPhase.ts src/ui/SurvivalUI.ts src/styles/main.css src/audio/SurvivalAudio.ts tests/GameLifecycle.test.ts tests/BoatWorld.test.ts tests/SurvivalPhase.test.ts tests/SurvivalUI.test.ts tests/SurvivalAudio.test.ts
git commit -m "feat: integrate six night event presentations"
```

---

### Task 12: Verify the event pack and update progress

**Files:**
- Modify: `docs/EVENT_PROGRESS.md`
- Modify only if checks expose defects: files from Tasks 1–11

**Interfaces:**
- Consumes: all prior task outputs
- Produces: verified build and completed progress entries

- [ ] **Step 1: Run model checks**

Run:

```powershell
bun run models:check
bun run models:check:events
```

Expected: all model and texture checks pass.

- [ ] **Step 2: Run focused event tests together**

Run:

```powershell
bunx vitest run tests/eventPresentationOutcome.test.ts tests/EventModelLibrary.test.ts tests/EventPresentationCoordinator.test.ts tests/leakChoreography.test.ts tests/LeakPresentation.test.ts tests/schoolOfFishChoreography.test.ts tests/SchoolOfFishPresentation.test.ts tests/snatcherChoreography.test.ts tests/SnatcherPresentation.test.ts tests/deathStareChoreography.test.ts tests/DeathStarePresentation.test.ts tests/anglerfishSwarmChoreography.test.ts tests/AnglerfishSwarmPresentation.test.ts tests/whirlpoolChoreography.test.ts tests/WhirlpoolPresentation.test.ts
```

Expected: all pass.

- [ ] **Step 3: Run the full test suite**

Run:

```powershell
bun run test
```

Expected: all tests pass.

- [ ] **Step 4: Run typecheck and production build**

Run:

```powershell
bun run typecheck
bun run build
```

Expected: both pass.

- [ ] **Step 5: Perform visual event checks**

Start:

```powershell
bun run dev
```

Use the event test menu at 1280 by 720 and 1920 by 1080.

Check all choices and both safe and damaging results.
Check low and high water quality.
Hide and restore the document during each reveal.

Confirm:

- Leak shows the jet before choices.
- School shows 18 to 24 coherent fish.
- Snatcher points at the exact target.
- Death Stare holds without keyed motion.
- Swarm closes around the whole hull.
- Whirlpool deforms the ocean and buoyancy together.
- Result text matches the physical outcome.

- [ ] **Step 6: Mark progress complete**

Change the six rows in `docs/EVENT_PROGRESS.md` from `[ ]` to `[x]`.

- [ ] **Step 7: Review the final diff**

Run:

```powershell
git diff --check
git status --short
git diff --stat
```

Confirm unrelated worktree changes remain unstaged.

- [ ] **Step 8: Commit verification and progress**

```powershell
git add docs/EVENT_PROGRESS.md
git commit -m "docs: mark six night events complete"
```

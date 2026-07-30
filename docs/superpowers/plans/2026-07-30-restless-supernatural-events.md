# Restless and Supernatural Events Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement Restless Waves, Man in the Fog, Ghosts, Eerie Melody, and Face on the Moon.

**Architecture:** Keep weather motion in `WeatherEventAnimator`. Add one event model library and one supernatural presenter. Extend `Skybox` for moon-local face features. Keep rules, UI, audio, and rendering separate.

**Tech Stack:** TypeScript 5.9, Three.js 0.180, Vite 7, Vitest 3, Web Audio, GLTF.

## Global Constraints

- Read `docs/VISUAL_STYLE_GUIDE.md` before visual changes.
- Use individual low-poly models only.
- Do not add model kits.
- Do not add reduced-motion behavior.
- Keep rules deterministic without a renderer.
- Use the injected random source for rules only.
- Use the shared wave field for ocean, boat, supply, and rock motion.
- Allocate no objects in frame update paths.
- Give every resource one owner.
- Dispose every resource once.
- Preserve all pre-existing user changes.
- Do not stage pre-existing user changes without review.

## File map

Create these files:

- `src/survival/eventModelManifest.ts`: Event model IDs, URLs, normalization, and metadata.
- `src/survival/EventModelLibrary.ts`: Event model loading, validation, cloning, and disposal.
- `src/survival/supernaturalEventChoreography.ts`: Pure reveal, item, and result samples.
- `src/survival/SupernaturalEventAnimator.ts`: Ghost and siren scene ownership.
- `tests/EventModelLibrary.test.ts`: Event model validation and ownership tests.
- `tests/supernaturalEventChoreography.test.ts`: Pure supernatural motion tests.
- `tests/SupernaturalEventAnimator.test.ts`: Model staging, cleanup, and disposal tests.
- `tests/SkyboxMoonFace.test.ts`: Moon shader state and reset tests.
- `scripts/fetch-event-models.ps1`: Verified source download and publication.
- `scripts/event-model-metadata.mjs`: Generated triangle, bounds, and animation metadata.

Modify these files:

- `src/survival/events.ts`: Correct Pressure eligibility and effects.
- `tests/survivalEvents.test.ts`: Lock the corrected rules.
- `src/assets/ATTRIBUTION.md`: Record model and audio sources.
- `package.json`: Add event asset scripts.
- `src/app/GamePhase.ts`: Add `eventModels` to `PhaseContext`.
- `src/app/launchGame.ts`: Load and dispose event models.
- `src/Game.ts`: Own and pass the event model library.
- `src/survival/SurvivalPhase.ts`: Pass event models and coordinate audio lifecycle.
- `src/survival/BoatWorld.ts`: Own and coordinate both event animators.
- `src/survival/WeatherEventAnimator.ts`: Use the fog-man model and complete reactions.
- `src/survival/weatherEventChoreography.ts`: Complete Restless Waves and fog samples.
- `tests/weatherEventChoreography.test.ts`: Lock weather beats and identity restoration.
- `tests/BoatWorld.test.ts`: Lock staging, shared waves, cleanup, and disposal.
- `src/world/Skybox.ts`: Add transient moon-face uniforms.
- `src/audio/audioManifest.ts`: Add `eerieMelody`.
- `src/audio/SurvivalAudio.ts`: Own event melody playback.
- `tests/audioManifest.test.ts`: Lock the new asset.
- `tests/SurvivalAudio.test.ts`: Lock melody lifecycle.
- `src/ui/SurvivalUI.ts`: Add the restrained ghost sleep mask.
- `src/styles/main.css`: Style the ghost mask.
- `tests/SurvivalUI.test.ts`: Lock mask state and cleanup.
- `tests/SurvivalPhase.test.ts`: Lock event order and audio cleanup.
- `docs/EVENT_PROGRESS.md`: Mark all five events complete after verification.

---

### Task 1: Correct the five event rules

**Files:**

- Modify: `src/survival/events.ts`
- Modify: `tests/survivalEvents.test.ts`

**Interfaces:**

- Consumes: `SurvivalEventDefinition.minimumPressure`
- Produces: Correct immutable event definitions for all later presentation tests.

- [ ] **Step 1: Write failing rule tests**

Add assertions for minimum Pressure and exact effects:

```ts
const byId = Object.fromEntries(SURVIVAL_EVENTS.map((event) => [event.id, event]));

expect(byId['man-in-the-fog']?.minimumPressure).toBe(1);
expect(byId.ghosts?.minimumPressure).toBe(1);
expect(byId['eerie-melody']?.minimumPressure).toBe(2);
expect(byId['face-on-the-moon']?.minimumPressure).toBe(3);

for (const eventId of ['man-in-the-fog', 'face-on-the-moon'] as const) {
  const serialized = JSON.stringify(byId[eventId]?.choices);
  expect(serialized).not.toContain('rescueProgress');
}
```

Update Man in the Fog expected outcomes:

```ts
choice('spyglass', 'Use Binoculars', 'spyglass',
  outcome(1, 'Danger increases.', [add('pressure', 1)])),
choice('flashlight', 'Use Flashlight', 'flashlight',
  outcome(70, 'The figure attacks.', [
    add('pressure', 2), subtract('health', 20), set('energy', 1),
  ]),
  outcome(35, 'Danger increases.', [add('pressure', 2)])),
choice('sleep', 'Sleep', undefined,
  outcome(50, 'The boat is damaged.', [
    add('pressure', 1), subtract('hull', { min: 10, max: 30 }),
  ]),
  outcome(50, 'You are injured.', [
    add('pressure', 1), subtract('health', 20), set('energy', 2),
  ])),
```

- [ ] **Step 2: Run the focused tests**

Run:

```powershell
bunx vitest run tests/survivalEvents.test.ts
```

Expected: FAIL on minimum Pressure and old Rescue Progress effects.

- [ ] **Step 3: Implement the rule corrections**

Pass eligibility through the existing event factory:

```ts
event('man-in-the-fog', 'Man in the Fog', 'darkness', 18, 6, 40, choices, undefined, {
  minimumPressure: 1,
});
event('ghosts', 'Ghosts', 'darkness', 25, 8, 38, choices, undefined, {
  minimumPressure: 1,
});
event('eerie-melody', 'Eerie Melody', 'darkness', 19, 13, 30, choices, undefined, {
  minimumPressure: 2,
});
event('face-on-the-moon', 'Face on the Moon', 'darkness', 5, 17, 50, choices, undefined, {
  minimumPressure: 3,
});
```

Replace Rescue Progress effects with the Pressure effects from Step 1.

- [ ] **Step 4: Run rule tests**

Run:

```powershell
bunx vitest run tests/survivalEvents.test.ts tests/SurvivalSession.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit safe rule files**

Inspect existing changes first:

```powershell
git diff -- src/survival/events.ts tests/survivalEvents.test.ts
```

Stage only task changes. Do not stage unrelated existing hunks.

Commit:

```powershell
git commit -m "fix: align supernatural event rules"
```

---

### Task 2: Publish and load the four event models

**Files:**

- Create: `scripts/fetch-event-models.ps1`
- Create: `scripts/event-model-metadata.mjs`
- Create: `scripts/check-event-models.mjs`
- Create: `src/assets/models/events/fogMan.glb`
- Create: `src/assets/models/events/ghost.glb`
- Create: `src/assets/models/events/siren.glb`
- Create: `src/assets/models/events/sirenRock.glb`
- Create: `src/assets/models/events/event-model-metadata.json`
- Create: `src/survival/eventModelManifest.ts`
- Create: `src/survival/EventModelLibrary.ts`
- Create: `tests/EventModelLibrary.test.ts`
- Modify: `src/assets/ATTRIBUTION.md`
- Modify: `package.json`

**Interfaces:**

- Produces: `EventModelId`, `EventModelLibrary.load()`, `create(id)`, and `dispose()`.
- Produces: `EVENT_MODEL_IDS` and `EVENT_MODEL_SPECS`.

- [ ] **Step 1: Add failing event model tests**

Create the library contract tests:

```ts
import { Group, Mesh, BoxGeometry, MeshBasicMaterial } from 'three';
import { describe, expect, it, vi } from 'vitest';
import {
  EventModelLibrary,
  EventModelLoadError,
  type EventModelLoader,
} from '../src/survival/EventModelLibrary';
import { EVENT_MODEL_IDS } from '../src/survival/eventModelManifest';

const validRoot = (): Group => {
  const root = new Group();
  root.add(new Mesh(new BoxGeometry(1, 2, 1), new MeshBasicMaterial()));
  return root;
};

it('loads every event model and creates isolated clones', async () => {
  const load = vi.fn(async () => ({ scene: validRoot(), animations: [] }));
  const library = await EventModelLibrary.load({ load } satisfies EventModelLoader);
  expect(load).toHaveBeenCalledTimes(EVENT_MODEL_IDS.length);
  const first = library.create('ghost');
  const second = library.create('ghost');
  expect(first).not.toBe(second);
  expect((first.children[0] as Mesh).geometry)
    .not.toBe((second.children[0] as Mesh).geometry);
  library.dispose();
});

it('reports the failing event model id', async () => {
  const loader: EventModelLoader = {
    load: async (url) => {
      if (url.includes('ghost')) throw new Error('missing');
      return { scene: validRoot(), animations: [] };
    },
  };
  await expect(EventModelLibrary.load(loader))
    .rejects.toBeInstanceOf(EventModelLoadError);
});
```

- [ ] **Step 2: Run the library test**

Run:

```powershell
bunx vitest run tests/EventModelLibrary.test.ts
```

Expected: FAIL because the library and manifest do not exist.

- [ ] **Step 3: Add verified source descriptors**

Use these approved sources:

```ts
export const EVENT_MODEL_IDS = Object.freeze([
  'fogMan', 'ghost', 'siren', 'sirenRock',
] as const);

export type EventModelId = typeof EVENT_MODEL_IDS[number];
```

Use these exact source records in the download script:

```powershell
$eventSources = @(
  @{
    Id = 'fogMan'
    PublicId = 'mQnGoME1ez'
    ResourceId = '66b57880-bcb0-479a-8d72-5c3e88afaa39'
    Sha256 = '31FF1539E7A9A209D4EB1107E696D798FEDC7E35D84A58BBABFDC0F1B8B73763'
  },
  @{
    Id = 'ghost'
    PublicId = '112vpcommxv'
    ResourceId = '02d70fdb-284b-4799-a9ee-18c7277f158c'
    Sha256 = '3AFB58D595ECA2D5F7953847CF51230270BB9EEE40B59F56FE04CDF4A28CD1C3'
  },
  @{
    Id = 'siren'
    PublicId = 'nIItLV9nxS'
    ResourceId = '46d6db5a-3c9f-4238-8cdf-8eb7194498dc'
    Sha256 = 'A6522FE53D15DE21130A957D1BF2B8A9A58D4E4E9A12AF646645B667A9BB2D17'
  },
  @{
    Id = 'sirenRock'
    PublicId = 'CrSoV13mCU'
    ResourceId = '3e9d82ac-0749-42b6-8dfd-082393547ed5'
    Sha256 = '8A0595C2F0C6914CC1794CE8CB35517F4451EB4CFB6703D3A58CA654D5900BAB'
  }
)
```

Download from:

```powershell
https://static.poly.pizza/<ResourceId>.glb
```

Verify every SHA-256 before publication.

- [ ] **Step 4: Generate exact model metadata**

Implement `event-model-metadata.mjs` with the existing metadata algorithm.

Expected source metadata:

```json
{
  "fogMan": { "triangles": 2058 },
  "ghost": { "triangles": 1039 },
  "siren": { "triangles": 6108 },
  "sirenRock": { "triangles": 214 }
}
```

Preserve source bounds and animation names in the generated JSON.

Run:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/fetch-event-models.ps1
node scripts/event-model-metadata.mjs src/assets/models/events fogMan ghost siren sirenRock
```

Expected: Four GLB files and one metadata JSON file.

- [ ] **Step 5: Implement the manifest**

Use exact normalization values:

```ts
const PRESENTATION = {
  fogMan: {
    targetLongestDimension: 2.4,
    rotation: [0, Math.PI, 0],
    offset: [0, 1.2, 0],
    maxTriangles: 2_200,
  },
  ghost: {
    targetLongestDimension: 1.65,
    rotation: [0, -Math.PI / 2, 0],
    offset: [0, 0.75, 0],
    maxTriangles: 1_100,
  },
  siren: {
    targetLongestDimension: 2.1,
    rotation: [0, Math.PI, Math.PI / 2],
    offset: [0, 0.55, 0],
    maxTriangles: 6_200,
  },
  sirenRock: {
    targetLongestDimension: 4.8,
    rotation: [0, 0.15, 0],
    offset: [0, 0, 0],
    maxTriangles: 250,
  },
} as const;
```

Import each GLB through Vite:

```ts
const urls = import.meta.glob<string>(
  '../assets/models/events/*.glb',
  { eager: true, query: '?url', import: 'default' },
);
```

- [ ] **Step 6: Implement `EventModelLibrary`**

Use skeleton-safe clones:

```ts
export interface EventModelLoader {
  load(url: string): Promise<{
    readonly scene: Group;
    readonly animations: readonly AnimationClip[];
  }>;
}

export class EventModelLibrary {
  static async load(
    loader: EventModelLoader = new GltfEventModelLoader(),
  ): Promise<EventModelLibrary>;

  create(id: EventModelId): Group;
  animations(id: EventModelId): readonly AnimationClip[];
  dispose(): void;
}
```

Validate finite positions, triangle limits, bounds, and animation clips.

Clone geometry and material for every returned instance.

Dispose source templates once.

- [ ] **Step 7: Record attribution**

Add:

```markdown
- "Ghoooooost" by Nikki Morin.
  Source: https://poly.pizza/m/112vpcommxv
  License: CC BY 3.0.
- "Man in Suit" by Quaternius.
  Source: https://poly.pizza/m/mQnGoME1ez
  License: CC0 1.0.
- "Animated Woman" by Quaternius.
  Source: https://poly.pizza/m/nIItLV9nxS
  License: CC0 1.0.
- "Rock Flat" by Kenney.
  Source: https://poly.pizza/m/CrSoV13mCU
  License: CC0 1.0.
```

- [ ] **Step 8: Add the read-only asset audit**

Implement `check-event-models.mjs` with the existing item-model audit pattern.

Verify exact files, embedded resources, finite positions, valid indices, bounds,
triangle limits, metadata values, source IDs, hashes, and attribution rows.

Do not write files from the audit command.

Add:

```json
{
  "models:fetch:events": "powershell -ExecutionPolicy Bypass -File scripts/fetch-event-models.ps1",
  "models:check:events": "node scripts/check-event-models.mjs"
}
```

Include `models:check:events` in `models:check`.

- [ ] **Step 9: Run asset and library tests**

Run:

```powershell
bunx vitest run tests/EventModelLibrary.test.ts
bun run models:check:events
```

Expected: PASS.

- [ ] **Step 10: Commit the isolated asset task**

Stage only Task 2 files.

Commit:

```powershell
git commit -m "feat: add supernatural event models"
```

---

### Task 3: Wire event models through application ownership

**Files:**

- Modify: `src/app/GamePhase.ts`
- Modify: `src/app/launchGame.ts`
- Modify: `src/Game.ts`
- Modify: `src/survival/SurvivalPhase.ts`
- Modify: `src/survival/BoatWorld.ts`
- Modify: `tests/launchGame.test.ts`
- Modify: `tests/GameConstruction.test.ts`
- Modify: `tests/SurvivalPhase.test.ts`

**Interfaces:**

- Consumes: `EventModelLibrary`
- Produces: `PhaseContext.eventModels`
- Produces: `BoatWorld(..., eventModels, ...)`

- [ ] **Step 1: Write failing ownership tests**

Add a disposable fake library to launch tests:

```ts
const eventModels = {
  create: vi.fn(),
  animations: vi.fn(() => []),
  dispose: vi.fn(),
} as unknown as EventModelLibrary;

const dependencies = {
  loadEventModels: vi.fn(async () => eventModels),
};
```

Verify failed sibling preload disposes it once.

Verify game disposal disposes it once.

Verify `PhaseContext.eventModels` equals the loaded library.

- [ ] **Step 2: Run ownership tests**

Run:

```powershell
bunx vitest run tests/launchGame.test.ts tests/GameConstruction.test.ts tests/SurvivalPhase.test.ts
```

Expected: FAIL because the library is not in the ownership graph.

- [ ] **Step 3: Add `eventModels` to application interfaces**

Add:

```ts
export interface PhaseContext {
  readonly eventModels: EventModelLibrary;
}
```

Add:

```ts
export interface LaunchDependencies {
  loadEventModels(): Promise<EventModelLibrary>;
}
```

Load it beside item models:

```ts
loadEventModels: () => EventModelLibrary.load(),
```

Add it to `LoadedGameAssets`, `Game`, `GameTestOptions`, and cleanup.

- [ ] **Step 4: Pass the library into `BoatWorld`**

Use:

```ts
new BoatWorld(
  context.camera,
  context.propModels,
  context.skyAssets.moonTexture,
  savedItems,
  context.lifeboatAssets,
  context.shipFurniture,
  context.waterQuality.get(),
  context.eventModels,
);
```

Add a test-only empty library helper.

- [ ] **Step 5: Run ownership tests**

Run:

```powershell
bunx vitest run tests/launchGame.test.ts tests/GameConstruction.test.ts tests/SurvivalPhase.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit only clean ownership changes**

Inspect each modified file before staging.

Commit:

```powershell
git commit -m "refactor: own event model assets"
```

---

### Task 4: Complete Restless Waves and Man in the Fog

**Files:**

- Modify: `src/survival/weatherEventChoreography.ts`
- Modify: `src/survival/WeatherEventAnimator.ts`
- Modify: `src/survival/BoatWorld.ts`
- Modify: `tests/weatherEventChoreography.test.ts`
- Modify: `tests/BoatWorld.test.ts`

**Interfaces:**

- Consumes: `EventModelLibrary.create('fogMan')`
- Produces: Full weather reveal, item, and result motion.

- [ ] **Step 1: Add failing choreography tests**

Lock three Restless Waves rises:

```ts
const rises = [0.2, 0.48, 0.76].map((progress) => {
  const output = reveal();
  sampleWeatherReveal('restless-waves', progress, output);
  return output.cameraY;
});
expect(rises.every((value) => Math.abs(value) > 0.04)).toBe(true);
expect(new Set(rises.map((value) => Math.sign(value))).size).toBeGreaterThan(1);
```

Lock the final readable list before return:

```ts
const held = reveal();
sampleWeatherReveal('restless-waves', 0.82, held);
expect(Math.abs(held.cameraRoll)).toBeGreaterThan(0.06);
```

Lock fog-man visibility:

```ts
const middle = reveal();
const choices = reveal();
sampleWeatherReveal('man-in-the-fog', 0.55, middle);
sampleWeatherReveal('man-in-the-fog', 0.86, choices);
expect(middle.figureVisibility).toBeGreaterThan(0.7);
expect(choices.figureVisibility).toBe(0);
```

- [ ] **Step 2: Run choreography tests**

Run:

```powershell
bunx vitest run tests/weatherEventChoreography.test.ts
```

Expected: FAIL on held Restless Waves framing.

- [ ] **Step 3: Adjust pure reveal samples**

Use a three-rise carrier:

```ts
const riseCarrier = (
  Math.sin(Math.PI * t)
  + 0.72 * Math.sin(3 * Math.PI * t)
  + 0.38 * Math.sin(5 * Math.PI * t)
);
output.cameraY = 0.18 * riseCarrier;
output.cameraRoll = 0.15 * Math.sin(2 * Math.PI * t);
output.supplyRoll = 0.24 * Math.sin(3 * Math.PI * t);
output.supplyLift = 0.12 * Math.max(0, riseCarrier);
```

Keep ingress and return envelopes.

Do not change 3.8-second and 4.2-second durations.

- [ ] **Step 4: Replace the procedural fog figure**

Change the animator constructor:

```ts
constructor(
  private readonly cameraRig: Group,
  private readonly supplyDisplay: BoatSupplyDisplay,
  eventModels: EventModelLibrary,
) {
  this.silhouette = eventModels.create('fogMan');
}
```

Replace imported materials with one project-owned silhouette material.

Keep model geometry owned by the clone.

Name the root `fog-man-silhouette`.

- [ ] **Step 5: Complete weather reactions**

Add explicit Restless Waves branches:

```ts
const lostSupply = eventId === 'restless-waves'
  && response?.condition === 'lost';
const brokenRing = eventId === 'restless-waves'
  && response?.choiceId === 'swimRing'
  && response.condition === 'broken';
```

Use one lateral impact for Hull damage.

Slide lost supplies toward the starboard rail.

Compress and twist the broken Ring before its held pose.

Keep the fog grab under one second.

- [ ] **Step 6: Add BoatWorld integration tests**

Verify:

```ts
world.stageEvent('man-in-the-fog');
expect(world.scene.getObjectByName('fog-man-silhouette')).toBeDefined();

world.clearEvent();
expect(world.scene.getObjectByName('fog-man-silhouette')?.visible).toBe(false);
```

Keep the existing shared wave scale test.

- [ ] **Step 7: Run weather and world tests**

Run:

```powershell
bunx vitest run tests/weatherEventChoreography.test.ts tests/BoatWorld.test.ts
```

Expected: PASS.

- [ ] **Step 8: Commit the weather event task**

Do not stage pre-existing unrelated changes in `BoatWorld.ts`.

Commit:

```powershell
git commit -m "feat: complete waves and fog events"
```

---

### Task 5: Add pure supernatural choreography

**Files:**

- Create: `src/survival/supernaturalEventChoreography.ts`
- Create: `tests/supernaturalEventChoreography.test.ts`

**Interfaces:**

- Produces: `supernaturalRevealDuration(eventId)`
- Produces: `sampleSupernaturalReveal(eventId, progress, output)`
- Produces: `supernaturalItemUseDuration(eventId, choiceId)`
- Produces: `sampleSupernaturalItemUse(eventId, choiceId, progress, output)`
- Produces: `sampleSupernaturalReaction(eventId, outcome, response, progress, output)`

- [ ] **Step 1: Create failing choreography tests**

Define supported pairs:

```ts
const supportedPairs = [
  ['ghosts', 'flareGun'],
  ['ghosts', 'flashlight'],
  ['eerie-melody', 'bucket'],
  ['eerie-melody', 'spyglass'],
  ['eerie-melody', 'umbrella'],
  ['eerie-melody', 'ductTape'],
] as const;
```

Test exact durations:

```ts
expect(supernaturalRevealDuration('ghosts')).toBe(4);
expect(supernaturalRevealDuration('eerie-melody')).toBe(4.4);
```

Test five distinct ghost distances:

```ts
const output = revealSample();
sampleSupernaturalReveal('ghosts', 0.9, output);
expect(new Set(output.ghostDistances.map((value) => value.toFixed(3))).size).toBe(5);
expect(output.ghostDistances[0]).toBeGreaterThan(0.9);
```

Test siren order:

```ts
const beforeTurn = revealSample();
const afterTurn = revealSample();
sampleSupernaturalReveal('eerie-melody', 0.52, beforeTurn);
sampleSupernaturalReveal('eerie-melody', 0.72, afterTurn);
expect(beforeTurn.sirenHeadTurn).toBeLessThan(afterTurn.sirenHeadTurn);
expect(afterTurn.melodyClarity).toBeGreaterThan(0.7);
```

- [ ] **Step 2: Run the new test**

Run:

```powershell
bunx vitest run tests/supernaturalEventChoreography.test.ts
```

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Define allocation-free sample types**

Use fixed tuples:

```ts
export interface SupernaturalRevealSample {
  cameraX: number;
  cameraY: number;
  cameraZ: number;
  cameraYaw: number;
  cameraPitch: number;
  cameraRoll: number;
  ghostVisibility: number;
  ghostDistances: [number, number, number, number, number];
  ghostSideOffsets: [number, number, number, number, number];
  flareFlash: number;
  fogCurtain: number;
  sirenHeadTurn: number;
  sirenLunge: number;
  melodyClarity: number;
}
```

Use one caller-owned output object.

Reset every field before sampling.

- [ ] **Step 4: Implement keyed ghost and siren samples**

Use fixed ghost targets:

```ts
const GHOST_TARGETS = Object.freeze([
  [-2.2, 1.05, -3.4],
  [3.8, 1.2, -8.2],
  [-5.4, 1.35, -10.5],
  [1.2, 1.55, -13.2],
  [6.1, 1.3, -15.4],
] as const);
```

Use one flare pulse from progress 0.34 through 0.62.

Use fog curtain progress before siren head turn.

Use no idle loops.

- [ ] **Step 5: Implement all item beats**

Use these durations:

```ts
const ITEM_DURATIONS = {
  ghosts: { flareGun: 1.2, flashlight: 1.35 },
  'eerie-melody': {
    bucket: 1.35,
    spyglass: 1.45,
    umbrella: 1.5,
    ductTape: 1.2,
  },
} as const;
```

Every sample returns identity at progress 0 and 1.

- [ ] **Step 6: Run choreography tests**

Run:

```powershell
bunx vitest run tests/supernaturalEventChoreography.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit the pure choreography**

Commit:

```powershell
git commit -m "feat: add supernatural event choreography"
```

---

### Task 6: Build the supernatural presenter

**Files:**

- Create: `src/survival/SupernaturalEventAnimator.ts`
- Create: `tests/SupernaturalEventAnimator.test.ts`
- Modify: `src/survival/BoatWorld.ts`
- Modify: `tests/BoatWorld.test.ts`

**Interfaces:**

- Consumes: `EventModelLibrary`
- Consumes: Pure supernatural sample functions.
- Produces: The same stage, reveal, item, react, clear, update, and dispose seam as weather.

- [ ] **Step 1: Write failing presenter tests**

Test staging:

```ts
animator.stage('ghosts');
expect(animator.worldRoot.getObjectByName('ghost-1')?.visible).toBe(true);
expect(animator.worldRoot.getObjectByName('siren-tableau')?.visible).toBe(false);

animator.stage('eerie-melody');
expect(animator.worldRoot.getObjectByName('ghost-1')?.visible).toBe(false);
expect(animator.worldRoot.getObjectByName('siren-tableau')?.visible).toBe(true);
```

Test cleanup and pending promise settlement:

```ts
const pending = animator.reveal('ghosts');
animator.clear();
await expect(pending).resolves.toBeUndefined();
expect(animator.worldRoot.children.every((child) => !child.visible)).toBe(true);
```

Test double disposal calls each resource once.

- [ ] **Step 2: Run presenter tests**

Run:

```powershell
bunx vitest run tests/SupernaturalEventAnimator.test.ts
```

Expected: FAIL because the presenter does not exist.

- [ ] **Step 3: Construct owned models**

Use:

```ts
this.ghosts = Array.from({ length: 5 }, (_, index) => {
  const ghost = eventModels.create('ghost');
  ghost.name = `ghost-${index + 1}`;
  return ghost;
});
this.siren = eventModels.create('siren');
this.siren.name = 'event-siren';
this.sirenRock = eventModels.create('sirenRock');
this.sirenRock.name = 'event-siren-rock';
```

Create one `siren-tableau` group.

Replace imported materials with project-owned flat-shaded materials.

Use transparent ghost materials with `depthWrite: false`.

- [ ] **Step 4: Apply shared wave motion**

Sample the rock position:

```ts
sampleWaveFieldInto(
  DEFAULT_WAVES,
  time,
  this.sirenRockBase.x,
  this.sirenRockBase.z,
  this.waveSample,
);
this.sirenTableau.position.y =
  this.sirenRockBase.y + this.waveSample.height;
```

Apply the wave normal to the tableau quaternion.

Reuse vectors and quaternions.

- [ ] **Step 5: Implement reveal and item updates**

Drive ghost positions from fixed tuples.

Drive siren head turn through `Formad_Head` when present.

Fall back to the siren root yaw when that node is absent.

Pin item actors before item motion.

Return `false` for unsupported event-choice pairs.

- [ ] **Step 6: Implement result reactions**

Derive outcomes from existing data:

```ts
const hullDamage = Math.min(0, outcome.deltas.hull ?? 0);
const healthDamage = Math.min(0, outcome.deltas.health ?? 0);
const tiring = outcome.deltas.energy !== undefined;
const attack = hullDamage < 0 || healthDamage < 0;
```

Ghost safe results dissolve all models.

Ghost tiring results hold the left ghost.

Siren attacks lunge and strike once.

Safe siren results pull fog over the tableau.

- [ ] **Step 7: Integrate with `BoatWorld`**

Add:

```ts
private readonly supernaturalEventAnimator: SupernaturalEventAnimator;
```

Coordinate calls:

```ts
await Promise.all([
  this.eventPresentation.reveal(eventId),
  this.weatherEventAnimator.reveal(eventId),
  this.supernaturalEventAnimator.reveal(eventId),
]);
```

Use the same pattern for reactions.

Try weather item motion first.

Try supernatural item motion second.

Use generic item motion last.

- [ ] **Step 8: Run presenter and world tests**

Run:

```powershell
bunx vitest run tests/SupernaturalEventAnimator.test.ts tests/BoatWorld.test.ts
```

Expected: PASS.

- [ ] **Step 9: Commit the supernatural presenter**

Do not stage unrelated existing `BoatWorld.ts` changes.

Commit:

```powershell
git commit -m "feat: present ghosts and eerie melody"
```

---

### Task 7: Add Face on the Moon shader state

**Files:**

- Modify: `src/world/Skybox.ts`
- Modify: `src/survival/BoatWorld.ts`
- Create: `tests/SkyboxMoonFace.test.ts`
- Modify: `tests/BoatWorld.test.ts`

**Interfaces:**

- Produces: `Skybox.setMoonFace(sample)`
- Produces: `Skybox.resetTransient()` with full moon reset.

- [ ] **Step 1: Write failing sky tests**

Create:

```ts
it('uploads moon face state and resets it', () => {
  const sky = createTestSkybox();
  sky.setMoonFace({
    reveal: 1,
    grin: 0.6,
    starScale: 0.2,
    dim: 0.35,
  });
  expect(sky.material.uniforms.uMoonFaceReveal?.value).toBe(1);
  expect(sky.material.uniforms.uMoonGrin?.value).toBe(0.6);
  sky.resetTransient();
  expect(sky.material.uniforms.uMoonFaceReveal?.value).toBe(0);
  expect(sky.material.uniforms.uMoonGrin?.value).toBe(0);
  expect(sky.material.uniforms.uMoonStarScale?.value).toBe(1);
  expect(sky.material.uniforms.uMoonEventDim?.value).toBe(0);
});
```

- [ ] **Step 2: Run the sky test**

Run:

```powershell
bunx vitest run tests/SkyboxMoonFace.test.ts
```

Expected: FAIL because the uniforms and method do not exist.

- [ ] **Step 3: Add moon-face uniforms**

Add:

```glsl
uniform float uMoonFaceReveal;
uniform float uMoonGrin;
uniform float uMoonStarScale;
uniform float uMoonEventDim;
```

Add moon-local feature fields:

```glsl
float eyeShape(vec2 uv, vec2 center, vec2 scale) {
  vec2 p = (uv - center) / scale;
  return 1.0 - smoothstep(0.72, 1.0, dot(p, p));
}

float mouthShape(vec2 uv, float grin) {
  float curve = abs(uv.y - (0.31 + grin * uv.x * uv.x));
  float width = smoothstep(0.36, 0.08, abs(uv.x));
  return (1.0 - smoothstep(0.018, 0.045, curve)) * width;
}
```

Reveal the left eye, right eye, and mouth in sequence.

Multiply star output by `uMoonStarScale`.

Multiply final sky color by `1.0 - uMoonEventDim`.

- [ ] **Step 4: Add the public sky method**

Use:

```ts
export interface MoonFacePresentation {
  readonly reveal: number;
  readonly grin: number;
  readonly starScale: number;
  readonly dim: number;
}

setMoonFace(value: MoonFacePresentation): void {
  if (this.disposed) return;
  const uniforms = this.material.uniforms;
  uniforms.uMoonFaceReveal!.value = clamp01(value.reveal);
  uniforms.uMoonGrin!.value = clamp01(value.grin);
  uniforms.uMoonStarScale!.value = clamp01(value.starScale);
  uniforms.uMoonEventDim!.value = clamp01(value.dim);
}
```

- [ ] **Step 5: Add BoatWorld moon choreography**

Use a 3.8-second reveal.

Hold the normal moon through 20 percent.

Reveal eyes and mouth in sequence.

Use existing supply motion for Umbrella and Telescope.

Widen the grin on Pressure gain.

Dim and lower the camera on Energy loss.

Call `sky.resetTransient()` from every event clear path.

- [ ] **Step 6: Run sky and world tests**

Run:

```powershell
bunx vitest run tests/SkyboxMoonFace.test.ts tests/BoatWorld.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit moon presentation**

Commit:

```powershell
git commit -m "feat: reveal a face on the moon"
```

---

### Task 8: Add the Eerie Melody audio asset and lifecycle

**Files:**

- Create: `src/assets/audio/eerieMelody.mp3`
- Modify: `src/assets/ATTRIBUTION.md`
- Modify: `src/audio/audioManifest.ts`
- Modify: `src/audio/SurvivalAudio.ts`
- Modify: `src/survival/SurvivalPhase.ts`
- Modify: `tests/audioManifest.test.ts`
- Modify: `tests/SurvivalAudio.test.ts`
- Modify: `tests/SurvivalPhase.test.ts`

**Interfaces:**

- Produces: `SurvivalAudio.beginEvent(eventId)`
- Produces: `SurvivalAudio.beginEventReaction(eventId, outcome)`
- Produces: `SurvivalAudio.finishEventReaction(eventId)`
- Produces: `SurvivalAudio.clearEvent()`

- [ ] **Step 1: Download and verify the audio**

Use:

```text
https://cdn.freesound.org/previews/816/816687_11764891-hq.mp3
```

Expected SHA-256:

```text
61C6F0177EE883BF813F82CCD47746991B092967A4476780E1A53921DA4F7D77
```

Publish it as `src/assets/audio/eerieMelody.mp3`.

- [ ] **Step 2: Write failing audio tests**

Update the manifest count from 46 to 47.

Add:

```ts
expect(SOUND_IDS).toContain('eerieMelody');
expect(AUDIO_MANIFEST.eerieMelody).toMatchObject({
  loop: true,
  maxVoices: 1,
});
```

Add lifecycle tests:

```ts
audio.beginEvent('eerie-melody');
expect(scope.startLoop).toHaveBeenCalledWith('eerieMelody');

audio.beginEventReaction('eerie-melody', safeOutcome);
expect(scope.stopLoop).toHaveBeenCalledWith('eerieMelody', 0.02);

audio.beginEvent('eerie-melody');
audio.beginEventReaction('eerie-melody', attackOutcome);
expect(scope.stopLoop).not.toHaveBeenCalledWith('eerieMelody', 0.02);

audio.finishEventReaction('eerie-melody');
expect(scope.stopLoop).toHaveBeenCalledWith('eerieMelody', 0.08);

audio.clearEvent();
expect(scope.stopLoop).toHaveBeenCalledWith('eerieMelody', 0.08);
```

- [ ] **Step 3: Run audio tests**

Run:

```powershell
bunx vitest run tests/audioManifest.test.ts tests/SurvivalAudio.test.ts
```

Expected: FAIL because the sound and methods do not exist.

- [ ] **Step 4: Add the manifest entry**

Add:

```ts
eerieMelody: asset('eerieMelody', 'ambience', 0.38, true, 1),
```

Import the new MP3 like existing build assets.

- [ ] **Step 5: Implement event audio ownership**

Use:

```ts
private eventMelodyActive = false;

beginEvent(eventId: string): void {
  this.clearEvent();
  if (this.disposed || eventId !== 'eerie-melody') return;
  this.eventMelodyActive = true;
  this.scope.startLoop('eerieMelody');
}

clearEvent(): void {
  if (!this.eventMelodyActive) return;
  this.eventMelodyActive = false;
  this.scope.stopLoop('eerieMelody', 0.08);
}
```

`beginEventReaction` stops safe results with a 0.02-second fade.

It keeps attack results active through the lunge.

`finishEventReaction` stops any remaining melody after the world reaction settles.

Pause remains owned by `AudioScope`.

Dispose calls `clearEvent()` before scope disposal.

- [ ] **Step 6: Wire audio lifecycle into `SurvivalPhase`**

At reveal start:

```ts
this.audio.beginEvent(event.id);
```

Before the world reaction:

```ts
this.audio.beginEventReaction(eventId, outcome);
```

After the world reaction:

```ts
this.audio.finishEventReaction(eventId);
```

In central cleanup:

```ts
this.audio.clearEvent();
```

- [ ] **Step 7: Record audio attribution**

Add:

```markdown
- "woman humming cathedral" by Pennywind.
  Source: https://freesound.org/people/Pennywind/sounds/816687/
  License: CC0 1.0.
```

- [ ] **Step 8: Run audio and phase tests**

Run:

```powershell
bunx vitest run tests/audioManifest.test.ts tests/SurvivalAudio.test.ts tests/SurvivalPhase.test.ts
```

Expected: PASS.

- [ ] **Step 9: Commit audio lifecycle**

Do not stage unrelated existing `SurvivalPhase.ts` changes.

Commit:

```powershell
git commit -m "feat: add eerie melody audio"
```

---

### Task 9: Add the ghost sleep mask and lifecycle coverage

**Files:**

- Modify: `src/ui/SurvivalUI.ts`
- Modify: `src/styles/main.css`
- Modify: `src/survival/SurvivalPhase.ts`
- Modify: `tests/SurvivalUI.test.ts`
- Modify: `tests/SurvivalPhase.test.ts`

**Interfaces:**

- Produces: `SurvivalUI.setEventSleepMask(eventId, visible)`
- Consumes: Existing sleep-cover lifecycle.

- [ ] **Step 1: Write failing UI tests**

Add:

```ts
ui.setEventSleepMask('ghosts', true);
const mask = root.querySelector('[data-event-sleep-mask]');
expect(mask?.classList.contains('is-visible')).toBe(true);
expect(mask?.getAttribute('aria-hidden')).toBe('true');

ui.clearEventPresentation();
expect(mask?.classList.contains('is-visible')).toBe(false);
```

Verify non-Ghost events never show the mask.

- [ ] **Step 2: Run UI tests**

Run:

```powershell
bunx vitest run tests/SurvivalUI.test.ts
```

Expected: FAIL because the mask and method do not exist.

- [ ] **Step 3: Add the mask element**

Add beside the sleep cover:

```html
<div class="event-sleep-mask" data-event-sleep-mask aria-hidden="true">
  <i></i><i></i><i></i>
</div>
```

Add:

```ts
setEventSleepMask(eventId: string, visible: boolean): void {
  if (this.disposed) return;
  this.eventSleepMask.classList.toggle(
    'is-visible',
    eventId === 'ghosts' && visible,
  );
}
```

- [ ] **Step 4: Style a restrained pale mask**

Use:

```css
.event-sleep-mask {
  position: absolute;
  inset: 0;
  z-index: 20;
  pointer-events: none;
  opacity: 0;
  transition: opacity 180ms ease;
}

.event-sleep-mask.is-visible { opacity: 0.28; }

.event-sleep-mask i {
  position: absolute;
  width: 44px;
  height: 78px;
  border-radius: 46% 54% 62% 38%;
  background: rgba(183, 214, 210, 0.34);
  filter: blur(5px);
}
```

Place three shapes at uneven left, center, and right positions.

- [ ] **Step 5: Wire only the Ghosts Sleep beat**

Show the mask after the player selects Sleep.

Keep it visible through cover closure.

Clear it before dawn.

Do not show it for Flashlight or Flare Gun.

- [ ] **Step 6: Run UI and phase tests**

Run:

```powershell
bunx vitest run tests/SurvivalUI.test.ts tests/SurvivalPhase.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit the UI mask**

Do not stage unrelated existing UI or CSS changes.

Commit:

```powershell
git commit -m "feat: show ghosts through sleep"
```

---

### Task 10: Run complete verification and update event progress

**Files:**

- Modify: `docs/EVENT_PROGRESS.md`

**Interfaces:**

- Consumes: All prior task outputs.
- Produces: Verified completion markers.

- [ ] **Step 1: Run focused tests**

Run:

```powershell
bunx vitest run `
  tests/survivalEvents.test.ts `
  tests/EventModelLibrary.test.ts `
  tests/weatherEventChoreography.test.ts `
  tests/supernaturalEventChoreography.test.ts `
  tests/SupernaturalEventAnimator.test.ts `
  tests/SkyboxMoonFace.test.ts `
  tests/BoatWorld.test.ts `
  tests/audioManifest.test.ts `
  tests/SurvivalAudio.test.ts `
  tests/SurvivalUI.test.ts `
  tests/SurvivalPhase.test.ts `
  tests/launchGame.test.ts `
  tests/GameConstruction.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run the full suite**

Run:

```powershell
bun run test
```

Expected: PASS.

- [ ] **Step 3: Run type and production checks**

Run:

```powershell
bun run typecheck
bun run build
bun run models:check:events
```

Expected: PASS.

- [ ] **Step 4: Inspect all five event scenes**

Use the existing event test selector.

Inspect at 1280 by 720:

```text
Restless Waves
Man in the Fog
Ghosts
Eerie Melody
Face on the Moon
```

Verify the reveal before choices.

Verify each physical choice.

Verify safe and harmful outcomes.

Verify central cleanup before dawn.

Verify no model, fog, wave, mask, audio, or moon state remains.

- [ ] **Step 5: Mark progress only after visual approval**

Change these rows from `[ ]` to `[x]`:

```markdown
| Restless Waves | ... | [x] |
| Man in the Fog | ... | [x] |
| Ghosts | ... | [x] |
| Eerie Melody | ... | [x] |
| Face on the Moon | ... | [x] |
```

- [ ] **Step 6: Review the final diff**

Run:

```powershell
git status --short
git diff --check
git diff --stat
```

Confirm that all pre-existing user changes remain intact.

- [ ] **Step 7: Commit verified progress when safe**

Stage only the progress row changes.

Commit:

```powershell
git commit -m "docs: mark five night events complete"
```

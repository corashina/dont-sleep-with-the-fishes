# Interactive Survival Fishing Implementation Plan

> **For Codex:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task. Do not substitute `subagent-driven-development` unless the user selects that execution mode.

**Goal:** Replace instant survival fishing with a deterministic, interactive bow-fishing sequence that costs one energy, automatically benefits from bait, yields the approved wiki fish or junk, and removes the fishing rod from Dorothy's collectible inventory.

**Architecture:** Keep the catch catalog and fishing attempt state machine renderer-independent. `SurvivalSession` owns resource and journal mutation, `SurvivalPhase` orchestrates the locked interaction, `BoatWorld` owns Three.js presentation and wave-aligned targeting, and `SurvivalUI` owns accessible instructions and input forwarding. Continue loading the committed Kenney rod GLB, but expose it through a lifeboat-equipment manifest instead of the collectible item manifest.

**Tech Stack:** TypeScript, Three.js, Vitest/jsdom, Vite, Bun, CSS.

**Approved design:** `docs/superpowers/specs/2026-07-21-interactive-survival-fishing-design.md`

---

## Task 1: Add the immutable fishing catch catalog and weighted resolver

**Files:**

- Create: `src/survival/fishingCatalog.ts`
- Create: `tests/fishingCatalog.test.ts`

### Step 1: Write the failing catalog tests

Create `tests/fishingCatalog.test.ts` and assert:

- The exact ordered IDs are `cod`, `flounder`, `salmon`, `tuna`, `crab`, `squid`, `sardine`, `bass`, `herring`, `redSnapper`, `mackerel`, `clownfish`, `swordfish`, `seaweed`, `boot`, and `plasticBottle`.
- Every label, base weight, minimum day, food value, size, family, and authored appearance matches the approved design.
- There are exactly 13 fish and three junk entries; Fishlet and non-ordinary wiki catches are absent.
- Crab is excluded before day 2; Tuna and Squid are excluded before day 3.
- Day-three totals are 217 fish/214 junk without bait and 447 fish/214 junk with bait.
- Small fish receive `2x`, Tuna/Squid/Swordfish receive `3x`, and junk receives `1x` when bait is captured.
- Swordfish awards two food.
- Weighted boundary values select the expected first/last adjacent entries and identical rolls replay identically.

Use table-driven expectations, including all sixteen catalog rows, so future catalog drift is visible.

### Step 2: Run the focused test and confirm it fails

Run:

```text
bun run test -- tests/fishingCatalog.test.ts
```

Expected: failure because `src/survival/fishingCatalog.ts` does not exist.

### Step 3: Implement the typed catalog

Create these public contracts:

```ts
export type FishingCatchId =
  | 'cod' | 'flounder' | 'salmon' | 'tuna' | 'crab' | 'squid'
  | 'sardine' | 'bass' | 'herring' | 'redSnapper' | 'mackerel'
  | 'clownfish' | 'swordfish' | 'seaweed' | 'boot' | 'plasticBottle';

export type FishingCatchKind = 'fish' | 'junk';
export type FishingCatchSize = 'small' | 'large' | 'junk';
export type FishingModelFamily =
  | 'ordinaryFish' | 'flatfish' | 'crab' | 'squid' | 'swordfish'
  | 'seaweed' | 'boot' | 'bottle';

export interface FishingAppearance {
  readonly color: number;
  readonly accentColor: number;
  readonly length: number;
  readonly height: number;
  readonly width: number;
}

export interface FishingCatchDefinition {
  readonly id: FishingCatchId;
  readonly label: string;
  readonly kind: FishingCatchKind;
  readonly baseWeight: number;
  readonly minimumDay: number;
  readonly food: 0 | 1 | 2;
  readonly size: FishingCatchSize;
  readonly family: FishingModelFamily;
  readonly appearance: FishingAppearance;
}

export interface WeightedFishingCatch {
  readonly catch: FishingCatchDefinition;
  readonly weight: number;
}
```

Export:

```ts
export const FISHING_CATCHES: readonly FishingCatchDefinition[];
export function eligibleFishingCatches(day: number, capturedBait: boolean): readonly WeightedFishingCatch[];
export function selectFishingCatch(day: number, capturedBait: boolean, roll: number): FishingCatchDefinition;
export function isFishCatch(value: FishingCatchDefinition): boolean;
```

Implementation rules:

- Freeze the rows and nested appearance objects once at module initialization.
- Validate uniqueness, positive weights/dimensions, legal food values, and that junk has zero food.
- Treat the first playable day as day 0 for the wiki minimum-day gates, as specified.
- Require finite `roll` in `[0, 1)`; throw for an invalid injected random value instead of silently biasing selection.
- Do not call `Math.random()` and do not allocate catalog data in gameplay update paths.

### Step 4: Run the focused test

Run:

```text
bun run test -- tests/fishingCatalog.test.ts
```

Expected: pass.

### Step 5: Commit

```text
git add -- src/survival/fishingCatalog.ts tests/fishingCatalog.test.ts
git commit -m "feat: add deterministic fishing catch catalog"
```

---

## Task 2: Build the renderer-independent fishing attempt state machine

**Files:**

- Create: `src/survival/FishingSession.ts`
- Create: `tests/FishingSession.test.ts`
- Modify: `src/survival/survivalBalance.ts`
- Modify: `tests/SurvivalSession.test.ts`

### Step 1: Write failing state-machine tests

Create `tests/FishingSession.test.ts` using `tests/helpers/random.ts`. Cover:

- Construction consumes exactly two injected draws in documented order: bite delay, then hidden catch.
- Delay is `3 + firstDraw * 4`, including 3 seconds at `0` and a value just below 7 seconds at a draw just below `1`.
- Legal transitions are `aiming -> casting -> waiting -> bite -> reeling -> resolved` and `bite -> missed`.
- `cast()` stores one immutable horizontal world point and rejects duplicate/non-finite casts.
- `completeCast()` is the only way from `casting` to `waiting`.
- `advance(delta)` rejects negative/non-finite time, crosses the bite delay deterministically, and preserves overflow in bite elapsed time.
- `reel()` before `bite` is rejected; at `1.499...` seconds it succeeds; at `1.5` seconds it misses.
- `reel()` returns the hidden fish or junk once and moves to `reeling`; duplicates return a rejected command without changing state.
- `completeReel()` resolves only a reeling attempt.
- Missed attempts expose `{ kind: 'miss' }` and never expose the discarded catch.
- Omitting `advance()` during a simulated pause/hidden interval leaves delay and reaction time unchanged.
- Snapshots are immutable copies and never expose the mutable internal point.

### Step 2: Run the focused test and confirm it fails

```text
bun run test -- tests/FishingSession.test.ts
```

Expected: failure because `FishingSession` does not exist.

### Step 3: Replace the old probability constants with interaction timing

Change `SURVIVAL_BALANCE` to:

```ts
actions: {
  fishEnergy: 1,
  // existing actions unchanged
},
fishing: {
  minimumBiteDelaySeconds: 3,
  biteDelayRangeSeconds: 4,
  reactionSeconds: 1.5,
},
```

Delete the old rod/hand-line success and double-catch constants. Update the existing balance assertion in `tests/SurvivalSession.test.ts` from two fishing energy to one without changing the legacy action implementation yet; Task 3 removes that implementation.

### Step 4: Implement `FishingSession`

Use these contracts:

```ts
export interface FishingCastPoint {
  readonly x: number;
  readonly z: number;
}

export type FishingAttemptState =
  | 'aiming' | 'casting' | 'waiting' | 'bite' | 'reeling' | 'resolved' | 'missed';

export type FishingTerminalResult =
  | { readonly kind: 'catch'; readonly catch: FishingCatchDefinition }
  | { readonly kind: 'miss' };

export interface FishingAttemptSnapshot {
  readonly id: string;
  readonly state: FishingAttemptState;
  readonly capturedBait: boolean;
  readonly castPoint: FishingCastPoint | null;
  readonly biteDelaySeconds: number;
  readonly waitingSeconds: number;
  readonly biteSeconds: number;
  readonly result: FishingTerminalResult | null;
}

export interface FishingCommandResult {
  readonly accepted: boolean;
  readonly code: string;
}

export interface FishingSessionOptions {
  readonly id: string;
  readonly day: number;
  readonly capturedBait: boolean;
  readonly random: RandomSource;
}
```

Public methods:

```ts
snapshot(): FishingAttemptSnapshot;
cast(point: FishingCastPoint): FishingCommandResult;
completeCast(): FishingCommandResult;
advance(deltaSeconds: number): void;
reel(): FishingCommandResult & { readonly result?: FishingTerminalResult };
completeReel(): FishingCommandResult;
```

Keep the catch private until a successful reel. The missed result is created at expiry. Use explicit accumulated delta only; do not create timeouts, promises, DOM objects, or Three.js values.

### Step 5: Run focused tests

```text
bun run test -- tests/fishingCatalog.test.ts tests/FishingSession.test.ts tests/SurvivalSession.test.ts
```

Expected: pass.

### Step 6: Commit

```text
git add -- src/survival/FishingSession.ts src/survival/survivalBalance.ts tests/FishingSession.test.ts tests/SurvivalSession.test.ts
git commit -m "feat: add deterministic fishing attempt state machine"
```

---

## Task 3: Make `SurvivalSession` own fishing resources and journal results

**Files:**

- Modify: `src/survival/SurvivalSession.ts`
- Modify: `src/survival/survivalTypes.ts`
- Modify: `src/survival/journal.ts`
- Modify: `tests/SurvivalSession.test.ts`
- Modify: `tests/survivalJournal.test.ts`

### Step 1: Replace instant-fishing tests with failing begin/finish tests

In `tests/SurvivalSession.test.ts`, remove expectations for instant rod success and add tests that:

- `beginFishing()` succeeds without a recovered rod, spends exactly one energy, marks `actedToday`, captures current bait availability, and returns a stable attempt ID.
- No energy, non-day state, active attempt, terminal state, and a repeated action after acting reject atomically.
- The same `RandomSource` injected into `SurvivalSession` is handed to the attempt.
- `finishFishing(id, result)` awards one or two food for fish.
- A fish consumes one bait only when the attempt captured bait; this uses the existing aggregate/recovered-bait consumption order.
- Junk and miss results award no food and consume no bait.
- A duplicate, stale, or foreign attempt ID mutates nothing.
- Finishing requires the stable terminal result object produced by the matching attempt and rejects an unresolved attempt.
- Starting, junk, fish, and miss each record the intended `lastOutcome` without replaying the old generic `fish` presentation cue.

Add journal tests that verify named records for `Cod`, `Swordfish`, `Seaweed`, and `IT GOT AWAY` survive into the completed day's page alongside a daytime event.

### Step 2: Run focused tests and confirm they fail

```text
bun run test -- tests/SurvivalSession.test.ts tests/survivalJournal.test.ts
```

Expected: failures for missing `beginFishing()`, `finishFishing()`, and journal action data.

### Step 3: Add journal action data without coupling it to rendering

Add:

```ts
export interface JournalFishingRecord {
  readonly kind: 'fishing';
  readonly attemptId: string;
  readonly result: 'fish' | 'junk' | 'miss';
  readonly catchId: FishingCatchId | null;
  readonly catchLabel: string | null;
  readonly food: 0 | 1 | 2;
  readonly baitConsumed: boolean;
}

export type JournalDayActionRecord = JournalFishingRecord;
```

Extend `JournalEntry` with `readonly actions: readonly JournalDayActionRecord[]`. Keep `daytime` as the event record for compatibility. Update `formatJournalEntry()` to prepend concise fishing sentences before the daytime event or quiet-day sentence. Examples:

- `I caught a cod and gained one food.`
- `I caught a swordfish and gained two food.`
- `I reeled in seaweed, but it was no use.`
- `I went fishing, but it got away.`

Include a bait sentence only when `baitConsumed` is true. Update every journal entry construction and clone path to initialize/copy `actions`.

### Step 4: Implement session-level fishing transaction boundaries

Export discriminated results:

```ts
export type BeginFishingResult =
  | {
      readonly accepted: true;
      readonly outcome: ActionOutcome;
      readonly attempt: FishingSession;
    }
  | {
      readonly accepted: false;
      readonly outcome: ActionOutcome;
    };
```

Add:

```ts
beginFishing(): BeginFishingResult;
finishFishing(attemptId: string, result: FishingTerminalResult): ActionOutcome;
```

Implementation requirements:

- Generate IDs from a private monotonic counter, e.g. `fishing-${day}-${counter}`.
- Spend energy and mark the action through the existing single commit path.
- Retain the active attempt reference plus its captured-bait flag in `SurvivalSession` for transaction validation; `SurvivalPhase` owns progression and presentation through the same returned handle.
- On finish, verify the matching ID, active attempt state, and the stable terminal result object returned by that attempt; clear the active transaction exactly once.
- Consume bait through existing inventory/resource mutation helpers so recovered bait tins stay consistent.
- Add the journal record to a pending day-action list; copy it into `JournalEntry.actions` when the day closes.
- While the transaction is active, reject every ordinary `perform()`, event, and end-day mutation with one `fishing-in-progress` outcome even if phase input locking is bypassed.
- Remove the private instant `fish(useBait)` method and the rod/bait-choice validation from `perform()`.
- Keep `perform('fish')` temporarily as a deterministic rejected outcome with code `interactive-action` so the phase remains compilable until Task 7; remove this compatibility branch there.
- Use `cue: 'none'` for start/finish outcomes. Fishing animation is owned by the dedicated world API, not the generic cue system.

### Step 5: Run rules and journal tests

```text
bun run test -- tests/FishingSession.test.ts tests/SurvivalSession.test.ts tests/survivalJournal.test.ts
```

Expected: pass.

### Step 6: Commit

```text
git add -- src/survival/SurvivalSession.ts src/survival/survivalTypes.ts src/survival/journal.ts tests/SurvivalSession.test.ts tests/survivalJournal.test.ts
git commit -m "feat: integrate fishing resources and journal results"
```

---

## Task 4: Move the rod from collectible item to fixed lifeboat equipment

**Files:**

- Create: `src/world/lifeboatEquipmentManifest.ts`
- Modify: `src/game/itemCatalog.ts`
- Modify: `src/survival/itemDescriptions.ts`
- Modify: `src/survival/BoatInteraction.ts`
- Modify: `src/survival/BoatWorld.ts`
- Modify: `src/ui/SurvivalUI.ts`
- Modify: `src/ui/uiArtwork.ts`
- Modify: `src/styles/main.css`
- Modify: `src/world/BoatStorage.ts`
- Modify: `src/world/itemModelManifest.ts`
- Modify: `src/world/PropModelLibrary.ts`
- Modify: `scripts/check-item-models.mjs`
- Modify: `THIRD_PARTY_ASSETS.md`
- Modify: `tests/helpers/propModels.ts`
- Modify: `tests/ItemState.test.ts`
- Modify: `tests/ShipItemPlacement.test.ts`
- Modify: `tests/BoatStorage.test.ts`
- Modify: `tests/BoatInteraction.test.ts`
- Modify: `tests/BoatWorld.test.ts`
- Modify: `tests/SurvivalUI.test.ts`
- Modify: `tests/SurvivalPhaseFocus.test.ts`
- Modify: `tests/AssetPolicy.test.ts`
- Modify: `tests/itemModelAudit.test.ts`
- Modify: `tests/itemModelManifest.test.ts`
- Modify: `tests/itemModelPublication.test.ts`
- Modify: `tests/KenneyItemModels.test.ts`
- Modify: `tests/KenneyItemSources.test.ts`
- Modify: `tests/PropModelLibrary.test.ts`
- Modify: `tests/ProjectItemModels.test.ts`
- Modify: `tests/world.test.ts`

### Step 1: Write the failing item/equipment expectations

Update focused tests first to require:

- `ITEM_IDS` contains 18 types and excludes `fishingRod`.
- Spawn counts total 21; canned food remains 3, bait tins remain 2, and every other item remains 1.
- Dorothy placements/storage/artwork/descriptions expose no collectible rod.
- The model audit still includes `fishingRod.glb` as the one fixed equipment model.
- `ITEM_MODEL_SPECS` keys equal collectible `ITEM_IDS`, while `LIFEBOAT_EQUIPMENT_MODEL_SPECS` contains only `fishingRod`.
- `PropModelLibrary.createEquipment('fishingRod')` clones the normalized committed model independently of item instances.
- Every `BoatWorld`, even with `savedItems: []`, owns `lifeboat-equipment:fishingRod` at the bow and projects a fish action anchor.
- No saved prop anchor can represent a fishing rod.

### Step 2: Run the focused tests and confirm they fail

```text
bun run test -- tests/ItemState.test.ts tests/ShipItemPlacement.test.ts tests/BoatStorage.test.ts tests/itemModelManifest.test.ts tests/PropModelLibrary.test.ts tests/BoatWorld.test.ts
```

Expected: failures because the rod is still a collectible item and no equipment manifest/API exists.

### Step 3: Add the equipment model manifest

Create:

```ts
export const LIFEBOAT_EQUIPMENT_IDS = ['fishingRod'] as const;
export type LifeboatEquipmentId = typeof LIFEBOAT_EQUIPMENT_IDS[number];
export const LIFEBOAT_EQUIPMENT_MODEL_SPECS: Readonly<
  Record<LifeboatEquipmentId, RuntimeModelSpec>
>;
```

Extract the model-spec/provenance shapes and normalization helper from `itemModelManifest.ts` into exports reusable by the equipment manifest. Keep the existing local URL `src/assets/models/items/fishingRod.glb`; do not duplicate or download the binary. Move the rod's presentation and provenance entry from `ITEM_MODEL_SPECS` into `LIFEBOAT_EQUIPMENT_MODEL_SPECS`. It may continue reading the existing `fishingRod` row in `item-model-metadata.json`; that JSON describes generated binaries, while the TypeScript manifests define collectible versus equipment roles.

Generalize `PropModelLibrary` to load, validate, clone, and dispose collectible and equipment templates under separate typed maps:

```ts
create(instance: ItemInstance): Group;
createEquipment(id: LifeboatEquipmentId): Group;
static fromTemplatesForTest(
  itemTemplates: ReadonlyMap<ItemId, Group>,
  equipmentTemplates?: ReadonlyMap<LifeboatEquipmentId, Group>,
): PropModelLibrary;
```

The library remains the single owner of template geometry/material disposal. Returned clones continue sharing owned template resources.

### Step 4: Remove collectible-rod data and add a fixed tool anchor

Remove `fishingRod` from:

- `ITEM_IDS`, definitions, spawn counts, item day-action types, and placement category.
- `BoatStorage`, item descriptions, UI artwork, and item CSS.
- Dorothy placement/model assertions and saved-item fixtures.

Introduce a fixed-tool identity without pretending it is an `ItemId`:

```ts
export type BoatToolId = 'repairTools' | 'fishingRod';

export interface BoatInteractionAnchor {
  readonly id: string;
  readonly itemType: ItemId | null;
  readonly toolId: BoatToolId | null;
  // existing fields unchanged
}
```

Set `toolId: null` on saved-item anchors, `repairTools` on the repair anchor, and `fishingRod` on the fixed rod anchor. Add UI copy keyed by `BoatToolId`, so a null `itemType` is no longer assumed to mean repair tools. Use:

- ID: `fishing-tools`
- Label: `FISH`
- Description: `Cast from the bow to find food or drifting junk.`
- Cost: `1 ENERGY`
- Shortcut: `1`

Construct and position the equipment model once in `BoatWorld` near the front gunwale. Name its root `lifeboat-equipment:fishingRod`. Add it to the boat before projected anchors are queried. Remove discovery of `savedItems.find(type === 'fishingRod')`.

### Step 5: Keep the asset audit strict under the new role

In `scripts/check-item-models.mjs` distinguish:

```js
const COLLECTIBLE_ITEM_IDS = [/* 18 runtime IDs */];
const EQUIPMENT_MODEL_IDS = ['fishingRod'];
const MODEL_IDS = [...COLLECTIBLE_ITEM_IDS, ...EQUIPMENT_MODEL_IDS];
```

Compare runtime `ITEM_IDS` only with `COLLECTIBLE_ITEM_IDS`, but inspect directory contents, metadata, triangle totals, embedded resources, and ledger rows against `MODEL_IDS`. Update the fishingRod ledger role text from collectible item to fixed lifeboat equipment while preserving the Kenney URL, version, archive SHA-256, source recipe, 376-triangle measurement, license, and date.

Update the test helper to supply a distinct equipment template. Update all test fixtures that used a rod merely as a generic item to use a valid collectible such as `bucket` or `map`.

### Step 6: Run model, item, world, and UI tests

```text
bun run models:check
bun run test -- tests/ItemState.test.ts tests/ShipItemPlacement.test.ts tests/BoatStorage.test.ts tests/BoatInteraction.test.ts tests/itemModelAudit.test.ts tests/itemModelManifest.test.ts tests/itemModelPublication.test.ts tests/KenneyItemModels.test.ts tests/KenneyItemSources.test.ts tests/PropModelLibrary.test.ts tests/ProjectItemModels.test.ts tests/BoatWorld.test.ts tests/SurvivalUI.test.ts tests/SurvivalPhaseFocus.test.ts tests/AssetPolicy.test.ts tests/world.test.ts
bun run typecheck
```

Expected: pass; no binary asset is added or removed.

### Step 7: Commit

```text
git add -- src/game/itemCatalog.ts src/survival/itemDescriptions.ts src/survival/BoatInteraction.ts src/survival/BoatWorld.ts src/ui/SurvivalUI.ts src/ui/uiArtwork.ts src/styles/main.css src/world/BoatStorage.ts src/world/itemModelManifest.ts src/world/lifeboatEquipmentManifest.ts src/world/PropModelLibrary.ts scripts/check-item-models.mjs THIRD_PARTY_ASSETS.md tests
git commit -m "feat: make fishing rod fixed lifeboat equipment"
```

Before committing, inspect `git diff --cached --name-only` and unstage any unrelated user file. In particular, do not stage the pre-existing `.gitignore` modification.

---

## Task 5: Add wave-aligned fishing presentation to `BoatWorld`

**Files:**

- Create: `src/survival/FishingCatchLibrary.ts`
- Modify: `src/world/Lifeboat.ts`
- Modify: `src/survival/BoatWorld.ts`
- Modify: `tests/Lifeboat.test.ts`
- Modify: `tests/BoatWorld.test.ts`

### Step 1: Write failing world-presentation tests

Add tests for:

- The old placeholder `fishing-line` and `fishing-catch` meshes are removed from `createLifeboat()`; the fishing presentation is owned by `BoatWorld`.
- `enterFishingView()` reaches the authored bow camera pose after explicit updates; `exitFishingView()` returns exactly to the normal pose.
- Reduced motion switches between stable endpoints through the UI-controlled fade contract and minimizes rod/catch motion.
- `castFishingAtScreenPoint(x, y, width, height)` returns `null` outside the bounded plane and an immutable world `{x,z}` inside it.
- `centeredFishingCast()` returns a valid authored point.
- The cast animation moves the rod/line/bobber and resolves from explicit `update(delta)` calls without timers.
- Bobber, splash, bubbles, and projected bite target share the cast `x/z` and sample the injected/shared `WaveField` height each frame.
- Every approved catch ID maps to the correct reusable family template; species dimensions/colors produce distinct bounds without per-frame geometry creation.
- Reel and miss presentations reset rod, line, bobber, bubbles, catch, and camera.
- Dispose during entering, casting, waiting, bite, reel, miss, and return is idempotent and disposes geometry/material/listeners exactly once.

Use fake dimensions and existing test helpers; do not assert fragile pixel-perfect transforms.

### Step 2: Run focused tests and confirm they fail

```text
bun run test -- tests/Lifeboat.test.ts tests/BoatWorld.test.ts
```

Expected: failures for missing dedicated fishing APIs and catch library.

### Step 3: Implement the catch template owner

`FishingCatchLibrary` creates templates once for:

- ordinary fish;
- flatfish;
- crab;
- squid;
- swordfish;
- seaweed;
- boot;
- plastic bottle.

Build project-authored low-poly meshes with Three.js primitives, `BufferGeometry` where needed, and flat-shaded materials. Apply `FishingAppearance` dimensions and colors when preparing a catch, but reuse family geometry/material pools rather than constructing inside `update()`. Public API:

```ts
prepare(catchId: FishingCatchId): Object3D;
hide(): void;
dispose(): void;
```

The library owns every geometry/material it creates and disposes once. It does not choose catches or mutate survival state.

### Step 4: Implement explicit fishing presentation commands

Add a dedicated presentation state separate from generic event cues. Suggested public API:

```ts
enterFishingView(): Promise<void>;
castFishingAtScreenPoint(
  clientX: number,
  clientY: number,
  viewportWidth: number,
  viewportHeight: number,
): FishingCastPoint | null;
centeredFishingCast(): FishingCastPoint;
playFishingCast(point: FishingCastPoint): Promise<void>;
showFishingWaiting(point: FishingCastPoint): void;
showFishingBite(point: FishingCastPoint): void;
projectFishingBite(width: number, height: number): ProjectedBoatBounds;
playFishingReel(catchId: FishingCatchId): Promise<void>;
playFishingMiss(): Promise<void>;
exitFishingView(): Promise<void>;
clearFishingPresentation(): void;
```

Promises are animation completion handles advanced and settled by `BoatWorld.update()`; never use timers. Resolve outstanding handles safely on dispose so `SurvivalPhase` cannot hang.

Implementation details:

- Keep camera normal/bow positions and look targets as preallocated vectors and interpolate with eased explicit progress over about one second.
- Keep one reusable `Raycaster`, interaction plane, matrices, vectors, and projection result scratch objects.
- Author the invisible plane in the bow-view frustum and reject points outside its local bounds.
- Store cast horizontal coordinates in boat/world space consistently; on each update call the existing shared wave field used by ocean and buoyancy to set vertical placement.
- Create fixed pools for splash particles/bubbles/ripple rings at construction and toggle/reposition them.
- Use a small preallocated line representation whose points are updated in place for the cast arc and taut/slack reel.
- Preserve the ordinary boat/camera buoyancy inheritance.
- If reduced motion is active, use endpoint camera poses and minimal rod/catch movement; timing rules remain in `FishingSession` and do not change.

### Step 5: Run world tests

```text
bun run test -- tests/WaveField.test.ts tests/Lifeboat.test.ts tests/BoatWorld.test.ts
```

Expected: pass.

### Step 6: Commit

```text
git add -- src/survival/FishingCatchLibrary.ts src/survival/BoatWorld.ts src/world/Lifeboat.ts tests/Lifeboat.test.ts tests/BoatWorld.test.ts
git commit -m "feat: add animated lifeboat fishing presentation"
```

---

## Task 6: Replace the bait dialog with accessible fishing interaction UI

**Files:**

- Modify: `src/ui/SurvivalUI.ts`
- Modify: `src/styles/main.css`
- Modify: `tests/SurvivalUI.test.ts`

### Step 1: Write failing UI tests

Remove the bait-choice-dialog tests and add tests that:

- Rod click and shortcut `1` emit `onAction('fish')` once without an option, regardless of bait.
- The action card/hotspot says `FISH`, `1 ENERGY`, and explains automatic bait use.
- Fishing states render exact instructions: `CLICK THE WATER TO CAST`, `WAIT FOR A BITE`, `BITE - REEL NOW`, and the named result or `IT GOT AWAY`.
- A pointer click in aiming forwards root-relative coordinates once; clicks in other states do nothing.
- `Enter`/`Space` in aiming emits the centered-cast intent; in bite emits reel; in waiting/result does neither.
- The projected bite button follows supplied bounds, receives focus at bite, has an urgent accessible label, and emits one reel intent despite repeat/click races.
- Unrelated anchors/actions become inert while fishing, but Escape still invokes pause.
- Pausing above fishing restores the correct fishing layer/focus after resume.
- Live announcements happen only on state/message changes, not on every projected-position update.
- Reduced-motion fade covers/un-covers the view and reports transition completion without depending on CSS animation events.
- Disposal removes listeners and clears inert/focus state.

### Step 2: Run the UI test and confirm it fails

```text
bun run test -- tests/SurvivalUI.test.ts
```

Expected: failures because the bait dialog still exists and the fishing overlay API is absent.

### Step 3: Define the UI-facing fishing contract

Add:

```ts
export type FishingUiMode =
  | 'hidden' | 'aiming' | 'waiting' | 'bite' | 'result';

export interface FishingUiState {
  readonly mode: FishingUiMode;
  readonly message: string;
  readonly biteTarget: ProjectedBoatBounds | null;
}
```

Callbacks:

```ts
onFishingCast: ((point: { readonly x: number; readonly y: number } | null) => void) | null;
onFishingReel: (() => void) | null;
```

Methods:

```ts
setFishingState(state: FishingUiState): void;
setFishingFade(covered: boolean): Promise<void>;
```

`null` cast point means the centered keyboard cast. Cache the last rendered mode/message/target so normal updates do not churn DOM or accessibility announcements.

### Step 4: Implement markup, styling, input, and focus

- Delete the fishing options dialog, `availableBait`, option buttons, and `chooseFishingOption()`.
- Add a full-viewport fishing layer containing a subtle valid-water reticle, compact instruction, `aria-live` region, and real projected bite button.
- Keep the layer hidden/inert outside fishing.
- Convert `clientX/clientY` to mount-local coordinates before forwarding.
- Treat repeated keys and duplicate pointer/click events idempotently at the UI boundary.
- Preserve the existing accessible-unavailable behavior: the rod remains focusable with `aria-disabled="true"` and a reason when energy/state blocks it.
- Keep Escape routed through the existing pause callback before fishing input handling.
- Add a short opacity fade class for reduced motion. Resolve `setFishingFade()` via the UI's existing transition/fallback mechanism, not an unbounded listener.

### Step 5: Run UI tests

```text
bun run test -- tests/SurvivalUI.test.ts tests/SurvivalPhaseFocus.test.ts
```

Expected: pass.

### Step 6: Commit

```text
git add -- src/ui/SurvivalUI.ts src/styles/main.css tests/SurvivalUI.test.ts tests/SurvivalPhaseFocus.test.ts
git commit -m "feat: add accessible fishing interaction UI"
```

---

## Task 7: Orchestrate fishing through `SurvivalPhase`

**Files:**

- Modify: `src/survival/SurvivalPhase.ts`
- Modify: `src/survival/survivalTypes.ts`
- Modify: `src/survival/SurvivalSession.ts`
- Modify: `src/ui/SurvivalUI.ts`
- Modify: `tests/SurvivalPhase.test.ts`
- Modify: `tests/SurvivalPhaseFocus.test.ts`
- Modify: `tests/SurvivalSession.test.ts`

### Step 1: Write failing phase-integration tests

Replace generic fish-cue tests with deterministic orchestration tests for:

- Rejected start shows ordinary feedback and never moves camera or locks commands.
- Accepted start commits one energy before camera travel, locks unrelated commands, and enters aiming after the camera settles.
- Mouse outside-water casts are ignored; valid mouse cast and centered keyboard cast call `attempt.cast()`, animate, then `completeCast()`.
- `update(delta)` advances the attempt only while phase is active, visible, unpaused, and not covered by a blocking overlay.
- Waiting-to-bite updates bubbles/UI at the exact stored point and focuses the target.
- Reel commits `finishFishing()` before catch presentation; miss commits before miss presentation.
- Rapid duplicate reel/cast input cannot duplicate food, bait consumption, journal rows, animation, or day events.
- Other action callbacks, anchors, repair flow, end day, and events are ignored during the locked sequence.
- A scheduled daytime event is requested only after catch/miss presentation and camera return.
- Escape pause and visibility suspension freeze the 1.5-second window.
- Resize reprojects the target without changing attempt time or cast coordinates.
- Restart/dispose at every state settles pending world/UI work and schedules no later callbacks.
- Normal and reduced-motion flows use the same gameplay timing and results.

Use fake session/world/UI collaborators with manually resolved animation handles. Assert ordering with a call log, especially:

```text
finishFishing -> render committed snapshot -> play result -> exit camera -> unlock -> request day event
```

### Step 2: Run phase tests and confirm they fail

```text
bun run test -- tests/SurvivalPhase.test.ts tests/SurvivalPhaseFocus.test.ts
```

Expected: failures because `SurvivalPhase` still delegates fish to `perform()` and generic `world.play()`.

### Step 3: Add the active-attempt orchestration

Add private phase state for:

- current `FishingSession | null`;
- current presentation substate;
- one settlement-in-progress flag;
- whether a post-action day event is pending;
- generation/disposed guard for awaited animation completion.

Route fish action separately:

```ts
if (action === 'fish') {
  void this.beginFishing();
  return;
}
```

Flow:

1. Call `session.beginFishing()`.
2. If rejected, render feedback and stop.
3. If accepted, set command lock, render the spent energy, make UI fishing-active, and enter the bow view.
4. Enable aiming only after the view completes.
5. On a valid cast, call `attempt.cast(point)`, play cast, call `completeCast()`, then show waiting.
6. In active `update(delta)`, advance the attempt and react once to `bite` or `missed` state entry.
7. On reel, call `attempt.reel()`. If accepted, immediately call `session.finishFishing(attempt.id, result)` and render the committed snapshot before `playFishingReel()`.
8. On expiry, finish with miss before `playFishingMiss()`.
9. Complete reel state, show result, exit camera, clear presentation/UI, release command lock, then request the normal daytime event.

All awaited continuations must verify phase generation/disposed state before touching UI/session/world.

### Step 4: Remove transitional option/cue compatibility

- Remove `{ kind: 'fishing'; useBait: boolean }` from `DayActionOption`.
- Replace the `perform()` action parameter with `Exclude<DayActionId, 'fish'>`; the phase handles the fishing start before calling it, so instant fishing cannot be invoked through the resource-action API.
- Keep `'fish'` in `PresentationCue` only for the existing School of Fish/Anglerfish event presentation. Remove all use of that generic cue from the player fishing action; dedicated fishing world methods own the rod, line, bobber, bubbles, and catch sequence.
- Update `SurvivalUI.onAction` and all fixtures to pass options only for repair actions.

### Step 5: Run all fishing and phase tests

```text
bun run test -- tests/fishingCatalog.test.ts tests/FishingSession.test.ts tests/SurvivalSession.test.ts tests/survivalJournal.test.ts tests/BoatWorld.test.ts tests/SurvivalUI.test.ts tests/SurvivalPhase.test.ts tests/SurvivalPhaseFocus.test.ts tests/survivalEvents.test.ts
bun run typecheck
```

Expected: pass.

### Step 6: Commit

```text
git add -- src/survival/SurvivalPhase.ts src/survival/survivalTypes.ts src/survival/SurvivalSession.ts src/ui/SurvivalUI.ts tests/SurvivalPhase.test.ts tests/SurvivalPhaseFocus.test.ts tests/SurvivalSession.test.ts
git commit -m "feat: orchestrate interactive survival fishing"
```

---

## Task 8: Update player documentation and perform complete verification

**Files:**

- Modify: `README.md`
- Modify if required by discovered omissions: tests and source files already listed above

### Step 1: Update documentation

Document:

- The rod is permanent lifeboat equipment, not a Dorothy collectible.
- Fishing costs one energy.
- Click water to cast; `Enter`/`Space` use the centered cast and reel at a bite.
- Bait is automatic and consumed only on landed fish.
- Bubbles signal the 1.5-second reel window.
- Escape pauses without refunding/cancelling the attempt.

Remove all copy that says fishing requires a recovered rod or asks the player to choose bait.

### Step 2: Run repository-wide static and automated verification

Run each command separately and inspect the complete output:

```text
bun run models:check
bun run test
bun run typecheck
bun run build
```

Expected: all pass. If any command fails, use `superpowers:systematic-debugging`, add a regression test for the root cause, and rerun all four commands.

Also run:

```text
rg -n "no-fishing-rod|recovered fishing rod|FISH WITHOUT BAIT|FISH WITH BAIT|item-artwork--fishingRod" src tests README.md
```

Expected: no stale collectible/bait-choice copy.

Run:

```text
git diff --check
git status --short
```

Expected: no whitespace errors and only intended feature changes plus the user's pre-existing unstaged `.gitignore` modification.

### Step 3: Perform browser QA in both phases

Start the local app using the repository's existing development command. Use `browser:control-in-app-browser` because this is local visual and interaction verification. Check 1280x720 and 1920x1080, and record the observed result for:

- Dorothy has 18 collectible types/21 pickups and no rod.
- Every survival run has the fixed bow rod.
- Calm, overcast, and squall fishing.
- Baited fish, unbaited fish, junk, and miss (use deterministic test hooks only if already supported; do not ship a debug UI).
- Mouse casts near each edge of the valid area and outside clicks are ignored.
- Keyboard-only start, centered cast, reel, pause, and resume.
- Early/late 3-7-second bites and half-open 1.5-second reaction boundary.
- Camera enter/return, cast arc, wave-following bobber, bubbles, catch reveal, and clean reset.
- `prefers-reduced-motion` fade and minimized motion.
- Pause, hidden-tab resume, resize, restart, and disposal during each state.
- Day event opens only after return and journal names the result.

Inspect console output for uncaught errors and resource/lifecycle warnings.

### Step 4: Request code review

Use `superpowers:requesting-code-review` against the complete feature diff. Resolve correctness issues with tests before proceeding. Do not broaden scope for optional polish.

### Step 5: Rerun final verification after review fixes

```text
bun run models:check
bun run test
bun run typecheck
bun run build
git diff --check
```

Expected: all pass on the final tree.

### Step 6: Commit final docs/fixes

```text
git add -- README.md
git add -- <only any reviewed source/test files actually changed>
git commit -m "docs: document interactive survival fishing"
```

Before claiming completion, use `superpowers:verification-before-completion` and cite the fresh command results and browser QA. Then use `superpowers:finishing-a-development-branch` to offer integration choices.

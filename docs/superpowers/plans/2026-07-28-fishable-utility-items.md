# Fishable Utility Items Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Bait, Wet Duct Tape, Broken Compass, Torn Fishing Net, and Energy Bar to deterministic fishing with correct rewards, uniqueness, conditions, physical presentation, and journal/UI copy.

**Architecture:** `fishingCatalog.ts` becomes the single typed source for catch rewards and model sources. `FishingSession` filters unique utility catches using a snapshot of active inventory, while `SurvivalSession` applies resource or condition-aware item rewards. `FishingCatchLibrary` owns temporary reel models independently from the persistent boat supply display.

**Tech Stack:** TypeScript 5.9, Three.js 0.180, Vitest 3.2, Vite 7.1, Bun

## Global Constraints

- Preserve deterministic selection through the injected `RandomSource`.
- Bait has weight `5`, minimum day `0`, and awards `+1 Bait`.
- Wet Duct Tape has weight `5`, minimum day `3`, and awards usable Duct Tape.
- Broken Compass has weight `5`, minimum day `0`, and awards broken Compass.
- Torn Fishing Net has weight `3`, minimum day `0`, and awards broken Fishing Net.
- Energy Bar has weight `8`, minimum day `0`, and awards a usable Energy Bar.
- Utility catches award no Food, consume no Bait, and receive no Bait weight multiplier.
- Bait is stackable.
- Duct Tape, Compass, Fishing Net, and Energy Bar are ineligible while a usable or broken matching item exists; consumed or lost items restore eligibility.
- Do not add an inventory panel or reduced-motion behavior.
- Keep render-independent rules in `src/survival`; every temporary Three.js resource has one owner and is disposed once.
- Reuse the existing locally committed item models and the existing physical boat supply display.

## File Map

- Modify `src/survival/fishingCatalog.ts`: typed rewards, utility entries, validation, and unique-reward filtering.
- Modify `src/survival/FishingSession.ts`: accept active unique item types during hidden-catch selection.
- Modify `src/survival/inventory.ts`: condition-aware guarded gain.
- Modify `src/survival/SurvivalSession.ts`: snapshot unique ownership and apply utility rewards.
- Modify `src/survival/journal.ts`: represent and format utility fishing records.
- Create `src/survival/itemConditionAppearance.ts`: shared broken-material treatment.
- Modify `src/survival/BoatSupplyDisplay.ts`: consume the shared condition treatment.
- Modify `src/survival/FishingCatchLibrary.ts`: load item models for utility catches and apply catch condition.
- Modify `src/survival/SurvivalPhase.ts`: utility-specific result captions.
- Modify `tests/FishingCatalog.test.ts`: exact catalog, weighting, filtering, and validation contracts.
- Modify `tests/FishingSession.test.ts`: hidden utility selection with owned-item exclusions.
- Modify `tests/survivalInventory.test.ts`: initial-condition gain and uniqueness.
- Modify `tests/SurvivalSession.test.ts`: reward, condition, Bait, uniqueness, and journal integration.
- Create `tests/survivalJournal.test.ts`: utility fishing journal copy.
- Modify `tests/FishingCatchLibrary.test.ts`: item-model source, broken treatment, fallback, and disposal.
- Modify `tests/PolyPizzaFishingModels.test.ts`: distinguish fishing-model entries from utility item-model entries.
- Modify `tests/SurvivalPhase.test.ts`: utility result copy and physical target.
- Modify `README.md`: document fishable utility salvage.

---

### Task 1: Typed Utility Catch Catalog

**Files:**
- Modify: `src/survival/fishingCatalog.ts`
- Create: `tests/FishingCatalog.test.ts`
- Modify: `tests/PolyPizzaFishingModels.test.ts`

**Interfaces:**
- Consumes: `ItemId` from `src/game/ItemState.ts`.
- Produces:
  - `FishingCatchKind = 'fish' | 'junk' | 'utility'`
  - `FishingCatchReward`
  - `FishingCatchPresentation`
  - `eligibleFishingCatches(day, capturedBait, activeItemIds?)`
  - `selectFishingCatch(day, capturedBait, roll, activeItemIds?)`
  - `fishingCatchFood(catchDefinition)`

- [ ] **Step 1: Write failing catalog tests**

Create `tests/FishingCatalog.test.ts` with:

```ts
import { describe, expect, it } from 'vitest';
import {
  FISHING_CATCHES,
  eligibleFishingCatches,
  fishingCatchFood,
  selectFishingCatch,
  validateCatalog,
} from '../src/survival/fishingCatalog';

describe('fishing utility catalog', () => {
  it('encodes the exact utility catch contracts', () => {
    expect(FISHING_CATCHES.filter(({ kind }) => kind === 'utility')).toMatchObject([
      {
        id: 'bait', label: 'Bait', baseWeight: 5, minimumDay: 0,
        reward: { kind: 'bait', amount: 1 },
        presentation: { kind: 'item', itemId: 'baitTin', condition: 'usable' },
      },
      {
        id: 'wetDuctTape', label: 'Wet Duct Tape', baseWeight: 5, minimumDay: 3,
        reward: { kind: 'item', itemId: 'ductTape', condition: 'usable', unique: true },
      },
      {
        id: 'brokenCompass', label: 'Broken Compass', baseWeight: 5, minimumDay: 0,
        reward: { kind: 'item', itemId: 'compass', condition: 'broken', unique: true },
      },
      {
        id: 'tornFishingNet', label: 'Torn Fishing Net', baseWeight: 3, minimumDay: 0,
        reward: { kind: 'item', itemId: 'fishingNet', condition: 'broken', unique: true },
      },
      {
        id: 'energyBar', label: 'Energy Bar', baseWeight: 8, minimumDay: 0,
        reward: { kind: 'item', itemId: 'energyBar', condition: 'usable', unique: true },
      },
    ]);
  });

  it('does not boost utilities with bait or report them as food', () => {
    const plain = new Map(eligibleFishingCatches(3, false).map(({ catch: entry, weight }) => [entry.id, weight]));
    const baited = new Map(eligibleFishingCatches(3, true).map(({ catch: entry, weight }) => [entry.id, weight]));
    for (const id of ['bait', 'wetDuctTape', 'brokenCompass', 'tornFishingNet', 'energyBar'] as const) {
      expect(baited.get(id)).toBe(plain.get(id));
      expect(fishingCatchFood(FISHING_CATCHES.find((entry) => entry.id === id)!)).toBe(0);
    }
  });

  it('filters active unique utilities but not stackable bait', () => {
    const active = new Set(['ductTape', 'compass', 'fishingNet', 'energyBar'] as const);
    const ids = eligibleFishingCatches(3, false, active).map(({ catch: entry }) => entry.id);
    expect(ids).toContain('bait');
    expect(ids).not.toEqual(expect.arrayContaining([
      'wetDuctTape', 'brokenCompass', 'tornFishingNet', 'energyBar',
    ]));
  });

  it('keeps stable exact-weight boundaries', () => {
    expect(selectFishingCatch(3, false, 380 / 406).id).toBe('bait');
    expect(selectFishingCatch(3, false, 385 / 406).id).toBe('wetDuctTape');
    expect(selectFishingCatch(3, false, 390 / 406).id).toBe('brokenCompass');
    expect(selectFishingCatch(3, false, 395 / 406).id).toBe('tornFishingNet');
    expect(selectFishingCatch(3, false, 398 / 406).id).toBe('energyBar');
  });

  it('rejects broken rewards for non-breakable items', () => {
    const invalid = [{
      ...FISHING_CATCHES.find(({ id }) => id === 'energyBar')!,
      reward: { kind: 'item', itemId: 'energyBar', condition: 'broken', unique: true },
    }];
    expect(() => validateCatalog(invalid)).toThrow(/energyBar.*breakable/i);
  });
});
```

- [ ] **Step 2: Run the catalog test to verify RED**

Run:

```powershell
bun run test -- tests/FishingCatalog.test.ts
```

Expected: FAIL because utility catch types, entries, and the active-item filtering parameter do not exist.

- [ ] **Step 3: Implement typed rewards and presentations**

In `src/survival/fishingCatalog.ts`, add:

```ts
import {
  ITEM_DEFINITIONS,
  type ItemId,
} from '../game/ItemState';
import type { ItemCondition } from './survivalTypes';

export type FishingCatchKind = 'fish' | 'junk' | 'utility';
export type FishingItemCondition = Extract<ItemCondition, 'usable' | 'broken'>;

export type FishingCatchReward =
  | { readonly kind: 'food'; readonly amount: 1 | 2 }
  | { readonly kind: 'bait'; readonly amount: 1 }
  | {
      readonly kind: 'item';
      readonly itemId: ItemId;
      readonly condition: FishingItemCondition;
      readonly unique: true;
    }
  | { readonly kind: 'none' };

export type FishingCatchPresentation =
  | {
      readonly kind: 'fishing';
      readonly family: FishingModelFamily;
      readonly appearance: FishingAppearance;
    }
  | {
      readonly kind: 'item';
      readonly itemId: ItemId;
      readonly condition: FishingItemCondition;
    };
```

Replace the `food`, `family`, and `appearance` fields on `FishingCatchDefinition`
with `reward` and `presentation`. Extend `FishingCatchSize` with `'utility'`.
Append the five utility rows in the order from the test so the documented total
day-3 unbaited weight is `406`.

Add:

```ts
export function fishingCatchFood(catchDefinition: FishingCatchDefinition): 0 | 1 | 2 {
  return catchDefinition.reward.kind === 'food' ? catchDefinition.reward.amount : 0;
}

function isBlockedUniqueReward(
  catchDefinition: FishingCatchDefinition,
  activeItemIds: ReadonlySet<ItemId>,
): boolean {
  return catchDefinition.reward.kind === 'item'
    && catchDefinition.reward.unique
    && activeItemIds.has(catchDefinition.reward.itemId);
}
```

Update `baitWeight` to multiply only `catchDefinition.kind === 'fish'`.
Default the new `activeItemIds` parameter to an empty read-only set and filter
blocked unique rewards before mapping weights.

Export `validateCatalog` and add:

```ts
if (
  catchDefinition.reward.kind === 'item'
  && catchDefinition.reward.condition === 'broken'
  && !ITEM_DEFINITIONS[catchDefinition.reward.itemId].breakable
) {
  throw new Error(
    `${catchDefinition.reward.itemId} fishing reward must reference a breakable item`,
  );
}
```

- [ ] **Step 4: Update the fishing-model contract test**

In `tests/PolyPizzaFishingModels.test.ts`, replace the equality between all catch
IDs and `EXPECTED_IDS` with:

```ts
expect(
  FISHING_CATCHES
    .filter(({ presentation }) => presentation.kind === 'fishing')
    .map(({ id }) => id),
).toEqual(EXPECTED_IDS);
```

Update the food assertions to:

```ts
expect(catalog.get('tuna')).toMatchObject({
  reward: { kind: 'food', amount: 2 },
  size: 'large',
});
expect(catalog.get('squid')).toMatchObject({
  reward: { kind: 'food', amount: 2 },
  size: 'large',
});
```

- [ ] **Step 5: Run focused tests to verify GREEN**

Run:

```powershell
bun run test -- tests/FishingCatalog.test.ts tests/PolyPizzaFishingModels.test.ts
```

Expected: both files pass.

- [ ] **Step 6: Commit the catalog**

```powershell
git add src/survival/fishingCatalog.ts tests/FishingCatalog.test.ts tests/PolyPizzaFishingModels.test.ts
git commit -m "feat: add utility fishing catalog"
```

---

### Task 2: Unique Condition-Aware Fishing Rewards

**Files:**
- Modify: `src/survival/inventory.ts`
- Modify: `src/survival/FishingSession.ts`
- Modify: `src/survival/SurvivalSession.ts`
- Modify: `src/survival/journal.ts`
- Modify: `tests/survivalInventory.test.ts`
- Modify: `tests/FishingSession.test.ts`
- Modify: `tests/SurvivalSession.test.ts`
- Create: `tests/survivalJournal.test.ts`

**Interfaces:**
- Consumes: `FishingCatchReward`, `FishingItemCondition`, and active-item-aware
  `selectFishingCatch` from Task 1.
- Produces:
  - `SurvivalInventoryState.gain(type, condition?)`
  - `FishingSessionOptions.activeItemIds`
  - `JournalFishingRecord.result = 'fish' | 'utility' | 'junk' | 'miss'`

- [ ] **Step 1: Write failing guarded-gain tests**

Append to `tests/survivalInventory.test.ts`:

```ts
it('gains a unique item directly in its declared condition', () => {
  const inventory = new SurvivalInventoryState([]);
  expect(inventory.gain('compass', 'broken')).toBe('compass-1');
  expect(inventory.snapshot()['compass-1']).toEqual({
    instanceId: 'compass-1', type: 'compass', condition: 'broken',
  });
  expect(inventory.gain('compass', 'usable')).toBeNull();
});

it('reuses consumed or lost unique slots without duplicating them', () => {
  const inventory = new SurvivalInventoryState(saved('ductTape', 'fishingNet'));
  inventory.consume('ductTape');
  inventory.lose('fishingNet-1');
  expect(inventory.gain('ductTape', 'usable')).toBe('ductTape-1');
  expect(inventory.gain('fishingNet', 'broken')).toBe('fishingNet-1');
  expect(Object.values(inventory.snapshot()).filter(({ type }) => type === 'fishingNet')).toHaveLength(1);
});
```

- [ ] **Step 2: Write failing fishing-session exclusion test**

Append to `tests/FishingSession.test.ts`:

```ts
it('removes active unique utility rewards before drawing the hidden catch', () => {
  const session = new FishingSession({
    id: 'attempt-1',
    day: 3,
    capturedBait: false,
    activeItemIds: new Set(['ductTape', 'compass', 'fishingNet', 'energyBar']),
    random: sequenceRandom([0, 0.999999]),
  });
  castToWaiting(session);
  session.advance(session.snapshot().biteDelaySeconds);
  expect(session.reel()).toMatchObject({
    result: { kind: 'catch', catch: { id: 'bait' } },
  });
});
```

- [ ] **Step 3: Write failing reward integration tests**

Add a table-driven test to `tests/SurvivalSession.test.ts` that forces each
utility catch by selecting its day-3 unbaited boundary:

```ts
it.each([
  ['bait', 380 / 406, {}, { bait: 1 }, undefined],
  ['wetDuctTape', 385 / 406, {}, {}, ['ductTape-1', 'usable']],
  ['brokenCompass', 390 / 406, {}, {}, ['compass-1', 'broken']],
  ['tornFishingNet', 395 / 406, {}, {}, ['fishingNet-1', 'broken']],
  ['energyBar', 398 / 406, {}, {}, ['energyBar-1', 'usable']],
] as const)('applies the %s utility reward', (
  catchId, catchRoll, deltas, snapshotMatch, item,
) => {
  const session = new SurvivalSession([], {
    seed: 1,
    initial: { day: 3 },
    random: sequenceRandom([0, catchRoll]),
  });
  const attempt = beginFishing(session);
  const result = reelCatch(attempt);
  expect(result).toMatchObject({ kind: 'catch', catch: { id: catchId, kind: 'utility' } });
  expect(session.finishFishing(attempt.snapshot().id, result)).toMatchObject({
    accepted: true, code: 'utility-caught', deltas,
  });
  expect(session.snapshot()).toMatchObject(snapshotMatch);
  if (item) {
    expect(session.snapshot().inventory[item[0]]?.condition).toBe(item[1]);
  }
});
```

Add separate assertions that a captured Bait is not consumed for a utility
catch, and that a usable or broken owned unique utility makes the same roll
select another eligible entry. After consuming or losing that item, assert it
returns to `eligibleFishingCatches`.

```ts
it('does not spend captured bait when bait itself is caught', () => {
  const session = new SurvivalSession(
    saved('baitTin', 'ductTape', 'compass', 'fishingNet', 'energyBar'),
    {
      seed: 1,
      initial: { day: 3 },
      random: sequenceRandom([0, 558 / 563]),
    },
  );
  const attempt = beginFishing(session);
  const result = reelCatch(attempt);
  expect(result).toMatchObject({ kind: 'catch', catch: { id: 'bait' } });
  expect(session.finishFishing(attempt.snapshot().id, result)).toMatchObject({
    code: 'utility-caught',
    deltas: { bait: 1 },
  });
  expect(session.snapshot()).toMatchObject({ bait: 2, recoveredBait: 1 });
});
```

In `tests/survivalInventory.test.ts`, verify eligibility follows conditions:

```ts
it('restores unique fishing eligibility only after loss or consumption', () => {
  const inventory = new SurvivalInventoryState(saved('compass', 'ductTape'));
  const activeIds = () => new Set(
    Object.values(inventory.snapshot())
      .filter((item) => item?.condition === 'usable' || item?.condition === 'broken')
      .map((item) => item!.type),
  );
  expect(eligibleFishingCatches(3, false, activeIds()).map(({ catch: entry }) => entry.id))
    .not.toEqual(expect.arrayContaining(['brokenCompass', 'wetDuctTape']));
  inventory.lose('compass-1');
  inventory.consume('ductTape');
  expect(eligibleFishingCatches(3, false, activeIds()).map(({ catch: entry }) => entry.id))
    .toEqual(expect.arrayContaining(['brokenCompass', 'wetDuctTape']));
});
```

Also lock the wiki event-breakable roster:

```ts
expect(
  ITEM_IDS.filter((id) => ITEM_DEFINITIONS[id].breakable),
).toEqual([
  'compass', 'map', 'spyglass', 'fishingNet', 'bucket',
  'scubaSet', 'anchor', 'umbrella', 'swimRing',
]);
```

- [ ] **Step 4: Run reward tests to verify RED**

Run:

```powershell
bun run test -- tests/survivalInventory.test.ts tests/FishingSession.test.ts tests/SurvivalSession.test.ts
```

Expected: FAIL on the new `gain` signature, missing `activeItemIds`, and absent
utility reward application.

- [ ] **Step 5: Implement condition-aware gain**

Change `SurvivalInventoryState.gain` to:

```ts
gain(
  type: ItemId,
  condition: Extract<ItemCondition, 'usable' | 'broken'> = 'usable',
): ItemInstanceId | null {
  if (condition === 'broken' && !ITEM_DEFINITIONS[type].breakable) {
    throw new Error(`${type} cannot be gained broken`);
  }
  const instanceId = `${type}-1` as ItemInstanceId;
  const existing = this.items.get(instanceId);
  if (existing === undefined) {
    this.items.set(instanceId, { instanceId, type, condition });
    return instanceId;
  }
  if (existing.condition === 'consumed' || existing.condition === 'lost') {
    this.setCondition(instanceId, condition);
    return instanceId;
  }
  return null;
}
```

- [ ] **Step 6: Pass active unique ownership into fishing**

Add `readonly activeItemIds?: ReadonlySet<ItemId>` to
`FishingSessionOptions` and pass it to `selectFishingCatch`.

In `SurvivalSession.beginFishing`, compute:

```ts
const activeItemIds = new Set(
  Object.values(this.inventory.snapshot())
    .filter((item) => item?.condition === 'usable' || item?.condition === 'broken')
    .map((item) => item!.type),
);
```

Pass `activeItemIds` into the new `FishingSession`.

- [ ] **Step 7: Apply typed rewards**

In `SurvivalSession.finishFishing`, replace `isFish`/`catch.food` branching with:

```ts
const reward = result.kind === 'catch' ? result.catch.reward : { kind: 'none' as const };
const food = reward.kind === 'food' ? reward.amount : 0;
const baitConsumed = reward.kind === 'food' && transaction.capturedBait;
const deltas: ResourceDelta = {};
if (food > 0) deltas.food = food;
if (reward.kind === 'bait') deltas.bait = reward.amount;
if (baitConsumed) deltas.bait = -1;
if (reward.kind === 'item') {
  const gained = this.inventory.gain(reward.itemId, reward.condition);
  if (gained === null) {
    throw new Error(`Fishing reward would duplicate active ${reward.itemId}`);
  }
}
```

Because inventory cannot mutate during an active attempt, the defensive
invariant is unreachable in ordinary play but protects the one-item rule.

Use `utility-caught` for utility results and record `result: 'utility'`.

- [ ] **Step 8: Format utility journal entries**

Expand `JournalFishingRecord.result` with `'utility'`. In `formatFishing`, add:

```ts
if (record.result === 'utility') {
  sentence = `I reeled in ${label} and brought it aboard.`;
} else if (record.result === 'junk') {
  sentence = `I reeled in ${label}, but it was no use.`;
} else {
  sentence = `I caught a ${label} and gained ${record.food === 1 ? 'one' : 'two'} food.`;
}
```

Create `tests/survivalJournal.test.ts` with:

```ts
import { describe, expect, it } from 'vitest';
import { formatJournalEntry } from '../src/survival/journal';

describe('survival journal fishing copy', () => {
  it('records utility salvage without calling it food or junk', () => {
    expect(formatJournalEntry({
      day: 3,
      weather: 'calm',
      actions: [{
        kind: 'fishing',
        attemptId: 'fishing-3-1',
        result: 'utility',
        catchId: 'brokenCompass',
        catchLabel: 'Broken Compass',
        food: 0,
        baitConsumed: false,
      }],
      daytime: null,
      nighttime: { kind: 'quiet' },
    }).daytime).toContain(
      'I reeled in broken compass and brought it aboard.',
    );
  });
});
```

- [ ] **Step 9: Run reward tests to verify GREEN**

Run:

```powershell
bun run test -- tests/survivalInventory.test.ts tests/FishingSession.test.ts tests/SurvivalSession.test.ts tests/survivalJournal.test.ts
```

Expected: all focused tests pass.

- [ ] **Step 10: Commit reward integration**

```powershell
git add src/survival/inventory.ts src/survival/FishingSession.ts src/survival/SurvivalSession.ts src/survival/journal.ts tests/survivalInventory.test.ts tests/FishingSession.test.ts tests/SurvivalSession.test.ts tests/survivalJournal.test.ts
git commit -m "feat: award unique fishing utilities"
```

---

### Task 3: Utility Reel Models and Shared Broken Treatment

**Files:**
- Create: `src/survival/itemConditionAppearance.ts`
- Modify: `src/survival/BoatSupplyDisplay.ts`
- Modify: `src/survival/FishingCatchLibrary.ts`
- Modify: `tests/FishingCatchLibrary.test.ts`
- Modify: `tests/BoatWorld.test.ts`

**Interfaces:**
- Consumes: `FishingCatchPresentation` and item reward conditions from Task 1.
- Produces:
  - `applyBrokenMaterialTreatment(material: Material): void`
  - condition-aware `FishingCatchLibrary.prepare(catchId)`

- [ ] **Step 1: Write failing item-model and condition tests**

Append to `tests/FishingCatchLibrary.test.ts`:

```ts
it('loads the existing item model for utility catches', async () => {
  const model = testModel();
  const loader: FishingCatchModelLoader = { load: vi.fn(async () => model.root) };
  const library = new FishingCatchLibrary(loader);
  const prepared = await library.prepare('energyBar');

  expect(loader.load).toHaveBeenCalledWith(expect.stringContaining('energyBar.glb'));
  expect(prepared?.userData.fishingModelSource).toBe('item-model');
  expect(prepared?.userData.fishingItemId).toBe('energyBar');
  library.dispose();
});

it('applies and disposes the broken treatment for damaged utility catches', async () => {
  const model = testModel();
  model.material.color.setHex(0xffffff);
  const dispose = vi.spyOn(model.material, 'dispose');
  const library = new FishingCatchLibrary({ load: async () => model.root });
  const prepared = await library.prepare('brokenCompass');
  const mesh = prepared!.getObjectByProperty('isMesh', true) as Mesh;

  expect((mesh.material as MeshStandardMaterial).color.getHex()).not.toBe(0xffffff);
  library.hide();
  expect(dispose).toHaveBeenCalledOnce();
});
```

Extend the failed-load test with a utility catch:

```ts
const utility = await library.prepare('energyBar');
expect(utility?.userData).toMatchObject({
  fishingModelSource: 'procedural-item',
  fishingItemId: 'energyBar',
});
```

- [ ] **Step 2: Run the catch-library tests to verify RED**

Run:

```powershell
bun run test -- tests/FishingCatchLibrary.test.ts
```

Expected: FAIL because utility entries have no fishing-model manifest spec and
there is no shared condition treatment.

- [ ] **Step 3: Extract the broken material operation**

Create `src/survival/itemConditionAppearance.ts`:

```ts
import {
  Color,
  Material,
  MeshStandardMaterial,
} from 'three';

export function applyBrokenMaterialTreatment(material: Material): void {
  if (!(material instanceof MeshStandardMaterial)) return;
  material.color.lerp(new Color(0x384243), 0.68);
  material.roughness = Math.max(0.82, material.roughness);
  material.metalness *= 0.45;
  material.needsUpdate = true;
}
```

Change `BoatSupplyDisplay.brokenMaterial` to clone the material and call this
function. Preserve its existing ownership sets and muted-material behavior.

- [ ] **Step 4: Resolve fishing or item model specs**

In `FishingCatchLibrary.ts`, replace direct `fishingCatchModelSpec(catchId)`
selection with:

```ts
function catchModelSpec(definition: FishingCatchDefinition): FishingCatchModelSpec | undefined {
  if (definition.presentation.kind === 'fishing') {
    return fishingCatchModelSpec(definition.id);
  }
  const item = ITEM_MODEL_SPECS[definition.presentation.itemId];
  return {
    url: item.url,
    targetLength: item.targetLongestDimension,
    rotation: item.rotation,
    maxTriangles: item.maxTriangles,
  };
}
```

After `prepareLoadedCatch`, mark item-sourced roots:

```ts
active.root.userData.fishingModelSource = 'item-model';
active.root.userData.fishingItemId = definition.presentation.itemId;
```

For a broken item presentation, traverse owned materials and call
`applyBrokenMaterialTreatment` in place. Do not clone again: the active catch
already owns its loaded materials.

- [ ] **Step 5: Add deterministic procedural utility fallbacks**

Add a small `prepareProceduralItemCatch(itemId, condition)` builder inside
`FishingCatchLibrary.ts`. Import `TorusGeometry` and implement:

```ts
function prepareProceduralItemCatch(
  itemId: ItemId,
  condition: FishingItemCondition,
): ActiveCatch {
  const root = new Group();
  const geometries = new Set<BufferGeometry>();
  const materials = new Set<Material>();
  const body = createMaterial(0x69787a);
  const accent = createMaterial(0xc2aa74);
  materials.add(body);
  materials.add(accent);

  const mesh = (
    name: string,
    geometry: BufferGeometry,
    material: MeshStandardMaterial,
  ): Mesh => {
    geometries.add(geometry);
    const child = new Mesh(geometry, material);
    child.name = name;
    child.castShadow = true;
    child.receiveShadow = true;
    root.add(child);
    return child;
  };

  if (itemId === 'baitTin') {
    mesh('utility:bait:tin', new CylinderGeometry(0.28, 0.3, 0.2, 8), body);
    const lid = mesh('utility:bait:lid', new CylinderGeometry(0.25, 0.25, 0.035, 8), accent);
    lid.position.y = 0.115;
  } else if (itemId === 'ductTape') {
    mesh('utility:tape:roll', new TorusGeometry(0.26, 0.1, 5, 10), body);
  } else if (itemId === 'compass') {
    mesh('utility:compass:case', new CylinderGeometry(0.28, 0.3, 0.1, 10), body);
    const needle = mesh('utility:compass:needle', new ConeGeometry(0.08, 0.32, 3), accent);
    needle.position.y = 0.08;
    needle.rotation.z = Math.PI / 2;
  } else if (itemId === 'fishingNet') {
    const handle = mesh('utility:net:handle', new CylinderGeometry(0.035, 0.045, 0.9, 6), body);
    handle.rotation.z = Math.PI / 2;
    handle.position.x = -0.42;
    const rim = mesh('utility:net:rim', new TorusGeometry(0.32, 0.035, 5, 10), accent);
    rim.position.x = 0.34;
  } else {
    mesh('utility:energy-bar:wrapper', new BoxGeometry(0.72, 0.16, 0.28), body);
    const band = mesh('utility:energy-bar:band', new BoxGeometry(0.2, 0.18, 0.3), accent);
    band.position.x = 0.08;
  }

  if (condition === 'broken') {
    for (const material of materials) applyBrokenMaterialTreatment(material);
  }
  root.name = `fishing-catch:${itemId}:procedural`;
  root.userData.fishingModelSource = 'procedural-item';
  root.userData.fishingItemId = itemId;
  return { root, geometries, materials, textures: new Set<Texture>() };
}
```

Select the fallback using the presentation union:

```ts
active ??= definition.presentation.kind === 'fishing'
  ? prepareProceduralCatch(
      definition.presentation.family,
      definition.presentation.appearance,
      catchId,
    )
  : prepareProceduralItemCatch(
      definition.presentation.itemId,
      definition.presentation.condition,
    );
```

- [ ] **Step 6: Run presentation tests to verify GREEN**

Run:

```powershell
bun run test -- tests/FishingCatchLibrary.test.ts tests/BoatWorld.test.ts
```

Expected: both files pass; repeated `hide()`/`dispose()` calls still dispose
each temporary resource exactly once.

- [ ] **Step 7: Commit presentation support**

```powershell
git add src/survival/itemConditionAppearance.ts src/survival/BoatSupplyDisplay.ts src/survival/FishingCatchLibrary.ts tests/FishingCatchLibrary.test.ts tests/BoatWorld.test.ts
git commit -m "feat: present utility fishing catches"
```

---

### Task 4: Result Copy, Documentation, and Full Verification

**Files:**
- Modify: `src/survival/SurvivalPhase.ts`
- Modify: `tests/SurvivalPhase.test.ts`
- Modify: `README.md`
- Verify: all source and test files from Tasks 1-3

**Interfaces:**
- Consumes: utility terminal results and reward deltas from Tasks 1-2.
- Produces: complete player-facing fishing result copy and documented behavior.

- [ ] **Step 1: Write failing result-copy tests**

Add cases to `tests/SurvivalPhase.test.ts` for:

```ts
expect(formatFishingResult({
  kind: 'catch',
  catch: FISHING_CATCHES.find(({ id }) => id === 'bait')!,
}, accepted({ code: 'utility-caught', deltas: { bait: 1 } }))).toMatchObject({
  caption: 'UTILITY SALVAGE',
  title: 'BAIT',
  detail: 'BAIT +1',
});

expect(formatFishingResult({
  kind: 'catch',
  catch: FISHING_CATCHES.find(({ id }) => id === 'brokenCompass')!,
}, accepted({ code: 'utility-caught', deltas: {} }))).toMatchObject({
  caption: 'UTILITY SALVAGE',
  title: 'BROKEN COMPASS',
  detail: 'BROKEN — REPAIR WITH DUCT TAPE',
});
```

Cover every utility label with a table:

```ts
it.each([
  ['bait', 'BAIT', 'BAIT +1'],
  ['wetDuctTape', 'WET DUCT TAPE', 'DUCT TAPE RECOVERED'],
  ['brokenCompass', 'BROKEN COMPASS', 'BROKEN — REPAIR WITH DUCT TAPE'],
  ['tornFishingNet', 'TORN FISHING NET', 'BROKEN — REPAIR WITH DUCT TAPE'],
  ['energyBar', 'ENERGY BAR', 'ENERGY BAR RECOVERED'],
] as const)('formats the %s utility result', (catchId, title, detail) => {
  expect(formatFishingResult({
    kind: 'catch',
    catch: FISHING_CATCHES.find(({ id }) => id === catchId)!,
  }, accepted({
    code: 'utility-caught',
    deltas: catchId === 'bait' ? { bait: 1 } : {},
  }))).toMatchObject({ caption: 'UTILITY SALVAGE', title, detail });
});
```

In the existing asynchronous reel test rig, force Broken Compass and assert
`showFishingResult` receives the projected physical target after the reel:

```ts
expect(rig.ui.showFishingResult).toHaveBeenCalledWith({
  caption: 'UTILITY SALVAGE',
  title: 'BROKEN COMPASS',
  detail: 'BROKEN — REPAIR WITH DUCT TAPE',
  catchTarget: rig.catchTarget,
});
```

- [ ] **Step 2: Run phase tests to verify RED**

Run:

```powershell
bun run test -- tests/SurvivalPhase.test.ts
```

Expected: FAIL because `formatFishingResult` treats every non-junk result as a
Food catch.

- [ ] **Step 3: Implement utility result formatting**

In `formatFishingResult`, add a utility branch before junk/food formatting:

```ts
if (result.catch.kind === 'utility') {
  const reward = result.catch.reward;
  const detail = reward.kind === 'bait'
    ? 'BAIT +1'
    : reward.kind === 'item' && reward.condition === 'broken'
      ? 'BROKEN — REPAIR WITH DUCT TAPE'
      : reward.kind === 'item' && reward.itemId === 'ductTape'
        ? 'DUCT TAPE RECOVERED'
        : 'ENERGY BAR RECOVERED';
  return {
    caption: 'UTILITY SALVAGE',
    title: result.catch.label.toLocaleUpperCase('en-US'),
    detail,
    catchTarget: null,
  };
}
```

Change the fish branch to read `fishingCatchFood(result.catch)` instead of the
removed `catch.food` field.

- [ ] **Step 4: Update README**

In the fishing section, document:

- the five utility catches;
- only fish consume captured Bait;
- Bait stacks;
- owned usable or broken unique utilities leave the catch pool;
- Duct Tape and Energy Bar arrive usable;
- Compass and Fishing Net arrive broken and need Duct Tape repair.

Add:

```markdown
Fishing can also recover utility salvage at the wiki-documented weights: Bait,
Wet Duct Tape, Broken Compass, Torn Fishing Net, and Energy Bar. Bait stacks;
Wet Duct Tape becomes ordinary usable Duct Tape; Energy Bars are usable;
Compass and Fishing Net arrive broken and require Duct Tape. A usable or broken
unique utility is removed from the catch pool until it is consumed or lost.
Utility catches neither consume bait nor receive bait's fish-weight bonus.
```

- [ ] **Step 5: Run all automated verification**

Run:

```powershell
bun run test
bun run typecheck
bun run build
```

Expected: all tests pass, TypeScript reports no errors, and Vite produces the
production bundle.

- [ ] **Step 6: Run the browser playthrough**

Start the development server:

```powershell
bun run dev
```

In the browser, use deterministic test hooks or temporary test-only forced
rolls to verify:

1. Bait increases the physical Bait quantity.
2. Wet Duct Tape appears as usable Duct Tape.
3. Broken Compass appears damaged, says `BROKEN`, and can be repaired.
4. Torn Fishing Net appears damaged, says `BROKEN`, and can be repaired.
5. Energy Bar appears usable and restores Energy.
6. An owned usable or broken unique utility cannot be rolled again.
7. A consumed or lost unique utility can be rolled again.
8. The catch object clears and its temporary resources are released after
   Continue.

Remove any temporary forced-roll hook before committing.

- [ ] **Step 7: Commit integration and documentation**

```powershell
git add src/survival/SurvivalPhase.ts tests/SurvivalPhase.test.ts README.md
git commit -m "feat: finish fishable utility items"
```

# Dorothy Item Parity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the approved 19-type, 22-pickup Dorothy catalog, faithful local models, authored ship placement, per-instance survival conditions, and wiki-based survival behavior.

**Architecture:** A typed catalog creates every scavenging instance and supplies stable model, placement, artwork, and action IDs. Saved instances become a condition-aware survival inventory consumed by day actions and a weighted wiki-event resolver. Kenney-derived and project-authored GLBs are built separately into one atomic local publication, while the manifest and generated metadata keep runtime loading, layout bounds, provenance, and audits exhaustive.

**Tech Stack:** TypeScript 5.9, Three.js 0.180, Vitest 3.2, glTF Transform 4.4, Node ESM, PowerShell, Bun, Vite 7.

## Global Constraints

- Implement exactly 19 item types and 22 Dorothy pickups.
- Spawn Food three times, Bait twice, and every other approved item exactly once.
- Keep the three-point weighted carry limit and the weights approved in the design specification.
- Remove Water Bottle completely. Keep the lifeboat Repair Kit fixed to the boat and exclude Chest, heart pieces, flowers, companions, trades, later loot, story branches, and alternate endings.
- Use Kenney as the sole third-party asset store. Project-authored geometry is allowed and must not copy geometry, textures, or artwork from the original game.
- Commit self-contained runtime GLBs. Production code must not fetch models, textures, wiki data, or other assets.
- Replace the Kenney blaster Flare Gun with the project-authored compact signal-pistol model.
- Keep third-party provenance complete in `THIRD_PARTY_ASSETS.md`; identify project-authored models separately in runtime metadata and audits.
- Follow test-driven development. Run the focused failing test before production edits in every task.
- Preserve unrelated working-tree changes.
- Design reference: `docs/superpowers/specs/2026-07-15-dorothy-item-parity-design.md`.

---

## File Structure

| File | Responsibility after this work |
| --- | --- |
| `src/game/itemCatalog.ts` | Canonical 19-type catalog, weights, counts, charges, conditions, actions, placement categories, stable instance creation, and validation. |
| `src/game/ItemState.ts` | Scavenging instance and status types re-exported from the catalog boundary. |
| `src/game/ScavengeSession.ts` | Three-point carrying and instance-safe scavenging transitions for the 22 instances. |
| `scripts/kenney-item-models.mjs` | Nine Kenney-derived models: seven retained items, Bucket, and Bottled Paper. |
| `scripts/project-item-models.mjs` | Ten deterministic project-authored models and primitive geometry helpers. |
| `scripts/item-model-metadata.mjs` | Deterministic raw bounds and triangle metadata for every generated GLB. |
| `scripts/fetch-item-models.ps1` | Pinned source download, both builders, metadata generation, auditing, and atomic publication. |
| `scripts/check-item-models.mjs` | Exact 19-file audit, metadata validation, provenance checks, bounds, dependencies, and triangle limits. |
| `src/world/itemModelManifest.ts` | Exhaustive runtime transforms and discriminated Kenney/project provenance. |
| `src/world/PropModelLibrary.ts` | Local preload, metadata normalization, third-party ledger validation, and item-specific failures. |
| `src/world/ShipItemPlacement.ts` | Four authored placement categories, model-derived profiles, fit checks, and unique assignments. |
| `src/world/ShipLayout.ts` | Twenty-seven existing physical surfaces recategorized for the 22-item contract. |
| `src/survival/inventory.ts` | Per-instance usable, broken, consumed, and lost condition state and legal transitions. |
| `src/survival/survivalTypes.ts` | Action requests, inventory snapshots, weighted event outcomes, resource operations, and item mutations. |
| `src/survival/survivalBalance.ts` | Existing meters plus exact Energy Bar, Bottled Paper, Rest, and danger-translation values. |
| `src/survival/events.ts` | Included wiki event catalog, source audit, eligibility, weighted choices, and weighted outcomes. |
| `src/survival/eventResolver.ts` | Deterministic weighted outcome selection and concrete integer-range resolution. |
| `src/survival/eventParityAudit.ts` | Fixed included/excluded wiki event record and scope reasons. |
| `src/survival/SurvivalSession.ts` | Day actions, resource-instance synchronization, event resolution, journal recording, and terminal states. |
| `src/survival/BoatInteraction.ts` | Catalog-driven saved-item action mapping. |
| `src/survival/BoatWorld.ts` | Saved prop condition presentation and projected action anchors. |
| `src/ui/uiArtwork.ts` | Project-authored inline SVG portraits for all 19 types. |
| `src/ui/SurvivalUI.ts` | Correct actions, repair target selection, event choices, quantities, conditions, tooltips, and focus behavior. |
| `src/ui/GameUI.ts` | Catalog labels, quantity-safe results, and three-point weight portraits. |
| `src/styles/main.css` | New item colors, condition treatments, action chooser layout, and responsive anchor presentation. |
| `THIRD_PARTY_ASSETS.md` | Nine Kenney-derived item records and unchanged ship-furniture records. |
| `README.md` | Correct Dorothy list, carrying, actions, item conditions, and controls. |

---

### Task 1: Establish the canonical Dorothy catalog

**Files:**
- Create: `src/game/itemCatalog.ts`
- Modify: `src/game/ItemState.ts`
- Modify: `src/game/ScavengeSession.ts`
- Modify: `tests/ItemState.test.ts`
- Modify: `tests/ScavengeSession.test.ts`
- Modify: `tests/GameLifecycle.test.ts`

**Interfaces:**
- Produces: `ITEM_IDS`, `ItemId`, `ItemInstanceId`, `ItemDefinition`, `ITEM_DEFINITIONS`, `ITEM_LABELS`, `createItemInstances()`, and `validateItemCatalog()` from `src/game/itemCatalog.ts`.
- Produces: `ItemDayAction = 'fish' | 'dive' | 'eat' | 'treat' | 'repairItem' | 'sendMessage' | 'useEnergyBar' | null`.
- Produces: `ShipPlacementCategory = 'provisions' | 'navigation' | 'workshop' | 'deckGear'`.
- Preserves: `ItemInstance`, `ItemStatus`, and existing scavenging session APIs.

- [ ] **Step 1: Replace the old catalog expectations with the exact Dorothy contract**

Write these focused assertions in `tests/ItemState.test.ts`:

```ts
const EXPECTED = {
  cannedFood: [3, 1], baitTin: [2, 1], ductTape: [1, 1], compass: [1, 1],
  map: [1, 1], medicalKit: [1, 2], spyglass: [1, 1], fishingNet: [1, 2],
  bucket: [1, 2], flareGun: [1, 1], scubaSet: [1, 3], anchor: [1, 3],
  bottledPaper: [1, 1], umbrella: [1, 2], swimRing: [1, 2], flashlight: [1, 1],
  harpoonGun: [1, 2], energyBar: [1, 1], fishingRod: [1, 2],
} as const;

it('defines exactly the approved Dorothy types, counts, and weights', () => {
  expect(ITEM_IDS).toEqual(Object.keys(EXPECTED));
  expect(Object.fromEntries(ITEM_IDS.map((id) => [
    id,
    [ITEM_DEFINITIONS[id].spawnCount, ITEM_DEFINITIONS[id].weight],
  ]))).toEqual(EXPECTED);
  expect(ITEM_IDS).not.toContain('waterJug');
  expect(ITEM_IDS).not.toContain('repairKit');
  expect(ITEM_IDS).not.toContain('chest');
});

it('creates twenty-two stable unique physical instances', () => {
  const instances = createItemInstances();
  expect(instances).toHaveLength(22);
  expect(new Set(instances.map(({ instanceId }) => instanceId))).toHaveLength(22);
  expect(instances.filter(({ type }) => type === 'cannedFood')).toHaveLength(3);
  expect(instances.filter(({ type }) => type === 'baitTin')).toHaveLength(2);
  expect(instances.filter(({ type }) => type === 'ductTape')).toEqual([
    { instanceId: 'ductTape-1', type: 'ductTape' },
  ]);
});
```

- [ ] **Step 2: Run the catalog and scavenging tests and verify RED**

Run: `bunx vitest run tests/ItemState.test.ts tests/ScavengeSession.test.ts tests/GameLifecycle.test.ts`

Expected: FAIL because the runtime still has 9 types, 14 instances, two Duct Tapes, and `waterJug`.

- [ ] **Step 3: Create the typed catalog with the exact approved definitions**

Create `src/game/itemCatalog.ts` with these public types and exact definition data:

```ts
export const ITEM_IDS = [
  'cannedFood', 'baitTin', 'ductTape', 'compass', 'map', 'medicalKit',
  'spyglass', 'fishingNet', 'bucket', 'flareGun', 'scubaSet', 'anchor',
  'bottledPaper', 'umbrella', 'swimRing', 'flashlight', 'harpoonGun',
  'energyBar', 'fishingRod',
] as const;

export type ItemId = typeof ITEM_IDS[number];
export type ItemInstanceId = `${ItemId}-${number}`;
export type ItemDayAction =
  | 'fish' | 'dive' | 'eat' | 'treat' | 'repairItem'
  | 'sendMessage' | 'useEnergyBar' | null;
export type ShipPlacementCategory =
  | 'provisions' | 'navigation' | 'workshop' | 'deckGear';

export interface ItemDefinition {
  readonly label: string;
  readonly weight: 1 | 2 | 3;
  readonly spawnCount: number;
  readonly charges: number | null;
  readonly durable: boolean;
  readonly breakable: boolean;
  readonly dayAction: ItemDayAction;
  readonly placementCategory: ShipPlacementCategory;
  readonly modelId: ItemId;
  readonly artworkId: ItemId;
}

const define = (
  label: string,
  weight: 1 | 2 | 3,
  spawnCount: number,
  charges: number | null,
  durable: boolean,
  breakable: boolean,
  dayAction: ItemDayAction,
  placementCategory: ShipPlacementCategory,
): ItemDefinition => ({
  label, weight, spawnCount, charges, durable, breakable, dayAction,
  placementCategory, modelId: '' as ItemId, artworkId: '' as ItemId,
});

const rawDefinitions = {
  cannedFood: define('FOOD', 1, 3, 1, false, false, 'eat', 'provisions'),
  baitTin: define('BAIT', 1, 2, 1, false, false, null, 'provisions'),
  ductTape: define('DUCT TAPE', 1, 1, 1, false, false, 'repairItem', 'workshop'),
  compass: define('COMPASS', 1, 1, null, true, true, null, 'navigation'),
  map: define('MAP', 1, 1, null, true, true, null, 'navigation'),
  medicalKit: define('MEDKIT', 2, 1, 1, false, false, 'treat', 'workshop'),
  spyglass: define('SPYGLASS', 1, 1, null, true, true, null, 'navigation'),
  fishingNet: define('FISHING NET', 2, 1, null, true, true, null, 'deckGear'),
  bucket: define('BUCKET', 2, 1, null, true, true, null, 'deckGear'),
  flareGun: define('FLARE GUN', 1, 1, 1, false, false, null, 'navigation'),
  scubaSet: define('SCUBA GEAR', 3, 1, null, true, true, 'dive', 'deckGear'),
  anchor: define('ANCHOR', 3, 1, null, true, true, null, 'deckGear'),
  bottledPaper: define('BOTTLED PAPER', 1, 1, 1, false, false, 'sendMessage', 'navigation'),
  umbrella: define('UMBRELLA', 2, 1, null, true, true, null, 'deckGear'),
  swimRing: define('SWIM RING', 2, 1, null, true, true, null, 'deckGear'),
  flashlight: define('FLASHLIGHT', 1, 1, null, true, false, null, 'workshop'),
  harpoonGun: define('HARPOON GUN', 2, 1, 1, false, false, null, 'workshop'),
  energyBar: define('ENERGY BAR', 1, 1, 1, false, false, 'useEnergyBar', 'provisions'),
  fishingRod: define('FISHING ROD', 2, 1, null, true, false, 'fish', 'deckGear'),
} satisfies Record<ItemId, ItemDefinition>;

export const ITEM_DEFINITIONS = Object.freeze(Object.fromEntries(
  ITEM_IDS.map((id) => [id, Object.freeze({ ...rawDefinitions[id], modelId: id, artworkId: id })]),
) as Record<ItemId, ItemDefinition>);
```

Add `validateItemCatalog()` to reject duplicate IDs, missing/excess definition keys, counts below one, weights outside 1 through 3, a non-null charge below one, `durable` combined with charges, `breakable` without durability, mismatched model/artwork IDs, any total other than 22, and any count differing from the approved contract. Invoke it in development and tests.

- [ ] **Step 4: Make `ItemState.ts` consume and re-export the catalog boundary**

Keep only scavenging state types in `ItemState.ts` and re-export catalog symbols:

```ts
export {
  ITEM_DEFINITIONS, ITEM_IDS, ITEM_LABELS, createItemInstances,
  itemDefinition, validateItemCatalog,
} from './itemCatalog';
export type { ItemDefinition, ItemId, ItemInstanceId } from './itemCatalog';

import type { ItemId, ItemInstanceId } from './itemCatalog';

export interface ItemInstance {
  readonly instanceId: ItemInstanceId;
  readonly type: ItemId;
}

export type ItemStatus = 'available' | 'carried' | 'saved' | 'lost';
```

Remove the legacy type-key aliases from `ScavengeSession.snapshot().items`; snapshots must be keyed only by `ItemInstanceId`. Update the affected tests to use `ductTape-1` and other instance IDs.

- [ ] **Step 5: Update exact scavenging and phase-boundary fixtures**

Replace `waterJug` fixtures with approved items and update production counts:

```ts
expect(internals.world.itemObjects.size).toBe(22);
expect(firstItems).toHaveLength(22);
expect(firstInstances.size).toBe(22);
```

Add a capacity case for `anchor-1` and retain the existing mixed weight-one and Scuba Gear cases.

- [ ] **Step 6: Run focused tests and commit the catalog slice**

Run: `bunx vitest run tests/ItemState.test.ts tests/ScavengeSession.test.ts tests/GameLifecycle.test.ts`

Expected: PASS with 19 types, 22 stable instances, one Duct Tape, and no Water Bottle.

```bash
git add src/game/itemCatalog.ts src/game/ItemState.ts src/game/ScavengeSession.ts tests/ItemState.test.ts tests/ScavengeSession.test.ts tests/GameLifecycle.test.ts
git commit -m "feat: define Dorothy item catalog"
```

---

### Task 2: Introduce per-instance survival conditions

**Files:**
- Modify: `src/survival/inventory.ts`
- Modify: `src/survival/survivalTypes.ts`
- Modify: `tests/survivalInventory.test.ts`
- Modify: `tests/SurvivalSession.test.ts`

**Interfaces:**
- Produces: `ItemCondition = 'usable' | 'broken' | 'consumed' | 'lost'`.
- Produces: `SurvivalItemState`, `SurvivalInventorySnapshot`, and `SurvivalInventoryState`.
- Produces methods: `hasUsable(type)`, `count(type, condition?)`, `consume(type, quantity?)`, `break(instanceId)`, `lose(instanceId)`, `repair(instanceId)`, `breakRandom(quantity, random)`, `loseRandom(quantity, random)`, and `snapshot()`.

- [ ] **Step 1: Replace aggregate inventory tests with instance-condition tests**

Write these core tests in `tests/survivalInventory.test.ts`:

```ts
it('creates one usable record per saved physical instance', () => {
  const inventory = new SurvivalInventoryState(saved(
    'cannedFood', 'cannedFood', 'baitTin', 'compass', 'ductTape',
  ));
  expect(Object.values(inventory.snapshot())).toEqual([
    { instanceId: 'cannedFood-1', type: 'cannedFood', condition: 'usable' },
    { instanceId: 'cannedFood-2', type: 'cannedFood', condition: 'usable' },
    { instanceId: 'baitTin-1', type: 'baitTin', condition: 'usable' },
    { instanceId: 'compass-1', type: 'compass', condition: 'usable' },
    { instanceId: 'ductTape-1', type: 'ductTape', condition: 'usable' },
  ]);
});

it('consumes duplicate resources deterministically by instance number', () => {
  const inventory = new SurvivalInventoryState(saved('cannedFood', 'cannedFood', 'cannedFood'));
  expect(inventory.consume('cannedFood', 2)).toEqual(['cannedFood-1', 'cannedFood-2']);
  expect(inventory.snapshot()['cannedFood-3']?.condition).toBe('usable');
});

it('allows only catalog-approved break and repair transitions', () => {
  const inventory = new SurvivalInventoryState(saved('compass', 'flashlight', 'ductTape'));
  expect(inventory.break('compass-1')).toBe(true);
  expect(inventory.repair('compass-1')).toBe(true);
  expect(inventory.break('flashlight-1')).toBe(false);
  inventory.consume('ductTape');
  expect(inventory.repair('ductTape-1')).toBe(false);
});

it('never repairs consumed or lost items', () => {
  const inventory = new SurvivalInventoryState(saved('map', 'energyBar'));
  inventory.lose('map-1');
  inventory.consume('energyBar');
  expect(inventory.repair('map-1')).toBe(false);
  expect(inventory.repair('energyBar-1')).toBe(false);
});
```

Update the `saved()` test helper to number instances per type, not by the argument's global position:

```ts
const saved = (...types: ItemId[]): ItemInstance[] => {
  const counts = new Map<ItemId, number>();
  return types.map((type) => {
    const number = (counts.get(type) ?? 0) + 1;
    counts.set(type, number);
    return { instanceId: `${type}-${number}` as ItemInstanceId, type };
  });
};
```

- [ ] **Step 2: Run the inventory tests and verify RED**

Run: `bunx vitest run tests/survivalInventory.test.ts tests/SurvivalSession.test.ts`

Expected: FAIL because survival inventory is still collapsed into one record per item type.

- [ ] **Step 3: Define condition-aware inventory types**

Replace the old `ItemInventoryState` and type-keyed `SurvivalInventory` with:

```ts
export type ItemCondition = 'usable' | 'broken' | 'consumed' | 'lost';

export interface SurvivalItemState extends ItemInstance {
  readonly condition: ItemCondition;
}

export type SurvivalInventorySnapshot = Readonly<
  Partial<Record<ItemInstanceId, Readonly<SurvivalItemState>>>
>;
```

Implement `SurvivalInventoryState` around a private `Map<ItemInstanceId, SurvivalItemState>`. Sort mutation candidates by `instanceId`, clone every snapshot record, and freeze the snapshot and records. `break()` must consult `ITEM_DEFINITIONS[type].breakable`; `repair()` accepts only `broken`; `consume()` accepts only usable items whose catalog `charges` is non-null; `lose()` accepts usable or broken items. Random mutations draw without replacement from eligible instance IDs sorted before applying the injected `RandomSource`.

- [ ] **Step 4: Adapt the session constructor without changing actions yet**

Replace the mutable type-keyed inventory field with:

```ts
private readonly inventory: SurvivalInventoryState;

this.inventory = new SurvivalInventoryState(this.savedItems);
this.recoveredFood = this.inventory.count('cannedFood', 'usable');
this.recoveredBait = this.inventory.count('baitTin', 'usable');
this.food = this.recoveredFood;
this.bait = this.recoveredBait;
```

Return `inventory: this.inventory.snapshot()` from `snapshot()`. Temporarily route old ownership and charge checks through `hasUsable()` and `count()` so existing behavior stays green until Task 6.

- [ ] **Step 5: Run focused tests and commit the condition model**

Run: `bunx vitest run tests/survivalInventory.test.ts tests/SurvivalSession.test.ts tests/GameLifecycle.test.ts`

Expected: PASS with immutable per-instance snapshots and legal transitions.

```bash
git add src/survival/inventory.ts src/survival/survivalTypes.ts src/survival/SurvivalSession.ts tests/survivalInventory.test.ts tests/SurvivalSession.test.ts tests/GameLifecycle.test.ts
git commit -m "feat: track survival item conditions"
```

---

### Task 3: Build the ten project-authored item models

**Files:**
- Create: `scripts/project-item-models.mjs`
- Create: `scripts/project-item-models.d.mts`
- Create: `tests/ProjectItemModels.test.ts`

**Interfaces:**
- Produces: `PROJECT_ITEM_RECIPES`, `PROJECT_ITEM_IDS`, and `buildProjectItemModels({ outputRoot, recipes? })`.
- Produces CLI: `node scripts/project-item-models.mjs <outputRoot>`.
- Uses only programmatic `box`, `cylinder`, `cone`, and `torus` geometry with flat color materials.

- [ ] **Step 1: Write the failing authored-model contract**

Create `tests/ProjectItemModels.test.ts` with this exact catalog assertion:

```ts
const PROJECT_IDS = [
  'compass', 'map', 'spyglass', 'fishingNet', 'flareGun',
  'anchor', 'umbrella', 'swimRing', 'harpoonGun', 'energyBar',
] as const;

it('defines the exact project-authored model set', () => {
  expect(PROJECT_ITEM_IDS).toEqual(PROJECT_IDS);
  expect(Object.keys(PROJECT_ITEM_RECIPES)).toEqual(PROJECT_IDS);
  expect(PROJECT_ITEM_RECIPES.flareGun.parts.map(({ name }) => name)).toEqual([
    'barrel', 'muzzle', 'hinge', 'grip', 'trigger-guard', 'trigger',
  ]);
});

it('writes self-contained bounded triangle GLBs', async () => {
  await buildProjectItemModels({ outputRoot });
  expect(await readdir(outputRoot)).toEqual(PROJECT_IDS.map((id) => `${id}.glb`).sort());
  for (const id of PROJECT_IDS) {
    const file = join(outputRoot, `${id}.glb`);
    expect(await countTriangles(file), id).toBeGreaterThan(0);
    expect(await countTriangles(file), id).toBeLessThanOrEqual(3_000);
  }
});
```

Add a model inspection test that reads `flareGun.glb` through `NodeIO`, asserts the six named nodes, verifies red/orange barrel material and dark grip material, and confirms the gun's longest axis is no more than four times its grip height.

- [ ] **Step 2: Run the authored-model test and verify RED**

Run: `bunx vitest run tests/ProjectItemModels.test.ts`

Expected: FAIL because the project-authored builder does not exist.

- [ ] **Step 3: Implement reusable flat-shaded primitive geometry**

Define these exact recipe interfaces in the `.d.mts` file and implement them in the `.mjs` module:

```ts
export type AuthoredShape = 'box' | 'cylinder' | 'cone' | 'torus';

export interface AuthoredPart {
  readonly name: string;
  readonly shape: AuthoredShape;
  readonly size: readonly [number, number, number];
  readonly translation: readonly [number, number, number];
  readonly rotation: readonly [number, number, number, number];
  readonly color: readonly [number, number, number, number];
  readonly segments?: number;
}

export interface AuthoredRecipe {
  readonly parts: readonly AuthoredPart[];
}
```

Generate indexed triangle geometry with finite positions, normals, and indices. Boxes use independent face vertices for flat normals. Cylinders and cones use 8 radial segments by default and include caps. Tori use 8 radial by 12 tubular segments by default. Each part becomes one named node and one named material. Run `prune()` and `unpartition()` before writing each GLB.

- [ ] **Step 4: Add the exact low-poly recipes**

Use these authored dimensions and distinctive parts. Values are in recipe-local units and the runtime manifest normalizes final size:

| Item | Required parts and proportions |
| --- | --- |
| Compass | `case` cylinder 0.56 x 0.10, `face` cylinder 0.43 x 0.02, red and pale `needle-north`/`needle-south` boxes 0.04 x 0.02 x 0.30. |
| Map | `sheet` box 0.78 x 0.025 x 0.52, two narrow raised `fold` boxes, blue `route` box, red `mark` cylinder. |
| Spyglass | brown `main-tube` cylinder length 0.62, narrower `eye-tube` length 0.25, brass `front-rim`, `middle-rim`, and `eye-rim` cylinders. |
| Fishing Net | `handle` cylinder length 0.92, oval `frame` torus 0.42 x 0.30, and six thin crossed `net-line` cylinders inside the frame. |
| Flare Gun | red `barrel` box 0.18 x 0.18 x 0.62, red cylindrical `muzzle` diameter 0.27, dark `hinge` cylinder, angled dark `grip` box 0.17 x 0.42 x 0.20, dark `trigger-guard` torus, and gold `trigger` box. |
| Anchor | dark `shank` cylinder length 0.82, `crossbar` cylinder length 0.62, top `ring` torus, two angled `arm` boxes, and two triangular `fluke` cones. |
| Umbrella | folded red `canopy` cone length 0.68, dark `shaft` cylinder length 0.92, small `tip` cone, and curved `handle` torus with the unused half hidden inside the grip. |
| Swim Ring | orange `ring` torus with four pale `band` boxes placed at quarter turns. |
| Harpoon Gun | dark `body` box length 0.68, brown `stock` box, dark angled `grip`, steel `barrel` cylinder length 0.82, and steel `harpoon-shaft` plus `harpoon-tip` cone. |
| Energy Bar | gold `wrapper` box 0.58 x 0.16 x 0.10, two red `end-seal` boxes, and a pale raised `label` box. |

Use the approved muted palette: red/orange `[0.78, 0.18, 0.08, 1]`, dark `[0.10, 0.12, 0.14, 1]`, brass `[0.67, 0.45, 0.18, 1]`, steel `[0.42, 0.49, 0.51, 1]`, paper `[0.80, 0.73, 0.55, 1]`, and blue `[0.23, 0.44, 0.55, 1]`.

- [ ] **Step 5: Run builder tests and commit project-authored recipes**

Run: `bunx vitest run tests/ProjectItemModels.test.ts`

Expected: PASS; ten self-contained GLBs build in a temporary directory and the Flare Gun has the approved signal-pistol nodes and proportions.

```bash
git add scripts/project-item-models.mjs scripts/project-item-models.d.mts tests/ProjectItemModels.test.ts
git commit -m "feat: build authored Dorothy item models"
```

---

### Task 4: Publish, audit, and preload the complete model library

**Files:**
- Modify: `scripts/kenney-item-models.mjs`
- Modify: `scripts/kenney-item-models.d.mts`
- Create: `scripts/item-model-metadata.mjs`
- Create: `scripts/item-model-metadata.d.mts`
- Modify: `scripts/fetch-item-models.ps1`
- Modify: `scripts/check-item-models.mjs`
- Modify: `src/world/itemModelManifest.ts`
- Modify: `src/world/PropModelLibrary.ts`
- Modify: `src/assets/models/items/*.glb`
- Delete: `src/assets/models/items/waterJug.glb`
- Modify: `THIRD_PARTY_ASSETS.md`
- Modify: `tests/KenneyItemModels.test.ts`
- Modify: `tests/itemModelAudit.test.ts`
- Modify: `tests/itemModelManifest.test.ts`
- Modify: `tests/itemModelPublication.test.ts`
- Modify: `tests/PropModelLibrary.test.ts`
- Modify: `tests/helpers/propModels.ts`
- Modify: `tests/helpers/productionPropModels.ts`

**Interfaces:**
- Kenney builder produces: retained seven models plus `bucket.glb` and `bottledPaper.glb`.
- Metadata builder produces: `item-model-metadata.json` with `{ triangles, rawBounds }` for every item.
- Manifest provenance is a union of `thirdParty` and `project` records.
- Publication contains exactly 19 GLBs plus `item-model-metadata.json`.

- [ ] **Step 1: Write failing exact-library and provenance tests**

Change model tests to assert:

```ts
const EXPECTED_MODEL_FILES = [
  ...ITEM_IDS.map((id) => `${id}.glb`),
  'item-model-metadata.json',
].sort();

expect((await readdir(modelsDir)).sort()).toEqual(EXPECTED_MODEL_FILES);
expect(Object.keys(ITEM_MODEL_SPECS).sort()).toEqual([...ITEM_IDS].sort());
expect(ITEM_MODEL_SPECS.flareGun.provenance).toEqual({
  kind: 'project',
  recipeId: 'project-item-models@1:flareGun',
  creator: 'Project team',
});
expect(ITEM_MODEL_SPECS.bucket.provenance).toMatchObject({
  kind: 'thirdParty',
  sourceUrl: 'https://kenney.nl/assets/survival-kit',
  sourceAssetId: 'survival-kit@2.0:Models/GLB format/bucket.glb',
});
expect(ITEM_MODEL_SPECS.bottledPaper.provenance).toMatchObject({
  kind: 'thirdParty',
  sourceUrl: 'https://kenney.nl/assets/survival-kit',
});
```

Assert that no source, manifest, ledger, or output filename contains `blaster-n`, `blaster-kit`, or `waterJug`.

- [ ] **Step 2: Run model tests and verify RED**

Run: `bunx vitest run tests/KenneyItemModels.test.ts tests/itemModelAudit.test.ts tests/itemModelManifest.test.ts tests/itemModelPublication.test.ts tests/PropModelLibrary.test.ts`

Expected: FAIL because publication and runtime metadata still describe the old nine-model library.

- [ ] **Step 3: Change the Kenney recipes to the exact nine derived models**

Keep `ductTape`, `fishingRod`, `baitTin`, `medicalKit`, `cannedFood`, `flashlight`, and `scubaSet`. Remove `flareGun`, `waterJug`, and the Blaster Kit descriptor. Add:

```js
bucket: direct('survival-kit', 'Models/GLB format/bucket.glb', 68),
bottledPaper: {
  kind: 'composite',
  expectedTriangles: 188,
  parts: [
    sourcePart('bottle', 'survival-kit', 'Models/GLB format/bottle.glb', [0, 0, 0], [1, 1, 1], [1, 1, 1, 1]),
    sourcePart('rolled-note', 'prototype-kit', 'Models/GLB format/shape-cylinder-detailed.glb', [0, 0.02, 0], [0.12, 0.52, 0.12], [0.80, 0.73, 0.55, 1]),
  ],
},
```

Extend composite parts so each part names its pack instead of assuming Prototype Kit. Pin Survival Kit 2.0 to SHA-256 `C3586341B5932C87EB43D75D915434F47DAED168B17ED36A03E8CA9977C7443E` and require both `bottle.glb` and `bucket.glb`.

- [ ] **Step 4: Generate deterministic model metadata**

Create `item-model-metadata.mjs` with this public output shape:

```ts
export interface GeneratedItemModelMetadata {
  readonly triangles: number;
  readonly rawBounds: {
    readonly min: readonly [number, number, number];
    readonly max: readonly [number, number, number];
  };
}

export function buildItemModelMetadata(
  modelsDir: string,
  itemIds: readonly string[],
): Promise<Readonly<Record<string, GeneratedItemModelMetadata>>>;
```

Read each GLB with `NodeIO`, transform every `POSITION` through its node world matrix, reject empty or nonfinite bounds, count triangles, sort keys by the supplied `itemIds`, and write two-space JSON plus a final newline to `item-model-metadata.json`.

- [ ] **Step 5: Add discriminated provenance and generated bounds to the manifest**

Use these exact types:

```ts
export type ItemModelProvenance =
  | {
      readonly kind: 'thirdParty';
      readonly sourceUrl: string;
      readonly sourceAssetId: string;
      readonly creator: 'Kenney' | 'Kenney + project';
      readonly licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/';
    }
  | {
      readonly kind: 'project';
      readonly recipeId: `project-item-models@1:${ItemId}`;
      readonly creator: 'Project team';
    };
```

Import generated metadata, derive normalized size and conservative bounds from `rawBounds`, and keep only authored presentation fields in the hand-written normalization map. Use target longest dimensions: Food 0.42, Bait 0.48, Duct Tape 0.55, Compass 0.48, Map 0.72, Medkit 0.72, Spyglass 0.72, Fishing Net 0.82, Bucket 0.68, Flare Gun 0.68, Scuba Gear 0.88, Anchor 0.88, Bottled Paper 0.62, Umbrella 0.90, Swim Ring 0.70, Flashlight 0.72, Harpoon Gun 1.00, Energy Bar 0.48, Fishing Rod 1.80. Keep the per-model limit at 3,000 and set the library limit to 40,000.

`PropModelLibrary` validates ledger rows only for `thirdParty` provenance. For `project` provenance it verifies the `recipeId` item suffix and generated metadata, then loads the same local GLB path.

- [ ] **Step 6: Extend atomic publication and audits**

Run both builders into the same guarded stage, reject duplicate outputs, generate metadata, and require exactly the 20 approved entries before swap. The audit must compare its internal ID list to the 19 runtime IDs, verify metadata keys and measured values, require one third-party ledger row for each of the nine Kenney-derived models, and reject ledger rows for project-authored models.

Update `THIRD_PARTY_ASSETS.md` to remove Flare Gun and Water Bottle rows, retain the seven approved current rows, and add Bucket plus Bottled Paper with Survival Kit 2.0 source entries, archive SHA-256, processing, triangles, CC0, and download date 2026-07-15. Add a separate prose section listing the ten project-authored recipe IDs without presenting them as third-party assets.

- [ ] **Step 7: Build the production assets and run focused audits**

Run: `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/fetch-item-models.ps1`

Expected: the stage publishes 19 GLBs and `item-model-metadata.json`; `flareGun.glb` comes from the project builder; `waterJug.glb` is absent.

Run: `bun run models:check`

Expected: PASS with 19 model lines, every item at or below 3,000 triangles, and total triangles at or below 40,000.

Run: `bunx vitest run tests/ProjectItemModels.test.ts tests/KenneyItemModels.test.ts tests/itemModelAudit.test.ts tests/itemModelManifest.test.ts tests/itemModelPublication.test.ts tests/PropModelLibrary.test.ts`

Expected: PASS.

- [ ] **Step 8: Commit the complete asset publication**

```bash
git add scripts/kenney-item-models.mjs scripts/kenney-item-models.d.mts scripts/item-model-metadata.mjs scripts/item-model-metadata.d.mts scripts/fetch-item-models.ps1 scripts/check-item-models.mjs src/world/itemModelManifest.ts src/world/PropModelLibrary.ts src/assets/models/items THIRD_PARTY_ASSETS.md tests/KenneyItemModels.test.ts tests/itemModelAudit.test.ts tests/itemModelManifest.test.ts tests/itemModelPublication.test.ts tests/PropModelLibrary.test.ts tests/helpers/propModels.ts tests/helpers/productionPropModels.ts
git commit -m "feat: publish complete Dorothy model library"
```

---

### Task 5: Place all 22 items on authored, reachable ship surfaces

**Files:**
- Modify: `src/world/ShipItemPlacement.ts`
- Modify: `src/world/ShipLayout.ts`
- Modify: `tests/ShipItemPlacement.test.ts`
- Modify: `tests/ShipLayout.test.ts`
- Modify: `tests/world.test.ts`

**Interfaces:**
- Consumes: catalog `placementCategory` and generated `ITEM_MODEL_SPECS` bounds.
- Produces: `ShipItemCategory = ShipPlacementCategory` with `provisions`, `navigation`, `workshop`, and `deckGear`.
- Preserves: `assignShipItems()`, physical-slot uniqueness, seeded backtracking, wall clearance, standing-eye reach, and minimum uniform scale 0.75.

- [ ] **Step 1: Write failing 22-item production-placement tests**

Replace the 14-item expectations and add exact category coverage:

```ts
it('places all twenty-two Dorothy instances on unique compatible slots', () => {
  const library = createTestShipFurniture();
  const ship = createShip(library, 8);
  try {
    const assignments = assignShipItems(
      createItemInstances(),
      ship.itemSurfaces,
      mulberry32(421),
      ship.colliders,
    );
    expect(assignments.size).toBe(22);
    expect(new Set([...assignments.values()].map(({ surfaceId }) => surfaceId))).toHaveLength(22);
    expect(new Set([...assignments.values()].map(({ physicalSlotId }) => physicalSlotId))).toHaveLength(22);
    for (const instance of createItemInstances()) {
      expect(assignments.has(instance.instanceId), instance.instanceId).toBe(true);
    }
  } finally {
    ship.dispose();
    library.dispose();
  }
});

it('keeps the four authored item groups in their intended ship zones', () => {
  expect(SHIP_ITEM_PROFILES.cannedFood.category).toBe('provisions');
  expect(SHIP_ITEM_PROFILES.bottledPaper.category).toBe('navigation');
  expect(SHIP_ITEM_PROFILES.medicalKit.category).toBe('workshop');
  expect(SHIP_ITEM_PROFILES.anchor.category).toBe('deckGear');
});
```

Keep the 64-seed production assignment test, change every assignment total from 14 to 22, and assert no assignment uses a fallback surface.

- [ ] **Step 2: Run placement and layout tests and verify RED**

Run: `bunx vitest run tests/ShipItemPlacement.test.ts tests/ShipLayout.test.ts tests/world.test.ts`

Expected: FAIL because placement profiles and surface categories still cover the old nine types.

- [ ] **Step 3: Derive every placement profile from the catalog and manifest**

Replace the manual nine-item record with:

```ts
export type ShipItemCategory = ShipPlacementCategory;

export const SHIP_ITEM_PROFILES = Object.freeze(Object.fromEntries(
  ITEM_IDS.map((id) => {
    const [width, height, depth] = ITEM_MODEL_SPECS[id].normalizedSize;
    return [id, {
      category: ITEM_DEFINITIONS[id].placementCategory,
      width,
      depth,
      height,
    }];
  }),
) as Record<ItemId, ShipItemProfile>);
```

The supported category set must be built from `['provisions', 'navigation', 'workshop', 'deckGear']` and validation must continue rejecting unknown or empty surface categories.

- [ ] **Step 4: Recategorize the 27 existing physical surfaces**

Use these exact zone assignments:

```ts
const CABIN_ITEM_CATEGORIES = ['provisions'] as const;
const WHEELHOUSE_ITEM_CATEGORIES = ['navigation'] as const;
const WORKROOM_ITEM_CATEGORIES = ['workshop', 'deckGear'] as const;
const CARGO_ITEM_CATEGORIES = ['deckGear'] as const;
```

Apply Cabin categories to `cabin-desk-aft` and `cabin-bookcase-forward`, Wheelhouse categories to the helm desk, chart table, and both instrument cabinets, Workroom categories to both workbenches and both storage shelves, and Cargo categories to the rod rack and three cargo crates. Keep 27 unique regular surfaces and no fallback surface.

The model recipes must keep Fishing Rod as the only 1.8-unit long prop. Keep folded Umbrella at or below 0.90, Harpoon Gun at or below 1.00, folded Fishing Net at or below 0.82, and Anchor/Scuba Gear at or below 0.88 so the authored surfaces can accept the seven Deck Gear instances without scaling below 0.75.

- [ ] **Step 5: Run layout, measured-bounds, and navigation tests**

Run: `bunx vitest run tests/ShipItemPlacement.test.ts tests/ShipLayout.test.ts tests/world.test.ts tests/collisions.test.ts`

Expected: PASS for all 64 seeds, with 22 unique physical slots, no wall or furniture overlap, reachable standing points, and unchanged navigation clearance.

- [ ] **Step 6: Commit authored placement**

```bash
git add src/world/ShipItemPlacement.ts src/world/ShipLayout.ts tests/ShipItemPlacement.test.ts tests/ShipLayout.test.ts tests/world.test.ts tests/collisions.test.ts
git commit -m "feat: place full Dorothy item set"
```

---

### Task 6: Implement corrected day actions and resource-instance synchronization

**Files:**
- Modify: `src/survival/survivalTypes.ts`
- Modify: `src/survival/survivalBalance.ts`
- Modify: `src/survival/SurvivalSession.ts`
- Modify: `src/survival/BoatInteraction.ts`
- Modify: `tests/SurvivalSession.test.ts`
- Modify: `tests/BoatInteraction.test.ts`

**Interfaces:**
- Produces: day actions `fish`, `dive`, `eat`, `repair`, `repairItem`, `treat`, `rest`, `sendMessage`, `useEnergyBar`, and `endDay`.
- Produces: discriminated `DayActionOption` for Bait, hull material, and broken-item target selection.
- Preserves: current health, hunger, hull, fishing, diving, salvage, weather, and rescue-loop meters.

- [ ] **Step 1: Write failing action tests for the approved behavior**

Add these focused cases:

```ts
it('rests once per day without owning or consuming water', () => {
  const session = new SurvivalSession(saved(), { seed: 1, initial: { energy: 1 } });
  expect(session.perform('rest')).toMatchObject({
    accepted: true,
    deltas: { energy: 2 },
  });
  expect(session.perform('rest')).toMatchObject({ accepted: false, code: 'already-rested' });
});

it('uses the one Medkit charge and marks its instance consumed', () => {
  const session = new SurvivalSession(saved('medicalKit'), { seed: 1, initial: { health: 50 } });
  expect(session.perform('treat')).toMatchObject({ deltas: { health: 30 } });
  expect(session.snapshot().inventory['medicalKit-1']?.condition).toBe('consumed');
  expect(session.perform('treat').code).toBe('no-medical-kit');
});

it('uses Bottled Paper for one energy and fifteen rescue progress', () => {
  const session = new SurvivalSession(saved('bottledPaper'), { seed: 1, initial: { energy: 3 } });
  expect(session.perform('sendMessage')).toMatchObject({
    accepted: true,
    deltas: { energy: -1, rescueProgress: 15 },
  });
  expect(session.snapshot().inventory['bottledPaper-1']?.condition).toBe('consumed');
});

it('uses the Energy Bar to restore the four-energy maximum', () => {
  const session = new SurvivalSession(saved('energyBar'), { seed: 1, initial: { energy: 1 } });
  expect(session.perform('useEnergyBar')).toMatchObject({ deltas: { energy: 3 } });
  expect(session.snapshot().energy).toBe(4);
  expect(session.snapshot().inventory['energyBar-1']?.condition).toBe('consumed');
});

it('spends the only Duct Tape to repair one broken item', () => {
  const session = new SurvivalSession(saved('ductTape', 'compass'), {
    seed: 1,
    initialConditions: { 'compass-1': 'broken' },
  });
  expect(session.perform('repairItem', {
    kind: 'itemRepair', target: 'compass-1',
  })).toMatchObject({ accepted: true, code: 'item-repaired' });
  expect(session.snapshot().inventory['compass-1']?.condition).toBe('usable');
  expect(session.snapshot().inventory['ductTape-1']?.condition).toBe('consumed');
});
```

Add `initialConditions?: Partial<Record<ItemInstanceId, ItemCondition>>` to `SurvivalSessionOptions`. The constructor applies only legal saved-instance transitions after creating `SurvivalInventoryState` and throws for an unknown instance or illegal condition. Do not expose mutable production inventory through snapshots.

- [ ] **Step 2: Run action and interaction tests and verify RED**

Run: `bunx vitest run tests/SurvivalSession.test.ts tests/BoatInteraction.test.ts`

Expected: FAIL on Water-free Rest, one-use Medkit, new actions, and repair target selection.

- [ ] **Step 3: Add exact action types and balance values**

Use:

```ts
export type DayActionId =
  | 'fish' | 'dive' | 'eat' | 'repair' | 'repairItem'
  | 'treat' | 'rest' | 'sendMessage' | 'useEnergyBar' | 'endDay';

export type DayActionOption =
  | { readonly kind: 'fishing'; readonly useBait: boolean }
  | { readonly kind: 'hullRepair'; readonly material: 'repairMaterial' | 'ductTape' }
  | { readonly kind: 'itemRepair'; readonly target: ItemInstanceId };
```

Add `bottledPaperEnergy: 1`, `bottledPaperRescueProgress: 15`, `maximumEnergy: 4`, and keep `restEnergy: 2`. Clamp energy to `maximumEnergy` rather than 100.

- [ ] **Step 4: Synchronize actions with per-instance conditions**

All ownership checks call `inventory.hasUsable(type)`. Food and Bait resource spending first reduces the aggregate, then consumes up to the spent `recoveredFood` or `recoveredBait` instances in stable instance order. Loose resources earned from fishing or diving remain aggregate-only and never recreate a consumed ship prop.

Implement these exact transitions:

```ts
case 'treat':
  this.inventory.consume('medicalKit', 1);
  return this.commit('treated', 'You clean and dress your wounds.', {
    health: SURVIVAL_BALANCE.actions.treatmentHealth,
  }, 'treat');
case 'sendMessage':
  this.inventory.consume('bottledPaper', 1);
  return this.commit('message-sent', 'You cast the message into the current.', {
    energy: -SURVIVAL_BALANCE.actions.bottledPaperEnergy,
    rescueProgress: SURVIVAL_BALANCE.actions.bottledPaperRescueProgress,
  }, 'sighting');
case 'useEnergyBar':
  this.inventory.consume('energyBar', 1);
  return this.commit('energy-bar-used', 'The ration restores your strength.', {
    energy: SURVIVAL_BALANCE.actions.maximumEnergy - this.energy,
  }, 'none');
```

`repairItem` validates one usable Duct Tape and a broken, breakable target, repairs the target, consumes `ductTape-1`, and applies no energy cost. The existing emergency Duct Tape hull patch remains an option under `repair` and consumes the same single Tape. Rest sets `restedToday`, restores up to two energy, and never reads inventory.

Set `actedToday = true` after every accepted day action except `endDay` so the day-event gate treats Food, Medkit, Energy Bar, Bottled Paper, and Rest consistently.

- [ ] **Step 5: Drive saved-item anchors from catalog actions**

Build `ACTION_FOR_ITEM` from catalog definitions and assert this exact mapping:

```ts
expect(ACTION_FOR_ITEM).toEqual({
  cannedFood: 'eat',
  ductTape: 'repairItem',
  medicalKit: 'treat',
  bottledPaper: 'sendMessage',
  energyBar: 'useEnergyBar',
  fishingRod: 'fish',
  scubaSet: 'dive',
});
```

Items with `dayAction: null`, including Bait and all event-only utilities, have inspectable props but no day-action anchor.

- [ ] **Step 6: Run action regression tests and commit**

Run: `bunx vitest run tests/SurvivalSession.test.ts tests/survivalInventory.test.ts tests/BoatInteraction.test.ts`

Expected: PASS with no `waterJug` reference and synchronized aggregate/instance consumption.

```bash
git add src/survival/survivalTypes.ts src/survival/survivalBalance.ts src/survival/SurvivalSession.ts src/survival/BoatInteraction.ts tests/SurvivalSession.test.ts tests/survivalInventory.test.ts tests/BoatInteraction.test.ts
git commit -m "feat: add Dorothy survival actions"
```

---

### Task 7: Add the selected wiki event catalog and weighted resolver

**Files:**
- Modify: `src/survival/events.ts`
- Create: `src/survival/eventResolver.ts`
- Create: `src/survival/eventParityAudit.ts`
- Modify: `src/survival/survivalTypes.ts`
- Modify: `tests/survivalEvents.test.ts`
- Create: `tests/eventResolver.test.ts`
- Create: `tests/eventParityAudit.test.ts`

**Interfaces:**
- Produces: weighted `EventChoiceDefinition`, `WeightedEventOutcome`, `ResourceEffect`, and `EventInventoryMutation`.
- Produces: `resolveWeightedOutcome(choice, random)` and catalog validation.
- Produces: a source audit that identifies every included and excluded wiki event with a fixed reason.

- [ ] **Step 1: Write failing catalog, audit, and resolver tests**

Assert the exact included IDs and current-loop phase adaptation:

```ts
const INCLUDED = {
  'dangerous-waters': 'day', leak: 'day', 'school-of-fish': 'day',
  snatcher: 'day', 'death-stare': 'day', 'swarm-of-anglerfish': 'day',
  whirlpool: 'day', 'shark-men': 'day',
  'shower-night': 'night', 'windy-night': 'night', 'bad-sleep': 'night',
  thunderstorm: 'night', 'restless-waves': 'night', 'man-in-the-fog': 'night',
  ghosts: 'night', 'eerie-melody': 'night', 'face-on-the-moon': 'night',
} as const;

expect(Object.fromEntries(SURVIVAL_EVENTS.map(({ id, phase }) => [id, phase])))
  .toEqual(INCLUDED);
expect(SURVIVAL_EVENTS.flatMap(({ choices }) => choices)
  .some(({ itemId }) => itemId === 'telescope')).toBe(false);
expect(SURVIVAL_EVENTS.flatMap(({ choices }) => choices)
  .some(({ itemId }) => itemId === 'spyglass')).toBe(true);
```

Resolver tests must cover a boundary roll, range draw, `set` versus `add`/`subtract`, consume, break, lose, break-random without replacement, lose-random without replacement, and `loseEventTarget`.

- [ ] **Step 2: Run the event tests and verify RED**

Run: `bunx vitest run tests/survivalEvents.test.ts tests/eventResolver.test.ts tests/eventParityAudit.test.ts`

Expected: FAIL because current events have one fixed response, no weighted outcomes, and no item-condition mutations.

- [ ] **Step 3: Define the exact event effect types**

Add:

```ts
export type EventResource =
  | 'health' | 'hull' | 'energy' | 'food' | 'bait' | 'rescueProgress';
export type IntegerValue = number | { readonly min: number; readonly max: number };
export interface ResourceEffect {
  readonly resource: EventResource;
  readonly operation: 'add' | 'subtract' | 'set';
  readonly value: IntegerValue;
}
export type EventInventoryMutation =
  | { readonly kind: 'consume' | 'break' | 'lose'; readonly itemId: ItemId; readonly quantity: number }
  | { readonly kind: 'breakRandom' | 'loseRandom'; readonly quantity: number }
  | { readonly kind: 'loseEventTarget'; readonly quantity: 1 };
export interface WeightedEventOutcome {
  readonly weight: number;
  readonly message: string;
  readonly effects: {
    readonly resources?: readonly ResourceEffect[];
    readonly items?: readonly EventInventoryMutation[];
    readonly rescue?: boolean;
  };
}
export interface EventChoiceDefinition {
  readonly id: string;
  readonly label: string;
  readonly itemId?: ItemId;
  readonly outcomes: readonly [WeightedEventOutcome, ...WeightedEventOutcome[]];
}
```

Validation rejects duplicate event or choice IDs, unknown item/resource IDs, empty choices/outcomes, nonpositive selectable weights, invalid ranges, noninteger quantities, invalid day bounds, and effects that try to break a catalog item with `breakable: false`.

- [ ] **Step 4: Selectively port the exact wiki rows**

Read the researched source rows without merging the branch:

```bash
git show codex/wiki-gameplay-parity:src/canonical/events.ts
```

Copy only the 17 IDs in `INCLUDED`, including their exact event weights, minimum/maximum days, cooldowns, choice outcome weights, health/hull/energy/food/bait effects, and item mutations. Apply only these explicit adaptations:

1. Use the phase map in `INCLUDED`.
2. Rename every `telescope` item reference and choice ID to `spyglass`.
3. Remove route prerequisites and route-weight bonuses because the current loop has no navigation-route state.
4. Translate each original `danger +1` into `rescueProgress -5` and each `danger +2` into `rescueProgress -10`.
5. Keep current terminal hull/health resolution instead of adding `broken-boat` as a second terminal event.
6. Do not add Chest gains, trades, companions, or non-Dorothy item IDs.

Preserve all other documented weights and outcomes exactly. This includes random item loss/breakage, selected Snatcher target loss, Flare/Harpoon/Duct Tape consumption, Bait/Food resource loss, and documented breakage for Compass, Map, Spyglass, Fishing Net, Bucket, Scuba Gear, Anchor, Umbrella, and Swim Ring.

- [ ] **Step 5: Record exact exclusions in a parity audit**

Create this fixed audit record:

```ts
export const EVENT_PARITY_AUDIT = {
  sources: {
    items: 'https://unoffdontsleepwiththefishes.fandom.com/wiki/Items',
    events: 'https://unoffdontsleepwiththefishes.fandom.com/wiki/Events',
    reviewed: '2026-07-15',
  },
  included: Object.keys(INCLUDED_EVENT_PHASES),
  excluded: {
    'peaceful-night': 'Represented by the existing quiet-night branch.',
    'check-the-back': 'Contains no Dorothy item response.',
    'needs-direction': 'Requires excluded route state and contains no item response.',
    'mystery-chest': 'Introduces later Chest loot.',
    seagull: 'Scheduling and outcome weights are undocumented.',
    'midnight-tour': 'Introduces later Chest loot and story-only outcomes.',
    'chest-attack': 'Requires the excluded Chest.',
    'broken-boat': 'Represented by the existing hull terminal rule.',
    'the-handyman': 'Requires excluded trades and later item acquisition.',
  },
} as const;
```

Test that every included choice item belongs to `ITEM_IDS`, no excluded event is selectable, every event item type has at least one included response, and every included/excluded ID is unique.

- [ ] **Step 6: Implement deterministic weighted resolution**

`resolveWeightedOutcome()` sums positive weights, chooses the first boundary whose cumulative weight exceeds `random.next() * total`, and resolves each integer range inclusively with `min + floor(random.next() * (max - min + 1))`. It returns cloned concrete effects and never mutates the catalog. Item selection and mutation application remain in `SurvivalSession` because the resolver does not own inventory.

- [ ] **Step 7: Run event tests and commit the catalog/resolver**

Run: `bunx vitest run tests/survivalEvents.test.ts tests/eventResolver.test.ts tests/eventParityAudit.test.ts`

Expected: PASS with 17 selected events, exact audit exclusions, no Water/Chest/trade references, and deterministic weighted outcomes.

```bash
git add src/survival/events.ts src/survival/eventResolver.ts src/survival/eventParityAudit.ts src/survival/survivalTypes.ts tests/survivalEvents.test.ts tests/eventResolver.test.ts tests/eventParityAudit.test.ts
git commit -m "feat: add wiki Dorothy event catalog"
```

---

### Task 8: Integrate weighted events, item mutations, and journal facts

**Files:**
- Modify: `src/survival/SurvivalSession.ts`
- Modify: `src/survival/journal.ts`
- Modify: `tests/SurvivalSession.test.ts`
- Modify: `tests/survivalJournal.test.ts`

**Interfaces:**
- Consumes: the Task 7 event catalog and resolver plus Task 2 `SurvivalInventoryState`.
- Produces: `resolveEvent(choiceId: string | null): ActionOutcome` and pending event-target state.
- Produces: journal records with attempted choice ID, attempted item type, concrete outcome, and condition mutation summary.

- [ ] **Step 1: Write failing integration tests for every mutation family**

Add deterministic tests for:

```ts
it('breaks and repairs a documented durable item', () => {
  const session = new SurvivalSession(saved('bucket', 'ductTape'), {
    seed: 1,
    random: sequenceRandom([0.99]),
    initialEventId: 'shower-night',
  });
  session.resolveEvent('bucket');
  expect(session.snapshot().inventory['bucket-1']?.condition).toBe('broken');
  expect(session.perform('repairItem', {
    kind: 'itemRepair', target: 'bucket-1',
  }).accepted).toBe(true);
  expect(session.snapshot().inventory['bucket-1']?.condition).toBe('usable');
});

it('consumes a one-use event item and rejects it afterward', () => {
  const session = new SurvivalSession(saved('flareGun'), {
    seed: 2,
    random: sequenceRandom([0]),
    initialEventId: 'ghosts',
  });
  expect(session.resolveEvent('flareGun').accepted).toBe(true);
  expect(session.snapshot().inventory['flareGun-1']?.condition).toBe('consumed');
});

it('loses the selected Snatcher target without losing another instance', () => {
  const session = new SurvivalSession(saved('anchor', 'fishingNet'), {
    seed: 3,
    random: sequenceRandom([0, 0]),
    initialEventId: 'snatcher',
  });
  expect(session.snapshot().pendingEventTargetId).toBe('anchor-1');
  session.resolveEvent('fishingNet');
  expect(session.snapshot().inventory['anchor-1']?.condition).toBe('lost');
  expect(session.snapshot().inventory['fishingNet-1']?.condition).toBe('usable');
});
```

Also test random break/loss without replacement, unsuitable choices, a broken item being ineligible, aggregate Food/Bait losses consuming recovered instances first, immediate rescue outcomes, and journal mutation summaries.

- [ ] **Step 2: Run session and journal tests and verify RED**

Run: `bunx vitest run tests/SurvivalSession.test.ts tests/survivalJournal.test.ts`

Expected: FAIL because session resolution still expects one fixed item response and charge flag.

- [ ] **Step 3: Store pending choice-event and target state**

Change the pending fields to the new event type and add:

```ts
private pendingEventTargetId: ItemInstanceId | null = null;
```

When opening `snatcher`, choose one usable or broken saved instance from the event's documented target types, sorted by `instanceId`, using the seeded random source. Exclude consumed/lost items and the Fishing Net used to respond only if another valid target exists. Return the target ID in immutable snapshots so UI and tests can name the threatened item.

- [ ] **Step 4: Resolve choices and apply concrete effects in order**

Resolution order is:

1. validate the event and selected choice;
2. validate that the choice's item type has a usable instance;
3. draw one weighted concrete outcome;
4. apply resource operations in authored order;
5. apply item mutations in authored order;
6. resolve terminal state or immediate rescue;
7. clear pending event/target state;
8. record the concrete result in the journal.

`set` assigns the clamped resource, `add` adds, and `subtract` subtracts. Danger translations are already concrete rescue-progress subtraction. `consume`, `break`, and `lose` select matching eligible instances in stable order. Random mutations use the session random source without replacement. `loseEventTarget` uses only `pendingEventTargetId`.

When Food or Bait decreases, consume recovered instances first and leave loose resources represented only in the aggregate. When an event adds Food or Bait, do not create a new item instance or boat prop.

- [ ] **Step 5: Extend journal records with concrete choice facts**

Add:

```ts
export interface JournalInventoryMutation {
  readonly kind: 'consume' | 'break' | 'lose' | 'repair';
  readonly instanceIds: readonly ItemInstanceId[];
}
```

`JournalEventRecord` stores `attemptedChoiceId`, `attemptedItemId`, `outcomeMessage`, and immutable `inventoryMutations`. Existing prose formatting mentions a broken, consumed, or lost item by catalog label when mutations exist. It does not expose internal instance IDs in player-facing prose.

- [ ] **Step 6: Run event/session/journal regression tests and commit**

Run: `bunx vitest run tests/survivalEvents.test.ts tests/eventResolver.test.ts tests/SurvivalSession.test.ts tests/survivalJournal.test.ts`

Expected: PASS for every resource operation and inventory mutation family.

```bash
git add src/survival/SurvivalSession.ts src/survival/journal.ts tests/SurvivalSession.test.ts tests/survivalJournal.test.ts
git commit -m "feat: resolve wiki item outcomes"
```

---

### Task 9: Complete UI artwork, condition presentation, and interaction flow

**Files:**
- Modify: `src/ui/uiArtwork.ts`
- Modify: `src/survival/itemDescriptions.ts`
- Modify: `src/ui/GameUI.ts`
- Modify: `src/ui/SurvivalUI.ts`
- Modify: `src/survival/SurvivalPhase.ts`
- Modify: `src/survival/BoatWorld.ts`
- Modify: `src/styles/main.css`
- Modify: `tests/UIArtwork.test.ts`
- Modify: `tests/GameUI.test.ts`
- Modify: `tests/SurvivalUI.test.ts`
- Modify: `tests/SurvivalPhase.test.ts`
- Modify: `tests/SurvivalPhaseFocus.test.ts`
- Modify: `tests/BoatWorld.test.ts`

**Interfaces:**
- Consumes: catalog labels/actions, per-instance conditions, broken target IDs, pending event choices, and model-backed boat props.
- Produces: SVG artwork for all 19 types, repair-target chooser, corrected event choices, stable Rest command, and condition-aware anchors/tooltips.

- [ ] **Step 1: Write failing artwork and interface contract tests**

Assert:

```ts
expect(ITEM_ARTWORK_IDS).toEqual(ITEM_IDS);
for (const id of ITEM_IDS) {
  const markup = itemArtwork(id);
  expect(markup).toContain(`data-item-artwork="${id}"`);
  expect(markup).not.toContain('<text');
  expect(markup).not.toMatch(/https?:\/\//);
}
expect(itemArtwork('flareGun')).toContain('data-item-artwork="flareGun"');
expect(ITEM_ARTWORK_IDS).not.toContain('waterJug');
```

Add DOM tests for:

- Rest available without a saved Water item;
- Bottled Paper and Energy Bar action anchors;
- Duct Tape opening a chooser containing only broken repairable items;
- event buttons for usable choices and disabled condition text for broken items;
- Food and Bait quantity labels reflecting aggregate totals;
- consumed/lost items having no usable anchor;
- broken items remaining visible with `BROKEN` tooltip text;
- focus returning to the invoking control or the next usable command when a consumed item disappears.

- [ ] **Step 2: Run UI, phase, and world tests and verify RED**

Run: `bunx vitest run tests/UIArtwork.test.ts tests/GameUI.test.ts tests/SurvivalUI.test.ts tests/SurvivalPhase.test.ts tests/SurvivalPhaseFocus.test.ts tests/BoatWorld.test.ts`

Expected: FAIL because artwork and UI still describe nine types, water, charges, and fixed one-counter events.

- [ ] **Step 3: Add project-authored SVG portraits and descriptions**

Keep all artwork as local inline path geometry. New portraits must use these recognizable motifs: compass circle/needle, folded map/route, telescoping Spyglass tubes, net hoop/grid, bucket handle, anchor ring/flukes, bottle/note, folded umbrella/crook, Swim Ring torus/bands, Harpoon Gun spear/barrel, and Energy Bar wrapper/seals. Redraw the Flare Gun portrait to match the new short barrel, large muzzle, angled grip, and trigger guard.

Define exact descriptions:

```ts
export const SURVIVAL_ITEM_DESCRIPTIONS: Readonly<Record<ItemId, string>> = {
  cannedFood: 'One meal that relieves hunger.',
  baitTin: 'One bait portion that improves a fishing attempt.',
  ductTape: 'A single emergency repair for a broken item or hull patch.',
  compass: 'Keeps direction when landmarks disappear.',
  map: 'Charts safer water through dangerous routes.',
  medicalKit: 'Treats injuries once.',
  spyglass: 'Reveals distant movement and threats.',
  fishingNet: 'Collects fish and floating supplies.',
  bucket: 'Bails water and catches loose supplies.',
  flareGun: 'Fires one signal flare.',
  scubaSet: 'Enables dives beneath the lifeboat.',
  anchor: 'Holds the lifeboat against dangerous water.',
  bottledPaper: 'Sends one rescue message for one energy.',
  umbrella: 'Provides cover from rain, sun, and strange sights.',
  swimRing: 'Provides emergency flotation.',
  flashlight: 'Improves visibility in darkness and while diving.',
  harpoonGun: 'Provides one defensive harpoon shot.',
  energyBar: 'Restores energy to four once.',
  fishingRod: 'Enables fishing, with optional Bait.',
};
```

- [ ] **Step 4: Render quantities and conditions from snapshots**

`GameUI` groups saved results by catalog order and prints `FOOD x3`/`BAIT x2` rather than duplicate lines. The carry portraits still repeat one portrait for every occupied weight point.

`SurvivalUI` builds inventory and event labels from catalog records. Use condition suffixes `BROKEN`, `USED`, and `LOST`. Event response buttons represent authored choices; suitable usable items are enabled, unsuitable usable items remain selectable for the unsuitable outcome, and broken/consumed/lost items are disabled with the reason in `aria-description`.

- [ ] **Step 5: Add repair selection and fixed Rest flow**

Add a repair-target modal parallel to the existing fishing option modal. It lists broken breakable instances by catalog label and dispatches:

```ts
this.onAction('repairItem', { kind: 'itemRepair', target: instanceId });
```

Add a stable Rest control with shortcut `6`; it is not projected from a saved item and remains visible when no supplies were recovered. Preserve modal focus isolation, Escape close behavior, pause precedence, visible focus, and focus restoration.

- [ ] **Step 6: Synchronize BoatWorld props and anchors with conditions**

`BoatWorld.updateInventory(snapshot)` must:

- keep usable and broken saved props visible;
- apply a restrained desaturated/dark material treatment to broken props without mutating shared templates;
- hide consumed and lost props;
- project actions only for usable props;
- project inspect-only anchors for broken props;
- retain the fixed hull-repair patch;
- never create a Water Bottle or inventory Repair Kit prop.

Clone condition materials once per prop, dispose clones exactly once, and keep item transforms rigidly attached to the lifeboat motion rig.

- [ ] **Step 7: Update responsive styles and remove water selectors**

Add `.item-artwork--<id>` palette variables for the ten new portraits, `.boat-anchor[data-condition="broken"]`, repair chooser styles, disabled event-choice treatment, and narrow-height scrolling. Remove `.item-artwork--waterJug`, Water text, and water-charge selectors. Keep hover/active selectors guarded by `:not(:disabled):not([aria-disabled="true"])` and preserve reduced-motion behavior.

- [ ] **Step 8: Run complete presentation tests and commit**

Run: `bunx vitest run tests/UIArtwork.test.ts tests/GameUI.test.ts tests/SurvivalUI.test.ts tests/SurvivalPhase.test.ts tests/SurvivalPhaseFocus.test.ts tests/BoatWorld.test.ts`

Expected: PASS for 19 portraits, condition presentation, new actions, event choices, focus, and prop lifecycle.

```bash
git add src/ui/uiArtwork.ts src/survival/itemDescriptions.ts src/ui/GameUI.ts src/ui/SurvivalUI.ts src/survival/SurvivalPhase.ts src/survival/BoatWorld.ts src/styles/main.css tests/UIArtwork.test.ts tests/GameUI.test.ts tests/SurvivalUI.test.ts tests/SurvivalPhase.test.ts tests/SurvivalPhaseFocus.test.ts tests/BoatWorld.test.ts
git commit -m "feat: present complete Dorothy inventory"
```

---

### Task 10: Remove stale contracts, verify the full game, and perform visual QA

**Files:**
- Modify: `README.md`
- Modify: any failing test fixture that still names an intentionally removed item or obsolete aggregate inventory shape
- Verify: all source, tests, scripts, models, docs, and asset provenance

**Interfaces:**
- Produces: a clean repository-wide contract with no Water Bottle or obsolete nine-item assumptions.
- Produces: visual sign-off for all 22 Dorothy pickups and recovered lifeboat states.

- [ ] **Step 1: Add repository-wide stale-contract tests**

Extend `tests/AssetPolicy.test.ts` or add a focused test that scans production source, model filenames, and runtime docs:

```ts
for (const forbidden of ['waterJug', 'WATER BOTTLE', 'blaster-n.glb']) {
  expect(productionText, forbidden).not.toContain(forbidden);
}
expect(createItemInstances()).toHaveLength(22);
expect(ITEM_IDS).toHaveLength(19);
```

Allow historical design/plan documents to retain old names when describing removed behavior. Do not rewrite history files.

- [ ] **Step 2: Run the full suite and fix only parity-related regressions**

Run: `bun run models:check`

Expected: PASS for exactly 19 GLBs and matching metadata/provenance.

Run: `bun run test`

Expected: PASS with no failed test.

Run: `bun run typecheck`

Expected: exit 0 with no TypeScript diagnostic.

Run: `bun run build`

Expected: exit 0 with a production bundle and no missing asset.

- [ ] **Step 3: Update player-facing documentation**

Document the exact 19-type/22-pickup contract, three-point weighted carrying, one-use items, broken/lost/consumed conditions, Duct Tape repair, item-independent Rest, Bottled Paper, Energy Bar, and wiki-event adaptation. State that the Repair Kit is built into the lifeboat and that production assets are local.

- [ ] **Step 4: Inspect every model in Dorothy at both target sizes**

Start the development server with the repository's existing dev command and use the in-app browser-control skill. At 1280 by 720 and 1920 by 1080:

1. Visit all five ship zones and identify every one of the 22 pickups.
2. Check scale, orientation, shadows, surface contact, collision, standing reach, doors, stairs, main lanes, and the lifeboat approach.
3. Exercise weight-one, weight-two, and weight-three carrying, including three Food/Bait-sized items together and Anchor/Scuba Gear alone.
4. Confirm the result summary reports duplicate quantities correctly.
5. Compare the replacement Flare Gun against the approved silhouette: compact red/orange signal barrel, oversized muzzle, dark angled grip, trigger guard, and hinge. Reject any science-fiction blaster appearance.

If a model transform needs visual tuning, change only its authored recipe or hand-written presentation transform, rebuild the full atomic model publication, rerun `bun run models:check`, and repeat both viewport checks.

- [ ] **Step 5: Inspect recovered supplies and conditions in survival**

Create representative saved sets that collectively include all 19 types. Check calm day, night, overcast, and squall presentation. Exercise Food, Bait, Medkit, Rest, Energy Bar, Bottled Paper, hull repair, broken-item repair, one consumable event item, one broken durable item, and one lost item. Confirm:

- usable and broken props remain correctly placed;
- consumed and lost props no longer expose usable anchors;
- tooltips, event choices, journal prose, and aggregate resources agree with instance conditions;
- repair and event modals remain readable and keyboard accessible;
- interaction anchors remain legible when the boat carries the maximum practical variety;
- restart begins with clean condition state.

- [ ] **Step 6: Run final evidence commands**

Run:

```text
bun run models:check
bun run test
bun run typecheck
bun run build
git diff --check
git status --short
```

Expected: all four project commands PASS, `git diff --check` prints nothing, and status contains only the intended parity files before the final commit.

- [ ] **Step 7: Request code review, address findings, and rerun verification**

Use `superpowers:requesting-code-review` against the approved design and this plan. Resolve any catalog, state, asset, event, accessibility, or lifecycle finding, then rerun the six final evidence commands from Step 6.

- [ ] **Step 8: Commit documentation and final integration fixes**

```bash
git add -- README.md tests/AssetPolicy.test.ts
git commit -m "docs: document Dorothy item parity"
```

Do not include unrelated working-tree files in this commit.

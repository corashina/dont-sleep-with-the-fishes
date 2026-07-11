# Physical Inventory and Boat Interactions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace type-only supplies and menu-driven survival actions with repeatable weighted item instances that remain physically visible in the lifeboat, while preventing ocean waves from rendering inside either vessel.

**Architecture:** Stable `ItemInstance` values cross the scavenging/survival boundary. Pure sessions own status, capacity, aggregation, and action legality; Three.js worlds own prop meshes, deterministic placement, projection, and water-exclusion transforms; DOM UIs own feedback, accessible projected hotspots, tooltips, and dialogs.

**Tech Stack:** TypeScript 5.9, Three.js 0.180, Vite 7, Vitest 3.2, jsdom, GLSL, DOM/CSS.

## Global Constraints

- Desktop browser only; preserve keyboard/mouse controls and pointer-lock behavior.
- Add no runtime dependencies.
- Item weights are integers from one to three; player carry capacity is exactly three.
- Approved spawn counts are food 3, bait 2, duct tape 2, flare gun 1, flashlight 1, fishing rod 1, medical kit 1, water jug 2, and scuba set 1.
- Scuba set weight is three; fishing rod, medical kit, and water jug weight two; every other item weight one.
- The lifeboat has no logical capacity and must retain every saved instance.
- Fishing requires a recovered fishing rod; diving requires a recovered scuba set.
- Remove the bottom survival action dock and bottom-right inventory tray.
- Retain numeric shortcuts `1`–`7`, dialogs, focus traps, announcements, pause/restart flows, reduced motion, and seeded survival behavior.
- Water exclusion changes rendering only; wave sampling, buoyancy, item-loss checks, and scoring keep the shared wave field.
- All behavior changes use test-driven development and each task ends in a focused commit.

---

## File Structure

### Create

- `src/world/BoatStorage.ts` — deterministic unlimited item-placement transforms shared by both boat phases.
- `src/ocean/WaterExclusion.ts` — vessel-local water exclusion data and transform helpers.
- `src/survival/BoatInteraction.ts` — item-to-action mapping and projected anchor contracts.
- `tests/ItemState.test.ts` — item catalog, instance IDs, weights, counts, and charge definitions.
- `tests/WaterExclusion.test.ts` — exclusion transforms, bounds, shader uniforms, and inactive defaults.
- `tests/BoatInteraction.test.ts` — action mapping and 3D-to-screen projection.

### Modify

- `src/game/ItemState.ts` — add scuba set, definitions, instance types, and deterministic instance creation.
- `src/game/ScavengeSession.ts` — ordered multi-item carrying, weight capacity, instance status, and saved-instance results.
- `src/interaction/CarryController.ts` — visible carried bundle and one active LIFO flight.
- `src/interaction/InteractionSystem.ts` — instance targeting, capacity prompts, and lifeboat highlighting.
- `src/phases/ScavengePhase.ts` — share instances across session/world and route visible feedback.
- `src/world/Ship.ts` — fourteen authored spawn points.
- `src/world/PropFactory.ts` — procedural scuba-set prop and instance metadata.
- `src/world/Lifeboat.ts` — rescue-orange hull, storage root, no slot silhouettes, and interior bounds.
- `src/world/World.ts` — instance meshes, enlarged/closer scavenging boat, storage placement, and exclusions.
- `src/ui/GameUI.ts` — `CARRY n / 3`, carried-instance list, and transient result feedback.
- `src/Game.ts` — deep-copy immutable saved instances across the phase boundary.
- `src/survival/inventory.ts` — aggregate duplicate saved instances and per-instance charges.
- `src/survival/SurvivalSession.ts` — consume instance aggregates and gate fish/dive by equipment.
- `src/survival/BoatWorld.ts` — build saved props, depletion presentation, projected anchors, and water exclusion.
- `src/survival/SurvivalPhase.ts` — synchronize snapshots, physical props, viewport anchors, and UI commands.
- `src/survival/itemDescriptions.ts` — scuba-set description.
- `src/survival/survivalTypes.ts` — instance-aware survival snapshot metadata.
- `src/ui/SurvivalUI.ts` — projected item buttons/tooltips; remove action dock and inventory tray.
- `src/ocean/OceanRenderer.ts` — shader support for two moving vessel exclusions.
- `src/styles/main.css` — carry HUD, save feedback, projected tooltips, depleted states, and removal of dock/tray styling.
- `README.md` — repeatable weighted scavenging, physical survival items, and item-linked controls.
- `tests/ScavengeSession.test.ts` — capacity, duplicates, LIFO transitions, and immutable results.
- `tests/interaction.test.ts` — multi-carry controller and capacity-aware context actions.
- `tests/GameUI.test.ts` — carry meter/list and stable feedback rendering.
- `tests/world.test.ts` — fourteen instances, scuba geometry, storage transforms, boat visibility, and exclusions.
- `tests/GameDirector.test.ts` — deep immutable instance handoff.
- `tests/survivalInventory.test.ts` — duplicate aggregation and scuba ownership.
- `tests/SurvivalSession.test.ts` — rod/scuba gating and duplicate consumables.
- `tests/BoatWorld.test.ts` — saved prop construction, depletion, anchors, and cue compatibility.
- `tests/SurvivalUI.test.ts` — tooltips, projected controls, shortcuts, dialogs, and removed menus.
- `tests/SurvivalPhase.test.ts` — world/UI synchronization of snapshot and anchors.
- `tests/smoke.test.ts` — nine item types and cross-phase content contracts.

---

### Task 1: Item Catalog and Stable Instances

**Files:**
- Modify: `src/game/ItemState.ts`
- Create: `tests/ItemState.test.ts`
- Modify: `src/survival/itemDescriptions.ts`

**Interfaces:**
- Consumes: no new project interfaces.
- Produces: `ItemId`, `ItemInstanceId`, `ItemInstance`, `ITEM_DEFINITIONS`, `ITEM_IDS`, `createItemInstances()`, `itemDefinition(id)`.

- [ ] **Step 1: Write the failing catalog tests**

```ts
import { describe, expect, it } from 'vitest';
import { ITEM_DEFINITIONS, ITEM_IDS, createItemInstances } from '../src/game/ItemState';

describe('physical item catalog', () => {
  it('defines the approved weights and counts', () => {
    expect(ITEM_DEFINITIONS.scubaSet).toMatchObject({ weight: 3, spawnCount: 1, durable: true });
    expect(ITEM_DEFINITIONS.fishingRod.weight).toBe(2);
    expect(ITEM_DEFINITIONS.cannedFood).toMatchObject({ weight: 1, spawnCount: 3, charges: 1 });
    expect(ITEM_DEFINITIONS.waterJug).toMatchObject({ weight: 2, spawnCount: 2, charges: 3 });
    expect(ITEM_IDS).toHaveLength(9);
  });

  it('creates fourteen stable unique instances', () => {
    const first = createItemInstances();
    const second = createItemInstances();
    expect(first).toHaveLength(14);
    expect(first).toEqual(second);
    expect(new Set(first.map(({ instanceId }) => instanceId))).toHaveLength(14);
    expect(first.filter(({ type }) => type === 'cannedFood').map(({ instanceId }) => instanceId))
      .toEqual(['cannedFood-1', 'cannedFood-2', 'cannedFood-3']);
  });
});
```

- [ ] **Step 2: Run the focused test and verify failure**

Run: `bun run test -- tests/ItemState.test.ts`

Expected: FAIL because `ITEM_DEFINITIONS`, `createItemInstances`, and `scubaSet` do not exist.

- [ ] **Step 3: Implement the catalog and instance factory**

```ts
export const ITEM_IDS = [
  'flareGun', 'ductTape', 'fishingRod', 'baitTin', 'medicalKit',
  'waterJug', 'cannedFood', 'flashlight', 'scubaSet',
] as const;

export type ItemId = (typeof ITEM_IDS)[number];
export type ItemInstanceId = `${ItemId}-${number}`;

export interface ItemDefinition {
  label: string;
  weight: 1 | 2 | 3;
  spawnCount: number;
  charges: number | null;
  durable: boolean;
}

export interface ItemInstance {
  instanceId: ItemInstanceId;
  type: ItemId;
}

export type ItemStatus = 'available' | 'carried' | 'saved' | 'lost';

export const ITEM_DEFINITIONS: Readonly<Record<ItemId, ItemDefinition>> = {
  flareGun: { label: 'FLARE GUN', weight: 1, spawnCount: 1, charges: 1, durable: false },
  ductTape: { label: 'DUCT TAPE', weight: 1, spawnCount: 2, charges: 2, durable: false },
  fishingRod: { label: 'FISHING ROD', weight: 2, spawnCount: 1, charges: null, durable: true },
  baitTin: { label: 'BAIT TIN', weight: 1, spawnCount: 2, charges: 3, durable: false },
  medicalKit: { label: 'MEDICAL KIT', weight: 2, spawnCount: 1, charges: 2, durable: false },
  waterJug: { label: 'WATER JUG', weight: 2, spawnCount: 2, charges: 3, durable: false },
  cannedFood: { label: 'CANNED FOOD', weight: 1, spawnCount: 3, charges: 1, durable: false },
  flashlight: { label: 'FLASHLIGHT', weight: 1, spawnCount: 1, charges: null, durable: true },
  scubaSet: { label: 'SCUBA SET', weight: 3, spawnCount: 1, charges: null, durable: true },
};

export const ITEM_LABELS = Object.fromEntries(
  ITEM_IDS.map((id) => [id, ITEM_DEFINITIONS[id].label]),
) as Readonly<Record<ItemId, string>>;

export const itemDefinition = (id: ItemId): ItemDefinition => ITEM_DEFINITIONS[id];

export function createItemInstances(): ItemInstance[] {
  return ITEM_IDS.flatMap((type) => Array.from(
    { length: ITEM_DEFINITIONS[type].spawnCount },
    (_, index) => ({ instanceId: `${type}-${index + 1}` as ItemInstanceId, type }),
  ));
}
```

Add `scubaSet: 'Enables safe dives beneath the lifeboat.'` to `SURVIVAL_ITEM_DESCRIPTIONS`.

- [ ] **Step 4: Run catalog and current suite**

Run: `bun run test -- tests/ItemState.test.ts tests/smoke.test.ts`

Before running, change the smoke assertion from eight item types to nine. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/game/ItemState.ts src/survival/itemDescriptions.ts tests/ItemState.test.ts tests/smoke.test.ts
git commit -m "feat: define weighted item instances"
```

---

### Task 2: Weight-Limited Scavenging Session

**Files:**
- Modify: `src/game/ScavengeSession.ts`
- Modify: `tests/ScavengeSession.test.ts`

**Interfaces:**
- Consumes: `ItemInstance`, `ItemInstanceId`, `createItemInstances()`, `ITEM_DEFINITIONS` from Task 1.
- Produces: `ScavengeSnapshot.carriedItems`, `carriedWeight`, instance-keyed `items`, LIFO `dropCarried()`/`saveCarried()`/`loseCarried()`, and `ScavengeResult.savedItems: readonly ItemInstance[]`.

- [ ] **Step 1: Replace the single-item tests with failing capacity and duplicate tests**

```ts
it('carries repeatable instances up to total weight three', () => {
  const session = new ScavengeSession();
  session.start();
  expect(session.pickUp('cannedFood-1')).toBe(true);
  expect(session.pickUp('ductTape-1')).toBe(true);
  expect(session.pickUp('flashlight-1')).toBe(true);
  expect(session.snapshot()).toMatchObject({ carriedWeight: 3 });
  expect(session.pickUp('cannedFood-2')).toBe(false);
  expect(session.snapshot().carriedItems.map(({ instanceId }) => instanceId))
    .toEqual(['cannedFood-1', 'ductTape-1', 'flashlight-1']);
});

it('rejects a heavy item unless the full capacity is free', () => {
  const session = new ScavengeSession();
  session.start();
  session.pickUp('cannedFood-1');
  expect(session.pickUp('scubaSet-1')).toBe(false);
  expect(session.dropCarried()?.instanceId).toBe('cannedFood-1');
  expect(session.pickUp('scubaSet-1')).toBe(true);
});

it('saves duplicate instances without a boat limit', () => {
  const session = new ScavengeSession();
  session.start();
  for (const id of ['cannedFood-1', 'cannedFood-2', 'cannedFood-3'] as const) {
    session.pickUp(id);
    expect(session.saveCarried()?.instanceId).toBe(id);
  }
  expect(session.snapshot().savedCount).toBe(3);
});
```

- [ ] **Step 2: Run and verify the old API fails**

Run: `bun run test -- tests/ScavengeSession.test.ts`

Expected: FAIL because pickups still accept type IDs, carrying is singular, and the boat stops at five.

- [ ] **Step 3: Implement instance state and capacity**

```ts
export interface ScavengeItemState extends ItemInstance { status: ItemStatus }

export interface ScavengeSnapshot {
  status: SessionStatus;
  remainingSeconds: number;
  savedCount: number;
  carriedWeight: number;
  carriedItems: readonly ItemInstance[];
  items: Readonly<Record<ItemInstanceId, ScavengeItemState>>;
}

const CARRY_CAPACITY = 3;

export class ScavengeSession {
  private readonly items: Record<ItemInstanceId, ScavengeItemState>;
  private readonly carriedIds: ItemInstanceId[] = [];

  constructor(instances: readonly ItemInstance[] = createItemInstances()) {
    this.items = Object.fromEntries(instances.map((item) => [
      item.instanceId, { ...item, status: 'available' as const },
    ])) as Record<ItemInstanceId, ScavengeItemState>;
  }

  get carriedWeight(): number {
    return this.carriedIds.reduce((sum, id) => sum + ITEM_DEFINITIONS[this.items[id].type].weight, 0);
  }

  pickUp(instanceId: ItemInstanceId): boolean {
    const item = this.items[instanceId];
    if (this.status !== 'running' || !item || item.status !== 'available') return false;
    if (this.carriedWeight + ITEM_DEFINITIONS[item.type].weight > CARRY_CAPACITY) return false;
    item.status = 'carried';
    this.carriedIds.push(instanceId);
    return true;
  }

  private releaseCarried(status: ItemStatus): ItemInstance | null {
    if (this.status !== 'running') return null;
    const instanceId = this.carriedIds.pop();
    if (!instanceId) return null;
    this.items[instanceId].status = status;
    const { type } = this.items[instanceId];
    return { instanceId, type };
  }
}
```

Implement `dropCarried()` with `available`, `saveCarried()` with `saved`, and `loseCarried()` with `lost`; remove `BOAT_CAPACITY`. Freeze cloned carried/items/saved instance values in `snapshot()` and `result()`.

- [ ] **Step 4: Run the session tests**

Run: `bun run test -- tests/ScavengeSession.test.ts`

Expected: PASS for timer, pause, capacity, duplicates, LIFO transitions, idempotence, and immutable result tests.

- [ ] **Step 5: Commit**

```bash
git add src/game/ScavengeSession.ts tests/ScavengeSession.test.ts
git commit -m "feat: enforce scavenging carry weight"
```

---

### Task 3: Multi-Prop Carrying and Context Actions

**Files:**
- Modify: `src/interaction/CarryController.ts`
- Modify: `src/interaction/InteractionSystem.ts`
- Modify: `tests/interaction.test.ts`

**Interfaces:**
- Consumes: Task 1 instance types and Task 2 LIFO semantics.
- Produces: `CarryController.pickUp(instance, object)`, `activeInstance`, `flightActive`, instance-based flight handlers, `ContextInput.remainingCapacity`, and `capacityFull` context action.

- [ ] **Step 1: Write failing carry-bundle and prompt tests**

```ts
it('attaches three light instances as a visible bundle and releases LIFO', () => {
  const scene = new Scene();
  const camera = new PerspectiveCamera();
  scene.add(camera);
  const objects = [new Group(), new Group(), new Group()];
  objects.forEach((object) => scene.add(object));
  const carry = new CarryController(scene, camera);
  const instances = ['cannedFood-1', 'ductTape-1', 'flashlight-1'].map((instanceId) => ({
    instanceId, type: instanceId.split('-')[0],
  })) as ItemInstance[];

  instances.forEach((instance, index) => expect(carry.pickUp(instance, objects[index])).toBe(true));
  expect(objects.every(({ parent }) => parent === camera)).toBe(true);
  expect(carry.drop()).toBe('flashlight-1');
  expect(carry.activeInstance?.instanceId).toBe('ductTape-1');
});

it('explains when a targeted pickup exceeds remaining capacity', () => {
  expect(chooseContextAction({
    target: 'item', targetItem: { instanceId: 'scubaSet-1', type: 'scubaSet' },
    carriedItem: { instanceId: 'cannedFood-1', type: 'cannedFood' },
    remainingCapacity: 2, nearEvacuation: false,
  })).toEqual({ type: 'capacityFull', prompt: 'SCUBA SET WEIGHS 3 — 2 CAPACITY FREE' });
});
```

- [ ] **Step 2: Run and verify failure**

Run: `bun run test -- tests/interaction.test.ts`

Expected: FAIL because the controller rejects a second carried object and context input still uses type IDs and boat capacity.

- [ ] **Step 3: Implement bundled transforms and instance targeting**

```ts
const CARRY_OFFSETS = [
  new Vector3(0.56, -0.48, -1.12),
  new Vector3(0.18, -0.54, -1.02),
  new Vector3(-0.24, -0.50, -1.08),
] as const;

function capturePlacement(object: Object3D): OriginalPlacement {
  return {
    parent: object.parent,
    position: object.position.clone(),
    quaternion: object.quaternion.clone(),
    scale: object.scale.clone(),
  };
}

get activeInstance(): ItemInstance | null {
  return this.carried.at(-1)?.instance ?? null;
}

get flightActive(): boolean { return this.flight !== null; }

pickUp(instance: ItemInstance, object: Object3D): boolean {
  if (this.flight !== null) return false;
  this.carried.push({ instance, object, original: capturePlacement(object) });
  this.camera.add(object);
  this.reflowCarried();
  return true;
}

private reflowCarried(): void {
  this.carried.forEach(({ object }, index) => {
    object.position.copy(CARRY_OFFSETS[index] ?? CARRY_OFFSETS[2]);
    object.rotation.set(-0.15, 0.45 - index * 0.2, 0.08);
    object.scale.setScalar(0.72);
  });
}
```

Use these exact context contracts, change raycast metadata to `userData.instanceId`, resolve `targetItem` through an instance map, remove `boatFull`, and highlight the lifeboat root as well as item roots. Throw/drop pop only the newest carried entry and preserve the remaining bundle.

```ts
export interface ContextInput {
  target: RayTarget;
  targetItem: ItemInstance | null;
  carriedItem: ItemInstance | null;
  remainingCapacity: number;
  nearEvacuation: boolean;
}

export type ContextAction =
  | { type: 'none'; prompt: '' }
  | { type: 'pickUp'; item: ItemInstance; prompt: string }
  | { type: 'drop'; item: ItemInstance; prompt: string }
  | { type: 'throwToBoat'; item: ItemInstance; prompt: string }
  | { type: 'capacityFull'; prompt: string }
  | { type: 'evacuate'; prompt: string };
```

- [ ] **Step 4: Run interaction tests**

Run: `bun run test -- tests/interaction.test.ts`

Expected: PASS for multi-carry, transform preservation, LIFO flight, landing/loss, instance raycasts, capacity prompts, boat targeting, and disposal.

- [ ] **Step 5: Commit**

```bash
git add src/interaction/CarryController.ts src/interaction/InteractionSystem.ts tests/interaction.test.ts
git commit -m "feat: carry and target item bundles"
```

---

### Task 4: Scavenging World, Lifeboat Storage, and HUD

**Files:**
- Create: `src/world/BoatStorage.ts`
- Modify: `src/world/Ship.ts`
- Modify: `src/world/PropFactory.ts`
- Modify: `src/world/Lifeboat.ts`
- Modify: `src/world/World.ts`
- Modify: `src/ui/GameUI.ts`
- Modify: `tests/world.test.ts`
- Modify: `tests/GameUI.test.ts`

**Interfaces:**
- Consumes: item instances and instance-based carry/session APIs.
- Produces: `boatStorageTransform(index)`, `LifeboatBuild.storageRoot`, fourteen spawn points, scuba geometry, `World.itemObjects: Map<ItemInstanceId, Group>`, and `GameUI.showFeedback(text)`.

- [ ] **Step 1: Write failing storage, prop, and HUD tests**

```ts
it('packs every approved instance and extends into deterministic layers', () => {
  expect(boatStorageTransform(0)).toEqual(boatStorageTransform(0));
  expect(boatStorageTransform(14).position.y)
    .toBeCloseTo(boatStorageTransform(0).position.y + 0.28);
});

it('builds fourteen instance meshes including a distinct scuba set', () => {
  const world = new World(new Scene(), createItemInstances());
  expect(world.itemObjects.size).toBe(14);
  expect(world.itemObjects.get('scubaSet-1')?.userData.itemType).toBe('scubaSet');
  world.dispose();
});

it('renders carry weight, items, and save feedback without slot markers', () => {
  const mount = document.createElement('main');
  const ui = new GameUI(mount);
  ui.render(snapshot({
    carriedWeight: 2,
    carriedItems: [{ instanceId: 'cannedFood-1', type: 'cannedFood' }, { instanceId: 'ductTape-1', type: 'ductTape' }],
  }), getSinkingState(0, 120));
  ui.showFeedback('SAVED — CANNED FOOD');
  expect(mount.querySelector('[data-carry-weight]')?.textContent).toBe('2 / 3');
  expect(mount.querySelector('[data-carried-items]')?.textContent).toContain('CANNED FOOD · 1');
  expect(mount.querySelector('[data-feedback]')?.textContent).toBe('SAVED — CANNED FOOD');
  expect(mount.querySelector('.slot')).toBeNull();
});
```

- [ ] **Step 2: Run and verify failure**

Run: `bun run test -- tests/world.test.ts tests/GameUI.test.ts`

Expected: FAIL because there are eight type meshes, five visual slots, no scuba prop, and no carry-weight HUD.

- [ ] **Step 3: Implement deterministic storage and visible boat changes**

```ts
export interface BoatStorageTransform {
  position: Vector3;
  rotation: Euler;
  scale: number;
}

const BASE_POSITIONS: readonly [number, number, number][] = [
  [-0.72, -0.10, -1.82], [0, -0.10, -1.82], [0.72, -0.10, -1.82],
  [-0.72, -0.10, -1.16], [0, -0.10, -1.16], [0.72, -0.10, -1.16],
  [-0.72, -0.10, -0.50], [0.72, -0.10, -0.50],
  [-0.72, -0.10, 0.16], [0.72, -0.10, 0.16],
  [-0.72, -0.10, 0.82], [0, -0.10, 0.82], [0.72, -0.10, 0.82],
  [0, -0.10, 1.48],
];

export function boatStorageTransform(index: number): BoatStorageTransform {
  const safe = Math.max(0, Math.floor(index));
  const layer = Math.floor(safe / BASE_POSITIONS.length);
  const [x, y, z] = BASE_POSITIONS[safe % BASE_POSITIONS.length]!;
  return {
    position: new Vector3(x, y + layer * 0.28, z),
    rotation: new Euler(0, (safe % 5) * 0.32 - 0.64, 0),
    scale: 0.78,
  };
}
```

Make `createLifeboat()` return `{ root, storageRoot, acceptanceBox, interiorBounds }`, remove slot markers/silhouettes, set hull color `0xb8693f`, and keep line/catch presentation meshes. In scavenging `World`, set `lifeboat.scale.setScalar(1.15)` and change anchor X from `6.2` to `5.5`.

Add six ship spawn points so `itemSpawnPoints.length === 14`. Add a scuba prop composed of two cylinders, a harness box, mask frame, and lens; set `root.userData.instanceId` and `itemType` for every prop instance.

- [ ] **Step 4: Implement HUD rendering and run focused tests**

```ts
private renderCarry(snapshot: ScavengeSnapshot): void {
  this.carryWeight.textContent = `${snapshot.carriedWeight} / 3`;
  this.carriedItems.replaceChildren(...snapshot.carriedItems.map((item) => {
    const row = document.createElement('span');
    const definition = ITEM_DEFINITIONS[item.type];
    row.textContent = `${definition.label} · ${definition.weight}`;
    return row;
  }));
}

showFeedback(text: string): void {
  if (this.feedback.textContent === text) this.feedback.dataset.version = String(Number(this.feedback.dataset.version ?? 0) + 1);
  this.feedback.textContent = text;
  this.feedback.classList.toggle('is-visible', text.length > 0);
}
```

Run: `bun run test -- tests/world.test.ts tests/GameUI.test.ts`

Expected: PASS for fourteen spawns, unique procedural geometry, storage transforms, resized boat/acceptance volume, carried HUD, feedback stability, disposal, and reduced motion.

- [ ] **Step 5: Commit**

```bash
git add src/world/BoatStorage.ts src/world/Ship.ts src/world/PropFactory.ts src/world/Lifeboat.ts src/world/World.ts src/ui/GameUI.ts tests/world.test.ts tests/GameUI.test.ts
git commit -m "feat: show physical scavenging supplies"
```

---

### Task 5: Scavenging Orchestration and Immutable Phase Handoff

**Files:**
- Modify: `src/phases/ScavengePhase.ts`
- Modify: `src/Game.ts`
- Modify: `src/survival/SurvivalPhase.ts`
- Modify: `tests/GameDirector.test.ts`
- Modify: `tests/GameLifecycle.test.ts`

**Interfaces:**
- Consumes: Tasks 1–4 instance/session/world/controller contracts.
- Produces: one shared instance list per run, feedback routing, and deeply frozen saved instances passed to `SurvivalPhase`.

- [ ] **Step 1: Write the failing handoff test**

```ts
it('deep-copies and freezes duplicate saved instances at the phase boundary', () => {
  const savedItems = [
    { instanceId: 'cannedFood-1', type: 'cannedFood' },
    { instanceId: 'cannedFood-2', type: 'cannedFood' },
  ] as const;
  complete({ savedItems, elapsedSeconds: 8 });
  expect(receivedResult?.savedItems).toEqual(savedItems);
  expect(receivedResult?.savedItems[0]).not.toBe(savedItems[0]);
  expect(Object.isFrozen(receivedResult?.savedItems[0])).toBe(true);
});
```

- [ ] **Step 2: Run director and lifecycle tests**

Run: `bun run test -- tests/GameDirector.test.ts tests/GameLifecycle.test.ts`

Expected: FAIL because saved entries are strings and phase orchestration still assumes a single carried type.

- [ ] **Step 3: Wire one instance list through scavenging**

```ts
const instances = createItemInstances();
this.session = new ScavengeSession(instances);
this.world = new World(this.scene, instances);
```

Filter available objects by `snapshot.items[instanceId].status`, pass `activeCarriedItem` and remaining capacity to `chooseContextAction`, and call `carry.pickUp(instance, object)`. On saved/dropped/lost flight results, mutate the matching instance ID, update `World`, and call `ui.showFeedback()` with the item label.

- [ ] **Step 4: Deep-copy the result and run tests**

```ts
const copiedResult: Readonly<ScavengeResult> = Object.freeze({
  savedItems: Object.freeze(result.savedItems.map((item) => Object.freeze({ ...item }))),
  elapsedSeconds: result.elapsedSeconds,
});
```

Change `SurvivalPhase`'s public constructor input to `readonly ItemInstance[]`. Until Task 6 migrates `SurvivalSession`, construct it with `savedItems.map(({ type }) => type)` and compute the current boat-world fishing flag with `savedItems.some(({ type }) => type === 'fishingRod')`. Task 6 removes this temporary type projection when the survival rules become instance-aware.

Run: `bun run test -- tests/GameDirector.test.ts tests/GameLifecycle.test.ts tests/ScavengeSession.test.ts tests/interaction.test.ts`

Expected: PASS with duplicate identity preserved and stale/reentrant phase guards unchanged.

- [ ] **Step 5: Commit**

```bash
git add src/phases/ScavengePhase.ts src/Game.ts src/survival/SurvivalPhase.ts tests/GameDirector.test.ts tests/GameLifecycle.test.ts
git commit -m "feat: hand physical supplies to survival"
```

---

### Task 6: Duplicate Survival Aggregation and Equipment Gating

**Files:**
- Modify: `src/survival/inventory.ts`
- Modify: `src/survival/SurvivalSession.ts`
- Modify: `src/survival/survivalTypes.ts`
- Modify: `tests/survivalInventory.test.ts`
- Modify: `tests/SurvivalSession.test.ts`

**Interfaces:**
- Consumes: `readonly ItemInstance[]` and Task 1 definitions.
- Produces: aggregate `SurvivalInventory`, `savedItems` on snapshots, rod-gated fish, and scuba-gated dive.

- [ ] **Step 1: Write failing aggregation and gating tests**

```ts
const saved = (...types: ItemId[]): ItemInstance[] => types.map((type, index) => ({
  instanceId: `${type}-${index + 1}` as ItemInstanceId,
  type,
}));

it('adds charges for duplicate instances and one food per can', () => {
  const inventory = createSurvivalInventory(saved('waterJug', 'waterJug', 'cannedFood', 'cannedFood'));
  expect(inventory.waterJug.charges).toBe(6);
  expect(inventory.cannedFood.charges).toBe(2);
});

it('requires a rod for fishing and scuba for diving', () => {
  expect(new SurvivalSession([], { seed: 1 }).perform('fish')).toMatchObject({ code: 'no-fishing-rod' });
  expect(new SurvivalSession([], { seed: 1 }).perform('dive')).toMatchObject({ code: 'no-scuba-set' });
  expect(new SurvivalSession(saved('fishingRod'), { seed: 1, random: sequenceRandom([0]) })
    .perform('fish').accepted).toBe(true);
  expect(new SurvivalSession(saved('scubaSet'), { seed: 1, random: sequenceRandom([0, 0, 0]) })
    .perform('dive').accepted).toBe(true);
});
```

- [ ] **Step 2: Run and verify failure**

Run: `bun run test -- tests/survivalInventory.test.ts tests/SurvivalSession.test.ts`

Expected: FAIL because input is type IDs, duplicates are deduplicated, hand-line fishing remains legal, and diving has no equipment gate.

- [ ] **Step 3: Aggregate definitions per instance**

```ts
export function createSurvivalInventory(savedItems: readonly ItemInstance[]): SurvivalInventory {
  return Object.fromEntries(ITEM_IDS.map((id) => {
    const definition = ITEM_DEFINITIONS[id];
    const count = savedItems.filter(({ type }) => type === id).length;
    return [id, {
      owned: count > 0,
      charges: definition.durable ? null : count * (definition.charges ?? 0),
      durable: definition.durable,
    }];
  })) as SurvivalInventory;
}
```

Store a frozen clone of `savedItems` in `SurvivalSession` and expose it on `SurvivalSnapshot` for boat presentation.

- [ ] **Step 4: Add equipment rejections and run tests**

```ts
case 'fish':
  if (!this.inventory.fishingRod.owned) {
    return { code: 'no-fishing-rod', message: 'Fishing requires a recovered fishing rod.' };
  }
  // retain energy and bait checks
case 'dive':
  if (!this.inventory.scubaSet.owned) {
    return { code: 'no-scuba-set', message: 'Diving requires a recovered scuba set.' };
  }
  // retain weather and energy checks
```

Remove hand-line probability branches from `fish()`. Update all survival test constructors to use the `saved(...)` helper and expect one food per can.

Run: `bun run test -- tests/survivalInventory.test.ts tests/SurvivalSession.test.ts tests/survivalEvents.test.ts`

Expected: PASS with seeded outcomes and event consumption unchanged.

- [ ] **Step 5: Commit**

```bash
git add src/survival/inventory.ts src/survival/SurvivalSession.ts src/survival/survivalTypes.ts tests/survivalInventory.test.ts tests/SurvivalSession.test.ts tests/survivalEvents.test.ts
git commit -m "feat: aggregate physical survival supplies"
```

---

### Task 7: Vessel-Local Ocean Exclusions

**Files:**
- Create: `src/ocean/WaterExclusion.ts`
- Modify: `src/ocean/OceanRenderer.ts`
- Modify: `src/world/World.ts`
- Modify: `src/survival/BoatWorld.ts`
- Create: `tests/WaterExclusion.test.ts`
- Modify: `tests/world.test.ts`
- Modify: `tests/BoatWorld.test.ts`

**Interfaces:**
- Consumes: Three.js `Object3D`, `Matrix4`, `Vector3`, `Vector4` and lifeboat interior bounds.
- Produces: `WaterExclusionRegion`, `createWaterExclusion(object, halfWidth, halfLength)`, and `OceanRenderer.setExclusions(regions)` with a maximum of two active regions.

- [ ] **Step 1: Write failing transform and shader tests**

```ts
it('keeps containment aligned with a moved and rotated vessel', () => {
  const vessel = new Group();
  vessel.position.set(5, 2, -4);
  vessel.rotation.set(0.1, 0.5, -0.08);
  vessel.updateWorldMatrix(true, false);
  const region = createWaterExclusion(vessel, 1, 2.2);
  expect(pointInWaterExclusion(vessel.localToWorld(new Vector3(0.5, 0, 1)), region)).toBe(true);
  expect(pointInWaterExclusion(vessel.localToWorld(new Vector3(1.2, 0, 0)), region)).toBe(false);
});

it('uploads inactive defaults and two active exclusion matrices', () => {
  const ocean = new OceanRenderer();
  expect(ocean.material.uniforms.uExclusionCount.value).toBe(0);
  ocean.setExclusions([
    createWaterExclusion(new Group(), 1, 2),
    createWaterExclusion(new Group(), 3.7, 10.2),
  ]);
  expect(ocean.material.uniforms.uExclusionCount.value).toBe(2);
  expect(ocean.material.fragmentShader).toContain('discard;');
  ocean.dispose();
});
```

- [ ] **Step 2: Run and verify missing helper failure**

Run: `bun run test -- tests/WaterExclusion.test.ts`

Expected: FAIL because the exclusion module and uniforms do not exist.

- [ ] **Step 3: Implement pure regions and shader uniforms**

```ts
export interface WaterExclusionRegion {
  worldToLocal: Matrix4;
  bounds: Vector4;
}

export function createWaterExclusion(
  object: Object3D,
  halfWidth: number,
  halfLength: number,
): WaterExclusionRegion {
  object.updateWorldMatrix(true, false);
  return {
    worldToLocal: object.matrixWorld.clone().invert(),
    bounds: new Vector4(-halfWidth, halfWidth, -halfLength, halfLength),
  };
}

export function pointInWaterExclusion(point: Vector3, region: WaterExclusionRegion): boolean {
  const local = point.clone().applyMatrix4(region.worldToLocal);
  return local.x >= region.bounds.x && local.x <= region.bounds.y
    && local.z >= region.bounds.z && local.z <= region.bounds.w;
}
```

Pass `vWorldPosition` from the displaced ocean vertex. Add `uExclusionCount`, `uExclusionWorldToLocal[2]`, and `uExclusionBounds[2]`; before color output, loop over two regions, transform the fragment world position, and `discard` when local X/Z lie inside active bounds.

- [ ] **Step 4: Wire both phases and run tests**

```ts
// scavenging World.update
this.ocean.setExclusions([
  createWaterExclusion(this.ship, 3.72, 10.25),
  createWaterExclusion(this.lifeboat, 1.02, 2.28),
]);

// survival BoatWorld.update
this.ocean.setExclusions([createWaterExclusion(this.boat, 1.02, 2.28)]);
```

Run: `bun run test -- tests/WaterExclusion.test.ts tests/world.test.ts tests/BoatWorld.test.ts tests/WaveField.test.ts`

Expected: PASS; ocean wave uniforms and buoyancy remain unchanged while exclusion transforms follow vessel motion.

- [ ] **Step 5: Commit**

```bash
git add src/ocean/WaterExclusion.ts src/ocean/OceanRenderer.ts src/world/World.ts src/survival/BoatWorld.ts tests/WaterExclusion.test.ts tests/world.test.ts tests/BoatWorld.test.ts
git commit -m "fix: mask ocean inside vessel hulls"
```

---

### Task 8: Physical Survival Props and Projected Anchors

**Files:**
- Create: `src/survival/BoatInteraction.ts`
- Modify: `src/survival/BoatWorld.ts`
- Modify: `src/survival/SurvivalPhase.ts`
- Create: `tests/BoatInteraction.test.ts`
- Modify: `tests/BoatWorld.test.ts`

**Interfaces:**
- Consumes: saved instances, survival snapshot, `boatStorageTransform`, `createProp`, camera, and viewport dimensions.
- Produces: `BoatInteractionAnchor`, `ACTION_FOR_ITEM`, `projectBoatAnchor()`, `BoatWorld.syncInventory(snapshot)`, and `BoatWorld.projectInteractionAnchors(width, height)`.

- [ ] **Step 1: Write failing mapping and projection tests**

```ts
it('maps recovered tools to approved actions', () => {
  expect(ACTION_FOR_ITEM).toMatchObject({
    fishingRod: 'fish', scubaSet: 'dive', cannedFood: 'eat',
    ductTape: 'repair', medicalKit: 'treat', waterJug: 'rest',
  });
  expect(ACTION_FOR_ITEM.flareGun).toBeUndefined();
});

it('projects visible anchors and hides points behind the camera', () => {
  const camera = new PerspectiveCamera(65, 2, 0.1, 100);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld(true);
  expect(projectBoatAnchor(new Vector3(0, 0, -2), camera, 1000, 500)).toMatchObject({
    x: 500, y: 250, visible: true,
  });
  expect(projectBoatAnchor(new Vector3(0, 0, 2), camera, 1000, 500).visible).toBe(false);
});
```

- [ ] **Step 2: Run and verify missing module failure**

Run: `bun run test -- tests/BoatInteraction.test.ts tests/BoatWorld.test.ts`

Expected: FAIL because saved instances are not built in `BoatWorld` and projection contracts do not exist.

- [ ] **Step 3: Implement mapping and projection**

```ts
export const ACTION_FOR_ITEM: Readonly<Partial<Record<ItemId, DayActionId>>> = {
  fishingRod: 'fish', scubaSet: 'dive', cannedFood: 'eat', ductTape: 'repair',
  medicalKit: 'treat', waterJug: 'rest',
};

export interface BoatInteractionAnchor {
  id: string;
  itemType: ItemId | null;
  action: DayActionId | null;
  x: number;
  y: number;
  visible: boolean;
  depleted: boolean;
}

export function projectBoatAnchor(
  worldPosition: Vector3,
  camera: PerspectiveCamera,
  width: number,
  height: number,
): Pick<BoatInteractionAnchor, 'x' | 'y' | 'visible'> {
  camera.updateWorldMatrix(true, false);
  const cameraSpace = worldPosition.clone().applyMatrix4(camera.matrixWorldInverse);
  const projected = worldPosition.clone().project(camera);
  return {
    x: (projected.x * 0.5 + 0.5) * width,
    y: (-projected.y * 0.5 + 0.5) * height,
    visible: cameraSpace.z < 0 && Math.abs(projected.x) <= 1 && Math.abs(projected.y) <= 1,
  };
}
```

- [ ] **Step 4: Build and synchronize survival props**

Change `BoatWorld` to accept `readonly ItemInstance[]` and update `SurvivalPhase` to pass its saved instances rather than a fishing-rod boolean. Construct one prop per saved instance under the lifeboat storage root, apply `boatStorageTransform(index)`, and retain an instance-to-prop map. Add fixed `repair-patch` and `horizon` anchors for Repair and End day. Locate the saved rod prop for fish cues; remove hand-line cue expectations.

Use aggregate stores for transferred food/bait and inventory charges for other consumables:

```ts
private remainingUses(type: ItemId, snapshot: SurvivalSnapshot): number | null {
  if (type === 'cannedFood') return snapshot.food;
  if (type === 'baitTin') return snapshot.bait;
  return snapshot.inventory[type].charges;
}

private syncType(type: ItemId, snapshot: SurvivalSnapshot): void {
  const instances = this.savedProps.filter((entry) => entry.instance.type === type);
  const remaining = this.remainingUses(type, snapshot);
  if (remaining === null) return;
  const perInstance = ITEM_DEFINITIONS[type].charges ?? 1;
  const activeCount = Math.ceil(remaining / perInstance);
  instances.forEach(({ prop }, index) => {
    prop.visible = type !== 'cannedFood' || index < activeCount;
    setPropDepleted(prop, index >= activeCount);
  });
}

function setPropDepleted(root: Object3D, depleted: boolean): void {
  root.traverse((object) => {
    if (!(object instanceof Mesh) || !(object.material instanceof MeshStandardMaterial)) return;
    const material = object.material;
    const original = material.userData.originalColor as number | undefined
      ?? material.color.getHex();
    material.userData.originalColor = original;
    material.color.setHex(original);
    if (depleted) material.color.lerp(new Color(0x4f5756), 0.65);
  });
  root.userData.depleted = depleted;
}
```

Run: `bun run test -- tests/BoatInteraction.test.ts tests/BoatWorld.test.ts`

Expected: PASS for exact saved prop count, duplicate identity, rod/scuba presence, depletion, horizon anchor, projection, cue animation, reduced motion, and disposal.

- [ ] **Step 5: Commit**

```bash
git add src/survival/BoatInteraction.ts src/survival/BoatWorld.ts src/survival/SurvivalPhase.ts tests/BoatInteraction.test.ts tests/BoatWorld.test.ts
git commit -m "feat: place survival actions on boat props"
```

---

### Task 9: Projected Tooltips and Survival Orchestration

**Files:**
- Modify: `src/ui/SurvivalUI.ts`
- Modify: `src/survival/SurvivalPhase.ts`
- Modify: `src/styles/main.css`
- Modify: `tests/SurvivalUI.test.ts`
- Modify: `tests/SurvivalPhase.test.ts`

**Interfaces:**
- Consumes: `BoatInteractionAnchor[]`, snapshot, `availableReason`, and existing action/event callbacks.
- Produces: `SurvivalUI.setAnchors(anchors)`, projected accessible buttons/tooltips, preserved shortcuts, and per-frame phase synchronization.

- [ ] **Step 1: Replace dock/tray assertions with failing tooltip tests**

```ts
it('renders projected item tooltips without action dock or inventory tray', () => {
  const mount = document.createElement('main');
  const ui = createUI(mount);
  ui.render(snapshot(), () => null);
  ui.setAnchors([{
    id: 'fishingRod-1', itemType: 'fishingRod', action: 'fish',
    x: 320, y: 240, visible: true, depleted: false,
  }]);
  const anchor = mount.querySelector<HTMLButtonElement>('[data-anchor-id="fishingRod-1"]')!;
  expect(anchor.style.transform).toContain('320px');
  expect(anchor.getAttribute('aria-keyshortcuts')).toBe('1');
  expect(anchor.querySelector('[role="tooltip"]')?.textContent).toMatch(/FISHING ROD.*FISH.*2 ENERGY/is);
  expect(mount.querySelector('.survival-actions')).toBeNull();
  expect(mount.querySelector('.inventory-tray')).toBeNull();
});

it('keeps unavailable anchors focusable and suppresses their commands', () => {
  const mount = document.createElement('main');
  const ui = createUI(mount);
  const onAction = vi.fn();
  ui.onAction = onAction;
  ui.render(snapshot(), (action) => action === 'fish' ? 'Fishing requires a recovered fishing rod.' : null);
  ui.setAnchors([{
    id: 'fishingRod-1', itemType: 'fishingRod', action: 'fish',
    x: 320, y: 240, visible: true, depleted: false,
  }]);
  const button = mount.querySelector<HTMLButtonElement>('[data-action="fish"]')!;
  expect(button.getAttribute('aria-disabled')).toBe('true');
  button.click();
  expect(onAction).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Run and verify old menu failure**

Run: `bun run test -- tests/SurvivalUI.test.ts tests/SurvivalPhase.test.ts`

Expected: FAIL because controls are fixed dock buttons, inventory tray remains, and phase does not project world anchors.

- [ ] **Step 3: Implement dynamic projected buttons and tooltips**

```ts
setAnchors(anchors: readonly BoatInteractionAnchor[]): void {
  const seen = new Set<string>();
  for (const anchor of anchors) {
    seen.add(anchor.id);
    const button = this.anchorButtons.get(anchor.id) ?? this.createAnchorButton(anchor);
    button.hidden = !anchor.visible;
    button.style.transform = `translate(${Math.round(anchor.x)}px, ${Math.round(anchor.y)}px)`;
    button.classList.toggle('is-depleted', anchor.depleted);
    this.refreshAnchorTooltip(button, anchor);
  }
  this.anchorButtons.forEach((button, id) => {
    if (!seen.has(id)) { button.remove(); this.anchorButtons.delete(id); }
  });
}

private createAnchorButton(anchor: BoatInteractionAnchor): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'boat-anchor';
  button.dataset.anchorId = anchor.id;
  const tooltip = document.createElement('span');
  tooltip.className = 'boat-tooltip';
  tooltip.role = 'tooltip';
  button.append(tooltip);
  this.anchorLayer.append(button);
  this.anchorButtons.set(anchor.id, button);
  return button;
}

private refreshAnchorTooltip(button: HTMLButtonElement, anchor: BoatInteractionAnchor): void {
  const itemLabel = anchor.itemType === null ? anchor.id === 'horizon' ? 'HORIZON' : 'HULL PATCH'
    : ITEM_LABELS[anchor.itemType];
  const action = anchor.action === null ? null : ACTIONS.find(({ id }) => id === anchor.action)!;
  const reason = anchor.action === null ? null : this.actionReasons.get(anchor.action) ?? null;
  const text = action === null
    ? `${itemLabel} — ${anchor.itemType === null ? 'BOAT INTERACTION' : SURVIVAL_ITEM_DESCRIPTIONS[anchor.itemType]}`
    : `${itemLabel} — ${action.label} [${action.shortcut}] — ${action.cost} — ${action.effect} — ${action.risk.toUpperCase()}${reason ? ` — UNAVAILABLE: ${reason}` : ''}`;
  requireElement<HTMLElement>(button, '[role="tooltip"]').textContent = text;
  button.dataset.action = anchor.action ?? '';
  button.setAttribute('aria-label', text);
  button.setAttribute('aria-disabled', reason === null ? 'false' : 'true');
  if (action !== null) button.setAttribute('aria-keyshortcuts', action.shortcut);
}
```

Create tooltip content from the existing action preview definitions and item descriptions. Keep `aria-description`, `aria-disabled`, focusability, shortcut labels, bait dialog, event items, modal focus restoration, announcer, and pause semantics. Delete action-dock and inventory-tray markup/listeners.

- [ ] **Step 4: Synchronize the phase and run tests**

```ts
private syncPresentation(snapshot: SurvivalSnapshot): void {
  this.world.syncInventory?.(snapshot);
  this.ui.setAnchors?.(this.world.projectInteractionAnchors?.(this.viewportWidth, this.viewportHeight) ?? []);
}
```

Call `syncPresentation()` after each snapshot render and after each world update. Store positive viewport dimensions in `resize()`. Map anchor clicks through existing `onAction`; keep keyboard shortcuts by dispatching directly through the same legality check even when no anchor is present.

Run: `bun run test -- tests/SurvivalUI.test.ts tests/SurvivalPhase.test.ts`

Expected: PASS for hover/focus content, positions, unavailable reasons, click/shortcut parity, bait options, modal focus, busy/pause isolation, events, outcomes, endings, cleanup, and per-frame anchor synchronization.

- [ ] **Step 5: Commit**

```bash
git add src/ui/SurvivalUI.ts src/survival/SurvivalPhase.ts src/styles/main.css tests/SurvivalUI.test.ts tests/SurvivalPhase.test.ts
git commit -m "feat: replace survival menus with boat tooltips"
```

---

### Task 10: Cross-Phase Polish, Documentation, and Verification

**Files:**
- Modify: `src/styles/main.css`
- Modify: `README.md`
- Modify: `tests/smoke.test.ts`
- Modify: `tests/ItemState.test.ts`
- Modify: `tests/ScavengeSession.test.ts`
- Modify: `tests/interaction.test.ts`
- Modify: `tests/GameUI.test.ts`
- Modify: `tests/world.test.ts`
- Modify: `tests/GameDirector.test.ts`
- Modify: `tests/GameLifecycle.test.ts`
- Modify: `tests/survivalInventory.test.ts`
- Modify: `tests/SurvivalSession.test.ts`
- Modify: `tests/survivalEvents.test.ts`
- Modify: `tests/WaterExclusion.test.ts`
- Modify: `tests/BoatInteraction.test.ts`
- Modify: `tests/BoatWorld.test.ts`
- Modify: `tests/SurvivalUI.test.ts`
- Modify: `tests/SurvivalPhase.test.ts`

**Interfaces:**
- Consumes: all prior task contracts.
- Produces: documented controls, responsive/reduced-motion polish, and a fully verified production build.

- [ ] **Step 1: Add final cross-phase regression assertions**

```ts
it('exposes the complete physical-inventory milestone', () => {
  expect(ITEM_IDS).toHaveLength(9);
  expect(createItemInstances()).toHaveLength(14);
  expect(ITEM_DEFINITIONS.scubaSet.weight).toBe(3);
  expect(ACTION_FOR_ITEM.scubaSet).toBe('dive');
  expect(ACTION_FOR_ITEM.fishingRod).toBe('fish');
});
```

- [ ] **Step 2: Run the full suite and fix only milestone regressions**

Run: `bun run test`

Expected: all Vitest files PASS. Replace obsolete assertions with the approved contracts; do not weaken unrelated lifecycle, event, accessibility, rendering, or disposal assertions.

- [ ] **Step 3: Finish responsive and reduced-motion styling**

```css
.boat-anchor {
  position: absolute;
  left: 0;
  top: 0;
  width: 54px;
  height: 54px;
  border: 1px solid transparent;
  border-radius: 50%;
  background: transparent;
  pointer-events: auto;
}
.boat-tooltip {
  position: absolute;
  left: 50%;
  bottom: calc(100% + 10px);
  width: max-content;
  max-width: 260px;
  opacity: 0;
  transform: translate(-50%, 6px);
  pointer-events: none;
}
.boat-anchor:hover .boat-tooltip,
.boat-anchor:focus-visible .boat-tooltip {
  opacity: 1;
  transform: translate(-50%, 0);
}
.boat-anchor.is-depleted { filter: saturate(0.25); }
@media (prefers-reduced-motion: reduce) {
  .boat-tooltip, .scavenge-feedback { transition: none; }
}
```

Document repeatable instances, the `CARRY n / 3` rule, unlimited boat storage, scuba/rod requirements, physical hover/click actions, numeric shortcuts, and the water-exclusion rendering architecture in `README.md`.

- [ ] **Step 4: Type-check, build, and perform browser visual QA**

Run: `bun run typecheck`

Expected: exit 0 with no TypeScript errors.

Run: `bun run build`

Expected: exit 0 and Vite writes `dist/`.

Browser checklist at `http://127.0.0.1:4173/`:

1. Pick up three weight-one instances; confirm all three are visible and HUD reads `3 / 3`.
2. Attempt a fourth pickup and a weight-three scuba pickup; confirm capacity prompts and no state mutation.
3. Drop the newest item on deck; confirm visible landing and repickup.
4. Throw at least six items into the enlarged rescue-orange boat; confirm real props accumulate and no full-boat message appears.
5. Observe high waves and late ship listing; confirm no water renders inside the ship or lifeboat.
6. Evacuate with duplicates, rod, and scuba; confirm the same supplies appear in survival.
7. Hover and keyboard-focus each recovered prop; confirm tooltip label, shortcut, cost, effect, risk, uses, and unavailable reason.
8. Confirm Fish is absent without a rod and Dive is absent without scuba on a second run; their shortcuts do not execute.
9. Exercise bait choice, eat, repair, treat, rest, dive, fish, end day, an event response, pause, and restart.
10. Confirm consumed cans disappear, exhausted multi-use props become subdued, modal focus returns correctly, and reduced-motion mode removes nonessential transitions.

- [ ] **Step 5: Commit final polish**

```bash
git add src/styles/main.css README.md tests/smoke.test.ts tests/ItemState.test.ts tests/ScavengeSession.test.ts tests/interaction.test.ts tests/GameUI.test.ts tests/world.test.ts tests/GameDirector.test.ts tests/GameLifecycle.test.ts tests/survivalInventory.test.ts tests/SurvivalSession.test.ts tests/survivalEvents.test.ts tests/WaterExclusion.test.ts tests/BoatInteraction.test.ts tests/BoatWorld.test.ts tests/SurvivalUI.test.ts tests/SurvivalPhase.test.ts
git commit -m "docs: verify physical boat interactions"
```

---

## Final Verification Gate

Run these commands from `C:\Users\Tomasz\Documents\Projects\sleep-with-fishes` after Task 10:

```bash
bun run typecheck
bun run test
bun run build
git status --short
```

Expected: typecheck, all tests, and build exit 0; `git status --short` is empty; browser QA checklist passes in both normal and reduced-motion modes.

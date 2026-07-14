# Large Coastal Freighter Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the block-built scavenging ship with a furnished, single-level coastal freighter that places all fourteen collectibles on believable surfaces and preserves the two-minute evacuation loop.

**Architecture:** Split the procedural vessel into placement, material, geometry, furniture, and smoke modules. `Ship.ts` assembles those units behind an extended `ShipBuild` contract, while `World` keeps ownership of item state, sinking, lifeboat movement, ocean updates, and phase handoff.

**Tech Stack:** TypeScript 5.9, Three.js 0.180, Vitest 3.2, Vite 7.1, Bun

## Global Constraints

- Keep the scavenging timer at exactly 120 seconds.
- Keep the existing fourteen collectible instances, item weights, charges, and durable flags.
- Keep the ship single-level; do not add ladders, stairs, locks, or openable doors.
- Use original procedural geometry and materials; do not add external ship models or photographic texture maps.
- Build a loop through the crew cabin, wheelhouse, cargo deck, storage/workroom, and lifeboat station.
- Target ship dimensions are 12.5 units wide and 36 units long, with at most 10 percent browser-tuning variance.
- Keep the existing carrying, throwing, saving, losing, survival handoff, pause, restart, accessibility, and reduced-motion behavior.
- Keep the current ship-local axis-aligned `CollisionBox` system.
- Preserve the user's uncommitted performance-stat changes in `src/Game.ts`, `src/styles/main.css`, `src/ui/PerformanceStats.ts`, and `dev-server.err`.
- Add no runtime dependencies.

## File Structure

Create these focused modules:

- `src/world/ShipItemPlacement.ts`: anchor types, item profiles, validation, and deterministic-compatible assignment.
- `src/world/ShipMaterials.ts`: reusable wood, paint, metal, glass, rope, and rust material families with owned disposal.
- `src/world/ShipGeometry.ts`: hull, room shell, deck, rails, machinery housing, twin stacks, zone markers, shell colliders, and water bounds.
- `src/world/ShipFurniture.ts`: furniture, decorative props, furniture colliders, and authored placement anchors.
- `src/world/ShipSmoke.ts`: fixed smoke pool, sinking progression, reduced-motion behavior, test snapshots, and disposal.

Modify these integration files:

- `src/world/Ship.ts`: assemble the five ship modules and expose one `ShipBuild` contract.
- `src/world/World.ts`: consume item assignments, update smoke, use new lifeboat and exclusion bounds, and dispose ship-owned resources.
- `tests/world.test.ts`: replace the old two-zone/floor-spawn contract with full freighter integration coverage.
- `tests/collisions.test.ts`: verify corridors, furniture blocking, rails, and the lifeboat opening.
- `README.md`: document the freighter layout, authored surface placement, and module ownership.

Create focused tests beside the existing suite:

- `tests/ShipItemPlacement.test.ts`
- `tests/ShipMaterials.test.ts`
- `tests/ShipGeometry.test.ts`
- `tests/ShipFurniture.test.ts`
- `tests/ShipSmoke.test.ts`

---

### Task 1: Authored Item Placement Contract

**Files:**

- Create: `src/world/ShipItemPlacement.ts`
- Create: `tests/ShipItemPlacement.test.ts`

**Interfaces:**

- Consumes: `ItemId`, `ItemInstance`, and `ItemInstanceId` from `src/game/ItemState.ts`; `Euler` and `Vector3` from Three.js.
- Produces: `ShipItemCategory`, `ShipSurface`, `ShipItemAnchor`, `ShipItemTransform`, `SHIP_ITEM_PROFILES`, `validateShipItemAnchors(anchors)`, and `assignShipItems(instances, anchors, random?)`.

- [ ] **Step 1: Write the failing placement tests**

Create `tests/ShipItemPlacement.test.ts` with category, uniqueness, fit, overlap, randomization, fallback, and standard-count coverage:

```ts
import { describe, expect, it } from 'vitest';
import { Euler, Vector3 } from 'three';
import { createItemInstances } from '../src/game/ItemState';
import {
  assignShipItems,
  validateShipItemAnchors,
  type ShipItemAnchor,
} from '../src/world/ShipItemPlacement';

const anchor = (
  id: string,
  categories: ShipItemAnchor['categories'],
  x: number,
  surfaceGroupId = id,
  width = 2.1,
  depth = 1.1,
  clearanceHeight = 1.2,
): ShipItemAnchor => ({
  id,
  categories,
  position: new Vector3(x, 3, 0),
  rotation: new Euler(0, 0, 0),
  scale: 1,
  surface: 'workbench',
  surfaceGroupId,
  footprint: { width, depth },
  clearanceHeight,
  emergency: false,
});

describe('ship item placement', () => {
  it('places all fourteen standard instances once on compatible anchors', () => {
    const categories = ['foodWater', 'medicalEmergency', 'toolsRepair', 'fishingDiving'] as const;
    const anchors = Array.from({ length: 28 }, (_, index) =>
      anchor(`anchor-${index}`, [categories[index % categories.length]!], index * 2));
    const assignments = assignShipItems(createItemInstances(), anchors, () => 0.4);
    expect(assignments.size).toBe(14);
    expect(new Set([...assignments.values()].map((value) => value.anchorId)).size).toBe(14);
    assignments.forEach((value) => expect(value.usedEmergencyAnchor).toBe(false));
  });

  it('rejects duplicate ids and overlapping sibling anchors', () => {
    expect(() => validateShipItemAnchors([
      anchor('duplicate', ['toolsRepair'], 0),
      anchor('duplicate', ['toolsRepair'], 3),
    ])).toThrow('Duplicate ship item anchor id: duplicate');
    expect(() => validateShipItemAnchors([
      anchor('left', ['toolsRepair'], 0, 'desk'),
      anchor('right', ['toolsRepair'], 0.2, 'desk'),
    ])).toThrow('Overlapping ship item anchors: left, right');
  });

  it('uses a reachable emergency anchor only when regular capacity is exhausted', () => {
    const instances = createItemInstances().filter(({ type }) => type === 'cannedFood');
    const anchors = [
      anchor('food-regular', ['foodWater'], 0),
      { ...anchor('food-emergency-1', ['foodWater'], 4), emergency: true },
      { ...anchor('food-emergency-2', ['foodWater'], 8), emergency: true },
    ];
    const assignments = assignShipItems(instances, anchors, () => 0.2);
    expect([...assignments.values()].filter((value) => value.usedEmergencyAnchor)).toHaveLength(2);
  });

  it('fails with the item id when no compatible anchor can fit it', () => {
    const scuba = createItemInstances().filter(({ type }) => type === 'scubaSet');
    expect(() => assignShipItems(scuba, [
      anchor('tiny-rack', ['fishingDiving'], 0, 'tiny', 0.2, 0.2, 0.2),
    ], () => 0.5)).toThrow('Unable to place ship item: scubaSet-1');
  });
});
```

- [ ] **Step 2: Run the placement test and confirm the missing module failure**

Run: `bun run test -- tests/ShipItemPlacement.test.ts`

Expected: FAIL because `../src/world/ShipItemPlacement` does not exist.

- [ ] **Step 3: Implement profiles, validation, and assignment**

Create `src/world/ShipItemPlacement.ts`. Use these exact public contracts and profile values:

```ts
import { Euler, Vector3 } from 'three';
import type { ItemId, ItemInstance, ItemInstanceId } from '../game/ItemState';

export type ShipItemCategory =
  | 'foodWater'
  | 'medicalEmergency'
  | 'toolsRepair'
  | 'fishingDiving';

export type ShipSurface = 'shelf' | 'desk' | 'cabinet' | 'workbench' | 'rack' | 'crate';

export interface ShipItemAnchor {
  id: string;
  categories: readonly ShipItemCategory[];
  position: Vector3;
  rotation: Euler;
  scale: number;
  surface: ShipSurface;
  surfaceGroupId: string;
  footprint: { width: number; depth: number };
  clearanceHeight: number;
  emergency: boolean;
}

export interface ShipItemProfile {
  category: ShipItemCategory;
  width: number;
  depth: number;
  height: number;
}

export interface ShipItemTransform {
  anchorId: string;
  position: Vector3;
  rotation: Euler;
  scale: number;
  usedEmergencyAnchor: boolean;
}

export const SHIP_ITEM_PROFILES: Readonly<Record<ItemId, ShipItemProfile>> = {
  flareGun: { category: 'medicalEmergency', width: 0.58, depth: 0.28, height: 0.22 },
  ductTape: { category: 'toolsRepair', width: 0.32, depth: 0.32, height: 0.18 },
  fishingRod: { category: 'fishingDiving', width: 1.85, depth: 0.24, height: 0.22 },
  baitTin: { category: 'fishingDiving', width: 0.34, depth: 0.34, height: 0.2 },
  medicalKit: { category: 'medicalEmergency', width: 0.62, depth: 0.42, height: 0.38 },
  waterJug: { category: 'foodWater', width: 0.46, depth: 0.46, height: 0.72 },
  cannedFood: { category: 'foodWater', width: 0.26, depth: 0.26, height: 0.28 },
  flashlight: { category: 'toolsRepair', width: 0.42, depth: 0.2, height: 0.2 },
  scubaSet: { category: 'fishingDiving', width: 1.05, depth: 0.72, height: 0.76 },
};
```

Implement `validateShipItemAnchors` so it rejects duplicate IDs, non-positive dimensions, empty categories, and sibling rectangles that overlap in local X/Z space. Implement `assignShipItems` with these rules:

1. Validate anchors before assignment.
2. Sort instances by profile area, then height, largest first.
3. Shuffle eligible regular anchors with Fisher-Yates and the injected `random` function.
4. Backtrack across unused compatible anchors that fit width, depth, and clearance.
5. Retry with emergency anchors enabled if regular anchors cannot place all instances.
6. Clone `position` and `rotation` into the returned `Map<ItemInstanceId, ShipItemTransform>`.
7. Throw `Unable to place ship item: <instanceId>` for the first unplaced item.

Keep rectangle and shuffle helpers private. Do not read or mutate Three.js scene objects in this module.

- [ ] **Step 4: Run the placement tests**

Run: `bun run test -- tests/ShipItemPlacement.test.ts`

Expected: PASS, 4 tests.

- [ ] **Step 5: Run type checking**

Run: `bun run typecheck`

Expected: PASS with no TypeScript errors.

- [ ] **Step 6: Commit the placement unit**

```powershell
git add src/world/ShipItemPlacement.ts tests/ShipItemPlacement.test.ts
git commit -m "feat: add authored ship item placement"
```

---

### Task 2: Reusable Procedural Ship Materials

**Files:**

- Create: `src/world/ShipMaterials.ts`
- Create: `tests/ShipMaterials.test.ts`

**Interfaces:**

- Consumes: `Color`, `Material`, `MeshPhysicalMaterial`, and `MeshStandardMaterial` from Three.js.
- Produces: `ShipMaterials`, `WoodMaterialFamily`, and `createShipMaterials(seed?: number)`.

- [ ] **Step 1: Write the failing material ownership test**

Create `tests/ShipMaterials.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { Material } from 'three';
import { createShipMaterials } from '../src/world/ShipMaterials';

describe('ship materials', () => {
  it('creates stable wood variants for a fixed seed', () => {
    const first = createShipMaterials(0x51f15e);
    const second = createShipMaterials(0x51f15e);
    const colors = (family: typeof first.floorPlanks) => family.map((material) => material.color.getHex());
    expect(colors(first.floorPlanks)).toEqual(colors(second.floorPlanks));
    expect(new Set(colors(first.floorPlanks)).size).toBeGreaterThan(2);
    expect(new Set(colors(first.wallPanels)).size).toBeGreaterThan(2);
    first.dispose();
    second.dispose();
  });

  it('disposes each owned material once', () => {
    const materials = createShipMaterials();
    const owned = materials.ownedMaterialsForTest();
    const counts = new Map<Material, number>();
    owned.forEach((material) => {
      counts.set(material, 0);
      material.addEventListener('dispose', () => counts.set(material, counts.get(material)! + 1));
    });
    materials.dispose();
    materials.dispose();
    counts.forEach((count) => expect(count).toBe(1));
  });
});
```

- [ ] **Step 2: Run the material test and confirm the missing module failure**

Run: `bun run test -- tests/ShipMaterials.test.ts`

Expected: FAIL because `../src/world/ShipMaterials` does not exist.

- [ ] **Step 3: Implement stable material families and disposal**

Create `src/world/ShipMaterials.ts` with this public shape:

```ts
import { Color, Material, MeshPhysicalMaterial, MeshStandardMaterial } from 'three';

export type WoodMaterialFamily = readonly [
  MeshStandardMaterial,
  MeshStandardMaterial,
  MeshStandardMaterial,
  MeshStandardMaterial,
];

export interface ShipMaterials {
  floorPlanks: WoodMaterialFamily;
  wallPanels: WoodMaterialFamily;
  furnitureWood: WoodMaterialFamily;
  deckTimber: WoodMaterialFamily;
  crateWood: WoodMaterialFamily;
  paintedSteel: MeshStandardMaterial;
  darkHull: MeshStandardMaterial;
  darkMetal: MeshStandardMaterial;
  exposedMetal: MeshStandardMaterial;
  rust: MeshStandardMaterial;
  rope: MeshStandardMaterial;
  glass: MeshPhysicalMaterial;
  emergency: MeshStandardMaterial;
  ownedMaterialsForTest(): readonly Material[];
  dispose(): void;
}
```

Use a private integer hash such as `Math.imul(value ^ (value >>> 16), 0x45d9f3b)` to derive four stable lightness offsets from the seed. Build the five wood families from these base colors and roughness values:

```ts
const WOOD_BASES = {
  floorPlanks: { color: 0x3d291f, roughness: 0.92 },
  wallPanels: { color: 0xa69b82, roughness: 0.88 },
  furnitureWood: { color: 0x684531, roughness: 0.86 },
  deckTimber: { color: 0x574f43, roughness: 0.96 },
  crateWood: { color: 0x806342, roughness: 0.94 },
} as const;
```

Create four `MeshStandardMaterial` variants per family with `flatShading: true` and HSL lightness offsets within `[-0.07, 0.06]`. Configure the non-wood materials with these exact values:

```ts
const paintedSteel = new MeshStandardMaterial({ color: 0x57636a, roughness: 0.82, metalness: 0.22, flatShading: true });
const darkHull = new MeshStandardMaterial({ color: 0x242e32, roughness: 0.9, metalness: 0.28, flatShading: true });
const darkMetal = new MeshStandardMaterial({ color: 0x2f3435, roughness: 0.84, metalness: 0.55, flatShading: true });
const exposedMetal = new MeshStandardMaterial({ color: 0x81796c, roughness: 0.68, metalness: 0.62, flatShading: true });
const rust = new MeshStandardMaterial({ color: 0x7a3d28, roughness: 0.95, metalness: 0.08, flatShading: true });
const rope = new MeshStandardMaterial({ color: 0x3d3022, roughness: 1, metalness: 0, flatShading: true });
const glass = new MeshPhysicalMaterial({ color: 0x6d8790, roughness: 0.18, transmission: 0.15, transparent: true, opacity: 0.55, depthWrite: false });
const emergency = new MeshStandardMaterial({ color: 0x9c4f3f, emissive: 0x3d120d, emissiveIntensity: 0.35, roughness: 0.7 });
```

Track all materials in one `Set<Material>` and guard `dispose()` with a boolean.

- [ ] **Step 4: Run material tests and type checking**

Run: `bun run test -- tests/ShipMaterials.test.ts`

Expected: PASS, 2 tests.

Run: `bun run typecheck`

Expected: PASS.

- [ ] **Step 5: Commit the material unit**

```powershell
git add src/world/ShipMaterials.ts tests/ShipMaterials.test.ts
git commit -m "feat: add procedural freighter materials"
```

---

### Task 3: Freighter Hull, Rooms, Deck, and Stack Geometry

**Files:**

- Create: `src/world/ShipGeometry.ts`
- Create: `tests/ShipGeometry.test.ts`

**Interfaces:**

- Consumes: `ShipMaterials` from Task 2 and `CollisionBox` from `src/player/collisions.ts`.
- Produces: `FREIGHTER_DIMENSIONS`, `ShipZoneId`, `ShipGeometryBuild`, and `createShipGeometry(materials)`.

- [ ] **Step 1: Write the failing geometry contract test**

Create `tests/ShipGeometry.test.ts`:

```ts
import { Box3, Mesh, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { createShipGeometry, FREIGHTER_DIMENSIONS } from '../src/world/ShipGeometry';
import { createShipMaterials } from '../src/world/ShipMaterials';

describe('freighter geometry', () => {
  it('builds the approved single-level freighter shell and named zones', () => {
    const materials = createShipMaterials();
    const build = createShipGeometry(materials);
    const bounds = new Box3().setFromObject(build.root);
    expect(FREIGHTER_DIMENSIONS).toEqual({ width: 12.5, length: 36, deckY: 2 });
    expect(bounds.max.x - bounds.min.x).toBeGreaterThanOrEqual(12);
    expect(bounds.max.z - bounds.min.z).toBeGreaterThanOrEqual(35);
    expect([...build.zoneCenters.keys()].sort()).toEqual([
      'cargoDeck', 'crewCabin', 'lifeboatStation', 'storageRoom', 'wheelhouse',
    ]);
    expect(build.root.getObjectByName('smokestack-port')).toBeInstanceOf(Mesh);
    expect(build.root.getObjectByName('smokestack-starboard')).toBeInstanceOf(Mesh);
    expect(build.root.getObjectByName('alarm-beacon')).toBeInstanceOf(Mesh);
    expect(build.waterExclusion).toEqual({ halfWidth: 6.05, halfLength: 17.6 });
    build.disposeGeometry();
    materials.dispose();
  });

  it('keeps both loop doorways and the lifeboat rail opening clear', () => {
    const materials = createShipMaterials();
    const build = createShipGeometry(materials);
    const clearPoints = [
      new Vector3(-3.8, 3.72, 5.2),
      new Vector3(3.8, 3.72, 5.2),
      new Vector3(-4.7, 3.72, -8.2),
      new Vector3(4.7, 3.72, -8.2),
      new Vector3(5.9, 3.72, -6.5),
    ];
    clearPoints.forEach((point) => expect(build.shellColliders.some((box) =>
      point.x >= box.minX && point.x <= box.maxX &&
      point.y >= box.minY && point.y <= box.maxY &&
      point.z >= box.minZ && point.z <= box.maxZ)).toBe(false));
    build.disposeGeometry();
    materials.dispose();
  });
});
```

- [ ] **Step 2: Run the geometry test and confirm the missing module failure**

Run: `bun run test -- tests/ShipGeometry.test.ts`

Expected: FAIL because `../src/world/ShipGeometry` does not exist.

- [ ] **Step 3: Build the freighter shell with shared helper geometry**

Create `src/world/ShipGeometry.ts` with these exports:

```ts
export const FREIGHTER_DIMENSIONS = { width: 12.5, length: 36, deckY: 2 } as const;
export type ShipZoneId = 'crewCabin' | 'wheelhouse' | 'cargoDeck' | 'storageRoom' | 'lifeboatStation';

export interface ShipGeometryBuild {
  root: Group;
  shellColliders: CollisionBox[];
  zoneCenters: ReadonlyMap<ShipZoneId, Vector3>;
  waterExclusion: { halfWidth: number; halfLength: number };
  stackOutlets: readonly [Vector3, Vector3];
  disposeGeometry(): void;
}
```

Build all dimensions from named constants rather than anonymous coordinates:

```ts
const HALF_WIDTH = 6.25;
const HALF_LENGTH = 18;
const DECK_Y = 2;
const WALL_HEIGHT = 3.2;
const CABIN_Z = 8.3;
const WHEELHOUSE_Z = 13.6;
const STORAGE_Z = -9.2;
const LIFEBOAT_Z = -6.5;
```

Use a private `addBlock` helper that names meshes, enables shadows, and records each geometry in a `Set<BufferGeometry>`. Build:

- a 12.5 by 0.4 by 31 main hull body centered at `z = -1.5`;
- a tapered 5-unit bow wedge that reaches `z = 18`;
- a 12 by 0.28 by 34 timber deck at `y = 2`;
- cabin and storage wall segments with 2.2-unit doorway gaps on both route sides;
- a raised wheelhouse shell with front and side window gaps;
- a stern machinery housing centered near `z = -13`;
- rail segments along both sides, leaving a 2.8-unit gap at the starboard lifeboat station;
- two stack cylinders named `smokestack-port` and `smokestack-starboard`, with outlets at `(-1.35, 7.1, -13)` and `(1.35, 7.1, -13)`;
- one emergency beacon named `alarm-beacon` near the wheelhouse roof.

Model floor and deck planks as repeated thin boxes. Choose the material variant with `index % family.length`. Add one dark 0.015-unit grain strip to every third interior plank and every fourth deck plank. Add rust streak meshes below stack collars, deck drains, and the lifeboat rail opening.

Return exact zone centers:

```ts
new Map<ShipZoneId, Vector3>([
  ['crewCabin', new Vector3(0, 3.72, 7.5)],
  ['wheelhouse', new Vector3(0, 3.72, 13.2)],
  ['cargoDeck', new Vector3(0, 3.72, -1.5)],
  ['storageRoom', new Vector3(0, 3.72, -9.2)],
  ['lifeboatStation', new Vector3(5.4, 3.72, -6.5)],
]);
```

Record shell collision boxes for the deck, outer hull, wall segments, machinery housing, and rails. Do not bridge doorway or lifeboat gaps with colliders. `disposeGeometry()` must dispose each recorded geometry once and leave material disposal to `ShipMaterials`.

- [ ] **Step 4: Run geometry tests and type checking**

Run: `bun run test -- tests/ShipGeometry.test.ts`

Expected: PASS, 2 tests.

Run: `bun run typecheck`

Expected: PASS.

- [ ] **Step 5: Commit the freighter shell**

```powershell
git add src/world/ShipGeometry.ts tests/ShipGeometry.test.ts
git commit -m "feat: build coastal freighter shell"
```

---

### Task 4: Furnishings, Decorative Props, Colliders, and Placement Anchors

**Files:**

- Create: `src/world/ShipFurniture.ts`
- Create: `tests/ShipFurniture.test.ts`

**Interfaces:**

- Consumes: `ShipMaterials` from Task 2, `ShipItemAnchor` from Task 1, and `CollisionBox` from `src/player/collisions.ts`.
- Produces: `ShipFurnitureBuild` and `createShipFurniture(materials)`.

- [ ] **Step 1: Write the failing furniture and anchor tests**

Create `tests/ShipFurniture.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { createShipFurniture } from '../src/world/ShipFurniture';
import { createShipMaterials } from '../src/world/ShipMaterials';
import { validateShipItemAnchors } from '../src/world/ShipItemPlacement';

describe('ship furniture', () => {
  it('builds each approved furniture family and a surplus of valid anchors', () => {
    const materials = createShipMaterials();
    const build = createShipFurniture(materials);
    ['bunk', 'desk', 'chair', 'wall-shelf', 'locker', 'workbench', 'equipment-rack', 'cargo-crate']
      .forEach((name) => expect(build.root.getObjectByName(name)).toBeDefined());
    expect(build.anchors.length).toBeGreaterThanOrEqual(24);
    expect(() => validateShipItemAnchors(build.anchors)).not.toThrow();
    expect(build.anchors.filter(({ emergency }) => emergency)).toHaveLength(4);
    expect(new Set(build.anchors.flatMap(({ categories }) => categories))).toEqual(new Set([
      'foodWater', 'medicalEmergency', 'toolsRepair', 'fishingDiving',
    ]));
    build.disposeGeometry();
    materials.dispose();
  });

  it('keeps named route corridors free of furniture colliders', () => {
    const materials = createShipMaterials();
    const build = createShipFurniture(materials);
    const corridorPoints = build.routeClearancePoints;
    expect(corridorPoints.length).toBeGreaterThanOrEqual(12);
    corridorPoints.forEach((point) => expect(build.colliders.every((box) =>
      point.x < box.minX - 0.35 || point.x > box.maxX + 0.35 ||
      point.z < box.minZ - 0.35 || point.z > box.maxZ + 0.35)).toBe(true));
    build.disposeGeometry();
    materials.dispose();
  });
});
```

- [ ] **Step 2: Run the furniture test and confirm the missing module failure**

Run: `bun run test -- tests/ShipFurniture.test.ts`

Expected: FAIL because `../src/world/ShipFurniture` does not exist.

- [ ] **Step 3: Implement reusable furniture builders**

Create `src/world/ShipFurniture.ts` with this contract:

```ts
export interface ShipFurnitureBuild {
  root: Group;
  colliders: CollisionBox[];
  anchors: ShipItemAnchor[];
  routeClearancePoints: Vector3[];
  disposeGeometry(): void;
}
```

Add private builders with explicit inputs and return values:

```ts
function addDesk(parent: Group, materials: ShipMaterials, position: Vector3, rotationY: number): Group;
function addChair(parent: Group, materials: ShipMaterials, position: Vector3, rotationY: number): Group;
function addBunk(parent: Group, materials: ShipMaterials, position: Vector3, rotationY: number): Group;
function addShelf(parent: Group, materials: ShipMaterials, position: Vector3, rotationY: number): Group;
function addLocker(parent: Group, materials: ShipMaterials, position: Vector3, rotationY: number): Group;
function addWorkbench(parent: Group, materials: ShipMaterials, position: Vector3, rotationY: number): Group;
function addEquipmentRack(parent: Group, materials: ShipMaterials, position: Vector3, rotationY: number): Group;
function addCargoCrate(parent: Group, materials: ShipMaterials, position: Vector3, size: Vector3): Group;
```

Each builder must use shared box or cylinder geometries within its object family, choose wood variants by part index, name its first instance with the test name, and add dark narrow grain strips to broad wooden faces. Add decoration meshes for four charts, six mugs or dishes, two rope coils, six hand tools, and four machine parts. Decorations must not set `userData.itemType` or `userData.instanceId`.

Place furniture in these room bands:

- Crew cabin, `z = 5.2` through `10.8`: two bunks, two desks with chairs, two wall shelves, two lockers, and one small table.
- Wheelhouse, `z = 11.2` through `15.2`: helm desk, chart table, two instrument cabinets, and one emergency cabinet.
- Storage/workroom, `z = -11.4` through `-7`: two tall shelves, two workbenches, three lockers, two equipment racks, and one machinery block.
- Cargo deck, `z = -6` through `3`: six grouped crates, two rope coils, two vents, and two winch drums, leaving side corridors open.

Author at least 24 regular anchors plus these four emergency anchors:

```ts
[
  { id: 'emergency-food', categories: ['foodWater'], position: new Vector3(-3.8, 3.05, 8.8), surface: 'shelf' },
  { id: 'emergency-medical', categories: ['medicalEmergency'], position: new Vector3(3.7, 3.35, 12.4), surface: 'cabinet' },
  { id: 'emergency-tools', categories: ['toolsRepair'], position: new Vector3(-3.5, 3.08, -9.4), surface: 'workbench' },
  { id: 'emergency-gear', categories: ['fishingDiving'], position: new Vector3(3.8, 2.42, -8.4), surface: 'rack' },
]
```

Give each emergency anchor `emergency: true`, a unique `surfaceGroupId`, a 2.1 by 1.2 footprint, and 1.3 clearance. Regular anchor groups must cover galley shelves, cabin desks, the emergency cabinet, wheelhouse desks, workbenches, storage shelves, deck racks, and sturdy crate tops. Use low racks for fishing rods and the scuba set.

Return twelve route-clearance points sampled through the port and starboard halves of the loop. Add colliders for broad furniture bodies, not chair legs, mugs, tools, rope, or shelf contents. Dispose each geometry once.

- [ ] **Step 4: Run furniture and placement tests**

Run: `bun run test -- tests/ShipFurniture.test.ts tests/ShipItemPlacement.test.ts`

Expected: PASS, 6 tests.

Run: `bun run typecheck`

Expected: PASS.

- [ ] **Step 5: Commit furnishings and anchors**

```powershell
git add src/world/ShipFurniture.ts tests/ShipFurniture.test.ts
git commit -m "feat: furnish freighter with item surfaces"
```

---

### Task 5: Twin-Stack Smoke Pool

**Files:**

- Create: `src/world/ShipSmoke.ts`
- Create: `tests/ShipSmoke.test.ts`

**Interfaces:**

- Consumes: two ship-local stack outlet `Vector3` values from `ShipGeometryBuild`.
- Produces: `ShipSmoke`, `ShipSmokeSnapshot`, `update(delta, sinkingProgress, reducedMotion)`, `snapshotForTest()`, and `dispose()`.

- [ ] **Step 1: Write the failing smoke lifecycle tests**

Create `tests/ShipSmoke.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import { ShipSmoke } from '../src/world/ShipSmoke';

const outlets = [new Vector3(-1.35, 7.1, -13), new Vector3(1.35, 7.1, -13)] as const;

describe('ship smoke', () => {
  it('uses a fixed pool and increases active smoke with sinking progress', () => {
    const early = new ShipSmoke(outlets, () => 0.5);
    const late = new ShipSmoke(outlets, () => 0.5);
    for (let index = 0; index < 20; index += 1) {
      early.update(0.1, 0, false);
      late.update(0.1, 1, false);
    }
    expect(early.snapshotForTest().capacity).toBe(48);
    expect(late.snapshotForTest().capacity).toBe(48);
    expect(late.snapshotForTest().activeCount).toBeGreaterThan(early.snapshotForTest().activeCount);
    early.dispose();
    late.dispose();
  });

  it('reduces spawn and drift under reduced motion', () => {
    const regular = new ShipSmoke(outlets, () => 0.5);
    const reduced = new ShipSmoke(outlets, () => 0.5);
    for (let index = 0; index < 20; index += 1) {
      regular.update(0.1, 0.7, false);
      reduced.update(0.1, 0.7, true);
    }
    expect(reduced.snapshotForTest().activeCount).toBeLessThan(regular.snapshotForTest().activeCount);
    expect(reduced.snapshotForTest().maximumDrift).toBeLessThan(regular.snapshotForTest().maximumDrift);
    regular.dispose();
    reduced.dispose();
  });

  it('disposes geometry and material once', () => {
    const smoke = new ShipSmoke(outlets);
    const counts = { geometry: 0, material: 0 };
    smoke.points.geometry.addEventListener('dispose', () => counts.geometry += 1);
    smoke.points.material.addEventListener('dispose', () => counts.material += 1);
    smoke.dispose();
    smoke.dispose();
    expect(counts).toEqual({ geometry: 1, material: 1 });
  });
});
```

- [ ] **Step 2: Run the smoke test and confirm the missing module failure**

Run: `bun run test -- tests/ShipSmoke.test.ts`

Expected: FAIL because `../src/world/ShipSmoke` does not exist.

- [ ] **Step 3: Implement the fixed smoke pool**

Create `src/world/ShipSmoke.ts` with these public contracts:

```ts
export interface ShipSmokeSnapshot {
  capacity: number;
  activeCount: number;
  maximumDrift: number;
}

export class ShipSmoke {
  readonly points: Points<BufferGeometry, ShaderMaterial>;
  constructor(outlets: readonly [Vector3, Vector3], random?: () => number);
  update(delta: number, sinkingProgress: number, reducedMotion: boolean): void;
  snapshotForTest(): ShipSmokeSnapshot;
  dispose(): void;
}
```

Use `POOL_SIZE = 48`. Store position, opacity, and size in the `position`, `aOpacity`, and `aSize` buffer attributes. Store age, lifetime, velocity, active state, and source stack in typed arrays. Use a `ShaderMaterial` with `transparent: true` and `depthWrite: false`. Its vertex shader must set `gl_PointSize = aSize * (180.0 / -mvPosition.z)`, and its fragment shader must discard pixels outside a soft circular point sprite before returning `vec4(vec3(0.20, 0.21, 0.22), aOpacity * edge)`.

Calculate spawn interval as `0.26 - sinkingProgress * 0.14` seconds for regular motion and multiply it by `1.9` under reduced motion. Spawn puffs from alternating stack outlets. Regular puffs use vertical speed `0.85 + random() * 0.35`, X drift `0.18 + random() * 0.12`, Z drift `-0.08 + random() * 0.08`, and lifetime `2.2 + random() * 1.1`. Reduced motion multiplies horizontal drift by `0.3` and lifetime by `0.85`.

On update, clamp `delta` to 0.1, move active puffs, grow point size from 0.65 to 1.8 over normalized age, fade opacity from `0.62 + sinkingProgress * 0.16` to zero, and return expired slots to the pool. Set all three buffer attributes to `needsUpdate = true`. `snapshotForTest()` reports the pool length, active count, and greatest horizontal distance from the source outlet. Guard disposal with a boolean.

- [ ] **Step 4: Run smoke tests and type checking**

Run: `bun run test -- tests/ShipSmoke.test.ts`

Expected: PASS, 3 tests.

Run: `bun run typecheck`

Expected: PASS.

- [ ] **Step 5: Commit the smoke unit**

```powershell
git add src/world/ShipSmoke.ts tests/ShipSmoke.test.ts
git commit -m "feat: add sinking freighter smoke"
```

---

### Task 6: Assemble the Ship and Integrate It with World

**Files:**

- Modify: `src/world/Ship.ts:1-88`
- Modify: `src/world/World.ts:1-181`
- Modify: `tests/world.test.ts:1-455`
- Modify: `tests/collisions.test.ts:1-76`

**Interfaces:**

- Consumes: every public unit from Tasks 1 through 5, plus existing `createProp`, `World`, `SinkingState`, and `createWaterExclusion` contracts.
- Produces: extended `ShipBuild`, `createShip()`, item placement in `World`, smoke updates, enlarged water exclusion, updated lifeboat station, and owned disposal.

- [ ] **Step 1: Replace old ship contract tests with freighter integration tests**

In `tests/world.test.ts`, remove the import and tests for `selectSpawnPoints`. Import `assignShipItems` only in its focused test file. Replace the `builds the two-zone ship contract` and `selects every authored spawn point` tests with:

```ts
it('builds the furnished freighter contract with surplus authored anchors', () => {
  const ship = createShip();
  expect(ship.itemAnchors.length).toBeGreaterThanOrEqual(28);
  expect(ship.colliders.length).toBeGreaterThanOrEqual(24);
  expect(ship.playerStart.toArray()).toEqual([0, 3.72, 7.5]);
  expect(ship.evacuationPoint.toArray()).toEqual([5.4, 3.72, -6.5]);
  expect(ship.lifeboatAnchor.toArray()).toEqual([7.6, 0.35, -6.5]);
  expect(ship.waterExclusion).toEqual({ halfWidth: 6.05, halfLength: 17.6 });
  expect(ship.root.getObjectByName('ship-furniture')).toBeDefined();
  expect(ship.root.getObjectByName('freighter-smoke')).toBeDefined();
  ship.dispose();
});

it('places all world items on unique authored anchors', () => {
  const propModels = createTestPropModels();
  const world = new World(new Scene(), propModels, createItemInstances(), () => 0.35);
  const anchorIds = [...world.itemObjects.values()].map((item) => item.userData.shipAnchorId as string);
  expect(anchorIds).toHaveLength(14);
  expect(new Set(anchorIds).size).toBe(14);
  expect(anchorIds.every(Boolean)).toBe(true);
  world.dispose();
  propModels.dispose();
});
```

Update the water-exclusion expectation to `[-6.05, 6.05, -17.6, 17.6]`. Update lifeboat buoyancy target expectations from `(5.5, -5.8)` to `(7.6, -6.5)`. Add a smoke update assertion:

```ts
const smoke = scene.getObjectByName('freighter-smoke') as Points;
const smokePositions = smoke.geometry.getAttribute('position') as BufferAttribute;
const smokeVersion = smokePositions.version;
world.update(1, 0.1, { ...sinking, progress: 1 }, cameraPosition, false);
expect(smokePositions.version).toBeGreaterThan(smokeVersion);
```

In `tests/collisions.test.ts`, replace old bridge-console and rail coordinates with the approved route and blocking samples:

```ts
it.each([
  ['port outer hull', new Vector3(-6.2, 3.72, 0)],
  ['starboard outer hull forward', new Vector3(6.2, 3.72, 4)],
  ['wheelhouse console', new Vector3(0, 3.72, 14.5)],
  ['storage workbench', new Vector3(-4.4, 3.72, -9.4)],
  ['stern machinery', new Vector3(0, 3.72, -13)],
])('blocks the planned player height at the %s', (_label, point) => {
  expect(createShip().colliders.some((box) => pointInside(point, box))).toBe(true);
});
```

- [ ] **Step 2: Run the integration tests and confirm failures against the old ship**

Run: `bun run test -- tests/world.test.ts tests/collisions.test.ts`

Expected: FAIL because `ShipBuild` still exposes floor spawn points and old dimensions.

- [ ] **Step 3: Rebuild `Ship.ts` as the composition root**

Replace the old module-level materials, `block`, `selectSpawnPoints`, and box list in `src/world/Ship.ts` with this contract and assembly sequence:

```ts
export interface ShipBuild {
  root: Group;
  colliders: CollisionBox[];
  itemAnchors: ShipItemAnchor[];
  playerStart: Vector3;
  evacuationPoint: Vector3;
  lifeboatAnchor: Vector3;
  waterExclusion: { halfWidth: number; halfLength: number };
  updateEffects(delta: number, sinkingProgress: number, reducedMotion: boolean): void;
  dispose(): void;
}

export function createShip(): ShipBuild {
  const root = new Group();
  root.name = 'sinking-ship';
  const materials = createShipMaterials();
  const geometry = createShipGeometry(materials);
  const furniture = createShipFurniture(materials);
  const smoke = new ShipSmoke(geometry.stackOutlets);
  smoke.points.name = 'freighter-smoke';
  geometry.root.add(furniture.root, smoke.points);
  root.add(geometry.root);
  let disposed = false;
  return {
    root,
    colliders: [...geometry.shellColliders, ...furniture.colliders],
    itemAnchors: furniture.anchors,
    playerStart: new Vector3(0, 3.72, 7.5),
    evacuationPoint: new Vector3(5.4, 3.72, -6.5),
    lifeboatAnchor: new Vector3(7.6, 0.35, -6.5),
    waterExclusion: geometry.waterExclusion,
    updateEffects: (delta, progress, reducedMotion) => smoke.update(delta, progress, reducedMotion),
    dispose: () => {
      if (disposed) return;
      disposed = true;
      smoke.dispose();
      furniture.disposeGeometry();
      geometry.disposeGeometry();
      materials.dispose();
    },
  };
}
```

Name `furniture.root` as `ship-furniture` inside `createShipFurniture` if Task 4 did not already set it.

- [ ] **Step 4: Integrate anchors, smoke, lifeboat position, and disposal in `World.ts`**

Add a fourth constructor parameter for deterministic tests without changing production callers:

```ts
constructor(
  private readonly scene: Scene,
  private readonly propModels: PropModelLibrary,
  instances: readonly ItemInstance[] = createItemInstances(),
  random: () => number = Math.random,
)
```

Store the build and new anchor:

```ts
private readonly shipBuild: ShipBuild;
private readonly boatAnchor: Vector3;
```

Replace floor-spawn selection with:

```ts
this.shipBuild = createShip();
this.ship = this.shipBuild.root;
this.colliders = this.shipBuild.colliders;
this.playerStart = this.shipBuild.playerStart.clone();
this.evacuationPoint = this.shipBuild.evacuationPoint.clone();
this.boatAnchor = this.shipBuild.lifeboatAnchor.clone();
const assignments = assignShipItems(instances, this.shipBuild.itemAnchors, random);
instances.forEach((instance) => {
  const transform = assignments.get(instance.instanceId)!;
  const prop = createProp(this.propModels, instance);
  collectOwnedResources(prop, this.ownedGeometries, this.ownedMaterials);
  prop.position.copy(transform.position);
  prop.rotation.copy(transform.rotation);
  prop.scale.setScalar(transform.scale);
  prop.userData.shipAnchorId = transform.anchorId;
  this.ship.add(prop);
  this.itemObjects.set(instance.instanceId, prop);
});
```

Remove ship geometry from `ownedGeometries`; `shipBuild.dispose()` owns it. Keep prop and lifeboat resource collection unchanged. In `update`, call:

```ts
this.shipBuild.updateEffects(delta, sinking.progress, reducedMotion);
```

Use `this.shipBuild.waterExclusion` in `createWaterExclusion`. Position spray near the new station by changing `Environment.update` only if browser QA proves the old fixed spray origin visually detached; do not add that scope preemptively.

In `dispose`, call `this.shipBuild.dispose()` once before clearing the world-owned sets. Keep lost and saved item resource ownership in `World`.

- [ ] **Step 5: Update disposal assertions for ship-owned resources**

In the world disposal test, traverse the full ship before disposal, including nested groups and `Points`. Observe ship geometry and material disposal separately. Change the old shared-material expectation from zero disposals to one disposal for every freighter material. Preserve the existing one-time expectations for props, lifeboat, ocean, rain, spray, and clouds.

Use this resource collector extension:

```ts
root.traverse((object) => {
  if (object instanceof Mesh || object instanceof Points) {
    geometries.add(object.geometry);
    const values = Array.isArray(object.material) ? object.material : [object.material];
    values.forEach((material) => materials.add(material));
  }
});
```

- [ ] **Step 6: Run focused integration and regression tests**

Run: `bun run test -- tests/world.test.ts tests/collisions.test.ts tests/PlayerController.test.ts tests/interaction.test.ts`

Expected: PASS.

Run: `bun run typecheck`

Expected: PASS.

- [ ] **Step 7: Commit ship assembly and world integration**

```powershell
git add src/world/Ship.ts src/world/World.ts tests/world.test.ts tests/collisions.test.ts
git commit -m "feat: integrate furnished coastal freighter"
```

---

### Task 7: Documentation, Full Verification, and Browser Visual QA

**Files:**

- Modify: `README.md:1-93`
- Modify only if QA exposes a measured issue: `src/world/ShipGeometry.ts`, `src/world/ShipFurniture.ts`, `src/world/ShipMaterials.ts`, `src/world/ShipSmoke.ts`, `src/world/Ship.ts`, `src/world/World.ts`
- Modify matching focused tests for any measured adjustment.

**Interfaces:**

- Consumes: the complete freighter build from Tasks 1 through 6.
- Produces: updated architecture documentation, passing full verification, and recorded browser acceptance across the approved route and visual states.

- [ ] **Step 1: Update README world and gameplay descriptions**

Replace the README description of a compact two-zone steel ship with this content:

```markdown
The scavenging phase takes place on a furnished single-level coastal freighter. A loop connects the crew cabin, wheelhouse, cargo deck, storage/workroom, and lifeboat station, giving each two-minute run two practical search directions.

Collectibles spawn on authored desks, shelves, cabinets, workbenches, racks, and crates. Each item type uses compatible surfaces, so food stays near cabin storage, emergency supplies stay near the wheelhouse, tools stay near work surfaces, and fishing or diving gear stays on large equipment racks. The fourteen-item distribution and carrying rules remain unchanged.

The ship uses original procedural materials and geometry: varied wooden planks and panels, worn furniture, painted steel, rust details, railings, working-deck fittings, twin smokestacks, and pooled smoke that responds to sinking progress and reduced-motion preference.
```

Extend the architecture list with the responsibilities of `ShipItemPlacement`, `ShipMaterials`, `ShipGeometry`, `ShipFurniture`, and `ShipSmoke`.

- [ ] **Step 2: Run the complete automated verification suite**

Run: `bun run typecheck`

Expected: PASS.

Run: `bun run test`

Expected: PASS with no failed tests.

Run: `bun run build`

Expected: PASS and Vite writes `dist/`.

- [ ] **Step 3: Start the local game and verify the title-screen silhouette**

Run: `bun run dev -- --host 127.0.0.1 --port 4173 --strictPort`

Open `http://127.0.0.1:4173` in the in-app browser. At 1280 by 720 and 1920 by 1080, verify:

- the tapered hull, raised wheelhouse, stern housing, railings, and twin stacks read from the title view;
- the lifeboat remains visible beside the freighter;
- smoke does not cover the title, timer, or lifeboat status;
- the performance-stat overlay remains readable.

- [ ] **Step 4: Complete active-scavenging visual and traversal QA**

Use a real pointer-lock browser session. Verify both route directions:

1. Crew cabin to wheelhouse to starboard cargo deck to lifeboat station.
2. Crew cabin to storage/workroom to port cargo deck to wheelhouse.

For at least three restarts, record that all fourteen supplies rest on plausible surfaces, large gear uses low racks or cradles, several anchors remain empty, and items change location without changing category. Confirm the player can approach each item within interaction range, move through both doorway paths, reach the lifeboat from both sides, and avoid collision traps around chairs, crates, bunks, and workbenches.

Complete one representative two-minute evacuation run. Pick up and drop one small item, throw and save one item, lose one item in the ocean, and carry the scuba set to confirm the unchanged capacity rule.

- [ ] **Step 5: Verify sinking, smoke, water, reduced motion, and performance**

Observe the start, midpoint, and final 20 seconds of a run. Confirm:

- smoke density rises within the fixed 48-puff pool;
- smoke clears the crosshair, exits, and lifeboat station;
- both stacks move with the sinking ship;
- ocean fragments remain excluded from the enlarged hull while the ship lists;
- emergency light pulse, rain, spray, and fog still respond to sinking;
- reduced motion lowers smoke drift and spawn rate without removing distress feedback;
- the FPS overlay shows no sustained regression greater than 15 percent from the pre-change scene on the same machine and resolution.

If a check fails, change the smallest responsible constant, add or update the focused automated assertion, and rerun Steps 2 through 5. Acceptable tuning constants are ship dimensions within the approved 10 percent range, furniture coordinates, anchor transforms, smoke rates, material colors, and lifeboat station offsets. Do not change item rules or the timer.

- [ ] **Step 6: Commit documentation and verified tuning**

Stage `README.md` plus only the source and test files changed by measured QA tuning:

```powershell
git add README.md src/world/ShipGeometry.ts src/world/ShipFurniture.ts src/world/ShipMaterials.ts src/world/ShipSmoke.ts src/world/Ship.ts src/world/World.ts tests/ShipGeometry.test.ts tests/ShipFurniture.test.ts tests/ShipMaterials.test.ts tests/ShipSmoke.test.ts tests/world.test.ts tests/collisions.test.ts
git commit -m "docs: document coastal freighter overhaul"
```

- [ ] **Step 7: Record the final verification evidence**

Run:

```powershell
bun run typecheck
bun run test
bun run build
git status --short
```

Expected: type checking, tests, and build pass. `git status --short` may list only the user's pre-existing performance-stat files and `dev-server.err`; no freighter file remains uncommitted.

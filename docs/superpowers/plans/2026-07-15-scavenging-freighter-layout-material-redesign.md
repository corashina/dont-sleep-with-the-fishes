# Scavenging Freighter Layout and Material Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the scavenging freighter's playable layout, furniture, floors, walls, item surfaces, and railing so all fourteen supplies are plausibly placed and every required route is spacious and player-reachable.

**Architecture:** `ShipLayout.ts` becomes the single spatial contract for zones, doors, circulation lanes, furniture, surfaces, rails, and navigation targets. Geometry, furniture, and item placement consume that contract; a player-radius navigation validator proves connectivity. A pinned Kenney Furniture Kit pipeline produces committed GLBs loaded by a shared `ShipFurnitureLibrary`, while `ShipMaterials` replaces coplanar plank detail with deterministic generated texture maps on five non-overlapping floor meshes.

**Tech Stack:** TypeScript 5.9, Three.js 0.180, Vitest 3.2, Vite 7.1, Bun, Node ESM, PowerShell, glTF Transform 4.4, Kenney Furniture Kit 1.0 (CC0).

## Global Constraints

- Preserve the custom hull silhouette, five gameplay zones, lifeboat at starboard Z = -6.5, two-minute timer, fourteen item instances, carrying/throwing/saving rules, sinking sequence, restart behavior, and survival handoff.
- Keep the finished deck at Y = 2.22 and the first-person standing sample plane at Y = 3.72.
- Treat the player as a 0.35-unit-radius circle for all layout validation.
- Require at least 2.0 units between collider faces for primary lanes, 1.4 for furniture-access aisles, 1.8 for doors, and 3.0 along the starboard rail opening.
- Keep rail render geometry and collision between 1.0 and 1.1 units above the finished deck; use 1.05 units in the approved layout.
- Place bunks, lockers, desks, shelves, cabinets, and workbenches at room perimeters. Do not place beds or chairs in a primary route.
- Delete visible `anchor-support-*`, floor plank, and grain-strip meshes. No item may use a bed, chair, walkway, wall, or decorative emergency plate as a support.
- Use [Kenney Furniture Kit](https://kenney.nl/assets/furniture-kit) 1.0 as the only new asset pack. Pin archive `https://kenney.nl/media/pages/assets/furniture-kit/440e0608a4-1677580847/kenney_furniture-kit.zip` with SHA-256 `E67652D0932CEE41683F74711C03D3E192A2AF9979EF8E6B237711F5482D46B0`.
- Commit processed GLBs locally under `src/assets/models/ship/`; production code must make no remote model or texture request.
- Use these seven source entries and triangle counts exactly:

| Runtime ID | Source entry | Source triangles | Canonical runtime size `[x,y,z]` |
|---|---|---:|---|
| `bedBunk` | `Models/GLTF format/bedBunk.glb` | 580 | `[1.147, 1.708, 2.200]` |
| `desk` | `Models/GLTF format/desk.glb` | 198 | `[1.700, 0.890, 0.908]` |
| `chairDesk` | `Models/GLTF format/chairDesk.glb` | 588 | `[0.551, 1.000, 0.517]` |
| `bookcaseOpen` | `Models/GLTF format/bookcaseOpen.glb` | 320 | `[0.841, 1.850, 0.526]` |
| `bookcaseClosedDoors` | `Models/GLTF format/bookcaseClosedDoors.glb` | 296 | `[0.871, 1.850, 0.544]` |
| `table` | `Models/GLTF format/table.glb` | 120 | `[2.112, 0.820, 1.123]` |
| `sideTableDrawers` | `Models/GLTF format/sideTableDrawers.glb` | 238 | `[1.043, 0.750, 0.434]` |

The canonical sizes above are the pinned GLB bounds after one uniform scale, rounded outward to 0.001 units. Do not non-uniformly stretch the Kenney models.

- Preserve all unrelated dirty-worktree changes. Before every commit, inspect `git diff --cached --name-only` and stage only the files named by that task.
- Use test-driven development: establish RED, implement the smallest coherent slice, establish GREEN, then commit.

---

### Task 1: Establish the Data-Driven Layout and Player-Radius Validator

**Files:**
- Create: `src/world/ShipLayout.ts`
- Create: `tests/ShipLayout.test.ts`
- Modify: `src/world/ShipGeometry.ts`
- Modify: `tests/ShipGeometry.test.ts`

**Interfaces:**
- Produces `SHIP_LAYOUT`, `PLAYER_LAYOUT_RADIUS`, `validateShipLayout(layout)`, and `analyzeShipNavigation(layout)`.
- Moves `ShipZoneId` and `FREIGHTER_DIMENSIONS` ownership from `ShipGeometry.ts` to `ShipLayout.ts`; `ShipGeometry.ts` re-exports them temporarily if other callers still import the old path.
- Represents all X/Z extents as axis-aligned rectangles or polygons in ship-local coordinates. The approved furniture render and collider transforms use the same quarter-turn rotations.

- [ ] **Step 1: Write the failing spatial-contract tests**

Create `tests/ShipLayout.test.ts` with exact assertions for five zones, door sizes, route classes, rail height/opening, unique IDs, furniture non-overlap, and connectivity:

```ts
import { describe, expect, it } from 'vitest';
import {
  PLAYER_LAYOUT_RADIUS,
  SHIP_LAYOUT,
  analyzeShipNavigation,
  validateShipLayout,
} from '../src/world/ShipLayout';

describe('scavenging ship layout', () => {
  it('defines the approved spacious five-zone contract', () => {
    expect(PLAYER_LAYOUT_RADIUS).toBe(0.35);
    expect(SHIP_LAYOUT.zones.map(({ id }) => id)).toEqual([
      'crewCabin', 'wheelhouse', 'cargoDeck', 'storageWorkroom', 'lifeboatStation',
    ]);
    expect(SHIP_LAYOUT.doors.every(({ width }) => width >= 1.8 && width <= 2.2)).toBe(true);
    expect(SHIP_LAYOUT.lanes.filter(({ className }) => className === 'primary')
      .every(({ clearWidth }) => clearWidth >= 2)).toBe(true);
    expect(SHIP_LAYOUT.lanes.filter(({ className }) => className === 'secondary')
      .every(({ clearWidth }) => clearWidth >= 1.4)).toBe(true);
    expect(SHIP_LAYOUT.rail.height).toBe(1.05);
    expect(SHIP_LAYOUT.rail.starboardOpening.width).toBe(3.2);
  });

  it('connects start, both sides of every door, both loop directions, surfaces, and evacuation', () => {
    expect(() => validateShipLayout(SHIP_LAYOUT)).not.toThrow();
    const result = analyzeShipNavigation(SHIP_LAYOUT);
    expect(result.unreachableTargetIds).toEqual([]);
    expect(result.minimumPrimaryClearance).toBeGreaterThanOrEqual(2);
    expect(result.minimumSecondaryClearance).toBeGreaterThanOrEqual(1.4);
  });

  it('rejects the old blocked cabin exit and overlapping cargo arrangement by object id', () => {
    const blocked = {
      ...SHIP_LAYOUT,
      furniture: [...SHIP_LAYOUT.furniture, {
        id: 'old-port-bunk', modelId: 'bedBunk' as const, zoneId: 'crewCabin' as const,
        position: [-3.25, 2.22, 6.4] as const, rotationY: 0 as const,
        colliderSize: [1.05, 1.75, 2.18] as const,
        scale: [1, 1, 1] as const, surfaces: [],
      }],
    };
    expect(() => validateShipLayout(blocked)).toThrow(/old-port-bunk.*cabin-port-door/i);
  });
});
```

- [ ] **Step 2: Run the new test and confirm RED**

Run: `bun run test tests/ShipLayout.test.ts`

Expected: FAIL because `src/world/ShipLayout.ts` does not exist.

- [ ] **Step 3: Implement the layout types and approved coordinates**

Create `ShipLayout.ts` with these public types and fixed measurements:

```ts
export const PLAYER_LAYOUT_RADIUS = 0.35;
export const FREIGHTER_DIMENSIONS = { width: 12.5, length: 36, deckY: 2.22 } as const;

export type ShipZoneId =
  | 'crewCabin' | 'wheelhouse' | 'cargoDeck'
  | 'storageWorkroom' | 'lifeboatStation';
export type ClearanceClass = 'primary' | 'secondary';
export type ShipFurnitureAssetId =
  | 'bedBunk' | 'desk' | 'chairDesk' | 'bookcaseOpen'
  | 'bookcaseClosedDoors' | 'table' | 'sideTableDrawers';
export type ShipFurnitureKind = ShipFurnitureAssetId | 'cargoCrate';

export interface Rect2 {
  readonly minX: number; readonly maxX: number;
  readonly minZ: number; readonly maxZ: number;
}
export interface ShipItemSurfaceSpec {
  readonly id: string;
  readonly physicalSlotId: string;
  readonly categories: readonly ShipItemCategory[];
  readonly localPosition: readonly [number, number, number];
  readonly localRotation: readonly [number, number, number];
  readonly footprint: { readonly width: number; readonly depth: number };
  readonly clearanceHeight: number;
  readonly standingPoints: readonly (readonly [number, number, number])[];
  readonly fallback: boolean;
}
export interface ShipFurniturePlacementSpec {
  readonly id: string;
  readonly modelId: ShipFurnitureKind;
  readonly zoneId: ShipZoneId;
  readonly position: readonly [number, number, number];
  readonly rotationY: 0 | 1.5707963267948966 | 3.141592653589793;
  readonly scale: readonly [number, number, number];
  readonly colliderSize: readonly [number, number, number];
  readonly surfaces: readonly ShipItemSurfaceSpec[];
}
```

Use these zone envelopes and route-defining openings:

| ID | Bounds / center | Required measurement |
|---|---|---|
| `crewCabin` | X `[-3.70,3.70]`, Z `[3.50,10.30]` | port and starboard side doors centered Z `5.40`, width `2.0` |
| `wheelhouse` | X `[-3.70,3.70]`, Z `[11.40,15.80]` | aft door centered X `0`, width `2.2`; port door centered Z `13.25`, width `2.0` |
| `cargoDeck` | rounded deck outline minus the other four floor polygons | central longitudinal lane X `[-1,1]`; cross lanes centered Z `-4.45` and `0.55`, width `2.0` |
| `storageWorkroom` | X `[-3.80,3.80]`, Z `[-12.00,-7.20]` | port and starboard side doors centered Z `-8.35`, width `2.0` |
| `lifeboatStation` | X `[3.80,6.00]`, Z `[-8.10,-4.90]` | rail opening centered Z `-6.50`, width `3.2` |

Define primary exterior lanes between structure faces X = +/-3.8 and the inner rail collider faces X = +/-5.875. Define secondary access rectangles in front of each furniture collider. Put navigation targets at start `[0, 7.2]`, both sides of every door, `port-loop-forward`, `port-loop-aft`, `starboard-loop-forward`, `starboard-loop-aft`, each transformed surface standing point, and evacuation `[5.4, -6.5]`.

For a side-wall door, define its protected approach as X from one unit outside to one unit inside the wall and Z from `centerZ - width / 2 - 0.35` to `centerZ + width / 2 + 0.35`. For an aft-wall door, transpose X and Z. Define each furniture-access rectangle as the union of its authored standing-point circle (radius 0.35) and the straight 0.70-unit-wide segment to its surface center.

- [ ] **Step 4: Implement validation and graph analysis**

Implement these checks in `validateShipLayout` before running connectivity:

1. Unique zone, door, furniture, surface, lane, and target IDs.
2. Positive dimensions and allowed quarter-turns.
3. No furniture rectangle intersects another furniture rectangle, a door approach rectangle, a primary lane, or the evacuation rectangle.
4. Each declared lane's measured face-to-face width meets its class.
5. Each surface has categories, a positive footprint/clearance, at least one standing point, and an owner.
6. The rail opening covers Z `[-8.10,-4.90]` and contains the evacuation target.

For connectivity, rasterize X `[-6,6]`, Z `[-17.6,17.6]` at 0.10-unit cells. Inflate active wall, furniture, machinery-closure, and rail rectangles by 0.35 before marking cells blocked. Use 8-neighbor movement but reject diagonal corner cutting when either orthogonal neighbor is blocked. Flood-fill from the start cell and report all unreachable target IDs. Return measured lane minima in `ShipNavigationAnalysis`.

- [ ] **Step 5: Move shared constants out of geometry and establish GREEN**

Update `ShipGeometry.ts` to consume layout constants, leaving its visuals unchanged for this task. Update imports in `ShipGeometry.test.ts`.

Run: `bun run test tests/ShipLayout.test.ts tests/ShipGeometry.test.ts`

Expected: PASS, including rejection messages containing both conflicting object IDs.

- [ ] **Step 6: Commit the layout contract**

```bash
git add src/world/ShipLayout.ts src/world/ShipGeometry.ts tests/ShipLayout.test.ts tests/ShipGeometry.test.ts
git commit -m "feat: define validated scavenging ship layout"
```

### Task 2: Replace Layered Floors with Deterministic Surface Materials

**Files:**
- Modify: `src/world/ShipMaterials.ts`
- Modify: `src/world/ShipGeometry.ts`
- Modify: `tests/ShipMaterials.test.ts`
- Modify: `tests/ShipGeometry.test.ts`

**Interfaces:**
- Replaces material families used to fake plank variation with named surface materials.
- Produces `createShipMaterials(seed, maxAnisotropy)` and test-only resource accessors.
- Produces exactly five finished-floor meshes: `floor-crewCabin`, `floor-wheelhouse`, `floor-cargoDeck`, `floor-storageWorkroom`, and `floor-lifeboatStation`.

- [ ] **Step 1: Write failing texture and floor-layer tests**

Add assertions equivalent to:

```ts
const first = createShipMaterials(0x51f15e, 8);
const second = createShipMaterials(0x51f15e, 8);
expect(first.textureBytesForTest()).toEqual(second.textureBytesForTest());
expect(first.crewFloor.map).toBe(first.wheelhouseFloor.map);
expect(first.cargoFloor.map).toBe(first.lifeboatFloor.map);
expect(first.crewFloor.map?.anisotropy).toBe(8);
expect(first.ownedTexturesForTest()).toHaveLength(12);
```

In `ShipGeometry.test.ts`, assert the five exact floor names, one mesh per name, no name matching `/plank|grain/i`, no two finished floor boxes intersect in a positive-area X/Z region, and every floor top is Y = 2.22.

- [ ] **Step 2: Run focused tests and confirm RED**

Run: `bun run test tests/ShipMaterials.test.ts tests/ShipGeometry.test.ts`

Expected: FAIL because current materials expose color-only families and geometry creates plank/grain meshes.

- [ ] **Step 3: Implement deterministic 64x64 texture sets**

Use four shared texture sets, each containing color, roughness, and bump `DataTexture`s: `warmWood`, `maritimeDeck`, `industrialFloor`, and `paintedPanel`. That is exactly twelve owned textures. Generate RGBA bytes with an integer-only hash of `(seed, x, y, channel)` so equal seeds produce byte-identical maps. Use these exact repeat values:

```ts
function textureByte(seed: number, x: number, y: number, channel: number): number {
  let value = (seed ^ Math.imul(x + 1, 0x9e3779b1)
    ^ Math.imul(y + 1, 0x85ebca6b) ^ Math.imul(channel + 1, 0xc2b2ae35)) >>> 0;
  value = Math.imul(value ^ (value >>> 16), 0x7feb352d);
  value = Math.imul(value ^ (value >>> 15), 0x846ca68b);
  return (value ^ (value >>> 16)) & 0xff;
}
```

For `warmWood`, darken columns `x % 16 === 0` for plank seams and add only +/-10 byte grain noise elsewhere. For `maritimeDeck`, use +/-8 broad noise and darken `x % 32 === 0` by 12. For `industrialFloor`, use +/-6 noise plus a 4-pixel diamond anti-slip modulation. For `paintedPanel`, use +/-4 noise and darken `x % 32 === 0 || y % 32 === 0` by 6. Clamp every channel to `[0,255]`; roughness and bump maps use the same features but separate hash channels.

| Set | Repeat | Color space | Bump scale |
|---|---|---|---:|
| `warmWood` | `[3, 12]` | `SRGBColorSpace` on color only | `0.035` |
| `maritimeDeck` | `[6, 18]` | `SRGBColorSpace` on color only | `0.018` |
| `industrialFloor` | `[5, 8]` | `SRGBColorSpace` on color only | `0.024` |
| `paintedPanel` | `[5, 4]` | `SRGBColorSpace` on color only | `0.010` |

Set all wraps to `RepeatWrapping`, filters to `LinearMipmapLinearFilter`/`LinearFilter`, `generateMipmaps = true`, and anisotropy to `Math.max(1, Math.min(8, maxAnisotropy))`. Create named materials `crewFloor`, `wheelhouseFloor`, `cargoFloor`, `storageFloor`, `lifeboatFloor`, `paintedPanel`, `paintedSteel`, `darkHull`, `darkMetal`, `exposedMetal`, `rust`, `rope`, `glass`, `emergency`, and `beacon`.

Dispose each material and each of the twelve textures exactly once. Keep `ownedMaterialsForTest()` and add `ownedTexturesForTest()` and `textureBytesForTest()`.

- [ ] **Step 4: Build five non-overlapping floor shapes**

Set the structural deck slab top below Y = 2.20 so it cannot z-fight with the finished surfaces. Build four rectangular `ShapeGeometry` floors for cabin, wheelhouse, storage, and lifeboat station. Build cargo as one rounded-deck shape whose starboard outline detours around the lifeboat-station rectangle and whose three interior holes are cabin, wheelhouse, and storage; the station therefore is not an invalid hole touching the outer contour. Rotate floor shapes onto X/Z and place their top at Y = 2.22. Delete `addDeckPlanks`, `addRoomFloorPlanks`, `addWoodGrain`, `DECK_PLANK_*`, `GRAIN_*`, and `ROOM_FLOOR_CLEARANCE`.

- [ ] **Step 5: Run focused tests and confirm GREEN**

Run: `bun run test tests/ShipMaterials.test.ts tests/ShipGeometry.test.ts`

Expected: PASS; disposal spies each fire once and no plank/grain mesh remains.

- [ ] **Step 6: Commit the surface rewrite**

```bash
git add src/world/ShipMaterials.ts src/world/ShipGeometry.ts tests/ShipMaterials.test.ts tests/ShipGeometry.test.ts
git commit -m "feat: replace ship floor layers with textured surfaces"
```

### Task 3: Rebuild Walls, Doors, Machinery Closures, and Waist-Height Rails

**Files:**
- Modify: `src/world/ShipGeometry.ts`
- Modify: `tests/ShipGeometry.test.ts`
- Modify: `tests/ShipLayout.test.ts`

**Interfaces:**
- `createShipGeometry(materials, layout = SHIP_LAYOUT)` consumes all room, door, rail, and closure measurements from the layout.
- Shell colliders and visible wall/rail segments are derived from the same segment list.

- [ ] **Step 1: Write failing geometry-contract tests**

Test every door with three player-center samples (center and 0.35 units inside each jamb), verify wall samples immediately outside each opening remain blocked, verify no render mesh covers the opening volume, and verify rail geometry/colliders share height 1.05. Assert the only passable starboard rail interval is Z `[-8.10,-4.90]` and that bow/stern/port rail samples remain blocked at player height.

- [ ] **Step 2: Run the geometry tests and confirm RED**

Run: `bun run test tests/ShipGeometry.test.ts tests/ShipLayout.test.ts`

Expected: FAIL on the old 1.25 wheelhouse opening, 1.8 rail height, and geometry-local coordinates.

- [ ] **Step 3: Generate walls and doors from segment subtraction**

Implement one segment builder that subtracts each door interval from its owning wall and emits both the visible mesh and collision box for each remainder. Use pale `paintedPanel` on crew-cabin and wheelhouse interiors, `paintedSteel` on storage and exterior structural faces, and current glass for wheelhouse panes. Do not create a collision box for glass spanning an approved door.

Use full-height visual closures around stern machinery wherever the 0.35-radius navigation grid marks space non-playable. Name them `machinery-closure-port`, `machinery-closure-center`, and `machinery-closure-starboard`, and register matching colliders so the scene never advertises a false narrow route.

- [ ] **Step 4: Rebuild all rails from the layout**

Use rail top Y = `2.22 + 1.05 = 3.27`. Use the same 1.05 height for posts and collision boxes. Retain rounded bow/stern segments, keep the full port rail, and split the starboard rail at Z -8.10 and -4.90. Align the opening center with evacuation Z -6.50.

- [ ] **Step 5: Establish GREEN and commit**

Run: `bun run test tests/ShipGeometry.test.ts tests/ShipLayout.test.ts`

Expected: PASS with all six doors and the single rail opening sampled successfully.

```bash
git add src/world/ShipGeometry.ts tests/ShipGeometry.test.ts tests/ShipLayout.test.ts
git commit -m "feat: widen ship routes and lower exterior rails"
```

### Task 4: Add the Reproducible Kenney Ship-Furniture Asset Pipeline

**Files:**
- Create: `scripts/kenney-ship-furniture.mjs`
- Create: `scripts/kenney-ship-furniture.d.mts`
- Create: `scripts/fetch-ship-furniture.ps1`
- Create: `scripts/check-ship-furniture.mjs`
- Create: `tests/KenneyShipFurnitureModels.test.ts`
- Create: `tests/KenneyShipFurnitureSources.test.ts`
- Create: `tests/shipFurnitureModelAudit.test.ts`
- Modify: `scripts/item-model-publication.ps1`
- Modify: `tests/itemModelPublication.test.ts`
- Modify: `package.json`
- Modify: `THIRD_PARTY_ASSETS.md`
- Create: `src/assets/models/ship/bedBunk.glb`
- Create: `src/assets/models/ship/desk.glb`
- Create: `src/assets/models/ship/chairDesk.glb`
- Create: `src/assets/models/ship/bookcaseOpen.glb`
- Create: `src/assets/models/ship/bookcaseClosedDoors.glb`
- Create: `src/assets/models/ship/table.glb`
- Create: `src/assets/models/ship/sideTableDrawers.glb`

**Interfaces:**
- Produces `KENNEY_SHIP_FURNITURE_PACK` and `KENNEY_SHIP_FURNITURE_RECIPES`.
- Produces `buildKenneyShipFurniture({ sourceRoot, outputRoot, recipes? })`.
- Adds aggregate `models:fetch` and `models:check` scripts while retaining item-only and ship-only subcommands.

- [ ] **Step 1: Write the failing catalog and builder tests**

Assert the exact URL, version, hash, seven source entries, exact per-model triangle counts, and 2,340 total triangles. Reuse the glTF fixture pattern from `tests/KenneyItemModels.test.ts` to prove direct packaging, pruning, embedded textures, missing-source rejection, and triangle-count rejection.

```ts
expect(KENNEY_SHIP_FURNITURE_PACK).toMatchObject({
  version: '1.0',
  pageUrl: 'https://kenney.nl/assets/furniture-kit',
  sha256: 'E67652D0932CEE41683F74711C03D3E192A2AF9979EF8E6B237711F5482D46B0',
});
expect(Object.values(KENNEY_SHIP_FURNITURE_RECIPES)
  .reduce((sum, recipe) => sum + recipe.expectedTriangles, 0)).toBe(2340);
```

Run: `bun run test tests/KenneyShipFurnitureModels.test.ts`

Expected: FAIL because the builder module does not exist.

- [ ] **Step 2: Implement the direct GLB builder**

Use `NodeIO` with all extensions, `cloneDocument`, `prune`, `dedup`, and `unpartition`. Preserve Kenney materials and embedded texture bytes. Rename the scene and root nodes to the runtime ID, verify the source triangle count before writing, and write only the seven stable filenames. Do not scale the binary geometry; runtime normalization owns canonical size so provenance remains a direct source build.

- [ ] **Step 3: Generalize guarded publication without weakening item safety**

Rename the implementation function to `Publish-ModelDirectory` and add mandatory `StagePrefix` and `BackupPrefix` parameters. Keep `Publish-ItemModelDirectory` as a wrapper supplying `.items-stage-` and `.items-backup-`. Add `Publish-ShipFurnitureDirectory` supplying `.ship-stage-` and `.ship-backup-`. Extend `itemModelPublication.test.ts` to run the rollback and unsafe-path matrix for both wrappers.

- [ ] **Step 4: Write and implement pinned download tests**

In `KenneyShipFurnitureSources.test.ts`, cover matching/mismatched hash, selective extraction of the seven GLBs plus `License.txt`, missing entry, traversal rejection, and presence of the guarded publisher. Reuse `Assert-FileSha256` and `Expand-ApprovedArchiveEntries` from `scripts/kenney-item-sources.ps1`.

Implement `fetch-ship-furniture.ps1` to download to the OS temp directory, verify the pinned hash, extract only the approved entries, build into `src/assets/models/.ship-stage-<guid>`, run the asset-only audit, then atomically publish to `src/assets/models/ship` with rollback.

- [ ] **Step 5: Add the ship model audit and package scripts**

Limit each furniture model to 1,000 triangles and the library to 8,000. Reuse exported `countTriangles` from `check-item-models.mjs`; require exactly seven GLBs, embedded dependencies, finite non-empty bounds, and exact ledger rows.

Set scripts to:

```json
{
  "models:fetch:items": "powershell -ExecutionPolicy Bypass -File scripts/fetch-item-models.ps1",
  "models:fetch:ship": "powershell -ExecutionPolicy Bypass -File scripts/fetch-ship-furniture.ps1",
  "models:fetch": "bun run models:fetch:items && bun run models:fetch:ship",
  "models:check:items": "node scripts/check-item-models.mjs",
  "models:check:ship": "node scripts/check-ship-furniture.mjs",
  "models:check": "bun run models:check:items && bun run models:check:ship"
}
```

- [ ] **Step 6: Fetch, audit, and document the real files**

Run: `bun run models:fetch:ship`

Expected audit:

```text
bedBunk: 580 triangles
desk: 198 triangles
chairDesk: 588 triangles
bookcaseOpen: 320 triangles
bookcaseClosedDoors: 296 triangles
table: 120 triangles
sideTableDrawers: 238 triangles
total: 2340 / 8000 triangles
```

Add seven rows to `THIRD_PARTY_ASSETS.md` recording Furniture Kit 1.0, the pinned hash, exact source entry, direct build with prune/dedup/unpartition and embedded resources, source/committed triangle counts, CC0, and download date `2026-07-15`.

- [ ] **Step 7: Run asset tests and commit**

Run:

```bash
bun run models:check
bun run test tests/KenneyShipFurnitureModels.test.ts tests/KenneyShipFurnitureSources.test.ts tests/shipFurnitureModelAudit.test.ts tests/itemModelPublication.test.ts tests/AssetPolicy.test.ts
```

Expected: PASS and both item and ship audit totals print.

```bash
git add scripts/kenney-ship-furniture.mjs scripts/kenney-ship-furniture.d.mts scripts/fetch-ship-furniture.ps1 scripts/check-ship-furniture.mjs scripts/item-model-publication.ps1 tests/KenneyShipFurnitureModels.test.ts tests/KenneyShipFurnitureSources.test.ts tests/shipFurnitureModelAudit.test.ts tests/itemModelPublication.test.ts package.json THIRD_PARTY_ASSETS.md src/assets/models/ship
git commit -m "feat: add pinned Kenney ship furniture assets"
```

### Task 5: Preload and Own Furniture Models Through Game Startup

**Files:**
- Create: `src/world/shipFurnitureManifest.ts`
- Create: `src/world/ShipFurnitureLibrary.ts`
- Create: `tests/ShipFurnitureLibrary.test.ts`
- Create: `tests/helpers/shipFurniture.ts`
- Modify: `src/app/launchGame.ts`
- Modify: `src/app/GamePhase.ts`
- Modify: `src/Game.ts`
- Modify: `tests/launchGame.test.ts`
- Modify: `tests/GameDirector.test.ts`
- Modify: `tests/GameLifecycle.test.ts`

**Interfaces:**
- Produces `SHIP_FURNITURE_MODEL_IDS`, `SHIP_FURNITURE_MODEL_SPECS`, `ShipFurnitureLibrary.load(loader?)`, `clone(id)`, and idempotent `dispose()`.
- Adds `shipFurniture: ShipFurnitureLibrary` and `maxTextureAnisotropy: number` to `PhaseContext`.
- Extends launch dependencies with `loadShipFurniture()` and `createGame(mount, propModels, shipFurniture, skyAssets)`.

- [ ] **Step 1: Write failing library tests**

Follow `PropModelLibrary.test.ts` but assert seven URLs under `src/assets/models/ship`, exact canonical sizes from the global table within 0.002 units, centered X/Z bounds with the model base at local Y = 0, shared immutable geometry/material references across clones, independent transforms, item-specific load errors, cleanup of partial loads, aggregate triangle enforcement, and exactly-once disposal. The manifest records these uniform-scale axes: bed `z -> 2.200`, desk `x -> 1.700`, chair `y -> 1.000`, both bookcases `y -> 1.850`, table `y -> 0.820`, and side table `y -> 0.750`.

- [ ] **Step 2: Run and confirm RED**

Run: `bun run test tests/ShipFurnitureLibrary.test.ts`

Expected: FAIL because the manifest and library do not exist.

- [ ] **Step 3: Implement normalization and ownership**

Model the loader adapter and validation after `PropModelLibrary`, but keep a separate error type:

```ts
export class ShipFurnitureLoadError extends Error {
  constructor(readonly modelId: ShipFurnitureAssetId, message: string) {
    super(`Unable to load ship furniture ${modelId}: ${message}`);
  }
}

export class ShipFurnitureLibrary {
  static load(loader: ShipFurnitureModelLoader = new GltfShipFurnitureLoader()): Promise<ShipFurnitureLibrary>;
  clone(id: ShipFurnitureAssetId): Group;
  dispose(): void;
}
```

Uniformly scale each source scene from the manifest axis/length pair, center it on X/Z, set its minimum Y to 0, retain the source's local -Z front direction, enable cast/receive shadow, and validate finite non-empty bounds. Reject any resulting size outside the manifest's 0.002-unit tolerance. Library templates own geometry/material/texture resources; clones share those resources and must never dispose them.

- [ ] **Step 4: Write failing startup lifecycle tests**

Extend launch tests for three parallel assets: item models, ship furniture, and sky. Cover each single failure, simultaneous failures choosing deterministic dependency order, disposal of fulfilled siblings, no game construction after failure, and error text naming the furniture model. Extend Game tests so the shared furniture library survives phase transitions and is disposed after the active phase but before sky/renderer, exactly once.

- [ ] **Step 5: Integrate startup and anisotropy context**

Use `Promise.allSettled` in `loadGameAssets`. Construct `Game` only after all three libraries resolve. Add `maxTextureAnisotropy = Math.max(1, renderer.capabilities.getMaxAnisotropy())` to the shared phase context; test renderers may supply `1`. Preserve rollback ownership: `Game` does not dispose libraries if its constructor never accepts them, and launch disposes every fulfilled library on construction failure.

- [ ] **Step 6: Run lifecycle tests and commit**

Run:

```bash
bun run test tests/ShipFurnitureLibrary.test.ts tests/launchGame.test.ts tests/GameDirector.test.ts tests/GameLifecycle.test.ts
bun run typecheck
```

Expected: PASS with deterministic cleanup order.

```bash
git add src/world/shipFurnitureManifest.ts src/world/ShipFurnitureLibrary.ts tests/ShipFurnitureLibrary.test.ts tests/helpers/shipFurniture.ts src/app/launchGame.ts src/app/GamePhase.ts src/Game.ts tests/launchGame.test.ts tests/GameDirector.test.ts tests/GameLifecycle.test.ts
git commit -m "feat: preload shared ship furniture models"
```

### Task 6: Replace Procedural Furniture with Perimeter Model Placements and Real Surfaces

**Files:**
- Modify: `src/world/ShipLayout.ts`
- Rewrite: `src/world/ShipFurniture.ts`
- Modify: `tests/ShipLayout.test.ts`
- Modify: `tests/ShipFurniture.test.ts`

**Interfaces:**
- `createShipFurniture(materials, library, layout = SHIP_LAYOUT)` clones library models, creates simplified colliders, retains custom cargo/deck equipment, and transforms local item surfaces to ship space.
- `ShipFurnitureBuild` exposes `surfaces`, not visible support plates; it does not own library resources.

- [ ] **Step 1: Write failing furniture composition tests**

Replace mesh-part-count assertions with these behavior assertions:

1. Every non-cargo furniture placement has a root child whose `userData.furnitureId` and `userData.modelId` match layout data.
2. There is exactly one simplified collider per furniture placement.
3. No collider overlaps another, a door approach, a primary lane, or the evacuation rectangle.
4. Every surface names an existing furniture owner and transforms its local top onto that owner's world-space bounds.
5. No object name matches `anchor-support`, and no surface owner has model ID `bedBunk` or `chairDesk`.
6. Every standing point is outside inflated colliders, within interaction distance 2.2 of its surface center, and connected to start.

- [ ] **Step 2: Run tests and confirm RED**

Run: `bun run test tests/ShipFurniture.test.ts tests/ShipLayout.test.ts`

Expected: FAIL because current furniture is procedural, overlapping, and creates support plates.

- [ ] **Step 3: Author the exact perimeter placements**

Add these placements to `SHIP_LAYOUT` (all Y = 2.22):

| Zone | ID / model | X, Z | Rotation Y | Collider X,Z |
|---|---|---|---:|---|
| Cabin | `cabin-bunk-port` / `bedBunk` | `-3.05, 8.62` | `0` | `1.15,2.20` |
| Cabin | `cabin-bunk-starboard` / `bedBunk` | `3.05, 8.62` | `0` | `1.15,2.20` |
| Cabin | `cabin-desk-port` / `desk` | `-1.70, 4.10` | `0` | `1.70,0.91` |
| Cabin | `cabin-chair-port` / `chairDesk` | `-1.70, 5.08` | `3.141592653589793` | `0.56,0.52` |
| Cabin | `cabin-desk-starboard` / `desk` | `1.70, 4.10` | `0` | `1.70,0.91` |
| Cabin | `cabin-chair-starboard` / `chairDesk` | `1.70, 5.08` | `3.141592653589793` | `0.56,0.52` |
| Cabin | `cabin-shelf-forward` / `bookcaseOpen` | `0, 10.02` | `0` | `0.85,0.53` |
| Cabin | `cabin-locker-port` / `bookcaseClosedDoors` | `-2.55, 10.02` | `0` | `0.88,0.55` |
| Cabin | `cabin-locker-starboard` / `bookcaseClosedDoors` | `2.55, 10.02` | `0` | `0.88,0.55` |
| Wheelhouse | `helm-desk` / `desk` | `0, 15.30` | `0` | `1.70,0.91` |
| Wheelhouse | `helm-chair` / `chairDesk` | `0, 14.25` | `0` | `0.56,0.52` |
| Wheelhouse | `chart-table` / `table` | `2.85, 13.70` | `1.5707963267948966` | `1.13,2.12` |
| Wheelhouse | `instrument-cabinet-starboard` / `sideTableDrawers` | `3.15, 12.00` | `0` | `1.05,0.44` |
| Wheelhouse | `emergency-locker` / `bookcaseClosedDoors` | `-2.55, 15.30` | `0` | `0.88,0.55` |
| Storage | `workbench-port` / `table` | `-2.30,-11.35` | `0` | `2.12,1.13` |
| Storage | `workbench-starboard` / `table` | `2.30,-11.35` | `0` | `2.12,1.13` |
| Storage | `storage-shelf-port` / `bookcaseOpen` | `-3.52,-10.15` | `1.5707963267948966` | `0.53,0.85` |
| Storage | `storage-shelf-starboard` / `bookcaseOpen` | `3.52,-10.15` | `1.5707963267948966` | `0.53,0.85` |
| Storage | `storage-locker-aft` / `bookcaseClosedDoors` | `0,-11.70` | `0` | `0.88,0.55` |
| Cargo | four `cargoCrate` placements | `(-3.15,-2.55)`, `(3.15,-2.55)`, `(-3.15,2.25)`, `(3.15,2.25)` | `0` | `1.35,1.15` each |

Keep the non-colliding rope coils. Remove both deck vents because their current positions occupy the aft cross-lane. Move winches to X +/-2.20, Z -1.00; their inward faces remain 3.44 units apart and their Z maximum stays aft of the Z = 0.55 cross-lane. Remove any other decorative fitting that cannot satisfy the validator.

- [ ] **Step 4: Author ordinary-furniture surfaces**

Author the following exact local-space slots. The furniture-library normalization contract makes the model base Y = 0 and makes the usable front face local -Z. Instantiate the listed slots except for the explicit port-workbench override below; do not change their measurements.

| Model | Slot suffixes | Local positions | Footprint per slot | Clearance | Local standing points |
|---|---|---|---|---:|---|
| `desk` | `top-left`, `top-right` | `[-0.42,0.89,0]`, `[0.42,0.89,0]` | `0.62 x 0.60` | `0.82` | matching X at Z `-1.15` and `1.15`, plus X `-1.15` for left or `1.15` for right at Z `0` |
| `table` | `top-left`, `top-right` | `[-0.52,0.82,0]`, `[0.52,0.82,0]` | `0.80 x 0.72` | `0.82` | matching X at Z `-1.25` and `1.25` |
| port workbench | `rod-top` | `[0,0.82,0]` | `1.90 x 0.72` | `0.82` | `[0,0,-1.25]`, `[0,0,1.25]` |
| `bookcaseOpen` | `level-1/2/3/4-left/right` | X `-0.18/0.18`, Y `0.273/0.778/1.283/1.787`, Z `-0.03` | `0.30 x 0.35` | levels 1-3 `0.42`, level 4 `0.82` | matching X at Z `-0.85` |
| `bookcaseClosedDoors` | `top-left`, `top-right` | `[-0.20,1.85,0]`, `[0.20,1.85,0]` | `0.32 x 0.40` | `0.82` | matching X at Z `-0.85` |
| `sideTableDrawers` | `top-left`, `top-right` | `[-0.24,0.75,0]`, `[0.24,0.75,0]` | `0.38 x 0.32` | `0.75` | matching X at Z `-0.90` |
| `cargoCrate` | `top` | `[0,1.05,0]` | `1.05 x 0.85` | `0.95` | `[0,0,-1.15]`, `[0,0,1.15]` |

Instantiate exactly 45 regular surfaces and 8 fallback surfaces. The port workbench is the sole template exception: instantiate only `rod-top` there, not the two ordinary table slots.

- Twelve regular `foodWater` surfaces: all four cabin desk slots and all eight `cabin-shelf-forward` slots.
- Eight regular `medicalEmergency` surfaces: both helm-desk, chart-table, instrument-cabinet, and emergency-locker top slots.
- Twenty regular `toolsRepair` surfaces: two starboard-workbench table slots, sixteen storage-shelf slots, and two storage-locker top slots.
- Five regular `fishingDiving` surfaces: the port-workbench `rod-top` plus the four cargo-crate tops. Only `rod-top` fits the 1.8-unit fishing rod; the crate tops fit bait and `scubaSet`, leaving one randomized spare crate.
- Four fallback `foodWater` surfaces: both top slots on the two cabin lockers.
- Two fallback `toolsRepair` surfaces: both chart-table top slots, with distinct IDs suffixed `fallback-tools-left/right` but the same physical slots; fallback aliases are mutually exclusive with their regular surface IDs during assignment.
- Two fallback `medicalEmergency` surfaces: both storage-locker top slots, likewise mutually exclusive aliases.

The fallback aliases bring the catalog to 45 regular plus 8 fallback records without creating overlapping simultaneously usable placement volumes. Validation groups aliases by `physicalSlotId` and permits one assignment across the group.

No model-local footprint may exceed its owner's measured top. Keep surface IDs deterministic as `<furniture-id>:<surface-name>` and add `physicalSlotId` to group regular/fallback aliases. Fallback is metadata only; it must not alter the render tree.

- [ ] **Step 5: Rewrite the furniture builder**

For each placement, clone the model, apply transform, set identity metadata, and add one collider extending from deck to `deck + colliderSize.y`. Keep generated cargo crates as the only procedural furniture and attach their surfaces directly to the crate group. Transform local surface position/rotation and standing points through the furniture matrix. Delete procedural bunk/desk/chair/shelf/locker/table/workbench builders, emergency geometry, support plates, and furniture-owned material/geometry disposal.

- [ ] **Step 6: Establish GREEN and commit**

Run:

```bash
bun run test tests/ShipLayout.test.ts tests/ShipFurniture.test.ts
bun run typecheck
```

Expected: PASS with zero furniture overlaps and no support-plate mesh.

```bash
git add src/world/ShipLayout.ts src/world/ShipFurniture.ts tests/ShipLayout.test.ts tests/ShipFurniture.test.ts
git commit -m "feat: rebuild ship furniture and usable surfaces"
```

### Task 7: Place All Fourteen Items on Reachable Surfaces and Integrate the Ship

**Files:**
- Modify: `src/world/ShipItemPlacement.ts`
- Modify: `src/world/Ship.ts`
- Modify: `src/world/World.ts`
- Modify: `src/phases/ScavengePhase.ts`
- Modify: `tests/ShipItemPlacement.test.ts`
- Modify: `tests/world.test.ts`

**Interfaces:**
- Replaces free-floating `ShipItemAnchor` input with furniture-owned `ShipItemSurface` input.
- `assignShipItems(instances, surfaces, random)` preserves the returned item transform map and seeded shuffle behavior.
- `createShip(shipFurniture, maxTextureAnisotropy)` assembles the validated layout.
- `World` receives both `PropModelLibrary` and `ShipFurnitureLibrary`.

- [ ] **Step 1: Write failing surface-placement tests**

Refactor existing placement fixtures to include `furnitureId`, `standingPoints`, and `fallback`. Cover duplicate surface IDs, missing owners, overlapping sibling footprints, unsupported categories, non-positive dimensions, unreachable standing points, and an item that cannot fit.

Add representative seeded-run coverage:

```ts
for (let seed = 0; seed < 64; seed += 1) {
  const random = mulberry32(seed);
  const assignments = assignShipItems(createItemInstances(), ship.itemSurfaces, random);
  expect(assignments.size).toBe(14);
  expect(new Set([...assignments.values()].map(({ surfaceId }) => surfaceId)).size).toBe(14);
  expect(new Set([...assignments.values()].map(({ physicalSlotId }) => physicalSlotId)).size).toBe(14);
  for (const assignment of assignments.values()) {
    const surface = surfacesById.get(assignment.surfaceId)!;
    expect(surface.standingPoints.length).toBeGreaterThan(0);
    expect(surface.furnitureModelId).not.toMatch(/bedBunk|chairDesk/);
  }
}
```

Also constrain regular capacity in a fixture and prove fallback surfaces are used only after a regular-only search fails.

- [ ] **Step 2: Run placement tests and confirm RED**

Run: `bun run test tests/ShipItemPlacement.test.ts tests/world.test.ts`

Expected: FAIL on the old anchor type and `createShip()` signature.

- [ ] **Step 3: Implement owned-surface validation and assignment**

Transform item model bounds by the surface rotation and require them inside the footprint and below clearance. Filter out surfaces with no connected standing point or with a standing point farther than 2.2 from the placed item's center. Search regular surfaces first, then repeat with fallback surfaces appended. Return:

```ts
export interface ShipItemSurface {
  readonly id: string;
  readonly physicalSlotId: string;
  readonly furnitureId: string;
  readonly furnitureModelId: ShipFurnitureKind;
  readonly categories: readonly ShipItemCategory[];
  readonly position: Vector3;
  readonly rotation: Euler;
  readonly footprint: { readonly width: number; readonly depth: number };
  readonly clearanceHeight: number;
  readonly standingPoints: readonly Vector3[];
  readonly fallback: boolean;
}

export interface ShipItemTransform {
  readonly surfaceId: string;
  readonly physicalSlotId: string;
  readonly furnitureId: string;
  readonly position: Vector3;
  readonly rotation: Euler;
  readonly scale: number;
  readonly usedFallbackSurface: boolean;
}
```

Before accepting a surface in the production ship, cast a line segment from each candidate standing point at camera height to the item center and reject it if it intersects a ship/furniture collider other than the owning furniture footprint below the surface top.

- [ ] **Step 4: Integrate layout, models, materials, and disposal**

`Ship.ts` must call `validateShipLayout(SHIP_LAYOUT)` before scene assembly, create materials with the context anisotropy, create geometry from layout, create furniture with the shared library, then assign surfaces. Preserve player start `[0,3.72,7.2]`, evacuation `[5.4,3.72,-6.5]`, lifeboat transform, and navigation/fall bounds.

`World` passes the library through but does not dispose it. `ShipBuild.dispose()` disposes only ship-generated geometry, materials/textures, cargo geometry, and smoke; it must not dispose shared Kenney resources. `Game.dispose()` remains the sole owner of `ShipFurnitureLibrary.dispose()`.

- [ ] **Step 5: Add world regressions and establish GREEN**

Update `world.test.ts` to assert fourteen unique item objects, each transform matching a surface, unchanged lifeboat acceptance, unchanged save/lose/land behavior, construction rollback, and exactly-once disposal without touching the shared library. Keep existing ocean, environment, sinking-transform, and moon-texture ownership assertions.

Run:

```bash
bun run test tests/ShipItemPlacement.test.ts tests/world.test.ts tests/GameLifecycle.test.ts
bun run typecheck
```

Expected: PASS for all 64 seeded layouts and lifecycle cases.

- [ ] **Step 6: Commit the integrated scavenging ship**

```bash
git add src/world/ShipItemPlacement.ts src/world/Ship.ts src/world/World.ts src/phases/ScavengePhase.ts tests/ShipItemPlacement.test.ts tests/world.test.ts
git commit -m "feat: place scavenging items on reachable furniture"
```

### Task 8: Verify Gameplay Regressions and Perform Browser QA

**Files:**
- Modify only when a new failing test or observed visual defect requires it: files from Tasks 1-7
- Test: `tests/ScavengeSession.test.ts`
- Test: `tests/CarryController.test.ts`
- Test: `tests/GameDirector.test.ts`
- Test: `tests/sinking.test.ts`

**Interfaces:**
- Verifies the complete approved design and repository asset policy.

- [ ] **Step 1: Run the mandatory clean verification suite**

Run each command separately and record its exit status:

```bash
bun run models:check
bun run test
bun run typecheck
bun run build
```

Expected: every command exits 0; ship furniture audit prints `total: 2340 / 8000 triangles`; Vitest reports no failing tests; Vite writes `dist/`.

- [ ] **Step 2: Check runtime asset locality and floor mesh removal**

Run:

```bash
rg -n "https://kenney\.nl/media|anchor-support|floor-plank|floor-grain" src dist
```

Expected: no runtime remote asset URL and no removed support/plank/grain mesh name. Provenance page URLs may appear only in manifests, scripts, and `THIRD_PARTY_ASSETS.md`, not as loader URLs.

- [ ] **Step 3: Inspect title and active scavenging in the browser**

Start `bun run dev -- --host 127.0.0.1`. Inspect at 1280x720 and 1920x1080. Confirm the title world loads with all furniture assets, then start scavenging and walk:

1. cabin start to port exit, clockwise full loop, every room, lifeboat;
2. cabin start to starboard exit, counter-clockwise full loop, every room, lifeboat;
3. every door from both sides;
4. both sides of every furniture-access aisle and both storage approaches.

Expected: no sticking, camera-only pockets, invisible blockers, or false gaps. Bunks remain against walls, the room centers remain open, and the rail reads at waist height.

- [ ] **Step 4: Inspect materials and every randomized item**

View floors at shallow angles while moving and during sinking. Confirm there is no shimmer, coplanar seam, or grain aliasing. Confirm cabin/wheelhouse use warm wood and pale panels, cargo/lifeboat use maritime/anti-slip surfaces, and storage uses dark industrial flooring and steel walls.

The automated placement test already covers seeds 0 through 63. In the browser, restart eight times and inspect all fourteen items in every run: each rests on a plausible furniture surface, is reachable, is unobstructed from a standing point, and never appears on a bed, chair, walkway, wall, or emergency plate.

- [ ] **Step 5: Verify unchanged survival behavior**

Pick up, drop, throw, lose, and save representative light/heavy items; evacuate before and after timer expiry; restart from both phases. Confirm the same saved-item list reaches survival, the lifeboat behavior is unchanged, and the survival phase renders correctly at both resolutions.

- [ ] **Step 6: Fix only evidence-backed defects, then rerun verification**

For each browser defect, first add a failing layout, geometry, surface, or lifecycle test. Make the smallest fix and repeat Steps 1-5. Do not tune coordinates without extending the matching invariant test.

- [ ] **Step 7: Review the final diff and request code review**

Run:

```bash
git status --short
git diff --check
git diff --stat
git diff --cached --name-only
```

Expected: no whitespace errors, no downloaded archives or extracted source trees, no unrelated file staged or reverted, and only the seven approved ship GLBs under `src/assets/models/ship/`.

Invoke `superpowers:requesting-code-review`, address only verified findings, then invoke `superpowers:verification-before-completion` and repeat the four mandatory commands before claiming completion.

## Plan Self-Review

- [x] Every acceptance criterion in the approved design maps to a task and an automated or browser verification step.
- [x] Every new asset has a pinned official URL, version, archive hash, source entry, triangle count, license, local runtime path, and download date.
- [x] No step contains unresolved shorthand or an implementation placeholder.
- [x] Type names are consistent across `ShipLayout`, `ShipFurniture`, `ShipItemPlacement`, `Ship`, `World`, and startup.
- [x] Resource ownership is singular: library owns Kenney templates; ship owns generated geometry/materials/textures; Game owns shared-library disposal.
- [x] The plan preserves unrelated dirty-worktree changes and stages task files explicitly.

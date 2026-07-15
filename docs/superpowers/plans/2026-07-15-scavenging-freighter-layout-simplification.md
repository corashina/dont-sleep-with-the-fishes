# Scavenging Freighter Layout Simplification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every room corner solid, keep sparse room-specific furniture and all fourteen supplies clear of walls, and expose fully walkable bow and stern decks.

**Architecture:** `ShipLayout.ts` becomes the only source of structural, furniture, item-surface, and navigation coordinates. `ShipGeometry` and `ShipFurniture` consume that contract, while layout and placement validators reject open corners, wrong-room furniture, blocked clear areas, unsafe surfaces, and unreachable bow/stern targets before `World` creates collectible models.

**Tech Stack:** TypeScript, Three.js, Vite, Vitest, Bun, local Kenney GLB assets

## Global Constraints

- Preserve the five gameplay zones, fourteen collectible supplies, lifeboat position, two-minute timer, item rules, scoring, sinking sequence, restart flow, and survival handoff.
- Make both rounded ends reachable outdoor deck areas up to their railings.
- Require at least 2.0 units between collider faces for primary lanes, 1.4 units for secondary access, 1.8 units for doors, and 3.0 units at the lifeboat opening.
- Keep the player layout radius at `0.35` units.
- Keep at most four large fixture groups in each furnished zone and zero fixtures in the lifeboat station.
- Beds belong only in the crew cabin; helm/chart furniture belongs only in the wheelhouse; shelves/workbenches belong only in storage; cargo furniture is limited to four perimeter groups.
- Keep all collectible surfaces on real furniture; never create floor anchors, wall anchors, bed anchors, chair anchors, or visible fallback plates.
- Use the existing committed Kenney Furniture Kit GLBs. Do not download another pack or introduce another asset source.
- Preserve existing user changes in the dirty worktree and stage only files belonging to the current task.

---

## File Structure

- `src/world/ShipLayout.ts` — exact room polygons, room policies, doors, lanes, end-deck targets, sparse furniture, local item surfaces, and validation.
- `src/world/ShipGeometry.ts` — floors, closed wall spans, solid corner caps, compact stern machinery island, rails, and matching shell colliders.
- `src/world/ShipFurniture.ts` — clones the existing furniture library, builds the two procedural cargo forms, emits one collider per fixture, and transforms item surfaces.
- `src/world/ShipItemPlacement.ts` — validates furniture-owned surfaces and assigns all fourteen item instances without shared physical slots or structural intersections.
- `src/world/Ship.ts` — validates and assembles geometry, furniture, colliders, surfaces, smoke, and expanded end-deck navigation bounds.
- `src/world/World.ts` — passes the shared furniture library into the ship and creates item models from validated surface transforms.
- `src/app/GamePhase.ts` and `src/phases/ScavengePhase.ts` — make the already-preloaded furniture library and anisotropy required scavenging dependencies.
- `tests/ShipLayout.test.ts` — layout policy, fixture count, clear-area, reachability, and wall-safety regressions.
- `tests/ShipGeometry.test.ts` — visual/collision corner joins, shortened wheelhouse, end decks, compact machinery, and rail regressions.
- `tests/ShipFurniture.test.ts` — model composition, sparse fixture counts, collider ownership, transformed surfaces, and removal of clutter/support plates.
- `tests/ShipItemPlacement.test.ts` — owned-surface contracts, fit checks, unique physical slots, fallback ordering, and seeded fourteen-item placement.
- `tests/world.test.ts` and `tests/GameLifecycle.test.ts` — integration, rollback, resource ownership, full end navigation, and unchanged gameplay markers.

---

### Task 1: Author the Sparse Unified Layout and Its Validator

**Files:**
- Modify: `src/world/ShipLayout.ts`
- Modify: `tests/ShipLayout.test.ts`

**Interfaces:**
- Consumes: `ShipItemCategory` from `ShipItemPlacement` and the existing `PLAYER_LAYOUT_RADIUS = 0.35` contract.
- Produces: `SHIP_LAYOUT`, `validateShipLayout(layout)`, `analyzeShipNavigation(layout)`, `furnitureRect(spec)`, and the new `ShipZoneFurniturePolicy` data used by geometry and furniture tasks.

- [ ] **Step 1: Write failing tests for room policy, sparse fixtures, and complete end access**

Replace assumptions that `SHIP_LAYOUT.furniture` is empty with exact behavior tests:

```ts
import { describe, expect, it } from 'vitest';
import {
  SHIP_LAYOUT,
  analyzeShipNavigation,
  furnitureRect,
  validateShipLayout,
} from '../src/world/ShipLayout';

describe('simplified scavenging ship layout', () => {
  it('keeps sparse room-specific furniture and clear room centers', () => {
    const expectedCounts = {
      crewCabin: 4,
      wheelhouse: 4,
      cargoDeck: 4,
      storageWorkroom: 4,
      lifeboatStation: 0,
    } as const;

    for (const zone of SHIP_LAYOUT.zones) {
      const fixtures = SHIP_LAYOUT.furniture.filter(({ zoneId }) => zoneId === zone.id);
      expect(fixtures).toHaveLength(expectedCounts[zone.id]);
      expect(fixtures.length).toBeLessThanOrEqual(zone.furniturePolicy.maxFixtures);
      if (zone.furniturePolicy.clearCenter) {
        for (const fixture of fixtures) {
          expect(rectanglesOverlap(
            furnitureRect(fixture),
            zone.furniturePolicy.clearCenter,
          ), fixture.id).toBe(false);
        }
      }
    }
  });

  it('assigns furniture only to its approved room role', () => {
    expect(SHIP_LAYOUT.furniture.filter(({ modelId }) => modelId === 'bedBunk')
      .every(({ zoneId }) => zoneId === 'crewCabin')).toBe(true);
    expect(SHIP_LAYOUT.furniture.filter(({ id }) => /helm|chart|instrument/.test(id))
      .every(({ zoneId }) => zoneId === 'wheelhouse')).toBe(true);
    expect(SHIP_LAYOUT.furniture.filter(({ id }) => /workbench|storage-shelf/.test(id))
      .every(({ zoneId }) => zoneId === 'storageWorkroom')).toBe(true);
  });

  it('reaches all bow and stern targets from both side routes', () => {
    const endTargets = SHIP_LAYOUT.targets.filter(({ kind }) => kind === 'endDeck');
    expect(endTargets.map(({ id }) => id).sort()).toEqual([
      'bow-center', 'bow-port', 'bow-starboard',
      'stern-center', 'stern-port', 'stern-starboard',
    ]);
    expect(analyzeShipNavigation(SHIP_LAYOUT).unreachableTargetIds).toEqual([]);
  });

  it('rejects wrong-room furniture, fixture overflow, and clear-center overlap', () => {
    const bunk = SHIP_LAYOUT.furniture.find(({ modelId }) => modelId === 'bedBunk')!;
    const wrongRoom = {
      ...SHIP_LAYOUT,
      furniture: SHIP_LAYOUT.furniture.map((fixture) => fixture.id === bunk.id
        ? { ...fixture, zoneId: 'wheelhouse' as const }
        : fixture),
    };
    expect(() => validateShipLayout(wrongRoom)).toThrow(/wrong room.*bedBunk/i);

    const duplicate = { ...bunk, id: 'crew-bunk-overflow', position: [0, 2.22, 6] as const };
    expect(() => validateShipLayout({
      ...SHIP_LAYOUT,
      furniture: [...SHIP_LAYOUT.furniture, duplicate],
    })).toThrow(/crewCabin.*maximum 4/i);

    const blockedCenter = {
      ...SHIP_LAYOUT,
      furniture: SHIP_LAYOUT.furniture.map((fixture) => fixture.id === 'cabin-desk-aft'
        ? { ...fixture, position: [0, 2.22, 6] as const }
        : fixture),
    };
    expect(() => validateShipLayout(blockedCenter)).toThrow(/clear center/i);
  });
});
```

Add a local `rectanglesOverlap` helper in the test with the same strict positive-area semantics as production.

- [ ] **Step 2: Run the layout test and verify RED**

Run: `bun run test tests/ShipLayout.test.ts`

Expected: FAIL because the layout has no furniture policy, no `endDeck` target kind, no exported `furnitureRect`, and no approved fixture data.

- [ ] **Step 3: Extend the layout contract**

Add these exact contracts and export `furnitureRect`:

```ts
export type ShipFurnitureKind = ShipFurnitureAssetId | 'cargoCrate' | 'cargoRack';

export interface ShipZoneFurniturePolicy {
  readonly maxFixtures: number;
  readonly allowedModelIds: readonly ShipFurnitureKind[];
  readonly clearCenter?: Rect2;
}

export interface ShipZoneSpec {
  readonly id: ShipZoneId;
  readonly polygon: readonly (readonly [number, number])[];
  readonly bounds: Rect2;
  readonly excludedZoneIds?: readonly ShipZoneId[];
  readonly enclosed: boolean;
  readonly furniturePolicy: ShipZoneFurniturePolicy;
}

export interface ShipNavigationTargetSpec {
  readonly id: string;
  readonly position: readonly [number, number];
  readonly kind: 'start' | 'door' | 'loop' | 'surface' | 'evacuation' | 'endDeck';
}

export function furnitureRect(spec: ShipFurniturePlacementSpec): Rect2 {
  const quarterTurn = spec.rotationY === PI_OVER_TWO;
  const scaledWidth = spec.colliderSize[0] * spec.scale[0];
  const scaledDepth = spec.colliderSize[2] * spec.scale[2];
  const width = quarterTurn ? scaledDepth : scaledWidth;
  const depth = quarterTurn ? scaledWidth : scaledDepth;
  return rect(
    spec.position[0] - width / 2,
    spec.position[0] + width / 2,
    spec.position[2] - depth / 2,
    spec.position[2] + depth / 2,
  );
}
```

Use these exact room bounds and policies:

| Zone | Bounds | Enclosed | Maximum | Allowed models | Clear center |
|---|---|---:|---:|---|---|
| Crew cabin | `[-3.7,3.7] x [3.5,9.8]` | yes | 4 | `bedBunk`, `desk`, `bookcaseOpen` | `[-1.35,1.35] x [4.75,8.35]` |
| Wheelhouse | `[-3.7,3.7] x [10.8,13.8]` | yes | 4 | `desk`, `table`, `sideTableDrawers` | `[-1.05,1.05] x [11.0,12.25]` |
| Cargo deck | existing rounded hull polygon | no | 4 | `cargoCrate`, `cargoRack` | `[-1,1] x [-6.5,3.5]` |
| Storage/workroom | `[-3.8,3.8] x [-10.4,-6.5]` | yes | 4 | `table`, `bookcaseOpen` | `[-1.0,1.0] x [-9.5,-7.15]` |
| Lifeboat station | existing bounds | no | 0 | none | the existing evacuation rectangle |

Move the wheelhouse aft door to `[0,10.8]`, its port door to `[-3.7,12.1]`, and both storage side doors to Z `-7.75`. Keep all door widths unchanged.

- [ ] **Step 4: Author the exact sixteen sparse furniture groups**

Use scale `[1,1,1]`, Y `2.22`, and these exact transforms and colliders:

| ID / model | Zone | X,Z | Rotation Y | Collider X,Y,Z |
|---|---|---|---:|---|
| `cabin-bunk-port` / `bedBunk` | crew | `-3.0,7.8` | `0` | `1.147,1.708,2.2` |
| `cabin-bunk-starboard` / `bedBunk` | crew | `3.0,7.8` | `0` | `1.147,1.708,2.2` |
| `cabin-desk-aft` / `desk` | crew | `-2.3,4.05` | `0` | `1.7,0.89,0.908` |
| `cabin-bookcase-forward` / `bookcaseOpen` | crew | `0,9.48` | `0` | `0.841,1.85,0.526` |
| `helm-desk-forward` / `desk` | wheelhouse | `0,13.25` | `0` | `1.7,0.89,0.908` |
| `chart-table-port` / `table` | wheelhouse | `-3.08,12.3` | `PI_OVER_TWO` | `2.112,0.82,1.123` |
| `instrument-cabinet-starboard-aft` / `sideTableDrawers` | wheelhouse | `3.42,11.5` | `PI_OVER_TWO` | `1.043,0.75,0.434` |
| `instrument-cabinet-starboard-forward` / `sideTableDrawers` | wheelhouse | `3.42,12.8` | `PI_OVER_TWO` | `1.043,0.75,0.434` |
| `workbench-port` / `table` | storage | `-3.18,-8.25` | `PI_OVER_TWO` | `2.112,0.82,1.123` |
| `workbench-starboard` / `table` | storage | `3.18,-8.25` | `PI_OVER_TWO` | `2.112,0.82,1.123` |
| `storage-shelf-port` / `bookcaseOpen` | storage | `-1.8,-10.08` | `PI` | `0.841,1.85,0.526` |
| `storage-shelf-starboard` / `bookcaseOpen` | storage | `1.8,-10.08` | `PI` | `0.841,1.85,0.526` |
| `cargo-rod-rack-forward-port` / `cargoRack` | cargo | `-2.6,2.8` | `0` | `2.1,0.55,0.75` |
| `cargo-crate-forward-starboard` / `cargoCrate` | cargo | `2.6,2.8` | `0` | `1.35,1.05,1.15` |
| `cargo-crate-aft-port` / `cargoCrate` | cargo | `-2.6,-5.8` | `0` | `1.35,1.05,1.15` |
| `cargo-crate-aft-starboard` / `cargoCrate` | cargo | `2.6,-5.8` | `0` | `1.35,1.05,1.15` |

Give both bunks empty `surfaces` arrays. Author surfaces on the remaining fixtures with deterministic IDs `<furniture-id>:<slot>`:

| Owner model | Slots | Local position(s) | Footprint | Clearance | Categories |
|---|---|---|---|---:|---|
| cabin desk | `left`, `right` | `[-0.43,0.89,0]`, `[0.43,0.89,0]` | `0.75 x 0.60` | `0.82` | `foodWater` |
| cabin bookcase | `level-1..4` | `[0,0.273,-0.03]`, `[0,0.778,-0.03]`, `[0,1.283,-0.03]`, `[0,1.787,-0.03]` | `0.70 x 0.35` | `0.43,0.43,0.43,0.82` | `foodWater` |
| helm desk | `left`, `right` | same desk positions | `0.75 x 0.60` | `0.82` | `medicalEmergency` |
| chart table | `left`, `right` | `[-0.52,0.82,0]`, `[0.52,0.82,0]` | `0.80 x 0.72` | `0.82` | `medicalEmergency` |
| each instrument cabinet | `top` | `[0,0.75,0]` | `0.85 x 0.32` | `0.75` | `medicalEmergency` |
| each workbench | `left`, `right` | table positions above | `0.80 x 0.72` | `0.82` | `toolsRepair` |
| each storage bookcase | `level-1..4` | bookcase positions above | `0.70 x 0.35` | same as above | `toolsRepair` |
| cargo rack | `rod` | `[0,0.55,0]`, local Y rotation `PI_OVER_TWO` | `1.90 x 0.50` | `0.82` | `fishingDiving` |
| each cargo crate | `top` | `[0,1.05,0]` | `1.05 x 0.85` | `0.95` | `fishingDiving` |

For desk/table/rack surfaces, author standing points on both open sides at 1.15–1.25 units from the owner. For bookcases and cabinets, author one standing point 0.85–0.9 units in front. Use `physicalSlotId` equal to the surface ID and `fallback: false`; this layout has sufficient ordinary capacity and needs no emergency aliases.

- [ ] **Step 5: Add end lanes, end targets, and structural policy validation**

Set `machineryClosure` to the compact central island `[-2,2] x [-14.4,-11.4]`. Replace the two long exterior lane records with connected segments whose narrow dimension is at least 2.0, and add bow/stern cross lanes:

```ts
const circulationLanes: readonly ShipLaneSpec[] = [
  { id: 'port-exterior-main', className: 'primary', clearWidth: 2.075, bounds: rect(-5.875, -3.8, -13.2, 13.2) },
  { id: 'starboard-exterior-main', className: 'primary', clearWidth: 2.075, bounds: rect(3.8, 5.875, -13.2, 13.2) },
  { id: 'cargo-longitudinal', className: 'primary', clearWidth: 2, bounds: rect(-1, 1, -6.5, 3.5) },
  { id: 'cargo-cross-center', className: 'primary', clearWidth: 2, bounds: rect(-3.8, 3.8, -1, 1) },
];

const endTargets: readonly ShipNavigationTargetSpec[] = [
  { id: 'bow-port', position: [-4.1, 14.25], kind: 'endDeck' },
  { id: 'bow-center', position: [0, 16], kind: 'endDeck' },
  { id: 'bow-starboard', position: [4.1, 14.25], kind: 'endDeck' },
  { id: 'stern-port', position: [-4.1, -14.25], kind: 'endDeck' },
  { id: 'stern-center', position: [0, -16], kind: 'endDeck' },
  { id: 'stern-starboard', position: [4.1, -14.25], kind: 'endDeck' },
];

const endLanes: readonly ShipLaneSpec[] = [
  { id: 'bow-port-approach', className: 'secondary', clearWidth: 2, bounds: rect(-5, -3, 13.2, 15.2) },
  { id: 'bow-cross', className: 'primary', clearWidth: 2, bounds: rect(-3, 3, 14.2, 16.2) },
  { id: 'bow-starboard-approach', className: 'secondary', clearWidth: 2, bounds: rect(3, 5, 13.2, 15.2) },
  { id: 'stern-port-approach', className: 'primary', clearWidth: 2, bounds: rect(-5, -3, -15.2, -13.2) },
  { id: 'stern-cross', className: 'primary', clearWidth: 2, bounds: rect(-3, 3, -16.2, -14.4) },
  { id: 'stern-starboard-approach', className: 'primary', clearWidth: 2, bounds: rect(3, 5, -15.2, -13.2) },
];
```

Before flood fill, mark every grid cell outside the cargo-deck hull polygon as blocked; use a standard ray-crossing `pointInPolygon([x,z], polygon)` helper so navigation cannot route through the water around rounded rails. Extend `validateShipLayout` to enforce, in order: allowed model for owning zone; maximum fixture count; footprint inside the owning zone/hull polygon; at least `0.05` units between furniture backs and enclosed wall centerlines; no clear-center, door-approach, lane, furniture, machinery, or evacuation overlap; surface footprint inside its owner; surface safe volume at least `0.1` from walls; and connectivity to every derived standing/end target. Include the fixture ID and violated zone/region ID in every error.

- [ ] **Step 6: Establish GREEN and commit the layout contract**

Run:

```text
bun run test tests/ShipLayout.test.ts
bun run typecheck
```

Expected: both commands exit `0`; layout analysis reports no unreachable targets and exact fixture counts `4/4/4/4/0`.

```text
git add -- src/world/ShipLayout.ts tests/ShipLayout.test.ts
git commit -m "feat: simplify freighter layout contract"
```

---

### Task 2: Seal Room Corners and Open the Bow and Stern Geometry

**Files:**
- Modify: `src/world/ShipGeometry.ts`
- Modify: `tests/ShipGeometry.test.ts`

**Interfaces:**
- Consumes: enclosed zone polygons, door specs, `machineryClosure`, rail data, and `FREIGHTER_DIMENSIONS` from Task 1.
- Produces: `createShipGeometry(materials, layout)` with matching visible/collision corner joins, one compact machinery island collider, five non-overlapping floor meshes, and unchanged disposal ownership.

- [ ] **Step 1: Write failing corner and end-deck geometry tests**

Add these assertions to `tests/ShipGeometry.test.ts`:

```ts
it('seals every enclosed-room corner visually and physically', () => {
  const materials = createShipMaterials();
  const build = createShipGeometry(materials);
  const enclosed = SHIP_LAYOUT.zones.filter(({ enclosed }) => enclosed);

  for (const zone of enclosed) {
    zone.polygon.forEach(([x, z], index) => {
      const name = `${zone.id}-corner-${index}`;
      const cap = build.root.getObjectByName(name);
      expect(cap, name).toBeInstanceOf(Mesh);
      expect(new Box3().setFromObject(cap!).containsPoint(
        new Vector3(x, FREIGHTER_DIMENSIONS.deckY + 1.5, z),
      ), name).toBe(true);
      expect(build.shellColliders.some((box) =>
        x >= box.minX && x <= box.maxX
        && z >= box.minZ && z <= box.maxZ
        && FREIGHTER_DIMENSIONS.deckY + 1.5 >= box.minY
        && FREIGHTER_DIMENSIONS.deckY + 1.5 <= box.maxY), name).toBe(true);
    });
  }

  build.disposeGeometry();
  materials.dispose();
});

it('opens finished bow and stern aprons around one compact machinery island', () => {
  const materials = createShipMaterials();
  const build = createShipGeometry(materials);
  expect(build.root.getObjectByName('machinery-island')).toBeInstanceOf(Mesh);
  expect(build.root.getObjectByName('machinery-closure-port')).toBeUndefined();
  expect(build.root.getObjectByName('machinery-closure-center')).toBeUndefined();
  expect(build.root.getObjectByName('machinery-closure-starboard')).toBeUndefined();

  for (const target of SHIP_LAYOUT.targets.filter(({ kind }) => kind === 'endDeck')) {
    const point = new Vector3(target.position[0], FREIGHTER_DIMENSIONS.deckY, target.position[1]);
    const floor = build.root.children.find((object) =>
      object.name.startsWith('floor-') && new Box3().setFromObject(object).containsPoint(point));
    expect(floor, target.id).toBeDefined();
    expect(build.shellColliders.some((box) =>
      point.x >= box.minX && point.x <= box.maxX
      && point.z >= box.minZ && point.z <= box.maxZ
      && point.y >= box.minY && point.y <= box.maxY), target.id).toBe(false);
  }

  build.disposeGeometry();
  materials.dispose();
});
```

- [ ] **Step 2: Run the geometry test and verify RED**

Run: `bun run test tests/ShipGeometry.test.ts`

Expected: FAIL because corner-cap objects and the compact machinery island do not exist, while the three broad closure walls still exist.

- [ ] **Step 3: Build one visual and collision cap at every enclosed corner**

Add a focused helper after wall construction:

```ts
function addRoomCornerCaps(
  root: Group,
  colliders: CollisionBox[],
  materials: ShipMaterials,
  layout: ShipLayoutSpec,
  geometry: BoxGeometry,
): void {
  const capSize = 0.32;
  const centerY = FREIGHTER_DIMENSIONS.deckY + WALL_HEIGHT / 2;
  layout.zones.filter(({ enclosed }) => enclosed).forEach((zone) => {
    zone.polygon.forEach(([x, z], index) => {
      addBlock(root, geometry, {
        name: `${zone.id}-corner-${index}`,
        size: [capSize, WALL_HEIGHT, capSize],
        position: [x, centerY, z],
        material: zone.id === 'storageWorkroom'
          ? materials.paintedSteel
          : materials.paintedPanel,
      });
      colliders.push({
        minX: x - capSize / 2,
        maxX: x + capSize / 2,
        minY: FREIGHTER_DIMENSIONS.deckY,
        maxY: FREIGHTER_DIMENSIONS.deckY + WALL_HEIGHT,
        minZ: z - capSize / 2,
        maxZ: z + capSize / 2,
      });
    });
  });
}
```

Call it immediately after `addWallSegments`. Keep the cap footprint large enough to overlap both 0.2-unit wall spans, so no diagonal line-of-sight or collision crack remains.

- [ ] **Step 4: Replace the three machinery closures with one compact island**

Delete the three `machinery-closure-*` blocks. Build a low rectangular base from `layout.machineryClosure`, keep both existing smokestacks centered on it, and emit exactly one collider:

```ts
const closure = layout.machineryClosure;
const islandWidth = closure.maxX - closure.minX;
const islandDepth = closure.maxZ - closure.minZ;
const islandCenterX = (closure.minX + closure.maxX) / 2;
const islandCenterZ = (closure.minZ + closure.maxZ) / 2;
addBlock(root, boxGeometry, {
  name: 'machinery-island',
  size: [islandWidth, 1.15, islandDepth],
  position: [islandCenterX, FREIGHTER_DIMENSIONS.deckY + 0.575, islandCenterZ],
  material: materials.paintedSteel,
});
shellColliders.push({
  minX: closure.minX,
  maxX: closure.maxX,
  minY: FREIGHTER_DIMENSIONS.deckY,
  maxY: FREIGHTER_DIMENSIONS.deckY + 2.4,
  minZ: closure.minZ,
  maxZ: closure.maxZ,
});
```

Remove decorative vents and weathering meshes that sit in any declared lane or end apron. Keep the alarm, stacks, hull weathering, and rail-opening cue.

- [ ] **Step 5: Derive walls and floors from the shortened room polygons**

Update wall-segment construction to read each enclosed zone polygon/bounds and current doors instead of fixed Z constants. Keep the existing cargo-deck polygon subtraction so shrinking the wheelhouse to Z `13.8` and moving storage to Z `-10.4` automatically exposes finished deck floor at both ends. Preserve exactly five non-overlapping `floor-*` meshes and all current material ownership.

- [ ] **Step 6: Establish GREEN and commit structural geometry**

Run:

```text
bun run test tests/ShipGeometry.test.ts tests/ShipLayout.test.ts tests/collisions.test.ts
bun run typecheck
```

Expected: all commands exit `0`; every room has four cap meshes with matching colliders, all six end targets stand on finished deck, and only `machinery-island` occupies the stern apron.

```text
git add -- src/world/ShipGeometry.ts tests/ShipGeometry.test.ts
git commit -m "feat: seal rooms and open freighter ends"
```

---

### Task 3: Replace Procedural Clutter with Layout-Owned Furniture

**Files:**
- Rewrite: `src/world/ShipFurniture.ts`
- Modify: `src/world/ShipItemPlacement.ts` (add the shared surface record only)
- Modify: `tests/ShipFurniture.test.ts`
- Use unchanged: `src/world/ShipFurnitureLibrary.ts`
- Use unchanged: `src/world/shipFurnitureManifest.ts`

**Interfaces:**
- Consumes: `ShipFurnitureLibrary`, `ShipMaterials`, and `SHIP_LAYOUT.furniture` from Tasks 1–2.
- Produces: `createShipFurniture(materials, library, layout = SHIP_LAYOUT): ShipFurnitureBuild`, where the build exposes `root`, one collider per fixture, `colliderByFurnitureId`, transformed `surfaces`, and idempotent disposal of procedural cargo geometry only.

- [ ] **Step 1: Replace old part-count tests with sparse composition tests**

Write tests that use `createTestShipFurniture()` and assert the new public contract:

```ts
it('builds only the sixteen approved layout fixtures', () => {
  const materials = createShipMaterials();
  const library = createTestShipFurniture();
  const build = createShipFurniture(materials, library);

  expect(build.colliders).toHaveLength(16);
  expect(build.colliderByFurnitureId.size).toBe(16);
  for (const fixture of SHIP_LAYOUT.furniture) {
    const object = build.root.getObjectByName(`ship-fixture:${fixture.id}`);
    expect(object, fixture.id).toBeDefined();
    expect(object!.userData).toMatchObject({
      furnitureId: fixture.id,
      modelId: fixture.modelId,
      zoneId: fixture.zoneId,
    });
  }
  expect(build.root.getObjectByName('ship-fixture:lifeboatStation')).toBeUndefined();
  build.disposeGeometry();
  materials.dispose();
  library.dispose();
});

it('contains no legacy clutter or detached supports', () => {
  const materials = createShipMaterials();
  const library = createTestShipFurniture();
  const build = createShipFurniture(materials, library);
  const names: string[] = [];
  build.root.traverse(({ name }) => names.push(name));
  expect(names.filter((name) => /anchor-support|mug|dish|hand-tool|machine-part|deck-vent|rope-coil|winch/i.test(name)))
    .toEqual([]);
  expect(build.surfaces.every(({ furnitureModelId }) =>
    furnitureModelId !== 'bedBunk' && furnitureModelId !== 'chairDesk')).toBe(true);
  build.disposeGeometry();
  materials.dispose();
  library.dispose();
});
```

- [ ] **Step 2: Run furniture tests and verify RED**

Run: `bun run test tests/ShipFurniture.test.ts`

Expected: FAIL because `createShipFurniture` does not accept the shared model library and still creates independent procedural furniture, decorations, anchors, and support plates.

- [ ] **Step 3: Define the furniture build and transformed surface contracts**

Use these exact public types:

```ts
export interface ShipFurnitureCollider extends CollisionBox {
  readonly furnitureId: string;
  readonly furnitureModelId: ShipFurnitureKind;
}

export interface ShipFurnitureBuild {
  readonly root: Group;
  readonly colliders: ShipFurnitureCollider[];
  readonly colliderByFurnitureId: ReadonlyMap<string, ShipFurnitureCollider>;
  readonly surfaces: ShipItemSurface[];
  disposeGeometry(): void;
}
```

Add `ShipItemSurface` to `ShipItemPlacement.ts` in this task and import it as a type in `ShipFurniture.ts`. The transformed record must include `id`, `physicalSlotId`, `furnitureId`, `furnitureModelId`, categories, world/ship-local position, Euler rotation, footprint, clearance, transformed standing points, and `fallback`.

- [ ] **Step 4: Instantiate only layout-owned models and two cargo forms**

Implement the builder around one loop:

```ts
export function createShipFurniture(
  materials: ShipMaterials,
  library: ShipFurnitureLibrary,
  layout: ShipLayoutSpec = SHIP_LAYOUT,
): ShipFurnitureBuild {
  const root = new Group();
  root.name = 'ship-furniture';
  const colliders: ShipFurnitureCollider[] = [];
  const colliderByFurnitureId = new Map<string, ShipFurnitureCollider>();
  const surfaces: ShipItemSurface[] = [];
  const ownedCargoGeometries = new Set<BufferGeometry>();

  for (const spec of layout.furniture) {
    const fixture = spec.modelId === 'cargoCrate'
      ? createCargoCrate(spec, materials, ownedCargoGeometries)
      : spec.modelId === 'cargoRack'
        ? createCargoRack(spec, materials, ownedCargoGeometries)
        : library.clone(spec.modelId);
    fixture.name = `ship-fixture:${spec.id}`;
    fixture.position.set(...spec.position);
    fixture.rotation.y = spec.rotationY;
    fixture.scale.set(...spec.scale);
    fixture.userData.furnitureId = spec.id;
    fixture.userData.modelId = spec.modelId;
    fixture.userData.zoneId = spec.zoneId;
    root.add(fixture);

    const collider = colliderFromPlacement(spec);
    colliders.push(collider);
    colliderByFurnitureId.set(spec.id, collider);
    surfaces.push(...spec.surfaces.map((surface) => transformSurface(spec, surface)));
  }

  let disposed = false;
  return {
    root,
    colliders,
    colliderByFurnitureId,
    surfaces,
    disposeGeometry(): void {
      if (disposed) return;
      disposed = true;
      ownedCargoGeometries.forEach((geometry) => geometry.dispose());
    },
  };
}
```

`createCargoCrate` builds one box body and simple crossed bands within the declared footprint. `createCargoRack` builds one low rectangular rack top plus two legs within `[2.1,0.55,0.75]`. Add all generated geometries to `ownedCargoGeometries`; do not dispose model-library geometry or caller-owned materials.

`colliderFromPlacement` must rotate quarter-turn footprints exactly as `furnitureRect` does. `transformSurface` must apply the owner's scale, Y rotation, and translation to local positions and standing points and add the owner rotation to `localRotation.y`.

- [ ] **Step 5: Delete all legacy independent scene dressing**

Remove the procedural bunk, desk, chair, shelf, locker, table, workbench, equipment-rack, free crate-position, anchor/support, decorative chart, mug/dish, hand-tool, machine-part, rope-coil, vent, and winch arrays/builders. After the rewrite, no furniture or item coordinate may exist outside `ShipLayout.ts`.

- [ ] **Step 6: Establish GREEN and commit furniture composition**

Run:

```text
bun run test tests/ShipFurniture.test.ts tests/ShipLayout.test.ts tests/ShipFurnitureLibrary.test.ts
bun run typecheck
```

Expected: all commands exit `0`; exactly sixteen fixture colliders and no legacy clutter/support names are present; shared model resources are not disposed by a ship build.

```text
git add -- src/world/ShipFurniture.ts src/world/ShipItemPlacement.ts tests/ShipFurniture.test.ts
git commit -m "feat: build sparse layout-owned ship furniture"
```

---

### Task 4: Validate Wall-Safe Surfaces and Integrate All Fourteen Items

**Files:**
- Modify: `src/world/ShipItemPlacement.ts`
- Modify: `src/world/Ship.ts`
- Modify: `src/world/World.ts`
- Modify: `src/app/GamePhase.ts`
- Modify: `src/phases/ScavengePhase.ts`
- Modify: `tests/ShipItemPlacement.test.ts`
- Modify: `tests/world.test.ts`
- Modify: `tests/GameLifecycle.test.ts`

**Interfaces:**
- Consumes: transformed furniture surfaces/colliders from Task 3, shell colliders from Task 2, `PropModelLibrary`, and the already-preloaded `ShipFurnitureLibrary`.
- Produces: `assignShipItems(instances, surfaces, random)`, `validateShipItemSurfaces(surfaces, shellColliders, furnitureColliders)`, and `createShip(shipFurniture, maxTextureAnisotropy)`.

- [ ] **Step 1: Write failing owned-surface and seeded-placement tests**

Refactor anchor fixtures to `ShipItemSurface` and add production-layout coverage:

```ts
for (let seed = 0; seed < 64; seed += 1) {
  const ship = createShip(testFurniture, 1);
  const assignments = assignShipItems(
    createItemInstances(),
    ship.itemSurfaces,
    mulberry32(seed),
  );
  expect(assignments).toHaveLength(14);
  expect(new Set(assignments.map(({ surfaceId }) => surfaceId)).size).toBe(14);
  expect(new Set(assignments.map(({ physicalSlotId }) => physicalSlotId)).size).toBe(14);
  expect(assignments.every(({ furnitureModelId }) =>
    furnitureModelId !== 'bedBunk' && furnitureModelId !== 'chairDesk')).toBe(true);
  ship.dispose();
}
```

Add focused rejection tests:

```ts
expect(() => validateShipItemSurfaces(
  [{ ...surface, furnitureId: 'missing-owner' }],
  shellColliders,
  colliderByFurnitureId,
)).toThrow(/missing-owner/i);

expect(() => validateShipItemSurfaces(
  [{ ...surface, position: new Vector3(3.66, surface.position.y, surface.position.z) }],
  shellColliders,
  colliderByFurnitureId,
)).toThrow(/wall clearance.*0.1/i);
```

Update `world.test.ts` to assert that every item object's `userData.shipSurfaceId` and `userData.shipFurnitureId` name a surface/owner exposed by `ShipBuild`, and that all six end targets fall inside the expanded safe navigation Z bounds.

- [ ] **Step 2: Run placement and integration tests and verify RED**

Run:

```text
bun run test tests/ShipItemPlacement.test.ts tests/world.test.ts tests/GameLifecycle.test.ts
```

Expected: FAIL because production still exposes free-floating anchors, `World` does not pass the furniture library, and navigation safe bounds stop at Z `15.2/-16`.

- [ ] **Step 3: Complete the furniture-owned placement types**

Use these exact records, adding `ShipItemSurface` during Task 3 and `ShipItemTransform` here. Replace every remaining `ShipItemAnchor` reference with `ShipItemSurface`:

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
  readonly instanceId: ItemInstanceId;
  readonly surfaceId: string;
  readonly physicalSlotId: string;
  readonly furnitureId: string;
  readonly furnitureModelId: ShipFurnitureKind;
  readonly position: Vector3;
  readonly rotation: Euler;
  readonly scale: number;
  readonly usedFallbackSurface: boolean;
}
```

Keep the existing conservative oriented model-bound math and backtracking. Validate unique surface IDs, unique simultaneous `physicalSlotId` use, supported categories, positive dimensions, reachable standing points within 2.2 units, item fit inside footprint/clearance, and regular-before-fallback selection. Return an ordered `ShipItemTransform[]` in input instance order so tests can compare deterministic seeds directly.

- [ ] **Step 4: Reject surfaces or item volumes that intersect structure**

Implement `validateShipItemSurfaces` with a `0.1` wall clearance. For each surface, require a matching owner collider, require the surface footprint to lie above and inside the owner top, and create a clearance AABB from the full footprint and `clearanceHeight`. Ignore only the owning collider below the surface Y; reject positive-volume intersection with every shell collider and every other furniture collider. Reject pairwise overlap for surfaces with different `physicalSlotId` values.

After assignment, compute each oriented item AABB at its final resting transform and repeat the shell/other-furniture intersection check. Because assignments use unique physical slots, also reject pairwise item AABB overlap. Errors must include the item/surface/furniture ID and the collided structure index or owner ID.

- [ ] **Step 5: Assemble the validated ship from one layout**

Change `ShipBuild` and `createShip`:

```ts
export interface ShipBuild {
  readonly root: Group;
  readonly colliders: CollisionBox[];
  readonly itemSurfaces: ShipItemSurface[];
  readonly furnitureColliderById: ReadonlyMap<string, ShipFurnitureCollider>;
  readonly playerStart: Vector3;
  readonly evacuationPoint: Vector3;
  readonly lifeboatAnchor: Vector3;
  readonly playerNavigationBounds: PlayerNavigationBounds;
  readonly waterExclusion: { readonly halfWidth: number; readonly halfLength: number };
  updateEffects(delta: number, sinkingProgress: number, reducedMotion: boolean): void;
  dispose(): void;
}

export function createShip(
  shipFurniture: ShipFurnitureLibrary,
  maxTextureAnisotropy = 1,
): ShipBuild {
  validateShipLayout(SHIP_LAYOUT);
  const root = new Group();
  root.name = 'sinking-ship';
  const materials = createShipMaterials(maxTextureAnisotropy);
  const geometry = createShipGeometry(materials, SHIP_LAYOUT);
  const furniture = createShipFurniture(materials, shipFurniture, SHIP_LAYOUT);
  validateShipItemSurfaces(
    furniture.surfaces,
    geometry.shellColliders,
    furniture.colliderByFurnitureId,
  );
  const smoke = new ShipSmoke(geometry.stackOutlets);
  smoke.points.name = 'freighter-smoke';
  geometry.root.add(furniture.root, smoke.points);
  root.add(geometry.root);
  let disposed = false;

  return {
    root,
    colliders: [...geometry.shellColliders, ...furniture.colliders],
    itemSurfaces: furniture.surfaces,
    furnitureColliderById: furniture.colliderByFurnitureId,
    playerStart: new Vector3(0, 3.72, 7.2),
    evacuationPoint: new Vector3(5.4, 3.72, -6.5),
    lifeboatAnchor: new Vector3(7.6, 0.35, -6.5),
    playerNavigationBounds: {
      safe: { minX: -5.9, maxX: 5.9, minZ: -17.2, maxZ: 17.2 },
      fall: { minX: -7, maxX: 7, minZ: -18, maxZ: 18 },
    },
    waterExclusion: geometry.waterExclusion,
    updateEffects: (delta, progress, reducedMotion) => {
      smoke.update(delta, progress, reducedMotion);
    },
    dispose(): void {
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

Preserve player start `[0,3.72,7.2]`, evacuation `[5.4,3.72,-6.5]`, and lifeboat anchor `[7.6,0.35,-6.5]`. Expand only the safe Z bounds to `minZ: -17.2, maxZ: 17.2`; keep safe X `[-5.9,5.9]` and fall bounds `[-7,7] x [-18,18]`. Rail and structure colliders remain responsible for the rounded hull edge.

Ship disposal owns generated shell/cargo geometry, ship materials/textures, and smoke. It must not dispose `ShipFurnitureLibrary` templates.

- [ ] **Step 6: Pass the shared library through scavenging and place item models**

Make these `PhaseContext` members required:

```ts
shipFurniture: ShipFurnitureLibrary;
maxTextureAnisotropy: number;
```

Change `World` construction to accept `shipFurniture` and anisotropy before the moon texture, then call `createShip(shipFurniture, maxTextureAnisotropy)`. In `ScavengePhase`, construct it with:

```ts
this.world = new World(
  this.scene,
  context.propModels,
  context.shipFurniture,
  context.maxTextureAnisotropy,
  context.skyAssets.moonTexture,
  instances,
);
```

When `World` creates a prop, copy the validated transform and record:

```ts
prop.userData.shipSurfaceId = transform.surfaceId;
prop.userData.shipFurnitureId = transform.furnitureId;
```

Preserve existing construction rollback: remove the ship, dispose ship-owned resources, and dispose any already-created item clones if validation or assignment throws. `Game` remains the sole owner that disposes the shared furniture library exactly once.

- [ ] **Step 7: Establish GREEN and commit integrated placement**

Run:

```text
bun run test tests/ShipItemPlacement.test.ts tests/world.test.ts tests/GameLifecycle.test.ts tests/ShipFurniture.test.ts
bun run typecheck
```

Expected: all commands exit `0`; all 64 seeds place fourteen unique physical slots; no placement intersects walls/furniture; both end decks fall inside safe bounds; shared furniture disposal remains exactly once at game shutdown.

```text
git add -- src/world/ShipItemPlacement.ts src/world/Ship.ts src/world/World.ts src/app/GamePhase.ts src/phases/ScavengePhase.ts tests/ShipItemPlacement.test.ts tests/world.test.ts tests/GameLifecycle.test.ts
git commit -m "feat: place supplies on wall-safe ship surfaces"
```

---

### Task 5: Run Full Regression and Browser Verification

**Files:**
- Modify only if a verification failure identifies an in-scope defect: files already listed in Tasks 1–4 and their matching tests
- Inspect unchanged: `THIRD_PARTY_ASSETS.md`

**Interfaces:**
- Consumes: the completed ship build and all existing gameplay/lifecycle contracts.
- Produces: evidence that models, tests, type checking, production build, scavenging visuals, and survival handoff all pass.

- [ ] **Step 1: Run the repository-required model audit**

Run: `bun run models:check`

Expected: exit `0`; both item and ship-furniture audits accept every committed local GLB and the recorded triangle budgets. Do not edit asset files or the ledger unless the audit exposes a pre-existing inconsistency directly caused by this work.

- [ ] **Step 2: Run the complete automated test suite**

Run: `bun run test`

Expected: exit `0` with no skipped new layout, geometry, furniture, item-placement, world, or lifecycle tests.

- [ ] **Step 3: Run static and production-build checks**

Run:

```text
bun run typecheck
bun run build
```

Expected: both commands exit `0`; Vite writes the production bundle to `dist/` with no missing furniture or item asset URL.

- [ ] **Step 4: Inspect the title scene and active scavenging in the browser**

Start: `bun run dev -- --host 127.0.0.1`

At `1280x720` and `1920x1080`, verify:

1. all twelve enclosed-room corners (four per room) are visually sealed from both adjoining faces and diagonally;
2. only two bunks appear, both inside the crew cabin;
3. wheelhouse furniture is helm/chart/instrument furniture only;
4. storage contains only two workbenches and two shelves;
5. cargo contains only one low rod rack and three crate groups, all against room-wall perimeters;
6. no charts, mugs, loose hand tools, machine parts, vents, rope coils, winches, or support plates remain as separate clutter;
7. the room centers and every doorway are visibly open;
8. the port route reaches the bow center, crosses to starboard, and returns; repeat in reverse;
9. the port route reaches behind the compact stern island, crosses to starboard, and returns; repeat in reverse;
10. the lifeboat route remains direct and unobstructed.

- [ ] **Step 5: Inspect all fourteen collectibles across eight seeded restarts**

For each run, confirm every item rests on the top or shelf of its owning fixture, stays at least visibly clear of walls/corner caps, never crosses another item, and remains reachable from a declared standing side. Confirm the fishing rod lies parallel to the cargo-wall rack and never appears on a crate, while both bait tins and the scuba set occupy the three crate tops.

- [ ] **Step 6: Verify the unchanged gameplay handoff**

Pick up, carry, drop, throw, and save representative items; reach the evacuation point; enter survival; restart to scavenging; and confirm the timer, sinking transform, score, lifeboat acceptance, saved inventory, and survival phase remain unchanged.

- [ ] **Step 7: Review the final diff and commit verification corrections if needed**

Run:

```text
git diff --check
git status --short
```

Expected: no whitespace errors; only in-scope implementation/test files and the user's pre-existing unrelated changes appear. If Tasks 1–4 required a final in-scope correction during browser QA, rerun the smallest failing test plus all four required commands, then stage only those correction files and commit:

```text
git commit -m "fix: finish freighter layout simplification"
```

Do not stage or rewrite unrelated dirty-worktree files.

---

## Plan Self-Review

- Spec coverage: Tasks 1–4 cover unified ownership, sealed corners, correct room roles, wall-safe item placement, full bow/stern access, sparse clutter, all fourteen supplies, validation errors, and unchanged gameplay/resource ownership. Task 5 covers every required command and both-phase browser QA.
- Placeholder scan: no placeholder markers, deferred implementation steps, or unnamed error-handling requirements remain.
- Type consistency: `ShipFurnitureBuild.surfaces` uses `ShipItemSurface[]`; `ShipBuild.itemSurfaces` exposes the same type; `assignShipItems` consumes it; `World` consumes the resulting `ShipItemTransform[]`. Furniture collider ownership consistently uses `ShipFurnitureCollider` and `colliderByFurnitureId`.
- Scope: the plan reuses the existing local Kenney models and loader, makes no gameplay or asset-source change, and is small enough for one implementation sequence with five review gates.

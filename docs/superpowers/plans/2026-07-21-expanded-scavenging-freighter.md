# Expanded Scavenging Freighter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a 16-by-44-metre scavenging freighter with wider routes, thirty-two category-specific item slots, edge-aligned obstacles, and two animated auxiliary sails.

**Architecture:** Keep `ShipLayout` as the source for authored space, searchable furniture, deck details, and rigging placement. Add focused builders for deck details and rigging, then let `Ship` assemble their roots, colliders, updates, and disposal with the existing shell, furniture, materials, and smoke.

**Tech Stack:** TypeScript 5.9, Three.js 0.180, Vitest 3.2, Bun, Vite.

## Global Constraints

- Keep gameplay deterministic and keep placement randomness behind the injected source.
- Keep the scavenging timer at 120 seconds, carry capacity at three items, interaction distance at 2.2 metres, and player radius at 0.35 metres.
- Use a single searchable deck. Do not add stairs, a lower hold, touch controls, saves, crewmates, multiplayer, or persistent progression.
- Use `FREIGHTER_DIMENSIONS = { width: 16, length: 44, deckY: 2.22 }`.
- Keep exterior lanes at 2.5 metres, open-deck primary lanes at 2.2 metres, and secondary access at 1.4 metres or more.
- Keep thirty-two unique physical slots: eight provisions, seven navigation, eight workshop, and nine deck gear.
- Keep the lifeboat, rail opening, drop-off, and evacuation target aligned at local `z = 0`.
- Use the shared wave field for freighter motion and water exclusion.
- Stop sail motion when `prefers-reduced-motion` matches.
- Create new ship details with Three.js geometry. Do not add a third-party asset or runtime fetch.
- Dispose each generated geometry once. Shared ship materials retain one owner.
- Avoid object allocation inside update loops.

## File Structure

- Modify `src/world/ShipLayout.ts`: enlarged authored plan, furniture, detail and rigging specs, collision footprints, validation, and navigation analysis.
- Modify `src/world/ShipGeometry.ts`: enlarged hull, deck, rounded ends, rails, room shells, machinery, and water exclusion.
- Modify `src/world/ShipFurniture.ts`: retain transformed searchable surfaces and consume the re-authored furniture catalog.
- Create `src/world/ShipDeckDetails.ts`: construct procedural details and detail colliders from `ShipLayout` specs.
- Create `src/world/ShipRigging.ts`: construct masts, sails, lines, mast colliders, deterministic sail motion, and disposal.
- Modify `src/world/ShipMaterials.ts`: add the shared sail-canvas material.
- Modify `src/world/Ship.ts`: assemble shell, furniture, details, rigging, smoke, colliders, updates, and disposal.
- Modify `src/world/World.ts`: use the 38-by-13-metre freighter buoyancy footprint.
- Modify `src/phases/ScavengePhase.ts`: frame the longer hull and mast tops on the title screen.
- Modify `tests/ShipLayout.test.ts`: exact authored contract, detail and mast validation, navigation, and clearances.
- Modify `tests/ShipFurniture.test.ts`: fixture collider, standing-point, and surface ownership checks.
- Modify `tests/ShipItemPlacement.test.ts`: thirty-two slots and seeded placement across the enlarged plan.
- Modify `tests/ShipGeometry.test.ts`: expanded shell, rail, water exclusion, and lifeboat opening.
- Create `tests/ShipDeckDetails.test.ts`: detail counts, transforms, colliders, and disposal.
- Create `tests/ShipRigging.test.ts`: rig composition, sail limits, motion, reduced motion, and disposal.
- Modify `tests/world.test.ts`: final ship assembly, endpoints, collision count, effects, and construction rollback.
- Modify `tests/GameLifecycle.test.ts`: exact title-camera composition.

---

### Task 1: Enlarge the authored plan and add detail and rigging schemas

**Files:**
- Modify: `src/world/ShipLayout.ts`
- Modify: `tests/ShipLayout.test.ts`

**Interfaces:**
- Produces: `ShipDeckDetailKind`, `ShipDeckDetailSpec`, `ShipMastSpec`, `ShipRiggingSpec`, `detailRect(spec)`, `mastRect(spec)`, and `ShipLayoutSpec.details` plus `ShipLayoutSpec.rigging`.
- Produces: navigation analysis that treats colliding details and mast bases as obstacles.
- Consumes: `Rect2`, `ShipLaneSpec`, `ShipNavigationTargetSpec`, and the existing grid flood-fill.

- [ ] **Step 1: Write failing tests for dimensions, zones, doors, routes, details, and masts**

Replace the old compact-layout assertions with this contract:

```ts
expect(FREIGHTER_DIMENSIONS).toEqual({ width: 16, length: 44, deckY: 2.22 });
expect(SHIP_LAYOUT.zones.find(({ id }) => id === 'crewCabin')!.bounds)
  .toEqual({ minX: -4.6, maxX: 4.6, minZ: 5, maxZ: 12.4 });
expect(SHIP_LAYOUT.zones.find(({ id }) => id === 'wheelhouse')!.bounds)
  .toEqual({ minX: -4.6, maxX: 4.6, minZ: 13.4, maxZ: 17.2 });
expect(SHIP_LAYOUT.zones.find(({ id }) => id === 'storageWorkroom')!.bounds)
  .toEqual({ minX: -4.7, maxX: 4.7, minZ: -13.4, maxZ: -8 });
expect(SHIP_LAYOUT.zones.find(({ id }) => id === 'lifeboatStation')!.bounds)
  .toEqual({ minX: 5, maxX: 7.6, minZ: -1.8, maxZ: 1.8 });
expect(SHIP_LAYOUT.rail).toEqual({
  height: 1.05,
  innerFaceX: 7.575,
  starboardOpening: { centerZ: 0, width: 3.6 },
});
expect(SHIP_LAYOUT.doors.map(({ id, center, width }) => ({ id, center, width }))).toEqual([
  { id: 'cabin-port-door', center: [-4.6, 7.4], width: 2.4 },
  { id: 'cabin-starboard-door', center: [4.6, 7.4], width: 2.4 },
  { id: 'wheelhouse-aft-door', center: [0, 13.4], width: 2.4 },
  { id: 'wheelhouse-port-door', center: [-4.6, 15.2], width: 2.2 },
  { id: 'storage-port-door', center: [-4.7, -10.6], width: 2.4 },
  { id: 'storage-starboard-door', center: [4.7, -10.6], width: 2.4 },
]);
expect(SHIP_LAYOUT.lanes.filter(({ id }) => /exterior-main/.test(id))
  .map(({ clearWidth }) => clearWidth)).toEqual([2.5, 2.5]);
expect(SHIP_LAYOUT.lanes.filter(({ className }) => className === 'primary')
  .every(({ clearWidth }) => clearWidth >= 2.2)).toBe(true);
expect(SHIP_LAYOUT.details).toHaveLength(48);
expect(SHIP_LAYOUT.rigging.masts.map(({ id, position, height, baseDiameter }) => ({
  id, position, height, baseDiameter,
}))).toEqual([
  { id: 'foremast', position: [0, 2.22, 19.1], height: 8, baseDiameter: 0.6 },
  { id: 'aft-mast', position: [0, 2.22, -4.8], height: 7.2, baseDiameter: 0.6 },
]);
expect(() => validateShipLayout(SHIP_LAYOUT)).not.toThrow();
const analysis = analyzeShipNavigation(SHIP_LAYOUT);
expect(analysis.unreachableTargetIds).toEqual([]);
expect(analysis.minimumPrimaryClearance).toBeGreaterThanOrEqual(2.2);
expect(analysis.minimumSecondaryClearance).toBeGreaterThanOrEqual(1.4);
```

Add validation mutations for a duplicate detail ID, a barrel in a primary lane, a mast with zero height, and a mast base over the evacuation rectangle. Match errors by the offending ID.

- [ ] **Step 2: Run the focused layout test and confirm red**

Run: `bun run test -- tests/ShipLayout.test.ts`

Expected: FAIL because `FREIGHTER_DIMENSIONS` still contains `12.5` and `36`, door validation rejects width `2.4`, and `ShipLayoutSpec` has no `details` or `rigging` fields.

- [ ] **Step 3: Add the authored schemas and enlarged constants**

Add these exported types beside the existing layout interfaces:

```ts
export type ShipDeckDetailKind =
  | 'barrel' | 'ropeCoil' | 'bollard' | 'cleat' | 'lamp' | 'vent'
  | 'lifeRing' | 'coveredHatch' | 'spareTimber' | 'toolbox' | 'foldedCanvas';

export interface ShipDeckDetailSpec {
  readonly id: string;
  readonly kind: ShipDeckDetailKind;
  readonly position: readonly [number, number, number];
  readonly rotationY: number;
  readonly scale: readonly [number, number, number];
  readonly colliderSize?: readonly [number, number, number];
}

export interface ShipMastSpec {
  readonly id: 'foremast' | 'aft-mast';
  readonly position: readonly [number, number, number];
  readonly height: number;
  readonly baseDiameter: number;
  readonly sailKind: 'stay' | 'boom';
  readonly sailArea: number;
  readonly sailDirectionZ: -1 | 1;
}

export interface ShipRiggingSpec {
  readonly masts: readonly ShipMastSpec[];
}
```

Extend `ShipLayoutSpec` with:

```ts
readonly details: readonly ShipDeckDetailSpec[];
readonly rigging: ShipRiggingSpec;
```

Set `FREIGHTER_DIMENSIONS`, grid bounds, zones, cargo polygon, door centres, lanes, rail, machinery closure, and evacuation rectangle to the approved spec. Set the start target to `[0, 8.8]`, the evacuation target to `[7.1, 0]`, bow targets inside `z = 21.2`, and stern targets inside `z = -21.2`.

Generate the forty-eight detail specs with fixed coordinate tuples. Use these exact counts:

```ts
export const SHIP_DECK_DETAIL_COUNTS: Readonly<Record<ShipDeckDetailKind, number>> = {
  barrel: 6,
  ropeCoil: 4,
  bollard: 8,
  cleat: 8,
  lamp: 6,
  vent: 4,
  lifeRing: 4,
  coveredHatch: 1,
  spareTimber: 2,
  toolbox: 3,
  foldedCanvas: 2,
};
```

Place colliding barrels, bollards, and spare-timber bundles inside the six approved pockets. Keep bow and stern detail centres within `|x| = 5.0..6.8`. Keep cargo-edge detail centres within `|x| = 3.0..4.4` and `z = -6.8..3.8`. Give barrels `[0.9, 1.15, 0.9]` colliders, bollards `[0.35, 0.65, 0.35]` colliders, and timber bundles `[1.8, 0.35, 0.55]` colliders. Leave the other detail collider sizes undefined.

Add the approved rig:

```ts
rigging: {
  masts: [
    {
      id: 'foremast', position: [0, 2.22, 19.1], height: 8, baseDiameter: 0.6,
      sailKind: 'stay', sailArea: 14, sailDirectionZ: 1,
    },
    {
      id: 'aft-mast', position: [0, 2.22, -4.8], height: 7.2, baseDiameter: 0.6,
      sailKind: 'boom', sailArea: 12, sailDirectionZ: 1,
    },
  ],
},
```

- [ ] **Step 4: Make navigation and validation consume detail and mast footprints**

Export footprint helpers with these signatures:

```ts
export function detailRect(spec: ShipDeckDetailSpec): Rect2;
export function mastRect(spec: ShipMastSpec): Rect2;
```

`detailRect` rotates `colliderSize` by `rotationY` and scales each horizontal axis. `mastRect` returns a square around the circular base. Add both footprint groups to `activeObstacles`. Validate unique IDs, finite transforms, positive scales, sail areas no greater than fourteen and twelve square metres, mast cloth clearance above local `y = 5.2`, deck-polygon containment, pairwise collider disjointness, and no overlap with primary lanes, door approaches, or evacuation.

Raise the door-width validation maximum from `2.2` to `2.4`. Derive the grid extents from cargo-zone bounds instead of fixed compact constants so navigation covers the 44-metre hull.

- [ ] **Step 5: Run the layout test and confirm green**

Run: `bun run test -- tests/ShipLayout.test.ts`

Expected: PASS with all layout targets reachable and both clearance thresholds met.

- [ ] **Step 6: Commit the enlarged authored plan**

```text
git add src/world/ShipLayout.ts tests/ShipLayout.test.ts
git commit -m "feat: enlarge scavenging ship layout"
```

---

### Task 2: Re-author furniture and thirty-two item slots

**Files:**
- Modify: `src/world/ShipLayout.ts`
- Modify: `tests/ShipLayout.test.ts`
- Modify: `tests/ShipFurniture.test.ts`
- Modify: `tests/ShipItemPlacement.test.ts`

**Interfaces:**
- Consumes: existing `ShipFurniturePlacementSpec`, `itemSurface`, `deskSurfaces`, `tableSurfaces`, `bookcaseSurfaces`, and `sideTableSurfaces`.
- Produces: exactly thirty-two non-fallback surfaces with one category per surface.

- [ ] **Step 1: Write failing furniture and item-surface assertions**

Assert the category capacity and fixture ownership:

```ts
const surfaces = SHIP_LAYOUT.furniture.flatMap(({ surfaces }) => surfaces);
expect(surfaces).toHaveLength(32);
expect(new Set(surfaces.map(({ physicalSlotId }) => physicalSlotId)).size).toBe(32);
expect(surfaces.every(({ categories, fallback }) => categories.length === 1 && !fallback))
  .toBe(true);
expect(Object.fromEntries(['provisions', 'navigation', 'workshop', 'deckGear'].map((category) => [
  category,
  surfaces.filter(({ categories }) => categories[0] === category).length,
]))).toEqual({ provisions: 8, navigation: 7, workshop: 8, deckGear: 9 });
```

Update the production assignment test:

```ts
expect(ship.itemSurfaces).toHaveLength(32);
for (let seed = 0; seed < 64; seed += 1) {
  const assignments = assignShipItems(
    createItemInstances(),
    ship.itemSurfaces,
    mulberry32(seed),
    ship.colliders,
  );
  expect(assignments.size, `seed ${seed}`).toBe(22);
  expect(new Set([...assignments.values()].map(({ physicalSlotId }) => physicalSlotId)).size)
    .toBe(22);
  expect([...assignments.values()].every(({ usedFallbackSurface }) => !usedFallbackSurface))
    .toBe(true);
}
expect(ship.playerNavigationBounds.safe).toEqual({
  minX: -7.65, maxX: 7.65, minZ: -21.2, maxZ: 21.2,
});
```

- [ ] **Step 2: Run layout, furniture, and item-placement tests and confirm red**

Run: `bun run test -- tests/ShipLayout.test.ts tests/ShipFurniture.test.ts tests/ShipItemPlacement.test.ts`

Expected: FAIL because the existing catalog exposes twenty-seven surfaces and mixes workshop with deck-gear categories.

- [ ] **Step 3: Replace the furniture catalog**

Use this fixture contract. Keep the current model collider sizes from `shipFurnitureManifest` and adjust only positions, rotations, categories, and surface selection.

| Zone | Fixture IDs | Surface total |
| --- | --- | ---: |
| Crew cabin | `cabin-bunk-port`, `cabin-bunk-starboard`, `cabin-desk-aft`, `cabin-bookcase-forward`, `cabin-food-cabinet`, `cabin-side-cabinet` | 8 provisions |
| Wheelhouse | `helm-desk-forward`, `chart-table-port`, `chart-cabinet-port`, `instrument-cabinet-starboard-aft`, `instrument-cabinet-starboard-center`, `instrument-cabinet-starboard-forward` | 7 navigation |
| Workroom | `workbench-port`, `workbench-starboard`, `storage-shelf-forward` | 8 workshop |
| Cargo deck | `cargo-crate-forward-port`, `cargo-crate-forward-starboard`, `cargo-crate-aft-port`, `cargo-crate-aft-starboard`, `cargo-rack-port`, `cargo-rack-starboard`, `cargo-rod-rack-port` | 9 deck gear |

Place cabin furniture against `x = ±3.9`, `z = 5.35`, and `z = 12.05`, outside the clear centre `x = -1.5..1.5`, `z = 6.0..10.8`. Place wheelhouse furniture against the forward, port, and starboard walls, outside `x = -1.2..1.2`, `z = 13.7..16.0`. Put workbenches at `[-2.8, 2.22, -12.7]` and `[2.8, 2.22, -12.7]`, and the shelf at `[0, 2.22, -8.35]`. Put cargo fixtures at `x = ±3.6` with longitudinal centres `-6.4`, `-3.8`, `1.5`, and `3.8`, choosing one fixture per centre and side without footprint overlap.

Add a two-slot cargo-rack helper:

```ts
function cargoRackSurfaces(
  furnitureId: string,
  categories: readonly ShipItemCategory[],
): readonly ShipItemSurfaceSpec[] {
  return ([-0.5, 0.5] as const).map((x, index) => itemSurface(
    furnitureId,
    `top-${index === 0 ? 'left' : 'right'}`,
    categories,
    [x, 0.55, 0],
    { width: 0.85, depth: 0.5 },
    0.82,
    [[x, 0, -1.15], [x, 0, 1.15]],
    { localRotation: [0, PI_OVER_TWO, 0] },
  ));
}
```

Set room fixture policies to six cabin fixtures, six wheelhouse fixtures, three workroom fixtures, seven cargo fixtures, and zero lifeboat fixtures. Restrict workroom fixtures to `['table', 'bookcaseOpen']` and cargo fixtures to `['cargoCrate', 'cargoRack']`.

- [ ] **Step 4: Run the focused tests and adjust only authored coordinates**

Run: `bun run test -- tests/ShipLayout.test.ts tests/ShipFurniture.test.ts tests/ShipItemPlacement.test.ts`

Expected: PASS. If navigation or sightline assertions fail, move the offending fixture or standing point inside its approved perimeter band. Do not reduce lane widths, item reach, or model-clearance rules.

- [ ] **Step 5: Commit the item-placement redesign**

```text
git add src/world/ShipLayout.ts tests/ShipLayout.test.ts tests/ShipFurniture.test.ts tests/ShipItemPlacement.test.ts
git commit -m "feat: redesign freighter item placements"
```

---

### Task 3: Scale the hull, world endpoints, buoyancy, and title camera

**Files:**
- Modify: `src/world/ShipGeometry.ts`
- Modify: `src/world/Ship.ts`
- Modify: `src/world/World.ts`
- Modify: `src/phases/ScavengePhase.ts`
- Modify: `tests/ShipGeometry.test.ts`
- Modify: `tests/world.test.ts`
- Modify: `tests/GameLifecycle.test.ts`

**Interfaces:**
- Consumes: enlarged `FREIGHTER_DIMENSIONS` and `SHIP_LAYOUT`.
- Produces: expanded shell and water exclusion, updated player endpoints, `BoatFootprint { length: 38, width: 13 }`, and title framing constants.

- [ ] **Step 1: Write failing shell and endpoint tests**

Use these exact assertions:

```ts
expect(FREIGHTER_DIMENSIONS).toEqual({ width: 16, length: 44, deckY: 2.22 });
const bounds = new Box3().setFromObject(build.root);
expect(bounds.max.x - bounds.min.x).toBeGreaterThanOrEqual(15.5);
expect(bounds.max.z - bounds.min.z).toBeGreaterThanOrEqual(43);
expect(build.waterExclusion).toEqual({
  halfWidth: 8,
  halfLength: 22,
  taperStart: 17.8,
  minimumLocalY: 0.76,
  heightProfile: {
    lowerHalfWidth: 6.88,
    lowerHalfLength: 21.12,
    lowerTaperStart: 17.088,
    upperLocalY: 1.86,
  },
});
expect(ship.playerStart.toArray()).toEqual([0, 3.72, 8.8]);
expect(ship.evacuationPoint.toArray()).toEqual([7.1, 3.72, 0]);
expect(ship.lifeboatAnchor.toArray()).toEqual([10.75, 0.35, 0]);
expect(ship.playerNavigationBounds).toEqual({
  safe: { minX: -7.65, maxX: 7.65, minZ: -21.2, maxZ: 21.2 },
  fall: { minX: -8.8, maxX: 8.8, minZ: -22.8, maxZ: 22.8 },
});
expect(TITLE_CAMERA_POSITION).toEqual([-33, 11.5, -4]);
expect(TITLE_CAMERA_TARGET).toEqual([0, 5.5, -3]);
```

Update rounded-rail assertions to use a 4.2-metre end depth and positions near `|z| = 21.6`. Update the lifeboat-gap movement test to travel from `x = 7.1` to `x = 8.1`.

- [ ] **Step 2: Run geometry, world, and lifecycle tests and confirm red**

Run: `bun run test -- tests/ShipGeometry.test.ts tests/world.test.ts tests/GameLifecycle.test.ts`

Expected: FAIL on old deck dimensions, old water exclusion, old endpoints, old navigation bounds, and old title-camera constants.

- [ ] **Step 3: Derive geometry from the enlarged layout**

Change the geometry constants:

```ts
const DECK_WIDTH = 15.5;
const DECK_LENGTH = 42;
const END_CAP_DEPTH = 4.2;
```

Keep `HALF_WIDTH` and `HALF_LENGTH` derived from `FREIGHTER_DIMENSIONS`. Let rail arcs, finished cargo floor, shell colliders, end weathering, and water-exclusion taper use the new cap depth. Keep deck height, hull height, hull top, bottom taper, room wall height, and stack height unchanged.

- [ ] **Step 4: Update ship endpoints, buoyancy, and title framing**

Set `Ship.ts` values to the test contract. Set the world constant to:

```ts
const FREIGHTER_BUOYANCY_FOOTPRINT: BoatFootprint = { length: 38, width: 13 };
```

Set the title constants to:

```ts
export const TITLE_CAMERA_POSITION = [-33, 11.5, -4] as const;
export const TITLE_CAMERA_TARGET = [0, 5.5, -3] as const;
```

Do not change first-person camera settings or movement code.

- [ ] **Step 5: Run the focused tests and confirm green**

Run: `bun run test -- tests/ShipGeometry.test.ts tests/world.test.ts tests/GameLifecycle.test.ts`

Expected: PASS with the wider rail opening traversable and adjacent rail spans colliding.

- [ ] **Step 6: Commit the scaled shell and world contract**

```text
git add src/world/ShipGeometry.ts src/world/Ship.ts src/world/World.ts src/phases/ScavengePhase.ts tests/ShipGeometry.test.ts tests/world.test.ts tests/GameLifecycle.test.ts
git commit -m "feat: scale scavenging freighter shell"
```

---

### Task 4: Build procedural deck details

**Files:**
- Create: `src/world/ShipDeckDetails.ts`
- Create: `tests/ShipDeckDetails.test.ts`

**Interfaces:**
- Consumes: `ShipMaterials`, `ShipDeckDetailSpec`, `SHIP_LAYOUT.details`.
- Produces: `createShipDeckDetails(materials, specs): ShipDeckDetailsBuild`.

```ts
export interface ShipDeckDetailsBuild {
  readonly root: Group;
  readonly colliders: CollisionBox[];
  disposeGeometry(): void;
}
```

- [ ] **Step 1: Write failing detail construction and disposal tests**

Create `tests/ShipDeckDetails.test.ts` with these checks:

```ts
it('builds the exact authored detail catalog and colliders', () => {
  const materials = createShipMaterials();
  const build = createShipDeckDetails(materials, SHIP_LAYOUT.details);
  expect(build.root.name).toBe('ship-deck-details');
  expect(build.root.children).toHaveLength(48);
  expect(Object.fromEntries(Object.keys(SHIP_DECK_DETAIL_COUNTS).map((kind) => [
    kind,
    build.root.children.filter((child) => child.userData.detailKind === kind).length,
  ]))).toEqual(SHIP_DECK_DETAIL_COUNTS);
  expect(build.colliders).toHaveLength(
    SHIP_LAYOUT.details.filter(({ colliderSize }) => colliderSize !== undefined).length,
  );
  build.disposeGeometry();
  materials.dispose();
});

it('disposes generated geometries once and keeps shared materials alive', () => {
  const materials = createShipMaterials();
  const materialDisposals = materials.ownedMaterialsForTest()
    .map((material) => vi.spyOn(material, 'dispose'));
  const build = createShipDeckDetails(materials, SHIP_LAYOUT.details);
  const geometries = new Set<BufferGeometry>();
  build.root.traverse((object) => {
    if (object instanceof Mesh) geometries.add(object.geometry);
  });
  const geometryDisposals = [...geometries].map((geometry) => vi.spyOn(geometry, 'dispose'));
  build.disposeGeometry();
  build.disposeGeometry();
  geometryDisposals.forEach((dispose) => expect(dispose).toHaveBeenCalledTimes(1));
  materialDisposals.forEach((dispose) => expect(dispose).not.toHaveBeenCalled());
  materials.dispose();
});
```

- [ ] **Step 2: Run the detail test and confirm red**

Run: `bun run test -- tests/ShipDeckDetails.test.ts`

Expected: FAIL because `ShipDeckDetails.ts` does not exist.

- [ ] **Step 3: Implement the focused detail builder**

Create one `Group` per spec, set `name = detail:<id>`, copy position, rotation, scale, and `userData.detailKind`. Use shared geometry instances per primitive shape inside the build:

- barrel: cylinder body plus two dark-metal band cylinders;
- rope coil: torus laid flat;
- bollard: vertical cylinder plus top cap;
- cleat: low centre block plus two arms;
- lamp: post, hood, and emergency-colour lens;
- vent: short cylinder with angled cap;
- life ring: torus mounted upright;
- covered hatch: low box with four strap strips;
- spare timber: three parallel beams;
- toolbox: low box plus handle;
- folded canvas: three thin stacked boxes.

Use `materials.crewFloor` for timber, `materials.darkMetal` and `materials.exposedMetal` for fittings, `materials.rope` for coils, `materials.emergency` for lenses and life rings, and `materials.paintedSteel` for hatches and toolboxes.

Create each collider from the authored `colliderSize`, transformed by `rotationY` and `scale`. Set collider Y from deck height to scaled height. Track generated geometries in a `Set<BufferGeometry>` and dispose the set once.

- [ ] **Step 4: Run detail tests and confirm green**

Run: `bun run test -- tests/ShipDeckDetails.test.ts`

Expected: PASS with forty-eight roots and idempotent geometry disposal.

- [ ] **Step 5: Commit the deck-detail builder**

```text
git add src/world/ShipDeckDetails.ts tests/ShipDeckDetails.test.ts
git commit -m "feat: add freighter deck details"
```

---

### Task 5: Build auxiliary masts, sails, and reduced-motion updates

**Files:**
- Modify: `src/world/ShipMaterials.ts`
- Create: `src/world/ShipRigging.ts`
- Create: `tests/ShipRigging.test.ts`

**Interfaces:**
- Consumes: `ShipMaterials`, `ShipRiggingSpec`, `SHIP_LAYOUT.rigging`.
- Produces: `createShipRigging(materials, spec): ShipRiggingBuild`.

```ts
export interface ShipRiggingBuild {
  readonly root: Group;
  readonly colliders: CollisionBox[];
  update(delta: number, reducedMotion: boolean): void;
  disposeGeometry(): void;
}
```

- [ ] **Step 1: Write failing material, rigging, motion, and disposal tests**

Create `tests/ShipRigging.test.ts` with exact structure checks:

```ts
const materials = createShipMaterials();
const build = createShipRigging(materials, SHIP_LAYOUT.rigging);
expect(build.root.name).toBe('ship-rigging');
expect(build.root.getObjectByName('mast:foremast')).toBeDefined();
expect(build.root.getObjectByName('mast:aft-mast')).toBeDefined();
expect(build.root.getObjectByName('sail:foremast')).toBeInstanceOf(Mesh);
expect(build.root.getObjectByName('sail:aft-mast')).toBeInstanceOf(Mesh);
expect(build.colliders).toHaveLength(2);
const aftSail = build.root.getObjectByName('sail:aft-mast')!;
const neutral = aftSail.rotation.z;
build.update(0.25, false);
expect(aftSail.rotation.z).not.toBeCloseTo(neutral);
build.update(0.25, true);
expect(aftSail.rotation.z).toBeCloseTo(neutral);
build.disposeGeometry();
materials.dispose();
```

Add a second test that spies on all generated geometries, calls `disposeGeometry()` twice, and expects one disposal per geometry plus zero material disposals before `materials.dispose()`.

- [ ] **Step 2: Run the rigging test and confirm red**

Run: `bun run test -- tests/ShipRigging.test.ts`

Expected: FAIL because the rigging builder and sail material do not exist.

- [ ] **Step 3: Add the shared canvas material**

Extend `ShipMaterials`:

```ts
canvas: MeshStandardMaterial;
```

Create and own it in `createShipMaterials`:

```ts
const canvas = new MeshStandardMaterial({
  color: 0xc7ad7a,
  roughness: 0.96,
  metalness: 0,
  side: DoubleSide,
});
```

Return it and include it in `ownedMaterials`.

- [ ] **Step 4: Implement rigging with preallocated motion state**

Build mast cylinders with twelve radial segments, rope cylinders or line geometry, pulley cylinders, and triangular `BufferGeometry` sails. Keep sail vertices within `x = -2.4..2.4` and above local `y = 5.2`. Name the mast roots and sail meshes as asserted by the tests.

Store each sail's neutral Z rotation and phase in arrays created during construction. Update with one accumulated time value:

```ts
elapsed += Math.max(0, Math.min(delta, 0.1));
sails.forEach((sail, index) => {
  sail.rotation.z = reducedMotion
    ? neutralRotations[index]!
    : neutralRotations[index]! + Math.sin(elapsed * 1.4 + phases[index]!) * 0.025;
});
```

Create one base collider per mast from `baseDiameter` and `height`. Track and dispose generated geometries once. Do not dispose shared materials.

- [ ] **Step 5: Run material and rigging tests and confirm green**

Run: `bun run test -- tests/ShipRigging.test.ts tests/SceneResources.test.ts`

Expected: PASS with deterministic motion and reduced-motion reset.

- [ ] **Step 6: Commit the auxiliary rig**

```text
git add src/world/ShipMaterials.ts src/world/ShipRigging.ts tests/ShipRigging.test.ts
git commit -m "feat: add freighter auxiliary sails"
```

---

### Task 6: Integrate details and rigging into ship construction

**Files:**
- Modify: `src/world/Ship.ts`
- Modify: `tests/world.test.ts`

**Interfaces:**
- Consumes: `createShipDeckDetails`, `createShipRigging`, `ShipBuild.updateEffects`.
- Produces: assembled roots, combined colliders, item visibility against all obstacles, effect forwarding, construction rollback, and idempotent disposal.

- [ ] **Step 1: Write failing assembly and rollback tests**

Extend the furnished-freighter test:

```ts
expect(ship.root.getObjectByName('ship-deck-details')).toBeDefined();
expect(ship.root.getObjectByName('ship-rigging')).toBeDefined();
expect(ship.root.getObjectByName('sail:foremast')).toBeDefined();
expect(ship.root.getObjectByName('sail:aft-mast')).toBeDefined();
expect(ship.itemSurfaces).toHaveLength(32);
expect(ship.colliders.length).toBeGreaterThanOrEqual(40);
```

Add an effects assertion:

```ts
const sail = ship.root.getObjectByName('sail:aft-mast')!;
const neutral = sail.rotation.z;
ship.updateEffects(0.25, 0.5, false);
expect(sail.rotation.z).not.toBeCloseTo(neutral);
ship.updateEffects(0.25, 0.5, true);
expect(sail.rotation.z).toBeCloseTo(neutral);
```

Extend construction-failure coverage so a failed item assignment disposes detail and rigging geometry with the shell and smoke. Reuse resource spies collected from the scene before rollback.

- [ ] **Step 2: Run the world test and confirm red**

Run: `bun run test -- tests/world.test.ts`

Expected: FAIL because `createShip` does not build details or rigging.

- [ ] **Step 3: Assemble builders in `createShip`**

Import both factories. Construct them after geometry and before surface validation:

```ts
details = createShipDeckDetails(materials, SHIP_LAYOUT.details);
rigging = createShipRigging(materials, SHIP_LAYOUT.rigging);
const structuralColliders = [
  ...geometry.shellColliders,
  ...details.colliders,
  ...rigging.colliders,
];
validateShipItemSurfaces(
  furniture.surfaces,
  structuralColliders,
  furniture.colliderByFurnitureId,
);
geometry.root.add(furniture.root, details.root, rigging.root, smoke.points);
```

Build final colliders in this order: shell, furniture, deck details, rigging. Run `visibleProductionSurfaces` against that final list.

Forward updates without allocation:

```ts
updateEffects: (delta, progress, reducedMotion) => {
  assembledSmoke.update(delta, progress, reducedMotion);
  assembledRigging.update(delta, reducedMotion);
},
```

Dispose in reverse construction order: smoke, rigging geometry, detail geometry, furniture geometry, shell geometry, materials. Add matching cleanup calls in the constructor catch block.

- [ ] **Step 4: Run world, item, and lifecycle tests and confirm green**

Run: `bun run test -- tests/world.test.ts tests/ShipItemPlacement.test.ts tests/GameLifecycle.test.ts`

Expected: PASS with thirty-two visible surfaces, combined colliders, working sail updates, and clean rollback.

- [ ] **Step 5: Commit ship integration**

```text
git add src/world/Ship.ts tests/world.test.ts
git commit -m "feat: integrate freighter details and rigging"
```

---

### Task 7: Run full verification and inspect traversal in the browser

**Files:**
- Modify only files implicated by failed checks or visual defects from Tasks 1 through 6.

**Interfaces:**
- Consumes: completed freighter implementation.
- Produces: passing model audit, tests, typecheck, build, and browser QA record in the final handoff.

- [ ] **Step 1: Run the model audit**

Run: `bun run models:check`

Expected: PASS because the feature uses code-native geometry and retains the committed model manifests.

- [ ] **Step 2: Run the complete test suite**

Run: `bun run test`

Expected: PASS with zero failing tests.

- [ ] **Step 3: Run static checks and the production build**

Run: `bun run typecheck`

Expected: PASS with zero TypeScript errors.

Run: `bun run build`

Expected: PASS and Vite emits the production bundle.

- [ ] **Step 4: Inspect the ship in the browser**

Start the local Vite server and inspect these views with keyboard and mouse:

1. Title view contains the whole 44-metre hull, both mast tops, wheelhouse, stacks, and lifeboat.
2. Crew cabin centre and both side doors remain clear.
3. Port and starboard exterior loops remain traversable at walking and sprint speed.
4. Both sides of each mast base allow passage without snagging.
5. Workroom, wheelhouse, cargo surfaces, and all spawned items remain visible and reachable.
6. Barrels, timber, bollards, and crates stay inside edge pockets.
7. The starboard opening leads to the lifeboat and leaves adjacent rail spans solid.
8. Reduced-motion mode holds both sails at their neutral pose.

- [ ] **Step 5: Commit any verification fixes**

If verification required code or test changes, stage only those files and use:

```text
git commit -m "fix: polish expanded scavenging freighter"
```

If verification required no changes, do not create an empty commit.

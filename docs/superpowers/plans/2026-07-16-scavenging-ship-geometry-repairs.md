# Scavenging Ship Geometry Repairs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ground the freighter smokestacks, roof all enclosed rooms, and remove the paired cargo-deck artifacts.

**Architecture:** Keep the repair inside `ShipGeometry.ts`. Derive roof slabs from current zone bounds, derive stack height from the machinery-island top and fixed outlet height, and delete the four unwanted weathering meshes. Add one regression test per defect before its production edit.

**Tech Stack:** TypeScript 5.9, Three.js 0.180, Vitest 3.2, Bun, Vite 7

## Global Constraints

- Keep both smoke outlets at `y = 7.1`.
- Use 0.24-unit painted-steel roof slabs with 0.175-unit overhangs and no roof colliders.
- Remove `deck-drain-*` and `rust-streak-deck-drain-*`; retain lifeboat-opening and stack-collar weathering.
- Preserve layout, navigation, furniture, collectible placement, materials, and gameplay.
- Add no dependencies or third-party assets.
- Run `bun run models:check`, `bun run test`, `bun run typecheck`, and `bun run build` before completion.
- Inspect the title scene and active scavenging after the code checks pass.

## File Structure

- Modify `src/world/ShipGeometry.ts`: room roofs, stack dimensions, and weathering mesh construction.
- Modify `tests/ShipGeometry.test.ts`: regression coverage for the three visible defects.
- Do not modify `ShipLayout.ts`, `ShipSmoke.ts`, `ShipMaterials.ts`, furniture code, item placement, or phase logic.

---

### Task 1: Roof Each Enclosed Room

**Files:**
- Modify: `tests/ShipGeometry.test.ts:307-325`
- Modify: `src/world/ShipGeometry.ts:43-57,404-488,730-737`

**Interfaces:**
- Consumes: `createShipGeometry(materials: ShipMaterials, layout?: ShipLayoutSpec): ShipGeometryBuild` and `ShipLayoutSpec.zones`.
- Produces: `crewCabin-roof`, `wheelhouse-roof`, and `storageWorkroom-roof` meshes whose bounds derive from the owning zone.

- [ ] **Step 1: Write the failing roof test**

Insert this test after `seals every enclosed-room corner visually and physically`:

```ts
it('covers each enclosed room with a steel roof that meets its wall top', () => {
  const materials = createShipMaterials();
  const build = createShipGeometry(materials);
  const roofThickness = 0.24;
  const roofOverhang = 0.175;

  SHIP_LAYOUT.zones.filter(({ enclosed }) => enclosed).forEach((zone) => {
    const roof = build.root.getObjectByName(`${zone.id}-roof`);
    expect(roof, zone.id).toBeInstanceOf(Mesh);
    const bounds = new Box3().setFromObject(roof!);
    const wallHeight = zone.id === 'wheelhouse' ? 3.4 : 3.2;

    expect(bounds.min.x, `${zone.id} min x`).toBeCloseTo(zone.bounds.minX - roofOverhang);
    expect(bounds.max.x, `${zone.id} max x`).toBeCloseTo(zone.bounds.maxX + roofOverhang);
    expect(bounds.min.z, `${zone.id} min z`).toBeCloseTo(zone.bounds.minZ - roofOverhang);
    expect(bounds.max.z, `${zone.id} max z`).toBeCloseTo(zone.bounds.maxZ + roofOverhang);
    expect(bounds.min.y, `${zone.id} roof bottom`)
      .toBeCloseTo(FREIGHTER_DIMENSIONS.deckY + wallHeight);
    expect(bounds.max.y - bounds.min.y, `${zone.id} roof thickness`)
      .toBeCloseTo(roofThickness);
  });

  build.disposeGeometry();
  materials.dispose();
});
```

- [ ] **Step 2: Run the roof test and confirm the defect**

Run:

```powershell
bun run test tests/ShipGeometry.test.ts -t "covers each enclosed room"
```

Expected: FAIL because `crewCabin-roof` is undefined.

- [ ] **Step 3: Add shared roof constants and room-height lookup**

Add the constants beside `ROOM_CORNER_SIZE`:

```ts
const ROOM_CORNER_SIZE = 0.24;
const ROOM_ROOF_THICKNESS = 0.24;
const ROOM_ROOF_OVERHANG = 0.175;
```

Add this helper before `addWallSegments`:

```ts
function roomWallHeight(zoneId: ShipZoneId): number {
  return zoneId === 'wheelhouse' ? WHEELHOUSE_WALL_HEIGHT : WALL_HEIGHT;
}
```

Use `roomWallHeight(zone.id)` in `addRoomCornerCaps`:

```ts
layout.zones.filter(({ enclosed }) => enclosed).forEach((zone) => {
  const height = roomWallHeight(zone.id);
  const material = zone.id === 'storageWorkroom'
    ? materials.paintedSteel
    : materials.paintedPanel;
```

- [ ] **Step 4: Replace the wheelhouse-only roof with a shared roof builder**

Delete the `addBlock` call that creates `wheelhouse-roof` at the end of `addWallSegments`. Keep the wheelhouse window-width and pillar code.

Add this function after `addRoomCornerCaps`:

```ts
function addRoomRoofs(
  root: Group,
  geometries: Set<BufferGeometry>,
  shellColliders: CollisionBox[],
  materials: ShipMaterials,
  layout: ShipLayoutSpec,
): void {
  layout.zones.filter(({ enclosed }) => enclosed).forEach((zone) => {
    const width = zone.bounds.maxX - zone.bounds.minX;
    const length = zone.bounds.maxZ - zone.bounds.minZ;
    const wallTopY = FREIGHTER_DIMENSIONS.deckY + roomWallHeight(zone.id);
    addBlock(root, geometries, shellColliders, {
      name: `${zone.id}-roof`,
      size: [
        width + ROOM_ROOF_OVERHANG * 2,
        ROOM_ROOF_THICKNESS,
        length + ROOM_ROOF_OVERHANG * 2,
      ],
      position: [
        (zone.bounds.minX + zone.bounds.maxX) / 2,
        wallTopY + ROOM_ROOF_THICKNESS / 2,
        (zone.bounds.minZ + zone.bounds.maxZ) / 2,
      ],
      material: materials.paintedSteel,
    });
  });
}
```

Call it after walls and corner caps:

```ts
addWallSegments(root, geometries, shellColliders, materials, layout);
addRoomCornerCaps(root, geometries, shellColliders, materials, layout);
addRoomRoofs(root, geometries, shellColliders, materials, layout);
```

- [ ] **Step 5: Run the roof test**

Run:

```powershell
bun run test tests/ShipGeometry.test.ts -t "covers each enclosed room"
```

Expected: PASS with one roof matching each enclosed zone's bounds and wall height.

- [ ] **Step 6: Run the geometry test file**

Run:

```powershell
bun run test tests/ShipGeometry.test.ts
```

Expected: PASS for the full file.

- [ ] **Step 7: Commit the roof repair**

```powershell
git add tests/ShipGeometry.test.ts src/world/ShipGeometry.ts
git commit -m "fix: roof enclosed freighter rooms"
```

---

### Task 2: Ground Both Smokestacks

**Files:**
- Modify: `tests/ShipGeometry.test.ts:127-156`
- Modify: `src/world/ShipGeometry.ts:49-57,510-549`

**Interfaces:**
- Consumes: `FREIGHTER_DIMENSIONS.deckY`, `MACHINERY_VISUAL_HEIGHT`, `STACK_OUTLET_Y`, and `ShipLayoutSpec.machineryClosure`.
- Produces: stack and collar meshes whose minimum Y equals the machinery-island maximum Y; preserves `ShipGeometryBuild.stackOutlets`.

- [ ] **Step 1: Write the failing stack-contact test**

Insert this test after `builds the approved single-level freighter shell and named zones`:

```ts
it('grounds both smokestacks and collars on the machinery island', () => {
  const materials = createShipMaterials();
  const build = createShipGeometry(materials);
  const island = build.root.getObjectByName('machinery-island');
  expect(island).toBeInstanceOf(Mesh);
  const islandTop = new Box3().setFromObject(island!).max.y;

  (['port', 'starboard'] as const).forEach((side, index) => {
    const stack = build.root.getObjectByName(`smokestack-${side}`);
    const collar = build.root.getObjectByName(`smokestack-${side}-collar`);
    expect(stack, side).toBeInstanceOf(Mesh);
    expect(collar, side).toBeInstanceOf(Mesh);
    const stackBounds = new Box3().setFromObject(stack!);
    const collarBounds = new Box3().setFromObject(collar!);

    expect(stackBounds.min.y, `${side} stack base`).toBeCloseTo(islandTop);
    expect(collarBounds.min.y, `${side} collar base`).toBeCloseTo(islandTop);
    expect(stackBounds.max.y, `${side} outlet`).toBeCloseTo(build.stackOutlets[index]!.y);
  });

  build.disposeGeometry();
  materials.dispose();
});
```

- [ ] **Step 2: Run the stack test and confirm the gap**

Run:

```powershell
bun run test tests/ShipGeometry.test.ts -t "grounds both smokestacks"
```

Expected: FAIL because the port stack base is `4.5` and the machinery-island top is `3.37`.

- [ ] **Step 3: Derive stack height from the machinery top**

Delete `const STACK_HEIGHT = 2.6;`.

Replace the fixed stack-center calculation in `addMachineryAndStacks` with:

```ts
const stackBaseY = FREIGHTER_DIMENSIONS.deckY + MACHINERY_VISUAL_HEIGHT;
const stackHeight = STACK_OUTLET_Y - stackBaseY;
const stackCenterY = stackBaseY + stackHeight / 2;
```

Replace the three stack-body lines inside `stackOutlets.forEach` with:

```ts
addCylinder(root, geometries, `smokestack-${side}`, STACK_RADIUS, stackHeight, [
  outlet.x,
  stackCenterY,
  outlet.z,
], materials.darkMetal);
addCylinder(root, geometries, `smokestack-${side}-collar`, STACK_COLLAR_RADIUS, STACK_COLLAR_HEIGHT, [
  outlet.x,
  stackBaseY + STACK_COLLAR_HEIGHT / 2,
  outlet.z,
], materials.exposedMetal);
addBlock(root, geometries, shellColliders, {
  name: `rust-streak-${side}-stack-collar`,
  size: [0.18, 0.7, 0.035],
  position: [outlet.x, stackBaseY - 0.2, machineryZ + STACK_RADIUS],
  material: materials.rust,
});
```

- [ ] **Step 4: Run the stack test**

Run:

```powershell
bun run test tests/ShipGeometry.test.ts -t "grounds both smokestacks"
```

Expected: PASS; both stack tops remain at `7.1`.

- [ ] **Step 5: Run the geometry test file**

Run:

```powershell
bun run test tests/ShipGeometry.test.ts
```

Expected: PASS for the full file.

- [ ] **Step 6: Commit the stack repair**

```powershell
git add tests/ShipGeometry.test.ts src/world/ShipGeometry.ts
git commit -m "fix: ground freighter smokestacks"
```

---

### Task 3: Remove the Paired Deck Artifacts

**Files:**
- Modify: `tests/ShipGeometry.test.ts:326-351`
- Modify: `src/world/ShipGeometry.ts:663-695`

**Interfaces:**
- Consumes: `createShipGeometry` mesh names and the current rail-opening weathering placement.
- Produces: no deck-drain meshes; retains `rust-streak-lifeboat-rail-opening` and both stack-collar rust meshes.

- [ ] **Step 1: Write the failing weathering test**

Insert this test after `uses one compact stern island and keeps every end-deck target open`:

```ts
it('omits the paired deck artifacts and keeps the remaining weathering', () => {
  const materials = createShipMaterials();
  const build = createShipGeometry(materials);
  const meshNames: string[] = [];
  build.root.traverse((object) => {
    if (object instanceof Mesh) meshNames.push(object.name);
  });

  expect(meshNames.filter((name) => name.startsWith('deck-drain-'))).toEqual([]);
  expect(meshNames.filter((name) => name.startsWith('rust-streak-deck-drain-')))
    .toEqual([]);
  expect(build.root.getObjectByName('rust-streak-lifeboat-rail-opening'))
    .toBeInstanceOf(Mesh);
  expect(build.root.getObjectByName('rust-streak-port-stack-collar')).toBeInstanceOf(Mesh);
  expect(build.root.getObjectByName('rust-streak-starboard-stack-collar'))
    .toBeInstanceOf(Mesh);

  build.disposeGeometry();
  materials.dispose();
});
```

- [ ] **Step 2: Run the weathering test and confirm the artifacts**

Run:

```powershell
bun run test tests/ShipGeometry.test.ts -t "omits the paired deck artifacts"
```

Expected: FAIL with `deck-drain-0` and `deck-drain-1` in the received array.

- [ ] **Step 3: Delete the drain and rust-strip creation loop**

Remove this block from `addWeathering`:

```ts
const drainZ = -2.5;
[-4.8, 4.8].forEach((x, index) => {
  addBlock(root, geometries, shellColliders, {
    name: `deck-drain-${index}`,
    size: [0.34, 0.025, 0.48],
    position: [x, FINISHED_FLOOR_Y + 0.0125, drainZ],
    material: materials.darkMetal,
  });
  addBlock(root, geometries, shellColliders, {
    name: `rust-streak-deck-drain-${index}`,
    size: [0.09, 0.015, 0.8],
    position: [x, FINISHED_FLOOR_Y + 0.0325, drainZ + 0.5],
    material: materials.rust,
  });
});
```

Keep the `rust-streak-lifeboat-rail-opening` block unchanged.

- [ ] **Step 4: Run the weathering test**

Run:

```powershell
bun run test tests/ShipGeometry.test.ts -t "omits the paired deck artifacts"
```

Expected: PASS with the lifeboat-opening and stack-collar weathering assertions intact.

- [ ] **Step 5: Run the geometry test file**

Run:

```powershell
bun run test tests/ShipGeometry.test.ts
```

Expected: PASS for the full file.

- [ ] **Step 6: Commit the deck cleanup**

```powershell
git add tests/ShipGeometry.test.ts src/world/ShipGeometry.ts
git commit -m "fix: remove freighter deck artifacts"
```

---

### Task 4: Full Verification and Browser Inspection

**Files:**
- Verify: `src/world/ShipGeometry.ts`
- Verify: `tests/ShipGeometry.test.ts`

**Interfaces:**
- Consumes: the completed geometry build and the repository verification scripts.
- Produces: test and visual evidence for the approved acceptance criteria.

- [ ] **Step 1: Run the required command suite**

Run each command and stop on the first failure:

```powershell
bun run models:check
bun run test
bun run typecheck
bun run build
```

Expected: all commands exit `0`; Vitest reports no failed tests; TypeScript reports no diagnostics; Vite completes a production build.

- [ ] **Step 2: Start the local game**

Run:

```powershell
bun run dev -- --host 127.0.0.1 --port 4173
```

Expected: Vite serves `http://127.0.0.1:4173/` with no browser-console errors.

- [ ] **Step 3: Inspect the title scene**

At a 1280 by 720 viewport, inspect the exterior ship behind the title UI. Confirm both stack collars touch the machinery island, all three room roofs render, and no paired floor marks appear at `x = -4.8` and `x = 4.8` near `z = -2.5`.

- [ ] **Step 4: Inspect active scavenging**

Begin evacuation and check the ship from player height:

- walk around both sides of the stern machinery island and inspect both stack bases;
- enter the crew cabin and storage/workroom, then look up to confirm each room has a closed ceiling;
- walk both cargo-deck edges past the former drain positions and confirm the deck material has no dark plate or rust strip;
- confirm smoke still emits from both stack outlets and the lifeboat-opening weathering remains.

- [ ] **Step 5: Review the final diff**

Run:

```powershell
git diff --check HEAD~3..HEAD
git diff --stat HEAD~3..HEAD
git status --short
```

Expected: `git diff --check` prints nothing, the stat lists only `ShipGeometry.ts` and `ShipGeometry.test.ts`, and the working tree is clean.

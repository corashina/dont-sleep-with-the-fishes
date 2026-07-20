# Midship Lifeboat, Scavenging HUD, and Item Orientations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Center the scavenging lifeboat station along the freighter, place the countdown watch to the right of the carry circles, and correct unnatural runtime item poses in both phases.

**Architecture:** Keep authored ship coordinates in `ShipLayout` and `Ship`, keep HUD composition in CSS while preserving the current DOM order, and keep base model rotations in `itemModelManifest`. Recalculate normalized bounds through the existing manifest pipeline and derive the affected boat slot heights from those bounds so scavenging and survival share one pose.

**Tech Stack:** TypeScript 5.9, Three.js 0.180, Vite 7, Vitest 3, CSS.

## Global Constraints

- Keep gameplay deterministic and testable without a renderer.
- Keep phase lifecycle, state rules, input, UI, rendering, and world construction in their current modules.
- Keep the shared wave field as the source of truth for ocean rendering, buoyancy, and vessel motion.
- Support keyboard operation and honor `prefers-reduced-motion`.
- Keep desktop keyboard and mouse as the milestone target.
- Do not add saves, touch controls, crewmates, multiplayer, or persistent progression.
- Keep all runtime assets local. Do not change model files or third-party provenance.
- Preserve naturally upright poses for food cans and the bucket.
- Run `bun run models:check`, `bun run test`, `bun run typecheck`, and `bun run build` before completion.

---

## File Structure

- `src/world/ShipLayout.ts`: authored station bounds, navigation target, rail opening, and evacuation rectangle.
- `src/world/Ship.ts`: world-space evacuation point and lifeboat anchor returned by ship construction.
- `src/styles/main.css`: horizontal carry/watch layout and narrow-width sizing.
- `src/world/itemModelManifest.ts`: shared rotations and rotation-derived normalized bounds.
- `src/world/BoatStorage.ts`: type-aware saved-item positions and floor-contact preservation.
- `tests/ShipLayout.test.ts`, `tests/ShipGeometry.test.ts`, `tests/PlayerController.test.ts`, `tests/interaction.test.ts`, `tests/world.test.ts`: centered station, collision, traversal, throw, buoyancy, and construction contracts.
- `tests/GameUI.test.ts`: DOM order, horizontal CSS, and responsive watch sizing.
- `tests/itemModelManifest.test.ts`: exact semantic rotation contract for all nineteen item types.
- `tests/BoatStorage.test.ts`: saved-item floor contact, separation, and hull containment.

### Task 1: Move the Scavenging Lifeboat Station to Midship

**Files:**
- Modify: `tests/ShipLayout.test.ts`
- Modify: `tests/ShipGeometry.test.ts`
- Modify: `tests/collisions.test.ts`
- Modify: `tests/PlayerController.test.ts`
- Modify: `tests/interaction.test.ts`
- Modify: `tests/world.test.ts`
- Modify: `src/world/ShipLayout.ts`
- Modify: `src/world/Ship.ts`

**Interfaces:**
- Consumes: `SHIP_LAYOUT`, `createShip()`, `World.evacuationPoint`, and `World.lifeboat`.
- Produces: a station centered at local `z = 0`, `ShipBuild.evacuationPoint = new Vector3(5.4, 3.72, 0)`, and `ShipBuild.lifeboatAnchor = new Vector3(9.0, 0.35, 0)`.

- [ ] **Step 1: Write the failing authored-layout test**

Add these assertions to the first layout-contract test in `tests/ShipLayout.test.ts`:

```ts
const lifeboatStation = SHIP_LAYOUT.zones.find(({ id }) => id === 'lifeboatStation')!;
const evacuation = SHIP_LAYOUT.targets.find(({ kind }) => kind === 'evacuation')!;
expect(lifeboatStation.bounds).toEqual({ minX: 3.8, maxX: 6, minZ: -1.6, maxZ: 1.6 });
expect(lifeboatStation.furniturePolicy.clearCenter).toEqual({
  minX: 5.05, maxX: 5.75, minZ: -0.35, maxZ: 0.35,
});
expect(evacuation.position).toEqual([5.4, 0]);
expect(SHIP_LAYOUT.evacuationRect).toEqual({
  minX: 5.05, maxX: 5.75, minZ: -0.35, maxZ: 0.35,
});
expect(SHIP_LAYOUT.rail.starboardOpening).toEqual({ centerZ: 0, width: 3.2 });
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `bun run test -- tests/ShipLayout.test.ts`

Expected: FAIL because the station and evacuation data still use `z = -6.5`.

- [ ] **Step 3: Move the authored layout data**

Change `src/world/ShipLayout.ts` to use:

```ts
const lifeboatBounds = rect(3.8, 6, -1.6, 1.6);
```

```ts
result.push({ id: 'evacuation', position: [5.4, 0], kind: 'evacuation' });
```

```ts
clearCenter: rect(5.05, 5.75, -0.35, 0.35),
```

```ts
starboardOpening: { centerZ: 0, width: 3.2 },
```

```ts
evacuationRect: rect(5.05, 5.75, -0.35, 0.35),
```

Replace the old hard-coded opening coverage check with the authored station bounds:

```ts
if (openingMinZ > lifeboatBounds.minZ || openingMaxZ < lifeboatBounds.maxZ || !evacuation
  || evacuation.position[1] < openingMinZ || evacuation.position[1] > openingMaxZ) {
  throw new Error('Starboard rail opening must cover the lifeboat station and evacuation target');
}
```

- [ ] **Step 4: Update dependent tests before moving physical endpoints**

Make these exact expectation changes:

```ts
// tests/ShipGeometry.test.ts
new Vector3(5.9, 3.72, 0)
```

```ts
// The approved-opening test must test adjacent solid rail instead of treating z = 0 as solid.
[openingMin - 0.01, openingMax + 0.01, 6.5].forEach((z) => {
  expect(railColliderAt(build, railX, z), `starboard rail collider at ${z}`).toBeDefined();
});
```

```ts
// tests/ShipGeometry.test.ts, movement through the opening
const lifeboatGap = resolveLocalMovement(
  { x: 5.4, y: 3.72, z: 0 },
  { x: 6.4, y: 3.72, z: 0 },
  0.35,
  build.shellColliders,
);
```

Replace the old production midship-rail assertion in `tests/collisions.test.ts` with explicit open and blocked samples:

```ts
it('allows a standing player through the production midship rail opening', () => {
  const ship = createTestShip();
  try {
    const result = resolveLocalMovement(
      { x: 5.4, y: PLAYER_Y, z: 0 },
      { x: 6.4, y: PLAYER_Y, z: 0 },
      PLAYER_LAYOUT_RADIUS,
      ship.colliders,
    );
    expect(result.x).toBeCloseTo(6.4);
  } finally {
    ship.dispose();
  }
});

it('blocks a standing player at the adjacent production waist rail', () => {
  const ship = createTestShip();
  try {
    const result = resolveLocalMovement(
      { x: 5.4, y: PLAYER_Y, z: 4 },
      { x: 6.4, y: PLAYER_Y, z: 4 },
      PLAYER_LAYOUT_RADIUS,
      ship.colliders,
    );
    expect(result.x).toBeLessThan(6);
  } finally {
    ship.dispose();
  }
});
```

```ts
// tests/PlayerController.test.ts
['lifeboat approach', new Vector3(5.9, 3.72, 0)],
```

```ts
// tests/interaction.test.ts
camera.position.set(5.4, 3.72, 0);
camera.lookAt(9.0, 1.5, 0);
const lifeboatBox = new Box3(
  new Vector3(7.65, 0.05, -2.72),
  new Vector3(10.35, 1.35, 2.72),
);
```

Update `tests/world.test.ts` to sample buoyancy at `(9.0, 0)`, expect the lifeboat `z` position at `expectedPose.driftZ`, and expect the ship endpoints at the new coordinates:

```ts
const target = buoyancy.sampleTarget(time, 9.0, 0, sinking.waveAmplitudeScale);
expect(world.lifeboat.position.z).toBeCloseTo(expectedPose.driftZ);
expect(ship.evacuationPoint.toArray()).toEqual([5.4, 3.72, 0]);
expect(ship.lifeboatAnchor.toArray()).toEqual([9.0, 0.35, 0]);
```

- [ ] **Step 5: Run the affected tests and verify the physical endpoints still fail**

Run: `bun run test -- tests/ShipLayout.test.ts tests/ShipGeometry.test.ts tests/collisions.test.ts tests/PlayerController.test.ts tests/interaction.test.ts tests/world.test.ts`

Expected: FAIL in world construction and buoyancy assertions because `Ship.ts` still returns the old endpoints.

- [ ] **Step 6: Move the physical endpoints**

Change `src/world/Ship.ts`:

```ts
evacuationPoint: new Vector3(5.4, 3.72, 0),
lifeboatAnchor: new Vector3(9.0, 0.35, 0),
```

- [ ] **Step 7: Run the affected tests and verify GREEN**

Run: `bun run test -- tests/ShipLayout.test.ts tests/ShipGeometry.test.ts tests/collisions.test.ts tests/PlayerController.test.ts tests/interaction.test.ts tests/world.test.ts`

Expected: PASS.

- [ ] **Step 8: Commit the centered station**

```text
git add src/world/ShipLayout.ts src/world/Ship.ts tests/ShipLayout.test.ts tests/ShipGeometry.test.ts tests/collisions.test.ts tests/PlayerController.test.ts tests/interaction.test.ts tests/world.test.ts
git commit -m "feat: move scavenging lifeboat to midship"
```

### Task 2: Place the Clock to the Right of the Carry Circles

**Files:**
- Modify: `tests/GameUI.test.ts`
- Modify: `src/styles/main.css`

**Interfaces:**
- Consumes: the existing `.carried` container with `.weight-circles__row` followed by `.pocket-watch`.
- Produces: a centered horizontal HUD group with a 12-pixel desktop gap and an 8-pixel narrow-width gap.

- [ ] **Step 1: Replace the old vertical-layout test with a failing horizontal contract**

Replace `stacks the watch below the carry circles and backs the countdown` in `tests/GameUI.test.ts` with:

```ts
it('places the watch to the right of the carry circles and backs the countdown', () => {
  expect(mainStyles).toMatch(
    /\.carried\s*\{[^}]*display:\s*flex;[^}]*flex-direction:\s*row;[^}]*align-items:\s*center;[^}]*gap:\s*12px;/s,
  );
  expect(mainStyles).toMatch(
    /\.pocket-watch\s*\{[^}]*position:\s*relative;[^}]*top:\s*auto;[^}]*right:\s*auto;[^}]*left:\s*auto;[^}]*margin-top:\s*0;/s,
  );
  expect(mainStyles).toMatch(
    /@media \(max-width:\s*820px\)[\s\S]*?\.carried\s*\{[^}]*gap:\s*8px;[^}]*\}[\s\S]*?\.pocket-watch\s*\{[^}]*width:\s*96px;[^}]*height:\s*72px;/s,
  );
  expect(mainStyles).toMatch(
    /\.pocket-watch \[data-timer\]\s*\{[^}]*background:\s*#090b0ce6;[^}]*color:\s*var\(--ink-bone\);/s,
  );
});
```

Keep the DOM-order test that expects `weight-circles__row` before `timer-block pocket-watch`.

- [ ] **Step 2: Run the focused test and verify RED**

Run: `bun run test -- tests/GameUI.test.ts`

Expected: FAIL because `.carried` uses `flex-direction: column` and the watch has `margin-top: 6px`.

- [ ] **Step 3: Implement the horizontal desktop and narrow layouts**

Change the base rules in `src/styles/main.css`:

```css
.carried {
  position: absolute;
  top: 16px;
  left: 50%;
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 12px;
  transform: translateX(-50%);
}
```

```css
.pocket-watch {
  position: relative;
  top: auto;
  right: auto;
  left: auto;
  flex: none;
  width: 116px;
  height: 88px;
  margin-top: 0;
  transform: rotate(2deg);
}
```

Extend the existing `@media (max-width: 820px)` block:

```css
.carried { gap: 8px; }
.pocket-watch { width: 96px; height: 72px; }
.pocket-watch__art { inset: -4px auto auto 12px; width: 72px; }
.pocket-watch [data-timer] { top: 27px; min-width: 58px; font-size: 1.08rem; }
```

- [ ] **Step 4: Run the focused test and verify GREEN**

Run: `bun run test -- tests/GameUI.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit the HUD layout**

```text
git add src/styles/main.css tests/GameUI.test.ts
git commit -m "feat: place scavenging clock beside carry dots"
```

### Task 3: Correct Shared Item Poses and Preserve Boat Floor Contact

**Files:**
- Modify: `tests/itemModelManifest.test.ts`
- Modify: `tests/BoatStorage.test.ts`
- Modify: `src/world/itemModelManifest.ts`
- Modify: `src/world/BoatStorage.ts`

**Interfaces:**
- Consumes: `ITEM_MODEL_SPECS[id].rotation`, `ITEM_MODEL_SPECS[id].normalizedBounds`, and `boatStorageTransform(instance)`.
- Produces: exact semantic rotations for all `ItemId` values and stable saved-item bottom heights for the six corrected poses.

- [ ] **Step 1: Write the failing full-manifest orientation test**

Add this constant and test to `tests/itemModelManifest.test.ts`:

```ts
const EXPECTED_ROTATIONS = {
  cannedFood: [0, 0, 0], baitTin: [0, 0, 0], ductTape: [0, 0, 0],
  compass: [0, 0, 0], map: [0, 0, 0], medicalKit: [0, 0, 0],
  spyglass: [0, 0, 0], fishingNet: [Math.PI / 2, 0, 0], bucket: [0, 0, 0],
  flareGun: [0, Math.PI / 2, 0], scubaSet: [Math.PI / 2, 0, 0],
  anchor: [0, 0, 0], bottledPaper: [Math.PI / 2, 0, 0],
  umbrella: [Math.PI / 2, 0, 0], swimRing: [0, 0, 0],
  flashlight: [Math.PI / 2, 0, 0], harpoonGun: [0, 0, 0],
  energyBar: [0, 0, 0], fishingRod: [Math.PI / 2, 0, 0],
} as const satisfies Readonly<Record<ItemId, readonly [number, number, number]>>;

it('authors a natural resting rotation for every runtime item', () => {
  for (const id of ITEM_IDS) {
    expect(ITEM_MODEL_SPECS[id].rotation, id).toEqual(EXPECTED_ROTATIONS[id]);
  }
});
```

- [ ] **Step 2: Run the manifest test and verify RED**

Run: `bun run test -- tests/itemModelManifest.test.ts`

Expected: FAIL for duct tape, fishing net, scuba gear, bottled paper, umbrella, and flashlight.

- [ ] **Step 3: Correct the shared rotations**

Change only these entries in `src/world/itemModelManifest.ts`:

```ts
ductTape: { targetLongestDimension: 0.55, rotation: [0, 0, 0], offset: [0, 0, 0] },
fishingNet: { targetLongestDimension: 0.82, rotation: [Math.PI / 2, 0, 0], offset: [0, 0, 0] },
scubaSet: { targetLongestDimension: 0.88, rotation: [Math.PI / 2, 0, 0], offset: [0, 0.25, 0] },
bottledPaper: { targetLongestDimension: 0.62, rotation: [Math.PI / 2, 0, 0], offset: [0, 0, 0] },
umbrella: { targetLongestDimension: 0.90, rotation: [Math.PI / 2, 0, 0], offset: [0, 0, 0] },
flashlight: { targetLongestDimension: 0.72, rotation: [Math.PI / 2, 0, 0], offset: [0, 0.19, 0] },
```

- [ ] **Step 4: Verify orientation GREEN and expose the boat-contact regression**

Run: `bun run test -- tests/itemModelManifest.test.ts tests/BoatStorage.test.ts`

Expected: the manifest test passes. Existing boat-storage tests may pass because they do not lock the prior lowest points.

- [ ] **Step 5: Add the saved-item bottom-height regression test**

Add this test to `tests/BoatStorage.test.ts`:

```ts
it.each([
  ['ductTape', -0.3775],
  ['fishingNet', -0.365],
  ['scubaSet', -0.315],
  ['bottledPaper', -0.335],
  ['umbrella', -0.325],
  ['flashlight', -0.185],
] as const)('preserves the %s lowest point after laying it down', async (type, bottomY) => {
  const library = await loadProductionPropModels();
  const root = placedProductionProp(library, { instanceId: `${type}-1`, type });
  try {
    expect(new Box3().setFromObject(root).min.y).toBeCloseTo(bottomY, 5);
  } finally {
    disposeOwnedMeshes(root);
    library.dispose();
  }
});
```

- [ ] **Step 6: Run the bottom-height test and verify RED**

Run: `bun run test -- tests/BoatStorage.test.ts -t "lowest point"`

Expected: FAIL because the corrected models now use the old slot center heights.

- [ ] **Step 7: Derive affected slot heights from normalized bounds**

Import the manifest in `src/world/BoatStorage.ts`:

```ts
import { ITEM_MODEL_SPECS } from './itemModelManifest';
```

Add this helper beside `slot`:

```ts
const floorSlot = (
  id: ItemId,
  x: number,
  z: number,
  yaw: number,
  scale: number,
  bottomY: number,
): SlotSpec => slot([
  x,
  bottomY - ITEM_MODEL_SPECS[id].normalizedBounds.min[1] * scale,
  z,
], yaw, scale);
```

Replace the affected slots:

```ts
ductTape: [floorSlot('ductTape', -0.70, -0.25, 0.28, 0.50, -0.3775)],
fishingNet: [floorSlot('fishingNet', 0.70, 0.45, 0.10, 0.50, -0.365)],
scubaSet: [floorSlot('scubaSet', 1.00, -1.45, -0.16, 0.50, -0.315)],
bottledPaper: [floorSlot('bottledPaper', 1.35, 1.15, -0.08, 0.50, -0.335)],
umbrella: [floorSlot('umbrella', 1.35, 0.45, 0.10, 0.50, -0.325)],
flashlight: [floorSlot('flashlight', 1.25, -0.95, 0.10, 0.50, -0.185)],
```

- [ ] **Step 8: Run model, boat storage, and ship placement tests**

Run: `bun run test -- tests/itemModelManifest.test.ts tests/PropModelLibrary.test.ts tests/BoatStorage.test.ts tests/ShipItemPlacement.test.ts`

Expected: PASS. If the maximum-inventory envelope test reports a specific overlap, move only the reported affected slot in `BoatStorage.ts`, add its exact transform to the regression test, and rerun until the hull, separation, and center-aisle tests pass.

- [ ] **Step 9: Commit the shared item poses**

```text
git add src/world/itemModelManifest.ts src/world/BoatStorage.ts tests/itemModelManifest.test.ts tests/BoatStorage.test.ts
git commit -m "fix: lay scavenging items in natural poses"
```

### Task 4: Full Verification and Visual Inspection

**Files:**
- Modify only if verification exposes a scoped regression in a file changed above.

**Interfaces:**
- Consumes: the completed ship, HUD, manifest, and storage changes.
- Produces: verified desktop behavior in both game phases.

- [ ] **Step 1: Run the model policy audit**

Run: `bun run models:check`

Expected: PASS with nineteen item models, ship furniture models, and totals within their triangle budgets.

- [ ] **Step 2: Run the complete automated verification suite**

Run: `bun run test`

Expected: PASS with no failed tests.

Run: `bun run typecheck`

Expected: exit code 0 with no TypeScript errors.

Run: `bun run build`

Expected: exit code 0 and a successful Vite production build.

- [ ] **Step 3: Inspect the active scavenging phase in the browser**

Run: `bun run dev -- --host 127.0.0.1 --port 4173`.

Inspect at desktop width and at 820 pixels or narrower:

- the lifeboat floats outside the starboard rail at the ship midpoint;
- the centered rail gap and deck drop-off align with the boat;
- the watch sits to the right of the three carry circles without overlap;
- the timer, prompt, crosshair, and FPS overlay remain readable;
- food cans and bucket stand upright;
- duct tape, fishing net, scuba gear, bottled paper, umbrella, flashlight, and fishing rod lie in natural poses;
- the remaining item models retain their approved poses.

- [ ] **Step 4: Inspect saved items in survival**

Carry representative corrected items into the boat, evacuate, and confirm that survival shows the same base rotations with each prop resting at its authored boat-storage height. Confirm no saved props overlap or leave the hull.

- [ ] **Step 5: Review the final diff**

Run: `git diff --check HEAD~4..HEAD`

Expected: no whitespace errors.

Run: `git status --short`

Expected: only the pre-existing untracked historical plan files remain. Do not stage or delete them.

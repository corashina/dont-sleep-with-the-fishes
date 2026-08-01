# Scavenging Level Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build fixed loop mazes, spread category-free items across the ship, slow loaded movement, and guarantee a difficult sub-60-second expert route.

**Architecture:** `ShipLayout` remains the static source for furniture, lanes, regions, and spots. Pure movement and route modules calculate loaded speed and feasible collection routes without renderer state. `ShipItemPlacement` uses those modules to accept only deterministic, spread, time-valid layouts before `World` creates item models.

**Tech Stack:** TypeScript 5.9, Three.js 0.180, Vitest 3.2, Vite 7

## Global Constraints

- Keep the scavenging limit at exactly 60 seconds.
- Keep exactly 21 scavenging items and carry capacity three.
- Target 15 to 17 saved items for the baseline route.
- Accept expert routes from 54 through 58 seconds.
- Keep weight-three item routes at 14 metres or less.
- Keep weight-two item routes at 22 metres or less.
- Use speed multipliers `1.00`, `0.92`, and `0.84` for filled weight one, two, and three.
- Keep exterior and evacuation routes at least 2.2 metres wide.
- Keep room loops and standing access at least 1.4 metres wide.
- Use at least 50 owned and reachable item spots.
- Put all bow and stern items on raised furniture.
- Exclude the crow's nest from item placement.
- Keep randomness behind an injected source.
- Keep gameplay rules independent from Three.js and renderer state.
- Do not allocate or configure resources in per-frame movement or render paths.
- Do not add reduced-motion behavior.
- Preserve all pre-existing worktree changes.
- Do not stage unrelated hunks from already modified files.

---

### Task 1: Pure Carry-Speed Rules

**Files:**
- Create: `src/game/scavengeMovement.ts`
- Create: `tests/scavengeMovement.test.ts`
- Modify: `src/player/PlayerController.ts:98-118`
- Modify: `tests/PlayerController.test.ts`

**Interfaces:**
- Consumes: carried weight from `ScavengeSnapshot.carriedWeight`.
- Produces: `scavengeSpeedMultiplier(carriedWeight: number): number`.
- Produces: `PlayerController.update(delta, input, speedMultiplier?: number)`.

- [ ] **Step 1: Write the pure multiplier tests**

```ts
import { describe, expect, it } from 'vitest';
import { scavengeSpeedMultiplier } from '../src/game/scavengeMovement';

describe('scavenge movement', () => {
  it.each([
    [0, 1], [1, 1], [2, 0.92], [3, 0.84],
  ])('maps carried weight %s to multiplier %s', (weight, expected) => {
    expect(scavengeSpeedMultiplier(weight)).toBe(expected);
  });

  it.each([Number.NaN, -1, Number.POSITIVE_INFINITY])(
    'uses full speed for invalid weight %s',
    (weight) => expect(scavengeSpeedMultiplier(weight)).toBe(1),
  );
});
```

- [ ] **Step 2: Run the new test and confirm the missing module failure**

Run: `bunx vitest run tests/scavengeMovement.test.ts`

Expected: FAIL because `src/game/scavengeMovement.ts` does not exist.

- [ ] **Step 3: Add the pure speed rule**

```ts
export const SCAVENGE_WALK_SPEED = 3.8;
export const SCAVENGE_SPRINT_SPEED = 6.2;

export function scavengeSpeedMultiplier(carriedWeight: number): number {
  if (!Number.isFinite(carriedWeight) || carriedWeight < 0) return 1;
  if (carriedWeight >= 3) return 0.84;
  if (carriedWeight >= 2) return 0.92;
  return 1;
}
```

- [ ] **Step 4: Add controller distance tests**

Add a table-driven test to `tests/PlayerController.test.ts`. Create a controller
without colliders, face it along one axis, move for one second, and compare
planar distance.

```ts
it.each([
  [1, 3.8],
  [0.92, 3.8 * 0.92],
  [0.84, 3.8 * 0.84],
])('applies planar speed multiplier %s', (multiplier, expectedDistance) => {
  const input = new TestInput();
  const controller = new PlayerController(
    new PerspectiveCamera(),
    new Object3D(),
    new Vector3(0, 3.72, 0),
    [],
    TEST_NAVIGATION_BOUNDS,
    vi.fn(),
  );
  input.movement = { x: 0, z: -1 };
  const sample = controller.update(1, input.asControllerInput(), multiplier);
  expect(sample.movedDistance).toBeCloseTo(expectedDistance);
});
```

Keep the existing ladder-jump work. Add one assertion that jump height is equal
for multipliers `1` and `0.84`.

- [ ] **Step 5: Run the controller tests and confirm signature failures**

Run: `bunx vitest run tests/PlayerController.test.ts`

Expected: FAIL because `PlayerController.update` accepts two parameters.

- [ ] **Step 6: Apply the multiplier only to planar input movement**

Change the method signature and speed calculation.

```ts
update(
  delta: number,
  input: InputController,
  speedMultiplier = 1,
): PlayerMotionSample {
  const safeMultiplier = Number.isFinite(speedMultiplier)
    ? Math.max(0, speedMultiplier)
    : 1;
  const baseSpeed = input.sprinting ? SCAVENGE_SPRINT_SPEED : SCAVENGE_WALK_SPEED;
  const speed = baseSpeed * safeMultiplier;
```

Import both speed constants from `src/game/scavengeMovement.ts`. Do not apply
the multiplier to jump velocity, gravity, ladder climb speed, or ladder jump
velocity.

- [ ] **Step 7: Run focused movement tests**

Run: `bunx vitest run tests/scavengeMovement.test.ts tests/PlayerController.test.ts tests/LadderTraversal.test.ts`

Expected: PASS.

- [ ] **Step 8: Commit isolated files when safe**

Stage the new movement module and test first. Stage controller hunks only if
they exclude the pre-existing ladder changes.

```powershell
git add src/game/scavengeMovement.ts tests/scavengeMovement.test.ts
git diff --cached --check
git commit -m "feat: add scavenging carry speed rules"
```

Leave overlapping controller hunks unstaged if they cannot be isolated safely.

---

### Task 2: Navigable Route Metric and Spot Metadata

**Files:**
- Modify: `src/world/ShipLayout.ts:16-40, 1210-1420`
- Modify: `src/world/ShipItemPlacement.ts:13-38`
- Modify: `src/world/ShipFurniture.ts:185-218`
- Modify: `tests/ShipLayout.test.ts`
- Modify: `tests/ShipItemPlacement.test.ts`

**Interfaces:**
- Consumes: `ShipLayoutSpec`, furniture colliders, and surface standing points.
- Produces: `ScavengeRegionId` and `ShipItemSurfaceSpec.regionId`.
- Produces: `ShipItemSurfaceSpec.branch` and transformed equivalents.
- Produces: `createShipRouteMetric(layout): ShipRouteMetric`.
- Produces: `ShipRouteMetric.distance(from, to): number | null`.

- [ ] **Step 1: Write route metric tests**

Add tests beside `analyzeShipNavigation` coverage.

```ts
it('measures the shortest navigable route around furniture', () => {
  const metric = createShipRouteMetric(SHIP_LAYOUT);
  const direct = Math.hypot(7.025, 11);
  const routed = metric.distance([0, 11], [7.025, 0]);
  expect(routed).not.toBeNull();
  expect(routed!).toBeGreaterThan(direct);
});

it('returns null when either point has no reachable grid cell', () => {
  const metric = createShipRouteMetric(SHIP_LAYOUT);
  expect(metric.distance([0, 0], [99, 99])).toBeNull();
});
```

Add a symmetry assertion. Add a test that repeated calls return the same exact
number.

- [ ] **Step 2: Run the route tests and confirm missing exports**

Run: `bunx vitest run tests/ShipLayout.test.ts`

Expected: FAIL because `createShipRouteMetric` does not exist.

- [ ] **Step 3: Add region and branch metadata**

Add these exact types and fields.

```ts
export type ScavengeRegionId =
  | 'crewCabin'
  | 'wheelhouse'
  | 'centralCargo'
  | 'storageWorkroom'
  | 'bow'
  | 'stern';

export interface ShipItemSurfaceSpec {
  readonly id: string;
  readonly physicalSlotId: string;
  readonly categories: readonly ShipItemCategory[];
  readonly regionId: ScavengeRegionId;
  readonly branch: boolean;
  readonly localPosition: readonly [number, number, number];
  readonly localRotation: readonly [number, number, number];
  readonly footprint: { readonly width: number; readonly depth: number };
  readonly clearanceHeight: number;
  readonly standingPoints: readonly (readonly [number, number, number])[];
  readonly fallback: boolean;
}
```

Mirror `regionId` and `branch` on `ShipItemSurface`. Copy both fields in
`transformedSurfaces`. Update test surface builders with defaults
`regionId: 'centralCargo'` and `branch: false`.

- [ ] **Step 4: Extract a reusable navigation grid builder**

Refactor the existing raster setup inside `analyzeShipNavigation` into one
internal builder. Reuse the existing 0.1-metre grid, inflated obstacles, hull
polygon, and diagonal corner checks.

```ts
interface ShipNavigationGrid {
  readonly minX: number;
  readonly minZ: number;
  readonly columns: number;
  readonly rows: number;
  readonly blocked: Uint8Array;
  toCell(point: readonly [number, number]): number | undefined;
  cellPoint(index: number): readonly [number, number];
}
```

`analyzeShipNavigation` must consume this builder without changing its current
return values.

- [ ] **Step 5: Implement cached A-star route distance**

```ts
export interface ShipRouteMetric {
  distance(
    from: readonly [number, number],
    to: readonly [number, number],
  ): number | null;
}

export function createShipRouteMetric(
  layout: ShipLayoutSpec = SHIP_LAYOUT,
): ShipRouteMetric;
```

Use cardinal cost `GRID_STEP` and diagonal cost `GRID_STEP * Math.SQRT2`.
Reject diagonal corner cuts with the same rule as reachability. Cache by the
ordered pair of snapped cell indexes so reverse calls reuse the result. Return
`null` for invalid, blocked, or disconnected cells.

- [ ] **Step 6: Validate surface metadata**

Create a set of the six region IDs. Reject an unknown region. Reject a bow or
stern surface whose owner is not furniture. Keep existing finite, ownership,
reach, collision, and alias checks.

- [ ] **Step 7: Run focused layout and placement tests**

Run: `bunx vitest run tests/ShipLayout.test.ts tests/ShipItemPlacement.test.ts`

Expected: PASS with unchanged navigation analysis results.

- [ ] **Step 8: Commit only isolated metadata and metric hunks**

```powershell
git diff --check -- src/world/ShipLayout.ts src/world/ShipItemPlacement.ts src/world/ShipFurniture.ts tests/ShipLayout.test.ts tests/ShipItemPlacement.test.ts
```

Do not stage the current room-dressing hunks. Defer the commit if clean hunk
separation is not possible.

---

### Task 3: Pure Expert and Baseline Route Planner

**Files:**
- Create: `src/game/ScavengeRoutePlanner.ts`
- Create: `tests/ScavengeRoutePlanner.test.ts`

**Interfaces:**
- Consumes: item weight, assigned standing position, and `ShipRouteMetric`.
- Produces: `planExpertScavengeRoute(input): ScavengeRoutePlan | null`.
- Produces: `planBaselineScavengeRoute(input): ScavengeRoutePlan`.
- Produces: a concrete ordered action list for validation and tests.

- [ ] **Step 1: Write planner contract tests**

Use a one-dimensional metric so expected times stay exact.

```ts
const metric = {
  distance: (left: readonly [number, number], right: readonly [number, number]) =>
    Math.abs(left[0] - right[0]),
};

const assignment = (
  instanceId: string,
  weight: 1 | 2 | 3,
  position: readonly [number, number],
): ScavengeRouteAssignment => ({ instanceId, weight, position, branch: false });

function maxCarriedWeight(actions: readonly ScavengeRouteAction[]): number {
  let carried = 0;
  let maximum = 0;
  actions.forEach((action) => {
    if (action.type === 'pickup') carried += action.weight;
    if (action.type === 'deposit') carried = 0;
    maximum = Math.max(maximum, carried);
  });
  return maximum;
}

it('builds a capacity-safe route that deposits and evacuates', () => {
  const plan = planExpertScavengeRoute({
    assignments: [
      assignment('light-1', 1, [2, 0]),
      assignment('heavy-1', 2, [3, 0]),
      assignment('anchor-1', 3, [1, 0]),
    ],
    start: [0, 0],
    deposit: [0, 0],
    evacuation: [0, 0],
    metric,
  });
  expect(plan).not.toBeNull();
  expect(plan!.savedCount).toBe(3);
  expect(plan!.actions.at(-1)?.type).toBe('evacuate');
  expect(maxCarriedWeight(plan!.actions)).toBeLessThanOrEqual(3);
});
```

Add tests for loaded segment multipliers, unreachable spots, deterministic
ties, deposit reset, the 60-second cutoff, and baseline stopping at the limit.

- [ ] **Step 2: Run the planner tests and confirm missing module failure**

Run: `bunx vitest run tests/ScavengeRoutePlanner.test.ts`

Expected: FAIL because the planner module does not exist.

- [ ] **Step 3: Define route types and action costs**

```ts
export const SCAVENGE_PICKUP_ACTION_SECONDS = 0.18;
export const SCAVENGE_DEPOSIT_ACTION_SECONDS = 0.28;
export const SCAVENGE_EVACUATE_ACTION_SECONDS = 0.1;

export interface ScavengeRouteAssignment {
  readonly instanceId: string;
  readonly weight: 1 | 2 | 3;
  readonly position: readonly [number, number];
  readonly branch: boolean;
}

export type ScavengeRouteAction =
  | { readonly type: 'move'; readonly distance: number; readonly carriedWeight: number }
  | { readonly type: 'pickup'; readonly instanceId: string; readonly weight: 1 | 2 | 3 }
  | { readonly type: 'deposit'; readonly instanceIds: readonly string[] }
  | { readonly type: 'evacuate' };

export interface ScavengeRoutePlan {
  readonly seconds: number;
  readonly savedCount: number;
  readonly actions: readonly ScavengeRouteAction[];
}

export interface ScavengeRouteInput {
  readonly assignments: readonly ScavengeRouteAssignment[];
  readonly start: readonly [number, number];
  readonly deposit: readonly [number, number];
  readonly evacuation: readonly [number, number];
  readonly metric: ShipRouteMetric;
  readonly deadlineSeconds?: number;
}

export function planExpertScavengeRoute(
  input: ScavengeRouteInput,
): ScavengeRoutePlan | null;

export function planBaselineScavengeRoute(
  input: ScavengeRouteInput,
): ScavengeRoutePlan;
```

Use `SCAVENGE_SPRINT_SPEED * scavengeSpeedMultiplier(carriedWeight)` for every
move segment.

- [ ] **Step 4: Implement deterministic expert beam search**

Use a beam width of 256. A state contains remaining item indexes, current
position, carried IDs, carried weight, elapsed seconds, and actions. Expand at
most the six nearest fitting items plus a deposit transition when carrying.
Discard states over 60 seconds. Keep the cheapest state for the same remaining
mask, position, and carried-weight key. Sort ties by instance ID.

Return only a route that deposits every item and reaches evacuation. The
returned action list is the constructive proof of feasibility.

- [ ] **Step 5: Implement the baseline policy**

The baseline policy chooses the nearest uncollected non-branch item. It chooses
a branch item only when its added round-trip distance is at most 4 metres. It
deposits when no fitting item remains within 8 metres. It stops before an
action would cross 60 seconds.

- [ ] **Step 6: Run planner tests**

Run: `bunx vitest run tests/ScavengeRoutePlanner.test.ts tests/scavengeMovement.test.ts`

Expected: PASS.

- [ ] **Step 7: Commit the isolated planner unit**

```powershell
git add src/game/ScavengeRoutePlanner.ts tests/ScavengeRoutePlanner.test.ts
git diff --cached --check
git commit -m "feat: add scavenging route planner"
```

---

### Task 4: Fixed Room Loops, Cargo Clutter, and Raised End Props

**Files:**
- Modify: `src/world/ShipLayout.ts:245-1040`
- Modify: `src/world/ShipFurniture.ts:25-285`
- Modify: `tests/ShipLayout.test.ts`
- Modify: `tests/SceneResources.test.ts`

**Interfaces:**
- Consumes: current room bounds, collision validation, and ship materials.
- Produces: fixed room loops and at least 50 authored surface specs.
- Produces: generated `timberBench` furniture with one clear owner.

- [ ] **Step 1: Replace open-center assertions with loop assertions**

Add exact region spot minimums.

```ts
const minimumSpots = {
  crewCabin: 10,
  wheelhouse: 8,
  storageWorkroom: 10,
  centralCargo: 14,
  bow: 4,
  stern: 4,
} as const;

it('provides the approved spread of raised item spots', () => {
  const surfaces = SHIP_LAYOUT.furniture.flatMap(({ surfaces }) => surfaces);
  expect(surfaces.length).toBeGreaterThanOrEqual(50);
  for (const [regionId, minimum] of Object.entries(minimumSpots)) {
    expect(surfaces.filter((surface) => surface.regionId === regionId).length)
      .toBeGreaterThanOrEqual(minimum);
  }
});
```

Add assertions for two room-loop targets per room, two full cargo routes,
cross-routes, clear doors, ladders, hatch, mast, and evacuation. Assert every
bow and stern surface owner has model `cargoCrate`, `barrel`, or `cargoBox`.

- [ ] **Step 2: Run layout tests and confirm the new contracts fail**

Run: `bunx vitest run tests/ShipLayout.test.ts`

Expected: FAIL on spot counts, region metadata, loops, and end props.

- [ ] **Step 3: Add the generated timber bench kind**

Extend `ShipFurnitureKind` with `timberBench`. Render it with the shared owned
box geometry.

```ts
function createTimberBench(
  parent: Group,
  geometry: BoxGeometry,
  materials: ShipMaterials,
  size: readonly [number, number, number],
): void {
  const seatHeight = 0.16;
  const legHeight = size[1] - seatHeight;
  addBox(parent, geometry, materials.hatchTimber, 'bench-seat',
    [size[0], seatHeight, size[2]], [0, size[1] - seatHeight / 2, 0]);
  ([-1, 1] as const).forEach((sign) => {
    addBox(parent, geometry, materials.hatchTimber, `bench-leg-${sign}`,
      [0.16, legHeight, size[2] * 0.78],
      [sign * (size[0] / 2 - 0.24), legHeight / 2, 0]);
    addBox(parent, geometry, materials.darkMetal, `bench-band-${sign}`,
      [0.06, 0.1, size[2] + 0.02],
      [sign * (size[0] / 2 - 0.24), size[1] - 0.24, 0]);
  });
}
```

Use `materials.hatchTimber` for planks and `materials.darkMetal` for fasteners.
Create no new material. Keep the shared generated box geometry in the existing
`geometry.owned` set.

- [ ] **Step 4: Author the fixed room loops**

Keep the current uncommitted central bunks and workroom crates. Reposition only
where route validation requires it.

Use these route forms:

- Crew cabin: a figure-eight around the two offset center bunks.
- Wheelhouse: two routes around offset chart tables.
- Workroom: linked loops around staggered crate and shelf islands.

Remove room `clearCenter` rules that contradict these loops. Add explicit
secondary lane rectangles for both loop directions and each short branch.

- [ ] **Step 5: Add central deck benches and cargo groups**

Add these three `timberBench` placements against outer room bulkheads. Use
collider size `[2.1, 0.62, 0.5]`, rotation `PI_OVER_TWO`, and two top spots per
bench.

```ts
const cargoBenches = [
  ['deck-bench-cabin-port', -6, 10.4],
  ['deck-bench-cabin-starboard', 6, 10.4],
  ['deck-bench-storage-port', -6, -11.6],
] as const;
```

Keep benches outside 2.2-metre primary lanes and outside door approaches.
Increase the cargo furniture policy only to the exact new count.

Retain existing cargo crates and racks. Reposition the two current deck barrels
and three boxes into believable clusters without placing visual footprints
inside item access rectangles.

- [ ] **Step 6: Add bow and stern raised furniture**

Add four owners against the wheelhouse forward bulkhead and four owners against
the storage aft bulkhead. Use a mix of cargo crates, barrels, and cargo boxes.
Give each owner one top spot. Mark all eight spots as main-route spots.

Use IDs with these prefixes:

```ts
const endPropIds = [
  'bow-crate-port', 'bow-barrel-port-center',
  'bow-box-starboard-center', 'bow-crate-starboard',
  'stern-crate-port', 'stern-barrel-port-center',
  'stern-box-starboard-center', 'stern-crate-starboard',
] as const;
```

Use bow positions `[-3, 22.65]`, `[-1, 22.65]`, `[1, 22.65]`, and
`[3, 22.65]`. Use stern positions `[-3, -18.1]`, `[-1, -18.1]`,
`[1, -18.1]`, and `[3, -18.1]`. The tuple values are local X and Z. Put all
owners at `FREIGHTER_DIMENSIONS.deckY`.

- [ ] **Step 7: Expand room and cargo spot definitions**

Add bunk-rest spots to reach 10 crew spots. Keep the existing eight wheelhouse
spots. Add top spots to both workroom center crates to reach 10 workroom spots.
Use the three two-slot benches to raise central cargo above 14 spots.

Set `branch: true` only for short dead-end surfaces. Provide at least eight
branch candidates so each run can select four through six.

- [ ] **Step 8: Run layout, furniture, resource, and collision tests**

Run: `bunx vitest run tests/ShipLayout.test.ts tests/ShipItemPlacement.test.ts tests/SceneResources.test.ts tests/collisions.test.ts`

Expected: PASS with no unreachable target or ownership failure.

- [ ] **Step 9: Commit only if pre-existing layout hunks remain excluded**

Inspect both staged and unstaged diffs. If a focused commit cannot exclude the
pre-existing room work, leave this task uncommitted and report it at handoff.

---

### Task 5: Category-Free Constrained Placement

**Files:**
- Modify: `src/game/itemCatalog.ts:8-80`
- Modify: `src/game/scavengeCatalog.ts`
- Modify: `src/world/ShipItemPlacement.ts`
- Modify: `src/world/ShipLayout.ts:450-720`
- Modify: `tests/scavengeCatalog.test.ts`
- Modify: `tests/ShipItemPlacement.test.ts`

**Interfaces:**
- Consumes: `ShipRouteMetric`, `ScavengeRoutePlanner`, surface metadata, and item weights.
- Produces: `assignShipItems(instances, surfaces, random?, blockers?, placementContext?): Map<ItemInstanceId, ShipItemTransform>`.
- Produces: `ShipItemTransform.regionId`, `branch`, and `standingPoint`.
- Produces: `ShipItemTransform.placementSource` as `generated` or `fallback`.
- Produces: a checked 21-instance fallback surface map.

- [ ] **Step 1: Replace category-lock tests with unrestricted-fit tests**

Delete assertions that provisions stay in cabins, navigation stays in the
wheelhouse, workshop items stay in the workroom, and deck gear stays on deck.
Add this contract.

```ts
it.each([
  ['cannedFood-1', 'bow'],
  ['compass-1', 'storageWorkroom'],
  ['ductTape-1', 'crewCabin'],
  ['bottledPaper-1', 'centralCargo'],
])('allows %s in fitting %s spots', (instanceId, regionId) => {
  const item = createScavengeItemInstances().find(
    (candidate) => candidate.instanceId === instanceId,
  )!;
  const assignment = assignShipItems([
    item,
  ], [surface('wide', 0, { regionId })]).get(instanceId);
  expect(assignment?.regionId).toBe(regionId);
});
```

Add production tests for six region counts, four-to-six branches, 1.25-metre
separation, 14/22-metre heavy limits, 64 attempts, and fallback selection.

- [ ] **Step 2: Run placement tests and confirm old category behavior fails**

Run: `bunx vitest run tests/ShipItemPlacement.test.ts tests/scavengeCatalog.test.ts`

Expected: FAIL until category checks are removed and constraints exist.

- [ ] **Step 3: Remove placement categories from the item catalog**

Remove `ShipPlacementCategory` and `ItemDefinition.placementCategory`. Remove
the last argument from `define` and all definition calls. Keep every other
catalog field and the exact spawn-count validation.

Export the scavenging instance type from `scavengeCatalog.ts`.

```ts
export type ScavengeItemInstanceId = Exclude<
  ItemInstanceId,
  `energyBar-${number}`
>;
```

- [ ] **Step 4: Remove categories from surface specifications**

Delete `ShipItemCategory`, `categories`, `ITEM_CATEGORIES`, profile category
checks, physical fallback aliases, `surface.fallback`, and
`usedFallbackSurface`. Keep measured width, depth, height, rotation, minimum
scale, reach, blocker, and owner checks.

`surfaceFit` becomes physical only.

```ts
function surfaceFit(
  surface: ShipItemSurface,
  itemId: ItemId,
): SurfaceFit | undefined;
```

- [ ] **Step 5: Add production placement context**

```ts
export interface ShipPlacementContext {
  readonly routeMetric: ShipRouteMetric;
  readonly start: readonly [number, number];
  readonly deposit: readonly [number, number];
  readonly evacuation: readonly [number, number];
  readonly maxAttempts?: number;
}
```

Keep the context optional for small physical-fit unit tests. Require it when
the input matches the 21-instance scavenging catalog.

- [ ] **Step 6: Implement regional and branch count selection**

Start with exact minimums `3, 2, 6, 3, 2, 2`. Distribute the remaining three
items through injected random choices without exceeding `4, 3, 7, 4, 3, 3`.
Choose an injected branch target of four, five, or six.

- [ ] **Step 7: Extend assignment backtracking**

Filter candidates by physical fit, unused physical slot, region capacity,
branch capacity, 1.25-metre separation, blocker avoidance, and deposit route
distance. Use the minimum route distance from any standing point. Save the
selected standing point on `ShipItemTransform`.

After a complete physical assignment, call both route planners. Accept only
when expert seconds are from 54 through 58 inclusive and baseline saved count
is from 15 through 17 inclusive.

- [ ] **Step 8: Add the checked fallback map**

Store an immutable `Record<ItemInstanceId, string>` using 4 crew, 3
wheelhouse, 7 central cargo, 3 workroom, 2 bow, and 2 stern spots. Validate the
map through the same fit, distance, spread, region, branch, and route checks
before returning it.

```ts
export const SCAVENGE_FALLBACK_SURFACE_BY_INSTANCE = Object.freeze({
  'cannedFood-1': 'cabin-cabinet-port-forward:top',
  'cannedFood-2': 'bow-crate-port:top',
  'cannedFood-3': 'stern-crate-port:top',
  'baitTin-1': 'cabin-bookcase-forward:shelf-left',
  'baitTin-2': 'bow-box-starboard-center:top',
  'ductTape-1': 'workbench-port:top-left',
  'compass-1': 'chart-table-port:top-left',
  'map-1': 'cabin-bunk-center-port:rest',
  'medicalKit-1': 'cargo-crate-forward-port:top',
  'spyglass-1': 'wheelhouse-crew-table-starboard:top-left',
  'fishingNet-1': 'workbench-starboard:top-right',
  'bucket-1': 'cargo-crate-forward-starboard:top',
  'flareGun-1': 'chart-table-forward:top-right',
  'scubaSet-1': 'cargo-rack-port:top-left',
  'anchor-1': 'cargo-rack-starboard:top-right',
  'bottledPaper-1': 'stern-box-starboard-center:top',
  'umbrella-1': 'deck-bench-cabin-port:top-forward',
  'swimRing-1': 'deck-bench-cabin-starboard:top-aft',
  'flashlight-1': 'workroom-crate-center-a:top',
  'harpoonGun-1': 'cargo-rod-rack-port:rod',
  'captainWhiskers-1': 'cabin-desk-starboard-aft:top-left',
} satisfies Record<ScavengeItemInstanceId, string>);
```

The fallback must include all 21 scavenging instance IDs exactly once and no
`energyBar-1` key.

- [ ] **Step 9: Run 1,000 deterministic placement seeds**

```ts
it('accepts one thousand deterministic production seeds', () => {
  const library = createTestShipFurniture();
  const ship = createShip(library, 8);
  const metric = createShipRouteMetric(SHIP_LAYOUT);
  const station = SHIP_LAYOUT.zones.find(({ id }) => id === 'lifeboatStation')!;
  const deposit = [
    (station.bounds.minX + station.bounds.maxX) / 2,
    (station.bounds.minZ + station.bounds.maxZ) / 2,
  ] as const;
  try {
    for (let seed = 0; seed < 1_000; seed += 1) {
      const instances = createScavengeItemInstances();
      const assignments = assignShipItems(
        instances,
        ship.itemSurfaces,
        mulberry32(seed),
        ship.colliders,
        {
          routeMetric: metric,
          start: [ship.playerStart.x, ship.playerStart.z],
          deposit,
          evacuation: [ship.evacuationPoint.x, ship.evacuationPoint.z],
        },
      );
      expect(assignments.size).toBe(21);
      const counts = Object.fromEntries([
        'crewCabin', 'wheelhouse', 'centralCargo',
        'storageWorkroom', 'bow', 'stern',
      ].map((regionId) => [
        regionId,
        [...assignments.values()].filter((value) => value.regionId === regionId).length,
      ]));
      expect(counts.crewCabin).toBeGreaterThanOrEqual(3);
      expect(counts.crewCabin).toBeLessThanOrEqual(4);
      expect(counts.wheelhouse).toBeGreaterThanOrEqual(2);
      expect(counts.wheelhouse).toBeLessThanOrEqual(3);
      expect(counts.centralCargo).toBeGreaterThanOrEqual(6);
      expect(counts.centralCargo).toBeLessThanOrEqual(7);
      expect(counts.storageWorkroom).toBeGreaterThanOrEqual(3);
      expect(counts.storageWorkroom).toBeLessThanOrEqual(4);
      expect(counts.bow).toBeGreaterThanOrEqual(2);
      expect(counts.bow).toBeLessThanOrEqual(3);
      expect(counts.stern).toBeGreaterThanOrEqual(2);
      expect(counts.stern).toBeLessThanOrEqual(3);
      const branches = [...assignments.values()].filter(({ branch }) => branch).length;
      expect(branches).toBeGreaterThanOrEqual(4);
      expect(branches).toBeLessThanOrEqual(6);
      const route = planExpertScavengeRoute({
        assignments: instances.map((instance) => {
          const value = assignments.get(instance.instanceId)!;
          return {
            instanceId: instance.instanceId,
            weight: ITEM_DEFINITIONS[instance.type].weight,
            position: [value.standingPoint.x, value.standingPoint.z] as const,
            branch: value.branch,
          };
        }),
        start: [ship.playerStart.x, ship.playerStart.z],
        deposit,
        evacuation: [ship.evacuationPoint.x, ship.evacuationPoint.z],
        metric,
      });
      expect(route).not.toBeNull();
      expect(route!.seconds).toBeGreaterThanOrEqual(54);
      expect(route!.seconds).toBeLessThanOrEqual(58);
    }
  } finally {
    ship.dispose();
    library.dispose();
  }
});
```

Run: `bunx vitest run tests/ShipItemPlacement.test.ts tests/scavengeCatalog.test.ts`

Expected: PASS. Record test duration. Keep it below 15 seconds on the test
machine by reusing one immutable route metric.

- [ ] **Step 10: Commit isolated catalog and placement work when safe**

Stage `itemCatalog.ts` and `scavengeCatalog.test.ts` only after confirming no
pre-existing edits. Defer overlapping layout and placement files when hunk
isolation is unsafe.

---

### Task 6: World Integration and Live Loaded Movement

**Files:**
- Modify: `src/world/World.ts:235-390`
- Modify: `src/phases/ScavengePhase.ts:245-280`
- Modify: `tests/world.test.ts`
- Modify: `tests/ScavengeSession.test.ts`
- Modify: `tests/GameConstruction.test.ts`

**Interfaces:**
- Consumes: production placement context and `scavengeSpeedMultiplier`.
- Produces: constrained world item transforms and live player speed changes.

- [ ] **Step 1: Write world integration tests**

Construct worlds with fixed seeds. Read item `userData` and assert all six
regions appear, heavy distance limits hold, and repeated seeds match exact
surface IDs.

```ts
expect(item.userData).toMatchObject({
  shipSurfaceId: expect.any(String),
  shipRegionId: expect.any(String),
  shipBranch: expect.any(Boolean),
});
```

Change the default `World` item list to `createScavengeItemInstances()`. Keep
tests that need the full 22-item catalog explicit.

- [ ] **Step 2: Write phase multiplier tests**

Use the existing phase dependency harness. Spy on `player.update` and assert
that carried weights one, two, and three pass `1`, `0.92`, and `0.84`.
Deposit a bundle and assert the next direct-control update passes `1`.

- [ ] **Step 3: Run integration tests and confirm failures**

Run: `bunx vitest run tests/world.test.ts tests/GameConstruction.test.ts tests/ScavengeSession.test.ts tests/PlayerController.test.ts`

Expected: FAIL because `World` does not pass placement context and the phase
does not pass a multiplier.

- [ ] **Step 4: Build one route metric during world construction**

After ship creation, create the metric from `SHIP_LAYOUT`. Pass player start,
the lifeboat deposit center, evacuation point, and metric into
`assignShipItems`. Do this once per `World` construction.

Copy `regionId` and `branch` to item root `userData`. Do not retain planner
scratch structures after construction.

- [ ] **Step 5: Pass current load into player movement**

In the direct-control branch, use the snapshot already read before movement.

```ts
motion = this.player.update(
  deltaSeconds,
  this.input,
  scavengeSpeedMultiplier(current.carriedWeight),
);
```

Do not apply the multiplier to `updatePassive`. The passive path has no player
input.

- [ ] **Step 6: Run focused integration tests**

Run: `bunx vitest run tests/world.test.ts tests/GameConstruction.test.ts tests/ScavengeSession.test.ts tests/PlayerController.test.ts tests/LadderTraversal.test.ts`

Expected: PASS.

- [ ] **Step 7: Commit only clean integration hunks**

`ScavengePhase.ts` and `PlayerController.ts` already contain unrelated work.
Do not stage audio, interaction, or ladder hunks. Defer the integration commit
if clean staging is not possible.

---

### Task 7: Balance, Visual Inspection, and Full Verification

**Files:**
- Modify: `src/world/ShipLayout.ts` only for measured collision fixes.
- Modify: `src/world/ShipItemPlacement.ts` only for measured balance fixes.
- Modify: `tests/ShipLayout.test.ts` only when a validated contract changes.
- Modify: `tests/ShipItemPlacement.test.ts` only when a validated contract changes.
- Modify: `README.md:3,116` to state the existing one-minute limit.

**Interfaces:**
- Consumes: complete fixed layout, constrained placements, and movement rules.
- Produces: verified balance and corrected user documentation.

- [ ] **Step 1: Run static and model checks**

Run:

```powershell
bun run typecheck
bun run models:check:ship
bun run models:check:items
```

Expected: all commands exit zero.

- [ ] **Step 2: Run all focused scavenging tests**

Run:

```powershell
bunx vitest run tests/scavengeMovement.test.ts tests/ScavengeRoutePlanner.test.ts tests/ShipLayout.test.ts tests/ShipItemPlacement.test.ts tests/PlayerController.test.ts tests/LadderTraversal.test.ts tests/ScavengeSession.test.ts tests/world.test.ts tests/GameConstruction.test.ts tests/SceneResources.test.ts tests/collisions.test.ts
```

Expected: PASS.

- [ ] **Step 3: Run the complete test suite and production build**

Run:

```powershell
bun run test
bun run build
```

Expected: all tests pass, TypeScript emits no error, and Vite builds.

- [ ] **Step 4: Start the game and inspect fixed geometry**

Run: `bun run dev -- --host 127.0.0.1`

Inspect at 1280x720 and 1920x1080. Walk both directions around every room
loop. Enter every short branch. Sprint both full cargo routes. Check all doors,
ladders, hatch bypasses, the mast, the lifeboat, bow, and stern.

Confirm benches and cargo read as purposeful maritime furniture. Confirm bow
and stern items rest on raised props. Confirm no item clips, floats, hides
inside furniture, or lies on the open deck.

- [ ] **Step 5: Run timed playtests**

Use at least ten fixed seeds. Record saved count and finish time for one normal
route and one optimized route per seed.

Accept the result only when normal runs save 15 to 17 items and every optimized
run saves all 21 items by 58 seconds. Keep at least two seconds for evacuation.

- [ ] **Step 6: Correct only measured balance faults**

If a seed fails, inspect its concrete planner route. Move the blocking prop or
spot within its approved region. Do not change the 60-second timer, item
weights, carry capacity, speed multipliers, region ranges, or heavy-distance
limits.

- [ ] **Step 7: Correct README timer text**

Change both remaining “two-minute” scavenging statements to “one-minute”. Do
not change unrelated README content.

- [ ] **Step 8: Re-run final verification after the last edit**

Run:

```powershell
bun run test
bun run build
git diff --check
```

Expected: all commands exit zero.

- [ ] **Step 9: Review the final diff and report dirty-tree boundaries**

List every changed file. Compare against the initial dirty-file list. Confirm
that no pre-existing audio, event, UI, interaction, ladder, or survival change
was removed.

If overlapping files could not be staged safely, leave them uncommitted and
state this clearly. If all new hunks are isolated, commit them with:

```powershell
git commit -m "feat: redesign scavenging item routes"
```

Do not stage unrelated files to make this commit possible.

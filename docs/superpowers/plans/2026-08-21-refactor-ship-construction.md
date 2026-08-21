# Ship Construction Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Separate authored ship layout, navigation, validation, geometry primitives, and structural builders without changing the ship.

**Architecture:** Authored layout data remains the common source for geometry, navigation, collision, furniture, and placement. Pure navigation and validation consume layout types. `ShipGeometry.ts` becomes the final geometry composition entry.

**Tech Stack:** TypeScript 5.9, Vitest 3.2, Three.js 0.180

**Spec:** `docs/superpowers/specs/2026-08-21-code-refactor-design.md`

## Global Constraints

- Complete the earlier survival plans first.
- Preserve every authored dimension, coordinate, material choice, collider, route, surface, and clearance.
- Read `VISUAL_STYLE_GUIDE.md` before changing any player-facing value.
- Do not change player-facing values during this plan.
- Do not duplicate layout constants across modules.
- Do not add barrel files or re-export shims.
- Keep navigation and validation independent from Three.js.

---

### Task 1: Separate Layout Types and Authored Data

**Files:**
- Create: `src/world/ShipLayoutTypes.ts`
- Create: `src/world/shipLayoutData.ts`
- Modify: layout consumers returned by `rg -l "from './ShipLayout'|from '../world/ShipLayout'" src tests`
- Modify: `tests/ShipLayout.test.ts`

**Interfaces:**
- `ShipLayoutTypes.ts` owns layout interfaces, identifier types, and universal dimension constants.
- `shipLayoutData.ts` owns furniture, zones, doors, lanes, hatches, rigging, targets, and `SHIP_LAYOUT`.

- [ ] **Step 1: Update tests to focused imports**

```ts
import { SHIP_LAYOUT } from '../src/world/shipLayoutData';
import {
  FREIGHTER_DIMENSIONS,
  type ShipLayoutSpec,
  type ShipZoneId,
} from '../src/world/ShipLayoutTypes';
```

- [ ] **Step 2: Run layout tests and confirm missing modules**

Run: `npm test -- tests/ShipLayout.test.ts`

Expected: module-resolution failures.

- [ ] **Step 3: Move type declarations**

Move `ShipZoneId`, `ShipBalconyZoneId`, `ShipTransverseEdge`, `ClearanceClass`, `ShipFurnitureKind`, `ScavengeRegionId`, every layout interface, and these shared constants:

```ts
export const PLAYER_LAYOUT_RADIUS = 0.35;
export const FREIGHTER_DIMENSIONS = { width: 16.25, length: 55, deckY: 2.22 } as const;
export const SHIP_ROOM_WALL_HEIGHT = 3.4;
export const SHIP_ROOM_WALL_THICKNESS = 0.22;
export const SHIP_ROOM_ROOF_THICKNESS = 0.24;
export const SHIP_TRANSVERSE_PORTHOLE_CENTER_X = 2.2;
```

Keep rigging geometry limits with layout types because `ShipRigging` consumes them.

- [ ] **Step 4: Move authored data**

Move furniture model mapping, surface builders, placement builders, authored arrays, navigation target builders, and `SHIP_LAYOUT` into `shipLayoutData.ts`.

Keep every numeric literal unchanged. Import types and dimensions from `ShipLayoutTypes.ts`.

- [ ] **Step 5: Update data consumers**

Data consumers import `SHIP_LAYOUT`, roof engine data, stern dimensions, and wheelhouse dimensions from `shipLayoutData.ts`. Type consumers import only `ShipLayoutTypes.ts`.

- [ ] **Step 6: Run layout and placement tests**

Run: `npm test -- tests/ShipLayout.test.ts tests/ShipItemPlacement.test.ts tests/CrowsNest.test.ts`

Expected: all selected tests pass.

- [ ] **Step 7: Commit types and data**

```bash
git add src/world/ShipLayoutTypes.ts src/world/shipLayoutData.ts src tests/ShipLayout.test.ts
git commit -m "refactor: separate ship layout data"
```

---

### Task 2: Extract Ship Navigation

**Files:**
- Create: `src/world/ShipNavigation.ts`
- Create: `tests/ShipNavigation.test.ts`
- Modify: `src/world/ShipLayout.ts`
- Modify: `tests/ShipLayout.test.ts`
- Modify: `tests/PlayerController.test.ts`
- Modify: `tests/ScavengePhysics.test.ts`

**Interfaces:**
- Produces: rectangle helpers used by consumers, route metric creation, and navigation analysis.
- Consumes only `ShipLayoutSpec` and layout geometry values.

- [ ] **Step 1: Move navigation tests into a focused suite**

```ts
const metric = createShipRouteMetric(SHIP_LAYOUT);
expect(metric.distance(start, target)).toBeGreaterThan(0);
expect(analyzeShipNavigation(SHIP_LAYOUT).unreachableTargets).toEqual([]);
```

Cover doors, surfaces, lanes, obstacles, secondary access, route distance, unreachable targets, and invalid endpoints.

- [ ] **Step 2: Run the test and confirm the missing module**

Run: `npm test -- tests/ShipNavigation.test.ts`

Expected: module-resolution failure.

- [ ] **Step 3: Move navigation pure helpers**

Keep `ShipNavigationAnalysis`, `ShipRouteMetric`, and
`ShipSecondaryAccessRectangle` in `ShipLayoutTypes.ts`.

```ts
export function furnitureRect(spec: ShipFurniturePlacementSpec): Rect2;
export function deckHatchRect(spec: ShipDeckHatchSpec): Rect2;
export function mastRect(spec: ShipMastSpec): Rect2;
export function createShipRouteMetric(layout: ShipLayoutSpec): ShipRouteMetric;
export function analyzeShipNavigation(layout: ShipLayoutSpec): ShipNavigationAnalysis;
```

Move grid construction, neighbor iteration, A* route distance, obstacle collection, and effective target construction. Keep grid step `0.1`.

- [ ] **Step 4: Update navigation consumers**

Import navigation functions from `ShipNavigation.ts`. Do not expose internal grid cells.

- [ ] **Step 5: Run navigation, movement, and collision tests**

Run: `npm test -- tests/ShipNavigation.test.ts tests/PlayerController.test.ts tests/ScavengePhysics.test.ts tests/collisions.test.ts`

Expected: all selected tests pass.

- [ ] **Step 6: Commit navigation**

```bash
git add src/world/ShipNavigation.ts src/world/ShipLayout.ts tests/ShipNavigation.test.ts tests/ShipLayout.test.ts tests/PlayerController.test.ts tests/ScavengePhysics.test.ts
git commit -m "refactor: extract ship navigation"
```

---

### Task 3: Extract Layout Validation and Delete `ShipLayout.ts`

**Files:**
- Create: `src/world/ShipLayoutValidation.ts`
- Create: `tests/ShipLayoutValidation.test.ts`
- Delete: `src/world/ShipLayout.ts`
- Modify: every remaining consumer of `ShipLayout.ts`
- Modify: `tests/ShipLayout.test.ts`

**Interfaces:**
- Produces: `validateShipLayout(layout): void`.
- Consumes layout types plus navigation analysis.

- [ ] **Step 1: Move validation failures into focused tests**

```ts
expect(() => validateShipLayout({ ...SHIP_LAYOUT, doors: duplicateDoors }))
  .toThrow('Duplicate door');
expect(() => validateShipLayout(SHIP_LAYOUT)).not.toThrow();
```

Cover duplicate identifiers, invalid rectangles, overlaps, route clearance, surfaces, rigging, ladders, lanes, and navigation reachability.

- [ ] **Step 2: Run the test and confirm the missing module**

Run: `npm test -- tests/ShipLayoutValidation.test.ts`

Expected: module-resolution failure.

- [ ] **Step 3: Move validation with exact messages**

```ts
export function validateShipLayout(layout: ShipLayoutSpec): void;
```

Move assertion helpers and validation branches without changing error text. Import route analysis from `ShipNavigation.ts`.

- [ ] **Step 4: Update consumers and delete the old module**

Run: `rg -n "ShipLayout" src tests`

Expected: matches refer only to `ShipLayoutTypes`, `ShipLayoutValidation`, test names, or descriptive text.

- [ ] **Step 5: Run ship layout verification**

Run: `npm test -- tests/ShipLayoutValidation.test.ts tests/ShipLayout.test.ts tests/ShipItemPlacement.test.ts tests/world.test.ts`

Expected: all selected tests pass.

- [ ] **Step 6: Commit validation and deletion**

```bash
git add src/world/ShipLayoutValidation.ts src/world/ShipLayout.ts src tests/ShipLayoutValidation.test.ts tests/ShipLayout.test.ts
git commit -m "refactor: separate ship layout validation"
```

---

### Task 4: Extract Geometry Primitives and Hull Construction

**Files:**
- Create: `src/world/ShipGeometryPrimitives.ts`
- Create: `src/world/ShipHullGeometry.ts`
- Create: `tests/ShipGeometryPrimitives.test.ts`
- Create: `tests/ShipHullGeometry.test.ts`
- Modify: `src/world/ShipGeometry.ts`
- Modify: `tests/world.test.ts`

**Interfaces:**
- Primitives produce owned blocks, rotated blocks, cylinders, rounded prisms, and UV helpers.
- Hull builder produces hull, upper hull, structural deck, finished floors, and hull colliders.

- [ ] **Step 1: Add geometry ownership tests**

```ts
const context = createTestShipGeometryBuildContext(root, materials);
addShipHull(context, SHIP_LAYOUT);
expect(context.geometries.size).toBeGreaterThan(0);
expect(context.shellColliders.length).toBeGreaterThan(0);
expect(root.getObjectByName('ship-hull')).toBeDefined();
```

Test UV attributes, geometry set ownership, collider transforms, plan shape bounds, and rounded bow points.

- [ ] **Step 2: Run tests and confirm missing modules**

Run: `npm test -- tests/ShipGeometryPrimitives.test.ts tests/ShipHullGeometry.test.ts`

Expected: module-resolution failures.

- [ ] **Step 3: Extract shared primitives**

Move `applyWallPlanarUvs`, `applyRoofPlanarUvs`, wall box creation, collider conversion, `addBlock`, `addRotatedBlock`, `addCylinder`, rounded bow helpers, and rounded prism construction.

Expose only functions used by two or more builders.

- [ ] **Step 4: Extract hull and floor construction**

```ts
export function addShipHull(
  context: ShipGeometryBuildContext,
  layout: ShipLayoutSpec,
): void;
```

Define `ShipGeometryBuildContext` once in `ShipGeometryPrimitives.ts`. It contains root, geometry set, shell colliders, and materials.

- [ ] **Step 5: Delegate from `createShipGeometry`**

Replace moved code with `addShipHull(context, layout)`. Keep builder call order unchanged.

- [ ] **Step 6: Run geometry and world tests**

Run: `npm test -- tests/ShipGeometryPrimitives.test.ts tests/ShipHullGeometry.test.ts tests/world.test.ts tests/ScavengePhysics.test.ts`

Expected: all selected tests pass.

- [ ] **Step 7: Commit primitives and hull**

```bash
git add src/world/ShipGeometryPrimitives.ts src/world/ShipHullGeometry.ts src/world/ShipGeometry.ts tests/ShipGeometryPrimitives.test.ts tests/ShipHullGeometry.test.ts tests/world.test.ts
git commit -m "refactor: extract ship hull geometry"
```

---

### Task 5: Extract Rooms, Access, and Exterior Builders

**Files:**
- Create: `src/world/ShipRoomGeometry.ts`
- Create: `src/world/ShipAccessGeometry.ts`
- Create: `src/world/ShipExteriorGeometry.ts`
- Create: `tests/ShipRoomGeometry.test.ts`
- Create: `tests/ShipAccessGeometry.test.ts`
- Create: `tests/ShipExteriorGeometry.test.ts`
- Modify: `src/world/ShipGeometry.ts`
- Modify: `tests/world.test.ts`

**Interfaces:**
- Room builder owns walls, portholes, windows, doors, roofs, and balconies.
- Access builder owns ladders, entry areas, and climb zones.
- Exterior builder owns construction details, engines, and rails.

- [ ] **Step 1: Add focused structural tests**

```ts
addShipRooms(context, SHIP_LAYOUT);
expect(root.getObjectByName('wheelhouse-facade')).toBeDefined();
addShipAccess(context, SHIP_LAYOUT);
expect(climbZones).toHaveLength(SHIP_LAYOUT.ladders.length);
addShipExterior(context, SHIP_LAYOUT);
expect(root.getObjectByName('ship-rails')).toBeDefined();
```

Use the current object names and exact counts from `world.test.ts`.

- [ ] **Step 2: Run focused tests and confirm missing modules**

Run: `npm test -- tests/ShipRoomGeometry.test.ts tests/ShipAccessGeometry.test.ts tests/ShipExteriorGeometry.test.ts`

Expected: module-resolution failures.

- [ ] **Step 3: Move room construction**

```ts
export function addShipRooms(context: ShipGeometryBuildContext, layout: ShipLayoutSpec): void;
```

Move wall segment planning, portholes, wheelhouse panes, door frames, roofs, and balconies.

- [ ] **Step 4: Move access construction**

```ts
export function addShipAccess(context: ShipGeometryBuildContext, layout: ShipLayoutSpec): void;
```

Move ordered entry areas, resolved climb zones, and ladder construction.

- [ ] **Step 5: Move exterior construction**

```ts
export function addShipExterior(context: ShipGeometryBuildContext, layout: ShipLayoutSpec): void;
```

Move exterior blocks, cylinders, roof engine, straight rails, stern rails, and bow rails.

- [ ] **Step 6: Keep composition order explicit**

`createShipGeometry` calls hull, rooms, access, and exterior builders in the current order. No builder calls another peer builder.

- [ ] **Step 7: Run structural tests**

Run: `npm test -- tests/ShipRoomGeometry.test.ts tests/ShipAccessGeometry.test.ts tests/ShipExteriorGeometry.test.ts tests/world.test.ts tests/collisions.test.ts tests/ScavengePhysics.test.ts`

Expected: all selected tests pass.

- [ ] **Step 8: Commit structural builders**

```bash
git add src/world/ShipRoomGeometry.ts src/world/ShipAccessGeometry.ts src/world/ShipExteriorGeometry.ts src/world/ShipGeometry.ts tests/ShipRoomGeometry.test.ts tests/ShipAccessGeometry.test.ts tests/ShipExteriorGeometry.test.ts tests/world.test.ts
git commit -m "refactor: split ship structural geometry"
```

---

### Task 6: Verify Ship Construction Boundaries

**Files:**
- Create: `tests/ShipConstructionBoundaries.test.ts`
- Modify: `src/world/ShipGeometry.ts`
- Modify: `README.md`

**Interfaces:**
- `createShipGeometry` remains the final geometry entry.
- Focused layout modules remain free from Three.js imports.

- [ ] **Step 1: Add source boundary checks**

```ts
for (const file of ['ShipLayoutTypes.ts', 'shipLayoutData.ts', 'ShipNavigation.ts', 'ShipLayoutValidation.ts']) {
  const source = readFileSync(new URL(`../src/world/${file}`, import.meta.url), 'utf8');
  expect(source).not.toMatch(/from ['"]three/);
}
```

Add a check that `ShipGeometry.ts` imports and calls all four focused builders.

- [ ] **Step 2: Run boundary tests**

Run: `npm test -- tests/ShipConstructionBoundaries.test.ts`

Expected: pass.

- [ ] **Step 3: Update architecture documentation**

Document layout data, navigation, validation, and geometry builder ownership.

- [ ] **Step 4: Run full verification**

Run: `npm run typecheck && npm test && npm run build`

Expected: all commands pass.

- [ ] **Step 5: Commit boundary verification**

```bash
git add tests/ShipConstructionBoundaries.test.ts README.md
git commit -m "test: enforce ship construction boundaries"
```

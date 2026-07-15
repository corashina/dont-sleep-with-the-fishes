# Survival Lifeboat Floor Seal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the visible seam between the survival lifeboat floor and side walls so ocean water cannot appear inside the boat.

**Architecture:** Derive the floor perimeter from the existing `HULL_STATIONS`, inset it only enough to overlap the inner half of each wall segment, and raise the floor surface into the lower wall edge. Expand the existing boat-local rectangular water exclusion just enough to contain the sealed floor footprint and its overlap margin; keep `BoatWorld` behavior unchanged and consume the builder's updated dimensions through its existing interface.

**Tech Stack:** TypeScript 5.9, Three.js 0.180, Vitest 3, Bun, Vite 7

## Global Constraints

- Survival boat only; scavenging boat geometry remains unchanged.
- Keep the existing wooden floor appearance; add no visible sealing strip.
- Do not change item transforms, interaction anchors, paddles, camera framing, or survival rules.
- The floor must overlap both side walls continuously from bow to stern while remaining inside the exterior hull silhouette.
- The water exclusion must contain the sealed floor and overlap margin.
- Preserve existing GPU resource ownership and exact-once disposal behavior.
- Preserve all unrelated dirty and untracked files; stage only the three files named below.
- Browser and Chrome visual QA remain excluded by user instruction.

## File Structure

- Modify `src/survival/SurvivalLifeboat.ts` — derive the floor from the hull stations, raise it into the walls, and enlarge the returned water-exclusion bounds.
- Modify `tests/SurvivalLifeboat.test.ts` — reproduce the seam geometrically by sampling the inner half of every wall segment and ray-testing the floor beneath it.
- Modify `tests/BoatWorld.test.ts` — update the integration assertion for the builder-provided water-exclusion bounds.

---

### Task 1: Seal the Survival Floor and Exclude Water

**Files:**
- Modify: `tests/SurvivalLifeboat.test.ts`
- Modify: `src/survival/SurvivalLifeboat.ts`
- Modify: `tests/BoatWorld.test.ts:245-264`

**Interfaces:**
- Consumes: `createSurvivalLifeboat(): SurvivalLifeboatBuild`, the existing named meshes `survival-floor` and `hull-segment-*`, and `SurvivalLifeboatBuild.waterExclusion`.
- Produces: the same `SurvivalLifeboatBuild` interface with a station-derived sealed floor and `{ halfWidth: 1.60, halfLength: 3.04 }` exclusion dimensions.

- [ ] **Step 1: Add a failing geometric seam regression**

Add `Raycaster` to the Three.js imports in `tests/SurvivalLifeboat.test.ts`, then add this test inside `describe('survival lifeboat builder', ...)`:

```ts
it('overlaps the floor beneath every side-wall segment and excludes water from the seam', () => {
  const build = createSurvivalLifeboat();
  const floor = build.root.getObjectByName('survival-floor') as Mesh;
  const segments: Mesh[] = [];
  build.root.traverse((object) => {
    if (object instanceof Mesh && object.name.startsWith('hull-segment-')) {
      segments.push(object);
    }
  });
  expect(segments).toHaveLength(16);

  build.root.updateWorldMatrix(true, true);
  const raycaster = new Raycaster();
  const downward = new Vector3(0, -1, 0);
  const seamSamples: Vector3[] = [];

  for (const segment of segments) {
    segment.geometry.computeBoundingBox();
    const localBounds = segment.geometry.boundingBox!;
    const halfLength = (localBounds.max.z - localBounds.min.z) / 2;
    const inward = segment.position.x < 0 ? 1 : -1;
    const wallBounds = new Box3().setFromObject(segment);
    expect(floor.position.y, `${segment.name} leaves a vertical floor gap`)
      .toBeGreaterThan(wallBounds.min.y);

    for (const fraction of [-0.9, 0, 0.9]) {
      const sample = segment.localToWorld(new Vector3(
        inward * 0.08,
        0,
        fraction * halfLength,
      ));
      sample.y = 1;
      raycaster.set(sample, downward);
      expect(
        raycaster.intersectObject(floor, false),
        `${segment.name} has no floor below its inner edge`,
      ).not.toHaveLength(0);
      seamSamples.push(sample);
    }
  }

  const margin = 0.02;
  for (const sample of seamSamples) {
    expect(Math.abs(sample.x) + margin).toBeLessThanOrEqual(
      build.waterExclusion.halfWidth,
    );
    expect(Math.abs(sample.z) + margin).toBeLessThanOrEqual(
      build.waterExclusion.halfLength,
    );
  }
  const floorBounds = new Box3().setFromObject(floor);
  expect(Math.max(Math.abs(floorBounds.min.x), Math.abs(floorBounds.max.x)) + margin)
    .toBeLessThanOrEqual(build.waterExclusion.halfWidth);
  expect(Math.max(Math.abs(floorBounds.min.z), Math.abs(floorBounds.max.z)) + margin)
    .toBeLessThanOrEqual(build.waterExclusion.halfLength);

  disposeBuild(build.root, build.textures);
});
```

- [ ] **Step 2: Run the regression and verify RED**

Run:

```powershell
bun run test -- tests/SurvivalLifeboat.test.ts
```

Expected: FAIL in the new test because the current floor is at `y = -0.45`, below the side-wall lower bound near `-0.40`, and its independent outline does not cover every sampled inner wall edge.

- [ ] **Step 3: Derive a wider floor from the hull stations**

In `src/survival/SurvivalLifeboat.ts`, add these constants immediately after `HULL_STATIONS`:

```ts
const FLOOR_EDGE_INSET = 0.06;
const FLOOR_HEIGHT = -0.38;
```

Replace the current Bezier-based `floorShape()` implementation with the station-derived polygon below. Negating `z` when writing the two-dimensional `Shape` preserves the intended world-space direction after `ShapeGeometry.rotateX(-Math.PI / 2)`.

```ts
function floorShape(): Shape {
  const shape = new Shape();
  const starboard = HULL_STATIONS.map(({ halfWidth, z }) => ({
    x: halfWidth - FLOOR_EDGE_INSET,
    y: -z,
  }));
  const port = [...HULL_STATIONS].reverse().map(({ halfWidth, z }) => ({
    x: -halfWidth + FLOOR_EDGE_INSET,
    y: -z,
  }));
  const [first, ...remaining] = [...starboard, ...port];
  if (!first) throw new Error('Survival floor requires hull stations');
  shape.moveTo(first.x, first.y);
  remaining.forEach(({ x, y }) => shape.lineTo(x, y));
  shape.closePath();
  return shape;
}
```

Change only the floor height assignment:

```ts
floor.position.y = FLOOR_HEIGHT;
```

The widest floor edge becomes `1.63 - 0.06 = 1.57`, overlapping the approximate inner wall face at `1.63 - 0.11 = 1.52` by `0.05` world units. The floor stays below the visible interior while intersecting the wall bottom, avoiding both the seam and coplanar z-fighting.

- [ ] **Step 4: Expand the builder-owned water exclusion**

In the `createSurvivalLifeboat()` return object, replace only the exclusion dimensions:

```ts
waterExclusion: { halfWidth: 1.60, halfLength: 3.04 },
```

In the existing `uses all procedural texture families and matching interior exclusions` test, update the expected value to:

```ts
expect(build.waterExclusion).toEqual({ halfWidth: 1.60, halfLength: 3.04 });
```

In `tests/BoatWorld.test.ts`, update the uploaded exclusion assertion to:

```ts
expect(bounds[0]!.toArray()).toEqual([-1.6, 1.6, -3.04, 3.04]);
```

- [ ] **Step 5: Run focused tests and verify GREEN**

Run:

```powershell
bun run test -- tests/SurvivalLifeboat.test.ts tests/BoatWorld.test.ts tests/WaterExclusion.test.ts tests/world.test.ts
bun run typecheck
```

Expected: all focused tests pass and TypeScript exits `0`. If the new ray test fails at an individual segment endpoint, change only `FLOOR_EDGE_INSET` downward in increments of `0.01`; keep it positive and keep the floor inside the exterior hull.

- [ ] **Step 6: Run complete acceptance gates**

Run:

```powershell
bun run test
bun run build
git diff --check
git status --short
```

Expected: all tests and build pass. The existing Vite large-chunk advisory may remain. `git status --short` must preserve unrelated user changes and show only `src/survival/SurvivalLifeboat.ts`, `tests/SurvivalLifeboat.test.ts`, and `tests/BoatWorld.test.ts` as files changed by this task.

- [ ] **Step 7: Commit only the sealed-floor fix**

```powershell
git add -- src/survival/SurvivalLifeboat.ts tests/SurvivalLifeboat.test.ts tests/BoatWorld.test.ts
git commit -m "fix: seal survival lifeboat floor"
```

Do not stage any unrelated dirty or untracked file.

## Self-Review Checklist

- [ ] The regression fails before production code changes and passes afterward.
- [ ] The floor outline is derived from `HULL_STATIONS` rather than duplicated Bezier constants.
- [ ] Both sides and all eight segments per side have positive horizontal and vertical overlap.
- [ ] The exclusion contains every seam sample and the complete floor footprint with `0.02` margin.
- [ ] Scavenging boat geometry and tests remain unchanged.
- [ ] No item, camera, interaction, paddle, weather, or survival behavior changes.
- [ ] Resource disposal tests remain green.
- [ ] Full tests, typecheck, build, and whitespace checks pass.
- [ ] Unrelated working-tree changes remain unstaged and unmodified.

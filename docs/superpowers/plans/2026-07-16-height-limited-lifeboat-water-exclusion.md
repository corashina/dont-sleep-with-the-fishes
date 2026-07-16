# Height-limited Lifeboat Water Exclusion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Preserve ocean water below the lifeboat while discarding wave fragments that rise through its floor and interior.

**Architecture:** Extend each analytic water-exclusion region with an optional minimum local Y coordinate. The fragment shader will combine this height gate with the existing tapered X/Z footprint after transforming displaced water into the moving vessel's local space. The lifeboat will use its floor height as the gate; the freighter will retain the unbounded behavior through a low uniform sentinel.

**Tech Stack:** TypeScript 5.9, Three.js 0.180, GLSL shader strings, Vitest 3.2, Bun

## Global Constraints

- Keep the lifeboat footprint at `halfWidth: 1.60`, `halfLength: 3.04`, and `taperStart: 1.05`.
- Set the lifeboat minimum local Y to `FLOOR_HEIGHT` (`-0.38`).
- Preserve current freighter exclusion behavior.
- Apply the height test in vessel-local space so it follows heave, pitch, and roll.
- Do not add or modify third-party assets.

---

### Task 1: Add the local-height gate to water exclusions

**Files:**
- Modify: `src/ocean/WaterExclusion.ts`
- Modify: `src/ocean/OceanRenderer.ts`
- Modify: `tests/helpers/waterExclusion.ts`
- Modify: `tests/WaterExclusion.test.ts`
- Modify: `tests/OceanRenderer.test.ts`

**Interfaces:**
- Consumes: existing `createWaterExclusion(object, halfWidth, halfLength, taperStart)` callers.
- Produces: `createWaterExclusion(object, halfWidth, halfLength, taperStart, minimumLocalY?)`, optional `WaterExclusionRegion.minimumLocalY`, and shader uniform `uExclusionMinimumLocalYs[2]`.

- [ ] **Step 1: Write failing CPU containment and shader-contract tests**

Add a height-gate case to `tests/WaterExclusion.test.ts`:

```ts
it('preserves water below a local height gate while excluding crests above it', () => {
  const vessel = new Group();
  vessel.position.set(4, 1.2, -3);
  vessel.rotation.set(0.12, 0.35, -0.09);
  const region = createWaterExclusion(vessel, 1.6, 3.04, 1.05, -0.38);

  expect(pointInWaterExclusion(
    vessel.localToWorld(new Vector3(0, -0.5, 0)),
    region,
  )).toBe(false);
  expect(pointInWaterExclusion(
    vessel.localToWorld(new Vector3(0, -0.38, 0)),
    region,
  )).toBe(true);
  expect(pointInWaterExclusion(
    vessel.localToWorld(new Vector3(0.6, 0.4, 1.2)),
    region,
  )).toBe(true);
});
```

Extend the fixed-uniform assertions in `tests/WaterExclusion.test.ts`:

```ts
expect(ocean.material.uniforms.uExclusionMinimumLocalYs!.value)
  .toEqual([UNBOUNDED_MINIMUM_LOCAL_Y, UNBOUNDED_MINIMUM_LOCAL_Y]);
```

Create one bounded region in the upload test and assert the mixed bounded/unbounded values:

```ts
const firstRegion = createWaterExclusion(first, 1, 2, 2, -0.38);
const secondRegion = createWaterExclusion(second, 3.7, 10.2);
// ...existing assertions...
expect(ocean.material.uniforms.uExclusionMinimumLocalYs!.value)
  .toEqual([-0.38, UNBOUNDED_MINIMUM_LOCAL_Y]);
```

Add the same default assertion after `setExclusions([])`.

Add a shader contract test to `tests/OceanRenderer.test.ts`:

```ts
it('gates vessel-local footprint exclusions by displaced fragment height', () => {
  const ocean = new OceanRenderer();
  const shader = ocean.material.fragmentShader;

  expect(shader).toContain('uniform float uExclusionMinimumLocalYs[2];');
  expect(shader).toContain('exclusionLocal.y >= uExclusionMinimumLocalYs[i]');

  ocean.dispose();
});
```

Replace the exclusion import in `tests/WaterExclusion.test.ts` with:

```ts
import {
  createWaterExclusion,
  UNBOUNDED_MINIMUM_LOCAL_Y,
} from '../src/ocean/WaterExclusion';
```

- [ ] **Step 2: Run the focused tests and confirm the new expectations fail**

Run:

```powershell
bun run test -- tests/WaterExclusion.test.ts tests/OceanRenderer.test.ts
```

Expected: FAIL because the region does not retain `minimumLocalY`, the helper still treats the below-floor point as excluded, and the renderer has no minimum-Y uniform or shader comparison.

- [ ] **Step 3: Implement the optional region height and CPU containment rule**

Update `src/ocean/WaterExclusion.ts`:

```ts
export const UNBOUNDED_MINIMUM_LOCAL_Y = -1_000_000;

export interface WaterExclusionRegion {
  worldToLocal: Matrix4;
  bounds: Vector4;
  taperStart: number;
  minimumLocalY?: number;
}

export function createWaterExclusion(
  object: Object3D,
  halfWidth: number,
  halfLength: number,
  taperStart: number = halfLength,
  minimumLocalY?: number,
): WaterExclusionRegion {
  object.updateWorldMatrix(true, false);
  return {
    worldToLocal: object.matrixWorld.clone().invert(),
    bounds: new Vector4(-halfWidth, halfWidth, -halfLength, halfLength),
    taperStart,
    minimumLocalY,
  };
}
```

Update `tests/helpers/waterExclusion.ts` immediately after the world-to-local transform:

```ts
if (region.minimumLocalY !== undefined && local.y < region.minimumLocalY) return false;
```

- [ ] **Step 4: Upload and apply the minimum local Y in the fragment shader**

Change the import in `src/ocean/OceanRenderer.ts`:

```ts
import {
  UNBOUNDED_MINIMUM_LOCAL_Y,
  type WaterExclusionRegion,
} from './WaterExclusion';
```

Declare the new GLSL uniform next to the taper uniforms:

```glsl
uniform float uExclusionMinimumLocalYs[2];
```

Add the height gate to the existing discard condition:

```glsl
if (
  exclusionLocal.y >= uExclusionMinimumLocalYs[i]
  && exclusionAbsZ <= exclusionHalfLength
  && abs(exclusionLocal.x) <= localHalfWidth
) {
  discard;
}
```

Initialize the uniform in the material:

```ts
uExclusionMinimumLocalYs: {
  value: [UNBOUNDED_MINIMUM_LOCAL_Y, UNBOUNDED_MINIMUM_LOCAL_Y],
},
```

Read, reset, and upload the values in `setExclusions`:

```ts
const minimumLocalYs = this.material.uniforms.uExclusionMinimumLocalYs!.value as number[];
```

```ts
minimumLocalYs[index] = UNBOUNDED_MINIMUM_LOCAL_Y;
```

```ts
minimumLocalYs[index] = regions[index]!.minimumLocalY ?? UNBOUNDED_MINIMUM_LOCAL_Y;
```

- [ ] **Step 5: Run focused tests and type checking**

Run:

```powershell
bun run test -- tests/WaterExclusion.test.ts tests/OceanRenderer.test.ts
bun run typecheck
```

Expected: both test files pass and TypeScript reports no errors.

- [ ] **Step 6: Commit the core height-gate behavior**

```powershell
git add -- src/ocean/WaterExclusion.ts src/ocean/OceanRenderer.ts tests/helpers/waterExclusion.ts tests/WaterExclusion.test.ts tests/OceanRenderer.test.ts
git commit -m "fix: preserve water below exclusion regions"
```

---

### Task 2: Bind the lifeboat exclusion to its floor height

**Files:**
- Modify: `src/world/Lifeboat.ts`
- Modify: `src/world/World.ts`
- Modify: `src/survival/BoatWorld.ts`
- Modify: `tests/Lifeboat.test.ts`
- Modify: `tests/world.test.ts`
- Modify: `tests/BoatWorld.test.ts`

**Interfaces:**
- Consumes: the five-argument `createWaterExclusion` and `uExclusionMinimumLocalYs[2]` from Task 1.
- Produces: `LifeboatBuild.waterExclusion.minimumLocalY` set to `-0.38`, wired into scavenging and survival.

- [ ] **Step 1: Write failing lifeboat and phase-integration tests**

Add `minimumLocalY: -0.38` to both expected `waterExclusion` objects in `tests/Lifeboat.test.ts`:

```ts
expect(build.waterExclusion).toEqual({
  halfWidth: 1.60,
  halfLength: 3.04,
  taperStart: 1.05,
  minimumLocalY: -0.38,
});
```

In the exclusion upload test in `tests/world.test.ts`, read the new uniform and assert that the freighter stays unbounded while the lifeboat uses its floor:

```ts
const minimumLocalYs = uniforms.uExclusionMinimumLocalYs!.value as number[];
expect(minimumLocalYs).toEqual([UNBOUNDED_MINIMUM_LOCAL_Y, -0.38]);
```

Include `minimumLocalY: minimumLocalYs[1]!` in each temporary lifeboat region passed to `pointInWaterExclusion`. Add this below-floor assertion:

```ts
expect(pointInWaterExclusion(
  world.lifeboat.localToWorld(new Vector3(0, -0.5, 0)),
  {
    worldToLocal: matrices[1]!,
    bounds: bounds[1]!,
    taperStart: taperStarts[1]!,
    minimumLocalY: minimumLocalYs[1]!,
  },
)).toBe(false);
```

Add this import to `tests/world.test.ts`:

```ts
import { UNBOUNDED_MINIMUM_LOCAL_Y } from '../src/ocean/WaterExclusion';
```

In the exclusion upload test in `tests/BoatWorld.test.ts`, assert:

```ts
const minimumLocalYs = uniforms.uExclusionMinimumLocalYs!.value as number[];
expect(minimumLocalYs).toEqual([-0.38, UNBOUNDED_MINIMUM_LOCAL_Y]);
```

Add this import to `tests/BoatWorld.test.ts`:

```ts
import { UNBOUNDED_MINIMUM_LOCAL_Y } from '../src/ocean/WaterExclusion';
```

- [ ] **Step 2: Run the integration tests and confirm the floor contract fails**

Run:

```powershell
bun run test -- tests/Lifeboat.test.ts tests/world.test.ts tests/BoatWorld.test.ts
```

Expected: FAIL because the lifeboat configuration and both phase calls omit `minimumLocalY`.

- [ ] **Step 3: Expose the floor height in the lifeboat exclusion contract**

Extend `LifeboatBuild.waterExclusion` in `src/world/Lifeboat.ts`:

```ts
readonly waterExclusion: {
  readonly halfWidth: number;
  readonly halfLength: number;
  readonly taperStart: number;
  readonly minimumLocalY: number;
};
```

Return the shared floor value from `createLifeboat`:

```ts
waterExclusion: {
  halfWidth: 1.60,
  halfLength: 3.04,
  taperStart: 1.05,
  minimumLocalY: FLOOR_HEIGHT,
},
```

- [ ] **Step 4: Pass the floor gate in scavenging and survival**

Update the lifeboat call in `src/world/World.ts`:

```ts
createWaterExclusion(
  this.lifeboat,
  this.waterExclusion.halfWidth,
  this.waterExclusion.halfLength,
  this.waterExclusion.taperStart,
  this.waterExclusion.minimumLocalY,
),
```

Update the lifeboat call in `src/survival/BoatWorld.ts`:

```ts
createWaterExclusion(
  this.boat,
  this.waterExclusion.halfWidth,
  this.waterExclusion.halfLength,
  this.waterExclusion.taperStart,
  this.waterExclusion.minimumLocalY,
),
```

Do not change the freighter call in `World.ts`.

- [ ] **Step 5: Run integration and full automated verification**

Run:

```powershell
bun run test -- tests/Lifeboat.test.ts tests/world.test.ts tests/BoatWorld.test.ts
bun run typecheck
bun run test
bun run build
```

Expected: targeted tests pass, all test files pass, TypeScript reports no errors, and Vite completes a production build.

- [ ] **Step 6: Commit the lifeboat integration**

```powershell
git add -- src/world/Lifeboat.ts src/world/World.ts src/survival/BoatWorld.ts tests/Lifeboat.test.ts tests/world.test.ts tests/BoatWorld.test.ts
git commit -m "fix: limit lifeboat water mask to floor height"
```

---

### Task 3: Verify the visual result in both phases

**Files:**
- Verify only; no planned file changes.

**Interfaces:**
- Consumes: the completed renderer and lifeboat integration from Tasks 1 and 2.
- Produces: visual evidence that the hole is gone and wave crests stay outside the interior.

- [ ] **Step 1: Start the local game server**

Run:

```powershell
bun run dev -- --host 127.0.0.1 --port 4173
```

Expected: Vite serves the game at `http://127.0.0.1:4173`.

- [ ] **Step 2: Inspect scavenging around the lifeboat**

Open the game in the in-app browser. View the lifeboat from an exterior side angle while waves cross it. Confirm:

- water remains visible below the hull;
- no oval or rectangular hole appears under the boat;
- wave fragments at floor height do not render through the interior;
- the freighter water exclusion looks unchanged.

- [ ] **Step 3: Inspect survival in calm and squall weather**

Enter survival and observe the moving lifeboat through several pitch and roll cycles. Check calm and squall conditions. Confirm that the cutoff follows the boat transform, the underside retains water, and crests do not cross the floor.

- [ ] **Step 4: Record final repository evidence**

Run:

```powershell
git status --short
git log -3 --oneline
```

Expected: no uncommitted implementation files; the design commit and two implementation commits appear at the branch tip.

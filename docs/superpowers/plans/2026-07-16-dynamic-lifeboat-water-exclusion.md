# Dynamic Lifeboat Water Exclusion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep displaced ocean fragments visible below and outside the lifeboat while removing water that rises above the floor inside the tapered hull footprint.

**Architecture:** Extend `WaterExclusionRegion` with an optional vessel-local minimum Y value. `OceanRenderer` will compare every displaced fragment's boat-local Y coordinate with that value before applying the existing tapered X/Z discard. The lifeboat will publish its floor height and both game worlds will pass it to the renderer; the freighter and callers without a height value will keep the current unbounded behavior.

**Tech Stack:** TypeScript 5.9, Three.js 0.180, GLSL through `ShaderMaterial`, Vitest 3.2, Vite 7, Bun.

## Global Constraints

- Evaluate the actual wave-displaced fragment in the exclusion object's local coordinates.
- Preserve water below the lifeboat floor and outside the tapered hull footprint.
- Remove water at or above the floor only inside the lifeboat footprint.
- Keep `halfWidth: 1.60`, `halfLength: 3.04`, and `taperStart: 1.05` unchanged.
- Use the lifeboat `FLOOR_HEIGHT` value of `-0.38` as `minimumLocalY`.
- Keep exclusions without `minimumLocalY`, including the freighter, vertically unbounded.
- Do not resize or move the full exclusion from a frame-level wave sample.
- Do not add temporal smoothing, translucent mask edges, render passes, assets, or dependencies.
- Preserve unrelated changes in `tests/SurvivalUI.test.ts` and `docs/superpowers/plans/2026-07-16-scavenging-hud-clock-layout.md`.

---

### Task 1: Gate ocean exclusions by displaced local height

**Files:**
- Modify: `tests/helpers/waterExclusion.ts:3-20`
- Modify: `tests/WaterExclusion.test.ts:1-139`
- Modify: `tests/OceanRenderer.test.ts:1-58`
- Modify: `src/ocean/WaterExclusion.ts:1-22`
- Modify: `src/ocean/OceanRenderer.ts:1-371`

**Interfaces:**
- Consumes: `Object3D.matrixWorld`, displaced `vWorldPosition`, and the existing tapered X/Z bounds.
- Produces: `UNBOUNDED_MINIMUM_LOCAL_Y`, optional `WaterExclusionRegion.minimumLocalY`, a fifth `createWaterExclusion(..., minimumLocalY?)` parameter, and `uExclusionMinimumLocalYs[2]`.

- [ ] **Step 1: Write failing height-gate and uniform tests**

Update the CPU containment oracle in `tests/helpers/waterExclusion.ts` so it models the specified result:

```ts
export function pointInWaterExclusion(
  point: Vector3,
  region: WaterExclusionRegion,
): boolean {
  const local = point.clone().applyMatrix4(region.worldToLocal);
  if (region.minimumLocalY !== undefined && local.y < region.minimumLocalY) return false;
  const halfWidth = Math.max(Math.abs(region.bounds.x), Math.abs(region.bounds.y));
  const halfLength = Math.max(Math.abs(region.bounds.z), Math.abs(region.bounds.w));
  const localAbsZ = Math.abs(local.z);
  if (localAbsZ > halfLength) return false;
  const taperSpan = Math.max(0, halfLength - region.taperStart);
  const taperProgress = taperSpan === 0
    ? 0
    : Math.min(1, Math.max(0, (localAbsZ - region.taperStart) / taperSpan));
  const localHalfWidth = halfWidth * Math.sqrt(Math.max(0, 1 - taperProgress ** 2));
  return Math.abs(local.x) <= localHalfWidth;
}
```

Add this case to `tests/WaterExclusion.test.ts` after the rounded-footprint test:

```ts
it('preserves trough water below a local height gate while excluding crests above it', () => {
  const rig = new Group();
  rig.position.set(-3, 1.5, 6);
  rig.rotation.set(-0.12, 0.7, 0.18);
  rig.scale.set(1.8, 0.65, 1.25);
  const vessel = new Group();
  vessel.position.set(2, -0.4, -3);
  vessel.rotation.set(0.08, -0.3, 0.05);
  rig.add(vessel);
  const region = createWaterExclusion(vessel, 1.6, 3.04, 1.05, -0.38);

  expect(pointInWaterExclusion(
    vessel.localToWorld(new Vector3(0, -0.50, 0)),
    region,
  )).toBe(false);
  expect(pointInWaterExclusion(
    vessel.localToWorld(new Vector3(0, -0.38, 0)),
    region,
  )).toBe(true);
  expect(pointInWaterExclusion(
    vessel.localToWorld(new Vector3(0.6, 0.40, 1.2)),
    region,
  )).toBe(true);
  expect(pointInWaterExclusion(
    vessel.localToWorld(new Vector3(1.5, 0.40, 2.4)),
    region,
  )).toBe(false);
});
```

Extend the existing inactive-default, upload, and reset assertions in `tests/WaterExclusion.test.ts`:

```ts
expect(ocean.material.uniforms.uExclusionMinimumLocalYs!.value)
  .toEqual([-1_000_000, -1_000_000]);
```

Pass `-0.38` to the first region in the upload test and assert both slots:

```ts
const firstRegion = createWaterExclusion(first, 1, 2, 2, -0.38);
// ...existing assertions...
expect(ocean.material.uniforms.uExclusionMinimumLocalYs!.value)
  .toEqual([-0.38, -1_000_000]);
```

Add this shader-contract test to `tests/OceanRenderer.test.ts`:

```ts
it('gates each tapered footprint by the displaced fragment local height', () => {
  const ocean = new OceanRenderer();
  const shader = ocean.material.fragmentShader;

  expect(shader).toContain('uniform float uExclusionMinimumLocalYs[2];');
  expect(shader).toContain('exclusionLocal.y >= uExclusionMinimumLocalYs[i]');

  ocean.dispose();
});
```

- [ ] **Step 2: Run the focused tests and verify RED**

Run:

```powershell
bun run test -- tests/WaterExclusion.test.ts tests/OceanRenderer.test.ts
```

Expected: FAIL because `createWaterExclusion` ignores the fifth argument, trough water still counts as excluded, and `uExclusionMinimumLocalYs` does not exist.

- [ ] **Step 3: Implement the optional local-height boundary**

Change `src/ocean/WaterExclusion.ts` to:

```ts
import { Matrix4, type Object3D, Vector4 } from 'three';

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

Import the sentinel in `src/ocean/OceanRenderer.ts`:

```ts
import {
  UNBOUNDED_MINIMUM_LOCAL_Y,
  type WaterExclusionRegion,
} from './WaterExclusion';
```

Add the uniform declaration beside `uExclusionTaperStarts`:

```glsl
uniform float uExclusionMinimumLocalYs[2];
```

Replace the existing footprint-only `if` with:

```glsl
if (
  exclusionLocal.y >= uExclusionMinimumLocalYs[i]
  && exclusionAbsZ <= exclusionHalfLength
  && abs(exclusionLocal.x) <= localHalfWidth
) {
  discard;
}
```

Initialize the fixed uniform slots in the `ShaderMaterial` uniforms:

```ts
uExclusionMinimumLocalYs: {
  value: [UNBOUNDED_MINIMUM_LOCAL_Y, UNBOUNDED_MINIMUM_LOCAL_Y],
},
```

Extend `setExclusions` with the new payload and reset behavior:

```ts
const minimumLocalYs = this.material.uniforms.uExclusionMinimumLocalYs!.value as number[];

for (let index = 0; index < MAX_EXCLUSIONS; index += 1) {
  worldToLocal[index]!.identity();
  bounds[index]!.set(0, 0, 0, 1);
  taperStarts[index] = 0;
  minimumLocalYs[index] = UNBOUNDED_MINIMUM_LOCAL_Y;
}
for (let index = 0; index < activeCount; index += 1) {
  worldToLocal[index]!.copy(regions[index]!.worldToLocal);
  bounds[index]!.copy(regions[index]!.bounds);
  taperStarts[index] = regions[index]!.taperStart;
  minimumLocalYs[index] = regions[index]!.minimumLocalY ?? UNBOUNDED_MINIMUM_LOCAL_Y;
}
```

- [ ] **Step 4: Run focused tests and verify GREEN**

Run:

```powershell
bun run test -- tests/WaterExclusion.test.ts tests/OceanRenderer.test.ts
bun run typecheck
```

Expected: both test files pass and TypeScript reports no errors.

- [ ] **Step 5: Commit renderer support**

```powershell
git add -- src/ocean/WaterExclusion.ts src/ocean/OceanRenderer.ts tests/helpers/waterExclusion.ts tests/WaterExclusion.test.ts tests/OceanRenderer.test.ts
git commit -m "fix: preserve water below exclusion regions"
```

### Task 2: Pass the lifeboat floor boundary through both game phases

**Files:**
- Modify: `tests/Lifeboat.test.ts:29-158`
- Modify: `tests/BoatWorld.test.ts:591-615`
- Modify: `tests/world.test.ts:490-546`
- Modify: `src/world/Lifeboat.ts:20-301`
- Modify: `src/survival/BoatWorld.ts:447-456`
- Modify: `src/world/World.ts:245-260`

**Interfaces:**
- Consumes: the Task 1 fifth parameter `createWaterExclusion(object, halfWidth, halfLength, taperStart, minimumLocalY?)` and `uExclusionMinimumLocalYs[2]`.
- Produces: required `LifeboatBuild.waterExclusion.minimumLocalY: number`, set to `FLOOR_HEIGHT`, with scavenging and survival uploads.

- [ ] **Step 1: Write failing lifeboat and phase-integration tests**

Extend both full `waterExclusion` expectations in `tests/Lifeboat.test.ts`:

```ts
expect(build.waterExclusion).toEqual({
  halfWidth: 1.60,
  halfLength: 3.04,
  taperStart: 1.05,
  minimumLocalY: -0.38,
});
```

Import the sentinel in `tests/BoatWorld.test.ts` and `tests/world.test.ts`:

```ts
import { UNBOUNDED_MINIMUM_LOCAL_Y } from '../src/ocean/WaterExclusion';
```

Extend the survival exclusion upload test in `tests/BoatWorld.test.ts`:

```ts
const minimumLocalYs = uniforms.uExclusionMinimumLocalYs!.value as number[];
// ...existing assertions...
expect(minimumLocalYs).toEqual([-0.38, UNBOUNDED_MINIMUM_LOCAL_Y]);
```

Extend the scavenging exclusion upload test in `tests/world.test.ts`:

```ts
const minimumLocalYs = uniforms.uExclusionMinimumLocalYs!.value as number[];
// ...existing bounds and taper assertions...
expect(minimumLocalYs).toEqual([UNBOUNDED_MINIMUM_LOCAL_Y, -0.38]);
```

Include `minimumLocalY: minimumLocalYs[1]!` in each reconstructed lifeboat region passed to `pointInWaterExclusion`, then add the trough assertion:

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

- [ ] **Step 2: Run integration tests and verify RED**

Run:

```powershell
bun run test -- tests/Lifeboat.test.ts tests/BoatWorld.test.ts tests/world.test.ts
```

Expected: FAIL because the lifeboat does not publish `minimumLocalY` and both worlds upload the unbounded sentinel for it.

- [ ] **Step 3: Publish and upload the floor height**

Extend `LifeboatBuild.waterExclusion` in `src/world/Lifeboat.ts`:

```ts
readonly waterExclusion: {
  readonly halfWidth: number;
  readonly halfLength: number;
  readonly taperStart: number;
  readonly minimumLocalY: number;
};
```

Add the floor boundary to the returned definition:

```ts
waterExclusion: {
  halfWidth: 1.60,
  halfLength: 3.04,
  taperStart: 1.05,
  minimumLocalY: FLOOR_HEIGHT,
},
```

Pass the value as the fifth argument in `src/survival/BoatWorld.ts`:

```ts
createWaterExclusion(
  this.boat,
  this.waterExclusion.halfWidth,
  this.waterExclusion.halfLength,
  this.waterExclusion.taperStart,
  this.waterExclusion.minimumLocalY,
)
```

Pass the same value only for the lifeboat call in `src/world/World.ts`:

```ts
createWaterExclusion(
  this.lifeboat,
  this.waterExclusion.halfWidth,
  this.waterExclusion.halfLength,
  this.waterExclusion.taperStart,
  this.waterExclusion.minimumLocalY,
)
```

Leave the preceding freighter call unchanged so it uses `UNBOUNDED_MINIMUM_LOCAL_Y`.

- [ ] **Step 4: Run integration tests and verify GREEN**

Run:

```powershell
bun run test -- tests/Lifeboat.test.ts tests/BoatWorld.test.ts tests/world.test.ts
bun run typecheck
```

Expected: all three test files pass and TypeScript reports no errors.

- [ ] **Step 5: Commit lifeboat integration**

```powershell
git add -- src/world/Lifeboat.ts src/survival/BoatWorld.ts src/world/World.ts tests/Lifeboat.test.ts tests/BoatWorld.test.ts tests/world.test.ts
git commit -m "fix: limit lifeboat water mask to floor height"
```

### Task 3: Verify the regression in tests and the running game

**Files:**
- Verify only: all files changed in Tasks 1 and 2

**Interfaces:**
- Consumes: the complete dynamic height-aware exclusion path.
- Produces: test, build, and visual evidence for the trough and crest acceptance criteria.

- [ ] **Step 1: Run the complete automated verification**

Run each command from the isolated worktree:

```powershell
bun run typecheck
bun run test
bun run build
git diff --check
```

Expected: TypeScript exits `0`; all Vitest files pass; Vite builds production assets; `git diff --check` prints no errors. Existing GLTFLoader texture warnings and the Vite chunk-size warning do not fail these commands.

- [ ] **Step 2: Start the production preview**

```powershell
bun run preview --host 127.0.0.1 --port 4176 --strictPort
```

Open `http://127.0.0.1:4176/` with the controlled browser. Confirm the console contains no WebGL shader errors.

- [ ] **Step 3: Inspect scavenging water contact**

Start evacuation and inspect the lifeboat from the same side-diagonal angle as the reported screenshot. Observe at least one trough and one crest.

Expected:

- the trough shows ocean below and outside the hull instead of the bright oval background;
- the crest may touch the outer side but does not appear above the floor inside the boat;
- the existing rounded bow and stern contact remains intact;
- the freighter exclusion remains unchanged.

- [ ] **Step 4: Inspect survival water contact**

Reach the survival phase and inspect the lifeboat during calm and the strongest available wave response.

Expected: the same trough and crest rules hold while the lifeboat heaves, pitches, and rolls.

- [ ] **Step 5: Confirm repository scope**

Run:

```powershell
git status --short
git log -3 --oneline
```

Expected: only the intended commits appear on the implementation branch. The unrelated root-checkout changes remain outside the isolated worktree.

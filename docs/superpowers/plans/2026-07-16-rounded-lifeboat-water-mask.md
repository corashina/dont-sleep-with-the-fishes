# Rounded Lifeboat Water Mask Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the lifeboat's rectangular ocean exclusion with a rounded hull profile in scavenging and survival.

**Architecture:** Extend each water-exclusion region with a local-space taper start. The shared ocean shader will preserve full width through the boat's middle and reduce the exclusion width along an elliptical curve toward each end; rectangular callers will default the taper start to the exclusion half-length. Both game worlds will pass the same `1.05` lifeboat taper from `createLifeboat()`.

**Tech Stack:** TypeScript 5.9, Three.js 0.180, GLSL shaders, Vitest 3.2, Vite 7.1, Bun

## Global Constraints

- Apply the rounded lifeboat mask in scavenging and survival.
- Keep the freighter exclusion rectangular.
- Keep the two-slot shader exclusion limit.
- Keep rectangular behavior as the default for existing callers.
- Clamp the GLSL square-root input to zero.
- Reset unused taper uniforms with the other inactive defaults.
- Add no render pass, stencil buffer, mesh, dependency, or third-party asset.
- Follow test-driven development: write each regression test and observe its expected failure before changing production code.

## File Map

- `src/ocean/WaterExclusion.ts`: defines the exclusion-region contract and creates transformed regions.
- `src/ocean/OceanRenderer.ts`: uploads exclusion uniforms and performs fragment containment in GLSL.
- `src/world/Lifeboat.ts`: owns the lifeboat mask dimensions and taper value.
- `src/world/World.ts`: uploads the scavenging ship and lifeboat exclusions.
- `src/survival/BoatWorld.ts`: uploads the survival lifeboat exclusion.
- `tests/helpers/waterExclusion.ts`: mirrors shader containment for CPU-side assertions.
- `tests/WaterExclusion.test.ts`: covers profile containment and uniform lifecycle.
- `tests/Lifeboat.test.ts`: covers the lifeboat exclusion contract.
- `tests/world.test.ts`: covers scavenging-world uniform data and transformed containment.
- `tests/BoatWorld.test.ts`: covers survival-world uniform data and transformed containment.

---

### Task 1: Add a tapered water-exclusion profile to the shared ocean renderer

**Files:**
- Modify: `tests/helpers/waterExclusion.ts`
- Modify: `tests/WaterExclusion.test.ts`
- Modify: `src/ocean/WaterExclusion.ts`
- Modify: `src/ocean/OceanRenderer.ts`

**Interfaces:**
- Consumes: `Object3D`, `Matrix4`, and `Vector4` from Three.js.
- Produces: `WaterExclusionRegion` with `worldToLocal: Matrix4`, `bounds: Vector4`, and `taperStart: number`.
- Produces: `createWaterExclusion(object, halfWidth, halfLength, taperStart = halfLength): WaterExclusionRegion`.
- Produces: `uExclusionTaperStarts[2]` as the shader and material uniform for per-region taper values.

- [ ] **Step 1: Write the failing rounded-profile and uniform tests**

Replace `tests/helpers/waterExclusion.ts` with this shader-equivalent containment helper:

```ts
import { Vector3 } from 'three';
import type { WaterExclusionRegion } from '../../src/ocean/WaterExclusion';

export function pointInWaterExclusion(
  point: Vector3,
  region: WaterExclusionRegion,
): boolean {
  const local = point.clone().applyMatrix4(region.worldToLocal);
  const halfWidth = Math.max(Math.abs(region.bounds.x), Math.abs(region.bounds.y));
  const halfLength = Math.max(Math.abs(region.bounds.z), Math.abs(region.bounds.w));
  const localAbsZ = Math.abs(local.z);
  if (localAbsZ > halfLength) return false;

  const taperSpan = Math.max(halfLength - region.taperStart, 0);
  const taperProgress = taperSpan > 0
    ? Math.min(Math.max((localAbsZ - region.taperStart) / taperSpan, 0), 1)
    : 0;
  const localHalfWidth = halfWidth * Math.sqrt(Math.max(0, 1 - taperProgress ** 2));
  return Math.abs(local.x) <= localHalfWidth;
}
```

Add this test after the transformed-containment tests in `tests/WaterExclusion.test.ts`:

```ts
it('narrows a rounded exclusion toward the bow and stern', () => {
  const vessel = new Group();
  const region = createWaterExclusion(vessel, 1.6, 3.04, 1.05);

  expect(pointInWaterExclusion(new Vector3(1.5, 0, 0), region)).toBe(true);
  expect(pointInWaterExclusion(new Vector3(0.4, 0, 2.95), region)).toBe(true);
  expect(pointInWaterExclusion(new Vector3(1.3, 0, 2.4), region)).toBe(false);
  expect(pointInWaterExclusion(new Vector3(-1.3, 0, -2.4), region)).toBe(false);
});
```

Extend the uniform assertions in the existing tests:

```ts
expect(ocean.material.uniforms.uExclusionTaperStarts!.value).toEqual([0, 0]);
```

Add that assertion to `starts with explicit inactive fixed-size uniform defaults` and `resets unused uniform slots when exclusions become inactive`. Add this assertion to `uploads two active exclusion transforms and bounds`:

```ts
expect(ocean.material.uniforms.uExclusionTaperStarts!.value).toEqual([2, 10.2]);
```

- [ ] **Step 2: Run the focused test and verify the RED state**

Run:

```bash
bun run test -- tests/WaterExclusion.test.ts
```

Expected: FAIL in `narrows a rounded exclusion toward the bow and stern` because `createWaterExclusion` ignores the fourth argument and the old rectangle still contains `(1.3, 0, 2.4)`. The new uniform assertions also fail because `uExclusionTaperStarts` does not exist.

- [ ] **Step 3: Add the region value, shader curve, and uniform upload**

Change `src/ocean/WaterExclusion.ts` to this contract and constructor:

```ts
import { Matrix4, type Object3D, Vector4 } from 'three';

export interface WaterExclusionRegion {
  worldToLocal: Matrix4;
  bounds: Vector4;
  taperStart: number;
}

export function createWaterExclusion(
  object: Object3D,
  halfWidth: number,
  halfLength: number,
  taperStart: number = halfLength,
): WaterExclusionRegion {
  object.updateWorldMatrix(true, false);
  return {
    worldToLocal: object.matrixWorld.clone().invert(),
    bounds: new Vector4(-halfWidth, halfWidth, -halfLength, halfLength),
    taperStart,
  };
}
```

Add the uniform declaration beside the other exclusion uniforms in the `OceanRenderer` fragment shader:

```glsl
uniform float uExclusionTaperStarts[2];
```

Replace the rectangular `if` block inside the exclusion loop with this local profile calculation:

```glsl
vec3 exclusionLocal = (uExclusionWorldToLocal[i] * vec4(vWorldPosition, 1.0)).xyz;
vec4 exclusionBounds = uExclusionBounds[i];
float exclusionHalfWidth = max(abs(exclusionBounds.x), abs(exclusionBounds.y));
float exclusionHalfLength = max(abs(exclusionBounds.z), abs(exclusionBounds.w));
float exclusionAbsZ = abs(exclusionLocal.z);
float taperSpan = max(exclusionHalfLength - uExclusionTaperStarts[i], 0.0);
float taperProgress = 0.0;
if (taperSpan > 0.0) {
  taperProgress = clamp(
    (exclusionAbsZ - uExclusionTaperStarts[i]) / taperSpan,
    0.0,
    1.0
  );
}
float localHalfWidth = exclusionHalfWidth
  * sqrt(max(0.0, 1.0 - taperProgress * taperProgress));
if (exclusionAbsZ <= exclusionHalfLength && abs(exclusionLocal.x) <= localHalfWidth) {
  discard;
}
```

Add the material-uniform default beside `uExclusionBounds`:

```ts
uExclusionTaperStarts: { value: [0, 0] },
```

Update `OceanRenderer.setExclusions` with the taper array, reset, and upload:

```ts
const taperStarts = this.material.uniforms.uExclusionTaperStarts!.value as number[];
```

Inside the inactive-slot loop, add:

```ts
taperStarts[index] = 0;
```

Inside the active-region loop, add:

```ts
taperStarts[index] = regions[index]!.taperStart;
```

- [ ] **Step 4: Run the focused test and verify the GREEN state**

Run:

```bash
bun run test -- tests/WaterExclusion.test.ts
```

Expected: PASS. Rectangular calls upload their half-lengths as taper starts, the rounded test rejects both former corners, and inactive uniform slots reset to zero.

- [ ] **Step 5: Commit the shared renderer change**

```bash
git add src/ocean/WaterExclusion.ts src/ocean/OceanRenderer.ts tests/helpers/waterExclusion.ts tests/WaterExclusion.test.ts
git commit -m "feat: support rounded water exclusions"
```

---

### Task 2: Connect the lifeboat taper to scavenging and survival

**Files:**
- Modify: `tests/Lifeboat.test.ts`
- Modify: `tests/world.test.ts`
- Modify: `tests/BoatWorld.test.ts`
- Modify: `src/world/Lifeboat.ts`
- Modify: `src/world/World.ts`
- Modify: `src/survival/BoatWorld.ts`

**Interfaces:**
- Consumes: `createWaterExclusion(object, halfWidth, halfLength, taperStart)` from Task 1.
- Produces: `LifeboatBuild['waterExclusion']` with `{ halfWidth: 1.60, halfLength: 3.04, taperStart: 1.05 }`.
- Produces: scavenging taper uniforms `[17.6, 1.05]`, retaining the rectangular freighter in slot zero.
- Produces: survival taper uniforms `[1.05, 0]`, retaining the inactive second slot.

- [ ] **Step 1: Write failing contract and integration assertions**

Change both lifeboat contract assertions in `tests/Lifeboat.test.ts` to:

```ts
expect(build.waterExclusion).toEqual({
  halfWidth: 1.60,
  halfLength: 3.04,
  taperStart: 1.05,
});
```

In `uploads ship and lifeboat exclusions from their current world transforms` in `tests/world.test.ts`, read the taper uniforms and assert both slots:

```ts
const taperStarts = uniforms.uExclusionTaperStarts!.value as number[];
expect(taperStarts).toEqual([17.6, 1.05]);
```

Pass the uploaded taper into both lifeboat containment assertions:

```ts
{
  worldToLocal: matrices[1]!,
  bounds: bounds[1]!,
  taperStart: taperStarts[1]!,
}
```

Keep the existing `(1.12, 0, 2.4)` assertion as `true`, then add this former-corner assertion:

```ts
expect(pointInWaterExclusion(
  world.lifeboat.localToWorld(new Vector3(1.4, 0, 2.4)),
  {
    worldToLocal: matrices[1]!,
    bounds: bounds[1]!,
    taperStart: taperStarts[1]!,
  },
)).toBe(false);
```

In `uploads one exclusion from the motion-rig lifeboat world transform` in `tests/BoatWorld.test.ts`, add:

```ts
const taperStarts = uniforms.uExclusionTaperStarts!.value as number[];
expect(taperStarts).toEqual([1.05, 0]);
```

- [ ] **Step 2: Run the integration tests and verify the RED state**

Run:

```bash
bun run test -- tests/Lifeboat.test.ts tests/world.test.ts tests/BoatWorld.test.ts
```

Expected: FAIL because `createLifeboat()` omits `taperStart`, and both worlds still upload the rectangular default value `3.04` for the boat.

- [ ] **Step 3: Add the lifeboat profile and pass it from both worlds**

Change the `waterExclusion` property in `LifeboatBuild` in `src/world/Lifeboat.ts` to:

```ts
readonly waterExclusion: {
  readonly halfWidth: number;
  readonly halfLength: number;
  readonly taperStart: number;
};
```

Change the returned lifeboat definition to:

```ts
waterExclusion: {
  halfWidth: 1.60,
  halfLength: 3.04,
  taperStart: 1.05,
},
```

In `src/world/World.ts`, import the build type:

```ts
import { createLifeboat, type LifeboatBuild } from './Lifeboat';
```

Change the private field to:

```ts
private readonly waterExclusion: LifeboatBuild['waterExclusion'];
```

Pass the taper in the lifeboat call while leaving the freighter call at three arguments:

```ts
createWaterExclusion(
  this.lifeboat,
  this.waterExclusion.halfWidth,
  this.waterExclusion.halfLength,
  this.waterExclusion.taperStart,
),
```

Pass the same taper from `src/survival/BoatWorld.ts`:

```ts
createWaterExclusion(
  this.boat,
  this.waterExclusion.halfWidth,
  this.waterExclusion.halfLength,
  this.waterExclusion.taperStart,
),
```

- [ ] **Step 4: Run the integration tests and verify the GREEN state**

Run:

```bash
bun run test -- tests/Lifeboat.test.ts tests/world.test.ts tests/BoatWorld.test.ts
```

Expected: PASS. The scavenging world uploads the freighter rectangle and rounded boat profile; the survival world uploads the rounded boat profile and clears its unused slot.

- [ ] **Step 5: Commit both game-phase integrations**

```bash
git add src/world/Lifeboat.ts src/world/World.ts src/survival/BoatWorld.ts tests/Lifeboat.test.ts tests/world.test.ts tests/BoatWorld.test.ts
git commit -m "fix: round the lifeboat water mask"
```

---

### Task 3: Run full verification and inspect both game phases

**Files:**
- Verify: `src/ocean/WaterExclusion.ts`
- Verify: `src/ocean/OceanRenderer.ts`
- Verify: `src/world/Lifeboat.ts`
- Verify: `src/world/World.ts`
- Verify: `src/survival/BoatWorld.ts`
- Verify: `tests/WaterExclusion.test.ts`
- Verify: `tests/Lifeboat.test.ts`
- Verify: `tests/world.test.ts`
- Verify: `tests/BoatWorld.test.ts`

**Interfaces:**
- Consumes: the two commits from Tasks 1 and 2.
- Produces: test, typecheck, build, and browser evidence that the rounded mask works in both phases.

- [ ] **Step 1: Run the focused regression suite**

Run:

```bash
bun run test -- tests/WaterExclusion.test.ts tests/Lifeboat.test.ts tests/world.test.ts tests/BoatWorld.test.ts
```

Expected: PASS for all four files with no warnings or unhandled errors.

- [ ] **Step 2: Run repository verification**

Run each command:

```bash
bun run typecheck
bun run test
bun run build
git diff --check
```

Expected: all commands exit with code `0`. `git diff --check` prints no whitespace errors.

- [ ] **Step 3: Start the local game for visual inspection**

Run:

```bash
bun run dev -- --host 127.0.0.1 --port 4173
```

Expected: Vite serves the game at `http://127.0.0.1:4173/` without startup errors.

- [ ] **Step 4: Inspect the scavenging lifeboat**

Open the local URL in the in-app browser, select **Begin Evacuation**, and reach the lifeboat station. Inspect the bow and stern from diagonal angles while the boat rises, rolls, and pitches. Confirm that ocean fragments fill the former rectangular corner gaps and that no water appears through the floor or side-wall seams.

- [ ] **Step 5: Inspect the survival lifeboat**

Evacuate from the lifeboat station to enter survival. Inspect both ends of the boat during its motion. Confirm that the water meets the rounded hull, the mask follows the motion rig, and no rectangular corner cutoff appears.

- [ ] **Step 6: Record final repository state**

Run:

```bash
git status --short
git log -3 --oneline
```

Expected: no uncommitted files from this implementation. Pre-existing unrelated untracked files may remain untouched. The two implementation commits appear above the design and plan commits.

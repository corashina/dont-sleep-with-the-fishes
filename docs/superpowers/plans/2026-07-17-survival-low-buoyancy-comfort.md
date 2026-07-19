# Survival Low-Buoyancy Comfort Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduce survival vessel and camera motion to a comfort-first profile while preserving the shared wave field, weather variation, and full ocean animation.

**Architecture:** A pure survival-owned transform will scale sampled `BoatPose` values into a caller-owned output record. `BoatWorld` will sample the existing shared buoyancy solver, attenuate that raw target, and feed the result into the existing damping path without per-frame allocations.

**Tech Stack:** TypeScript, Three.js, Vitest, Vite, Bun.

## Global Constraints

- Retain 8 percent of survival heave and lateral drift.
- Retain 3 percent of survival pitch and roll.
- Keep the fixed `SURVIVAL_BOAT_ANCHOR` height and authored waterline unchanged.
- Keep calm, overcast, and squall weather amplitude scales at `0.78`, `1`, and `1.35`.
- Keep ocean rendering and scavenging buoyancy unchanged.
- Keep the camera, lifeboat, and recovered items on the same motion rig.
- Keep the existing reduced-motion suppression for spray and rope lag.
- Perform no per-frame allocations and add no Three.js resources or disposal work.
- Do not change gameplay rules, item layouts, controls, assets, or save data.

---

## File Structure

- Create `src/survival/survivalBuoyancyComfort.ts`: owns the survival-only translation and rotation scales and writes an attenuated `BoatPose` into caller-owned storage.
- Create `tests/SurvivalBuoyancyComfort.test.ts`: verifies the scale contract and output reuse without Three.js.
- Modify `src/survival/BoatWorld.ts`: owns reusable raw and attenuated target poses and inserts the comfort transform between wave sampling and damping.
- Modify `tests/BoatWorld.test.ts`: verifies the motion rig, camera, saved props, reduced-motion cues, and weather distinction against the attenuated target.

### Task 1: Add the Survival Buoyancy Comfort Transform

**Files:**

- Create: `tests/SurvivalBuoyancyComfort.test.ts`
- Create: `src/survival/survivalBuoyancyComfort.ts`

**Interfaces:**

- Consumes: `BoatPose` from `src/ocean/BoatBuoyancy.ts`.
- Produces: `SURVIVAL_TRANSLATION_SCALE: 0.08`, `SURVIVAL_ROTATION_SCALE: 0.03`, and `applySurvivalBuoyancyComfortInto(output: BoatPose, source: Readonly<BoatPose>): void`.

- [ ] **Step 1: Write the failing unit test**

Create `tests/SurvivalBuoyancyComfort.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { BoatPose } from '../src/ocean/BoatBuoyancy';
import {
  SURVIVAL_ROTATION_SCALE,
  SURVIVAL_TRANSLATION_SCALE,
  applySurvivalBuoyancyComfortInto,
} from '../src/survival/survivalBuoyancyComfort';

describe('survival buoyancy comfort', () => {
  it('retains eight percent translation and three percent rotation in caller-owned storage', () => {
    const source: BoatPose = {
      y: 2,
      pitch: 0.5,
      roll: -0.25,
      driftX: 0.4,
      driftZ: -0.6,
    };
    const output: BoatPose = {
      y: 99,
      pitch: 99,
      roll: 99,
      driftX: 99,
      driftZ: 99,
    };
    const outputReference = output;

    applySurvivalBuoyancyComfortInto(output, source);

    expect(SURVIVAL_TRANSLATION_SCALE).toBe(0.08);
    expect(SURVIVAL_ROTATION_SCALE).toBe(0.03);
    expect(output).toBe(outputReference);
    expect(output.y).toBeCloseTo(0.16);
    expect(output.pitch).toBeCloseTo(0.015);
    expect(output.roll).toBeCloseTo(-0.0075);
    expect(output.driftX).toBeCloseTo(0.032);
    expect(output.driftZ).toBeCloseTo(-0.048);
    expect(source).toEqual({
      y: 2,
      pitch: 0.5,
      roll: -0.25,
      driftX: 0.4,
      driftZ: -0.6,
    });
  });
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```powershell
bun run test -- tests/SurvivalBuoyancyComfort.test.ts
```

Expected: FAIL because `src/survival/survivalBuoyancyComfort.ts` does not exist.

- [ ] **Step 3: Implement the allocation-free transform**

Create `src/survival/survivalBuoyancyComfort.ts`:

```ts
import type { BoatPose } from '../ocean/BoatBuoyancy';

export const SURVIVAL_TRANSLATION_SCALE = 0.08;
export const SURVIVAL_ROTATION_SCALE = 0.03;

export function applySurvivalBuoyancyComfortInto(
  output: BoatPose,
  source: Readonly<BoatPose>,
): void {
  output.y = source.y * SURVIVAL_TRANSLATION_SCALE;
  output.pitch = source.pitch * SURVIVAL_ROTATION_SCALE;
  output.roll = source.roll * SURVIVAL_ROTATION_SCALE;
  output.driftX = source.driftX * SURVIVAL_TRANSLATION_SCALE;
  output.driftZ = source.driftZ * SURVIVAL_TRANSLATION_SCALE;
}
```

- [ ] **Step 4: Run the focused test and verify GREEN**

Run:

```powershell
bun run test -- tests/SurvivalBuoyancyComfort.test.ts
```

Expected: PASS with one test file and one test.

- [ ] **Step 5: Commit the pure transform**

```powershell
git add -- src/survival/survivalBuoyancyComfort.ts tests/SurvivalBuoyancyComfort.test.ts
git commit -m "feat: add survival buoyancy comfort profile"
```

### Task 2: Apply the Comfort Profile in BoatWorld

**Files:**

- Modify: `tests/BoatWorld.test.ts:24-180`
- Modify: `src/survival/BoatWorld.ts:26-32`
- Modify: `src/survival/BoatWorld.ts:230-237`
- Modify: `src/survival/BoatWorld.ts:472-481`

**Interfaces:**

- Consumes: `applySurvivalBuoyancyComfortInto(output, source)` from Task 1 and the existing `BoatBuoyancy.sampleTargetInto(...)` and `smoothBoatPoseInto(...)` APIs.
- Produces: a `BoatWorld` update path that samples into `rawBoatTargetPose`, attenuates into `boatTargetPose`, and smooths the motion rig toward the attenuated target.

- [ ] **Step 1: Add a shared expected-pose helper to the BoatWorld tests**

Add this import beside the ocean imports in `tests/BoatWorld.test.ts`:

```ts
import { applySurvivalBuoyancyComfortInto } from '../src/survival/survivalBuoyancyComfort';
```

Add this helper after `snapshot(...)`:

```ts
function expectedSurvivalPose(
  time: number,
  delta: number,
  amplitudeScale: number,
) {
  const buoyancy = new BoatBuoyancy((sampleTime, x, z, scale) =>
    sampleWaveField(DEFAULT_WAVES, sampleTime, x, z, scale));
  const rawTarget = buoyancy.sampleTarget(time, 0, 0, amplitudeScale);
  const target = { y: 0, pitch: 0, roll: 0, driftX: 0, driftZ: 0 };
  applySurvivalBuoyancyComfortInto(target, rawTarget);
  return smoothBoatPose(
    { y: 0, pitch: 0, roll: 0, driftX: 0, driftZ: 0 },
    target,
    delta,
    7,
  );
}
```

- [ ] **Step 2: Change the existing motion expectations and add the weather regression**

Rename the first test to `attenuates shared buoyancy for the boat, player viewpoint, and saved items`. Replace its local `BoatBuoyancy`, `target`, and `smoothBoatPose` setup with:

```ts
const expected = expectedSurvivalPose(time, delta, 0.78);
```

Keep its motion-rig, camera-rig, local prop transform, and moved world-position assertions.

In `keeps reduced-motion secondary cues neutral while the hull floats`, replace its local `BoatBuoyancy`, `target`, and `smoothBoatPose` setup with:

```ts
const expected = expectedSurvivalPose(time, delta, 0.78);
```

Keep the ocean clock, fishing line, spray pool, motion-rig, and camera-rig assertions.

Add this test after the reduced-motion test:

```ts
it('preserves stronger squall heave inside the comfort profile', () => {
  const propModels = createTestPropModels();
  const calm = new BoatWorld(
    new PerspectiveCamera(),
    { matches: false } as MediaQueryList,
    propModels,
    createTestMoonTexture(),
    [],
  );
  const squall = new BoatWorld(
    new PerspectiveCamera(),
    { matches: false } as MediaQueryList,
    propModels,
    createTestMoonTexture(),
    [],
  );
  squall.setWeather('squall');

  calm.update(1.5, 0.1);
  squall.update(1.5, 0.1);

  const calmRig = calm.scene.getObjectByName('boat-motion-rig')!;
  const squallRig = squall.scene.getObjectByName('boat-motion-rig')!;
  const calmExpected = expectedSurvivalPose(1.5, 0.1, 0.78);
  const squallExpected = expectedSurvivalPose(1.5, 0.1, 1.35);
  expect(calmRig.position.y).toBeCloseTo(0.22 + calmExpected.y);
  expect(squallRig.position.y).toBeCloseTo(0.22 + squallExpected.y);
  expect(Math.abs(squallRig.position.y - 0.22))
    .toBeGreaterThan(Math.abs(calmRig.position.y - 0.22));

  calm.dispose();
  squall.dispose();
  propModels.dispose();
});
```

- [ ] **Step 3: Run the BoatWorld tests and verify RED**

Run:

```powershell
bun run test -- tests/BoatWorld.test.ts
```

Expected: FAIL because `BoatWorld` still applies the full shared-wave target. The first failure should report a motion-rig position or rotation that exceeds the attenuated expected value.

- [ ] **Step 4: Add reusable raw and attenuated targets to BoatWorld**

Add this import after the ocean imports in `src/survival/BoatWorld.ts`:

```ts
import { applySurvivalBuoyancyComfortInto } from './survivalBuoyancyComfort';
```

Replace the current target field:

```ts
private readonly boatTargetPose: BoatPose = { ...INITIAL_BOAT_POSE };
```

with these two caller-owned records:

```ts
private readonly rawBoatTargetPose: BoatPose = { ...INITIAL_BOAT_POSE };
private readonly boatTargetPose: BoatPose = { ...INITIAL_BOAT_POSE };
```

- [ ] **Step 5: Attenuate the sampled target before damping**

Replace the buoyancy block in `BoatWorld.update(...)` with:

```ts
const amplitudeScale = weatherAmplitudeScale(this.weather);
this.buoyancy.sampleTargetInto(
  this.rawBoatTargetPose,
  time,
  SURVIVAL_BOAT_ANCHOR.x,
  SURVIVAL_BOAT_ANCHOR.z,
  amplitudeScale,
);
applySurvivalBuoyancyComfortInto(
  this.boatTargetPose,
  this.rawBoatTargetPose,
);
smoothBoatPoseInto(this.boatPose, this.boatPose, this.boatTargetPose, delta, 7);
```

Do not change `applyBasePresentation()`, the ocean amplitude passed to `this.ocean.update(...)`, or the secondary-motion reduced-motion branch.

- [ ] **Step 6: Run the focused integration tests and verify GREEN**

Run:

```powershell
bun run test -- tests/SurvivalBuoyancyComfort.test.ts tests/BoatWorld.test.ts
```

Expected: PASS. The survival motion rig matches the 8 percent translation and 3 percent rotation profile, squall heave exceeds calm heave, and reduced-motion secondary cues remain neutral.

- [ ] **Step 7: Commit the BoatWorld integration**

```powershell
git add -- src/survival/BoatWorld.ts tests/BoatWorld.test.ts
git commit -m "feat: reduce survival buoyancy motion"
```

### Task 3: Verify the Comfort Change

**Files:**

- Verify: `src/survival/survivalBuoyancyComfort.ts`
- Verify: `src/survival/BoatWorld.ts`
- Verify: `tests/SurvivalBuoyancyComfort.test.ts`
- Verify: `tests/BoatWorld.test.ts`

**Interfaces:**

- Consumes: the pure comfort transform and BoatWorld integration from Tasks 1 and 2.
- Produces: automated and visual evidence that survival motion is subdued while ocean and weather motion remain active.

- [ ] **Step 1: Run the full automated suite**

Run:

```powershell
bun run test
bun run typecheck
bun run build
```

Expected: all Vitest files pass, TypeScript reports no errors, and Vite completes the production build. The existing Vite chunk-size warning may remain.

- [ ] **Step 2: Inspect survival motion in the browser**

Run:

```powershell
bun run dev -- --host 127.0.0.1
```

Open the local Vite URL in a desktop browser. Enter survival and observe at least one calm wave cycle and one squall wave cycle. Confirm:

- The ocean keeps its current full wave animation.
- The lifeboat and attached camera show slight heave and almost no pitch or roll.
- Squall motion remains stronger than calm motion without causing large camera movement.
- Recovered items and their interaction targets stay aligned with the boat.
- With `prefers-reduced-motion` enabled, spray and rope lag remain suppressed.

- [ ] **Step 3: Review the final diff and worktree state**

Run:

```powershell
git diff --check HEAD~2..HEAD
git status --short
```

Expected: `git diff --check` exits `0`. `git status --short` contains no files from this plan; preserve unrelated user files and concurrent task files.

## Plan Self-Review

- **Spec coverage:** Task 1 defines the exact 8 percent translation and 3 percent rotation profile. Task 2 applies it between shared-wave sampling and damping while preserving the motion-rig hierarchy, weather scales, ocean amplitude, and reduced-motion secondary effects. Task 3 covers automated checks and comfort-focused browser inspection.
- **Placeholder scan:** The plan contains no placeholders or undefined implementation steps.
- **Type consistency:** Both tasks use `applySurvivalBuoyancyComfortInto(output: BoatPose, source: Readonly<BoatPose>): void`. `BoatWorld` owns separate raw and attenuated `BoatPose` records and passes the attenuated record to `smoothBoatPoseInto`.

# Dangerous Waters Event Alignment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Align Dangerous Waters with the night reveal, choice hold, impact hold, shared-wave rocks, and dawn sequence in `EVENT_PROGRESS.md`.

**Architecture:** Extend the dedicated `DangerousWatersPresentation` and its existing delegation seam. Copy additive scene poses through `EventPresentationLayer` into caller-owned `BoatWorld` samples. Keep rule state inside `SurvivalSession` and lifecycle order inside `SurvivalPhase`.

**Tech Stack:** TypeScript 5.9, Three.js 0.180, Vitest 3.2, Vite 7.3.

## Global Constraints

Dangerous Waters is a night event from day 2 through day 30.

Existing weights, damage ranges, Pressure changes, `direction2`, and one-appearance rules remain unchanged.

Use the shared wave field for rocks, foam, ocean rendering, buoyancy, and vessel motion.

Keep gameplay rules deterministic without a renderer.

Allocate no objects during update or render paths.

Give every Three.js resource one owner and one disposer.

Do not add reduced-motion behavior.

---

### Task 1: Move Dangerous Waters into the night lifecycle

**Files:**
- Modify: `src/survival/events.ts:16-27`
- Modify: `tests/survivalEvents.test.ts`
- Modify: `tests/SurvivalSession.test.ts`
- Modify: `tests/SurvivalPhase.test.ts`

**Interfaces:**
- Consumes: `INCLUDED_EVENT_PHASES` and existing phase-aware event selection.
- Produces: Dangerous Waters snapshots with `state: 'nightEvent'`.

- [ ] **Step 1: Write the failing phase tests**

Add assertions that Dangerous Waters has `phase: 'night'`.

Update the phase test to expect this order after resolution:

```ts
expect(calls).toEqual([
  'hold-result',
  'cover',
  'clear-event',
  'dawn',
  'scene-render',
  'uncover',
]);
```

Keep the rule table assertions for weight 15, days 2-30, and one appearance.

- [ ] **Step 2: Run the focused tests and verify failure**

Run:

```powershell
& 'C:\Users\Corashina\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' 'node_modules\vitest\vitest.mjs' run 'tests\survivalEvents.test.ts' 'tests\SurvivalSession.test.ts' 'tests\SurvivalPhase.test.ts'
```

Expected: FAIL because Dangerous Waters is still a day event.

- [ ] **Step 3: Change the event phase**

Change only this phase entry:

```ts
export const INCLUDED_EVENT_PHASES = Object.freeze({
  'dangerous-waters': 'night',
  // Existing entries remain unchanged.
} as const);
```

Update day-pool tests that selected Dangerous Waters as their first day event.

Select another named day event in those tests.

- [ ] **Step 4: Run focused tests**

Run the Task 1 command again.

Expected: all selected files pass.

- [ ] **Step 5: Commit**

```powershell
git add -- src/survival/events.ts tests/survivalEvents.test.ts tests/SurvivalSession.test.ts tests/SurvivalPhase.test.ts
git commit -m "fix: move dangerous waters to night"
```

---

### Task 2: Add the complete keyed presentation state

**Files:**
- Modify: `src/survival/DangerousWatersPresentation.ts`
- Modify: `tests/DangerousWatersPresentation.test.ts`

**Interfaces:**
- Consumes: `sampleWaveFieldInto`, `DEFAULT_WAVES`, and `ActionOutcome`.
- Produces:

```ts
export interface DangerousWatersBoatReaction {
  driftX: number;
  pitch: number;
  yaw: number;
  roll: number;
  cameraYaw: number;
  cameraZ: number;
  lightScale: number;
  supplyRoll: number;
  supplyLift: number;
}
```

- [ ] **Step 1: Write failing reveal and shared-wave tests**

Test the creature sequence at four reveal points:

```ts
view.stage();
const reveal = view.reveal();
view.update(1.2, 1.2);
expect(lurker.scale.y).toBeGreaterThan(0.6);
view.update(1.75, 0.55);
expect(lurker.scale.y).toBeGreaterThan(0.9);
view.update(2.1, 0.35);
expect(lurker.scale.y).toBeLessThan(0.8);
view.update(2.4, 0.3);
await reveal;
expect(lurker.scale.y).toBe(0);
```

Capture all three rock transforms.

Call `update(1, 0)` and `update(2, 0)`.

Assert each rock changes vertical position or tilt.

Assert the passage layout remains bounded within 0.18 world units.

- [ ] **Step 2: Write failing held-choice and damaged-hold tests**

Complete Map and Compass motions directly on the presentation.

Assert `copyItemPose()` remains true after each motion completes.

Assert the held pose has positive lift and forward travel.

React with `hull: -7`, finish the reaction, and assert:

```ts
expect(view.copyBoatReaction(reaction)).toBe(true);
expect(Math.abs(reaction.roll)).toBeGreaterThan(0.01);
expect(Math.abs(reaction.supplyRoll)).toBeGreaterThan(0.01);
```

React with `hull: -25`.

Assert the severe rock scrape remains offset after completion.

- [ ] **Step 3: Run the presentation test and verify failure**

Run:

```powershell
& 'C:\Users\Corashina\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' 'node_modules\vitest\vitest.mjs' run 'tests\DangerousWatersPresentation.test.ts'
```

Expected: FAIL for sink, shared-wave rocks, held items, and result holds.

- [ ] **Step 4: Add reusable rock-wave state**

Add one fixed member per rock:

```ts
interface RockWaveMember {
  readonly root: Group;
  readonly base: Vector3;
  readonly baseRotation: Vector3;
  readonly phaseX: number;
  readonly phaseZ: number;
}
```

Create this array once in the constructor.

Sample `DEFAULT_WAVES` into the existing reusable `waveSample`.

Apply restrained height, pitch, and roll after keyed poses:

```ts
rock.root.position.y += this.waveSample.height * 0.08;
rock.root.rotation.x += this.waveSample.normal.z * 0.025;
rock.root.rotation.z -= this.waveSample.normal.x * 0.025;
```

Do not move rocks more than 0.18 world units from their keyed bases.

- [ ] **Step 5: Implement the reveal envelope**

Use three explicit sections:

```ts
const peek = smoothstep((progress - 0.42) / 0.2);
const sink = smoothstep((progress - 0.82) / 0.16);
this.lurker.scale.y = peek * (1 - sink);
```

Add sideways drift and camera pan:

```ts
this.boatReaction.driftX = Math.sin(Math.PI * progress) * -0.34;
this.boatReaction.cameraYaw = smoothstep(progress) * -0.09;
```

Keep the camera pan held at reveal completion.

- [ ] **Step 6: Implement held choices**

Track the held choice separately:

```ts
private heldChoiceId: DangerousWatersChoiceId | null = null;
```

Use a lift envelope that ends at one:

```ts
const lift = smoothstep(Math.min(1, progress / 0.55));
```

After completion, keep `heldKind = 'choice'`, `heldProgress = 1`, and the chosen identifier.

Return the held item from `copyItemPose()`.

Clear the held choice when reaction, clear, visibility settlement, or disposal starts.

- [ ] **Step 7: Implement damage and severe holds**

Separate impact and hold:

```ts
const impact = Math.sin(Math.PI * progress);
const hold = smoothstep((progress - 0.55) / 0.45);
```

Use impact for the sharp jolt.

Use hold for the final boat roll, camera offset, supply roll, and rock contact.

For severe damage, keep the scrape offset.

Hide fragment meshes before the held result ends.

- [ ] **Step 8: Run the presentation test**

Run the Task 2 command again.

Expected: all presentation tests pass.

- [ ] **Step 9: Commit**

```powershell
git add -- src/survival/DangerousWatersPresentation.ts tests/DangerousWatersPresentation.test.ts
git commit -m "feat: complete dangerous waters choreography"
```

---

### Task 3: Apply borrowed world motion

**Files:**
- Modify: `src/survival/BoatWorld.ts`
- Modify: `tests/BoatWorld.test.ts`

**Interfaces:**
- Consumes: the expanded `DangerousWatersBoatReaction`.
- Produces: additive boat drift, camera pan, light scale, and loose-supply motion.

- [ ] **Step 1: Write failing BoatWorld tests**

During the reveal midpoint, assert:

```ts
expect(Math.abs(motionRig.position.x - baseMotionX)).toBeGreaterThan(0.2);
expect(Math.abs(cueCameraRig.rotation.y)).toBeGreaterThan(0.04);
```

During a damage midpoint, assert one supply root differs from its base rotation.

After reaction completion, assert the motion rig keeps a small nonzero roll.

After `clearEvent()`, assert all borrowed poses return to base.

- [ ] **Step 2: Run the BoatWorld tests and verify failure**

Run:

```powershell
& 'C:\Users\Corashina\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' 'node_modules\vitest\vitest.mjs' run 'tests\BoatWorld.test.ts'
```

Expected: FAIL because drift, camera yaw, supply shake, and result hold are not applied.

- [ ] **Step 3: Apply every copied field**

Extend `applyDangerousWatersPresentation()`:

```ts
this.motionRig.position.x += reaction.driftX;
this.motionRig.rotation.x += reaction.pitch;
this.motionRig.rotation.y += reaction.yaw;
this.motionRig.rotation.z += reaction.roll;
this.cueCameraRig.rotation.y += reaction.cameraYaw;
this.cueCameraRig.position.z += reaction.cameraZ;
this.ambient.intensity *= reaction.lightScale;
this.key.intensity *= reaction.lightScale;
this.supplyDisplay.applyEventAmbientPose(
  reaction.supplyRoll,
  reaction.supplyLift,
);
```

Continue to reset the caller-owned pose once each frame.

Do not allocate a new pose during update.

- [ ] **Step 4: Preserve held items until resolution starts**

Keep the presentation-held item active through choice completion.

Release the pinned actor in the existing `finally` block before event resolution.

Ensure `clearEvent()` and `setDocumentHidden(true)` restore supply bases.

- [ ] **Step 5: Run the BoatWorld tests**

Run the Task 3 command again.

Expected: all BoatWorld tests pass.

- [ ] **Step 6: Commit**

```powershell
git add -- src/survival/BoatWorld.ts tests/BoatWorld.test.ts
git commit -m "feat: borrow boat motion for dangerous waters"
```

---

### Task 4: Verify cover, cleanup, and dawn order

**Files:**
- Modify: `src/survival/SurvivalPhase.ts`
- Modify: `tests/SurvivalPhase.test.ts`
- Modify: `tests/SurvivalUI.test.ts` only if phase assertions require new UI state checks.

**Interfaces:**
- Consumes: the existing night-event path in `runEventResolution()`.
- Produces: result hold, cover, clear, dawn, render, and uncover order.

- [ ] **Step 1: Add a full Dangerous Waters lifecycle test**

Use a night-event snapshot and record these calls:

```ts
[
  'choice-ui',
  'choice-world',
  'resolve',
  'impact',
  'outcome',
  'hold-result',
  'cover',
  'clear-event',
  'dawn',
  'scene-render',
  'uncover',
]
```

Assert choices remain locked until reveal completion.

Assert the exact Hull result remains visible during `hold-result`.

Assert `clear-event` occurs while the cover is closed.

- [ ] **Step 2: Run the phase and UI tests**

Run:

```powershell
& 'C:\Users\Corashina\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' 'node_modules\vitest\vitest.mjs' run 'tests\SurvivalPhase.test.ts' 'tests\SurvivalUI.test.ts'
```

Expected: PASS if the standard night path already gives the required order.

If it fails, change only the Dangerous Waters delegation point.

Do not create a second dawn implementation.

- [ ] **Step 3: Run all Dangerous Waters focused tests**

Run:

```powershell
& 'C:\Users\Corashina\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' 'node_modules\vitest\vitest.mjs' run 'tests\survivalEvents.test.ts' 'tests\SurvivalSession.test.ts' 'tests\DangerousWatersPresentation.test.ts' 'tests\BoatWorld.test.ts' 'tests\SurvivalPhase.test.ts' 'tests\SurvivalUI.test.ts'
```

Expected: all selected files pass.

- [ ] **Step 4: Commit**

```powershell
git add -- src/survival/SurvivalPhase.ts tests/SurvivalPhase.test.ts tests/SurvivalUI.test.ts
git commit -m "test: protect dangerous waters night lifecycle"
```

Do not include unchanged files in the commit.

---

### Task 5: Final verification and user test

**Files:**
- Verify: all changed source and test files.

**Interfaces:**
- Consumes: the completed Dangerous Waters implementation.
- Produces: a clean branch ready for user testing.

- [ ] **Step 1: Run the full test suite**

```powershell
& 'C:\Users\Corashina\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' 'node_modules\vitest\vitest.mjs' run
```

Expected: zero failing files and zero failing tests.

- [ ] **Step 2: Run type checking and production build**

```powershell
& 'C:\Users\Corashina\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' 'node_modules\typescript\bin\tsc' --noEmit
& 'C:\Users\Corashina\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' 'node_modules\vite\bin\vite.js' build
```

Expected: both commands exit with code 0.

- [ ] **Step 3: Run the game**

```powershell
& 'C:\Users\Corashina\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' 'node_modules\vite\bin\vite.js' --host 127.0.0.1 --port 4173
```

Open `http://127.0.0.1:4173/`.

Use a 1280 by 720 viewport.

Verify the rock corridor remains readable.

Verify the camera pan does not hide Map, Compass, or Sleep controls.

Verify the creature peek, pause, and sink read as separate beats.

Verify the result text remains readable over safe and damaged poses.

- [ ] **Step 4: Check repository state**

```powershell
git diff --check
git status --short
git log --oneline --decorate -8
```

Expected: no whitespace errors and no uncommitted feature changes.


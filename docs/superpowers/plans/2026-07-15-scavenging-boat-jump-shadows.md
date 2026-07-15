# Scavenging Boat Distance, Low-Object Landing, and Shadow Coverage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the scavenging lifeboat far enough to expose water, let the player land on objects up to 0.6 units high, and cover the freighter and lifeboat with one stable shadow map.

**Architecture:** `ShipBuild.lifeboatAnchor` remains the source for lifeboat placement and buoyancy. The collision module adds a pure support-height query, `PlayerController` combines it with existing jump physics, and `Environment` exports one fixed shadow configuration for its directional light. The survival phase and the separate ship-layout simplification stay outside this change.

**Tech Stack:** TypeScript, Three.js, Vite, Vitest, Bun

## Global Constraints

- Move only the scavenging lifeboat anchor to `[9.0, 0.35, -6.5]`; keep the evacuation point `[5.4, 3.72, -6.5]` and throw speed `7.5`.
- Let the player land on collider tops no more than `0.6` units above the deck. Do not add automatic step-up.
- Keep taller furniture blocking a standing player. Do not change player radius `0.35`, body height `1.5`, jump speed `5.2`, or gravity `14`.
- Use one `2048 x 2048` scavenging shadow map with bounds `left=-24`, `right=24`, `top=24`, `bottom=-24`, `near=0.5`, `far=80`, `bias=-0.0005`, and `normalBias=0.03`.
- Do not modify `src/world/ShipLayout.ts` or layout-simplification tests. Wait for `bun run test tests/ShipLayout.test.ts` to pass before editing because that work currently overlaps this repository.
- Preserve the user-owned dirty worktree. The known task files already contain unrelated uncommitted work, so do not stage or commit source/test files. Capture byte-for-byte before/after snapshots and isolated diffs for each task.
- Do not download assets or add dependencies.

---

## File Structure

- `src/world/Ship.ts` publishes the new scavenging lifeboat anchor.
- `src/player/collisions.ts` calculates the highest safe low-object support under the player.
- `src/player/PlayerController.ts` applies support height to jump, landing, standing, and step-off behavior.
- `src/world/Environment.ts` owns the scavenging directional light and fixed shadow configuration.
- `tests/world.test.ts` locks the anchor, buoyancy sample, and unchanged evacuation point.
- `tests/interaction.test.ts` proves the normal throw reaches the moved boat.
- `tests/collisions.test.ts` covers support selection and rejection.
- `tests/PlayerController.test.ts` covers landing, standing, and falling from a low object.
- `tests/Environment.test.ts` inspects shadow settings and full-scene coverage.

---

### Task 1: Move the Scavenging Lifeboat and Preserve Throw Reach

**Files:**
- Modify: `src/world/Ship.ts:185-196`
- Modify: `tests/world.test.ts:413-452,788-799`
- Modify: `tests/interaction.test.ts:330-361`

**Interfaces:**
- Consumes: `ShipBuild.lifeboatAnchor: Vector3`, `World.boatAnchor`, `CarryController.throw(speed = 7.5)`.
- Produces: the scavenging anchor `[9.0, 0.35, -6.5]`; no new runtime API.

- [ ] **Step 1: Confirm the layout work is stable and snapshot task files**

Run:

```powershell
bun run test tests/ShipLayout.test.ts
git diff --cached --name-only
New-Item -ItemType Directory -Force .superpowers/sdd/boat-jump-shadows-task-1-before/src/world | Out-Null
New-Item -ItemType Directory -Force .superpowers/sdd/boat-jump-shadows-task-1-before/tests | Out-Null
Copy-Item src/world/Ship.ts .superpowers/sdd/boat-jump-shadows-task-1-before/src/world/Ship.ts
Copy-Item tests/world.test.ts .superpowers/sdd/boat-jump-shadows-task-1-before/tests/world.test.ts
Copy-Item tests/interaction.test.ts .superpowers/sdd/boat-jump-shadows-task-1-before/tests/interaction.test.ts
```

Expected: the layout suite exits `0`; the staged-file list is empty. Stop if either condition fails.

- [ ] **Step 2: Write the failing anchor and buoyancy assertions**

Change the anchor expectations in `tests/world.test.ts`:

```ts
const target = buoyancy.sampleTarget(time, 9.0, -6.5, sinking.waveAmplitudeScale);

// after world.update(...)
expect(world.lifeboat.position.x).toBeCloseTo(9.0 + expectedPose.driftX);
expect(world.lifeboat.position.y).toBeCloseTo(0.35 + expectedPose.y);
expect(world.lifeboat.position.z).toBeCloseTo(-6.5 + expectedPose.driftZ);
```

Change the ship contract assertion:

```ts
expect(ship.evacuationPoint.toArray()).toEqual([5.4, 3.72, -6.5]);
expect(ship.lifeboatAnchor.toArray()).toEqual([9.0, 0.35, -6.5]);
```

- [ ] **Step 3: Add the throwing-range regression**

Add this test to the `CarryController` section of `tests/interaction.test.ts`:

```ts
it('reaches the moved scavenging lifeboat with the normal throw speed', () => {
  const scene = new Scene();
  const camera = new PerspectiveCamera();
  camera.position.set(5.4, 3.72, -6.5);
  camera.lookAt(9.0, 1.5, -6.5);
  scene.add(camera);
  const object = new Group();
  scene.add(object);
  const carry = new CarryController(scene, camera);
  const outcomes: string[] = [];
  const lifeboatBox = new Box3(
    new Vector3(7.65, 0.05, -9.22),
    new Vector3(10.35, 1.35, -3.78),
  );

  carry.pickUp({ instanceId: 'waterJug-1', type: 'waterJug' }, object);
  carry.throw();
  for (let frame = 0; frame < 120 && carry.flightActive; frame += 1) {
    carry.update(1 / 60, lifeboatBox, () => -100, {
      onSaved: (instance) => outcomes.push(`saved:${instance.instanceId}`),
      onLost: (instance) => outcomes.push(`lost:${instance.instanceId}`),
      onLanded: (instance) => outcomes.push(`landed:${instance.instanceId}`),
    });
  }

  expect(outcomes).toEqual(['saved:waterJug-1']);
});
```

- [ ] **Step 4: Run RED verification**

Run:

```powershell
bun run test tests/world.test.ts tests/interaction.test.ts
```

Expected: the anchor assertions fail with X `7.6` instead of `9.0`. The throw regression may pass because it verifies the unchanged throw system.

- [ ] **Step 5: Change the single anchor source**

In `src/world/Ship.ts`, change only the returned anchor:

```ts
lifeboatAnchor: new Vector3(9.0, 0.35, -6.5),
```

Do not add a second boat-position constant to `World.ts`.

- [ ] **Step 6: Run GREEN verification**

Run:

```powershell
bun run test tests/world.test.ts tests/interaction.test.ts
bun run typecheck
```

Expected: both test files and typecheck exit `0`.

- [ ] **Step 7: Create the isolated review diff**

Run:

```powershell
New-Item -ItemType Directory -Force .superpowers/sdd/boat-jump-shadows-task-1-after/src/world | Out-Null
New-Item -ItemType Directory -Force .superpowers/sdd/boat-jump-shadows-task-1-after/tests | Out-Null
Copy-Item src/world/Ship.ts .superpowers/sdd/boat-jump-shadows-task-1-after/src/world/Ship.ts
Copy-Item tests/world.test.ts .superpowers/sdd/boat-jump-shadows-task-1-after/tests/world.test.ts
Copy-Item tests/interaction.test.ts .superpowers/sdd/boat-jump-shadows-task-1-after/tests/interaction.test.ts
git diff --no-index -- .superpowers/sdd/boat-jump-shadows-task-1-before .superpowers/sdd/boat-jump-shadows-task-1-after | Out-File .superpowers/sdd/boat-jump-shadows-task-1-review.diff -Encoding utf8
```

Expected: the isolated diff contains only the new X coordinate and its regression tests. Leave source and tests unstaged.

---

### Task 2: Add a Pure Low-Object Support Query

**Files:**
- Modify: `src/player/collisions.ts`
- Modify: `tests/collisions.test.ts`

**Interfaces:**
- Consumes: `CollisionBox`, `LocalPlayerPosition`, `PLAYER_BODY_HEIGHT = 1.5`.
- Produces: `MAX_JUMPABLE_SUPPORT_HEIGHT = 0.6` and `findSupportEyeHeight(position, radius, deckEyeHeight, boxes): number`.

- [ ] **Step 1: Snapshot collision files**

Run:

```powershell
New-Item -ItemType Directory -Force .superpowers/sdd/boat-jump-shadows-task-2-before/src/player | Out-Null
New-Item -ItemType Directory -Force .superpowers/sdd/boat-jump-shadows-task-2-before/tests | Out-Null
Copy-Item src/player/collisions.ts .superpowers/sdd/boat-jump-shadows-task-2-before/src/player/collisions.ts
Copy-Item tests/collisions.test.ts .superpowers/sdd/boat-jump-shadows-task-2-before/tests/collisions.test.ts
```

- [ ] **Step 2: Write failing support-selection tests**

Import the new API in `tests/collisions.test.ts`:

```ts
import {
  findSupportEyeHeight,
  MAX_JUMPABLE_SUPPORT_HEIGHT,
  PLAYER_BODY_HEIGHT,
  movementAxes,
  resolveLocalMovement,
} from '../src/player/collisions';
```

Add these tests:

```ts
it('selects the highest collider top within the 0.6-unit support limit', () => {
  const deckEyeHeight = 3.72;
  const deckFeetY = deckEyeHeight - PLAYER_BODY_HEIGHT;
  const boxes: CollisionBox[] = [
    { minX: -0.8, maxX: 0.8, minY: deckFeetY, maxY: deckFeetY + 0.3, minZ: -0.8, maxZ: 0.8 },
    { minX: -0.6, maxX: 0.6, minY: deckFeetY, maxY: deckFeetY + 0.6, minZ: -0.6, maxZ: 0.6 },
  ];

  expect(MAX_JUMPABLE_SUPPORT_HEIGHT).toBe(0.6);
  expect(findSupportEyeHeight({ x: 0, z: 0 }, 0.35, deckEyeHeight, boxes))
    .toBeCloseTo(deckEyeHeight + 0.6);
});

it('keeps the deck as support for a taller object', () => {
  const deckEyeHeight = 3.72;
  const deckFeetY = deckEyeHeight - PLAYER_BODY_HEIGHT;
  const tall: CollisionBox = {
    minX: -0.6, maxX: 0.6,
    minY: deckFeetY, maxY: deckFeetY + 0.61,
    minZ: -0.6, maxZ: 0.6,
  };

  expect(findSupportEyeHeight({ x: 0, z: 0 }, 0.35, deckEyeHeight, [tall]))
    .toBe(deckEyeHeight);
});

it('rejects a low support when another collider would contain the player body', () => {
  const deckEyeHeight = 3.72;
  const deckFeetY = deckEyeHeight - PLAYER_BODY_HEIGHT;
  const support: CollisionBox = {
    minX: -0.6, maxX: 0.6,
    minY: deckFeetY, maxY: deckFeetY + 0.6,
    minZ: -0.6, maxZ: 0.6,
  };
  const obstruction: CollisionBox = {
    minX: -0.6, maxX: 0.6,
    minY: deckFeetY + 0.9, maxY: deckFeetY + 2.2,
    minZ: -0.6, maxZ: 0.6,
  };

  expect(findSupportEyeHeight(
    { x: 0, z: 0 }, 0.35, deckEyeHeight, [support, obstruction],
  )).toBe(deckEyeHeight);
});
```

- [ ] **Step 3: Run RED verification**

Run:

```powershell
bun run test tests/collisions.test.ts
```

Expected: TypeScript collection fails because `findSupportEyeHeight` and `MAX_JUMPABLE_SUPPORT_HEIGHT` do not exist.

- [ ] **Step 4: Implement the pure support query**

Add this API to `src/player/collisions.ts`:

```ts
export const MAX_JUMPABLE_SUPPORT_HEIGHT = 0.6;
const SUPPORT_EPSILON = 1e-6;

function circleOverlapsFootprint(
  position: Pick<LocalPlayerPosition, 'x' | 'z'>,
  radius: number,
  box: CollisionBox,
): boolean {
  const closestX = Math.max(box.minX, Math.min(position.x, box.maxX));
  const closestZ = Math.max(box.minZ, Math.min(position.z, box.maxZ));
  return (position.x - closestX) ** 2 + (position.z - closestZ) ** 2 < radius ** 2;
}

function bodyOverlapsBox(
  position: Pick<LocalPlayerPosition, 'x' | 'z'>,
  eyeHeight: number,
  radius: number,
  box: CollisionBox,
): boolean {
  const feetY = eyeHeight - PLAYER_BODY_HEIGHT;
  return feetY < box.maxY
    && eyeHeight > box.minY
    && circleOverlapsFootprint(position, radius, box);
}

export function findSupportEyeHeight(
  position: Pick<LocalPlayerPosition, 'x' | 'z'>,
  radius: number,
  deckEyeHeight: number,
  boxes: readonly CollisionBox[],
): number {
  const deckFeetY = deckEyeHeight - PLAYER_BODY_HEIGHT;
  const candidates = boxes
    .filter((box) => circleOverlapsFootprint(position, radius, box))
    .filter((box) => {
      const supportHeight = box.maxY - deckFeetY;
      return supportHeight > SUPPORT_EPSILON
        && supportHeight <= MAX_JUMPABLE_SUPPORT_HEIGHT + SUPPORT_EPSILON;
    })
    .sort((left, right) => right.maxY - left.maxY);

  for (const candidate of candidates) {
    const eyeHeight = candidate.maxY + PLAYER_BODY_HEIGHT;
    const obstructed = boxes.some((box) => (
      box !== candidate && bodyOverlapsBox(position, eyeHeight, radius, box)
    ));
    if (!obstructed) return eyeHeight;
  }
  return deckEyeHeight;
}
```

Refactor `resolveLocalMovement` to use `circleOverlapsFootprint` only if the existing boundary behavior stays byte-for-byte equivalent. Do not change collision tolerances.

- [ ] **Step 5: Run GREEN verification**

Run:

```powershell
bun run test tests/collisions.test.ts
bun run typecheck
```

Expected: the collision suite and typecheck exit `0`.

- [ ] **Step 6: Create the isolated review diff**

Run:

```powershell
New-Item -ItemType Directory -Force .superpowers/sdd/boat-jump-shadows-task-2-after/src/player | Out-Null
New-Item -ItemType Directory -Force .superpowers/sdd/boat-jump-shadows-task-2-after/tests | Out-Null
Copy-Item src/player/collisions.ts .superpowers/sdd/boat-jump-shadows-task-2-after/src/player/collisions.ts
Copy-Item tests/collisions.test.ts .superpowers/sdd/boat-jump-shadows-task-2-after/tests/collisions.test.ts
git diff --no-index -- .superpowers/sdd/boat-jump-shadows-task-2-before .superpowers/sdd/boat-jump-shadows-task-2-after | Out-File .superpowers/sdd/boat-jump-shadows-task-2-review.diff -Encoding utf8
```

Expected: the diff contains the support query and its three tests. Leave the files unstaged.

---

### Task 3: Integrate Landing Support with Jump Physics

**Files:**
- Modify: `src/player/PlayerController.ts`
- Modify: `tests/PlayerController.test.ts`

**Interfaces:**
- Consumes: `findSupportEyeHeight(...)`, `resolveLocalMovement(...)`, `PLAYER_BODY_HEIGHT`, existing `InputController.consumeJump()`.
- Produces: jump landing, standing support, and gravity-driven step-off behavior; no public controller API change.

- [ ] **Step 1: Snapshot controller files**

Copy `src/player/PlayerController.ts` and `tests/PlayerController.test.ts` into `.superpowers/sdd/boat-jump-shadows-task-3-before` with their directory structure.

- [ ] **Step 2: Write the failing landing and step-off test**

Add this test to `tests/PlayerController.test.ts`:

```ts
it('lands on a 0.6-unit object, stands on it, then falls to deck after stepping off', () => {
  const deckEyeHeight = 3.72;
  const supportTop = deckEyeHeight - 1.5 + 0.6;
  const support = {
    minX: -0.7, maxX: 0.7,
    minY: deckEyeHeight - 1.5, maxY: supportTop,
    minZ: 0.75, maxZ: 2.0,
  };
  const input = new TestInput();
  const controller = new PlayerController(
    new PerspectiveCamera(),
    new Object3D(),
    new Vector3(0, deckEyeHeight, 0),
    [support],
    TEST_NAVIGATION_BOUNDS,
    vi.fn(),
  );

  input.movement = { x: 0, z: -1 };
  input.queueJump();
  for (let frame = 0; frame < 4; frame += 1) {
    controller.update(0.1, input.asControllerInput());
  }
  input.movement = { x: 0, z: 0 };
  for (let frame = 0; frame < 12; frame += 1) {
    controller.update(0.1, input.asControllerInput());
  }

  expect(controller.localPosition.y).toBeCloseTo(supportTop + 1.5);
  const standingY = controller.localPosition.y;
  controller.update(0.1, input.asControllerInput());
  expect(controller.localPosition.y).toBeCloseTo(standingY);

  input.movement = { x: 0, z: -1 };
  for (let frame = 0; frame < 5; frame += 1) {
    controller.update(0.1, input.asControllerInput());
  }
  input.movement = { x: 0, z: 0 };
  for (let frame = 0; frame < 12; frame += 1) {
    controller.update(0.1, input.asControllerInput());
  }

  expect(controller.localPosition.y).toBeCloseTo(deckEyeHeight);
});
```

- [ ] **Step 3: Run RED verification**

Run:

```powershell
bun run test tests/PlayerController.test.ts
```

Expected: the new test fails because Y returns to deck height instead of stopping at the support top.

- [ ] **Step 4: Integrate support height in `PlayerController`**

Import the helper:

```ts
import {
  findSupportEyeHeight,
  resolveLocalMovement,
} from './collisions';
```

Rename the private `groundHeight` field to `deckEyeHeight`. Set it from `start.y` in the constructor and reset method. Replace the vertical section of `update` with this flow:

```ts
const currentSupport = findSupportEyeHeight(
  this.localPosition,
  0.35,
  this.deckEyeHeight,
  this.colliders,
);
const grounded = this.localPosition.y <= currentSupport + GROUND_EPSILON
  && this.verticalVelocity <= 0;
if (input.consumeJump() && grounded) this.verticalVelocity = JUMP_SPEED;

const nextY = this.localPosition.y
  + this.verticalVelocity * delta
  - 0.5 * GRAVITY * delta * delta;
this.verticalVelocity -= GRAVITY * delta;

const current: LocalPlayerPosition = {
  x: this.localPosition.x,
  y: this.localPosition.y,
  z: this.localPosition.z,
};
const desired: LocalPlayerPosition = {
  x: current.x + this.movement.x,
  y: Math.max(this.deckEyeHeight, nextY),
  z: current.z + this.movement.z,
};
const resolved = resolveLocalMovement(current, desired, 0.35, this.colliders);
const support = findSupportEyeHeight(
  resolved,
  0.35,
  this.deckEyeHeight,
  this.colliders,
);
if (
  this.verticalVelocity <= 0
  && current.y >= support - GROUND_EPSILON
  && resolved.y <= support + GROUND_EPSILON
) {
  resolved.y = support;
  this.verticalVelocity = 0;
}
this.localPosition.set(resolved.x, resolved.y, resolved.z);
```

Update safe-position storage to use `this.deckEyeHeight`, and reset `verticalVelocity` on falls as before.

- [ ] **Step 5: Run GREEN and regression verification**

Run:

```powershell
bun run test tests/PlayerController.test.ts tests/collisions.test.ts
bun run typecheck
```

Expected: both suites and typecheck exit `0`. Existing jump, rail blocking, fall recovery, and reset tests remain green.

- [ ] **Step 6: Create the isolated review diff**

Run:

```powershell
New-Item -ItemType Directory -Force .superpowers/sdd/boat-jump-shadows-task-3-after/src/player | Out-Null
New-Item -ItemType Directory -Force .superpowers/sdd/boat-jump-shadows-task-3-after/tests | Out-Null
Copy-Item src/player/PlayerController.ts .superpowers/sdd/boat-jump-shadows-task-3-after/src/player/PlayerController.ts
Copy-Item tests/PlayerController.test.ts .superpowers/sdd/boat-jump-shadows-task-3-after/tests/PlayerController.test.ts
git diff --no-index -- .superpowers/sdd/boat-jump-shadows-task-3-before .superpowers/sdd/boat-jump-shadows-task-3-after | Out-File .superpowers/sdd/boat-jump-shadows-task-3-review.diff -Encoding utf8
```

Expected: the diff contains controller support integration and its landing/step-off test. Leave the files unstaged.

---

### Task 4: Configure Full-Scene Scavenging Shadows

**Files:**
- Modify: `src/world/Environment.ts`
- Create: `tests/Environment.test.ts`

**Interfaces:**
- Consumes: Three.js `DirectionalLight`, `DirectionalLightShadow`, and the renderer's existing `PCFSoftShadowMap` setting.
- Produces: `SCAVENGE_SHADOW_CONFIG` with exact map, camera, and bias values.

- [ ] **Step 1: Snapshot the environment file and reserve the new test path**

Copy `src/world/Environment.ts` into `.superpowers/sdd/boat-jump-shadows-task-4-before/src/world/Environment.ts`. Confirm `tests/Environment.test.ts` does not exist before creating it.

- [ ] **Step 2: Write the failing shadow configuration test**

Create `tests/Environment.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { DirectionalLight, Scene, Texture, Vector3 } from 'three';
import { Environment, SCAVENGE_SHADOW_CONFIG } from '../src/world/Environment';

describe('scavenging environment shadows', () => {
  it('covers the freighter and moved lifeboat with one fixed 2048 shadow map', () => {
    const scene = new Scene();
    const environment = new Environment(scene, new Texture());
    const lights = scene.children.filter((child): child is DirectionalLight => (
      child instanceof DirectionalLight
    ));
    expect(lights).toHaveLength(1);
    const light = lights[0]!;
    const camera = light.shadow.camera;

    expect(SCAVENGE_SHADOW_CONFIG).toEqual({
      mapSize: 2048,
      left: -24,
      right: 24,
      top: 24,
      bottom: -24,
      near: 0.5,
      far: 80,
      bias: -0.0005,
      normalBias: 0.03,
    });
    expect(light.shadow.mapSize.toArray()).toEqual([2048, 2048]);
    expect(camera).toMatchObject({
      left: -24, right: 24, top: 24, bottom: -24, near: 0.5, far: 80,
    });
    expect(light.shadow.bias).toBe(-0.0005);
    expect(light.shadow.normalBias).toBe(0.03);

    scene.updateMatrixWorld(true);
    light.shadow.updateMatrices(light);
    const coveragePoints = [
      new Vector3(-6.05, -5, -17.6),
      new Vector3(-6.05, 9, 17.6),
      new Vector3(10.6, -5, -17.6),
      new Vector3(10.6, 9, 17.6),
    ];
    coveragePoints.forEach((point) => {
      const clip = point.clone().project(camera);
      expect(Math.abs(clip.x), point.toArray().join(',')).toBeLessThanOrEqual(1);
      expect(Math.abs(clip.y), point.toArray().join(',')).toBeLessThanOrEqual(1);
      expect(clip.z, point.toArray().join(',')).toBeGreaterThanOrEqual(-1);
      expect(clip.z, point.toArray().join(',')).toBeLessThanOrEqual(1);
    });
    environment.dispose();
  });
});
```

- [ ] **Step 3: Run RED verification**

Run:

```powershell
bun run test tests/Environment.test.ts
```

Expected: collection fails because `SCAVENGE_SHADOW_CONFIG` does not exist, or assertions report the default `512 x 512` map and default camera bounds.

- [ ] **Step 4: Export and apply the shadow configuration**

Add this constant after the particle-count constants in `src/world/Environment.ts`:

```ts
export const SCAVENGE_SHADOW_CONFIG = Object.freeze({
  mapSize: 2048,
  left: -24,
  right: 24,
  top: 24,
  bottom: -24,
  near: 0.5,
  far: 80,
  bias: -0.0005,
  normalBias: 0.03,
});
```

Configure the light after `this.keyLight.castShadow = true`:

```ts
const shadow = this.keyLight.shadow;
const shadowCamera = shadow.camera;
shadow.mapSize.set(
  SCAVENGE_SHADOW_CONFIG.mapSize,
  SCAVENGE_SHADOW_CONFIG.mapSize,
);
shadowCamera.left = SCAVENGE_SHADOW_CONFIG.left;
shadowCamera.right = SCAVENGE_SHADOW_CONFIG.right;
shadowCamera.top = SCAVENGE_SHADOW_CONFIG.top;
shadowCamera.bottom = SCAVENGE_SHADOW_CONFIG.bottom;
shadowCamera.near = SCAVENGE_SHADOW_CONFIG.near;
shadowCamera.far = SCAVENGE_SHADOW_CONFIG.far;
shadow.bias = SCAVENGE_SHADOW_CONFIG.bias;
shadow.normalBias = SCAVENGE_SHADOW_CONFIG.normalBias;
shadowCamera.updateProjectionMatrix();
```

Keep the existing light count, color, intensity, and position.

- [ ] **Step 5: Run GREEN and ownership verification**

Run:

```powershell
bun run test tests/Environment.test.ts tests/world.test.ts tests/ShipGeometry.test.ts tests/ShipFurniture.test.ts tests/PropModelLibrary.test.ts tests/Lifeboat.test.ts
bun run typecheck
```

Expected: all listed suites and typecheck exit `0`; environment disposal still removes the single directional light.

- [ ] **Step 6: Create the isolated review diff**

Run:

```powershell
New-Item -ItemType Directory -Force .superpowers/sdd/boat-jump-shadows-task-4-before/tests | Out-Null
New-Item -ItemType File -Force .superpowers/sdd/boat-jump-shadows-task-4-before/tests/Environment.test.ts | Out-Null
New-Item -ItemType Directory -Force .superpowers/sdd/boat-jump-shadows-task-4-after/src/world | Out-Null
New-Item -ItemType Directory -Force .superpowers/sdd/boat-jump-shadows-task-4-after/tests | Out-Null
Copy-Item src/world/Environment.ts .superpowers/sdd/boat-jump-shadows-task-4-after/src/world/Environment.ts
Copy-Item tests/Environment.test.ts .superpowers/sdd/boat-jump-shadows-task-4-after/tests/Environment.test.ts
git diff --no-index -- .superpowers/sdd/boat-jump-shadows-task-4-before .superpowers/sdd/boat-jump-shadows-task-4-after | Out-File .superpowers/sdd/boat-jump-shadows-task-4-review.diff -Encoding utf8
```

Expected: the diff contains the shadow configuration, its application, and the new focused test. Leave both files unstaged.

---

### Task 5: Final Verification and Scavenging Browser QA

**Files:**
- Modify only for a new test-first, evidence-backed defect: files from Tasks 1-4
- Record: `.superpowers/sdd/boat-jump-shadows-final-report.md`

**Interfaces:**
- Verifies the complete approved design and preserves the separate layout-simplification contract.

- [ ] **Step 1: Run mandatory automation as separate commands**

Run:

```powershell
bun run models:check
bun run test
bun run typecheck
bun run build
```

Expected: all four commands exit `0`. Record test counts and the item/furniture triangle totals in the report.

- [ ] **Step 2: Inspect repository and task scope**

Run:

```powershell
git status --short
git diff --check
git diff --stat
git diff --cached --name-only
```

Expected: no whitespace errors, no staged files, and no changes to `ShipLayout.ts` from this plan. Compare each task's isolated diff against its brief before review.

- [ ] **Step 3: Inspect the scavenging phase at two viewport sizes**

Start:

```powershell
bun run dev -- --host 127.0.0.1
```

At `1280x720` and `1920x1080`, confirm:

- visible water separates the freighter and lifeboat;
- a normal throw from the rail opening lands in the boat;
- Space lets the player land on the low cargo rack or another collider no more than 0.6 units above deck;
- the player remains stable while standing and falls to deck after stepping off;
- taller furniture still blocks a standing player;
- shadows remain visible in the cabin, wheelhouse, storage, bow, stern, exterior lanes, and on the lifeboat throughout sinking.

If browser policy blocks localhost or pointer lock, record the exact unverified checks. Do not claim visual acceptance.

- [ ] **Step 4: Fix only reproduced defects with another RED/GREEN cycle**

For each defect, add one failing focused test, run it to confirm the intended failure, make the smallest production change, and rerun the focused and mandatory suites. Do not tune the boat anchor, support limit, or shadow constants without updating the design spec and receiving user approval.

- [ ] **Step 5: Request final code review and verify completion**

Invoke `superpowers:requesting-code-review` with the design spec, this plan, and the four isolated task diffs. Address Critical and Important findings through test-first fixes. Then invoke `superpowers:verification-before-completion` and rerun the four mandatory commands before reporting success.

## Plan Self-Review

- [x] The anchor, throw range, low-support landing, step-off gravity, tall-object rejection, shadow configuration, ownership, and full-scene coverage each map to an explicit task and test.
- [x] New names and signatures stay consistent: `MAX_JUMPABLE_SUPPORT_HEIGHT`, `findSupportEyeHeight(...)`, and `SCAVENGE_SHADOW_CONFIG` appear with one definition.
- [x] The plan contains no unresolved placeholders and does not assign work to `ShipLayout.ts`.
- [x] Dirty-worktree safeguards replace unsafe source commits with isolated review diffs.

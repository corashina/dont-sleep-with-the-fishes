# Hanging Lantern Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a weather-driven hanging lantern above the survival player, with moving light and shadows.

**Architecture:** A focused `HangingLantern` component owns the pole, model, light, pendulum state, and resources. `BoatWorld` attaches it to the lifeboat and supplies boat pose, weather, phase, time, and delta.

**Tech Stack:** TypeScript 5.9, Three.js 0.180, Vitest 3.2, Vite 7.1.

**Spec:** `docs/superpowers/specs/2026-08-20-hanging-lantern-design.md`

## Global Constraints

- Keep the current starboard lantern and its End Day action.
- Add one non-interactive hanging lantern.
- Reuse the current lantern model.
- Mount the pole at the center of the stern, behind the player.
- Do not add collisions or a survival Rapier world.
- Clamp the combined swing to exactly 20 degrees.
- Cap processed frame time at 0.1 seconds.
- Use integration steps no larger than 1/120 second.
- Use a 512-by-512 shadow map.
- Do not allocate during frame updates.
- Do not add reduced-motion behavior.
- Preserve unrelated working-tree changes.

## File Map

- Create `src/survival/HangingLantern.ts` for the assembly, pendulum, light, and cleanup.
- Create `tests/HangingLantern.test.ts` for focused component and motion tests.
- Modify `src/survival/BoatWorld.ts` only at creation, update, lighting, and cleanup points.
- Modify `tests/BoatWorld.test.ts` beside the current survival lantern tests.

---

### Task 1: Build the Hanging Lantern Assembly

**Files:**

- Create: `src/survival/HangingLantern.ts`
- Create: `tests/HangingLantern.test.ts`

**Interfaces:**

- Consumes: `Group` from `PropModelLibrary.createPracticalLight('lantern')`.
- Produces: `createHangingLantern(model: Group): HangingLantern`.
- Produces: `HangingLantern.root: Group`, `HangingLantern.light: PointLight`, and `HangingLantern.dispose(): void`.
- Produces: exported mount, tip, line-length, and light-intensity constants.

- [ ] **Step 1: Write the failing assembly tests**

Create `tests/HangingLantern.test.ts` with a normalized lantern fixture.

```ts
// Importance: 8/10. Protects the hanging lantern assembly, light, and cleanup.
import { describe, expect, it, vi } from 'vitest';
import {
  Box3,
  BoxGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  PointLight,
  Vector3,
} from 'three';
import {
  HANGING_LANTERN_DAY_INTENSITY,
  HANGING_LANTERN_LINE_LENGTH,
  HANGING_LANTERN_MOUNT,
  HANGING_LANTERN_TIP,
  createHangingLantern,
} from '../src/survival/HangingLantern';

function lanternModel(): Group {
  const root = new Group();
  const mesh = new Mesh(
    new BoxGeometry(0.22, 0.48, 0.22),
    new MeshStandardMaterial({ color: 0x6c4b2d }),
  );
  mesh.position.y = 0.24;
  root.add(mesh);
  return root;
}

describe('hanging lantern', () => {
  it('mounts at the stern center and hangs below the pole tip', () => {
    const lantern = createHangingLantern(lanternModel());
    const pivot = lantern.root.getObjectByName('hanging-lantern:swing-pivot')!;
    const model = lantern.root.getObjectByName('hanging-lantern:model')!;
    lantern.root.updateMatrixWorld(true);
    const pivotWorld = pivot.getWorldPosition(new Vector3());
    const modelBounds = new Box3().setFromObject(model);

    expect(lantern.root.position.toArray()).toEqual([
      HANGING_LANTERN_MOUNT.x,
      HANGING_LANTERN_MOUNT.y,
      HANGING_LANTERN_MOUNT.z,
    ]);
    expect(HANGING_LANTERN_MOUNT.x).toBe(0);
    expect(pivot.position.toArray()).toEqual([
      HANGING_LANTERN_TIP.x,
      HANGING_LANTERN_TIP.y,
      HANGING_LANTERN_TIP.z,
    ]);
    expect(pivotWorld.y - modelBounds.max.y)
      .toBeCloseTo(HANGING_LANTERN_LINE_LENGTH, 5);
    expect(modelBounds.min.y).toBeGreaterThan(0.9);

    lantern.dispose();
  });

  it('builds a warm emissive model and shadow-casting point light', () => {
    const lantern = createHangingLantern(lanternModel());
    const model = lantern.root.getObjectByName('hanging-lantern:model')!;
    const mesh = model.children[0] as Mesh;
    const material = mesh.material as MeshStandardMaterial;

    expect(lantern.light).toBeInstanceOf(PointLight);
    expect(lantern.light.color.getHex()).toBe(0xffb261);
    expect(lantern.light.intensity).toBe(HANGING_LANTERN_DAY_INTENSITY);
    expect(lantern.light.distance).toBe(3.6);
    expect(lantern.light.castShadow).toBe(true);
    expect(lantern.light.shadow.mapSize.toArray()).toEqual([512, 512]);
    expect(mesh.castShadow).toBe(false);
    expect(mesh.receiveShadow).toBe(true);
    expect(material.emissive.getHex()).toBe(0xffc56a);
    expect(material.emissiveIntensity).toBe(1.35);

    lantern.dispose();
  });

  it('disposes owned render resources once', () => {
    const model = lanternModel();
    const modelMesh = model.children[0] as Mesh;
    const modelGeometryDispose = vi.spyOn(modelMesh.geometry, 'dispose');
    const modelMaterialDispose = vi.spyOn(
      modelMesh.material as MeshStandardMaterial,
      'dispose',
    );
    const lantern = createHangingLantern(model);
    const shadowDispose = vi.spyOn(lantern.light.shadow, 'dispose');

    lantern.dispose();
    lantern.dispose();

    expect(modelGeometryDispose).toHaveBeenCalledOnce();
    expect(modelMaterialDispose).toHaveBeenCalledOnce();
    expect(shadowDispose).toHaveBeenCalledOnce();
    expect(lantern.root.children).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run the tests and confirm the missing module failure**

Run: `bun run test -- tests/HangingLantern.test.ts`

Expected: FAIL because `src/survival/HangingLantern.ts` does not exist.

- [ ] **Step 3: Implement the static component and exact hierarchy**

Create `src/survival/HangingLantern.ts`.

Use these public constants and interface.

```ts
export const HANGING_LANTERN_DAY_INTENSITY = 2.6;
export const HANGING_LANTERN_NIGHT_INTENSITY = 4.4;
export const HANGING_LANTERN_LINE_LENGTH = 0.22;
export const HANGING_LANTERN_MOUNT = Object.freeze({ x: 0, y: 0.28, z: 2.35 });
export const HANGING_LANTERN_TIP = Object.freeze({ x: 0, y: 1.57, z: -1.7 });

export interface HangingLantern {
  readonly root: Group;
  readonly light: PointLight;
  dispose(): void;
}
```

Build this object hierarchy.

```text
hanging-lantern
├── hanging-lantern:mount
├── hanging-lantern:binding-low
├── hanging-lantern:binding-high
├── hanging-lantern:pole
└── hanging-lantern:swing-pivot
    ├── hanging-lantern:line
    ├── hanging-lantern:model
    └── hanging-lantern:light
```

Use one `CatmullRomCurve3` and one low-poly `TubeGeometry` for the pole.

```ts
const poleCurve = new CatmullRomCurve3([
  new Vector3(0, 0.08, 0),
  new Vector3(0.025, 0.72, -0.08),
  new Vector3(-0.03, 1.22, -0.48),
  new Vector3(0.035, 1.49, -1.10),
  new Vector3(HANGING_LANTERN_TIP.x, HANGING_LANTERN_TIP.y, HANGING_LANTERN_TIP.z),
], false, 'centripetal');
const pole = new Mesh(
  new TubeGeometry(poleCurve, 24, 0.045, 7, false),
  new MeshStandardMaterial({
    color: 0x59422f,
    roughness: 0.96,
    metalness: 0,
    flatShading: true,
  }),
);
```

Use an eight-sided tapered cylinder for the mount. Use two torus meshes for its bindings.

```ts
const mount = new Mesh(
  new CylinderGeometry(0.13, 0.16, 0.42, 8),
  woodMaterial,
);
mount.position.y = 0.18;

const bindingGeometry = new TorusGeometry(0.105, 0.016, 6, 8);
const lowBinding = new Mesh(bindingGeometry, bindingMaterial);
lowBinding.position.y = 0.10;
lowBinding.rotation.x = Math.PI / 2;
const highBinding = new Mesh(bindingGeometry.clone(), bindingMaterial);
highBinding.position.y = 0.29;
highBinding.rotation.x = Math.PI / 2;
```

Place the root and pivot with the exported constants. Hang the line and model below the pivot.

```ts
root.position.set(
  HANGING_LANTERN_MOUNT.x,
  HANGING_LANTERN_MOUNT.y,
  HANGING_LANTERN_MOUNT.z,
);
pivot.position.set(
  HANGING_LANTERN_TIP.x,
  HANGING_LANTERN_TIP.y,
  HANGING_LANTERN_TIP.z,
);
line.position.y = -HANGING_LANTERN_LINE_LENGTH / 2;
model.position.y = -HANGING_LANTERN_LINE_LENGTH - 0.48;
```

Configure the model like `SurvivalLantern`. Set model meshes to receive shadows, not cast them.
Set emissive color `0xffc56a`, intensity `1.35`, and `emissiveMap = map`.

Create the light with exact values.

```ts
const light = new PointLight(
  0xffb261,
  HANGING_LANTERN_DAY_INTENSITY,
  3.6,
  2,
);
light.name = 'hanging-lantern:light';
light.position.y = -HANGING_LANTERN_LINE_LENGTH - 0.24;
light.castShadow = true;
light.shadow.mapSize.set(512, 512);
light.shadow.camera.near = 0.08;
light.shadow.camera.far = 3.6;
light.shadow.bias = -0.001;
light.shadow.normalBias = 0.025;
light.shadow.camera.updateProjectionMatrix();
```

Set `castShadow` and `receiveShadow` on the pole, mount, bindings, and line.
Collect every mesh resource with `collectMeshResources()` after assembly.

Implement idempotent cleanup with the existing resource helpers.

```ts
let disposed = false;
return {
  root,
  light,
  dispose: () => {
    if (disposed) return;
    disposed = true;
    runCleanupSteps([
      () => light.shadow.dispose(),
      () => disposeResourceSets(geometries, materials),
      () => root.clear(),
    ]);
  },
};
```

- [ ] **Step 4: Run the focused tests**

Run: `bun run test -- tests/HangingLantern.test.ts`

Expected: PASS with three tests.

- [ ] **Step 5: Commit the assembly**

```bash
git add src/survival/HangingLantern.ts tests/HangingLantern.test.ts
git commit -m "feat: build hanging lantern assembly"
```

---

### Task 2: Add the Weather-Driven Pendulum

**Files:**

- Modify: `src/survival/HangingLantern.ts`
- Modify: `tests/HangingLantern.test.ts`

**Interfaces:**

- Consumes: `BoatPose` from `src/ocean/BoatBuoyancy.ts`.
- Consumes: `PresentationWeatherProfile` from `src/weather/presentationWeather.ts`.
- Produces: `HangingLantern.update(pose, weather, time, delta): void`.
- Produces: `HANGING_LANTERN_MAX_SWING = Math.PI / 9`.

- [ ] **Step 1: Add failing motion tests**

Extend `tests/HangingLantern.test.ts` with these imports and helpers.

```ts
import type { BoatPose } from '../src/ocean/BoatBuoyancy';
import { presentationWeatherProfile } from '../src/weather/presentationWeather';
import {
  HANGING_LANTERN_MAX_SWING,
} from '../src/survival/HangingLantern';

const ZERO_POSE: BoatPose = {
  y: 0,
  pitch: 0,
  roll: 0,
  driftX: 0,
  driftZ: 0,
};

function swingMagnitude(lantern: ReturnType<typeof createHangingLantern>): number {
  const pivot = lantern.root.getObjectByName('hanging-lantern:swing-pivot')!;
  return Math.hypot(pivot.rotation.x, pivot.rotation.z);
}

function simulateWeather(id: 'calm' | 'wind' | 'waves' | 'thunderstorm'): number {
  const lantern = createHangingLantern(lanternModel());
  const weather = presentationWeatherProfile(id);
  let peak = 0;
  for (let frame = 0; frame < 360; frame += 1) {
    lantern.update(ZERO_POSE, weather, frame / 60, 1 / 60);
    if (frame >= 120) peak = Math.max(peak, swingMagnitude(lantern));
  }
  lantern.dispose();
  return peak;
}
```

Add these tests.

```ts
it('uses weather strength to increase the continuous swing', () => {
  const calm = simulateWeather('calm');
  expect(calm).toBeGreaterThan(0.005);
  expect(simulateWeather('wind')).toBeGreaterThan(calm * 1.25);
  expect(simulateWeather('waves')).toBeGreaterThan(calm * 1.25);
  expect(simulateWeather('thunderstorm')).toBeGreaterThan(calm * 1.25);
});

it('reacts to boat pitch, roll, and drift changes', () => {
  const passive = createHangingLantern(lanternModel());
  const driven = createHangingLantern(lanternModel());
  const calm = presentationWeatherProfile('calm');
  passive.update(ZERO_POSE, calm, 0, 1 / 60);
  driven.update(ZERO_POSE, calm, 0, 1 / 60);
  passive.update(ZERO_POSE, calm, 1 / 60, 1 / 60);
  driven.update({
    y: 0.08,
    pitch: 0.16,
    roll: -0.13,
    driftX: 0.18,
    driftZ: -0.16,
  }, calm, 1 / 60, 1 / 60);

  expect(swingMagnitude(driven)).toBeGreaterThan(swingMagnitude(passive));
  passive.dispose();
  driven.dispose();
});

it('caps large frame steps and the combined swing angle', () => {
  const lantern = createHangingLantern(lanternModel());
  const storm = presentationWeatherProfile('thunderstorm');
  for (let frame = 0; frame < 80; frame += 1) {
    const sign = frame % 2 === 0 ? 1 : -1;
    lantern.update({
      y: sign,
      pitch: sign * 2,
      roll: -sign * 2,
      driftX: sign * 4,
      driftZ: -sign * 4,
    }, storm, frame, 1);
  }

  const magnitude = swingMagnitude(lantern);
  expect(Number.isFinite(magnitude)).toBe(true);
  expect(magnitude).toBeLessThanOrEqual(HANGING_LANTERN_MAX_SWING + 1e-8);
  lantern.dispose();
});

it('does not move after disposal', () => {
  const lantern = createHangingLantern(lanternModel());
  const pivot = lantern.root.getObjectByName('hanging-lantern:swing-pivot')!;
  lantern.dispose();
  const before = pivot.rotation.toArray();
  lantern.update(ZERO_POSE, presentationWeatherProfile('waves'), 3, 0.1);
  expect(pivot.rotation.toArray()).toEqual(before);
});
```

- [ ] **Step 2: Run the tests and confirm interface failures**

Run: `bun run test -- tests/HangingLantern.test.ts`

Expected: FAIL because `update` and `HANGING_LANTERN_MAX_SWING` do not exist.

- [ ] **Step 3: Implement the allocation-free pendulum**

Extend the interface with this exact signature.

```ts
export const HANGING_LANTERN_MAX_SWING = Math.PI / 9;

export interface HangingLantern {
  readonly root: Group;
  readonly light: PointLight;
  update(
    pose: Readonly<BoatPose>,
    weather: Readonly<PresentationWeatherProfile>,
    time: number,
    delta: number,
  ): void;
  dispose(): void;
}
```

Store all motion state as numbers inside `createHangingLantern()`.

```ts
const MAX_PROCESSED_DELTA = 0.1;
const MAX_STEP = 1 / 120;
const GRAVITY_OVER_LENGTH = 9.81 / 0.68;
const DAMPING = 1.75;
const MAX_BOAT_DRIVE = 4.5;

let angleX = 0;
let angleZ = 0;
let velocityX = 0;
let velocityZ = 0;
let previousPitch = 0;
let previousRoll = 0;
let previousDriftX = 0;
let previousDriftZ = 0;
let hasPreviousPose = false;
```

Use this deterministic force model. Do not create vectors, arrays, or objects here.

```ts
const processedDelta = Math.min(MAX_PROCESSED_DELTA, Math.max(0, delta));
if (processedDelta === 0) return;

let driveX = 0;
let driveZ = 0;
if (hasPreviousPose) {
  driveX = MathUtils.clamp(
    -(pose.pitch - previousPitch) * 1.2 / processedDelta
      -(pose.driftZ - previousDriftZ) * 0.7 / processedDelta,
    -MAX_BOAT_DRIVE,
    MAX_BOAT_DRIVE,
  );
  driveZ = MathUtils.clamp(
    (pose.roll - previousRoll) * 1.2 / processedDelta
      +(pose.driftX - previousDriftX) * 0.7 / processedDelta,
    -MAX_BOAT_DRIVE,
    MAX_BOAT_DRIVE,
  );
}
previousPitch = pose.pitch;
previousRoll = pose.roll;
previousDriftX = pose.driftX;
previousDriftZ = pose.driftZ;
hasPreviousPose = true;

const weatherForce = 0.32
  + weather.waveScale * 0.38
  + weather.sprayIntensity * 0.52;
driveX += (
  Math.sin(time * 0.83)
  + Math.sin(time * 1.93 + 0.6) * 0.45
) * weatherForce;
driveZ += (
  Math.sin(time * 0.71 + 1.8)
  + Math.sin(time * 2.17 + 0.2) * 0.35
) * weatherForce;
```

Integrate with bounded substeps. Remove outward velocity when the angle reaches its limit.

```ts
const stepCount = Math.ceil(processedDelta / MAX_STEP);
const step = processedDelta / stepCount;
for (let index = 0; index < stepCount; index += 1) {
  const accelerationX = -GRAVITY_OVER_LENGTH * Math.sin(angleX)
    - DAMPING * velocityX
    + driveX;
  const accelerationZ = -GRAVITY_OVER_LENGTH * Math.sin(angleZ)
    - DAMPING * velocityZ
    + driveZ;
  velocityX += accelerationX * step;
  velocityZ += accelerationZ * step;
  angleX += velocityX * step;
  angleZ += velocityZ * step;

  const magnitude = Math.hypot(angleX, angleZ);
  if (magnitude <= HANGING_LANTERN_MAX_SWING) continue;
  const scale = HANGING_LANTERN_MAX_SWING / magnitude;
  angleX *= scale;
  angleZ *= scale;
  const outwardVelocity = (
    angleX * velocityX + angleZ * velocityZ
  ) / (HANGING_LANTERN_MAX_SWING ** 2);
  if (outwardVelocity > 0) {
    velocityX -= outwardVelocity * angleX;
    velocityZ -= outwardVelocity * angleZ;
  }
}
swingPivot.rotation.set(angleX, 0, angleZ);
```

Return immediately when disposed. Keep the current pose when disposal starts.

- [ ] **Step 4: Run focused tests and typecheck**

Run: `bun run test -- tests/HangingLantern.test.ts`

Expected: PASS with seven tests.

Run: `bun run typecheck`

Expected: exit code 0.

- [ ] **Step 5: Commit the pendulum**

```bash
git add src/survival/HangingLantern.ts tests/HangingLantern.test.ts
git commit -m "feat: animate hanging lantern pendulum"
```

---

### Task 3: Integrate the Lantern into BoatWorld

**Files:**

- Modify: `src/survival/BoatWorld.ts:1-165`
- Modify: `src/survival/BoatWorld.ts:580-595`
- Modify: `src/survival/BoatWorld.ts:870-1110`
- Modify: `src/survival/BoatWorld.ts:2370-2505`
- Modify: `src/survival/BoatWorld.ts:2505-2568`
- Modify: `src/survival/BoatWorld.ts:3062-3075`
- Modify: `tests/BoatWorld.test.ts:1-140`
- Modify: `tests/BoatWorld.test.ts:6480-6535`

**Interfaces:**

- Consumes: `createHangingLantern(model)` and the `HangingLantern` interface.
- Consumes: day and night intensity constants from `HangingLantern.ts`.
- Calls: `hangingLantern.update(boatPose, weatherProfile, time, delta)` once per scene update.
- Preserves: the current `end-day-lantern` interaction anchor.

- [ ] **Step 1: Add failing BoatWorld integration tests**

Import the hanging light constants into `tests/BoatWorld.test.ts`.

```ts
import {
  HANGING_LANTERN_DAY_INTENSITY,
  HANGING_LANTERN_NIGHT_INTENSITY,
} from '../src/survival/HangingLantern';
```

Add these tests beside the current survival lantern test.

```ts
it('adds the hanging lantern near the upper camera center without another action', () => {
  const propModels = createTestPropModels();
  const camera = new PerspectiveCamera(75, 16 / 9, 0.08, 1000);
  const world = new BoatWorld(camera, propModels, createTestMoonTexture());
  world.update(1, 0.1);
  const root = world.scene.getObjectByName('hanging-lantern')!;
  const light = root.getObjectByName('hanging-lantern:light') as PointLight;
  const projected = light.getWorldPosition(new Vector3()).project(camera);
  const lanternAnchors = world.projectInteractionAnchors(800, 600)
    .filter((anchor) => anchor.toolId === 'lantern');

  expect(root).toBeDefined();
  expect(projected.x).toBeGreaterThanOrEqual(-0.12);
  expect(projected.x).toBeLessThanOrEqual(0.12);
  expect(projected.y).toBeGreaterThanOrEqual(0.55);
  expect(projected.y).toBeLessThanOrEqual(0.9);
  expect(light.intensity).toBe(HANGING_LANTERN_DAY_INTENSITY);
  expect(lanternAnchors.map(({ id }) => id)).toEqual(['end-day-lantern']);

  world.dispose();
  propModels.dispose();
});

it('raises hanging lantern intensity at night', () => {
  const propModels = createTestPropModels();
  const world = new BoatWorld(
    new PerspectiveCamera(75, 16 / 9, 0.08, 1000),
    propModels,
    createTestMoonTexture(),
  );
  const light = world.scene.getObjectByName('hanging-lantern:light') as PointLight;
  world.setPhase('night');
  world.update(1, 0.1);
  expect(light.intensity).toBe(HANGING_LANTERN_NIGHT_INTENSITY);

  world.dispose();
  propModels.dispose();
});

it('disposes the hanging lantern during normal world cleanup', () => {
  const propModels = createTestPropModels();
  const world = new BoatWorld(
    new PerspectiveCamera(),
    propModels,
    createTestMoonTexture(),
  );
  const light = world.scene.getObjectByName('hanging-lantern:light') as PointLight;
  const shadowDispose = vi.spyOn(light.shadow, 'dispose');
  world.dispose();
  world.dispose();
  expect(shadowDispose).toHaveBeenCalledOnce();
  propModels.dispose();
});
```

Extend the existing supply-construction rollback test. Spy on
`propModels.createPracticalLight`. Capture the second returned model's geometry and material.

```ts
const originalCreatePracticalLight = propModels.createPracticalLight.bind(propModels);
let practicalLightCall = 0;
let hangingGeometryDispose: ReturnType<typeof vi.spyOn> | null = null;
let hangingMaterialDispose: ReturnType<typeof vi.spyOn> | null = null;
const createPracticalLight = vi.spyOn(propModels, 'createPracticalLight')
  .mockImplementation((id) => {
    const root = originalCreatePracticalLight(id);
    practicalLightCall += 1;
    if (practicalLightCall === 2) {
      const mesh = firstMesh(root);
      hangingGeometryDispose = vi.spyOn(mesh.geometry, 'dispose');
      const material = Array.isArray(mesh.material) ? mesh.material[0]! : mesh.material;
      hangingMaterialDispose = vi.spyOn(material, 'dispose');
    }
    return root;
  });
```

After construction throws, assert both spies ran once. Restore `createPracticalLight` with the other spies.

```ts
expect(hangingGeometryDispose).not.toBeNull();
expect(hangingGeometryDispose!).toHaveBeenCalledOnce();
expect(hangingMaterialDispose!).toHaveBeenCalledOnce();
createPracticalLight.mockRestore();
```

- [ ] **Step 2: Run the BoatWorld tests and confirm scene failures**

Run: `bun run test -- tests/HangingLantern.test.ts tests/BoatWorld.test.ts`

Expected: `HangingLantern` tests pass. New `BoatWorld` tests fail because the component is absent.

- [ ] **Step 3: Create and attach the component in BoatWorld**

Import the factory, type, and light constants.

```ts
import {
  createHangingLantern,
  HANGING_LANTERN_DAY_INTENSITY,
  HANGING_LANTERN_NIGHT_INTENSITY,
  type HangingLantern,
} from './HangingLantern';
```

Add the owned field beside `lantern`.

```ts
private readonly lantern: SurvivalLantern;
private readonly hangingLantern: HangingLantern;
```

Add a nullable local before the guarded constructor block.

```ts
let lantern: SurvivalLantern | null = null;
let hangingLantern: HangingLantern | null = null;
```

Create the fixed lantern first. Then create the hanging lantern with a second model clone.

```ts
lantern = createSurvivalLantern(propModels.createPracticalLight('lantern'));
this.lantern = lantern;
this.boat.add(lantern.root);

hangingLantern = createHangingLantern(
  propModels.createPracticalLight('lantern'),
);
this.hangingLantern = hangingLantern;
this.boat.add(hangingLantern.root);
```

Do not create a bounds cache or interaction anchor for `hangingLantern`.

- [ ] **Step 4: Connect motion, lighting, and cleanup**

Update the component after the smoothed boat pose and base presentation are ready.

```ts
smoothBoatPoseInto(this.boatPose, this.boatPose, this.boatTargetPose, delta, 7);
if (advancePresentation) this.advanceRearCameraTurn(delta);
this.applyBasePresentation();
this.hangingLantern.update(
  this.boatPose,
  this.weatherProfile,
  time,
  delta,
);
```

Set its intensity beside the current lantern in `applyBaseLighting()`.

```ts
const night = this.skyState.phase === 'night';
this.lantern.light.intensity = night
  ? SURVIVAL_LANTERN_NIGHT_INTENSITY
  : SURVIVAL_LANTERN_DAY_INTENSITY;
this.hangingLantern.light.intensity = night
  ? HANGING_LANTERN_NIGHT_INTENSITY
  : HANGING_LANTERN_DAY_INTENSITY;
```

Add `hangingLantern?.dispose()` to constructor rollback before `lantern?.dispose()`.
Add `this.hangingLantern.dispose()` before `this.lantern.dispose()` in normal cleanup.

- [ ] **Step 5: Run focused tests and typecheck**

Run: `bun run test -- tests/HangingLantern.test.ts tests/BoatWorld.test.ts`

Expected: PASS.

Run: `bun run typecheck`

Expected: exit code 0.

- [ ] **Step 6: Commit BoatWorld integration**

```bash
git add src/survival/BoatWorld.ts tests/BoatWorld.test.ts
git commit -m "feat: integrate hanging lantern into boat world"
```

---

### Task 4: Verify Rendering and the Full Project

**Files:**

- Verify: `src/survival/HangingLantern.ts`
- Verify: `src/survival/BoatWorld.ts`
- Verify: `tests/HangingLantern.test.ts`
- Verify: `tests/BoatWorld.test.ts`

**Interfaces:**

- Consumes: the completed hanging lantern feature.
- Produces: verified camera placement, weather motion, lighting, shadows, and project health.

- [ ] **Step 1: Run the focused test set**

Run: `bun run test -- tests/HangingLantern.test.ts tests/BoatWorld.test.ts`

Expected: all focused tests pass.

- [ ] **Step 2: Run static and production checks**

Run: `bun run typecheck`

Expected: exit code 0.

Run: `bun run build`

Expected: TypeScript and Vite complete with exit code 0.

- [ ] **Step 3: Run the full test suite**

Run: `bun run test`

Expected: all tests pass with exit code 0.

- [ ] **Step 4: Inspect calm weather in the running game**

Run: `bun run dev`

Open the Vite URL. Press backquote to open System Tuning.
Use Event Test to enter a fresh lifeboat run.

Confirm these results:

- The pole starts at the center of the stern.
- The pole bends over the player's head.
- The lantern is partly visible at the upper screen center.
- The center interaction view stays open.
- The lantern clears the pole and boat.
- Calm weather gives a small continuous swing.
- The moving light changes shadows inside the boat.
- The starboard lantern remains the only End Day target.

- [ ] **Step 5: Inspect strong weather and night**

Use System Tuning to select Wind, Waves, and Thunderstorm.
Confirm each selection increases movement without exceeding the safe arc.

Restore Calm. Use the starboard lantern to advance into night.
Confirm the hanging light becomes stronger and does not wash out boat materials.

Stop the Vite process after inspection.

- [ ] **Step 6: Commit only required visual tuning**

If inspection changes constants, update the matching assertions first.
Repeat Steps 1 through 5 after each change.

```bash
git add src/survival/HangingLantern.ts tests/HangingLantern.test.ts tests/BoatWorld.test.ts
git commit -m "fix: tune hanging lantern presentation"
```

Skip this commit when inspection requires no change.

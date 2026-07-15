# Survival Boat Drift Motion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the survival lifeboat feel afloat through wave-footprint hull motion, restrained rider compensation, bow spray, and fishing-line lag.

**Architecture:** A pure `BoatDriftMotion` solver samples the existing wave field at four hull points and returns boat and rider poses. `BoatWorld` applies those poses to its existing `motionRig` and `cameraRig`, then layers action cues and a fixed-capacity `BoatSpray` pool. Recovered supplies stay under the lifeboat root and require no physics.

**Tech Stack:** TypeScript, Three.js 0.180, Vite 7, Vitest 3, Bun

## Global Constraints

- Target desktop browsers with keyboard and mouse.
- Preserve survival rules, actions, events, item transforms, and pointer parallax.
- Keep rider-relative pitch and roll at or below 1 degree.
- Keep rider vertical lag at or below 0.03 world units.
- Keep yaw drift at or below 0.5 degrees.
- Keep the existing weather amplitude scales: calm `0.78`, overcast `1`, squall `1.35`.
- Reduced-motion mode keeps ocean animation and returns neutral boat, rider, spray, and line motion.
- Add no runtime dependency, downloaded asset, audio system, steering, rowing, or loose-item physics.
- Preserve the in-progress shared-lifeboat migration in `src/world/Lifeboat.ts`, `src/world/BoatStorage.ts`, `src/survival/BoatWorld.ts`, and their tests.
- Do not stage or commit a file that contains pre-existing user edits. Tasks 1 and 2 create isolated files and may commit them. Task 3 stays unstaged unless the user commits the overlapping work first.

---

## File Structure

- `src/survival/BoatDriftMotion.ts`: four-point sampling, weather scale, damped boat pose, rider compensation, angular velocity, and bow-impact output.
- `tests/BoatDriftMotion.test.ts`: deterministic solver, limits, weather, damping, and reduced-motion tests.
- `src/survival/BoatSpray.ts`: fixed-capacity world-space spray particle pool.
- `tests/BoatSpray.test.ts`: allocation, reuse, reset, update, and disposal tests.
- `src/survival/BoatWorld.ts`: scene integration, transform order, fishing-line lag, spray trigger, and cleanup.
- `tests/BoatWorld.test.ts`: hierarchy, item stability, interaction, cue composition, water exclusion, and resource integration.

### Task 1: Build the deterministic drift solver

**Files:**
- Create: `src/survival/BoatDriftMotion.ts`
- Create: `tests/BoatDriftMotion.test.ts`

**Interfaces:**
- Produces: `weatherAmplitudeScale(weather: WeatherId): number`
- Produces: `sampleBoatWaveHeights(time: number, amplitudeScale: number): BoatWaveHeights`
- Produces: `BoatDriftMotion.update(samples, time, delta, reducedMotion): BoatDriftFrame`
- Produces: `BOAT_DRIFT_CONFIG` and `NEUTRAL_BOAT_DRIFT_FRAME`

- [ ] **Step 1: Write the solver tests**

Create `tests/BoatDriftMotion.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  BOAT_DRIFT_CONFIG,
  BoatDriftMotion,
  sampleBoatWaveHeights,
  weatherAmplitudeScale,
  type BoatWaveHeights,
} from '../src/survival/BoatDriftMotion';

const level = (height = 0): BoatWaveHeights => ({
  bow: height,
  stern: height,
  port: height,
  starboard: height,
});

describe('BoatDriftMotion', () => {
  it('keeps the ocean weather amplitude contract', () => {
    expect(weatherAmplitudeScale('calm')).toBe(0.78);
    expect(weatherAmplitudeScale('overcast')).toBe(1);
    expect(weatherAmplitudeScale('squall')).toBe(1.35);
  });

  it('samples the same four wave heights for the same time and scale', () => {
    expect(sampleBoatWaveHeights(3.25, 0.78))
      .toEqual(sampleBoatWaveHeights(3.25, 0.78));
  });

  it('derives positive bow pitch and starboard roll from height differences', () => {
    const motion = new BoatDriftMotion();
    const frame = motion.update({
      bow: 0.8,
      stern: -0.8,
      port: -0.5,
      starboard: 0.5,
    }, 2, 1 / 60, false);

    expect(frame.boat.pitch).toBeGreaterThan(0);
    expect(frame.boat.roll).toBeGreaterThan(0);
    expect(frame.rider.pitch).toBeLessThan(0);
    expect(frame.rider.roll).toBeLessThan(0);
  });

  it('damps a pose change and caps boat and rider channels', () => {
    const motion = new BoatDriftMotion();
    motion.update(level(), 0, 1 / 60, false);
    const frame = motion.update({
      bow: 100,
      stern: -100,
      port: -100,
      starboard: 100,
    }, 0.1, 0.1, false);

    expect(Math.abs(frame.boat.pitch)).toBeLessThanOrEqual(BOAT_DRIFT_CONFIG.pitchLimit);
    expect(Math.abs(frame.boat.roll)).toBeLessThanOrEqual(BOAT_DRIFT_CONFIG.rollLimit);
    expect(Math.abs(frame.boat.yaw)).toBeLessThanOrEqual(BOAT_DRIFT_CONFIG.yawLimit);
    expect(Math.abs(frame.rider.pitch)).toBeLessThanOrEqual(BOAT_DRIFT_CONFIG.riderRotationLimit);
    expect(Math.abs(frame.rider.roll)).toBeLessThanOrEqual(BOAT_DRIFT_CONFIG.riderRotationLimit);
    expect(Math.abs(frame.rider.y)).toBeLessThanOrEqual(BOAT_DRIFT_CONFIG.riderHeaveLimit);
  });

  it('returns a neutral frame under reduced motion and eases back after it clears', () => {
    const motion = new BoatDriftMotion();
    const steep = { bow: 1, stern: -1, port: -1, starboard: 1 };
    motion.update(steep, 1, 1 / 60, false);
    const reduced = motion.update(steep, 1.1, 0.1, true);
    const resumed = motion.update(steep, 1.2, 0.1, false);

    expect(reduced.boat).toEqual({ heave: 0, pitch: 0, roll: 0, yaw: 0 });
    expect(reduced.rider).toEqual({ y: 0, pitch: 0, roll: 0, yaw: 0 });
    expect(reduced.bowImpact).toBe(0);
    expect(resumed.boat.pitch).toBeGreaterThan(0);
    expect(resumed.boat.pitch).toBeLessThan(BOAT_DRIFT_CONFIG.pitchLimit);
  });

  it('clamps long frame gaps and reports bounded bow impact', () => {
    const motion = new BoatDriftMotion();
    motion.update(level(), 0, 1 / 60, false);
    const frame = motion.update({ ...level(), bow: 2 }, 5, 5, false);

    expect(frame.bowImpact).toBeGreaterThanOrEqual(0);
    expect(frame.bowImpact).toBeLessThanOrEqual(1);
    expect(Number.isFinite(frame.angularVelocity.pitch)).toBe(true);
    expect(Number.isFinite(frame.angularVelocity.roll)).toBe(true);
  });
});
```

- [ ] **Step 2: Run the test and confirm RED**

Run:

```powershell
bun run test -- tests/BoatDriftMotion.test.ts
```

Expected: FAIL because `src/survival/BoatDriftMotion.ts` does not exist.

- [ ] **Step 3: Implement the solver**

Create `src/survival/BoatDriftMotion.ts` with these public types and constants:

```ts
import { DEFAULT_WAVES, sampleWaveField } from '../ocean/WaveField';
import type { WeatherId } from './survivalTypes';

const radians = (degrees: number): number => degrees * Math.PI / 180;
const clamp = (value: number, minimum: number, maximum: number): number =>
  Math.min(maximum, Math.max(minimum, value));

export interface BoatWaveHeights {
  readonly bow: number;
  readonly stern: number;
  readonly port: number;
  readonly starboard: number;
}

export interface BoatPose {
  readonly heave: number;
  readonly pitch: number;
  readonly roll: number;
  readonly yaw: number;
}

export interface RiderPose {
  readonly y: number;
  readonly pitch: number;
  readonly roll: number;
  readonly yaw: number;
}

export interface BoatDriftFrame {
  readonly boat: BoatPose;
  readonly rider: RiderPose;
  readonly angularVelocity: { readonly pitch: number; readonly roll: number };
  readonly bowImpact: number;
}

export const BOAT_DRIFT_CONFIG = {
  sample: {
    bow: { x: 0, z: -2.4 },
    stern: { x: 0, z: 2.4 },
    port: { x: -1.25, z: 0 },
    starboard: { x: 1.25, z: 0 },
  },
  heaveScale: 0.58,
  pitchLimit: radians(6.3),
  rollLimit: radians(7.4),
  yawLimit: radians(0.5),
  boatResponse: 3.2,
  riderResponse: 1.8,
  riderCompensation: 0.12,
  riderRotationLimit: radians(1),
  riderHeaveFraction: 0.08,
  riderHeaveLimit: 0.03,
  maxDelta: 0.1,
} as const;

export const NEUTRAL_BOAT_DRIFT_FRAME: BoatDriftFrame = {
  boat: { heave: 0, pitch: 0, roll: 0, yaw: 0 },
  rider: { y: 0, pitch: 0, roll: 0, yaw: 0 },
  angularVelocity: { pitch: 0, roll: 0 },
  bowImpact: 0,
};

export function weatherAmplitudeScale(weather: WeatherId): number {
  if (weather === 'squall') return 1.35;
  if (weather === 'overcast') return 1;
  return 0.78;
}

function waveHeight(time: number, x: number, z: number, scale: number): number {
  return sampleWaveField(DEFAULT_WAVES, time, x, z, scale).height;
}

export function sampleBoatWaveHeights(time: number, amplitudeScale: number): BoatWaveHeights {
  const { sample } = BOAT_DRIFT_CONFIG;
  return {
    bow: waveHeight(time, sample.bow.x, sample.bow.z, amplitudeScale),
    stern: waveHeight(time, sample.stern.x, sample.stern.z, amplitudeScale),
    port: waveHeight(time, sample.port.x, sample.port.z, amplitudeScale),
    starboard: waveHeight(time, sample.starboard.x, sample.starboard.z, amplitudeScale),
  };
}

interface SpringChannel { value: number; velocity: number }

function setChannel(channel: SpringChannel, value: number): void {
  channel.value = value;
  channel.velocity = 0;
}

function stepCritical(
  channel: SpringChannel,
  target: number,
  response: number,
  delta: number,
): void {
  const previous = channel.value;
  const omegaDelta = response * delta;
  const denominator = 1 + 2 * omegaDelta + omegaDelta * omegaDelta;
  const nextVelocity = (
    channel.velocity + response * response * delta * (target - previous)
  ) / denominator;
  channel.value = previous + delta * nextVelocity;
  channel.velocity = nextVelocity;
}

export class BoatDriftMotion {
  private readonly boat = {
    heave: { value: 0, velocity: 0 },
    pitch: { value: 0, velocity: 0 },
    roll: { value: 0, velocity: 0 },
    yaw: { value: 0, velocity: 0 },
  };
  private readonly rider = {
    y: { value: 0, velocity: 0 },
    pitch: { value: 0, velocity: 0 },
    roll: { value: 0, velocity: 0 },
    yaw: { value: 0, velocity: 0 },
  };
  private initialized = false;
  private lastBowHeight = 0;

  update(
    samples: BoatWaveHeights,
    time: number,
    delta: number,
    reducedMotion: boolean,
  ): BoatDriftFrame {
    const dt = clamp(delta, 0, BOAT_DRIFT_CONFIG.maxDelta);
    if (reducedMotion) {
      this.setNeutral(samples.bow);
      return NEUTRAL_BOAT_DRIFT_FRAME;
    }

    const targetBoat = this.targetBoat(samples, time);
    const targetRider = this.targetRider(targetBoat);
    if (!this.initialized) {
      this.assignTargets(targetBoat, targetRider);
      this.initialized = true;
      this.lastBowHeight = samples.bow;
      return this.frame(0);
    }

    if (dt > 0) {
      stepCritical(this.boat.heave, targetBoat.heave, BOAT_DRIFT_CONFIG.boatResponse, dt);
      stepCritical(this.boat.pitch, targetBoat.pitch, BOAT_DRIFT_CONFIG.boatResponse, dt);
      stepCritical(this.boat.roll, targetBoat.roll, BOAT_DRIFT_CONFIG.boatResponse, dt);
      stepCritical(this.boat.yaw, targetBoat.yaw, BOAT_DRIFT_CONFIG.boatResponse, dt);
      stepCritical(this.rider.y, targetRider.y, BOAT_DRIFT_CONFIG.riderResponse, dt);
      stepCritical(this.rider.pitch, targetRider.pitch, BOAT_DRIFT_CONFIG.riderResponse, dt);
      stepCritical(this.rider.roll, targetRider.roll, BOAT_DRIFT_CONFIG.riderResponse, dt);
      stepCritical(this.rider.yaw, targetRider.yaw, BOAT_DRIFT_CONFIG.riderResponse, dt);
    }

    const bowSpeed = dt > 0 ? (samples.bow - this.lastBowHeight) / dt : 0;
    this.lastBowHeight = samples.bow;
    const bowImpact = clamp((bowSpeed - this.boat.heave.velocity - 0.2) / 0.8, 0, 1);
    return this.frame(bowImpact);
  }

  private targetBoat(samples: BoatWaveHeights, time: number): BoatPose {
    const meanHeight = (samples.bow + samples.stern + samples.port + samples.starboard) / 4;
    return {
      heave: meanHeight * BOAT_DRIFT_CONFIG.heaveScale,
      pitch: clamp(
        Math.atan2(samples.bow - samples.stern, 4.8),
        -BOAT_DRIFT_CONFIG.pitchLimit,
        BOAT_DRIFT_CONFIG.pitchLimit,
      ),
      roll: clamp(
        Math.atan2(samples.starboard - samples.port, 2.5),
        -BOAT_DRIFT_CONFIG.rollLimit,
        BOAT_DRIFT_CONFIG.rollLimit,
      ),
      yaw: clamp(
        Math.sin(time * 0.17) * radians(0.32) + Math.sin(time * 0.071 + 1.4) * radians(0.18),
        -BOAT_DRIFT_CONFIG.yawLimit,
        BOAT_DRIFT_CONFIG.yawLimit,
      ),
    };
  }

  private targetRider(boat: BoatPose): RiderPose {
    const rotationLimit = BOAT_DRIFT_CONFIG.riderRotationLimit;
    return {
      y: clamp(
        -boat.heave * BOAT_DRIFT_CONFIG.riderHeaveFraction,
        -BOAT_DRIFT_CONFIG.riderHeaveLimit,
        BOAT_DRIFT_CONFIG.riderHeaveLimit,
      ),
      pitch: clamp(-boat.pitch * BOAT_DRIFT_CONFIG.riderCompensation, -rotationLimit, rotationLimit),
      roll: clamp(-boat.roll * BOAT_DRIFT_CONFIG.riderCompensation, -rotationLimit, rotationLimit),
      yaw: clamp(-boat.yaw * BOAT_DRIFT_CONFIG.riderCompensation, -rotationLimit, rotationLimit),
    };
  }

  private assignTargets(boat: BoatPose, rider: RiderPose): void {
    setChannel(this.boat.heave, boat.heave);
    setChannel(this.boat.pitch, boat.pitch);
    setChannel(this.boat.roll, boat.roll);
    setChannel(this.boat.yaw, boat.yaw);
    setChannel(this.rider.y, rider.y);
    setChannel(this.rider.pitch, rider.pitch);
    setChannel(this.rider.roll, rider.roll);
    setChannel(this.rider.yaw, rider.yaw);
  }

  private setNeutral(bowHeight: number): void {
    this.assignTargets(NEUTRAL_BOAT_DRIFT_FRAME.boat, NEUTRAL_BOAT_DRIFT_FRAME.rider);
    this.initialized = true;
    this.lastBowHeight = bowHeight;
  }

  private frame(bowImpact: number): BoatDriftFrame {
    return {
      boat: {
        heave: this.boat.heave.value,
        pitch: this.boat.pitch.value,
        roll: this.boat.roll.value,
        yaw: this.boat.yaw.value,
      },
      rider: {
        y: this.rider.y.value,
        pitch: this.rider.pitch.value,
        roll: this.rider.roll.value,
        yaw: this.rider.yaw.value,
      },
      angularVelocity: {
        pitch: this.boat.pitch.velocity,
        roll: this.boat.roll.velocity,
      },
      bowImpact,
    };
  }
}
```

- [ ] **Step 4: Run the solver tests and confirm GREEN**

Run:

```powershell
bun run test -- tests/BoatDriftMotion.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit the isolated solver files**

```powershell
git add src/survival/BoatDriftMotion.ts tests/BoatDriftMotion.test.ts
git commit -m "feat: add survival boat drift solver"
```

Expected: one commit containing only the two new files.

### Task 2: Add the fixed-capacity spray pool

**Files:**
- Create: `src/survival/BoatSpray.ts`
- Create: `tests/BoatSpray.test.ts`

**Interfaces:**
- Produces: `new BoatSpray(): BoatSpray`
- Produces: `points`, `emit(origin, intensity)`, `update(delta)`, `reset()`, `activeCount()`, and `dispose()`

- [ ] **Step 1: Write the spray-pool tests**

Create `tests/BoatSpray.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import { BufferAttribute, Vector3 } from 'three';
import { BOAT_SPRAY_CAPACITY, BoatSpray } from '../src/survival/BoatSpray';

describe('BoatSpray', () => {
  it('allocates one fixed-capacity position buffer and reuses it', () => {
    const spray = new BoatSpray();
    const position = spray.points.geometry.getAttribute('position') as BufferAttribute;
    expect(position.count).toBe(BOAT_SPRAY_CAPACITY);

    for (let index = 0; index < 20; index += 1) {
      spray.emit(new Vector3(index, 1, -2), 1);
    }
    expect(spray.activeCount()).toBeLessThanOrEqual(BOAT_SPRAY_CAPACITY);
    expect(spray.points.geometry.getAttribute('position')).toBe(position);
    spray.dispose();
  });

  it('advances active particles and resets them', () => {
    const spray = new BoatSpray();
    spray.emit(new Vector3(1, 2, 3), 0.8);
    expect(spray.activeCount()).toBeGreaterThan(0);
    spray.update(0.1);
    spray.reset();
    expect(spray.activeCount()).toBe(0);
    spray.dispose();
  });

  it('disposes geometry and material once through its owner', () => {
    const spray = new BoatSpray();
    const geometryDispose = vi.spyOn(spray.points.geometry, 'dispose');
    const materialDispose = vi.spyOn(spray.points.material, 'dispose');
    spray.dispose();
    expect(geometryDispose).toHaveBeenCalledOnce();
    expect(materialDispose).toHaveBeenCalledOnce();
  });
});
```

- [ ] **Step 2: Run the test and confirm RED**

Run:

```powershell
bun run test -- tests/BoatSpray.test.ts
```

Expected: FAIL because `src/survival/BoatSpray.ts` does not exist.

- [ ] **Step 3: Implement the pool**

Create `src/survival/BoatSpray.ts`:

```ts
import {
  BufferAttribute,
  BufferGeometry,
  Color,
  Points,
  PointsMaterial,
  Vector3,
} from 'three';

export const BOAT_SPRAY_CAPACITY = 24;
const INACTIVE_Y = -1000;

export class BoatSpray {
  readonly points: Points<BufferGeometry, PointsMaterial>;
  private readonly positions = new Float32Array(BOAT_SPRAY_CAPACITY * 3);
  private readonly velocities = new Float32Array(BOAT_SPRAY_CAPACITY * 3);
  private readonly life = new Float32Array(BOAT_SPRAY_CAPACITY);
  private cursor = 0;

  constructor() {
    for (let index = 0; index < BOAT_SPRAY_CAPACITY; index += 1) {
      this.positions[index * 3 + 1] = INACTIVE_Y;
    }
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new BufferAttribute(this.positions, 3));
    const material = new PointsMaterial({
      color: new Color(0xd8e1dc),
      size: 0.065,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0.72,
      depthWrite: false,
    });
    this.points = new Points(geometry, material);
    this.points.name = 'survival-bow-spray';
    this.points.frustumCulled = false;
  }

  emit(origin: Vector3, intensity: number): void {
    const strength = Math.min(1, Math.max(0, intensity));
    const count = 3 + Math.floor(strength * 5);
    for (let burstIndex = 0; burstIndex < count; burstIndex += 1) {
      const index = this.cursor;
      this.cursor = (this.cursor + 1) % BOAT_SPRAY_CAPACITY;
      const offset = index * 3;
      const phase = index * 2.399963 + burstIndex * 0.71;
      const radialSpeed = 0.22 + strength * 0.34;
      this.positions[offset] = origin.x;
      this.positions[offset + 1] = origin.y;
      this.positions[offset + 2] = origin.z;
      this.velocities[offset] = Math.cos(phase) * radialSpeed;
      this.velocities[offset + 1] = 0.45 + strength * 0.65;
      this.velocities[offset + 2] = Math.sin(phase) * radialSpeed - 0.16;
      this.life[index] = 0.28 + (index % 5) * 0.035 + strength * 0.12;
    }
    (this.points.geometry.getAttribute('position') as BufferAttribute).needsUpdate = true;
  }

  update(delta: number): void {
    const dt = Math.min(0.1, Math.max(0, delta));
    if (dt === 0) return;
    for (let index = 0; index < BOAT_SPRAY_CAPACITY; index += 1) {
      if (this.life[index]! <= 0) continue;
      const offset = index * 3;
      this.life[index] = Math.max(0, this.life[index]! - dt);
      if (this.life[index] === 0) {
        this.positions[offset + 1] = INACTIVE_Y;
        continue;
      }
      this.velocities[offset + 1] -= 2.4 * dt;
      this.positions[offset] += this.velocities[offset]! * dt;
      this.positions[offset + 1] += this.velocities[offset + 1]! * dt;
      this.positions[offset + 2] += this.velocities[offset + 2]! * dt;
    }
    (this.points.geometry.getAttribute('position') as BufferAttribute).needsUpdate = true;
  }

  reset(): void {
    this.life.fill(0);
    for (let index = 0; index < BOAT_SPRAY_CAPACITY; index += 1) {
      this.positions[index * 3 + 1] = INACTIVE_Y;
    }
    (this.points.geometry.getAttribute('position') as BufferAttribute).needsUpdate = true;
  }

  activeCount(): number {
    let active = 0;
    for (const remaining of this.life) if (remaining > 0) active += 1;
    return active;
  }

  dispose(): void {
    this.points.geometry.dispose();
    this.points.material.dispose();
  }
}
```

- [ ] **Step 4: Run the spray tests and confirm GREEN**

Run:

```powershell
bun run test -- tests/BoatSpray.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit the isolated spray files**

```powershell
git add src/survival/BoatSpray.ts tests/BoatSpray.test.ts
git commit -m "feat: add pooled survival bow spray"
```

Expected: one commit containing only the two new files.

### Task 3: Integrate drift, rider compensation, and secondary cues

**Files:**
- Modify: `src/survival/BoatWorld.ts`
- Modify: `tests/BoatWorld.test.ts`

**Interfaces:**
- Consumes: `BoatDriftMotion`, `BoatDriftFrame`, `sampleBoatWaveHeights`, and `weatherAmplitudeScale`
- Consumes: `BoatSpray`
- Preserves: `BoatWorld.update(time, delta)`, `play(cue)`, `projectInteractionAnchors(width, height)`, and `dispose()`

- [ ] **Step 1: Add failing BoatWorld integration tests**

Add these tests inside the existing `describe('BoatWorld helpers', ...)` block in `tests/BoatWorld.test.ts`. Keep the current `createTestMoonTexture()` constructor argument and shared `boatStorageTransform` imports.

```ts
it('moves the hull and rider rigs while preserving saved-item local transforms', () => {
  const camera = new PerspectiveCamera(65, 16 / 9, 0.08, 220);
  const propModels = createTestPropModels();
  const savedItems = [savedItem('medicalKit')];
  const world = new BoatWorld(
    camera,
    { matches: false } as MediaQueryList,
    propModels,
    createTestMoonTexture(),
    savedItems,
  );
  const motionRig = world.scene.getObjectByName('boat-motion-rig')!;
  const cameraRig = world.scene.getObjectByName('boat-camera-rig')!;
  const prop = world.scene.getObjectByName('prop:medicalKit-1')!;
  const localPosition = prop.position.clone();
  const localQuaternion = prop.quaternion.clone();

  for (let index = 1; index <= 40; index += 1) world.update(index * 0.1, 0.1);

  expect(Math.abs(motionRig.rotation.x) + Math.abs(motionRig.rotation.y) + Math.abs(motionRig.rotation.z))
    .toBeGreaterThan(0);
  expect(Math.abs(cameraRig.rotation.x) + Math.abs(cameraRig.rotation.y) + Math.abs(cameraRig.rotation.z))
    .toBeGreaterThan(0);
  expect(Math.abs(cameraRig.rotation.x)).toBeLessThanOrEqual(Math.PI / 180);
  expect(Math.abs(cameraRig.rotation.z)).toBeLessThanOrEqual(Math.PI / 180);
  expect(prop.position.toArray()).toEqual(localPosition.toArray());
  expect(prop.quaternion.toArray()).toEqual(localQuaternion.toArray());
  world.dispose();
  propModels.dispose();
});

it('keeps reduced-motion rigs and secondary cues neutral', () => {
  const propModels = createTestPropModels();
  const world = new BoatWorld(
    new PerspectiveCamera(),
    { matches: true } as MediaQueryList,
    propModels,
    createTestMoonTexture(),
    [savedItem('fishingRod')],
  );
  world.play('fish');
  world.update(4, 0.1);
  const motionRig = world.scene.getObjectByName('boat-motion-rig')!;
  const cameraRig = world.scene.getObjectByName('boat-camera-rig')!;
  const spray = world.scene.getObjectByName('survival-bow-spray') as Points;

  expect(motionRig.position.y).toBeCloseTo(0.22);
  expect(motionRig.rotation.toArray().slice(0, 3)).toEqual([0, 0, 0]);
  expect(cameraRig.position.toArray()).toEqual([0, 0, 0]);
  expect(cameraRig.rotation.toArray().slice(0, 3)).toEqual([0, 0, 0]);
  const sprayPositions = (spray.geometry.getAttribute('position') as BufferAttribute).array
    as Float32Array;
  for (let index = 1; index < sprayPositions.length; index += 3) {
    expect(sprayPositions[index]).toBe(-1000);
  }
  world.dispose();
  propModels.dispose();
});

it('keeps projected controls finite throughout the calm motion envelope', () => {
  const propModels = createTestPropModels();
  const savedItems = createItemInstances();
  const world = new BoatWorld(
    new PerspectiveCamera(65, 16 / 9, 0.08, 220),
    { matches: false } as MediaQueryList,
    propModels,
    createTestMoonTexture(),
    savedItems,
  );

  for (let index = 1; index <= 80; index += 1) {
    world.update(index * 0.1, 0.1);
    const anchors = world.projectInteractionAnchors(1280, 720);
    const itemAnchors = anchors.filter(({ itemType }) => itemType !== null);
    expect(itemAnchors).toHaveLength(savedItems.length);
    expect(itemAnchors.every(({ visible, x, y }) =>
      visible && Number.isFinite(x) && Number.isFinite(y)
      && x >= 0 && x <= 1280 && y >= 0 && y <= 720,
    )).toBe(true);
  }
  world.dispose();
  propModels.dispose();
});

it('applies fishing-line lag after the fishing cue makes the line visible', () => {
  const propModels = createTestPropModels();
  const world = new BoatWorld(
    new PerspectiveCamera(),
    { matches: false } as MediaQueryList,
    propModels,
    createTestMoonTexture(),
    [savedItem('fishingRod')],
  );
  const line = world.scene.getObjectByName('fishing-line')!;
  world.play('fish');
  for (let index = 1; index <= 8; index += 1) world.update(index * 0.1, 0.1);
  expect(line.visible).toBe(true);
  expect(Math.abs(line.rotation.x) + Math.abs(line.rotation.z)).toBeGreaterThan(0);
  world.dispose();
  propModels.dispose();
});
```

Add `BufferAttribute` and `Points` to the existing Three.js test imports.

- [ ] **Step 2: Run BoatWorld tests and confirm RED**

Run:

```powershell
bun run test -- tests/BoatWorld.test.ts
```

Expected: FAIL because `BoatWorld` still uses one center sample, has no rider pose, spray object, or line lag.

- [ ] **Step 3: Replace the old motion state with solver and cue state**

In `src/survival/BoatWorld.ts`, remove the direct `DEFAULT_WAVES` and `sampleWaveField` import. Add:

```ts
import {
  BoatDriftMotion,
  NEUTRAL_BOAT_DRIFT_FRAME,
  sampleBoatWaveHeights,
  weatherAmplitudeScale,
  type BoatDriftFrame,
} from './BoatDriftMotion';
import { BoatSpray } from './BoatSpray';
```

Replace `smoothedY`, `smoothedPitch`, and `smoothedRoll` with:

```ts
private readonly drift = new BoatDriftMotion();
private readonly spray = new BoatSpray();
private readonly bowAnchor = new Object3D();
private readonly bowWorldPosition = new Vector3();
private driftFrame: BoatDriftFrame = NEUTRAL_BOAT_DRIFT_FRAME;
private sprayCooldown = 0;
private readonly baseLineRotation: Euler | undefined;
```

Assign the authored line rotation after the constructor finds the line:

```ts

this.line = this.boat.getObjectByName('fishing-line');
this.catchMesh = this.boat.getObjectByName('fishing-catch');
this.baseLineRotation = this.line?.rotation.clone();
```

Add `Euler` to the Three.js import. Configure the bow anchor and scene-owned spray during construction:

```ts
this.bowAnchor.name = 'survival-bow-motion-anchor';
this.bowAnchor.position.set(0, 0.1, -2.75);
this.boat.add(this.bowAnchor);

this.scene.add(
  this.motionRig,
  this.ocean.mesh,
  this.spray.points,
  this.ambient,
  this.key,
  this.key.target,
  this.distantVessel,
);
```

- [ ] **Step 4: Apply the solver output in frame order**

Replace the center-sample block at the start of `update()` with:

```ts
const amplitudeScale = weatherAmplitudeScale(this.weather);
const waveHeights = sampleBoatWaveHeights(time, amplitudeScale);
this.driftFrame = this.drift.update(
  waveHeights,
  time,
  delta,
  this.reducedMotion.matches,
);
this.applyBasePresentation();
```

Keep the existing sky, lighting, cue, ocean, matrix, exclusion, and follow updates in their current order. Call this method after the active or settled presentation cue and before the ocean update:

```ts
this.updateSecondaryMotion(delta);
```

Replace the motion and camera reset in `applyBasePresentation()` with:

```ts
const { boat, rider } = this.driftFrame;
this.motionRig.position.set(0, 0.22 + boat.heave, 0);
this.motionRig.rotation.set(boat.pitch, boat.yaw, boat.roll);
this.cameraRig.position.set(0, rider.y, 0);
this.cameraRig.rotation.set(rider.pitch, rider.yaw, rider.roll);
this.camera.quaternion.copy(this.baseCameraQuaternion);
```

Keep pointer parallax after those lines. Reset line rotation with its authored value before cues run:

```ts
if (this.line && this.baseLineRotation) this.line.rotation.copy(this.baseLineRotation);
```

Add the secondary update method:

```ts
private updateSecondaryMotion(delta: number): void {
  const reduced = this.reducedMotion.matches;
  if (reduced) {
    this.spray.reset();
    this.sprayCooldown = 0;
    return;
  }

  this.spray.update(delta);
  this.sprayCooldown = Math.max(0, this.sprayCooldown - Math.min(delta, 0.1));
  if (this.driftFrame.bowImpact >= 0.25 && this.sprayCooldown === 0) {
    this.scene.updateMatrixWorld(true);
    this.bowAnchor.getWorldPosition(this.bowWorldPosition);
    this.spray.emit(this.bowWorldPosition, this.driftFrame.bowImpact);
    this.sprayCooldown = this.weather === 'squall' ? 0.18 : 0.35;
  }

  if (this.line?.visible && this.baseLineRotation) {
    const pitchLag = clamp(this.driftFrame.angularVelocity.pitch * 0.06, -0.08, 0.08);
    const rollLag = clamp(this.driftFrame.angularVelocity.roll * 0.06, -0.08, 0.08);
    this.line.rotation.x = this.baseLineRotation.x - rollLag;
    this.line.rotation.z = this.baseLineRotation.z + pitchLag;
  }
}
```

- [ ] **Step 5: Dispose the spray pool once**

Add `this.spray.dispose()` next to `this.ocean.dispose()` and remove the spray points from the scene list:

```ts
this.spray.dispose();
this.scene.remove(
  this.motionRig,
  this.ocean.mesh,
  this.spray.points,
  this.ambient,
  this.key,
  this.key.target,
  this.distantVessel,
);
```

Do not add spray geometry or material to `ownedGeometries` or `ownedMaterials`; `BoatSpray` owns them.

- [ ] **Step 6: Run focused tests and confirm GREEN**

Run:

```powershell
bun run test -- tests/BoatDriftMotion.test.ts tests/BoatSpray.test.ts tests/BoatWorld.test.ts tests/SurvivalPhase.test.ts tests/SurvivalPhaseFocus.test.ts
```

Expected: PASS. Existing wave exclusion, item placement, projected anchor, cue, and disposal tests remain green.

- [ ] **Step 7: Review the overlapping diff without staging it**

```powershell
git diff --check -- src/survival/BoatWorld.ts tests/BoatWorld.test.ts
git diff -- src/survival/BoatWorld.ts tests/BoatWorld.test.ts
git status --short
```

Expected: no whitespace errors. Leave `BoatWorld.ts` and `BoatWorld.test.ts` unstaged because both contain pre-existing user changes from the shared-lifeboat and sky work.

### Task 4: Run full verification and inspect motion in the browser

**Files:**
- Verify: `src/survival/BoatDriftMotion.ts`
- Verify: `src/survival/BoatSpray.ts`
- Verify: `src/survival/BoatWorld.ts`
- Verify: `tests/BoatDriftMotion.test.ts`
- Verify: `tests/BoatSpray.test.ts`
- Verify: `tests/BoatWorld.test.ts`

**Interfaces:**
- Verifies all interfaces produced by Tasks 1 through 3.
- Adds no runtime interface.

- [ ] **Step 1: Run the full automated suite**

```powershell
bun run test
bun run typecheck
bun run build
```

Expected: each command exits 0 with no test failure, TypeScript error, or Vite build error.

- [ ] **Step 2: Start the app and inspect calm drift**

Run:

```powershell
bun run dev -- --host 127.0.0.1
```

Use the browser-control skill at execution time. Reach the survival phase with several recovered supplies. Inspect at 1280 by 720 and 1920 by 1080:

```text
- Drift becomes visible within several seconds.
- Gunwales and supplies move within the frame by a small amount.
- Text and tooltips stay comfortable to read.
- Hovered and keyboard-focused targets track their props.
- Supplies remain secured and water stays outside the hull.
```

- [ ] **Step 3: Inspect weather and reduced motion**

Exercise calm, overcast, squall, and reduced-motion states:

```text
- Overcast raises hull response above calm.
- Squall produces the strongest hull motion and more bow spray.
- Rider pitch and roll remain within the one-degree cap.
- Fishing shows a line that lags the hull without detaching from its authored point.
- Impact and storm cues return to the current drift pose after completion.
- Reduced motion freezes the hull, rider, line lag, and spray while the ocean continues.
```

Check the browser console after each state. Expected: no uncaught error, warning loop, or WebGL resource warning.

- [ ] **Step 4: Inspect scope and repository state**

```powershell
git diff --check
git status --short
git diff -- src/survival/BoatDriftMotion.ts src/survival/BoatSpray.ts src/survival/BoatWorld.ts tests/BoatDriftMotion.test.ts tests/BoatSpray.test.ts tests/BoatWorld.test.ts
```

Expected: the diff contains drift motion, spray, line lag, tests, and no survival-rule or item-layout changes. Preserve all unrelated worktree edits.

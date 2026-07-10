# Last Boat Out First-Person Scavenging Demo Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a polished desktop-browser first-person scavenging demo in which the player searches a sinking ship, throws up to five supplies into a lifeboat, and evacuates before a 120-second timer expires.

**Architecture:** Pure TypeScript modules own game state, scoring, sinking progression, wave sampling, and buoyancy math. Three.js modules consume those results to render a procedural ship, ocean, lifeboat, props, weather, and first-person view; a small DOM layer owns menus and HUD. One `Game` orchestrator applies a fixed update order and never lets rendering objects mutate game rules directly.

**Tech Stack:** Vite 7, TypeScript 5.9, Three.js r180, Vitest 3, Bun package manager, DOM/CSS overlay, WebGL shaders.

## Global Constraints

- Target desktop browsers only; support current Chrome and Firefox.
- Controls are `WASD`, mouse look, held `Shift` to sprint, `E` for contextual interaction, and `Escape` to pause by releasing pointer lock.
- A run lasts exactly 120 seconds.
- There are exactly eight item types and exactly five lifeboat slots.
- The player can carry exactly one item at a time.
- `WaveField` is the authoritative CPU definition of four deterministic directional waves.
- Ocean shader uniforms are serialized from `WaveField`; do not duplicate wave constants in shader setup code.
- Lifeboat height, pitch, and roll come from four CPU samples of the same wave field.
- The ship follows a scripted sinking transform; do not add a rigid-body physics dependency.
- All geometry, text, interface styling, shaders, and effects are original.
- Do not add mobile controls, crewmates, survival-resource systems, night events, saves, settings, or branching narrative endings.
- Cap renderer pixel ratio at `2` and clamp simulation delta to `0.05` seconds.
- Respect `prefers-reduced-motion` by disabling camera vibration and reducing rain/spray motion.
- Use TDD for pure logic and deterministic simulations. Verify rendering and pointer lock with the manual browser checklist.
- Keep `.superpowers/`, `node_modules/`, `dist/`, coverage, and runtime logs out of Git.

## File Structure

```text
.
├── .gitignore                         # Generated and local-only paths
├── index.html                         # Canvas/UI mount and metadata
├── package.json                       # Scripts and pinned dependency ranges
├── tsconfig.json                      # Strict TypeScript browser configuration
├── vite.config.ts                     # Vite build and dev configuration
├── vitest.config.ts                   # Node test configuration
├── README.md                          # Run, controls, architecture, QA, deployment
├── src/
│   ├── main.ts                        # Styles import and Game bootstrap
│   ├── Game.ts                        # Renderer, state transitions, update order
│   ├── game/
│   │   ├── ItemState.ts               # Item IDs and legal runtime statuses
│   │   ├── ScavengeSession.ts         # Timer, capacity, item transitions, ending
│   │   ├── scoring.ts                 # Results grade from saved count
│   │   └── sinking.ts                 # Authored ship/environment progression
│   ├── ocean/
│   │   ├── WaveField.ts               # CPU wave sampling and uniform payload
│   │   ├── BoatBuoyancy.ts            # Four-point boat pose and smoothing
│   │   └── OceanRenderer.ts           # Shader-driven water mesh
│   ├── input/
│   │   └── InputController.ts         # Keyboard, pointer lock, mouse deltas
│   ├── player/
│   │   ├── collisions.ts              # Ship-local circle/capsule resolution
│   │   └── PlayerController.ts         # Look, movement, sprint, safe position
│   ├── interaction/
│   │   ├── InteractionSystem.ts        # Center raycast and contextual action
│   │   └── CarryController.ts          # Carried pose, drops, ballistic throws
│   ├── world/
│   │   ├── Environment.ts              # Fog, lights, rain, spray, sky
│   │   ├── Lifeboat.ts                 # Procedural boat and five visual slots
│   │   ├── PropFactory.ts              # Eight procedural supply models
│   │   ├── Ship.ts                     # Cabin, bridge, deck, colliders, markers
│   │   └── World.ts                    # Scene assembly and visual update bridge
│   ├── ui/
│   │   └── GameUI.ts                   # Start, HUD, pause, compatibility, result
│   └── styles/
│       └── main.css                    # Fullscreen canvas and restrained HUD
└── tests/
    ├── ScavengeSession.test.ts
    ├── scoring.test.ts
    ├── sinking.test.ts
    ├── WaveField.test.ts
    ├── BoatBuoyancy.test.ts
    ├── collisions.test.ts
    ├── world.test.ts
    ├── interaction.test.ts
    └── smoke.test.ts
```

---

### Task 1: Project Foundation and Scavenging Session

**Files:**
- Create: `.gitignore`
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `vite.config.ts`
- Create: `vitest.config.ts`
- Create: `tests/ScavengeSession.test.ts`
- Create: `src/game/ItemState.ts`
- Create: `src/game/ScavengeSession.ts`
- Generated: `bun.lock`

**Interfaces:**
- Consumes: none.
- Produces: `ITEM_IDS`, `ItemId`, `ItemStatus`, `SessionStatus`, `ScavengeSnapshot`, and `ScavengeSession` for all later gameplay tasks.

- [ ] **Step 1: Add project configuration**

Create `.gitignore`:

```gitignore
node_modules/
dist/
coverage/
.superpowers/
*.log
```

Create `package.json`:

```json
{
  "name": "last-boat-out",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc --noEmit && vite build",
    "preview": "vite preview",
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "three": "^0.180.0"
  },
  "devDependencies": {
    "@types/three": "^0.180.0",
    "typescript": "^5.9.0",
    "vite": "^7.1.0",
    "vitest": "^3.2.0"
  }
}
```

Create `tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "useDefineForClassFields": true,
    "module": "ESNext",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "skipLibCheck": true,
    "moduleResolution": "Bundler",
    "allowImportingTsExtensions": false,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noFallthroughCasesInSwitch": true,
    "forceConsistentCasingInFileNames": true
  },
  "include": ["src", "tests", "vite.config.ts", "vitest.config.ts"]
}
```

Create `vite.config.ts`:

```ts
import { defineConfig } from 'vite';

export default defineConfig({
  server: { host: '127.0.0.1' },
  build: { target: 'es2022' },
});
```

Create `vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
```

Run: `bun install`

Expected: dependencies install and `bun.lock` is created.

- [ ] **Step 2: Write the failing session tests**

Create `tests/ScavengeSession.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { ScavengeSession } from '../src/game/ScavengeSession';

describe('ScavengeSession', () => {
  it('starts at 120 seconds and fails exactly once at expiry', () => {
    const session = new ScavengeSession();
    session.start();
    session.tick(119.5);
    expect(session.snapshot().remainingSeconds).toBeCloseTo(0.5);
    session.tick(0.5);
    expect(session.snapshot().status).toBe('failure');
    session.tick(5);
    expect(session.snapshot().remainingSeconds).toBe(0);
  });

  it('does not advance while paused', () => {
    const session = new ScavengeSession();
    session.start();
    session.tick(10);
    session.pause();
    session.tick(40);
    expect(session.snapshot().remainingSeconds).toBe(110);
    session.resume();
    session.tick(1);
    expect(session.snapshot().remainingSeconds).toBe(109);
  });

  it('allows one carried item and five saved items', () => {
    const session = new ScavengeSession();
    session.start();
    expect(session.pickUp('flareGun')).toBe(true);
    expect(session.pickUp('ductTape')).toBe(false);
    expect(session.saveCarried()).toBe(true);

    for (const id of ['ductTape', 'fishingRod', 'baitTin', 'medicalKit'] as const) {
      expect(session.pickUp(id)).toBe(true);
      expect(session.saveCarried()).toBe(true);
    }

    expect(session.snapshot().savedCount).toBe(5);
    expect(session.pickUp('waterJug')).toBe(true);
    expect(session.saveCarried()).toBe(false);
    expect(session.snapshot().carriedItem).toBe('waterJug');
  });

  it('keeps saved and lost transitions idempotent', () => {
    const session = new ScavengeSession();
    session.start();
    session.pickUp('flashlight');
    expect(session.loseCarried()).toBe(true);
    expect(session.lose('flashlight')).toBe(false);
    expect(session.snapshot().items.flashlight).toBe('lost');
  });

  it('commits success only once', () => {
    const session = new ScavengeSession();
    session.start();
    expect(session.evacuate()).toBe(true);
    expect(session.evacuate()).toBe(false);
    expect(session.snapshot().status).toBe('success');
  });
});
```

- [ ] **Step 3: Run the session tests and verify red**

Run: `bun run test -- tests/ScavengeSession.test.ts`

Expected: FAIL because `src/game/ScavengeSession.ts` does not exist.

- [ ] **Step 4: Implement item types and the session**

Create `src/game/ItemState.ts`:

```ts
export const ITEM_IDS = [
  'flareGun',
  'ductTape',
  'fishingRod',
  'baitTin',
  'medicalKit',
  'waterJug',
  'cannedFood',
  'flashlight',
] as const;

export type ItemId = (typeof ITEM_IDS)[number];
export type ItemStatus = 'available' | 'carried' | 'saved' | 'lost';

export function createInitialItemState(): Record<ItemId, ItemStatus> {
  return Object.fromEntries(ITEM_IDS.map((id) => [id, 'available'])) as Record<ItemId, ItemStatus>;
}
```

Create `src/game/ScavengeSession.ts`:

```ts
import { createInitialItemState, type ItemId, type ItemStatus } from './ItemState';

export type SessionStatus = 'idle' | 'running' | 'paused' | 'success' | 'failure';

export interface ScavengeSnapshot {
  status: SessionStatus;
  remainingSeconds: number;
  savedCount: number;
  carriedItem: ItemId | null;
  items: Readonly<Record<ItemId, ItemStatus>>;
}

const RUN_SECONDS = 120;
const BOAT_CAPACITY = 5;

export class ScavengeSession {
  private status: SessionStatus = 'idle';
  private remainingSeconds = RUN_SECONDS;
  private readonly items = createInitialItemState();
  private carriedItem: ItemId | null = null;
  private savedCount = 0;

  start(): void {
    if (this.status === 'idle') this.status = 'running';
  }

  tick(deltaSeconds: number): void {
    if (this.status !== 'running') return;
    this.remainingSeconds = Math.max(0, this.remainingSeconds - Math.max(0, deltaSeconds));
    if (this.remainingSeconds === 0) this.finish('failure');
  }

  pause(): void {
    if (this.status === 'running') this.status = 'paused';
  }

  resume(): void {
    if (this.status === 'paused') this.status = 'running';
  }

  pickUp(id: ItemId): boolean {
    if (this.status !== 'running' || this.carriedItem || this.items[id] !== 'available') return false;
    this.items[id] = 'carried';
    this.carriedItem = id;
    return true;
  }

  dropCarried(): ItemId | null {
    if (!this.carriedItem) return null;
    const id = this.carriedItem;
    this.items[id] = 'available';
    this.carriedItem = null;
    return id;
  }

  saveCarried(): boolean {
    if (!this.carriedItem || this.savedCount >= BOAT_CAPACITY) return false;
    const id = this.carriedItem;
    this.items[id] = 'saved';
    this.carriedItem = null;
    this.savedCount += 1;
    return true;
  }

  loseCarried(): boolean {
    if (!this.carriedItem) return false;
    const id = this.carriedItem;
    this.items[id] = 'lost';
    this.carriedItem = null;
    return true;
  }

  lose(id: ItemId): boolean {
    if (this.items[id] === 'saved' || this.items[id] === 'lost') return false;
    if (this.carriedItem === id) this.carriedItem = null;
    this.items[id] = 'lost';
    return true;
  }

  evacuate(): boolean {
    return this.status === 'running' && this.finish('success');
  }

  snapshot(): ScavengeSnapshot {
    return {
      status: this.status,
      remainingSeconds: this.remainingSeconds,
      savedCount: this.savedCount,
      carriedItem: this.carriedItem,
      items: { ...this.items },
    };
  }

  private finish(status: 'success' | 'failure'): boolean {
    if (this.status === 'success' || this.status === 'failure') return false;
    this.status = status;
    return true;
  }
}
```

- [ ] **Step 5: Run the session tests and verify green**

Run: `bun run test -- tests/ScavengeSession.test.ts`

Expected: 5 tests PASS.

- [ ] **Step 6: Commit the foundation**

```bash
git add .gitignore package.json bun.lock tsconfig.json vite.config.ts vitest.config.ts src/game tests/ScavengeSession.test.ts
git commit -m "feat: establish scavenging session rules"
```

---

### Task 2: Results Scoring

**Files:**
- Create: `tests/scoring.test.ts`
- Create: `src/game/scoring.ts`

**Interfaces:**
- Consumes: saved item count from `ScavengeSnapshot.savedCount`.
- Produces: `ResultGrade` and `gradeForSavedCount(savedCount: number): ResultGrade` for `GameUI`.

- [ ] **Step 1: Write the failing scoring tests**

Create `tests/scoring.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { gradeForSavedCount } from '../src/game/scoring';

describe('gradeForSavedCount', () => {
  it.each([
    [0, 'Barely Afloat'],
    [1, 'Barely Afloat'],
    [2, 'Hard Choices'],
    [3, 'Hard Choices'],
    [4, 'Well Provisioned'],
    [5, 'Every Slot Counted'],
  ] as const)('maps %i saved items to %s', (count, label) => {
    expect(gradeForSavedCount(count).label).toBe(label);
  });

  it('clamps out-of-range counts', () => {
    expect(gradeForSavedCount(-4).savedCount).toBe(0);
    expect(gradeForSavedCount(12).savedCount).toBe(5);
  });
});
```

- [ ] **Step 2: Run the scoring tests and verify red**

Run: `bun run test -- tests/scoring.test.ts`

Expected: FAIL because `src/game/scoring.ts` does not exist.

- [ ] **Step 3: Implement score grading**

Create `src/game/scoring.ts`:

```ts
export interface ResultGrade {
  savedCount: number;
  label: 'Barely Afloat' | 'Hard Choices' | 'Well Provisioned' | 'Every Slot Counted';
  description: string;
}

export function gradeForSavedCount(savedCount: number): ResultGrade {
  const count = Math.min(5, Math.max(0, Math.trunc(savedCount)));
  if (count <= 1) return { savedCount: count, label: 'Barely Afloat', description: 'You escaped with almost nothing.' };
  if (count <= 3) return { savedCount: count, label: 'Hard Choices', description: 'Some supplies made it. Others went down.' };
  if (count === 4) return { savedCount: count, label: 'Well Provisioned', description: 'The lifeboat carries enough to give you a chance.' };
  return { savedCount: count, label: 'Every Slot Counted', description: 'You used every inch before abandoning ship.' };
}
```

- [ ] **Step 4: Verify the scoring tests**

Run: `bun run test -- tests/scoring.test.ts`

Expected: 7 parameterized assertions and the clamp test PASS.

- [ ] **Step 5: Commit scoring**

```bash
git add src/game/scoring.ts tests/scoring.test.ts
git commit -m "feat: grade scavenging results"
```

---

### Task 3: Scripted Sinking Progression

**Files:**
- Create: `tests/sinking.test.ts`
- Create: `src/game/sinking.ts`

**Interfaces:**
- Consumes: elapsed seconds and the fixed 120-second duration.
- Produces: `SinkingState` and `getSinkingState(elapsedSeconds, durationSeconds)` for `World` and `Game`.

- [ ] **Step 1: Write the failing sinking tests**

Create `tests/sinking.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { getSinkingState } from '../src/game/sinking';

describe('getSinkingState', () => {
  it('starts stable and ends at authored limits', () => {
    const start = getSinkingState(0, 120);
    const end = getSinkingState(120, 120);
    expect(start.progress).toBe(0);
    expect(start.rollRadians).toBeCloseTo(-0.05);
    expect(end.progress).toBe(1);
    expect(end.rollRadians).toBeCloseTo(-0.32);
    expect(end.sinkOffset).toBeCloseTo(-4.2);
    expect(end.waveAmplitudeScale).toBeCloseTo(1.35);
  });

  it('is monotonic and clamped', () => {
    const samples = [-10, 0, 30, 60, 90, 120, 150].map((time) => getSinkingState(time, 120));
    for (let index = 1; index < samples.length; index += 1) {
      expect(samples[index]!.progress).toBeGreaterThanOrEqual(samples[index - 1]!.progress);
      expect(samples[index]!.sinkOffset).toBeLessThanOrEqual(samples[index - 1]!.sinkOffset);
    }
    expect(samples[0]!.progress).toBe(0);
    expect(samples.at(-1)!.progress).toBe(1);
  });
});
```

- [ ] **Step 2: Run the sinking tests and verify red**

Run: `bun run test -- tests/sinking.test.ts`

Expected: FAIL because `src/game/sinking.ts` does not exist.

- [ ] **Step 3: Implement the authored curve**

Create `src/game/sinking.ts`:

```ts
export interface SinkingState {
  progress: number;
  rollRadians: number;
  pitchRadians: number;
  sinkOffset: number;
  alarmRate: number;
  waveAmplitudeScale: number;
  cameraShake: number;
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function smootherStep(value: number): number {
  return value * value * value * (value * (value * 6 - 15) + 10);
}

export function getSinkingState(elapsedSeconds: number, durationSeconds: number): SinkingState {
  const raw = durationSeconds <= 0 ? 1 : elapsedSeconds / durationSeconds;
  const progress = clamp01(raw);
  const eased = smootherStep(progress);
  const finalRush = clamp01((progress - 0.75) / 0.25);

  return {
    progress,
    rollRadians: -0.05 - 0.27 * eased,
    pitchRadians: 0.015 + 0.055 * eased,
    sinkOffset: -4.2 * eased,
    alarmRate: 0.7 + 1.3 * finalRush,
    waveAmplitudeScale: 1 + 0.35 * eased,
    cameraShake: 0.003 + 0.018 * finalRush,
  };
}
```

- [ ] **Step 4: Verify the sinking tests**

Run: `bun run test -- tests/sinking.test.ts`

Expected: 2 tests PASS.

- [ ] **Step 5: Commit sinking progression**

```bash
git add src/game/sinking.ts tests/sinking.test.ts
git commit -m "feat: define sinking progression"
```

---

### Task 4: Deterministic Wave Field

**Files:**
- Create: `tests/WaveField.test.ts`
- Create: `src/ocean/WaveField.ts`

**Interfaces:**
- Consumes: world `x`, world `z`, elapsed seconds, and amplitude scale.
- Produces: `WaveComponent`, `WaveSample`, `DEFAULT_WAVES`, `sampleWaveField(...)`, and `createWaveUniformPayload(...)` for ocean rendering and buoyancy.

- [ ] **Step 1: Write the failing wave tests**

Create `tests/WaveField.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { DEFAULT_WAVES, createWaveUniformPayload, sampleWaveField } from '../src/ocean/WaveField';

describe('WaveField', () => {
  it('returns deterministic height and a unit normal', () => {
    const a = sampleWaveField(DEFAULT_WAVES, 3.25, 4, -7, 1.2);
    const b = sampleWaveField(DEFAULT_WAVES, 3.25, 4, -7, 1.2);
    expect(a).toEqual(b);
    expect(Number.isFinite(a.height)).toBe(true);
    const length = Math.hypot(a.normal.x, a.normal.y, a.normal.z);
    expect(length).toBeCloseTo(1, 6);
  });

  it('scales height and displacement with amplitude', () => {
    const base = sampleWaveField(DEFAULT_WAVES, 2, 3, 5, 1);
    const stronger = sampleWaveField(DEFAULT_WAVES, 2, 3, 5, 1.35);
    expect(stronger.height).toBeCloseTo(base.height * 1.35, 6);
    expect(stronger.displacementX).toBeCloseTo(base.displacementX * 1.35, 6);
    expect(stronger.displacementZ).toBeCloseTo(base.displacementZ * 1.35, 6);
  });

  it('serializes exactly four waves for the shader', () => {
    const payload = createWaveUniformPayload(DEFAULT_WAVES);
    expect(payload.directions).toHaveLength(4);
    expect(payload.parameters).toHaveLength(4);
    expect(payload.phases).toHaveLength(4);
    expect(payload.parameters[0]).toEqual([
      DEFAULT_WAVES[0]!.amplitude,
      DEFAULT_WAVES[0]!.wavelength,
      DEFAULT_WAVES[0]!.speed,
      DEFAULT_WAVES[0]!.steepness,
    ]);
  });
});
```

- [ ] **Step 2: Run the wave tests and verify red**

Run: `bun run test -- tests/WaveField.test.ts`

Expected: FAIL because `src/ocean/WaveField.ts` does not exist.

- [ ] **Step 3: Implement CPU sampling and uniform serialization**

Create `src/ocean/WaveField.ts`:

```ts
export interface WaveComponent {
  direction: readonly [number, number];
  amplitude: number;
  wavelength: number;
  speed: number;
  steepness: number;
  phase: number;
}

export interface WaveSample {
  height: number;
  displacementX: number;
  displacementZ: number;
  normal: { x: number; y: number; z: number };
}

export interface WaveUniformPayload {
  directions: Array<[number, number]>;
  parameters: Array<[number, number, number, number]>;
  phases: number[];
}

export const DEFAULT_WAVES: readonly WaveComponent[] = [
  { direction: [0.92, 0.39], amplitude: 0.42, wavelength: 12, speed: 0.82, steepness: 0.42, phase: 0.2 },
  { direction: [-0.35, 0.94], amplitude: 0.24, wavelength: 7.4, speed: 1.08, steepness: 0.34, phase: 1.7 },
  { direction: [0.18, -0.98], amplitude: 0.13, wavelength: 4.1, speed: 1.42, steepness: 0.25, phase: 3.1 },
  { direction: [-0.81, -0.59], amplitude: 0.08, wavelength: 2.6, speed: 1.88, steepness: 0.18, phase: 4.6 },
] as const;

export function sampleWaveField(
  waves: readonly WaveComponent[],
  timeSeconds: number,
  x: number,
  z: number,
  amplitudeScale = 1,
): WaveSample {
  let height = 0;
  let displacementX = 0;
  let displacementZ = 0;
  let derivativeX = 0;
  let derivativeZ = 0;

  for (const wave of waves) {
    const directionLength = Math.hypot(wave.direction[0], wave.direction[1]) || 1;
    const dx = wave.direction[0] / directionLength;
    const dz = wave.direction[1] / directionLength;
    const waveNumber = (Math.PI * 2) / wave.wavelength;
    const amplitude = wave.amplitude * amplitudeScale;
    const theta = waveNumber * (dx * x + dz * z) + wave.speed * timeSeconds + wave.phase;
    const sine = Math.sin(theta);
    const cosine = Math.cos(theta);

    height += amplitude * sine;
    displacementX += wave.steepness * amplitude * dx * cosine;
    displacementZ += wave.steepness * amplitude * dz * cosine;
    derivativeX += amplitude * waveNumber * dx * cosine;
    derivativeZ += amplitude * waveNumber * dz * cosine;
  }

  const nx = -derivativeX;
  const ny = 1;
  const nz = -derivativeZ;
  const normalLength = Math.hypot(nx, ny, nz) || 1;

  return {
    height,
    displacementX,
    displacementZ,
    normal: { x: nx / normalLength, y: ny / normalLength, z: nz / normalLength },
  };
}

export function createWaveUniformPayload(waves: readonly WaveComponent[]): WaveUniformPayload {
  if (waves.length !== 4) throw new Error(`Expected exactly four waves, received ${waves.length}`);
  return {
    directions: waves.map((wave) => [wave.direction[0], wave.direction[1]]),
    parameters: waves.map((wave) => [wave.amplitude, wave.wavelength, wave.speed, wave.steepness]),
    phases: waves.map((wave) => wave.phase),
  };
}
```

- [ ] **Step 4: Verify wave tests and all prior logic tests**

Run: `bun run test -- tests/WaveField.test.ts tests/ScavengeSession.test.ts tests/scoring.test.ts tests/sinking.test.ts`

Expected: all tests PASS.

- [ ] **Step 5: Commit the wave field**

```bash
git add src/ocean/WaveField.ts tests/WaveField.test.ts
git commit -m "feat: add deterministic ocean wave field"
```

---

### Task 5: Four-Point Lifeboat Buoyancy

**Files:**
- Create: `tests/BoatBuoyancy.test.ts`
- Create: `src/ocean/BoatBuoyancy.ts`

**Interfaces:**
- Consumes: `WaveSampleProvider`, world anchor, boat footprint, time, amplitude scale, current pose, and delta.
- Produces: `BoatPose`, `deriveBoatPose(...)`, `smoothBoatPose(...)`, and `BoatBuoyancy.sampleTarget(...)` for the procedural lifeboat.

- [ ] **Step 1: Write the failing buoyancy tests**

Create `tests/BoatBuoyancy.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { deriveBoatPose, smoothBoatPose } from '../src/ocean/BoatBuoyancy';

describe('lifeboat buoyancy', () => {
  it('derives height, pitch, and roll from four samples', () => {
    const pose = deriveBoatPose(
      { bow: 1.2, stern: 0.4, port: 0.9, starboard: 0.3 },
      { length: 4, width: 2 },
    );
    expect(pose.y).toBeCloseTo(0.7);
    expect(pose.pitch).toBeCloseTo(Math.atan2(0.8, 4));
    expect(pose.roll).toBeCloseTo(Math.atan2(0.6, 2));
  });

  it('smooths toward the target without overshoot', () => {
    const current = { y: 0, pitch: 0, roll: 0, driftX: 0, driftZ: 0 };
    const target = { y: 2, pitch: 0.3, roll: -0.2, driftX: 0.4, driftZ: -0.5 };
    const next = smoothBoatPose(current, target, 0.05, 7);
    expect(next.y).toBeGreaterThan(0);
    expect(next.y).toBeLessThan(2);
    expect(next.roll).toBeLessThan(0);
    expect(next.roll).toBeGreaterThan(-0.2);
  });
});
```

- [ ] **Step 2: Run the buoyancy tests and verify red**

Run: `bun run test -- tests/BoatBuoyancy.test.ts`

Expected: FAIL because `src/ocean/BoatBuoyancy.ts` does not exist.

- [ ] **Step 3: Implement pose derivation, sampling, and damping**

Create `src/ocean/BoatBuoyancy.ts`:

```ts
import type { WaveSample } from './WaveField';

export interface BoatHeightSamples {
  bow: number;
  stern: number;
  port: number;
  starboard: number;
}

export interface BoatFootprint {
  length: number;
  width: number;
}

export interface BoatPose {
  y: number;
  pitch: number;
  roll: number;
  driftX: number;
  driftZ: number;
}

export type WaveSampleProvider = (time: number, x: number, z: number, amplitudeScale: number) => WaveSample;

export function deriveBoatPose(samples: BoatHeightSamples, footprint: BoatFootprint): BoatPose {
  const y = (samples.bow + samples.stern + samples.port + samples.starboard) / 4;
  return {
    y,
    pitch: Math.atan2(samples.bow - samples.stern, footprint.length),
    roll: Math.atan2(samples.port - samples.starboard, footprint.width),
    driftX: 0,
    driftZ: 0,
  };
}

export function smoothBoatPose(current: BoatPose, target: BoatPose, deltaSeconds: number, damping: number): BoatPose {
  const factor = 1 - Math.exp(-Math.max(0, damping) * Math.max(0, deltaSeconds));
  const mix = (from: number, to: number): number => from + (to - from) * factor;
  return {
    y: mix(current.y, target.y),
    pitch: mix(current.pitch, target.pitch),
    roll: mix(current.roll, target.roll),
    driftX: mix(current.driftX, target.driftX),
    driftZ: mix(current.driftZ, target.driftZ),
  };
}

export class BoatBuoyancy {
  constructor(
    private readonly sample: WaveSampleProvider,
    private readonly footprint: BoatFootprint = { length: 4, width: 2 },
  ) {}

  sampleTarget(time: number, anchorX: number, anchorZ: number, amplitudeScale: number): BoatPose {
    const halfLength = this.footprint.length / 2;
    const halfWidth = this.footprint.width / 2;
    const bow = this.sample(time, anchorX, anchorZ - halfLength, amplitudeScale);
    const stern = this.sample(time, anchorX, anchorZ + halfLength, amplitudeScale);
    const port = this.sample(time, anchorX - halfWidth, anchorZ, amplitudeScale);
    const starboard = this.sample(time, anchorX + halfWidth, anchorZ, amplitudeScale);
    const pose = deriveBoatPose(
      { bow: bow.height, stern: stern.height, port: port.height, starboard: starboard.height },
      this.footprint,
    );
    const centerNormalX = (bow.normal.x + stern.normal.x + port.normal.x + starboard.normal.x) / 4;
    const centerNormalZ = (bow.normal.z + stern.normal.z + port.normal.z + starboard.normal.z) / 4;
    pose.driftX = Math.max(-0.35, Math.min(0.35, -centerNormalX * 0.3));
    pose.driftZ = Math.max(-0.35, Math.min(0.35, -centerNormalZ * 0.3));
    return pose;
  }
}
```

- [ ] **Step 4: Verify buoyancy and wave tests**

Run: `bun run test -- tests/BoatBuoyancy.test.ts tests/WaveField.test.ts`

Expected: 5 tests PASS across both files.

- [ ] **Step 5: Commit buoyancy math**

```bash
git add src/ocean/BoatBuoyancy.ts tests/BoatBuoyancy.test.ts
git commit -m "feat: derive lifeboat motion from ocean waves"
```

---

### Task 6: Procedural Ship, Lifeboat, and Supply Props

**Files:**
- Create: `tests/world.test.ts`
- Create: `src/player/collisions.ts`
- Create: `src/world/PropFactory.ts`
- Create: `src/world/Ship.ts`
- Create: `src/world/Lifeboat.ts`

**Interfaces:**
- Consumes: `ITEM_IDS` and `ItemId`.
- Produces: `CollisionBox`, `createProp(id)`, `ShipBuild`, `createShip()`, `LifeboatBuild`, and `createLifeboat()` for the player, interaction, and world tasks.

- [ ] **Step 1: Write failing procedural-world tests**

Create `tests/world.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { Mesh } from 'three';
import { ITEM_IDS } from '../src/game/ItemState';
import { createLifeboat } from '../src/world/Lifeboat';
import { createProp } from '../src/world/PropFactory';
import { createShip } from '../src/world/Ship';

describe('procedural world builders', () => {
  it.each(ITEM_IDS)('builds a visible mesh for %s', (id) => {
    const prop = createProp(id);
    let meshCount = 0;
    prop.traverse((object) => {
      if (object instanceof Mesh) meshCount += 1;
    });
    expect(prop.userData.itemId).toBe(id);
    expect(meshCount).toBeGreaterThan(0);
  });

  it('builds the two-zone ship contract', () => {
    const ship = createShip();
    expect(ship.itemSpawnPoints).toHaveLength(8);
    expect(ship.colliders.length).toBeGreaterThanOrEqual(10);
    expect(ship.playerStart.y).toBeGreaterThan(2);
    expect(ship.evacuationPoint.x).toBeGreaterThan(3);
  });

  it('builds exactly five lifeboat supply slots', () => {
    const lifeboat = createLifeboat();
    expect(lifeboat.slots).toHaveLength(5);
    expect(lifeboat.acceptanceBox.min.y).toBeLessThan(lifeboat.acceptanceBox.max.y);
  });
});
```

- [ ] **Step 2: Run the world tests and verify red**

Run: `bun run test -- tests/world.test.ts`

Expected: FAIL because the three world modules do not exist.

- [ ] **Step 3: Define the collision-volume contract**

Create `src/player/collisions.ts`:

```ts
export interface CollisionBox {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  minZ: number;
  maxZ: number;
}

export interface LocalPlayerPosition {
  x: number;
  y: number;
  z: number;
}
```

- [ ] **Step 4: Build all eight procedural prop silhouettes**

Create `src/world/PropFactory.ts`:

```ts
import {
  BoxGeometry,
  CylinderGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  SphereGeometry,
  TorusGeometry,
} from 'three';
import type { ItemId } from '../game/ItemState';

const material = (color: number, metalness = 0.15): MeshStandardMaterial =>
  new MeshStandardMaterial({ color, roughness: 0.72, metalness, flatShading: true });

const box = (size: [number, number, number], color: number): Mesh =>
  new Mesh(new BoxGeometry(...size), material(color));

const cylinder = (radius: number, length: number, color: number, radialSegments = 8): Mesh => {
  const mesh = new Mesh(new CylinderGeometry(radius, radius, length, radialSegments), material(color, 0.25));
  mesh.rotation.z = Math.PI / 2;
  return mesh;
};

export function createProp(id: ItemId): Group {
  const root = new Group();
  root.name = `prop:${id}`;
  root.userData.itemId = id;

  if (id === 'flareGun') {
    const barrel = box([0.18, 0.18, 0.72], 0x9c4f3f);
    barrel.position.z = -0.15;
    const grip = box([0.16, 0.42, 0.18], 0x393735);
    grip.position.set(0, -0.24, 0.12);
    grip.rotation.x = -0.22;
    root.add(barrel, grip);
  } else if (id === 'ductTape') {
    const roll = new Mesh(new TorusGeometry(0.25, 0.1, 6, 12), material(0x666c6c, 0.45));
    roll.rotation.x = Math.PI / 2;
    root.add(roll);
  } else if (id === 'fishingRod') {
    const rod = cylinder(0.025, 1.8, 0x765535, 6);
    const reel = cylinder(0.12, 0.12, 0x788184, 8);
    reel.rotation.set(Math.PI / 2, 0, 0);
    reel.position.set(0.18, -0.04, 0);
    root.add(rod, reel);
  } else if (id === 'baitTin') {
    const tin = cylinder(0.28, 0.22, 0x86989a, 12);
    tin.rotation.z = 0;
    const label = box([0.58, 0.12, 0.03], 0x9c4f3f);
    label.position.z = 0.25;
    root.add(tin, label);
  } else if (id === 'medicalKit') {
    const caseMesh = box([0.7, 0.42, 0.28], 0xb8b29f);
    const vertical = box([0.12, 0.26, 0.03], 0x9c4f3f);
    vertical.position.z = 0.16;
    const horizontal = box([0.3, 0.1, 0.03], 0x9c4f3f);
    horizontal.position.z = 0.16;
    root.add(caseMesh, vertical, horizontal);
  } else if (id === 'waterJug') {
    const body = new Mesh(new CylinderGeometry(0.25, 0.3, 0.72, 8), material(0x547b82));
    const cap = new Mesh(new CylinderGeometry(0.13, 0.13, 0.11, 8), material(0xc6bd9e));
    cap.position.y = 0.42;
    root.add(body, cap);
  } else if (id === 'cannedFood') {
    const can = new Mesh(new CylinderGeometry(0.2, 0.2, 0.38, 12), material(0x7c8582, 0.45));
    const band = new Mesh(new CylinderGeometry(0.205, 0.205, 0.18, 12), material(0x9b6848));
    root.add(can, band);
  } else {
    const body = cylinder(0.11, 0.58, 0x353b3c, 10);
    const head = new Mesh(new CylinderGeometry(0.2, 0.13, 0.2, 10), material(0x9b8b61, 0.35));
    head.rotation.z = Math.PI / 2;
    head.position.x = 0.36;
    const lens = new Mesh(new SphereGeometry(0.115, 8, 6), material(0xd4c894));
    lens.scale.x = 0.32;
    lens.position.x = 0.47;
    root.add(body, head, lens);
  }

  root.traverse((object) => {
    if (object instanceof Mesh) {
      object.castShadow = true;
      object.receiveShadow = true;
    }
  });
  return root;
}
```

- [ ] **Step 5: Build the two-zone ship and authored markers**

Create `src/world/Ship.ts`:

```ts
import { BoxGeometry, Group, Mesh, MeshStandardMaterial, Vector3 } from 'three';
import type { CollisionBox } from '../player/collisions';

export interface ShipBuild {
  root: Group;
  colliders: CollisionBox[];
  itemSpawnPoints: Vector3[];
  playerStart: Vector3;
  evacuationPoint: Vector3;
}

const steel = new MeshStandardMaterial({ color: 0x586166, roughness: 0.82, metalness: 0.28, flatShading: true });
const darkSteel = new MeshStandardMaterial({ color: 0x30383b, roughness: 0.88, metalness: 0.24, flatShading: true });
const deckMaterial = new MeshStandardMaterial({ color: 0x62584b, roughness: 0.94, flatShading: true });
const alarmMaterial = new MeshStandardMaterial({ color: 0x9c4f3f, emissive: 0x3d120d, emissiveIntensity: 0.35 });

function block(size: [number, number, number], position: [number, number, number], material = steel): Mesh {
  const mesh = new Mesh(new BoxGeometry(...size), material);
  mesh.position.set(...position);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

export function createShip(): ShipBuild {
  const root = new Group();
  root.name = 'sinking-ship';
  root.add(block([8.4, 2.8, 24], [0, 0.2, 0], darkSteel));
  root.add(block([8, 0.35, 21], [0, 2, 0], deckMaterial));
  root.add(block([7.4, 0.25, 8], [0, 5.25, 5.2], steel));
  root.add(block([0.25, 3.1, 8], [-3.7, 3.65, 5.2], steel));
  root.add(block([0.25, 3.1, 8], [3.7, 3.65, 5.2], steel));
  root.add(block([7.4, 3.1, 0.25], [0, 3.65, 9.08], steel));
  root.add(block([2.65, 3.1, 0.25], [-2.38, 3.65, 1.2], steel));
  root.add(block([2.65, 3.1, 0.25], [2.38, 3.65, 1.2], steel));
  root.add(block([2.5, 0.9, 0.9], [0, 2.55, 7.1], darkSteel));
  root.add(block([0.18, 1.1, 13], [-3.85, 2.65, -4.2], steel));
  root.add(block([0.18, 1.1, 13], [3.85, 2.65, -4.2], steel));
  root.add(block([0.7, 0.7, 0.7], [-2.8, 2.55, -6.5], alarmMaterial));
  root.add(block([1.4, 1.2, 1.5], [1.6, 2.75, -5.5], darkSteel));
  root.add(block([1.8, 1.4, 1.8], [-1.8, 2.85, -7.5], darkSteel));

  const colliders: CollisionBox[] = [
    { minX: -4, maxX: 4, minY: 1.8, maxY: 2.2, minZ: -10.5, maxZ: 10.5 },
    { minX: -3.9, maxX: -3.5, minY: 2, maxY: 5.4, minZ: 1.2, maxZ: 9.2 },
    { minX: 3.5, maxX: 3.9, minY: 2, maxY: 5.4, minZ: 1.2, maxZ: 9.2 },
    { minX: -3.8, maxX: 3.8, minY: 2, maxY: 5.4, minZ: 8.9, maxZ: 9.3 },
    { minX: -3.8, maxX: -1.05, minY: 2, maxY: 5.4, minZ: 1.05, maxZ: 1.4 },
    { minX: 1.05, maxX: 3.8, minY: 2, maxY: 5.4, minZ: 1.05, maxZ: 1.4 },
    { minX: -1.3, maxX: 1.3, minY: 2, maxY: 3.1, minZ: 6.6, maxZ: 7.6 },
    { minX: 0.85, maxX: 2.35, minY: 2, maxY: 3.5, minZ: -6.3, maxZ: -4.7 },
    { minX: -2.8, maxX: -0.8, minY: 2, maxY: 3.6, minZ: -8.5, maxZ: -6.5 },
    { minX: -4.2, maxX: -3.55, minY: 2, maxY: 3.3, minZ: -10.5, maxZ: -0.2 },
    { minX: 3.55, maxX: 4.2, minY: 2, maxY: 3.3, minZ: -10.5, maxZ: -0.2 },
  ];

  return {
    root,
    colliders,
    itemSpawnPoints: [
      new Vector3(-2.7, 2.35, 7.6), new Vector3(2.6, 2.35, 7.6),
      new Vector3(-2.5, 2.35, 3.4), new Vector3(2.45, 2.35, 2.7),
      new Vector3(-2.4, 2.35, -2.6), new Vector3(2.6, 2.35, -3.6),
      new Vector3(-0.2, 2.35, -6.4), new Vector3(2.4, 2.35, -8.6),
    ],
    playerStart: new Vector3(0, 3.72, 7.8),
    evacuationPoint: new Vector3(4.35, 2.4, -5.8),
  };
}
```

- [ ] **Step 6: Build the lifeboat and five visible slots**

Create `src/world/Lifeboat.ts`:

```ts
import { Box3, BoxGeometry, Group, Mesh, MeshStandardMaterial, Vector3 } from 'three';

export interface LifeboatBuild {
  root: Group;
  slots: Group[];
  acceptanceBox: Box3;
}

export function createLifeboat(): LifeboatBuild {
  const root = new Group();
  root.name = 'lifeboat';
  const orange = new MeshStandardMaterial({ color: 0x9b6848, roughness: 0.78, flatShading: true });
  const inner = new MeshStandardMaterial({ color: 0x403b35, roughness: 0.9, flatShading: true });
  const sideGeometry = new BoxGeometry(0.35, 0.75, 5.4);
  const left = new Mesh(sideGeometry, orange);
  const right = new Mesh(sideGeometry, orange);
  left.position.x = -1.25;
  right.position.x = 1.25;
  left.rotation.z = -0.16;
  right.rotation.z = 0.16;
  const floor = new Mesh(new BoxGeometry(2.2, 0.25, 4.9), inner);
  floor.position.y = -0.4;
  const bow = new Mesh(new BoxGeometry(2.2, 0.7, 0.35), orange);
  bow.position.z = -2.55;
  const stern = bow.clone();
  stern.position.z = 2.55;
  root.add(left, right, floor, bow, stern);

  const slots = [
    [-0.68, 0, -1.45], [0.68, 0, -1.45], [-0.68, 0, 0], [0.68, 0, 0], [0, 0, 1.45],
  ].map(([x, y, z], index) => {
    const slot = new Group();
    slot.name = `supply-slot-${index + 1}`;
    slot.position.set(x!, y!, z!);
    root.add(slot);
    return slot;
  });

  root.traverse((object) => {
    if (object instanceof Mesh) {
      object.castShadow = true;
      object.receiveShadow = true;
    }
  });

  return {
    root,
    slots,
    acceptanceBox: new Box3(new Vector3(-1.55, -0.8, -2.9), new Vector3(1.55, 1.2, 2.9)),
  };
}
```

- [ ] **Step 7: Verify procedural world builders**

Run: `bun run test -- tests/world.test.ts`

Expected: all 10 parameterized and structural tests PASS.

- [ ] **Step 8: Commit procedural geometry**

```bash
git add src/player/collisions.ts src/world/PropFactory.ts src/world/Ship.ts src/world/Lifeboat.ts tests/world.test.ts
git commit -m "feat: build procedural ship lifeboat and supplies"
```

---

### Task 7: Shader Ocean Renderer

**Files:**
- Modify: `tests/world.test.ts`
- Create: `src/ocean/OceanRenderer.ts`

**Interfaces:**
- Consumes: `DEFAULT_WAVES` and `createWaveUniformPayload(...)`.
- Produces: `OceanRenderer.mesh`, `OceanRenderer.update(...)`, and `OceanRenderer.follow(...)` for `World`.

- [ ] **Step 1: Add a failing ocean renderer test**

Append to `tests/world.test.ts`:

```ts
import { OceanRenderer } from '../src/ocean/OceanRenderer';

it('creates a four-wave subdivided ocean mesh', () => {
  const ocean = new OceanRenderer();
  expect(ocean.mesh.name).toBe('procedural-ocean');
  expect(ocean.mesh.geometry.getAttribute('position').count).toBeGreaterThan(16_000);
  expect(ocean.material.uniforms.uDirections.value).toHaveLength(4);
  ocean.dispose();
});
```

- [ ] **Step 2: Run the focused test and verify red**

Run: `bun run test -- tests/world.test.ts`

Expected: FAIL because `src/ocean/OceanRenderer.ts` does not exist.

- [ ] **Step 3: Implement the shader-driven ocean**

Create `src/ocean/OceanRenderer.ts`:

```ts
import {
  Color,
  Mesh,
  PlaneGeometry,
  ShaderMaterial,
  Vector2,
  Vector3,
  Vector4,
} from 'three';
import { DEFAULT_WAVES, createWaveUniformPayload } from './WaveField';

const vertexShader = `
  uniform float uTime;
  uniform float uAmplitudeScale;
  uniform vec2 uOrigin;
  uniform vec2 uDirections[4];
  uniform vec4 uParameters[4];
  uniform float uPhases[4];
  varying float vHeight;
  varying float vViewDepth;
  varying vec3 vWorldNormal;
  varying vec3 vWorldPosition;

  void main() {
    vec3 displaced = position;
    vec2 worldXZ = position.xz + uOrigin;
    float derivativeX = 0.0;
    float derivativeZ = 0.0;
    float height = 0.0;
    for (int i = 0; i < 4; i++) {
      vec2 direction = normalize(uDirections[i]);
      float amplitude = uParameters[i].x * uAmplitudeScale;
      float waveNumber = 6.28318530718 / uParameters[i].y;
      float theta = waveNumber * dot(direction, worldXZ) + uParameters[i].z * uTime + uPhases[i];
      float waveSin = sin(theta);
      float waveCos = cos(theta);
      height += amplitude * waveSin;
      displaced.x += uParameters[i].w * amplitude * direction.x * waveCos;
      displaced.z += uParameters[i].w * amplitude * direction.y * waveCos;
      derivativeX += amplitude * waveNumber * direction.x * waveCos;
      derivativeZ += amplitude * waveNumber * direction.y * waveCos;
    }
    displaced.y += height;
    vec3 localNormal = normalize(vec3(-derivativeX, 1.0, -derivativeZ));
    vec4 worldPosition = modelMatrix * vec4(displaced, 1.0);
    vHeight = height;
    vViewDepth = length(cameraPosition - worldPosition.xyz);
    vWorldPosition = worldPosition.xyz;
    vWorldNormal = normalize(mat3(modelMatrix) * localNormal);
    gl_Position = projectionMatrix * viewMatrix * worldPosition;
  }
`;

const fragmentShader = `
  uniform vec3 uDeepColor;
  uniform vec3 uShallowColor;
  uniform vec3 uFoamColor;
  uniform vec3 uFogColor;
  uniform float uFogDensity;
  uniform vec3 uLightDirection;
  varying float vHeight;
  varying float vViewDepth;
  varying vec3 vWorldNormal;
  varying vec3 vWorldPosition;

  float orderedDither(vec2 position) {
    vec2 cell = mod(floor(position), 4.0);
    return mod(cell.x + cell.y * 2.0, 4.0) / 255.0;
  }

  void main() {
    float facing = clamp(dot(normalize(vWorldNormal), normalize(uLightDirection)), 0.0, 1.0);
    float crest = smoothstep(0.48, 0.82, vHeight);
    float depthMix = clamp(0.42 + vHeight * 0.25 + facing * 0.25, 0.0, 1.0);
    vec3 color = mix(uDeepColor, uShallowColor, depthMix);
    color = mix(color, uFoamColor, crest * 0.42);
    float fogFactor = 1.0 - exp(-uFogDensity * uFogDensity * vViewDepth * vViewDepth);
    color = mix(color, uFogColor, clamp(fogFactor, 0.0, 1.0));
    color += orderedDither(gl_FragCoord.xy);
    gl_FragColor = vec4(color, 0.98);
  }
`;

export class OceanRenderer {
  readonly material: ShaderMaterial;
  readonly mesh: Mesh<PlaneGeometry, ShaderMaterial>;

  constructor() {
    const payload = createWaveUniformPayload(DEFAULT_WAVES);
    this.material = new ShaderMaterial({
      vertexShader,
      fragmentShader,
      transparent: false,
      uniforms: {
        uTime: { value: 0 },
        uAmplitudeScale: { value: 1 },
        uOrigin: { value: new Vector2() },
        uDirections: { value: payload.directions.map(([x, y]) => new Vector2(x, y)) },
        uParameters: { value: payload.parameters.map(([x, y, z, w]) => new Vector4(x, y, z, w)) },
        uPhases: { value: payload.phases },
        uDeepColor: { value: new Color(0x162c35) },
        uShallowColor: { value: new Color(0x42656a) },
        uFoamColor: { value: new Color(0xb7b7a5) },
        uFogColor: { value: new Color(0x27343b) },
        uFogDensity: { value: 0.018 },
        uLightDirection: { value: new Vector3(-0.4, 0.85, 0.25) },
      },
    });
    const geometry = new PlaneGeometry(180, 180, 128, 128);
    geometry.rotateX(-Math.PI / 2);
    this.mesh = new Mesh(geometry, this.material);
    this.mesh.name = 'procedural-ocean';
    this.mesh.frustumCulled = false;
    this.mesh.receiveShadow = true;
  }

  update(timeSeconds: number, amplitudeScale: number, fogDensity: number): void {
    this.material.uniforms.uTime!.value = timeSeconds;
    this.material.uniforms.uAmplitudeScale!.value = amplitudeScale;
    this.material.uniforms.uFogDensity!.value = fogDensity;
  }

  follow(worldX: number, worldZ: number): void {
    const snappedX = Math.round(worldX / 10) * 10;
    const snappedZ = Math.round(worldZ / 10) * 10;
    this.mesh.position.set(snappedX, 0, snappedZ);
    (this.material.uniforms.uOrigin!.value as Vector2).set(snappedX, snappedZ);
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    this.material.dispose();
  }
}
```

- [ ] **Step 4: Verify the ocean builder and wave contracts**

Run: `bun run test -- tests/world.test.ts tests/WaveField.test.ts`

Expected: all tests PASS.

- [ ] **Step 5: Commit the ocean renderer**

```bash
git add src/ocean/OceanRenderer.ts tests/world.test.ts
git commit -m "feat: render shared-wave procedural ocean"
```

---

### Task 8: Environment and World Assembly

**Files:**
- Modify: `tests/world.test.ts`
- Create: `src/world/Environment.ts`
- Create: `src/world/World.ts`

**Interfaces:**
- Consumes: `ShipBuild`, `LifeboatBuild`, props, `OceanRenderer`, `BoatBuoyancy`, `sampleWaveField`, `SinkingState`, and a Three.js `Scene`.
- Produces: `World.ship`, `World.itemObjects`, `World.colliders`, `World.playerStart`, `World.evacuationPoint`, `World.update(...)`, `World.saveItem(...)`, and `World.dispose()` for `Game`.

- [ ] **Step 1: Add a failing world-assembly test**

Append to `tests/world.test.ts`:

```ts
import { Scene } from 'three';
import { World } from '../src/world/World';

it('assembles one object for every supply and exposes gameplay markers', () => {
  const scene = new Scene();
  const world = new World(scene);
  expect(world.itemObjects.size).toBe(8);
  expect(world.colliders.length).toBeGreaterThanOrEqual(10);
  expect(scene.getObjectByName('sinking-ship')).toBeDefined();
  expect(scene.getObjectByName('lifeboat')).toBeDefined();
  world.dispose();
});
```

- [ ] **Step 2: Run the world test and verify red**

Run: `bun run test -- tests/world.test.ts`

Expected: FAIL because `src/world/World.ts` does not exist.

- [ ] **Step 3: Implement fog, lighting, rain, and alarm response**

Create `src/world/Environment.ts`:

```ts
import {
  BufferAttribute,
  BufferGeometry,
  Color,
  DirectionalLight,
  FogExp2,
  HemisphereLight,
  Points,
  PointsMaterial,
  Scene,
} from 'three';
import type { SinkingState } from '../game/sinking';

export class Environment {
  private readonly rain: Points;
  private readonly positions: Float32Array;
  private readonly keyLight: DirectionalLight;

  constructor(private readonly scene: Scene) {
    scene.background = new Color(0x27343b);
    scene.fog = new FogExp2(0x27343b, 0.018);
    scene.add(new HemisphereLight(0x8fa0a1, 0x182226, 1.2));
    this.keyLight = new DirectionalLight(0xc7c0aa, 2.1);
    this.keyLight.position.set(-12, 18, 8);
    this.keyLight.castShadow = true;
    scene.add(this.keyLight);

    this.positions = new Float32Array(900 * 3);
    for (let index = 0; index < 900; index += 1) {
      this.positions[index * 3] = (Math.random() - 0.5) * 60;
      this.positions[index * 3 + 1] = Math.random() * 30;
      this.positions[index * 3 + 2] = (Math.random() - 0.5) * 60;
    }
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new BufferAttribute(this.positions, 3));
    this.rain = new Points(geometry, new PointsMaterial({ color: 0xa7b3b2, size: 0.045, transparent: true, opacity: 0.42 }));
    this.rain.name = 'rain';
    scene.add(this.rain);
  }

  update(delta: number, sinking: SinkingState, cameraX: number, cameraZ: number, reducedMotion: boolean): void {
    const speed = reducedMotion ? 8 : 15 + sinking.progress * 8;
    for (let index = 0; index < 900; index += 1) {
      const offset = index * 3 + 1;
      this.positions[offset] = (this.positions[offset]! - delta * speed + 30) % 30;
    }
    (this.rain.geometry.getAttribute('position') as BufferAttribute).needsUpdate = true;
    this.rain.position.set(cameraX, 0, cameraZ);
    const fog = this.scene.fog as FogExp2;
    fog.density = 0.018 + sinking.progress * 0.009;
    this.keyLight.intensity = 2.1 - sinking.progress * 0.45;
  }

  dispose(): void {
    this.rain.geometry.dispose();
    (this.rain.material as PointsMaterial).dispose();
    this.scene.remove(this.rain, this.keyLight);
  }
}
```

- [ ] **Step 4: Assemble the complete Three.js world**

Create `src/world/World.ts`:

```ts
import { Box3, Group, Object3D, Scene, Vector3 } from 'three';
import type { ItemId } from '../game/ItemState';
import type { SinkingState } from '../game/sinking';
import { BoatBuoyancy, smoothBoatPose, type BoatPose } from '../ocean/BoatBuoyancy';
import { OceanRenderer } from '../ocean/OceanRenderer';
import { DEFAULT_WAVES, sampleWaveField } from '../ocean/WaveField';
import type { CollisionBox } from '../player/collisions';
import { Environment } from './Environment';
import { createLifeboat } from './Lifeboat';
import { createProp } from './PropFactory';
import { createShip } from './Ship';
import { ITEM_IDS } from '../game/ItemState';

export class World {
  readonly ship: Group;
  readonly lifeboat: Group;
  readonly itemObjects = new Map<ItemId, Group>();
  readonly colliders: CollisionBox[];
  readonly playerStart: Vector3;
  readonly evacuationPoint: Vector3;
  readonly lifeboatAcceptance: Box3;
  private readonly ocean: OceanRenderer;
  private readonly environment: Environment;
  private readonly boatSlots: Group[];
  private readonly buoyancy: BoatBuoyancy;
  private boatPose: BoatPose = { y: 0, pitch: 0, roll: 0, driftX: 0, driftZ: 0 };
  private readonly boatAnchor = new Vector3(6.2, 0.35, -5.8);

  constructor(private readonly scene: Scene) {
    const shipBuild = createShip();
    this.ship = shipBuild.root;
    this.colliders = shipBuild.colliders;
    this.playerStart = shipBuild.playerStart.clone();
    this.evacuationPoint = shipBuild.evacuationPoint.clone();
    scene.add(this.ship);

    ITEM_IDS.forEach((id, index) => {
      const prop = createProp(id);
      prop.position.copy(shipBuild.itemSpawnPoints[index]!);
      prop.rotation.y = index * 0.73;
      this.ship.add(prop);
      this.itemObjects.set(id, prop);
    });

    const boatBuild = createLifeboat();
    this.lifeboat = boatBuild.root;
    this.lifeboat.position.copy(this.boatAnchor);
    this.boatSlots = boatBuild.slots;
    this.lifeboatAcceptance = boatBuild.acceptanceBox;
    scene.add(this.lifeboat);

    this.ocean = new OceanRenderer();
    scene.add(this.ocean.mesh);
    this.environment = new Environment(scene);
    this.buoyancy = new BoatBuoyancy((time, x, z, scale) => sampleWaveField(DEFAULT_WAVES, time, x, z, scale));
  }

  update(time: number, delta: number, sinking: SinkingState, cameraPosition: Vector3, reducedMotion: boolean): void {
    this.ship.position.y = sinking.sinkOffset;
    this.ship.rotation.set(sinking.pitchRadians, 0, sinking.rollRadians);
    this.ocean.update(time, sinking.waveAmplitudeScale, 0.018 + sinking.progress * 0.009);
    this.ocean.follow(cameraPosition.x, cameraPosition.z);
    const target = this.buoyancy.sampleTarget(time, this.boatAnchor.x, this.boatAnchor.z, sinking.waveAmplitudeScale);
    this.boatPose = smoothBoatPose(this.boatPose, target, delta, 7);
    this.lifeboat.position.set(
      this.boatAnchor.x + this.boatPose.driftX,
      this.boatAnchor.y + this.boatPose.y,
      this.boatAnchor.z + this.boatPose.driftZ,
    );
    this.lifeboat.rotation.set(this.boatPose.pitch, 0, -this.boatPose.roll);
    this.environment.update(delta, sinking, cameraPosition.x, cameraPosition.z, reducedMotion);
  }

  saveItem(id: ItemId, slotIndex: number): void {
    const item = this.itemObjects.get(id);
    const slot = this.boatSlots[slotIndex];
    if (!item || !slot) return;
    item.removeFromParent();
    item.position.set(0, 0, 0);
    item.rotation.set(0, slotIndex * 0.5, 0);
    item.scale.setScalar(0.82);
    slot.add(item);
  }

  loseItem(id: ItemId): void {
    this.itemObjects.get(id)?.removeFromParent();
  }

  getInteractiveObjects(): Object3D[] {
    return [...this.itemObjects.values()].filter((object) => object.parent !== null);
  }

  dispose(): void {
    this.ocean.dispose();
    this.environment.dispose();
    this.scene.remove(this.ship, this.lifeboat, this.ocean.mesh);
  }
}
```

- [ ] **Step 5: Verify world assembly and all math tests**

Run: `bun run test`

Expected: all current tests PASS.

- [ ] **Step 6: Commit world assembly**

```bash
git add src/world/Environment.ts src/world/World.ts tests/world.test.ts
git commit -m "feat: assemble storm world and buoyant lifeboat"
```

---

### Task 9: Desktop Input, Collision Resolution, and Player Controller

**Files:**
- Create: `tests/collisions.test.ts`
- Modify: `src/player/collisions.ts`
- Create: `src/input/InputController.ts`
- Create: `src/player/PlayerController.ts`

**Interfaces:**
- Consumes: `CollisionBox[]`, the ship root, player start, a Three.js camera, and DOM input events.
- Produces: `movementAxes(...)`, `resolveLocalMovement(...)`, `InputController`, and `PlayerController.localPosition` for interaction and `Game`.

- [ ] **Step 1: Write failing movement and collision tests**

Create `tests/collisions.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { movementAxes, resolveLocalMovement } from '../src/player/collisions';

describe('player movement helpers', () => {
  it('normalizes diagonal keyboard movement', () => {
    const axes = movementAxes(new Set(['KeyW', 'KeyD']));
    expect(Math.hypot(axes.x, axes.z)).toBeCloseTo(1);
    expect(axes.x).toBeGreaterThan(0);
    expect(axes.z).toBeLessThan(0);
  });

  it('resolves a circle out of a wall box', () => {
    const result = resolveLocalMovement(
      { x: 0, y: 3.7, z: 0 },
      { x: 1.2, y: 3.7, z: 0 },
      0.35,
      [{ minX: 1, maxX: 2, minY: 2, maxY: 5, minZ: -2, maxZ: 2 }],
    );
    expect(result.x).toBeCloseTo(0.65);
    expect(result.z).toBeCloseTo(0);
  });

  it('does not collide with vertically separate boxes', () => {
    const result = resolveLocalMovement(
      { x: 0, y: 3.7, z: 0 },
      { x: 1.2, y: 3.7, z: 0 },
      0.35,
      [{ minX: 1, maxX: 2, minY: 7, maxY: 9, minZ: -2, maxZ: 2 }],
    );
    expect(result.x).toBeCloseTo(1.2);
  });
});
```

- [ ] **Step 2: Run collision tests and verify red**

Run: `bun run test -- tests/collisions.test.ts`

Expected: FAIL because the exported helper functions do not exist.

- [ ] **Step 3: Implement ship-local movement helpers**

Replace `src/player/collisions.ts` with:

```ts
export interface CollisionBox {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  minZ: number;
  maxZ: number;
}

export interface LocalPlayerPosition {
  x: number;
  y: number;
  z: number;
}

export interface MovementAxes {
  x: number;
  z: number;
}

export function movementAxes(pressed: ReadonlySet<string>): MovementAxes {
  const x = Number(pressed.has('KeyD')) - Number(pressed.has('KeyA'));
  const z = Number(pressed.has('KeyS')) - Number(pressed.has('KeyW'));
  const length = Math.hypot(x, z);
  return length > 1 ? { x: x / length, z: z / length } : { x, z };
}

export function resolveLocalMovement(
  current: LocalPlayerPosition,
  desired: LocalPlayerPosition,
  radius: number,
  boxes: readonly CollisionBox[],
): LocalPlayerPosition {
  const result = { ...desired };
  const resolveAxis = (axis: 'x' | 'z'): void => {
    for (const box of boxes) {
      if (result.y < box.minY || result.y > box.maxY) continue;
      const closestX = Math.max(box.minX, Math.min(result.x, box.maxX));
      const closestZ = Math.max(box.minZ, Math.min(result.z, box.maxZ));
      const dx = result.x - closestX;
      const dz = result.z - closestZ;
      if (dx * dx + dz * dz >= radius * radius) continue;

      if (axis === 'x') {
        if (current.x <= box.minX) result.x = box.minX - radius;
        else if (current.x >= box.maxX) result.x = box.maxX + radius;
      } else {
        if (current.z <= box.minZ) result.z = box.minZ - radius;
        else if (current.z >= box.maxZ) result.z = box.maxZ + radius;
      }
    }
  };

  result.z = current.z;
  resolveAxis('x');
  result.z = desired.z;
  resolveAxis('z');
  return result;
}
```

- [ ] **Step 4: Verify collision tests**

Run: `bun run test -- tests/collisions.test.ts`

Expected: 3 tests PASS.

- [ ] **Step 5: Implement keyboard, mouse, and pointer-lock input**

Create `src/input/InputController.ts`:

```ts
import { movementAxes, type MovementAxes } from '../player/collisions';

export class InputController {
  private readonly pressed = new Set<string>();
  private lookX = 0;
  private lookY = 0;
  private interactQueued = false;
  private disposed = false;

  constructor(private readonly canvas: HTMLCanvasElement) {
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('mousemove', this.onMouseMove);
    window.addEventListener('blur', this.clear);
  }

  get movement(): MovementAxes {
    return movementAxes(this.pressed);
  }

  get sprinting(): boolean {
    return this.pressed.has('ShiftLeft') || this.pressed.has('ShiftRight');
  }

  get pointerLocked(): boolean {
    return document.pointerLockElement === this.canvas;
  }

  requestPointerLock(): void {
    void this.canvas.requestPointerLock();
  }

  consumeLook(): { x: number; y: number } {
    const look = { x: this.lookX, y: this.lookY };
    this.lookX = 0;
    this.lookY = 0;
    return look;
  }

  consumeInteract(): boolean {
    const queued = this.interactQueued;
    this.interactQueued = false;
    return queued;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('mousemove', this.onMouseMove);
    window.removeEventListener('blur', this.clear);
  }

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    this.pressed.add(event.code);
    if (event.code === 'KeyE' && !event.repeat) this.interactQueued = true;
  };

  private readonly onKeyUp = (event: KeyboardEvent): void => {
    this.pressed.delete(event.code);
  };

  private readonly onMouseMove = (event: MouseEvent): void => {
    if (!this.pointerLocked) return;
    this.lookX += event.movementX;
    this.lookY += event.movementY;
  };

  private readonly clear = (): void => {
    this.pressed.clear();
    this.lookX = 0;
    this.lookY = 0;
  };
}
```

- [ ] **Step 6: Implement ship-relative first-person control**

Create `src/player/PlayerController.ts`:

```ts
import { Euler, Object3D, PerspectiveCamera, Quaternion, Vector3 } from 'three';
import type { InputController } from '../input/InputController';
import type { CollisionBox, LocalPlayerPosition } from './collisions';
import { resolveLocalMovement } from './collisions';

export class PlayerController {
  readonly localPosition: Vector3;
  private readonly safePosition: Vector3;
  private yaw = Math.PI;
  private pitch = 0;
  private readonly localView = new Quaternion();
  private readonly worldPosition = new Vector3();
  private readonly movement = new Vector3();

  constructor(
    private readonly camera: PerspectiveCamera,
    private readonly ship: Object3D,
    start: Vector3,
    private readonly colliders: readonly CollisionBox[],
    private readonly onFall: () => void,
  ) {
    this.localPosition = start.clone();
    this.safePosition = start.clone();
  }

  update(delta: number, input: InputController, reducedMotionShake = 0): void {
    const look = input.consumeLook();
    this.yaw -= look.x * 0.0018;
    this.pitch = Math.max(-1.35, Math.min(1.35, this.pitch - look.y * 0.0018));

    const axes = input.movement;
    const speed = input.sprinting ? 6.2 : 3.8;
    const sin = Math.sin(this.yaw);
    const cos = Math.cos(this.yaw);
    this.movement.set(
      (axes.x * cos - axes.z * sin) * speed * delta,
      0,
      (axes.x * sin + axes.z * cos) * speed * delta,
    );

    const current: LocalPlayerPosition = { x: this.localPosition.x, y: this.localPosition.y, z: this.localPosition.z };
    const desired: LocalPlayerPosition = {
      x: current.x + this.movement.x,
      y: current.y,
      z: current.z + this.movement.z,
    };
    const resolved = resolveLocalMovement(current, desired, 0.35, this.colliders);
    this.localPosition.set(resolved.x, resolved.y, resolved.z);

    if (Math.abs(this.localPosition.x) < 3.45 && this.localPosition.z > -10.2 && this.localPosition.z < 8.7) {
      this.safePosition.copy(this.localPosition);
    }
    if (Math.abs(this.localPosition.x) > 7 || Math.abs(this.localPosition.z) > 14) {
      this.localPosition.copy(this.safePosition);
      this.onFall();
    }

    this.worldPosition.copy(this.localPosition);
    this.ship.localToWorld(this.worldPosition);
    this.camera.position.copy(this.worldPosition);
    this.localView.setFromEuler(new Euler(this.pitch + reducedMotionShake, this.yaw, 0, 'YXZ'));
    this.camera.quaternion.copy(this.ship.quaternion).multiply(this.localView);
  }

  reset(start: Vector3): void {
    this.localPosition.copy(start);
    this.safePosition.copy(start);
    this.yaw = Math.PI;
    this.pitch = 0;
  }
}
```

- [ ] **Step 7: Run tests and type checking**

Run: `bun run test && bun run typecheck`

Expected: all tests PASS and TypeScript reports no errors.

- [ ] **Step 8: Commit player control**

```bash
git add src/input/InputController.ts src/player/collisions.ts src/player/PlayerController.ts tests/collisions.test.ts
git commit -m "feat: add desktop first-person movement"
```

---

### Task 10: Context Interaction and Carried/Thrown Items

**Files:**
- Create: `tests/interaction.test.ts`
- Create: `src/interaction/InteractionSystem.ts`
- Create: `src/interaction/CarryController.ts`

**Interfaces:**
- Consumes: camera, item objects, lifeboat, `ScavengeSnapshot`, and Three.js scene.
- Produces: `ContextAction`, `chooseContextAction(...)`, `InteractionSystem.update(...)`, `CarryController.pickUp(...)`, `throw(...)`, `drop(...)`, and `update(...)` for `Game`.

- [ ] **Step 1: Write failing contextual-action tests**

Create `tests/interaction.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { chooseContextAction } from '../src/interaction/InteractionSystem';

describe('chooseContextAction', () => {
  it('offers pickup for an item when hands are empty', () => {
    expect(chooseContextAction({ target: 'item', itemId: 'flareGun', carriedItem: null, savedCount: 0, nearEvacuation: false }))
      .toEqual({ type: 'pickUp', itemId: 'flareGun', prompt: 'E — PICK UP FLARE GUN' });
  });

  it('offers a lifeboat throw while carrying', () => {
    expect(chooseContextAction({ target: 'lifeboat', itemId: null, carriedItem: 'ductTape', savedCount: 2, nearEvacuation: false }).type)
      .toBe('throwToBoat');
  });

  it('explains when the lifeboat is full', () => {
    expect(chooseContextAction({ target: 'lifeboat', itemId: null, carriedItem: 'ductTape', savedCount: 5, nearEvacuation: false }).type)
      .toBe('boatFull');
  });

  it('offers evacuation near the marker with empty hands', () => {
    expect(chooseContextAction({ target: 'none', itemId: null, carriedItem: null, savedCount: 4, nearEvacuation: true }).type)
      .toBe('evacuate');
  });
});
```

- [ ] **Step 2: Run interaction tests and verify red**

Run: `bun run test -- tests/interaction.test.ts`

Expected: FAIL because `src/interaction/InteractionSystem.ts` does not exist.

- [ ] **Step 3: Implement contextual selection and center-screen raycasting**

Create `src/interaction/InteractionSystem.ts`:

```ts
import { Mesh, MeshStandardMaterial, Object3D, PerspectiveCamera, Raycaster, Vector2 } from 'three';
import type { ItemId } from '../game/ItemState';

export type RayTarget = 'none' | 'item' | 'lifeboat';
export type ContextAction =
  | { type: 'none'; prompt: '' }
  | { type: 'pickUp'; itemId: ItemId; prompt: string }
  | { type: 'drop'; itemId: ItemId; prompt: string }
  | { type: 'throwToBoat'; itemId: ItemId; prompt: string }
  | { type: 'boatFull'; prompt: string }
  | { type: 'evacuate'; prompt: string };

export interface ContextInput {
  target: RayTarget;
  itemId: ItemId | null;
  carriedItem: ItemId | null;
  savedCount: number;
  nearEvacuation: boolean;
}

const ITEM_LABELS: Record<ItemId, string> = {
  flareGun: 'FLARE GUN', ductTape: 'DUCT TAPE', fishingRod: 'FISHING ROD', baitTin: 'BAIT TIN',
  medicalKit: 'MEDICAL KIT', waterJug: 'WATER JUG', cannedFood: 'CANNED FOOD', flashlight: 'FLASHLIGHT',
};

export function chooseContextAction(input: ContextInput): ContextAction {
  if (input.target === 'lifeboat' && input.carriedItem && input.savedCount >= 5) {
    return { type: 'boatFull', prompt: 'LIFEBOAT FULL — DROP SOMETHING ELSE' };
  }
  if (input.target === 'lifeboat' && input.carriedItem) {
    return { type: 'throwToBoat', itemId: input.carriedItem, prompt: `E — THROW ${ITEM_LABELS[input.carriedItem]} TO LIFEBOAT` };
  }
  if (input.target === 'item' && input.itemId && !input.carriedItem) {
    return { type: 'pickUp', itemId: input.itemId, prompt: `E — PICK UP ${ITEM_LABELS[input.itemId]}` };
  }
  if (input.nearEvacuation && !input.carriedItem) {
    return { type: 'evacuate', prompt: 'E — EVACUATE NOW' };
  }
  if (input.carriedItem) {
    return { type: 'drop', itemId: input.carriedItem, prompt: `E — DROP ${ITEM_LABELS[input.carriedItem]}` };
  }
  return { type: 'none', prompt: '' };
}

function findTaggedAncestor(object: Object3D | null): Object3D | null {
  let current = object;
  while (current) {
    if (current.userData.itemId || current.name === 'lifeboat') return current;
    current = current.parent;
  }
  return null;
}

export class InteractionSystem {
  private readonly raycaster = new Raycaster();
  private readonly center = new Vector2(0, 0);
  private highlighted: Object3D | null = null;

  constructor(private readonly camera: PerspectiveCamera) {
    this.raycaster.far = 3.2;
  }

  update(items: readonly Object3D[], lifeboat: Object3D): { target: RayTarget; itemId: ItemId | null } {
    this.raycaster.setFromCamera(this.center, this.camera);
    const hit = this.raycaster.intersectObjects([...items, lifeboat], true)[0];
    const tagged = findTaggedAncestor(hit?.object ?? null);
    this.setHighlight(tagged?.userData.itemId ? tagged : null);
    if (!tagged) return { target: 'none', itemId: null };
    if (tagged.name === 'lifeboat') return { target: 'lifeboat', itemId: null };
    return { target: 'item', itemId: tagged.userData.itemId as ItemId };
  }

  dispose(): void {
    this.setHighlight(null);
  }

  private setHighlight(next: Object3D | null): void {
    const apply = (root: Object3D | null, active: boolean): void => {
      root?.traverse((object) => {
        if (!(object instanceof Mesh) || !(object.material instanceof MeshStandardMaterial)) return;
        object.material.emissive.set(active ? 0x8b7650 : 0x000000);
        object.material.emissiveIntensity = active ? 0.45 : 0;
      });
    };
    if (next === this.highlighted) return;
    apply(this.highlighted, false);
    this.highlighted = next;
    apply(this.highlighted, true);
  }
}
```

- [ ] **Step 4: Verify contextual-action tests**

Run: `bun run test -- tests/interaction.test.ts`

Expected: 4 tests PASS.

- [ ] **Step 5: Implement carried pose and ballistic throws**

Create `src/interaction/CarryController.ts`:

```ts
import { Box3, Object3D, PerspectiveCamera, Scene, Vector3 } from 'three';
import type { ItemId } from '../game/ItemState';

interface Flight {
  id: ItemId;
  object: Object3D;
  velocity: Vector3;
}

export interface FlightResultHandlers {
  onSaved: (id: ItemId) => void;
  onLost: (id: ItemId) => void;
  onLanded: (id: ItemId) => void;
}

export class CarryController {
  private carried: { id: ItemId; object: Object3D } | null = null;
  private flight: Flight | null = null;
  private readonly direction = new Vector3();
  private readonly worldPosition = new Vector3();

  constructor(private readonly scene: Scene, private readonly camera: PerspectiveCamera) {}

  get busy(): boolean {
    return this.carried !== null || this.flight !== null;
  }

  pickUp(id: ItemId, object: Object3D): boolean {
    if (this.busy) return false;
    this.carried = { id, object };
    this.camera.add(object);
    object.position.set(0.62, -0.48, -1.15);
    object.rotation.set(-0.15, 0.45, 0.08);
    object.scale.setScalar(0.85);
    return true;
  }

  throw(speed = 7.5): ItemId | null {
    if (!this.carried) return null;
    const { id, object } = this.carried;
    object.getWorldPosition(this.worldPosition);
    this.scene.attach(object);
    object.position.copy(this.worldPosition);
    this.camera.getWorldDirection(this.direction);
    this.flight = { id, object, velocity: this.direction.multiplyScalar(speed).add(new Vector3(0, 1.5, 0)) };
    this.carried = null;
    return id;
  }

  drop(): ItemId | null {
    return this.throw(1.2);
  }

  update(
    delta: number,
    lifeboatBoxWorld: Box3,
    waterHeight: (x: number, z: number) => number,
    handlers: FlightResultHandlers,
  ): void {
    if (!this.flight) return;
    const flight = this.flight;
    flight.velocity.y -= 9.81 * delta;
    flight.object.position.addScaledVector(flight.velocity, delta);

    if (lifeboatBoxWorld.containsPoint(flight.object.position)) {
      this.flight = null;
      handlers.onSaved(flight.id);
      return;
    }

    if (flight.object.position.y <= waterHeight(flight.object.position.x, flight.object.position.z) - 0.25) {
      this.flight = null;
      handlers.onLost(flight.id);
      return;
    }

    if (flight.object.position.y <= 2.35 && Math.abs(flight.object.position.x) < 4.2 && Math.abs(flight.object.position.z) < 10.8) {
      flight.object.position.y = 2.35;
      flight.object.scale.setScalar(1);
      this.flight = null;
      handlers.onLanded(flight.id);
    }
  }

  reset(): void {
    this.carried = null;
    this.flight = null;
  }
}
```

- [ ] **Step 6: Run interaction tests and type checking**

Run: `bun run test -- tests/interaction.test.ts && bun run typecheck`

Expected: interaction tests PASS and TypeScript reports no errors.

- [ ] **Step 7: Commit interaction systems**

```bash
git add src/interaction tests/interaction.test.ts
git commit -m "feat: add contextual pickup and throwing"
```

---

### Task 11: Interface, Game Orchestrator, and Playable Loop

**Files:**
- Modify: `tests/ScavengeSession.test.ts`
- Create: `tests/smoke.test.ts`
- Modify: `src/game/ScavengeSession.ts`
- Modify: `src/world/World.ts`
- Create: `src/ui/GameUI.ts`
- Create: `src/styles/main.css`
- Create: `src/Game.ts`
- Create: `src/main.ts`
- Create: `index.html`

**Interfaces:**
- Consumes: every preceding module.
- Produces: a complete start → scavenge → success/failure → replay browser loop and the public `Game` bootstrap class.

- [ ] **Step 1: Add failing fall-penalty and countdown-format tests**

Append to `tests/ScavengeSession.test.ts` inside the `describe` block:

```ts
it('deducts a five-second fall penalty without double-finishing', () => {
  const session = new ScavengeSession();
  session.start();
  session.penalize(5);
  expect(session.snapshot().remainingSeconds).toBe(115);
  session.penalize(500);
  expect(session.snapshot().remainingSeconds).toBe(0);
  expect(session.snapshot().status).toBe('failure');
});
```

Create `tests/smoke.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { ITEM_IDS } from '../src/game/ItemState';
import { formatCountdown } from '../src/ui/GameUI';

describe('demo contracts', () => {
  it('ships exactly eight supply definitions', () => {
    expect(ITEM_IDS).toHaveLength(8);
    expect(new Set(ITEM_IDS).size).toBe(8);
  });

  it.each([
    [120, '02:00'],
    [61, '01:01'],
    [0.1, '00:01'],
    [0, '00:00'],
  ] as const)('formats %s seconds as %s', (seconds, formatted) => {
    expect(formatCountdown(seconds)).toBe(formatted);
  });
});
```

- [ ] **Step 2: Run the focused tests and verify red**

Run: `bun run test -- tests/ScavengeSession.test.ts tests/smoke.test.ts`

Expected: FAIL because `penalize` and `src/ui/GameUI.ts` do not exist.

- [ ] **Step 3: Add the explicit time-penalty API**

Add this public method to `ScavengeSession` immediately after `tick(...)`:

```ts
penalize(seconds: number): void {
  if (this.status !== 'running') return;
  this.remainingSeconds = Math.max(0, this.remainingSeconds - Math.max(0, seconds));
  if (this.remainingSeconds === 0) this.finish('failure');
}
```

- [ ] **Step 4: Implement the DOM interface and countdown formatter**

Create `src/ui/GameUI.ts`:

```ts
import type { ScavengeSnapshot } from '../game/ScavengeSession';
import { gradeForSavedCount } from '../game/scoring';
import type { SinkingState } from '../game/sinking';

export function formatCountdown(seconds: number): string {
  const safe = Math.max(0, Math.ceil(seconds));
  const minutes = Math.floor(safe / 60).toString().padStart(2, '0');
  const remainder = (safe % 60).toString().padStart(2, '0');
  return `${minutes}:${remainder}`;
}

function requireElement<T extends Element>(root: ParentNode, selector: string): T {
  const element = root.querySelector<T>(selector);
  if (!element) throw new Error(`Missing UI element: ${selector}`);
  return element;
}

export class GameUI {
  onStart: () => void = () => undefined;
  onResume: () => void = () => undefined;
  onReplay: () => void = () => undefined;
  private readonly root: HTMLDivElement;
  private readonly startLayer: HTMLElement;
  private readonly pauseLayer: HTMLElement;
  private readonly resultLayer: HTMLElement;
  private readonly timer: HTMLElement;
  private readonly sinking: HTMLElement;
  private readonly capacity: HTMLElement;
  private readonly prompt: HTMLElement;
  private readonly carried: HTMLElement;
  private readonly resultTitle: HTMLElement;
  private readonly resultBody: HTMLElement;
  private readonly resultItems: HTMLElement;

  constructor(mount: HTMLElement) {
    this.root = document.createElement('div');
    this.root.className = 'game-ui';
    this.root.innerHTML = `
      <div class="hud" aria-live="polite">
        <div class="objective"><span class="eyebrow">OBJECTIVE</span><strong>LOAD THE LIFEBOAT</strong></div>
        <div class="timer-block"><span class="eyebrow" data-sinking>SHIP LISTING</span><strong data-timer>02:00</strong></div>
        <div class="capacity"><span class="eyebrow">LIFEBOAT</span><div class="slots" data-capacity aria-label="0 of 5 slots filled"></div></div>
        <div class="crosshair" aria-hidden="true"></div>
        <div class="prompt" data-prompt></div>
        <div class="carried" data-carried></div>
      </div>
      <section class="screen is-visible start-screen" data-start>
        <div class="screen-rule"></div>
        <p class="kicker">A THREE.JS SURVIVAL PROTOTYPE</p>
        <h1>LAST BOAT<br>OUT</h1>
        <p class="lead">The ship has two minutes left. Save what you can, then get to the lifeboat.</p>
        <dl class="controls"><div><dt>MOVE</dt><dd>W A S D</dd></div><div><dt>LOOK</dt><dd>MOUSE</dd></div><div><dt>SPRINT</dt><dd>SHIFT</dd></div><div><dt>ACT</dt><dd>E</dd></div></dl>
        <button type="button" class="primary-action" data-start-button>BEGIN EVACUATION</button>
        <p class="fine-print">Desktop keyboard and mouse required. Click to enable mouse look.</p>
      </section>
      <section class="screen pause-screen" data-pause>
        <p class="kicker">EVACUATION PAUSED</p>
        <h2>Back to the deck?</h2>
        <p class="lead">The countdown is stopped while the mouse is released.</p>
        <button type="button" class="primary-action" data-resume-button>RESUME</button>
      </section>
      <section class="screen result-screen" data-result>
        <p class="kicker">RUN COMPLETE</p>
        <h2 data-result-title></h2>
        <p class="lead" data-result-body></p>
        <p class="result-items" data-result-items></p>
        <button type="button" class="primary-action" data-replay-button>TRY ANOTHER ROUTE</button>
      </section>
    `;
    mount.append(this.root);
    this.startLayer = requireElement(this.root, '[data-start]');
    this.pauseLayer = requireElement(this.root, '[data-pause]');
    this.resultLayer = requireElement(this.root, '[data-result]');
    this.timer = requireElement(this.root, '[data-timer]');
    this.sinking = requireElement(this.root, '[data-sinking]');
    this.capacity = requireElement(this.root, '[data-capacity]');
    this.prompt = requireElement(this.root, '[data-prompt]');
    this.carried = requireElement(this.root, '[data-carried]');
    this.resultTitle = requireElement(this.root, '[data-result-title]');
    this.resultBody = requireElement(this.root, '[data-result-body]');
    this.resultItems = requireElement(this.root, '[data-result-items]');
    requireElement<HTMLButtonElement>(this.root, '[data-start-button]').addEventListener('click', () => this.onStart());
    requireElement<HTMLButtonElement>(this.root, '[data-resume-button]').addEventListener('click', () => this.onResume());
    requireElement<HTMLButtonElement>(this.root, '[data-replay-button]').addEventListener('click', () => this.onReplay());
    this.renderSlots(0);
  }

  hideStart(): void {
    this.startLayer.classList.remove('is-visible');
  }

  setPaused(paused: boolean): void {
    this.pauseLayer.classList.toggle('is-visible', paused);
  }

  setPrompt(text: string): void {
    this.prompt.textContent = text;
    this.prompt.classList.toggle('is-visible', text.length > 0);
  }

  render(snapshot: ScavengeSnapshot, sinking: SinkingState): void {
    this.timer.textContent = formatCountdown(snapshot.remainingSeconds);
    this.timer.classList.toggle('is-critical', snapshot.remainingSeconds <= 30);
    this.sinking.textContent = sinking.progress >= 0.75 ? 'FINAL SUBMERSION' : sinking.progress >= 0.4 ? 'DECK TAKING WATER' : 'SHIP LISTING';
    this.carried.textContent = snapshot.carriedItem ? `CARRYING — ${snapshot.carriedItem.replace(/([A-Z])/g, ' $1').toUpperCase()}` : '';
    this.renderSlots(snapshot.savedCount);
  }

  showResult(snapshot: ScavengeSnapshot): void {
    const grade = gradeForSavedCount(snapshot.savedCount);
    const success = snapshot.status === 'success';
    this.resultTitle.textContent = success ? grade.label : 'Taken by the Sea';
    this.resultBody.textContent = success ? grade.description : 'The deck disappeared before you reached the lifeboat.';
    this.resultItems.textContent = `${snapshot.savedCount} / 5 SUPPLY SLOTS FILLED`;
    this.pauseLayer.classList.remove('is-visible');
    this.resultLayer.classList.add('is-visible');
  }

  showCompatibilityError(message: string): void {
    this.startLayer.classList.add('is-visible');
    requireElement<HTMLElement>(this.startLayer, '.lead').textContent = message;
    requireElement<HTMLButtonElement>(this.startLayer, '[data-start-button]').hidden = true;
  }

  private renderSlots(savedCount: number): void {
    this.capacity.innerHTML = Array.from({ length: 5 }, (_, index) => `<span class="slot${index < savedCount ? ' is-filled' : ''}"></span>`).join('');
    this.capacity.setAttribute('aria-label', `${savedCount} of 5 slots filled`);
  }
}
```

- [ ] **Step 5: Add the fullscreen document and UI styling**

Create `index.html`:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="theme-color" content="#1b292f">
    <meta name="description" content="Last Boat Out — a first-person Three.js sinking-ship scavenging demo.">
    <title>Last Boat Out</title>
  </head>
  <body>
    <main id="app" aria-label="Last Boat Out game"></main>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
```

Create `src/styles/main.css`:

```css
:root {
  color-scheme: dark;
  font-family: "Trebuchet MS", "Arial Narrow", system-ui, sans-serif;
  color: #ece8dc;
  background: #1b292f;
  font-synthesis: none;
}

* { box-sizing: border-box; }
html, body, #app { width: 100%; min-height: 100%; margin: 0; overflow: hidden; }
body { min-height: 100dvh; background: #1b292f; }
button { font: inherit; }
canvas { position: fixed; inset: 0; width: 100%; height: 100%; display: block; }
.game-ui { position: fixed; inset: 0; pointer-events: none; }
.hud { position: absolute; inset: 0; padding: 24px 28px; font-family: ui-monospace, "Cascadia Mono", monospace; text-shadow: 0 2px 8px #10191dbf; }
.objective, .capacity, .timer-block { position: absolute; top: 24px; display: grid; gap: 6px; }
.objective { left: 28px; }
.capacity { right: 28px; justify-items: end; }
.timer-block { left: 50%; transform: translateX(-50%); justify-items: center; }
.eyebrow, .kicker { color: #a8a797; font-size: 0.68rem; letter-spacing: 0.18em; text-transform: uppercase; }
.timer-block strong { font-size: clamp(1.8rem, 4vw, 3.1rem); letter-spacing: -0.05em; line-height: 1; font-variant-numeric: tabular-nums; }
.timer-block strong.is-critical { color: #bd7563; animation: timer-pulse 0.8s steps(2, end) infinite; }
.slots { display: grid; grid-template-columns: repeat(5, 18px); gap: 5px; }
.slot { width: 18px; height: 8px; border: 1px solid #b9b5a7; background: #1d292db3; transform: skewX(-12deg); }
.slot.is-filled { background: #b08968; box-shadow: inset 0 1px #d2c0a7; }
.crosshair { position: absolute; left: 50%; top: 50%; width: 14px; height: 14px; transform: translate(-50%, -50%); border: 1px solid #d7d0bbcc; border-radius: 50%; }
.crosshair::before, .crosshair::after { content: ""; position: absolute; background: #d7d0bbcc; }
.crosshair::before { width: 1px; height: 22px; left: 6px; top: -5px; }
.crosshair::after { width: 22px; height: 1px; top: 6px; left: -5px; }
.prompt { position: absolute; left: 50%; bottom: 86px; transform: translateX(-50%) translateY(8px); padding: 10px 14px; border: 1px solid #d0c9b55c; background: #172227d9; color: #eee7d4; opacity: 0; transition: opacity 160ms ease, transform 160ms ease; }
.prompt.is-visible { opacity: 1; transform: translateX(-50%) translateY(0); }
.carried { position: absolute; left: 28px; bottom: 28px; color: #c9c4b5; font-size: 0.72rem; letter-spacing: 0.12em; }
.screen { position: absolute; inset: 0; display: grid; align-content: center; justify-items: start; gap: 18px; padding: clamp(28px, 7vw, 96px); background: linear-gradient(90deg, #172227fa 0 36%, #172227d9 51%, #17222733 78%, transparent); opacity: 0; visibility: hidden; pointer-events: none; transition: opacity 260ms ease, visibility 260ms ease; }
.screen.is-visible { opacity: 1; visibility: visible; pointer-events: auto; }
.screen-rule { width: 68px; height: 4px; background: #9c5848; }
.screen h1, .screen h2 { max-width: 680px; margin: 0; color: #eee9da; font-size: clamp(3rem, 8vw, 6.4rem); font-weight: 700; letter-spacing: -0.075em; line-height: 0.82; }
.screen h2 { font-size: clamp(2.5rem, 6vw, 5rem); }
.lead { max-width: 52ch; margin: 0; color: #bbb9ad; font-size: clamp(1rem, 1.7vw, 1.2rem); line-height: 1.65; }
.controls { display: grid; grid-template-columns: repeat(4, minmax(90px, auto)); gap: 1px; margin: 8px 0; }
.controls div { padding: 12px 16px; border-top: 1px solid #aaa59466; }
.controls dt { color: #8f9189; font: 0.64rem ui-monospace, monospace; letter-spacing: 0.16em; }
.controls dd { margin: 7px 0 0; color: #ded8c8; font: 0.86rem ui-monospace, monospace; }
.primary-action { min-width: 230px; padding: 14px 18px; border: 1px solid #b88772; background: #914f42; color: #f3ecdc; font-weight: 700; letter-spacing: 0.08em; cursor: pointer; transition: transform 160ms ease, background 160ms ease; }
.primary-action:hover { background: #a45d4d; transform: translateY(-2px); }
.primary-action:active { transform: translateY(1px) scale(0.99); }
.primary-action:focus-visible { outline: 3px solid #d7c8a7; outline-offset: 4px; }
.fine-print, .result-items { color: #8f9189; font: 0.72rem ui-monospace, monospace; letter-spacing: 0.08em; }
.pause-screen, .result-screen { background: #172227f2; justify-items: center; text-align: center; }
@keyframes timer-pulse { 50% { opacity: 0.58; } }
@media (max-width: 820px) {
  .hud { padding: 16px; }
  .objective { left: 16px; top: 16px; }
  .capacity { right: 16px; top: 16px; }
  .timer-block { top: 72px; }
  .controls { grid-template-columns: repeat(2, minmax(90px, auto)); }
  .screen { align-content: end; background: linear-gradient(0deg, #172227fa 0 58%, #17222773 82%, transparent); }
}
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { animation-duration: 1ms !important; transition-duration: 1ms !important; }
}
```

- [ ] **Step 6: Add landing support to `World`**

Add this method after `loseItem(...)` in `src/world/World.ts`:

```ts
landItem(id: ItemId): void {
  const item = this.itemObjects.get(id);
  if (!item) return;
  this.ship.attach(item);
  item.scale.setScalar(1);
}
```

- [ ] **Step 7: Implement the game orchestrator**

Create `src/Game.ts`:

```ts
import {
  Box3,
  Clock,
  PCFSoftShadowMap,
  PerspectiveCamera,
  Scene,
  SRGBColorSpace,
  Vector3,
  WebGLRenderer,
} from 'three';
import { ScavengeSession } from './game/ScavengeSession';
import { getSinkingState } from './game/sinking';
import { InputController } from './input/InputController';
import { CarryController } from './interaction/CarryController';
import { chooseContextAction, InteractionSystem, type ContextAction } from './interaction/InteractionSystem';
import { DEFAULT_WAVES, sampleWaveField } from './ocean/WaveField';
import { PlayerController } from './player/PlayerController';
import { GameUI } from './ui/GameUI';
import { World } from './world/World';

const RUN_SECONDS = 120;

export class Game {
  private readonly renderer: WebGLRenderer;
  private readonly scene = new Scene();
  private readonly camera = new PerspectiveCamera(65, 1, 0.08, 220);
  private readonly clock = new Clock();
  private readonly session = new ScavengeSession();
  private readonly world: World;
  private readonly input: InputController;
  private readonly player: PlayerController;
  private readonly interaction: InteractionSystem;
  private readonly carry: CarryController;
  private readonly ui: GameUI;
  private readonly reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  private animationFrame = 0;
  private elapsed = 0;
  private ended = false;
  private contextAction: ContextAction = { type: 'none', prompt: '' };

  constructor(private readonly mount: HTMLElement) {
    this.renderer = new WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.outputColorSpace = SRGBColorSpace;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = PCFSoftShadowMap;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.mount.prepend(this.renderer.domElement);
    this.scene.add(this.camera);

    this.ui = new GameUI(mount);
    this.world = new World(this.scene);
    this.input = new InputController(this.renderer.domElement);
    this.player = new PlayerController(this.camera, this.world.ship, this.world.playerStart, this.world.colliders, () => {
      this.session.penalize(5);
    });
    this.interaction = new InteractionSystem(this.camera);
    this.carry = new CarryController(this.scene, this.camera);

    this.ui.onStart = () => this.input.requestPointerLock();
    this.ui.onResume = () => this.input.requestPointerLock();
    this.ui.onReplay = () => window.location.reload();
    window.addEventListener('resize', this.onResize);
    document.addEventListener('pointerlockchange', this.onPointerLockChange);
    document.addEventListener('visibilitychange', this.onVisibilityChange);
    this.onResize();
  }

  start(): void {
    this.clock.start();
    this.animationFrame = requestAnimationFrame(this.animate);
  }

  dispose(): void {
    cancelAnimationFrame(this.animationFrame);
    window.removeEventListener('resize', this.onResize);
    document.removeEventListener('pointerlockchange', this.onPointerLockChange);
    document.removeEventListener('visibilitychange', this.onVisibilityChange);
    this.input.dispose();
    this.interaction.dispose();
    this.world.dispose();
    this.renderer.dispose();
  }

  private readonly animate = (): void => {
    this.animationFrame = requestAnimationFrame(this.animate);
    const delta = Math.min(this.clock.getDelta(), 0.05);
    const before = this.session.snapshot();
    const active = before.status === 'running' && this.input.pointerLocked && !document.hidden;
    if (active) {
      this.session.tick(delta);
      this.elapsed = RUN_SECONDS - this.session.snapshot().remainingSeconds;
    }

    const snapshot = this.session.snapshot();
    const sinking = getSinkingState(this.elapsed, RUN_SECONDS);
    this.world.update(this.elapsed, delta, sinking, this.camera.position, this.reducedMotion.matches);
    if (active) {
      const shake = this.reducedMotion.matches ? 0 : Math.sin(this.elapsed * 37) * sinking.cameraShake;
      this.player.update(delta, this.input, shake);
      this.updateInteraction(snapshot.savedCount);
      this.updateFlight(delta, sinking.waveAmplitudeScale);
    } else {
      this.input.consumeLook();
    }

    const next = this.session.snapshot();
    this.ui.render(next, sinking);
    this.ui.setPrompt(active ? this.contextAction.prompt : '');
    if ((next.status === 'success' || next.status === 'failure') && !this.ended) {
      this.ended = true;
      if (document.pointerLockElement) document.exitPointerLock();
      this.ui.showResult(next);
    }
    this.renderer.render(this.scene, this.camera);
  };

  private updateInteraction(savedCount: number): void {
    const snapshot = this.session.snapshot();
    const availableItems = [...this.world.itemObjects.entries()]
      .filter(([id]) => snapshot.items[id] === 'available')
      .map(([, object]) => object);
    const target = this.interaction.update(availableItems, this.world.lifeboat);
    const distanceToEvacuation = this.player.localPosition.distanceTo(this.world.evacuationPoint);
    this.contextAction = chooseContextAction({
      ...target,
      carriedItem: snapshot.carriedItem,
      savedCount,
      nearEvacuation: distanceToEvacuation <= 1.7,
    });
    if (this.input.consumeInteract()) this.performAction(this.contextAction);
  }

  private performAction(action: ContextAction): void {
    if (action.type === 'pickUp') {
      const object = this.world.itemObjects.get(action.itemId);
      if (object && this.session.pickUp(action.itemId)) this.carry.pickUp(action.itemId, object);
    } else if (action.type === 'throwToBoat') {
      this.carry.throw();
    } else if (action.type === 'drop') {
      this.carry.drop();
    } else if (action.type === 'evacuate') {
      this.session.evacuate();
    }
  }

  private updateFlight(delta: number, amplitudeScale: number): void {
    this.world.lifeboat.updateMatrixWorld(true);
    const boatBox = this.world.lifeboatAcceptance.clone().applyMatrix4(this.world.lifeboat.matrixWorld);
    this.carry.update(
      delta,
      boatBox,
      (x, z) => sampleWaveField(DEFAULT_WAVES, this.elapsed, x, z, amplitudeScale).height,
      {
        onSaved: (id) => {
          if (!this.session.saveCarried()) return;
          this.world.saveItem(id, this.session.snapshot().savedCount - 1);
        },
        onLost: (id) => {
          this.session.loseCarried();
          this.world.loseItem(id);
        },
        onLanded: (id) => {
          this.session.dropCarried();
          this.world.landItem(id);
        },
      },
    );
  }

  private readonly onPointerLockChange = (): void => {
    const locked = this.input.pointerLocked;
    const status = this.session.snapshot().status;
    if (locked && status === 'idle') {
      this.session.start();
      this.ui.hideStart();
    } else if (locked && status === 'paused') {
      this.session.resume();
      this.ui.setPaused(false);
    } else if (!locked && status === 'running') {
      this.session.pause();
      this.ui.setPaused(true);
    }
  };

  private readonly onVisibilityChange = (): void => {
    if (document.hidden && this.session.snapshot().status === 'running') {
      this.session.pause();
      this.ui.setPaused(true);
      if (document.pointerLockElement) document.exitPointerLock();
    }
  };

  private readonly onResize = (): void => {
    const width = window.innerWidth;
    const height = window.innerHeight;
    this.camera.aspect = width / Math.max(1, height);
    this.camera.updateProjectionMatrix();
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(width, height, false);
  };
}
```

- [ ] **Step 8: Add the guarded bootstrap**

Create `src/main.ts`:

```ts
import './styles/main.css';
import { Game } from './Game';

const mount = document.querySelector<HTMLElement>('#app');
if (!mount) throw new Error('Missing #app mount element');

try {
  const game = new Game(mount);
  game.start();
} catch (error) {
  const message = error instanceof Error ? error.message : 'Unknown WebGL initialization error';
  mount.innerHTML = `
    <section class="screen is-visible pause-screen">
      <p class="kicker">WEBGL UNAVAILABLE</p>
      <h1>Unable to launch</h1>
      <p class="lead">This demo needs WebGL 2 in a current desktop browser.</p>
      <p class="fine-print">${message.replace(/[<>&]/g, '')}</p>
    </section>
  `;
}
```

- [ ] **Step 9: Verify unit tests, types, and production build**

Run: `bun run test && bun run typecheck && bun run build`

Expected: all tests PASS, TypeScript reports no errors, and Vite creates `dist/`.

- [ ] **Step 10: Run the local demo and verify the critical loop**

Run: `bun run dev -- --host 127.0.0.1`

Verify in a desktop browser:

1. Start screen appears instead of a blank canvas.
2. Clicking Begin Evacuation obtains pointer lock and starts at `02:00`.
3. `WASD`, mouse, and sprint respond.
4. `E` picks up one item and rejects a second while carrying.
5. Aimed throws can enter the lifeboat and fill a slot.
6. Escape pauses without reducing the timer.
7. Evacuating shows a success result; waiting to zero shows failure.

- [ ] **Step 11: Commit the playable loop**

```bash
git add index.html src tests/ScavengeSession.test.ts tests/smoke.test.ts
git commit -m "feat: wire playable first-person evacuation loop"
```

---

### Task 12: Replay Variation, Storm Polish, Documentation, and Final QA

**Files:**
- Modify: `tests/world.test.ts`
- Modify: `src/world/Ship.ts`
- Modify: `src/world/World.ts`
- Modify: `src/world/Environment.ts`
- Modify: `src/ui/GameUI.ts`
- Create: `README.md`

**Interfaces:**
- Consumes: the complete playable loop.
- Produces: authored spawn variation, visible alarm escalation, rain/spray/cloud storm layers, named saved-item results, user documentation, and a verified delivery build.

- [ ] **Step 1: Add a failing deterministic spawn-order test**

Add `selectSpawnPoints` to the import from `src/world/Ship` in `tests/world.test.ts`, then append:

```ts
it('selects every authored spawn point exactly once', () => {
  const points = createShip().itemSpawnPoints;
  const values = [0.12, 0.81, 0.34, 0.67, 0.05, 0.92, 0.48];
  let index = 0;
  const selected = selectSpawnPoints(points, () => values[index++] ?? 0.5);
  expect(selected).toHaveLength(8);
  expect(new Set(selected.map((point) => `${point.x},${point.y},${point.z}`)).size).toBe(8);
});
```

- [ ] **Step 2: Run the world test and verify red**

Run: `bun run test -- tests/world.test.ts`

Expected: FAIL because `selectSpawnPoints` is not exported.

- [ ] **Step 3: Add authored spawn shuffling and name the alarm beacon**

Add this function before `createShip()` in `src/world/Ship.ts`:

```ts
export function selectSpawnPoints(points: readonly Vector3[], random: () => number = Math.random): Vector3[] {
  const selected = points.map((point) => point.clone());
  for (let index = selected.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.max(0, Math.min(0.999999, random())) * (index + 1));
    [selected[index], selected[swapIndex]] = [selected[swapIndex]!, selected[index]!];
  }
  return selected;
}
```

Replace the direct alarm-block addition in `createShip()` with:

```ts
const alarmBeacon = block([0.7, 0.7, 0.7], [-2.8, 2.55, -6.5], alarmMaterial);
alarmBeacon.name = 'alarm-beacon';
root.add(alarmBeacon);
```

Remove the previous unnamed alarm block at the same position.

- [ ] **Step 4: Use randomized authored markers and animate alarm intensity**

Change the `Ship` import in `src/world/World.ts` to:

```ts
import { createShip, selectSpawnPoints } from './Ship';
```

Immediately before `ITEM_IDS.forEach(...)`, add:

```ts
const selectedSpawnPoints = selectSpawnPoints(shipBuild.itemSpawnPoints);
```

Inside the item loop, replace the position assignment with:

```ts
prop.position.copy(selectedSpawnPoints[index]!);
```

Add `Mesh` and `MeshStandardMaterial` to the Three.js imports in `World.ts`, then add this code near the end of `update(...)`:

```ts
const beacon = this.ship.getObjectByName('alarm-beacon');
if (beacon instanceof Mesh && beacon.material instanceof MeshStandardMaterial) {
  const pulse = 0.5 + 0.5 * Math.sin(time * Math.PI * 2 * sinking.alarmRate);
  beacon.material.emissiveIntensity = 0.25 + pulse * 1.35;
}
```

- [ ] **Step 5: Extend the environment with spray and moving cloud bands**

Replace `src/world/Environment.ts` with:

```ts
import {
  BufferAttribute,
  BufferGeometry,
  Color,
  DirectionalLight,
  FogExp2,
  Group,
  HemisphereLight,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  Points,
  PointsMaterial,
  Scene,
} from 'three';
import type { SinkingState } from '../game/sinking';

function particleField(count: number, spread: number, height: number): { points: Points; positions: Float32Array } {
  const positions = new Float32Array(count * 3);
  for (let index = 0; index < count; index += 1) {
    positions[index * 3] = (Math.random() - 0.5) * spread;
    positions[index * 3 + 1] = Math.random() * height;
    positions[index * 3 + 2] = (Math.random() - 0.5) * spread;
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(positions, 3));
  return { points: new Points(geometry), positions };
}

export class Environment {
  private readonly rain: Points;
  private readonly rainPositions: Float32Array;
  private readonly spray: Points;
  private readonly sprayPositions: Float32Array;
  private readonly clouds = new Group();
  private readonly keyLight: DirectionalLight;

  constructor(private readonly scene: Scene) {
    scene.background = new Color(0x27343b);
    scene.fog = new FogExp2(0x27343b, 0.018);
    scene.add(new HemisphereLight(0x8fa0a1, 0x182226, 1.2));
    this.keyLight = new DirectionalLight(0xc7c0aa, 2.1);
    this.keyLight.position.set(-12, 18, 8);
    this.keyLight.castShadow = true;
    scene.add(this.keyLight);

    const rainField = particleField(900, 60, 30);
    this.rain = rainField.points;
    this.rainPositions = rainField.positions;
    this.rain.material = new PointsMaterial({ color: 0xa7b3b2, size: 0.045, transparent: true, opacity: 0.42 });
    this.rain.name = 'rain';
    scene.add(this.rain);

    const sprayField = particleField(220, 18, 2.2);
    this.spray = sprayField.points;
    this.sprayPositions = sprayField.positions;
    this.spray.material = new PointsMaterial({ color: 0xc0c5bc, size: 0.09, transparent: true, opacity: 0.28 });
    this.spray.name = 'sea-spray';
    scene.add(this.spray);

    const cloudMaterial = new MeshBasicMaterial({ color: 0x4b565a, transparent: true, opacity: 0.38, depthWrite: false });
    for (let index = 0; index < 7; index += 1) {
      const cloud = new Mesh(new PlaneGeometry(26 + index * 3, 5 + (index % 3) * 2), cloudMaterial.clone());
      cloud.position.set(-60 + index * 20, 22 + (index % 2) * 4, -42 - (index % 3) * 12);
      cloud.rotation.x = -0.22;
      this.clouds.add(cloud);
    }
    this.clouds.name = 'storm-clouds';
    scene.add(this.clouds);
  }

  update(delta: number, sinking: SinkingState, cameraX: number, cameraZ: number, reducedMotion: boolean): void {
    const rainSpeed = reducedMotion ? 8 : 15 + sinking.progress * 8;
    for (let index = 0; index < 900; index += 1) {
      const offset = index * 3 + 1;
      this.rainPositions[offset] = (this.rainPositions[offset]! - delta * rainSpeed + 30) % 30;
    }
    (this.rain.geometry.getAttribute('position') as BufferAttribute).needsUpdate = true;
    this.rain.position.set(cameraX, 0, cameraZ);

    const spraySpeed = reducedMotion ? 0.5 : 1.3 + sinking.progress;
    for (let index = 0; index < 220; index += 1) {
      const yOffset = index * 3 + 1;
      this.sprayPositions[yOffset] = (this.sprayPositions[yOffset]! + delta * spraySpeed) % 2.2;
    }
    (this.spray.geometry.getAttribute('position') as BufferAttribute).needsUpdate = true;
    this.spray.position.set(4.5, 0, -5.8);
    this.clouds.position.x = ((this.clouds.position.x + delta * (reducedMotion ? 0.3 : 0.9) + 70) % 140) - 70;

    const fog = this.scene.fog as FogExp2;
    fog.density = 0.018 + sinking.progress * 0.009;
    this.keyLight.intensity = 2.1 - sinking.progress * 0.45;
  }

  dispose(): void {
    this.rain.geometry.dispose();
    (this.rain.material as PointsMaterial).dispose();
    this.spray.geometry.dispose();
    (this.spray.material as PointsMaterial).dispose();
    this.clouds.traverse((object) => {
      if (!(object instanceof Mesh)) return;
      object.geometry.dispose();
      if (object.material instanceof MeshBasicMaterial) object.material.dispose();
    });
    this.scene.remove(this.rain, this.spray, this.clouds, this.keyLight);
  }
}
```

- [ ] **Step 6: List the actual saved supplies on the result screen**

In `GameUI.showResult(...)`, replace the `resultItems.textContent` assignment with:

```ts
const savedNames = Object.entries(snapshot.items)
  .filter(([, status]) => status === 'saved')
  .map(([id]) => id.replace(/([A-Z])/g, ' $1').trim().toUpperCase());
this.resultItems.textContent = savedNames.length > 0
  ? `TIME ${formatCountdown(120 - snapshot.remainingSeconds)} — ${snapshot.savedCount} / 5 — ${savedNames.join(' · ')}`
  : `TIME ${formatCountdown(120 - snapshot.remainingSeconds)} — 0 / 5 — NO SUPPLIES SAVED`;
```

- [ ] **Step 7: Verify tests, types, and production build after polish**

Run: `bun run test && bun run typecheck && bun run build`

Expected: all tests PASS, TypeScript reports no errors, and Vite builds `dist/`.

- [ ] **Step 8: Write the user-facing README**

Create `README.md`:

````markdown
# Last Boat Out

A desktop-browser first-person scavenging demo inspired by the opening pressure of *Don't Sleep With The Fishes*. Built from scratch with TypeScript and Three.js using original procedural geometry and shaders.

## Run

```bash
bun install
bun run dev
```

Open the local URL printed by Vite, click **Begin Evacuation**, and allow pointer lock.

## Controls

| Input | Action |
|---|---|
| `WASD` | Move |
| Mouse | Look |
| `Shift` | Sprint |
| `E` | Pick up, drop, throw, or evacuate |
| `Escape` | Pause and release the mouse |

## Objective

The ship sinks in two minutes. Search the cabin and upper deck, carry supplies one at a time, throw up to five into the lifeboat, and reach the evacuation marker before time expires.

## Commands

```bash
bun run dev
bun run test
bun run typecheck
bun run build
bun run preview
```

## Architecture

- `src/game` — timer, legal item states, scoring, and sinking progression.
- `src/ocean` — shared four-wave CPU field, ocean shader, and lifeboat buoyancy.
- `src/world` — procedural ship, props, boat, weather, and scene assembly.
- `src/player` and `src/input` — pointer-lock controls and ship-local collision.
- `src/interaction` — raycast prompts, carrying, drops, and throws.
- `src/ui` — DOM HUD, pause, compatibility, and result layers.

The ocean mesh and lifeboat use the same wave parameters. The shader renders the surface while CPU samples at bow, stern, port, and starboard produce lifeboat heave, pitch, and roll.

## Delivery

`bun run build` creates the static `dist/` directory. Deploy that directory to any static host.

## Roadmap

- Crewmate selection and individual modifiers.
- Daytime lifeboat actions and resources.
- Data-driven night interruptions and item counters.
- Branching survival endings.
- Additional content, audio, accessibility settings, and saves.

Those systems are documented as future milestones and are not present in this demo.
````

- [ ] **Step 9: Run full manual browser QA**

Use current Chrome and Firefox. Check each item and record pass/fail in the task notes:

1. Start, pause, resume, failure, success, and replay screens all render correctly.
2. Pointer lock starts only from an explicit button action.
3. Tab switching and `Escape` pause the timer immediately.
4. Movement cannot cross cabin walls, props, or rail colliders.
5. Falling outside bounds returns to the last safe position and removes five seconds.
6. Each of the eight supply silhouettes is recognizable and targetable.
7. Exactly one item can be carried and exactly five can be saved.
8. Missed throws land on deck or become lost in the ocean.
9. A sixth boat throw is rejected with a clear prompt.
10. Early evacuation, last-second evacuation, and timeout failure resolve once.
11. The ship list, sink offset, fog, alarm, rain, spray, and cloud motion escalate.
12. Lifeboat heave, pitch, and roll remain visually aligned with the ocean.
13. Reduced-motion mode removes camera shake and slows weather effects.
14. Layout remains readable at 1280×720, 1440×900, and 1920×1080.
15. Browser console has no uncaught errors or recurring warnings.

- [ ] **Step 10: Run Superpowers verification before completion**

Invoke `superpowers:verification-before-completion`, then run fresh commands:

```bash
bun run test
bun run typecheck
bun run build
git diff --check
git status --short
```

Expected:

- Vitest reports every test passing.
- TypeScript exits with code `0` and no diagnostics.
- Vite creates a production bundle without errors.
- `git diff --check` prints nothing.
- `git status --short` lists only the intended Task 12 files before commit.

- [ ] **Step 11: Commit the verified demo**

```bash
git add README.md src/world/Ship.ts src/world/World.ts src/world/Environment.ts src/ui/GameUI.ts tests/world.test.ts
git commit -m "feat: polish and document evacuation demo"
```

---

## Final Acceptance Checklist

- [ ] Full automated suite passes from a clean checkout.
- [ ] Strict TypeScript checking passes.
- [ ] Production build succeeds.
- [ ] Chrome and Firefox complete-run QA passes.
- [ ] Ocean and lifeboat motion remain synchronized.
- [ ] Both ending paths work and commit once.
- [ ] Eight supplies and five slots are enforced.
- [ ] Pointer-lock loss and hidden-tab pause work.
- [ ] Reduced-motion behavior works.
- [ ] README matches actual commands and controls.
- [ ] No roadmap-only runtime systems were added.

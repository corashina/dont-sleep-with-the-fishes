# Survival Lifeboat Visual Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a survival-only lifeboat that is approximately 20 percent larger, rounded, procedurally weathered, fitted with two paddles, and arranged so all recovered props remain separated and readable from the seated player view.

**Architecture:** Keep the scavenging `Lifeboat` and index-based `BoatStorage` untouched. Add three focused survival modules: one for stable type-aware item transforms, one for deterministic GPU textures, and one for the enhanced procedural hull; then make `BoatWorld` consume those modules while retaining its existing rules, cues, interactions, wave motion, lighting, and lifecycle.

**Tech Stack:** TypeScript 5.9, Three.js 0.180, Vite 7, Vitest 3, Bun

## Global Constraints

- Only the survival phase uses the enhanced boat; scavenging geometry, storage transforms, acceptance bounds, and behavior remain unchanged.
- The survival hull must be 18–22 percent wider and longer than the scavenging hull's corresponding extents.
- Use deterministic procedural data textures only; add no downloaded assets, image files, runtime network requests, or attribution entries.
- Add two full decorative paddles outside the port and starboard gunwales; do not add rowing or paddle interaction.
- Map items by item type and instance ordinal, never by saved-array index; absent items leave stable empty positions.
- Measured item envelopes include at least 0.05 world units of horizontal clearance and may not intersect at maximum inventory.
- Visible item-anchor centers stay at least 40 CSS pixels apart at the base camera orientation at 1280×720 and no closer at 1920×1080.
- Keep camera field of view at 65 degrees unless browser evidence requires an adjustment; any adjustment must stay within 60–68 degrees.
- Preserve inventory rules, actions, events, depletion, accessibility, weather, motion, presentation cues, reduced-motion behavior, and restart behavior.
- Track and dispose every new geometry, material, and texture exactly once.
- Preserve unrelated working-tree changes in `src/Game.ts`, `src/styles/main.css`, `src/ui/PerformanceStats.ts`, and `dev-server.err`; never stage them with this feature.

## File Structure

- Create `src/survival/SurvivalBoatLayout.ts` — stable type-and-ordinal prop transforms plus measured horizontal-envelope helpers.
- Create `tests/SurvivalBoatLayout.test.ts` — layout capacity, stability, open-center, clearance, and duplicate coverage.
- Create `src/survival/SurvivalBoatTextures.ts` — seeded color and roughness `DataTexture` generation.
- Create `tests/SurvivalBoatTextures.test.ts` — determinism, texture configuration, and surface distinction.
- Create `src/survival/SurvivalLifeboat.ts` — larger rounded hull, floor, gunwales, ribs, fittings, paddles, repair patch, cue objects, bounds, and owned textures.
- Create `tests/SurvivalLifeboat.test.ts` — dimensions, named objects, geometry, materials, paddles, bounds, and ownership.
- Modify `src/survival/BoatWorld.ts` — use the survival builder and layout, update camera framing and water exclusion, and dispose textures.
- Modify `tests/BoatWorld.test.ts` — verify survival transforms, camera framing, anchor separation, cues, exclusions, and exact-once texture disposal.
- Verify `src/world/Lifeboat.ts`, `src/world/BoatStorage.ts`, and `tests/world.test.ts` remain behaviorally unchanged.

---

### Task 1: Stable Type-Aware Survival Item Layout

**Files:**
- Create: `src/survival/SurvivalBoatLayout.ts`
- Create: `tests/SurvivalBoatLayout.test.ts`

**Interfaces:**
- Consumes: `ItemInstance`, `ItemId`, and `ITEM_DEFINITIONS` from `src/game/ItemState.ts`; Three.js `Object3D`, `Box2`, `Box3`, `Euler`, `Vector2`, and `Vector3`.
- Produces: `SURVIVAL_STORAGE_CLEARANCE`, `SurvivalBoatStorageTransform`, `survivalBoatStorageTransform(instance)`, `measureSurvivalStorageEnvelope(root)`, and `storageEnvelopesOverlap(first, second)`.

- [ ] **Step 1: Write failing layout identity and stability tests**

Create `tests/SurvivalBoatLayout.test.ts` with these initial tests:

```ts
import { BoxGeometry, Group, Mesh, MeshBasicMaterial } from 'three';
import { describe, expect, it } from 'vitest';
import {
  ITEM_DEFINITIONS,
  createItemInstances,
  type ItemId,
  type ItemInstance,
} from '../src/game/ItemState';
import {
  SURVIVAL_STORAGE_CLEARANCE,
  measureSurvivalStorageEnvelope,
  storageEnvelopesOverlap,
  survivalBoatStorageTransform,
} from '../src/survival/SurvivalBoatLayout';

const REPRESENTATIVE_SIZE: Readonly<Record<ItemId, readonly [number, number, number]>> = {
  flareGun: [0.62, 0.24, 0.34],
  ductTape: [0.54, 0.24, 0.28],
  fishingRod: [0.12, 0.16, 1.80],
  baitTin: [0.50, 0.25, 0.36],
  medicalKit: [0.66, 0.42, 0.48],
  waterJug: [0.52, 0.78, 0.52],
  cannedFood: [0.34, 0.42, 0.34],
  flashlight: [0.24, 0.26, 0.68],
  scubaSet: [0.92, 0.70, 0.62],
};

function representativeProp(instance: ItemInstance): Group {
  const root = new Group();
  const [width, height, depth] = REPRESENTATIVE_SIZE[instance.type];
  root.add(new Mesh(
    new BoxGeometry(width, height, depth),
    new MeshBasicMaterial(),
  ));
  const transform = survivalBoatStorageTransform(instance);
  root.position.copy(transform.position);
  root.rotation.copy(transform.rotation);
  root.scale.setScalar(transform.scale);
  return root;
}

describe('survival boat item layout', () => {
  it('defines exactly one stable transform per possible item instance', () => {
    const instances = createItemInstances();
    expect(instances).toHaveLength(14);
    for (const instance of instances) {
      const first = survivalBoatStorageTransform(instance);
      const second = survivalBoatStorageTransform(instance);
      expect(second.position.toArray()).toEqual(first.position.toArray());
      expect(second.rotation.toArray()).toEqual(first.rotation.toArray());
      expect(second.scale).toBe(first.scale);
    }
    for (const [type, definition] of Object.entries(ITEM_DEFINITIONS)) {
      expect(instances.filter((instance) => instance.type === type)).toHaveLength(
        definition.spawnCount,
      );
    }
  });

  it('keeps duplicate transforms distinct and independent of missing siblings', () => {
    const first = survivalBoatStorageTransform({ instanceId: 'cannedFood-1', type: 'cannedFood' });
    const third = survivalBoatStorageTransform({ instanceId: 'cannedFood-3', type: 'cannedFood' });
    expect(first.position.equals(third.position)).toBe(false);
    expect(survivalBoatStorageTransform({
      instanceId: 'cannedFood-3',
      type: 'cannedFood',
    }).position.toArray()).toEqual(third.position.toArray());
  });

  it('rejects malformed or out-of-range instance IDs', () => {
    expect(() => survivalBoatStorageTransform({
      instanceId: 'ductTape-3',
      type: 'ductTape',
    })).toThrow('No survival boat slot for ductTape-3');
  });

  it('keeps measured maximum-inventory envelopes separated', () => {
    expect(SURVIVAL_STORAGE_CLEARANCE).toBe(0.05);
    const roots = createItemInstances().map(representativeProp);
    const envelopes = roots.map((root) => measureSurvivalStorageEnvelope(root));
    for (let first = 0; first < envelopes.length; first += 1) {
      for (let second = first + 1; second < envelopes.length; second += 1) {
        expect(
          storageEnvelopesOverlap(envelopes[first]!, envelopes[second]!),
          `${createItemInstances()[first]!.instanceId} overlaps ${createItemInstances()[second]!.instanceId}`,
        ).toBe(false);
      }
    }
    roots.forEach((root) => {
      root.traverse((object) => {
        if (object instanceof Mesh) {
          object.geometry.dispose();
          object.material.dispose();
        }
      });
    });
  });

  it('leaves the central longitudinal floor clear outside the bow zone', () => {
    for (const instance of createItemInstances()) {
      const { position } = survivalBoatStorageTransform(instance);
      if (position.z > -2.05 && instance.type !== 'fishingRod') {
        expect(Math.abs(position.x), instance.instanceId).toBeGreaterThanOrEqual(0.58);
      }
    }
  });
});
```

- [ ] **Step 2: Run the new test and confirm the missing-module failure**

Run: `bun run test -- tests/SurvivalBoatLayout.test.ts`

Expected: FAIL because `../src/survival/SurvivalBoatLayout` does not exist.

- [ ] **Step 3: Implement the stable slot map and envelope helpers**

Create `src/survival/SurvivalBoatLayout.ts`:

```ts
import { Box2, Box3, Euler, Object3D, Vector2, Vector3 } from 'three';
import { ITEM_DEFINITIONS, type ItemId, type ItemInstance } from '../game/ItemState';

export const SURVIVAL_STORAGE_CLEARANCE = 0.05;

export interface SurvivalBoatStorageTransform {
  readonly position: Vector3;
  readonly rotation: Euler;
  readonly scale: number;
}

interface SlotSpec {
  readonly position: readonly [number, number, number];
  readonly rotation: readonly [number, number, number];
  readonly scale: number;
}

const slot = (
  position: SlotSpec['position'],
  yaw: number,
  scale: number,
): SlotSpec => ({ position, rotation: [0, yaw, 0], scale });

const SURVIVAL_SLOTS = {
  flareGun: [slot([0.62, -0.22, 1.48], -0.20, 0.82)],
  ductTape: [
    slot([0.98, -0.24, 0.34], 0.28, 0.82),
    slot([0.98, -0.24, 0.98], -0.24, 0.82),
  ],
  fishingRod: [slot([1.45, 0.12, -0.28], -0.08, 0.84)],
  baitTin: [
    slot([1.00, -0.24, -1.35], -0.18, 0.82),
    slot([1.00, -0.24, -1.92], 0.20, 0.82),
  ],
  medicalKit: [slot([-1.12, -0.23, 0.62], 0.18, 0.82)],
  waterJug: [
    slot([0.18, -0.22, -2.52], -0.10, 0.84),
    slot([1.05, -0.22, -2.30], 0.16, 0.84),
  ],
  cannedFood: [
    slot([-1.20, -0.24, -1.42], -0.18, 0.84),
    slot([-1.20, -0.24, -0.76], 0.16, 0.84),
    slot([-1.20, -0.24, -0.10], -0.10, 0.84),
  ],
  flashlight: [slot([-0.66, -0.22, 1.48], 0.10, 0.82)],
  scubaSet: [slot([-0.94, -0.22, -2.36], -0.16, 0.84)],
} satisfies Readonly<Record<ItemId, readonly SlotSpec[]>>;

function instanceOrdinal(instance: ItemInstance): number {
  const prefix = `${instance.type}-`;
  const suffix = instance.instanceId.startsWith(prefix)
    ? instance.instanceId.slice(prefix.length)
    : '';
  const oneBased = Number(suffix);
  const ordinal = oneBased - 1;
  if (
    !Number.isInteger(oneBased)
    || oneBased < 1
    || ordinal >= ITEM_DEFINITIONS[instance.type].spawnCount
  ) {
    throw new Error(`No survival boat slot for ${instance.instanceId}`);
  }
  return ordinal;
}

export function survivalBoatStorageTransform(
  instance: ItemInstance,
): SurvivalBoatStorageTransform {
  const spec = SURVIVAL_SLOTS[instance.type][instanceOrdinal(instance)];
  if (!spec) throw new Error(`No survival boat slot for ${instance.instanceId}`);
  return {
    position: new Vector3(...spec.position),
    rotation: new Euler(...spec.rotation),
    scale: spec.scale,
  };
}

export function measureSurvivalStorageEnvelope(
  root: Object3D,
  clearance = SURVIVAL_STORAGE_CLEARANCE,
): Box2 {
  root.updateWorldMatrix(true, true);
  const bounds = new Box3().setFromObject(root);
  if (bounds.isEmpty()) throw new Error(`Cannot measure empty survival prop ${root.name}`);
  return new Box2(
    new Vector2(bounds.min.x - clearance, bounds.min.z - clearance),
    new Vector2(bounds.max.x + clearance, bounds.max.z + clearance),
  );
}

export function storageEnvelopesOverlap(first: Box2, second: Box2): boolean {
  return first.intersectsBox(second);
}
```

- [ ] **Step 4: Run layout tests and correct only explicit slot constants if a representative envelope fails**

Run: `bun run test -- tests/SurvivalBoatLayout.test.ts`

Expected: PASS with five tests. If one representative envelope intersects, move only the conflicting slot farther along its assigned perimeter zone; do not add runtime repacking.

- [ ] **Step 5: Commit the layout module**

```bash
git add src/survival/SurvivalBoatLayout.ts tests/SurvivalBoatLayout.test.ts
git commit -m "feat: define stable survival boat item layout"
```

---

### Task 2: Deterministic Procedural Boat Textures

**Files:**
- Create: `src/survival/SurvivalBoatTextures.ts`
- Create: `tests/SurvivalBoatTextures.test.ts`

**Interfaces:**
- Consumes: Three.js `DataTexture`, `RGBAFormat`, `RepeatWrapping`, `SRGBColorSpace`, `Texture`, and `UnsignedByteType`.
- Produces: `SurvivalBoatTextures` and `createSurvivalBoatTextures()` returning `paintColor`, `paintRoughness`, `woodColor`, `woodRoughness`, `ropeColor`, `metalRoughness`, and an `all` ownership list.

- [ ] **Step 1: Write failing texture determinism and configuration tests**

Create `tests/SurvivalBoatTextures.test.ts`:

```ts
import { DataTexture, NoColorSpace, RepeatWrapping, SRGBColorSpace } from 'three';
import { describe, expect, it, vi } from 'vitest';
import { createSurvivalBoatTextures } from '../src/survival/SurvivalBoatTextures';

const bytes = (texture: DataTexture): number[] =>
  Array.from(texture.image.data as Uint8Array);

describe('survival boat procedural textures', () => {
  it('generates deterministic but distinct surface maps', () => {
    const first = createSurvivalBoatTextures();
    const second = createSurvivalBoatTextures();
    expect(first.all).toHaveLength(6);
    first.all.forEach((texture, index) => {
      expect(bytes(texture)).toEqual(bytes(second.all[index]!));
      expect(texture.wrapS).toBe(RepeatWrapping);
      expect(texture.wrapT).toBe(RepeatWrapping);
      expect(texture.image.width).toBe(64);
      expect(texture.image.height).toBe(64);
    });
    expect(bytes(first.paintColor)).not.toEqual(bytes(first.woodColor));
    expect(bytes(first.paintRoughness)).not.toEqual(bytes(first.metalRoughness));
    first.all.forEach((texture) => texture.dispose());
    second.all.forEach((texture) => texture.dispose());
  });

  it('uses sRGB only for color textures and disposes each owned map once', () => {
    const textures = createSurvivalBoatTextures();
    expect(textures.paintColor.colorSpace).toBe(SRGBColorSpace);
    expect(textures.woodColor.colorSpace).toBe(SRGBColorSpace);
    expect(textures.ropeColor.colorSpace).toBe(SRGBColorSpace);
    expect(textures.paintRoughness.colorSpace).toBe(NoColorSpace);
    expect(textures.woodRoughness.colorSpace).toBe(NoColorSpace);
    expect(textures.metalRoughness.colorSpace).toBe(NoColorSpace);
    const spies = textures.all.map((texture) => vi.spyOn(texture, 'dispose'));
    textures.all.forEach((texture) => texture.dispose());
    spies.forEach((spy) => expect(spy).toHaveBeenCalledOnce());
  });
});
```

- [ ] **Step 2: Run the texture test and confirm the missing-module failure**

Run: `bun run test -- tests/SurvivalBoatTextures.test.ts`

Expected: FAIL because `../src/survival/SurvivalBoatTextures` does not exist.

- [ ] **Step 3: Implement seeded 64×64 color and roughness textures**

Create `src/survival/SurvivalBoatTextures.ts`:

```ts
import {
  DataTexture,
  NoColorSpace,
  RGBAFormat,
  RepeatWrapping,
  SRGBColorSpace,
  UnsignedByteType,
} from 'three';

const SIZE = 64;

interface PatternOptions {
  readonly seed: number;
  readonly base: readonly [number, number, number];
  readonly variation: number;
  readonly streakAxis: 'x' | 'y' | 'none';
  readonly color: boolean;
  readonly repeat: readonly [number, number];
}

export interface SurvivalBoatTextures {
  readonly paintColor: DataTexture;
  readonly paintRoughness: DataTexture;
  readonly woodColor: DataTexture;
  readonly woodRoughness: DataTexture;
  readonly ropeColor: DataTexture;
  readonly metalRoughness: DataTexture;
  readonly all: readonly DataTexture[];
}

function hash(seed: number, x: number, y: number): number {
  let value = Math.imul(x + 17, 0x45d9f3b) ^ Math.imul(y + 31, 0x119de1f3) ^ seed;
  value = Math.imul(value ^ (value >>> 16), 0x45d9f3b);
  value ^= value >>> 16;
  return (value >>> 0) / 0xffffffff;
}

function clampByte(value: number): number {
  return Math.max(0, Math.min(255, Math.round(value)));
}

function createPattern(options: PatternOptions): DataTexture {
  const data = new Uint8Array(SIZE * SIZE * 4);
  for (let y = 0; y < SIZE; y += 1) {
    for (let x = 0; x < SIZE; x += 1) {
      const noise = hash(options.seed, x, y) - 0.5;
      const streakCoordinate = options.streakAxis === 'x' ? x : y;
      const streak = options.streakAxis === 'none'
        ? 0
        : Math.sin((streakCoordinate + options.seed) * 0.42) * options.variation * 0.32;
      const offset = noise * options.variation + streak;
      const index = (y * SIZE + x) * 4;
      data[index] = clampByte(options.base[0] + offset);
      data[index + 1] = clampByte(options.base[1] + offset);
      data[index + 2] = clampByte(options.base[2] + offset);
      data[index + 3] = 255;
    }
  }
  const texture = new DataTexture(data, SIZE, SIZE, RGBAFormat, UnsignedByteType);
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  texture.repeat.set(...options.repeat);
  texture.colorSpace = options.color ? SRGBColorSpace : NoColorSpace;
  texture.needsUpdate = true;
  return texture;
}

export function createSurvivalBoatTextures(): SurvivalBoatTextures {
  const paintColor = createPattern({
    seed: 0x19a3, base: [177, 83, 47], variation: 34,
    streakAxis: 'y', color: true, repeat: [3, 5],
  });
  const paintRoughness = createPattern({
    seed: 0x77c1, base: [205, 205, 205], variation: 38,
    streakAxis: 'none', color: false, repeat: [3, 5],
  });
  const woodColor = createPattern({
    seed: 0x4b31, base: [112, 77, 48], variation: 42,
    streakAxis: 'x', color: true, repeat: [2, 7],
  });
  const woodRoughness = createPattern({
    seed: 0x24d7, base: [220, 220, 220], variation: 28,
    streakAxis: 'x', color: false, repeat: [2, 7],
  });
  const ropeColor = createPattern({
    seed: 0x98e5, base: [54, 42, 28], variation: 24,
    streakAxis: 'y', color: true, repeat: [8, 2],
  });
  const metalRoughness = createPattern({
    seed: 0x6f13, base: [174, 174, 174], variation: 54,
    streakAxis: 'none', color: false, repeat: [4, 4],
  });
  return {
    paintColor,
    paintRoughness,
    woodColor,
    woodRoughness,
    ropeColor,
    metalRoughness,
    all: [
      paintColor,
      paintRoughness,
      woodColor,
      woodRoughness,
      ropeColor,
      metalRoughness,
    ],
  };
}
```

- [ ] **Step 4: Run texture tests and typecheck**

Run: `bun run test -- tests/SurvivalBoatTextures.test.ts`

Expected: PASS with two tests.

Run: `bun run typecheck`

Expected: exit 0.

- [ ] **Step 5: Commit procedural textures**

```bash
git add src/survival/SurvivalBoatTextures.ts tests/SurvivalBoatTextures.test.ts
git commit -m "feat: add procedural survival boat textures"
```

---

### Task 3: Larger Rounded Survival Lifeboat Builder

**Files:**
- Create: `src/survival/SurvivalLifeboat.ts`
- Create: `tests/SurvivalLifeboat.test.ts`

**Interfaces:**
- Consumes: `createSurvivalBoatTextures()` from Task 2 and Three.js geometry/material classes.
- Produces: `SURVIVAL_LIFEBOAT_DIMENSIONS`, `SurvivalLifeboatBuild`, and `createSurvivalLifeboat()` with `root`, `storageRoot`, `interiorBounds`, `waterExclusion`, and `textures`.

- [ ] **Step 1: Write failing builder contract and dimension tests**

Create `tests/SurvivalLifeboat.test.ts`:

```ts
import {
  Box3,
  BufferGeometry,
  Material,
  Mesh,
  MeshStandardMaterial,
  Texture,
  Vector3,
} from 'three';
import { describe, expect, it } from 'vitest';
import { createLifeboat } from '../src/world/Lifeboat';
import {
  SURVIVAL_LIFEBOAT_DIMENSIONS,
  createSurvivalLifeboat,
} from '../src/survival/SurvivalLifeboat';

function disposeBuild(root: ReturnType<typeof createSurvivalLifeboat>['root'], textures: readonly Texture[]): void {
  const geometries = new Set<BufferGeometry>();
  const materials = new Set<Material>();
  root.traverse((object) => {
    if (!(object instanceof Mesh)) return;
    geometries.add(object.geometry);
    const assigned = Array.isArray(object.material) ? object.material : [object.material];
    assigned.forEach((material) => materials.add(material));
  });
  geometries.forEach((geometry) => geometry.dispose());
  materials.forEach((material) => material.dispose());
  textures.forEach((texture) => texture.dispose());
}

describe('survival lifeboat builder', () => {
  it('builds an 18–22 percent larger named rounded hull', () => {
    const build = createSurvivalLifeboat();
    const hull = build.root.getObjectByName('survival-hull-geometry')!;
    const size = new Box3().setFromObject(hull).getSize(new Vector3());
    const scavenging = createLifeboat();
    const scavengingHullBounds = new Box3();
    for (const name of ['hull-port', 'hull-starboard', 'boat-bow', 'boat-stern', 'boat-floor']) {
      scavengingHullBounds.union(new Box3().setFromObject(scavenging.root.getObjectByName(name)!));
    }
    const scavengingSize = scavengingHullBounds.getSize(new Vector3());
    expect(size.x).toBeCloseTo(SURVIVAL_LIFEBOAT_DIMENSIONS.width, 1);
    expect(size.z).toBeCloseTo(SURVIVAL_LIFEBOAT_DIMENSIONS.length, 1);
    expect(size.x / scavengingSize.x).toBeGreaterThanOrEqual(1.18);
    expect(size.x / scavengingSize.x).toBeLessThanOrEqual(1.22);
    expect(size.z / scavengingSize.z).toBeGreaterThanOrEqual(1.18);
    expect(size.z / scavengingSize.z).toBeLessThanOrEqual(1.22);
    expect(hull.children.filter(({ name }) => name.startsWith('hull-segment-')).length)
      .toBeGreaterThanOrEqual(16);
    disposeBuild(build.root, build.textures);
    disposeBuild(scavenging.root, []);
  });

  it('provides named storage, repair, cue, paddle, and fitting objects', () => {
    const build = createSurvivalLifeboat();
    expect(build.root.name).toBe('lifeboat');
    expect(build.storageRoot.name).toBe('lifeboat-storage');
    expect(build.root.getObjectByName('damaged-plank-patch')).toBeDefined();
    expect(build.root.getObjectByName('fishing-line')?.visible).toBe(false);
    expect(build.root.getObjectByName('fishing-catch')?.visible).toBe(false);
    expect(build.root.getObjectByName('paddle-port')).toBeDefined();
    expect(build.root.getObjectByName('paddle-starboard')).toBeDefined();
    expect(build.root.getObjectByName('survival-gunwale')).toBeDefined();
    expect(build.root.getObjectByName('survival-floor')).toBeDefined();
    expect(build.root.getObjectByName('survival-ribs')?.children).toHaveLength(3);
    expect(build.root.getObjectByName('survival-fittings')?.children.length)
      .toBeGreaterThanOrEqual(10);
    disposeBuild(build.root, build.textures);
  });

  it('uses all procedural texture families and matching interior exclusions', () => {
    const build = createSurvivalLifeboat();
    const maps = new Set<Texture>();
    build.root.traverse((object) => {
      if (!(object instanceof Mesh)) return;
      const assigned = Array.isArray(object.material) ? object.material : [object.material];
      assigned.forEach((material) => {
        if (material instanceof MeshStandardMaterial) {
          if (material.map) maps.add(material.map);
          if (material.roughnessMap) maps.add(material.roughnessMap);
        }
      });
    });
    expect(build.textures).toHaveLength(6);
    expect(maps).toEqual(new Set(build.textures));
    expect(build.interiorBounds.min.toArray()).toEqual([-1.45, -0.50, -2.96]);
    expect(build.interiorBounds.max.toArray()).toEqual([1.45, 1.00, 2.96]);
    expect(build.waterExclusion).toEqual({ halfWidth: 1.50, halfLength: 3.00 });
    disposeBuild(build.root, build.textures);
  });
});
```

- [ ] **Step 2: Run the builder test and confirm the missing-module failure**

Run: `bun run test -- tests/SurvivalLifeboat.test.ts`

Expected: FAIL because `../src/survival/SurvivalLifeboat` does not exist.

- [ ] **Step 3: Implement the builder constants, materials, and segmented hull**

Create `src/survival/SurvivalLifeboat.ts` with these public contracts and fixed hull stations:

```ts
import {
  Box3,
  BoxGeometry,
  CatmullRomCurve3,
  CylinderGeometry,
  ExtrudeGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  Shape,
  ShapeGeometry,
  SphereGeometry,
  Texture,
  TorusGeometry,
  TubeGeometry,
  Vector3,
} from 'three';
import { createSurvivalBoatTextures } from './SurvivalBoatTextures';

export const SURVIVAL_LIFEBOAT_DIMENSIONS = {
  width: 3.56,
  length: 6.54,
} as const;

export interface SurvivalLifeboatBuild {
  readonly root: Group;
  readonly storageRoot: Group;
  readonly interiorBounds: Box3;
  readonly waterExclusion: { readonly halfWidth: number; readonly halfLength: number };
  readonly textures: readonly Texture[];
}

const HULL_STATIONS = [
  { z: -3.00, halfWidth: 0.34 },
  { z: -2.65, halfWidth: 1.05 },
  { z: -2.08, halfWidth: 1.48 },
  { z: -1.12, halfWidth: 1.66 },
  { z: 0.00, halfWidth: 1.66 },
  { z: 1.18, halfWidth: 1.60 },
  { z: 2.20, halfWidth: 1.28 },
  { z: 2.72, halfWidth: 0.72 },
  { z: 3.00, halfWidth: 0.34 },
] as const;

function materialSet(textures: ReturnType<typeof createSurvivalBoatTextures>) {
  return {
    hull: new MeshStandardMaterial({
      color: 0xffffff,
      map: textures.paintColor,
      roughnessMap: textures.paintRoughness,
      roughness: 0.82,
      metalness: 0.02,
      flatShading: true,
    }),
    wood: new MeshStandardMaterial({
      color: 0xffffff,
      map: textures.woodColor,
      roughnessMap: textures.woodRoughness,
      roughness: 0.90,
      flatShading: true,
    }),
    rope: new MeshStandardMaterial({
      color: 0xffffff,
      map: textures.ropeColor,
      roughness: 1,
      flatShading: true,
    }),
    metal: new MeshStandardMaterial({
      color: 0x8a8170,
      roughnessMap: textures.metalRoughness,
      roughness: 0.78,
      metalness: 0.18,
      flatShading: true,
    }),
    seam: new MeshStandardMaterial({ color: 0x302e2a, roughness: 0.96, flatShading: true }),
  };
}

function addHullSegments(target: Group, material: MeshStandardMaterial): void {
  for (const sign of [-1, 1] as const) {
    for (let index = 0; index < HULL_STATIONS.length - 1; index += 1) {
      const first = HULL_STATIONS[index]!;
      const second = HULL_STATIONS[index + 1]!;
      const x1 = sign * first.halfWidth;
      const x2 = sign * second.halfWidth;
      const dx = x2 - x1;
      const dz = second.z - first.z;
      const segment = new Mesh(
        new BoxGeometry(0.22, 0.74, Math.hypot(dx, dz) + 0.04),
        material,
      );
      segment.name = `hull-segment-${sign < 0 ? 'port' : 'starboard'}-${index}`;
      segment.position.set((x1 + x2) / 2, -0.02, (first.z + second.z) / 2);
      segment.rotation.set(0, Math.atan2(dx, dz), sign * 0.10);
      target.add(segment);
    }
  }
}

function floorShape(): Shape {
  const shape = new Shape();
  shape.moveTo(0, -2.96);
  shape.bezierCurveTo(1.00, -2.88, 1.45, -2.16, 1.45, -1.20);
  shape.lineTo(1.45, 1.52);
  shape.bezierCurveTo(1.42, 2.36, 0.72, 2.90, 0, 2.96);
  shape.bezierCurveTo(-0.72, 2.90, -1.42, 2.36, -1.45, 1.52);
  shape.lineTo(-1.45, -1.20);
  shape.bezierCurveTo(-1.45, -2.16, -1.00, -2.88, 0, -2.96);
  shape.closePath();
  return shape;
}
```

- [ ] **Step 4: Complete floor, gunwale, ribs, fittings, paddles, repair patch, and cue objects**

Continue the same file with complete helpers and the exported builder:

```ts
function createPaddle(
  side: 'port' | 'starboard',
  wood: MeshStandardMaterial,
  metal: MeshStandardMaterial,
  rope: MeshStandardMaterial,
): Group {
  const sign = side === 'port' ? -1 : 1;
  const paddle = new Group();
  paddle.name = `paddle-${side}`;
  paddle.position.set(sign * 1.88, 0.22, 0.05);
  paddle.rotation.y = sign * 0.06;

  const shaft = new Mesh(new CylinderGeometry(0.035, 0.045, 2.95, 8), wood);
  shaft.name = `paddle-shaft-${side}`;
  shaft.rotation.x = Math.PI / 2;
  paddle.add(shaft);

  const bladeShape = new Shape();
  bladeShape.moveTo(-0.18, 0);
  bladeShape.quadraticCurveTo(-0.25, 0.34, -0.15, 0.66);
  bladeShape.lineTo(0.15, 0.66);
  bladeShape.quadraticCurveTo(0.25, 0.34, 0.18, 0);
  bladeShape.closePath();
  const blade = new Mesh(new ExtrudeGeometry(bladeShape, {
    depth: 0.04,
    bevelEnabled: true,
    bevelSegments: 1,
    bevelSize: 0.025,
    bevelThickness: 0.02,
  }), wood);
  blade.name = `paddle-blade-${side}`;
  blade.rotation.x = -Math.PI / 2;
  blade.position.z = -1.78;
  paddle.add(blade);

  for (const z of [-0.62, 0.62]) {
    const lashing = new Mesh(new TorusGeometry(0.09, 0.018, 5, 10), rope);
    lashing.name = `paddle-lashing-${side}-${z < 0 ? 'forward' : 'aft'}`;
    lashing.position.z = z;
    lashing.rotation.y = Math.PI / 2;
    paddle.add(lashing);
  }
  const collar = new Mesh(new CylinderGeometry(0.055, 0.055, 0.10, 8), metal);
  collar.rotation.x = Math.PI / 2;
  collar.position.z = 1.36;
  paddle.add(collar);
  return paddle;
}

function outlinePoints(height: number): Vector3[] {
  const starboard = HULL_STATIONS.map(({ halfWidth, z }) => new Vector3(halfWidth, height, z));
  const port = [...HULL_STATIONS]
    .reverse()
    .map(({ halfWidth, z }) => new Vector3(-halfWidth, height, z));
  return [...starboard, ...port];
}

export function createSurvivalLifeboat(): SurvivalLifeboatBuild {
  const textures = createSurvivalBoatTextures();
  const materials = materialSet(textures);
  const root = new Group();
  root.name = 'lifeboat';

  const hull = new Group();
  hull.name = 'survival-hull-geometry';
  addHullSegments(hull, materials.hull);
  for (const [name, z] of [['bow', -3.00], ['stern', 3.00]] as const) {
    const cap = new Mesh(new CylinderGeometry(0.43, 0.50, 0.74, 8), materials.hull);
    cap.name = `hull-${name}-rounded-cap`;
    cap.position.set(0, -0.02, z);
    cap.scale.set(1.0, 1.0, 0.54);
    hull.add(cap);
  }
  root.add(hull);

  const floorGeometry = new ShapeGeometry(floorShape(), 10);
  floorGeometry.rotateX(-Math.PI / 2);
  const floor = new Mesh(floorGeometry, materials.wood);
  floor.name = 'survival-floor';
  floor.position.y = -0.45;
  root.add(floor);

  const gunwaleCurve = new CatmullRomCurve3(outlinePoints(0.39), true, 'centripetal');
  const gunwale = new Mesh(
    new TubeGeometry(gunwaleCurve, 64, 0.075, 6, true),
    materials.hull,
  );
  gunwale.name = 'survival-gunwale';
  root.add(gunwale);

  const ribs = new Group();
  ribs.name = 'survival-ribs';
  for (const z of [-1.62, -0.32, 0.98]) {
    const rib = new Mesh(new BoxGeometry(2.62, 0.07, 0.10), materials.wood);
    rib.name = `survival-rib-${z}`;
    rib.position.set(0, -0.39, z);
    ribs.add(rib);
  }
  root.add(ribs);

  const fittings = new Group();
  fittings.name = 'survival-fittings';
  for (const sign of [-1, 1] as const) {
    const seam = new Mesh(new BoxGeometry(0.05, 0.05, 4.65), materials.seam);
    seam.name = `inner-seam-${sign < 0 ? 'port' : 'starboard'}`;
    seam.position.set(sign * 1.49, 0.10, 0.10);
    fittings.add(seam);
    for (const z of [-2.10, -1.25, -0.40, 0.45, 1.30]) {
      const fastener = new Mesh(new CylinderGeometry(0.035, 0.035, 0.025, 6), materials.metal);
      fastener.name = `fastener-${sign < 0 ? 'port' : 'starboard'}-${z}`;
      fastener.position.set(sign * 1.52, 0.18, z);
      fastener.rotation.z = Math.PI / 2;
      fittings.add(fastener);
    }
  }
  root.add(fittings);

  const patch = new Mesh(new BoxGeometry(0.74, 0.06, 0.54), materials.wood);
  patch.name = 'damaged-plank-patch';
  patch.position.set(-1.18, -0.28, 0.62);
  patch.rotation.set(0.04, -0.16, 0.20);
  root.add(patch);

  for (const sign of [-1, 1] as const) {
    const mount = new Mesh(new TorusGeometry(0.13, 0.035, 6, 12, Math.PI), materials.metal);
    mount.name = sign < 0 ? 'oar-mount-port' : 'oar-mount-starboard';
    mount.position.set(sign * 1.54, 0.40, -0.42);
    mount.rotation.set(Math.PI / 2, 0, sign * Math.PI / 2);
    root.add(mount);
  }

  root.add(
    createPaddle('port', materials.wood, materials.metal, materials.rope),
    createPaddle('starboard', materials.wood, materials.metal, materials.rope),
  );

  const line = new Mesh(new CylinderGeometry(0.004, 0.004, 1.72, 4), materials.rope);
  line.name = 'fishing-line';
  line.position.set(1.78, 0.02, -0.30);
  line.visible = false;
  root.add(line);

  const catchMesh = new Mesh(new SphereGeometry(0.12, 7, 5), materials.metal);
  catchMesh.name = 'fishing-catch';
  catchMesh.position.set(1.78, -0.78, -0.30);
  catchMesh.scale.set(1.8, 0.65, 0.45);
  catchMesh.visible = false;
  root.add(catchMesh);

  const storageRoot = new Group();
  storageRoot.name = 'lifeboat-storage';
  root.add(storageRoot);

  root.traverse((object) => {
    if (!(object instanceof Mesh)) return;
    object.castShadow = true;
    object.receiveShadow = true;
  });

  return {
    root,
    storageRoot,
    interiorBounds: new Box3(
      new Vector3(-1.45, -0.50, -2.96),
      new Vector3(1.45, 1.00, 2.96),
    ),
    waterExclusion: { halfWidth: 1.50, halfLength: 3.00 },
    textures: textures.all,
  };
}
```

Before running tests, ensure the named `survival-hull-geometry` extents remain `3.56 × 6.54` within one decimal place. If the rounded cap or rotated side thickness pushes the measured value outside the 18–22 percent limits, change `HULL_STATIONS` maximum `halfWidth` or endpoint `z`; do not scale the whole root because storage and exclusion coordinates are already in final boat-local units.

- [ ] **Step 5: Run builder, texture, and scavenging regression tests**

Run:

```bash
bun run test -- tests/SurvivalLifeboat.test.ts tests/SurvivalBoatTextures.test.ts tests/world.test.ts
```

Expected: PASS. `tests/world.test.ts` proves the existing scavenging `createLifeboat()` and `boatStorageTransform()` behavior remains intact.

- [ ] **Step 6: Commit the survival builder**

```bash
git add src/survival/SurvivalLifeboat.ts tests/SurvivalLifeboat.test.ts
git commit -m "feat: build enhanced survival lifeboat"
```

---

### Task 4: Integrate the Enhanced Boat, Camera, Props, and Disposal

**Files:**
- Modify: `src/survival/BoatWorld.ts:1-230, 380-430`
- Modify: `tests/BoatWorld.test.ts:1-340`

**Interfaces:**
- Consumes: `createSurvivalLifeboat()` and `SurvivalLifeboatBuild` from Task 3; `survivalBoatStorageTransform(instance)` and measured-envelope helpers from Task 1.
- Produces: unchanged public `BoatWorld` methods and constructor; survival-only hull, layout, camera, exclusion, and texture lifecycle behind the existing API.

- [ ] **Step 1: Replace index-layout expectations with type-aware transform tests**

In `tests/BoatWorld.test.ts`, replace the `boatStorageTransform` import with:

```ts
import { createItemInstances } from '../src/game/ItemState';
import { survivalBoatStorageTransform } from '../src/survival/SurvivalBoatLayout';
```

Replace `builds every saved instance once at its deterministic storage transform` with:

```ts
it('builds every saved instance once at its stable type-aware transform', () => {
  const savedItems = [
    savedItem('cannedFood', 3),
    savedItem('fishingRod'),
    savedItem('ductTape', 2),
    savedItem('scubaSet'),
  ];
  const propModels = createTestPropModels();
  const world = new BoatWorld(
    new PerspectiveCamera(),
    { matches: false } as MediaQueryList,
    propModels,
    savedItems,
  );
  const storage = world.scene.getObjectByName('lifeboat-storage')!;
  expect(storage.children.map(({ name }) => name)).toEqual([
    'prop:cannedFood-3',
    'prop:fishingRod-1',
    'prop:ductTape-2',
    'prop:scubaSet-1',
  ]);
  storage.children.forEach((prop, index) => {
    const transform = survivalBoatStorageTransform(savedItems[index]!);
    expect(prop.position.toArray()).toEqual(transform.position.toArray());
    expect(prop.rotation.toArray().slice(0, 3)).toEqual(transform.rotation.toArray().slice(0, 3));
    expect(prop.scale.toArray()).toEqual([transform.scale, transform.scale, transform.scale]);
    expectTestModelTransform(prop);
  });
  world.dispose();
  propModels.dispose();
});
```

- [ ] **Step 2: Add failing camera, full-inventory anchor, and texture disposal tests**

Append these tests inside the `BoatWorld helpers` suite:

```ts
it('frames the enlarged boat from the higher stern seat without changing FOV', () => {
  const camera = new PerspectiveCamera(65, 16 / 9, 0.1, 100);
  const propModels = createTestPropModels();
  const world = new BoatWorld(camera, { matches: false } as MediaQueryList, propModels, []);
  expect(camera.position.toArray()).toEqual([0, 0.88, 2.35]);
  expect(camera.fov).toBe(65);
  expect(world.scene.getObjectByName('survival-hull-geometry')).toBeDefined();
  expect(world.scene.getObjectByName('paddle-port')).toBeDefined();
  expect(world.scene.getObjectByName('paddle-starboard')).toBeDefined();
  world.dispose();
  propModels.dispose();
});

it('keeps all maximum-inventory item anchor centers at least 40 pixels apart', () => {
  const camera = new PerspectiveCamera(65, 16 / 9, 0.08, 220);
  camera.updateProjectionMatrix();
  const propModels = createTestPropModels();
  const world = new BoatWorld(
    camera,
    { matches: false } as MediaQueryList,
    propModels,
    createItemInstances(),
  );
  const anchors = world.projectInteractionAnchors(1280, 720)
    .filter((anchor) => anchor.itemType !== null && anchor.visible);
  expect(anchors).toHaveLength(14);
  for (let first = 0; first < anchors.length; first += 1) {
    for (let second = first + 1; second < anchors.length; second += 1) {
      const distance = Math.hypot(
        anchors[first]!.x - anchors[second]!.x,
        anchors[first]!.y - anchors[second]!.y,
      );
      expect(distance, `${anchors[first]!.id} is too close to ${anchors[second]!.id}`)
        .toBeGreaterThanOrEqual(40);
    }
  }
  world.dispose();
  propModels.dispose();
});

it('disposes each survival boat texture exactly once', () => {
  const propModels = createTestPropModels();
  const world = new BoatWorld(
    new PerspectiveCamera(),
    { matches: false } as MediaQueryList,
    propModels,
    [],
  );
  const seen = new Set<Texture>();
  world.scene.traverse((object) => {
    if (!(object instanceof Mesh)) return;
    const assigned = Array.isArray(object.material) ? object.material : [object.material];
    assigned.forEach((material) => {
      if (!(material instanceof MeshStandardMaterial)) return;
      for (const texture of [material.map, material.roughnessMap]) {
        if (texture && !seen.has(texture)) {
          seen.add(texture);
        }
      }
    });
  });
  expect(seen.size).toBe(6);
  const textureSpies = [...seen].map((texture) => vi.spyOn(texture, 'dispose'));
  world.dispose();
  world.dispose();
  textureSpies.forEach((spy) => expect(spy).toHaveBeenCalledOnce());
  propModels.dispose();
});
```

Add `Texture` to the existing Three.js test imports.

- [ ] **Step 3: Run the focused tests and confirm they fail against the old boat**

Run: `bun run test -- tests/BoatWorld.test.ts`

Expected: FAIL because the old builder, index layout, camera position, exclusion dimensions, and texture lifecycle do not satisfy the new assertions.

- [ ] **Step 4: Switch `BoatWorld` to the new builder and stable transforms**

In `src/survival/BoatWorld.ts`, replace the old storage and lifeboat imports with:

```ts
import { Texture } from 'three';
import { survivalBoatStorageTransform } from './SurvivalBoatLayout';
import {
  createSurvivalLifeboat,
  type SurvivalLifeboatBuild,
} from './SurvivalLifeboat';
```

Fold `Texture` into the existing Three.js import rather than creating a second import. Add these fields:

```ts
private readonly ownedTextures = new Set<Texture>();
private readonly waterExclusion: SurvivalLifeboatBuild['waterExclusion'];
```

Replace the old constructor build and index loop with:

```ts
const build = createSurvivalLifeboat();
this.boat = build.root;
this.waterExclusion = build.waterExclusion;
build.textures.forEach((texture) => this.ownedTextures.add(texture));
savedItems.forEach((instance) => {
  const prop = createProp(propModels, instance);
  const transform = survivalBoatStorageTransform(instance);
  prop.position.copy(transform.position);
  prop.rotation.copy(transform.rotation);
  prop.scale.setScalar(transform.scale);
  build.storageRoot.add(prop);
  this.savedProps.push({ instance, prop });
  this.savedPropByInstanceId.set(instance.instanceId, prop);
  prop.userData.remainingUses = ITEM_DEFINITIONS[instance.type].charges;
});
```

Do not change `savedProps`, `savedPropByInstanceId`, charge initialization, or prop names.

- [ ] **Step 5: Apply the approved camera and exclusion dimensions**

Replace the current camera setup with:

```ts
this.cameraRig.add(camera);
camera.position.set(0, 0.88, 2.35);
camera.lookAt(0, -0.18, -1.35);
this.baseCameraQuaternion = camera.quaternion.clone();
```

Keep the camera's existing `fov` unchanged. Replace the hard-coded survival exclusion with:

```ts
createWaterExclusion(
  this.boat,
  this.waterExclusion.halfWidth,
  this.waterExclusion.halfLength,
),
```

Update the exclusion assertion in `tests/BoatWorld.test.ts` from `[-1.18, 1.18, -2.48, 2.48]` to:

```ts
expect(bounds[0]!.toArray()).toEqual([-1.5, 1.5, -3, 3]);
```

- [ ] **Step 6: Dispose the new textures exactly once**

In `BoatWorld.dispose()`, after material disposal, add:

```ts
this.ownedTextures.forEach((texture) => texture.dispose());
this.ownedTextures.clear();
```

Keep the existing `disposed` guard at the start of the method. Do not dispose textures from generic prop materials because `PropModelLibrary.create()` currently clones only geometry and material ownership; the six new boat textures are the only textures owned by this phase.

- [ ] **Step 7: Run focused integration and scavenging regression tests**

Run:

```bash
bun run test -- tests/SurvivalBoatLayout.test.ts tests/SurvivalBoatTextures.test.ts tests/SurvivalLifeboat.test.ts tests/BoatWorld.test.ts tests/world.test.ts tests/BoatInteraction.test.ts tests/WaterExclusion.test.ts
```

Expected: PASS. If the anchor-separation test identifies a pair below 40 pixels, adjust the corresponding constants in `SURVIVAL_SLOTS` while preserving their assigned perimeter sides, then rerun Task 1's envelope test and this focused suite.

Run: `bun run typecheck`

Expected: exit 0.

- [ ] **Step 8: Commit the integration**

```bash
git add src/survival/BoatWorld.ts tests/BoatWorld.test.ts
git commit -m "feat: present enhanced boat during survival"
```

---

### Task 5: Browser Visual Tuning and Final Acceptance

**Files:**
- Modify: `src/survival/SurvivalBoatLayout.ts` only for verified prop position, rotation, or scale corrections.
- Modify: `src/survival/SurvivalLifeboat.ts` only for verified geometry, camera-visible detail, or water-exclusion corrections.
- Modify: `src/survival/BoatWorld.ts` only for verified camera position or look-target corrections; keep FOV within 60–68 degrees.
- Modify: corresponding tests whenever a tuned value changes an asserted contract.

- [ ] **Step 1: Run all automated gates before visual tuning**

Run:

```bash
bun run typecheck
bun run test
bun run build
git diff --check
```

Expected: all commands exit 0 with no whitespace errors.

- [ ] **Step 2: Start the local Vite server at a fixed URL**

Run: `bun run dev -- --host 127.0.0.1 --port 4173 --strictPort`

Expected: Vite reports `http://127.0.0.1:4173/`.

- [ ] **Step 3: Open a maximum-inventory survival-only preview without modifying source**

Open `http://127.0.0.1:4173/`, then run this exact script in the browser console:

```js
const [three, boatModule, modelModule, itemModule] = await Promise.all([
  import('/node_modules/.vite/deps/three.js'),
  import('/src/survival/BoatWorld.ts'),
  import('/src/world/PropModelLibrary.ts'),
  import('/src/game/ItemState.ts'),
]);
window.__boatPreview?.dispose?.();
const renderer = new three.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.replaceChildren(renderer.domElement);
const camera = new three.PerspectiveCamera(65, window.innerWidth / window.innerHeight, 0.08, 220);
const models = await modelModule.PropModelLibrary.load();
const world = new boatModule.BoatWorld(
  camera,
  { matches: false },
  models,
  itemModule.createItemInstances(),
);
let running = true;
let previous = performance.now();
const render = (now) => {
  if (!running) return;
  const delta = Math.min(0.1, (now - previous) / 1000);
  previous = now;
  world.update(now / 1000, delta);
  renderer.render(world.scene, camera);
  requestAnimationFrame(render);
};
requestAnimationFrame(render);
window.__boatPreview = {
  world,
  camera,
  dispose() {
    running = false;
    world.dispose();
    models.dispose();
    renderer.dispose();
  },
};
```

Expected: the page displays the survival boat with all fourteen saved props, both paddles, the ocean, weather lighting, and boat motion. If Vite emits a versioned Three.js dependency URL, copy the complete URL shown in the Network panel into the first import without changing source files.

- [ ] **Step 4: Inspect the approved composition at 1280×720**

Set the viewport to 1280×720 and verify all of the following:

- the hull reads as rounded and tapered rather than as five boxes;
- the interior appears approximately 20 percent larger than the scavenging boat;
- worn orange paint, wood grain, rope, and aged metal remain recognizable in calm daylight;
- both outside-mounted paddles are visible and do not consume prop storage space;
- scuba gear, both water jugs, the rod, two bait tins, the medical kit, two tape rolls, three cans, flashlight, and flare gun do not intersect or form visual piles;
- the central longitudinal floor remains open;
- no water appears through the interior floor or rounded ends;
- every visible item anchor returned by `window.__boatPreview.world.projectInteractionAnchors(1280, 720)` is finite and separated from other item anchors by at least 40 pixels.

- [ ] **Step 5: Inspect 1920×1080, night, overcast, squall, cues, and reduced motion**

Set the viewport to 1920×1080. In the console, run each state separately:

```js
window.__boatPreview.world.setPhase('night');
window.__boatPreview.world.setWeather('overcast');
window.__boatPreview.world.setWeather('squall');
await window.__boatPreview.world.play('fish');
await window.__boatPreview.world.play('repair');
```

Confirm texture families stay distinct, the fishing rod moves from its gunwale position, line and catch cues align outside the hull, the repair view still turns toward the patch, and no boat detail clips the camera. Repeat the preview with `{ matches: true }` in the constructor and confirm the base composition remains the same while parallax and boat-induced camera heave are absent.

- [ ] **Step 6: Tune only the responsible constants**

For a failed prop-clearance or anchor check, adjust only that instance's `position`, `rotation`, or `scale` in `SURVIVAL_SLOTS`. For a failed silhouette, paddle, fitting, or water-mask check, adjust only the relevant `HULL_STATIONS`, named component transform, `interiorBounds`, or `waterExclusion` in `SurvivalLifeboat.ts`. For camera clipping or composition, adjust only `camera.position`, the `lookAt` target, or a FOV between 60 and 68 degrees in `BoatWorld.ts`.

After every tuning batch, run:

```bash
bun run test -- tests/SurvivalBoatLayout.test.ts tests/SurvivalLifeboat.test.ts tests/BoatWorld.test.ts tests/world.test.ts
bun run typecheck
```

Expected: all focused tests and typecheck pass.

- [ ] **Step 7: Run final acceptance gates**

Run:

```bash
bun run typecheck
bun run test
bun run build
git diff --check
git status --short
```

Expected: typecheck, all tests, build, and whitespace checks exit 0. `git status --short` contains only this feature's planned files plus the pre-existing user-owned changes; do not stage `src/Game.ts`, `src/styles/main.css`, `src/ui/PerformanceStats.ts`, or `dev-server.err`.

- [ ] **Step 8: Review against the approved design**

Compare the implementation line by line with `docs/superpowers/specs/2026-07-13-survival-lifeboat-visual-redesign-design.md`. Confirm all twelve acceptance criteria, including survival-only scope, 18–22 percent dimensions, rounded construction, six owned procedural maps, two mounted paddles, all fourteen stable item positions, 0.05 clearance, 40-pixel anchor separation, water exclusion, unchanged survival behavior, reduced motion, and exact-once GPU cleanup.

- [ ] **Step 9: Commit final visual tuning only when files changed**

```bash
git add src/survival/SurvivalBoatLayout.ts src/survival/SurvivalLifeboat.ts src/survival/BoatWorld.ts tests/SurvivalBoatLayout.test.ts tests/SurvivalLifeboat.test.ts tests/BoatWorld.test.ts
git commit -m "fix: tune survival lifeboat presentation"
```

If browser verification required no tuning, do not create an empty commit.

## Final Self-Review Checklist

- [ ] Every approved design requirement maps to a task and an automated or browser verification step.
- [ ] Scavenging continues to use `createLifeboat()` and `boatStorageTransform()` unchanged.
- [ ] Stable slot selection derives from each `ItemInstance.instanceId`, not saved-array order.
- [ ] Maximum-inventory envelope and anchor-separation checks cover all fourteen instances.
- [ ] Texture generation is deterministic, synchronous, DOM-independent, network-independent, and explicitly owned.
- [ ] Hull dimensions, rounded construction, paddles, named cue objects, bounds, and exclusions have regression tests.
- [ ] `BoatWorld` retains its public interface, inventory synchronization, cues, motion, lighting, and reduced-motion semantics.
- [ ] Exact-once geometry, material, and texture disposal is verified.
- [ ] Full typecheck, tests, production build, browser viewports, lighting states, cues, and water masking are verified.
- [ ] Unrelated working-tree changes remain unstaged and unmodified.
- [ ] No unresolved marker or abbreviated implementation instruction remains in this plan.

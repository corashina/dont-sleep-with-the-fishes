# Underwater Menu Scene Expansion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expand the underwater menu across the full view, rebuild Dorothy as a clear side-on wreck, improve low-poly sand, spread moving animals, and remove visible clipping.

**Architecture:** Keep each existing menu concern in its current component. Add one pure layout module for static placement data and overlap checks. Keep all animation and particle buffers deterministic and allocation-free during updates.

**Tech Stack:** TypeScript 5.9, Three.js 0.180, Vitest 3.2, Vite 7.

## Global Constraints

- Keep `MENU_CAMERA_POSITION` and `MENU_CAMERA_TARGET` unchanged.
- Keep the small boat and Dorothy as the two main objects.
- Keep the illustrated low-poly style from `VISUAL_STYLE_GUIDE.md`.
- Do not use photographic sand textures.
- Do not add runtime dependencies.
- Do not add compatibility paths.
- Do not add reduced-motion behavior.
- Do not allocate objects or arrays in per-frame update paths.
- Reuse geometry and materials for repeated procedural details.
- Allow only small intentional intersections between grounded objects and sand.

---

## File map

- `src/menu/SunkenDorothyWreck.ts`: Own the simplified Dorothy wreck geometry, materials, pose, and disposal.
- `src/menu/UnderwaterParticles.ts`: Own deterministic bubble and matter buffers and their shaders.
- `src/menu/menuChoreography.ts`: Own shark and fish-school paths without per-frame allocations.
- `src/menu/MenuSceneLayout.ts`: Own static foreground and middle-ground placements plus pure overlap checks.
- `src/menu/UnderwaterMenuWorld.ts`: Assemble models, build the low-poly sand surface, and connect layout data.
- `src/menu/DistantSeabed.ts`: Own wide ridge, mountain, and distant decoration layers.
- `src/menu/UnderwaterPlantField.ts`: Place procedural kelp outside protected scene footprints.
- `tests/SunkenDorothyWreck.test.ts`: Protect Dorothy scale, pose, parts, and disposal.
- `tests/UnderwaterParticles.test.ts`: Protect full-width particle distribution and deterministic buffers.
- `tests/menuChoreography.test.ts`: Protect animal separation, horizontal coverage, and allocation reuse.
- `tests/MenuSceneLayout.test.ts`: Protect static model spacing and reserved zones.
- `tests/UnderwaterMenuWorld.test.ts`: Protect assembly counts, fish-school spacing, sand variation, camera pose, and ownership.
- `tests/DistantSeabed.test.ts`: Protect full-horizon terrain and repeated resource sharing.

---

### Task 1: Rebuild Dorothy as a simplified side-on wreck

**Files:**
- Modify: `src/menu/SunkenDorothyWreck.ts`
- Test: `tests/SunkenDorothyWreck.test.ts`

**Interfaces:**
- Consumes: `MenuSceneComponent` and `disposeResourceSets`.
- Produces: `DOROTHY_WRECK_POSITION`, `DOROTHY_WRECK_ROTATION`, `DOROTHY_WRECK_PART_NAMES`, and `SunkenDorothyWreck`.

- [ ] **Step 1: Write the failing Dorothy composition test**

Replace the current main assertion with these pose, silhouette, and part checks:

```ts
import { Box3, Mesh, Vector3 } from 'three';
import { expect, it, vi } from 'vitest';
import {
  DOROTHY_WRECK_PART_NAMES,
  DOROTHY_WRECK_POSITION,
  DOROTHY_WRECK_ROTATION,
  SunkenDorothyWreck,
} from '../src/menu/SunkenDorothyWreck';

it('builds a long simplified Dorothy wreck in a distant side view', () => {
  const wreck = new SunkenDorothyWreck();
  expect(DOROTHY_WRECK_POSITION[2]).toBeLessThanOrEqual(-18);
  expect(DOROTHY_WRECK_POSITION[2]).toBeGreaterThanOrEqual(-22);
  expect(Math.abs(DOROTHY_WRECK_ROTATION[1])).toBeGreaterThan(1.25);
  expect(Math.abs(DOROTHY_WRECK_ROTATION[1])).toBeLessThan(1.57);

  for (const name of DOROTHY_WRECK_PART_NAMES) {
    expect(wreck.root.getObjectByName(name)).toBeInstanceOf(Mesh);
  }
  for (const name of [
    'menu:dorothy-wreck-hull',
    'menu:dorothy-wreck-deck',
    'menu:dorothy-wreck-deckhouse-aft',
    'menu:dorothy-wreck-deckhouse-forward',
    'menu:dorothy-wreck-funnel-port',
    'menu:dorothy-wreck-funnel-starboard',
    'menu:dorothy-wreck-mast',
    'menu:dorothy-wreck-rail-port',
    'menu:dorothy-wreck-rail-starboard',
  ]) {
    expect(DOROTHY_WRECK_PART_NAMES).toContain(name);
  }

  wreck.root.updateMatrixWorld(true);
  const bounds = new Box3().setFromObject(wreck.root);
  const size = bounds.getSize(new Vector3());
  expect(size.x).toBeGreaterThan(15);
  expect(size.y).toBeGreaterThan(4);
  expect(size.z).toBeLessThan(10);
  expect(bounds.min.y).toBeLessThan(0.15);

  const hull = wreck.root.getObjectByName('menu:dorothy-wreck-hull') as Mesh;
  const dispose = vi.spyOn(hull.geometry, 'dispose');
  wreck.dispose();
  wreck.dispose();
  expect(dispose).toHaveBeenCalledTimes(1);
});
```

- [ ] **Step 2: Run the focused test and confirm failure**

Run: `npm test -- tests/SunkenDorothyWreck.test.ts`

Expected: FAIL because the current wreck is too close, not side-on, and lacks the required parts.

- [ ] **Step 3: Implement the simplified Dorothy silhouette**

Set the approved pose and replace the nine-part primitive group with these main forms:

```ts
export const DOROTHY_WRECK_POSITION = [1.6, 0.08, -19.5] as const;
export const DOROTHY_WRECK_ROTATION = [0.06, -1.42, -0.16] as const;

export const DOROTHY_WRECK_PART_NAMES = [
  'menu:dorothy-wreck-hull',
  'menu:dorothy-wreck-deck',
  'menu:dorothy-wreck-deckhouse-aft',
  'menu:dorothy-wreck-deckhouse-forward',
  'menu:dorothy-wreck-funnel-port',
  'menu:dorothy-wreck-funnel-starboard',
  'menu:dorothy-wreck-mast',
  'menu:dorothy-wreck-yard',
  'menu:dorothy-wreck-rail-port',
  'menu:dorothy-wreck-rail-starboard',
  'menu:dorothy-wreck-torn-plate-1',
  'menu:dorothy-wreck-torn-plate-2',
  'menu:dorothy-wreck-torn-plate-3',
] as const;
```

Use an 18-unit hull with a 5.3-unit beam. Keep the length-to-width ratio near Dorothy's 55-to-16.25 ratio. Use two box deckhouses, two eight-sided funnels, one mast, one yard, and two thin rail runs. Reuse one hull material, one weathered upper material, one rust material, and one dark metal material. Keep all geometry and materials in the existing disposal sets.

- [ ] **Step 4: Run the focused test and confirm success**

Run: `npm test -- tests/SunkenDorothyWreck.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit the Dorothy change**

```powershell
git add src/menu/SunkenDorothyWreck.ts tests/SunkenDorothyWreck.test.ts
git commit -m "feat: rebuild Dorothy menu wreck"
```

---

### Task 2: Cover the full camera view with bubbles

**Files:**
- Modify: `src/menu/UnderwaterParticles.ts`
- Create: `tests/UnderwaterParticles.test.ts`

**Interfaces:**
- Consumes: Three.js buffer geometry, point shaders, and fixed camera-space scene ranges.
- Produces: deterministic `basePosition` attributes for `menu:bubbles` and `menu:suspended-matter`.

- [ ] **Step 1: Write the failing particle coverage tests**

```ts
import { expect, it } from 'vitest';
import { UnderwaterParticles } from '../src/menu/UnderwaterParticles';

function ranges(values: Float32Array): {
  readonly x: readonly [number, number];
  readonly y: readonly [number, number];
  readonly z: readonly [number, number];
} {
  let minX = Infinity; let maxX = -Infinity;
  let minY = Infinity; let maxY = -Infinity;
  let minZ = Infinity; let maxZ = -Infinity;
  for (let index = 0; index < values.length; index += 3) {
    minX = Math.min(minX, values[index]!);
    maxX = Math.max(maxX, values[index]!);
    minY = Math.min(minY, values[index + 1]!);
    maxY = Math.max(maxY, values[index + 1]!);
    minZ = Math.min(minZ, values[index + 2]!);
    maxZ = Math.max(maxZ, values[index + 2]!);
  }
  return { x: [minX, maxX], y: [minY, maxY], z: [minZ, maxZ] };
}

it('spreads bubbles across all screen-facing depth bands', () => {
  const first = new UnderwaterParticles();
  const second = new UnderwaterParticles();
  const firstValues = Array.from(
    first.bubbles.geometry.getAttribute('basePosition').array as Float32Array,
  );
  const secondValues = Array.from(
    second.bubbles.geometry.getAttribute('basePosition').array as Float32Array,
  );
  expect(firstValues).toEqual(secondValues);

  const bounds = ranges(Float32Array.from(firstValues));
  expect(bounds.x[0]).toBeLessThan(-28);
  expect(bounds.x[1]).toBeGreaterThan(28);
  expect(bounds.y[0]).toBeLessThan(0);
  expect(bounds.y[1]).toBeGreaterThan(8);
  expect(bounds.z[0]).toBeLessThan(-30);
  expect(bounds.z[1]).toBeGreaterThan(3);

  first.dispose();
  second.dispose();
});
```

- [ ] **Step 2: Run the particle test and confirm failure**

Run: `npm test -- tests/UnderwaterParticles.test.ts`

Expected: FAIL because the current horizontal spread does not reach both full-view limits.

- [ ] **Step 3: Replace the particle placement loop**

Keep `BUBBLE_COUNT` at 144 and `MATTER_COUNT` at 180. Replace the current modulo spread with a deterministic row, column, and depth-band distribution:

```ts
const columns = bubbles ? 12 : 15;
const rows = Math.ceil(count / columns);
for (let index = 0; index < count; index += 1) {
  const offset = index * 3;
  const column = index % columns;
  const row = Math.floor(index / columns);
  const horizontal = columns === 1 ? 0.5 : column / (columns - 1);
  const vertical = rows === 1 ? 0.5 : row / (rows - 1);
  const depthBand = (column * 5 + row * 7) % 8;
  const spread = 7.5 + depthBand * 4.2;
  const jitterX = ((index * 17) % 11 - 5) * 0.11;
  const jitterY = ((index * 13) % 9 - 4) * 0.07;
  basePositions[offset] = (horizontal * 2 - 1) * spread + jitterX;
  basePositions[offset + 1] = -0.55 + vertical * 9.1 + jitterY;
  basePositions[offset + 2] = 4.4 - depthBand * 5.1 - (row % 3) * 0.35;
  phases[index] = ((index * 11) % count) / count * Math.PI * 2;
}
```

Keep the shader update uniform-only. Do not add per-frame buffer writes.

- [ ] **Step 4: Run the particle tests and confirm success**

Run: `npm test -- tests/UnderwaterParticles.test.ts tests/UnderwaterMenuWorld.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit the particle change**

```powershell
git add src/menu/UnderwaterParticles.ts tests/UnderwaterParticles.test.ts
git commit -m "feat: spread menu bubbles across view"
```

---

### Task 3: Separate fish schools and shark routes

**Files:**
- Modify: `src/menu/menuChoreography.ts`
- Modify: `src/menu/UnderwaterMenuWorld.ts`
- Test: `tests/menuChoreography.test.ts`
- Test: `tests/UnderwaterMenuWorld.test.ts`

**Interfaces:**
- Consumes: `samplePathInto`, fixed `MenuMotionSample` arrays, and `MenuModelLibrary.create`.
- Produces: wider independent actor paths and fish schools with wider internal spacing.

- [ ] **Step 1: Write failing path separation tests**

Append this test to `tests/menuChoreography.test.ts`:

```ts
it('keeps animal groups separated while they cover both sides', () => {
  const sample = createMenuMotionSample();
  const sharkX = [Infinity, -Infinity, Infinity, -Infinity];
  const fishX = [Infinity, -Infinity, Infinity, -Infinity];

  for (let step = 0; step <= 192; step += 1) {
    sampleMenuMotionInto(sample, step * 0.25);
    const sharkDistance = Math.hypot(
      sample.sharks[0].position[0] - sample.sharks[1].position[0],
      sample.sharks[0].position[1] - sample.sharks[1].position[1],
      sample.sharks[0].position[2] - sample.sharks[1].position[2],
    );
    const fishDistance = Math.hypot(
      sample.fishSchools[0].position[0] - sample.fishSchools[1].position[0],
      sample.fishSchools[0].position[1] - sample.fishSchools[1].position[1],
      sample.fishSchools[0].position[2] - sample.fishSchools[1].position[2],
    );
    expect(sharkDistance).toBeGreaterThan(2.2);
    expect(fishDistance).toBeGreaterThan(4);
    sharkX[0] = Math.min(sharkX[0]!, sample.sharks[0].position[0]);
    sharkX[1] = Math.max(sharkX[1]!, sample.sharks[0].position[0]);
    sharkX[2] = Math.min(sharkX[2]!, sample.sharks[1].position[0]);
    sharkX[3] = Math.max(sharkX[3]!, sample.sharks[1].position[0]);
    fishX[0] = Math.min(fishX[0]!, sample.fishSchools[0].position[0]);
    fishX[1] = Math.max(fishX[1]!, sample.fishSchools[0].position[0]);
    fishX[2] = Math.min(fishX[2]!, sample.fishSchools[1].position[0]);
    fishX[3] = Math.max(fishX[3]!, sample.fishSchools[1].position[0]);
  }

  expect(sharkX[0]).toBeLessThan(-15);
  expect(sharkX[3]).toBeGreaterThan(20);
  expect(fishX[0]).toBeLessThan(-14);
  expect(fishX[3]).toBeGreaterThan(16);
});
```

In `tests/UnderwaterMenuWorld.test.ts`, add this assertion after each school is created:

```ts
for (const school of world.fishSchools) {
  const bounds = new Box3().setFromObject(school);
  expect(bounds.getSize(new Vector3()).x).toBeGreaterThan(3.2);
}
```

- [ ] **Step 2: Run the motion tests and confirm failure**

Run: `npm test -- tests/menuChoreography.test.ts tests/UnderwaterMenuWorld.test.ts`

Expected: FAIL because the current fish paths and school spacing remain concentrated near the center.

- [ ] **Step 3: Set distinct wide paths and school spacing**

Use these static path values in `menuChoreography.ts`:

```ts
const SHARK_PATHS = [
  { center: [-8, 3.3, -9] as const, radiusX: 9.5, radiusZ: 3.2, period: 26, phase: 0.2 },
  { center: [9, 5.9, -18] as const, radiusX: 12.5, radiusZ: 4.6, period: 34, phase: 3.5 },
] as const satisfies readonly [EllipsePath, EllipsePath];

const FISH_PATHS = [
  { center: [-9, 2.1, -6.5] as const, radiusX: 6.5, radiusZ: 2, period: 19, phase: 0.7 },
  { center: [10, 3.9, -12.5] as const, radiusX: 7.5, radiusZ: 2.8, period: 23, phase: 3.2 },
] as const satisfies readonly [EllipsePath, EllipsePath];
```

In `createFishSchool`, use 0.72 horizontal spacing, 0.34 vertical spacing, and 0.8 depth spacing:

```ts
fish.position.set(
  (fishIndex - 2.5) * 0.72,
  ((fishIndex + schoolIndex) % 3 - 1) * 0.34,
  (fishIndex % 2) * 0.8 - 0.4,
);
```

Keep `UnderwaterMenuAnimator.update` unchanged so it continues to reuse its motion sample.

- [ ] **Step 4: Run the motion tests and tune only static path values if needed**

Run: `npm test -- tests/menuChoreography.test.ts tests/UnderwaterMenuWorld.test.ts`

Expected: PASS with no new allocations in the animator.

- [ ] **Step 5: Commit the actor motion change**

```powershell
git add src/menu/menuChoreography.ts src/menu/UnderwaterMenuWorld.ts tests/menuChoreography.test.ts tests/UnderwaterMenuWorld.test.ts
git commit -m "feat: spread underwater menu animals"
```

---

### Task 4: Centralize static placements and reject clipping

**Files:**
- Create: `src/menu/MenuSceneLayout.ts`
- Modify: `src/menu/UnderwaterMenuWorld.ts`
- Modify: `src/menu/UnderwaterPlantField.ts`
- Create: `tests/MenuSceneLayout.test.ts`
- Test: `tests/UnderwaterMenuWorld.test.ts`

**Interfaces:**
- Produces: `MenuGroundPlacement`, `MENU_MODEL_PLACEMENTS`, `MENU_PROTECTED_FOOTPRINTS`, and `findMenuPlacementOverlaps`.
- Consumes: placement arrays in `UnderwaterMenuWorld` and protected footprints in `UnderwaterPlantField`.

- [ ] **Step 1: Write the failing static layout test**

```ts
import { expect, it } from 'vitest';
import {
  MENU_MODEL_PLACEMENTS,
  MENU_PROTECTED_FOOTPRINTS,
  findMenuPlacementOverlaps,
} from '../src/menu/MenuSceneLayout';

it('keeps every static model outside other model footprints', () => {
  expect(findMenuPlacementOverlaps([
    ...MENU_PROTECTED_FOOTPRINTS,
    ...MENU_MODEL_PLACEMENTS,
  ])).toEqual([]);
});

it('fills both sides and every depth layer', () => {
  const xs = MENU_MODEL_PLACEMENTS.map(({ position }) => position[0]);
  const zs = MENU_MODEL_PLACEMENTS.map(({ position }) => position[2]);
  expect(Math.min(...xs)).toBeLessThan(-25);
  expect(Math.max(...xs)).toBeGreaterThan(25);
  expect(Math.min(...zs)).toBeLessThan(-35);
  expect(zs.some((z) => z > -8)).toBe(true);
  expect(zs.some((z) => z <= -8 && z > -20)).toBe(true);
  expect(zs.some((z) => z <= -20)).toBe(true);
});
```

- [ ] **Step 2: Run the new layout test and confirm failure**

Run: `npm test -- tests/MenuSceneLayout.test.ts`

Expected: FAIL because `MenuSceneLayout.ts` does not exist.

- [ ] **Step 3: Create the pure layout module**

Define the exact data shapes and overlap function:

```ts
export interface MenuGroundPlacement {
  readonly id: string;
  readonly modelId: 'rockA' | 'rockB' | 'rockC' | 'coral' | 'seaweed' | 'starfish' | 'skull';
  readonly position: readonly [number, number, number];
  readonly rotation: readonly [number, number, number];
  readonly halfSize: readonly [number, number];
}

export interface MenuGroundFootprint {
  readonly id: string;
  readonly position: readonly [number, number, number];
  readonly halfSize: readonly [number, number];
}

export function findMenuPlacementOverlaps(
  placements: readonly MenuGroundFootprint[],
): readonly (readonly [string, string])[] {
  const overlaps: Array<readonly [string, string]> = [];
  for (let first = 0; first < placements.length; first += 1) {
    for (let second = first + 1; second < placements.length; second += 1) {
      const a = placements[first]!;
      const b = placements[second]!;
      const separatedX = Math.abs(a.position[0] - b.position[0])
        >= a.halfSize[0] + b.halfSize[0];
      const separatedZ = Math.abs(a.position[2] - b.position[2])
        >= a.halfSize[1] + b.halfSize[1];
      if (!separatedX && !separatedZ) overlaps.push([a.id, b.id]);
    }
  }
  return overlaps;
}
```

Add protected footprints for both signs, the small boat, and Dorothy. Use Dorothy's side-on ground footprint as `[9.2, 2.9]` at `[1.6, 0.08, -19.5]`. Add 18 rock placements, 10 coral placements, 14 seaweed placements, one starfish placement, and one skull placement. Use the manifest target dimensions to set conservative half-sizes. Space all AABBs so `findMenuPlacementOverlaps` returns an empty array.

- [ ] **Step 4: Make the world consume layout data**

Remove `ROCK_PLACEMENTS`, `CORAL_PLACEMENTS`, and `SEAWEED_POSITIONS` from `UnderwaterMenuWorld.ts`. Import `MENU_MODEL_PLACEMENTS`, group entries by `modelId` once in the constructor, create one model per entry, and apply each entry's position and rotation.

Update the expected counts in `tests/UnderwaterMenuWorld.test.ts` to 6 copies of each rock model, 10 coral models, and 14 static seaweed models.

In `UnderwaterPlantField.ts`, move any procedural kelp point that enters a protected footprint toward the nearest free X edge. Perform this only during construction. Keep the instance matrix update path unchanged.

- [ ] **Step 5: Run the layout and world tests**

Run: `npm test -- tests/MenuSceneLayout.test.ts tests/UnderwaterMenuWorld.test.ts`

Expected: PASS with no static footprint overlap.

- [ ] **Step 6: Commit the layout change**

```powershell
git add src/menu/MenuSceneLayout.ts src/menu/UnderwaterMenuWorld.ts src/menu/UnderwaterPlantField.ts tests/MenuSceneLayout.test.ts tests/UnderwaterMenuWorld.test.ts
git commit -m "feat: spread menu props without clipping"
```

---

### Task 5: Improve low-poly sand and widen the distant seabed

**Files:**
- Modify: `src/menu/UnderwaterMenuWorld.ts`
- Modify: `src/menu/DistantSeabed.ts`
- Test: `tests/UnderwaterMenuWorld.test.ts`
- Test: `tests/DistantSeabed.test.ts`

**Interfaces:**
- Consumes: existing `menu:seabed`, `menu:caustic-overlay`, and `DistantSeabed` component contracts.
- Produces: deterministic sand height and color attributes plus wider terrain layers.

- [ ] **Step 1: Write failing sand and horizon tests**

Add these assertions to the existing menu world test:

```ts
const sandPosition = seabed.geometry.getAttribute('position');
const sandColor = seabed.geometry.getAttribute('color');
expect(sandColor).toBeDefined();
expect(sandColor.count).toBe(sandPosition.count);
let minHeight = Infinity;
let maxHeight = -Infinity;
const colors = new Set<string>();
for (let index = 0; index < sandPosition.count; index += 1) {
  minHeight = Math.min(minHeight, sandPosition.getY(index));
  maxHeight = Math.max(maxHeight, sandPosition.getY(index));
  colors.add([
    sandColor.getX(index).toFixed(3),
    sandColor.getY(index).toFixed(3),
    sandColor.getZ(index).toFixed(3),
  ].join(':'));
}
expect(maxHeight - minHeight).toBeGreaterThan(0.55);
expect(colors.size).toBeGreaterThan(8);
expect((seabed.material as MeshStandardMaterial).vertexColors).toBe(true);
```

Update `tests/DistantSeabed.test.ts` to expect:

```ts
expect(DISTANT_ROCK_COUNT).toBe(24);
expect(DISTANT_PLANT_COUNT).toBe(36);
expect(DISTANT_DEBRIS_COUNT).toBe(20);
expect(bounds.getSize(new Vector3()).x).toBeGreaterThan(165);

const detailGroups = [
  distant.root.getObjectByName('menu:distant-rocks')!,
  distant.root.getObjectByName('menu:distant-plants')!,
  distant.root.getObjectByName('menu:distant-debris')!,
];
const details = detailGroups.flatMap((group) => group.children);
for (let firstIndex = 0; firstIndex < details.length; firstIndex += 1) {
  const firstBounds = new Box3().setFromObject(details[firstIndex]!);
  for (let secondIndex = firstIndex + 1; secondIndex < details.length; secondIndex += 1) {
    const secondBounds = new Box3().setFromObject(details[secondIndex]!);
    expect(firstBounds.intersectsBox(secondBounds), [
      details[firstIndex]!.name,
      details[secondIndex]!.name,
    ].join(' overlaps ')).toBe(false);
  }
}
```

- [ ] **Step 2: Run the terrain tests and confirm failure**

Run: `npm test -- tests/UnderwaterMenuWorld.test.ts tests/DistantSeabed.test.ts`

Expected: FAIL because the sand has no vertex color and the distant counts remain smaller.

- [ ] **Step 3: Add deterministic low-poly sand variation**

In `createSeabed`, keep the 140-by-100 plane and calculate each vertex with low-frequency dunes plus small ripples:

```ts
const dune = Math.sin(x * 0.12) * 0.22
  + Math.cos(z * 0.16) * 0.18
  + Math.sin((x + z) * 0.08) * 0.14;
const ripple = Math.sin(z * 1.35 + Math.sin(x * 0.18)) * 0.045
  + Math.sin(x * 0.75 + z * 0.31) * 0.025;
const height = dune + ripple;
position.setY(index, height);
const shade = 0.88 + Math.sin(x * 0.31 + z * 0.19) * 0.055
  + Math.cos(z * 0.47) * 0.035;
color.setXYZ(index, 0.46 * shade, 0.43 * shade, 0.33 * shade);
```

Create `color` as a `Float32BufferAttribute(position.count * 3, 3)`. Attach it as `geometry.setAttribute('color', color)`. Set `vertexColors: true` and keep `flatShading: true` on the sand material.

- [ ] **Step 4: Widen distant terrain and decoration layers**

Set mountain widths to 104, 138, and 172. Keep their heights increasing at 6.2, 10.8, and 17.5. Add six distant rock entries, eight plant entries, and six debris entries. Put half on each side. Keep their X values outside the central Dorothy footprint when Z lies between -16 and -23. Continue to share one geometry and one material per detail type.

- [ ] **Step 5: Run terrain tests and confirm success**

Run: `npm test -- tests/UnderwaterMenuWorld.test.ts tests/DistantSeabed.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit the terrain change**

```powershell
git add src/menu/UnderwaterMenuWorld.ts src/menu/DistantSeabed.ts tests/UnderwaterMenuWorld.test.ts tests/DistantSeabed.test.ts
git commit -m "feat: improve underwater menu terrain"
```

---

### Task 6: Verify the complete scene and correct visible intersections

**Files:**
- Modify only files from Tasks 1 through 5 when a verification result proves a defect.
- Test: `tests/SunkenDorothyWreck.test.ts`
- Test: `tests/UnderwaterParticles.test.ts`
- Test: `tests/menuChoreography.test.ts`
- Test: `tests/MenuSceneLayout.test.ts`
- Test: `tests/UnderwaterMenuWorld.test.ts`
- Test: `tests/DistantSeabed.test.ts`

**Interfaces:**
- Consumes: the complete menu scene.
- Produces: a verified composition with no known clipping at supported browser sizes.

- [ ] **Step 1: Run all focused menu tests**

Run:

```powershell
npm test -- tests/SunkenDorothyWreck.test.ts tests/UnderwaterParticles.test.ts tests/menuChoreography.test.ts tests/MenuSceneLayout.test.ts tests/UnderwaterMenuWorld.test.ts tests/DistantSeabed.test.ts tests/MenuSigns.test.ts tests/MainMenuController.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run the complete automated checks**

Run:

```powershell
npm test
npm run build
npm run models:check:menu
```

Expected: all tests pass, the production build completes, and the menu model audit reports success.

- [ ] **Step 3: Inspect the menu at three viewport sizes**

Start the existing Vite development server. Open `/dont-sleep-with-the-fishes/` in the in-app browser. Inspect 1365-by-768, 1920-by-1080, and 2560-by-1080 viewports.

At each size, confirm:

- Dorothy stays behind the boat and shows its long side.
- Dorothy does not enter the boat, mountain, rock, or plant silhouettes.
- The boat, skull, signs, coral, rocks, seaweed, and kelp do not visibly intersect.
- Bubbles appear at the center, both sides, top edge, and corners.
- Fish schools and sharks remain separated through one complete 34-second loop.
- Sand covers the full lower view and shows low-poly dunes, ripples, and color variation.
- Props fill both sides without hiding the main boat and Dorothy silhouettes.

- [ ] **Step 4: Apply proven numeric placement corrections**

When the browser inspection finds an intersection, change only the responsible static position, path center, path radius, or protected half-size. Add the corrected value to the matching focused test before changing the source value. Repeat Steps 1 through 3 after each correction.

- [ ] **Step 5: Commit verification corrections**

If Step 4 changed files, stage only those files and commit:

```powershell
git commit -m "fix: refine underwater menu composition"
```

If Step 4 made no changes, do not create an empty commit.

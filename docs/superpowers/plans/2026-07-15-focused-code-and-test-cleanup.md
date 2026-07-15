# Focused Code and Test Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove dead production code, consolidate repeated ownership and formatting logic, and keep a smaller test suite focused on gameplay, accessibility, asset integrity, navigation, and lifecycle contracts.

**Architecture:** Keep existing subsystem boundaries. Add one UI duration formatter and one scene-resource utility, move pure test fixtures into `tests/helpers`, and delete tests that pin decorative or historical implementation details. Preserve runtime behavior, resource ownership, and cleanup error semantics.

**Tech Stack:** TypeScript 5.9, Three.js 0.180, Vitest 3.2, Vite 7.1, Bun

## Global Constraints

- Kenney remains the sole third-party asset store.
- Production code must use committed local assets and must not fetch runtime assets.
- Do not change gameplay, UI appearance, ship layout, asset files, or provenance records.
- Preserve accessibility, asset integrity, navigation and collision safety, and resource ownership contracts.
- Preserve cleanup order and the rule that cleanup continues before the first failure is rethrown.
- Do not create shared abstractions for incidental local arithmetic or declarative layout data.
- Run `bun run models:check`, `bun run test`, `bun run typecheck`, and `bun run build` before completion.

## File structure

**Create:**

- `src/ui/formatDuration.ts`: shared `MM:SS` formatting.
- `src/world/SceneResources.ts`: mesh resource collection and disposal.
- `tests/SceneResources.test.ts`: focused ownership tests for the shared resource utility.
- `tests/helpers/random.ts`: deterministic sequence random source for tests.
- `tests/helpers/waterExclusion.ts`: CPU containment helper for water-exclusion tests.
- `tests/helpers/boatStorage.ts`: model-envelope measurement for boat layout tests.

**Modify:**

- `src/Game.ts`, `src/game/GameLoop.ts`, `src/game/ItemState.ts`, `src/ui/uiArtwork.ts`, `src/world/ShipLayout.ts`: remove dead members and exports.
- `src/survival/random.ts`, `src/ocean/WaterExclusion.ts`, `src/world/BoatStorage.ts`: remove test-only helpers.
- `src/ui/GameUI.ts`, `src/ui/SurvivalUI.ts`: consume `formatDuration`.
- `src/app/launchGame.ts`: centralize owned game/asset cleanup.
- `src/world/World.ts`, `src/survival/BoatWorld.ts`, `src/world/PropModelLibrary.ts`, `src/world/ShipFurnitureLibrary.ts`: consume `SceneResources` without changing ownership.
- Focused test files listed in Tasks 5 through 7: remove duplicate, decorative, historical, or dead-code coverage.

**Delete:**

- `src/game/scoring.ts` and `tests/scoring.test.ts`: isolated unused feature.
- `tests/Environment.test.ts`: one decorative shadow-map constant assertion.

---

### Task 1: Remove confirmed dead production code

**Files:**
- Modify: `src/Game.ts:68-74,250-256`
- Modify: `src/game/GameLoop.ts:64-98`
- Modify: `src/game/ItemState.ts:40,49-51`
- Modify: `src/ui/uiArtwork.ts:1,7`
- Modify: `src/world/ShipLayout.ts:292-306`
- Modify: `src/world/Lifeboat.ts:20-23`
- Modify: `src/survival/BoatWorld.ts:55`
- Modify: `tests/GameLoop.test.ts:112-144`
- Modify: `tests/UIArtwork.test.ts:1-10`
- Modify: `tests/Lifeboat.test.ts:1-40`
- Modify: `tests/world.test.ts:30,578-594`
- Modify: `tests/smoke.test.ts:5,25-32`
- Delete: `src/game/scoring.ts`
- Delete: `tests/scoring.test.ts`

**Interfaces:**
- Consumes: Existing runtime imports and the approved design spec.
- Produces: Production modules with no known runtime-dead exports; unchanged runtime APIs used by the game.

- [ ] **Step 1: Record the baseline**

Run:

```powershell
$srcLines = (Get-ChildItem src -Recurse -File -Filter *.ts | Get-Content | Measure-Object -Line).Lines
$testLines = (Get-ChildItem tests -Recurse -File -Filter *.ts | Get-Content | Measure-Object -Line).Lines
$testCases = (rg '^\s*(it|test)\(' tests | Measure-Object -Line).Lines
"source=$srcLines tests=$testLines cases=$testCases"
bun run test
```

Expected: `source=10909 tests=11522 cases=484`; Vitest exits 0.

- [ ] **Step 2: Remove dead fields, functions, constants, and modules**

Apply these deletions:

```diff
- private mount!: HTMLElement;
- private reducedMotion!: MediaQueryList;
```

Remove `this.mount = mount` and `this.reducedMotion = reducedMotion` from `Game.initialize`; keep `mount` and `reducedMotion` in `this.context`.

Delete `GameLifecycleActions` and `GameLifecycle` from `GameLoop.ts`. Delete the two `GameLoop.test.ts` cases named:

```text
exits an owned pointer lock and disposes every owned resource exactly once
does not exit pointer lock when another element owns it
```

Delete these unused declarations:

```text
itemDefinition
createInitialItemState
ITEM_ARTWORK_IDS
cabinetTopSurfaces
LIFEBOAT_DIMENSIONS
WEATHER_IDS
```

Remove imports and assertions that exist only for `ITEM_ARTWORK_IDS`, `LIFEBOAT_DIMENSIONS`, and `WEATHER_IDS`. Delete the `world.test.ts` case `uses the shared detailed lifeboat at its authored size`; keep gameplay-bound assertions in `Lifeboat.test.ts`.

Delete `src/game/scoring.ts` and `tests/scoring.test.ts`.

- [ ] **Step 3: Verify that no deleted symbol remains referenced**

Run:

```powershell
rg -n 'GameLifecycle|GameLifecycleActions|itemDefinition|createInitialItemState|ITEM_ARTWORK_IDS|cabinetTopSurfaces|LIFEBOAT_DIMENSIONS|WEATHER_IDS|gradeForSavedCount' src tests
```

Expected: exit 1 with no matches.

- [ ] **Step 4: Run focused verification**

Run:

```powershell
bunx vitest run tests/GameLoop.test.ts tests/UIArtwork.test.ts tests/Lifeboat.test.ts tests/world.test.ts tests/smoke.test.ts
bun run typecheck
```

Expected: all selected tests pass; TypeScript exits 0.

- [ ] **Step 5: Commit**

```powershell
git add -- src/Game.ts src/game/GameLoop.ts src/game/ItemState.ts src/ui/uiArtwork.ts src/world/ShipLayout.ts src/world/Lifeboat.ts src/survival/BoatWorld.ts tests/GameLoop.test.ts tests/UIArtwork.test.ts tests/Lifeboat.test.ts tests/world.test.ts tests/smoke.test.ts src/game/scoring.ts tests/scoring.test.ts
git commit -m "refactor: remove unused game code"
```

### Task 2: Move pure test utilities out of production

**Files:**
- Create: `tests/helpers/random.ts`
- Create: `tests/helpers/waterExclusion.ts`
- Create: `tests/helpers/boatStorage.ts`
- Modify: `src/survival/random.ts:16-25`
- Modify: `src/ocean/WaterExclusion.ts:1,20-28`
- Modify: `src/world/BoatStorage.ts:1,4,81-96`
- Modify: `tests/SurvivalSession.test.ts`
- Modify: `tests/SurvivalUI.test.ts`
- Modify: `tests/survivalEvents.test.ts`
- Modify: `tests/survivalInventory.test.ts`
- Modify: `tests/WaterExclusion.test.ts`
- Modify: `tests/world.test.ts`
- Modify: `tests/BoatStorage.test.ts`

**Interfaces:**
- Consumes: `RandomSource`, `WaterExclusionRegion`, `BOAT_STORAGE_CLEARANCE` value `0.05`.
- Produces: `sequenceRandom(values): RandomSource`, `pointInWaterExclusion(point, region): boolean`, `measureBoatStorageEnvelope(root, clearance?): Box2`, and `boatStorageEnvelopesOverlap(first, second): boolean` under `tests/helpers`.

- [ ] **Step 1: Redirect one import for each helper and verify failure**

Change one representative import per helper to the future test path:

```ts
import { sequenceRandom } from './helpers/random';
import { pointInWaterExclusion } from './helpers/waterExclusion';
import {
  boatStorageEnvelopesOverlap,
  measureBoatStorageEnvelope,
} from './helpers/boatStorage';
```

Run:

```powershell
bunx vitest run tests/survivalEvents.test.ts tests/WaterExclusion.test.ts tests/BoatStorage.test.ts
```

Expected: FAIL because the three helper modules do not exist.

- [ ] **Step 2: Add the deterministic random helper**

Create `tests/helpers/random.ts`:

```ts
import type { RandomSource } from '../../src/survival/survivalTypes';

export function sequenceRandom(values: readonly number[]): RandomSource {
  let index = 0;
  return {
    next(): number {
      const raw = values.length === 0 ? 0 : values[index++ % values.length]!;
      return Math.min(0.999999, Math.max(0, raw));
    },
  };
}
```

Delete `sequenceRandom` from `src/survival/random.ts`. Update all tests that imported it from production.

- [ ] **Step 3: Add the water-exclusion test helper**

Create `tests/helpers/waterExclusion.ts`:

```ts
import { Vector3 } from 'three';
import type { WaterExclusionRegion } from '../../src/ocean/WaterExclusion';

export function pointInWaterExclusion(
  point: Vector3,
  region: WaterExclusionRegion,
): boolean {
  const local = point.clone().applyMatrix4(region.worldToLocal);
  return local.x >= region.bounds.x && local.x <= region.bounds.y
    && local.z >= region.bounds.z && local.z <= region.bounds.w;
}
```

Delete `pointInWaterExclusion` and the unused `Vector3` import from production. Update `WaterExclusion.test.ts` and `world.test.ts`.

- [ ] **Step 4: Add the boat-envelope test helper**

Create `tests/helpers/boatStorage.ts`:

```ts
import { Box2, Box3, type Object3D, Vector2 } from 'three';

const BOAT_STORAGE_CLEARANCE = 0.05;

export function measureBoatStorageEnvelope(
  root: Object3D,
  clearance = BOAT_STORAGE_CLEARANCE,
): Box2 {
  root.updateWorldMatrix(true, true);
  const bounds = new Box3().setFromObject(root);
  if (bounds.isEmpty()) throw new Error(`Cannot measure empty boat prop ${root.name}`);
  return new Box2(
    new Vector2(bounds.min.x - clearance, bounds.min.z - clearance),
    new Vector2(bounds.max.x + clearance, bounds.max.z + clearance),
  );
}

export function boatStorageEnvelopesOverlap(first: Box2, second: Box2): boolean {
  return first.intersectsBox(second);
}
```

Delete both functions, `BOAT_STORAGE_CLEARANCE`, and the unused `Box2`, `Box3`, `Object3D`, and `Vector2` imports from `src/world/BoatStorage.ts`. Update `BoatStorage.test.ts`.

- [ ] **Step 5: Run focused verification**

Run:

```powershell
bunx vitest run tests/SurvivalSession.test.ts tests/SurvivalUI.test.ts tests/survivalEvents.test.ts tests/survivalInventory.test.ts tests/WaterExclusion.test.ts tests/world.test.ts tests/BoatStorage.test.ts
bun run typecheck
```

Expected: all selected tests pass; TypeScript exits 0.

- [ ] **Step 6: Commit**

```powershell
git add -- src/survival/random.ts src/ocean/WaterExclusion.ts src/world/BoatStorage.ts tests/helpers/random.ts tests/helpers/waterExclusion.ts tests/helpers/boatStorage.ts tests/SurvivalSession.test.ts tests/SurvivalUI.test.ts tests/survivalEvents.test.ts tests/survivalInventory.test.ts tests/WaterExclusion.test.ts tests/world.test.ts tests/BoatStorage.test.ts
git commit -m "refactor: isolate test-only helpers"
```

### Task 3: Share duration formatting and launch ownership cleanup

**Files:**
- Create: `src/ui/formatDuration.ts`
- Modify: `src/ui/GameUI.ts:1-11,156,183`
- Modify: `src/ui/SurvivalUI.ts:129-134,576`
- Modify: `src/app/launchGame.ts:185-265`
- Modify: `tests/smoke.test.ts:8,38-52`
- Test: `tests/launchGame.test.ts`

**Interfaces:**
- Consumes: seconds as an arbitrary number; current `game` and `unownedAssets` ownership state.
- Produces: `formatDuration(seconds: number): string`; local `disposeCurrentOwnership(): void` inside `launchGame`.

- [ ] **Step 1: Point the duration contract at the new module**

Change `tests/smoke.test.ts` to import:

```ts
import { formatDuration } from '../src/ui/formatDuration';
```

Keep the existing cases for negative, fractional, minute, and multi-minute inputs, but call `formatDuration`.

Run:

```powershell
bunx vitest run tests/smoke.test.ts
```

Expected: FAIL because `src/ui/formatDuration.ts` does not exist.

- [ ] **Step 2: Add and adopt the shared formatter**

Create `src/ui/formatDuration.ts`:

```ts
export function formatDuration(seconds: number): string {
  const safe = Math.max(0, Math.ceil(seconds));
  const minutes = Math.floor(safe / 60).toString().padStart(2, '0');
  const remainder = (safe % 60).toString().padStart(2, '0');
  return `${minutes}:${remainder}`;
}
```

Import it in `GameUI.ts` and `SurvivalUI.ts`. Replace `formatCountdown` and `formatElapsed` calls, then delete both local functions.

- [ ] **Step 3: Centralize launch ownership cleanup**

Inside `launchGame`, after `game` and `unownedAssets` declarations, add:

```ts
const disposeCurrentOwnership = (): void => {
  if (game !== null) {
    game.dispose();
    game = null;
    return;
  }
  if (unownedAssets !== null) {
    disposeGameAssets(unownedAssets);
    unownedAssets = null;
  }
};
```

Use it in cancellation after construction, cancellation after `start`, the `catch` block, and `cancel()`. Do not change the conditions that render a WebGL failure.

- [ ] **Step 4: Run focused verification**

Run:

```powershell
bunx vitest run tests/smoke.test.ts tests/GameUI.test.ts tests/SurvivalUI.test.ts tests/launchGame.test.ts
bun run typecheck
```

Expected: all selected tests pass; TypeScript exits 0.

- [ ] **Step 5: Commit**

```powershell
git add -- src/ui/formatDuration.ts src/ui/GameUI.ts src/ui/SurvivalUI.ts src/app/launchGame.ts tests/smoke.test.ts
git commit -m "refactor: share UI and launch cleanup helpers"
```

### Task 4: Consolidate mesh resource ownership

**Files:**
- Create: `src/world/SceneResources.ts`
- Create: `tests/SceneResources.test.ts`
- Modify: `src/world/World.ts:1-13,35-68,145-183,296-308`
- Modify: `src/survival/BoatWorld.ts:117-128,471-497`
- Modify: `src/world/PropModelLibrary.ts:45-60,285-289`
- Modify: `src/world/ShipFurnitureLibrary.ts:132-154,226-230`
- Test: `tests/world.test.ts`
- Test: `tests/BoatWorld.test.ts`
- Test: `tests/PropModelLibrary.test.ts`
- Test: `tests/ShipFurnitureLibrary.test.ts`

**Interfaces:**
- Consumes: a Three.js `Object3D`, caller-owned geometry and material sets.
- Produces: `collectMeshResources(root, geometries, materials, onAdd?)` and `disposeMeshResources(geometries, materials)`.

- [ ] **Step 1: Write failing tests for deduplication, order, and disposal**

Create `tests/SceneResources.test.ts`:

```ts
import {
  BoxGeometry,
  type BufferGeometry,
  Group,
  type Material,
  Mesh,
  MeshBasicMaterial,
} from 'three';
import { describe, expect, it, vi } from 'vitest';
import {
  collectMeshResources,
  disposeMeshResources,
  type MeshResourceAddition,
} from '../src/world/SceneResources';

describe('scene resources', () => {
  it('collects each geometry and material once in traversal order', () => {
    const root = new Group();
    const geometry = new BoxGeometry();
    const first = new MeshBasicMaterial();
    const second = new MeshBasicMaterial();
    root.add(new Mesh(geometry, [first, second]), new Mesh(geometry, first));
    const geometries = new Set<BufferGeometry>();
    const materials = new Set<Material>();
    const additions: MeshResourceAddition[] = [];

    collectMeshResources(root, geometries, materials, (addition) => additions.push(addition));

    expect([...geometries]).toEqual([geometry]);
    expect([...materials]).toEqual([first, second]);
    expect(additions.map(({ kind }) => kind)).toEqual(['geometry', 'material', 'material']);
  });

  it('disposes and clears each owned set', () => {
    const geometry = new BoxGeometry();
    const material = new MeshBasicMaterial();
    const geometryDispose = vi.spyOn(geometry, 'dispose');
    const materialDispose = vi.spyOn(material, 'dispose');
    const geometries = new Set([geometry]);
    const materials = new Set([material]);

    disposeMeshResources(geometries, materials);

    expect(geometryDispose).toHaveBeenCalledOnce();
    expect(materialDispose).toHaveBeenCalledOnce();
    expect(geometries.size).toBe(0);
    expect(materials.size).toBe(0);
  });
});
```

Run:

```powershell
bunx vitest run tests/SceneResources.test.ts
```

Expected: FAIL because `SceneResources.ts` does not exist.

- [ ] **Step 2: Implement the shared resource utility**

Create `src/world/SceneResources.ts`:

```ts
import { type BufferGeometry, type Material, Mesh, type Object3D } from 'three';

export type MeshResourceAddition =
  | { readonly kind: 'geometry'; readonly resource: BufferGeometry }
  | { readonly kind: 'material'; readonly resource: Material };

export function collectMeshResources(
  root: Object3D,
  geometries: Set<BufferGeometry>,
  materials: Set<Material>,
  onAdd?: (addition: MeshResourceAddition) => void,
): void {
  root.traverse((object) => {
    if (!(object instanceof Mesh)) return;
    if (!geometries.has(object.geometry)) {
      geometries.add(object.geometry);
      onAdd?.({ kind: 'geometry', resource: object.geometry });
    }
    const meshMaterials = Array.isArray(object.material) ? object.material : [object.material];
    meshMaterials.forEach((material) => {
      if (materials.has(material)) return;
      materials.add(material);
      onAdd?.({ kind: 'material', resource: material });
    });
  });
}

export function disposeMeshResources(
  geometries: Set<BufferGeometry>,
  materials: Set<Material>,
): void {
  geometries.forEach((geometry) => geometry.dispose());
  materials.forEach((material) => material.dispose());
  geometries.clear();
  materials.clear();
}
```

Run the new test and expect PASS.

- [ ] **Step 3: Refactor `World` without changing rollback order**

Replace `collectOwnedResources` with `collectMeshResources`. Use its callback to append rollback work in discovery order:

```ts
collectMeshResources(root, this.ownedGeometries, this.ownedMaterials, ({ kind, resource }) => {
  rollback.push(() => {
    try {
      resource.dispose();
    } finally {
      if (kind === 'geometry') this.ownedGeometries.delete(resource);
      else this.ownedMaterials.delete(resource);
    }
  });
});
```

Use `disposeMeshResources` in `World.dispose`, then dispose and clear textures in their current position.

- [ ] **Step 4: Refactor the other scene owners**

Use `collectMeshResources` in `BoatWorld`, `PropModelLibrary`, and `ShipFurnitureLibrary`.

Use `disposeMeshResources` in `BoatWorld` and `PropModelLibrary`. In `ShipFurnitureLibrary`, collect material textures from the shared material set, then keep its current disposal order:

```ts
geometries.forEach((geometry) => geometry.dispose());
textures.forEach((texture) => texture.dispose());
materials.forEach((material) => material.dispose());
```

Do not collect material textures in `World` or `BoatWorld`; those owners already track textures through their build results.

- [ ] **Step 5: Run ownership and rollback verification**

Run:

```powershell
bunx vitest run tests/SceneResources.test.ts tests/world.test.ts tests/BoatWorld.test.ts tests/PropModelLibrary.test.ts tests/ShipFurnitureLibrary.test.ts tests/GameLifecycle.test.ts
bun run typecheck
```

Expected: all selected tests pass, including strict rollback order and shared-versus-owned checks.

- [ ] **Step 6: Commit**

```powershell
git add -- src/world/SceneResources.ts tests/SceneResources.test.ts src/world/World.ts src/survival/BoatWorld.ts src/world/PropModelLibrary.ts src/world/ShipFurnitureLibrary.ts
git commit -m "refactor: share scene resource ownership"
```

### Task 5: Prune decorative and duplicate UI tests

**Files:**
- Modify: `tests/GameUI.test.ts`
- Modify: `tests/SurvivalUI.test.ts`
- Modify: `tests/UIArtwork.test.ts`

**Interfaces:**
- Consumes: Existing DOM behavior and accessibility contracts.
- Produces: UI suites centered on commands, focus, announcements, state, and accessible geometry.

- [ ] **Step 1: Confirm the retained UI behavior before pruning**

Run:

```powershell
bunx vitest run tests/GameUI.test.ts tests/SurvivalUI.test.ts tests/UIArtwork.test.ts
```

Expected: all tests pass.

- [ ] **Step 2: Delete decorative `GameUI` assertions**

Delete the `it` blocks with these exact titles:

```text
defines the illustrated global and scavenging presentation contracts
centers every scavenging poster screen and its vignette
wraps every scavenging screen in one bounded content region
keeps scavenging screens centered at narrow viewport widths
guards every illustrated action hover and active selector from disabled states
defines larger top-center circles at desktop and narrow widths
defines red-ink danger and transform-opacity-only critical sinking treatments
renders the illustrated scavenging hierarchy without losing state hooks
```

Keep the contrast assertion, capacity behavior, terminal layers, live-region behavior, pointer-lock failure, compatibility failure, and disposal test.

- [ ] **Step 3: Delete decorative or duplicate `SurvivalUI` assertions**

Delete the `it` blocks with these exact titles:

```text
defines illustrated survival, tooltip, and cinematic overlay contracts
centers survival HUD zones, overlay content, and vignette backing
styles the journal as a centered bounded paper page with reduced-motion support
wraps every survival cinematic overlay in one bounded content region
marks left, right, and top-edge anchors for on-screen tooltip placement
keeps meter and action nodes stable across differential renders
renders illustrated conditions and journal status without persistent tallies
keeps day, phase, weather, and artwork in one journal marker
```

Keep the minimum target-size test, clipped edge-tooltip test, reduced-motion behavior outside CSS-source assertions, command routing, modal isolation, focus restoration, announcements, and disposal.

- [ ] **Step 4: Replace artwork enumeration with one accessibility contract**

Delete these catalog-wide `UIArtwork.test.ts` cases because the typed `Record<ItemId, string>` and `Record<UiArtworkId, string>` enforce complete catalogs:

```text
renders one decorative portrait for every scavenging item type
renders every original symbol as decorative inline SVG
```

Replace them with one representative contract that covers both artwork functions:

```ts
it('renders local decorative inline SVG for item and UI artwork', () => {
  [itemArtwork('cannedFood'), uiArtwork('warning')].forEach((markup) => {
    expect(markup).toContain('<svg');
    expect(markup).toContain('aria-hidden="true"');
    expect(markup).toContain('focusable="false"');
    expect(markup).not.toContain('<img');
    expect(markup).not.toContain('<title');
    expect(markup).not.toContain('<text');
    expect(markup).not.toMatch(/https?:\/\//);
  });
});
```

Keep the CSS class-token filtering tests.

- [ ] **Step 5: Run UI verification**

Run:

```powershell
bunx vitest run tests/GameUI.test.ts tests/SurvivalUI.test.ts tests/UIArtwork.test.ts tests/SurvivalPhaseFocus.test.ts tests/SurvivalPhase.test.ts
```

Expected: all selected tests pass with fewer test cases.

- [ ] **Step 6: Commit**

```powershell
git add -- tests/GameUI.test.ts tests/SurvivalUI.test.ts tests/UIArtwork.test.ts
git commit -m "test: focus UI coverage on behavior"
```

### Task 6: Prune visual, historical, and repeated ownership tests

**Files:**
- Delete: `tests/Environment.test.ts`
- Modify: `src/world/Environment.ts:21`
- Modify: `tests/ShipLayout.test.ts`
- Modify: `tests/ShipFurniture.test.ts`
- Modify: `tests/ShipGeometry.test.ts`
- Modify: `tests/world.test.ts`
- Modify: `tests/WaterExclusion.test.ts`
- Modify: `tests/BoatWorld.test.ts`
- Modify: `tests/ShipMaterials.test.ts`
- Modify: `tests/Skybox.test.ts`
- Modify: `tests/SkyPalette.test.ts`

**Interfaces:**
- Consumes: Current navigation, water, ownership, and environment behavior.
- Produces: Suites that protect playable geometry, runtime transitions, and one ownership boundary per owner.

- [ ] **Step 1: Run the affected suites before pruning**

Run:

```powershell
bunx vitest run tests/Environment.test.ts tests/ShipLayout.test.ts tests/ShipFurniture.test.ts tests/ShipGeometry.test.ts tests/world.test.ts tests/WaterExclusion.test.ts tests/BoatWorld.test.ts tests/ShipMaterials.test.ts tests/Skybox.test.ts tests/SkyPalette.test.ts
```

Expected: all tests pass.

- [ ] **Step 2: Remove historical and exact-layout assertions**

Delete these tests:

```text
tests/ShipLayout.test.ts: authors the exact perimeter placement and surface catalog
tests/ShipLayout.test.ts: rejects the old blocked cabin exit and overlapping cargo arrangement by object id
tests/ShipLayout.test.ts: rejects same-zone furniture model swaps for exact placement roles
tests/ShipFurniture.test.ts: builds exactly the 16 layout-owned fixtures with one collider each
tests/ShipFurniture.test.ts: exposes exactly 27 ordinary owned surfaces and no fallback clutter surfaces
tests/ShipGeometry.test.ts: uses the approved zone materials on walls and glass panes
tests/ShipGeometry.test.ts: rounds both ends of the hull and timber deck profiles
tests/ShipGeometry.test.ts: reuses repeated shell box geometry per build and disposes it once
```

Keep door, route, reachability, overlap, clearance, standing-point, and collision assertions.

- [ ] **Step 3: Remove decorative renderer and shader-source assertions**

Delete `tests/Environment.test.ts` and make `SCAVENGE_SHADOW_CONFIG` private in `Environment.ts` by removing `export`.

Delete these tests:

```text
tests/world.test.ts: creates a four-wave subdivided ocean mesh
tests/world.test.ts: layers view-dependent reflection, sun glints, ripples, and broken crest foam
tests/world.test.ts: updates each ocean atmosphere uniform from explicit colors
tests/world.test.ts: converts linear ocean color before centered display-space dithering
tests/WaterExclusion.test.ts: uses a fixed two-region shader mask before ocean color output
tests/Skybox.test.ts: layers optical-depth atmosphere, a three-part sun, moon halo, and two star fields
tests/Skybox.test.ts: adds subtle static direction-space atmospheric luminance variation
tests/SkyPalette.test.ts: orders celestial visibility and haze from calm through squall
tests/SkyPalette.test.ts: clamps sinking severity and darkens the squall day
```

Keep water transforms and uniform uploads, wave synchronization, day/night switching, squall suppression, palette fallback, interpolation, camera following, tint, and moon ownership.

- [ ] **Step 4: Consolidate repeated ownership assertions**

In `BoatWorld.test.ts`, replace these cases with one owner-level case named `disposes owned survival resources once`:

```text
disposes bow-spray geometry and material once across repeated world disposal
disposes each survival boat texture exactly once
disposes every unique survival boat geometry and material exactly once
disposes saved prop geometry and material exactly once
```

Use the shared collector so the replacement covers the sky, ocean, spray, lifeboat, and saved prop without separate ownership tests:

```ts
it('disposes owned survival resources once', () => {
  const propModels = createTestPropModels();
  const world = new BoatWorld(
    new PerspectiveCamera(),
    { matches: false } as MediaQueryList,
    propModels,
    createTestMoonTexture(),
    [savedItem('medicalKit')],
  );
  const geometries = new Set<BufferGeometry>();
  const materials = new Set<Material>();
  collectMeshResources(world.scene, geometries, materials);
  const textures = new Set<Texture>();
  materials.forEach((material) => {
    Object.values(material).forEach((value) => {
      if (value instanceof Texture) textures.add(value);
    });
  });
  const spies = [
    ...[...geometries].map((resource) => vi.spyOn(resource, 'dispose')),
    ...[...materials].map((resource) => vi.spyOn(resource, 'dispose')),
    ...[...textures].map((resource) => vi.spyOn(resource, 'dispose')),
  ];

  world.dispose();
  world.dispose();

  spies.forEach((spy) => expect(spy).toHaveBeenCalledOnce());
  propModels.dispose();
});
```

Add `BufferGeometry` and `collectMeshResources` imports. Keep `Texture`; remove `Points` if no retained test uses it.

Delete these `ShipMaterials.test.ts` cases:

```text
owns a beacon material independently from emergency surfaces
does not expose the removed procedural furniture material families
```

Keep deterministic texture generation, texture configuration, and one owned-resource disposal test.

- [ ] **Step 5: Run navigation, renderer, and ownership verification**

Run:

```powershell
bunx vitest run tests/ShipLayout.test.ts tests/ShipFurniture.test.ts tests/ShipGeometry.test.ts tests/collisions.test.ts tests/ShipItemPlacement.test.ts tests/world.test.ts tests/WaterExclusion.test.ts tests/BoatWorld.test.ts tests/ShipMaterials.test.ts tests/Skybox.test.ts tests/SkyPalette.test.ts
bun run typecheck
```

Expected: all selected tests pass; TypeScript exits 0.

- [ ] **Step 6: Commit**

```powershell
git add -- src/world/Environment.ts tests/Environment.test.ts tests/ShipLayout.test.ts tests/ShipFurniture.test.ts tests/ShipGeometry.test.ts tests/world.test.ts tests/WaterExclusion.test.ts tests/BoatWorld.test.ts tests/ShipMaterials.test.ts tests/Skybox.test.ts tests/SkyPalette.test.ts
git commit -m "test: remove visual and historical assertions"
```

### Task 7: Consolidate redundant asset-pipeline failure cases

**Files:**
- Modify: `tests/itemModelAudit.test.ts:164-182`
- Modify: `tests/shipFurnitureModelAudit.test.ts:112-125`
- Modify: `tests/PropModelLibrary.test.ts:126-176`

**Interfaces:**
- Consumes: The committed-asset checks and existing ledger/model fixture helpers.
- Produces: Representative failure coverage for malformed geometry, external dependencies, provenance mismatch, missing rows, and duplicates.

- [ ] **Step 1: Run asset tests before pruning**

Run:

```powershell
bunx vitest run tests/itemModelAudit.test.ts tests/shipFurnitureModelAudit.test.ts tests/PropModelLibrary.test.ts
bun run models:check
```

Expected: all tests pass; both asset audits exit 0.

- [ ] **Step 2: Reduce equivalent malformed-item variants**

Replace the `it.each` table in `itemModelAudit.test.ts` with these representative classes:

```ts
it.each([
  ['missing POSITION geometry', { missingPosition: true }, 'missing POSITION geometry'],
  ['non-finite position data', { nonFinitePosition: true }, 'non-finite POSITION data'],
  ['an external buffer URI', { externalBuffer: true }, 'external buffer URI: external.bin'],
  ['a referenced texture without embedded bytes', { missingTextureBytes: true }, 'referenced texture has no embedded image bytes'],
  ['a collinear zero-area triangle', { collinearTriangle: true }, 'contains no non-degenerate world-space triangles'],
] as const)('rejects %s', async (_caseName, options, expectedError) => {
  await writeInvalidModel(modelsDir, options);
  const result = runAudit();
  expect(result.status).toBe(1);
  expect(result.stderr).toContain(`flareGun.glb: ${expectedError}`);
});
```

The retained cases cover absent geometry, invalid numbers, external runtime dependencies, missing embedded data, and degenerate triangles.

- [ ] **Step 3: Preserve independent repeated-mesh audit coverage**

Keep both of these tests because the builder and audit scripts implement triangle counting independently:

```text
tests/shipFurnitureModelAudit.test.ts: counts repeated scene-node mesh instances in the rendered triangle total
tests/KenneyShipFurnitureModels.test.ts: retains repeated source mesh parts in the committed triangle total
```

The builder test protects artifact creation. The audit test protects committed-asset verification.

- [ ] **Step 4: Collapse equivalent ledger-field mismatch tests**

Keep these `PropModelLibrary.test.ts` provenance failures:

```text
rejects a stable GLB filename assigned to the wrong item row before loading
rejects a missing item row before loading
rejects a duplicate item row before loading
```

Delete the three equivalent single-field mismatch cases for swapped source URL/source asset ID, license URL, and creator substring. The production ledger validator still checks each field, and `bun run models:check` validates every committed row.

- [ ] **Step 5: Run asset verification**

Run:

```powershell
bunx vitest run tests/itemModelAudit.test.ts tests/shipFurnitureModelAudit.test.ts tests/PropModelLibrary.test.ts tests/KenneyItemModels.test.ts tests/KenneyShipFurnitureModels.test.ts tests/KenneyItemSources.test.ts tests/KenneyShipFurnitureSources.test.ts
bun run models:check
```

Expected: all selected tests pass; committed item and ship models pass both audits.

- [ ] **Step 6: Commit**

```powershell
git add -- tests/itemModelAudit.test.ts tests/shipFurnitureModelAudit.test.ts tests/PropModelLibrary.test.ts
git commit -m "test: keep representative asset failures"
```

### Task 8: Verify the complete cleanup and record results

**Files:**
- Modify: `README.md` only if commands or architecture paths changed during implementation; no edit is expected.
- Inspect: all changed source and test files.

**Interfaces:**
- Consumes: Tasks 1 through 7.
- Produces: A green build, browser smoke evidence, and before/after metrics in the final handoff.

- [ ] **Step 1: Run compiler unused-code diagnostics**

Run:

```powershell
bun run typecheck -- --noUnusedLocals --noUnusedParameters
```

Expected: exit 0. Fix unused imports or locals caused by the cleanup; do not broaden production scope.

- [ ] **Step 2: Run repository verification**

Run:

```powershell
bun run models:check
bun run test
bun run typecheck
bun run build
```

Expected: all four commands exit 0.

- [ ] **Step 3: Record after metrics**

Run:

```powershell
$srcLines = (Get-ChildItem src -Recurse -File -Filter *.ts | Get-Content | Measure-Object -Line).Lines
$testLines = (Get-ChildItem tests -Recurse -File -Filter *.ts | Get-Content | Measure-Object -Line).Lines
$testCases = (rg '^\s*(it|test)\(' tests | Measure-Object -Line).Lines
"source=$srcLines tests=$testLines cases=$testCases"
```

Expected: each value is below its baseline where appropriate. `SceneResources` may offset some source-line deletion; the final report must state exact values rather than claim a target.

- [ ] **Step 4: Smoke-test both phases in a browser**

Run `bun run dev`, open the Vite URL, and check the console. Complete this path:

```text
Begin Evacuation
move and jump
pick up supplies
drop and throw supplies into the lifeboat
evacuate
use keyboard focus and one available survival action
open and close a modal or journal
restart from the ship
```

Expected: both phases render, controls work, focus remains visible and trapped in modals, restart returns to scavenging, and the console contains no errors.

- [ ] **Step 5: Review the final diff**

Run:

```powershell
git diff --check
git status --short
git diff --stat HEAD~7..HEAD
```

Expected: no whitespace errors; only scoped source, test, helper, and plan files changed.

- [ ] **Step 6: Commit any verification-only cleanup**

Skip this commit if Step 1 required no import or formatting fixes. Otherwise:

```powershell
git add -u -- src tests
git commit -m "chore: finish cleanup verification"
```

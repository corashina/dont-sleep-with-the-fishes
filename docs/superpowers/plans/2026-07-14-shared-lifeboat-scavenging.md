# Shared Lifeboat in Scavenging Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make scavenging and survival use the same detailed lifeboat and stable item placement without changing scavenging rules.

**Architecture:** Promote the existing survival boat builder, procedural textures, and type-aware storage layout into `src/world`. Both world implementations will construct fresh instances through those shared modules. Scavenging will save by `ItemInstance`, use the builder's acceptance and water-exclusion bounds, and dispose the returned textures.

**Tech Stack:** TypeScript, Three.js, Vite, Vitest, Bun

## Global Constraints

- Preserve scavenging pickup, carrying, throwing, loss, capacity, evacuation, and scoring behavior.
- Use one boat builder, one texture implementation, and one item-layout function across both phases.
- Keep `lifeboat`, `lifeboat-storage`, `damaged-plank-patch`, `fishing-line`, and `fishing-catch` object names.
- Add no downloads, runtime network access, dependencies, or third-party assets.
- Preserve unrelated worktree changes in `World.ts`, `BoatWorld.ts`, `ScavengePhase.ts`, their tests, and all other files.
- Follow test-driven development: write each behavior test, confirm its expected failure, then change production code.

---

## File Structure

- `src/world/LifeboatTextures.ts`: deterministic paint, wood, rope, and metal textures for both phases.
- `src/world/Lifeboat.ts`: detailed hull builder plus storage, acceptance, interior, water-exclusion, and texture ownership metadata.
- `src/world/BoatStorage.ts`: stable type-and-ordinal transforms plus storage-envelope helpers.
- `src/world/World.ts`: scavenging vessel instance, item save attachment, wave exclusion, and resource disposal.
- `src/survival/BoatWorld.ts`: survival consumer of the shared builder and layout.
- `src/phases/ScavengePhase.ts`: passes the accepted `ItemInstance` to `World.saveItem`.
- `tests/LifeboatTextures.test.ts`, `tests/Lifeboat.test.ts`, `tests/BoatStorage.test.ts`: shared-module construction and layout coverage.
- `tests/world.test.ts`, `tests/BoatWorld.test.ts`, `tests/GameLifecycle.test.ts`: phase integration and callback coverage.

### Task 1: Promote the detailed boat implementation into shared world modules

**Files:**
- Create by moving: `src/world/LifeboatTextures.ts`
- Replace by moving: `src/world/Lifeboat.ts`
- Replace by moving: `src/world/BoatStorage.ts`
- Delete after move: `src/survival/SurvivalBoatTextures.ts`
- Delete after move: `src/survival/SurvivalLifeboat.ts`
- Delete after move: `src/survival/SurvivalBoatLayout.ts`
- Rename: `tests/SurvivalBoatTextures.test.ts` to `tests/LifeboatTextures.test.ts`
- Rename: `tests/SurvivalLifeboat.test.ts` to `tests/Lifeboat.test.ts`
- Rename: `tests/SurvivalBoatLayout.test.ts` to `tests/BoatStorage.test.ts`
- Modify: `src/survival/BoatWorld.ts`
- Modify: `tests/BoatWorld.test.ts`

**Interfaces:**
- Produces: `createLifeboat(): LifeboatBuild`
- Produces: `LIFEBOAT_DIMENSIONS`, `LifeboatBuild`
- Produces: `createLifeboatTextures(): LifeboatTextures`
- Produces: `boatStorageTransform(instance: ItemInstance): BoatStorageTransform`
- Produces: `measureBoatStorageEnvelope(root: Object3D, clearance?: number): Box2`
- Produces: `boatStorageEnvelopesOverlap(first: Box2, second: Box2): boolean`

- [ ] **Step 1: Rename the three test files and point them at the intended shared APIs**

Use native file moves, then change the imports and symbols:

```powershell
Move-Item tests\SurvivalBoatTextures.test.ts tests\LifeboatTextures.test.ts
Move-Item tests\SurvivalLifeboat.test.ts tests\Lifeboat.test.ts
Move-Item tests\SurvivalBoatLayout.test.ts tests\BoatStorage.test.ts
```

Apply these exact symbol changes in the moved tests and `tests/BoatWorld.test.ts`:

```text
../src/survival/SurvivalBoatTextures -> ../src/world/LifeboatTextures
createSurvivalBoatTextures -> createLifeboatTextures
SurvivalBoatTextures -> LifeboatTextures
../src/survival/SurvivalLifeboat -> ../src/world/Lifeboat
createSurvivalLifeboat -> createLifeboat
SURVIVAL_LIFEBOAT_DIMENSIONS -> LIFEBOAT_DIMENSIONS
../src/survival/SurvivalBoatLayout -> ../src/world/BoatStorage
survivalBoatStorageTransform -> boatStorageTransform
SURVIVAL_STORAGE_CLEARANCE -> BOAT_STORAGE_CLEARANCE
measureSurvivalStorageEnvelope -> measureBoatStorageEnvelope
storageEnvelopesOverlap -> boatStorageEnvelopesOverlap
survival-hull-geometry -> lifeboat-hull-geometry
```

Replace the old size-comparison test in `tests/Lifeboat.test.ts` with a shared-builder contract:

```ts
it('builds the detailed rounded lifeboat with gameplay bounds', () => {
  const build = createLifeboat();
  const hull = build.root.getObjectByName('lifeboat-hull-geometry')!;
  const size = new Box3().setFromObject(hull).getSize(new Vector3());

  expect(size.x).toBeCloseTo(LIFEBOAT_DIMENSIONS.width, 1);
  expect(size.z).toBeCloseTo(LIFEBOAT_DIMENSIONS.length, 1);
  expect(hull.children.filter(({ name }) => name.startsWith('hull-segment-')).length)
    .toBeGreaterThanOrEqual(16);
  expect(build.acceptanceBox.containsPoint(new Vector3(0, 0, 0))).toBe(true);
  expect(build.acceptanceBox.containsPoint(new Vector3(1.6, 0, 0))).toBe(false);
  expect(build.waterExclusion).toEqual({ halfWidth: 1.60, halfLength: 3.04 });
  disposeBuild(build.root, build.textures);
});
```

- [ ] **Step 2: Run the shared-module tests and confirm RED**

Run:

```powershell
bun run test -- tests/LifeboatTextures.test.ts tests/Lifeboat.test.ts tests/BoatStorage.test.ts tests/BoatWorld.test.ts
```

Expected: FAIL because `src/world/LifeboatTextures.ts` does not exist and the shared exports are absent.

- [ ] **Step 3: Move the production modules and rename their public APIs**

Move the implementations:

```powershell
Move-Item src\survival\SurvivalBoatTextures.ts src\world\LifeboatTextures.ts
Move-Item -Force src\survival\SurvivalLifeboat.ts src\world\Lifeboat.ts
Move-Item -Force src\survival\SurvivalBoatLayout.ts src\world\BoatStorage.ts
```

Apply the same symbol replacements listed in Step 1. In `src/world/Lifeboat.ts`, import textures from `./LifeboatTextures`, rename the hull group to `lifeboat-hull-geometry`, and extend the shared build contract:

```ts
export interface LifeboatBuild {
  readonly root: Group;
  readonly storageRoot: Group;
  readonly acceptanceBox: Box3;
  readonly interiorBounds: Box3;
  readonly waterExclusion: {
    readonly halfWidth: number;
    readonly halfLength: number;
  };
  readonly textures: readonly Texture[];
}
```

Return the acceptance box inside the rounded hull:

```ts
acceptanceBox: new Box3(
  new Vector3(-1.35, -0.30, -2.72),
  new Vector3(1.35, 1.00, 2.72),
),
```

In `src/world/BoatStorage.ts`, use these shared declarations while retaining the existing slot table and ordinal validation:

```ts
export const BOAT_STORAGE_CLEARANCE = 0.05;

export interface BoatStorageTransform {
  readonly position: Vector3;
  readonly rotation: Euler;
  readonly scale: number;
}

export function boatStorageTransform(instance: ItemInstance): BoatStorageTransform
export function measureBoatStorageEnvelope(
  root: Object3D,
  clearance = BOAT_STORAGE_CLEARANCE,
): Box2
export function boatStorageEnvelopesOverlap(first: Box2, second: Box2): boolean
```

- [ ] **Step 4: Update survival to consume the shared modules**

Replace the survival imports and type:

```ts
import { boatStorageTransform } from '../world/BoatStorage';
import { createLifeboat, type LifeboatBuild } from '../world/Lifeboat';
```

Use the shared calls in the constructor:

```ts
private readonly waterExclusion: LifeboatBuild['waterExclusion'];

const build = createLifeboat();
const transform = boatStorageTransform(instance);
```

- [ ] **Step 5: Run the focused tests and confirm GREEN**

Run:

```powershell
bun run test -- tests/LifeboatTextures.test.ts tests/Lifeboat.test.ts tests/BoatStorage.test.ts tests/BoatWorld.test.ts
```

Expected: PASS with no missing-module or renamed-symbol errors.

- [ ] **Step 6: Record the shared-module checkpoint without staging**

```powershell
git status --short
git diff --check
```

Expected: the shared moves and consumer edits appear in the worktree with no whitespace errors. Do not stage or commit this checkpoint because `src/survival/BoatWorld.ts` and `tests/BoatWorld.test.ts` contain pre-existing user changes that must remain user-owned.

### Task 2: Use item identity and shared boat bounds in scavenging

**Files:**
- Modify: `tests/world.test.ts`
- Modify: `tests/GameLifecycle.test.ts`
- Modify: `src/world/World.ts`
- Modify: `src/phases/ScavengePhase.ts`

**Interfaces:**
- Consumes: `createLifeboat()`, `boatStorageTransform(instance)`
- Produces: `World.saveItem(instance: ItemInstance): void`
- Preserves: `World.lifeboatAcceptance: Box3`

- [ ] **Step 1: Add a failing world test for stable, type-aware scavenging placement**

Replace index-based storage assertions in `tests/world.test.ts` with:

```ts
it('saves scavenged items in the shared type-aware boat slots', () => {
  const propModels = createTestPropModels();
  const instances = createItemInstances();
  const world = new World(new Scene(), propModels, instances, () => 0.35);
  const cannedFood = instances.find(({ instanceId }) => instanceId === 'cannedFood-3')!;
  const flareGun = instances.find(({ instanceId }) => instanceId === 'flareGun-1')!;

  world.saveItem(cannedFood);
  world.saveItem(flareGun);

  for (const instance of [cannedFood, flareGun]) {
    const prop = world.itemObjects.get(instance.instanceId)!;
    const transform = boatStorageTransform(instance);
    expect(prop.parent?.name).toBe('lifeboat-storage');
    expect(prop.position.toArray()).toEqual(transform.position.toArray());
    expect(prop.rotation.toArray().slice(0, 3)).toEqual(transform.rotation.toArray().slice(0, 3));
    expect(prop.scale.toArray()).toEqual([transform.scale, transform.scale, transform.scale]);
  }

  world.dispose();
  propModels.dispose();
});
```

Add a boat parity assertion:

```ts
it('uses the shared detailed lifeboat at its authored size', () => {
  const propModels = createTestPropModels();
  const world = new World(new Scene(), propModels, [], () => 0.35);
  const hull = world.lifeboat.getObjectByName('lifeboat-hull-geometry')!;
  const size = new Box3().setFromObject(hull).getSize(new Vector3());

  expect(world.lifeboat.scale.toArray()).toEqual([1, 1, 1]);
  expect(size.x).toBeCloseTo(LIFEBOAT_DIMENSIONS.width, 1);
  expect(size.z).toBeCloseTo(LIFEBOAT_DIMENSIONS.length, 1);
  world.dispose();
  propModels.dispose();
});
```

Update the existing lifeboat import in `tests/world.test.ts` so the parity test can read the authored dimensions:

```ts
import { LIFEBOAT_DIMENSIONS, createLifeboat } from '../src/world/Lifeboat';
```

- [ ] **Step 2: Update the lifecycle callback expectation**

In the existing accepted-flight callback test in `tests/GameLifecycle.test.ts`, define the accepted instance and assert identity:

```ts
const accepted = { instanceId: 'flareGun-1', type: 'flareGun' } as const;
const saveItem = vi.fn();
// The carry update handler calls handlers.onSaved(accepted).
expect(saveItem).toHaveBeenCalledWith(accepted);
```

- [ ] **Step 3: Run the integration tests and confirm RED**

Run:

```powershell
bun run test -- tests/world.test.ts tests/GameLifecycle.test.ts
```

Expected: FAIL because `World.saveItem` still accepts an instance ID and storage index, scavenging still scales the old contract, and the phase callback still sends two scalar arguments.

- [ ] **Step 4: Wire `World` to the shared builder contract**

Update imports and owned resources:

```ts
import {
  Box3,
  BufferGeometry,
  Color,
  Group,
  Material,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  Scene,
  Texture,
  Vector3,
} from 'three';
import { boatStorageTransform } from './BoatStorage';
import { createLifeboat } from './Lifeboat';

private readonly ownedTextures = new Set<Texture>();
private readonly waterExclusion: { readonly halfWidth: number; readonly halfLength: number };
```

Replace the boat setup with:

```ts
const boatBuild = createLifeboat();
this.lifeboat = boatBuild.root;
this.lifeboat.position.copy(this.boatAnchor);
this.boatStorage = boatBuild.storageRoot;
this.lifeboatAcceptance = boatBuild.acceptanceBox;
this.waterExclusion = boatBuild.waterExclusion;
boatBuild.textures.forEach((texture) => this.ownedTextures.add(texture));
scene.add(this.lifeboat);
collectOwnedResources(this.lifeboat, this.ownedGeometries, this.ownedMaterials);
```

Replace the constant water-exclusion arguments with:

```ts
createWaterExclusion(
  this.lifeboat,
  this.waterExclusion.halfWidth,
  this.waterExclusion.halfLength,
),
```

Replace the save method with:

```ts
saveItem(instance: ItemInstance): void {
  const item = this.itemObjects.get(instance.instanceId);
  if (!item || item.userData.itemType !== instance.type) return;
  const transform = boatStorageTransform(instance);
  item.removeFromParent();
  this.boatStorage.add(item);
  item.position.copy(transform.position);
  item.rotation.copy(transform.rotation);
  item.scale.setScalar(transform.scale);
}
```

Dispose and clear the textures next to the existing owned resource sets:

```ts
this.ownedTextures.forEach((texture) => texture.dispose());
this.ownedTextures.clear();
```

- [ ] **Step 5: Pass the accepted item from `ScavengePhase`**

Change only the successful save callback:

```ts
onSaved: (instance) => {
  if (!this.session.saveCarried()) return;
  this.world.saveItem(instance);
},
```

- [ ] **Step 6: Run focused integration tests and confirm GREEN**

Run:

```powershell
bun run test -- tests/world.test.ts tests/GameLifecycle.test.ts tests/BoatWorld.test.ts tests/interaction.test.ts
```

Expected: PASS. Existing missed-throw, stale-callback, loss, landing, and survival placement tests remain green.

- [ ] **Step 7: Record the scavenging checkpoint without staging**

```powershell
git status --short
git diff --check
```

Expected: the scavenging integration and tests appear in the worktree with no whitespace errors. Do not stage or commit this checkpoint because all four files contain pre-existing user changes.

### Task 3: Verify cleanup, resources, and both rendered phases

**Files:**
- Modify if a regression appears: files already listed in Tasks 1 and 2
- Verify: `THIRD_PARTY_ASSETS.md`

**Interfaces:**
- Verifies the shared APIs and both phase consumers.
- Adds no new runtime interface.

- [ ] **Step 1: Confirm no obsolete implementation imports remain**

Run:

```powershell
rg -n "SurvivalLifeboat|SurvivalBoatTextures|SurvivalBoatLayout|createSurvivalLifeboat|createSurvivalBoatTextures|survivalBoatStorageTransform|LIFEBOAT_WATER_EXCLUSION" src tests
```

Expected: no matches. Also run:

```powershell
rg -n "saveItem\(" src tests
```

Expected: every call passes one `ItemInstance`.

- [ ] **Step 2: Run model policy and the full automated verification suite**

Run:

```powershell
bun run models:check
bun run test
bun run typecheck
bun run build
```

Expected: all commands exit 0 with no test failures, TypeScript errors, model-policy failures, or build errors.

- [ ] **Step 3: Inspect both phases in the browser**

Start the app with `bun run dev -- --host 127.0.0.1`, then use the browser-control skill to verify:

```text
Scavenging:
- detailed rounded hull, paddles, textured floor, and fittings match survival
- boat uses authored scale 1
- a valid throw saves the prop at its type-aware slot
- a miss still lands or becomes lost through existing behavior
- waves stay outside the floor during pitch and roll

Survival:
- the same hull details and dimensions remain visible
- recovered props retain their stable slots and interaction anchors
- fishing, repair, horizon, weather, and day/night presentation still work
- waves stay outside the floor
```

Inspect at 1280 by 720 and 1920 by 1080. Check browser console output after each phase.

- [ ] **Step 4: Review the final diff for scope and user-change preservation**

Run:

```powershell
git diff --check
git status --short
git diff -- src/world/LifeboatTextures.ts src/world/Lifeboat.ts src/world/BoatStorage.ts src/world/World.ts src/survival/BoatWorld.ts src/phases/ScavengePhase.ts tests/LifeboatTextures.test.ts tests/Lifeboat.test.ts tests/BoatStorage.test.ts tests/world.test.ts tests/BoatWorld.test.ts tests/GameLifecycle.test.ts
```

Expected: no whitespace errors, no unrelated edits, and all pre-existing worktree changes outside this feature remain intact.

- [ ] **Step 5: Leave the verified implementation unstaged for user review**

Run:

```powershell
git status --short
```

Expected: the feature files remain visible alongside the user's pre-existing worktree changes. Do not stage or commit implementation files unless the user requests it after reviewing the final diff.

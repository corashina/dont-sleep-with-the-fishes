# Downloaded Low-Poly Item Models Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (- [ ]) syntax for tracking.

**Goal:** Replace all nine procedural item props with locally committed, licensed, low-poly Poly Pizza GLBs while preserving every scavenging and survival interaction.

**Architecture:** A typed manifest owns local Vite asset URLs, normalization values, budgets, and provenance. `PropModelLibrary` preloads and validates the nine templates with `GLTFLoader`, normalizes each once, and creates synchronous deep-owned instances for `World` and `BoatWorld`. An explicit `PhaseContext.propModels` dependency keeps the cache out of global state, while a cancellable async launcher displays loading and item-specific failures before constructing `Game`.

**Tech Stack:** TypeScript 5.9, Three.js 0.180 `GLTFLoader`, Vite 7, Vitest 3, Bun, PowerShell, glTF Transform CLI/Core.

**Global Constraints:** Use only the nine approved Poly Pizza identities. Commit GLBs under `src/assets/models/items/`; never fetch external assets at runtime. Keep eight committed files at or below 3,000 triangles, allow only the byte-for-byte unchanged approved Tape GLB up to 21,000 triangles, and keep the aggregate at or below 28,000. Preserve independently mutable geometry/material ownership per physical instance. Keep `dev-server.err` untracked and untouched. Apply `superpowers:test-driven-development` during implementation and `superpowers:verification-before-completion` before completion claims.

## File and Responsibility Map

- Create `scripts/fetch-item-models.ps1`: reproducibly download the nine approved resource IDs, copy Tape unchanged under its explicit accuracy exception, and weld/simplify only Scuba equipment.
- Create `scripts/check-item-models.mjs`: parse committed GLBs, print exact triangle counts, and enforce per-file/aggregate budgets.
- Modify `package.json` and `bun.lock`: add glTF Transform tooling and `models:fetch` / `models:check` scripts.
- Create `src/assets/models/items/*.glb`: nine locally served production assets with stable item-ID filenames.
- Create `THIRD_PARTY_ASSETS.md`: checked-in provenance, licenses, resource IDs, processing, and measured counts.
- Create `src/world/itemModelManifest.ts`: exhaustive typed runtime configuration and attribution metadata.
- Create `src/world/PropModelLibrary.ts`: parallel preload, validation, normalization, owned cloning, and template disposal.
- Replace `src/world/PropFactory.ts`: remove primitive geometry and delegate instance creation to the library.
- Modify `src/app/GamePhase.ts`, `src/Game.ts`, `src/phases/ScavengePhase.ts`, `src/survival/SurvivalPhase.ts`: thread the library through explicit production dependencies.
- Modify `src/world/World.ts` and `src/survival/BoatWorld.ts`: instantiate downloaded models without changing root-level gameplay contracts.
- Create `src/app/launchGame.ts` and modify `src/main.ts`: cancellable async preload, loading UI, safe differentiated errors, and ownership transfer.
- Create `tests/helpers/propModels.ts`: deterministic in-memory templates for tests without GLB or network dependencies.
- Create `tests/itemModelManifest.test.ts`, `tests/PropModelLibrary.test.ts`, and `tests/launchGame.test.ts`: asset coverage, library behavior, and launch lifecycle regression coverage.
- Modify `tests/world.test.ts`, `tests/BoatWorld.test.ts`, `tests/GameLifecycle.test.ts`, and `tests/GameDirector.test.ts`: inject model fixtures and preserve gameplay/disposal assertions.

## Approved Download Matrix

| Item ID | Public model ID | Direct GLB resource ID | Source title | Creator | Source triangles | Processing |
|---|---|---|---|---|---:|---|
| `flareGun` | `44H9OBUqTC` | `9ec52cda-c918-43f0-b7af-354e7fe96c37` | Flare Gun | Quaternius | 540 | Copy unchanged |
| `ductTape` | `fu49rGO7Ukc` | `06934616-1393-451d-bdf6-2101a5e32703` | Tape | Poly by Google | 20,332 | Copy byte-for-byte unchanged; explicit 21,000-triangle accuracy exception (the earlier 19,872 count was a lightly simplified output) |
| `fishingRod` | `lDlWQjn9Zg` | `c15761f7-4aef-4bf4-9565-50a68a981f34` | Fishing Rod | Quaternius | 910 | Copy unchanged |
| `baitTin` | `IuoYedcdXQ` | `f6b52ca9-61b1-42d5-a42f-d8748a41eb45` | Can Red | Quaternius | 332 | Copy unchanged |
| `medicalKit` | `Hp80p6148W` | `41249676-0965-40df-8dd7-eee79dd9e6cf` | First Aid Kit | Quaternius | 268 | Copy unchanged |
| `waterJug` | `KpxDpidn1Z` | `3ebef9a3-c2df-49ee-abe1-df38b5777bcd` | Water Bottle | Quaternius | 260 | Copy unchanged |
| `cannedFood` | `YnowJvWqxE` | `e16e13cf-fbc4-48c8-9927-ae34920a498e` | Can | Quaternius | 428 | Copy unchanged |
| `flashlight` | `WGsvr4KOZd` | `035c4897-22f3-4e9c-b29f-ebafe2b566da` | Torch | Quaternius | 610 | Copy unchanged |
| `scubaSet` | `7igrHLjaQlW` | `efda7497-db5e-47e9-b317-8e8baeb1c616` | Scuba equipment | Steren Giannini | 4,696 | Weld, then simplify with ratio `0.55`, error `0.005` to 2,786 triangles |

Each direct download uses `https://static.poly.pizza/`, the corresponding resource ID in the matrix, and the `.glb` suffix. The acquisition script must also read the detail page formed from `https://poly.pizza/m/` plus the corresponding public ID and reject mismatched `Title`, `Creator.Username`, `Licence`, `PublicID`, or `ResourceID` metadata before downloading.

---

### Task 1: Reproducible Asset Acquisition, Optimization, and Audit

**Files:**
- Modify: `package.json`
- Modify: `bun.lock`
- Create: `scripts/fetch-item-models.ps1`
- Create: `scripts/check-item-models.mjs`
- Create: `src/assets/models/items/flareGun.glb`
- Create: `src/assets/models/items/ductTape.glb`
- Create: `src/assets/models/items/fishingRod.glb`
- Create: `src/assets/models/items/baitTin.glb`
- Create: `src/assets/models/items/medicalKit.glb`
- Create: `src/assets/models/items/waterJug.glb`
- Create: `src/assets/models/items/cannedFood.glb`
- Create: `src/assets/models/items/flashlight.glb`
- Create: `src/assets/models/items/scubaSet.glb`
- Create: `THIRD_PARTY_ASSETS.md`

**Interfaces:**
- `bun run models:fetch` produces exactly the nine stable filenames from the approved download matrix.
- `bun run models:check` exits nonzero for a missing file, unreadable GLB, unsupported primitive mode, per-file excess, or aggregate excess.
- Runtime never imports glTF Transform; it remains development tooling only.

- [ ] **Step 1: Add the audit command first and verify RED**

Add scripts to `package.json` before their files exist:

```json
"models:fetch": "powershell -ExecutionPolicy Bypass -File scripts/fetch-item-models.ps1",
"models:check": "node scripts/check-item-models.mjs"
```

Run: `bun run models:check`

Expected: FAIL because `scripts/check-item-models.mjs` does not exist.

- [ ] **Step 2: Install deterministic development tooling**

Run: `bun add -d @gltf-transform/cli @gltf-transform/core`

Expected: `package.json` and `bun.lock` include both packages, with no production dependency changes.

- [ ] **Step 3: Implement the GLB budget auditor**

Create `scripts/check-item-models.mjs` with this data contract and counting rule:

```js
import { access, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { NodeIO } from '@gltf-transform/core';

export const MODEL_LIMIT = 3_000;
export const DUCT_TAPE_LIMIT = 21_000;
export const LIBRARY_LIMIT = 28_000;
export const ITEM_IDS = [
  'flareGun', 'ductTape', 'fishingRod', 'baitTin', 'medicalKit',
  'waterJug', 'cannedFood', 'flashlight', 'scubaSet',
];

export async function countTriangles(filePath) {
  const document = await new NodeIO().read(filePath);
  let triangles = 0;
  for (const mesh of document.getRoot().listMeshes()) {
    for (const primitive of mesh.listPrimitives()) {
      if (primitive.getMode() !== 4) {
        throw new Error(`${filePath}: primitive mode ${primitive.getMode()} is not TRIANGLES`);
      }
      const count = primitive.getIndices()?.getCount()
        ?? primitive.getAttribute('POSITION')?.getCount()
        ?? 0;
      if (count % 3 !== 0) throw new Error(`${filePath}: triangle index count is not divisible by 3`);
      triangles += count / 3;
    }
  }
  return triangles;
}
```

The executable portion must:

1. resolve the corresponding `.glb` inside `src/assets/models/items/` for every item ID;
2. call `access()` before parsing;
3. reject zero triangles, non-Tape counts over `MODEL_LIMIT`, and Tape over `DUCT_TAPE_LIMIT`;
4. reject a total over `LIBRARY_LIMIT`;
5. read `THIRD_PARTY_ASSETS.md` and require the item ID, permanent Poly Pizza URL, resource ID, creator, and license URL for every row;
6. accept `--assets-only` to skip only the ledger check while retaining every binary and budget check;
7. print one `itemId: N triangles` line and a final `total: N / 28000 triangles` line.

Run: `bun run models:check`

Expected: FAIL listing the nine missing model files and missing ledger.

- [ ] **Step 4: Implement the verified downloader**

Create `scripts/fetch-item-models.ps1` with `$ErrorActionPreference = 'Stop'` and an ordered array containing every value from the approved download matrix. For each entry:

```powershell
$pageUrl = "https://poly.pizza/m/$($model.PublicId)"
$page = (Invoke-WebRequest -UseBasicParsing -Uri $pageUrl).Content
$resourceId = [regex]::Match($page, '"ResourceID":"([^"]+)"').Groups[1].Value
$title = [regex]::Match($page, '"Title":"([^"]+)"').Groups[1].Value
if ($resourceId -ne $model.ResourceId -or $title -ne $model.Title) {
  throw "Poly Pizza metadata mismatch for $($model.ItemId)"
}
$source = Join-Path $tempRoot "$($model.ItemId).source.glb"
Invoke-WebRequest -UseBasicParsing -Uri "https://static.poly.pizza/$resourceId.glb" -OutFile $source
```

Apply the same explicit equality checks to public ID, creator username, and license. Use a verified temporary folder under `[System.IO.Path]::GetTempPath()`, resolve it before deletion, and reject cleanup unless the resolved path starts with the OS temp root.

Copy the seven already-low-poly files and the approved Tape source unchanged. Process only Scuba equipment exactly as follows:

```powershell
$scubaWelded = Join-Path $tempRoot 'scubaSet.welded.glb'
& bunx.cmd gltf-transform weld $scubaSource $scubaWelded
if ($LASTEXITCODE -ne 0) { throw 'Scuba equipment weld failed' }
& bunx.cmd gltf-transform simplify $scubaWelded $scubaOutput --ratio 0.55 --error 0.005
if ($LASTEXITCODE -ne 0) { throw 'Scuba equipment simplification failed' }
```

Finish by invoking `node scripts/check-item-models.mjs --assets-only`; never accept a partially downloaded or over-budget set.

- [ ] **Step 5: Download and measure the approved files**

Run: `bun run models:fetch`

Expected: all nine GLBs exist under `src/assets/models/items/`; the script's assets-only audit confirms byte-for-byte unchanged Tape is at or below 21,000 triangles, the other eight are under 3,000, and the aggregate is under 28,000.

Run: `bun run models:check`

Expected: FAIL only because the asset ledger has not been created yet, while printing the measured counts needed for the ledger.

- [ ] **Step 6: Create the complete attribution ledger**

Create `THIRD_PARTY_ASSETS.md` with one row per item and these columns:

```md
| Item ID | File | Model / creator | Permanent source | Resource ID | License | Original triangles | Committed triangles | Modifications | Downloaded |
```

Use [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) for the seven Quaternius rows and [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/) for Tape and Scuba equipment. Record the exact integers printed by the auditor for both previously unmeasured cans and all committed files. Record `2026-07-13` as the download date. Tape must say `None; source GLB copied unchanged (approved accuracy exception)`, Scuba must say `glTF Transform weld + simplify (ratio 0.55, error 0.005)`, and the other seven must say `None; source GLB copied unchanged`.

Run: `bun run models:check`

Expected: PASS, eight files at or below 3,000 triangles, Tape at or below 21,000, and total at or below 28,000.

- [ ] **Step 7: Commit the acquisition pipeline and assets**

Run: `git diff --check`

```bash
git add package.json bun.lock scripts/fetch-item-models.ps1 scripts/check-item-models.mjs src/assets/models/items THIRD_PARTY_ASSETS.md docs/superpowers/specs/2026-07-13-downloaded-low-poly-item-models-design.md
git commit -m "chore: add licensed low-poly item assets"
```

---

### Task 2: Exhaustive Manifest and Validated Template Library

**Files:**
- Create: `src/world/itemModelManifest.ts`
- Create: `src/world/PropModelLibrary.ts`
- Create: `tests/helpers/propModels.ts`
- Create: `tests/itemModelManifest.test.ts`
- Create: `tests/PropModelLibrary.test.ts`

**Interfaces:**

```ts
export interface ItemModelSpec {
  readonly url: string;
  readonly targetLongestDimension: number;
  readonly rotation: readonly [number, number, number];
  readonly offset: readonly [number, number, number];
  readonly maxTriangles: number;
  readonly sourceUrl: string;
  readonly resourceId: string;
  readonly creator: string;
  readonly licenseUrl: string;
}

export interface ItemModelLoader {
  load(url: string): Promise<Group>;
}

export class PropModelLibrary {
  static load(loader?: ItemModelLoader): Promise<PropModelLibrary>;
  static fromTemplatesForTest(templates: ReadonlyMap<ItemId, Group>): PropModelLibrary;
  create(instance: ItemInstance): Group;
  dispose(): void;
}
```

`itemModelManifest.ts` must also import `../../THIRD_PARTY_ASSETS.md?raw` and export the string as `ITEM_MODEL_ASSET_LEDGER`. This lets preload reject a manifest/ledger mismatch before the game is constructed, while `models:check` remains the stronger build-time binary audit.

- [ ] **Step 1: Write failing manifest coverage tests**

In `tests/itemModelManifest.test.ts`, assert:

```ts
expect(Object.keys(ITEM_MODEL_SPECS).sort()).toEqual([...ITEM_IDS].sort());
for (const id of ITEM_IDS) {
  const spec = ITEM_MODEL_SPECS[id];
  expect(spec.url).toMatch(/\.glb$/);
  expect(spec.maxTriangles).toBeLessThanOrEqual(3_000);
  expect(spec.sourceUrl).toBe(`https://poly.pizza/m/${EXPECTED_PUBLIC_IDS[id]}`);
  expect(spec.resourceId).toBe(EXPECTED_RESOURCE_IDS[id]);
  expect(spec.creator.length).toBeGreaterThan(0);
  expect(spec.licenseUrl).toMatch(/^https:\/\/creativecommons\.org\//);
}
```

Also use `access(fileURLToPath(new URL(`../src/assets/models/items/${id}.glb`, import.meta.url)))` for each item. Assert that `ITEM_MODEL_ASSET_LEDGER` contains the item ID, source URL, resource ID, creator, and license URL for each manifest entry.

Run: `bun run test -- tests/itemModelManifest.test.ts`

Expected: FAIL because the manifest does not exist.

- [ ] **Step 2: Implement the exhaustive manifest**

Create `ITEM_MODEL_SPECS` with `satisfies Readonly<Record<ItemId, ItemModelSpec>>`. Give each record its own static URL, such as `new URL('../assets/models/items/flareGun.glb', import.meta.url).href`, rather than constructing paths dynamically. Use these initial normalization values:

```ts
const normalization: Readonly<Record<ItemId, Pick<ItemModelSpec,
  'targetLongestDimension' | 'rotation' | 'offset'>>> = {
  flareGun:   { targetLongestDimension: 0.72, rotation: [0, 0, 0], offset: [0, 0, 0] },
  ductTape:   { targetLongestDimension: 0.48, rotation: [0, 0, 0], offset: [0, 0, 0] },
  fishingRod: { targetLongestDimension: 1.80, rotation: [0, 0, 0], offset: [0, 0, 0] },
  baitTin:    { targetLongestDimension: 0.58, rotation: [0, 0, 0], offset: [0, 0, 0] },
  medicalKit: { targetLongestDimension: 0.72, rotation: [0, 0, 0], offset: [0, 0, 0] },
  waterJug:   { targetLongestDimension: 0.78, rotation: [0, 0, 0], offset: [0, 0, 0] },
  cannedFood: { targetLongestDimension: 0.42, rotation: [0, 0, 0], offset: [0, 0, 0] },
  flashlight: { targetLongestDimension: 0.72, rotation: [0, 0, 0], offset: [0, 0, 0] },
  scubaSet:   { targetLongestDimension: 1.10, rotation: [0, 0, 0], offset: [0, 0, 0] },
};
```

Set every `maxTriangles` to `3_000`. Encode the exact public/resource IDs and licenses from Task 1.

Run: `bun run test -- tests/itemModelManifest.test.ts`

Expected: PASS.

- [ ] **Step 3: Write failing library preload and ownership tests**

In `tests/PropModelLibrary.test.ts`, cover:

1. `load()` requests all nine URLs before any deferred request resolves;
2. every loaded result has complete manifest/ledger provenance, at least one mesh, finite positions, finite non-empty bounds, and an allowed triangle count;
3. rejection includes the item ID and disposes every fulfilled template;
4. `create()` preserves `prop:<instanceId>`, `instanceId`, and `itemType` metadata;
5. duplicate instances have distinct roots, geometries, and every material entry;
6. mutating one instance material does not change its sibling or template;
7. `dispose()` is idempotent and disposes every template resource once.

Run: `bun run test -- tests/PropModelLibrary.test.ts`

Expected: FAIL because `PropModelLibrary` does not exist.

- [ ] **Step 4: Implement validation and normalization helpers**

In `src/world/PropModelLibrary.ts`, implement and export only what tests need. Triangle counting must use:

```ts
export function geometryTriangles(geometry: BufferGeometry): number {
  const count = geometry.index?.count ?? geometry.getAttribute('position')?.count ?? 0;
  return count / 3;
}
```

Reject missing/empty position attributes, non-finite position components, non-triangle counts, no meshes, and non-finite or zero-length bounding boxes. Apply rotation first, compute the bounding box, scale uniformly by `targetLongestDimension / longestSide`, recompute the box, and translate its center to the manifest offset. Enable `castShadow` and `receiveShadow` on every mesh.

- [ ] **Step 5: Implement parallel preload with cleanup**

Use `GLTFLoader` from `three/addons/loaders/GLTFLoader.js`:

```ts
class GltfItemModelLoader implements ItemModelLoader {
  private readonly loader = new GLTFLoader();

  async load(url: string): Promise<Group> {
    return (await this.loader.loadAsync(url)).scene;
  }
}
```

Validate each manifest record against `ITEM_MODEL_ASSET_LEDGER` before loading. Use `Promise.allSettled()` over `ITEM_IDS` so a failure cannot strand already-loaded resources. A per-item load/normalization branch must dispose its source root if validation throws before fulfillment. On any failure, dispose all fulfilled normalized roots and throw `ItemModelLoadError` with the first failing item in `ITEM_IDS` order. Validate aggregate triangles before constructing the library.

- [ ] **Step 6: Implement independent instance cloning**

Clone the normalized group hierarchy and then replace every mesh resource:

```ts
function cloneOwnedTemplate(template: Group): Group {
  const clone = template.clone(true);
  clone.traverse((object) => {
    if (!(object instanceof Mesh)) return;
    object.geometry = object.geometry.clone();
    object.material = Array.isArray(object.material)
      ? object.material.map((material) => material.clone())
      : object.material.clone();
    object.castShadow = true;
    object.receiveShadow = true;
  });
  return clone;
}
```

Assign root name and user data only after cloning. `fromTemplatesForTest()` must accept already-normalized fixture roots and take ownership of them. `dispose()` must be idempotent.

- [ ] **Step 7: Add the shared test fixture and verify GREEN**

Create `tests/helpers/propModels.ts`. Build one `Group` per `ITEM_IDS` entry containing `new Mesh(new BoxGeometry(0.2 + index * 0.01, 0.2, 0.2), new MeshStandardMaterial({ color: new Color().setHSL(index / ITEM_IDS.length, 0.55, 0.5) }))`, then return `PropModelLibrary.fromTemplatesForTest(map)`. This makes each fixture distinguishable without relying on production GLBs.

Run: `bun run test -- tests/itemModelManifest.test.ts tests/PropModelLibrary.test.ts`

Expected: PASS.

- [ ] **Step 8: Commit the manifest and library**

```bash
git add src/world/itemModelManifest.ts src/world/PropModelLibrary.ts tests/helpers/propModels.ts tests/itemModelManifest.test.ts tests/PropModelLibrary.test.ts
git commit -m "feat: preload validated item model templates"
```

---

### Task 3: Replace Procedural Prop Construction in Both Worlds

**Files:**
- Modify: `src/world/PropFactory.ts`
- Modify: `src/world/World.ts`
- Modify: `src/survival/BoatWorld.ts`
- Modify: `tests/world.test.ts`
- Modify: `tests/BoatWorld.test.ts`

**Interfaces:**

```ts
export function createProp(models: PropModelLibrary, instance: ItemInstance): Group {
  return models.create(instance);
}

new World(scene, propModels, instances?)
new BoatWorld(camera, reducedMotion, propModels, savedItems?)
```

- [ ] **Step 1: Convert world tests to fixture injection and verify RED**

Create one fresh `createTestPropModels()` library per test that constructs `World`, `BoatWorld`, or `createProp`. Pass it through the new expected signatures and dispose it after world disposal. Replace procedural mesh-count/shape assertions with:

```ts
expect(prop.name).toBe(`prop:${instance.instanceId}`);
expect(prop.userData).toMatchObject({
  instanceId: instance.instanceId,
  itemType: instance.type,
});
expect(meshCount(prop)).toBeGreaterThan(0);
```

Retain all existing assertions covering spawn count, spawn positions, carrying, landing, saving, losing, storage transforms, depleted tint, fishing animation, and disposal.

Run: `bun run test -- tests/world.test.ts tests/BoatWorld.test.ts`

Expected: FAIL on the old constructor and factory signatures.

- [ ] **Step 2: Remove all procedural item branches**

Replace the contents of `src/world/PropFactory.ts` with the two imports and delegating function shown in the interface. Confirm the file no longer imports `BoxGeometry`, `CylinderGeometry`, `SphereGeometry`, `TorusGeometry`, or creates a material.

- [ ] **Step 3: Inject the library into World**

Change `World` to:

```ts
constructor(
  private readonly scene: Scene,
  private readonly propModels: PropModelLibrary,
  instances: readonly ItemInstance[] = createItemInstances(),
) {
```

Call `createProp(this.propModels, instance)`. Keep `collectOwnedResources()` so instance-owned geometry/material disposal remains in `World`; do not dispose the shared library from a phase world.

- [ ] **Step 4: Inject the library into BoatWorld**

Add `propModels: PropModelLibrary` before `savedItems` and call `createProp(propModels, instance)`. Keep all root names, storage transforms, remaining-use metadata, depletion coloring, rod lookup, and fishing cue logic unchanged.

- [ ] **Step 5: Verify world behavior and resource ownership**

Run: `bun run test -- tests/world.test.ts tests/BoatWorld.test.ts`

Expected: PASS. Specifically, the duplicate depleted-item test must prove only the selected instance changes color, and disposal spies must see each instance geometry/material exactly once.

- [ ] **Step 6: Commit the production replacement**

```bash
git add src/world/PropFactory.ts src/world/World.ts src/survival/BoatWorld.ts tests/world.test.ts tests/BoatWorld.test.ts
git commit -m "feat: render downloaded models in game worlds"
```

---

### Task 4: Thread the Library Through Game and Phase Dependencies

**Files:**
- Modify: `src/app/GamePhase.ts`
- Modify: `src/Game.ts`
- Modify: `src/phases/ScavengePhase.ts`
- Modify: `src/survival/SurvivalPhase.ts`
- Modify: `tests/GameLifecycle.test.ts`
- Modify: `tests/GameDirector.test.ts`
- Modify: any test compiling a literal `PhaseContext`

**Interfaces:**

```ts
export interface PhaseContext {
  mount: HTMLElement;
  renderer: WebGLRenderer;
  camera: PerspectiveCamera;
  reducedMotion: MediaQueryList;
  propModels: PropModelLibrary;
}

new Game(mount, propModels)
Game.forTest(factories, { propModels, clock, createSeed })
```

- [ ] **Step 1: Write the failing dependency-flow regression**

Update `tests/GameLifecycle.test.ts` so its fake context and `Game.forTest()` options contain one `createTestPropModels()` result. Capture `context.propModels` in both fake factories and assert both receive the exact same object across scavenge completion and restart.

Run: `bun run test -- tests/GameLifecycle.test.ts`

Expected: FAIL because `PhaseContext` and `Game` do not yet carry the library.

- [ ] **Step 2: Add the explicit phase context dependency**

Import `PropModelLibrary` as a type in `src/app/GamePhase.ts` and add `propModels`. In `ScavengePhase`, construct:

```ts
this.world = new World(this.scene, context.propModels, instances);
```

In production `SurvivalPhase`, construct:

```ts
new BoatWorld(context.camera, context.reducedMotion, context.propModels, savedItems)
```

The private `testContext()` may use an inert type-cast library because `SurvivalPhase.forTest()` always injects a world and never calls it.

- [ ] **Step 3: Give Game ownership of the shared library**

Add `private propModels!: PropModelLibrary`. Pass the constructor argument through `initialize()`, add it to `this.context`, and call `this.propModels.dispose()` after the active phase is disposed in `Game.dispose()`. Keep library disposal out of phase transitions and restarts.

Make `GameTestOptions.propModels` required so tests cannot silently create production dependencies:

```ts
export interface GameTestOptions {
  propModels: PropModelLibrary;
  clock?: GameClock;
  createSeed?: () => number;
}
```

- [ ] **Step 4: Update every typed test context and verify GREEN**

Run: `rg -n "PhaseContext|Game\.forTest\(|new Game\(" src tests`

Update every result, including all eight calls in `tests/GameDirector.test.ts`, to pass a fixture or inert test library, with no optional production fallback.

Run: `bun run test -- tests/GameLifecycle.test.ts tests/SurvivalPhase.test.ts tests/SurvivalPhaseFocus.test.ts`

Expected: PASS.

Run: `bun run typecheck`

Expected: exit 0.

- [ ] **Step 5: Commit explicit dependency wiring**

```bash
git add src/app/GamePhase.ts src/Game.ts src/phases/ScavengePhase.ts src/survival/SurvivalPhase.ts tests/GameLifecycle.test.ts tests/GameDirector.test.ts tests/SurvivalPhase.test.ts tests/SurvivalPhaseFocus.test.ts
git commit -m "refactor: inject item models through game phases"
```

Before committing, inspect `git diff --cached --name-only` and confirm this commit contains only dependency-related test edits, not unrelated user files.

---

### Task 5: Cancellable Async Launch and Safe Failure UI

**Files:**
- Create: `src/app/launchGame.ts`
- Modify: `src/main.ts`
- Create: `tests/launchGame.test.ts`
- Modify: `src/styles/main.css` only if the loading state needs one narrowly scoped rule

**Interfaces:**

```ts
export interface LaunchHandle {
  readonly completion: Promise<Game | null>;
  cancel(): void;
}

export interface LaunchDependencies {
  loadModels(): Promise<PropModelLibrary>;
  createGame(mount: HTMLElement, models: PropModelLibrary): Pick<Game, 'start' | 'dispose'>;
}

export function launchGame(
  mount: HTMLElement,
  dependencies?: LaunchDependencies,
): LaunchHandle;
```

- [ ] **Step 1: Write failing launcher lifecycle tests**

In `tests/launchGame.test.ts`, use deferred promises and fakes to prove:

1. `RECOVERING SUPPLIES` renders before `loadModels()` resolves;
2. `createGame()` and `start()` run only after successful preload;
3. an `ItemModelLoadError('ductTape', new Error('download failed'))` renders `SUPPLIES UNAVAILABLE`, includes `DUCT TAPE`, and never creates a game;
4. a renderer/create-game exception renders `WEBGL UNAVAILABLE`;
5. `<script>` and `&` in an error message render as text, never markup;
6. `cancel()` or disconnecting/replacing the mount before preload completion disposes the late library and never creates a game;
7. `cancel()` after startup disposes the game once;
8. a failed constructor disposes the loaded library once.

Run: `bun run test -- tests/launchGame.test.ts`

Expected: FAIL because `launchGame` does not exist.

- [ ] **Step 2: Implement loading and escaped error rendering**

Use DOM construction or a single shared `escapeHtml()`:

```ts
export function escapeHtml(value: string): string {
  return value.replace(/[&<>'"]/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;',
  })[character]!);
}
```

Render the loading kicker exactly as `RECOVERING SUPPLIES`. Render item failures with `SUPPLIES UNAVAILABLE`; keep WebGL failures under `WEBGL UNAVAILABLE`. Do not display stack traces.

- [ ] **Step 3: Implement cancellation and ownership transfer**

Track `cancelled`, `game`, and `unownedModels`. Require the mount to remain connected immediately before game construction; a replacement disconnects the original mount and takes the same cleanup path as cancellation. On successful construction, transfer ownership by setting `unownedModels = null`; thereafter `Game.dispose()` owns the library. If cancelled while awaiting, dispose the resolved library immediately. Make `cancel()` idempotent. Launcher tests must attach their mount to `document.body` and clean it up after each test.

- [ ] **Step 4: Replace the synchronous entry point**

`src/main.ts` should only locate `#app`, call `launchGame(mount)`, and cancel on `pagehide`:

```ts
const launch = launchGame(mount);
window.addEventListener('pagehide', () => launch.cancel(), { once: true });
void launch.completion;
```

- [ ] **Step 5: Verify launch behavior**

Run: `bun run test -- tests/launchGame.test.ts tests/GameLifecycle.test.ts tests/smoke.test.ts`

Expected: PASS.

Run: `bun run typecheck`

Expected: exit 0.

- [ ] **Step 6: Commit async launch**

```bash
git add src/app/launchGame.ts src/main.ts tests/launchGame.test.ts src/styles/main.css
git commit -m "feat: preload item models before launch"
```

If `src/styles/main.css` is unchanged, omit it from staging.

---

### Task 6: Full Automated Regression and Static Asset Audit

**Files:**
- Modify only files implicated by a failing regression; do not broaden the model set or budgets.

- [ ] **Step 1: Prove no procedural item geometry remains**

Run: `rg -n "BoxGeometry|CylinderGeometry|SphereGeometry|TorusGeometry" src/world/PropFactory.ts`

Expected: no matches.

Run: `rg -n "poly\.pizza|static\.poly\.pizza" src --glob '!**/*.md'`

Expected: source URLs occur only as attribution strings in `itemModelManifest.ts`; no `fetch`, loader, image, or runtime asset URL targets Poly Pizza.

- [ ] **Step 2: Run the model budget and attribution audit**

Run: `bun run models:check`

Expected: nine files pass their individual limits (3,000 except Tape at 21,000) and the aggregate is at or below 28,000 triangles.

- [ ] **Step 3: Run focused model/world tests**

Run: `bun run test -- tests/itemModelManifest.test.ts tests/PropModelLibrary.test.ts tests/world.test.ts tests/BoatWorld.test.ts tests/launchGame.test.ts tests/GameLifecycle.test.ts`

Expected: PASS with 0 failures.

- [ ] **Step 4: Run complete verification**

Run: `bun run typecheck`

Expected: exit 0 with no TypeScript diagnostics.

Run: `bun run test`

Expected: every test file passes with 0 failures.

Run: `bun run build`

Expected: exit 0; Vite emits all nine hashed GLB assets into `dist/assets/`.

- [ ] **Step 5: Inspect bundle and repository state**

Run: `Get-ChildItem dist/assets -Filter *.glb | Select-Object Name,Length`

Expected: nine emitted GLB files.

Run: `git diff --check`

Expected: no whitespace errors.

Run: `git status --short`

Expected: only planned changes plus the pre-existing untracked `dev-server.err`; never stage `dev-server.err`.

---

### Task 7: Browser Visual Tuning and Final Acceptance

**Files:**
- Modify: `src/world/itemModelManifest.ts` only for measured rotation, target dimension, or offset tuning.
- Modify: `THIRD_PARTY_ASSETS.md` only if processing changes.
- Modify: tests only when a tuned manifest value has an explicit regression assertion.

- [ ] **Step 1: Start the production-like local build**

Run: `bun run build`

Run: `bun run preview -- --host 127.0.0.1 --port 4173 --strictPort`

Expected: preview server reports `http://127.0.0.1:4173`.

- [ ] **Step 2: Verify the loading and failure surfaces**

Throttle once to observe `RECOVERING SUPPLIES`. Temporarily rename one local GLB in an uncommitted working change, reload, and confirm the item-specific failure screen; restore the file immediately. Confirm no Poly Pizza request appears in the browser network log.

- [ ] **Step 3: Inspect all scavenging instances at 1280x720**

Confirm all fourteen instances are present and recognizable: one flare gun, two tape rolls, one rod, two bait tins, one medical kit, two water containers, three food cans, one flashlight, and one scuba set. Confirm items sit plausibly at spawn points, do not obstruct navigation, remain targetable, cast/receive shadows, and have no extreme rotation or scale.

- [ ] **Step 4: Exercise every root-level interaction**

For each item type, pick up, carry, drop/throw, land, save, and lose at least one instance. Confirm no origin jump, camera obstruction, broken interaction anchor, or stale root name. Specifically compare duplicate tape, bait, water, and food instances.

- [ ] **Step 5: Inspect survival storage and cues at both viewports**

Verify dense saved combinations at 1280x720 and 1920x1080. Exercise day, night, overcast, and squall lighting. Consume duplicate finite-use items and confirm only the depleted instance tints. Trigger fishing and confirm `prop:fishingRod-1` still animates.

- [ ] **Step 6: Tune only manifest transforms**

If a model fails visual checks, adjust only its `targetLongestDimension`, Euler `rotation`, or `offset`; do not edit gameplay transforms to compensate. After each tuning batch run:

```bash
bun run test -- tests/itemModelManifest.test.ts tests/PropModelLibrary.test.ts tests/world.test.ts tests/BoatWorld.test.ts
bun run typecheck
```

- [ ] **Step 7: Re-run all acceptance gates after tuning**

Run: `bun run models:check`

Run: `bun run typecheck`

Run: `bun run test`

Run: `bun run build`

Expected: all four commands exit 0 using the final tuned manifest.

- [ ] **Step 8: Review against the approved specification**

Compare the implementation line by line with `docs/superpowers/specs/2026-07-13-downloaded-low-poly-item-models-design.md`. Confirm every acceptance criterion, including all nine identities, all fourteen physical instances, attribution, budgets, local-only runtime loading, independent material state, failure behavior, and both viewport checks. Report any deviation instead of claiming completion.

- [ ] **Step 9: Commit final tuning and verification-facing documentation**

```bash
git add src/world/itemModelManifest.ts THIRD_PARTY_ASSETS.md tests
git commit -m "fix: tune imported item model presentation"
```

If no files changed during visual tuning, do not create an empty commit.

## Final Self-Review Checklist

- [ ] Every task names exact files, commands, expected outcomes, and commit boundaries.
- [ ] The approved Poly Pizza public IDs and direct GLB resource IDs are fixed, with no unresolved model lookup.
- [ ] Both over-budget source assets have deterministic offline simplification settings.
- [ ] Production loading is local, parallel, validated, cancellable, and failure-visible.
- [ ] Geometry/material ownership is explicit across templates, instances, worlds, phases, Game, and launch cancellation.
- [ ] Tests cover manifest completeness, files, provenance, preload failures, clone independence, disposal, gameplay, and launch behavior.
- [ ] Automated and browser verification cover all nine types, fourteen scavenging instances, both phases, both required viewports, lighting, depletion, and fishing.
- [ ] No unresolved marker or abbreviated implementation instruction remains in this plan.

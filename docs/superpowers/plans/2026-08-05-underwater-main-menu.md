# Underwater Main Menu Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (- [ ]) syntax for tracking.

**Goal:** Replace the ship title view with a fixed-camera underwater menu that leads into the current scavenging intro.

**Architecture:** Add a dedicated menu phase, asset library, world, animator, and UI. Keep the shared renderer and camera across the menu-to-scavenging transition.

**Tech Stack:** TypeScript 5.9, Three.js 0.180, Vite 7, Vitest 3, PowerShell, glTF Transform, Poly Pizza GLB assets.

## Global Constraints

- Read VISUAL_STYLE_GUIDE.md before changing scene composition, lighting, materials, animation, or UI.
- Preserve the current scavenging intro and all gameplay rules.
- Keep the menu camera fully fixed.
- Keep the title, START action, and HOW TO PLAY action.
- Fade to black for 0.7 seconds after pointer lock succeeds.
- Use local pinned assets. Do not download assets at runtime.
- Add no package unless the current dependencies cannot meet a verified need.
- Remove the old title path. Do not add a compatibility layer.
- Do not add reduced-motion behavior.
- Do not add menu audio, settings, saves, credits, or new actions.
- Do not add gore or strong horror.
- Avoid allocations and repeated setup during frame updates and rendering.
- Keep all current unrelated working-tree changes intact.
- Target desktop browsers with keyboard and mouse.

## File Structure

### New runtime files

- src/menu/menuModelManifest.ts — model IDs, URLs, presentation metadata, and generated metadata.
- src/menu/MenuModelLibrary.ts — required model loading, validation, cloning, animation clips, and disposal.
- src/menu/menuChoreography.ts — allocation-free paths and motion sampling.
- src/menu/MenuUI.ts — title actions, guide dialog, fade cover, and pointer-lock errors.
- src/menu/SkeletonAssembly.ts — static seated human skeleton made from a skull and procedural bones.
- src/menu/UnderwaterPlantField.ts — procedural kelp geometry and shared sway shader.
- src/menu/UnderwaterParticles.ts — fixed bubble and suspended-matter particle pools.
- src/menu/UnderwaterMenuWorld.ts — scene composition, lighting, fog, models, fish, and actor references.
- src/menu/UnderwaterMenuAnimator.ts — shark clips, path motion, fish motion, and shared time uniforms.
- src/phases/MainMenuPhase.ts — menu lifecycle, pointer lock, fade timing, resize, render, and transition.

### New asset pipeline files

- scripts/poly-pizza-menu-models.mjs — pinned Poly Pizza descriptors and GLB processing.
- scripts/poly-pizza-menu-models.d.mts — descriptor and build declarations for tests.
- scripts/fetch-menu-models.ps1 — verified download, staging, audit, and atomic publication.
- scripts/check-menu-models.mjs — exact file, metadata, animation, budget, and attribution audit.
- src/assets/models/menu/*.glb — eight processed menu models.
- src/assets/models/menu/menu-model-metadata.json — exact geometry bounds and animation metadata.

### New tests

- tests/MenuModelSources.test.ts
- tests/MenuModelLibrary.test.ts
- tests/menuChoreography.test.ts
- tests/MenuUI.test.ts
- tests/UnderwaterMenuWorld.test.ts
- tests/UnderwaterMenuAnimator.test.ts
- tests/MainMenuPhase.test.ts

### Modified runtime and project files

- package.json — menu asset fetch and audit commands.
- src/assets/ATTRIBUTION.md — eight source records.
- src/app/GamePhase.ts — menu model library in the shared phase context.
- src/app/launchGame.ts — menu asset preload, ownership, failure screen, and Game construction.
- src/Game.ts — menu factory, initial phase, menu transition, disposal, and return-to-menu flow.
- src/phases/ScavengePhase.ts — start directly in the existing intro and remove title ownership.
- src/ui/GameUI.ts — remove title and guide markup.
- src/styles/main.css — add menu selectors and remove obsolete title selectors.
- src/rendering/SceneRenderer.ts — add menu visual state.
- tests/launchGame.test.ts
- tests/GameConstruction.test.ts
- tests/GameLifecycle.test.ts
- tests/GameUI.test.ts
- tests/GameUIIntro.test.ts
- README.md

---

### Task 1: Pin, fetch, validate, and credit menu models

**Files:**

- Create: scripts/poly-pizza-menu-models.mjs
- Create: scripts/poly-pizza-menu-models.d.mts
- Create: scripts/fetch-menu-models.ps1
- Create: scripts/check-menu-models.mjs
- Create: tests/MenuModelSources.test.ts
- Create: src/assets/models/menu/boat.glb
- Create: src/assets/models/menu/rockA.glb
- Create: src/assets/models/menu/rockB.glb
- Create: src/assets/models/menu/rockC.glb
- Create: src/assets/models/menu/fishBone.glb
- Create: src/assets/models/menu/skull.glb
- Create: src/assets/models/menu/largeBone.glb
- Create: src/assets/models/menu/shark.glb
- Create: src/assets/models/menu/menu-model-metadata.json
- Modify: package.json
- Modify: src/assets/ATTRIBUTION.md

**Interfaces:**

- Consumes: createPolyPizzaSource() and buildPolyPizzaModels() from scripts/poly-pizza-models.mjs.
- Produces: POLY_PIZZA_MENU_MODEL_IDS, POLY_PIZZA_MENU_MODEL_SOURCES, and buildPolyPizzaMenuModels().
- Produces commands: bun run models:fetch:menu and bun run models:check:menu.

- [ ] **Step 1: Write the descriptor contract test**

~~~ts
import { describe, expect, it } from 'vitest';
import {
  POLY_PIZZA_MENU_MODEL_IDS,
  POLY_PIZZA_MENU_MODEL_SOURCES,
} from '../scripts/poly-pizza-menu-models.mjs';

describe('underwater menu model sources', () => {
  it('pins the exact approved Poly Pizza models', () => {
    expect(POLY_PIZZA_MENU_MODEL_IDS).toEqual([
      'boat', 'rockA', 'rockB', 'rockC',
      'fishBone', 'skull', 'largeBone', 'shark',
    ]);
    expect(Object.fromEntries(POLY_PIZZA_MENU_MODEL_IDS.map((id) => [
      id,
      {
        publicId: POLY_PIZZA_MENU_MODEL_SOURCES[id].publicId,
        resourceId: POLY_PIZZA_MENU_MODEL_SOURCES[id].resourceId,
        sha256: POLY_PIZZA_MENU_MODEL_SOURCES[id].sha256,
        sourceTriangles: POLY_PIZZA_MENU_MODEL_SOURCES[id].sourceTriangles,
      },
    ]))).toEqual({
      boat: {
        publicId: 'YwdXrwbN3o',
        resourceId: '66ae3fa9-d6de-45dc-86c0-659786b865e1',
        sha256: 'FEE1EE45E5457D146857D064982922A378D909794E34A2FC89572BB946BA8464',
        sourceTriangles: 412,
      },
      rockA: {
        publicId: 'd2VWOdthtR',
        resourceId: 'd7bc2b98-2c73-4e78-b0bd-e5e24d65734a',
        sha256: '76F1F4BABFEFED5FF852C97978065AC6FF1EEC5B6930BAE9E62EA095BFAE0FB5',
        sourceTriangles: 448,
      },
      rockB: {
        publicId: '54jZKTAt5p',
        resourceId: 'c14651f6-9ef8-41e8-8aca-cafed61d9ca2',
        sha256: 'C4E9F04C04419E67E919C4533DFD6044ABC5F0640AFA9D0E174CF474285D380C',
        sourceTriangles: 222,
      },
      rockC: {
        publicId: 'li0YBlBEMz',
        resourceId: 'a50f220b-3c4c-4226-ae97-0458ed615cd2',
        sha256: 'AFF6F5DF4CB5309400C9E85790D8FBAAB5EBE281402A54E7BA4308038DEFC9F3',
        sourceTriangles: 432,
      },
      fishBone: {
        publicId: 'bU5RLZnq6v',
        resourceId: 'ed285a5f-7c35-47b0-a12d-60006f5eb74c',
        sha256: 'D15FC15F86F84BA38B3A0CF18E5B23651F7541433B59D045233793B2A54FB51E',
        sourceTriangles: 588,
      },
      skull: {
        publicId: 'VGtSTNRf2O',
        resourceId: '2a686e08-5456-405f-a6ef-03274e080b2f',
        sha256: '3A05AC7A8FE56832E988285D24F755F2D22DB51CC0E70F2BD559077F6324349B',
        sourceTriangles: 3132,
      },
      largeBone: {
        publicId: 'A67un3x9nV',
        resourceId: 'dc066333-7257-425b-bbc0-7d93403d019d',
        sha256: 'AD3442D1998FE6AAA27EFC585EBA2C651C80ED2BB9467A6082DC6507509F3AF9',
        sourceTriangles: 1680,
      },
      shark: {
        publicId: 'AyHTK3zUSG',
        resourceId: 'd2d374ea-eb1d-4659-8cc7-816a83b82470',
        sha256: '6D5CF3CD7EA749583B622A306CFCAE4DE85432EFCC74A1EC6F52E5430CF13AFF',
        sourceTriangles: 644,
      },
    });
  });
});
~~~

- [ ] **Step 2: Run the source test and verify failure**

Run: bunx vitest run tests/MenuModelSources.test.ts

Expected: FAIL because scripts/poly-pizza-menu-models.mjs does not exist.

- [ ] **Step 3: Add the exact source descriptors**

~~~js
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildPolyPizzaModels,
  createPolyPizzaSource,
} from './poly-pizza-models.mjs';

const source = (options) => createPolyPizzaSource({
  ...options,
  downloadedOn: '2026-08-05',
});

export const POLY_PIZZA_MENU_MODEL_SOURCES = Object.freeze({
  boat: source({
    id: 'boat', publicId: 'YwdXrwbN3o',
    resourceId: '66ae3fa9-d6de-45dc-86c0-659786b865e1',
    title: 'Boat', creator: 'Pixel', license: 'CC-BY 3.0',
    sha256: 'FEE1EE45E5457D146857D064982922A378D909794E34A2FC89572BB946BA8464',
    sourceTriangles: 412, maxTriangles: 500,
  }),
  rockA: source({
    id: 'rockA', publicId: 'd2VWOdthtR',
    resourceId: 'd7bc2b98-2c73-4e78-b0bd-e5e24d65734a',
    title: 'Rock Large', creator: 'Quaternius', license: 'CC0 1.0',
    sha256: '76F1F4BABFEFED5FF852C97978065AC6FF1EEC5B6930BAE9E62EA095BFAE0FB5',
    sourceTriangles: 448, maxTriangles: 500,
  }),
  rockB: source({
    id: 'rockB', publicId: '54jZKTAt5p',
    resourceId: 'c14651f6-9ef8-41e8-8aca-cafed61d9ca2',
    title: 'Rock Large', creator: 'Quaternius', license: 'CC0 1.0',
    sha256: 'C4E9F04C04419E67E919C4533DFD6044ABC5F0640AFA9D0E174CF474285D380C',
    sourceTriangles: 222, maxTriangles: 300,
  }),
  rockC: source({
    id: 'rockC', publicId: 'li0YBlBEMz',
    resourceId: 'a50f220b-3c4c-4226-ae97-0458ed615cd2',
    title: 'Rock Large', creator: 'Quaternius', license: 'CC0 1.0',
    sha256: 'AFF6F5DF4CB5309400C9E85790D8FBAAB5EBE281402A54E7BA4308038DEFC9F3',
    sourceTriangles: 432, maxTriangles: 500,
  }),
  fishBone: source({
    id: 'fishBone', publicId: 'bU5RLZnq6v',
    resourceId: 'ed285a5f-7c35-47b0-a12d-60006f5eb74c',
    title: 'Fish Bone', creator: 'Quaternius', license: 'CC0 1.0',
    sha256: 'D15FC15F86F84BA38B3A0CF18E5B23651F7541433B59D045233793B2A54FB51E',
    sourceTriangles: 588, maxTriangles: 700,
  }),
  skull: source({
    id: 'skull', publicId: 'VGtSTNRf2O',
    resourceId: '2a686e08-5456-405f-a6ef-03274e080b2f',
    title: 'Skull', creator: 'Quaternius', license: 'CC0 1.0',
    sha256: '3A05AC7A8FE56832E988285D24F755F2D22DB51CC0E70F2BD559077F6324349B',
    sourceTriangles: 3132, maxTriangles: 3_500,
  }),
  largeBone: source({
    id: 'largeBone', publicId: 'A67un3x9nV',
    resourceId: 'dc066333-7257-425b-bbc0-7d93403d019d',
    title: 'Large Bone', creator: 'Quaternius', license: 'CC0 1.0',
    sha256: 'AD3442D1998FE6AAA27EFC585EBA2C651C80ED2BB9467A6082DC6507509F3AF9',
    sourceTriangles: 1680, maxTriangles: 1_800,
  }),
  shark: source({
    id: 'shark', publicId: 'AyHTK3zUSG',
    resourceId: 'd2d374ea-eb1d-4659-8cc7-816a83b82470',
    title: 'Shark', creator: 'Quaternius', license: 'CC0 1.0',
    sha256: '6D5CF3CD7EA749583B622A306CFCAE4DE85432EFCC74A1EC6F52E5430CF13AFF',
    sourceTriangles: 644, maxTriangles: 700,
  }),
});

export const POLY_PIZZA_MENU_MODEL_IDS = Object.freeze(
  Object.keys(POLY_PIZZA_MENU_MODEL_SOURCES),
);

export function buildPolyPizzaMenuModels({ sourceRoot, outputRoot, verifySource = true }) {
  return buildPolyPizzaModels({
    sourceRoot,
    outputRoot,
    sources: POLY_PIZZA_MENU_MODEL_SOURCES,
    verifySource,
  });
}
~~~

- [ ] **Step 4: Add the typed declaration**

~~~ts
export interface MenuModelSource {
  readonly id: string;
  readonly publicId: string;
  readonly resourceId: string;
  readonly pageUrl: string;
  readonly downloadUrl: string;
  readonly sourceAssetId: string;
  readonly title: string;
  readonly creator: string;
  readonly license: 'CC0 1.0' | 'CC-BY 3.0';
  readonly sha256: string;
  readonly sourceTriangles: number;
  readonly downloadedOn: string;
  readonly maxTriangles: number;
}

export const POLY_PIZZA_MENU_MODEL_IDS: readonly string[];
export const POLY_PIZZA_MENU_MODEL_SOURCES:
  Readonly<Record<string, MenuModelSource>>;
export function buildPolyPizzaMenuModels(options: {
  sourceRoot: string;
  outputRoot: string;
  verifySource?: boolean;
}): Promise<Record<string, unknown>>;
~~~

- [ ] **Step 5: Add the atomic fetch script**

Copy the guarded staging structure from scripts/fetch-fishing-models.ps1.

Use this exact model order and output metadata command:

~~~powershell
$modelIds = @(
  'boat', 'rockA', 'rockB', 'rockC',
  'fishBone', 'skull', 'largeBone', 'shark'
)
$expectedFiles = @($modelIds | ForEach-Object { "$_.glb" }) +
  @('menu-model-metadata.json')

& node scripts/poly-pizza-menu-models.mjs $sourceRoot $buildRoot
if ($LASTEXITCODE -ne 0) { throw 'Menu model build failed' }

& node scripts/event-model-metadata.mjs $buildRoot @modelIds
if ($LASTEXITCODE -ne 0) { throw 'Menu model metadata build failed' }

Move-Item -LiteralPath (Join-Path $buildRoot 'event-model-metadata.json') -Destination (Join-Path $buildRoot 'menu-model-metadata.json')
~~~

Publish only after scripts/check-menu-models.mjs passes against the staged directory.

- [ ] **Step 6: Add the asset audit**

Set per-model limits from the descriptors and a total committed limit of 8,000 triangles.

Require this exact shark clip:

~~~js
const REQUIRED_SHARK_CLIP = Object.freeze({
  name: 'Armature|Swim',
  duration: 1.25,
  channels: 8,
});

const sharkAnimations = metadata?.shark?.animations;
if (
  !Array.isArray(sharkAnimations)
  || sharkAnimations.length !== 1
  || JSON.stringify(sharkAnimations[0]) !== JSON.stringify(REQUIRED_SHARK_CLIP)
) {
  errors.push('shark: required Armature|Swim animation metadata is missing');
}
~~~

Check exact files, finite bounds, triangle counts, source hashes, embedded resources, and one attribution row per model.

- [ ] **Step 7: Add package commands**

~~~json
"models:fetch:menu": "powershell -ExecutionPolicy Bypass -File scripts/fetch-menu-models.ps1",
"models:check:menu": "node scripts/check-menu-models.mjs"
~~~

Append models:fetch:menu to models:fetch.

Append models:check:menu to models:check.

- [ ] **Step 8: Fetch and publish the model directory**

Run: bun run models:fetch:menu

Expected: eight GLB files and menu-model-metadata.json appear under src/assets/models/menu.

- [ ] **Step 9: Add exact attribution rows**

Add a Runtime underwater-menu model ledger.

Credit Boat by Pixel under CC-BY 3.0.

Credit the seven Quaternius models under CC0 1.0.

Include the page URL, poly-pizza resource ID, source hash, source triangles, committed triangles, and 2026-08-05.

- [ ] **Step 10: Run source and asset checks**

Run: bunx vitest run tests/MenuModelSources.test.ts

Expected: PASS.

Run: bun run models:check:menu

Expected: each model prints its exact triangle count, shark animation validation passes, and total is 7,558 / 8,000.

- [ ] **Step 11: Commit**

~~~bash
git add package.json scripts/poly-pizza-menu-models.mjs scripts/poly-pizza-menu-models.d.mts scripts/fetch-menu-models.ps1 scripts/check-menu-models.mjs tests/MenuModelSources.test.ts src/assets/models/menu src/assets/ATTRIBUTION.md
git commit -m "feat: add underwater menu model assets"
~~~

### Task 2: Load and clone required menu models

**Files:**

- Create: src/menu/menuModelManifest.ts
- Create: src/menu/MenuModelLibrary.ts
- Create: tests/MenuModelLibrary.test.ts

**Interfaces:**

- Consumes: src/assets/models/menu/menu-model-metadata.json.
- Consumes: src/assets/models/fishing/fishing-model-metadata.json.
- Produces: MenuModelId and MENU_MODEL_SPECS.
- Produces: MenuModelLibrary.load(), create(), and dispose().
- Produces: MenuModelInstance with root, animations, and dispose().

- [ ] **Step 1: Write failing library tests**

~~~ts
import {
  AnimationClip,
  BoxGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  NumberKeyframeTrack,
} from 'three';
import { describe, expect, it, vi } from 'vitest';
import {
  MenuModelLibrary,
  MenuModelLoadError,
  type MenuModelLoader,
} from '../src/menu/MenuModelLibrary';
import { MENU_MODEL_IDS } from '../src/menu/menuModelManifest';

function root(id: string): Group {
  const value = new Group();
  value.name = id;
  value.add(new Mesh(new BoxGeometry(), new MeshBasicMaterial()));
  value.animations = id === 'shark'
    ? [new AnimationClip('Armature|Swim', 1.25, [
      new NumberKeyframeTrack('.rotation[y]', [0, 1.25], [0, 0.1]),
    ])]
    : [];
  return value;
}

it('loads every required model and clones independent roots', async () => {
  const loader: MenuModelLoader = {
    load: vi.fn(async (url) => root(url.includes('shark') ? 'shark' : url)),
  };
  const library = await MenuModelLibrary.load(loader);
  const first = library.create('boat');
  const second = library.create('boat');

  expect(loader.load).toHaveBeenCalledTimes(MENU_MODEL_IDS.length);
  expect(first.root).not.toBe(second.root);
  first.dispose();
  second.dispose();
  library.dispose();
});

it('rejects a shark without Armature|Swim', async () => {
  const loader: MenuModelLoader = {
    load: async (url) => {
      const value = root(url);
      value.animations = [];
      return value;
    },
  };
  await expect(MenuModelLibrary.load(loader)).rejects.toEqual(
    expect.objectContaining<MenuModelLoadError>({ menuModelId: 'shark' }),
  );
});
~~~

- [ ] **Step 2: Run the test and verify failure**

Run: bunx vitest run tests/MenuModelLibrary.test.ts

Expected: FAIL because the menu manifest and library do not exist.

- [ ] **Step 3: Add the manifest**

Define these IDs:

~~~ts
export const MENU_MODEL_IDS = [
  'boat', 'rockA', 'rockB', 'rockC',
  'fishBone', 'skull', 'largeBone', 'shark',
  'sardine', 'clownfish', 'seaweed',
] as const;

export type MenuModelId = typeof MENU_MODEL_IDS[number];

export interface MenuModelSpec {
  readonly url: string;
  readonly targetLongestDimension: number;
  readonly rotation: readonly [number, number, number];
  readonly maxTriangles: number;
  readonly generatedMetadata: {
    readonly triangles: number;
    readonly rawBounds: {
      readonly min: readonly [number, number, number];
      readonly max: readonly [number, number, number];
    };
    readonly animations: readonly {
      readonly name: string;
      readonly duration: number;
      readonly channels: number;
    }[];
  };
}
~~~

Use these presentation values:

~~~ts
const PRESENTATION = {
  boat: { targetLongestDimension: 5.4, rotation: [0, 0, 0], maxTriangles: 500 },
  rockA: { targetLongestDimension: 3.4, rotation: [0, 0, 0], maxTriangles: 500 },
  rockB: { targetLongestDimension: 2.6, rotation: [0, 0, 0], maxTriangles: 300 },
  rockC: { targetLongestDimension: 4.2, rotation: [0, 0, 0], maxTriangles: 500 },
  fishBone: { targetLongestDimension: 0.75, rotation: [0, 0, 0], maxTriangles: 700 },
  skull: { targetLongestDimension: 0.52, rotation: [0, 0, 0], maxTriangles: 3500 },
  largeBone: { targetLongestDimension: 0.9, rotation: [0, 0, 0], maxTriangles: 1800 },
  shark: { targetLongestDimension: 4.8, rotation: [0, 0, 0], maxTriangles: 700 },
  sardine: { targetLongestDimension: 0.68, rotation: [0, Math.PI / 2, 0], maxTriangles: 2000 },
  clownfish: { targetLongestDimension: 0.58, rotation: [0, 0, 0], maxTriangles: 2000 },
  seaweed: { targetLongestDimension: 0.62, rotation: [0, 0, 0], maxTriangles: 2000 },
} as const;
~~~

Read the first eight metadata entries from the menu JSON.

Read sardine, clownfish, and seaweed entries from the fishing JSON.

- [ ] **Step 4: Add required loading and validation**

~~~ts
export interface MenuModelLoader {
  load(url: string): Promise<Group>;
}

export interface MenuModelInstance {
  readonly root: Group;
  readonly animations: readonly AnimationClip[];
  dispose(): void;
}

export class MenuModelLoadError extends Error {
  constructor(
    readonly menuModelId: MenuModelId,
    message: string,
    options?: ErrorOptions,
  ) {
    super('Menu model ' + menuModelId + ': ' + message, options);
    this.name = 'MenuModelLoadError';
  }
}
~~~

Load all models with Promise.allSettled.

Normalize every template through normalizeLongestDimensionTemplate().

Require the exact shark animation name Armature|Swim.

Dispose all loaded sibling roots when one load fails.

- [ ] **Step 5: Add clone and disposal ownership**

Use SkeletonUtils.clone() for every instance.

Share immutable geometry, material, and texture resources across instances.

Do not mutate instance materials.

MenuModelInstance.dispose() removes its root and prevents repeat work.

MenuModelLibrary.dispose() disposes template geometries, materials, textures, and skeletons once.

Throw if create() runs after library disposal.

- [ ] **Step 6: Run focused tests**

Run: bunx vitest run tests/MenuModelLibrary.test.ts

Expected: PASS for loading, independent roots, required clip, sibling cleanup, repeated disposal, and use-after-dispose.

- [ ] **Step 7: Run type check**

Run: bun run typecheck

Expected: PASS.

- [ ] **Step 8: Commit**

~~~bash
git add src/menu/menuModelManifest.ts src/menu/MenuModelLibrary.ts tests/MenuModelLibrary.test.ts
git commit -m "feat: add underwater menu model library"
~~~

### Task 3: Define allocation-free menu choreography

**Files:**

- Create: src/menu/menuChoreography.ts
- Create: tests/menuChoreography.test.ts

**Interfaces:**

- Produces: MENU_FADE_SECONDS = 0.7.
- Produces: MenuMotionSample and createMenuMotionSample().
- Produces: sampleMenuMotionInto(sample, elapsedSeconds).
- Produces: sampleMenuFade(elapsedSeconds).

- [ ] **Step 1: Write failing deterministic motion tests**

~~~ts
import { expect, it } from 'vitest';
import {
  MENU_FADE_SECONDS,
  createMenuMotionSample,
  sampleMenuFade,
  sampleMenuMotionInto,
} from '../src/menu/menuChoreography';

it('loops every actor without replacing output arrays', () => {
  const sample = createMenuMotionSample();
  const firstShark = sample.sharks[0].position;
  const firstFish = sample.fishSchools[0].position;

  sampleMenuMotionInto(sample, 0);
  const start = [...sample.sharks[0].position];
  sampleMenuMotionInto(sample, 24);

  expect(sample.sharks[0].position).toBe(firstShark);
  expect(sample.fishSchools[0].position).toBe(firstFish);
  expect(sample.sharks[0].position).toEqual(start);
});

it('clamps the 0.7 second fade', () => {
  expect(MENU_FADE_SECONDS).toBe(0.7);
  expect(sampleMenuFade(-1)).toBe(0);
  expect(sampleMenuFade(0.35)).toBeCloseTo(0.5);
  expect(sampleMenuFade(0.7)).toBe(1);
  expect(sampleMenuFade(2)).toBe(1);
});
~~~

- [ ] **Step 2: Run the test and verify failure**

Run: bunx vitest run tests/menuChoreography.test.ts

Expected: FAIL because src/menu/menuChoreography.ts does not exist.

- [ ] **Step 3: Add reusable output types**

~~~ts
export interface MenuPathPose {
  readonly position: [number, number, number];
  readonly tangent: [number, number, number];
}

export interface MenuMotionSample {
  readonly sharks: readonly [MenuPathPose, MenuPathPose];
  readonly fishSchools: readonly [MenuPathPose, MenuPathPose];
  plantTime: number;
  bubbleTime: number;
  matterTime: number;
  causticStrength: number;
}
~~~

createMenuMotionSample() allocates all tuples once.

sampleMenuMotionInto() only changes existing numeric slots.

- [ ] **Step 4: Add exact closed paths**

Use these paths in scene coordinates:

~~~ts
const SHARK_PATHS = [
  { center: [0, 3.4, -10] as const, radiusX: 9.5, radiusZ: 4.2, period: 24, phase: 0 },
  { center: [1.5, 4.6, -14] as const, radiusX: 12, radiusZ: 5.5, period: 31, phase: Math.PI },
] as const;

const FISH_PATHS = [
  { center: [-2.5, 2.3, -5.5] as const, radiusX: 3.4, radiusZ: 1.8, period: 18, phase: 0.8 },
  { center: [3.2, 1.7, -7.5] as const, radiusX: 4.6, radiusZ: 2.2, period: 22, phase: 3.4 },
] as const;
~~~

Calculate tangent components from the same ellipse angle.

Use smoothstep for fade and a slow sine for caustic strength between 0.72 and 1.

- [ ] **Step 5: Run focused tests**

Run: bunx vitest run tests/menuChoreography.test.ts

Expected: PASS, including loop boundaries and reference identity checks.

- [ ] **Step 6: Commit**

~~~bash
git add src/menu/menuChoreography.ts tests/menuChoreography.test.ts
git commit -m "feat: define underwater menu choreography"
~~~

### Task 4: Create the accessible menu UI

**Files:**

- Create: src/menu/MenuUI.ts
- Create: tests/MenuUI.test.ts
- Modify: src/styles/main.css

**Interfaces:**

- Produces: MenuUI.onStart callback.
- Produces: setTransitioning(), setFadeProgress(), showPointerLockError(), clearPointerLockError(), and dispose().
- Keeps the existing guide copy and keyboard focus contract.

- [ ] **Step 1: Write failing UI tests**

~~~ts
// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { MenuUI } from '../src/menu/MenuUI';

afterEach(() => { document.body.innerHTML = ''; });

it('exposes the approved title actions', () => {
  const mount = document.createElement('main');
  document.body.append(mount);
  const ui = new MenuUI(mount);

  expect(mount.querySelector('h1')?.textContent).toBe("DON'T SLEEP WITH THE FISHES");
  expect(mount.querySelector('[data-menu-start]')?.textContent).toContain('START');
  expect(mount.querySelector('[data-menu-guide-open]')?.textContent).toContain('HOW TO PLAY');
  ui.dispose();
});

it('locks focus inside the guide and restores its opener', () => {
  const mount = document.createElement('main');
  document.body.append(mount);
  const ui = new MenuUI(mount);
  const open = mount.querySelector<HTMLButtonElement>('[data-menu-guide-open]')!;
  const close = mount.querySelector<HTMLButtonElement>('[data-menu-guide-close]')!;

  open.click();
  expect(document.activeElement).toBe(close);
  close.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  expect(document.activeElement).toBe(open);
  ui.dispose();
});

it('fires start once while transitioning', () => {
  const mount = document.createElement('main');
  const ui = new MenuUI(mount);
  ui.onStart = vi.fn();
  const start = mount.querySelector<HTMLButtonElement>('[data-menu-start]')!;
  start.click();
  ui.setTransitioning(true);
  start.click();
  expect(ui.onStart).toHaveBeenCalledOnce();
  ui.dispose();
});
~~~

- [ ] **Step 2: Run the test and verify failure**

Run: bunx vitest run tests/MenuUI.test.ts

Expected: FAIL because src/menu/MenuUI.ts does not exist.

- [ ] **Step 3: Move title markup into MenuUI**

Use a menu-ui root with these data hooks:

~~~html
<div class="menu-ui">
  <div class="ui-treatment" aria-hidden="true"></div>
  <section class="screen is-visible underwater-menu-screen" data-menu>
    <button type="button" data-menu-guide-open aria-haspopup="dialog"
      aria-controls="menu-how-to-play-dialog">HOW TO PLAY</button>
    <div class="underwater-menu-screen__content">
      <h1 class="ui-role-display">DON'T SLEEP WITH THE FISHES</h1>
      <button type="button" class="primary-action salvage-action ui-role-context"
        data-menu-start>START</button>
      <p class="input-error illustrated-warning ui-role-narrative"
        data-menu-pointer-lock-error aria-live="polite"></p>
    </div>
  </section>
  <section class="screen how-to-play-screen poster-screen"
    id="menu-how-to-play-dialog" data-menu-guide role="dialog"
    aria-modal="true" aria-hidden="true" inert></section>
  <div class="underwater-menu-fade" data-menu-fade aria-hidden="true"></div>
</div>
~~~

Copy the current guide title, route, controls, and note without changing its text.

- [ ] **Step 4: Add explicit state methods**

~~~ts
setTransitioning(active: boolean): void {
  this.transitioning = active;
  this.startButton.disabled = active;
  this.guideButton.disabled = active;
  this.root.classList.toggle('is-transitioning', active);
}

setFadeProgress(progress: number): void {
  this.root.style.setProperty(
    '--menu-fade',
    String(Math.min(1, Math.max(0, progress))),
  );
}
~~~

showPointerLockError() sets the existing guidance text.

clearPointerLockError() clears it before each attempt.

- [ ] **Step 5: Add menu-specific styles**

Keep the title at the top, START at the bottom, and guide control at the upper-right.

Use this fade rule:

~~~css
.underwater-menu-fade {
  position: absolute;
  inset: 0;
  z-index: 30;
  background: #000;
  opacity: var(--menu-fade, 0);
  pointer-events: none;
}
~~~

Do not add media-query motion changes.

- [ ] **Step 6: Run focused tests**

Run: bunx vitest run tests/MenuUI.test.ts

Expected: PASS for actions, focus trap, Escape, error copy, fade clamping, repeat blocking, and disposal.

- [ ] **Step 7: Commit**

~~~bash
git add src/menu/MenuUI.ts tests/MenuUI.test.ts src/styles/main.css
git commit -m "feat: add underwater main menu UI"
~~~

### Task 5: Build and animate the underwater world

**Files:**

- Create: src/menu/SkeletonAssembly.ts
- Create: src/menu/UnderwaterPlantField.ts
- Create: src/menu/UnderwaterParticles.ts
- Create: src/menu/UnderwaterMenuWorld.ts
- Create: src/menu/UnderwaterMenuAnimator.ts
- Create: tests/UnderwaterMenuWorld.test.ts
- Create: tests/UnderwaterMenuAnimator.test.ts

**Interfaces:**

- Consumes: MenuModelLibrary.create() and MenuMotionSample.
- Produces: UnderwaterMenuWorld.root and actors.
- Produces: UnderwaterMenuWorld.dispose().
- Produces: UnderwaterMenuAnimator.update(elapsedSeconds, deltaSeconds) and dispose().

- [ ] **Step 1: Write failing world composition tests**

~~~ts
import {
  AnimationClip,
  Group,
  NumberKeyframeTrack,
  PerspectiveCamera,
  Scene,
} from 'three';
import { expect, it, vi } from 'vitest';
import { UnderwaterMenuWorld } from '../src/menu/UnderwaterMenuWorld';

it('creates the approved fixed composition once', () => {
  const created: string[] = [];
  const models = {
    create: vi.fn((id: string) => {
      created.push(id);
      const animations = id === 'shark'
        ? [new AnimationClip('Armature|Swim', 1.25, [
          new NumberKeyframeTrack('.rotation[y]', [0, 1.25], [0, 0.1]),
        ])]
        : [];
      return { root: new Group(), animations, dispose: vi.fn() };
    }),
  };
  const scene = new Scene();
  const camera = new PerspectiveCamera();
  const world = new UnderwaterMenuWorld(scene, camera, models as never);

  expect(created).toEqual(expect.arrayContaining([
    'boat', 'rockA', 'rockB', 'rockC',
    'fishBone', 'skull', 'largeBone',
    'shark', 'sardine', 'clownfish', 'seaweed',
  ]));
  expect(created.filter((id) => id === 'shark')).toHaveLength(2);
  expect(camera.userData.menuCameraFixed).toBe(true);
  expect(world.root.getObjectByName('menu:boat')).toBeDefined();
  expect(world.root.getObjectByName('menu:seated-skeleton')).toBeDefined();
  world.dispose();
});
~~~

- [ ] **Step 2: Write failing animator tests**

~~~ts
import { AnimationClip, Group, NumberKeyframeTrack } from 'three';
import { expect, it } from 'vitest';
import { UnderwaterMenuAnimator } from '../src/menu/UnderwaterMenuAnimator';

it('updates actor transforms without replacing actor objects', () => {
  const sharks = [new Group(), new Group()] as const;
  const fishSchools = [new Group(), new Group()] as const;
  const clip = new AnimationClip('Armature|Swim', 1.25, [
    new NumberKeyframeTrack('.rotation[y]', [0, 1.25], [0, 0.1]),
  ]);
  const animator = new UnderwaterMenuAnimator({
    sharks: sharks.map((root) => ({ root, clip })) as never,
    fishSchools,
    setPlantTime: () => undefined,
    setBubbleTime: () => undefined,
    setMatterTime: () => undefined,
    setCausticStrength: () => undefined,
  });

  animator.update(1, 0.016);
  expect(sharks[0].position.length()).toBeGreaterThan(0);
  expect(fishSchools[0].position.length()).toBeGreaterThan(0);
  animator.dispose();
});
~~~

- [ ] **Step 3: Run both tests and verify failure**

Run: bunx vitest run tests/UnderwaterMenuWorld.test.ts tests/UnderwaterMenuAnimator.test.ts

Expected: FAIL because the world and animator files do not exist.

- [ ] **Step 4: Add the seated skeleton assembly**

createSeatedSkeleton(skull) returns one Group named menu:seated-skeleton.

Use one shared CylinderGeometry for long bones.

Use one shared SphereGeometry for joints and rib ends.

Use one bone-colored MeshStandardMaterial.

Place the skull and bone segments with these authored anchors:

~~~ts
const BONE_SEGMENTS = [
  { name: 'spine', position: [0, 0.78, 0], scale: [0.08, 0.55, 0.08], rotation: [0, 0, -0.08] },
  { name: 'upper-arm-left', position: [-0.32, 0.76, 0], scale: [0.06, 0.32, 0.06], rotation: [0, 0, -0.72] },
  { name: 'upper-arm-right', position: [0.31, 0.73, 0.02], scale: [0.06, 0.3, 0.06], rotation: [0, 0, 0.88] },
  { name: 'forearm-left', position: [-0.48, 0.48, 0.14], scale: [0.05, 0.3, 0.05], rotation: [0.35, 0, -0.2] },
  { name: 'forearm-right', position: [0.44, 0.45, 0.12], scale: [0.05, 0.28, 0.05], rotation: [0.28, 0, 0.16] },
  { name: 'thigh-left', position: [-0.2, 0.18, 0.18], scale: [0.07, 0.38, 0.07], rotation: [1.1, 0, -0.12] },
  { name: 'thigh-right', position: [0.2, 0.16, 0.16], scale: [0.07, 0.38, 0.07], rotation: [1.05, 0, 0.15] },
  { name: 'shin-left', position: [-0.22, -0.05, 0.44], scale: [0.06, 0.36, 0.06], rotation: [0.35, 0, -0.05] },
  { name: 'shin-right', position: [0.24, -0.07, 0.42], scale: [0.06, 0.36, 0.06], rotation: [0.3, 0, 0.08] },
] as const;
~~~

Add six curved rib pairs from short cylinders.

Rotate the skull slightly down and left for the dark-comic pose.

- [ ] **Step 5: Add the procedural seabed and authored props**

Use one PlaneGeometry with 24 by 18 segments.

Rotate it flat and displace its vertices once during construction.

Use flat-shaded sand, wood, rope, and bone materials.

Place the main models at these anchors:

~~~ts
const MENU_PLACEMENT = {
  boat: { position: [0, 0.42, -4.8], rotation: [0.05, -0.12, -0.09] },
  skeleton: { position: [0.08, 0.82, -4.45], rotation: [0, Math.PI, 0] },
  rockA: { position: [-5.4, -0.1, -5.8], rotation: [0, 0.4, 0] },
  rockB: { position: [4.8, -0.15, -3.2], rotation: [0, -0.7, 0] },
  rockC: { position: [6.4, -0.2, -9.5], rotation: [0, 0.2, 0] },
  fishBone: { position: [-1.8, 0.14, -3.5], rotation: [0.1, 0.8, -0.2] },
  largeBone: { position: [1.65, 0.18, -4.0], rotation: [0.05, -0.4, 0.22] },
} as const;
~~~

Add three broken planks and one curved rope group near the boat.

- [ ] **Step 6: Add fixed particle pools**

Create 72 bubbles and 96 suspended particles.

Store base position and phase attributes once.

Use ShaderMaterial uniforms named uTime, uColor, and uFogColor.

setTime() changes only uTime.value.

Dispose both geometries and both materials exactly once.

- [ ] **Step 7: Add plant field and existing seaweed**

Create 24 procedural kelp blades in one InstancedMesh.

Use one shared shader with uTime and per-instance phase.

Place three static clones of the existing seaweed model near the rocks.

Do not mutate model-library materials.

- [ ] **Step 8: Add fish schools and sharks**

Each fish school owns one Group and six model clones.

Alternate sardine and clownfish models.

Offset fish within their parent group once during construction.

Create two shark instances and require each Armature|Swim clip.

- [ ] **Step 9: Add lighting, fog, and fixed camera**

~~~ts
export const MENU_CAMERA_POSITION = [0, 1.35, 7.8] as const;
export const MENU_CAMERA_TARGET = [0, 1.15, -4.8] as const;

scene.background = new Color(0x071b24);
scene.fog = new FogExp2(0x0b3440, 0.055);
camera.position.set(...MENU_CAMERA_POSITION);
camera.lookAt(new Vector3(...MENU_CAMERA_TARGET));
camera.userData.menuCameraFixed = true;
~~~

Add one HemisphereLight and one cool DirectionalLight.

Add three transparent cone meshes for light shafts.

Add one transparent caustic overlay above the seabed.

Its shader owns uTime and uStrength uniforms.

Keep the top-center background free of bright actors.

- [ ] **Step 10: Add animation ownership**

UnderwaterMenuAnimator creates two AnimationMixer objects once.

Start Armature|Swim on both sharks.

Set the second action time to half the clip duration.

Each update samples menuChoreography into one retained MenuMotionSample.

Copy sampled positions and set yaw from atan2(tangent.x, tangent.z).

Update shader times and caustic strength through callbacks.

Stop actions and uncache roots during disposal.

- [ ] **Step 11: Run focused tests**

Run: bunx vitest run tests/UnderwaterMenuWorld.test.ts tests/UnderwaterMenuAnimator.test.ts tests/menuChoreography.test.ts

Expected: PASS for composition, counts, paths, animation clip ownership, fixed camera, and repeated disposal.

- [ ] **Step 12: Run type check**

Run: bun run typecheck

Expected: PASS.

- [ ] **Step 13: Commit**

~~~bash
git add src/menu/SkeletonAssembly.ts src/menu/UnderwaterPlantField.ts src/menu/UnderwaterParticles.ts src/menu/UnderwaterMenuWorld.ts src/menu/UnderwaterMenuAnimator.ts tests/UnderwaterMenuWorld.test.ts tests/UnderwaterMenuAnimator.test.ts
git commit -m "feat: build animated underwater menu world"
~~~

### Task 6: Add the standalone main menu phase

**Files:**

- Create: src/phases/MainMenuPhase.ts
- Create: tests/MainMenuPhase.test.ts
- Modify: src/rendering/SceneRenderer.ts

**Interfaces:**

- Consumes: PhaseContext, MenuModelLibrary, MenuUI, UnderwaterMenuWorld, and UnderwaterMenuAnimator.
- Produces: MainMenuPhase(context, onComplete).
- Calls onComplete() once after a successful 0.7-second fade.
- Produces MenuVisualState with kind menu and elapsedSeconds.

- [ ] **Step 1: Write failing phase tests**

~~~ts
// @vitest-environment jsdom
import { PerspectiveCamera } from 'three';
import { expect, it, vi } from 'vitest';
import { MainMenuPhase } from '../src/phases/MainMenuPhase';

it('keeps rendering until pointer lock succeeds and fade completes', async () => {
  const onComplete = vi.fn();
  const requestPointerLock = vi.fn().mockResolvedValue(undefined);
  const canvas = document.createElement('canvas');
  const ui = {
    onStart: () => undefined,
    setTransitioning: vi.fn(),
    setFadeProgress: vi.fn(),
    clearPointerLockError: vi.fn(),
    showPointerLockError: vi.fn(),
    dispose: vi.fn(),
  };
  const dependencies = {
    createUI: () => ui,
    createWorld: () => ({ actors: {}, dispose: vi.fn() }),
    createAnimator: () => ({ update: vi.fn(), dispose: vi.fn() }),
    requestPointerLock,
  };
  const context = {
    mount: document.createElement('main'),
    renderer: { domElement: canvas },
    camera: new PerspectiveCamera(),
    sceneRenderer: { render: vi.fn(), resize: vi.fn(), dispose: vi.fn() },
    menuModels: {} as never,
  } as never;
  const phase = new MainMenuPhase(context, onComplete, dependencies as never);

  phase.start();
  ui.onStart();
  await Promise.resolve();
  phase.update(0, 0.69);
  expect(onComplete).not.toHaveBeenCalled();
  phase.update(0, 0.01);
  expect(onComplete).toHaveBeenCalledOnce();
  phase.dispose();
});
~~~

Add tests for pointer-lock rejection, repeat input, render state, resize, and repeated disposal.

- [ ] **Step 2: Run the test and verify failure**

Run: bunx vitest run tests/MainMenuPhase.test.ts

Expected: FAIL because src/phases/MainMenuPhase.ts does not exist.

- [ ] **Step 3: Add the menu visual state**

~~~ts
export interface MenuVisualState {
  kind: 'menu';
  elapsedSeconds: number;
}

export type SceneVisualState =
  | MenuVisualState
  | ScavengeVisualState
  | SurvivalVisualState;
~~~

No post-processing branch needs special behavior.

- [ ] **Step 4: Add phase construction and lifecycle**

~~~ts
export class MainMenuPhase implements GamePhase {
  private readonly scene = new Scene();
  private readonly ui: MenuUI;
  private readonly world: UnderwaterMenuWorld;
  private readonly animator: UnderwaterMenuAnimator;
  private elapsed = 0;
  private fadeElapsed = 0;
  private transitioning = false;
  private completed = false;
  private started = false;
  private disposed = false;

  constructor(
    private readonly context: PhaseContext & { menuModels: MenuModelLibrary },
    private readonly onComplete: () => void,
    private readonly dependencies: MainMenuPhaseDependencies =
      PRODUCTION_MAIN_MENU_DEPENDENCIES,
  ) {}
}
~~~

Add the shared camera to the menu scene.

Construct UI, world, and animator once with context.menuModels.

Wire MenuUI.onStart to requestStart().

Use this dependency boundary:

~~~ts
export interface MainMenuPhaseDependencies {
  createUI(mount: HTMLElement): MenuUI;
  createWorld(
    scene: Scene,
    camera: PerspectiveCamera,
    models: MenuModelLibrary,
  ): UnderwaterMenuWorld;
  createAnimator(
    actors: UnderwaterMenuWorld['actors'],
  ): UnderwaterMenuAnimator;
  requestPointerLock(canvas: HTMLCanvasElement): Promise<void>;
}
~~~

The production requestPointerLock dependency calls canvas.requestPointerLock().

- [ ] **Step 5: Add pointer-lock and fade flow**

requestStart() returns if disposed or transitioning.

Clear the UI error before calling renderer.domElement.requestPointerLock().

On success, set transitioning and reset fadeElapsed.

On failure, keep the menu active and call showPointerLockError().

During update(), always animate the world.

During transition, advance fadeElapsed, update fade progress, and complete at 0.7 seconds.

Call onComplete() only once.

- [ ] **Step 6: Add resize, render, and disposal**

resize() sets camera.aspect and updates its projection matrix.

render() calls sceneRenderer.render(scene, camera, visualState).

dispose() clears UI callbacks, removes the camera, disposes animator, world, and UI, then clears the scene.

Do not exit pointer lock during menu disposal.

- [ ] **Step 7: Run focused tests**

Run: bunx vitest run tests/MainMenuPhase.test.ts tests/MenuUI.test.ts tests/UnderwaterMenuAnimator.test.ts

Expected: PASS.

- [ ] **Step 8: Commit**

~~~bash
git add src/phases/MainMenuPhase.ts tests/MainMenuPhase.test.ts src/rendering/SceneRenderer.ts
git commit -m "feat: add main menu phase"
~~~

### Task 7: Preload and own menu assets

**Files:**

- Modify: src/app/GamePhase.ts
- Modify: src/app/launchGame.ts
- Modify: src/Game.ts
- Modify: tests/launchGame.test.ts
- Modify: tests/GameConstruction.test.ts

**Interfaces:**

- Consumes: MenuModelLibrary.load() and MenuModelLoadError.
- Adds menuModels: MenuModelLibrary to PhaseContext.
- Adds loadMenuModels(): Promise<MenuModelLibrary> to LaunchDependencies.
- Adds MenuModelLibrary to Game construction and disposal.

- [ ] **Step 1: Add failing launcher tests**

~~~ts
it('preloads required menu models before constructing the game', async () => {
  const menuModels = { dispose: vi.fn() } as never;
  const loadMenuModels = vi.fn().mockResolvedValue(menuModels);
  const createGame = vi.fn(() => ({ start: vi.fn(), dispose: vi.fn() }));
  const handle = launchGame(mount, dependencies(
    () => Promise.resolve(propModels),
    { loadMenuModels, createGame },
  ));

  await handle.completion;
  expect(loadMenuModels).toHaveBeenCalledOnce();
  expect(createGame.mock.calls[0]?.at(-1)).toBe(menuModels);
});
~~~

Add a test that MenuModelLoadError renders MENU MODEL UNAVAILABLE and names the model ID.

Add a cancellation test that disposes fulfilled menu models once.

- [ ] **Step 2: Run focused tests and verify failure**

Run: bunx vitest run tests/launchGame.test.ts tests/GameConstruction.test.ts

Expected: FAIL because LaunchDependencies and Game do not accept menu models.

- [ ] **Step 3: Extend launch dependencies and loaded assets**

~~~ts
export interface LaunchDependencies {
  loadMenuModels(): Promise<MenuModelLibrary>;
}

interface LoadedGameAssets {
  menuModels: MenuModelLibrary;
}
~~~

Keep every current dependency field beside the new field.

PRODUCTION_DEPENDENCIES.loadMenuModels returns MenuModelLibrary.load().

Add the promise to the existing Promise.allSettled call.

Include menu models in failure cleanup and transferred Game ownership.

- [ ] **Step 4: Add a precise launch failure**

~~~ts
if (error instanceof MenuModelLoadError) {
  renderSystemScreen(mount, {
    kind: 'error',
    kicker: 'MENU MODEL UNAVAILABLE',
    title: 'Unable to prepare ' + error.menuModelId,
    lead: 'A required underwater menu model could not be loaded.',
    detail: error.message,
  });
  return;
}
~~~

- [ ] **Step 5: Extend Game and PhaseContext ownership**

Add menuModels to Game constructor, Game.forTest options, initialize(), and this.context.

Store the production-owned library in a private field.

Dispose the active phase before disposing menuModels.

Add menuModels to rollback cleanup only after initialization owns it.

- [ ] **Step 6: Update test builders**

Give every test LaunchDependencies builder a loadMenuModels default.

Give every Game.forTest call a shared empty MenuModelLibrary test double.

Assert PhaseContext receives the exact library.

- [ ] **Step 7: Run focused tests**

Run: bunx vitest run tests/launchGame.test.ts tests/GameConstruction.test.ts

Expected: PASS for preload order, ownership transfer, failure cleanup, cancellation, and disposal.

- [ ] **Step 8: Commit**

~~~bash
git add src/app/GamePhase.ts src/app/launchGame.ts src/Game.ts tests/launchGame.test.ts tests/GameConstruction.test.ts
git commit -m "feat: preload underwater menu assets"
~~~

### Task 8: Make the menu the initial phase and remove the old title path

**Files:**

- Modify: src/Game.ts
- Modify: src/phases/ScavengePhase.ts
- Modify: src/ui/GameUI.ts
- Modify: src/styles/main.css
- Modify: tests/GameLifecycle.test.ts
- Modify: tests/GameUI.test.ts
- Modify: tests/GameUIIntro.test.ts

**Interfaces:**

- Adds createMenu(context, onComplete) to GameFactories.
- Adds activateMenu() and startScavengeFromMenu() to Game.
- Changes ScavengePhase third callback from onRestart to onReturnToMenu.
- ScavengePhase.start() accepts existing pointer lock or requests it immediately.

- [ ] **Step 1: Add failing game lifecycle tests**

~~~ts
it('starts in the menu and preserves pointer lock into scavenging', () => {
  const menu = gamePhase();
  const scavenge = gamePhase();
  let completeMenu = () => undefined;
  const factories: GameFactories = {
    createMenu: vi.fn((_context, _models, onComplete) => {
      completeMenu = onComplete;
      return menu;
    }),
    createScavenge: vi.fn(() => scavenge),
    createSurvival: vi.fn(() => gamePhase()),
  };
  const game = Game.forTest(factories, options);

  game.start();
  expect(menu.start).toHaveBeenCalledOnce();
  expect(scavenge.start).not.toHaveBeenCalled();

  completeMenu();
  expect(menu.dispose).toHaveBeenCalledOnce();
  expect(document.exitPointerLock).not.toHaveBeenCalled();
  expect(scavenge.start).toHaveBeenCalledOnce();
});
~~~

Add a test that the scavenging ending callback creates a new menu phase.

Keep a test that survival START FROM THE SHIP creates scavenging directly.

- [ ] **Step 2: Add failing GameUI removal tests**

~~~ts
it('contains no title or guide ownership', () => {
  const mount = document.createElement('main');
  const ui = new GameUI(mount);
  expect(mount.querySelector('[data-start]')).toBeNull();
  expect(mount.querySelector('[data-how-to-play]')).toBeNull();
  expect(mount.querySelector('[data-hud]')).not.toBeNull();
  ui.dispose();
});
~~~

- [ ] **Step 3: Run lifecycle and UI tests and verify failure**

Run: bunx vitest run tests/GameLifecycle.test.ts tests/GameUI.test.ts tests/GameUIIntro.test.ts

Expected: FAIL because Game still creates ScavengePhase first and GameUI still owns the title.

- [ ] **Step 4: Add the menu factory and initial activation**

~~~ts
export interface GameFactories {
  createMenu(
    context: PhaseContext,
    onComplete: () => void,
  ): GamePhase;
  createScavenge(
    context: PhaseContext,
    onComplete: (result: Readonly<ScavengeResult>) => void,
    onReturnToMenu: () => void,
  ): GamePhase;
  createSurvival(
    context: PhaseContext,
    result: Readonly<ScavengeResult>,
    seed: number,
    onRestart: () => void,
    initialEventId?: string,
  ): GamePhase;
}
~~~

PRODUCTION_FACTORIES.createMenu returns new MainMenuPhase().

initialize() calls activateMenu(false) instead of activateScavenge(false).

Game.start() starts the active menu.

- [ ] **Step 5: Add menu transition without releasing pointer lock**

~~~ts
private startScavengeFromMenu(generation: number): void {
  if (!this.ownsGeneration(generation)) return;
  const menu = this.detachActivePhase();
  menu?.dispose();
  this.resetCamera();
  this.elapsed = 0;
  this.seed = this.createSeed();
  this.activateScavenge(true);
}
~~~

activateMenu() creates a fresh menu phase with its own generation.

Do not call exitPointerLock() in startScavengeFromMenu().

- [ ] **Step 6: Route the scavenging ending back to menu**

Pass a dedicated onReturnToMenu callback into ScavengePhase.

The callback detaches scavenging, exits pointer lock, resets the camera, and calls activateMenu(true).

Keep survival restartCurrentPhase() routed to activateScavenge(true).

- [ ] **Step 7: Remove the title from GameUI**

Remove startLayer, startButton, guide layer, guide controls, title callbacks, title markup, and guide handlers.

Change ScavengePresentation to:

~~~ts
export type ScavengePresentation = 'intro' | 'playing';
~~~

Keep intro skip, HUD, pause, ending, pointer-lock error, and return-to-menu callback.

- [ ] **Step 8: Start ScavengePhase directly in the intro**

Remove TITLE_CAMERA_POSITION, TITLE_CAMERA_TARGET, titleCameraTarget, and applyTitleCamera().

Add introBegun = false.

In start(), register listeners and then:

~~~ts
if (this.input.pointerLocked) {
  this.beginIntro();
} else {
  void this.requestPointerLock();
}
~~~

beginIntro() returns if introBegun is already true.

If pointer lock fails, pause the intro surface and show the existing error.

handlePointerLockChange(true) begins the intro when introBegun is false.

- [ ] **Step 9: Remove obsolete title styles**

Delete .start-screen selectors and the title-specific height media query.

Keep shared poster, guide, controls, action, and focus styles used by MenuUI.

Move needed title layout selectors under .underwater-menu-screen.

- [ ] **Step 10: Update all affected lifecycle tests**

Remove assertions for TITLE_CAMERA_POSITION and TITLE_CAMERA_TARGET.

Replace title presentation assertions with menu phase assertions.

Keep intro pause, skip, pointer-lock, gameplay, and disposal coverage.

- [ ] **Step 11: Run focused integration tests**

Run: bunx vitest run tests/GameLifecycle.test.ts tests/GameUI.test.ts tests/GameUIIntro.test.ts tests/MainMenuPhase.test.ts

Expected: PASS for menu start, pointer-lock preservation, intro start, return-to-menu, direct survival restart, UI focus, and disposal.

- [ ] **Step 12: Run launcher tests**

Run: bunx vitest run tests/launchGame.test.ts

Expected: PASS.

- [ ] **Step 13: Commit**

~~~bash
git add src/Game.ts src/phases/ScavengePhase.ts src/ui/GameUI.ts src/styles/main.css tests/GameLifecycle.test.ts tests/GameUI.test.ts tests/GameUIIntro.test.ts
git commit -m "feat: replace ship title with underwater menu"
~~~

### Task 9: Verify presentation, document the flow, and finish

**Files:**

- Modify: README.md
- Modify tests only when visual inspection exposes a reproducible defect.

**Interfaces:**

- Consumes the complete menu implementation.
- Produces verified desktop composition and updated project documentation.

- [ ] **Step 1: Run the complete automated checks**

Run: bun run models:check

Expected: every asset group passes, including menu total 7,558 / 8,000 and Armature|Swim.

Run: bun run test

Expected: all tests pass.

Run: bun run typecheck

Expected: PASS.

Run: bun run build

Expected: PASS and dist is produced.

- [ ] **Step 2: Start the development server**

Run: bun run dev

Open the printed local URL.

- [ ] **Step 3: Inspect 16:9 composition**

Use a 1440 by 810 viewport.

Confirm the fixed camera frames the boat and seated skeleton.

Confirm title text has quiet water behind it.

Confirm START stays clear at the bottom.

Confirm both sharks cross only background and side layers.

- [ ] **Step 4: Inspect wide composition**

Use a 1920 by 800 viewport.

Confirm all three rock models remain visible.

Confirm no scene boundary appears through fog.

Confirm the boat remains the focal subject.

- [ ] **Step 5: Inspect small desktop composition**

Use a 1024 by 700 viewport.

Confirm title, START, and HOW TO PLAY remain readable and clickable.

Confirm the skeleton remains readable inside the boat.

Confirm the guide fits without clipping.

- [ ] **Step 6: Verify interaction and lifecycle**

Open and close HOW TO PLAY with mouse and keyboard.

Trigger a pointer-lock denial and confirm the menu remains usable.

Select START and confirm the 0.7-second black fade.

Confirm the existing scavenging intro starts without another click.

Reach the scavenging ending test path and confirm BACK TO MAIN MENU creates a fresh animated menu.

- [ ] **Step 7: Check frame update behavior**

Use the browser performance panel for a ten-second menu capture.

Confirm the camera transform remains unchanged.

Confirm the update loop creates no recurring actor, geometry, material, or particle objects.

Confirm leaving the menu stops mixers and removes menu scene roots.

- [ ] **Step 8: Update README**

Change the Run section to state that the underwater menu appears after loading.

State that START fades into the existing scavenging intro.

Add src/menu and MainMenuPhase to the Architecture section.

Add the menu asset fetch and audit commands to Commands.

- [ ] **Step 9: Run final verification again**

Run: bun run models:check

Run: bun run test

Run: bun run typecheck

Run: bun run build

Expected: all four commands pass after documentation and any verified corrections.

- [ ] **Step 10: Commit**

~~~bash
git add README.md
git commit -m "docs: document underwater main menu"
~~~

## Completion Evidence

Record these outputs in the implementation handoff:

- Menu asset audit summary and shark clip name.
- Full Vitest result count.
- Type-check result.
- Production build result.
- Viewports inspected.
- Pointer-lock denial result.
- Menu-to-intro result.
- Scavenging-ending-to-menu result.

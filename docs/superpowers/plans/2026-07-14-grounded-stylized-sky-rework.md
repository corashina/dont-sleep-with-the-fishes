# Grounded Stylized Sky Rework Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the flat procedural sky treatment with a grounded maritime atmosphere, an original textured gibbous moon, a restrained multi-part sun, and naturally varied stars while preserving cloudless weather transitions and shared fog/ocean colors.

**Architecture:** A new app-owned `SkyAssets` resource loads one bundled moon texture and shares it through `PhaseContext`. `Skybox` samples that texture on its existing camera-centered sphere and upgrades its physically inspired atmosphere, sun, and star functions without changing the public weather/phase palette flow. Scavenging and survival keep one interpolated palette for the sky, fog, lighting, and ocean.

**Tech Stack:** TypeScript 5.9, Three.js 0.180, GLSL through `ShaderMaterial`, Vite 7, Vitest 3, Bun, original PNG art generated with the imagegen skill.

## Global Constraints

- Work directly in `C:\Users\Tomasz\Documents\Projects\dont-sleep-with-the-fishes`; the user declined a worktree.
- The worktree already contains unrelated user-owned edits. Before each task, save or record a scoped baseline and review only the task's before-to-after diff. Never stage unrelated hunks.
- Commit a task only when its complete dependency set can be staged without capturing pre-existing work. Otherwise leave the scoped changes unstaged and record the dirty-worktree constraint in `.superpowers/sdd/progress.md`.
- The sky remains cloudless: no cloud mesh, cloud texture, shader cloud, moving vapor layer, or photographic panorama.
- Create one original `512x512` RGBA texture at `src/assets/sky/moon-gibbous.png`; do not download it from a third-party source.
- Runtime code must load the committed local texture and must not fetch any art from an external store.
- Load exactly one moon `Texture`, share it across phases, and dispose it exactly once after the active phase is disposed.
- Preserve the existing `SkyState`, `SkyPalette`, 1.5-second transition, transient dive tint, allocation-free palette reuse, fog/light synchronization, and ocean atmosphere input.
- Use TDD: write each behavioral test first, run it red for the intended reason, then implement the minimum production change.
- After the visual asset changes, run `bun run models:check`, `bun run test`, `bun run typecheck`, `bun run build`, and browser inspection in scavenging and survival as required by `AGENTS.md`.

---

### Task 1: Original moon asset and shared sky-asset loader

**Files:**
- Create: `src/assets/sky/moon-gibbous.png`
- Create: `src/world/SkyAssets.ts`
- Create: `tests/SkyAssets.test.ts`
- Create: `tests/helpers/skyAssets.ts`

**Interfaces:**
- Consumes: Vite's bundled URL import for `src/assets/sky/moon-gibbous.png`; Three.js `TextureLoader`.
- Produces: `SkyTextureLoader`, `SkyAssetLoadError`, and `SkyAssets` with `static load(loader?)`, `static fromTexture(texture)`, `readonly moonTexture`, and idempotent `dispose()`.

- [ ] **Step 1: Write the failing sky-asset tests**

Create `tests/SkyAssets.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import {
  ClampToEdgeWrapping,
  LinearFilter,
  LinearMipmapLinearFilter,
  SRGBColorSpace,
  Texture,
} from 'three';
import {
  SkyAssetLoadError,
  SkyAssets,
  type SkyTextureLoader,
} from '../src/world/SkyAssets';

describe('SkyAssets', () => {
  it('loads and configures the bundled gibbous moon texture', async () => {
    const texture = new Texture();
    const loadAsync = vi.fn(async () => texture);
    const assets = await SkyAssets.load({ loadAsync } satisfies SkyTextureLoader);

    expect(loadAsync).toHaveBeenCalledOnce();
    expect(loadAsync.mock.calls[0]![0]).toMatch(/moon-gibbous\.png$/);
    expect(assets.moonTexture).toBe(texture);
    expect(texture.wrapS).toBe(ClampToEdgeWrapping);
    expect(texture.wrapT).toBe(ClampToEdgeWrapping);
    expect(texture.magFilter).toBe(LinearFilter);
    expect(texture.minFilter).toBe(LinearMipmapLinearFilter);
    expect(texture.generateMipmaps).toBe(true);
    expect(texture.colorSpace).toBe(SRGBColorSpace);
    expect(texture.version).toBeGreaterThan(0);
  });

  it('reports a sky-specific load failure', async () => {
    const cause = new Error('image decode failed');
    const loader = {
      loadAsync: vi.fn(async () => { throw cause; }),
    } satisfies SkyTextureLoader;

    await expect(SkyAssets.load(loader)).rejects.toMatchObject({
      name: 'SkyAssetLoadError',
      message: 'Moon texture could not be loaded.',
      cause,
    });
  });

  it('disposes its shared moon texture once', () => {
    const texture = new Texture();
    const dispose = vi.spyOn(texture, 'dispose');
    const assets = SkyAssets.fromTexture(texture);

    assets.dispose();
    assets.dispose();

    expect(dispose).toHaveBeenCalledOnce();
  });
});
```

Create `tests/helpers/skyAssets.ts`:

```ts
import { Texture } from 'three';
import { SkyAssets } from '../../src/world/SkyAssets';

export function createTestMoonTexture(): Texture {
  return new Texture();
}

export function createTestSkyAssets(): SkyAssets {
  return SkyAssets.fromTexture(createTestMoonTexture());
}
```

- [ ] **Step 2: Run the focused test and confirm the red state**

Run: `bun run test -- tests/SkyAssets.test.ts`

Expected: FAIL because `src/world/SkyAssets.ts` and the moon PNG do not exist.

- [ ] **Step 3: Generate and inspect the original moon texture**

Read and use the `imagegen` skill. Generate a square transparent texture with this art direction:

```text
Create an original 512 by 512 RGBA game texture of a slightly gibbous moon,
isolated and centered on a fully transparent background. Grounded stylized
realism: recognizable crater basins and maria, restrained grayscale contrast,
a soft terminator shading the rightmost edge, subtle spherical falloff, clean
anti-aliased lunar edge, no stars, no sky, no clouds, no text, no painted outer
glow, no square background. The moon should fill about 84 percent of the canvas.
```

Save the accepted output as `src/assets/sky/moon-gibbous.png`. Inspect it with `view_image` at original detail. Reject and regenerate it if the background is not transparent, the moon is full rather than slightly gibbous, the terminator is hard, the surface is photographic/noisy, or any square boundary is visible.

Confirm the file is PNG and exactly 512 by 512. If the generator returns a different size, use the imagegen edit flow to produce the exact accepted dimensions; do not use an unrelated third-party image editor or source.

- [ ] **Step 4: Implement the owned loader**

Create `src/world/SkyAssets.ts`:

```ts
import {
  ClampToEdgeWrapping,
  LinearFilter,
  LinearMipmapLinearFilter,
  SRGBColorSpace,
  Texture,
  TextureLoader,
} from 'three';
import moonTextureUrl from '../assets/sky/moon-gibbous.png';

export interface SkyTextureLoader {
  loadAsync(url: string): Promise<Texture>;
}

export class SkyAssetLoadError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'SkyAssetLoadError';
  }
}

export class SkyAssets {
  private disposed = false;

  private constructor(readonly moonTexture: Texture) {}

  static async load(
    loader: SkyTextureLoader = new TextureLoader(),
  ): Promise<SkyAssets> {
    let moonTexture: Texture;
    try {
      moonTexture = await loader.loadAsync(moonTextureUrl);
    } catch (cause) {
      throw new SkyAssetLoadError('Moon texture could not be loaded.', { cause });
    }

    moonTexture.wrapS = ClampToEdgeWrapping;
    moonTexture.wrapT = ClampToEdgeWrapping;
    moonTexture.magFilter = LinearFilter;
    moonTexture.minFilter = LinearMipmapLinearFilter;
    moonTexture.generateMipmaps = true;
    moonTexture.colorSpace = SRGBColorSpace;
    moonTexture.needsUpdate = true;
    return new SkyAssets(moonTexture);
  }

  static fromTexture(texture: Texture): SkyAssets {
    return new SkyAssets(texture);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.moonTexture.dispose();
  }
}
```

- [ ] **Step 5: Run the focused tests and type checking**

Run: `bun run test -- tests/SkyAssets.test.ts`

Expected: 3 tests pass.

Run: `bun run typecheck`

Expected: exit code 0 with no diagnostics.

- [ ] **Step 6: Commit only the new asset unit**

```bash
git add src/assets/sky/moon-gibbous.png src/world/SkyAssets.ts tests/SkyAssets.test.ts tests/helpers/skyAssets.ts
git diff --cached --check
git commit -m "feat: load shared gibbous moon texture"
```

---

### Task 2: App-level texture ownership and phase context

**Files:**
- Modify: `src/app/launchGame.ts:1-174`
- Modify: `src/app/GamePhase.ts:1-18`
- Modify: `src/Game.ts:40-213`
- Modify: `src/survival/SurvivalPhase.ts:1-42`
- Modify: `tests/launchGame.test.ts:1-330`
- Modify: `tests/GameDirector.test.ts:1-45`
- Modify: `tests/GameLifecycle.test.ts:1-90`

**Interfaces:**
- Consumes: `SkyAssets.load()`, `SkyAssets.dispose()`, and `SkyAssets.moonTexture` from Task 1.
- Produces: `PhaseContext.skyAssets: SkyAssets`; `Game` and launcher ownership of the shared resource.

- [ ] **Step 1: Add failing launcher and game-lifecycle assertions**

Update the launcher dependency contract in `tests/launchGame.test.ts` through the public type, and add focused tests with this ownership shape:

```ts
it('waits for models and sky assets before creating the game', async () => {
  const modelLoad = deferred<PropModelLibrary>();
  const skyLoad = deferred<SkyAssets>();
  const models = { dispose: vi.fn() } as unknown as PropModelLibrary;
  const skyAssets = createTestSkyAssets();
  const game = { start: vi.fn(), dispose: vi.fn() };
  const createGame = vi.fn(() => game);
  const mount = connectedMount();
  const handle = launchGame(mount, dependencies(
    () => modelLoad.promise,
    { loadSkyAssets: () => skyLoad.promise, createGame },
  ));

  modelLoad.resolve(models);
  await Promise.resolve();
  expect(createGame).not.toHaveBeenCalled();

  skyLoad.resolve(skyAssets);
  await expect(handle.completion).resolves.toBe(game as unknown as Game);
  expect(createGame).toHaveBeenCalledWith(mount, models, skyAssets);
});

it('disposes fulfilled models when sky preload fails', async () => {
  const models = { dispose: vi.fn() } as unknown as PropModelLibrary;
  const createGame = vi.fn();
  const mount = connectedMount();
  const handle = launchGame(mount, dependencies(
    () => Promise.resolve(models),
    {
      loadSkyAssets: () => Promise.reject(
        new SkyAssetLoadError('Moon texture could not be loaded.'),
      ),
      createGame,
    },
  ));

  await expect(handle.completion).resolves.toBeNull();
  expect(models.dispose).toHaveBeenCalledOnce();
  expect(createGame).not.toHaveBeenCalled();
  expect(mount.textContent).toContain('ATMOSPHERE UNAVAILABLE');
});

it('disposes fulfilled sky assets when model preload fails', async () => {
  const skyAssets = createTestSkyAssets();
  const skyDispose = vi.spyOn(skyAssets, 'dispose');
  const mount = connectedMount();
  const handle = launchGame(mount, dependencies(
    () => Promise.reject(new ItemModelLoadError('ductTape', 'download failed')),
    { loadSkyAssets: () => Promise.resolve(skyAssets) },
  ));

  await expect(handle.completion).resolves.toBeNull();
  expect(skyDispose).toHaveBeenCalledOnce();
});
```

In the game lifecycle suite, add the shared assets to test options and assert that `Game.dispose()` releases them after the active phase:

```ts
const skyAssets = createTestSkyAssets();
const disposeSkyAssets = vi.spyOn(skyAssets, 'dispose');
const game = Game.forTest(factories, { propModels, skyAssets, renderer });

game.dispose();
game.dispose();

expect(disposePhase).toHaveBeenCalledOnce();
expect(disposeSkyAssets).toHaveBeenCalledOnce();
expect(disposePhase.mock.invocationCallOrder[0])
  .toBeLessThan(disposeSkyAssets.mock.invocationCallOrder[0]!);
```

- [ ] **Step 2: Run the lifecycle tests and confirm the red state**

Run: `bun run test -- tests/launchGame.test.ts tests/GameLifecycle.test.ts tests/GameDirector.test.ts`

Expected: FAIL because `LaunchDependencies`, `GameTestOptions`, and `PhaseContext` do not carry `SkyAssets`.

- [ ] **Step 3: Extend the shared context and Game ownership**

Add to `src/app/GamePhase.ts`:

```ts
import type { SkyAssets } from '../world/SkyAssets';

export interface PhaseContext {
  mount: HTMLElement;
  renderer: WebGLRenderer;
  camera: PerspectiveCamera;
  reducedMotion: MediaQueryList;
  propModels: PropModelLibrary;
  skyAssets: SkyAssets;
}
```

In `src/Game.ts`, add `skyAssets` beside `propModels`, require it in the production constructor and `GameTestOptions`, pass it through `initialize`, include it in `this.context`, and dispose it after the detached active phase and model library:

```ts
export interface GameTestOptions {
  propModels: PropModelLibrary;
  skyAssets: SkyAssets;
  clock?: GameClock;
  createSeed?: () => number;
  mount?: HTMLElement;
  renderer?: WebGLRenderer;
}

constructor(
  mount: HTMLElement,
  propModels: PropModelLibrary,
  skyAssets: SkyAssets,
) {
  // existing renderer setup
  this.initialize(
    mount,
    renderer,
    camera,
    clock,
    reducedMotion,
    propModels,
    skyAssets,
    PRODUCTION_FACTORIES,
    createRandomSeed,
  );
}
```

The relevant ownership code must be:

```ts
private skyAssets!: SkyAssets;

private initialize(
  mount: HTMLElement,
  renderer: WebGLRenderer,
  camera: PerspectiveCamera,
  clock: GameClock,
  reducedMotion: MediaQueryList,
  propModels: PropModelLibrary,
  skyAssets: SkyAssets,
  factories: GameFactories,
  createSeed: () => number,
): void {
  // existing assignments
  this.propModels = propModels;
  this.skyAssets = skyAssets;
  this.context = { mount, renderer, camera, reducedMotion, propModels, skyAssets };
  // existing construction
}

dispose(): void {
  if (this.disposed) return;
  this.disposed = true;
  if (this.animationFrame !== 0) cancelAnimationFrame(this.animationFrame);
  window.removeEventListener('resize', this.onResize);
  const outgoing = this.detachActivePhase();
  this.exitPointerLock();
  outgoing?.dispose();
  this.performanceStats?.dispose();
  this.performanceStats = null;
  this.propModels.dispose();
  this.skyAssets.dispose();
  this.renderer.dispose();
  this.renderer.domElement.remove();
}
```

Update `SurvivalPhase.testContext()` with `skyAssets: {} as SkyAssets`; its injected test world never reads the texture.

- [ ] **Step 4: Load both owned resources safely in the launcher**

Extend `LaunchDependencies` and production setup in `src/app/launchGame.ts`:

```ts
export interface LaunchDependencies {
  loadModels(): Promise<PropModelLibrary>;
  loadSkyAssets(): Promise<SkyAssets>;
  createGame(
    mount: HTMLElement,
    models: PropModelLibrary,
    skyAssets: SkyAssets,
  ): Pick<Game, 'start' | 'dispose'>;
}

const PRODUCTION_DEPENDENCIES: LaunchDependencies = {
  loadModels: () => PropModelLibrary.load(),
  loadSkyAssets: () => SkyAssets.load(),
  createGame: (mount, models, skyAssets) => new Game(mount, models, skyAssets),
};

interface LoadedGameAssets {
  models: PropModelLibrary;
  skyAssets: SkyAssets;
}

async function loadGameAssets(
  dependencies: LaunchDependencies,
): Promise<LoadedGameAssets> {
  const [models, skyAssets] = await Promise.allSettled([
    dependencies.loadModels(),
    dependencies.loadSkyAssets(),
  ]);
  if (models.status === 'rejected' || skyAssets.status === 'rejected') {
    if (models.status === 'fulfilled') models.value.dispose();
    if (skyAssets.status === 'fulfilled') skyAssets.value.dispose();
    throw models.status === 'rejected' ? models.reason : skyAssets.reason;
  }
  return { models: models.value, skyAssets: skyAssets.value };
}
```

Replace `unownedModels` with `unownedAssets: LoadedGameAssets | null`. Cancellation and constructor-failure branches dispose both members. After `createGame(mount, models, skyAssets)` returns successfully, set `unownedAssets = null` because `Game` now owns both.

Handle `SkyAssetLoadError` in `renderPreloadFailure`:

```ts
if (error instanceof SkyAssetLoadError) {
  mount.replaceChildren(screen(
    'ATMOSPHERE UNAVAILABLE',
    'Unable to prepare the sky',
    'A required local sky texture could not be loaded.',
    error.message,
  ));
  return;
}
```

Update the `dependencies` helper in `tests/launchGame.test.ts` so its default `loadSkyAssets` returns a fresh `createTestSkyAssets()`. Update existing `createGame` assertions and `Game.forTest` calls to include `skyAssets`.

- [ ] **Step 5: Run lifecycle suites and type checking**

Run: `bun run test -- tests/launchGame.test.ts tests/GameLifecycle.test.ts tests/GameDirector.test.ts`

Expected: all selected tests pass.

Run: `bun run typecheck`

Expected: exit code 0.

- [ ] **Step 6: Review the isolated dirty-file diff and commit only if safe**

Compare each modified file with its saved pre-task baseline. Confirm cancellation disposes every fulfilled but unowned resource once, `Game` disposes phase before shared texture, and no unrelated `Game.ts` hunks enter the task diff.

If all scoped hunks can be staged without capturing user work:

```bash
git add src/app/launchGame.ts src/app/GamePhase.ts src/Game.ts src/survival/SurvivalPhase.ts tests/launchGame.test.ts tests/GameDirector.test.ts tests/GameLifecycle.test.ts
git diff --cached --check
git commit -m "feat: share sky assets across game phases"
```

Otherwise leave the task unstaged and record the isolated verification in `.superpowers/sdd/progress.md`.

---

### Task 3: Inject the textured moon through both world renderers

**Files:**
- Modify: `src/world/Skybox.ts:1-166`
- Modify: `src/world/Environment.ts:1-145`
- Modify: `src/world/World.ts:70-125`
- Modify: `src/phases/ScavengePhase.ts:50-80`
- Modify: `src/survival/BoatWorld.ts:170-245`
- Modify: `src/survival/SurvivalPhase.ts:75-100`
- Modify: `tests/Skybox.test.ts:1-130`
- Modify: `tests/world.test.ts:80-520`
- Modify: `tests/BoatWorld.test.ts:1-590`
- Modify: `tests/GameLifecycle.test.ts:50-90`

**Interfaces:**
- Consumes: `PhaseContext.skyAssets.moonTexture` from Task 2.
- Produces: `Skybox(scene, initialState, moonTexture)` with `uMoonMap`; required `Texture` parameters for `World` and `BoatWorld` construction.

- [ ] **Step 1: Add failing texture-binding and ownership tests**

Update `tests/Skybox.test.ts` to construct every sky with a texture and add:

```ts
it('binds but does not own the shared moon texture', () => {
  const scene = new Scene();
  const moonTexture = createTestMoonTexture();
  const textureDispose = vi.spyOn(moonTexture, 'dispose');
  const sky = new Skybox(
    scene,
    { weather: 'calm', phase: 'night', severity: 0 },
    moonTexture,
  );

  expect(sky.material.uniforms.uMoonMap!.value).toBe(moonTexture);
  expect(sky.material.fragmentShader).toContain('uniform sampler2D uMoonMap;');
  expect(sky.material.fragmentShader).toContain('texture2D(uMoonMap, moonUv)');

  sky.dispose();
  sky.dispose();
  expect(textureDispose).not.toHaveBeenCalled();
});
```

In `tests/world.test.ts` and `tests/BoatWorld.test.ts`, pass `createTestMoonTexture()` to constructors and assert the active sky's `uMoonMap` is that exact object. In disposal tests, spy on the texture and confirm world disposal does not release the shared texture.

- [ ] **Step 2: Run the focused sky/world tests and confirm the red state**

Run: `bun run test -- tests/Skybox.test.ts tests/world.test.ts tests/BoatWorld.test.ts`

Expected: FAIL because constructors do not accept a moon texture and the shader has no `uMoonMap`.

- [ ] **Step 3: Add required texture parameters through both phases**

Use these exact constructor signatures:

```ts
// Skybox.ts
constructor(
  private readonly scene: Scene,
  initialState: SkyState,
  moonTexture: Texture,
)

// Environment.ts
constructor(private readonly scene: Scene, moonTexture: Texture)

// World.ts
constructor(
  private readonly scene: Scene,
  private readonly propModels: PropModelLibrary,
  moonTexture: Texture,
  instances: readonly ItemInstance[] = createItemInstances(),
  random: () => number = Math.random,
)

// BoatWorld.ts
constructor(
  camera: PerspectiveCamera,
  reducedMotion: MediaQueryList,
  propModels: PropModelLibrary,
  moonTexture: Texture,
  savedItems: readonly ItemInstance[] = [],
)
```

Construct the sky with that texture:

```ts
// Environment
this.sky = new Skybox(
  scene,
  { weather: 'squall', phase: 'day', severity: 0 },
  moonTexture,
);

// BoatWorld
this.sky = new Skybox(
  this.scene,
  { weather: 'calm', phase: 'day', severity: 0 },
  moonTexture,
);
```

Pass it from the phase context:

```ts
// ScavengePhase
this.world = new World(
  this.scene,
  context.propModels,
  context.skyAssets.moonTexture,
  instances,
);

// SurvivalPhase
new BoatWorld(
  context.camera,
  context.reducedMotion,
  context.propModels,
  context.skyAssets.moonTexture,
  savedItems,
)
```

Update all direct test constructors with `createTestMoonTexture()` in the new required position. Do not add a production fallback texture or make the argument optional.

- [ ] **Step 4: Replace the analytic moon disc with texture projection**

Import `Texture` in `Skybox.ts`, add `uMoonMap: { value: moonTexture }`, and replace the current analytic moon calculation with this angular projection:

```glsl
uniform sampler2D uMoonMap;

vec4 sampleMoon(vec3 direction, vec3 moonDirection, out float radialDistance) {
  vec3 moonRight = normalize(cross(vec3(0.0, 1.0, 0.0), moonDirection));
  vec3 moonUp = normalize(cross(moonDirection, moonRight));
  float facing = dot(direction, moonDirection);
  vec2 tangent = vec2(
    dot(direction, moonRight),
    dot(direction, moonUp)
  ) / max(facing, 0.0001);
  const float moonRadius = 0.027;
  vec2 moonUv = tangent / (moonRadius * 2.0) + 0.5;
  radialDistance = length(tangent) / moonRadius;
  float inside = step(0.0, facing)
    * step(abs(tangent.x), moonRadius)
    * step(abs(tangent.y), moonRadius);
  return texture2D(uMoonMap, moonUv) * inside;
}
```

Use it in `main`:

```glsl
vec3 moonDirection = normalize(vec3(0.46, 0.52, -0.72));
float moonRadialDistance;
vec4 moonSample = sampleMoon(direction, moonDirection, moonRadialDistance);
color += uMoonColor
  * moonSample.rgb
  * moonSample.a
  * uMoonVisibility
  * (1.0 - uHaze * 0.72);
```

Remove the old `smoothstep` moon disc. Task 4 will add the independent halo and complete atmosphere treatment.

- [ ] **Step 5: Run integration suites and type checking**

Run: `bun run test -- tests/SkyAssets.test.ts tests/Skybox.test.ts tests/world.test.ts tests/BoatWorld.test.ts tests/GameLifecycle.test.ts`

Expected: all selected tests pass.

Run: `bun run typecheck`

Expected: exit code 0.

- [ ] **Step 6: Review the isolated dirty-file diff and commit only if safe**

Confirm the moon texture reference flows from `Game` to both phase contexts, each sky binds it, and phase/world disposal never disposes it. Compare `World.ts`, `BoatWorld.ts`, and their tests against saved baselines so existing ocean and gameplay changes remain untouched.

If the whole dependency set can be staged safely:

```bash
git add src/world/Skybox.ts src/world/Environment.ts src/world/World.ts src/phases/ScavengePhase.ts src/survival/BoatWorld.ts src/survival/SurvivalPhase.ts tests/Skybox.test.ts tests/world.test.ts tests/BoatWorld.test.ts tests/GameLifecycle.test.ts
git diff --cached --check
git commit -m "feat: render shared textured moon"
```

Otherwise leave it unstaged and record the focused verification.

---

### Task 4: Physically inspired atmosphere, sun, stars, and palette retune

**Files:**
- Modify: `src/world/Skybox.ts:20-166`
- Modify: `src/world/skyPalette.ts:25-88`
- Modify: `tests/Skybox.test.ts:1-170`
- Modify: `tests/SkyPalette.test.ts:1-180`
- Modify: `tests/world.test.ts:130-205`
- Modify: `tests/BoatWorld.test.ts:90-180`

**Interfaces:**
- Consumes: the `uMoonMap` sampler and angular moon projection from Task 3.
- Produces: the final grounded atmosphere shader and retuned six-state `SkyPalette` values; no public type changes.

- [ ] **Step 1: Write failing shader-structure and palette-relationship tests**

Add to `tests/Skybox.test.ts`:

```ts
it('layers optical-depth atmosphere, a three-part sun, moon halo, and two star fields', () => {
  const sky = new Skybox(
    new Scene(),
    { weather: 'calm', phase: 'night', severity: 0 },
    createTestMoonTexture(),
  );
  const shader = sky.material.fragmentShader;

  expect(shader).toContain('float opticalPath =');
  expect(shader).toContain('float horizonHaze =');
  expect(shader).toContain('float sunDisc =');
  expect(shader).toContain('float sunBloom =');
  expect(shader).toContain('float sunHalo =');
  expect(shader).toContain('float moonHalo =');
  expect(shader.match(/starLayer\(/g)).toHaveLength(3);
  expect(shader.indexOf('#include <colorspace_fragment>'))
    .toBeLessThan(shader.indexOf('gl_FragColor.rgb += dither'));
  expect(shader).not.toContain('float moon = smoothstep');
  sky.dispose();
});
```

Add relationship coverage to `tests/SkyPalette.test.ts`:

```ts
it('orders celestial visibility and haze from calm through squall', () => {
  const calmDay = skyPaletteFor({ weather: 'calm', phase: 'day', severity: 0 });
  const overcastDay = skyPaletteFor({ weather: 'overcast', phase: 'day', severity: 0 });
  const squallDay = skyPaletteFor({ weather: 'squall', phase: 'day', severity: 0 });
  const calmNight = skyPaletteFor({ weather: 'calm', phase: 'night', severity: 0 });
  const overcastNight = skyPaletteFor({ weather: 'overcast', phase: 'night', severity: 0 });
  const squallNight = skyPaletteFor({ weather: 'squall', phase: 'night', severity: 0 });

  expect(calmDay.sunVisibility).toBeGreaterThan(overcastDay.sunVisibility);
  expect(overcastDay.sunVisibility).toBeGreaterThan(squallDay.sunVisibility);
  expect(calmNight.moonVisibility).toBeGreaterThan(overcastNight.moonVisibility);
  expect(overcastNight.moonVisibility).toBeGreaterThan(squallNight.moonVisibility);
  expect(calmNight.starVisibility).toBeGreaterThan(overcastNight.starVisibility);
  expect(overcastNight.starVisibility).toBeGreaterThan(squallNight.starVisibility);
  expect(calmDay.haze).toBeLessThan(overcastDay.haze);
  expect(overcastDay.haze).toBeLessThan(squallDay.haze);
});
```

- [ ] **Step 2: Run the sky suites and confirm the red state**

Run: `bun run test -- tests/Skybox.test.ts tests/SkyPalette.test.ts`

Expected: FAIL because the shader still uses the flat gradient, one star hash, and no layered halos; the old palette values do not match the revised relationships exactly.

- [ ] **Step 3: Retune all six authored palettes**

Replace the six `BASE` entries in `src/world/skyPalette.ts` with these values while preserving the existing types, materialization, interpolation, fallback, and sinking-severity code:

```ts
const BASE: Record<SkyWeather, Record<SkyPhase, PaletteNumbers>> = {
  calm: {
    day: {
      zenithColor: 0x245f80, upperColor: 0x5d8fa6, horizonColor: 0xb5c1bb,
      fogColor: 0x829b9e, sunColor: 0xffdda0, moonColor: 0xdce5e8,
      starColor: 0xe9f0f2, ambientLightColor: 0xb9ced0, keyLightColor: 0xffd8aa,
      sunVisibility: 1, moonVisibility: 0, starVisibility: 0, haze: 0.12,
      exposure: 0.94, ambientLightIntensity: 1.05, keyLightIntensity: 2.05,
      fogDensity: 0.012,
    },
    night: {
      zenithColor: 0x030814, upperColor: 0x0b1c31, horizonColor: 0x23394b,
      fogColor: 0x0e1822, sunColor: 0xffdda0, moonColor: 0xd8e2e5,
      starColor: 0xe8eef0, ambientLightColor: 0x788f9e, keyLightColor: 0xa8c0ce,
      sunVisibility: 0, moonVisibility: 0.82, starVisibility: 0.72, haze: 0.18,
      exposure: 0.5, ambientLightIntensity: 0.26, keyLightIntensity: 0.2,
      fogDensity: 0.021,
    },
  },
  overcast: {
    day: {
      zenithColor: 0x344b57, upperColor: 0x596b72, horizonColor: 0x929b99,
      fogColor: 0x657d80, sunColor: 0xd4cdb9, moonColor: 0xc6d0d4,
      starColor: 0xd8e0e2, ambientLightColor: 0xa8b8b7, keyLightColor: 0xcac2af,
      sunVisibility: 0.22, moonVisibility: 0, starVisibility: 0, haze: 0.68,
      exposure: 0.72, ambientLightIntensity: 0.68, keyLightIntensity: 1.0,
      fogDensity: 0.019,
    },
    night: {
      zenithColor: 0x070d16, upperColor: 0x14202c, horizonColor: 0x33414a,
      fogColor: 0x111c25, sunColor: 0xffdda0, moonColor: 0xc3ced2,
      starColor: 0xd4dcdf, ambientLightColor: 0x6e828e, keyLightColor: 0x96acb8,
      sunVisibility: 0, moonVisibility: 0.28, starVisibility: 0.12, haze: 0.72,
      exposure: 0.38, ambientLightIntensity: 0.24, keyLightIntensity: 0.18,
      fogDensity: 0.024,
    },
  },
  squall: {
    day: {
      zenithColor: 0x16232b, upperColor: 0x29343a, horizonColor: 0x596064,
      fogColor: 0x2b383e, sunColor: 0xbdb6a3, moonColor: 0xb5c0c5,
      starColor: 0xc5ced1, ambientLightColor: 0x89999b, keyLightColor: 0xbcb5a3,
      sunVisibility: 0.08, moonVisibility: 0, starVisibility: 0, haze: 0.92,
      exposure: 0.62, ambientLightIntensity: 0.44, keyLightIntensity: 0.58,
      fogDensity: 0.03,
    },
    night: {
      zenithColor: 0x02050a, upperColor: 0x07101a, horizonColor: 0x182630,
      fogColor: 0x0c1720, sunColor: 0xffdda0, moonColor: 0xa9b5bb,
      starColor: 0xb9c3c7, ambientLightColor: 0x596b76, keyLightColor: 0x849aa7,
      sunVisibility: 0, moonVisibility: 0.07, starVisibility: 0.02, haze: 0.95,
      exposure: 0.26, ambientLightIntensity: 0.16, keyLightIntensity: 0.18,
      fogDensity: 0.034,
    },
  },
};
```

Keep the existing sinking overrides, but begin from these squall-day values. Preserve the current `severity` clamp and allocation-free `reusableOut` path.

- [ ] **Step 4: Replace the fragment shader with the grounded atmosphere**

Keep the existing uniforms, `uMoonMap`, transient tint, and vertex shader. Replace the fragment shader body with this complete structure:

```glsl
uniform vec3 uZenithColor;
uniform vec3 uUpperColor;
uniform vec3 uHorizonColor;
uniform vec3 uSunColor;
uniform vec3 uMoonColor;
uniform vec3 uStarColor;
uniform vec3 uTintColor;
uniform sampler2D uMoonMap;
uniform float uSunVisibility;
uniform float uMoonVisibility;
uniform float uStarVisibility;
uniform float uHaze;
uniform float uExposure;
uniform float uTintAmount;
varying vec3 vSkyDirection;

float hash31(vec3 value) {
  value = fract(value * 0.1031);
  value += dot(value, value.yzx + 33.33);
  return fract((value.x + value.y) * value.z);
}

float hash21(vec2 value) {
  vec3 value3 = fract(vec3(value.xyx) * 0.1031);
  value3 += dot(value3, value3.yzx + 33.33);
  return fract((value3.x + value3.y) * value3.z);
}

vec3 starLayer(vec3 direction, float scale, float threshold) {
  vec3 grid = direction * scale;
  vec3 cell = floor(grid);
  vec3 local = fract(grid) - 0.5;
  vec3 offset = (vec3(
    hash31(cell + 1.7),
    hash31(cell + 4.1),
    hash31(cell + 8.3)
  ) - 0.5) * 0.52;
  float seed = hash31(cell);
  float exists = step(threshold, seed);
  float radius = mix(0.025, 0.075, hash31(cell + 12.8));
  float point = 1.0 - smoothstep(radius, radius * 2.4, length(local - offset));
  float brightness = mix(0.32, 1.0, hash31(cell + 19.4));
  vec3 warm = vec3(1.04, 0.98, 0.9);
  vec3 cool = vec3(0.88, 0.96, 1.08);
  vec3 tint = mix(warm, cool, hash31(cell + 25.6));
  return tint * point * exists * brightness;
}

vec4 sampleMoon(vec3 direction, vec3 moonDirection, out float radialDistance) {
  vec3 moonRight = normalize(cross(vec3(0.0, 1.0, 0.0), moonDirection));
  vec3 moonUp = normalize(cross(moonDirection, moonRight));
  float facing = dot(direction, moonDirection);
  vec2 tangent = vec2(
    dot(direction, moonRight),
    dot(direction, moonUp)
  ) / max(facing, 0.0001);
  const float moonRadius = 0.027;
  vec2 moonUv = tangent / (moonRadius * 2.0) + 0.5;
  radialDistance = length(tangent) / moonRadius;
  float inside = step(0.0, facing)
    * step(abs(tangent.x), moonRadius)
    * step(abs(tangent.y), moonRadius);
  return texture2D(uMoonMap, moonUv) * inside;
}

void main() {
  vec3 direction = normalize(vSkyDirection);
  float elevation = max(direction.y, 0.0);
  float opticalPath = 1.0 / max(direction.y + 0.12, 0.12);
  float upperWeight = smoothstep(-0.025, 0.52, direction.y);
  float zenithWeight = pow(elevation, 0.58);
  vec3 color = mix(uHorizonColor, uUpperColor, upperWeight);
  color = mix(color, uZenithColor, zenithWeight);

  float pathHaze = clamp((opticalPath - 1.0) * 0.09, 0.0, 1.0);
  float horizonHaze = uHaze * pathHaze;
  color = mix(color, uHorizonColor, clamp(horizonHaze * 0.42, 0.0, 0.55));
  float horizonLift = exp(-abs(direction.y) * 28.0) * (0.03 + uHaze * 0.08);
  color += uHorizonColor * horizonLift;

  vec3 sunDirection = normalize(vec3(-0.42, 0.58, -0.7));
  float sunSeparation = 1.0 - clamp(dot(direction, sunDirection), 0.0, 1.0);
  float sunDisc = 1.0 - smoothstep(0.00003, 0.00022, sunSeparation);
  float sunBloom = exp(-sunSeparation * 720.0);
  float sunHalo = exp(-sunSeparation * 44.0);
  float sunClarity = 1.0 - uHaze * 0.74;
  color += uSunColor * uSunVisibility * (
    sunDisc * sunClarity
    + sunBloom * mix(0.16, 0.28, sunClarity)
    + sunHalo * mix(0.035, 0.075, uHaze)
  );

  vec3 moonDirection = normalize(vec3(0.46, 0.52, -0.72));
  float moonRadialDistance;
  vec4 moonSample = sampleMoon(
    direction,
    moonDirection,
    moonRadialDistance
  );
  float moonClarity = 1.0 - uHaze * 0.72;
  color += uMoonColor
    * moonSample.rgb
    * moonSample.a
    * uMoonVisibility
    * moonClarity;
  float moonHalo = exp(
    -moonRadialDistance * moonRadialDistance * 1.65
  )
    * (1.0 - moonSample.a)
    * uMoonVisibility
    * mix(0.025, 0.07, moonClarity);
  color += uMoonColor * moonHalo;

  float starHorizon = smoothstep(0.04, 0.24, direction.y);
  float starClarity = max(0.0, 1.0 - uHaze * 0.94);
  vec3 stars = starLayer(direction, 210.0, 0.9972)
    + starLayer(direction, 390.0, 0.9986) * 0.7;
  color += uStarColor * stars * uStarVisibility * starHorizon * starClarity;

  color *= uExposure;
  color = mix(color, uTintColor, clamp(uTintAmount, 0.0, 1.0));
  gl_FragColor = vec4(color, 1.0);
  #include <colorspace_fragment>
  float dither = (hash21(gl_FragCoord.xy) - 0.5) / 255.0;
  gl_FragColor.rgb += dither;
}
```

Do not add time uniforms, animated noise, or cloud-like noise octaves.

- [ ] **Step 5: Run focused integration tests and type checking**

Run: `bun run test -- tests/SkyPalette.test.ts tests/Skybox.test.ts tests/world.test.ts tests/BoatWorld.test.ts`

Expected: all selected tests pass with updated palette expectations.

Run: `bun run typecheck`

Expected: exit code 0.

- [ ] **Step 6: Review and commit the shader/palette unit if safe**

Review shader math for finite denominators, aspect-independent moon projection, deterministic non-animated stars, colorspace-before-dither ordering, and absence of cloud code. Confirm `Skybox.update` still allocates no `Color` objects per frame.

If safe to stage:

```bash
git add src/world/Skybox.ts src/world/skyPalette.ts tests/Skybox.test.ts tests/SkyPalette.test.ts tests/world.test.ts tests/BoatWorld.test.ts
git diff --cached --check
git commit -m "feat: ground the procedural maritime atmosphere"
```

Otherwise preserve the scoped unstaged diff and record its focused verification.

---

### Task 5: Documentation, asset gates, and browser visual acceptance

**Files:**
- Modify: `README.md:1-12,85-110`
- Modify only if a visual defect is found: the smallest owning source/test pair from Tasks 1-4

**Interfaces:**
- Consumes: the completed shared moon asset, startup ownership, shader, and palette behavior.
- Produces: user-facing documentation and final automated/manual acceptance evidence.

- [ ] **Step 1: Update the atmosphere documentation**

Update the README opening atmosphere sentence to:

```markdown
The 3D world uses original procedural geometry and shaders. Its shared cloudless atmosphere combines grounded maritime scattering, a locally committed original gibbous-moon texture, weather-aware celestial light, fog, lighting, and synchronized ocean reflections without external sky art.
```

Update the `Skybox` architecture bullet to:

```markdown
- `src/world/Skybox`, `src/world/SkyAssets`, and `src/world/skyPalette` — shared cloudless atmosphere rendering, app-owned moon art, grounded weather and day/night palettes, celestial bodies, and ocean/fog color synchronization.
```

Do not add a third-party ledger row for the original moon art.

- [ ] **Step 2: Run the complete automated asset and quality gates**

Run each command fresh:

```bash
bun run models:check
bun run test
bun run typecheck
bun run build
git diff --check
```

Expected:

- Model audit passes with the existing exact triangle total.
- Every Vitest file passes with zero failed tests.
- TypeScript exits 0 with no diagnostics.
- Vite writes `dist/` and exits 0; the existing large-chunk advisory may remain non-failing.
- Diff check exits 0 with no whitespace errors.

Inspect `dist/assets` and confirm Vite emitted one moon image asset and no remote sky URL appears in the production JavaScript.

- [ ] **Step 3: Inspect the source moon texture**

Use `view_image` with original detail on `src/assets/sky/moon-gibbous.png`. Confirm:

- Slightly gibbous silhouette.
- Transparent canvas outside the disc.
- Readable but restrained crater/maria detail.
- Soft terminator and spherical falloff.
- No stars, sky, clouds, text, square background, or baked outer glow.

Record the file's SHA-256 in the task report for reproducibility, but do not add it to `THIRD_PARTY_ASSETS.md` because the art is original.

- [ ] **Step 4: Perform browser QA in both phases**

Start the production build locally:

```bash
bun run preview -- --host 127.0.0.1 --port 4173
```

Use the browser-control skill at 1280x720, 1440x900, and 1920x1080. Verify:

- Calm day has a deep zenith, pale horizon, compact sun, and restrained halo.
- Overcast day is low contrast with a diffused sun but no cloud shapes.
- Squall scavenging is cold and hazy; rain and spray remain; sinking deepens the sky without flattening it to black.
- Calm night shows the textured gibbous moon and sparse varied stars.
- The moon has no square edge, stays circular at all three aspect ratios, and does not appear pasted over the sky.
- Overcast night softens the moon and suppresses most stars.
- Squall night nearly veils the moon and leaves only rare faint stars.
- Nightfall and dawn blend over 1.5 seconds without a color or celestial snap.
- The fog horizon, distant ocean, and sky share colors without a seam.
- Dive tint affects the textured sky and clears afterward.
- Reduced motion preserves atmosphere transitions and all existing accessibility behavior.
- Restarting and changing phases leaves one active sky while the shared moon texture remains valid.
- Browser console contains no shader compile error, texture-load error, or lifecycle error.

If browser security or pointer-lock policy blocks a check, record the exact unverified items as manual follow-up rather than claiming they passed. Do not substitute an unauthorized browser surface.

- [ ] **Step 5: Fix any visual defect test-first**

For each observed defect:

1. Add the smallest deterministic regression assertion to the owning test file.
2. Run only that test and confirm it fails for the defect.
3. Adjust the owning texture, shader constant, palette value, or lifecycle code.
4. Rerun the focused test.
5. Repeat the affected browser state.

Do not broaden the fix into clouds, a continuous celestial clock, animated stars, dynamic moon phases, or unrelated ocean/gameplay work.

- [ ] **Step 6: Rerun final verification after every QA adjustment**

Run:

```bash
bun run models:check
bun run test
bun run typecheck
bun run build
git diff --check
```

Expected: every command exits 0 after the final source or asset change.

- [ ] **Step 7: Commit documentation and any isolated QA correction if safe**

If README and correction hunks are isolated from user work:

```bash
git add README.md
git diff --cached --check
git commit -m "docs: describe grounded maritime sky"
```

Commit a QA correction separately with its owning test. If README or correction files overlap pre-existing work, leave the scoped changes unstaged and record the verified before-to-after diff.

- [ ] **Step 8: Confirm final scope**

Run:

```bash
git status --short
git log -8 --oneline
rg -n "storm-clouds|shader cloud|https?://" src/world/Skybox.ts src/world/SkyAssets.ts src/world/Environment.ts src/survival/BoatWorld.ts src/phases/ScavengePhase.ts
```

Expected:

- No implementation of `storm-clouds` or shader clouds exists.
- The sky asset URL is local and Vite-bundled.
- New clean task commits appear in dependency order; overlapping user-owned edits remain unstaged and unchanged outside the isolated task diff.
- The final report distinguishes automated passes, completed visual checks, and any browser-policy manual follow-up.

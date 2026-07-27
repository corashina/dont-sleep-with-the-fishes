# Illustrated Post-Processing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Activate a consolidated, inexpensive illustrated post-processing pipeline with selective quality-scaled AO, mild conditional grading, and an accessible Low/High player setting.

**Architecture:** Production will use one `EffectComposer` containing the scene, optional selective AO, hover outline, combined grading/print shader, and output conversion. A small visual-quality preference object owns validation and persistence; both pause UIs share an isolated control component that updates the preference, which reconfigures AO without touching gameplay state.

**Tech Stack:** TypeScript 5.9, Three.js 0.180 `EffectComposer`/`GTAOPass`/`OutlinePass`, DOM/CSS, Vitest 3.2, Vite 7.

## Global Constraints

- Read and preserve `docs/VISUAL_STYLE_GUIDE.md`; post-processing must support authored geometry, materials, lighting, composition, and motion.
- Low is the default and targets 60 FPS at 1920x1080 on the selected integrated-laptop test machine.
- Low may add no more than approximately 20 percent GPU frame time over direct rendering.
- Low uses half-resolution 6–8-sample AO; High uses full-resolution 12–16-sample AO.
- Both quality modes use identical full-resolution grading, print treatment, and hover outlines.
- Do not add bloom, depth of field, motion blur, a LUT pass, or baseline chromatic aberration.
- Water, sky, and transparent glass must not contribute to selective AO.
- Keep gameplay and shared-wave behavior deterministic and independent of renderer state.
- Do not allocate pass, target, profile, uniform, or temporary vector objects in `render`.
- Every renderer resource and listener has one owner and is disposed exactly once.
- Preserve all pre-existing uncommitted work. Before every commit, inspect the staged diff and use patch staging for touched files that were already dirty.

---

## File Structure

- Create `src/rendering/visualQuality.ts`: quality type, validation, safe storage access, and the preference controller.
- Create `src/ui/VisualQualityControl.ts`: reusable accessible Low/High pause control and listener ownership.
- Modify `src/rendering/ItemAmbientOcclusion.ts`: AO resolution, sample, and denoise configuration by quality.
- Modify `src/rendering/PostProcessingPipeline.ts`: consolidated composer, outline, optional AO, debug controls, quality reconfiguration, and progressive fallback.
- Modify `src/rendering/PrintShader.ts`: single scene-color sample and no chromatic-aberration inputs.
- Modify `src/rendering/SceneRenderer.ts`: renderer contract and terminal direct-render fallback.
- Modify `src/Game.ts`: load one preference, construct the production pipeline, and connect preference changes.
- Modify `src/app/GamePhase.ts`: expose the shared preference to phase-owned pause UIs.
- Modify `src/phases/ScavengePhase.ts` and `src/survival/SurvivalPhase.ts`: pass the shared preference into their UI.
- Modify `src/ui/GameUI.ts` and `src/ui/SurvivalUI.ts`: mount and dispose the reusable pause control.
- Modify `src/styles/main.css`: scene-integrated two-state control styling.
- Add or update focused tests under `tests/` for every boundary above.

---

### Task 1: Visual-quality preference and reusable control

**Files:**
- Create: `src/rendering/visualQuality.ts`
- Create: `src/ui/VisualQualityControl.ts`
- Create: `tests/visualQuality.test.ts`
- Create: `tests/VisualQualityControl.test.ts`

**Interfaces:**
- Produces: `type VisualQuality = 'low' | 'high'`
- Produces: `interface VisualQualityPreference { get(): VisualQuality; set(value: VisualQuality): void }`
- Produces: `createVisualQualityPreference(apply, storage?): VisualQualityPreference`
- Produces: `class VisualQualityControl { readonly element: HTMLFieldSetElement; dispose(): void }`
- Storage key: `dont-sleep-with-the-fishes.visual-quality`

- [ ] **Step 1: Write failing preference tests**

```ts
// tests/visualQuality.test.ts
import { describe, expect, it, vi } from 'vitest';
import {
  createVisualQualityPreference,
  parseVisualQuality,
  VISUAL_QUALITY_STORAGE_KEY,
} from '../src/rendering/visualQuality';

describe('visual quality preference', () => {
  it('accepts only low and high', () => {
    expect(parseVisualQuality('high')).toBe('high');
    expect(parseVisualQuality('low')).toBe('low');
    expect(parseVisualQuality('ultra')).toBe('low');
    expect(parseVisualQuality(null)).toBe('low');
  });

  it('loads, applies, and persists changes without repeating equal values', () => {
    const storage = {
      getItem: vi.fn(() => 'high'),
      setItem: vi.fn(),
    };
    const apply = vi.fn();
    const preference = createVisualQualityPreference(apply, storage);

    expect(preference.get()).toBe('high');
    preference.set('low');
    preference.set('low');

    expect(apply).toHaveBeenCalledOnce();
    expect(apply).toHaveBeenCalledWith('low');
    expect(storage.setItem).toHaveBeenCalledWith(
      VISUAL_QUALITY_STORAGE_KEY,
      'low',
    );
  });

  it('falls back to low when storage throws', () => {
    const storage = {
      getItem: vi.fn(() => { throw new Error('blocked'); }),
      setItem: vi.fn(() => { throw new Error('blocked'); }),
    };
    const preference = createVisualQualityPreference(vi.fn(), storage);
    expect(preference.get()).toBe('low');
    expect(() => preference.set('high')).not.toThrow();
    expect(preference.get()).toBe('high');
  });
});
```

- [ ] **Step 2: Run preference tests and verify the missing module failure**

Run: `npm test -- tests/visualQuality.test.ts`

Expected: FAIL because `src/rendering/visualQuality.ts` does not exist.

- [ ] **Step 3: Implement the preference**

```ts
// src/rendering/visualQuality.ts
export type VisualQuality = 'low' | 'high';

export const DEFAULT_VISUAL_QUALITY: VisualQuality = 'low';
export const VISUAL_QUALITY_STORAGE_KEY =
  'dont-sleep-with-the-fishes.visual-quality';

type QualityStorage = Pick<Storage, 'getItem' | 'setItem'>;

export interface VisualQualityPreference {
  get(): VisualQuality;
  set(value: VisualQuality): void;
}

export function parseVisualQuality(value: unknown): VisualQuality {
  return value === 'high' ? 'high' : DEFAULT_VISUAL_QUALITY;
}

function browserStorage(): QualityStorage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
}

export function createVisualQualityPreference(
  apply: (value: VisualQuality) => void = () => undefined,
  storage: QualityStorage | null = browserStorage(),
): VisualQualityPreference {
  let current = DEFAULT_VISUAL_QUALITY;
  try {
    current = parseVisualQuality(storage?.getItem(VISUAL_QUALITY_STORAGE_KEY));
  } catch {
    current = DEFAULT_VISUAL_QUALITY;
  }
  return Object.freeze({
    get: () => current,
    set: (value: VisualQuality) => {
      if (value === current) return;
      current = value;
      apply(value);
      try {
        storage?.setItem(VISUAL_QUALITY_STORAGE_KEY, value);
      } catch {
        // Storage is optional; the in-memory choice still applies.
      }
    },
  });
}
```

- [ ] **Step 4: Run preference tests**

Run: `npm test -- tests/visualQuality.test.ts`

Expected: PASS.

- [ ] **Step 5: Write failing control tests**

```ts
// tests/VisualQualityControl.test.ts
// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { createVisualQualityPreference } from '../src/rendering/visualQuality';
import { VisualQualityControl } from '../src/ui/VisualQualityControl';

describe('VisualQualityControl', () => {
  it('exposes text, pressed state, focusable buttons, and immediate changes', () => {
    const apply = vi.fn();
    const preference = createVisualQualityPreference(apply, null);
    const control = new VisualQualityControl(preference);
    const low = control.element.querySelector<HTMLButtonElement>(
      '[data-visual-quality="low"]',
    )!;
    const high = control.element.querySelector<HTMLButtonElement>(
      '[data-visual-quality="high"]',
    )!;

    expect(low.getAttribute('aria-pressed')).toBe('true');
    expect(high.getAttribute('aria-pressed')).toBe('false');
    high.click();
    expect(preference.get()).toBe('high');
    expect(apply).toHaveBeenCalledWith('high');
    expect(high.getAttribute('aria-pressed')).toBe('true');

    control.dispose();
    low.click();
    expect(preference.get()).toBe('high');
  });
});
```

- [ ] **Step 6: Run control tests and verify the missing module failure**

Run: `npm test -- tests/VisualQualityControl.test.ts`

Expected: FAIL because `src/ui/VisualQualityControl.ts` does not exist.

- [ ] **Step 7: Implement the owned control**

```ts
// src/ui/VisualQualityControl.ts
import {
  type VisualQuality,
  type VisualQualityPreference,
} from '../rendering/visualQuality';

export class VisualQualityControl {
  readonly element = document.createElement('fieldset');
  private readonly buttons: readonly HTMLButtonElement[];
  private disposed = false;

  constructor(private readonly preference: VisualQualityPreference) {
    this.element.className = 'visual-quality-control';
    this.element.innerHTML = `
      <legend class="ui-role-context">VISUAL QUALITY</legend>
      <div class="visual-quality-control__choices">
        <button type="button" data-visual-quality="low">LOW</button>
        <button type="button" data-visual-quality="high">HIGH</button>
      </div>
      <p class="ui-role-narrative">High sharpens contact depth.</p>
    `;
    this.buttons = [
      ...this.element.querySelectorAll<HTMLButtonElement>('[data-visual-quality]'),
    ];
    this.element.addEventListener('click', this.handleClick);
    this.sync();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.element.removeEventListener('click', this.handleClick);
    this.element.remove();
  }

  private readonly handleClick = (event: Event): void => {
    const button = (event.target as Element | null)?.closest<HTMLButtonElement>(
      '[data-visual-quality]',
    );
    const value = button?.dataset.visualQuality;
    if (value !== 'low' && value !== 'high') return;
    this.preference.set(value);
    this.sync();
  };

  private sync(): void {
    const selected = this.preference.get();
    this.buttons.forEach((button) => {
      const active = button.dataset.visualQuality === selected;
      button.setAttribute('aria-pressed', String(active));
      button.classList.toggle('is-selected', active);
    });
  }
}
```

- [ ] **Step 8: Run both focused tests**

Run: `npm test -- tests/visualQuality.test.ts tests/VisualQualityControl.test.ts`

Expected: PASS.

- [ ] **Step 9: Commit Task 1**

```powershell
git add -- src/rendering/visualQuality.ts src/ui/VisualQualityControl.ts tests/visualQuality.test.ts tests/VisualQualityControl.test.ts
git diff --cached --check
git commit -m "feat: add visual quality preference"
```

### Task 2: Quality-scaled selective ambient occlusion

**Files:**
- Modify: `src/rendering/ItemAmbientOcclusion.ts`
- Modify: `tests/ItemAmbientOcclusion.test.ts`

**Interfaces:**
- Consumes: `VisualQuality`
- Produces: `ItemAmbientOcclusionPass.setVisualQuality(value: VisualQuality): void`
- Produces: internal AO target scale `0.5` for Low and `1` for High

- [ ] **Step 1: Add failing AO quality tests**

```ts
it('uses half-resolution eight-sample AO for low quality', () => {
  const pass = new ItemAmbientOcclusionPass('composite', 'low');
  pass.setSize(800, 450);
  expect(pass.gtaoRenderTarget.width).toBe(400);
  expect(pass.gtaoRenderTarget.height).toBe(225);
  expect(pass.gtaoMaterial.defines.SAMPLES).toBe(8);
  expect(pass.pdMaterial.defines.SAMPLES).toBe(8);
  pass.dispose();
});

it('reconfigures existing targets for high quality without replacing the pass', () => {
  const pass = new ItemAmbientOcclusionPass('composite', 'low');
  pass.setSize(800, 450);
  const target = pass.gtaoRenderTarget;
  pass.setVisualQuality('high');
  expect(pass.gtaoRenderTarget).toBe(target);
  expect(target.width).toBe(800);
  expect(target.height).toBe(450);
  expect(pass.gtaoMaterial.defines.SAMPLES).toBe(16);
  expect(pass.pdMaterial.defines.SAMPLES).toBe(16);
  pass.dispose();
});
```

- [ ] **Step 2: Run the AO tests and verify constructor/signature failures**

Run: `npm test -- tests/ItemAmbientOcclusion.test.ts`

Expected: FAIL because quality configuration and `setVisualQuality` do not exist.

- [ ] **Step 3: Implement static quality profiles and scaled sizing**

```ts
import type { VisualQuality } from './visualQuality';

const AO_QUALITY = {
  low: {
    resolutionScale: 0.5,
    gtaoSamples: 8,
    denoiseRings: 1,
    denoiseSamples: 8,
  },
  high: {
    resolutionScale: 1,
    gtaoSamples: 16,
    denoiseRings: 2,
    denoiseSamples: 16,
  },
} as const;

// In ItemAmbientOcclusionPass:
private visualQuality: VisualQuality;
private fullWidth = 1;
private fullHeight = 1;

constructor(
  mode: ItemAmbientOcclusionMode = 'composite',
  quality: VisualQuality = 'low',
) {
  super(new Scene(), new PerspectiveCamera());
  this.visualQuality = quality;
  // Keep the existing radius, thickness, falloff, and blend intensity.
  this.applyVisualQuality();
  this.setMode(mode);
}

setVisualQuality(value: VisualQuality): void {
  if (value === this.visualQuality) return;
  this.visualQuality = value;
  this.applyVisualQuality();
  this.resizeInternalTargets();
}

override setSize(width: number, height: number): void {
  this.fullWidth = width;
  this.fullHeight = height;
  this.resizeInternalTargets();
}

private applyVisualQuality(): void {
  const quality = AO_QUALITY[this.visualQuality];
  this.updateGtaoMaterial({ samples: quality.gtaoSamples });
  this.updatePdMaterial({
    radius: 4,
    radiusExponent: 2,
    rings: quality.denoiseRings,
    samples: quality.denoiseSamples,
    lumaPhi: 10,
    depthPhi: 2,
    normalPhi: 3,
  });
}

private resizeInternalTargets(): void {
  const scale = AO_QUALITY[this.visualQuality].resolutionScale;
  super.setSize(
    Math.max(1, Math.floor(this.fullWidth * scale)),
    Math.max(1, Math.floor(this.fullHeight * scale)),
  );
}
```

- [ ] **Step 4: Run AO tests**

Run: `npm test -- tests/ItemAmbientOcclusion.test.ts`

Expected: PASS, including the existing layer, debug-mode, and disposal tests.

- [ ] **Step 5: Commit Task 2**

```powershell
git add -- src/rendering/ItemAmbientOcclusion.ts tests/ItemAmbientOcclusion.test.ts
git diff --cached --check
git commit -m "perf: scale selective ambient occlusion"
```

### Task 3: Consolidated composer and restrained print shader

**Files:**
- Modify: `src/rendering/PostProcessingPipeline.ts`
- Modify: `src/rendering/PrintShader.ts`
- Modify: `src/rendering/SceneRenderer.ts`
- Modify: `tests/PostProcessingPipeline.test.ts`
- Modify: `tests/SceneRenderer.test.ts`

**Interfaces:**
- Consumes: `VisualQuality`
- Produces: `SceneRenderer.setVisualQuality?(value: VisualQuality): void`
- Produces: `createSceneRenderer(renderer, quality, createPipeline?, reportFallback?): SceneRenderer`
- Pass order: render, optional AO, outline, print, output

- [ ] **Step 1: Extend pipeline mocks and write failing pass-order/quality tests**

Add `OutlinePass` and `ItemAmbientOcclusionPass` mocks to
`tests/PostProcessingPipeline.test.ts`, then assert:

```ts
it('builds the consolidated pass order and retains hover targets', () => {
  const pipeline = new PostProcessingPipeline(createRenderer(), 'low');
  const composer = postProcessingMocks.composers[0]!;
  expect(composer.addPass.mock.calls.map(([pass]) => pass.constructor.name))
    .toEqual([
      'RenderPass',
      'ItemAmbientOcclusionPass',
      'OutlinePass',
      'ShaderPass',
      'OutputPass',
    ]);

  const scene = new Scene();
  const camera = new PerspectiveCamera();
  pipeline.render(scene, camera, {
    kind: 'scavenge',
    elapsedSeconds: 0,
    sinkingProgress: 0,
  });
  expect(postProcessingMocks.outlinePasses[0]?.renderScene).toBe(scene);
  expect(postProcessingMocks.outlinePasses[0]?.renderCamera).toBe(camera);
});

it('changes only AO quality at runtime', () => {
  const pipeline = new PostProcessingPipeline(createRenderer(), 'low');
  pipeline.setVisualQuality('high');
  expect(postProcessingMocks.aoPasses[0]?.setVisualQuality)
    .toHaveBeenCalledWith('high');
  expect(postProcessingMocks.printPasses).toHaveLength(1);
  expect(postProcessingMocks.composers).toHaveLength(1);
});
```

- [ ] **Step 2: Write failing shader and progressive-fallback tests**

```ts
it('samples scene color once and omits chromatic aberration', () => {
  expect(PrintShader.fragmentShader.match(/texture2D\\(tDiffuse/g)).toHaveLength(1);
  expect(PrintShader.fragmentShader).not.toContain('uChromaticAberration');
});

it('keeps grade and outline when AO construction fails', () => {
  const failure = new Error('ao unavailable');
  const reportAoFallback = vi.fn();
  const pipeline = new PostProcessingPipeline(
    createRenderer(),
    'low',
    () => { throw failure; },
    reportAoFallback,
  );
  expect(reportAoFallback).toHaveBeenCalledWith(failure);
  expect(postProcessingMocks.composers[0]?.addPass).toHaveBeenCalledTimes(4);
  pipeline.dispose();
});

it('disables AO but keeps rendering when quality reconfiguration fails', () => {
  const failure = new Error('ao resize unavailable');
  const reportAoFallback = vi.fn();
  const failingAoPass = {
    enabled: true,
    setVisualQuality: vi.fn(() => { throw failure; }),
  } as unknown as ItemAmbientOcclusionPass;
  const pipeline = new PostProcessingPipeline(
    createRenderer(),
    'low',
    () => failingAoPass,
    reportAoFallback,
  );

  expect(() => pipeline.setVisualQuality('high')).not.toThrow();
  expect(reportAoFallback).toHaveBeenCalledWith(failure);
  expect(failingAoPass.enabled).toBe(false);
});
```

- [ ] **Step 3: Run pipeline tests and confirm failures**

Run: `npm test -- tests/PostProcessingPipeline.test.ts tests/SceneRenderer.test.ts`

Expected: FAIL because the dormant pipeline lacks outline/quality/fallback and
the direct renderer still owns a second composer.

- [ ] **Step 4: Simplify `DirectSceneRenderer` to the terminal fallback**

```ts
export interface SceneRenderer {
  render(scene: Scene, camera: Camera, state: Readonly<SceneVisualState>): void;
  resize(width: number, height: number, pixelRatio: number): void;
  setVisualQuality?(value: VisualQuality): void;
  dispose(): void;
}

export class DirectSceneRenderer implements SceneRenderer {
  private disposed = false;

  constructor(private readonly renderer: WebGLRenderer) {}

  render(scene: Scene, camera: Camera): void {
    if (!this.disposed) this.renderer.render(scene, camera);
  }

  resize(): void {}
  setVisualQuality(): void {}

  dispose(): void {
    this.disposed = true;
  }
}
```

Rewrite `tests/SceneRenderer.test.ts` to verify direct rendering before disposal,
no rendering after disposal, and harmless resize/quality calls. AO debug and
outline assertions move to `PostProcessingPipeline.test.ts`.

- [ ] **Step 5: Add outline, quality, optional AO, and debug ownership to the pipeline**

In `PostProcessingPipeline`:

- accept initial quality;
- construct one configured `OutlinePass`;
- attempt AO construction independently and report failure without abandoning
  the remaining composer;
- register the existing `KeyO` AO comparison control only when AO exists;
- support a developer grade-off comparison using `?grade=off` and `KeyP`;
- update outline scene, camera, and selected objects during `render`;
- forward quality changes to the existing AO pass; if reconfiguration throws,
  report the failure, disable that pass, and retain outline/grading/output;
- resize the composer once; let its pass sizing call scale AO internally;
- remove every registered key listener and dispose each constructed pass once.

Use these fixed outline values from the current direct path:

```ts
outlinePass.visibleEdgeColor.setHex(0xffffff);
outlinePass.hiddenEdgeColor.setHex(0x000000);
outlinePass.edgeStrength = 5;
outlinePass.edgeThickness = 4;
outlinePass.edgeGlow = 0;
outlinePass.downSampleRatio = 2;
```

Construct the main composer target as standard 8-bit:

```ts
const target = new WebGLRenderTarget(width, height);
target.texture.name = 'illustrated-post-composer';
target.samples = 0;
```

- [ ] **Step 6: Remove chromatic aberration from shader and profiles**

Delete `uChromaticAberrationCssPixels` from `PrintShader`,
`PrintUniforms`, `PostProcessingProfile`, every profile, and `applyProfile`.
Replace the three-channel offset sampling with:

```glsl
vec3 color = texture2D(tDiffuse, vUv).rgb;
```

Retain existing highlight compression, pivoted contrast, shadow lift,
saturation, split-toning, posterior color quantization, ink frame, midtone
halftone, vignette, and quantized grain.

- [ ] **Step 7: Implement factory fallback**

```ts
export function createSceneRenderer(
  renderer: WebGLRenderer,
  quality: VisualQuality = 'low',
  createPipeline: PipelineFactory =
    (value, initialQuality) => new PostProcessingPipeline(value, initialQuality),
  reportFallback: FallbackReporter = (error) => {
    console.warn('Post-processing unavailable; using direct scene rendering.', error);
  },
): SceneRenderer {
  try {
    return createPipeline(renderer, quality);
  } catch (error) {
    reportFallback(error);
    return new DirectSceneRenderer(renderer);
  }
}
```

- [ ] **Step 8: Run focused renderer tests**

Run: `npm test -- tests/PostProcessingPipeline.test.ts tests/SceneRenderer.test.ts tests/ItemAmbientOcclusion.test.ts tests/HoverOutline.test.ts`

Expected: PASS.

- [ ] **Step 9: Commit Task 3**

```powershell
git add -- src/rendering/PostProcessingPipeline.ts src/rendering/PrintShader.ts src/rendering/SceneRenderer.ts tests/PostProcessingPipeline.test.ts tests/SceneRenderer.test.ts
git diff --cached --check
git commit -m "feat: consolidate illustrated post processing"
```

### Task 4: Production preference wiring and pause controls

**Files:**
- Modify: `src/Game.ts`
- Modify: `src/app/GamePhase.ts`
- Modify: `src/phases/ScavengePhase.ts`
- Modify: `src/survival/SurvivalPhase.ts`
- Modify: `src/ui/GameUI.ts`
- Modify: `src/ui/SurvivalUI.ts`
- Modify: `src/styles/main.css`
- Modify: `tests/GameConstruction.test.ts`
- Modify: `tests/GameLifecycle.test.ts`
- Modify: `tests/GameUI.test.ts`
- Modify: `tests/SurvivalUI.test.ts`

**Interfaces:**
- Consumes: `VisualQualityPreference`, `VisualQualityControl`
- `PhaseContext.visualQuality` is the shared `VisualQualityPreference`
- Each UI owns and disposes one `VisualQualityControl`

- [ ] **Step 1: Write failing production-construction and persistence tests**

Update the renderer mock in `tests/GameConstruction.test.ts` and mock
`createSceneRenderer`. Assert that `Game`:

```ts
expect(createSceneRenderer).toHaveBeenCalledWith(renderer, 'low');
```

Add a `GameLifecycle` test with a supplied preference and scene renderer:

```ts
const setVisualQuality = vi.fn();
const sceneRenderer: SceneRenderer = {
  render: vi.fn(),
  resize: vi.fn(),
  setVisualQuality,
  dispose: vi.fn(),
};
const preference = createVisualQualityPreference(
  (quality) => sceneRenderer.setVisualQuality?.(quality),
  null,
);
// Construct Game.forTest with preference, then:
preference.set('high');
expect(setVisualQuality).toHaveBeenCalledWith('high');
```

- [ ] **Step 2: Write failing UI integration tests**

In `tests/GameUI.test.ts` and `tests/SurvivalUI.test.ts`, construct the UI with a
memory preference and assert:

```ts
const preference = createVisualQualityPreference(apply, null);
const ui = new GameUI(mount, preference); // SurvivalUI for the parallel test.
const high = mount.querySelector<HTMLButtonElement>(
  '[data-visual-quality="high"]',
)!;
high.click();
expect(preference.get()).toBe('high');
expect(apply).toHaveBeenCalledWith('high');
expect(mount.querySelector('[data-visual-quality-control]'))
  .not.toBeNull();
ui.dispose();
high.click();
expect(apply).toHaveBeenCalledOnce();
```

Also verify the pause control appears inside `[data-pause]`, not the HUD, start
screen, journal, or ending overlay.

- [ ] **Step 3: Run integration tests and confirm failures**

Run: `npm test -- tests/GameConstruction.test.ts tests/GameLifecycle.test.ts tests/GameUI.test.ts tests/SurvivalUI.test.ts`

Expected: FAIL because production still selects `DirectSceneRenderer`, context
lacks the preference, and pause UIs lack the control.

- [ ] **Step 4: Wire one preference through `Game` and `PhaseContext`**

Add to `PhaseContext`:

```ts
visualQuality: VisualQualityPreference;
```

In the production `Game` constructor:

```ts
let sceneRenderer: SceneRenderer | null = null;
const visualQuality = createVisualQualityPreference((quality) => {
  sceneRenderer?.setVisualQuality?.(quality);
});
sceneRenderer = createSceneRenderer(renderer, visualQuality.get());
```

Pass `visualQuality` into `initialize` and store it on `this.context`.
Add `visualQuality?: VisualQualityPreference` to `GameTestOptions`; use an
in-memory Low preference when omitted. Do not read or write storage in
`Game.forTest`.

- [ ] **Step 5: Mount and dispose the control in both phase UIs**

Change both constructors to accept a preference, with an in-memory Low default
for direct unit construction:

```ts
constructor(
  mount: HTMLElement,
  visualQuality = createVisualQualityPreference(() => undefined, null),
) {
  // Existing DOM creation.
  const host = requireElement(this.root, '[data-visual-quality-control]');
  this.visualQualityControl = new VisualQualityControl(visualQuality);
  host.append(this.visualQualityControl.element);
}
```

Add this host between pause explanatory copy and Resume:

```html
<div data-visual-quality-control></div>
```

Dispose the control before removing each UI root. In production constructors:

```ts
new GameUI(context.mount, context.visualQuality)
new SurvivalUI(context.mount, context.visualQuality)
```

- [ ] **Step 6: Add restrained control styling**

Add CSS with the existing ink, timber, and focus vocabulary:

```css
.visual-quality-control {
  display: grid;
  justify-items: center;
  gap: 8px;
  min-width: min(320px, calc(100vw - 64px));
  padding: 12px 18px;
  border: 1px solid #8d817066;
  color: var(--ink-bone);
  background: #11191ec7;
}
.visual-quality-control legend {
  padding: 0 8px;
  color: var(--ink-faded);
  letter-spacing: .14em;
}
.visual-quality-control__choices {
  display: grid;
  grid-template-columns: repeat(2, minmax(92px, 1fr));
  gap: 6px;
  width: 100%;
}
.visual-quality-control button {
  padding: 9px 14px;
  border: 1px solid #8d8170;
  color: var(--ink-bone);
  background: #202d31;
  font: 700 .72rem/1 var(--font-context);
  letter-spacing: .12em;
  cursor: pointer;
}
.visual-quality-control button.is-selected {
  border-color: var(--ink-yellow);
  background: #563329;
  box-shadow: inset 0 -3px #d4a83d;
}
.visual-quality-control button:focus-visible {
  outline: 3px solid var(--ink-yellow);
  outline-offset: 3px;
}
.visual-quality-control p {
  margin: 0;
  color: var(--ink-faded);
  font-size: .72rem;
}
```

Keep short-height pause content scrollable through the existing
`.screen__content` and cinematic overlay rules.

- [ ] **Step 7: Run UI and lifecycle tests**

Run: `npm test -- tests/GameConstruction.test.ts tests/GameLifecycle.test.ts tests/GameUI.test.ts tests/SurvivalUI.test.ts tests/SurvivalPhase.test.ts`

Expected: PASS.

- [ ] **Step 8: Commit Task 4 without staging pre-existing UI edits**

Inspect `git diff` first. Use `git add -p` for
`src/ui/GameUI.ts`, `src/ui/SurvivalUI.ts`, `src/styles/main.css`, and any other
file that was dirty before this task. Split hunks and stage only visual-quality
changes; if a hunk cannot be split safely, leave the task uncommitted rather
than including unrelated work.

```powershell
git add -- src/Game.ts src/app/GamePhase.ts src/phases/ScavengePhase.ts src/survival/SurvivalPhase.ts tests/GameConstruction.test.ts tests/GameLifecycle.test.ts tests/GameUI.test.ts tests/SurvivalUI.test.ts
git add -p -- src/ui/GameUI.ts src/ui/SurvivalUI.ts src/styles/main.css
git diff --cached --check
git diff --cached --name-only
git commit -m "feat: expose visual quality controls"
```

### Task 5: Full verification and visual/performance acceptance

**Files:**
- Verify only; fix failures in the owning task's files.

**Interfaces:**
- Consumes the completed production pipeline and quality preference.
- Produces verification evidence; no new runtime subsystem.

- [ ] **Step 1: Run static verification**

Run: `npm run typecheck`

Expected: PASS with no TypeScript diagnostics.

- [ ] **Step 2: Run the complete test suite**

Run: `npm test`

Expected: all Vitest files PASS. Existing unrelated failures must be reported
separately and not hidden by changing feature expectations.

- [ ] **Step 3: Build production output**

Run: `npm run build`

Expected: TypeScript and Vite production build PASS.

- [ ] **Step 4: Inspect production rendering at fixed scenes**

Run: `npm run dev -- --host 127.0.0.1`

At 1280x720 and 1920x1080, compare:

- scavenge;
- calm day;
- overcast;
- squall;
- night;
- `?grade=off`;
- `?ao=off`;
- `?ao=debug`;
- Low and High.

Expected: no crushed deck detail, clipped sky/water highlights, ocean or sky
banding, AO halos, water/glass AO, outline loss, or HUD darkening.

- [ ] **Step 5: Record performance acceptance**

On the selected integrated-laptop machine at 1920x1080, record median and
95th-percentile frame time for direct/grade-off comparison and Low in the same
fixed scenes.

Expected: Low sustains 60 FPS and adds no more than approximately 20 percent GPU
frame time. If it misses, reduce Low AO scale or sampling in
`ItemAmbientOcclusion.ts`; do not weaken the shared color grade first.

- [ ] **Step 6: Final diff and ownership audit**

Run:

```powershell
git diff --check
git status --short
rg -n "new (WebGLRenderTarget|ItemAmbientOcclusionPass|OutlinePass|ShaderPass)" src/rendering
```

Confirm:

- all newly owned passes, targets, textures, controls, and listeners have one
  idempotent disposal path;
- no quality/profile object is allocated inside `render`;
- staged commits contain no pre-existing user changes;
- the unrelated dirty worktree remains intact.

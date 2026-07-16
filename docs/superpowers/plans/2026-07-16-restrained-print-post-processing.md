# Restrained Print Post-Processing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render both game phases through a shared, phase-aware print-horror post-processing pipeline while keeping items, custom atmosphere, and HTML UI readable.

**Architecture:** `Game` owns one `SceneRenderer` for its lifetime and supplies it through `PhaseContext`. Production uses an `EffectComposer` with a render pass, one custom print-grade shader, and an output pass; construction failure falls back to direct `WebGLRenderer.render`. Each phase reuses one mutable visual-state object so the pipeline can select frozen profiles without frame-loop allocation.

**Tech Stack:** TypeScript 5.9, Three.js 0.180 (`three/addons` post-processing modules), Vitest 3.2, Vite 7.1, Bun.

## Global Constraints

- Keep the default effect at the approved restrained intensity.
- Apply post-processing only to the WebGL scene; keep HTML UI, focus indicators, projected controls, dialogs, live regions, and the crosshair outside the composer.
- Add no package, remote request, downloaded texture, lookup texture, or third-party asset.
- Add no bloom, depth of field, motion blur, screen-space ambient occlusion, full-screen blur, flashes, or camera distortion.
- Define halftone size and chromatic separation in CSS-screen pixels.
- Freeze grain under `prefers-reduced-motion: reduce`.
- Preserve direct rendering when composer construction fails.
- Preserve the existing device-pixel-ratio cap of `2` and cap multisampling at `4` samples.
- Preserve `Game`'s first-cleanup-error behavior while continuing all later cleanup steps.
- Browser verification must cover 1280x720 and 1920x1080 in scavenging and survival.
- Run `bun run models:check`, `bun run test`, `bun run typecheck`, and `bun run build` before completion.

## File Map

- Create `src/rendering/SceneRenderer.ts`: render-state unions, renderer contract, and direct-render fallback implementation.
- Create `src/rendering/postProcessingProfiles.ts`: frozen profile constants and pure state-to-profile helpers.
- Create `src/rendering/PrintShader.ts`: the custom full-screen shader and its uniform defaults.
- Create `src/rendering/PostProcessingPipeline.ts`: composer, render target, pass, uniform, fallback-factory, resize, and disposal ownership.
- Modify `src/app/GamePhase.ts`: add `sceneRenderer` to `PhaseContext`.
- Modify `src/Game.ts`: create, inject, resize, and dispose the shared scene renderer.
- Modify `src/phases/ScavengePhase.ts`: report elapsed time and sinking progress to the scene renderer.
- Modify `src/survival/SurvivalPhase.ts`: report elapsed time, day/night, and weather to the scene renderer.
- Modify `src/styles/main.css`: reduce the normal CSS vignette while preserving critical-state edge pressure.
- Create `tests/postProcessingProfiles.test.ts`: profile, clamp, and reduced-motion behavior.
- Create `tests/PostProcessingPipeline.test.ts`: direct renderer and construction fallback behavior plus shader screen-space contract.
- Modify `tests/GameLifecycle.test.ts`: shared ownership, resize, cleanup order, and cleanup failure behavior.
- Modify `tests/SurvivalPhase.test.ts`: survival render-state reporting.
- Create `tests/PostProcessingPresentation.test.ts`: no remote resources or dependency changes and no doubled normal vignette.

---

### Task 1: Define the scene-renderer contract and frozen phase profiles

**Files:**
- Create: `src/rendering/SceneRenderer.ts`
- Create: `src/rendering/postProcessingProfiles.ts`
- Create: `tests/postProcessingProfiles.test.ts`

**Interfaces:**
- Consumes: `WeatherId` from `src/survival/survivalTypes.ts`.
- Produces: `SceneRenderer`, `SceneVisualState`, `ScavengeVisualState`, `SurvivalVisualState`, `DirectSceneRenderer`, `PostProcessingProfile`, `selectPostProcessingProfile`, `clampPostProcessingValue`, `resolveVignetteStrength`, and `resolveGrainTime`.

- [ ] **Step 1: Write the failing profile tests**

Create `tests/postProcessingProfiles.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { SceneVisualState } from '../src/rendering/SceneRenderer';
import {
  clampPostProcessingValue,
  resolveGrainTime,
  resolveVignetteStrength,
  selectPostProcessingProfile,
} from '../src/rendering/postProcessingProfiles';

function survival(
  phase: 'day' | 'night',
  weather: 'calm' | 'overcast' | 'squall',
): SceneVisualState {
  return {
    kind: 'survival',
    elapsedSeconds: 12.75,
    phase,
    weather,
    reducedMotion: false,
  };
}

describe('post-processing profiles', () => {
  it.each([
    [{ kind: 'scavenge', elapsedSeconds: 4, sinkingProgress: 0, reducedMotion: false }, 'scavenge'],
    [survival('day', 'calm'), 'survival-day-calm'],
    [survival('day', 'overcast'), 'survival-day-overcast'],
    [survival('day', 'squall'), 'survival-day-squall'],
    [survival('night', 'calm'), 'survival-night-calm'],
    [survival('night', 'overcast'), 'survival-night-overcast'],
    [survival('night', 'squall'), 'survival-night-squall'],
  ] as const)('selects %s as %s', (state, id) => {
    const profile = selectPostProcessingProfile(state);
    expect(profile.id).toBe(id);
    expect(Object.isFrozen(profile)).toBe(true);
    expect(profile.halftoneSizeCssPixels).toBeGreaterThanOrEqual(4);
    expect(profile.chromaticAberrationCssPixels).toBeLessThan(1);
  });

  it('clamps sinking progress before increasing only vignette strength', () => {
    const base = selectPostProcessingProfile({
      kind: 'scavenge', elapsedSeconds: 0, sinkingProgress: 0, reducedMotion: false,
    });
    expect(resolveVignetteStrength({
      kind: 'scavenge', elapsedSeconds: 0, sinkingProgress: -5, reducedMotion: false,
    }, base)).toBe(base.vignetteStrength);
    expect(resolveVignetteStrength({
      kind: 'scavenge', elapsedSeconds: 0, sinkingProgress: 2, reducedMotion: false,
    }, base)).toBeCloseTo(base.vignetteStrength + 0.08);
    expect(resolveVignetteStrength({
      kind: 'scavenge', elapsedSeconds: 0, sinkingProgress: Number.NaN, reducedMotion: false,
    }, base)).toBe(base.vignetteStrength);
  });

  it('quantizes animated grain and freezes reduced-motion grain at zero', () => {
    expect(resolveGrainTime({
      kind: 'survival', elapsedSeconds: 1.24, phase: 'day', weather: 'calm', reducedMotion: false,
    })).toBe(1.125);
    expect(resolveGrainTime({
      kind: 'survival', elapsedSeconds: 99, phase: 'night', weather: 'squall', reducedMotion: true,
    })).toBe(0);
    expect(resolveGrainTime({
      kind: 'scavenge', elapsedSeconds: Number.POSITIVE_INFINITY,
      sinkingProgress: 0, reducedMotion: false,
    })).toBe(0);
  });

  it('lifts night shadows more than the calm day profile', () => {
    expect(selectPostProcessingProfile(survival('night', 'calm')).shadowLift)
      .toBeGreaterThan(selectPostProcessingProfile(survival('day', 'calm')).shadowLift);
  });

  it('clamps finite and non-finite shader values to documented bounds', () => {
    expect(clampPostProcessingValue(-2, 0, 1, 0.5)).toBe(0);
    expect(clampPostProcessingValue(2, 0, 1, 0.5)).toBe(1);
    expect(clampPostProcessingValue(Number.NaN, 0, 1, 0.5)).toBe(0.5);
  });
});
```

- [ ] **Step 2: Run the test and verify the missing modules fail**

Run: `bun run test -- tests/postProcessingProfiles.test.ts`

Expected: FAIL because `src/rendering/SceneRenderer.ts` and `src/rendering/postProcessingProfiles.ts` do not exist.

- [ ] **Step 3: Add the scene-renderer contract and direct implementation**

Create `src/rendering/SceneRenderer.ts`:

```ts
import type { Camera, Scene, WebGLRenderer } from 'three';
import type { WeatherId } from '../survival/survivalTypes';

export interface ScavengeVisualState {
  kind: 'scavenge';
  elapsedSeconds: number;
  sinkingProgress: number;
  reducedMotion: boolean;
}

export interface SurvivalVisualState {
  kind: 'survival';
  elapsedSeconds: number;
  phase: 'day' | 'night';
  weather: WeatherId;
  reducedMotion: boolean;
}

export type SceneVisualState = ScavengeVisualState | SurvivalVisualState;

export interface SceneRenderer {
  render(scene: Scene, camera: Camera, state: Readonly<SceneVisualState>): void;
  resize(width: number, height: number, pixelRatio: number): void;
  dispose(): void;
}

export class DirectSceneRenderer implements SceneRenderer {
  private disposed = false;

  constructor(private readonly renderer: WebGLRenderer) {}

  render(scene: Scene, camera: Camera): void {
    if (this.disposed) return;
    this.renderer.render(scene, camera);
  }

  resize(_width: number, _height: number, _pixelRatio: number): void {}

  dispose(): void {
    this.disposed = true;
  }
}
```

- [ ] **Step 4: Add exact frozen profiles and pure bounded helpers**

Create `src/rendering/postProcessingProfiles.ts`:

```ts
import type { SceneVisualState } from './SceneRenderer';

export type PostProcessingProfileId =
  | 'scavenge'
  | 'survival-day-calm'
  | 'survival-day-overcast'
  | 'survival-day-squall'
  | 'survival-night-calm'
  | 'survival-night-overcast'
  | 'survival-night-squall';

export interface PostProcessingProfile {
  id: PostProcessingProfileId;
  contrast: number;
  saturation: number;
  highlightCompression: number;
  shadowLift: number;
  shadowTint: number;
  shadowTintStrength: number;
  highlightTint: number;
  highlightTintStrength: number;
  halftoneStrength: number;
  halftoneSizeCssPixels: number;
  vignetteStrength: number;
  chromaticAberrationCssPixels: number;
  grainStrength: number;
}

function profile(value: PostProcessingProfile): Readonly<PostProcessingProfile> {
  return Object.freeze(value);
}

const PROFILES = {
  scavenge: profile({
    id: 'scavenge', contrast: 1.06, saturation: 0.92, highlightCompression: 0.16,
    shadowLift: 0,
    shadowTint: 0x123039, shadowTintStrength: 0.08,
    highlightTint: 0xd8aa6d, highlightTintStrength: 0.035,
    halftoneStrength: 0.075, halftoneSizeCssPixels: 4.5,
    vignetteStrength: 0.22, chromaticAberrationCssPixels: 0.45, grainStrength: 0.022,
  }),
  'survival-day-calm': profile({
    id: 'survival-day-calm', contrast: 1.04, saturation: 0.93, highlightCompression: 0.14,
    shadowLift: 0,
    shadowTint: 0x18343a, shadowTintStrength: 0.06,
    highlightTint: 0xe0b879, highlightTintStrength: 0.045,
    halftoneStrength: 0.055, halftoneSizeCssPixels: 5,
    vignetteStrength: 0.18, chromaticAberrationCssPixels: 0.3, grainStrength: 0.018,
  }),
  'survival-day-overcast': profile({
    id: 'survival-day-overcast', contrast: 1.05, saturation: 0.9, highlightCompression: 0.15,
    shadowLift: 0.005,
    shadowTint: 0x17343c, shadowTintStrength: 0.085,
    highlightTint: 0xc8ad7c, highlightTintStrength: 0.03,
    halftoneStrength: 0.06, halftoneSizeCssPixels: 5,
    vignetteStrength: 0.21, chromaticAberrationCssPixels: 0.38, grainStrength: 0.023,
  }),
  'survival-day-squall': profile({
    id: 'survival-day-squall', contrast: 1.08, saturation: 0.86, highlightCompression: 0.18,
    shadowLift: 0.008,
    shadowTint: 0x0d2832, shadowTintStrength: 0.12,
    highlightTint: 0xb39c77, highlightTintStrength: 0.02,
    halftoneStrength: 0.045, halftoneSizeCssPixels: 5.5,
    vignetteStrength: 0.29, chromaticAberrationCssPixels: 0.55, grainStrength: 0.035,
  }),
  'survival-night-calm': profile({
    id: 'survival-night-calm', contrast: 1.03, saturation: 0.88, highlightCompression: 0.1,
    shadowLift: 0.025,
    shadowTint: 0x153442, shadowTintStrength: 0.1,
    highlightTint: 0xb9a477, highlightTintStrength: 0.025,
    halftoneStrength: 0.035, halftoneSizeCssPixels: 5.5,
    vignetteStrength: 0.24, chromaticAberrationCssPixels: 0.35, grainStrength: 0.024,
  }),
  'survival-night-overcast': profile({
    id: 'survival-night-overcast', contrast: 1.04, saturation: 0.85, highlightCompression: 0.11,
    shadowLift: 0.03,
    shadowTint: 0x102e3b, shadowTintStrength: 0.12,
    highlightTint: 0xa89777, highlightTintStrength: 0.018,
    halftoneStrength: 0.03, halftoneSizeCssPixels: 5.5,
    vignetteStrength: 0.27, chromaticAberrationCssPixels: 0.42, grainStrength: 0.029,
  }),
  'survival-night-squall': profile({
    id: 'survival-night-squall', contrast: 1.06, saturation: 0.82, highlightCompression: 0.13,
    shadowLift: 0.035,
    shadowTint: 0x0b2531, shadowTintStrength: 0.14,
    highlightTint: 0x97886f, highlightTintStrength: 0.012,
    halftoneStrength: 0.025, halftoneSizeCssPixels: 6,
    vignetteStrength: 0.31, chromaticAberrationCssPixels: 0.6, grainStrength: 0.04,
  }),
} as const;

function finiteOrZero(value: number): number {
  return Number.isFinite(value) ? value : 0;
}

export function clampPostProcessingValue(
  value: number,
  minimum: number,
  maximum: number,
  fallback: number,
): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(maximum, Math.max(minimum, value));
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, finiteOrZero(value)));
}

export function selectPostProcessingProfile(
  state: Readonly<SceneVisualState>,
): Readonly<PostProcessingProfile> {
  if (state.kind === 'scavenge') return PROFILES.scavenge;
  return PROFILES[`survival-${state.phase}-${state.weather}`];
}

export function resolveVignetteStrength(
  state: Readonly<SceneVisualState>,
  base: Readonly<PostProcessingProfile>,
): number {
  return clampPostProcessingValue(
    base.vignetteStrength
      + (state.kind === 'scavenge' ? clamp01(state.sinkingProgress) * 0.08 : 0),
    0,
    0.5,
    0.2,
  );
}

export function resolveGrainTime(state: Readonly<SceneVisualState>): number {
  if (state.reducedMotion) return 0;
  const seconds = clampPostProcessingValue(state.elapsedSeconds, 0, 86_400, 0);
  return Math.floor(seconds * 8) / 8;
}
```

- [ ] **Step 5: Run the focused tests**

Run: `bun run test -- tests/postProcessingProfiles.test.ts`

Expected: PASS, 1 test file and 11 tests passed.

- [ ] **Step 6: Commit the contract and profiles**

```powershell
git add -- src/rendering/SceneRenderer.ts src/rendering/postProcessingProfiles.ts tests/postProcessingProfiles.test.ts
git commit -m "feat: define post-processing profiles"
```

---

### Task 2: Build the print shader, composer, and safe fallback factory

**Files:**
- Create: `src/rendering/PrintShader.ts`
- Create: `src/rendering/PostProcessingPipeline.ts`
- Create: `tests/PostProcessingPipeline.test.ts`

**Interfaces:**
- Consumes: `SceneRenderer`, `SceneVisualState`, `DirectSceneRenderer`, and profile helpers from Task 1.
- Produces: `PrintShader`, `PostProcessingPipeline`, `createSceneRenderer(renderer, createPipeline?, reportFallback?)`.

- [ ] **Step 1: Write failing fallback and shader-contract tests**

Create `tests/PostProcessingPipeline.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import { PerspectiveCamera, Scene, type WebGLRenderer } from 'three';
import { createSceneRenderer } from '../src/rendering/PostProcessingPipeline';
import { PrintShader } from '../src/rendering/PrintShader';

describe('post-processing pipeline construction', () => {
  it('falls back to direct rendering when pipeline construction throws', () => {
    const render = vi.fn();
    const renderer = { render } as unknown as WebGLRenderer;
    const failure = new Error('composer unavailable');
    const reportFallback = vi.fn();
    const sceneRenderer = createSceneRenderer(
      renderer,
      () => { throw failure; },
      reportFallback,
    );
    const scene = new Scene();
    const camera = new PerspectiveCamera();

    sceneRenderer.render(scene, camera, {
      kind: 'scavenge', elapsedSeconds: 0, sinkingProgress: 0, reducedMotion: false,
    });

    expect(reportFallback).toHaveBeenCalledWith(failure);
    expect(render).toHaveBeenCalledWith(scene, camera);
    sceneRenderer.dispose();
    sceneRenderer.render(scene, camera, {
      kind: 'scavenge', elapsedSeconds: 1, sinkingProgress: 0, reducedMotion: false,
    });
    expect(render).toHaveBeenCalledOnce();
  });

  it('returns the constructed pipeline when setup succeeds', () => {
    const pipeline = { render: vi.fn(), resize: vi.fn(), dispose: vi.fn() };
    const renderer = {} as WebGLRenderer;
    expect(createSceneRenderer(renderer, () => pipeline, vi.fn())).toBe(pipeline);
  });

  it('defines CSS-pixel screen-space sampling without remote textures', () => {
    expect(PrintShader.uniforms.uPixelRatio.value).toBe(1);
    expect(PrintShader.fragmentShader).toContain('gl_FragCoord.xy / uPixelRatio');
    expect(PrintShader.fragmentShader).toContain('uChromaticAberrationCssPixels * uPixelRatio');
    expect(PrintShader.fragmentShader).not.toMatch(/https?:\/\//);
  });
});
```

- [ ] **Step 2: Run the test and verify the missing modules fail**

Run: `bun run test -- tests/PostProcessingPipeline.test.ts`

Expected: FAIL because `PrintShader.ts` and `PostProcessingPipeline.ts` do not exist.

- [ ] **Step 3: Add the full-screen print shader**

Create `src/rendering/PrintShader.ts`:

```ts
import { Color, Vector2 } from 'three';

export const PrintShader = {
  name: 'RestrainedPrintShader',
  uniforms: {
    tDiffuse: { value: null },
    uResolution: { value: new Vector2(1, 1) },
    uPixelRatio: { value: 1 },
    uContrast: { value: 1 },
    uSaturation: { value: 1 },
    uHighlightCompression: { value: 0 },
    uShadowLift: { value: 0 },
    uShadowTint: { value: new Color(0xffffff) },
    uShadowTintStrength: { value: 0 },
    uHighlightTint: { value: new Color(0xffffff) },
    uHighlightTintStrength: { value: 0 },
    uHalftoneStrength: { value: 0 },
    uHalftoneSizeCssPixels: { value: 5 },
    uVignetteStrength: { value: 0 },
    uChromaticAberrationCssPixels: { value: 0 },
    uGrainStrength: { value: 0 },
    uGrainTime: { value: 0 },
  },
  vertexShader: /* glsl */`
    varying vec2 vUv;

    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse;
    uniform vec2 uResolution;
    uniform float uPixelRatio;
    uniform float uContrast;
    uniform float uSaturation;
    uniform float uHighlightCompression;
    uniform float uShadowLift;
    uniform vec3 uShadowTint;
    uniform float uShadowTintStrength;
    uniform vec3 uHighlightTint;
    uniform float uHighlightTintStrength;
    uniform float uHalftoneStrength;
    uniform float uHalftoneSizeCssPixels;
    uniform float uVignetteStrength;
    uniform float uChromaticAberrationCssPixels;
    uniform float uGrainStrength;
    uniform float uGrainTime;
    varying vec2 vUv;

    float luminance(vec3 color) {
      return dot(color, vec3(0.2126, 0.7152, 0.0722));
    }

    float hash21(vec2 point) {
      vec3 p3 = fract(vec3(point.xyx) * 0.1031);
      p3 += dot(p3, p3.yzx + 33.33);
      return fract((p3.x + p3.y) * p3.z);
    }

    void main() {
      vec2 centered = vUv - 0.5;
      float edgeDistance = length(centered * vec2(1.0, 1.25));
      float edgeMask = smoothstep(0.38, 0.72, edgeDistance);
      vec2 edgeDirection = normalize(centered + vec2(0.00001));
      vec2 colorOffset = edgeDirection
        * edgeMask
        * ((uChromaticAberrationCssPixels * uPixelRatio) / uResolution);

      vec3 color;
      color.r = texture2D(tDiffuse, vUv + colorOffset).r;
      color.g = texture2D(tDiffuse, vUv).g;
      color.b = texture2D(tDiffuse, vUv - colorOffset).b;

      color = color / (vec3(1.0) + color * uHighlightCompression);
      color = max((color - vec3(0.18)) * uContrast + vec3(0.18), vec3(0.0));
      float liftWeight = 1.0 - smoothstep(0.02, 0.38, luminance(color));
      color += vec3(uShadowLift * liftWeight);

      float gray = luminance(color);
      color = mix(vec3(gray), color, uSaturation);
      float shadowWeight = 1.0 - smoothstep(0.12, 0.52, gray);
      float highlightWeight = smoothstep(0.38, 0.9, gray);
      color = mix(
        color,
        color * (vec3(0.65) + uShadowTint),
        shadowWeight * uShadowTintStrength
      );
      color = mix(
        color,
        color * (vec3(0.65) + uHighlightTint),
        highlightWeight * uHighlightTintStrength
      );

      vec2 cssPixel = gl_FragCoord.xy / uPixelRatio;
      vec2 cell = fract(cssPixel / max(2.0, uHalftoneSizeCssPixels)) - 0.5;
      float dotInk = 1.0 - smoothstep(0.2, 0.42, length(cell));
      float midtone = smoothstep(0.1, 0.34, gray) * (1.0 - smoothstep(0.66, 0.92, gray));
      float centerRelief = mix(0.35, 1.0, smoothstep(0.12, 0.58, edgeDistance));
      color *= 1.0 - dotInk * midtone * centerRelief * uHalftoneStrength;

      float vignette = smoothstep(0.42, 0.78, edgeDistance);
      color *= 1.0 - vignette * uVignetteStrength;

      float grain = hash21(floor(cssPixel) + vec2(uGrainTime * 37.0, uGrainTime * 17.0)) - 0.5;
      color += vec3(grain * uGrainStrength);

      gl_FragColor = vec4(max(color, vec3(0.0)), 1.0);
    }
  `,
} as const;
```

- [ ] **Step 4: Add the composer and fallback factory**

Create `src/rendering/PostProcessingPipeline.ts`:

```ts
import {
  Camera,
  HalfFloatType,
  Scene,
  Vector2,
  WebGLRenderTarget,
  type WebGLRenderer,
} from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { PrintShader } from './PrintShader';
import {
  DirectSceneRenderer,
  type SceneRenderer,
  type SceneVisualState,
} from './SceneRenderer';
import {
  clampPostProcessingValue,
  resolveGrainTime,
  resolveVignetteStrength,
  selectPostProcessingProfile,
  type PostProcessingProfile,
} from './postProcessingProfiles';

type PrintUniforms = typeof PrintShader.uniforms;
type PipelineFactory = (renderer: WebGLRenderer) => SceneRenderer;
type FallbackReporter = (error: unknown) => void;

export class PostProcessingPipeline implements SceneRenderer {
  private readonly composer: EffectComposer;
  private readonly renderPass: RenderPass;
  private readonly printPass: ShaderPass;
  private readonly outputPass: OutputPass;
  private readonly uniforms: PrintUniforms;
  private readonly size = new Vector2();
  private disposed = false;

  constructor(private readonly renderer: WebGLRenderer) {
    renderer.getSize(this.size);
    const target = new WebGLRenderTarget(
      Math.max(1, this.size.x),
      Math.max(1, this.size.y),
      { type: HalfFloatType },
    );
    target.texture.name = 'restrained-print-composer';
    target.samples = Math.min(4, Math.max(0, renderer.capabilities.maxSamples ?? 0));

    let composer!: EffectComposer;
    let renderPass!: RenderPass;
    let printPass!: ShaderPass;
    let outputPass!: OutputPass;
    try {
      composer = new EffectComposer(renderer, target);
      renderPass = new RenderPass(new Scene(), new Camera());
      printPass = new ShaderPass(PrintShader);
      outputPass = new OutputPass();
      composer.addPass(renderPass);
      composer.addPass(printPass);
      composer.addPass(outputPass);
    } catch (error) {
      printPass?.dispose();
      outputPass?.dispose();
      if (composer === undefined) target.dispose();
      else composer.dispose();
      throw error;
    }

    this.composer = composer;
    this.renderPass = renderPass;
    this.printPass = printPass;
    this.outputPass = outputPass;
    this.uniforms = printPass.uniforms as PrintUniforms;
    this.resize(this.size.x, this.size.y, renderer.getPixelRatio());
  }

  render(scene: Scene, camera: Camera, state: Readonly<SceneVisualState>): void {
    if (this.disposed) return;
    this.renderPass.scene = scene;
    this.renderPass.camera = camera;
    this.applyProfile(selectPostProcessingProfile(state), state);
    this.composer.render(0);
  }

  resize(width: number, height: number, pixelRatio: number): void {
    if (
      this.disposed
      || !Number.isFinite(width)
      || !Number.isFinite(height)
      || !Number.isFinite(pixelRatio)
      || width <= 0
      || height <= 0
      || pixelRatio <= 0
    ) return;
    this.composer.setPixelRatio(pixelRatio);
    this.composer.setSize(width, height);
    this.uniforms.uResolution.value.set(width * pixelRatio, height * pixelRatio);
    this.uniforms.uPixelRatio.value = pixelRatio;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.printPass.dispose();
    this.outputPass.dispose();
    this.composer.dispose();
  }

  private applyProfile(
    profile: Readonly<PostProcessingProfile>,
    state: Readonly<SceneVisualState>,
  ): void {
    const uniforms = this.uniforms;
    uniforms.uContrast.value = clampPostProcessingValue(profile.contrast, 0.8, 1.2, 1);
    uniforms.uSaturation.value = clampPostProcessingValue(profile.saturation, 0.7, 1.1, 1);
    uniforms.uHighlightCompression.value = clampPostProcessingValue(
      profile.highlightCompression, 0, 0.3, 0,
    );
    uniforms.uShadowLift.value = clampPostProcessingValue(profile.shadowLift, 0, 0.08, 0);
    uniforms.uShadowTint.value.setHex(clampPostProcessingValue(
      profile.shadowTint, 0, 0xffffff, 0x123039,
    ));
    uniforms.uShadowTintStrength.value = clampPostProcessingValue(
      profile.shadowTintStrength, 0, 0.25, 0,
    );
    uniforms.uHighlightTint.value.setHex(clampPostProcessingValue(
      profile.highlightTint, 0, 0xffffff, 0xd8aa6d,
    ));
    uniforms.uHighlightTintStrength.value = clampPostProcessingValue(
      profile.highlightTintStrength, 0, 0.25, 0,
    );
    uniforms.uHalftoneStrength.value = clampPostProcessingValue(
      profile.halftoneStrength, 0, 0.15, 0,
    );
    uniforms.uHalftoneSizeCssPixels.value = clampPostProcessingValue(
      profile.halftoneSizeCssPixels, 3, 8, 5,
    );
    uniforms.uVignetteStrength.value = resolveVignetteStrength(state, profile);
    uniforms.uChromaticAberrationCssPixels.value = clampPostProcessingValue(
      profile.chromaticAberrationCssPixels, 0, 0.9, 0,
    );
    uniforms.uGrainStrength.value = clampPostProcessingValue(profile.grainStrength, 0, 0.06, 0);
    uniforms.uGrainTime.value = clampPostProcessingValue(resolveGrainTime(state), 0, 86_400, 0);
  }
}

export function createSceneRenderer(
  renderer: WebGLRenderer,
  createPipeline: PipelineFactory = (value) => new PostProcessingPipeline(value),
  reportFallback: FallbackReporter = (error) => {
    console.warn('Post-processing unavailable; using direct scene rendering.', error);
  },
): SceneRenderer {
  try {
    return createPipeline(renderer);
  } catch (error) {
    reportFallback(error);
    return new DirectSceneRenderer(renderer);
  }
}
```

- [ ] **Step 5: Run focused tests and type checking**

Run: `bun run test -- tests/PostProcessingPipeline.test.ts tests/postProcessingProfiles.test.ts`

Expected: PASS, 2 test files and 14 tests passed.

Run: `bun run typecheck`

Expected: exit 0 with no TypeScript diagnostics. If Three.js typings reject an inferred uniform type, annotate `PrintUniforms` with explicit `{ value: number | Color | Vector2 | null }` fields rather than adding casts at each assignment.

- [ ] **Step 6: Commit the pipeline**

```powershell
git add -- src/rendering/PrintShader.ts src/rendering/PostProcessingPipeline.ts tests/PostProcessingPipeline.test.ts
git commit -m "feat: add restrained print composer"
```

---

### Task 3: Give `Game` ownership of the shared scene renderer

**Files:**
- Modify: `src/app/GamePhase.ts:1-15`
- Modify: `src/Game.ts:1-425`
- Modify: `tests/GameLifecycle.test.ts:1-245`

**Interfaces:**
- Consumes: `SceneRenderer`, `DirectSceneRenderer`, and `createSceneRenderer` from Tasks 1-2.
- Produces: `PhaseContext.sceneRenderer` and `GameTestOptions.sceneRenderer`; guarantees resize and cleanup order.

- [ ] **Step 1: Write failing lifecycle tests**

Add `type SceneRenderer` to the imports in `tests/GameLifecycle.test.ts`, then add these tests inside `describe('ScavengePhase lifecycle integration', ...)`:

```ts
  it('shares one scene renderer across phases and resizes it with the capped pixel ratio', () => {
    const propModels = createTestPropModels();
    const shipFurniture = createTestShipFurniture();
    const skyAssets = createTestSkyAssets();
    const sceneRenderer: SceneRenderer = {
      render: vi.fn(), resize: vi.fn(), dispose: vi.fn(),
    };
    const contexts: PhaseContext[] = [];
    let complete!: (result: { savedItems: readonly []; elapsedSeconds: number }) => void;
    const game = Game.forTest({
      createScavenge: (context, onComplete) => {
        contexts.push(context);
        complete = onComplete;
        return gamePhase();
      },
      createSurvival: (context) => {
        contexts.push(context);
        return gamePhase();
      },
    }, { propModels, shipFurniture, skyAssets, sceneRenderer });

    complete({ savedItems: [], elapsedSeconds: 2 });

    expect(contexts.map(({ sceneRenderer: value }) => value))
      .toEqual([sceneRenderer, sceneRenderer]);
    expect(sceneRenderer.resize).toHaveBeenCalledWith(
      window.innerWidth,
      window.innerHeight,
      Math.min(window.devicePixelRatio, 2),
    );
    game.dispose();
    expect(sceneRenderer.dispose).toHaveBeenCalledOnce();
  });

  it('continues renderer cleanup when scene-renderer disposal fails', () => {
    const calls: string[] = [];
    const failure = new Error('scene renderer disposal failed');
    const propModels = createTestPropModels();
    const shipFurniture = createTestShipFurniture();
    const skyAssets = createTestSkyAssets();
    const renderer = {
      domElement: document.createElement('canvas'),
      capabilities: { getMaxAnisotropy: () => 1 },
      setPixelRatio: vi.fn(), setSize: vi.fn(), render: vi.fn(),
      dispose: vi.fn(() => calls.push('renderer')),
    } as unknown as WebGLRenderer;
    vi.spyOn(renderer.domElement, 'remove').mockImplementation(() => calls.push('canvas'));
    const sceneRenderer: SceneRenderer = {
      render: vi.fn(), resize: vi.fn(),
      dispose: vi.fn(() => { calls.push('sceneRenderer'); throw failure; }),
    };
    const game = Game.forTest({
      createScavenge: () => gamePhase(), createSurvival: () => gamePhase(),
    }, { propModels, shipFurniture, skyAssets, renderer, sceneRenderer });

    expect(() => game.dispose()).toThrow(failure);
    expect(calls).toEqual(['sceneRenderer', 'renderer', 'canvas']);
  });
```

Update the two existing cleanup-order tests that construct throwing renderers:

```ts
    const sceneRenderer: SceneRenderer = {
      render: vi.fn(), resize: vi.fn(),
      dispose: vi.fn(() => calls.push('sceneRenderer')),
    };
```

Pass `sceneRenderer` through `Game.forTest` and insert `'sceneRenderer'` before `'renderer'` in both expected `calls` arrays.

- [ ] **Step 2: Run the lifecycle tests and verify the missing option fails**

Run: `bun run test -- tests/GameLifecycle.test.ts`

Expected: FAIL because `PhaseContext` and `GameTestOptions` do not expose `sceneRenderer`, and `Game` does not resize or dispose it.

- [ ] **Step 3: Extend `PhaseContext`**

In `src/app/GamePhase.ts`, add the import and property:

```ts
import type { SceneRenderer } from '../rendering/SceneRenderer';

export interface PhaseContext {
  mount: HTMLElement;
  renderer: WebGLRenderer;
  sceneRenderer: SceneRenderer;
  camera: PerspectiveCamera;
  reducedMotion: MediaQueryList;
  propModels: PropModelLibrary;
  shipFurniture: ShipFurnitureLibrary;
  maxTextureAnisotropy: number;
  skyAssets: SkyAssets;
}
```

- [ ] **Step 4: Create and inject the renderer in `Game`**

Add these imports to `src/Game.ts`:

```ts
import { createSceneRenderer } from './rendering/PostProcessingPipeline';
import {
  DirectSceneRenderer,
  type SceneRenderer,
} from './rendering/SceneRenderer';
import { runCleanupSteps } from './world/SceneResources';
```

Add `sceneRenderer?: SceneRenderer` to `GameTestOptions` and add this field to `Game`:

```ts
  private sceneRenderer!: SceneRenderer;
```

In the production constructor, create the renderer after configuring `WebGLRenderer` and pass it after `renderer` to `initialize`:

```ts
      const sceneRenderer = createSceneRenderer(renderer);
      initializationStarted = true;
      this.initialize(
        mount,
        renderer,
        sceneRenderer,
        camera,
        clock,
        reducedMotion,
        propModels,
        shipFurniture,
        skyAssets,
        PRODUCTION_FACTORIES,
        createRandomSeed,
      );
```

In `Game.forTest`, construct the direct default and pass it after `renderer`:

```ts
    const sceneRenderer = options.sceneRenderer ?? new DirectSceneRenderer(renderer);
    game.initialize(
      mount,
      renderer,
      sceneRenderer,
      new PerspectiveCamera(65, 1, 0.08, 220),
      clock,
      reducedMotion,
      options.propModels,
      options.shipFurniture,
      options.skyAssets,
      factories,
      options.createSeed ?? createRandomSeed,
    );
```

Add `sceneRenderer: SceneRenderer` after `renderer` in the private `initialize` signature, assign `this.sceneRenderer = sceneRenderer`, and include it in `this.context`:

```ts
    this.context = {
      mount,
      renderer,
      sceneRenderer,
      camera,
      reducedMotion,
      propModels,
      shipFurniture,
      maxTextureAnisotropy,
      skyAssets,
    };
```

- [ ] **Step 5: Replace cleanup nesting with the existing first-error cleanup utility**

Replace the body of `Game.dispose` after `this.exitPointerLock()` with:

```ts
    const performanceStats = this.performanceStats;
    this.performanceStats = null;
    runCleanupSteps([
      () => outgoing?.dispose(),
      () => performanceStats?.dispose(),
      () => this.propModels.dispose(),
      () => this.shipFurniture.dispose(),
      () => this.skyAssets.dispose(),
      () => this.sceneRenderer.dispose(),
      () => this.renderer.dispose(),
      () => this.renderer.domElement.remove(),
    ]);
```

Replace `rollbackConstruction` with:

```ts
  private rollbackConstruction(resizeListenerRegistered: boolean): void {
    this.disposed = true;
    const activePhase = this.detachActivePhase();
    const performanceStats = this.performanceStats;
    this.performanceStats = null;
    runCleanupSteps([
      () => {
        if (resizeListenerRegistered) window.removeEventListener('resize', this.onResize);
      },
      () => activePhase?.dispose(),
      () => performanceStats?.dispose(),
      () => this.sceneRenderer.dispose(),
      () => this.renderer.dispose(),
      () => this.renderer.domElement.remove(),
    ]);
  }
```

- [ ] **Step 6: Resize the composer after the underlying renderer**

Replace `handleResize` with:

```ts
  private handleResize(): void {
    if (this.disposed) return;
    const width = window.innerWidth;
    const height = window.innerHeight;
    const pixelRatio = Math.min(window.devicePixelRatio, 2);
    this.renderer.setPixelRatio(pixelRatio);
    this.renderer.setSize(width, height, false);
    this.sceneRenderer.resize(width, height, pixelRatio);
    this.activePhase?.resize(width, height);
  }
```

- [ ] **Step 7: Run lifecycle tests and type checking**

Run: `bun run test -- tests/GameLifecycle.test.ts`

Expected: PASS, including cleanup tests with `sceneRenderer` before `renderer`.

Run: `bun run typecheck`

Expected: exit 0 with no TypeScript diagnostics. Task 4 changes phase behavior, not the shape of the already-valid context.

- [ ] **Step 8: Commit game-level ownership**

```powershell
git add -- src/app/GamePhase.ts src/Game.ts tests/GameLifecycle.test.ts
git commit -m "refactor: own shared scene renderer in game"
```

---

### Task 4: Route both phases through typed visual state

**Files:**
- Modify: `src/phases/ScavengePhase.ts:1-196`
- Modify: `src/survival/SurvivalPhase.ts:1-390`
- Modify: `tests/GameLifecycle.test.ts`
- Modify: `tests/SurvivalPhase.test.ts`

**Interfaces:**
- Consumes: `PhaseContext.sceneRenderer`, `ScavengeVisualState`, and `SurvivalVisualState`.
- Produces: allocation-free per-phase state updates and composer render calls.

- [ ] **Step 1: Write failing phase render-state tests**

Add these imports to `tests/GameLifecycle.test.ts`:

```ts
import { Scene } from 'three';
import type { ScavengeVisualState } from '../src/rendering/SceneRenderer';
import { getSinkingState } from '../src/game/sinking';
```

Add this test inside the existing describe block:

```ts
  it('renders scavenging through sceneRenderer with current sinking progress', () => {
    const scene = new Scene();
    const camera = new PerspectiveCamera();
    const render = vi.fn();
    const visualState: ScavengeVisualState = {
      kind: 'scavenge', elapsedSeconds: 0, sinkingProgress: 0, reducedMotion: false,
    };
    const phase = Object.create(ScavengePhase.prototype) as ScavengePhase;
    Object.assign(phase, {
      disposed: false,
      scene,
      elapsed: 90,
      visualState,
      context: {
        camera,
        reducedMotion: { matches: true },
        sceneRenderer: { render, resize: vi.fn(), dispose: vi.fn() },
      },
    });

    (phase as unknown as { syncVisualState(state: ReturnType<typeof getSinkingState>): void })
      .syncVisualState(getSinkingState(90, 120));
    phase.render();

    expect(render).toHaveBeenCalledWith(scene, camera, {
      kind: 'scavenge',
      elapsedSeconds: 90,
      sinkingProgress: 0.75,
      reducedMotion: true,
    });
  });
```

Add `Scene` and `type SceneRenderer` imports to `tests/SurvivalPhase.test.ts`, then add:

```ts
  it('renders survival through sceneRenderer with night and squall state', () => {
    const scene = new Scene();
    const render = vi.fn();
    const sceneRenderer: SceneRenderer = { render, resize: vi.fn(), dispose: vi.fn() };
    const current = snapshot({ state: 'nightEvent', weather: 'squall' });
    const phase = SurvivalPhase.forTest({
      session: { snapshot: vi.fn(() => current) },
      world: { scene, update: vi.fn(), dispose: vi.fn() },
      ui: { render: vi.fn(), setJournalUnread: vi.fn(), dispose: vi.fn() },
      sceneRenderer,
    });

    phase.start();
    phase.update(7, 0.016);
    phase.render();

    expect(render).toHaveBeenLastCalledWith(
      scene,
      expect.any(PerspectiveCamera),
      {
        kind: 'survival',
        elapsedSeconds: 7,
        phase: 'night',
        weather: 'squall',
        reducedMotion: false,
      },
    );
  });
```

- [ ] **Step 2: Run the tests and verify direct-render behavior fails**

Run: `bun run test -- tests/GameLifecycle.test.ts tests/SurvivalPhase.test.ts`

Expected: FAIL because the phase classes do not own visual-state objects and still call `context.renderer.render`.

- [ ] **Step 3: Integrate scavenging state**

Add this import to `src/phases/ScavengePhase.ts`:

```ts
import type { ScavengeVisualState } from '../rendering/SceneRenderer';
```

Add this field beside the other mutable phase state:

```ts
  private readonly visualState: ScavengeVisualState = {
    kind: 'scavenge',
    elapsedSeconds: 0,
    sinkingProgress: 0,
    reducedMotion: false,
  };
```

Replace the initial sinking setup in `update` with:

```ts
    let sinking = getSinkingState(this.elapsed, RUN_SECONDS);
    this.syncVisualState(sinking);
```

Call the helper again whenever `synchronizeElapsed` changes `sinking`.

Replace `render` and add the helper:

```ts
  render(): void {
    if (this.disposed) return;
    this.context.sceneRenderer.render(this.scene, this.context.camera, this.visualState);
  }

  private syncVisualState(sinking: Readonly<ReturnType<typeof getSinkingState>>): void {
    this.visualState.elapsedSeconds = this.elapsed;
    this.visualState.sinkingProgress = sinking.progress;
    this.visualState.reducedMotion = this.context.reducedMotion.matches;
  }
```

The resulting `synchronizeElapsed` branch must end with:

```ts
      this.elapsed = nextElapsed;
      sinking = getSinkingState(this.elapsed, RUN_SECONDS);
      this.syncVisualState(sinking);
      return true;
```

- [ ] **Step 4: Integrate survival state and test injection**

Add these imports to `src/survival/SurvivalPhase.ts`:

```ts
import type { SceneRenderer, SurvivalVisualState } from '../rendering/SceneRenderer';
```

Extend `SurvivalPhaseTestDependencies`:

```ts
  sceneRenderer?: SceneRenderer;
```

Change `testContext` to accept and expose a scene renderer:

```ts
function testContext(sceneRenderer: SceneRenderer = {
  render: () => undefined,
  resize: () => undefined,
  dispose: () => undefined,
}): PhaseContext {
  const mount = {
    clientWidth: 1,
    clientHeight: 1,
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 1, height: 1 }),
  } as unknown as HTMLElement;
  return {
    mount,
    renderer: { render: () => undefined } as unknown as PhaseContext['renderer'],
    sceneRenderer,
    camera: new PerspectiveCamera(),
    reducedMotion: { matches: false } as MediaQueryList,
    propModels: {} as PropModelLibrary,
    shipFurniture: {} as ShipFurnitureLibrary,
    maxTextureAnisotropy: 1,
    skyAssets: {} as SkyAssets,
  };
}
```

Pass `dependencies.sceneRenderer` from `forTest`:

```ts
      testContext(dependencies.sceneRenderer),
```

Add these fields to `SurvivalPhase`:

```ts
  private elapsedSeconds = 0;
  private readonly visualState: SurvivalVisualState = {
    kind: 'survival',
    elapsedSeconds: 0,
    phase: 'day',
    weather: 'calm',
    reducedMotion: false,
  };
```

At the start of `update`, after the guard, store time and synchronize the snapshot:

```ts
    this.elapsedSeconds = time;
    this.world.update?.(time, deltaSeconds);
    const snapshot = this.session.snapshot();
    this.syncVisualState(snapshot);
    this.syncPresentation(snapshot);
```

Replace `render`:

```ts
  render(): void {
    if (this.disposed || this.world.scene === undefined) return;
    this.context.sceneRenderer.render(
      this.world.scene,
      this.context.camera,
      this.visualState,
    );
  }
```

Replace the first lines of `renderSnapshot` with:

```ts
  private renderSnapshot(openPendingEvent: boolean, presentTerminal = true): SurvivalSnapshot {
    const snapshot = this.session.snapshot();
    this.syncVisualState(snapshot);
    this.world.setWeather?.(snapshot.weather);
    this.world.setPhase?.(snapshot.state === 'nightEvent' ? 'night' : 'day');
```

Keep the rest of the existing method after those lines, then add:

```ts
  private syncVisualState(snapshot: Readonly<SurvivalSnapshot>): void {
    this.visualState.elapsedSeconds = this.elapsedSeconds;
    this.visualState.phase = snapshot.state === 'nightEvent' ? 'night' : 'day';
    this.visualState.weather = snapshot.weather;
    this.visualState.reducedMotion = this.context.reducedMotion.matches;
  }
```

- [ ] **Step 5: Run both phase suites and type checking**

Run: `bun run test -- tests/GameLifecycle.test.ts tests/SurvivalPhase.test.ts`

Expected: PASS with the new render-state assertions.

Run: `bun run typecheck`

Expected: exit 0 with no direct phase call to `context.renderer.render`.

- [ ] **Step 6: Commit phase integration**

```powershell
git add -- src/phases/ScavengePhase.ts src/survival/SurvivalPhase.ts tests/GameLifecycle.test.ts tests/SurvivalPhase.test.ts
git commit -m "feat: route game phases through post-processing"
```

---

### Task 5: Remove the doubled normal vignette and lock resource policy

**Files:**
- Modify: `src/styles/main.css:25-30`
- Create: `tests/PostProcessingPresentation.test.ts`

**Interfaces:**
- Consumes: the WebGL vignette from Task 2 and existing `.ui-treatment` markup.
- Produces: subtle UI texture with only a light normal frame shade; retains `.game-ui[data-sinking-severity="critical"]` danger treatment.

- [ ] **Step 1: Write the failing presentation-policy test**

Create `tests/PostProcessingPresentation.test.ts`:

```ts
import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const renderingFiles = [
  'src/rendering/SceneRenderer.ts',
  'src/rendering/postProcessingProfiles.ts',
  'src/rendering/PrintShader.ts',
  'src/rendering/PostProcessingPipeline.ts',
];

describe('post-processing presentation policy', () => {
  it('uses no remote runtime resource or added dependency', async () => {
    const sources = await Promise.all(renderingFiles.map((path) => readFile(path, 'utf8')));
    for (const source of sources) expect(source).not.toMatch(/https?:\/\//);
    const packageJson = JSON.parse(await readFile('package.json', 'utf8')) as {
      dependencies: Record<string, string>;
    };
    expect(packageJson.dependencies).toEqual({ three: '^0.180.0' });
  });

  it('keeps only a light normal UI frame shade and preserves the critical vignette', async () => {
    const css = await readFile('src/styles/main.css', 'utf8');
    expect(css).toContain('#02030326 100%');
    expect(css).not.toContain('#020303e8 108%');
    expect(css).toContain('#30050580 64%');
    expect(css).toContain('critical-vignette');
  });
});
```

- [ ] **Step 2: Run the test and verify the old vignette fails**

Run: `bun run test -- tests/PostProcessingPresentation.test.ts`

Expected: FAIL because `.ui-treatment::before` still ends at `#020303e8 108%`.

- [ ] **Step 3: Reduce only the normal CSS vignette**

Replace the normal rule in `src/styles/main.css` with:

```css
.ui-treatment::before { content: ''; position: absolute; inset: -8%; background: radial-gradient(circle at 50% 44%, transparent 55%, #02030326 100%); }
```

Do not change the critical-state rule at `src/styles/main.css:547`.

- [ ] **Step 4: Run policy and UI tests**

Run: `bun run test -- tests/PostProcessingPresentation.test.ts tests/UIArtwork.test.ts tests/GameUI.test.ts tests/SurvivalUI.test.ts`

Expected: PASS; UI markup, accessibility, and critical treatment remain intact.

- [ ] **Step 5: Commit the presentation adjustment**

```powershell
git add -- src/styles/main.css tests/PostProcessingPresentation.test.ts
git commit -m "style: balance UI and scene vignette"
```

---

### Task 6: Complete automated and browser verification

**Files:**
- Verify only; do not create screenshots or log files inside the repository.

**Interfaces:**
- Consumes: the completed shared pipeline and all existing game phases.
- Produces: evidence that the implementation meets automated, visual, accessibility, and performance acceptance criteria.

- [ ] **Step 1: Run the repository verification suite**

Run each command separately:

```powershell
bun run models:check
bun run test
bun run typecheck
bun run build
```

Expected:

- both model audits report success;
- all Vitest files pass;
- TypeScript exits with no diagnostics;
- Vite creates the production bundle without unresolved `three/addons` imports.

- [ ] **Step 2: Start the local game for browser inspection**

Run: `bun run dev -- --host 127.0.0.1 --port 5173`

Expected: Vite reports `http://127.0.0.1:5173/` and the game reaches its start screen without a fallback warning in the console.

- [ ] **Step 3: Inspect scavenging at both target viewports**

Use the Browser skill's viewport capability at 1280x720 and 1920x1080. At each size inspect the start screen, begin evacuation, and inspect active play near timer start and after sinking progress reaches at least `0.75`.

Expected at both sizes:

- midtone halftone appears on the ship, ocean, and sky without covering the center;
- cyan shadow and warm highlight separation remains restrained;
- item colors remain distinguishable;
- the normal UI has no doubled black edge;
- sinking progress darkens only the outer frame;
- the crosshair and text remain sharp because they sit outside the composer.

- [ ] **Step 4: Inspect survival day, night, overcast, and squall states**

Complete scavenging and inspect survival at 1280x720 and 1920x1080. Cover calm day, overcast day, night event, and squall night; open one projected item tooltip and one dialog.

Expected:

- calm day is the warmest and least vignetted profile;
- overcast adds a small cold and grain bias;
- night preserves item silhouettes and uses less halftone in deep shadows;
- squall has the strongest grain and edge pressure without central blur or flashes;
- tooltip, dialog, focus outline, and projected interaction control remain unprocessed and readable.

- [ ] **Step 5: Verify reduced motion and performance**

Enable `prefers-reduced-motion: reduce`, reload, and observe a static camera for ten seconds.

Expected: halftone and grain remain visually stable; no grain pattern update is visible.

At 1920x1080, observe the built-in FPS overlay for 30 seconds in active scavenging and 30 seconds in survival day.

Expected: the game holds at least 60 FPS on the verification machine and shows no sustained regression greater than 15 percent relative to the pre-implementation reading on the same machine and scene.

- [ ] **Step 6: Verify restart, resize, transition, and cleanup behavior**

Resize between both target viewports, transition from scavenging to survival, restart once, and reload the page after disposal.

Expected: the halftone cell size remains constant in CSS pixels, no stretched frame appears after resize, one composer remains active across the phase transition, restart does not intensify the effect, and the console contains no WebGL resource or disposed-target errors.

- [ ] **Step 7: Record the final verification result in the task handoff**

Report the exact four command results, both viewport checks, the measured FPS ranges, and whether the direct-render fallback warning appeared. Do not commit generated `dist` output or temporary browser logs.

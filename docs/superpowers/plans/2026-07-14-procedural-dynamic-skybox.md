# Procedural Dynamic Skybox Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add one asset-free procedural sky to both game phases, with cloudless weather and day or night states that stay color-matched with fog, lighting, and ocean reflections.

**Architecture:** `skyPalette.ts` maps atmosphere state to colors and light values. `Skybox.ts` renders a camera-centered shader sphere and owns the 1.5-second transition. `Environment` and `BoatWorld` apply the current palette to their fog and lights, while `OceanRenderer` receives the same palette colors through an explicit atmosphere input.

**Tech Stack:** TypeScript 5.9, Three.js 0.180, Vitest 3.2, Vite 7.1

## Global Constraints

- Render the sky in both scavenging and survival.
- Support `calm`, `overcast`, and `squall` weather plus `day` and `night` phases.
- Render no cloud meshes, cloud textures, or shader clouds.
- Use no downloaded or runtime-fetched art assets.
- Generate the sun, moon, and stars in the sky shader.
- Blend a weather or phase target change over 1.5 seconds.
- Keep rain and sea spray in the scavenging phase.
- Share current sky colors with scene fog, lights, and ocean uniforms.
- Preserve reduced-motion behavior, water exclusions, wave motion, presentation cues, and guarded disposal.
- Leave unrelated dirty-worktree changes untouched. Stage only files listed in the active task.

## File Map

- Create `src/world/skyPalette.ts`: atmosphere types, six authored palettes, severity adjustment, cloning, and interpolation.
- Create `src/world/Skybox.ts`: shader sphere, transition state, transient tint, camera following, and disposal.
- Create `tests/SkyPalette.test.ts`: palette state, severity, fallback, and interpolation coverage.
- Create `tests/Skybox.test.ts`: shader contract, updates, camera following, tint, and disposal coverage.
- Modify `src/ocean/OceanRenderer.ts`: accept explicit fog, horizon, sky, and sun colors.
- Modify `src/world/Environment.ts`: own the scavenging sky and remove cloud planes.
- Modify `src/world/World.ts`: update the atmosphere before the ocean and pass the shared palette.
- Modify `src/survival/BoatWorld.ts`: own the survival sky and replace flat-background behavior.
- Modify `tests/world.test.ts`: ocean API and scavenging-sky integration coverage.
- Modify `tests/BoatWorld.test.ts`: survival state, cue tint, and disposal coverage.
- Modify `README.md`: document the procedural cloudless atmosphere in the architecture summary.

---

### Task 1: Pure atmosphere palette

**Files:**
- Create: `src/world/skyPalette.ts`
- Create: `tests/SkyPalette.test.ts`

**Interfaces:**
- Consumes: Three.js `Color`.
- Produces: `SkyWeather`, `SkyPhase`, `SkyState`, `SkyPalette`, `skyPaletteFor(state)`, `cloneSkyPalette(source)`, and `lerpSkyPalette(out, from, to, alpha)`.

- [ ] **Step 1: Write the failing palette tests**

Create `tests/SkyPalette.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  cloneSkyPalette,
  lerpSkyPalette,
  skyPaletteFor,
} from '../src/world/skyPalette';

describe('skyPaletteFor', () => {
  it.each([
    ['calm', 'day'],
    ['overcast', 'day'],
    ['squall', 'day'],
    ['calm', 'night'],
    ['overcast', 'night'],
    ['squall', 'night'],
  ] as const)('returns a bounded %s %s palette', (weather, phase) => {
    const palette = skyPaletteFor({ weather, phase, severity: 0 });
    expect(palette.fogDensity).toBeGreaterThan(0);
    expect(palette.exposure).toBeGreaterThan(0);
    for (const value of [
      palette.sunVisibility,
      palette.moonVisibility,
      palette.starVisibility,
      palette.haze,
    ]) expect(value).toBeGreaterThanOrEqual(0);
  });

  it('uses sun by day and moon plus stars by night', () => {
    const day = skyPaletteFor({ weather: 'calm', phase: 'day', severity: 0 });
    const night = skyPaletteFor({ weather: 'calm', phase: 'night', severity: 0 });
    expect(day.sunVisibility).toBeGreaterThan(0.8);
    expect(day.moonVisibility).toBe(0);
    expect(day.starVisibility).toBe(0);
    expect(night.sunVisibility).toBe(0);
    expect(night.moonVisibility).toBeGreaterThan(0.7);
    expect(night.starVisibility).toBeGreaterThan(0.7);
  });

  it('raises haze and suppresses celestial light in a squall', () => {
    const calm = skyPaletteFor({ weather: 'calm', phase: 'night', severity: 0 });
    const squall = skyPaletteFor({ weather: 'squall', phase: 'night', severity: 0 });
    expect(squall.haze).toBeGreaterThan(calm.haze);
    expect(squall.moonVisibility).toBeLessThan(calm.moonVisibility);
    expect(squall.starVisibility).toBeLessThan(calm.starVisibility);
  });

  it('clamps sinking severity and darkens the squall day', () => {
    const start = skyPaletteFor({ weather: 'squall', phase: 'day', severity: -1 });
    const end = skyPaletteFor({ weather: 'squall', phase: 'day', severity: 2 });
    expect(end.exposure).toBeLessThan(start.exposure);
    expect(end.fogDensity).toBeGreaterThan(start.fogDensity);
    expect(end.zenithColor.getHex()).not.toBe(start.zenithColor.getHex());
  });

  it('falls back to calm day for invalid runtime state', () => {
    const fallback = skyPaletteFor({
      weather: 'invalid',
      phase: 'invalid',
      severity: Number.NaN,
    } as never);
    const calmDay = skyPaletteFor({ weather: 'calm', phase: 'day', severity: 0 });
    expect(fallback).toEqual(calmDay);
  });

  it('interpolates colors and scalars without mutating endpoints', () => {
    const from = skyPaletteFor({ weather: 'calm', phase: 'day', severity: 0 });
    const to = skyPaletteFor({ weather: 'squall', phase: 'night', severity: 0 });
    const out = cloneSkyPalette(from);
    const fromHex = from.zenithColor.getHex();
    const toHex = to.zenithColor.getHex();
    lerpSkyPalette(out, from, to, 0.5);
    expect(out.zenithColor.getHex()).not.toBe(fromHex);
    expect(out.zenithColor.getHex()).not.toBe(toHex);
    expect(out.fogDensity).toBeCloseTo((from.fogDensity + to.fogDensity) / 2);
    expect(from.zenithColor.getHex()).toBe(fromHex);
    expect(to.zenithColor.getHex()).toBe(toHex);
  });
});
```

- [ ] **Step 2: Run the palette tests and confirm the red state**

Run: `bun run test -- tests/SkyPalette.test.ts`

Expected: FAIL because `../src/world/skyPalette` does not exist.

- [ ] **Step 3: Implement the palette module**

Create `src/world/skyPalette.ts` with these exact exports and the six authored states:

```ts
import { Color } from 'three';

export type SkyWeather = 'calm' | 'overcast' | 'squall';
export type SkyPhase = 'day' | 'night';

export interface SkyState {
  weather: SkyWeather;
  phase: SkyPhase;
  severity: number;
}

export interface SkyPalette {
  zenithColor: Color;
  upperColor: Color;
  horizonColor: Color;
  fogColor: Color;
  sunColor: Color;
  moonColor: Color;
  starColor: Color;
  ambientLightColor: Color;
  keyLightColor: Color;
  sunVisibility: number;
  moonVisibility: number;
  starVisibility: number;
  haze: number;
  exposure: number;
  ambientLightIntensity: number;
  keyLightIntensity: number;
  fogDensity: number;
}

type PaletteNumbers = Omit<SkyPalette,
  | 'zenithColor' | 'upperColor' | 'horizonColor' | 'fogColor'
  | 'sunColor' | 'moonColor' | 'starColor'
  | 'ambientLightColor' | 'keyLightColor'> & {
    zenithColor: number;
    upperColor: number;
    horizonColor: number;
    fogColor: number;
    sunColor: number;
    moonColor: number;
    starColor: number;
    ambientLightColor: number;
    keyLightColor: number;
  };

const BASE: Record<SkyWeather, Record<SkyPhase, PaletteNumbers>> = {
  calm: {
    day: {
      zenithColor: 0x367797, upperColor: 0x6394a5, horizonColor: 0xa7b8b2,
      fogColor: 0x789499, sunColor: 0xffdfa3, moonColor: 0xe7eef3,
      starColor: 0xf4f7f8, ambientLightColor: 0xbdd3d2, keyLightColor: 0xffddb0,
      sunVisibility: 1, moonVisibility: 0, starVisibility: 0, haze: 0.16,
      exposure: 1, ambientLightIntensity: 1.1, keyLightIntensity: 2.2, fogDensity: 0.012,
    },
    night: {
      zenithColor: 0x07111f, upperColor: 0x10233a, horizonColor: 0x273e50,
      fogColor: 0x101922, sunColor: 0xffdfa3, moonColor: 0xd8e6ee,
      starColor: 0xeaf2f5, ambientLightColor: 0x8298a7, keyLightColor: 0xa9c6d8,
      sunVisibility: 0, moonVisibility: 0.9, starVisibility: 1, haze: 0.2,
      exposure: 0.55, ambientLightIntensity: 0.28, keyLightIntensity: 0.22, fogDensity: 0.022,
    },
  },
  overcast: {
    day: {
      zenithColor: 0x304a59, upperColor: 0x526b76, horizonColor: 0x7f8d8f,
      fogColor: 0x59777c, sunColor: 0xd8d1bb, moonColor: 0xcbd8df,
      starColor: 0xdbe5e8, ambientLightColor: 0xaebfbe, keyLightColor: 0xd1c9b5,
      sunVisibility: 0.32, moonVisibility: 0, starVisibility: 0, haze: 0.52,
      exposure: 0.78, ambientLightIntensity: 0.72, keyLightIntensity: 1.15, fogDensity: 0.018,
    },
    night: {
      zenithColor: 0x09121c, upperColor: 0x172432, horizonColor: 0x303e49,
      fogColor: 0x101922, sunColor: 0xffdfa3, moonColor: 0xc5d2da,
      starColor: 0xd7e1e5, ambientLightColor: 0x758995, keyLightColor: 0x9db4c2,
      sunVisibility: 0, moonVisibility: 0.42, starVisibility: 0.35, haze: 0.58,
      exposure: 0.43, ambientLightIntensity: 0.28, keyLightIntensity: 0.22, fogDensity: 0.022,
    },
  },
  squall: {
    day: {
      zenithColor: 0x18262e, upperColor: 0x27343b, horizonColor: 0x4b565a,
      fogColor: 0x27343b, sunColor: 0xc7c0aa, moonColor: 0xb9c8d0,
      starColor: 0xcbd5d9, ambientLightColor: 0x8fa0a1, keyLightColor: 0xc7c0aa,
      sunVisibility: 0.16, moonVisibility: 0, starVisibility: 0, haze: 0.84,
      exposure: 0.72, ambientLightIntensity: 0.48, keyLightIntensity: 0.7, fogDensity: 0.028,
    },
    night: {
      zenithColor: 0x030811, upperColor: 0x0a1420, horizonColor: 0x1b2833,
      fogColor: 0x101922, sunColor: 0xffdfa3, moonColor: 0xaebec8,
      starColor: 0xc2cdd2, ambientLightColor: 0x60727e, keyLightColor: 0x8ea5b5,
      sunVisibility: 0, moonVisibility: 0.16, starVisibility: 0.08, haze: 0.9,
      exposure: 0.3, ambientLightIntensity: 0.18, keyLightIntensity: 0.22, fogDensity: 0.032,
    },
  },
};

const clamp01 = (value: number): number => Number.isFinite(value)
  ? Math.min(1, Math.max(0, value))
  : 0;

function isWeather(value: unknown): value is SkyWeather {
  return value === 'calm' || value === 'overcast' || value === 'squall';
}

function isPhase(value: unknown): value is SkyPhase {
  return value === 'day' || value === 'night';
}

function materialize(source: PaletteNumbers): SkyPalette {
  return {
    ...source,
    zenithColor: new Color(source.zenithColor), upperColor: new Color(source.upperColor),
    horizonColor: new Color(source.horizonColor), fogColor: new Color(source.fogColor),
    sunColor: new Color(source.sunColor), moonColor: new Color(source.moonColor),
    starColor: new Color(source.starColor), ambientLightColor: new Color(source.ambientLightColor),
    keyLightColor: new Color(source.keyLightColor),
  };
}

export function cloneSkyPalette(source: SkyPalette): SkyPalette {
  return {
    ...source,
    zenithColor: source.zenithColor.clone(), upperColor: source.upperColor.clone(),
    horizonColor: source.horizonColor.clone(), fogColor: source.fogColor.clone(),
    sunColor: source.sunColor.clone(), moonColor: source.moonColor.clone(),
    starColor: source.starColor.clone(), ambientLightColor: source.ambientLightColor.clone(),
    keyLightColor: source.keyLightColor.clone(),
  };
}

export function skyPaletteFor(state: SkyState): SkyPalette {
  const weather = isWeather(state?.weather) ? state.weather : 'calm';
  const phase = isPhase(state?.phase) ? state.phase : 'day';
  const palette = materialize(BASE[weather][phase]);
  const severity = clamp01(state?.severity);
  if (weather === 'squall' && phase === 'day' && severity > 0) {
    palette.zenithColor.lerp(new Color(0x091118), severity * 0.55);
    palette.upperColor.lerp(new Color(0x111c24), severity * 0.42);
    palette.horizonColor.lerp(new Color(0x303a3e), severity * 0.25);
    palette.exposure *= 1 - severity * 0.3;
    palette.sunVisibility *= 1 - severity * 0.6;
    palette.haze = clamp01(palette.haze + severity * 0.16);
    palette.fogDensity += severity * 0.009;
    palette.ambientLightIntensity *= 1 - severity * 0.15;
    palette.keyLightIntensity *= 1 - severity * 0.2;
  }
  return palette;
}

export function lerpSkyPalette(
  out: SkyPalette,
  from: SkyPalette,
  to: SkyPalette,
  alpha: number,
): SkyPalette {
  const t = clamp01(alpha);
  for (const key of [
    'zenithColor', 'upperColor', 'horizonColor', 'fogColor', 'sunColor',
    'moonColor', 'starColor', 'ambientLightColor', 'keyLightColor',
  ] as const) out[key].copy(from[key]).lerp(to[key], t);
  for (const key of [
    'sunVisibility', 'moonVisibility', 'starVisibility', 'haze', 'exposure',
    'ambientLightIntensity', 'keyLightIntensity', 'fogDensity',
  ] as const) out[key] = from[key] + (to[key] - from[key]) * t;
  return out;
}
```

- [ ] **Step 4: Run the palette tests and type checker**

Run: `bun run test -- tests/SkyPalette.test.ts`

Expected: all palette tests pass.

Run: `bun run typecheck`

Expected: exit code 0.

- [ ] **Step 5: Commit the palette unit**

```bash
git add src/world/skyPalette.ts tests/SkyPalette.test.ts
git commit -m "feat: define procedural sky palettes"
```

---

### Task 2: Procedural sky renderer

**Files:**
- Create: `src/world/Skybox.ts`
- Create: `tests/Skybox.test.ts`

**Interfaces:**
- Consumes: `SkyState`, `SkyPalette`, `skyPaletteFor`, `cloneSkyPalette`, and `lerpSkyPalette` from Task 1.
- Produces: `new Skybox(scene, initialState)`, `palette`, `update(delta, state, cameraPosition)`, `resetTransient()`, `setTint(color, amount)`, and `dispose()`.

- [ ] **Step 1: Write the failing renderer tests**

Create `tests/Skybox.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import { Color, Scene, ShaderMaterial, Vector3 } from 'three';
import { Skybox } from '../src/world/Skybox';

describe('Skybox', () => {
  it('creates one texture-free inward-facing sky mesh', () => {
    const scene = new Scene();
    const sky = new Skybox(scene, { weather: 'calm', phase: 'day', severity: 0 });
    const mesh = scene.getObjectByName('procedural-skybox');
    expect(mesh).toBe(sky.mesh);
    expect(sky.material).toBeInstanceOf(ShaderMaterial);
    expect(Object.keys(sky.material.uniforms).some((name) => /map|texture/i.test(name))).toBe(false);
    expect(sky.material.fragmentShader).toContain('float starField(');
    expect(sky.material.fragmentShader).not.toMatch(/cloud/i);
    sky.dispose();
  });

  it('follows the camera and finishes a target transition in 1.5 seconds', () => {
    const sky = new Skybox(new Scene(), { weather: 'calm', phase: 'day', severity: 0 });
    const cameraPosition = new Vector3(12, 5, -8);
    sky.update(0, { weather: 'squall', phase: 'night', severity: 0 }, cameraPosition);
    const start = sky.palette.zenithColor.clone();
    sky.update(0.75, { weather: 'squall', phase: 'night', severity: 0 }, cameraPosition);
    const middle = sky.palette.zenithColor.clone();
    sky.update(0.75, { weather: 'squall', phase: 'night', severity: 0 }, cameraPosition);
    expect(sky.mesh.position.toArray()).toEqual(cameraPosition.toArray());
    expect(middle).not.toEqual(start);
    expect(sky.palette.starVisibility).toBeCloseTo(0.08);
    sky.dispose();
  });

  it('applies and clears a bounded transient tint', () => {
    const sky = new Skybox(new Scene(), { weather: 'calm', phase: 'day', severity: 0 });
    sky.setTint(new Color(0x0d5063), 2);
    expect(sky.material.uniforms.uTintAmount!.value).toBe(1);
    sky.resetTransient();
    expect(sky.material.uniforms.uTintAmount!.value).toBe(0);
    sky.dispose();
  });

  it('removes and disposes its resources once', () => {
    const scene = new Scene();
    const sky = new Skybox(scene, { weather: 'calm', phase: 'day', severity: 0 });
    const geometryDispose = vi.spyOn(sky.mesh.geometry, 'dispose');
    const materialDispose = vi.spyOn(sky.material, 'dispose');
    sky.dispose();
    sky.dispose();
    expect(scene.getObjectByName('procedural-skybox')).toBeUndefined();
    expect(geometryDispose).toHaveBeenCalledOnce();
    expect(materialDispose).toHaveBeenCalledOnce();
  });
});
```

- [ ] **Step 2: Run the renderer tests and confirm the red state**

Run: `bun run test -- tests/Skybox.test.ts`

Expected: FAIL because `../src/world/Skybox` does not exist.

- [ ] **Step 3: Implement the shader and lifecycle**

Create `src/world/Skybox.ts`. Use these uniforms and shader operations without texture uniforms:

```ts
import {
  BackSide,
  Color,
  Mesh,
  Scene,
  ShaderMaterial,
  SphereGeometry,
  Vector3,
} from 'three';
import {
  cloneSkyPalette,
  lerpSkyPalette,
  skyPaletteFor,
  type SkyPalette,
  type SkyState,
} from './skyPalette';

const TRANSITION_SECONDS = 1.5;
const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));
const smoothstep = (value: number): number => {
  const t = clamp01(value);
  return t * t * (3 - 2 * t);
};

const vertexShader = `
  varying vec3 vSkyDirection;
  void main() {
    vSkyDirection = normalize(position);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const fragmentShader = `
  uniform vec3 uZenithColor;
  uniform vec3 uUpperColor;
  uniform vec3 uHorizonColor;
  uniform vec3 uSunColor;
  uniform vec3 uMoonColor;
  uniform vec3 uStarColor;
  uniform vec3 uTintColor;
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

  float starField(vec3 direction) {
    vec3 cell = floor(direction * 260.0);
    float seed = hash31(cell);
    float point = smoothstep(0.994, 1.0, seed);
    float aboveHorizon = smoothstep(0.02, 0.22, direction.y);
    return point * aboveHorizon;
  }

  void main() {
    vec3 direction = normalize(vSkyDirection);
    float height = clamp(direction.y * 0.5 + 0.5, 0.0, 1.0);
    float upperMix = smoothstep(0.08, 0.58, height);
    float zenithMix = smoothstep(0.5, 0.98, height);
    vec3 color = mix(uHorizonColor, uUpperColor, upperMix);
    color = mix(color, uZenithColor, zenithMix);

    vec3 sunDirection = normalize(vec3(-0.42, 0.58, -0.7));
    vec3 moonDirection = normalize(vec3(0.46, 0.52, -0.72));
    float sun = smoothstep(0.9991, 0.99975, dot(direction, sunDirection));
    float moon = smoothstep(0.9987, 0.99965, dot(direction, moonDirection));
    float stars = starField(direction) * (1.0 - uHaze * 0.78);
    color += uSunColor * sun * uSunVisibility;
    color += uMoonColor * moon * uMoonVisibility;
    color += uStarColor * stars * uStarVisibility;
    color *= uExposure;
    color = mix(color, uTintColor, clamp(uTintAmount, 0.0, 1.0));
    gl_FragColor = vec4(color, 1.0);
    #include <colorspace_fragment>
  }
`;

export class Skybox {
  readonly material: ShaderMaterial;
  readonly mesh: Mesh<SphereGeometry, ShaderMaterial>;
  private current: SkyPalette;
  private blendFrom: SkyPalette;
  private blendKey: string;
  private blendElapsed = TRANSITION_SECONDS;
  private disposed = false;

  get palette(): Readonly<SkyPalette> { return this.current; }

  constructor(private readonly scene: Scene, initialState: SkyState) {
    this.current = skyPaletteFor(initialState);
    this.blendFrom = cloneSkyPalette(this.current);
    this.blendKey = `${initialState.weather}:${initialState.phase}`;
    this.material = new ShaderMaterial({
      vertexShader,
      fragmentShader,
      side: BackSide,
      depthWrite: false,
      depthTest: false,
      uniforms: {
        uZenithColor: { value: this.current.zenithColor.clone() },
        uUpperColor: { value: this.current.upperColor.clone() },
        uHorizonColor: { value: this.current.horizonColor.clone() },
        uSunColor: { value: this.current.sunColor.clone() },
        uMoonColor: { value: this.current.moonColor.clone() },
        uStarColor: { value: this.current.starColor.clone() },
        uTintColor: { value: new Color() },
        uSunVisibility: { value: this.current.sunVisibility },
        uMoonVisibility: { value: this.current.moonVisibility },
        uStarVisibility: { value: this.current.starVisibility },
        uHaze: { value: this.current.haze },
        uExposure: { value: this.current.exposure },
        uTintAmount: { value: 0 },
      },
    });
    this.mesh = new Mesh(new SphereGeometry(80, 48, 24), this.material);
    this.mesh.name = 'procedural-skybox';
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = -1000;
    scene.add(this.mesh);
  }

  update(delta: number, state: SkyState, cameraPosition: Vector3): Readonly<SkyPalette> {
    if (this.disposed) return this.current;
    const key = `${state.weather}:${state.phase}`;
    if (key !== this.blendKey) {
      this.blendKey = key;
      this.blendFrom = cloneSkyPalette(this.current);
      this.blendElapsed = 0;
    }
    const target = skyPaletteFor(state);
    this.blendElapsed = Math.min(TRANSITION_SECONDS, this.blendElapsed + Math.max(0, delta));
    const alpha = smoothstep(this.blendElapsed / TRANSITION_SECONDS);
    lerpSkyPalette(this.current, this.blendFrom, target, alpha);
    this.mesh.position.copy(cameraPosition);
    this.uploadPalette();
    return this.current;
  }

  resetTransient(): void {
    if (!this.disposed) this.material.uniforms.uTintAmount!.value = 0;
  }

  setTint(color: Color, amount: number): void {
    if (this.disposed) return;
    (this.material.uniforms.uTintColor!.value as Color).copy(color);
    this.material.uniforms.uTintAmount!.value = clamp01(amount);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.scene.remove(this.mesh);
    this.mesh.geometry.dispose();
    this.material.dispose();
  }

  private uploadPalette(): void {
    const uniforms = this.material.uniforms;
    (uniforms.uZenithColor!.value as Color).copy(this.current.zenithColor);
    (uniforms.uUpperColor!.value as Color).copy(this.current.upperColor);
    (uniforms.uHorizonColor!.value as Color).copy(this.current.horizonColor);
    (uniforms.uSunColor!.value as Color).copy(this.current.sunColor);
    (uniforms.uMoonColor!.value as Color).copy(this.current.moonColor);
    (uniforms.uStarColor!.value as Color).copy(this.current.starColor);
    uniforms.uSunVisibility!.value = this.current.sunVisibility;
    uniforms.uMoonVisibility!.value = this.current.moonVisibility;
    uniforms.uStarVisibility!.value = this.current.starVisibility;
    uniforms.uHaze!.value = this.current.haze;
    uniforms.uExposure!.value = this.current.exposure;
  }
}
```

- [ ] **Step 4: Run renderer and palette tests**

Run: `bun run test -- tests/Skybox.test.ts tests/SkyPalette.test.ts`

Expected: all renderer and palette tests pass.

Run: `bun run typecheck`

Expected: exit code 0.

- [ ] **Step 5: Commit the renderer unit**

```bash
git add src/world/Skybox.ts tests/Skybox.test.ts
git commit -m "feat: render procedural maritime sky"
```

---

### Task 3: Explicit ocean-atmosphere input

**Files:**
- Modify: `src/ocean/OceanRenderer.ts:1-220`
- Modify: `src/world/World.ts:132-137`
- Modify: `src/survival/BoatWorld.ts:441-443`
- Modify: `tests/world.test.ts:386-423`

**Interfaces:**
- Consumes: Four `Color` values from a current `SkyPalette`.
- Produces: `OceanAtmosphere` and `OceanRenderer.update(timeSeconds, amplitudeScale, fogDensity, atmosphere?)`.

- [ ] **Step 1: Replace the fog-derived ocean test with an explicit atmosphere test**

In `tests/world.test.ts`, replace `updates the ocean atmosphere color with the scene fog` with:

```ts
it('updates each ocean atmosphere uniform from explicit colors', () => {
  const ocean = new OceanRenderer();
  const atmosphere = {
    fogColor: new Color(0x102030),
    horizonColor: new Color(0x405060),
    skyColor: new Color(0x708090),
    sunColor: new Color(0xffcc88),
  };

  ocean.update(3, 0.8, 0.012, atmosphere);

  expect(ocean.material.uniforms.uFogColor!.value).toEqual(atmosphere.fogColor);
  expect(ocean.material.uniforms.uHorizonColor!.value).toEqual(atmosphere.horizonColor);
  expect(ocean.material.uniforms.uSkyColor!.value).toEqual(atmosphere.skyColor);
  expect(ocean.material.uniforms.uSunColor!.value).toEqual(atmosphere.sunColor);
  ocean.dispose();
});
```

- [ ] **Step 2: Run the ocean test and confirm the red state**

Run: `bun run test -- tests/world.test.ts -t "updates each ocean atmosphere"`

Expected: FAIL because `OceanRenderer.update` still treats the fourth argument as a `Color`.

- [ ] **Step 3: Add the explicit input type and copy each color**

Add above `OceanRenderer` in `src/ocean/OceanRenderer.ts`:

```ts
export interface OceanAtmosphere {
  fogColor: Color;
  horizonColor: Color;
  skyColor: Color;
  sunColor: Color;
}
```

Replace `update` with:

```ts
update(
  timeSeconds: number,
  amplitudeScale: number,
  fogDensity: number,
  atmosphere?: OceanAtmosphere,
): void {
  this.material.uniforms.uTime!.value = timeSeconds;
  this.material.uniforms.uAmplitudeScale!.value = amplitudeScale;
  this.material.uniforms.uFogDensity!.value = fogDensity;
  if (!atmosphere) return;
  (this.material.uniforms.uFogColor!.value as Color).copy(atmosphere.fogColor);
  (this.material.uniforms.uHorizonColor!.value as Color).copy(atmosphere.horizonColor);
  (this.material.uniforms.uSkyColor!.value as Color).copy(atmosphere.skyColor);
  (this.material.uniforms.uSunColor!.value as Color).copy(atmosphere.sunColor);
}
```

Migrate the existing `World.update` call so the intermediate commit type-checks. Add `Color` to the Three.js imports in `src/world/World.ts`, then use:

```ts
const fogColor = this.environment.fogColor;
this.ocean.update(time, sinking.waveAmplitudeScale, 0.018 + sinking.progress * 0.009, {
  fogColor,
  horizonColor: fogColor,
  skyColor: fogColor.clone().multiplyScalar(0.72),
  sunColor: new Color(0xfff1cf),
});
```

Migrate the existing `BoatWorld.update` call with its current fog values:

```ts
const fog = this.scene.fog as FogExp2;
this.ocean.update(time, amplitudeScale, fog.density, {
  fogColor: fog.color,
  horizonColor: fog.color,
  skyColor: fog.color.clone().multiplyScalar(0.72),
  sunColor: new Color(0xfff1cf),
});
```

- [ ] **Step 4: Run the affected world suites**

Run: `bun run test -- tests/world.test.ts tests/BoatWorld.test.ts`

Expected: both affected test files pass.

Run: `bun run typecheck`

Expected: exit code 0.

- [ ] **Step 5: Commit the ocean API change**

```bash
git add src/ocean/OceanRenderer.ts src/world/World.ts src/survival/BoatWorld.ts tests/world.test.ts
git commit -m "refactor: pass atmosphere colors to ocean"
```

---

### Task 4: Scavenging sky and cloud removal

**Files:**
- Modify: `src/world/Environment.ts:1-157`
- Modify: `src/world/World.ts:113-165`
- Modify: `tests/world.test.ts:150-260,299-384`

**Interfaces:**
- Consumes: `Skybox`, `SkyPalette`, and the Task 3 `OceanAtmosphere` input.
- Produces: `Environment.atmosphere: Readonly<SkyPalette>` and `Environment.update(delta, sinking, cameraPosition, reducedMotion)`.

- [ ] **Step 1: Rewrite scavenging integration assertions for a cloudless sky**

Update the main world-update test in `tests/world.test.ts`:

```ts
const sky = scene.getObjectByName('procedural-skybox') as Mesh;
expect(sky).toBeInstanceOf(Mesh);
expect(sky.position.toArray()).toEqual(cameraPosition.toArray());
expect(scene.getObjectByName('storm-clouds')).toBeUndefined();
expect(scene.getObjectByName('rain')).toBeInstanceOf(Points);
expect(scene.getObjectByName('sea-spray')).toBeInstanceOf(Points);
const skyUniforms = (sky.material as ShaderMaterial).uniforms;
expect(skyUniforms.uSunVisibility!.value).toBeLessThan(0.2);
expect((scene.fog as FogExp2).density).toBeGreaterThan(0.028);
expect(oceanMaterial.uniforms.uHorizonColor!.value).toEqual(
  skyUniforms.uHorizonColor!.value,
);
```

Rename the reduced-motion test to `slows spray while keeping the procedural sky fixed to the camera`. Remove both cloud lookups and cloud-position assertions. Keep the spray-distance comparison, then assert:

```ts
expect(regularScene.getObjectByName('storm-clouds')).toBeUndefined();
expect(reducedScene.getObjectByName('storm-clouds')).toBeUndefined();
expect(regularScene.getObjectByName('procedural-skybox')).toBeDefined();
expect(reducedScene.getObjectByName('procedural-skybox')).toBeDefined();
```

In the disposal test, replace `cloudResources` with sky resources:

```ts
const sky = scene.getObjectByName('procedural-skybox') as Mesh;
const skyGeometryDispose = vi.spyOn(sky.geometry, 'dispose');
const skyMaterialDispose = vi.spyOn(sky.material as Material, 'dispose');
```

Remove cloud resources from the shared disposal arrays. After disposal, assert:

```ts
expect(scene.getObjectByName('procedural-skybox')).toBeUndefined();
expect(scene.getObjectByName('storm-clouds')).toBeUndefined();
expect(skyGeometryDispose).toHaveBeenCalledOnce();
expect(skyMaterialDispose).toHaveBeenCalledOnce();
```

- [ ] **Step 2: Run the scavenging world tests and confirm the red state**

Run: `bun run test -- tests/world.test.ts`

Expected: FAIL because the scene still creates `storm-clouds` and no `procedural-skybox`.

- [ ] **Step 3: Replace cloud ownership with sky ownership in `Environment`**

In `src/world/Environment.ts`:

- Remove `Group`, `Mesh`, `MeshBasicMaterial`, and `PlaneGeometry` imports.
- Add `Vector3`, `Skybox`, and `SkyPalette` imports.
- Remove `clouds` and `stormBackground`.
- Add these members:

```ts
private readonly sky: Skybox;
private readonly fallbackBackground = new Color(0x27343b);

get atmosphere(): Readonly<SkyPalette> { return this.sky.palette; }
```

In the constructor, replace the background and cloud setup with:

```ts
scene.background = this.fallbackBackground;
scene.fog = this.stormFog;
this.sky = new Skybox(scene, { weather: 'squall', phase: 'day', severity: 0 });
```

Change the update signature and replace cloud movement plus hard-coded light and fog updates:

```ts
update(
  delta: number,
  sinking: SinkingState,
  cameraPosition: Vector3,
  reducedMotion: boolean,
): void {
  if (this.disposed) return;
  const rainSpeed = reducedMotion ? 8 : 15 + sinking.progress * 8;
  for (let index = 0; index < RAIN_DROP_COUNT; index += 1) {
    const offset = index * 3 + 1;
    this.rainPositions[offset] = (this.rainPositions[offset]! - delta * rainSpeed + 30) % 30;
  }
  (this.rain.geometry.getAttribute('position') as BufferAttribute).needsUpdate = true;
  this.rain.position.set(cameraPosition.x, 0, cameraPosition.z);

  const spraySpeed = reducedMotion ? 0.5 : 1.3 + sinking.progress;
  for (let index = 0; index < SPRAY_DROP_COUNT; index += 1) {
    const offset = index * 3 + 1;
    this.sprayPositions[offset] = (this.sprayPositions[offset]! + delta * spraySpeed) % 2.2;
  }
  (this.spray.geometry.getAttribute('position') as BufferAttribute).needsUpdate = true;
  this.spray.position.set(4.5, 0, -5.8);

  this.sky.resetTransient();
  const atmosphere = this.sky.update(
    delta,
    { weather: 'squall', phase: 'day', severity: sinking.progress },
    cameraPosition,
  );
  this.fallbackBackground.copy(atmosphere.horizonColor);
  this.stormFog.color.copy(atmosphere.fogColor);
  this.stormFog.density = atmosphere.fogDensity;
  this.fillLight.color.copy(atmosphere.ambientLightColor);
  this.fillLight.intensity = atmosphere.ambientLightIntensity;
  this.keyLight.color.copy(atmosphere.keyLightColor);
  this.keyLight.intensity = atmosphere.keyLightIntensity;
}
```

Replace disposal of cloud resources with:

```ts
this.sky.dispose();
this.scene.remove(this.rain, this.spray, this.keyLight, this.fillLight);
if (this.scene.background === this.fallbackBackground) this.scene.background = this.previousBackground;
if (this.scene.fog === this.stormFog) this.scene.fog = this.previousFog;
```

- [ ] **Step 4: Update `World` ordering and ocean input**

In `World.update`, call the environment before the ocean:

```ts
this.environment.update(delta, sinking, cameraPosition, reducedMotion);
const atmosphere = this.environment.atmosphere;
this.ocean.update(time, sinking.waveAmplitudeScale, atmosphere.fogDensity, {
  fogColor: atmosphere.fogColor,
  horizonColor: atmosphere.horizonColor,
  skyColor: atmosphere.zenithColor,
  sunColor: atmosphere.sunColor,
});
this.ocean.follow(cameraPosition.x, cameraPosition.z);
```

Remove the old later `environment.update` call. Keep buoyancy, water exclusions, smoke, and beacon updates in their existing order.

- [ ] **Step 5: Run scavenging tests and type checking**

Run: `bun run test -- tests/world.test.ts tests/SkyPalette.test.ts tests/Skybox.test.ts`

Expected: all selected tests pass.

Run: `bun run typecheck`

Expected: exit code 0.

- [ ] **Step 6: Commit the scavenging integration**

```bash
git add src/world/Environment.ts src/world/World.ts tests/world.test.ts
git commit -m "feat: add cloudless sky to scavenging"
```

---

### Task 5: Survival weather and day or night sky

**Files:**
- Modify: `src/survival/BoatWorld.ts:1-638`
- Modify: `tests/BoatWorld.test.ts:1-520`

**Interfaces:**
- Consumes: `Skybox`, `SkyPalette`, current `WeatherId`, current phase, and `OceanAtmosphere`.
- Produces: a survival sky that transitions through all six states and accepts a transient dive tint.

- [ ] **Step 1: Replace legacy lighting-helper coverage with sky integration tests**

Remove `survivalLighting` from the `BoatWorld` import and delete its helper test. Add these tests:

```ts
it('transitions sky, fog, lights, and ocean to squall night together', () => {
  const propModels = createTestPropModels();
  const world = new BoatWorld(
    new PerspectiveCamera(),
    { matches: false } as MediaQueryList,
    propModels,
    [],
  );
  world.setWeather('squall');
  world.setPhase('night');
  world.update(0.75, 0.75);
  world.update(1.5, 0.75);

  const sky = world.scene.getObjectByName('procedural-skybox') as Mesh;
  const ocean = world.scene.getObjectByName('procedural-ocean') as Mesh;
  const skyUniforms = (sky.material as ShaderMaterial).uniforms;
  const oceanUniforms = (ocean.material as ShaderMaterial).uniforms;
  expect(skyUniforms.uSunVisibility!.value).toBe(0);
  expect(skyUniforms.uMoonVisibility!.value).toBeCloseTo(0.16);
  expect(skyUniforms.uStarVisibility!.value).toBeCloseTo(0.08);
  expect((world.scene.fog as FogExp2).density).toBeCloseTo(0.032);
  expect(oceanUniforms.uHorizonColor!.value).toEqual(skyUniforms.uHorizonColor!.value);
  expect(oceanUniforms.uSkyColor!.value).toEqual(skyUniforms.uZenithColor!.value);
  world.dispose();
  propModels.dispose();
});

it('tints the procedural sky during the dive cue and clears the tint afterward', async () => {
  const propModels = createTestPropModels();
  const world = new BoatWorld(
    new PerspectiveCamera(),
    { matches: false } as MediaQueryList,
    propModels,
    [],
  );
  const sequence = world.play('dive');
  world.update(0.7, 0.7);
  const sky = world.scene.getObjectByName('procedural-skybox') as Mesh;
  const uniforms = (sky.material as ShaderMaterial).uniforms;
  expect(uniforms.uTintAmount!.value).toBeGreaterThan(0);
  world.update(1.4, 0.7);
  await sequence;
  world.update(1.5, 0.1);
  expect(uniforms.uTintAmount!.value).toBe(0);
  world.dispose();
  propModels.dispose();
});

it('disposes the survival sky once', () => {
  const propModels = createTestPropModels();
  const world = new BoatWorld(new PerspectiveCamera(), { matches: false } as MediaQueryList, propModels);
  const sky = world.scene.getObjectByName('procedural-skybox') as Mesh;
  const geometryDispose = vi.spyOn(sky.geometry, 'dispose');
  const materialDispose = vi.spyOn(sky.material as ShaderMaterial, 'dispose');
  world.dispose();
  world.dispose();
  expect(geometryDispose).toHaveBeenCalledOnce();
  expect(materialDispose).toHaveBeenCalledOnce();
  propModels.dispose();
});
```

Add `FogExp2` to the Three.js test imports.

- [ ] **Step 2: Run the survival tests and confirm the red state**

Run: `bun run test -- tests/BoatWorld.test.ts`

Expected: FAIL because `BoatWorld` has no sky and the old flat background handles dive tint.

- [ ] **Step 3: Add sky ownership and remove the legacy lighting helper**

In `src/survival/BoatWorld.ts`:

- Delete `SurvivalLighting` and `survivalLighting`.
- Import `Skybox` and `type SkyPalette`.
- Add `const DIVE_SKY_TINT = new Color(0x0d5063);` near the cue constants.
- Add `private readonly sky: Skybox;` beside `ocean`.

After `this.scene = new Scene()` in the constructor, add:

```ts
this.sky = new Skybox(this.scene, { weather: 'calm', phase: 'day', severity: 0 });
```

Change `setPhase` and `setWeather` so each method stores the new value and returns. Remove their immediate `applyBaseLighting()` calls; the next rendered frame starts the 1.5-second transition.

- [ ] **Step 4: Apply the current palette before presentation cues**

At the start of `applyBasePresentation`, replace `this.applyBaseLighting()` with:

```ts
this.sky.resetTransient();
this.applyBaseLighting(this.sky.palette);
```

Replace `applyBaseLighting` with:

```ts
private applyBaseLighting(atmosphere: Readonly<SkyPalette>): void {
  this.ambient.color.copy(atmosphere.ambientLightColor);
  this.ambient.intensity = atmosphere.ambientLightIntensity;
  this.key.color.copy(atmosphere.keyLightColor);
  this.key.intensity = atmosphere.keyLightIntensity;
  if (this.scene.background instanceof Color) {
    this.scene.background.copy(atmosphere.horizonColor);
  } else {
    this.scene.background = atmosphere.horizonColor.clone();
  }
  if (this.scene.fog instanceof FogExp2) {
    this.scene.fog.color.copy(atmosphere.fogColor);
    this.scene.fog.density = atmosphere.fogDensity;
  } else {
    this.scene.fog = new FogExp2(atmosphere.fogColor, atmosphere.fogDensity);
  }
}
```

In `update`, keep `this.applyBasePresentation()` after boat motion smoothing. Immediately after that call, add:

```ts
this.camera.getWorldPosition(this.worldCameraPosition);
this.sky.update(
  delta,
  { weather: this.weather, phase: this.phase, severity: 0 },
  this.worldCameraPosition,
);
this.applyBaseLighting(this.sky.palette);
```

Replace the dive background line with:

```ts
this.sky.setTint(DIVE_SKY_TINT, pulse * 0.8);
if (this.scene.background instanceof Color) {
  this.scene.background.lerp(DIVE_SKY_TINT, pulse * 0.8);
}
```

- [ ] **Step 5: Pass the survival palette to the ocean and dispose the sky**

Replace the survival ocean call with:

```ts
const fog = this.scene.fog as FogExp2;
const atmosphere = this.sky.palette;
this.ocean.update(time, amplitudeScale, fog.density, {
  fogColor: fog.color,
  horizonColor: atmosphere.horizonColor,
  skyColor: atmosphere.zenithColor,
  sunColor: atmosphere.sunColor,
});
```

In `dispose`, call `this.sky.dispose()` beside `this.ocean.dispose()`. Do not add the sky mesh to the later `scene.remove` list because `Skybox.dispose()` removes it.

- [ ] **Step 6: Run survival tests, type checking, and the build**

Run: `bun run test -- tests/BoatWorld.test.ts tests/SkyPalette.test.ts tests/Skybox.test.ts tests/world.test.ts`

Expected: all selected tests pass.

Run: `bun run typecheck`

Expected: exit code 0.

Run: `bun run build`

Expected: TypeScript and Vite complete with exit code 0.

- [ ] **Step 7: Commit the survival integration**

```bash
git add src/survival/BoatWorld.ts tests/BoatWorld.test.ts
git commit -m "feat: add dynamic sky to survival"
```

---

### Task 6: Documentation and full verification

**Files:**
- Modify: `README.md:1-15,82-105`

**Interfaces:**
- Consumes: the completed skybox behavior from Tasks 1 through 5.
- Produces: user-facing architecture documentation and final verification evidence.

- [ ] **Step 1: Update the README atmosphere description**

Replace the opening procedural-art sentence with:

```markdown
The 3D world uses original procedural geometry and shaders. A shared cloudless sky shader supplies weather, day and night colors, celestial bodies, fog, lighting, and ocean reflections without external sky art.
```

Add this architecture bullet after the `src/world/ShipSmoke` bullet:

```markdown
- `src/world/Skybox` and `src/world/skyPalette` — shared cloudless atmosphere rendering, weather and day/night palettes, celestial bodies, and ocean/fog color synchronization.
```

- [ ] **Step 2: Run the complete automated verification suite**

Run: `bun run test`

Expected: all test files pass with zero failed tests.

Run: `bun run typecheck`

Expected: exit code 0 with no diagnostics.

Run: `bun run build`

Expected: Vite writes `dist/` and exits 0.

Run: `git diff --check`

Expected: exit code 0 with no whitespace errors.

- [ ] **Step 3: Perform browser QA in both phases**

Run: `bun run dev -- --host 127.0.0.1`

Use the browser-control skill to inspect 1280x720, 1440x900, and 1920x1080. Verify:

- Scavenging shows rain and spray against a cloudless squall sky.
- The sky stays centered while the player moves and jumps.
- Sinking progress darkens the sky without a horizon seam.
- Survival calm day shows the sun and no stars.
- Survival overcast day mutes the sun without drawing cloud forms.
- Survival calm night shows the moon and stars.
- Survival squall night suppresses stars and raises haze.
- Nightfall and dawn blend without a color snap.
- The ocean reflection, fog horizon, and sky use matching colors.
- The dive cue tints the sky and clears after the cue.
- Reduced-motion mode keeps atmosphere blends and removes no existing accessibility behavior.
- Restarting the run leaves one `procedural-skybox` in the active scene and no disposed sky from the prior phase.

Record any visual defect with a screenshot. Return to the owning task, add a regression test, apply the focused fix, and commit those files before continuing. Rerun the focused test for each changed unit, then repeat `bun run test`, `bun run typecheck`, and `bun run build`.

- [ ] **Step 4: Commit documentation and QA adjustments**

```bash
git add README.md
git commit -m "docs: describe procedural skybox"
```

- [ ] **Step 5: Confirm final scope**

Run: `git status --short`

Expected: no new uncommitted skybox files. Pre-existing unrelated worktree changes may remain and must stay untouched.

Run: `git log -6 --oneline`

Expected: the task commits appear in order: palette, renderer, ocean API, scavenging integration, survival integration, and documentation.

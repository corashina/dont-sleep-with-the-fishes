# Cinematic North Atlantic Water Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade the procedural ocean with denser large-wave geometry, layered wind chop, deeper lighting, broken sun glints, and irregular crest foam while keeping buoyancy and weather synchronized.

**Architecture:** `OceanRenderer` keeps one `PlaneGeometry` and one `ShaderMaterial`. The existing four-wave vertex displacement remains the geometry and buoyancy source; a revised fragment shader adds view-distance-faded detail normals, atmospheric reflection, absorption, and foam. A focused renderer test locks the surface budget and shader feature contract without changing `World` or `BoatWorld` interfaces.

**Tech Stack:** TypeScript 5.9, Three.js 0.180, GLSL through `ShaderMaterial`, Vitest 3.2, Vite 7

## Global Constraints

- Target desktop web browsers at 1280 by 720 and 1920 by 1080.
- Keep one ocean draw call and add no texture samples, render targets, runtime fetches, or third-party assets.
- Keep `OceanRenderer.constructor`, `update()`, `setExclusions()`, `follow()`, and `dispose()` signatures unchanged.
- Keep `DEFAULT_WAVES`, `sampleWaveField()`, buoyancy, weather amplitude, fog, and hull exclusion behavior unchanged.
- Increase the 180-meter plane from 128 by 128 segments to 192 by 192 segments, producing 73,728 triangles.
- Fade fine fragment detail before the fog-dominated horizon.
- Run `bun run test`, `bun run typecheck`, and `bun run build` after implementation.

---

## File Structure

- Create `tests/OceanRenderer.test.ts`: focused constructor and shader-quality contracts for the ocean renderer.
- Modify `src/ocean/OceanRenderer.ts`: surface-quality constants, plane density, detail fade uniforms, and cinematic fragment shading.
- Do not modify `src/ocean/WaveField.ts`, `src/world/World.ts`, or `src/survival/BoatWorld.ts`; their existing integration contracts provide time, amplitude, atmosphere, and buoyancy synchronization.

### Task 1: Surface Density and Detail-Fade Contract

**Files:**
- Create: `tests/OceanRenderer.test.ts`
- Modify: `src/ocean/OceanRenderer.ts`

**Interfaces:**
- Consumes: `OceanRenderer` and Three.js `PlaneGeometry` and `Vector2`.
- Produces: exported `OCEAN_SURFACE_QUALITY` with `segments`, `detailFadeNear`, and `detailFadeFar`; shader uniform `uDetailFade: Vector2`.

- [ ] **Step 1: Write the failing surface-quality test**

Create `tests/OceanRenderer.test.ts`:

```ts
import { Vector2 } from 'three';
import { describe, expect, it } from 'vitest';
import {
  OCEAN_SURFACE_QUALITY,
  OceanRenderer,
} from '../src/ocean/OceanRenderer';

describe('OceanRenderer', () => {
  it('uses the balanced surface density and ordered detail fade', () => {
    const ocean = new OceanRenderer();
    const position = ocean.mesh.geometry.getAttribute('position');

    expect(OCEAN_SURFACE_QUALITY).toEqual({
      segments: 192,
      detailFadeNear: 28,
      detailFadeFar: 92,
    });
    expect(ocean.mesh.geometry.parameters.widthSegments).toBe(192);
    expect(ocean.mesh.geometry.parameters.heightSegments).toBe(192);
    expect(position.count).toBe(193 * 193);
    expect(ocean.material.uniforms.uDetailFade!.value).toEqual(new Vector2(28, 92));
    expect(OCEAN_SURFACE_QUALITY.detailFadeNear)
      .toBeLessThan(OCEAN_SURFACE_QUALITY.detailFadeFar);

    ocean.dispose();
  });
});
```

- [ ] **Step 2: Run the focused test and verify the red state**

Run:

```powershell
bun run test tests/OceanRenderer.test.ts
```

Expected: FAIL because `OCEAN_SURFACE_QUALITY` does not exist.

- [ ] **Step 3: Add the immutable quality settings and use them**

In `src/ocean/OceanRenderer.ts`, add this after `MAX_EXCLUSIONS`:

```ts
export const OCEAN_SURFACE_QUALITY = Object.freeze({
  segments: 192,
  detailFadeNear: 28,
  detailFadeFar: 92,
});
```

Add the detail fade uniform inside the `ShaderMaterial` uniforms object:

```ts
uDetailFade: {
  value: new Vector2(
    OCEAN_SURFACE_QUALITY.detailFadeNear,
    OCEAN_SURFACE_QUALITY.detailFadeFar,
  ),
},
```

Replace the geometry construction with:

```ts
const geometry = new PlaneGeometry(
  180,
  180,
  OCEAN_SURFACE_QUALITY.segments,
  OCEAN_SURFACE_QUALITY.segments,
);
```

- [ ] **Step 4: Run the focused and exclusion tests**

Run:

```powershell
bun run test tests/OceanRenderer.test.ts tests/WaterExclusion.test.ts
```

Expected: PASS for the new surface contract and all water-exclusion tests.

- [ ] **Step 5: Commit the surface contract**

```powershell
git add -- tests/OceanRenderer.test.ts src/ocean/OceanRenderer.ts
git commit -m "feat: raise ocean surface detail budget"
```

### Task 2: Cinematic Detail, Lighting, and Foam

**Files:**
- Modify: `tests/OceanRenderer.test.ts`
- Modify: `src/ocean/OceanRenderer.ts`

**Interfaces:**
- Consumes: `uTime`, `uAmplitudeScale`, `uDetailFade`, atmosphere colors, light direction, `vHeight`, `vWaveSlope`, `vViewDepth`, `vWorldNormal`, and `vWorldPosition`.
- Produces: fragment helpers `windWarp()`, `warpedDetailSlope()`, `foamBreakup()`, and `crestFoam()`; final color with atmospheric reflection, absorption, two-scale sun glint, crest foam, fog, and dithering.

- [ ] **Step 1: Write the failing shader-feature test**

Append this test inside the existing `describe('OceanRenderer', ...)` block:

```ts
it('includes layered chop, broken foam, and two-scale sun light', () => {
  const ocean = new OceanRenderer();
  const shader = ocean.material.fragmentShader;

  expect(shader).toContain('vec2 windWarp(');
  expect(shader).toContain('vec2 warpedDetailSlope(');
  expect(shader).toContain('float foamBreakup(');
  expect(shader).toContain('float crestFoam(');
  expect(shader).toContain('float sunCore =');
  expect(shader).toContain('float sunSheen =');
  expect(shader).not.toContain('vec2 rippleSlope(');

  ocean.dispose();
});
```

- [ ] **Step 2: Run the test and verify the red state**

Run:

```powershell
bun run test tests/OceanRenderer.test.ts
```

Expected: FAIL at `vec2 windWarp(` because the current shader still defines `rippleSlope()`.

- [ ] **Step 3: Declare the new fragment uniforms**

In the fragment shader, add these declarations after `uniform float uTime;`:

```glsl
uniform float uAmplitudeScale;
uniform vec2 uDetailFade;
```

The vertex shader already declares `uAmplitudeScale`; the shared `ShaderMaterial` uniform supplies both stages.

- [ ] **Step 4: Replace `rippleSlope()` with the layered detail and foam helpers**

Replace the complete `rippleSlope()` function with:

```glsl
vec2 windWarp(vec2 worldPosition) {
  vec2 wind = normalize(vec2(0.83, 0.56));
  vec2 crossWind = vec2(-wind.y, wind.x);
  float broad = sin(dot(worldPosition, crossWind) * 0.31 + uTime * 0.22);
  float crossing = sin(dot(worldPosition, wind) * 0.47 - uTime * 0.17);
  return wind * broad * 0.42 + crossWind * crossing * 0.24;
}

vec2 warpedDetailSlope(vec2 worldPosition) {
  vec2 wind = normalize(vec2(0.83, 0.56));
  vec2 crossWind = vec2(-wind.y, wind.x);
  vec2 quartering = normalize(vec2(0.24, -0.97));
  vec2 opposing = normalize(vec2(-0.68, 0.73));
  vec2 warped = worldPosition + windWarp(worldPosition);

  float mediumA = cos(dot(warped, wind) * 2.45 + uTime * 1.58);
  float mediumB = cos(dot(warped, crossWind) * 4.15 - uTime * 1.91);
  float fineA = cos(dot(warped, quartering) * 7.35 + uTime * 2.43);
  float fineB = cos(dot(warped, opposing) * 11.8 - uTime * 2.87);

  vec2 slope = wind * mediumA * 0.072
    + crossWind * mediumB * 0.042
    + quartering * fineA * 0.021
    + opposing * fineB * 0.011;
  float distanceFade = 1.0 - smoothstep(uDetailFade.x, uDetailFade.y, vViewDepth);
  float weatherStrength = clamp(0.92 + (uAmplitudeScale - 1.0) * 0.32, 0.78, 1.18);
  return slope * distanceFade * weatherStrength;
}

float foamBreakup(vec2 worldPosition) {
  vec2 wind = normalize(vec2(0.83, 0.56));
  vec2 crossWind = vec2(-wind.y, wind.x);
  vec2 warped = worldPosition + windWarp(worldPosition) * 0.65;
  float broad = 0.5 + 0.5 * sin(
    dot(warped, wind) * 1.38
    + sin(dot(warped, crossWind) * 0.74 - uTime * 0.31)
    + uTime * 0.18
  );
  float fine = 0.5 + 0.5 * sin(
    dot(warped, normalize(vec2(-0.41, 0.91))) * 4.85
    - uTime * 0.76
  );
  return smoothstep(0.34, 0.72, broad * 0.68 + fine * 0.32);
}

float crestFoam(float waveHeight, float waveSlope) {
  float roughness = clamp((uAmplitudeScale - 0.85) / 0.65, 0.0, 1.0);
  float crestStart = mix(0.53, 0.37, roughness);
  float slopeStart = mix(0.24, 0.16, roughness);
  float crest = smoothstep(crestStart, crestStart + 0.28, waveHeight);
  float breaking = smoothstep(slopeStart, slopeStart + 0.24, waveSlope);
  float coverage = mix(0.66, 0.92, roughness);
  return crest * breaking * coverage;
}
```

- [ ] **Step 5: Replace the fragment `main()` lighting and foam block**

Keep the exclusion loop at the top of `main()`. Replace everything after that loop through `gl_FragColor` with this block:

```glsl
vec2 detailSlope = warpedDetailSlope(vWorldPosition.xz);
vec3 normal = normalize(vWorldNormal + vec3(-detailSlope.x, 0.0, -detailSlope.y));
vec3 viewDirection = normalize(cameraPosition - vWorldPosition);
vec3 lightDirection = normalize(uLightDirection);
float lightFacing = clamp(dot(normal, lightDirection), 0.0, 1.0);
float viewFacing = clamp(dot(normal, viewDirection), 0.0, 1.0);

float fresnel = 0.02 + 0.98 * pow(1.0 - viewFacing, 5.0);
vec3 reflectionDirection = reflect(-viewDirection, normal);
float reflectionLift = smoothstep(-0.12, 0.16, reflectionDirection.y);
float reflectedSky = smoothstep(0.02, 0.82, reflectionDirection.y);
vec3 reflectedColor = mix(uHorizonColor * 0.92, uSkyColor, reflectedSky);
reflectedColor = mix(uHorizonColor * 0.78, reflectedColor, reflectionLift);

float trough = 1.0 - smoothstep(-0.48, 0.38, vHeight);
float depthMix = clamp(0.18 + vHeight * 0.27 + lightFacing * 0.23, 0.0, 1.0);
vec3 waterBody = mix(uDeepColor, uShallowColor, depthMix);
waterBody *= 1.0 - trough * 0.16;
float forwardScatter = pow(clamp(dot(viewDirection, -lightDirection), 0.0, 1.0), 4.0);
waterBody += uShallowColor * forwardScatter * (0.055 + vWaveSlope * 0.12);
float reflectionStrength = clamp(0.07 + fresnel * 0.89, 0.0, 0.95);
vec3 color = mix(waterBody, reflectedColor, reflectionStrength);

vec3 halfDirection = normalize(lightDirection + viewDirection);
float specularFacing = clamp(dot(normal, halfDirection), 0.0, 1.0);
float windAlignment = 1.0 - abs(dot(
  normalize(vec2(halfDirection.x, halfDirection.z) + vec2(0.0001)),
  normalize(vec2(-0.56, 0.83))
));
float sunCore = pow(specularFacing, 220.0) * 1.24;
float sunSheen = pow(specularFacing, 38.0) * mix(0.10, 0.24, windAlignment);

float foam = crestFoam(vHeight, vWaveSlope) * foamBreakup(vWorldPosition.xz);
foam *= 1.0 - smoothstep(uDetailFade.y * 0.72, uDetailFade.y, vViewDepth);
color += uSunColor * (sunCore + sunSheen) * (1.0 - foam * 0.78);
color = mix(color, uFoamColor, foam * 0.74);

float fogFactor = 1.0 - exp(-uFogDensity * uFogDensity * vViewDepth * vViewDepth);
color = mix(color, uFogColor, clamp(fogFactor, 0.0, 1.0));
gl_FragColor = vec4(color, 0.98);
#include <colorspace_fragment>
gl_FragColor.rgb += orderedDither(gl_FragCoord.xy);
```

- [ ] **Step 6: Run focused tests and the full automated suite**

Run:

```powershell
bun run test tests/OceanRenderer.test.ts tests/WaterExclusion.test.ts tests/WaveField.test.ts
bun run test
```

Expected: both commands PASS. The full suite should report no unhandled errors or new warnings.

- [ ] **Step 7: Commit the shader upgrade**

```powershell
git add -- tests/OceanRenderer.test.ts src/ocean/OceanRenderer.ts
git commit -m "feat: add cinematic North Atlantic water"
```

### Task 3: Build and Browser Verification

**Files:**
- Verify: `src/ocean/OceanRenderer.ts`
- Verify: `src/world/World.ts`
- Verify: `src/survival/BoatWorld.ts`

**Interfaces:**
- Consumes: the complete ocean renderer from Tasks 1 and 2.
- Produces: verified production output in scavenging and survival with no source changes unless a test or browser check exposes a defect.

- [ ] **Step 1: Run static and production-build checks**

Run:

```powershell
bun run typecheck
bun run build
```

Expected: both commands exit with code 0. Vite should complete the production bundle without shader-related TypeScript errors.

- [ ] **Step 2: Start the local game**

Run:

```powershell
bun run dev -- --host 127.0.0.1
```

Expected: Vite prints a local URL and the page loads without console errors.

- [ ] **Step 3: Inspect the scavenging ocean**

At 1280 by 720 and 1920 by 1080, begin evacuation and inspect the ocean from the deck and near the lifeboat. Confirm:

- nearby chop contains bent, layered bands with no short visible loop;
- the sun reflection breaks into a narrow core and broad moving sheen;
- troughs remain dark while lit crests pick up shallow color;
- foam forms sparse patches on high, steep crests;
- detail fades before the horizon and the ocean joins the fog without shimmer;
- water remains excluded from the freighter and lifeboat hull interiors.

- [ ] **Step 4: Inspect survival weather and night**

Enter survival and inspect calm, overcast, squall, and night states. Confirm:

- the visible large waves remain aligned with lifeboat heave, pitch, and roll;
- rough weather increases chop and foam without covering the surface;
- sky, horizon, sun, fog, and ocean colors transition together;
- moonlit water retains readable form without glowing foam;
- reduced-motion preference leaves the ocean animation contract unchanged.

- [ ] **Step 5: Run the final verification set**

Run:

```powershell
bun run test
bun run typecheck
bun run build
git diff --check
git status --short
```

Expected: tests, typecheck, build, and whitespace checks pass. `git status --short` contains no uncommitted Task 1 or Task 2 files.

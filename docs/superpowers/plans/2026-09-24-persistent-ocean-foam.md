# Persistent Ocean Foam Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add realistic persistent hull and crest foam while targeting 60 FPS on desktop.

**Architecture:** One local GPU field stores separate crest and hull coverage and freshness. Shared surface sampling drives formation and flow. A textured material shades the result, first in the foam lab, then through OceanRenderer.

**Tech Stack:** TypeScript, Three.js 0.180, WebGL2, GLSL, Vite, Vitest, Node.js, Windows PowerShell. No new packages.

**Spec:** [Approved design](../specs/2026-09-24-persistent-ocean-foam-design.md). Approved by the user on 2026-09-24.

## Global Constraints

- Continue in the ocean-foam worktree. Preserve the wave shape, buoyancy, and gameplay.
- Scope includes surface pores and foam trails. Separate bubble particles, spray, ripples, FFT replacement, and new gameplay are excluded.
- Use existing Three.js render targets and shader materials. Add no packages.
- Replace this instantaneous foam path. Do not keep a second legacy implementation.
- Run the simulation at a fixed 30 Hz. Render water at the display frame rate.
- Start with a 256-meter extent. High uses 1024 by 1024 texels. Low uses 512 by 512 texels.
- Start with a coverage half-life of 3 seconds and a freshness half-life of 0.8 seconds.
- Uniforms point to preallocated resources. No per-frame arrays, vectors, materials, targets, or CPU pixel readbacks.
- Only add tests rated at least 90 out of 100, per repository rules.
- Use the current desktop at 1920 by 1080 and pixel ratio 1 as the initial benchmark setting.
- Target a 95th-percentile frame time no greater than 16.7 ms.
- Read VISUAL_STYLE_GUIDE.md before visual work. Preserve its illustrated, weathered appearance.
- Use branch codex/ocean-foam at C:/Users/Corashina/.codex/worktrees/ocean-foam/dont-sleep-with-the-fishes.
- Do not change the user's main checkout. Do not merge or publish during this plan.

## Review Focus

These risks need explicit checks beyond ordinary screenshots. Their tests are assigned below.

1. Exclusion regions reorder or disappear: motion remains attached to the correct hull. Task 3.
2. A capture fails after foam advances: retry does not advance foam twice. Task 7.
3. Both interpolation targets use different origins: camera scrolling preserves world placement. Tasks 4 and 6.
4. A lost WebGL context returns: resources recover with clean history and no stale motion. Tasks 4 and 6.
5. The baseline is already slower than 60 FPS: report the delta without a false performance claim. Tasks 1 and 8.

## File map and ownership

| File | Responsibility |
|---|---|
| scripts/ocean-foam-lab/main.ts | Existing lab scenes, controls, captures, and scheduling |
| scripts/ocean-foam-lab/foamChecks.ts | GPU history, contact, and motion checks; tooling only |
| scripts/ocean-foam-lab/foamPreview.ts | Temporary lab wiring; remove after production integration |
| scripts/render-ocean-foam.mjs | Existing capture runner and evidence manifest |
| scripts/ocean-foam-lab/frameTiming.ts | Tooling-only timing collection and report calculations |
| scripts/ocean-foam-game-benchmark.ts | Full-game benchmark entry with normal game startup |
| scripts/ocean-foam-game-benchmark.html | Benchmark page loading the normal game and timing collector |
| src/ocean/oceanSurfaceSampling.ts | Shared geometry position and surface sampling GLSL |
| src/ocean/oceanHullProfile.ts | Shared hull profile and signed-distance GLSL |
| src/ocean/waveModulation.ts | Existing modulated waves; add time derivatives without changing wave output |
| src/ocean/OceanFoamClock.ts | Fixed-step schedule and reset decisions |
| src/ocean/OceanFoamHullHistory.ts | Two stable hull identities and interpolated transforms |
| src/ocean/OceanFoamSimulation.ts | GPU targets, update passes, resource lifecycle, and exposed field uniforms |
| src/ocean/oceanFoamSimulationShader.ts | Field transport, decay, and source generation |
| scripts/generate-ocean-foam.mjs | Deterministic original detail texture generator |
| src/assets/ocean/foamDetail.generated.ts | Generated packed texture bytes and dimensions |
| src/ocean/OceanFoamDetail.ts | Synchronous DataTexture creation and configuration |
| src/ocean/oceanFoam.ts | Foam field sampling and material shading |
| src/ocean/OceanRenderer.ts | Production ownership, preparation, quality changes, and cleanup |
| src/ocean/oceanShader.ts | Shared shader assembly and foam uniforms |
| src/ocean/oceanOptics.ts | High quality foam composition before blood tint and fog |
| tests/OceanFoamClock.test.ts | Rated fixed-step and reset tests |
| tests/OceanFoamHullHistory.test.ts | Rated identity, interpolation, and point-motion tests |
| tests/OceanFoamSimulation.test.ts | Rated resource and renderer-state tests |
| tests/OceanRenderer.test.ts | Rated integration and retry tests |
| scripts/ocean-foam-lab/README.md | Capture commands, limitations, and final behavior |

Temporary lab wiring is a test harness. It is not a retained second production path.
Commit each complete task. Keep old gameplay working until Task 7 replaces the foam implementation.
Tasks 2–5 form one implementation chain. Do not implement them concurrently against guessed interfaces.

## Task 1: Preserve baseline evidence and define repeatable capture timing

**Files:** Modify scripts/ocean-foam-lab/main.ts, scripts/render-ocean-foam.mjs, scripts/ocean-foam-lab/README.md. Create scripts/ocean-foam-lab/frameTiming.ts and scripts/ocean-foam-game-benchmark.{html,ts}.

**Interfaces:** Export `summarizeFrameTimes(samples: readonly number[]): { p50Ms: number; p95Ms: number; p99Ms: number; sampleCount: number }` from frameTiming.ts. The benchmark entry loads the same startup module and DOM structure as the root index.html. It must not replace World or bypass post-processing.

- [ ] Read the spec, AGENTS.md, VISUAL_STYLE_GUIDE.md, root index.html, and its startup entry. Inspect git status and record baseline commit 317da3d9 or its documented successor.
- [ ] Run baseline ocean tests and capture the existing twelve lab cases before altering shaders.

```powershell
node node_modules/vitest/vitest.mjs run tests/OceanRenderer.test.ts tests/OceanCapture.test.ts tests/WaveField.test.ts
node scripts/render-ocean-foam.mjs artifacts/ocean-foam/persistent-before
```

Expected: current ocean tests pass; the capture runner records every case without shader errors. Investigate any new failure before continuing.

- [ ] Add a lab-local deterministic stepping helper. Keep the current render callback, but reach capture time through fixed increments.

```ts
function advanceTo(target: number): void {
  while (time + 1 / 60 < target) {
    time += 1 / 60;
    render();
  }
  time = target;
  render();
}
```

Configure each case from a clean history, then warm up from `fixedTime - 6` to `fixedTime`. Task 6 supplies explicit reset wiring. Until then, the old material ignores history.

- [ ] Add percentile calculation to frameTiming.ts. Reject an empty sample array. Sort a copy in tooling, never in the game render path.

```ts
const sorted = [...samples].sort((a, b) => a - b);
const percentile = (q: number) => sorted[Math.min(sorted.length - 1,
  Math.max(0, Math.ceil(sorted.length * q) - 1))]!;
return { p50Ms: percentile(0.5), p95Ms: percentile(0.95),
  p99Ms: percentile(0.99), sampleCount: sorted.length };
```

- [ ] Build the benchmark page from the root HTML structure and its real startup import. Add a requestAnimationFrame collector. Start measurement through a visible tooling button after entering the scene. Discard ten seconds, collect thirty seconds, then download JSON. Include browser, GPU when exposed, resolution, pixel ratio, quality, scene, and commit.
- [ ] Capture calm and rough full-game baselines at 1920x1080, pixel ratio 1, High water. Use the same scene and view for Task 8. If this desktop cannot expose the required scene, record the missing evidence instead of inventing it.
- [ ] Pin the baseline reporting rule with a tooling assertion, importance 95/100:

```ts
const baseline = summarizeFrameTimes([18, 19, 20]);
const changed = summarizeFrameTimes([19, 20, 21]);
if (baseline.p95Ms <= 16.7 || changed.p95Ms <= 16.7)
  throw new Error('Slow baseline fixture unexpectedly passes 60 FPS');
```

The final report stores baseline and changed numbers separately. It never labels a positive delta as a passing target.
- [ ] Capture baseline lab images again. Confirm deterministic stepping does not change the old material's final image. Save reports and screenshots under artifacts/ocean-foam, not source control.
- [ ] Commit: `test: establish repeatable foam captures and frame timing`.

## Task 2: Share surface and hull sampling without changing the image

**Files:** Create src/ocean/oceanSurfaceSampling.ts and src/ocean/oceanHullProfile.ts. Modify src/ocean/waveModulation.ts, oceanShader.ts, oceanOptics.ts, and oceanFoam.ts.

**Interfaces:** Export `OCEAN_SURFACE_SAMPLING_GLSL` and `OCEAN_HULL_PROFILE_GLSL` string constants. Retain `sampleOceanWave(int index, vec2 position)` and its existing outputs. Add `vec3 velocity` to OceanWaveSample. Export GLSL `vec3 oceanGeometryPosition(vec2 q, vec3 viewer)` and `vec2 oceanWaveCoordinate(vec2 worldXZ, vec3 viewer)` from surface sampling. Hull GLSL retains `foamHullDistance(vec2, vec4, vec2)` and adds `bool oceanInsideHull(vec3 local, vec4 bounds, vec2 taperStarts, float minY, float maxY)`.

- [ ] Use the baseline lab as a behavior-preservation test, importance 95/100. Keep exact view, time, and weather fixtures from Task 1.
- [ ] Extract the existing height-dependent hull profile and signed-distance calculation. Use it for water exclusion and later deposition. Preserve asymmetric bow/stern geometry and vertical bounds.
- [ ] Add analytical wave time derivatives to sampleOceanWave using the existing local variables. Values below use the shared WAVE_MODULATION constants when generating GLSL.

```glsl
float bendRate = parameters.z * BEND_SPEED;
float groupRate = parameters.z * GROUP_SPEED;
float thetaRate = parameters.z + BEND_STRENGTH * cos(bend) * bendRate;
float amplitudeRate = baseAmplitude * GROUP_RANGE * packet * cos(group) * groupRate;
wave.velocity = vec3(
  parameters.w * direction.x * (amplitudeRate * waveCos - amplitude * waveSin * thetaRate),
  amplitudeRate * waveSin + amplitude * waveCos * thetaRate,
  parameters.w * direction.y * (amplitudeRate * waveCos - amplitude * waveSin * thetaRate));
```

BEND_SPEED, GROUP_SPEED, BEND_STRENGTH, and GROUP_RANGE are substitutions from `m`, not new uniforms or duplicate constants.

- [ ] Extract the vertex geometry position function verbatim, including camera distance weights and vortex displacement. Call that function from the vertex shader.
- [ ] Add inverse mapping with exactly two bounded corrections. Limit each correction to four meters to keep pathological inputs finite.

```glsl
vec2 q = worldXZ;
for (int iteration = 0; iteration < 2; iteration++) {
  vec2 residual = oceanGeometryPosition(q, viewer).xz - worldXZ;
  float scale = min(1.0, 4.0 / max(length(residual), 0.0001));
  q -= residual * scale;
}
return q;
```

- [ ] Reuse the full-resolution surface compression calculation for generation. Do not lower compression detail with geometry LOD. Account for vortex displacement in contact position; do not invent a vortex current from its tangent displacement magnitude.
- [ ] Run ocean tests, type checking, and baseline captures. Compare geometry/contact images at matching inputs. Expected: no changed wave silhouette or exclusion boundary.
- [ ] Commit: `refactor: share ocean surface and hull sampling`.

## Task 3: Add fixed-step scheduling and stable hull history

**Files:** Create OceanFoamClock.ts, OceanFoamHullHistory.ts, tests/OceanFoamClock.test.ts, tests/OceanFoamHullHistory.test.ts.

**Interfaces:**

```ts
// OceanFoamClock.ts: advance mutates this instance; it allocates no result object.
export class OceanFoamClock {
  readonly stepSeconds = 1 / 30;
  steps = 0;
  firstStepTime = 0;
  mix = 0;
  resetRequired = true;
  advance(timeSeconds: number): void;
  reset(): void;
}
// OceanFoamHullHistory.ts
export class OceanFoamHullHistory {
  constructor(capacity: number);
  setRegions(regions: readonly WaterExclusionRegion[], timeSeconds: number): void;
  sample(stepTime: number): void;
  velocityAt(index: number, worldPoint: Vector3, output: Vector3): void;
  reset(): void;
  readonly worldToLocal: readonly Matrix4[];
  readonly previousLocalToWorld: readonly Matrix4[];
  readonly localToWorld: readonly Matrix4[];
  readonly intervals: Float32Array;
}
```

These are interface declarations, not incomplete production class bodies. Implement the methods in this task.

- [ ] Write clock tests first, importance 95/100. Cover initial deposition, unchanged time, two display frames per step, four-step cap, backward time, and gaps above 0.25 seconds.

```ts
const clock = new OceanFoamClock();
clock.advance(10);
expect(clock.resetRequired).toBe(true);
expect(clock.steps).toBe(1);
clock.advance(10);
expect(clock.steps).toBe(0);
clock.advance(10 + 1 / 60);
expect(clock.steps).toBe(0);
clock.advance(10 + 1 / 30);
expect(clock.steps).toBe(1);
clock.advance(11);
expect(clock.resetRequired).toBe(true);
expect(clock.steps).toBe(1);
```

- [ ] Run `node node_modules/vitest/vitest.mjs run tests/OceanFoamClock.test.ts`. Expect a missing-module failure before implementation.
- [ ] Implement a fixed-step accumulator with a small numerical tolerance. Cap at four steps, discard excess backlog, and bound mix to [0,1]. First use and reset deposit one step. Reject nonfinite times with RangeError.
- [ ] Write hull tests first, importance 98/100. Create regions through createWaterExclusion and real Object3D transforms. Move A by one meter in one second; leave B static; swap their input order.

```ts
history.setRegions([a, b], 0);
objectA.position.x = 1;
objectA.updateMatrixWorld(true);
a.worldToLocal.copy(objectA.matrixWorld).invert();
history.setRegions([b, a], 1);
history.sample(1);
history.velocityAt(1, new Vector3(1, 0, 0), velocity);
expect(velocity.x).toBeCloseTo(1);
history.velocityAt(0, new Vector3(), velocity);
expect(velocity.length()).toBe(0);
```

Define objectA, a, b, history, and velocity in the test setup. Also test removal followed by a new region, rotation at an offset point, vertical motion, and reset.
- [ ] Run the hull test and confirm the missing-module failure. Implement two reusable identity slots plus input-order mapping. Snapshot transforms only when time advances. Use quaternion slerp for rotation, vector lerp for translation/scale, and compose into reusable matrices.
- [ ] Compute point velocity using the same local point transformed by current and previous local-to-world matrices. New identities and zero intervals produce zero velocity. Disposed region references must leave the two slots.
- [ ] Run both test files. Expected: all pass without production renderer changes.
- [ ] Commit: `feat: track foam time and hull motion`.

## Task 4: Build the GPU field and verify transport independently

**Files:** Create OceanFoamSimulation.ts, oceanFoamSimulationShader.ts, tests/OceanFoamSimulation.test.ts, scripts/ocean-foam-lab/foamChecks.ts. Modify main.ts and render-ocean-foam.mjs to run simulation checks before image capture.

**Interfaces:**

```ts
export class OceanFoamSimulation {
  constructor(quality: WaterQuality, oceanUniforms: OceanShaderUniforms);
  readonly uniforms: {
    uFoamCurrent: IUniform<Texture>;
    uFoamPrevious: IUniform<Texture>;
    uFoamCurrentOrigin: IUniform<Vector2>;
    uFoamPreviousOrigin: IUniform<Vector2>;
    uFoamExtent: IUniform<number>;
    uFoamMix: IUniform<number>;
    uFoamSourceMask: IUniform<Vector2>;
  };
  readonly sourceMask: Vector2; // crest, hull; production remains (1,1)
  setExclusions(regions: readonly WaterExclusionRegion[]): void;
  update(renderer: WebGLRenderer, timeSeconds: number, camera: Camera): void;
  reset(): void;
  dispose(): void;
}
```

uFoamSourceMask.value references sourceMask. Binding it to the ocean material lets the lab control deposition without accessing private owners.
Use references to existing ocean uniforms, but use distinct simulation time uniforms. Do not temporarily overwrite the material's uTime.
Expose a tooling-only check function from foamChecks.ts: `runFoamChecks(renderer: WebGLRenderer, oceanUniforms: OceanShaderUniforms, camera: Camera): Promise<void>`. It creates and disposes its own simulation.

- [ ] Write lifecycle tests first, importance 95/100. Adapt the concrete renderer stub in OceanCapture.test.ts. Set a non-default target, cube face, mip level, viewport, scissor, clear color/alpha, XR flag, and shadow flags. Inject a render failure and compare every value afterward.
- [ ] Test target creation failure, repeated dispose, context restoration, and unsupported half-float color attachments. Expected errors are explicit; no static-foam fallback is accepted.
- [ ] Run `node node_modules/vitest/vitest.mjs run tests/OceanFoamSimulation.test.ts` and confirm failure before implementation.
- [ ] Allocate two RGBA HalfFloatType targets at the approved size with linear sampling and no depth/stencil. Check EXT_color_buffer_float on the renderer before the first pass. Clear both targets before first sampling. Keep a saved renderer-state object with preallocated Colors and Vector4s.
- [ ] Implement update using OceanFoamClock and OceanFoamHullHistory. Retain a time interval for hull motion even on display frames without a simulation step. The private field scene contains only its fullscreen quad.
- [ ] Implement field sampling and source composition with these operations:

```glsl
vec2 previousUV = (worldXZ - velocity * stepSeconds - previousOrigin) / extent + 0.5;
vec4 state = sampleHistoryWithinBounds(previousUV);
state.rb *= exp2(-stepSeconds / 3.0);
state.ga *= exp2(-stepSeconds / 0.8);
vec2 added = (1.0 - state.rb) * (1.0 - exp(-sourceRate * stepSeconds));
state.rb += added;
state.ga = min(state.rb, state.ga + added);
gl_FragColor = clamp(state, 0.0, 1.0);
```

Define `sampleHistoryWithinBounds(vec2)` in the shader: outside UV [0,1] returns zero; inside uses linear sampling. `sourceRate` is vec2 crest/hull source strength, multiplied by sourceMask. Start rate scales at 1.5 per second and 3.0 per second respectively.

- [ ] Backtrace with analytical wave velocity and dominant-wave drift of 0.18 m/s. Derive contact coordinates through oceanWaveCoordinate. Use shared geometry height and hull profile. Add limited spreading by blending 5% of the four neighboring history samples into the center sample per fixed step.
- [ ] Use the spec's current crest thresholds. For hull rate, use contact mask times `0.2 + clamp(relativeSpeed, 0.0, 3.0)`. Multiply by the outward-facing approach term for stronger leading impacts. Retain weak contact deposition without impact. Reject samples inside the hull.
- [ ] Snap origins per texel. Bind previous origin and current origin independently. Reset on camera jumps beyond 256 meters or clock reset. Mark a step complete only after its render succeeds.
- [ ] Register one webglcontextrestored listener on first renderer use. Its handler calls reset; remove it on dispose. Never allocate new listener closures every frame.
- [ ] Add actual GPU checks, importance 98/100. Convert sampled half-float state to an RGBA8 readback target in the lab; decode coverage there. Sample aggregate coverage and mass-weighted positions over a fixed region. Keep all readback outside production code.
- [ ] Add checks for deposition with mask (1,0), source-off persistence after one second, decreasing coverage by six seconds, and mass staying bounded. With mask (0,1), verify zero coverage below a raised hull after reset. Assert each pixel's fresh mass is no greater than coverage plus quantization tolerance.
- [ ] Add a constant-flow fixture by disabling deposition and setting wave amplitude to zero after seeding a patch. The remaining flow is the known 0.18 m/s drift. Shift the deposited patch by a known distance; require centroid error below one texel. Scroll the field by an integer texel count and require overlap samples within 2/255. Require newly exposed strips to remain zero with sources off.
- [ ] Restore context with WEBGL_lose_context when available, await the restored event, then confirm clean finite state. Mark unsupported extension checks as unavailable, never passed.
- [ ] Run lifecycle tests and `node scripts/render-ocean-foam.mjs artifacts/ocean-foam/field-checks`. Expected: checks pass and existing game foam remains unchanged.
- [ ] Commit: `feat: simulate persistent ocean foam on the GPU`.

## Task 5: Bake original foam detail and shade the field in the lab

**Files:** Create scripts/generate-ocean-foam.mjs, src/assets/ocean/foamDetail.generated.ts, src/ocean/OceanFoamDetail.ts, scripts/ocean-foam-lab/foamPreview.ts. Modify oceanFoam.ts and lab main.ts.

**Interfaces:** Export `createOceanFoamDetail(): DataTexture` from OceanFoamDetail.ts. Export `PERSISTENT_OCEAN_FOAM_FUNCTIONS: string` from oceanFoam.ts during lab development. It defines `vec3 applyOceanFoam(vec3 water, vec3 normal, float height, float compression, float hullSource)` to match the current call sites. Height, compression, and hullSource become unused inputs until Task 7 removes them. Export `installFoamPreview(ocean: OceanRenderer, simulation: OceanFoamSimulation, detail: DataTexture): void` from foamPreview.ts.

- [ ] Implement the deterministic texture generator with Node built-ins only. Produce one 256x256 RGBA texture: R dense coverage, G thin coverage, B dense relief, A thin relief. Store packed base64 bytes and dimensions in the generated TypeScript module. This avoids new asset loaders and asynchronous constructor changes.
- [ ] Use a seeded periodic cell field with at least three pore sizes. Warp positions with integer-frequency sine fields so all channels tile. Evaluate neighboring periodic cells, vary radii, and combine narrow connected rims with wider films. Use this core distance relation inside the pixel loop:

```js
const wrapDelta = value => value - Math.round(value);
const dx = wrapDelta(u - centerU) * scaleX;
const dy = wrapDelta(v - centerV) * scaleY;
const distance = Math.hypot(dx, dy) - radius;
const film = Math.min(1, Math.max(0, (distance + feather) / (2 * feather)));
```

Here u/v and centerU/centerV are normalized tile coordinates; scaleX/scaleY and radius come from the seeded cell. Use periodic cell positions for centers. Feather must cover at least one output texel. Combine fields at frequencies 8, 19, and 43. Derive thin-film gaps from the same centers so aging does not swap unrelated patterns.

- [ ] Write the generated asset from the RGBA byte buffer. Export exact names `FOAM_DETAIL_SIZE` and `FOAM_DETAIL_BASE64`.

```js
const encoded = Buffer.from(pixels).toString('base64');
const source = `// Generated by scripts/generate-ocean-foam.mjs.\n`
  + `export const FOAM_DETAIL_SIZE = 256;\n`
  + `export const FOAM_DETAIL_BASE64 = '${encoded}';\n`;
```

- [ ] Implement DataTexture construction once per ocean owner, with RepeatWrapping, LinearMipmapLinearFilter, LinearFilter, generateMipmaps true, and NoColorSpace. Decode through atob into one Uint8Array. Set needsUpdate once. The caller owns disposal.
- [ ] Generate the asset twice and compare SHA-256 hashes. This is a reproducibility check, not a new low-value unit test. Inspect the texture and a tiled preview image for seams and regular pore grids.
- [ ] Add persistent GLSL alongside the old export for the lab stage only. Sample each field target with its own origin, reject out-of-bounds UVs, and interpolate by uFoamMix. Blend source channels with the lab's visibility mask after sampling; visibility changes must not alter history.

```glsl
vec4 field = mix(previousState, currentState, uFoamMix);
float coverage = 1.0 - (1.0 - field.r * crestVisibility)
  * (1.0 - field.b * hullVisibility);
float freshMass = field.g * crestVisibility + field.a * hullVisibility;
float freshness = clamp(freshMass / max(field.r * crestVisibility
  + field.b * hullVisibility, 0.0001), 0.0, 1.0);
```

Declare crestVisibility and hullVisibility as material uniform components defaulting to one. In the final production material use a constant vec2(1); retain visibility controls only in lab shader injection.

- [ ] Apply local-flow texture motion with phase-offset sampling. Use a two-second cycle and phases separated by 0.5. Each phase has a triangular weight that reaches zero at its reset. Normalize combined weights. Use two different rotations/scales for High; Low samples one scale. Compute derivatives before any coverage branch.
- [ ] Blend dense and thin coverage/relief by freshness. Build relief normals with the existing water normal and screen-space position derivatives, following Three.js bump mapping conventions. Use actual uLightDirection, uSunColor, and uSkyColor. Increase diffuse response and reduce sharp specular response as foam thickens.
- [ ] Keep broad coverage intact at distance. Use mipmapped texture samples and suppress unresolved relief. Multiply coverage by the outer 16-meter field fade. Keep water visible through thin wet margins.
- [ ] Implement installFoamPreview by replacing the exact old OCEAN_FOAM_FUNCTIONS substring in the lab material with PERSISTENT_OCEAN_FOAM_FUNCTIONS. Assert the old block exists exactly once. Bind simulation uniform objects and detail texture. Mark needsUpdate once.
- [ ] Wire explicit simulation.update before the lab's renderer.render call. Keep OceanRenderer production ownership unchanged until Task 7. Use finally to dispose lab-owned detail and simulation.
- [ ] Run the twelve GPU captures. Inspect close, calm, night, moved-hull, and Low images. Expected: no shader errors; clear crest remnants; porous hull contact; no glowing night foam.
- [ ] Commit: `feat: preview aged foam detail and lighting`.

## Task 6: Verify motion, aging, contact, and origin changes visually

**Files:** Modify lab main.ts, foamChecks.ts, render-ocean-foam.mjs, and README.md.

**Interfaces:** Keep runFoamChecks from Task 4. Define lab `resetCase(preview: Preview): void` and `advanceTo(target: number): void`. resetCase configures scene state, calls simulation.reset, sets time to fixedTime minus six seconds, and advances to fixedTime. Source-mask controls change deposition; visibility-mask controls only change the final material.

- [ ] Add failing GPU checks, importance 98/100, before tuning the appearance. Keep all original twelve cases, plus source-off decay, moving-hull trail, origin scroll, paused time, quality switch, and restored context evidence.
- [ ] Correct the old pixel comparison: render enabled and hidden foam at the same time and history. Do not call simulation.update between these two draws. Assert that changing visibility leaves field samples unchanged.
- [ ] Capture a moving hull at 1 m/s for four seconds. Stop the source, then capture at zero, one, three, and six seconds. Require positive coverage behind the prior hull position and decreasing source-off aggregate coverage.
- [ ] Test the raised hull twice: clean reset must produce no hull foam; raising an already active hull must retain a fading trail. This prevents an incorrect test from deleting valid history.
- [ ] Add origin-boundary checks, importance 95/100. Hold deposition off, cross one texel boundary, and compare the same world samples from both interpolation targets. Keep overlap error within 2/255 plus the expected decay for elapsed time. Inspect frames at mix 0, 0.5, and 1.
- [ ] Add paused-time checks, importance 95/100. Render twenty frames at the same time, then require identical field bytes and identical camera-fixed images.
- [ ] Extend the capture runner's required manifest with these exact image names:

```js
const extraImages = [
  '13-source-off', '14-moving-hull', '15-origin-scroll',
  '16-paused', '17-quality-switch', '18-context-restored',
  'aging-motion', 'hull-motion', 'origin-motion',
];
```

For unavailable context restoration, save an explanatory placeholder image labeled CHECK UNAVAILABLE and mark the check unavailable in report.json. Never substitute a normal scene as restoration evidence.
- [ ] Capture close motion at 60 Hz using deterministic stepping. Build sheets at selected timestamps and save frame sequences where motion cannot be judged from four frames. Inspect for visible grid patterns, texture sliding, field-edge bands, and 30 Hz stepping.
- [ ] Tune source rates, breakup, texture scale, and relief inside the approved architecture. Repeat only affected scenes after changes. Keep the field steady while adjusting material values so comparisons remain valid.
- [ ] Run all GPU checks and capture the complete suite after final tuning. Show before/after screenshots and motion evidence to the user before Task 7. Describe any remaining visible defect. This is an evidence checkpoint; it does not add a new permission gate unless the user requests one.
- [ ] Commit: `test: verify foam aging contact and motion`.

## Task 7: Integrate ownership and remove the old foam path

**Files:** Modify OceanRenderer.ts, oceanShader.ts, oceanOptics.ts, oceanFoam.ts, tests/OceanRenderer.test.ts, lab main.ts. Delete the temporary foamPreview.ts after replacing its use.

**Interfaces:** OceanRenderer retains its existing constructor, update, follow, setExclusions, setQuality, and dispose signatures. Add `resetFoam(): void` for timeline restarts. The final GLSL signature is `vec3 applyOceanFoam(vec3 water, vec3 normal)`. The final export is OCEAN_FOAM_FUNCTIONS; remove the temporary PERSISTENT name and old implementation together.

- [ ] Write integration tests first, importance 95/100. Mock simulation.update and capture.update. Use existing tests' real mesh.onBeforeRender callbacks. Verify one simulation advance per ocean update version, including horizon and a second camera.
- [ ] Add the capture-retry test, importance 98/100. Make capture.update throw once after successful simulation.update. Retry preparation and assert:

```ts
expect(foamUpdate).toHaveBeenCalledTimes(1);
expect(captureUpdate).toHaveBeenCalledTimes(2);
```

Create foamUpdate and captureUpdate with vi.spyOn for OceanFoamSimulation.prototype.update and OceanCapture.prototype.update. Reset mocks after each test.
- [ ] Add tests for Low mode simulation, exclusion data changed after update, override-material skips, and quality changes. Force replacement allocation failure and require the old resources to remain usable. Dispose each successful resource exactly once.
- [ ] Run `node node_modules/vitest/vitest.mjs run tests/OceanRenderer.test.ts`. Confirm new assertions fail against existing ownership.
- [ ] Allocate simulation and detail resources in OceanRenderer's rollback-protected constructor. Store current exclusion references for the simulation without per-frame copies. Consume their final transforms at preparation time.
- [ ] Split preparation guards: the foam guard uses updateVersion; the capture guard also uses camera. Set the foam prepared version immediately after a successful simulation pass. Keep both guarded by preparing and override-material/material checks.

```ts
if (this.foamPreparedVersion !== this.updateVersion) {
  this.foam.update(renderer, this.uniforms.uTime.value, camera);
  this.foamPreparedVersion = this.updateVersion;
}
// Existing capture work follows, and may retry independently.
```

- [ ] In setQuality, prepare all replacement geometry and foam targets before swapping owners. Roll back replacements on failure. After successful swap, dispose old resources and reset foam history. Keep detail texture ownership independent of quality.
- [ ] Bind field uniform objects to the water material. Replace the old foam GLSL with the persistent implementation and remove obsolete hullSource plumbing from both quality paths. Preserve hull water exclusion itself.
- [ ] Remove temporary lab simulation ownership and foamPreview.ts. Point resetCase at ocean.resetFoam. Set deposition through ocean.material.uniforms.uFoamSourceMask.value in the lab. Patch the final shader visibility constant into a lab uniform for A/B captures. Do not add player-facing settings.
- [ ] Ensure the final code has only one foam generation and shading path. Use rg for PERSISTENT_OCEAN_FOAM_FUNCTIONS, hullFoamSource, the old constant wind drift, and the old preview string hook; remove obsolete matches.
- [ ] Run affected ocean and world tests, type checking, and the GPU capture suite. Compare integrated images with Task 6 at matched inputs. Expected: no visual regression or duplicate simulation updates.
- [ ] Commit: `feat: integrate persistent hull and crest foam`.

## Task 8: Measure performance, finish checks, and leave the game running

**Files:** Modify frameTiming.ts, benchmark tooling, README.md, and only measured foam settings that need tuning. Store evidence under artifacts/ocean-foam/persistent-final.

**Interfaces:** Preserve the benchmark JSON fields from Task 1. Add `baseline`, `changed`, `deltaP95Ms`, `targetMet`, and `gpuFoamMs` to the comparison report. `gpuFoamMs` is null when unavailable. Do not treat null as zero.

- [ ] Use the Task 1 full-game scenes and display settings. Warm up for ten seconds; collect thirty seconds per calm and rough scene. Record High and Low independently. Browser background throttling invalidates a timing run.
- [ ] Add nonblocking GPU timing around the foam preparation call in benchmark tooling. Use EXT_disjoint_timer_query_webgl2, a fixed query pool, and delayed availability checks. Reject disjoint samples. Do not introduce a production timer dependency.

```ts
if (gl.getQueryParameter(query, gl.QUERY_RESULT_AVAILABLE)
    && !gl.getParameter(extension.GPU_DISJOINT_EXT)) {
  const milliseconds = gl.getQueryParameter(query, gl.QUERY_RESULT) / 1e6;
  gpuSamples.push(milliseconds); // tooling only
}
```

Import the appropriate WebGL extension type from existing DOM/Three.js types or define its actual constant/method surface in tooling. Never use synchronous waiting for query results.
- [ ] Compare baseline and changed frame percentiles. Require changed p95 <=16.7 ms to claim the target. Report the measured foam GPU cost against the initial 1.5 ms budget. A slow baseline remains a failed absolute target.
- [ ] If needed, reduce field resolution or texture samples and repeat affected visual cases. Keep the same architecture and persistent behavior. Recheck contact aliasing and motion after reducing resolution.
- [ ] Run final verification with the installed Node tools. Bun is unavailable in this environment; run build stages directly.

```powershell
node node_modules/eslint/bin/eslint.js . --max-warnings 0
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
node node_modules/typescript/bin/tsc --noEmit
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
node node_modules/vitest/vitest.mjs run tests/OceanFoamClock.test.ts tests/OceanFoamHullHistory.test.ts tests/OceanFoamSimulation.test.ts tests/OceanRenderer.test.ts tests/OceanCapture.test.ts tests/WaveField.test.ts
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
node node_modules/vite/bin/vite.js build
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
node scripts/render-ocean-foam.mjs artifacts/ocean-foam/persistent-final
```

- [ ] Run the affected World and BoatWorld tests discovered through rg. Record unrelated existing failures separately. The prior AnchorItem pose failure is not part of this foam task.
- [ ] Inspect final screenshots and motion sheets. Confirm sources, history, contact, lighting, and field boundaries meet the spec. Counted pixels alone do not prove visual quality.
- [ ] Update README.md with final field sizes, artifact paths, timing results, and known limits. Remove its obsolete claim that foam has no textures, render targets, or history.
- [ ] Commit: `perf: validate and tune persistent ocean foam`.
- [ ] Perform the selected execution method's whole-branch review. Resolve findings, then repeat only affected checks.
- [ ] Check the existing server on port 5188. Reuse it if it serves this worktree. Otherwise inspect its owner before changing it. Start Vite in a hidden process with logs in artifacts/ocean-foam and verify HTTP 200.
- [ ] Return the local game URL, before/after images, measured timing results, and any unmet target. Leave this branch unmerged for user testing.

## Execution boundaries

This plan is ready for user review. Implementation awaits plan approval and execution-method selection.
Recommend Native execution: the tasks share shader, timing, and lifecycle interfaces, so one implementer can retain the necessary context.
The execution skill requires a fresh whole-branch review after implementation.
Subagent-driven execution is also available if the user prefers per-task independent implementation and review.
No agent delegation is needed to write or review this plan itself.

## Self-review record

- Spec coverage: field and flow in Task 4; aging material in Task 5; contact and motion evidence in Task 6.
- Lifecycle, quality, and old-path removal are in Task 7. Full-game timing and final checks are in Task 8.
- All new tests are rated 95 or 98. Existing GPU checks remain rated 95.
- Shared interfaces are declared where introduced. Temporary lab interfaces are removed during integration.
- The five Review Focus risks each have a named test or evidence check above.
- No production code changes are part of this planning commit.

# Procedural Dynamic Skybox Design

**Date:** 2026-07-14
**Target:** Desktop browser
**Stack:** Vite, TypeScript, Three.js, Vitest

## 1. Objective

Add one procedural sky system to the scavenging and survival scenes. The sky must match the game's stylized maritime art, react to weather and time of day, and share its colors with the fog and ocean. The implementation must use no image assets and must render no clouds.

The feature replaces the flat scene backgrounds in both phases. It also removes the seven `storm-clouds` planes from `Environment`.

## 2. Scope

### Included

- One shared shader sky component for both game phases.
- Calm, overcast, and squall palettes.
- Day and night palettes.
- Procedural sun, moon, and stars.
- Smooth palette interpolation when weather or time changes.
- Scavenging-sink severity that darkens the daytime squall.
- One atmosphere palette shared by the sky, fog, lights, and ocean shader.
- Idempotent GPU cleanup and automated coverage.

### Excluded

- Cloud meshes, cloud textures, and shader clouds.
- Photographic cubemaps or downloaded sky art.
- A new weather simulation or changes to survival rules.
- A continuous clock or sun path across a survival day.
- Lightning, aurora, meteors, or other new event effects.

## 3. Architecture

The implementation adds two focused modules under `src/world`:

- `skyPalette.ts` contains pure state-to-palette functions and interpolation helpers.
- `Skybox.ts` owns the sky mesh, shader material, current interpolated palette, camera following, transient tint uniforms, and cleanup.

The public state uses the existing weather vocabulary:

```ts
type SkyWeather = 'calm' | 'overcast' | 'squall';
type SkyPhase = 'day' | 'night';

interface SkyState {
  weather: SkyWeather;
  phase: SkyPhase;
  severity: number;
}
```

`severity` stays in the `0..1` range. Scavenging passes sinking progress. Survival passes zero because its weather and phase already select the target palette.

The pure palette function returns the colors and scalar values that all atmosphere consumers need:

```ts
interface SkyPalette {
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
```

`Skybox.update(delta, state)` selects a target palette, clamps the inputs, and moves the current palette toward the target. Callers read the current palette after the update and apply it to fog, lights, and `OceanRenderer` in the same frame.

## 4. Rendering

`Skybox` creates one inward-facing sphere around the camera. The mesh follows the camera position, skips frustum culling, writes no depth, and renders behind world geometry. The shader derives each pixel from its normalized view direction.

The fragment shader draws four parts:

1. A horizon-to-zenith gradient with a middle color that prevents a flat two-color blend.
2. A soft sun disc during the day.
3. A pale moon disc during the night.
4. Cell-hashed stars whose visibility depends on phase, weather, and horizon haze.

The shader uses analytic shapes and hashes. It samples no textures. Squall states reduce celestial visibility. Overcast states mute contrast and raise horizon haze without introducing cloud forms.

The sky material does not use scene fog. Its horizon color matches the fog color, which hides the join between the sky sphere, distant ocean, and fogged world geometry.

## 5. Authored Atmosphere States

The palette module defines six base states.

| State | Gradient | Celestial treatment | Haze |
|---|---|---|---|
| Calm day | Blue-green horizon to clear maritime blue | Warm visible sun | Low |
| Overcast day | Muted steel blue | Weak cool sun | Medium |
| Squall day | Slate horizon to dark blue-gray | Dim cold sun | High |
| Calm night | Deep blue horizon to navy | Pale moon and strong stars | Low |
| Overcast night | Desaturated blue-black | Veiled moon and sparse stars | Medium |
| Squall night | Near-black blue | Dim moon and few stars | High |

Scavenging uses the squall-day palette. Sinking progress lowers exposure, darkens the zenith, raises haze, and weakens the sun. Rain and sea spray remain because they represent precipitation near the player rather than cloud cover.

Survival selects one of the six base states from `weather` and `phase`. `Skybox` blends colors and scalar values to the new target over 1.5 seconds. Reduced-motion preference keeps these blends because they change no camera or object motion.

## 6. Phase Integration

### Scavenging

`Environment` creates and owns a `Skybox`. It removes the `clouds` group, cloud construction loop, cloud movement, and cloud disposal code. `Environment.update` passes `squall`, `day`, and sinking progress to the sky.

After the sky update, `Environment` copies the current fog color and density into the scene fog. It copies key and fill light color and intensity from the same palette. `World.update` passes the sky's current horizon, zenith, and sun colors to `OceanRenderer`. `Environment` uses the horizon color as the scene-background fallback behind the sky mesh.

`Environment.dispose` disposes the sky and restores the scene background and fog values that existed before construction. It keeps the current idempotent disposal guard.

### Survival

`BoatWorld` creates and owns a `Skybox`. `applyBaseLighting` supplies the current weather and phase, then applies the returned palette to the scene fog, ambient light, key light, and ocean.

Existing presentation cues keep their visual intent. Cues that modify the flat background today will set a transient sky tint or exposure value instead. `applyBasePresentation` clears transient values at the start of each frame before it applies the active cue.

`BoatWorld.dispose` removes and disposes the sky with its other owned scene resources.

## 7. Ocean and Fog Synchronization

`OceanRenderer.update` accepts a small atmosphere input with fog, horizon, sky, and sun colors. It stops deriving all three reflection colors from the fog color.

Both phases pass values from the current interpolated `SkyPalette`. The water shader then reflects the same sky that the player sees. Fog still controls distant water blending. The shared palette prevents a color seam at the horizon during state transitions.

The change preserves wave sampling, foam, sun glint, exclusions, and boat following.

## 8. Lifecycle and Failure Handling

The palette functions clamp severity and interpolation factors to `0..1`. TypeScript unions restrict weather and phase values at compile time. The runtime palette selector falls back to calm day if an untyped caller supplies an unknown value.

The feature performs no network requests and loads no assets. It adds no asynchronous failure path. The existing compatibility screen handles renderer or WebGL startup failure.

`Skybox.dispose` releases its geometry and shader material once. Both phase owners call it from their guarded disposal paths. The scene retains no sky mesh after a phase transition or restart.

## 9. Testing

### Palette tests

- Cover all six weather and phase combinations.
- Assert day and night celestial visibility.
- Assert that squall haze exceeds calm haze.
- Assert that sinking severity darkens the scavenging palette.
- Assert clamping and fallback behavior.
- Assert interpolation bounds and convergence.

### Skybox tests

- Create one named sky mesh with no texture uniforms.
- Confirm camera following and bounded uniform updates.
- Confirm transient tint reset and application.
- Confirm idempotent disposal of geometry and material.

### Integration tests

- Confirm that `Environment` creates the sky and creates no `storm-clouds` group.
- Confirm that scavenging sinking progress updates atmosphere severity.
- Confirm that `BoatWorld` selects weather and day or night palettes.
- Confirm that both phases send sky, horizon, sun, and fog colors to the ocean.
- Confirm that phase disposal removes the sky mesh.
- Preserve existing rain, spray, wave, exclusion, lighting, and presentation-cue tests.

### Manual browser QA

- Check both phases at 1280x720, 1440x900, and 1920x1080.
- Inspect the horizon for seams during calm, overcast, squall, day, and night states.
- Verify sun, moon, and stars against each weather state.
- Watch a full nightfall and dawn transition.
- Confirm that scavenging has rain and spray but no clouds.
- Resize the viewport and restart the full run several times.
- Check reduced-motion mode and monitor frame time before and after the change.

## 10. Definition of Done

- Both game phases render the shared procedural sky.
- Weather and day or night drive the approved six atmosphere states.
- Scavenging darkens the squall sky as the ship sinks.
- The scene contains no cloud meshes, cloud textures, or shader clouds.
- Fog, lighting, sky, and ocean use one interpolated palette.
- The implementation adds no external art assets.
- Automated tests, type checking, and the production build pass.
- Manual QA finds no horizon seam, disposal leak, or visible transition snap.

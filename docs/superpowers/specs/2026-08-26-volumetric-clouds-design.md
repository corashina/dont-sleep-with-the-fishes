# Volumetric Day Clouds Design

Date: 2026-08-26

Status: Approved in chat

## Goal

Add large, realistic volumetric clouds to all playable day scenes.

The feature starts off. The System Tuning menu controls it. Its state persists after a page reload.

All other System Tuning settings must also persist after a page reload.

The enabled clouds target 60 FPS at 1080p on a mid-range desktop GPU.

## Visual Direction

Clouds must support the illustrated, weathered sea world.

They use cool sky tones. They preserve the open horizon and the scene center.

Calm days show large, spaced cumulus groups. Their crowns use warm sunlight. Their bases use cool gray.

Overcast days show low, broad masses. Small gaps expose the sky and keep depth visible.

Squalls show deep towers, dense fronts, dark bases, and sharper silver edges.

Clouds move slowly during calm weather. Overcast clouds move faster. Squall clouds move fastest.

Clouds fade during weather and day changes. They do not appear at night.

## Scope

The work includes these items:

- A WebGL2 volumetric cloud renderer.
- Weather-specific cloud profiles.
- Day-only visibility.
- Smooth cloud and flat-sky transitions.
- One persistent System Tuning cloud switch.
- Persistence for every other System Tuning setting.
- Automated tests and browser visual checks.
- A 1080p performance check.

The work excludes these items:

- Night clouds.
- Cloud shadows on the boat, ship, or ocean.
- New gameplay weather types.
- New cloud controls outside System Tuning.
- Event test action persistence.
- Reduced-motion behavior.

Existing weather lighting continues to shade the world. This avoids another full-scene lighting system.

## Rendering Approach

Use a camera-centered sky shell with a ray-marched cloud layer.

The shader samples one generated, tileable 3D noise texture. It combines large shape noise with smaller erosion detail.

This follows the method in the official Three.js WebGL volumetric cloud example:

https://threejs.org/examples/webgl_volume_cloud.html

The project already uses `WebGLRenderer`. Three.js requires WebGL2 for this renderer.

The shell uses one mesh and one shader material. It renders behind world objects and above the procedural sky.

The shader intersects each view ray with a cloud-height slab. It skips rays below the horizon.

The density field uses world camera coordinates. The cloud field stays fixed while the camera moves.

The density field drifts with weather-specific wind. It never allocates CPU data during a frame.

The shader applies these light terms:

- Beer-Lambert transmittance through cloud density.
- Direct sun light from the shared sun direction.
- Soft ambient sky light.
- Forward scattering near the sun.
- Darkening through dense cloud depth.
- A small silver-edge term on lit boundaries.

The cloud result uses premultiplied alpha. World depth blocks clouds behind solid objects.

## Components

### Volumetric cloud renderer

Add `src/world/VolumetricClouds.ts`.

This component owns these resources:

- One sphere geometry.
- One shader material.
- One generated 3D noise texture.
- Reused uniform values.
- The current transition strength.

Its public API controls enabled state, visual quality, weather, phase, time, and camera position.

Its update method returns the current cloud blend strength. The sky uses this value to fade flat clouds.

Its dispose method removes the mesh. It disposes each owned GPU resource once.

### Weather profiles

Add `src/world/volumetricCloudProfiles.ts`.

Each sky weather type maps to an immutable cloud profile.

Each profile contains coverage, density, base height, top height, shape scale, erosion, wind, and light values.

Presentation weather already maps to `calm`, `overcast`, or `squall`. The cloud renderer uses that existing map.

### Existing sky

Extend `Skybox` with one cloud-layer strength control.

Volumetric strength fades the current flat procedural cloud layer down. Night and disabled states restore it.

The change must preserve current moon and star presentation work.

### World ownership

`Environment` owns the cloud component during scavenging.

`BoatWorld` owns the cloud component during survival.

Both owners pass the same sky palette, weather, phase, time, camera position, and visual quality.

Both owners handle optional cloud setup failure. The base sky remains usable after a failure.

### Phase and game control

Add an optional cloud setter to `GamePhase`.

`ScavengePhase` forwards the value to `World` and `Environment`.

`SurvivalPhase` forwards the value to `BoatWorld`.

`Game` owns the selected value. It applies the value to each new phase.

The main menu stores the value but does not render day clouds.

## Quality and Performance

The existing visual quality setting selects the maximum ray-step count.

Low quality uses the smallest safe count. Medium and high add detail and smoother depth.

All quality levels use these controls:

- Empty-ray rejection.
- Empty-density step growth.
- Early exit after near-total opacity.
- A fixed maximum shader loop.
- One reusable 3D texture.
- No per-frame object or array creation.

The renderer hides its mesh when clouds are fully off. Hidden clouds run no fragment shader work.

The browser check uses a 1920 by 1080 viewport. It checks calm, overcast, and squall weather.

The target is a stable 60 FPS on the available mid-range desktop test GPU.

If high quality misses the target, reduce its ray-step count. Do not add a second cloud quality control.

## System Tuning Persistence

Keep the existing stored preferences for these settings:

- Visual quality.
- Water quality.
- Anti-aliasing quality.
- Shadow quality.
- Master volume.
- Audio mute.
- Barrel simulation.
- Collision mesh view.

Add one stored System Tuning state for these settings:

- Ambient occlusion mode.
- Ambient occlusion intensity.
- Ambient occlusion radius.
- Frame rate display.
- Camera field of view.
- Forced presentation weather.
- Forced presentation phase.
- Volumetric clouds.

The new stored state uses one JSON value and one version-free parser. Invalid fields use current defaults.

The project does not preserve obsolete storage formats. It does not add migrations or fallback keys.

Default volumetric clouds are off. Default presentation weather and phase stay automatic.

An explicit weather or phase choice becomes a forced value. It remains forced after reload.

The event test selector remains an action. It does not persist.

The menu open state is not a setting. It does not persist.

Remove the `?stats` query option. The stored frame rate setting becomes its only control.

Storage errors do not stop play. The selected value remains active for the current session.

## Data Flow

A System Tuning input updates its stored preference first.

The preference then updates the renderer, camera, statistics view, or active game phase.

At startup, `Game` reads stored settings before it creates the first playable phase.

It applies stored ambient occlusion values before the first rendered frame.

It creates the camera with the stored field of view.

It creates the frame rate view with the stored visibility.

It gives every new phase the stored weather, phase, and cloud overrides.

Automatic gameplay weather continues when no forced weather value exists.

## Failure Handling

Cloud creation is optional. A cloud failure must not stop the game.

The failure path logs one clear warning. It keeps the flat sky visible.

The menu shows the cloud option as unavailable during a failed playable phase.

Invalid numeric inputs clamp to their allowed range.

Invalid enum values use defaults.

Non-finite time and position values do not enter shader uniforms.

Cleanup remains idempotent. Later cleanup steps run after one step fails.

## Tests

Add unit tests for these behaviors:

- The cloud switch defaults to off.
- Every new System Tuning field reads and writes storage.
- Invalid stored fields use defaults.
- Storage exceptions keep in-memory values usable.
- Menu values match loaded values.
- Menu changes call the correct runtime control.
- Weather and phase overrides reach each new phase.
- The cloud value reaches scavenging and survival.
- Cloud profiles map calm, overcast, and squall correctly.
- Night disables volumetric rendering.
- Disabled clouds restore flat clouds.
- Quality changes update ray-step limits.
- Disposal removes and disposes each owned resource once.
- Optional setup failure preserves the base sky.

Run browser checks for these scenes:

- Calm day.
- Overcast day.
- Squall day.
- Night with the switch on.
- Scavenging and survival.
- Page reload after changing every persistent setting.

Inspect browser logs for shader errors.

Run the full Vitest suite, TypeScript checks, and the production build.

## Success Criteria

The feature succeeds when all conditions below are true:

- The default scene has no volumetric cloud cost.
- The cloud switch exists only in System Tuning.
- The switch persists after reload.
- Every other System Tuning setting persists after reload.
- Day clouds have clear volume, scale, light, and weather identity.
- Night shows no volumetric clouds.
- Flat clouds return after disablement or failure.
- Both playable phases use the same cloud system.
- Enabled clouds meet the agreed 1080p performance target.
- Tests and the production build pass.

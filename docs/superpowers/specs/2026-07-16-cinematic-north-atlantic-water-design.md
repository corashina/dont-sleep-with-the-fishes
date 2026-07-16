# Cinematic North Atlantic Water Design

- **Status:** Approved
- **Date:** 2026-07-16
- **Target:** Desktop web browser
- **Stack:** Vite, TypeScript, Three.js, Vitest
- **Scope:** Ocean surface rendering in scavenging and survival

## 1. Objective

The ocean should resemble cold, heavy North Atlantic water. Players should see layered chop, deep troughs, sharp reflections, broken crest foam, and a sun streak that changes with the weather. The surface must retain clear silhouettes around the ship and lifeboat.

The current ocean combines four displaced waves with three fragment-shader sine ripples. The large waves synchronize with CPU buoyancy, but the close surface repeats, the troughs lack depth, and the foam forms smooth procedural bands. The upgrade keeps the shared wave field and replaces the weak detail and lighting stages.

## 2. Chosen Approach

`OceanRenderer` will use a hybrid procedural shader. The vertex stage will retain the four waves from `DEFAULT_WAVES`. The fragment stage will add texture-free detail normals, atmospheric reflection, water-body absorption, two-scale highlights, and wind-broken foam.

This approach adds no runtime fetches, texture files, render targets, or third-party assets. Production keeps one ocean draw call and the existing `OceanRenderer` integration points.

## 3. Surface Geometry and Shared Motion

The CPU and GPU will continue to use `DEFAULT_WAVES`, the same elapsed time, and the same weather amplitude scale. `sampleWaveField()` and the lifeboat buoyancy path will remain unchanged. Large visible crests will therefore stay aligned with boat heave, pitch, roll, and drift.

The ocean plane will increase from 128 by 128 segments to 192 by 192 segments. The mesh will contain 73,728 triangles, enough to soften the 2.6-meter component at the current 180-meter plane size without creating a second mesh or a level-of-detail system. Camera-centered snapping, disabled frustum culling, hull exclusions, and shadow reception will retain their current behavior.

An exported immutable surface configuration will hold the segment count and detail fade distances. Tests can verify those quality settings without parsing shader source.

## 4. Procedural Detail Normals

The fragment shader will replace `rippleSlope()` with a multi-scale detail function. Two directional chop bands will cover medium ripples, and two finer bands will break their intersections. A low-frequency warp will bend the sampling coordinates so straight lines and short loops do not span the ocean plane.

Each band will use different directions, spatial frequencies, and speeds. The shader will combine analytic slopes into the geometric normal from the vertex stage. Large-wave displacement will remain the source of the silhouette; fragment detail will affect light only.

Detail strength will fade from full strength near the camera to zero near the fog-dominated distance. The fade will remove high-frequency horizon shimmer and keep the distant ocean broad and heavy. Weather amplitude will increase medium chop by a capped amount while preserving readable calm water.

## 5. Water Lighting and Color

The shader will keep the atmosphere uniforms supplied by `World` and `BoatWorld`. It will derive the reflected sky color from the reflected view ray, blending the shared horizon and sky colors. Fresnel reflection will become stronger at grazing angles and weaker when the player looks down into the water.

The water body will use the current deep and shallow palette with stronger absorption in troughs. Upward-facing, lit facets will admit more shallow color. Troughs and facets facing away from the light will retain the deep color. A restrained forward-scatter term will brighten thin crests during daylight.

The sun reflection will combine a narrow highlight with a broader, wind-stretched lobe. Fine detail normals will break both lobes into a moving streak. The existing sun color will continue to follow the sky palette across daylight, overcast weather, squalls, and night.

Fog will remain the final environmental blend before color-space conversion and ordered dithering. The ocean edge should merge with the procedural horizon in both game phases.

## 6. Crest Foam

Foam will use large-wave height, geometric slope, and two animated breakup fields. Height selects crests, slope identifies breaking faces, and the breakup fields split the result into wind-stretched patches. A second fine field will erode patch edges and prevent smooth bands.

Calm water will show sparse foam on the strongest crests. Increased weather amplitude will lower the breaking threshold and raise foam coverage within a cap. Foam will reduce the sun highlight beneath it and mix toward the existing desaturated foam color. It will not add geometry, particles, shoreline foam, hull wakes, or wake simulation.

## 7. Interfaces, Lifecycle, and Accessibility

The constructor, `update()`, `setExclusions()`, `follow()`, and `dispose()` signatures will stay unchanged. New shader uniforms will receive constructor defaults, and `update()` will continue to upload time, amplitude, fog, and atmosphere colors. `dispose()` will keep releasing the plane geometry and material once.

The ship and lifeboat exclusion matrices will keep discarding fragments inside their local hull bounds. The upgrade will not alter collision, buoyancy, interaction, or survival rules.

Reduced-motion mode will retain the current contract: it can suppress camera and boat presentation motion while the ocean continues to animate. Distance fading will limit fine shimmer for all players.

## 8. Performance Budget

The geometry increase raises the ocean from 32,768 to 73,728 triangles. The fragment shader adds arithmetic but no texture samples, render passes, allocations, or draw calls. The implementation will avoid dynamic loops beyond the existing fixed wave loop and fixed exclusion loop.

The browser review will check a mid-range desktop profile at 1280 by 720 and 1920 by 1080. If the shader causes a sustained frame-rate regression, tuning will reduce fine-band work before lowering large-wave mesh density.

## 9. Verification

Test-driven implementation will add focused tests before production changes. Tests will cover:

- the 192-segment surface quality contract and expected position count;
- new detail-fade uniforms and their configured ordering;
- retained time, amplitude, atmosphere, exclusion, follow, and disposal behavior;
- the shared wave-field contract between rendering and buoyancy.

The full verification run will execute `bun run test`, `bun run typecheck`, and `bun run build`. Browser checks will cover scavenging daylight and survival weather transitions. The reviewer will inspect near-water detail, distant shimmer, reflection continuity, crest breakup, hull exclusions, fog blending, and night readability.

## 10. Acceptance Criteria

1. Close water shows layered chop without obvious straight bands or short repeating loops.
2. Large waves remain synchronized with the lifeboat and retain the current weather response.
3. Troughs read deeper than lit crests, and grazing views reflect the shared sky and horizon.
4. Sunlight forms a broken moving streak instead of a single plastic highlight.
5. Foam appears as sparse irregular crest patches in calm water and gains capped coverage in rough weather.
6. Fine detail fades before the horizon and does not create persistent shimmer.
7. Hull exclusions, fog transitions, reduced-motion behavior, and renderer lifecycle contracts remain intact.
8. The ocean keeps one draw call and uses no runtime assets or extra reflection pass.
9. Focused tests, the full test suite, typecheck, build, and browser review pass.

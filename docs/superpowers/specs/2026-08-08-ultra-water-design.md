# Ultra Water Design

## Goal

Add an Ultra water setting with a more natural ocean surface.

Ultra targets strong desktop GPUs. It may cost up to twice as much as High.

Keep the illustrated maritime style. Use deep blue-green water, muted foam, and restrained highlights.

## Current System

`OceanRenderer` owns one procedural ocean material and two meshes.

Four shared waves drive surface displacement and buoyancy. Fragment shading adds detail normals, sky color, sun highlights, fog, and foam.

Low and High change mesh density, distance fades, colors, horizon fog, and shader features.

The water preference flows from `Game` through the active phase and world to `OceanRenderer`.

## Chosen Direction

Use a layered procedural shader.

Keep the four shared displacement waves. This keeps visible motion and buoyancy synchronized.

Add Ultra-only normal, lighting, absorption, and foam work. Do not add scene reflections or another render pass.

## Scope

This work will:

- Add `ultra` to `WaterQuality`.
- Add a third water quality button.
- Replace the binary quality control with a configurable quality control.
- Add Ultra geometry, color, fade, and fog values.
- Add an `ULTRA_QUALITY_WATER` shader branch.
- Add focused tests for preferences, controls, geometry, shader state, switching, and forwarding.

This work will not:

- Add live reflections of the boat, props, or events.
- Add refraction, depth textures, or underwater scene sampling.
- Add textures, packages, wakes, shore foam, or another render pass.
- Change the four shared waves or buoyancy results.
- Change Low or High rendering.
- Change the underwater menu water.

## Quality Model

Use these stored values:

- `low`
- `high`
- `ultra`

Keep Low as the default. Accept all three values from storage. Map every other value to Low.

Use the current `dont-sleep-with-the-fishes.water-quality` storage key.

## Quality Control

Replace `BinaryQualityControl` with a generic `QualityControl`.

The control receives an ordered list of allowed values and labels. It creates one button for each value.

`VisualQualityControl` supplies Low and High. `WaterQualityControl` supplies Low, High, and Ultra.

Keep the current fieldset, legend, selected state, keyboard focus, and `aria-pressed` behavior.

Use three equal columns for the water choices. Keep two equal columns for ambient occlusion.

Update the water note to describe Ultra as the natural, high-cost surface option.

Remove the obsolete `BinaryQualityControl` file and imports.

## Surface Preset

Add this Ultra surface preset:

| Setting | Ultra |
| --- | ---: |
| Surface segments | 384 |
| Near detail fade | 52 |
| Far detail fade | 160 |
| Surface extent | 180 |
| Horizon half extent | 1100 |
| Horizon radial segments | 96 |
| Horizon radial exponent | 1.75 |
| Horizon fog start | 210 |
| Horizon fog end | 820 |
| Horizon fog limit | 0.78 |

The 384 by 384 surface has about 1.78 times High's triangles.

The 96-ring horizon has about 1.77 times High's vertices.

Keep the current surface and horizon extents. Do not add distant geometry layers.

## Ultra Palette

Use these Ultra colors:

- Deep water: `0x062932`.
- Shallow water: `0x2f7377`.
- Foam: `0xc6cdc4`.

These colors replace High's bright turquoise only in Ultra.

Weather, sky, sun, and fog uniforms continue to affect the final color.

## Shader Variants

Low defines no quality symbol.

High defines `HIGH_QUALITY_WATER`.

Ultra defines both `HIGH_QUALITY_WATER` and `ULTRA_QUALITY_WATER`.

Ultra can reuse High calculations. Ultra-specific branches must replace High's final detail where stacking would over-brighten the surface.

Changing quality rebuilds both geometries. It also updates the colors, fades, fog values, and shader defines.

Set `material.needsUpdate` once after all defines change.

## Ultra Surface Detail

Keep the existing analytic derivatives from the four shared waves.

Add four finer procedural slope bands for Ultra. Align two bands with the wind and two across it.

Warp the bands with the existing wind field. Use different scales, speeds, and phases to prevent visible repetition.

Combine the Ultra slopes with the shared wave derivative before normal creation.

Scale micro-wave strength with weather amplitude. Calm water stays smooth. Rough water gains broken small waves.

Fade Ultra detail from 52 to 160 units. The horizon must remain calm and clean.

Use constants inside the compiled Ultra branch. Do not add per-frame setup or allocations.

## Reflection and Absorption

Keep the analytic sky and horizon reflection. Do not sample scene color.

Keep Schlick Fresnel with water's current base reflectance.

Derive surface roughness from macro slope, Ultra micro-slope, and weather strength.

Use roughness to soften the analytic sky reflection. Rough water blends toward a broad sky and horizon response.

Add angle-aware blue-green absorption to the water body. Long view paths and troughs become darker and less saturated.

Do not make the surface transparent. Do not reveal scene geometry below the water.

## Sun Response

Keep direct light controlled by the existing sun color and visibility values.

Use the Ultra roughness for a narrow sun core and a wider wind-shaped sheen.

Add small glints only where fine slopes face the sun. Suppress them during weak direct light.

Avoid uniform sparkle fields. The glints must follow wind direction and local slope.

## Foam

Keep foam tied to wave height, wave slope, procedural erosion, distance, and weather.

Ultra uses a separate final foam mix. It must not stack a brighter layer over High foam.

Reduce calm-water foam. Keep most foam on steep crests and short trailing streaks.

Stretch foam breakup along the wind. Use the current deterministic noise functions.

Use the muted Ultra foam color. Reserve the brightest values for small crest caps under direct light.

Fade fine foam before the far detail limit. Do not create bright horizon bands.

## Data Flow

The quality preference remains the single source of truth.

The flow remains:

`Game` -> active phase -> `World` or `BoatWorld` -> `OceanRenderer.setQuality`.

The current phase receives live changes. New phases read the stored value during construction.

Low, High, and Ultra use the same path. Do not add an Ultra-only world service.

## Runtime Safety

Build the next surface and horizon geometry before replacing current geometry.

If horizon creation fails, dispose the new surface. Keep the current meshes active.

Dispose replaced geometry after a successful swap.

Keep disposal idempotent after any quality change.

Mutate existing uniforms during each frame. Do not allocate objects in update or render paths.

## Performance Budget

Ultra must keep the existing surface and horizon draw calls. It must not add a scene render.

Ultra geometry must remain below twice High's geometry size.

Ultra may add four fine slope bands and the approved lighting work. Do not add an open-ended octave loop.

Fine detail and foam must reach zero by the 160-unit far detail limit.

## Tests

Add preference tests that verify Low, High, Ultra, and invalid stored values.

Add control tests that verify:

- Water shows Low, High, and Ultra.
- Ambient occlusion still shows Low and High.
- Clicking Ultra updates the preference and selected state.
- Invalid button values do not update the preference.

Update `OceanRenderer` tests to verify:

- All three surface presets create the expected geometry.
- Ultra stays below twice High's geometry size.
- Low has no quality define.
- High has only `HIGH_QUALITY_WATER`.
- Ultra has both quality defines.
- Low-to-Ultra and Ultra-to-High changes rebuild geometry and update uniforms.
- Disposal remains safe after Ultra changes.

Update `GameLifecycle` to click Ultra and expect `setWaterQuality('ultra')`.

Update `world` and `BoatWorld` forwarding tests to send and expect Ultra.

Run focused tests, the full test suite, type checking, and the production build.

## Visual Verification

Inspect Ultra in both gameplay worlds.

Check calm day, rough day, calm night, and storm conditions.

Check close water, the ship edge, the lifeboat edge, and the full horizon.

Confirm these results:

- The water reads as deep blue-green instead of bright turquoise.
- Small waves vary in direction and scale without visible tiling.
- Calm water stays dark and restrained.
- Rough water gains broken detail without noisy shimmer.
- Foam follows steep crests and does not cover calm water.
- Sun glints follow local slopes and disappear with weak sunlight.
- The horizon remains smooth and blends into the atmosphere.
- Low and High look unchanged.

## Acceptance Criteria

- The water control offers Low, High, and Ultra.
- Ultra persists and applies in both gameplay phases.
- Ultra uses no live scene reflections or extra render pass.
- Buoyancy remains identical across water quality levels.
- Ultra geometry stays below twice High's size.
- Ultra matches the natural ocean direction and visual style guide.
- The full test suite, type check, and production build pass.

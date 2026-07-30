# Ocean Horizon Haze Design

## Goal

Hide the abrupt flat water band near the horizon.

Keep the near water clear and active.

Add no geometry, texture, render pass, draw call, or frame allocation.

## Visual direction

Use distance and weather to strengthen maritime isolation.

The haze supports the broad sea and quiet horizon.

It does not replace the authored waves, lighting, or material.

## Current cause

The near ocean grid ends 90 units from its center.

The horizon ring uses much wider cells after this join.

These cells cannot show the short shared waves with the same shape.

Medium ripple shading also fades to zero near the grid join.

Final ocean fog targets the darker fog color.

The sky uses the lighter horizon color at the water line.

These changes make a flat, dark band below the horizon.

## Chosen approach

Add an ocean-only horizon haze ramp to the current fog target.

The ramp starts near the grid join.

It moves the far ocean fog color toward the sky horizon color.

The existing exponential fog still controls the final distance fade.

Keep a small floor under the existing medium ripple shading.

The floor uses ripple work that the shader already calculates.

## Quality settings

Use one reusable `Vector3` uniform for haze start, end, and strength.

Use one number uniform for the distant detail floor.

Use these values:

| Quality | Start | End | Strength | Detail floor |
| --- | ---: | ---: | ---: | ---: |
| Low | 85 | 260 | 1 | 0.11 |
| High | 100 | 320 | 1 | 0.08 |

Use `smoothstep` between the start and end distances.

Keep haze at zero before the start distance.

Cap haze at the quality strength after the end distance.

## Shader flow

Calculate water color, reflections, light, and foam as now.

Calculate the horizon haze from `vViewDepth`.

Blend the fog target from fog color toward horizon color.

Apply the existing exponential fog with this target.

Keep the medium ripple slope above the quality detail floor.

Keep the current ordered dither after fog.

## Ownership

`OceanRenderer` owns both distance uniforms with its water uniforms.

The constructor creates each uniform once.

`setQuality` updates both existing uniforms.

`dispose` needs no new work because the material owns the uniform.

## Shared wave contract

Do not change `WaveField`, wave displacement, buoyancy, or vessel motion.

The shared wave field stays the source for all water movement.

The change affects only distant water color and rendered normal detail.

## Performance

The shader adds one detail mix and one fog-target color mix.

The shader already calculates all retained ripple waves.

The change adds no CPU work in the frame loop.

The change keeps both ocean meshes and their vertex counts unchanged.

The change keeps one water material and the current draw calls.

## Tests

Add tests for both quality distance settings.

Check that quality changes update both uniforms.

Check that disposal remains safe after a quality change.

Run the focused ocean and world tests.

Run the full test suite and production build.

Compare clear-day screenshots before and after the change.

Confirm that the grid join no longer reads as a flat band.

Confirm that near waves, foam, weather fog, and horizon color stay readable.

## Scope

Change only the ocean shader, water quality settings, and related tests.

Do not change mesh density, camera range, sky geometry, or post-processing.

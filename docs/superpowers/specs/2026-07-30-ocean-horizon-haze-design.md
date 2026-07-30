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

The change in surface detail makes the far water look flat.

## Chosen approach

Add an ocean-only horizon haze ramp to the current fragment shader.

The ramp starts before the near grid ends.

It reduces contrast across the grid join.

The existing exponential fog still controls the final distance fade.

The haze color mixes the current fog color with 22 percent horizon color.

The existing fog then fades the result to the exact scene fog color.

## Quality settings

Use one reusable `Vector3` uniform for start distance, end distance, and strength.

Use these values:

| Quality | Start | End | Strength |
| --- | ---: | ---: | ---: |
| Low | 55 | 180 | 0.76 |
| High | 65 | 220 | 0.65 |

Use `smoothstep` between the start and end distances.

Keep haze at zero before the start distance.

Cap haze at the quality strength after the end distance.

## Shader flow

Calculate water color, reflections, light, and foam as now.

Calculate the horizon haze from `vViewDepth`.

Blend the water toward the haze color with the horizon haze.

Apply the existing exponential fog after the haze.

Keep the current ordered dither after fog.

## Ownership

`OceanRenderer` owns the haze uniform with its other water uniforms.

The constructor creates the uniform once.

`setQuality` updates the existing uniform in place.

`dispose` needs no new work because the material owns the uniform.

## Shared wave contract

Do not change `WaveField`, wave displacement, buoyancy, or vessel motion.

The shared wave field stays the source for all water movement.

The change affects only distant water color.

## Performance

The shader adds one `smoothstep`, one fixed color mix, and one color blend.

The change adds no CPU work in the frame loop.

The change keeps both ocean meshes and their vertex counts unchanged.

The change keeps one water material and the current draw calls.

## Tests

Add tests for both quality haze settings.

Check that quality changes update the existing uniform object.

Check that disposal remains safe after a quality change.

Run the focused ocean and world tests.

Run the full test suite and production build.

Compare clear-day screenshots before and after the change.

Confirm that the grid join no longer reads as a flat band.

Confirm that near waves, foam, weather fog, and horizon color stay readable.

## Scope

Change only the ocean shader, water quality settings, and related tests.

Do not change mesh density, camera range, sky geometry, or post-processing.

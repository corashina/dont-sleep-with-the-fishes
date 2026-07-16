# Lifeboat Water Exclusion Shape Design

## Goal

Remove the rectangular gap in the ocean around the lifeboat. Water should meet the rounded hull in both scavenging and survival while remaining hidden beneath the boat interior and hull seams.

## Root Cause

`OceanRenderer` tests each water fragment against axis-aligned rectangular bounds after transforming the fragment into vessel-local space. The lifeboat exclusion spans the boat's full width and length, so the shader also discards water in the four corners outside the tapered bow and stern. The boat geometry narrows from a half-width of about `1.6` near the middle to about `0.34` at each end, but the exclusion keeps a half-width of `1.6` across its full length.

## Selected Approach

Keep the freighter exclusion rectangular and add an analytic rounded-hull profile for the lifeboat. The profile keeps the current full half-width through the middle, then reduces the permitted half-width along an elliptical curve between a named taper start and each end.

For a local fragment at `z`, the shader will:

1. Keep the full exclusion width while `abs(z)` is at or below the taper start.
2. Normalize the remaining distance to the bow or stern into `t` from `0` to `1`.
3. Compute the local half-width as `halfWidth * sqrt(1 - t * t)`.
4. Discard the fragment only when its local `x` lies inside that width and its local `z` lies inside the exclusion length.

The lifeboat will expose `halfWidth`, `halfLength`, and `taperStart` as one water-exclusion definition. The taper will start `1.05` units from the boat center, where the hull stations begin their clear narrowing toward each end. Both `World` and `BoatWorld` will pass that definition to the shared ocean renderer, so scavenging and survival use the same mask.

## Renderer and Data Flow

`WaterExclusionRegion` will carry the vessel transform, rectangular bounds, and taper start. A rectangular exclusion will use its half-length as the taper start, preserving the current freighter result. `OceanRenderer.setExclusions` will upload one taper value for each of its two fixed exclusion slots and reset unused slots with the other inactive defaults.

Each frame, the owning world updates the vessel transform, creates the local exclusion region, and uploads it before rendering. The existing world-to-local matrix continues to account for translation, pitch, roll, scale, and parent transforms. The new profile changes only the local containment test.

## Constraints and Failure Handling

- Keep the two-slot shader limit.
- Keep rectangle behavior as the default for existing callers.
- Clamp the square-root input to zero in GLSL to avoid precision-related negative values at the profile ends.
- Reset unused taper uniforms when exclusions become inactive.
- Do not add render passes, stencil buffers, meshes, or third-party assets.

## Tests

Automated tests will cover:

- unchanged rectangular containment for the freighter;
- full-width containment near the lifeboat middle;
- containment beneath the tapered bow and stern;
- rejection of points in the former rectangular corner gaps;
- transformed containment under vessel movement, rotation, and parent scaling;
- upload and reset of taper uniforms;
- matching lifeboat exclusion data in scavenging and survival.

The implementation will start with a failing regression test for a former corner point that the rectangular mask treats as excluded.

## Visual Verification

Run the game in a browser and inspect the lifeboat during scavenging and survival. Check representative wave crests and boat tilts from the side and diagonal angles. Water must reach the rounded bow and stern without exposing water through the floor or the hull seams.

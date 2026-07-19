# Survival Low-Buoyancy Comfort Design

## Goal

Reduce survival-phase vessel and camera motion enough to prevent sea-sickness while keeping the ocean active and the lifeboat connected to the shared wave field.

## Motion Profile

The survival lifeboat will retain 3 percent of the sampled heave and lateral drift. It will retain 1 percent of the sampled pitch and roll. The fixed `SURVIVAL_BOAT_ANCHOR` height remains unchanged, so the hull keeps its authored waterline.

Weather will continue to select the existing wave-amplitude scale. Calm, overcast, and squall conditions will therefore keep distinct motion, but the comfort profile will attenuate the final survival target before damping.

The ocean renderer will continue to use the full weather amplitude. Scavenging buoyancy will keep its current behavior.

## Architecture

Add a small survival-owned motion module with these responsibilities:

- Export the translation scale of `0.03` and rotation scale of `0.01`.
- Write an attenuated `BoatPose` into a caller-owned output record.
- Scale `y`, `driftX`, and `driftZ` by the translation scale.
- Scale `pitch` and `roll` by the rotation scale.

`BoatWorld` will own one reusable raw target pose and one reusable attenuated target pose. Each update will follow this path:

1. Sample `BoatBuoyancy` from the shared wave field with the current weather amplitude.
2. Apply the survival comfort profile to the sampled target.
3. Smooth the current pose toward the attenuated target with the existing damping value of `7`.
4. Apply the result to the existing motion rig.

The camera, lifeboat, and recovered items will remain children of that rig. Their relative transforms and interaction projections will stay aligned.

## Reduced Motion and Secondary Effects

The comfort profile will apply in all survival sessions. The existing reduced-motion path will continue to suppress spray and rope lag. Pointer parallax and the current cue-specific reduced-motion rules will remain unchanged.

## Performance and Ownership

The comfort transform will use caller-owned pose records and perform no per-frame allocations. `BoatWorld` will own those records. The change will add no Three.js resources, listeners, or disposal steps.

## Testing

Unit tests will verify the exact 3 percent translation and 1 percent rotation values, including writes into the caller-owned output record.

`BoatWorld` tests will calculate the shared-wave target, apply the comfort profile, apply the existing smoothing step, and compare the motion rig with that expected pose. A weather test will confirm that squall motion remains stronger than calm motion after attenuation.

The existing `BoatBuoyancy`, scavenging world, reduced-motion, interaction, typecheck, and build checks will guard unchanged behavior outside the survival comfort layer.

## Scope

This change affects survival vessel motion and the attached survival camera. It does not alter wave rendering, scavenging motion, weather rules, gameplay state, item layouts, controls, assets, or save data.

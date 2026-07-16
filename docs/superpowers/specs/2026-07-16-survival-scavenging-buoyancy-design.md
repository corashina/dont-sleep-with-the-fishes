# Survival Scavenging Buoyancy Parity

- **Status:** Approved
- **Date:** 2026-07-16
- **Target:** Desktop web browser
- **Stack:** Vite, TypeScript, Three.js, Vitest

## Objective

The survival lifeboat must use the same wave-derived buoyancy as the scavenging lifeboat. The boat, recovered items, and player viewpoint must share one floating pose.

## Design

`BoatWorld` will use `BoatBuoyancy`, `sampleWaveField(DEFAULT_WAVES, ...)`, and `smoothBoatPose(..., 7)` as `World` does. It will sample at the survival boat anchor, preserve the survival scene's base vertical offset, and apply the resulting position and rotation to `boat-motion-rig`.

The motion rig already owns the lifeboat and camera rig. Recovered items remain children of the lifeboat storage root, and the camera remains a child of the camera rig. All three therefore inherit the same heave, pitch, roll, and normal-derived lateral drift. Survival will remove its separate yaw drift and rider compensation so the player no longer counters the lifeboat pose.

Pointer parallax and presentation cues continue after the shared boat pose. The water exclusion and interaction-anchor projection continue to use the final lifeboat world transform.

The survival scene will follow scavenging's buoyancy even when reduced motion is enabled. Reduced motion still suppresses optional secondary effects such as bow spray.

## Module Changes

- `src/survival/BoatWorld.ts` will own a `BoatBuoyancy` instance and its current `BoatPose`.
- It will replace the `BoatDriftMotion` frame update with the same target sampling and smoothing sequence used by `src/world/World.ts`.
- `BoatDriftMotion` will no longer drive survival rendering. Remove it and its dedicated tests if no remaining consumer needs it.
- Preserve the existing `motionRig -> lifeboat` and `motionRig -> cameraRig -> camera` hierarchy. No item transforms, models, or survival rules change.

## Verification

Tests will prove that survival:

- applies the same `BoatBuoyancy` target and smoothing result as scavenging for the same time, anchor, and amplitude scale;
- moves the motion rig and player camera together without counter-motion;
- keeps stored props at their authored local transforms while they inherit the boat world transform;
- updates water exclusion and interaction anchors from the moving hull;
- preserves reduced-motion suppression for optional spray;
- removes the retired survival-only drift solver from production use.

Run `bun run test`, `bun run typecheck`, and `bun run build`. Inspect both phases in the browser to confirm that their lifeboats follow the same wave response and that survival item controls remain usable.

## Acceptance Criteria

1. Survival and scavenging use the same shared-wave buoyancy calculation and damping.
2. In survival, the boat, recovered items, and player viewpoint float together.
3. Survival does not apply rider counter-motion or independent yaw.
4. Water exclusion and item interaction targets follow the final moving hull pose.
5. Optional effects remain compatible with `prefers-reduced-motion`.

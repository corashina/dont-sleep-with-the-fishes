# Survival Boat Drift Motion Design

- **Status:** Approved
- **Date:** 2026-07-14
- **Target:** Desktop web browser
- **Stack:** Vite, TypeScript, Three.js, Vitest
- **Scope:** Survival-phase motion and visual feedback

## 1. Objective

The survival lifeboat should feel afloat during calm play without distracting the player from reading or selecting supplies. The player should notice the drift within several seconds. Weather can increase the hull response, but the camera must remain comfortable.

The current `BoatWorld` samples the shared wave field and applies heave, pitch, and roll to a `motionRig`. The lifeboat, recovered supplies, and camera share that parent. The hierarchy keeps the supplies secured, but it also removes close-range relative motion between the camera and boat. This change keeps the rigid boat hierarchy and adds restrained rider compensation plus a few environmental cues.

## 2. Scope

The change includes:

- four-point wave sampling across the lifeboat footprint;
- damped heave, pitch, roll, and small yaw drift for the boat;
- damped rider compensation on the camera rig;
- pooled bow foam or spray cues;
- small lag on the fishing line and optional loose-rope details;
- weather response and reduced-motion handling;
- tests and browser checks for motion, interaction, water exclusion, and cleanup.

The change excludes loose-item physics, steering, rowing, audio, large world-space drift, and changes to survival rules. Recovered supplies and mounted paddles stay rigidly attached to the lifeboat.

## 3. Scene Hierarchy and Ownership

`BoatWorld` keeps the current scene hierarchy:

```text
motionRig
|-- lifeboat
|   `-- recovered supplies
`-- cameraRig
    `-- camera
```

`motionRig` receives the hull pose. The lifeboat and its descendants inherit the same transform, so recovered supplies retain their authored transforms relative to the storage root. `cameraRig` receives rider compensation after the hull pose. Pointer parallax remains the last camera-orientation layer.

A new `BoatDriftMotion` module owns the motion calculation and smoothing state. It accepts wave samples, weather, elapsed time, frame delta, and reduced-motion state. It returns a boat pose and rider pose without touching Three.js objects. `BoatWorld` applies those poses, manages pooled cue objects, composes presentation cues, and disposes its resources.

## 4. Hull Sampling and Boat Pose

The motion solver samples the shared wave field beneath four points tied to the hull footprint:

- bow and stern samples produce pitch;
- port and starboard samples produce roll.

The solver averages the four heights for heave. It derives pitch and roll from height differences across the sample baselines. The solver uses the same `DEFAULT_WAVES`, clock, and weather amplitude scale as `OceanRenderer`, so the hull response matches the rendered surface.

Spring damping filters high-frequency ripples. The solver clamps frame delta before integration and caps each output channel. Calm water keeps a low but nonzero response. Overcast weather raises the response. Squalls produce the strongest hull motion.

The solver adds a low-frequency yaw term with a maximum magnitude near 0.5 degrees. This term produces a sense of drift without moving the boat away from the interaction scene or water exclusion. The yaw signal combines two frequencies to avoid a short, obvious loop.

## 5. Rider Compensation

The rider pose applies to `cameraRig`. It counteracts about 10 to 15 percent of the boat pitch and roll through a slower damped response. The delay lets the gunwales, recovered supplies, and paddles move within the frame while the horizon stays comfortable.

The rider limits are:

- about 1 degree of relative pitch or roll;
- a few centimeters of vertical lag;
- no extra rider yaw beyond the small response needed to soften hull yaw.

The exact constants live in one exported configuration object so browser tuning does not require edits to integration code. The solver initializes its current state from the first sample to avoid an entrance jerk. It clamps long frame gaps and resumes from the current pose after a hidden tab.

Pointer parallax remains independent. `BoatWorld` applies the base camera quaternion, then rider compensation, then the existing clamped pointer rotation. Action and event presentation cues add their offsets after the base motion. A completed cue cannot change the stored base drift state.

## 6. Environmental Cues

`BoatWorld` creates a fixed pool of small foam or spray particles near the bow. A bow sample rising relative to the hull can trigger a short burst after a cooldown. Weather controls burst rate and intensity. Calm weather produces sparse cues, while a squall produces more visible spray.

The pool allocates its geometry, material, and particle state during construction. Frame updates reuse those resources. `dispose()` releases each resource once.

The fishing line uses a short pendulum-style lag derived from boat angular velocity. Its rotation stays within a small limit. `BoatWorld` may apply the same lag to up to two named loose-rope meshes if the lifeboat builder exposes suitable details. Secured paddle lashings, recovered supplies, and mounted paddles receive no secondary motion.

No new asset files or third-party materials enter the project.

## 7. Weather and Reduced Motion

The existing weather amplitude scale remains the source for ocean and hull strength:

- calm keeps continuous low motion;
- overcast adds a moderate response;
- squall increases hull motion and spray.

Rider compensation keeps the same comfort caps across weather states. A squall therefore moves the boat more than the player view.

If `prefers-reduced-motion` matches, `BoatDriftMotion` returns neutral boat and rider poses. `BoatWorld` hides transient spray and resets rope offsets. The ocean shader continues to animate. This preserves the current reduced-motion contract.

## 8. Frame Update Order

`BoatWorld.update()` performs motion and presentation work in this order:

1. Resolve the weather amplitude scale and sample the wave field.
2. Advance the boat and rider solver state.
3. Apply `motionRig` and `cameraRig` base transforms.
4. Apply pointer parallax and active presentation cues.
5. Update rope and pooled spray cues.
6. Update the sky, lighting, and ocean.
7. Refresh scene matrices and the lifeboat water-exclusion transform.
8. Let the survival phase project interaction anchors from the final transforms.

This order keeps the ocean, hull, water mask, and interaction targets in the same rendered pose.

## 9. Failure and Lifecycle Behavior

The motion system has no loading or network failure path. Missing optional rope objects disable their secondary cue without stopping the survival phase. A missing required boat root remains a construction error covered by existing boat tests.

`BoatWorld.dispose()` removes the spray pool, releases owned geometry and materials once, clears motion state, and restores the shared camera. Repeated disposal remains safe. The solver performs no per-frame allocation that grows with play time.

## 10. Verification

Unit tests cover:

- deterministic four-point sampling and pose calculation;
- pitch and roll signs for known sample heights;
- weather-scaled hull response;
- damping, delta clamping, and configured motion limits;
- rider compensation fraction and comfort caps;
- neutral output and reset behavior under reduced motion;
- unchanged recovered-item transforms relative to the lifeboat;
- presentation cues returning to the current drift pose;
- water exclusion following the final moving hull transform;
- fixed spray-pool capacity and exact resource disposal.

Integration tests project all supported interaction anchors at the motion envelope and confirm that each control remains inside the viewport and usable. Existing item separation requirements still apply.

Browser checks run at 1280 by 720 and 1920 by 1080 in calm, overcast, squall, and reduced-motion states. The checks include mouse hover and keyboard focus on recovered supplies. The reviewer confirms:

- calm motion reads within several seconds;
- the camera remains comfortable during a squall;
- gunwales and supplies show restrained movement within the frame;
- spray and rope cues support the hull motion without drawing focus;
- tooltips track their targets;
- water stays outside the hull;
- reduced-motion mode keeps the composition still while the ocean moves.

Run `bun run test`, `bun run typecheck`, and `bun run build` after implementation.

## 11. Acceptance Criteria

The feature meets the design when:

1. Calm survival produces continuous, perceptible drift without disrupting reading or item selection.
2. The lifeboat pose comes from four shared-wave samples across its footprint.
3. The camera compensates for a capped fraction of hull motion and gives nearby boat details visible relative movement.
4. Recovered supplies retain their authored transforms and require no physics simulation.
5. Weather increases hull response while rider motion stays within comfort caps.
6. Bow spray and fishing-line lag provide restrained secondary cues with fixed resource pools.
7. Water exclusion and interaction anchors follow the final rendered pose.
8. Reduced-motion mode disables boat, rider, spray, and rope motion while retaining ocean animation.
9. Automated tests, browser checks, typecheck, and production build pass.

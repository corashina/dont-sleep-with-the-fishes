# Sinking Water and Barrel Fix Design

## Goal

Remove the empty ocean hole after Dorothy sinks.

Make the two deck barrels follow Dorothy during the ending.

## Current problems

The ocean shader removes water inside Dorothy's hull cutout.

The cutout checks its lower height only. It follows Dorothy below the water.

The water plane stays removed after Dorothy passes below it.

The physics barrels use world-space poses. The ending pauses their physics.

The barrels keep their last world poses while Dorothy moves away.

## Water behavior

Keep the hull cutout while the water intersects Dorothy's hull.

Use the existing lower and upper hull heights as cutout limits.

Discard water only when its ship-local height is inside these limits.

Stop the cutout when the water rises above the upper hull height.

This lets water cover the deck and close behind Dorothy.

Keep the lifeboat cutout behavior unchanged.

## Barrel behavior

Run one barrel transition when the sinking cinematic starts.

Keep each barrel's current world pose during the transition.

Attach each barrel to Dorothy with Three.js scene attachment.

The attachment converts each world pose to a ship-local pose.

Keep scavenging physics paused during the cinematic.

Dorothy's keyed motion then carries both barrels underwater.

Do not resume barrel physics after attachment.

The phase ends after the ending screen. A restart builds new barrel physics.

## Ownership

`World` owns the barrel transition and all barrel objects.

`ScavengePhase` requests the transition once when failure starts.

`ScavengePhysics` keeps ownership of its Rapier bodies until disposal.

The transition does not create or destroy a physics body.

World disposal removes each barrel and physics resource once.

## Frame-path limits

The water shader uses existing uniforms.

The barrel transition runs once. It does not run each frame.

No new per-frame object, vector, matrix, or array allocation is allowed.

## Verification

Tests confirm these behaviors:

- Water stays excluded while it intersects Dorothy's hull.
- Water is visible after it passes above the upper hull height.
- The lifeboat cutout stays unchanged.
- Each barrel keeps its world pose during attachment.
- Each attached barrel follows Dorothy's sinking transform.
- Barrel physics stays paused during the cinematic.
- A repeated transition request has no effect.
- Restart and disposal remove each barrel once.
- The full test suite passes.
- Typecheck and production build pass.

## Out of scope

- Active barrel physics during the cinematic
- Keyed barrel sliding or rolling
- New splash, foam, or barrel effects
- Lifeboat water-cutout changes
- Reduced-motion behavior

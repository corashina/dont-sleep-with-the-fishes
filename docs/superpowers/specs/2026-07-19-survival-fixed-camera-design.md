# Survival Fixed Camera Design

## Goal

Keep the survival lifeboat camera at its authored forward view. Survival does
not respond to cursor position or pointer movement. Scavenging keeps its
separate first-person look controls.

## Ownership

- `BoatWorld` owns the base camera pose, lifeboat motion, and cinematic camera
  cues.
- `SurvivalPhase` has no camera-input callback.
- `SurvivalUI` has no global pointer listener or pointer callback.

## Behavior

The survival camera retains its base local rotation while the boat continues
to float beneath it. Existing action cues may use their authored camera
transforms. Reduced motion continues to affect optional visual motion; it
does not add a cursor-look mode.

## Testing

- Remove the cursor-target, damping, and reduced-motion look tests.
- Prove a survival world keeps its authored camera rotation through normal
  updates and exposes no `setPointer` input API.
- Remove obsolete UI and phase pointer-wiring coverage.

## Out of Scope

This change does not alter scavenging controls, boat buoyancy, cinematic
cues, UI layout, or pointer lock.

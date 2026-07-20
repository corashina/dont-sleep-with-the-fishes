# Survival Look Cone and Damping Design

> Superseded by [Survival Fixed Camera Design](./2026-07-19-survival-fixed-camera-design.md).

## Goal

Restore unrestricted first-person camera control to scavenging and give the
survival lifeboat a damped, forward-facing cursor look. Survival must retain
normal cursor interaction with its UI; it must not request pointer lock.

## Phase ownership

- `PlayerController` owns scavenging view rotation. It restores the prior
  free yaw behavior and retains its existing pitch safety clamp of `[-1.35,
  1.35]` radians.
- `BoatWorld` owns the survival cursor target and its current, damped camera
  offset. `SurvivalPhase` continues only to normalize cursor coordinates and
  call `BoatWorld.setPointer`.

## Survival camera behavior

Normalized cursor coordinates are clamped to `[-1, 1]` before use. The
existing cursor-axis mapping is preserved, but the target limits become:

- yaw: `[-PI / 4, PI / 4]` (90 degrees total);
- pitch: `[-PI / 8, PI / 8]` (45 degrees total).

`BoatWorld` keeps a current yaw and pitch offset separate from the target.
Each `update(time, delta)` advances each current offset toward its target with
the frame-rate-independent exponential response
`current = target + (current - target) * exp(-10 * delta)`.
The offset therefore approaches the target without overshooting and reaches
about 95% of a new target in 0.3 seconds. The base lifeboat camera rotation is
then composed with the current damped offsets when presentation is applied.

When `prefers-reduced-motion` matches, cursor look remains available within
the same limits but reaches its target immediately, without damped movement.
Buoyancy and required presentation cues are not changed.

## Testing

- Restore the existing scavenging pitch boundary tests and free-yaw movement
  coverage; remove the accidental scavenging look-cone assertions.
- Verify survival cursor targets clamp at the 90-by-45-degree limits, and
  that reduced motion applies the same target immediately.
- Verify a survival update moves the camera toward, but not beyond, a target;
  successive updates converge on the target.
- Retain existing survival pointer wiring and camera/buoyancy ownership tests.

## Out of scope

No pointer lock, mobile/touch controls, camera shake changes, UI layout
changes, or alterations to boat buoyancy are included.

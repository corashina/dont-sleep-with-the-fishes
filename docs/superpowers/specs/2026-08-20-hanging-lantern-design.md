# Hanging Lantern Design

## Status

Approved in chat on 2026-08-20.

## Purpose

Add a second lantern above the seated player in the survival lifeboat.
Mount it on a bent wooden pole fixed to the center of the stern.
The lantern swings with boat motion and weather.
Its moving light changes shadows inside the boat.

## Goals

- Keep the current starboard lantern and its End Day action.
- Add one non-interactive hanging lantern.
- Reuse the current lantern model.
- Mount the pole at the center of the stern, behind the player.
- Bend the pole forward over the player's head.
- Keep part of the lantern visible near the screen's upper center.
- Simulate a damped spherical pendulum without collisions.
- Increase swing strength during wind, waves, squalls, and storms.
- Cast moving shadows on the boat, supplies, and equipment.
- Avoid allocations and repeated setup during frame updates.

## Non-goals

- Do not move or replace the current End Day lantern.
- Do not add another interaction anchor.
- Do not add lantern collisions.
- Do not add a survival Rapier world.
- Do not add damage, breakage, fuel, or extinguishing rules.
- Do not add reduced-motion behavior.

## Architecture

Add `src/survival/HangingLantern.ts`.

The component owns the pole, mount, hanging line, lantern model, point light,
pendulum state, and all related render resources. It exposes its root group,
an allocation-free update operation, and an idempotent dispose operation.

`BoatWorld` creates the component with a second
`propModels.createPracticalLight('lantern')` model. It attaches the component
to the lifeboat. Each scene update passes the boat pose, presentation weather,
elapsed time, and frame delta to the component.

The current `SurvivalLantern` remains unchanged. It keeps the only lantern
interaction anchor and the End Day action.

## Pole and mounting

Place the mount at the center of the stern, behind the base camera position.
Start the pole inside the boat. Raise it vertically behind the player, then
bend it forward over the camera.

Build a low-poly, uneven wooden pole with a clear curved silhouette. Add a
fixed base, binding straps, and a short hanging line. Use worn wood and dark
metal or rope materials. The construction must show believable weight and
attachment at normal play distance.

The short line hangs from the pole tip. The lantern pivot begins at the line's
upper end. Keep enough vertical clearance for the maximum swing angle. The
lantern must not touch the pole, player position, or boat.

## Pendulum motion

Use a two-axis damped spherical pendulum. Store two angles and two angular
velocities. Gravity restores the lantern toward the downward rest pose.
Damping removes energy over time without stopping the ambient motion.

Drive the pendulum with these existing signals:

- boat pitch and roll changes;
- boat drift changes;
- presentation weather wave scale;
- presentation weather spray intensity;
- a deterministic low-frequency gust signal based on elapsed time.

Calm weather produces a small continuous swing. Overcast and rain increase it
slightly. Wind, squalls, waves, and thunderstorms produce the strongest
motion. Weather changes alter force continuously and never reset the pose.

Use semi-implicit integration. Cap processed frame time at 0.1 seconds. Split
it into steps no larger than 1/120 second. Clamp the combined two-axis swing
to exactly 20 degrees. Keep all vectors, state objects, and temporary values
on the component. Do not allocate during updates.

The component inherits the lifeboat transform. Its local pendulum motion adds
lag and sway relative to the moving boat.

## Camera and composition

Place the rest pose slightly ahead of the base survival camera. Show the lower
part of the lantern near the upper center of the screen. Keep the main center
view open.

Tune the pole curve, line length, and lantern rest position against the base
camera. At rest, the projected lantern center must have normalized device
coordinates from -0.12 through 0.12 on X and 0.55 through 0.9 on Y. Strong
weather may move it farther, but it must remain readable and avoid the main
interaction area.

Special event and fishing cameras may show a different part of the assembly.
Do not add camera-specific hiding or replacement paths.

## Light and shadows

Place a warm point light inside the hanging lantern. Parent it to the moving
lantern pivot so its transform follows every swing.

Use separate day and night intensities. Keep daytime light visible but weaker.
Increase it at night. Tune both values beside the existing starboard lantern
so the boat does not become overexposed.

Enable dynamic shadows on the hanging light. Use a 512-by-512 shadow map and
tight near, far, bias, and normal-bias values. Keep the light range limited to
the lifeboat interior.

Make the lantern material warm and emissive. Let the flame light escape from
the single opaque source mesh. The pole, mount, boat, supplies, and equipment
use their existing shadow settings. Adjust focused receivers only when a
moving shadow is otherwise not visible.

## Lifecycle and failure handling

Create the hanging lantern inside the existing guarded `BoatWorld`
constructor path. If later scene setup fails, dispose its light shadow,
geometry, materials, and model resources.

`dispose()` is safe to call more than once. It clears the component root after
owned resources are released. An update after disposal does nothing.

Large frame deltas use bounded substeps and angle limits. They cannot create
an invalid pose or unbounded velocity.

## Tests

Add focused unit tests for `HangingLantern` and integration tests for
`BoatWorld`.

Test these behaviors:

- The pole mount is centered on the stern.
- The lantern hangs below the pole tip.
- The rest pose clears the pole and boat.
- Calm weather produces a small swing.
- Wind, waves, and thunderstorms produce more motion than calm weather.
- Boat pitch, roll, and drift changes drive the pendulum.
- Large frame deltas remain finite and respect the angle limit.
- The point light follows the lantern pivot.
- The light is warm, shadow-casting, and uses a 512 shadow map.
- Night intensity exceeds day intensity.
- The base camera projects the lantern near the upper screen center.
- Strong swing does not enter the boat clearance area.
- Only the existing starboard lantern publishes the End Day anchor.
- Constructor failure and normal disposal release every owned resource.
- Updates after disposal do not change the component.

Run the focused lantern and `BoatWorld` tests first. Then run typecheck, the
full test suite, and the production build.

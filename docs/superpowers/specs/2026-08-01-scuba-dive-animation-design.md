# Scuba Dive Animation Design

## Goal

Replace the short dive cue with a first-person scuba sequence.

The sequence moves the player to the starboard seat. It shows goggles, a backward water entry, bubbles, and a result popup.

The full sequence takes about 7.5 seconds before the result appears.

## Scope

This work changes the daytime `dive` presentation.

It does not change dive costs, odds, rewards, injury rules, or weather limits.

It does not add a player model, hands, or a third-person view.

## Visual direction

The sequence follows the visual style guide.

It uses authored keyed motion with anticipation, decisive travel, impact, and clean restoration.

The goggles use an irregular rubber rim and two muted glass panes. The shape stays clear and restrained.

The underwater view uses cool cyan fog and rising bubbles. It hides the boat and horizon.

The goggles can frame the underwater view. No boat prop remains visible after water entry.

The result uses a compact ink-backed popup. The world remains the main visual subject.

## Player sequence

The sequence uses these timed beats:

1. From 0.0 to 1.1 seconds, hide the scuba set and move the camera to the starboard seat.
2. From 1.1 to 2.2 seconds, raise the goggles and settle them over the lens.
3. From 2.2 to 3.6 seconds, lean backward and roll the horizon overhead.
4. At 3.6 seconds, cross the shared water height and play the entry splash.
5. From 3.6 to 5.8 seconds, show only underwater color, the goggle frame, and many bubbles.
6. From 5.8 to 6.55 seconds, fade the event cover to black.
7. From 6.55 to 6.8 seconds, reset the scene while the cover is opaque.
8. From 6.8 to 7.55 seconds, fade back to the normal seated view.
9. At 7.55 seconds, show the dive result popup.

The starboard camera move uses the fishing transition curve and 1.1-second duration.

The backward roll resembles the start of a backflip. It stops after water entry.

The dive cover uses the event cover appearance. A shorter dive profile keeps the total duration near 7.5 seconds.

## Architecture

### Pure choreography

Add `diveChoreography.ts`.

It defines the phase times and samples one reusable pose from elapsed time.

The pose includes camera position, camera rotation, goggle position, water coverage, bubble strength, and impact state.

The sampler is deterministic. It has no renderer or audio dependency.

### Presentation owner

Add `DivePresentation.ts`.

It owns the camera-mounted goggle meshes, underwater veil, bubble pool, geometry, and materials.

It reuses bubble objects. It does not allocate objects during frame updates.

It receives the camera rig and a shared wave-field sampler from `BoatWorld`.

It exposes start, update, clear, cancel, and dispose operations.

It emits the water-impact callback once. `SurvivalPhase` uses that callback for audio.

### World integration

`BoatWorld` owns one `DivePresentation`.

It exposes a dive start method and a clear method to `SurvivalPhase`.

It finds water entry height through the shared wave field.

It does not create a second ocean state.

`BoatSupplyDisplay` gains a presentation visibility override for one item instance.

The override hides the active scuba set at sequence start. Clear restores it during the black cover.

Normal inventory sync stays authoritative.

### Phase lifecycle

`SurvivalPhase` keeps gameplay and presentation order explicit:

1. Call the existing deterministic dive action.
2. Lock commands after an accepted result.
3. Find the usable scuba set instance.
4. Start the dive presentation and hide that instance.
5. Start dive audio at the water-impact callback.
6. Fade the dive cover to black after the underwater hold.
7. Clear the presentation and restore the scuba set while covered.
8. Stop underwater audio and play the surface cue.
9. Render and settle the covered base scene.
10. Fade the cover away.
11. Render the committed state and show the exact result.
12. Unlock commands and restore command focus.

The standard cue path continues to handle all other daytime actions.

## Camera and water

The camera starts from its current authored base pose.

The starboard seat pose faces forward along the boat.

The transition uses the same smooth curve as fishing. The target pose remains separate from the fishing pose.

The camera roll has a small anticipation, one decisive backward turn, and one impact jolt.

The underwater veil reaches full coverage when the camera crosses the sampled wave height.

Fog and the veil remove the boat and sky from view. The bubble pool fills the foreground and middle distance.

Cleanup restores the exact camera position and quaternion saved at sequence start.

## Gear visibility

The accepted action identifies one usable `scubaSet` instance.

The world hides that exact display instance before the camera moves.

The item remains in the inventory. The action does not consume it.

The world restores the item only while the screen is black.

Cancellation also clears the visibility override.

## Audio

Move the current dive-start audio to the water impact.

At impact, play `diveEntry` and start the `underwaterMovement` loop.

When the screen becomes black, stop `underwaterMovement` with the existing short fade.

Play `diveSurface` under the black cover. It implies the skipped return aboard.

Cancellation stops the underwater loop once.

## Result popup

Add a pure result formatter for accepted dive outcomes.

The formatter reads the committed resource changes. It does not repeat or reroll gameplay.

The popup title is `DIVE RESULT`.

It shows one exact reward line:

- `FOOD +1`
- `BAIT +1`
- `REPAIR MATERIAL +1`
- `RESCUE PROGRESS +10`
- `NOTHING FOUND`

If the dive caused injury, add `HEALTH -10` as a second line.

Do not show the normal energy cost in this result.

The popup uses the existing brief feedback duration. It also sends one accessible announcement.

For a normal result, commands unlock when the popup appears.

If injury ends the run, keep the result visible for its brief duration. Then show the normal death screen.

## Cancellation and cleanup

Document hide, restart, clear, and disposal cancel the active visual handle.

Cancellation restores the camera, gear, goggle state, veil, bubbles, and audio state.

Each active promise settles once. Each owned resource is disposed once.

Late callbacks check the lifecycle generation before they change UI or state.

If the scuba display instance is missing, the camera sequence still runs. Cleanup remains safe.

## Tests

Add unit tests for the pure choreography sampler.

Test the start pose, seat pose, goggle settle, impact edge, underwater hold, and final pose.

Test that the water-impact signal fires once.

Test that `DivePresentation` reuses its bubble pool and restores the camera.

Test camera, gear, goggles, veil, and bubble state at key times.

Test clear, cancel, document hide, and disposal from each active stage.

Test phase order from commit through popup and input unlock.

Test that rejected dives do not move the camera or hide gear.

Test each reward label and the injury line.

Test that a fatal injury shows the result before the death screen.

Test entry, underwater loop, loop stop, and surface audio order.

Run the focused tests, type check, full test suite, and production build.

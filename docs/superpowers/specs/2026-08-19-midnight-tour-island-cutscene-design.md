# Midnight Tour Island Cutscene Design

## Purpose

Replace the Midnight Tour visit result with a short first-person island cutscene.

The event must stay automatic after the player clicks the island.

## Goals

- Show a white outline when the pointer hovers over the island.
- Remove the custom objects that clip through the water.
- Add the requested Palm Trees model to the island.
- Fade from the boat view to a locked first-person island view.
- Let the camera look left and right before finding one outcome.
- Grant a closed chest or show a monster attack.
- Fade out and end the night event.

## Non-goals

- Do not add player control during the cutscene.
- Do not move the survival simulation or player physics.
- Do not change the Sail On choice.
- Do not add a text panel during the cutscene.
- Do not add a reduced-motion version.

## Scene cleanup

Keep the imported `midnightIsland` model.

Remove these custom scene objects:

- Three rock shelves
- The dead tree and its procedural fallback
- The shore ember
- The foreground wave mesh

Keep the cool moon fill and a restrained shore light.

Remove the island's `disableHoverOutline` flag. Use the existing white hover outline.

## Palm Trees asset

Add `midnightPalmTrees` as a required event model.

Use [Palm Trees by Quaternius](https://poly.pizza/m/VYslw9DEi6). The source uses the CC0 license.

Process the model through the existing Poly Pizza event-model pipeline. Commit the generated GLB and metadata.

Record the source, license, model identifier, hashes, and processing notes in `src/assets/ATTRIBUTION.md`.

Place one asymmetric palm cluster on the island top. Use the same cluster in both camera views.

Do not create a procedural palm fallback.

## Event rules

The Visit the Island choice has two outcomes.

| Result | Weight | Effect |
| --- | ---: | --- |
| `tour-chest` | 80 | Grant one closed chest. |
| `tour-attack` | 20 | Remove 25 to 45 health. |

Use the existing inclusive integer resource range for the attack damage.

Delete `tour-bait` and `tour-food-fallback`. Delete their result actors and fallback result mapping.

The event still requires the `none` chest state. The chest result cannot replace an existing chest.

## Cutscene flow

Keep normal event staging, reveal, island selection, and Sail On behavior.

Run this sequence after the island click:

1. Lock event input and hide the event controls.
2. Select the `midnight-tour` cover profile.
3. Fade to black in about 0.6 seconds.
4. Move only the presentation camera to the island while the screen is black.
5. Resolve the visit outcome while the screen is black.
6. Place the selected result actor before the screen clears.
7. Fade into the island view in about 0.6 seconds.
8. Hold on the palm trunks.
9. Look left for about one second.
10. Look right for about one second.
11. Turn toward the selected result.
12. Play the result beat.
13. Fade to black in about 0.6 seconds.
14. Clear the event and restore the boat camera while the screen is black.
15. Start dawn and use the normal dawn reveal.

The full island view should last about seven seconds.

If the monster attack ends the run, restore the camera under black. Then show the normal ending.

## Camera presentation

Keep the boat and simulation at their existing positions.

Move the presentation camera to standing eye height on the island. Place it near the palm cluster.

Capture the camera position and rotation before the cutscene. Restore both values during clear and disposal.

Use smooth yaw turns for the search. Use a small pitch change to make the motion feel human.

Do not add random camera motion. The selected result can change, but each result uses deterministic choreography.

Settle active motion when the tab becomes hidden. Restore the correct stable pose when it returns.

## Result presentation

### Chest

Place the existing closed chest model between the palm roots.

Turn the final camera pose toward the chest. Hold long enough to identify it.

Do not throw the chest toward the boat. The deferred inventory sync adds it after the result beat.

### Monster

Keep the current stylized procedural creature.

Hide it behind the palm cluster before the reveal.

Make it jump toward the camera. Add one short camera recoil at impact.

Apply the resolved 25 to 45 health loss through the normal event result flow.

## Phase coordination

Add a focused Midnight Tour visit path in `SurvivalPhase`.

The phase owns cover timing, outcome resolution, terminal handling, and dawn.

`MidnightTourPresentation` owns scene placement, camera motion, and result actors.

`SurvivalUI` owns the `midnight-tour` cover profile and fade promise.

Do not add a generic cutscene framework. No other event needs this sequence.

## Recovery and cleanup

Restore the camera and clear actors when the event clears.

Do the same during disposal, interruption, a terminal result, or a superseded transition.

Keep the screen covered while scene state changes.

Treat the Palm Trees model as required for this event bundle. Use the existing bundle failure path if loading fails.

Do not keep obsolete bait, food fallback, dead-tree, or floating-wave paths.

## Tests

Add or update tests for these behaviors:

- The island uses the existing white hover outline.
- The removed custom objects do not exist.
- The palm model loads and sits on the island top.
- The event model manifest and metadata include the palm asset.
- The visit choice contains only chest and attack outcomes.
- Outcome weights are 80 and 20.
- Attack damage resolves to inclusive values from 25 through 45.
- The chest outcome grants one closed chest.
- The phase covers the screen before moving the camera.
- The result actor exists before the screen clears.
- The camera looks left, right, and then at the result.
- The chest result holds on the chest.
- The monster jumps and causes one camera recoil.
- Input remains locked for the full cutscene.
- The final fade occurs before event cleanup.
- A surviving player reaches dawn.
- A fatal attack reaches the normal ending.
- Clear, disposal, visibility settling, and interruption restore the camera.
- Asset attribution records the Palm Trees source and CC0 license.

Run the focused tests first. Then run the full test suite, typecheck, model audit, and production build.

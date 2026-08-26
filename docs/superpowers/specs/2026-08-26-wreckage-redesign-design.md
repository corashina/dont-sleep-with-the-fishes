# Wreckage Event Redesign

## Status

This design supersedes the presentation, UI, architecture, data flow, cleanup, tests, and scope sections of the prior Wreckage design.

The schedule, costs, requirements, outcome weights, rewards, damage, pressure, and recurrence rules stay unchanged.

## Goal

Make Wreckage follow the established Drifting Loot inspection flow.

The player first inspects debris beside the boat. A focused paper then presents the Wreckage choices.

Keep the normal scuba entry animation unchanged. Extend it with a stable three-second underwater wreck view.

## Event Rules

- Event ID: `wreckage`
- Phase: day
- Earliest day: 4
- Weight: 1
- Cooldown: 5 days
- Maximum appearances: none
- Search Debris cost: two player energy
- Send Carlitos cost: three Carlitos energy
- Dive Into Wreck cost: three player energy and one usable scuba gear item
- Leave cost: none

Search Debris does not require scuba gear. Wreckage can recur.

The outcome tables remain in the prior approved design and current event catalog.

## Approved Player Flow

1. Wreckage starts with surface debris on the starboard side.
2. No choice paper appears yet.
3. The player clicks any Wreckage debris.
4. The camera moves to a front-right inspection view.
5. A paper card appears beside the projected debris group.
6. The paper presents Search Debris, Send Carlitos, Dive Into Wreck, and Leave.
7. The selected action plays.
8. The scene fades out.
9. The scene fades in at the default boat view.
10. The existing result paper shows the outcome.

Leave returns to the default boat view without a result paper.

## Surface Debris

Place the complete debris field on the starboard side, beside the scuba gear area.

No debris can cross the boat centerline. Keep clear water between each object.

Use these surface objects:

- One [Box by Kay Lousberg](https://poly.pizza/m/ykZ23x9d6p), CC0.
- One [Crate by Quaternius](https://poly.pizza/m/3VGWnZPXmG), CC0.
- One [Pallet by Quaternius](https://poly.pizza/m/cUAsYHDqfD), CC0.
- Five code-native low-poly planks.

Add the three downloaded models through the existing event model fetch, lock, metadata, and attribution paths.

Bundle only the required models. Remove the imported leak plank model from the Wreckage bundle.

Do not remove the leak plank model from the Leak event.

Create one reusable plank geometry. Give it uneven ends, simple chipped corners, and shallow side faces.

Use separate top and side wood values. Reuse geometry and materials across all five planks.

Give each object a stable authored position and rotation. Spread objects across the visible starboard water area.

Give each object an independent, deterministic float phase. Keep each object at the waterline.

Do not allocate objects, arrays, vectors, geometry, or materials during frame updates.

Treat the complete debris group as one focus target. A click on any object selects that group.

## Shared Focused Event View

Extract the current Drifting Loot inspection view into one shared focused-event view.

Drifting Loot and Wreckage use the same camera focus, projected anchor, paper card, and button rendering.

Keep event rules outside the shared view. The shared view only receives display data and choice callbacks.

Replace drifting-specific UI paths with the shared path. Do not keep obsolete wrappers or compatibility layers.

The view uses the projected bounds of the complete debris group. It anchors the paper beside those bounds.

The view can place the paper on either screen side when space requires it. The Wreckage target remains on the right.

Each button shows its energy cost. Disabled buttons show the current unavailable reason.

The focused choice model supports contextual choices and item-backed choices.

Dive Into Wreck carries the exact usable scuba gear instance ID. The action uses that selected item.

The camera must reach the inspection view before the choice paper appears.

Drifting Loot must keep its current behavior after the extraction.

## Choice Presentation

### Search Debris

Do not play a search animation.

Remove two player energy through the current event rules. Fade back to the default boat view.

Show the existing result paper after the fade completes.

### Send Carlitos

Use the existing Carlitos delegation visit to the starboard debris.

Remove three Carlitos energy through the current event rules. Fade back after the visit completes.

Show the existing result paper after the fade completes.

Carlitos cannot dive.

### Dive Into Wreck

Require three player energy and one usable scuba gear item.

Use the normal scuba entry choreography without pose or timing changes.

The current entry lasts 5.8 seconds. Keep all existing entry samples and water impact timing unchanged.

After entry completes, start a Wreckage-only post-entry hold.

At hold start, settle the camera below the water. Show the ship wreck on the seabed.

Keep the player and boat outside the underwater frame. Hide all surface debris during the underwater view.

Hold the stable underwater view for three seconds. The hold starts only after the normal entry completes.

Do not play loot, collapse, creature, ghost, or other result animation underwater.

After the hold, fade back to the default boat view. Restore the selected scuba item and normal camera state.

Show the existing result paper after the fade completes.

### Leave

Close the paper. Fade back to the default boat view.

Do not spend energy. Do not resolve an outcome. Do not show a result paper.

## Underwater Scene

The ship wreck stays entirely below the water surface.

Hide the ship wreck before the post-entry hold starts. It must not appear in the surface inspection view.

Use the existing underwater wreck assets and composition. Keep the wreck readable against the seabed.

The three-second hold is an inspection shot. It does not expose controls or manual exploration.

Do not show surface planks, the box, the crate, or the pallet in this shot.

## Dive Extension

Replace the Wreckage-specific mixed reveal path with an optional post-entry hold in the shared dive presentation.

The option contains the hold duration, stable camera pose, stable camera target, and hold-start callback.

The normal day dive supplies no hold. Its behavior stays unchanged.

Wreckage supplies a three-second hold. Its hold-start callback reveals the underwater scene.

Remove the obsolete underwater reveal path when no caller needs it. Do not add a fallback path.

Resolve the dive presentation after the optional hold ends. The Wreckage flow then runs the return fade and result paper.

## Result UI

Use the existing reward result paper used by Drifting Loot and other daytime rewards.

Show gained items and resources through the normal reward summary.

Show damage, pressure, scuba breakage, or no reward through the normal result lines.

Do not add a Wreckage result modal.

Do not show the result paper until the default boat view has returned.

## Data and Control Flow

1. Day selection chooses Wreckage through the standard weighted selector.
2. The event bundle loads the surface debris and underwater wreck models.
3. The Wreckage presentation stages starboard surface debris.
4. A debris click opens the shared focused-event view.
5. The UI derives choice availability from player energy, Carlitos state, and scuba condition.
6. The selected presentation action runs.
7. The session resolves the existing weighted outcome and applies its effects.
8. The presentation fades to the default boat view.
9. The existing result paper reports the outcome.
10. The event clears and writes its journal record.

The presentation owns scene state and timing. The session owns costs, rewards, damage, pressure, and item condition.

## Cleanup and Failure Handling

Any completion, cancellation, error, or page visibility change must settle pending presentation promises.

Cleanup must close the focused paper and remove the focused camera state.

Cleanup must hide the underwater scene and restore the selected scuba item.

Cleanup must restore the default camera and surface visibility.

Cleanup must remove scene roots and dispose owned geometry and materials.

Continue cleanup after one cleanup step fails. Keep the first action error.

Missing required model data uses the existing model bundle error path.

## Tests

Add or update tests for these requirements:

- Exact event schedule, recurrence, choices, costs, and outcome tables remain unchanged.
- Search Debris works without scuba gear.
- Dive rejects missing energy, missing scuba gear, or unusable scuba gear.
- Carlitos uses three energy and cannot dive.
- The model manifest contains the exact Box, Crate, and Pallet sources.
- Locks, metadata, attribution, and bundle entries cover all three models.
- Wreckage does not bundle the imported leak plank model.
- Five plank meshes reuse procedural geometry and materials.
- All eight surface objects remain starboard of the boat centerline.
- The authored transforms keep the debris field spread apart.
- Float motion uses stable phases and creates no frame-loop allocations.
- No choice paper appears before a debris click.
- A debris click starts the camera move before the paper appears.
- The shared paper shows all four choices, energy costs, and unavailable reasons.
- Dive passes the exact selected scuba item instance ID.
- Search plays no search animation, then fades and shows the result paper.
- Carlitos visits the debris, then fades and shows the result paper.
- Leave fades without a cost, outcome, or result paper.
- The normal scuba pose samples and water impact timing stay unchanged through 5.8 seconds.
- The wreck stays hidden until the post-entry hold starts.
- The wreck remains fully underwater and visible for three seconds.
- Surface debris stays hidden during the underwater hold.
- The underwater shot does not show player clipping or the boat above water.
- No underwater result reaction plays.
- The camera, scuba item, debris, and promises restore after success, cancellation, errors, and visibility changes.
- Drifting Loot keeps its existing focus flow after the shared view extraction.
- Event bundle ownership and disposal remain correct.

Run focused Vitest suites first. Then run the full test suite, production build, and model checks.

## Out of Scope

- Changes to Wreckage balance or outcome weights.
- Manual wreck exploration.
- Carlitos diving.
- New underwater result animations.
- New sound assets.
- A new result modal.
- Reduced-motion variants.

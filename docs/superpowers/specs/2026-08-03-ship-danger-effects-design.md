# Ship Danger Effects Design

## Goal

Make Dorothy feel damaged and close to sinking during the full scavenging run.

The effects create tension only. They do not change routes, damage the player, or alter game rules.

## Confirmed decisions

- Show every hazard when the run starts.
- Use one fixed hazard layout for every run.
- Keep fires and heavy smoke outside the player's reachable space.
- Allow floor leaks, streams, puddles, and broken planks near the player.
- Keep every floor hazard cosmetic and non-blocking.
- Use a hybrid of authored meshes and fixed particle pools.
- Use InfamousLazure's CC0 Klaxon from Freesound.
- Increase effect intensity slightly near the deadline.

## Visual direction

The hazards follow the game's darkly comic and melancholic maritime style.

Authored shapes provide the main detail. Particles, light, and restrained surface effects unify the scene.

Fire uses uneven layered forms. Smoke uses soft dark pools with controlled drift.

Leaks follow seams and drainage paths. Broken planks show splits, fasteners, gaps, and uneven edges.

Alarm lamps use worn red cages. Their sharp pulses add small safety-color accents.

The effects must not make the scene uniformly dark, bright, or noisy.

## Player experience

The ship communicates danger without a new HUD element.

Every room contains an alarm lamp. The lamp pattern follows the klaxon rhythm.

All hazards start at a clear, readable level. Their motion continues through the run.

Smoke density, water flow, and lamp speed increase slightly near the deadline.

Pause silences the klaxon. Evacuation, sinking, phase disposal, and game disposal stop it.

## Fixed hazard layout

### Crew cabin

- Add one wall leak.
- Add two shallow puddles.
- Add loose and split floor planks.
- Add one red caged alarm lamp.

### Wheelhouse

- Add smoke above the roof.
- Add one roof fire.
- Add small sparks near the controls.
- Add one red caged alarm lamp.

### Storage workroom

- Add two wall water jets.
- Add one connected floor stream.
- Add shallow puddles.
- Add broken floor planks.
- Add roof smoke.
- Add one red caged alarm lamp.

### Cargo deck

- Add split deck boards.
- Add shallow standing water.
- Add scattered embers.
- Add distant fire near the machinery island.

### Outer hull

- Add three unreachable hull leaks.
- Add one side fire.
- Add smoke above the side fire.
- Add wet streaks below leak points.

The hazard layout must preserve the current item and furniture layout.

It must keep all doors, lanes, ladders, targets, and the evacuation route clear.

## Effect construction

### Fire and embers

Use layered low-poly flame meshes with irregular silhouettes.

Animate the layers with reused transforms and deterministic phase offsets.

Use small warm lights near major fires. Keep their range local.

Use one fixed ember pool. Reuse its buffers during updates.

### Smoke

Use fixed particle pools for roof and hull smoke.

Give each outlet fixed authored settings. Include density, rise, drift, size, and lifetime.

Use an injected deterministic source for any spawn variation.

Do not allocate objects during frame updates.

### Leaks, streams, and puddles

Use narrow animated ribbons for wall and hull jets.

Use a fixed spray pool at strong leak impacts.

Use shallow irregular meshes for floor streams and puddles.

Keep puddles below pickup surfaces and interaction targets.

Puddles may reflect local light. They must not become mirror-like.

### Broken planks

Use fixed split boards, exposed dark gaps, raised edges, and visible fasteners.

Keep all raised edges below a safe cosmetic height.

Do not add or change collision boxes.

### Alarm lamps

Use one caged red lamp in each enclosed room.

Use a sharp two-pulse pattern with a short dark gap.

Drive emissive strength and local light intensity from the same pulse value.

Keep the pulse readable without flooding the rooms red.

## Audio

Use this source:

- [Klaxon by InfamousLazure](https://freesound.org/people/InfamousLazure/sounds/584001/)
- License: Creative Commons 0
- Source format: stereo WAV
- Source duration: about four seconds

Store the converted runtime file with the other committed audio assets.

Add the source and license to `src/assets/ATTRIBUTION.md`.

Configure the klaxon as one ambience or effects loop with one maximum voice.

Start the loop once when scavenging starts. Never restart it during normal updates.

Use the current audio pause flow. Stop the loop during every scavenging exit path.

## Architecture

### Danger state

A pure danger-state function derives effect intensity and lamp timing from scavenging time.

The output stays deterministic and bounded. All visibility values remain active at time zero.

The state contains only presentation data. It does not contain gameplay rules.

### Fixed layout

A fixed danger layout stores every effect anchor and its authored settings.

Keep this layout separate from gameplay item placement and navigation rules.

Validate each anchor against the current ship zones and safe placement rules.

### Visual systems

One ship danger coordinator owns four focused systems:

- Fire and smoke
- Leaks and puddles
- Broken deck details
- Alarm lamps

Each system owns its root, geometry, material, light, and particle resources.

Each system disposes every resource exactly once. Coordinator disposal is idempotent.

Construction must clean all completed resources after any partial failure.

### Data flow

The scavenging phase calculates sinking and danger presentation state.

The world passes the danger state to the ship danger coordinator.

The coordinator updates each visual system with the frame delta and shared state.

`ScavengeAudio` owns the klaxon loop and follows phase pause and exit events.

The danger systems never call gameplay, input, inventory, or navigation code.

## Performance

Use fixed capacities for smoke, sparks, embers, and water spray.

Reuse typed arrays, vectors, transforms, and material instances during updates.

Share safe geometry and material resources inside each owning system.

Do not create textures, geometry, materials, lights, or listeners during updates.

Keep local fire lights few and short-ranged. Do not add broad shadow costs.

## Error handling

Treat the klaxon as a required audio asset through the current audio load flow.

Use the current audio load error when the file cannot load.

Clean partial visual resources when any danger system fails to construct.

Ignore update calls after disposal.

## Tests

### Unit tests

- Verify every hazard is active at time zero.
- Verify danger state output stays deterministic and bounded.
- Verify the fixed layout does not change between runs.
- Verify each anchor belongs to its intended ship zone.
- Verify fires and heavy smoke remain unreachable.
- Verify floor effects add no colliders.
- Verify player movement and route data remain unchanged.
- Verify every particle pool keeps its fixed capacity.
- Verify updates create no new pool entries.
- Verify alarm playback starts once.
- Verify pause silences the alarm through the current bus flow.
- Verify every exit path stops the alarm.
- Verify repeated disposal releases resources once.
- Verify partial construction failure cleans completed resources.

### Visual checks

Check the crew cabin, wheelhouse, storage workroom, cargo deck, and both hull sides.

Check the run start and the final deadline state.

Confirm every hazard reads at the run start.

Confirm fires, smoke, and alarm lamps do not hide items, doors, ladders, or prompts.

Confirm floor streams and puddles do not cause visible depth conflicts.

Confirm fire lights preserve material values and do not wash rooms red.

Confirm smoke remains illustrated and does not fill every empty space.

## Acceptance criteria

- All requested hazard types appear when scavenging starts.
- The same hazard layout appears in every run.
- The klaxon and all room alarm lamps run during scavenging.
- Fires and heavy smoke stay outside reachable player space.
- Floor leaks remain visible but never change movement.
- Existing gameplay, routes, items, and interactions behave as before.
- All visual and audio resources have one clear owner.
- Automated tests pass.
- Visual checks pass at supported desktop sizes.

# Crow's Nest Intro Cutscene Design

Date: 2026-08-01
Status: Approved design

## Goal

Play a short first-person cutscene after Start and before scavenging.

The player begins seated in a new crow's nest on the mainmast. The camera scans the sea.

A crash interrupts the scan. The ship lurches, and light debris appears near the deck hatch.

The player looks down and descends the mast ladder. Scavenging starts beside the mast.

The crow's nest and ladder remain usable during scavenging.

## Scope

This feature adds:

- One ten-second intro for every scavenging run.
- One visible skip prompt and Space key action.
- One persistent crow's nest and mast ladder.
- One short ship reaction and crash effect.
- One dedicated crash sound.
- Deterministic timeline, layout, lifecycle, and ownership tests.

This feature does not add a third-person player model. It does not change scavenging rules or duration.

It does not add a generic cinematic framework. It does not add reduced-motion behavior.

## Player flow

`ScavengePhase` has three presentation states: `title`, `intro`, and `playing`.

Start requests pointer lock. A successful lock hides the title and starts the intro.

The scavenging session stays idle during the intro. The HUD and timer remain hidden.

The intro ends after ten seconds. It can also end when the player presses Space.

Both paths place the player at the same exit pose beside the mast and ladder.

The phase then shows the HUD and starts the scavenging session.

A restart creates a fresh phase. The intro plays again and can be skipped again.

## Timeline

| Time | Camera and scene action |
| --- | --- |
| 0.0-1.0 seconds | Start at seated eye height. Rise to a stable standing pose. |
| 1.0-3.5 seconds | Turn slowly toward port. Hold briefly on the open sea. |
| 3.5-6.0 seconds | Turn slowly toward starboard. Keep the horizon readable. |
| 6.0 seconds | Play the crash once. Add a short camera jolt and ship lurch. |
| 6.0-7.5 seconds | Recover from the jolt. Look down toward the deck hatch and debris. |
| 7.5-9.5 seconds | Move down the mast ladder with a firm, weighted descent. |
| 9.5-10.0 seconds | Step onto the deck and settle beside the mast. |

The camera uses local ship coordinates. Normal wave motion continues below the keyed reaction.

Skipping does not play missed crash events. It applies the final pose and starts scavenging.

## Crow's nest and ladder

The crow's nest forms a small illustrated lookout around the mainmast.

The platform has a 2.4-metre outer width. Its clear floor supports safe standing and turning.

The platform floor sits 10.5 metres above the mast base. Layout tests enforce sail and stay clearance.

The form uses uneven timber slats, iron brackets, rope wraps, and restrained salt wear.

The profile has purposeful asymmetry. It must not look like a smooth primitive assembly.

A 0.9-metre square guarded opening connects to a vertical ladder on the mast's aft face.

The guard is 1.05 metres high. It leaves a 0.75-metre clear path around the mast.

The ladder runs from the main deck to the platform. It uses the existing deterministic ladder traversal rules.

The platform, mast, guard, opening, and ladder provide explicit colliders and a climb zone.

The top dismount leaves enough space between the player, mast, guard, and opening.

The bottom exit pose is local `[0, deckY + 1.5, -1.3]`, with yaw `pi` and zero pitch.

## Visual direction

The lookout interprets the visual guide as a worn, human-made refuge above a broad empty sea.

Irregular slats and an awkward small seat provide restrained dark comedy. The horizon provides melancholy.

Geometry, materials, and silhouette carry the design. Grain and ambient occlusion only unify the result.

The crash uses one decisive impact, a restrained overshoot, and an imperfect settled pose.

Dust and light debris remain local to the deck hatch. They do not fill the scene with noise.

The camera keeps the ship, sea, and horizon legible throughout the sequence.

## Interface and input

The intro shows `SPACE - SKIP INTRO` in a compact ink strip.

Place the strip near the upper-right safe area. Keep the center clear for the scene.

The prompt uses the existing display and context type roles. It has high value contrast.

Space prevents its default action during the intro. The transition clears any queued jump input.

The prompt disappears before the HUD appears. It is not visible during normal scavenging.

Pointer-lock failure keeps the title visible and uses the existing input error message.

Pointer-lock loss pauses the intro. The existing pause layer appears without starting the session.

Resume restores pointer lock and continues from the same timeline time.

Page visibility loss uses the same pause behavior. Hidden time does not advance the timeline.

## Architecture

### Pure choreography

Add a pure intro choreography module. It owns time boundaries and deterministic samples.

Its sampled frame contains:

- Local camera position.
- Local camera yaw and pitch.
- Ship impact translation and rotation.
- Crash, debris, completion, and active-stage signals.

The sampler writes into a reusable frame object. It does not allocate during each update.

The module has no Three.js, DOM, audio, or session dependency.

### Phase coordination

`ScavengePhase` owns intro lifecycle and transition order.

It advances the timeline only while the intro is active, visible, and pointer locked.

It applies the sampled player pose, triggers one-time events, updates the world, and renders the UI.

It starts `ScavengeSession` only after the final player pose and UI state are ready.

The existing title and ending paths remain separate from the intro path.

### Player pose

Extend `PlayerController` with a clear scripted-pose entry point.

The entry point sets local position, yaw, pitch, floor height, and safe position together.

The cutscene uses this entry point. Normal input and collision integration stay disabled during the intro.

Completion and skip apply one authored deck pose. Normal control starts from that pose.

### World presentation

Extend the ship layout with a crow's nest and mast ladder specification.

The rigging build owns their meshes, geometries, and colliders. It returns the added climb zone.

The ship build combines roof and mast climb zones. `PlayerController` receives the combined list.

Add a small intro presentation owner for dust and debris. It creates resources once and disposes them once.

The world adds the sampled impact offset after normal shared-wave motion.

The impact offset returns exactly to zero. It does not replace the shared wave field.

### Audio

Add a short `shipCrash` effect to the audio manifest and attribution records.

`ScavengeAudio` exposes one idempotent crash method. It plays the cue once per phase.

Room tone and sea ambience continue during the intro. Pause behavior uses the existing audio scope.

## Data flow

1. Start gains pointer lock and changes `title` to `intro`.
2. The phase advances intro elapsed time.
3. Pure choreography samples one reusable frame.
4. The player controller applies the local scripted pose.
5. The world applies the temporary impact and presentation state.
6. The audio owner handles the crash edge once.
7. The UI shows only the skip prompt.
8. Completion or Space applies the exit pose.
9. The UI changes to `playing`.
10. The scavenging session starts.

## Failure and interruption behavior

Invalid or negative frame deltas do not move the timeline backward.

Large frame deltas cross each event once and finish at the correct final pose.

Repeated Space presses cannot start the session twice.

Disposal during the intro removes listeners, stops owned audio, and disposes presentation resources.

Pointer-lock or visibility pauses preserve elapsed intro time and one-time event state.

## Test design

### Choreography tests

- Sample each time boundary and confirm camera poses remain finite.
- Confirm motion continuity before and after each boundary.
- Confirm the crash edge occurs once when a frame crosses six seconds.
- Confirm completion occurs at ten seconds.
- Confirm large deltas reach the final pose without duplicate events.

### Layout and traversal tests

- Confirm one crow's nest and one mast ladder exist.
- Confirm platform width, floor opening, and guard dimensions support the player radius.
- Confirm the platform clears furled sails, stays, mast fittings, and deck lanes.
- Confirm ascent reaches the platform and updates floor height.
- Confirm descent reaches the authored deck exit pose.

### Lifecycle and UI tests

- Confirm Start enters `intro` without starting the session.
- Confirm the timer stays idle and the HUD stays hidden.
- Confirm Space hides the prompt, applies the exit pose, and starts once.
- Confirm natural completion uses the same transition.
- Confirm pointer-lock and visibility loss pause the intro.
- Confirm resume continues from the stored time.
- Confirm restart creates a fresh intro.

### Audio and ownership tests

- Confirm the crash sound plays once after the crash edge.
- Confirm skipping before the crash does not play it.
- Confirm geometry, material, particle, audio, and listener owners dispose once.

## Acceptance criteria

- Every scavenging run starts with the approved ten-second first-person sequence.
- Space can skip the sequence from its visible prompt.
- The scavenging timer never advances during the sequence or its pause state.
- Completion and skip place the player beside the mainmast ladder.
- The crow's nest remains reachable, safe, and usable during scavenging.
- The crash has sound, a restrained ship lurch, and light local debris.
- Normal waves remain the base source for ship and camera motion.
- Tests cover deterministic timing, transitions, layout, traversal, audio, and disposal.

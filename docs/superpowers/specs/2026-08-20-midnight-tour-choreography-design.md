# Midnight Tour Choreography Design

## Status

Approved in chat on 2026-08-20.

This document replaces the result choreography and dawn transition from the
2026-08-19 Midnight Tour design. The island, palms, hover outline, outcome
weights, and damage range remain unchanged.

## Purpose

Make both Midnight Tour results slower and more readable.

The chest result shows a first-person digging sequence. The attack result
shows a monster approach, attack, and player collapse. Both results fade
directly into the next day.

## Goals

- Keep the event automatic after the player clicks the island.
- Use the standard 2.5-second fade in both directions.
- Keep calm weather throughout the event.
- Give the chest result a 12-second scene.
- Give the monster result an 11-second scene.
- Show the requested shovel in the first-person view.
- Replace the procedural creature with the requested animated model.
- Play the requested digging, running, and attack sounds.
- Restore the boat only while the screen is black.
- Show the first restored boat frame during the next day.
- Put the recovered chest on the boat after dawn.

## Non-goals

- Do not add player control during the scene.
- Do not add prompts, skip controls, or quick-time actions.
- Do not change the 80-to-20 result weights.
- Do not change the 25-to-45 attack damage range.
- Do not add a new general cutscene framework.
- Do not add reduced-motion behavior.
- Do not keep procedural shovel or monster fallbacks.

## Architecture

`MidnightTourPresentation` owns the island scene, camera, shovel, chest,
monster, and branch timelines.

Replace the current normalized result animation with explicit timeline stages.
Each stage has an exact duration and one responsibility. A stage can emit a
named sound cue once.

`SurvivalPhase` owns input locking, event resolution, fades, dawn, terminal
handling, and presentation cleanup.

`SurvivalAudio` owns the three new sounds. A small event cue handler connects
the presentation to `SurvivalAudio`. The presentation does not access the
audio backend.

Do not change `SurvivalSession` rules. Midnight Tour remains one normal night
event. Resolving it leaves the session ready for the existing `beginDawn()`
operation.

## Shared travel flow

The Visit action uses this order:

1. Lock event input.
2. Set the `midnight-tour` cover profile.
3. Fade to black for 2.5 seconds.
4. Move the presentation camera to the island while black.
5. Resolve the selected result while black.
6. Stage all branch actors while black.
7. Fade into the island view for 2.5 seconds.
8. Run the selected branch timeline.
9. Fade to black for 2.5 seconds.
10. Stop event sounds and clear the island while black.
11. Restore the boat camera while black.
12. Run the existing dawn operation while black.
13. Render and settle the new day while black.
14. Fade into the daytime boat for 2.5 seconds.
15. Unlock day input.

Never render an uncovered boat frame between steps 8 and 14.

If dawn opens a day event, prepare it while black. Then use its normal reveal
flow after the daytime scene is ready.

If the attack or dawn causes a terminal state, keep the screen black during
cleanup. Then show the normal ending presentation.

## Chest branch

The chest branch lasts exactly 12 seconds after the island fade completes.

| Stage | Duration | Presentation |
| --- | ---: | --- |
| Search | 3.0 s | Look left, then right, and settle on disturbed ground. |
| Dig | 6.0 s | Show three shovel strokes. Raise the chest in three steps. |
| Hold | 3.0 s | Hide the shovel and hold on the fully exposed chest. |

Use the existing `mysteryChest` geometry. The event model ID can stay
`chestClosed`, but it must resolve to the same model used by Drifting Chest and
the persistent boat chest.

Place the chest below the island surface before the fade clears. Its top must
remain below the ground at the start.

Each two-second digging cycle contains one downstroke, one ground contact, and
one recovery. Raise the chest after each contact. The third cycle must place
the chest base exactly on the island ground.

Attach the shovel to the camera. Place it in the lower-right first-person
view. Keep the grip and blade readable without blocking the chest.

Start one six-second digging sound at the first downstroke. Trim the approved
source to cover all three strokes. Hide the shovel when the dig stage ends.

The session grants the chest when the result resolves. Deferred world sync
must keep it off the boat during the island scene. The chest becomes visible
on the boat after dawn.

## Monster branch

The monster branch lasts exactly 11 seconds after the island fade completes.

| Stage | Duration | Presentation |
| --- | ---: | --- |
| Hear | 2.0 s | Start running behind the player. Keep the camera forward. |
| Turn | 2.5 s | Turn the camera toward the approaching monster. |
| Run | 4.0 s | Keep the monster running toward the player. |
| Attack | 1.0 s | Stop the run sound. Play the attack clip and sound. |
| Collapse | 1.5 s | Drop and roll the camera as the player loses consciousness. |

Place the monster behind the initial camera direction. Palm trunks must hide
part of its starting silhouette.

Start the model's run clip and run sound at the Hear stage. The monster keeps
moving during the Turn stage. It must remain far enough away for the player to
identify its approach after the turn.

During the Run stage, move the root toward the camera while the run clip stays
active. Stop at the authored attack distance. Do not let the model pass through
the camera.

At contact, stop the run clip and sound. Play the model's attack clip and the
attack sound once. Add a short impact recoil. Then lower the camera toward the
ground with a small roll and pitch change.

The existing result applies an inclusive random health loss from 25 through
45. The presentation never calculates damage.

## Models

Add two required event models:

- `midnightShovel`: [Shovel by Quaternius](https://poly.pizza/m/oNBQSf87ZJ), CC0.
- `midnightMonster`: [Zombie by Quaternius](https://poly.pizza/m/22K0aSZkHV), Creative Commons Attribution.

Process both through the existing event-model asset pipeline. Preserve the
monster skeleton and animation clips. Remove unused scene nodes and materials.

Inspect the retained clip names during import. Map the source run and attack
clips explicitly in model metadata. Bundle validation must fail if either clip
is absent.

Record source identifiers, exact licenses, source hashes, output hashes,
triangle counts, and processing notes in `src/assets/ATTRIBUTION.md`.

Remove the procedural creature code after the imported monster works. Do not
keep a fallback path.

## Audio

Add these sound IDs to the existing audio manifest:

- `midnightShovel`: [Shovel_dirt.wav by dr19](https://freesound.org/people/dr19/sounds/353907/), CC0.
- `midnightMonsterRun`: [Footsteps_running.wav by gabitomed](https://freesound.org/people/gabitomed/sounds/514585/), CC0.
- `midnightMonsterAttack`: [monster bite by LucasDuff](https://freesound.org/people/LucasDuff/sounds/467701/), CC0.

Use the public high-quality preview files, consistent with the current audio
ledger. Trim the shovel sound to six seconds. Prepare the run sound as a clean
loop. Keep the attack sound as a one-shot.

The presentation emits four idempotent cues:

- `dig-start`
- `run-start`
- `run-stop`
- `attack`

`SurvivalAudio` maps these cues to manifest sounds. Cleanup, interruption,
visibility loss, and disposal must stop the run loop.

Record every source and edit in `src/assets/ATTRIBUTION.md`.

## Weather and lighting

`presentationWeatherForEvent('midnight-tour')` must return `calm`.

Keep the current moon fill and restrained shore light. Do not change the
general night lighting or add weather effects.

## State and recovery

Keep deferred presentation sync active from result resolution until the final
screen cover. This prevents the boat chest and resource meters from updating
during the island scene.

Only flush the resolved state after the final fade reaches black. Clear the
event, restore the camera, call `beginDawn()`, render the next state, and settle
the scene before uncovering it.

Pause timeline progress while the document is hidden. Resume the same stage
when visibility returns. Do not skip to the end of the branch.

If a required model or animation clip is missing, fail bundle activation before
the event reveal. Use the existing fatal bundle path.

If result resolution fails after travel starts, cover the screen, stop all
event sounds, restore the camera, clear event actors, and use the existing
Midnight Tour recovery path.

Every cue uses a one-shot guard. A large frame delta cannot replay a skipped
cue.

## Tests

Add or update focused tests for these behaviors:

- The Midnight Tour weather is `calm`.
- Travel fades use the standard 2.5-second duration.
- The chest branch lasts 12 seconds.
- The monster branch lasts 11 seconds.
- The chest starts fully below ground.
- Three contacts raise the chest to the ground.
- The shovel is attached to the camera only during the dig stage.
- The digging cue fires once.
- The monster starts behind the camera.
- The camera turns before the visible run stage.
- The run clip and sound start once and stop before attack.
- The attack clip and sound start once at contact.
- The monster stops before crossing the camera.
- The collapse camera ends near the ground.
- The health loss remains an inclusive 25-to-45 range.
- The screen becomes black before camera restoration.
- No uncovered night boat frame appears after either branch.
- Dawn runs while the screen is black.
- The first uncovered boat frame is daytime.
- The chest appears on the boat only after dawn.
- Visibility pause resumes the same timeline stage.
- Clear, interruption, recovery, and disposal stop the run loop.
- Missing required models or clips fail before event reveal.
- The attribution ledger contains all five new sources.

Run focused presentation, phase, session, audio, manifest, and asset tests first.
Then run the full test suite, typecheck, model audit, and production build.

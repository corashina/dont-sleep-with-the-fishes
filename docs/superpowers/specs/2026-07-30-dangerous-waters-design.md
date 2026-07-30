# Dangerous Waters Design

Date: 2026-07-30

## Goal

Make Dangerous Waters clear through physical staging, keyed motion, and concise text.

Align its rules with the reference event.

Reference: <https://unoffdontsleepwiththefishes.fandom.com/wiki/Events#Dangerous_Waters>

## Scope

This work changes one survival event.

It adds:

- A dedicated rock passage.
- An original reef lurker.
- Foam and fixed fragment pools.
- Event-specific reveal, choice, safe, damage, and severe-damage motion.
- Clear captions and Hull feedback.
- Wiki-aligned damage, Pressure, and story flag rules.
- Focused rule, presentation, lifecycle, and UI tests.

It does not add the Found Land ending.

It does not add new audio.

It does not add reduced-motion behavior.

## Source analysis

The reference defines Dangerous Waters as a one-time negative event.

It can occur from day 2 through day 30.

The scene contains rocks and a creature that watches from behind them.

The choices and results are:

| Choice | Safe weight | Failure weight | Failure |
| --- | ---: | ---: | --- |
| Map | 80 | 20 | 5–10 Hull damage and one Danger |
| Compass | 50 | 50 | 5–8 Hull damage and one Danger |
| Sleep | 0 | 1 | 25–45 Hull damage and one Danger |

The project uses hidden Pressure as its Danger value.

The event also records the `direction2` story flag.

Map and Compass remain usable after the event.

The current implementation already has the event bounds, weights, and damage.

It must remove the rescue-progress penalty from all failures.

It must add one Pressure on each failure.

It must record `direction2` when the player resolves the event.

## Visual interpretation

The scene uses the visual style guide's four pillars.

### Authored illustrated forms

Three irregular rock groups form a narrow passage around the lifeboat.

The groups use layered shelves, cracks, wet bands, barnacles, and broken profiles.

The nearest rocks frame the boat without hiding supplies or the horizon route.

The reef lurker is an original creature.

It has an uneven domed head, one gripping fin, and mismatched eye sockets.

Only part of the creature appears from behind the largest rock.

Its odd proportions add restrained dark comedy.

Its held stare keeps the event threatening.

### Scene-integrated interface

The fixed survival camera remains active.

A concise top caption states that the current pulls the boat toward rocks.

Map and Compass choices stay attached to their physical recovered props.

Sleep remains a compact contextual choice.

The center stays open for the rock passage and creature.

### Tactile keyed motion

Each stage uses anticipation, decisive travel, restrained overshoot, and a held pose.

The creature does not wobble or loop.

The ocean and lifeboat keep their continuous shared-wave motion.

### Restrained print treatment

Existing scene grading and post-processing remain authoritative.

Geometry, material values, foam, and lighting create the event's depth.

No new full-screen effect will conceal weak staging.

## Scene composition

The passage has three depth layers.

- A low foreground rock crosses one lower corner.
- Two midground groups create the collision corridor.
- One distant group preserves the horizon and shows the safer route.

The largest midground rock carries the reef lurker.

The creature appears after the passage becomes readable.

Wet bands mark the active waterline.

Foam marks the nearest collision edges.

The safe route stays visible before the player chooses an item.

## Presentation sequence

### Reveal

The reveal lasts 2.4 seconds.

1. The current gives one small lateral tug.
2. The rock passage travels toward its final frame.
3. Foam gathers at the nearest edges.
4. The boat yaws once and settles.
5. The reef lurker peeks out and grips the rock.
6. The event caption appears.

The final pose holds while the player chooses.

### Map choice

The selected Map lifts from its stable supply position.

It unfolds and angles toward the open route.

The passage shifts slightly to show that route.

The Map returns to its exact base pose before resolution.

### Compass choice

The selected Compass lifts from its stable supply position.

Its needle searches, overshoots, and settles on a heading.

The passage gives a smaller directional shift.

The Compass returns to its exact base pose before resolution.

### Sleep choice

The scene darkens through the existing event cover.

The rock passage closes toward the boat before resolution.

The camera does not cut away.

### Safe result

The passage slides clear of the bow.

Foam trails away from the hull.

The reef lurker withdraws behind the rock.

The caption states that the route cleared.

### Damage result

The nearest rock strikes the hull once.

The boat gives one short impact lurch.

Foam and fragments burst from the contact point.

The Hull meter shows the exact damage.

The caption states that the rocks damaged the boat.

### Severe-damage result

Damage of 25 or more uses the severe reaction.

The lurch travels farther.

The nearest rock scrapes past the hull after impact.

The fixed fragment pool emits more visible pieces.

The final pose settles before the outcome clears.

## Components and ownership

### `DangerousWatersPresentation`

Add `src/survival/DangerousWatersPresentation.ts`.

It owns:

- Its root group.
- Rock and creature geometry.
- Event-only materials.
- Foam meshes.
- A fixed fragment pool.
- Named part references.
- Reveal and reaction state.
- Reused vectors, quaternions, and wave samples.

It exposes:

- `stage()`
- `reveal()`
- `playChoice(choiceId)`
- `react(outcome)`
- `clear()`
- `settleForVisibilityChange()`
- `update(time, delta)`
- `dispose()`

It disposes each owned resource once.

It allocates no objects during update.

### `EventPresentationLayer`

The existing layer owns the integration point.

It delegates Dangerous Waters to `DangerousWatersPresentation`.

It does not collect or dispose the delegated presentation's resources.

It keeps current behavior for all other events.

### `BoatWorld`

`BoatWorld` coordinates physical item motion with event motion.

Map and Compass choice motion runs beside the existing supply prop motion.

Contextual Sleep motion uses the same event choice seam.

The world keeps one operation token for cancellation and visibility changes.

### `SurvivalPhase`

`SurvivalPhase` keeps rule and presentation order unchanged.

It sends the accepted choice to the world before resolving the deterministic outcome.

It restores focus after the result clears.

### `SurvivalSession`

`SurvivalSession` remains the sole owner of mutable survival rules.

It applies the selected deterministic outcome.

It records Pressure and `direction2` through existing effect data.

### `SurvivalUI`

`SurvivalUI` keeps the existing top caption and physical item anchors.

It adds no generic event panel.

It shows exact Hull loss in the outcome feedback.

It keeps keyboard focus inside the active event controls.

## Data flow

1. `SurvivalSession` opens Dangerous Waters.
2. `SurvivalPhase` asks `BoatWorld` to stage the event.
3. The UI cover opens while the world reveal runs.
4. The player chooses Map, Compass, or Sleep.
5. `SurvivalPhase` asks the world to play the chosen physical beat.
6. `SurvivalSession` resolves the choice with its injected random source.
7. The outcome changes Hull, Pressure, and flags.
8. `BoatWorld` selects safe, damage, or severe-damage motion.
9. `SurvivalUI` shows the exact result and restores focus.
10. The presentation clears and releases its held pose.

## Determinism

Rule results use only the existing injected random source.

Presentation motion never changes rule state.

The fragment pattern uses fixed authored transforms.

It does not consume rule randomness.

The shared wave field remains the source for ocean, buoyancy, and waterline motion.

## Error handling

Unknown Dangerous Waters choice IDs do not start event motion.

A stale or unavailable item choice fails before any random draw.

An interrupted animation settles to a valid held or base pose.

Hidden documents cancel pending presentation work through the existing operation token.

Dispose cancels active promises and disposes owned resources once.

Missing presentation data does not change the deterministic event result.

## Tests

### Rules

- Verify day 2 through day 30 eligibility.
- Verify one appearance per run.
- Verify Map weights and 5–10 damage.
- Verify Compass weights and 5–8 damage.
- Verify Sleep damage of 25–45.
- Verify one Pressure only on failed routes.
- Verify `direction2` on every resolved route.
- Verify no rescue-progress loss.
- Verify Map and Compass remain usable.
- Verify deterministic boundary rolls.

### Presentation

- Verify named rock groups, creature parts, foam, and fragment pool.
- Verify the creature starts hidden and ends in its held peek.
- Verify reveal start, middle, overshoot, and held poses.
- Verify distinct Map, Compass, Sleep, safe, damage, and severe poses.
- Verify choice props restore their exact base transforms.
- Verify severe damage starts at 25 damage.
- Verify update reuses the fixed pools.
- Verify every resource is disposed once.
- Verify visibility changes settle active motion.

### Integration and UI

- Verify event staging calls the dedicated presentation.
- Verify other events keep their current path.
- Verify item and scene choice motion run together.
- Verify exact Hull damage appears in feedback.
- Verify keyboard focus stays within choices.
- Verify focus returns after the result.
- Verify the event clears without leaving visible rocks or creature parts.

## Acceptance criteria

The player understands four facts before choosing:

- Rocks surround the boat.
- The current moves the boat toward collision.
- A hidden creature watches from the rocks.
- Map and Compass offer different navigation responses.

The player understands the chosen action and result without opening a large panel.

All rule tests, presentation tests, type checks, and the production build pass.

The final visual check confirms clear framing at 1280 by 720.

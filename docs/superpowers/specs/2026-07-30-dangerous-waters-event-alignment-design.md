# Dangerous Waters Event Alignment Design

Date: 2026-07-30

## Authority

This design aligns Dangerous Waters with `docs/EVENT_PROGRESS.md`.

It replaces conflicting presentation details in the earlier Dangerous Waters design.

The existing deterministic rule values remain unchanged.

## Goal

Make Dangerous Waters a dark, tense night event.

The player must understand the reveal, chosen response, impact, and dawn transition through visible motion.

## Approach

Extend the existing `DangerousWatersPresentation`.

Keep scene ownership inside the dedicated presentation.

Keep borrowed boat, camera, light, and supply motion inside `BoatWorld`.

Do not create a general event animation framework.

## Event Lifecycle

Move Dangerous Waters from the day event pool to the night event pool.

Stage the presentation while the sleep cover is closed.

Open the cover before the keyed reveal starts.

After the result hold, close the sleep cover.

Clear every Dangerous Waters object under the cover.

Run the existing dawn sequence and open onto the next day.

## Reveal

The reveal lasts 2.4 seconds.

The rock passage moves into the final composition.

The boat moves sideways as the current pulls it toward the nearest rock.

The camera pans toward the rock corridor.

The creature raises its crooked head from behind the large rock.

It pauses long enough to become readable.

It then sinks behind the rock before choices unlock.

The rocks continue small shared-wave motion after the keyed reveal ends.

Each rock uses the shared wave field.

The rock motion stays restrained and preserves the corridor composition.

Foam continues to use the same shared wave field.

## Choices

Map and Compass use the selected physical supply model.

Map lifts toward the camera and opens toward the safe route.

Compass lifts toward the camera and makes a short searching turn.

The selected tool stays raised after the choice beat completes.

The tool remains raised until event resolution starts.

The boat changes course while the selected tool is held.

Sleep does not use a physical tool.

Sleep leaves the boat drifting toward the rocks and reduces scene light.

## Outcomes

A safe result moves the rocks past the hull.

The boat and camera settle onto the clear route.

A bad result drives the nearest rock into one sharp impact.

The boat jolts once.

The camera jolts with the impact.

Loose supplies get one independent shake through the existing ambient supply pose.

The final damaged pose remains visible during the result hold.

Damage of 25 or more uses the severe scrape and fixed fragment pool.

The exact Hull loss stays visible in the event caption.

## Ownership

`DangerousWatersPresentation` owns all event geometry, materials, pools, rock wave bases, and keyed state.

`EventPresentationLayer` delegates stage, reveal, choice, result, hold, update, settle, clear, and dispose calls.

`BoatWorld` applies copied boat, camera, light, item, and loose-supply poses.

`SurvivalPhase` owns the night lifecycle and resolution order.

`SurvivalSession` remains the sole rule-state owner.

Every owned Three.js resource has one disposer.

Per-frame update paths allocate no objects.

## Interruption

A hidden document settles each active motion into a valid held pose.

Clearing or disposal resolves pending presentation promises.

An interrupted held item returns to its exact supply base pose.

Unknown choice identifiers start no motion.

## Rules

Weight is 15.

The event is eligible from day 2 through day 30.

It appears at most once.

Map has 80 safe weight and 20 damage weight.

Map damage is 5 through 10 Hull.

Compass has 50 safe weight and 50 damage weight.

Compass damage is 5 through 8 Hull.

Sleep damage is 25 through 45 Hull.

Each bad route adds one Pressure as the Danger value.

Every resolution records `direction2`.

## Tests

Rule tests verify the night phase and preserve every existing weight and effect.

Presentation tests verify reveal start, peek, pause, sink, and held completion poses.

Presentation tests verify shared-wave movement for all rock groups.

Choice tests verify raised Map and Compass holds and exact restoration.

World tests verify sideways boat travel, camera pan, and loose-supply shake.

Outcome tests verify safe travel, one impact, severe fragments, and damaged holds.

Phase tests verify cover, clear, dawn, and next-day reveal order.

Lifecycle tests verify hidden-document settlement and one-time disposal.

The full test suite, type check, production build, and 1280 by 720 visual check must pass.

## Acceptance Criteria

Dangerous Waters occurs at night.

The player sees the current pull the boat toward jagged rocks.

The player sees the creature peek, pause, and sink.

The rocks visibly follow the shared wave field.

Map and Compass remain raised while the boat changes course.

A bad result shakes the boat, camera, and loose supplies once.

The damaged pose holds until the sleep cover closes.

The scene clears before dawn opens.


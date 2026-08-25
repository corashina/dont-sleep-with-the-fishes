# Wreckage Event Design

## Goal

Add a recurring daytime survival event named Wreckage.

The event presents floating debris and a submerged ship. The player can search the surface, send Carlitos, dive, or leave.

## Event Schedule

- Event ID: `wreckage`
- Phase: day
- Risk: uncertain
- Earliest day: 4
- Weight: 1
- Cooldown: 5 days
- Maximum appearances: none

The event uses the normal daytime event selection and journal systems.

## Reveal

Reveal text: `Broken cargo and timber drift above a wreck resting below.`

The reveal shows sparse planks and cargo near the lifeboat. The ship remains a dark shape below the surface.

## Choices

### Search Debris

Label: `Search Debris`

Requirement: at least two player energy.

Every outcome removes two player energy.

| Weight | Result | Effects |
|---:|---|---|
| 35 | Repair timber | Add two repair material. |
| 25 | Food | Add one food. |
| 20 | Bait | Add one bait. |
| 20 | Sharp debris | Remove 15 to 25 health. |

This choice does not require scuba gear.

### Send Carlitos

Label: `Send Carlitos`

Requirements use the existing Carlitos delegation rules. The action costs three Carlitos energy.

| Weight | Result | Effects |
|---:|---|---|
| 35 | Repair timber | Add two repair material. |
| 25 | Food | Add one food. |
| 20 | Bait | Add one bait. |
| 20 | Empty return | No resource change. |

This choice does not expose the dive action to Carlitos.

### Dive Into Wreck

Label: `Dive Into Wreck`

Requirements: at least three player energy and one usable scuba gear item.

The scuba gear is the selected event item. Every outcome removes three player energy.

| Weight | Result | Effects |
|---:|---|---|
| 10 | Medkit | Gain one medkit. |
| 10 | Flare gun | Gain one flare gun. |
| 10 | Duct tape | Gain one duct tape. |
| 10 | Energy bar | Gain one energy bar. |
| 10 | Collapse | Remove 25 to 35 health. |
| 10 | Severe collapse | Remove 25 to 35 health and break the selected scuba gear. |
| 20 | Creature attack | Remove 30 to 40 health. |
| 20 | Supernatural encounter | Remove 20 to 30 health and add one pressure. |

Existing gain rules grant one fallback food when the item cannot be added.

### Leave

Label: `Leave`

The choice has no cost or effect. The debris and wreck fade from view.

## Presentation

Add a dedicated `WreckagePresentation`. Keep its scene and timing logic separate from event rules.

The reveal places floating cargo near the boat. Cool sea tones keep the wreck subdued. Rust and worn wood identify human debris.

Search Debris pulls one visible piece toward the boat. The injury result uses a camera jolt and a brief red flash. It shows no blood.

Send Carlitos reuses the current delegation motion. The chosen debris piece moves with his retrieval.

Dive Into Wreck reuses the current scuba entry choreography and dive audio. It hides the selected scuba item during the motion.

After water entry, the veil clears enough to show a tilted container ship on the seabed. Sparse cargo surrounds it. The view holds for three seconds.

The result then plays in the underwater view:

- Loot highlights one recovered object with a small warm accent.
- Collapse drops debris and raises a short silt cloud.
- Creature attack sends the existing anglerfish model from the hull toward the camera.
- Supernatural encounter moves the existing ghost model across the hull.

The camera returns to the boat before the result message appears.

Use the existing container ship, anglerfish, ghost, barrel, and cargo assets. Add no downloaded asset.

## Architecture

Add `wreckage` to the survival event ID list, reveal text, catalog, and presentation key types.

Route `wreckage` through the dedicated presentation family. Register one `WreckagePresentation` with the current coordinator.

Keep weighted outcomes in `eventCatalog.ts`. The session resolves costs, rewards, damage, pressure, item gain, and scuba breakage.

Allow scuba gear as an event choice item. Replace the obsolete day-action-only event exclusion with a focused event-item exclusion for radio.

The event UI uses the current choice, item condition, energy, Carlitos, result, and journal paths. Add no Wreckage-specific modal.

Extend the dive presentation with an optional underwater scene and hold. The normal dive action supplies no scene, so its behavior stays unchanged.

Add pure `wreckageChoreography` samples for debris search, underwater hold, collapse, creature, ghost, and return timing.

Expose existing models to the dedicated event bundle. Keep one loaded model source for each asset.

Reuse current dive, handling, impact, and event sounds. Add no sound asset.

## Data Flow

1. Day selection chooses Wreckage through the standard weighted selector.
2. The event bundle loads the presentation and required existing models.
3. The presentation stages surface debris and the submerged ship.
4. The event UI derives choice availability from player energy, scuba condition, and Carlitos state.
5. The chosen presentation motion plays before outcome resolution.
6. The session resolves one weighted outcome and applies its effects.
7. The presentation reacts to the selected result.
8. The event clears, writes its journal record, and returns control.

## Failure and Cleanup

Missing required model data fails bundle creation with the existing model error path.

Animation cancellation resolves pending promises. Cleanup restores the camera and selected scuba visibility.

Cleanup removes scene roots and disposes owned geometry and materials. It continues after one cleanup step fails.

The flow keeps the first action error. Later cleanup errors do not replace it.

## Tests

Add or update tests for:

- Exact event ID, phase, weight, earliest day, cooldown, and recurrence.
- Exact choices, costs, weights, health ranges, pressure, rewards, and scuba breakage.
- Search availability without scuba gear.
- Dive rejection without usable scuba gear or three player energy.
- Carlitos search visibility, three-energy cost, and lack of dive access.
- Scuba gear acceptance as an event item and continued radio exclusion.
- Standard event selection, resolution, journal, and recurrence behavior.
- Dedicated registry routing and lifecycle delegation.
- Pure choreography samples at start, key cues, completion, and unsupported inputs.
- Wreck, loot, collapse, creature, and ghost visibility.
- Camera and scuba restoration after completion, cancellation, and errors.
- Event bundle ownership and disposal.

Run the focused Vitest suites first. Then run the full test suite and production build.

## Out of Scope

- New items or resources.
- New sound or model downloads.
- A separate underwater movement system.
- Manual wreck exploration.
- Carlitos diving.
- New UI panels.

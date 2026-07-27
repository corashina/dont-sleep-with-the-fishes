# Survival Event Expansion Design

## Goal

Expand the survival phase with the missing single-survivor, non-story encounters
that fit the current game loop. Preserve deterministic rules, physical item
interaction, smooth event staging, accessible controls, explicit resource
ownership, and the project's authored maritime visual direction.

This feature adds:

- Drifting Loot
- Drifting Bottle
- Check the Back
- Mystery Chest
- Midnight Tour
- Night Trader
- The Handyman
- Other People, presented as a cargo/rescue boat

Death Stare keeps its existing rules and receives a placeholder large-fish
tableau.

The event selection and outcome values adapt publicly documented behavior from
the [unofficial event catalogue][event-catalogue] and the
[community guide][community-guide]. The rescue encounter uses the existing
`rescueProgress` system rather than reproducing the original game's hidden
rescue timer chain described in the [official version 1.1.4 notes][update-notes].

[event-catalogue]: https://unoffdontsleepwiththefishes.fandom.com/wiki/Events
[community-guide]: https://steamcommunity.com/sharedfiles/filedetails/?id=3752972642
[update-notes]: https://steamcommunity.com/app/4834070

## Boundaries

The feature excludes companions, companion needs, lore-note collection,
direction and danger flags, persistent chests, Heart pieces, Heart of the Sea,
Kraken and true-ending rules, ghost rescue, airplanes, helicopters, alternate
ending chains, and meta-progression requirements.

Mystery Chest opens during its encounter instead of becoming persistent cargo.
Midnight Tour grants immediate supplies and does not log a route flag. Rescue
through Other People ends the current run through the existing rescued state.

## Event Rules

### Drifting Loot

- Phase: day.
- Earliest day: 3.
- Weight: 18.
- Cooldown: 12 days.
- Retrieve costs 3 energy.
- A deterministic weighted outcome grants two food at weight 45, two bait at
  weight 25, two repair material at weight 20, or an Energy Bar at weight 10.
- Leave has no effect.
- If there is no available instance slot for the Energy Bar, grant food.

### Drifting Bottle

- Phase: night.
- Earliest day: 2.
- Weight: 30.
- Maximum appearances: 1.
- Ineligible while Bottled Paper is usable or broken aboard the boat.
- Fishing Net or Swim Ring retrieves one Bottled Paper.
- Sleep has no effect.
- The retrieval tool is not consumed or broken.

### Check the Back

- Phase: night.
- Earliest day: 2.
- Weight: 35.
- Cooldown: 35 days.
- Inspect uses weighted outcomes of 500 for one food and 50 for nothing.
- Ignore has no effect.
- The rare lore-only face outcome is excluded.

### Mystery Chest

- Phase: night.
- Earliest day: 6.
- Weight: 45.
- Cooldown: 33 days.
- Retrieve uses weighted outcomes of 80 for immediate useful loot and 30 for a
  mimic attack that removes 25 health.
- Useful loot is selected with equal weight from Duct Tape, Energy Bar, two
  food, two bait, and two repair material.
- An unavailable item reward falls back to food.
- Leave has no effect.

### Midnight Tour

- Phase: night.
- Earliest day: 7.
- Latest day: 40.
- Weight: 18.
- Cooldown: 30 days.
- Visit uses weighted outcomes of 50 for a useful supply and 2 energy next
  morning, 50 for one bait, and 12 for a 35-health ambush.
- The useful supply is selected with equal weight from Duct Tape, Energy Bar,
  and Medkit, and falls back to food if no item slot is available.
- Sail On has no effect.

### Night Trader

- Phase: night.
- Earliest day: 10.
- Weight: 14.
- Cooldown: 35 days.
- Only offers trades whose input is currently usable and whose output is a
  supported survival item.
- The authored trade table contains Food to Duct Tape, Bait to Energy Bar,
  Map to Compass, and Umbrella to Medkit.
- Accepting removes one offered input and grants the counterpart.
- If the counterpart is already aboard or has no free instance slot, grant one
  food instead.
- Refuse has no effect.

### The Handyman

- Phase: night.
- Earliest day: 20.
- Weight: 12.
- Cooldown: 50 days.
- Offers both directions of Telescope and Flashlight, Flare Gun and Harpoon
  Gun, Scuba Gear and Medkit, Fishing Net and Bucket, and Duct Tape and Energy
  Bar.
- Accepting removes the selected input and grants its paired item.
- If the counterpart is already aboard or has no free instance slot, grant one
  food instead.
- Touch the Hand removes 30-60 hull and 70 health.
- Sleep has no effect.
- The unsupported Chest and Anchor pair is excluded.

### Other People

- Phase: night.
- Earliest day: 15.
- Weight: 10.
- Cooldown: 20 days.
- Requires at least 15 rescue progress, equivalent to one sent Bottled Paper.
- Flare Gun guarantees rescue and is consumed.
- Flashlight has weighted outcomes of 40 for rescue and 60 for being missed.
- Let It Pass has no effect.

### Death Stare

Death Stare retains its existing eligibility, choices, weights, and effects.
Its presentation uses the new large-fish placeholder tableau.

## Event Data Model

`SurvivalEventDefinition` gains optional declarative eligibility fields:

- `maximumAppearances`
- `absentItemIds`
- `minimumRescueProgress`

Session-owned appearance counts participate in event eligibility. Absent-item
checks consider both usable and broken items because either still occupies the
physical item slot.

`EventChoiceDefinition` supports contextual choices without an item. These are
distinct from the fallback Endure response and have authored labels such as
Retrieve, Inspect, Visit, Refuse, and Let It Pass.

Event outcomes gain deterministic inventory acquisition and trade effects:

- Grant a supported item, falling back to food when its stable slot is occupied.
- Trade an offered resource or item for a supported item, with the same
  fallback.

The resolver continues to draw all randomness from the injected `RandomSource`.
It returns concrete effects without mutating catalog definitions.

## Inventory Acquisition

Survival-generated utility items use the existing stable `type-1` instance ID.
The inventory owns creation of that instance when its slot is absent. A
consumed or lost slot may be restored as a newly acquired usable item; a usable
or broken slot blocks acquisition. A blocked reward becomes one food.

`BoatSupplyDisplay` pre-creates one pooled visual copy for every utility type,
not only types saved from Dorothy. Food, bait, and repair material retain their
existing three-copy pools. This lets granted supplies appear without allocating
models during an event or frame update.

The generated item becomes selectable and actionable through the same snapshot,
interaction-anchor, condition, and UI paths as a rescued item.

## Event Choice UI

Physical item responses remain attached to the corresponding boat props.
Eligible props receive the existing event highlight and selection treatment.

Contextual non-item choices appear in a compact, ink-backed action strip near
the staged subject. The strip:

- shows only authored contextual choices;
- remains visually separate from the ordinary daytime command UI;
- is fully keyboard operable;
- traps focus with the unresolved event;
- identifies selected, unavailable, and focused states without relying on
  color alone;
- restores focus after the event resolves;
- is hidden before the tableau reveal completes.

Endure remains a fallback only when an event has no usable physical response
and no authored contextual response.

## Presentation Architecture

`BoatWorld` owns an `EventPresentationLayer`. The layer owns and disposes every
geometry, material, group, and borrowed model used for event tableaus. It uses
fixed pools created during world construction and performs no per-frame
allocation.

The layer provides operations to stage, reveal, react, hold, and clear an event.
The phase orchestrator passes event identity separately from the general
presentation cue so existing action and terminal cues remain reusable.

Placeholder tableaus are:

- a bottle and short retrieval line for Drifting Bottle;
- a lashed barrel and crooked crate for Drifting Loot;
- a stern splash and fish silhouette for Check the Back;
- a salt-marked chest with an irregular lid for Mystery Chest;
- a small rock shelf and bent marker or palm silhouette for Midnight Tour;
- a narrow lantern skiff and cloaked silhouette for Night Trader;
- an oversized reaching hand for The Handyman;
- a distant constructed cargo vessel for Other People;
- a large asymmetrical fish silhouette with a held stare for Death Stare.

Floating subjects sample the shared wave field used by the ocean and boat.
Continuous buoyancy remains fluid; authored entrances use tactile keyed motion.

## Transition Contract

All new and existing events use the same ordered contract:

1. The current scene fades to black.
2. While covered, the phase and weather settle and the event tableau stages.
3. The cover fades out while the tableau performs a short anticipation and
   decisive entrance.
4. The subject settles imperfectly into a held readable pose.
5. Only after the reveal completes do physical and contextual choices unlock.
6. A physical selection lifts and settles the chosen prop; a contextual
   selection receives an equivalent compact press and response beat.
7. The tableau reacts to the resolved outcome, the result caption appears, and
   the presentation clears or remains for a terminal rescue.
8. Night events transition cleanly to dawn.

Generation checks already used by `SurvivalPhase` cancel stale asynchronous
steps. Disposal resolves active presentation promises, restores base poses,
and removes the event layer exactly once.

With reduced motion, state ordering is unchanged, but travel, lurches, and
overshoot become direct held poses with short fades.

## Visual Interpretation

The feature follows the visual guide's four pillars:

- Authored illustrated forms: procedural props use recognizable constructed
  silhouettes, seams, lashings, layered profiles, and purposeful asymmetry.
- Scene-integrated interface: physical choices stay on boat props and generic
  decisions use a compact contextual strip rather than a central dialog.
- Tactile keyed motion: each tableau uses anticipation, decisive travel,
  restrained impact, a held pose, and clean restoration.
- Restrained print treatment: existing lighting and print processing unify the
  tableaus; effects do not substitute for their geometry or staging.

The tableaus are original interpretations and do not copy proprietary artwork,
textures, icons, fonts, or layouts.

## Error Handling

- An event with no eligible authored response exposes its sleep, leave, refuse,
  or Endure fallback as appropriate.
- An unavailable item reward becomes one food.
- An empty weighted event pool uses the existing quiet fallback.
- Invalid event definitions fail catalog validation at startup and in tests.
- Stale event transitions cannot unlock controls or mutate presentation.
- Disposing the phase cancels active animations and restores world/UI base
  states.

## Verification

Unit tests cover:

- validation of the new eligibility, contextual-choice, grant, and trade data;
- deterministic weighted selection and concrete reward resolution;
- maximum-appearance, absent-item, and rescue-progress eligibility;
- generated inventory items and occupied-slot food fallback;
- both directions of Handyman trades;
- resource-backed Night Trader offers;
- rescue success, failure, and Flare Gun consumption;
- unchanged Death Stare gameplay outcomes.

UI and orchestration tests cover:

- contextual choice rendering, focus trapping, keyboard activation, and cleanup;
- choice locking until reveal completion;
- cover, stage, reveal, selection, reaction, and dawn ordering;
- stale transition cancellation;
- reduced-motion ordering.

World tests cover:

- placeholder tableau construction and stable object names;
- shared-wave sampling for floating props;
- no per-frame geometry or material creation;
- resource disposal exactly once;
- base-pose restoration after clearing an event.

The final verification commands are:

```bash
bun run test
bun run typecheck
bun run build
```

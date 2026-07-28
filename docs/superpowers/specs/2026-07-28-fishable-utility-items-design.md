# Fishable Utility Items Design

## Goal

Add five wiki-documented utility catches to fishing while preserving deterministic
selection, physical lifeboat inventory, and the rule that the player cannot own
more than one active copy of a specific utility item.

Development references:

- <https://unoffdontsleepwiththefishes.fandom.com/wiki/Fishing>
- <https://unoffdontsleepwiththefishes.fandom.com/wiki/Items>
- <https://unoffdontsleepwiththefishes.fandom.com/wiki/Events>

The wiki remains a development-time reference. The game performs no runtime
network requests.

## Catch Rules

Add these entries to the weighted fishing pool:

| Catch | Weight | First day | Reward | Condition |
| --- | ---: | ---: | --- | --- |
| Bait | 5 | 0 | `+1` Bait | usable resource |
| Wet Duct Tape | 5 | 3 | Duct Tape | usable |
| Broken Compass | 5 | 0 | Compass | broken |
| Torn Fishing Net | 3 | 0 | Fishing Net | broken |
| Energy Bar | 8 | 0 | Energy Bar | usable |

These catches are utility salvage rather than fish:

- they award no Food;
- they do not consume captured Bait;
- Bait does not increase their selection weight;
- their labels are recorded in the fishing journal and shown in the catch result.

Bait is stackable. Duct Tape, Compass, Fishing Net, and Energy Bar are unique
utilities. A unique catch is excluded from the eligible pool while its matching
item is usable or broken. A consumed or lost matching item does not count as
owned, so that catch becomes eligible again.

## Item Conditions and Event Breakability

The existing per-instance conditions remain authoritative:

- `usable`
- `broken`
- `consumed`
- `lost`

Fishing creates Duct Tape and Energy Bar as usable, Compass and Fishing Net as
broken, and Bait as an aggregate usable resource. Gaining a unique utility must
be a single guarded inventory operation that accepts the initial condition; no
path may briefly create a duplicate or gain an item and then break a different
instance.

Wiki event outcomes continue to define which ordinary items can break. The
breakable utility set is:

- Compass
- Map
- Binoculars
- Fishing Net
- Bucket
- Scuba Gear
- Anchor
- Umbrella
- Swim Ring

Flashlight may be lost but does not break. Charged consumables are consumed or
lost rather than broken. Existing event behavior and the deterministic random
break selection remain unchanged.

## Architecture

### Fishing catalog

Extend `FishingCatchKind` with `utility` and give every catch a typed reward:

- Food reward;
- Bait resource reward;
- item reward with an explicit initial condition;
- no reward for junk.

Each catch also declares whether its reel presentation uses a fishing model or
an existing item model. Catalog validation rejects unknown item references,
non-positive weights, invalid minimum days, broken rewards for non-breakable
items, and reward/kind contradictions.

`eligibleFishingCatches` receives the current active unique item types in
addition to day and captured-Bait state. It filters unavailable unique rewards
before applying the existing Bait weight modifier. The selection algorithm and
injected random source remain unchanged.

### Fishing session

`SurvivalSession.beginFishing` snapshots the active unique item types and passes
them into `FishingSession`. No other action or event can mutate inventory while
an attempt is active, so the hidden catch remains valid through resolution.

`FishingSession` remains renderer-independent. Its terminal result carries the
selected typed catch definition.

### Reward application

`SurvivalSession.finishFishing` applies the catch reward:

- Food updates the Food resource;
- Bait increments the Bait resource by one;
- an item reward calls the guarded inventory gain operation with its declared
  initial condition;
- junk changes no resource or inventory state.

The inventory layer enforces the one-active-instance rule even though the pool
already excludes owned utilities. A defensive rejection cannot replace or
alter an existing usable or broken item.

The result code distinguishes fish, utility, junk, and miss outcomes. The
journal records the displayed catch label, Food amount, and Bait consumption.

## Presentation

The catch reel reuses the locally committed Bait, Duct Tape, Compass, Fishing
Net, and Energy Bar item models. `FishingCatchLibrary` loads its own temporary
copy, owns its geometries, materials, and textures, and disposes them when the
result clears. It never borrows resources owned by the boat supply display.

Broken Compass and Torn Fishing Net use the same damaged material treatment
during the reel presentation and after appearing in the lifeboat. Their
tooltips explicitly say `BROKEN` and offer no usable event action until repaired.
Duct Tape and Energy Bar retain their normal usable appearance. Bait joins the
existing physical Bait group and quantity display.

The result presentation uses the existing scene-integrated catch composition:

- `BAIT +1`
- `DUCT TAPE RECOVERED`
- `BROKEN — REPAIR WITH DUCT TAPE`
- `ENERGY BAR RECOVERED`

No inventory panel is added. The world remains dominant, with the caught object
settling into the existing physical supply display. This follows the visual
style guide through reused authored forms, scene-integrated status, tactile
reel motion, and restrained damaged material treatment.

If a local model fails to load, the catch library uses an existing procedural
item fallback. Visual failure does not discard or alter the earned reward.

## Testing

### Catalog and selection

- Assert the five exact weights and minimum days.
- Assert utility catches award no Food and never consume Bait.
- Assert captured Bait does not modify utility weights.
- Assert invalid reward definitions fail validation.
- Assert seeded rolls select stable entries at weight boundaries.

### Inventory and rewards

- Bait increments the aggregate resource and remains stackable.
- Wet Duct Tape creates usable Duct Tape.
- Broken Compass creates a broken, repairable Compass.
- Torn Fishing Net creates a broken, repairable Fishing Net.
- Energy Bar creates a usable Energy Bar.
- Usable and broken unique utilities exclude their matching catches.
- Consumed and lost unique utilities restore catch eligibility.
- Guarded gain never creates a duplicate active unique utility.
- Repairing a caught broken item consumes Duct Tape and restores usability.

### Regression and presentation

- Existing fish and junk weights, rewards, and Bait behavior remain unchanged.
- Event-specific and random break outcomes use only the approved breakable set.
- Catch result and journal copy distinguish utility salvage from junk.
- Temporary utility catch models load, show the correct condition treatment,
  and dispose exactly once.
- Lifeboat synchronization shows the new resource or item condition after the
  reel sequence.

### Completion verification

- Run the complete Vitest suite.
- Run TypeScript type-checking.
- Produce a successful production build.
- In a browser playthrough, force each utility catch and verify its reel model,
  result copy, inventory reward, uniqueness filtering, broken state, and repair.

## Success Criteria

- All five wiki-documented utility catches participate at their exact weights
  and minimum days.
- Rewards and initial conditions match the approved rules.
- The player never owns more than one usable or broken copy of a unique utility.
- Bait remains stackable, and utility catches neither consume nor benefit from
  Bait.
- Existing event breakability and deterministic behavior do not regress.
- Temporary reel assets and persistent boat assets each have one clear owner
  and are disposed exactly once.

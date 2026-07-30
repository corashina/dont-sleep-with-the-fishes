# Event Actions Design

## Goal

Make night events isolate their valid actions.

Keep the event reveal delay.

Classify only Sinking Ship and Drifting Loot as day events.

Remove bottom-center text for accepted night-event results.

Keep all journal records.

## Scope

This change covers event action states, event phases, night result feedback,
and the first journal record.

It does not change event outcomes, weights, costs, or reveal timing.

It does not add a second sinking-ship encounter.

It preserves the current uncommitted Chest and pressure work.

## Interaction states

`SurvivalUI` will derive one state for each boat anchor:

- `ordinary`
- `eventLocked`
- `eventAvailable`
- `eventUnavailable`
- `selected`

One state will control pointer input, keyboard focus, tooltips, highlights,
activation, and visual treatment.

### Event staging

Night staging starts when the player selects End Day and a night event opens.

All ordinary boat actions become inert at that point.

Locked anchors will not:

- receive pointer input;
- enter the tab order;
- show a tooltip;
- publish a world highlight;
- activate an action.

The UI will clear any active daytime hover or focus highlight.

The controls will stay locked during the existing cover, tableau staging,
caption, scene settle, uncover, and reveal steps.

### Event unlock

The existing reveal sequence will remain the unlock boundary.

After the reveal completes, only valid event actions become available.

Valid physical item actions will use the current eligibility map.

Valid physical event props will use their contextual choice mapping.

The lantern will become available only when the event defines its sleep choice.

Context choices will keep their current action strip.

Unavailable event choices will remain visible only when they explain a
resource requirement. Ordinary daytime actions will expose no unavailable
tooltip.

### Visual treatment

Available event actions will use a brass-amber accent.

Physical items will keep a warm emissive treatment.

Anchor controls will add irregular corner marks in the same accent.

The permanent event accent will differ from the normal white hover outline.

Selected state will keep its stronger yellow keyed treatment.

Color will not carry meaning alone. The corner marks and interaction state will
also identify an available action.

This follows the visual guide:

- The world remains dominant.
- Controls stay attached to physical subjects.
- The reveal keeps its tactile keyed timing.
- The accent uses the restrained maritime print palette.

## Event phase rules

The day event set will contain only:

- Sinking Ship
- Drifting Loot

Sinking Ship represents the existing Dorothy escape.

It will not create a new lifeboat encounter.

Drifting Loot will keep its current dawn scheduling, variants, costs, and
rewards.

These events will move from day to night:

- Dangerous Waters
- Leak
- School of Fish
- Snatcher
- Death Stare
- Swarm of Anglerfish
- Whirlpool
- Shark Men

Their weights, day limits, cooldowns, choices, and outcomes will stay unchanged.

The phase will stop scheduling a general day event after a day action.

This prevents the quiet day fallback from becoming a visible event.

## Sinking Ship journal record

The first day will record Sinking Ship as the opening event.

The record will describe the existing escape from Dorothy.

The journal model will use a distinct opening record.

It will not invent an event choice, item response, or random outcome.

The day-one record will say:

> Dorothy struck something and began to sink. I reached the lifeboat with the
> supplies I could save.

Later journal entries will keep their current day and night records.

The snapshot will clone and freeze the new record like existing journal data.

## Night result feedback

Accepted night-event outcomes will not use the bottom-center feedback element.

The journal will still record the outcome message and all mutations.

The world reaction, outcome hold, dawn transition, and terminal ending will
still run.

Accepted day-event presentation will stay unchanged.

Rejected choices and internal presentation errors will still use bottom-center
feedback.

This keeps useful error details visible without repeating journal information.

## Data flow

1. End Day opens a night event.
2. `SurvivalPhase` begins event presentation.
3. `SurvivalUI` locks every ordinary anchor and clears active highlights.
4. The world stages and reveals the event.
5. `SurvivalPhase` computes valid item and context choices.
6. `SurvivalUI` unlocks only those choices and applies the event accent.
7. The player selects one valid response.
8. `SurvivalSession` resolves and journals the result.
9. The world reacts to the result.
10. Night resolution continues without bottom-center accepted feedback.
11. Dawn restores ordinary anchor behavior.

## Ownership

`SurvivalSession` owns event rules and journal state.

`SurvivalPhase` owns event timing and feedback routing.

`SurvivalUI` owns anchor interaction state, controls, tooltips, and listeners.

`BoatSupplyDisplay` owns physical item material states.

The change will not allocate models, materials, or controls during frame
updates.

## Error handling

Rejected actions will not change state.

Rejected event choices will show their reason.

Missing event data will show an error and keep the event safe.

A stale reveal will not unlock controls.

Disposal will clear active highlights and event states.

## Tests

### UI tests

- Locked anchors do not publish pointer highlights.
- Locked anchors do not accept focus.
- Locked anchors do not show tooltips.
- Locked anchors do not activate day actions.
- Available event anchors unlock only after selection data arrives.
- Available event anchors use the event state and accent markers.
- Clearing the event restores ordinary interaction.
- Keyboard input reaches only available event actions.

### Phase tests

- The reveal completes before valid actions unlock.
- Accepted night results do not call bottom-center feedback.
- Rejected night choices still call bottom-center feedback.
- Night reactions, holds, endings, and dawn still run.
- Day actions do not request a general day event.
- Drifting Loot still opens through its dawn schedule.

### Rule tests

- Only Drifting Loot remains in the random day event catalog.
- The eight moved events are in the night catalog.
- Their event values stay unchanged except for phase.
- Day one contains the Sinking Ship opening record.
- Journal snapshots protect the opening record from mutation.

## Completion criteria

- Night-only unavailable actions cannot hover, focus, show tooltips, highlight,
  or activate.
- Valid night actions unlock after the existing reveal delay.
- Valid night actions use a distinct brass-amber treatment.
- Accepted night results do not show bottom-center text.
- The journal keeps all night results.
- Sinking Ship appears in the first day journal.
- Drifting Loot is the only random day event.
- The former day events resolve through the night flow.
- All focused tests, type checks, and builds pass.

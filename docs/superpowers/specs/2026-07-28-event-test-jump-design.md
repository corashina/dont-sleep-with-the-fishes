# Event Test Jump Design

## Goal

Add a developer-facing way to start any authored survival event directly from
the existing System Tuning menu opened with Backquote. The selected event must
run through its real presentation and resolution paths, then continue as a
normal survival run.

## User flow

1. Open System Tuning with Backquote during either game phase.
2. In an **EVENT TEST** section, choose an event from a dropdown.
3. Activate **ENTER EVENT**.
4. The current phase is replaced by a fresh survival phase.
5. The chosen event is staged immediately with one usable instance of every
   recoverable item aboard.
6. Resolve the event normally and continue the survival run.

The explicit action button prevents keyboard navigation through the dropdown
from triggering an unintended phase change.

## UI

Extend the existing `PostProcessingConsole` with an optional event-test control
contract. The section contains:

- A labelled event dropdown populated from the authoritative survival event
  catalog.
- Day and night events grouped for quicker scanning.
- An **ENTER EVENT** button.
- Short copy stating that entering an event starts a fresh test run with all
  items.

The control remains inside the existing compact System Tuning panel rather than
adding another overlay. It uses the panel's current typography, focus treatment,
and restrained dark control styling. This preserves the scene-integrated,
world-dominant visual direction while keeping developer controls clearly
separate from player-facing survival UI.

## Architecture and ownership

### Event-test menu contract

`PostProcessingConsole` receives event descriptors and an `enterEvent(eventId)`
callback from `Game`. It owns only the DOM controls and listeners. It does not
import or mutate survival session state.

### Test loadout

A focused pure helper creates a fresh immutable scavenging result containing
one usable instance of every recoverable item type. Stable instance identifiers
follow the same format used by normal scavenging results. Permanent lifeboat
equipment remains owned by the survival world and is not duplicated.

### Phase transition

`Game` owns the jump because it already owns phase creation, replacement,
camera reset, pointer-lock exit, generation guards, and disposal. Entering an
event:

1. Validates the selected identifier against the authoritative event catalog.
2. Closes or supersedes the current overlay state.
3. Detaches and disposes the current phase exactly once.
4. Exits pointer lock and resets the shared camera.
5. Creates a fresh seed and the all-items test result.
6. Creates and starts `SurvivalPhase` with the selected event identifier.

The normal restart action remains unchanged and returns to a fresh scavenging
run.

### Initial event seam

Extend survival phase construction with an optional initial event identifier
and forward it to the existing validated `SurvivalSession` `initialEventId`
option. The session remains the authority for adopting the event's day or night
state. The normal event presentation layer, world staging, weather selection,
choices, outcomes, journal behavior, and dawn transition are reused without a
test-only resolution path.

The test run begins on day one with normal starting meters and resources derived
from the all-items inventory. Event eligibility timing is intentionally bypassed
only for the selected initial event. After resolution, all ordinary eligibility,
randomness, and survival rules apply.

## Error handling

- The menu only renders identifiers from the event catalog.
- `Game` rejects an unknown identifier without replacing the active phase.
- If survival phase construction or weather override application fails, the
  partially constructed phase is disposed according to existing ownership
  rules and the original error remains visible to development tooling.
- Repeated activation cannot leave two owned phases because the existing phase
  generation guard remains authoritative.

## Testing

Add deterministic tests for:

- Event dropdown population, day/night grouping, button activation, and
  keyboard-accessible labels.
- The all-items helper producing one stable, usable instance of each recoverable
  item without permanent equipment.
- `Game` disposing the outgoing phase, resetting into survival, and forwarding
  the selected event identifier and complete test loadout.
- Selection from both scavenging and survival phases.
- Rejection of unknown identifiers and idempotent cleanup.
- `SurvivalPhase` forwarding the identifier to `SurvivalSession`, whose existing
  tests continue to cover event validation and phase adoption.

Run the focused tests, full test suite, typecheck, and production build before
completion.

## Scope

This feature is development tooling only. It does not add URL configuration,
save test presets, expose meter or condition editing, alter event outcomes, or
add a return-to-picker loop. Weather overrides continue to behave as they do
now and remain active across the phase jump until page reload.

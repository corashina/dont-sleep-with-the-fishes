# Opaque Scene Settle

## Goal

Keep the screen fully black until every hidden event or dawn scene change is
complete and at least one completed scene frame has been rendered. The
2.5-second uncover begins only from a fully settled event or day scene.

This refines the survival-event transition design. It does not change the
existing 2.5-second cover, 2-second event-outcome hold, event rules, or authored
world animation durations.

## Root Cause

Event entry currently starts `world.revealEvent()` and
`ui.setSleepCovered(false)` together. The tableau therefore moves into place
while the black cover is already becoming transparent.

Event exit and quiet-night dawn await their world cue, but scene clearing,
snapshot synchronization, and uncover can occur without a completed rendered
frame between them. The browser can begin compositing the uncover while the
replacement scene is first becoming visible.

## Transition Contract

Every black-covered scene replacement follows this sequence:

1. Finish the existing 2.5-second cover to opaque black.
2. Perform all hidden state and scene mutations.
3. Finish any authored tableau, dawn, or other world animation associated with
   the replacement scene.
4. Render the completed Three.js scene while the cover remains opaque.
5. Wait for an opaque scene-settle barrier spanning two animation frames.
6. Begin the existing 2.5-second uncover.
7. Unlock commands and restore focus only after uncover completes.

The two-frame barrier is a readiness guarantee, not a fixed cinematic pause.
It gives the completed canvas frame one full presentation opportunity behind
black without adding an arbitrary half-second delay.

## Affected Flows

### Event Entry

After covering, stage the event and show its caption. Await the entire
`world.revealEvent()` animation behind black. Render the completed tableau,
await the opaque scene-settle barrier, then uncover and enable choices.

The event tableau must not visibly travel into place during uncover.

### Resolved Event Exit

Keep the existing cue, reaction, feedback, and two-second outcome hold. After
covering, clear the event and complete dawn when required. Synchronize and
render the resulting scene, await the opaque scene-settle barrier, then
uncover, unlock, and restore focus.

Day events use the same barrier after returning to the day scene without
starting dawn.

### Quiet-Night Dawn

Keep the existing covered sleep hold. Complete dawn, synchronize and render the
day scene, await the same opaque scene-settle barrier, then uncover.

## Ownership and Cancellation

`SurvivalUI` owns a new `settleCoveredScene(): Promise<void>` operation because
it owns the black cover and browser-frame scheduling. The operation resolves
after two `requestAnimationFrame` callbacks while the cover remains opaque.

Only one settle operation may be pending. Starting another settles the previous
one. `dispose()` settles the pending operation and cancels its scheduled frame
callback. `SurvivalPhase` retains its generation guard after awaiting the
barrier, so restart or disposal cannot continue into uncover.

The test environment may inject or fake animation-frame scheduling through the
existing browser timer environment; gameplay rules and event selection remain
renderer-independent and deterministic.

## Rendering

Before starting the settle barrier, `SurvivalPhase` explicitly renders its
current world scene through the existing `SceneRenderer`. This render is a
transition-boundary operation, not additional per-frame setup or allocation.
The normal game loop remains unchanged.

## Testing and Verification

- Event entry does not call uncover until tableau reveal, explicit render, and
  the settle barrier complete in that order.
- Resolved night events do not call uncover until clear, dawn cue, synchronized
  render, explicit scene render, and settle complete.
- Resolved day events use the same barrier without beginning dawn.
- Quiet-night dawn uses the same render-and-settle barrier.
- Restart and disposal during the settle barrier prevent uncover, unlock, focus
  restoration, and stale callbacks.
- `SurvivalUI` settles superseded and disposed frame waits exactly once.
- The full test suite, typecheck, production build, and diff check pass.
- A live browser click verifies opacity remains `1` throughout tableau/dawn
  completion and the two-frame settle, and only then begins the gradual
  2.5-second uncover.

# Survival Event Transition Redesign

## Goal

Make survival events feel continuous and deliberate. Scene changes must happen
behind a fully black frame so the player never sees tableaus, weather, UI, or
day state snap between configurations.

This redesign preserves the event-entry sequence from the July 24 transition
spec and supersedes its rule that event resolution adds no blackout.

## Timing and Sequence

Use the existing survival full-screen cover with these normal-motion timings:

1. `End Day` starts a 2.5-second fade to black.
2. Once fully black, stage the selected event tableau and event UI.
3. Fade from black into the event over 2.5 seconds.
4. Keep event choices locked until the reveal finishes.
5. After a response or item is chosen, play the authored outcome cue and
   tableau reaction, then show the outcome feedback.
6. Hold the completed reaction and feedback for 2 seconds.
7. Fade to black over 2.5 seconds.
8. While fully black, clear the non-terminal event tableau, advance dawn when
   required, and render the resulting day state.
9. Fade from black into daytime over 2.5 seconds, then restore commands and
   focus.

Rescue remains terminal: its cargo-vessel tableau stays visible and does not
transition to another day.

## Ownership

`SurvivalPhase` owns sequencing and lifecycle-generation checks.
`SurvivalUI` owns the cover transition and a cancellable outcome hold.
`EventPresentationLayer` continues to own tableau staging, reaction, clearing,
and disposal.

The phase must not mutate the event scene or day state until the cover promise
has resolved to fully black. Restart and disposal must settle pending UI work
without allowing stale continuations to clear, advance, or reveal a scene.

Reduced-motion mode keeps the same ordering but settles fades and the outcome
hold immediately.

## Failure and Edge Cases

- An unavailable or rejected response does not begin the exit transition.
- Day events return to the current daytime state; night events advance dawn
  while black.
- Terminal failure and rescue keep their existing ending presentation rules.
- Repeated input is ignored while a transition, response, or hold is active.
- A superseding restart/disposal leaves no pending timer, transition listener,
  focus target, or scene mutation.

## Verification

Automated tests must prove:

- End Day stages an event only after the cover reaches black.
- Event selection unlocks only after the 2.5-second reveal completes.
- Successful outcomes finish their cue/reaction, show feedback, hold for two
  seconds, and only then begin the exit fade.
- Tableau clearing and dawn/day rendering occur after the exit cover reaches
  black and before uncover begins.
- Day-event, night-event, rescue, reduced-motion, restart, and disposal paths
  preserve their lifecycle contracts.

A rendered smoke test must confirm the full-screen cover visually hides scene
changes and that no console errors occur.

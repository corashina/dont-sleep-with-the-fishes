# Survival Event Transitions Design

## Goal

Make survival event transitions feel deliberate and keep event controls clear:

- Enlarge and recolor the End Day button so it remains visually distinct from the lifeboat.
- Replace the immediate blackout with a 2.5-second fade to black and a 2.5-second reveal into every day or night event.
- Reduce the event caption to a top-centered title whose color communicates risk.
- Remove the visible danger label and narrative event description.
- Prevent Endure from overlapping End Day and ensure it is pointer- and keyboard-operable.

This change preserves the existing scene-led event interaction, including physical item choices aboard the lifeboat.

## Visible Interaction Design

### End Day

The End Day button remains fixed at the bottom-right during ordinary daytime play. It will have a 210-pixel minimum width and 72-pixel minimum height. Its cool-blue `#315c6f` base and bone-colored text replace the existing brown timber treatment so it contrasts with the lifeboat's orange and wood palette.

End Day will be hidden and removed from keyboard navigation for the full event presentation. It returns only after the event has resolved and ordinary commands are legal again.

### Event Caption

The event caption moves to the top center of the viewport and contains only the event title. The visible danger word and `revealText` description are removed from the event presentation.

The title color communicates the event definition's risk:

- `safe`: green
- `uncertain`: yellow
- `dangerous`: red

The event's risk remains in accessible text so color is not the only signal available to assistive technology.

### Endure

Endure occupies the bottom-right event-action position after End Day has been hidden. It retains the current rule that it appears only when the event has no eligible physical item response.

The button must sit above scene interaction layers, accept pointer input, expose a visible keyboard focus state, and activate through click, Enter, or Space. Physical eligible items remain the other event response mechanism.

## Transition Sequence

Every transition into a day or night event uses one shared orchestration path:

1. Mark event presentation as transitioning, lock commands, and hide End Day.
2. Fade the scene to opaque black over 2.5 seconds.
3. While the screen is fully covered, render the committed event state and stage the title and event-specific world presentation.
4. Start the event cue and fade from black into the event over 2.5 seconds.
5. Compute and publish eligible physical items.
6. Enter the choosing state and unlock eligible items or Endure.

Daytime events reached after an accepted action and nighttime events reached through End Day use this same entry sequence. The transition applies when entering an event; it does not add an additional blackout when resolving the event.

Quiet nights retain the sleep flow without fabricating an event: fade to black over 2.5 seconds, hold briefly, advance to dawn while covered, and fade into the new day over 2.5 seconds.

When `prefers-reduced-motion` is active, fade and hold durations collapse to the existing effectively instant reduced-motion duration.

## Ownership and State

`SurvivalPhase` owns the event lifecycle and transition ordering. It will route all pending-event entry through a single asynchronous sequence rather than duplicating day and night choreography.

`SurvivalUI` owns the black cover, its transition completion, End Day visibility, event title markup, accessible risk text, and Endure placement. The UI exposes focused operations; it does not decide when the survival state advances or which event choices are eligible.

The existing survival session remains the deterministic source of gameplay state. No event rules, probabilities, inventory rules, or authored event definitions change.

The cover transition will use a transition-completion listener with a timeout fallback and a supersession guard. Restart, disposal, or a newer transition must settle stale work without restoring obsolete presentation state. `SurvivalPhase` continues to check its lifecycle generation after asynchronous boundaries.

## Accessibility

- End Day is absent from the tab order while hidden.
- Event risk is conveyed through both title color and accessible text.
- Endure remains reachable by Tab and operable with Enter and Space.
- Focus restoration continues to target a currently legal command after event resolution.
- Reduced-motion preference removes the long cinematic timing.

## Testing

Update the survival UI and phase tests to cover:

- The larger cool-blue End Day styling and its normal bottom-right placement.
- End Day becoming hidden and non-focusable throughout event presentation.
- Title-only event markup with no visible danger label or narrative description.
- Safe, uncertain, and dangerous title color states plus accessible risk text.
- Endure occupying a non-overlapping layer and routing pointer and keyboard activation.
- Day-event ordering: cover completes, event presentation is staged, uncover begins, then choices unlock.
- Night-event ordering through End Day using the same transition path.
- Quiet-night ordering through cover, hold, dawn, and uncover.
- The 2.5-second normal-motion timing and effectively instant reduced-motion timing.
- Superseded, restarted, and disposed transitions settling without stale UI changes.

Run `bun run test`, `bun run typecheck`, and `bun run build` after implementation.

## Scope

This work changes survival event presentation and its transition orchestration only. It does not add new events, alter event outcomes, change item eligibility, add progression, or change the desktop keyboard-and-mouse milestone.

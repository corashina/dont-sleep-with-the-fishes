# Larger Scavenging Weight Circles

## Goal

Make the scavenging carry indicator easier to read and remove the feedback copy beneath it.

## Layout

- Keep three circles centered at the top of the scavenging HUD.
- Increase each desktop circle from 70px to 88px and the gap from 10px to 12px.
- Increase each circle at widths up to 820px from 54px to 64px and the gap from 6px to 8px.
- Keep the existing borders, textures, item portraits, pickup order, and weight-unit filling behavior.

## Feedback Removal

- Remove the scavenging `SAVED`, `DROPPED`, and `LOST` feedback element from the DOM.
- Remove the feedback field and update method from `GameUI`.
- Remove scavenging-phase calls that populate the feedback element.
- Do not retain the copy as hidden or accessible text.
- Keep the interaction prompt near the bottom of the screen unchanged.

## Tests

- Assert the 88px desktop circles, 12px gap, 64px narrow circles, and 8px narrow gap.
- Assert that the scavenging HUD contains no feedback element.
- Preserve the existing tests for empty, one-unit, two-unit, and three-unit item fills.
- Run the focused `GameUI` tests, the full test suite, typecheck, and production build.

## Scope

This change affects the scavenging HUD only. It does not change item weights, pickup rules, saved-item summaries, interaction prompts, or survival-phase UI.

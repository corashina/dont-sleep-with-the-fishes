# Survival HUD Corner Layout

## Goal

Move the Health, Food, Energy, and Hull indicators to the top-left. Move the End Day button to the top-right. Keep the journal marker and day, phase, and weather status at the top-center.

## Design

Keep the existing `SurvivalUI` markup and interaction wiring. CSS will anchor `.survival-meters` to the left and change its transform origin to the top-left. CSS will anchor `.end-day-button` to the viewport's top-right while its existing `.survival-top` parent keeps the status and journal centered.

The narrow-screen rule will scale the condition group from its left edge. The End Day button will retain its current size and interaction behavior.

## Testing

Add a DOM-level layout contract test that checks the meters remain outside the centered controls and the End Day button remains inside them. Add CSS assertions for the top-left meter anchor, top-right End Day anchor, and left-edge responsive transform origin. Run the Survival UI test file, then the full test, typecheck, and build commands.

## Scope

This change affects HUD placement only. It does not change game state, labels, keyboard shortcuts, meter values, journal behavior, or End Day behavior.

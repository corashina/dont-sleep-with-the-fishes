# Survival Condition Icon Fill Design

## Goal

Replace the four visible survival condition readouts with large, self-filling icons.

The row contains Health, Food, Energy, and Hull in its current order.

## Presentation

Each condition uses two aligned copies of its current SVG artwork.

The outline copy stays visible at all values. It has no solid fill. The colored copy sits below it. A clipped container reveals the colored copy from the bottom upward.

A 50 percent value fills the lower half. The upper half stays empty. The full outline stays visible.

Increase each icon from 58 by 54 pixels to about 76 by 70 pixels. Keep the row in the top-left corner. Keep its current responsive scale behavior.

Remove all visible condition labels, numbers, meter bars, and danger text. Keep the existing danger jolt animation.

## Values

Health and Hull use their existing zero-to-100 values.

Food uses the existing inverse hunger value. Hunger zero displays a full Food icon. Hunger 100 displays an empty Food icon.

Energy converts its existing zero-to-three range to a percentage.

Clamp every visual fill between zero and 100 percent.

## Accessibility

Keep each condition as an accessible meter. Keep its name, minimum, maximum, current value, and danger text for assistive tools.

Do not expose duplicate SVG copies to assistive tools.

The fill height gives a non-color indication of the value.

## Code Changes

Update `SurvivalUI` meter markup to create one fill layer and one outline layer per icon. Remove visible label, value, danger, and bar elements.

Keep `updateMeter` responsible for value conversion, clamping, danger state, accessible attributes, and the shared fill percentage property.

Update the survival meter CSS for the larger icon row, stacked SVG layers, transparent outline, and bottom-up clip.

Do not change the shared SVG artwork paths. Other UI artwork users remain unchanged.

## Verification

Add focused `SurvivalUI` tests for these cases:

- The four meters contain fill and outline artwork layers.
- Visible label, number, bar, and danger text elements do not exist.
- Health, Food, Energy, and Hull set the correct fill percentage.
- Food still inverts hunger.
- Accessible meter values and danger text remain correct.

Run the focused UI test file. Run the project type check and lint checks used by the repository.

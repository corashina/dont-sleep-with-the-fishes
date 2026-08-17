# Survival Icon Artwork Design

## Goal

Refine the food, energy, and hull icons in the survival HUD.

Keep each icon clear at the current 114 × 105 pixel display size.
Keep the existing meaning, layout, spacing, color, and meter behavior.

## Scope

Change only the inline SVG artwork in `src/ui/uiArtwork.ts`.

Do not change HUD layout, meter values, animation, labels, or accessibility behavior.

## Visual Direction

Use a restrained illustrated style. Keep bold silhouettes and rounded black outlines.
Use slight asymmetry and one useful interior detail per icon.
Keep each icon simple enough to read over the game world.

### Food

Keep the stomach symbol.
Use a clean neck, a full body, and a tapered outlet.
Use one curved highlight that follows the stomach volume.

### Energy

Keep the lightning bolt symbol.
Use a wider top, a firm center bend, and a balanced lower point.
Use one short highlight within the upper bolt.

### Hull

Keep the lifeboat side symbol.
Use a curved gunwale, angled ends, and a clear lower keel.
Use one structural seam to show the hull construction.

## SVG Structure

Use one closed primary shape for each icon.
The primary shape receives the bottom-up meter fill.

Use separate open paths for the highlight and hull seam.
Keep the current SVG view box and shared artwork classes.

## Verification

Update the SVG structure tests for the new artwork parts.
Render the HUD at its current size and inspect all four condition icons together.
Confirm that each meter fill stays inside its primary silhouette.
Run the Survival UI tests, type check, and production build.

## Acceptance Criteria

- The three symbols keep their current meaning.
- The silhouettes look balanced and distinct.
- Details remain clear at 114 × 105 pixels.
- The icons form one consistent set with the health icon.
- Existing meter fill and tooltip behavior remains unchanged.

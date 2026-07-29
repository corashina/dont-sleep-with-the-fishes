# Scavenging Carry Indicator Design

## Goal

Improve the scavenging carry indicator without changing carry rules.

The HUD must show the actual item models. The clock must not overlap the carry slots.

## Visual behavior

Keep three circular weight slots at the top center. Keep their current desktop size.

Make each circle background and border slightly transparent. Keep model thumbnails fully opaque and easy to read.

Repeat an item's thumbnail in each weight slot that the item uses. A weight-three item fills all three slots.

Keep the slot group centered. Place the pocket watch from the slot group's right edge.

Scale the slots, gaps, and watch at narrow widths. Keep the watch on the right without overlap.

Show this text below the slots when carried weight equals three:

> HANDS FULL - RETURN TO THE BOAT

Hide the text after the player deposits the carried items.

Use the contextual typeface. Use restrained bone and yellow values. Preserve the worn print treatment.

## Visual style interpretation

The sparse top-center HUD keeps the world dominant. Model thumbnails add authored detail from the world.

Transparent circles reduce software-panel weight. The watch remains a physical, scene-integrated object.

The full-hand message uses a concise caption. It does not add a panel or continuous motion.

## Thumbnail assets

Store one transparent PNG for each scavenging item. Generate each image from the matching GLB model.

Use a fixed camera, light rig, output size, and framing margin. Use model bounds to set the camera scale.

Allow small per-item rotation overrides. Use them only when the default view hides the item's main silhouette.

Keep thumbnail generation outside the game runtime. Add a development command for regeneration.

Add a check that fails when a scavenging item lacks a thumbnail. Keep generated thumbnails in source control.

## UI structure

Add a thumbnail manifest keyed by `ItemId`. Vite must resolve each image as a build asset.

Render a standard `<img>` inside each filled slot. Treat the image as decorative because carry state has a live text status.

Keep the filled slot treatment if an image fails. Hide only the failed image.

Add one status element below the circle row. Give it polite live-region behavior.

Position the watch relative to the circle row. Do not include its width when centering the circles.

## Data flow

`ScavengeSnapshot` remains the source of carry state.

Convert carried items into three weight slots. Repeat each item type for its weight.

Build a stable carry signature from the three slot values. Update slot DOM only when this signature changes.

Toggle the full-hand status when `carriedWeight` reaches three. Clear it after deposit.

Do not change session rules, capacity, pickup rules, or deposit rules.

## Resource ownership and performance

The browser owns decoded PNG image resources. `GameUI` owns the created DOM elements.

Do not create a Three.js scene, camera, texture, or render target for thumbnails at runtime.

Do not replace slot children during each frame. Reuse slot elements and update them only when carry state changes.

`GameUI.dispose()` removes the HUD root. It needs no new Three.js cleanup.

## Error handling

The asset check prevents missing thumbnail files in normal builds.

If an image still fails at runtime, hide the image. Keep the occupied circle visible.

Thumbnail failure must not affect gameplay or carry state.

## Tests

Add UI tests for these cases:

- Empty carry state shows three empty circles.
- A light item shows one thumbnail.
- A heavy item repeats its thumbnail across its weight slots.
- Full weight shows the full-hand message.
- Deposit clears thumbnails and hides the message.
- A failed image keeps its filled slot visible.
- An unchanged carry signature does not rebuild slot DOM.

Add an asset check for complete thumbnail coverage.

Run the focused UI tests, type check, production build, and full test suite.

Inspect active scavenging at 1280x720 and 1920x1080. Confirm centered slots, right-side watch placement, and readable thumbnails.

Inspect the narrow layout. Confirm that circles, message, and watch do not overlap.

## Out of scope

Do not change carry capacity or item weight.

Do not add live 3D thumbnail rendering.

Do not add reduced-motion behavior.

Do not change the pocket-watch artwork.

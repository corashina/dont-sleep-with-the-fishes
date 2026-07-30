# Crucial Performance Optimization Design

## Goal

Improve frame rate and frame stability on desktop graphics cards.

Keep the current game rules, visual identity, and input behavior.

Target the three largest safe gains:

1. Reduce default ambient occlusion cost.
2. Remove repeated session snapshot work.
3. Remove repeated boat-anchor traversal and DOM writes.

## Visual interpretation

Ambient occlusion remains selective. It supports contacts, seams, and overlaps.

The low preset uses fewer samples and a smaller buffer. It keeps the same radius and intensity.

The high preset remains unchanged. It provides the current reference quality.

No model, material, lighting, composition, motion, or water change is in scope.

## Ambient occlusion budget

Change only the low GTAO preset.

Use a 0.4 resolution scale instead of 0.5.

Use six GTAO samples instead of eight.

Use one denoise ring and four denoise samples.

Keep the high preset unchanged.

Keep the existing quality control and storage contract.

Keep the existing fallback and disposal paths.

## Snapshot caching

### Survival session

Store a cached immutable snapshot and a state revision.

Return the cached snapshot while the revision is unchanged.

Increment the revision after each accepted state mutation.

Build journal and inventory copies only after a mutation.

Do not expose mutable session data through the cache.

### Scavenge session

Cache snapshots within each state revision.

Time ticks increment the revision.

Each frame can build one pre-tick snapshot and one post-tick snapshot.

The phase reuses local snapshots instead of calling `snapshot()` repeatedly.

### Ownership

Each session owns its cache.

Phases treat snapshots as immutable values.

No renderer dependency enters either session.

## Boat-anchor projection

Create a cached local bounding box for each fixed boat anchor.

Build each box once after the anchor model is ready.

Project cached boxes with the current root transform and camera.

Do not traverse every child mesh during each frame.

Keep dynamic root transforms active during event and fishing motion.

The drifting-loot anchor keeps its existing dynamic projection path.

Update DOM properties only when their rounded values change.

Keep anchor projection active during camera movement.

Do not reduce the anchor update rate.

## Data flow

```text
Session mutation
  -> revision change
  -> one new immutable snapshot
  -> inventory sync when snapshot identity changes

Frame update
  -> update world matrices once
  -> project cached anchor boxes
  -> compare rounded UI values
  -> write only changed DOM properties
```

## Error handling

If a cached anchor has no valid mesh bounds, use the current traversal path.

If GTAO setup fails, keep the current direct-render fallback.

Snapshot creation must fail before replacing the previous cache.

## Tests

Add snapshot identity tests for unchanged state.

Add snapshot replacement tests for every mutation path.

Add immutability tests for cached inventory and journal data.

Add anchor parity tests against the current traversal result.

Add tests for the invalid-bounds fallback.

Add DOM tests that reject duplicate style writes.

Update GTAO preset tests for the new low values.

Run the full test suite and production build.

Profile the title and survival scenes at 1920 by 1080.

Compare median frame rate with the same camera and quality settings.

## Expected result

GTAO uses 36 percent fewer low-preset pixels.

Session snapshots stop creating repeated deep copies.

Boat anchors stop traversing model trees every frame.

DOM work falls when anchor values stay unchanged.

## Out of scope

Do not change water geometry or shaders.

Do not change shadow update timing.

Do not merge ship meshes.

Do not add adaptive render scaling.

Do not replace the outline pass.

Do not add reduced-motion behavior.

Do not change gameplay rules.

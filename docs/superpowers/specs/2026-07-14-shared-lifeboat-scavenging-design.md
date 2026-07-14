# Shared Lifeboat in Scavenging

- **Status:** Approved
- **Date:** 2026-07-14
- **Target:** Desktop web browser
- **Stack:** Vite, TypeScript, Three.js, Vitest

## Objective

Scavenging and survival will use the same detailed lifeboat, at the same size, with the same type-aware item positions. The scavenging phase will retain its current pickup, throw, loss, capacity, evacuation, and scoring rules.

The change will remove the older box-shaped scavenging boat and index-based storage layout. Shared code will own the lifeboat geometry, textures, bounds, water exclusion, and saved-item transforms.

## Shared Architecture

`src/world/Lifeboat.ts` will become the single lifeboat builder for both phases. It will contain the rounded hull now used in survival and return:

- the lifeboat root;
- the storage root;
- interior and throw-acceptance bounds;
- water-exclusion dimensions;
- owned procedural textures.

The builder will preserve names used by gameplay and presentation: `lifeboat`, `lifeboat-storage`, `damaged-plank-patch`, `fishing-line`, and `fishing-catch`.

`src/world/LifeboatTextures.ts` will own the deterministic paint, wood, rope, and metal textures now stored under survival. Both worlds will dispose the textures returned by the builder.

`src/world/BoatStorage.ts` will become the single item-layout module. `boatStorageTransform(instance)` will map each item type and duplicate ordinal to the stable transform now used in survival. Missing items will leave empty slots; saved items will not shift based on save order.

`World` and `BoatWorld` will import those shared modules. The survival-only boat builder, texture module, and layout module will be removed after their tests and consumers use the shared APIs.

## Scavenging Behavior

The scavenging world will create the shared lifeboat without an extra phase-specific scale. Its dimensions, hull shape, materials, paddles, floor, fittings, and repair details will match survival.

The throw acceptance box will sit inside the rounded hull and cover the usable interior. `CarryController` will keep using a boat-local box transformed by the lifeboat world matrix, so pitch, roll, heave, and drift remain supported.

When a thrown item enters the acceptance box, `ScavengePhase` will pass the saved `ItemInstance` to `World`. `World` will attach the existing prop to the boat storage root and apply `boatStorageTransform(instance)`. This replaces the current saved-count index and guarantees that the scavenging and survival representations occupy the same type-aware slot.

Items that miss the boat, land on the ship, or fall into the water will keep their current state transitions. The saved-item list and phase handoff will remain unchanged.

## Ocean and Resource Ownership

Both phases will use the water-exclusion footprint returned by the shared builder. The footprint will match the detailed hull and prevent wave crests from appearing through its floor without hiding nearby exterior water.

Each world will continue to own its lifeboat instance. Disposal will release its geometries, materials, and procedural textures once. Sharing construction code will not share mutable Three.js scene objects between active phases.

## Error Handling

The storage transform will reject malformed or unsupported item instance IDs with a clear error. The builder will always provide the required roots and bounds. Optional presentation lookups, such as the fishing line or catch cue, will retain their defensive checks.

The implementation will not add downloads, runtime network access, or third-party assets.

## Testing

Tests will be written before production changes and will cover:

- one shared builder producing the rounded hull, paddles, named roots, acceptance bounds, and water-exclusion dimensions;
- both phase worlds constructing the shared boat at the same dimensions;
- type-aware transforms for all supported item instances and distinct transforms for duplicates;
- scavenging saves using item identity instead of save order;
- a saved scavenging prop receiving the same transform it receives in survival;
- throw acceptance under the boat's world transform;
- exact-once disposal of procedural textures and existing owned resources;
- removal of imports and runtime dependencies on the obsolete survival-only builder and layout.

The full test suite, `bun run typecheck`, `bun run build`, and `bun run models:check` must pass. Browser checks will inspect scavenging and survival, confirm matching boats and item placement, exercise successful and missed throws, and check water exclusion during visible wave motion.

## Acceptance Criteria

1. Scavenging and survival render the same detailed lifeboat at the same size.
2. Both phases use one boat builder, one texture implementation, and one item-layout function.
3. A saved item occupies the same stable type-aware slot in both phases.
4. Scavenging pickup, carrying, throwing, loss, capacity, evacuation, and scoring behavior remains unchanged.
5. The larger rounded boat accepts valid throws and rejects misses.
6. Water does not render through the boat floor in either phase.
7. Restarting or changing phase disposes owned lifeboat resources once.
8. Automated checks and browser verification pass.

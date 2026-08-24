# Ship Construction Final Fix Report

Base: `ee5315e5`

Status: Complete

## Commits

| Commit | Purpose |
| --- | --- |
| `1fd6654a` | Continue cleanup and preserve construction errors. |
| `3212508b` | Narrow geometry ownership and remove obsolete paths. |
| `e8e4c1f2` | Tighten AST ownership and composition checks. |

## Important 1: Cleanup continuation and rollback

Commit: `1fd6654a`

Files:

- `src/world/ShipGeometry.ts`
- `src/world/Ship.ts`
- `src/world/ShipMaterials.ts`
- `src/world/ShipFurniture.ts`
- `src/world/ShipRigging.ts`
- `src/world/CrowsNest.ts`
- `src/world/ShipSmoke.ts`
- `tests/ShipCleanup.test.ts`

The resource owners now use `disposeResourceSets` for owned sets.
Composite owners now use `runCleanupSteps`.
Construction rollback uses `ignoreCleanupError`.

Normal cleanup keeps the accepted order.
It continues each independent step after any thrown value.
It rethrows the first value without replacement, including `null` and `undefined`.

Each owner sets its disposed state before cleanup.
Repeated cleanup remains idempotent after success or failure.

`createShipGeometry` now rolls back every registered partial geometry.
`createShip` now completes rollback across every completed owner.
Both constructors always rethrow the original construction error.

Test-first command:

`npm test -- tests/ShipCleanup.test.ts`

Initial result: one test passed and eight expected tests failed.
The failures showed stopped cleanup, replaced errors, and missing geometry rollback.

Final tests cover all changed owners.
They inject early `null` and `undefined` failures.
They verify later cleanup, exact first-error priority, rollback, and idempotence.

Final focused result: `tests/ShipCleanup.test.ts` passed all 9 tests.

Residual concern: None.

## Important 2: One source for geometry values and narrow helpers

Commits: `3212508b`, `e8e4c1f2`

Files:

- `src/world/ShipLayoutTypes.ts`
- `src/world/ShipGeometryPrimitives.ts`
- `src/world/ShipHullGeometry.ts`
- `src/world/ShipRoomGeometry.ts`
- `src/world/ShipAccessGeometry.ts`
- `src/world/ShipExteriorGeometry.ts`
- `src/world/ShipGeometry.ts`
- `tests/ShipGeometryPrimitives.test.ts`
- `tests/ShipHullGeometry.test.ts`
- `tests/ShipRoomGeometry.test.ts`
- `tests/ShipConstructionBoundaries.test.ts`

`ShipLayoutTypes.ts` now owns the exact shared bow, deck, and structural deck values.
It also owns the shared zone lookup and room roof-height helper.

`ShipHullGeometry.ts` now owns hull plan, bow path, taper, and rounded-prism logic.
`ShipRoomGeometry.ts` now owns wall geometry and planar UV logic.
`ShipExteriorGeometry.ts` now owns its rotated block, cylinder, and bow-point logic.

`ShipGeometryPrimitives.ts` now exports only the shared context, block, and collider APIs.
It no longer imports authored stern data.

The final composition keeps four direct ordered builder calls inside one rollback block.
Builders still do not import final composition or peer builders.

The AST suite now rejects re-export paths, duplicate old values, and builder calls outside rollback.
It also keeps the accepted value-import, direct-call, binding, order, and dependency checks.

Test-first command:

`npm test -- tests/ShipGeometryPrimitives.test.ts tests/ShipHullGeometry.test.ts tests/ShipRoomGeometry.test.ts tests/ShipConstructionBoundaries.test.ts`

Initial result: the primitive, hull, and room suites passed.
Three expected boundary tests failed on the broad API, duplicate ownership, and composition shape.

Final parity evidence:

- Hull tests preserve exact vertex counts, sampled vertices, UVs, and taper layer bounds.
- Room tests preserve exact wall and roof UV arrays.
- Access and exterior tests preserve names, order, transforms, metadata, and colliders.
- World tests preserve `143/392/85/37/0` scene and collider totals.
- Collision tests preserve the full collider fixture and order.

Residual concern: None.

## Minor: Remove obsolete paths

Commit: `3212508b`

Files:

- `src/world/ShipGeometryPrimitives.ts`
- `src/world/ShipHullGeometry.ts`
- `src/world/ShipExteriorGeometry.ts`
- `src/world/shipLayoutData.ts`
- `tests/ShipGeometryPrimitives.test.ts`
- `tests/ShipConstructionBoundaries.test.ts`

The block API no longer accepts or creates an automatic collider.
The rotated-block helper no longer disables that obsolete option.
The rounded-prism API no longer accepts or creates an AABB collider.

Collider creation remains explicit in the room and exterior owners.
Hull still contributes zero shell colliders.

`SHIP_STERN_DECK_DEPTH` is now private.
The test-only geometry exports are gone.
Primitive tests now cover production APIs only.

Source audits found no obsolete collider option or removed helper export.

Residual concern: None.

## Verification

| Command | Result |
| --- | --- |
| Focused cleanup, geometry, world, collision, physics, and boundary command | 12 files and 127 tests passed. |
| `npm run typecheck` | Passed. |
| `npm test` | 143 files and 2,151 tests passed. |
| `npm run build` | Passed. Vite transformed 467 modules. |
| `git diff --check ee5315e5..HEAD` | Passed. |
| `git diff --name-status ee5315e5..HEAD` and full file diff audit | Passed. All 20 changed files were inspected. |
| Obsolete collider, helper export, peer import, and temporary test scans | Passed. No match remained. |

The suite prints existing GLTF texture-load and Rapier deprecation warnings.
The production build prints the existing large-chunk warning.
No functional concern remains.

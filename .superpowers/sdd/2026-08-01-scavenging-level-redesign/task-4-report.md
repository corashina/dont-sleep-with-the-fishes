# Task 4 report

## Commit

Implementation commit: `d2a27547f6498681b11d288410a5aaa4fa77ebfb`

## Files

- `src/world/ShipLayout.ts`
- `src/world/ShipFurniture.ts`
- `tests/ShipLayout.test.ts`
- `tests/SceneResources.test.ts`

## RED evidence

`bunx` was unavailable. The parent checkout supplied the same Vitest binary.

Initial focused run: 4 failed and 41 passed.

- Surface count was 33. The contract needs at least 50.
- Room loop targets were missing.
- Bow and stern surface owners were missing.
- Generated timber benches were missing.

## GREEN evidence

Focused command:

`..\..\node_modules\.bin\vitest.cmd run tests/ShipLayout.test.ts tests/ShipItemPlacement.test.ts tests/SceneResources.test.ts tests/collisions.test.ts`

Result: 4 files passed. All 95 tests passed.

Full command:

`..\..\node_modules\.bin\vitest.cmd run`

Result: 58 files passed. All 1,055 tests passed.

Type command:

`..\..\node_modules\.bin\tsc.cmd --noEmit`

Result: passed.

`git diff --check` also passed.

## Surface counts

| Region | Surface specs |
| --- | ---: |
| Crew cabin | 12 |
| Wheelhouse | 8 |
| Storage workroom | 10 |
| Central cargo | 15 |
| Bow | 4 |
| Stern | 4 |
| Total | 53 |

The layout has eight branch surface specs.

The wheelhouse count includes two checked fallback aliases for existing center slots.

The cabin count includes two fallback bunk-rest surfaces.

## Layout and ownership

The cabin uses offset bunks and a figure-eight route.

The wheelhouse uses offset chart tables and two routes.

The workroom uses staggered crate islands and linked routes.

Two full cargo routes connect through two cross-routes.

Three timber benches add six central cargo surfaces.

Eight raised end props add four bow and four stern surfaces.

Each bench uses one shared owned box geometry.

The bench uses shared timber and metal materials. It creates no material.

## Visual and route risks

Automated tests do not verify final camera composition.

Inspect bench spacing, bunk silhouettes, and end-prop clusters in the game.

Central stern props use inward interaction points around the machinery closure.

Check these sightlines against the aft workroom bulkhead during visual review.

The layout keeps dark, authored prop groups. It avoids random deck scatter.

## Review fix

Fix commit: this commit.

The RED ShipLayout run had 5 failed tests and 39 passed tests.

The tests now count unique physical slots. The wheelhouse has eight unique slots.

Each room now has a connected cycle. Collision tests traverse both routes around each room island.

Layout checks now protect all loop lanes. They include visual detail footprints without colliders.

The two stern center spots now stand aft of the storage wall. Each item surface needs one clear access path.

Both door-side cargo boxes moved outside door approaches. Bench fore and aft names now match their positions.

The focused run passed 4 files and 99 tests.

The full run passed 58 files and 1,059 tests.

The TypeScript check passed. `git diff --check` passed.

The surface table above now counts unique physical slots. No wheelhouse fallback alias remains.

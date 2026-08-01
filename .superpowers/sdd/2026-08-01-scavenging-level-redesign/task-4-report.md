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

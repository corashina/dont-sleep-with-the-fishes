# Task 5 report

## Commit

Commit: `feat: complete category-free scavenging placement`

## Scope

- Removed item and surface placement categories.
- Kept physical fit, owner, blocker, reach, and scale checks.
- Added route-aware regions, branches, separation, and weight limits.
- Added validated spatial templates and a distinct fallback.
- Set sprint speed to 8.4 metres per second.
- Kept walk speed at 3.8 metres per second.
- Kept load multipliers at 1.00, 0.92, and 0.84.
- Changed empty baseline trips to reach distant non-branch items.
- Kept the loaded eight-metre deposit rule.
- Kept the four-metre branch detour rule.

## RED evidence

The first category-free placement run had 5 failures and 17 passes.

Old catalog and surface categories caused the expected failures.

The behavior regression run had 2 failures and 43 passes.

Sprint speed was 6.2. Empty baseline trips stopped beyond eight metres.

## GREEN evidence

Focused command:

`..\..\node_modules\.bin\vitest.cmd run tests\ScavengeRoutePlanner.test.ts tests\PlayerController.test.ts tests\ShipItemPlacement.test.ts tests\scavengeCatalog.test.ts`

Result: 4 files passed. All 60 tests passed.

The 1,000-seed test took 4.550 seconds in the final focused run.

Full command:

`..\..\node_modules\.bin\vitest.cmd run`

Result: 58 files passed. All 1,057 tests passed.

The full run took 13.47 seconds.

Type command:

`..\..\node_modules\.bin\tsc.cmd --noEmit`

Result: passed.

`git diff --check` passed.

## Placement evidence

All 1,000 seeds returned generated layouts. No seed used fallback.

The seeds used 32 unique surface IDs across all six regions.

| Region | Unique surfaces used |
| --- | ---: |
| Crew cabin | 7 |
| Wheelhouse | 3 |
| Central cargo | 9 |
| Storage workroom | 6 |
| Bow | 4 |
| Stern | 3 |

Every scavenging item type used at least two valid surfaces.

Expert route times ranged from 55.907691 to 57.525739 seconds.

Baseline saved 17 items on each validated template.

The fallback contains all 21 production instance IDs.

The fallback passes physical, region, branch, separation, weight, and route checks.

## Performance

Surface validation is cached for stable surface and blocker arrays.

Spatial templates are cached for each immutable placement context.

Expert plans use a bounded cache with 128 entries per route metric.

## Risks

The planner cache requires an immutable route metric.

Baseline results sit at the upper accepted bound of 17 items.

The tested templates use 32 of 53 authored spots.

Physical and route limits exclude the other spots from these templates.

Automated tests do not replace visual review inside the game.

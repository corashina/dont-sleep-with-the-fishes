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

## Final review fixes

- The compass fallback spot now appears only in fallback data.
- The independence test asserts the exact fallback-only spot.
- The test exercises all twelve generated template selectors with the spot present and absent.
- All twelve selectors return the same generated signatures after the spot is removed.
- Generated template caching now requires `routeMetric.stable === true`.
- Unmarked or mutable route metrics revalidate templates on every call.
- A mutable-metric regression changes route reachability between two calls.
- The second call rejects the stale template and proves that the cache is bypassed.

Focused command:

`npm.cmd test -- --run tests/ShipItemPlacement.test.ts tests/ScavengeRoutePlanner.test.ts tests/ShipLayout.test.ts`

Result: 3 files passed. All 71 tests passed.

The focused 1,000-seed test took 3.270 seconds.

Full command:

`npm.cmd test`

Result: 58 files passed. All 1,061 tests passed.

The full run took 13.95 seconds.

Type command:

`npm.cmd run typecheck`

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

Expert route times stayed within the required 54 to 58 seconds.

Baseline saved 17 items on each validated template.

The fallback contains all 21 production instance IDs.

The fallback passes physical, region, branch, separation, weight, and route checks.

## Performance

Surface validation is cached for stable surface and blocker arrays.

Spatial templates are cached only when the route metric declares stable distances.

Expert plans use a bounded cache only for metrics that declare stable distances.

## Risks

New route metrics must declare stability before they can use the planner cache.

Baseline results sit at the upper accepted bound of 17 items.

The tested templates use 32 of 53 authored spots.

Physical and route limits exclude the other spots from these templates.

Automated tests do not replace visual review inside the game.

## Review fixes

- Generated templates no longer read, clone, build, or validate fallback data.
- Fallback runs only after all generated attempts fail.
- Twelve independent generated layouts replace the old one-item and two-item swaps.
- Each generated layout changes at least five fallback positions.
- A missing fallback-only surface still produces a complete generated layout.
- One thousand seeds produce all twelve deterministic layout signatures.
- The seeds use at least 32 surfaces. Each item type uses at least two surfaces.
- The baseline rejects an empty remote branch trip, even with a small route detour.
- Expert plan caching now requires a metric with `stable: true`.
- The ship metric declares stability and freezes its public object.
- Mutable test metrics no longer reuse stale expert plans.
- The obsolete fixture category and fallback fields are gone.

Focused command:

`npm.cmd test -- --run tests/ShipItemPlacement.test.ts tests/ScavengeRoutePlanner.test.ts tests/ShipLayout.test.ts`

Result: 3 files passed. All 70 tests passed.

The focused 1,000-seed test took 3.425 seconds.

Full command:

`npm.cmd test`

Result: 58 files passed. All 1,060 tests passed.

The full run took 11.93 seconds.

Type command:

`npm.cmd run typecheck`

Result: passed.

`git diff --check` passed.

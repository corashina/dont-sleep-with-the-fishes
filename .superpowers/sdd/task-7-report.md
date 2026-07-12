# Task 7 report: Canonical event, danger, route, and day-50 integration

## Status

Complete. The live survival session now uses the canonical event catalog and resolver, exposes canonical choice/history state, materializes deferred inventory mutations deterministically, applies the Broken Boat pre-draw, and doubles only negative night-event health/hull damage from Day 50.

## RED evidence

### Session integration RED

Command:

```powershell
bun run test -- tests/wikiEventIntegration.test.ts tests/SurvivalSession.test.ts
```

Result: exit 1; 18 failures. The live session still used legacy event IDs, started at hull 75, lacked danger/route/history/pending choices, had no `resolveEventChoice`, and did not execute Broken Boat before ordinary selection.

### Canonical phase routing RED

Command:

```powershell
bun run test -- tests/SurvivalPhase.test.ts
```

Result: exit 1; the new choice-ID routing and canonical event presentation regressions failed because the phase still called only the item/null adapter and searched only the legacy catalog.

### Review regression REDs

- `bun run test -- tests/SurvivalPhase.test.ts` failed when an `any` Handyman choice incorrectly bypassed the offered-item adapter.
- `bun run test -- tests/SurvivalUI.test.ts tests/wikiEventIntegration.test.ts` failed for generic choice rendering, aggregate Food/Bait usability, and direct targetless Handyman fallback resolution.
- `bun run test -- tests/SurvivalUI.test.ts` failed when aggregate Food/Bait had been gained without ever recovering their container items.

Each failure was observed before the corresponding production change.

## GREEN evidence

Focused survival-domain command:

```powershell
bun run test -- tests/wikiEventIntegration.test.ts tests/SurvivalSession.test.ts tests/survivalEvents.test.ts tests/survivalInventory.test.ts
```

Result: exit 0; 4 files passed, 54 tests passed.

Additional focused verification:

- `tests/SurvivalPhase.test.ts`: 16 tests passed.
- `tests/SurvivalUI.test.ts`: 44 tests passed.
- `tests/wikiEventIntegration.test.ts`: 21 tests passed.

## Final verification

- `bun run test` — exit 0; 31 test files passed, 355 tests passed.
- `bun run typecheck` — exit 0 (`tsc --noEmit`).
- `git diff --check` — exit 0; only line-ending notices, no whitespace errors.

## Files

- `src/canonical/balance.ts` — sourced starting health/hull metadata and preserved hunger/energy metadata.
- `src/survival/SurvivalSession.ts` — canonical selection/resolution, choice adapter, danger/route/history, deferred mutations, Broken Boat, and Day-50 damage.
- `src/survival/survivalBalance.ts` — runtime values derived from canonical starting balance.
- `src/survival/survivalTypes.ts` — danger, route, pending choices, event history, and danger deltas in runtime snapshots.
- `src/survival/SurvivalPhase.ts` — canonical event presentation and direct choice routing, retaining the item adapter for `any` targets.
- `src/ui/SurvivalUI.ts` — renders generic canonical choices and aggregate Food/Bait choices so canonical events cannot soft-lock the live UI.
- `tests/wikiEventIntegration.test.ts` — Task 7 integration boundaries and deterministic mutation coverage.
- `tests/SurvivalSession.test.ts`, `tests/survivalInventory.test.ts` — updated canonical starting balance and live event expectations.
- `tests/SurvivalPhase.test.ts`, `tests/SurvivalUI.test.ts` — canonical choice routing and aggregate-resource UI regressions.
- `tests/BoatWorld.test.ts` — snapshot fixture fields required by the extended contract.

## Self-review

- Confirmed the session imports canonical events and `outcomeResolver` directly; the legacy catalog is no longer used for live selection or resolution.
- Confirmed inventory mutations execute before resource deltas/sets and terminal checks.
- Confirmed `loseRandom` selects only usable recovered instances and excludes built-in/no-instance items.
- Confirmed `breakRandom` derives eligible item types from explicit canonical `break` outcomes and selects only usable recovered instances.
- Confirmed Snatcher chooses one private target when the event opens, using its exact item/Food asset list and the injected `RandomSource`.
- Confirmed event history records appearances at selection time and preserves first/last day plus recurrence counts.
- Confirmed dormant and automatic records cannot enter ordinary weighted selection.
- Confirmed only negative night-event health/hull deltas are doubled at Day 50; set values and non-damage resources are unchanged.
- Confirmed the deprecated adapter maps null to `sleep`, exact item IDs to their choice, and Handyman `any` offers to the concrete offered instance.
- Confirmed generic, item, and aggregate-resource choices have a live UI command path.
- Independent read-only review completed with no remaining Critical or Important issues.

## Concerns

- Seagull and Chest left unopened remain dormant because their selection data is undocumented in the canonical source, as established in Task 6.
- No blocking Task 7 concerns remain.

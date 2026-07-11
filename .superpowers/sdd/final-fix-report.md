# Final whole-branch review fix wave

## Scope and method

Head reviewed: `84be912`. Work was performed in-place on `master` by user choice. The pass followed RED/GREEN TDD: focused regression tests were added first, run to observe the intended failures, then minimal production changes were made and the focused suites rerun.

## RED / GREEN evidence

- Applied deltas, unavailable event items, pending-event dawn guard, nightfall/dawn, and terminal cues: RED showed requested `-35` instead of applied `-20`, unsuitable resolution for an unowned item, event cue instead of nightfall, and missing terminal cue behavior. GREEN: `tests/SurvivalSession.test.ts` 20/20.
- Boat lifecycle and rod representation: RED showed the rod existed when opt-out was requested and transient rest remained settled. GREEN: `tests/BoatWorld.test.ts` 4/4; shared scavenging default remains rod-free and the full world suite passes.
- Action previews, transferred stores, item clues, and hand-line labeling: RED showed absent preview metadata, `0 CHARGES`/`NOT RECOVERED`, missing descriptions, and rod-only hotspot copy. GREEN: `tests/SurvivalUI.test.ts` 29/29.
- Phase lifecycle: rejected outcomes now wait for Continue without a world cue; night resolution waits at the existing Continue gate, then automatically plays dawn or the real terminal rescue cue. Legacy orchestration expectations were updated to exercise the Continue contract. GREEN: `tests/SurvivalPhase.test.ts` 11/11.

## Files

- `src/survival/SurvivalSession.ts`
- `src/survival/SurvivalPhase.ts`
- `src/survival/BoatWorld.ts`
- `src/survival/survivalTypes.ts`
- `src/survival/itemDescriptions.ts`
- `src/world/Lifeboat.ts`
- `src/ui/SurvivalUI.ts`
- `tests/SurvivalSession.test.ts`
- `tests/SurvivalPhase.test.ts`
- `tests/BoatWorld.test.ts`
- `tests/SurvivalUI.test.ts`
- `README.md`

## Verification

- Focused: `bun run test tests/SurvivalSession.test.ts tests/BoatWorld.test.ts tests/SurvivalUI.test.ts tests/SurvivalPhase.test.ts` — 64/64 after reconciliation.
- Full: `bun run test` — 21 files, 211 tests passed.
- Typecheck: `bun run typecheck` — passed.
- Build: `bun run build` — passed; Vite emitted only its existing chunk-size advisory.

## Self-review

The session owns rule state and reports actual before/after deltas. Phase owns presentation ordering and preserves the existing explicit outcome Continue gates. Boat construction makes survival equipment opt-in while leaving scavenging's default supply-slot silhouette intact. UI preview and item-description data are centralized and stable in the DOM.

## Remaining concern

The requested optional procedural rain/spray enhancement was not added in this time-boxed correctness wave. Existing squall presentation remains reduced-motion safe (camera lurch is disabled under reduced motion), but it does not add a new particle field.

## Focused UI follow-up

- RED: dynamic previews still showed authored maxima, transferred event items showed `0 CHARGES`, and rodless fish presentation had no line/catch mesh. GREEN: `SurvivalUI` 31/31 and `BoatWorld` 5/5 focused tests.
- Action buttons now use explicit label/shortcut and full-width metadata rows. Inventory descriptions use an explicit full-width second row with restrained wrapping. The 700px breakpoint uses a four-column/two-row action dock and a viewport-bounded tray.
- Browser QA used the retained `.superpowers/sdd/qa-final/index.html` harness. Final screenshots and `browser-results-final.json` cover 1280x720, 1440x900, 1920x1080, and 700x720. Every viewport reported no document/dock/tray overflow, no clipped previews/descriptions, four meters, and zero console warnings/errors.
- Dynamic guaranteed effects now reflect current clamping and selected repair material/tape. Transferred bait/food event choices direct use through day actions. Rodless fishing animates a line and catch without adding a rod to scavenging.

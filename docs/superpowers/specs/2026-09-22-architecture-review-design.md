# Architecture review and design plan

Project: Don't Sleep With The Fishes
Date: 2026-09-22
Baseline: `af3b1ce6`
Status: Proposed design. No implementation authorized or performed.

## Purpose and scope

Reduce the knowledge needed to change survival events. Keep game behavior, visual timing, and resource ownership intact.
Use small changes that leave the game working after each step. Remove obsolete paths when their replacements work.
Keep existing libraries. Do not add a framework, event bus, dependency container, or generic workflow engine.

This review follows the requested [architecture skill](https://github.com/mattpocock/skills/blob/main/skills/engineering/improve-codebase-architecture/SKILL.md).
It also uses the [codebase design vocabulary](https://github.com/mattpocock/skills/blob/main/skills/engineering/codebase-design/SKILL.md).
A deep module hides substantial behavior behind a small interface. Locality means related changes stay together.

## Evidence and limits

Reviewed the latest 60 commits, current source, selected tests, and existing design documents.
Among those commits, SurvivalSession changed 17 times, BoatWorld 15 times, and SurvivalEventFlow 14 times.
Event presentation routes changed eight times; adapters changed seven times. Counts include commits, not individual edits.

No CONTEXT.md or docs/adr directory was found. README.md supplies the game terms.
The existing Heart of the Sea design is future work. This plan does not alter its rules or implement it.
Read its design and plan again before changing shared event files.

These findings describe architecture risks. They do not establish player-visible bugs or measured performance problems.
No game tests, build, or browser playtest were run. Source and tests were inspected only.

## Approaches

| Approach | Gain | Cost | Decision |
| --- | --- | --- | --- |
| Deepen current event modules in small steps | Less duplicate dispatch and shared coordination | Requires lifecycle regression checks | Recommended |
| Reorganize files by event | Easier file discovery | Keeps the same coordination rules | Defer until ownership is clear |
| Replace orchestration with a generic engine | One general execution model | Broad rewrite and new abstractions | Reject for this scope |

## 1. Simplify event presentation dispatch — Strong

**Evidence:** `src/survival/eventPresentationAdapters.ts:204` builds a coordinator with exactly one dedicated presentation.
`src/survival/EventPresentationCoordinator.ts:17` still keeps a map and active presentation selection.
The registry and host already choose and attach an event.

**Before:** Host → adapter → coordinator → one dedicated presentation.

**After:** Host → adapter → one dedicated presentation.

Keep the existing adapter seam. Move root attachment and cleanup details into the adapter implementation.
Preserve world and boat root transforms, skip behavior, visibility settling, item callbacks, and resource disposal.
Delete the coordinator and tests that only verify its dispatch once equivalent behavior is covered through the adapter.

The deletion test supports this change: multi-event selection disappears; necessary cleanup stays in one implementation.
Locality improves because the selected presentation has one owner. Tests gain leverage through the existing adapter interface.

**Follow-up:** EventPresentationLayer also receives one event per production construction.
Its maps and generic tableau dispatch overlap authored presenters. Inspect each route before removing that machinery.
Weather and supernatural adapters should construct only the presentation behavior they use.
Do this after the dedicated route works end to end.

**Keep:** EventPresentationHost attachment rollback and once-per-stage clearing are real responsibilities.
Keep EventBundleManager loading, cancellation, and lease ownership.
BoatWorld's featured model dependency also supplies the rescue ending. Do not remove that asset dependency accidentally.

## 2. Give event resolution one owner — Strong

**Evidence:** `src/survival/SurvivalPhase.ts:762` connects FocusedEventFlow and SurvivalEventFlow in both directions.
`src/survival/FocusedEventFlow.ts:31` accepts five resolution callbacks from its caller.
`src/survival/SurvivalEventFlow.ts:674` creates those callbacks and retains another operation generation.
Both flows coordinate busy state, cancellation, and visibility waits.

**Before:** Phase → two flows → callbacks crossing between both flows.

**After:** Phase → event flow module → private focus and resolution implementation.

Make SurvivalEventFlow own the complete event operation. Keep camera focus code private and modular.
The phase should supply lifecycle changes without assembling a second event resolution protocol.
Remove the cross-flow resolution callback interface after its responsibilities move inside the event module.
Keep session mutations in SurvivalSession and rendering in the current presentation adapters.

Preserve each event's commit timing. Some choices resolve before animation; item choices can resolve after animation.
Preserve deferred inventory display, rejected choice recovery, terminal outcomes, and stable checkpoint detection.
Retain phase cancellation and event cancellation as distinct lifetimes, with explicit ownership.

This improves locality for ordering rules. Tests gain leverage by exercising complete choices through the event interface.
Do not merge these files mechanically. Moving callback code without reducing caller knowledge fails the deletion test.

## 3. Use one construction path for runtime tests — Worth exploring

**Evidence:** `src/Game.ts:338` uses Object.create to bypass construction for tests.
`src/survival/SurvivalPhase.ts:292` selects production initialization; line 306 selects test initialization.
The runtime session and UI fields use partial test types at lines 214–216.
`tests/GameDirector.test.ts:119` accesses a private frame handler through a cast.

**Before:** Production setup and test setup → shared runtime initialization with different preparation paths.

**After:** Browser or test adapter → one runtime construction path.

Move WebGL and browser setup into application composition. Pass complete required dependencies to the runtime module.
Put test fixture builders and test adapters under tests. Remove production forTest methods after callers move.
Retain optional behavior only where game phases actually differ.

Start with Game. Reassess SurvivalPhase after event resolution ownership is simpler.
Do not expose every concrete world method as a new interface. Define only the runtime's actual requirements.

The real browser adapter and test adapter justify this seam. This gives setup tests more leverage.
Keep one real browser smoke check: a fake renderer cannot prove WebGL or asset preparation works.

## 4. Centralize event choice eligibility — Worth exploring

**Evidence:** `src/survival/SurvivalEventFlow.ts:299` checks resources, items, chest state, and companion availability for display.
`src/survival/SurvivalSession.ts:1020` checks overlapping conditions when resolving choices.
Both also derive the Drifting Supplies choice variant, at flow line 372 and session line 972.

**Before:** UI flow eligibility rules ← catalog → session eligibility rules.

**After:** UI flow and session → shared event choice rules module.

Use one pure decision path for eligibility and variant selection. Keep translated labels and scene anchors in presentation code.
Recheck eligibility against current session state when committing. A displayed choice must not authorize a stale action.
Keep companion energy use and random draws out of preview checks.
Current session rejection logic can consume companion energy, so it cannot be reused directly as a read-only query.

This gives rule changes locality and both callers leverage. Delete duplicate checks instead of adding a third rule path.
Do not replace SurvivalSession or move all event content into a new schema.

## Proposed order and completion gates

1. Remove the dedicated coordinator. Verify a dedicated event from attachment through disposal.
2. Simplify remaining presentation dispatch one route at a time. Delete obsolete routing after each route passes.
3. Consolidate event resolution ownership. Start with one focused choice, then cover special event timing.
4. Centralize choice eligibility. Prove previews are pure and commits recheck current state.
5. Address runtime construction as separate work. Start with Game and keep browser setup failure coverage.

Each step must work before the next starts. Do not retain compatibility shims or duplicate execution paths.
No public interface signatures are proposed yet. Select a candidate before detailed interface design.

## Verification plan

Only add or replace tests rated at least 90/100. Ratings apply to proposed tests, not every existing test.

| Importance | Behavior to protect | Existing starting point |
| --- | --- | --- |
| 98 | Disposal or event replacement makes late callbacks inert | FocusedEventFlow, SurvivalEventFlow, EventBundleManager tests |
| 97 | Assets detach and dispose once; borrowed assets survive | EventPresentationHost, EventPresentationCoordinator, EventPresentationRegistry tests |
| 96 | Accepted choices commit once; previews spend nothing | SurvivalSession and event flow tests |
| 95 | Hidden pages, camera return, and rejection restore control | FocusedEventFlow and FocusedEventExit tests |
| 95 | Checkpoints only capture stable event state | SurvivalPhase and SurvivalSaveStore tests |
| 94 | Construction failures clean up; both adapters use the same initialization | GameConstruction, GameDirector, GamePhaseLoading tests |

Preserve behavioral assertions. Replace internal dispatch assertions only after equivalent interface coverage exists.
Run affected Vitest suites, lint, typecheck, and build after each implementation step.
Before visual changes, read VISUAL_STYLE_GUIDE.md. Before browser playtests, read docs/browser-playtesting.md.
Check reveal, item use, camera return, pause, resume, restart, rescue, and disposal through the affected routes.

Retain snapshot caching in SurvivalSession: line 617 already returns an unchanged cached snapshot.
Keep update and render paths free from new allocations or repeated setup.

## Top recommendation

Start with candidate 1, limited to EventPresentationCoordinator removal.
It has one production construction site and removes duplicate selection without changing game rules.
Treat EventPresentationLayer simplification as the next verified step, not part of an unchecked bulk deletion.

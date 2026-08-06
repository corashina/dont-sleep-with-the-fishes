# Survival Presentation Refactor Design

Date: 2026-08-06

Baseline: commit `b3fb04d0`

## Goal

Reduce repeated survival presentation code without changing active game behavior.
Remove code and tests only when the committed application no longer uses them.
Optimize runtime code only when inspection or measurement shows a clear cost.

## Evidence

The committed survival area contains 80 TypeScript files and about 29,000 lines.
It uses three presentation systems for different game flows:

- Focused event presentations.
- Featured event presentations.
- Dedicated event presentations.

Their public interfaces differ, but their internal animation lifecycles repeat.
Five focused presentations repeat start, update, settle, cancel, and promise logic.
Six dedicated presentations repeat similar logic.

Transform pose shapes and reset logic repeat across at least seven files.
Clamp and easing helpers also repeat despite the existing `animationMath.ts` module.

An import reachability scan found no unreachable file under `src/survival`.
This design does not plan a survival source-file deletion before migration.

## Constraints

- Preserve every active visual, timing, input, rule, and outcome.
- Remove player-facing behavior only when committed code cannot reach it.
- Keep focused, featured, and dedicated event interfaces separate.
- Do not add compatibility wrappers or obsolete paths.
- Do not allocate temporary objects in frame-update paths.
- Do not include concurrent uncommitted work in this refactor baseline.

## Architecture

Keep the three event presentation systems and their registries.
Share only their common internal primitives.

Add a generic `TimedPresentationAnimation<K>` component.
It owns the current animation kind, elapsed time, duration, and completion promise.
It provides start, update, settle, and cancel operations.
Presentations provide sampling and completion callbacks.

Use composition instead of a new presentation inheritance tree.
The existing `KeyedEventPresentation` can delegate to the same component.
Focused and dedicated presentations can adopt it without changing their interfaces.

Expand `animationMath.ts` with the repeated bounded range and easing helpers.
Add a shared transform-pose module with one type and create, reset, and copy functions.

## Components

### Timed animation controller

The controller will:

- Reuse one mutable state object.
- Clamp negative delta values to zero.
- Resolve cancelled and settled promises exactly once.
- Call the presentation sampler with normalized progress.
- Avoid arrays, closures, vectors, or poses during each update.

Presentation classes will retain all scene objects and visual sampling rules.

### Animation math

The existing module will become the canonical source for:

- Unit clamping.
- Range clamping.
- Smoothstep and smootherstep functions.
- Shared reveal or pulse functions when their formulas match exactly.

Similar names with different formulas will remain separate.

### Transform poses

The shared transform pose will contain position and Euler fields.
Helpers will reset or copy into caller-owned objects.
Specialized poses can contain the shared transform as one field.

### Presentation migration

Migrate one group at a time:

1. Featured presentations through `KeyedEventPresentation`.
2. Focused presentations.
3. Dedicated event presentations.
4. Choreography pose helpers.
5. Repeated animation math.

Each group must pass its focused tests before the next migration starts.

## Data Flow

The existing event registry selects a presentation.
The presentation starts the shared animation controller with an animation kind.
The game loop sends elapsed time to the active presentation.
The controller updates normalized progress in its reused state.
The presentation samples that progress into owned poses and scene objects.
The existing session and outcome flow receives the same completion signal.

No registry, game-rule, input, or outcome interface changes.

## Error Handling and Cleanup

Keep current early errors for duplicate event identifiers and invalid event data.
Do not add silent fallback behavior.

Cancellation, visibility settlement, and disposal must resolve active promises once.
Disposal must remove owned scene roots and release owned geometry, materials, and textures.
The controller must ignore updates after disposal.

## Test Design

Keep tests that protect:

- Player-visible animation results.
- Event choices and outcomes.
- Resource ownership and disposal.
- Cancellation and promise settlement.
- Input and registry routing.
- No-allocation update behavior where it can be asserted directly.

Merge repeated item-animation cases into parameterized tests.
Remove an integration case only when a focused test covers the same public behavior.
Remove tests that only preserve replaced private structure.

Do not delete broad `BoatWorld` or `SurvivalPhase` coverage in this pass.
Their later decomposition needs a separate design.

## Deletion Rules

Delete an old helper after every committed caller uses the shared primitive.
Delete an old test file after its unique behavior moves to the consolidated suite.
Delete a source file only when committed production imports cannot reach it.

Run reachability checks after migration.
Do not retain aliases, forwarding modules, or deprecated exports.

## Performance Rules

Inspect each changed `update` and sampling path.
Reuse mutable poses, vectors, materials, arrays, and controller state.
Move constant sets, records, and geometry setup outside frame loops.

Do not make speculative runtime changes outside the repeated presentation paths.

## Out of Scope

- Survival rule redesign.
- Event outcome changes.
- New visuals or animation timing.
- `BoatWorld.ts` decomposition.
- `SurvivalPhase.ts` decomposition.
- `SurvivalSession.ts` decomposition.
- Non-survival dead files.
- Compatibility layers.

These areas need separate refactor passes after this pass remains stable.

## Acceptance Criteria

- TypeScript passes with no errors.
- The production build passes.
- The full test suite passes.
- Focused tests pass after each migration group.
- Existing animation sample, duration, routing, outcome, and cleanup assertions keep the same expected values.
- No new unreachable survival source file exists.
- No migrated frame-update path creates temporary objects.
- Obsolete helpers and duplicate tests are removed after migration.

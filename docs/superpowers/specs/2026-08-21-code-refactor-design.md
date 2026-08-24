# Behavior-Preserving Code Refactor Design

Date: 2026-08-21

## Purpose

Refactor modules that mix separate responsibilities. Preserve gameplay, visuals, balance, assets, and player-facing behavior.

The refactor must keep the product working after every stage. Large files remain intact when they have one clear purpose.

## Scope

The current hotspots are:

- `src/survival/BoatWorld.ts`
- `src/survival/SurvivalPhase.ts`
- `src/ui/SurvivalUI.ts`
- `src/survival/SurvivalSession.ts`
- `src/survival/events.ts`
- `src/world/ShipLayout.ts`
- `src/world/ShipGeometry.ts`
- `src/ocean/OceanRenderer.ts`

The event presentation system also has parallel presenter families and route-specific dispatch branches.

## Non-Goals

- Do not change gameplay rules or balance.
- Do not change visuals, materials, lighting, animation, or composition.
- Do not change assets or asset sources.
- Do not add new features.
- Do not add compatibility layers, re-export shims, or obsolete paths.
- Do not split a large module only because of its line count.

## Baseline

The clean `master` worktree starts at commit `df9a2806`.

The baseline suite has 1,732 passing tests and one failing flare-gun direction test. Resolve this discrepancy before structural work. Preserve the intended firing pose.

## Architecture

Keep three stable entry classes:

- `SurvivalPhase` owns phase lifecycle, pause, resize, update, and restart.
- `BoatWorld` owns the survival scene and frame update entry.
- `SurvivalUI` owns the survival DOM root and public UI events.

The entry classes become small composition roots. They delegate focused work to owned modules.

Dependencies point inward:

- Domain rules do not import DOM or Three.js modules.
- UI views receive view data and emit semantic commands.
- Flow controllers use small session, world, and UI contracts.
- Visual controllers own Three.js objects and resources.
- Low-level ship and ocean builders do not depend on game flows.

## Survival Domain

`SurvivalSession` remains the only owner of gameplay state. Extract pure calculations and focused state helpers without duplicating mutable state.

Separate these responsibilities:

- Event catalog data
- Event catalog validation
- Event eligibility and weighted selection
- Event outcome mutation
- Journal record construction
- Fishing transaction rules
- Day-action validation and effects

`SurvivalSession` coordinates these modules and invalidates its snapshot cache after accepted changes.

## Event Presentation

Create one event presentation host. It owns the active presenter and exposes one lifecycle:

- `stage`
- `reveal`
- `use`
- `react`
- `update`
- `settleForVisibilityChange`
- `clear`
- `dispose`

Existing dedicated, focused, featured, weather, supernatural, moon, and dangerous-waters implementations remain focused presentation code. Small adapters normalize their existing methods.

A registry maps each event identifier to one adapter factory. The host replaces route-specific dispatch branches in `BoatWorld`.

The active event bundle and presenter share one activation boundary. Clearing an event releases both exactly once.

## Boat World

`BoatWorld` keeps scene construction, top-level resource ownership, and the frame update entry.

Extract these stateful modules:

- Boat camera control
- Fishing presentation
- Event presentation host
- Moon event presentation
- Carlitos delegation presentation
- Interaction-anchor projection
- Dive presentation coordination

Each module owns its transient state and scratch objects. Per-frame paths do not create repeated setup or avoidable allocations.

## Survival Phase

`SurvivalPhase` keeps the `GamePhase` contract and phase lifecycle.

Extract these flows:

- Day-action flow
- Fishing flow
- Event flow
- Drifting-item flow
- Item animation lab flow
- Visibility pause and resume handling

Each flow receives narrow session, world, UI, audio, and bundle contracts. A flow cannot change another flow's private state.

Generation checks guard all asynchronous continuation points. Restarted or disposed phases reject stale work.

## Survival UI

Keep plain DOM code and current CSS. Do not add a UI framework.

Split `SurvivalUI` into owned views:

- Status and action HUD
- Boat anchor layer
- Event caption and choices
- Fishing interaction and result
- Drifting-item focus
- Dive and sleep cover
- Journal
- Pause, repair, and ending modals
- Modal focus management

`SurvivalUI` mounts the root, wires semantic events, and coordinates view visibility. Each view owns its nodes and local DOM state.

## Ship Construction

Split `ShipLayout` into:

- Shared layout types and constants
- Authored layout data
- Navigation grid and route metrics
- Layout validation

Split `ShipGeometry` into:

- Shared geometry primitives
- Hull and deck construction
- Room walls, windows, doors, and roofs
- Ladders and access structures
- Exterior details, engines, and rails
- Final geometry composition

The authored layout remains the common source for geometry, navigation, collisions, furniture, and item placement.

## Ocean Rendering

Split `OceanRenderer` into:

- Shader source and shader defines
- Surface and horizon geometry builders
- Runtime renderer control

`OceanRenderer` keeps quality changes, exclusions, vortex state, following, updates, and disposal. Shader and geometry helpers stay stateless.

## Data Flow

A player command follows this sequence:

1. A UI view emits a semantic command.
2. `SurvivalUI` forwards the command.
3. `SurvivalPhase` routes it to one flow.
4. `SurvivalSession` validates the command and changes domain state.
5. The flow receives an outcome and snapshot.
6. The flow sends visual work to `BoatWorld`.
7. The flow sends view data to `SurvivalUI`.

An event presentation follows this sequence:

1. The event flow loads the required bundle.
2. The presentation host activates one registered presenter.
3. The presenter stages and reveals its scene.
4. The event flow requests item use and outcome reactions.
5. `BoatWorld` updates the active presenter each frame.
6. Event cleanup clears the presenter and releases the bundle.

## State Ownership

- `SurvivalSession` owns gameplay state.
- Flow controllers own temporary workflow state.
- `BoatWorld` controllers own visual state.
- UI views own DOM state.
- Resource owners dispose their own resources.
- No extracted module shares mutable state without one named owner.

## Error Handling

Invalid player commands return rejected action outcomes. They do not throw.

Broken invariants throw errors at module boundaries. `SurvivalPhase` reports them through the existing invariant and fatal handlers.

Presenter construction uses rollback cleanup. Missing optional event models keep the existing tested fallback presentation.

All `dispose` operations remain idempotent. Cleanup continues through independent owned resources when one cleanup step fails.

## Implementation Stages

1. Resolve and document the baseline flare-gun test discrepancy.
2. Separate survival catalog, rule, mutation, journal, and selection modules.
3. Add the unified event presentation host and adapters.
4. Extract `BoatWorld` visual controllers.
5. Extract `SurvivalPhase` flows.
6. Extract `SurvivalUI` views and modal focus management.
7. Separate ship layout, navigation, validation, and geometry builders.
8. Separate ocean shader, geometry, and runtime control.
9. Delete obsolete modules, branches, types, and tests.
10. Run final dependency, behavior, resource, and build verification.

Each stage must compile and pass its focused tests before the next stage starts.

## Testing

- Add characterization tests before moving risky behavior.
- Test pure rules without DOM or Three.js dependencies.
- Test each flow with narrow fake contracts.
- Test each visual controller with owned resource and lifecycle checks.
- Keep facade integration tests for `SurvivalPhase`, `BoatWorld`, and `SurvivalUI`.
- Keep ship navigation, collision, placement, geometry, and ocean tests.
- Test event activation, fallback, visibility settling, replacement, clearing, and disposal.
- Run `npm run typecheck`, `npm test`, and `npm run build` after each stage.
- Check for import cycles and references to deleted paths before completion.

## Acceptance Criteria

- Gameplay, visuals, balance, assets, and controls remain unchanged.
- The full test suite passes.
- Type checking and the production build pass.
- Each hotspot delegates its unrelated responsibilities to focused modules.
- Event presentation uses one host and one normalized lifecycle.
- Domain modules do not import UI or Three.js code.
- Per-frame paths do not add repeated setup or avoidable allocations.
- Every resource has one owner and idempotent cleanup.
- No obsolete path, compatibility shim, or dead route remains.

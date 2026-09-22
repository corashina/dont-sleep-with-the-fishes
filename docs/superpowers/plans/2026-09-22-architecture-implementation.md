# Architecture Improvement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans or superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Reduce event coordination and duplicate rules while preserving game behavior and resource ownership.

**Architecture:** Keep the existing session, presentation adapters, host, and resource leases. Give each presentation one owner. Give event operations one owner. Share pure choice decisions and use one Game construction path.

**Tech Stack:** TypeScript, Three.js, Vite, Vitest, ESLint, and Bun. Use the existing dependency versions and bun.lock.

**Spec:** [Architecture review](../specs/2026-09-22-architecture-review-design.md).

**Status:** Tasks 1–6 implemented. Review fixes and final verification complete. Browser limits are recorded in the implementation report.

**Baseline:** `af3b1ce6d77c7f0a3ce35752709c3da0b04eeb58`.

**Workspace:** `C:/Users/Corashina/.codex/worktrees/architecture-plan/dont-sleep-with-the-fishes`.

## Global constraints

- Keep game behavior, visual timing, and resource ownership intact.
- Keep existing libraries. Do not add a framework, event bus, dependency container, or generic workflow engine.
- Each step must work before the next starts. Do not retain compatibility shims or duplicate execution paths.
- Keep update and render paths free from new allocations or repeated setup.
- Retain snapshot caching in SurvivalSession.
- Only add or replace tests rated at least 90/100.
- Keep session mutations in SurvivalSession and rendering in the current presentation adapters.
- Preserve each event's commit timing.
- Keep the Heart of the Sea work separate. Recheck its documents before editing shared files.
- Read AGENTS.md and VISUAL_STYLE_GUIDE.md before execution.
- Read docs/browser-playtesting.md before any AI browser playtest.

## Scope and stages

The review offered four proposals. This plan covers all four in separate stages.
Stage A implements the first proposal. Stop after any completed stage if later work is not selected.
Stage D covers Game construction. A separate SurvivalPhase construction rewrite requires reassessment after Stage B, as the design specifies.

| Stage | Tasks | Independently working result |
| --- | --- | --- |
| A: Event dispatch | 1–3 | One authored presentation per adapter; no obsolete dispatch modules |
| B: Event ownership | 4 | One owner for focused event operations |
| C: Choice rules | 5 | Display and commit share pure eligibility decisions |
| D: Game construction | 6 | Browser and tests use one Game constructor |

Run stages A → B → C. Stage D can run after A, but do not edit Game concurrently with other branch changes.
Use separate commits for the tasks. Do not create separate worktrees or tasks automatically.

## Review focus

1. Clear throws during disposal: every remaining cleanup step still runs; the first error remains primary. Tasks 1–3.
2. A hidden page resumes after event replacement: old work cannot spend items or unlock new work. Task 4.
3. Repeated choice previews: companion energy, inventory, journal, and random state remain unchanged. Task 5.
4. A choice becomes invalid after display: commit rejects it without partial mutation. Task 5.
5. Browser setup fails after allocating rendering resources: cleanup occurs once and preserves the original error. Task 6.

## Execution preparation

These checks are execution steps, not claims about the current planning session.
The planning worktree has no node_modules. Bun was not found on PATH during planning.
Do not install packages or run game tests merely to edit this document.

- [x] Confirm the current worktree and check for incoming changes.

```powershell
git status --short
git rev-parse HEAD
git branch --show-current
```

- [x] Before code changes, select a branch with the app's branch controls if HEAD remains detached.
- [x] Make the project's Bun runtime available, then install the locked dependencies.

```powershell
Get-Command bun
bun install --frozen-lockfile
bun run test
bun run build
```

Expected: installation preserves bun.lock; all tests and build pass. Record failures before making code changes.
Do not create package-lock.json or change dependencies to solve a missing local runtime.

## File ownership

All paths below are relative to the worktree above.

| File | Final responsibility |
| --- | --- |
| src/survival/eventPresentationAdapters.ts | Construct and bind one presenter; preserve existing adapter interface |
| src/survival/focusedPresentationFactories.ts (new) | Authored focused presenter construction table |
| src/survival/FocusedEventView.ts (new) | Choice display and target projection; no session mutation or operation ownership |
| src/survival/SurvivalEventFlow.ts | Event operation lifetime, focus transitions, resolution ordering, and recovery |
| src/survival/eventChoiceRules.ts (new) | Pure event variant and eligibility decisions |
| src/survival/SurvivalSession.ts | Authoritative validation, mutation, random draws, and checkpoints |
| src/app/GameRuntimeDependencies.ts (new) | Complete runtime construction requirements |
| src/app/createBrowserGame.ts (new) | Browser resource setup and ownership transfer into Game |
| src/Game.ts | Runtime initialization, phase transitions, and lifecycle |
| tests/helpers/gameRuntime.ts (new) | Complete test adapter and shared Game fixture construction |

Delete EventPresentationCoordinator.ts, EventPresentationLayer.ts, and FocusedEventFlow.ts only in their owning tasks.
Do not move whole directories or rename unrelated files.

## Task 1: Remove the dedicated presentation coordinator

**Files:**

- Modify: src/survival/eventPresentationAdapters.ts.
- Modify: tests/EventPresentationRegistry.test.ts and tests/BoatWorld.test.ts.
- Delete: src/survival/EventPresentationCoordinator.ts and tests/EventPresentationCoordinator.test.ts.
- Retain: src/survival/EventPresentationHost.ts and its tests.

**Interfaces:**

- Consume: DedicatedEventPresentation, DedicatedEventEnvironment, and EventPresentationAdapter from their existing files.
- Preserve: createDedicatedAdapter: EventPresentationAdapterFactory.
- Preserve: createAdapter(eventId, roots, operations, cleanupSteps), the current private helper.
- Add no public production interface.

- [x] Expand the registry test's dedicated fixture to satisfy DedicatedEventPresentation.

```ts
function createDedicatedPresentation() {
  return {
    eventId: 'leak' as const,
    worldRoot: new Group(),
    boatRoot: new Group(),
    itemAimTarget: new Group(),
    stage: vi.fn(),
    reveal: vi.fn(async () => undefined),
    skip: vi.fn(),
    playItemUse: vi.fn(async () => true),
    react: vi.fn(async () => undefined),
    update: vi.fn(),
    settleForVisibilityChange: vi.fn(),
    clear: vi.fn(),
    dispose: vi.fn(),
  } satisfies DedicatedEventPresentation;
}
```

Import the existing DedicatedEventPresentation type. Keep a fixture reference named dedicated in this test file.
Use it as the LeakPresentation constructor result. Keep other event fixtures matched to their actual event IDs.

- [x] Add disposal coverage through the registry and host. Importance: 97/100.

```ts
it('detaches dedicated roots when clear fails during disposal', () => {
  const { dependencies } = createDependencies();
  const adapter = new EventPresentationRegistry().create('leak', dependencies);
  const host = new EventPresentationHost();
  host.attach(adapter);
  host.stage({ eventId: 'leak', targetInstanceId: null, variantSeed: 4 });
  const failure = new Error('clear failed');
  dedicated.clear.mockImplementationOnce(() => { throw failure; });

  expect(() => adapter.dispose()).toThrow(failure);
  adapter.dispose();

  expect(dedicated.dispose).toHaveBeenCalledOnce();
  expect(dedicated.worldRoot.parent).toBeNull();
  expect(dedicated.boatRoot.parent).toBeNull();
});
```

Import EventPresentationHost. Also cover restaging, neutral calls after clear, and borrowed event models surviving disposal, at 95/100.
Keep the current host rollback tests. Those tests protect real ownership behavior.

- [x] Run the affected tests before refactoring.

```powershell
bun run test tests/EventPresentationRegistry.test.ts tests/EventPresentationHost.test.ts tests/EventPresentationCoordinator.test.ts
```

This is a behavior-preserving refactor. Existing behavior tests may pass before changes; do not invent a failure requirement.
New tests must fail when the corresponding guard or cleanup is deliberately removed during later verification.

- [x] Replace createDedicatedCoordinator with direct presentation construction.

Keep createBorrowedDedicatedEnvironment. Remove the coordinator import and multi-presentation array.
Use the existing createDedicatedPresentation switch once per adapter.
Store one active boolean inside createDedicatedAdapter. It represents staging, not event selection.

```ts
const presentation = createDedicatedPresentation(
  eventId,
  createBorrowedDedicatedEnvironment(dependencies.dedicatedEnvironment),
);
let active = false;
const clear = (): void => {
  if (!active) return;
  active = false;
  presentation.clear();
};
const stage = (context: EventPresentationContext): void => {
  clear();
  active = true;
  presentation.stage({
    eventId,
    targetInstanceId: context.targetInstanceId,
    variantSeed: context.variantSeed,
  });
};
```

Pass the presenter's worldRoot and boatRoot directly to createAdapter with the existing worldParent and boatParent.
Preserve the matching-event check in createAdapter. Do not rename the presenter's own roots.
Bind the remaining operations using this exact mapping:

| Adapter operation | When active | When inactive |
| --- | --- | --- |
| reveal | presentation.reveal() | resolved void |
| playChoice | presentation.playChoice?.(choice.choiceId) | resolved void |
| playItemUse | presentation.playItemUse(choiceId, instanceId, onAction) | resolved false |
| itemAimTarget | presentation.itemAimTarget | null |
| netCatch | presentation.netCatch?.() | null |
| interactionTargets | presentation.interactionTargets?.() | existing EMPTY_INTERACTION_TARGETS |
| interactionRoot | presentation.interactionRoot?.(id) | null |
| resultRoot | noRoot | null |
| update | presentation.update(time, delta) | no work |
| settleForVisibilityChange | presentation.settleForVisibilityChange() | no work |
| clear | clear() | no work |

For optional methods, use their existing empty results. These are supported capabilities, not obsolete compatibility paths.
Keep the exact-result requirement in react. Only forward a non-null result while active.
Do not introduce a skip method on EventPresentationAdapter; it has no such caller today.

```ts
const cleanupSteps = [
  clear,
  () => presentation.dispose(),
  () => presentation.worldRoot.removeFromParent(),
  () => presentation.boatRoot.removeFromParent(),
];
```

Pass all four steps separately to createAdapter. Its runCleanupSteps must continue after a clear or dispose error.
If adapter construction fails after presentation construction, run these steps through preserveConstructionError.

- [x] Remove obsolete mocks and update scene assertions.

Delete coordinator constructor mocks and createCoordinator from EventPresentationRegistry.test.ts.
In BoatWorld.test.ts, change the Leak action root from dedicated-event-boat to leak-boat.
Replace the dedicated-root visibility loop with explicit authored roots for the event being tested.
Assert the root exists before asserting visibility. Optional lookup must not let missing roots pass silently.
Delete the coordinator source and its two-presentation fixture test after replacement coverage passes.

- [x] Verify and commit this complete slice.

```powershell
rg -n 'EventPresentationCoordinator|dedicated-event-world|dedicated-event-boat' src tests
bun run test tests/EventPresentationRegistry.test.ts tests/EventPresentationHost.test.ts tests/BoatWorld.test.ts tests/EventBundleManager.test.ts
bun run build
git add src/survival/eventPresentationAdapters.ts src/survival/EventPresentationCoordinator.ts tests/EventPresentationRegistry.test.ts tests/EventPresentationCoordinator.test.ts tests/BoatWorld.test.ts
git commit -m "refactor: bind dedicated event adapters directly"
```

Expected search result: no coordinator references or removed group names. The distinct dedicated-event-boat-effects root remains valid.

## Task 2: Remove empty weather and supernatural presentation layers

**Files:** Modify src/survival/eventPresentationAdapters.ts and tests/EventPresentationRegistry.test.ts.

**Interfaces:** Preserve createWeatherAdapter and createSupernaturalAdapter as EventPresentationAdapterFactory values.
Keep WeatherEventAnimator and SupernaturalEventAnimator interfaces unchanged.

- [x] Retain the registry's animator item-use test and BoatWorld's weather/supernatural action tests. Importance: 95/100.

Run them before refactoring. They must pass on the baseline.
Do not add a constructor-count test; that would test the implementation instead of player behavior.
Update the existing construction failure assertion to retain the primary error after layer removal:

```ts
const failure = new Error('weather construction');
constructors.weather.mockImplementationOnce(() => { throw failure; });
const { dependencies } = createDependencies();
expect(() => new EventPresentationRegistry().create('shower-night', dependencies))
  .toThrow(failure);
```

- [x] Remove only layer construction and calls from both factories.

```ts
// Weather operations now call only the existing animator.
reveal: () => ownedWeather.reveal(eventId),
itemAimTarget: () => ownedWeather.itemAimTarget(eventId),
interactionRoot: noRoot,
update: (time, delta) => ownedWeather.update(time, delta),
clear: () => ownedWeather.clear(),
```

Use the corresponding existing ownedSupernatural methods in its factory.
Keep the same seeds, outcome inputs, physical response inputs, item-use support checks, and world/boat parents.
Remove Promise.all calls that only combined the animator with the empty layer.
Retain preserveConstructionError for resources created before a later failure.
Replace the existing weather-construction test's layer-cleanup expectation; no layer exists after this change.
Retain host cleanup coverage for attached roots. A throwing constructor must preserve its original error.

- [x] Verify both families and commit.

```powershell
bun run test tests/EventPresentationRegistry.test.ts tests/BoatWorld.test.ts tests/EerieMelodyPresentation.test.ts
bun run build
git add src/survival/eventPresentationAdapters.ts tests/EventPresentationRegistry.test.ts
git commit -m "refactor: remove empty event presentation layers"
```

## Task 3: Replace the remaining presentation layer with direct presenters

**Files:**

- Create: src/survival/focusedPresentationFactories.ts.
- Modify: src/survival/eventPresentationAdapters.ts, tests/EventPresentationRegistry.test.ts, tests/BoatWorld.test.ts.
- Delete: src/survival/EventPresentationLayer.ts after every caller is removed.
- The baseline symbol search finds only the adapter, the layer, and EventPresentationRegistry.test.ts.

**Interfaces:** Export AUTHORED_EVENT_PRESENTATION_FACTORIES from the new factory file with its current factory types.
Keep FocusedEventPresentation, FocusedEventPresentationFactory, and DangerousWatersPresentation interfaces unchanged.
Generalize assertRoute's type predicate to SurvivalEventId & EventIdForRoute<Route>, using the existing exported route type.
Keep its runtime check unchanged. This narrows focused event IDs correctly for the helper below.
Private construction helper:

```ts
function createFocusedPresentation(
  eventId: FocusedEventId,
  dependencies: EventPresentationAdapterDependencies,
): FocusedEventPresentation {
  const factory = dependencies.focusedFactories[eventId]
    ?? AUTHORED_EVENT_PRESENTATION_FACTORIES[eventId];
  const presentation = factory?.(dependencies.focusedDependencies);
  if (presentation == null) {
    throw new Error(`Missing required focused event presentation: ${eventId}`);
  }
  return presentation;
}
```

This deliberately removes generic tableau fallback behavior. All routed focused events must have an authored presenter.
Factory failures propagate. Do not suppress them into invisible events.

- [x] Add adapter behavior tests. Importance: 96/100.

Cover matching result validation, cached interaction targets, holdOnClear, factory null/error, and Dangerous Waters item motion.
Use focusedFactories injection with a complete FocusedEventPresentation fake; no new public factory hook is needed.
For a null factory, the following test must fail before the change:

```ts
it('rejects a missing authored focused presenter', () => {
  const { dependencies } = createDependencies();
  const invalid = {
    ...dependencies,
    focusedFactories: { ...dependencies.focusedFactories, handyman: () => null },
  };
  expect(() => new EventPresentationRegistry().create('handyman', invalid))
    .toThrow('Missing required focused event presentation: handyman');
});
```

- [x] Move the authored factory table and its imports without changing factory construction arguments.
- [x] Bind one focused presenter and cache interactionTargets once during adapter construction.

```ts
const targets = presentation.interactionTargets?.() ?? EMPTY_INTERACTION_TARGETS;
const clearFocused = (): void => {
  presentation.clear();
  if (presentation.root.userData.holdOnClear !== true) {
    presentation.root.visible = false;
  }
};
```

Retain active-stage tracking and stage-before-use behavior from the old layer.
Use presentation.root as the adapter root. Keep root visibility and restaging behavior.
Move the exact matching eventResult checks from prepareResult and react into this adapter.
Keep target lookup against cached targets. Do not allocate target arrays in update or pointer paths.
Bind DangerousWatersPresentation directly in createDangerousWatersAdapter.
Retain its reused reaction object and applyDangerousWatersReaction call after each update.
Keep the rule that an item choice is not replayed after item motion.

- [x] Search all callers before deleting the layer.

```powershell
rg -n 'EventPresentationLayer|AUTHORED_EVENT_PRESENTATION_FACTORIES|registerFocusedFactory' src tests
```

Remove obsolete generic tableau tests only after their authored event behavior remains covered.
Do not delete BoatWorld's featured model dependency: the rescue ending uses it.

- [x] Run focused event, registry, world, and bundle suites, then build and commit.

```powershell
bun run test tests/EventPresentationRegistry.test.ts tests/EventPresentationHost.test.ts tests/BoatWorld.test.ts tests/FocusedEventExit.test.ts tests/GhostShipPresentation.test.ts tests/EventBundleManager.test.ts
bun run build
git add src/survival/focusedPresentationFactories.ts src/survival/eventPresentationAdapters.ts src/survival/EventPresentationLayer.ts tests/EventPresentationRegistry.test.ts tests/BoatWorld.test.ts
git commit -m "refactor: construct authored event presenters directly"
```

If the baseline changes before execution, update the caller inventory before deleting files.

## Task 4: Make SurvivalEventFlow own focused event operations

**Files:**

- Create: src/survival/FocusedEventView.ts.
- Modify: src/survival/SurvivalEventFlow.ts and src/survival/SurvivalPhase.ts.
- Modify: tests/SurvivalEventFlow.test.ts, tests/SurvivalPhase.test.ts, and tests/FocusedEventExit.test.ts.
- Delete: src/survival/FocusedEventFlow.ts and tests/FocusedEventFlow.test.ts after moving behavioral coverage.

**Interfaces:** Add these public event commands to SurvivalEventFlow:

```ts
chooseFocused(choice: FocusedEventChoiceSelection): Promise<void>;
backFocused(): Promise<void>;
resize(width: number, height: number): void;
```

Keep existing focusEvent, revealPending, isIdle, isStableChoice, clear, and dispose contracts.
Remove SurvivalEventFlowDependencies.focused and EventFocusedEventPort.
Expand its existing UI/world ports with the focus methods currently required by FocusedEventFlow.

FocusedEventView has synchronous presentation responsibilities only:

```ts
constructor(world: FocusedEventWorldPort, ui: FocusedEventUiPort);
show(eventId: InspectableEventId, choices: readonly FocusedEventChoiceView[]): void;
hide(): void;
resize(width: number, height: number): void;
accepts(choice: FocusedEventChoiceSelection): boolean;
```

Move FocusedEventWorldPort and FocusedEventUiPort to the new file, narrowing them to target projection and UI display.
Camera entry/exit promises, busy state, operation generations, and session calls belong to SurvivalEventFlow.
The view retains only displayed event/choices and viewport dimensions.

- [x] Move all four existing FocusedEventFlow behavioral tests to SurvivalEventFlow tests. Importance: 98/100.

Preserve invalid ID/instance rejection, stale entry, visibility wait, and stale camera return assertions.
Update createRig to use the real event flow with complete focus world/UI methods instead of a fake focused flow.
Keep createSessionRig for real session mutation checks.
Add one deferred camera test through the new command:

```ts
it('does not restore old controls after disposal during camera return', async () => {
  const rig = createRig(snapshot({ state: 'nightEvent', pendingEventId: 'handyman' }));
  let finishReturn!: () => void;
  rig.world.exitFocusedEventView.mockImplementationOnce(
    () => new Promise<void>((resolve) => { finishReturn = resolve; }),
  );
  await rig.flow.revealPending(rig.session.snapshot());
  await rig.flow.focusEvent('handyman');
  const pending = rig.flow.backFocused();
  rig.flow.dispose();
  const focusCalls = rig.ui.restoreCommandFocus.mock.calls.length;
  finishReturn();
  await pending;
  expect(rig.ui.restoreCommandFocus).toHaveBeenCalledTimes(focusCalls);
});
```

This uses the existing createRig and snapshot helpers in that file, extended with the named focus methods.
Also test event replacement within the same phase; phase-generation checks alone are insufficient.

- [x] Move focus operation ordering into SurvivalEventFlow; keep view work in FocusedEventView.

Use this ownership table during the move:

| Current behavior | New owner |
| --- | --- |
| Displayed choice list and target bounds | FocusedEventView |
| Entry, back, and camera return waits | SurvivalEventFlow |
| Phase generation validity | Existing phase callback, checked by event flow |
| Event/focus operation validity | Event flow; increment on replacement, cancellation, and new focus operation |
| Session resolution and outcome animation | Event flow |
| Accepted/rejected recovery | Event flow |
| Stable choice checkpoint state | Event flow, read by phase |

Replace the five-function resolution result with a private data record:

```ts
interface FocusedChoiceResolution {
  readonly context: FocusedChoiceContext;
  readonly state: FocusedChoiceResolutionState;
}
```

Both referenced types already exist in SurvivalEventFlow.ts. Keep them private.
Invoke the existing methods directly in the owner:

```ts
await this.playFocusedChoiceAnimation(resolution.context);
await this.afterFocusedChoiceAnimation(resolution.context);
this.clearFocusedChoiceEvent(resolution.context, true);
const terminal = this.renderFocusedChoiceSnapshot(resolution.context, resolution.state);
if (terminal) this.presentFocusedChoiceTerminal(resolution.context, resolution.state);
```

Place the current generation and visibility checks between these operations, not merely at the end.
Keep camera return before clearing and rendering. Preserve the current accepted-error recovery sequence.
Do not use the compact snippet as permission to omit those existing checks.
Preserve separate before-animation and after-animation commit paths for different event choices.
Remove FocusedEventChoiceResolution and callback factories after their consumers move.

- [x] Rewire the phase and dispose the focus view through event flow ownership only.

```ts
this.ui.onFocusedEventChoice = (choice) => {
  this.reportFocusedError(this.eventFlow.chooseFocused(choice));
};
this.ui.onFocusedEventBack = () => {
  this.reportFocusedError(this.eventFlow.backFocused());
};
```

Replace the phase's focus resize, direct choice, and disposal calls with the event flow commands.
Remove setFocusedResolutionActive from the external protocol. State transitions become private owner operations.

- [x] Verify all event lifecycle paths and commit.

```powershell
bun run test tests/SurvivalEventFlow.test.ts tests/SurvivalPhase.test.ts tests/FocusedEventExit.test.ts tests/EventBundleManager.test.ts tests/SurvivalSaveStore.test.ts
bun run build
rg -n 'FocusedEventChoiceResolution|setFocusedResolutionActive|FocusedEventFlow' src tests
git add src/survival/FocusedEventView.ts src/survival/SurvivalEventFlow.ts src/survival/SurvivalPhase.ts src/survival/FocusedEventFlow.ts tests/SurvivalEventFlow.test.ts tests/SurvivalPhase.test.ts tests/FocusedEventExit.test.ts tests/FocusedEventFlow.test.ts
git commit -m "refactor: give event resolution one owner"
```

Expected: no removed public protocol remains. Internal data type names may differ without changing behavior.

## Task 5: Share pure event choice decisions

**Files:** Create src/survival/eventChoiceRules.ts; modify SurvivalSession.ts and SurvivalEventFlow.ts.
Test through tests/SurvivalSession.test.ts, tests/SurvivalEventFlow.test.ts, and tests/NightTraderTrades.test.ts.
Retain focusedChoicesFor's existing export for its current UI callers; it remains useful and is not an obsolete alias.
Include tests/OptionalLootUI.test.ts and tests/SurvivalUI.test.ts in verification.

**Interfaces:** Use existing EventChoiceDefinition, SurvivalEventDefinition, SurvivalSnapshot, and ItemInstanceId types.
Export only these decisions from eventChoiceRules.ts:

```ts
export interface EventChoiceDecision {
  readonly choice: EventChoiceDefinition;
  readonly visible: boolean;
  readonly instanceId: ItemInstanceId | null;
  readonly failures: readonly EventChoiceFailure[];
}
export type EventChoiceFailure =
  | { readonly kind: 'resource'; readonly resource: EventChoiceRequirement['resource']; readonly minimum: number }
  | { readonly kind: 'item'; readonly itemId: ItemId }
  | { readonly kind: 'chest'; readonly state: NonNullable<EventChoiceDefinition['requiredChestState']> }
  | { readonly kind: 'companion' }
  | { readonly kind: 'trade' };
export function eventChoiceDecision(
  event: SurvivalEventDefinition,
  choice: EventChoiceDefinition,
  snapshot: SurvivalSnapshot,
): EventChoiceDecision;
```

Import all referenced types from existing files. Do not import UI, Three.js, storage, or translated text.
Keep selected-instance authentication in resolveItemResponse. The pure decision's default instance is for choice display only.

- [x] Add repeat-preview and stale-choice tests. Importance: 96/100.

```ts
it('does not mutate the run or random state while previewing choices', () => {
  const session = new SurvivalSession(saved('carlitos', 'cannedFood'), {
    seed: 41,
    initialEventId: 'drifting-supplies',
  });
  const before = session.exportCheckpoint();
  const event = survivalEventById('drifting-supplies')!;
  for (let repeat = 0; repeat < 5; repeat += 1) {
    for (const choice of event.choices) {
      eventChoiceDecision(event, choice, session.snapshot());
    }
  }
  expect(session.exportCheckpoint()).toEqual(before);
});
```

Add the shown imports in SurvivalSession.test.ts; saved already exists there.
For stale state, preview a valid item choice, change that instance to broken through the existing lab command, then submit it.
Assert rejection, unchanged companion energy, unchanged inventory after the broken-state baseline, and no random draw.
Include zero Food/Bait trades and an already-owned Night Trader reward.

- [x] Move overlapping read-only checks into the decision implementation.

Use existing helpers: driftingSupplyChoiceForVariant, deriveEventVariantSeed, eligibleHandymanRewards, ownsNightTraderReward, and carlitosHelpUnavailableMessage.
Apply Drifting Supplies variant selection once inside eventChoiceDecision.
Select usable instances with the current deterministic instance ordering.
Collect resource, item, chest, companion, and trade failures without calling useCarlitosHelp or random.next.
Keep absent Carlitos choices invisible, as today.
Treat Night Trader Food/Bait payment as aggregate resource checks; do not require a selectable physical instance.

```ts
const choice = event.id === 'drifting-supplies'
  ? driftingSupplyChoiceForVariant(
      catalogChoice,
      deriveEventVariantSeed(snapshot.seed, snapshot.day, event.id),
    )
  : catalogChoice;
```

Use catalogChoice as the implementation parameter name for the interface's choice argument.
Translate failures in the flow with the current label functions. Keep existing rejection codes in the session.
Map failures in the current priority: trade, companion, resources, chest. Item response authentication stays earlier.
Preserve multiple display reasons and language-reactive getters.

- [x] Recheck the decision at commit, then perform mutations exactly once.

```ts
const decision = eventChoiceDecision(event, catalogChoice, this.snapshot());
const choice = decision.choice;
```

After all rejections pass, retain the current useCarlitosHelp call in the mutation path.
Do not call eventChoiceRejection as a preview: it currently consumes companion energy.
Remove duplicated variant and requirement logic only after both callers use the pure decision.
Keep global state checks, response shape checks, forced result handling, and inventory mutation in SurvivalSession.

- [x] Verify domain behavior, translations, and deterministic continuation, then commit.

```powershell
bun run test tests/SurvivalSession.test.ts tests/SurvivalEventFlow.test.ts tests/NightTraderTrades.test.ts tests/DriftingSupplies.test.ts tests/CarlitosSurvival.test.ts tests/domainLanguage.test.ts tests/OptionalLootUI.test.ts tests/SurvivalUI.test.ts
bun run build
git add src/survival/eventChoiceRules.ts src/survival/SurvivalSession.ts src/survival/SurvivalEventFlow.ts tests/SurvivalSession.test.ts tests/SurvivalEventFlow.test.ts tests/NightTraderTrades.test.ts
git commit -m "refactor: share event choice eligibility rules"
```

## Task 6: Use one Game runtime constructor

**Files:**

- Create: src/app/GameRuntimeDependencies.ts, src/app/createBrowserGame.ts, tests/helpers/gameRuntime.ts.
- Modify: src/Game.ts, src/app/launchGame.ts, tests/helpers/game.ts.
- Modify: tests/GameConstruction.test.ts, tests/GamePhaseLoading.test.ts, tests/GameShaderPreparation.test.ts, tests/launchGame.test.ts.
- Update GameDirector and GameLifecycle tests where they bypass frame dispatch or depend on initialization internals.

**Interfaces:** Export GameRuntimeDependencies from its new file.
Its required fields follow the current Game.initialize inputs. Water preference creation receives the runtime's phase callback:

```ts
export interface GameRuntimeDependencies {
  readonly mount: HTMLElement;
  readonly renderer: WebGLRenderer;
  readonly sceneRenderer: SceneRenderer;
  readonly antiAliasingQuality: AntiAliasingQualityPreference;
  readonly shadowQuality: ShadowQualityPreference;
  readonly visualQuality: VisualQualityPreference;
  readonly createWaterQuality: (apply: (value: WaterQuality) => void) => WaterQualityPreference;
  readonly systemTuning: SystemTuningPreference;
  readonly camera: PerspectiveCamera;
  readonly clock: Pick<Clock, 'start' | 'getDelta'>;
  readonly resources: PhaseResourceSource;
  readonly saveStorage: SurvivalSaveStorage | null;
  readonly factories: GameFactories;
  readonly createSeed: () => number;
  readonly onFatalError: (error: unknown) => void;
  readonly browserPlaytest: BrowserPlaytestStartup | null;
}
```

Use type-only imports from existing modules for every referenced type.
This is an internal construction contract, not a general dependency container.
Game's constructor becomes constructor(dependencies: GameRuntimeDependencies).
Preserve its public start, restart, dispose, and ready members.

Browser construction keeps the launch call shape:

```ts
export function createBrowserGame(
  mount: HTMLElement,
  resources: PhaseResourceSource,
  onFatalError: (error: unknown) => void,
  browserPlaytest: BrowserPlaytestStartup | null,
): Game;
```

Move GAME_CAMERA, WebGlInitializationError, renderer creation, camera creation, browser preferences, and random seed setup into createBrowserGame.ts.
Keep runtime-only types in GameRuntimeDependencies.ts. Keep GameFactories with Game unless import cycles require a type-only move.

- [x] Adapt construction tests to call createBrowserGame. Importance: 94/100.

Preserve existing renderer failure and cleanup order assertions.
Add a failure after runtime initialization starts and assert browser setup does not repeat runtime cleanup.
Keep the original error object as the thrown error.
In tests/helpers/gameRuntime.ts, move the current complete renderer and clock test adapters out of Game.ts.
Export createGameRuntimeDependencies(factories, options): GameRuntimeDependencies and createRuntimeTestGame(factories, options): Game.
Define GameRuntimeTestOptions from the current GameTestOptions fields in the test helper; remove that type from production.
Replace its waterQuality field with initialWaterQuality?: WaterQuality. Keep the other field names and types.

```ts
export function createRuntimeTestGame(
  factories: GameFactories,
  options: GameRuntimeTestOptions,
): Game {
  return new Game(createGameRuntimeDependencies(factories, options));
}
```

The builder fills every required dependency using the existing test defaults. No partial runtime dependencies reach Game.
Adapt the existing tests to this fixture, then run them before removing old setup code.

- [x] Move browser allocation code and ownership transfer into createBrowserGame.

Before calling new Game, the browser factory owns renderer, sceneRenderer, and canvas cleanup.
On entry to new Game, Game owns runtime setup cleanup, matching the existing initializationStarted rule.
Track this transfer explicitly; a thrown constructor does not return an instance for factory cleanup.
Do not use a factory catch block that disposes resources already handled by Game.rollbackConstruction.

Move water preference creation into Game where activePhase exists. The existing preference accepts its callback during creation.

```ts
const waterQuality = dependencies.createWaterQuality(
  (quality) => this.activePhase?.setWaterQuality?.(quality),
);
```

The browser factory supplies apply => createWaterQualityPreference(apply, browserStorage()).
The test builder supplies apply => createWaterQualityPreference(apply, null).
Replace the old optional test waterQuality object with initialWaterQuality in GameRuntimeTestOptions.
When that value exists, the test factory creates the preference, sets the value, and returns it.
No preference observer or second phase owner is needed. Keep preference initialization inside constructor rollback coverage.

- [x] Replace launch construction and test entry points atomically.

```ts
// src/app/launchGame.ts, PRODUCTION_DEPENDENCIES:
createGame: createBrowserGame,
```

Delete Game.forTest, initializeForTest, TestGameBase, createTestRenderer, and createTestClock from production.
Initialize runtime fields once through the normal constructor. Remove redundant resets only after constructor parity tests pass.
Drive frames through a captured requestAnimationFrame callback in tests instead of casting into handleAnimationFrame.

- [x] Verify every caller, run the full suite and build, then commit.

```powershell
rg -n 'Game.forTest|GameTestOptions|initializeForTest|Object.create\(Game.prototype\)' src tests
bun run test
bun run build
git add src/Game.ts src/app/GameRuntimeDependencies.ts src/app/createBrowserGame.ts src/app/launchGame.ts tests/helpers/gameRuntime.ts tests/helpers/game.ts tests/GameConstruction.test.ts tests/GamePhaseLoading.test.ts tests/GameShaderPreparation.test.ts tests/launchGame.test.ts tests/GameDirector.test.ts tests/GameLifecycle.test.ts
git commit -m "refactor: unify Game runtime construction"
```

Expected: no removed construction path remains. Do not retain aliases for the old test constructor.

## Final verification and handoff

- [x] Run the full tests and build from the implementation worktree.
- [x] Check the diff for accidental assets, package changes, and unrelated Heart of the Sea edits.
- [x] Verify affected scenes in a browser after reading the project playtest instructions.
- [x] Check Leak, focused events, weather, supernatural events, restart, and rescue in the browser. Verify hidden-page resume through automated tests.
- [x] Confirm no duplicated disposal and no missing interaction roots.
- [x] Record commands, results, and any unverified browser behavior in the final handoff.

No broad SurvivalSession rewrite, new save format, gameplay change, or visual redesign belongs in this plan.
No browser test batch is authorized or started merely by writing this plan.

## Plan review record

Source and test references were checked against the baseline. Implementation and review are complete.
The retained design travels with this plan in the same worktree.
The docs/superpowers directory is ignored by the repository. Force-add only these two planning files when tracking this plan.

Implementation results: [Final report](../reports/2026-09-22-architecture-implementation.md).

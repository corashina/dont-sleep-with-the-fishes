# Survival Phase Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `SurvivalPhase` a game-phase composition root by extracting independent day, fishing, event, drifting-item, lab, and visibility workflows.

**Architecture:** Each flow owns its temporary state and receives narrow `Pick` contracts. `SurvivalPhase` keeps `GamePhase` lifecycle, rendering, global pause, restart, flow construction, and top-level error reporting.

**Tech Stack:** TypeScript 5.9, Vitest 3.2, Three.js 0.180

**Spec:** `docs/superpowers/specs/2026-08-21-code-refactor-design.md`

## Global Constraints

- Complete the domain, event presentation, and `BoatWorld` plans first.
- Preserve command order, timings, audio cues, busy state, focus restore, and cancellation behavior.
- Every asynchronous continuation must check its captured lifecycle generation.
- A disposed or restarted flow cannot change session, world, UI, audio, or bundles.
- Use narrow `Pick` contracts. Do not add a service container.
- Keep `SurvivalPhase` as the only `GamePhase` implementation for survival.

---

### Task 1: Extract Fishing Flow

**Files:**
- Create: `src/survival/SurvivalFishingFlow.ts`
- Create: `tests/SurvivalFishingFlow.test.ts`
- Modify: `src/survival/SurvivalPhase.ts`
- Modify: `tests/SurvivalPhase.test.ts`

**Interfaces:**
- Consumes: fishing session commands, fishing world methods, fishing UI methods, audio cues, lifecycle checks, and snapshot rendering.
- Produces: `begin`, `cast`, `reel`, `continueResult`, `exitReadyView`, `update`, `settleForVisibilityChange`, and `dispose`.

- [ ] **Step 1: Move fishing state-machine tests**

Cover rejected start, view entry, cast, waiting, bite, reel, miss, result, continue, ready exit, pause, visibility settling, disposal, and stale promise completion.

```ts
const flow = new SurvivalFishingFlow(dependencies);
await flow.begin();
expect(world.enterFishingView).toHaveBeenCalledOnce();
flow.cast(640, 360, 1280, 720);
expect(world.playFishingCast).toHaveBeenCalledOnce();
```

- [ ] **Step 2: Run the test and confirm the missing class**

Run: `npm test -- tests/SurvivalFishingFlow.test.ts`

Expected: module-resolution failure.

- [ ] **Step 3: Define narrow contracts**

```ts
export type FishingSessionPort = Pick<SurvivalSession,
  'beginFishing' | 'cancelFishing' | 'finishFishing' | 'snapshot'>;

export type FishingWorldPort = Pick<BoatWorld,
  'enterFishingView' | 'castFishingAtScreenPoint' | 'playFishingCast'
  | 'showFishingWaiting' | 'showFishingBite' | 'projectFishingBite'
  | 'playFishingReel' | 'projectFishingCatch' | 'playFishingMiss'
  | 'exitFishingView' | 'clearFishingPresentation'>;

export type FishingUiPort = Pick<SurvivalUI,
  'setFishingState' | 'showFishingResult' | 'hideFishingResult'
  | 'updateFishingBiteTarget' | 'setFishingViewExitVisible'
  | 'setFishingFade' | 'restoreCommandFocus'>;
```

- [ ] **Step 4: Move state and methods unchanged**

```ts
export class SurvivalFishingFlow {
  begin(): Promise<void>;
  cast(clientX: number, clientY: number, width: number, height: number): void;
  reel(): boolean;
  continueResult(): void;
  exitReadyView(): void;
  update(delta: number): void;
  settleForVisibilityChange(): void;
  dispose(): void;
}
```

Move `activeFishing`, presentation state, settlement state, and all fishing private methods from `SurvivalPhase`.

- [ ] **Step 5: Delegate UI callbacks and phase updates**

`SurvivalPhase` wires fishing UI events to this flow and calls `update` once per phase update.

- [ ] **Step 6: Run fishing flow and integration tests**

Run: `npm test -- tests/SurvivalFishingFlow.test.ts tests/FishingSession.test.ts tests/SurvivalPhase.test.ts`

Expected: all selected tests pass.

- [ ] **Step 7: Commit the fishing flow**

```bash
git add src/survival/SurvivalFishingFlow.ts src/survival/SurvivalPhase.ts tests/SurvivalFishingFlow.test.ts tests/SurvivalPhase.test.ts
git commit -m "refactor: extract survival fishing flow"
```

---

### Task 2: Extract Drifting-Item Flow

**Files:**
- Create: `src/survival/DriftingItemFlow.ts`
- Create: `tests/DriftingItemFlow.test.ts`
- Modify: `src/survival/SurvivalPhase.ts`
- Modify: `tests/SurvivalPhase.test.ts`

**Interfaces:**
- Consumes: pending event data, contextual choices, camera view methods, projected bounds, UI focus view, and event-resolution callback.
- Produces: focus entry, contextual choice resolution, back navigation, target synchronization, visibility settling, and disposal.

- [ ] **Step 1: Move drifting-item workflow tests**

```ts
await flow.enter(eventId, choices);
expect(world.enterDriftingItemView).toHaveBeenCalledWith(eventId);
expect(ui.showDriftingItemFocus).toHaveBeenCalledOnce();
await flow.choose('retrieve');
expect(resolveChoice).toHaveBeenCalledWith('retrieve');
```

Cover retrieve, delegate, leave, back, resize, missing target, stale completion, and disposal.

- [ ] **Step 2: Run the test and confirm the missing class**

Run: `npm test -- tests/DriftingItemFlow.test.ts`

Expected: module-resolution failure.

- [ ] **Step 3: Implement the focused flow**

```ts
export class DriftingItemFlow {
  enter(eventId: DriftingItemEventId, choices: readonly EventContextChoice[]): Promise<void>;
  choose(choiceId: EventResponseId): Promise<void>;
  back(): Promise<void>;
  syncTarget(width: number, height: number): void;
  settleForVisibilityChange(): void;
  dispose(): void;
}
```

Move active event identifier, focus state, contextual resolution, view return, and projection synchronization.

- [ ] **Step 4: Delegate from `SurvivalPhase`**

The event flow requests drifting focus through this class. The phase wires the back callback and resize synchronization.

- [ ] **Step 5: Run focused and integration tests**

Run: `npm test -- tests/DriftingItemFlow.test.ts tests/SurvivalPhase.test.ts tests/BoatWorld.test.ts`

Expected: all selected tests pass.

- [ ] **Step 6: Commit the drifting flow**

```bash
git add src/survival/DriftingItemFlow.ts src/survival/SurvivalPhase.ts tests/DriftingItemFlow.test.ts tests/SurvivalPhase.test.ts
git commit -m "refactor: extract drifting item flow"
```

---

### Task 3: Extract Event Flow

**Files:**
- Create: `src/survival/SurvivalEventFlow.ts`
- Create: `tests/SurvivalEventFlow.test.ts`
- Modify: `src/survival/SurvivalPhase.ts`
- Modify: `tests/SurvivalPhase.test.ts`
- Modify: `tests/EventBundleManager.test.ts`

**Interfaces:**
- Consumes: session event commands, event world methods, event UI methods, audio, bundle manager, drifting flow, lifecycle guards, and snapshot rendering.
- Produces: pending reveal, item choice, endure, contextual choice, outcome resolution, dawn, presentation sync, and cleanup.

- [ ] **Step 1: Move event orchestration tests**

Cover bundle preload and activation, reveal, item use, choice beat, exact result validation, focused fallback recovery, event cleanup, dawn, terminal tableau retention, and stale callbacks.

```ts
await flow.revealPending(session.snapshot());
expect(bundles.activate).toHaveBeenCalledWith(eventId);
expect(world.stageEvent).toHaveBeenCalledWith(expect.objectContaining({ eventId }));
expect(world.revealEvent).toHaveBeenCalledWith(eventId);
```

- [ ] **Step 2: Run the test and confirm the missing class**

Run: `npm test -- tests/SurvivalEventFlow.test.ts`

Expected: module-resolution failure.

- [ ] **Step 3: Define narrow event ports**

```ts
export type EventSessionPort = Pick<SurvivalSession,
  'snapshot' | 'resolveEvent' | 'requestDayEvent' | 'beginDawn'
  | 'companionEventActionAvailability'>;

export type EventWorldPort = Pick<BoatWorld,
  'stageEvent' | 'revealEvent' | 'playEventItemUse' | 'returnEventItemUse'
  | 'playEventChoice' | 'reactToEventOutcome' | 'clearEvent'
  | 'setEventEligibleItems' | 'setEventSelectedItem'>;
```

Define the UI port with only event reveal, selection, choice beat, sleep mask, feedback, and clear methods.

- [ ] **Step 4: Implement event state ownership**

```ts
export class SurvivalEventFlow {
  revealPending(snapshot: SurvivalSnapshot): Promise<void>;
  resolveItem(choiceId: EventResponseId, instanceId: ItemInstanceId): Promise<void>;
  resolveEndure(): Promise<void>;
  resolveContextual(choiceId: EventResponseId): Promise<void>;
  beginDawn(): Promise<SurvivalSnapshot>;
  sync(snapshot: SurvivalSnapshot): void;
  settleForVisibilityChange(): void;
  clear(preserveDeferredSync?: boolean): void;
  dispose(): void;
}
```

Move event presentation state, eligibility map, deferred sync, bundle calls, reveal, result validation, resolution, dawn, and terminal tableau retention.

- [ ] **Step 5: Keep error boundaries explicit**

Route invariant failures to the existing invariant handler. Route bundle, audio, and presenter failures to the fatal handler. Always clear busy state in `finally` after a current-generation operation.

- [ ] **Step 6: Delegate event commands from `SurvivalPhase`**

Wire `handleEventItem`, `handleEndure`, day-event opening, and presentation synchronization through the flow.

- [ ] **Step 7: Run event flow and integration tests**

Run: `npm test -- tests/SurvivalEventFlow.test.ts tests/SurvivalPhase.test.ts tests/EventBundleManager.test.ts tests/EventPresentationRegistry.test.ts`

Expected: all selected tests pass.

- [ ] **Step 8: Commit the event flow**

```bash
git add src/survival/SurvivalEventFlow.ts src/survival/SurvivalPhase.ts tests/SurvivalEventFlow.test.ts tests/SurvivalPhase.test.ts tests/EventBundleManager.test.ts
git commit -m "refactor: extract survival event flow"
```

---

### Task 4: Extract Day-Action Flow

**Files:**
- Create: `src/survival/SurvivalDayActionFlow.ts`
- Create: `tests/SurvivalDayActionFlow.test.ts`
- Modify: `src/survival/SurvivalPhase.ts`
- Modify: `tests/SurvivalPhase.test.ts`

**Interfaces:**
- Consumes: session `perform` and `endDay`, action world methods, UI covers and results, audio, event-flow dawn transition, lifecycle guards, and snapshot rendering.
- Produces: normal action, chest, Carlitos, dive, repair, and end-day workflows.

- [ ] **Step 1: Move day-action workflow tests**

```ts
await flow.run('dive');
expect(world.playDive).toHaveBeenCalledOnce();
expect(ui.showRewardResult).toHaveBeenCalledOnce();
expect(renderSnapshot).toHaveBeenCalled();
```

Cover rejection, busy state, feedback, chest, Carlitos care, repair, dive cover, end day, sleep hold, and terminal outcomes.

- [ ] **Step 2: Run the test and confirm the missing class**

Run: `npm test -- tests/SurvivalDayActionFlow.test.ts`

Expected: module-resolution failure.

- [ ] **Step 3: Implement the flow API**

```ts
export class SurvivalDayActionFlow {
  run(action: DayActionId, option?: DayActionOption): Promise<void>;
  repairOption(snapshot: SurvivalSnapshot): DayActionOption | undefined;
  repairItemReason(snapshot: SurvivalSnapshot): string | null;
  settleForVisibilityChange(): void;
  dispose(): void;
}
```

Move `runDayAction`, chest, Carlitos, dive, end-day, repair option, and unavailable-reason coordination.

- [ ] **Step 4: Delegate actions from `SurvivalPhase`**

`handleAction` checks only phase-level pause, restart, and terminal guards. Accepted routing belongs to the day-action or fishing flow.

- [ ] **Step 5: Run action and phase tests**

Run: `npm test -- tests/SurvivalDayActionFlow.test.ts tests/SurvivalPhase.test.ts tests/DiveUI.test.ts tests/ChestDisplay.test.ts`

Expected: all selected tests pass.

- [ ] **Step 6: Commit the day-action flow**

```bash
git add src/survival/SurvivalDayActionFlow.ts src/survival/SurvivalPhase.ts tests/SurvivalDayActionFlow.test.ts tests/SurvivalPhase.test.ts
git commit -m "refactor: extract survival day action flow"
```

---

### Task 5: Extract Item Animation Lab and Visibility Handling

**Files:**
- Create: `src/survival/ItemAnimationLabFlow.ts`
- Create: `src/survival/SurvivalVisibilityController.ts`
- Create: `tests/ItemAnimationLabFlow.test.ts`
- Create: `tests/SurvivalVisibilityController.test.ts`
- Modify: `src/survival/SurvivalPhase.ts`
- Modify: `tests/ItemAnimationLab.test.ts`
- Modify: `tests/SurvivalPhase.test.ts`

**Interfaces:**
- Lab flow owns lab eligibility, selection, item animation, repair-tool animation, and audio cues.
- Visibility controller owns document listeners and resume waiters.

- [ ] **Step 1: Add focused tests**

```ts
await lab.play(instanceId);
expect(world.playEventItemUse).toHaveBeenCalledOnce();
visibility.setHidden(true);
expect(world.setDocumentHidden).toHaveBeenCalledWith(true);
expect(fishing.settleForVisibilityChange).toHaveBeenCalledOnce();
```

Test stale lab work, hidden document at start, multiple resume waiters, disposal, and listener removal.

- [ ] **Step 2: Run focused tests and confirm missing classes**

Run: `npm test -- tests/ItemAnimationLabFlow.test.ts tests/SurvivalVisibilityController.test.ts`

Expected: module-resolution failures.

- [ ] **Step 3: Implement lab flow**

```ts
export class ItemAnimationLabFlow {
  enter(snapshot: SurvivalSnapshot): void;
  play(instanceId: ItemInstanceId): Promise<void>;
  eligibleItems(snapshot: SurvivalSnapshot): ReadonlySet<ItemInstanceId>;
  settleForVisibilityChange(): void;
  dispose(): void;
}
```

- [ ] **Step 4: Implement visibility control**

```ts
export class SurvivalVisibilityController {
  constructor(document: Document, onHidden: () => void, onVisible: () => void);
  isHidden(): boolean;
  waitForResume(isCurrent: () => boolean): Promise<boolean>;
  dispose(): void;
}
```

Resolve every pending waiter with `false` during disposal.

- [ ] **Step 5: Delegate from `SurvivalPhase` and run tests**

Run: `npm test -- tests/ItemAnimationLabFlow.test.ts tests/SurvivalVisibilityController.test.ts tests/ItemAnimationLab.test.ts tests/SurvivalPhase.test.ts`

Expected: all selected tests pass.

- [ ] **Step 6: Commit both extractions**

```bash
git add src/survival/ItemAnimationLabFlow.ts src/survival/SurvivalVisibilityController.ts src/survival/SurvivalPhase.ts tests/ItemAnimationLabFlow.test.ts tests/SurvivalVisibilityController.test.ts tests/ItemAnimationLab.test.ts tests/SurvivalPhase.test.ts
git commit -m "refactor: extract survival lab and visibility flows"
```

---

### Task 6: Reduce `SurvivalPhase` to Lifecycle Coordination

**Files:**
- Modify: `src/survival/SurvivalPhase.ts`
- Modify: `tests/SurvivalPhase.test.ts`
- Modify: `tests/GameLifecycle.test.ts`
- Modify: `README.md`

**Interfaces:**
- `SurvivalPhase` retains `start`, `update`, `resize`, `render`, pause, restart, override controls, and `dispose`.

- [ ] **Step 1: Add phase-level ownership tests**

```ts
phase.start();
phase.update(4, 1 / 60);
expect(fishing.update).toHaveBeenCalledOnce();
phase.dispose();
phase.dispose();
expect(eventFlow.dispose).toHaveBeenCalledOnce();
expect(visibility.dispose).toHaveBeenCalledOnce();
```

- [ ] **Step 2: Remove extracted fields and methods**

Run: `rg -n "activeFishing|fishingPresentation|eventPresentation|driftingItemFocus|visibilityResumeWaiters|playItemAnimationLab" src/survival/SurvivalPhase.ts`

Expected: no extracted state remains.

- [ ] **Step 3: Keep explicit lifecycle order**

Start world and UI wiring once. Update flows before snapshot projection. Dispose flows before world, UI, audio, and event bundles.

- [ ] **Step 4: Update architecture documentation**

Document each flow and state that `SurvivalPhase` owns phase lifecycle only.

- [ ] **Step 5: Run full verification**

Run: `npm run typecheck && npm test && npm run build`

Expected: all commands pass.

- [ ] **Step 6: Commit the phase cleanup**

```bash
git add src/survival/SurvivalPhase.ts tests/SurvivalPhase.test.ts tests/GameLifecycle.test.ts README.md
git commit -m "refactor: reduce survival phase to lifecycle coordination"
```

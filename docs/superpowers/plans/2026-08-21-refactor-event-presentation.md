# Event Presentation Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace route-specific event dispatch in `BoatWorld` with one event presentation host and normalized lifecycle.

**Architecture:** Existing presentation families keep their visual logic. Route adapters normalize their methods. One registry creates one adapter per event, and one host owns activation, updates, cleanup, and visibility settling.

**Tech Stack:** TypeScript 5.9, Vitest 3.2, Three.js 0.180

**Spec:** `docs/superpowers/specs/2026-08-21-code-refactor-design.md`

## Global Constraints

- Complete `2026-08-21-refactor-baseline-domain.md` first.
- Preserve every event visual, timing, cue, target, fallback, and outcome.
- Do not change event models, materials, lighting, or choreography.
- Do not add compatibility shims or route fallbacks.
- Keep cleanup idempotent and preserve the primary construction error.
- Avoid allocations in `update` methods.

---

### Task 1: Define the Normalized Presenter Contract

**Files:**
- Create: `src/survival/EventPresentationAdapter.ts`
- Create: `tests/EventPresentationAdapter.test.ts`
- Modify: `src/survival/eventPresentationTypes.ts`

**Interfaces:**
- Consumes: `EventPresentationContext`, `EventChoicePresentation`, and `EventPresentationReaction`.
- Produces: `EventPresentationAdapter`, `EventPresentationRoot`, `EventPresentationContext`, and `EventPresentationReaction`.

- [ ] **Step 1: Add a contract fixture test**

```ts
const adapter: EventPresentationAdapter = {
  eventId: 'leak',
  roots: [],
  stage: vi.fn(), reveal: vi.fn(async () => undefined),
  playChoice: vi.fn(async () => undefined),
  playItemUse: vi.fn(async () => false),
  itemAimTarget: vi.fn(() => null),
  interactionRoot: vi.fn(() => null), resultRoot: vi.fn(() => null),
  react: vi.fn(async () => undefined), update: vi.fn(),
  settleForVisibilityChange: vi.fn(), clear: vi.fn(), dispose: vi.fn(),
};
expect(adapter.eventId).toBe('leak');
```

- [ ] **Step 2: Run the test and confirm the missing contract**

Run: `npm test -- tests/EventPresentationAdapter.test.ts`

Expected: module-resolution failure.

- [ ] **Step 3: Add the exact contract**

```ts
export interface EventPresentationRoot {
  readonly parent: Object3D;
  readonly root: Object3D;
}

export interface EventPresentationContext {
  readonly eventId: SurvivalEventId;
  readonly targetInstanceId: ItemInstanceId | null;
  readonly variantSeed: number;
}

export interface EventPresentationReaction {
  readonly outcome: ActionOutcome;
  readonly physicalResponse: EventPhysicalResponsePresentation;
  readonly result: EventOutcomePresentation | null;
  readonly choice: EventChoicePresentation | null;
}

export interface EventPresentationAdapter {
  readonly eventId: SurvivalEventId;
  readonly roots: readonly EventPresentationRoot[];
  stage(context: EventPresentationContext): void;
  reveal(): Promise<void>;
  playChoice(choice: EventChoicePresentation): Promise<void>;
  playItemUse(choiceId: string, instanceId: ItemInstanceId): Promise<boolean>;
  itemAimTarget(): Object3D | null;
  interactionRoot(id: string): Object3D | null;
  resultRoot(id: string): Object3D | null;
  react(reaction: EventPresentationReaction): Promise<void>;
  update(time: number, delta: number): void;
  settleForVisibilityChange(): void;
  clear(): void;
  dispose(): void;
}
```

Keep `EventSceneContext` dedicated-only. A dedicated adapter converts the
normalized context to `EventSceneContext` after it confirms the event route.

- [ ] **Step 4: Run contract and existing presentation tests**

Run: `npm test -- tests/EventPresentationAdapter.test.ts tests/EventPresentationCoordinator.test.ts tests/KeyedEventPresentation.test.ts`

Expected: all selected tests pass.

- [ ] **Step 5: Commit the contract**

```bash
git add src/survival/EventPresentationAdapter.ts src/survival/eventPresentationTypes.ts tests/EventPresentationAdapter.test.ts
git commit -m "refactor: define event presentation adapter"
```

---

### Task 2: Add the Event Presentation Host

**Files:**
- Create: `src/survival/EventPresentationHost.ts`
- Create: `tests/EventPresentationHost.test.ts`

**Interfaces:**
- Consumes: one `EventPresentationAdapter` at a time.
- Produces: `attach`, `detach`, lifecycle delegation, and active-event queries.

- [ ] **Step 1: Add lifecycle and rollback tests**

```ts
const host = new EventPresentationHost();
host.attach(adapter);
expect(parent.add).toHaveBeenCalledWith(root);
await host.reveal();
expect(adapter.reveal).toHaveBeenCalledOnce();
host.clear();
expect(adapter.clear).toHaveBeenCalledOnce();
host.detach(adapter);
expect(root.removeFromParent).toHaveBeenCalledOnce();
```

Add tests for duplicate attach rejection, wrong-adapter detach, idempotent dispose, update delegation, and visibility settling.

- [ ] **Step 2: Run the host test and confirm the missing class**

Run: `npm test -- tests/EventPresentationHost.test.ts`

Expected: module-resolution failure.

- [ ] **Step 3: Implement single-owner activation**

```ts
export class EventPresentationHost {
  private active: EventPresentationAdapter | null = null;
  private disposed = false;

  attach(adapter: EventPresentationAdapter): void;
  detach(adapter: EventPresentationAdapter): void;
  stage(context: EventPresentationContext): void;
  reveal(): Promise<void>;
  playChoice(choice: EventChoicePresentation): Promise<void>;
  playItemUse(choiceId: string, instanceId: ItemInstanceId): Promise<boolean>;
  react(reaction: EventPresentationReaction): Promise<void>;
  update(time: number, delta: number): void;
  settleForVisibilityChange(): void;
  clear(): void;
  dispose(): void;
}
```

Attach every root in array order. Detach roots in reverse order. Use `runCleanupSteps` for disposal.

- [ ] **Step 4: Run focused tests**

Run: `npm test -- tests/EventPresentationHost.test.ts tests/EventBundleManager.test.ts`

Expected: all selected tests pass. The existing presenter remains active until Task 4.

- [ ] **Step 5: Commit the host**

```bash
git add src/survival/EventPresentationHost.ts tests/EventPresentationHost.test.ts
git commit -m "refactor: add event presentation host"
```

---

### Task 3: Create Route Adapters and Registry

**Files:**
- Create: `src/survival/eventPresentationAdapters.ts`
- Create: `src/survival/EventPresentationRegistry.ts`
- Create: `tests/EventPresentationRegistry.test.ts`
- Modify: `src/survival/eventPresentationRoutes.ts`

**Interfaces:**
- Produces: `EventPresentationAdapterDependencies`, `EventPresentationAdapterFactory`, and `EventPresentationRegistry.create`.
- Uses existing dedicated, focused, featured, weather, supernatural, moon, and dangerous-waters implementations.

- [ ] **Step 1: Add exhaustive registry tests**

```ts
for (const eventId of SURVIVAL_EVENT_IDS) {
  const adapter = registry.create(eventId, dependencies);
  expect(adapter.eventId).toBe(eventId);
  adapter.dispose();
}
expect(() => registry.create('missing' as SurvivalEventId, dependencies))
  .toThrow('Missing event presentation factory: missing');
```

Assert that each adapter delegates `stage`, `reveal`, `playItemUse`, `react`, `clear`, and `dispose` to only its required family.

- [ ] **Step 2: Run the registry test and confirm missing modules**

Run: `npm test -- tests/EventPresentationRegistry.test.ts`

Expected: module-resolution failure.

- [ ] **Step 3: Define registry types**

```ts
export type EventPresentationAdapterFactory = (
  eventId: SurvivalEventId,
  dependencies: EventPresentationAdapterDependencies,
) => EventPresentationAdapter;

export class EventPresentationRegistry {
  constructor(
    private readonly factories: Readonly<Record<EventPresentationRoute,
      EventPresentationAdapterFactory>>,
  ) {}

  create(
    eventId: SurvivalEventId,
    dependencies: EventPresentationAdapterDependencies,
  ): EventPresentationAdapter;
}
```

Build the default route-factory record once. Do not allocate it during event activation.

- [ ] **Step 4: Implement thin family adapters**

Each factory constructs only its required family and returns one normalized adapter. A focused adapter owns `EventPresentationLayer`. A featured adapter owns `FeaturedEventPresentations`. Weather and supernatural adapters own their matching animator plus the generic layer when current behavior uses both.

Use `runCleanupSteps` in every adapter. Preserve current root parents and construction rollback order.

- [ ] **Step 5: Make route coverage compile-time exhaustive**

Keep every current entry in `EVENT_PRESENTATION_ROUTES`. Retain its
`Readonly<Record<SurvivalEventId, EventPresentationRoute>>` compile-time
coverage check. Do not add runtime fallback routes.

- [ ] **Step 6: Run registry and existing family tests**

Run: `npm test -- tests/EventPresentationRegistry.test.ts tests/EventPresentationCoordinator.test.ts tests/MidnightTourPresentation.test.ts tests/WeatherAndSupernaturalItemUse.test.ts`

Expected: all selected tests pass.

- [ ] **Step 7: Commit adapters and registry**

```bash
git add src/survival/eventPresentationAdapters.ts src/survival/EventPresentationRegistry.ts src/survival/eventPresentationRoutes.ts tests/EventPresentationRegistry.test.ts
git commit -m "refactor: register normalized event presenters"
```

---

### Task 4: Integrate Bundles and `BoatWorld` with the Host

**Files:**
- Modify: `src/survival/EventBundle.ts`
- Modify: `src/survival/EventBundleManager.ts`
- Modify: `src/survival/BoatWorld.ts`
- Modify: `tests/EventBundleManager.test.ts`
- Modify: `tests/EventBundleManifest.test.ts`
- Modify: `tests/BoatWorld.test.ts`
- Modify: `tests/EventItemAimTargets.test.ts`
- Modify: `tests/FlashlightBoatWorld.test.ts`

**Interfaces:**
- Replaces `ActiveEventPresenter` with `EventPresentationAdapter`.
- Replaces host `attachEventPresenter` and `detachEventPresenter` with `attach` and `detach`.
- `BoatWorld` owns one `EventPresentationHost` and one `EventPresentationRegistry`.

- [ ] **Step 1: Update bundle tests first**

```ts
const host = {
  createEventPresentation: vi.fn(() => adapter),
  attach: vi.fn(),
  detach: vi.fn(),
};
bundle.attach();
expect(host.attach).toHaveBeenCalledWith(adapter);
bundle.dispose();
expect(host.detach).toHaveBeenCalledWith(adapter);
expect(adapter.dispose).toHaveBeenCalledOnce();
```

- [ ] **Step 2: Add host-delegation characterizations**

Add tests that one active event receives each lifecycle call exactly once.
Cover one dedicated, focused, featured, weather, supernatural, and moon event.

```ts
world.stageEvent(context);
await world.revealEvent(context.eventId);
await world.playEventChoice(context.eventId, choice);
await world.reactToEventOutcome(context.eventId, outcome, response, presentation);
world.clearEvent();
expect(adapter.stage).toHaveBeenCalledOnce();
expect(adapter.clear).toHaveBeenCalledOnce();
```

- [ ] **Step 3: Run bundle and world tests before integration**

Run: `npm test -- tests/EventBundleManager.test.ts tests/EventBundleManifest.test.ts tests/BoatWorld.test.ts tests/EventItemAimTargets.test.ts tests/FlashlightBoatWorld.test.ts`

Expected: failures because the current bundle and world use `ActiveEventPresenter`.

- [ ] **Step 4: Change the bundle host contract**

```ts
export interface EventPresenterHost {
  createEventPresentation(
    eventId: SurvivalEventId,
    dedicatedModels: EventModelLibrary,
    featuredModels: SurvivalEventModels,
  ): EventPresentationAdapter;
  attach(adapter: EventPresentationAdapter): void;
  detach(adapter: EventPresentationAdapter): void;
}
```

Keep load rollback and resource disposal order unchanged.

- [ ] **Step 5: Build adapters through the registry**

Implement `BoatWorld.createEventPresentation` by passing its existing scene,
boat, camera, model, supply, chest, wave, and cue dependencies to the registry.
Attach and detach through the owned host. Keep fallback model behavior in
`ensureEventPresenter`.

- [ ] **Step 6: Delegate event lifecycle**

Replace route branches in `stageEvent`, `revealEvent`, `playEventChoice`,
`playEventSceneItemUse`, `reactToEventOutcome`, `clearEvent`,
`setDocumentHidden`, and `updateScene` with host calls.

Keep non-presenter work in place: item-use control, Carlitos delegation,
camera return, supply cleanup, moon callbacks, and vortex reset.

- [ ] **Step 7: Run integrated verification**

Run: `npm test -- tests/EventBundleManager.test.ts tests/EventBundleManifest.test.ts tests/BoatWorld.test.ts tests/EventItemAimTargets.test.ts tests/FlashlightBoatWorld.test.ts tests/EventPresentationRegistry.test.ts`

Run: `npm run typecheck && npm test && npm run build`

Expected: all commands pass.

- [ ] **Step 8: Commit the atomic integration**

```bash
git add src/survival/EventBundle.ts src/survival/EventBundleManager.ts src/survival/BoatWorld.ts tests/EventBundleManager.test.ts tests/EventBundleManifest.test.ts tests/BoatWorld.test.ts tests/EventItemAimTargets.test.ts tests/FlashlightBoatWorld.test.ts
git commit -m "refactor: unify event presentation dispatch"
```

---

### Task 5: Remove Obsolete Presenter Paths

**Files:**
- Delete: `src/survival/ActiveEventPresenter.ts`
- Delete: `tests/ActiveEventPresenter.test.ts`
- Modify: `src/survival/BoatWorld.ts`
- Modify: `tests/EventPresentationHost.test.ts`

**Interfaces:**
- The new host owns attachment, detachment, lifecycle, and disposal tests.
- No old presenter type or direct family getter remains.

- [ ] **Step 1: Move remaining old host assertions**

Copy the old duplicate-attach, detach, and idempotent-dispose expectations into
`EventPresentationHost.test.ts`. Keep the normalized adapter fixture.

- [ ] **Step 2: Delete the old class and test**

Delete `ActiveEventPresenter.ts` and `ActiveEventPresenter.test.ts`. Remove old
imports and old presenter fields.

- [ ] **Step 3: Remove obsolete route getters and state**

Run: `rg -n "dedicatedEvents|eventPresentation|featuredEvents|weatherEventAnimator|supernaturalEventAnimator" src/survival/BoatWorld.ts`

Expected: no family getter or direct dispatch remains.

- [ ] **Step 4: Search for the obsolete type**

Run: `rg -n "ActiveEventPresenter" src tests`

Expected: no matches.

- [ ] **Step 5: Run event and world verification**

Run: `npm test -- tests/BoatWorld.test.ts tests/EventItemAimTargets.test.ts tests/FlashlightBoatWorld.test.ts tests/EventPresentationRegistry.test.ts tests/EventBundleManager.test.ts`

Run: `npm run typecheck && npm test && npm run build`

Expected: all commands pass.

- [ ] **Step 6: Commit obsolete-path removal**

```bash
git add src/survival/ActiveEventPresenter.ts src/survival/BoatWorld.ts tests/ActiveEventPresenter.test.ts tests/EventPresentationHost.test.ts
git commit -m "refactor: remove obsolete event presenter"
```

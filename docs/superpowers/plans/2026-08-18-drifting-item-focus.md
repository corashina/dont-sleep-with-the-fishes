# Drifting Item Focus Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a bow-focused interaction flow for drifting barrel, chest, and bottle events, backed by Carlitos's separate energy resource.

**Architecture:** `SurvivalPhase` owns one drifting-item focus lifecycle. `BoatWorld` owns a separate camera transition that reuses the fishing destination position and targets the active item. `SurvivalUI` owns one side panel for choices, results, and return input. The session remains the authority for player and Carlitos energy.

**Tech Stack:** TypeScript 5.9, Three.js 0.180, Vitest 3.2, JSDOM 29, Vite 7.

**Spec:** `docs/superpowers/specs/2026-08-18-drifting-item-focus-design.md`

## Global Constraints

- Treat the existing `drifting-chest` event as the requested crate.
- Player pickup costs three energy for barrel and chest.
- Player pickup costs one energy for bottle.
- Carlitos starts with three energy and has a maximum of three.
- Every Carlitos pickup costs three Carlitos energy.
- A surviving Carlitos recovers one energy at dawn after existing dawn checks.
- Do not change fishing rules or fishing presentation.
- Preserve existing cargo rewards and probabilities.
- Use the current event choice and result visual language.
- Keep the screen center clear and the world dominant.
- Do not add reduced-motion behavior.
- Do not allocate objects in frame update or render paths.
- Remove obsolete drifting-cargo-only paths instead of adding compatibility aliases.
- Preserve all unrelated uncommitted workspace changes.
- Use `git add -p` for files that had changes before this plan.

---

### Task 1: Add Carlitos Energy to Domain State

**Files:**
- Modify: `src/survival/CarlitosState.ts`
- Modify: `src/survival/survivalTypes.ts`
- Modify: `src/survival/SurvivalSession.ts`
- Modify: `src/survival/journal.ts`
- Modify: `src/ui/SurvivalUI.ts`
- Modify: `src/styles/main.css`
- Test: `tests/CarlitosState.test.ts`
- Test: `tests/SurvivalSession.test.ts`
- Test: `tests/SurvivalUI.test.ts`

**Interfaces:**
- Produces: `CARLITOS_MAX_ENERGY = 3` and `CARLITOS_EVENT_ENERGY_COST = 3`.
- Produces: `CarlitosState.energy: number` and snapshots containing that field.
- Produces: `spendCarlitosEnergy(state: CarlitosState, amount?: number): boolean`.
- Extends: `CompanionEventActionAvailability` with required numeric `energyCost` and `availableEnergy`.
- Extends: `JournalCarlitosDawnState` with `energy`.

- [ ] **Step 1: Write failing Carlitos state tests**

Add these assertions to `tests/CarlitosState.test.ts`:

```ts
expect(createCarlitosState().energy).toBe(3);
expect(createCarlitosState({ energy: 8 }).energy).toBe(3);
expect(createCarlitosState({ energy: -2 }).energy).toBe(0);

const spent = createCarlitosState();
expect(spendCarlitosEnergy(spent)).toBe(true);
expect(spent.energy).toBe(0);
expect(spendCarlitosEnergy(spent)).toBe(false);

const recovered = createCarlitosState({ energy: 1 });
advanceCarlitosDawn(recovered, sequenceRandom([1, 1, 1]));
expect(recovered.energy).toBe(2);

const full = createCarlitosState({ energy: 3 });
advanceCarlitosDawn(full, sequenceRandom([1, 1, 1]));
expect(full.energy).toBe(3);

const dead = createCarlitosState({ energy: 1, hunger: 1 });
advanceCarlitosDawn(dead, sequenceRandom([0]));
expect(dead).toMatchObject({ alive: false, energy: 1 });
```

- [ ] **Step 2: Run state tests and verify failure**

Run:

```powershell
bunx vitest run tests/CarlitosState.test.ts
```

Expected: failures report missing `energy` and `spendCarlitosEnergy`.

- [ ] **Step 3: Implement bounded Carlitos energy**

Add these exports in `CarlitosState.ts`:

```ts
export const CARLITOS_MAX_ENERGY = 3;
export const CARLITOS_EVENT_ENERGY_COST = 3;

export function spendCarlitosEnergy(
  state: CarlitosState,
  amount = CARLITOS_EVENT_ENERGY_COST,
): boolean {
  state.energy = clampCarlitosEnergy(state.energy);
  if (!state.alive || state.energy < amount) return false;
  state.energy -= amount;
  return true;
}

function clampCarlitosEnergy(value: number): number {
  return Math.min(CARLITOS_MAX_ENERGY, Math.max(0, Math.trunc(value)));
}
```

Add `energy` to `CarlitosState` and default it to `CARLITOS_MAX_ENERGY`.
Clamp the merged initial value before returning from `createCarlitosState`.
At the end of `advanceCarlitosDawn`, add one energy only when Carlitos remains alive.

- [ ] **Step 4: Add failing session and journal tests**

Add focused tests in `tests/SurvivalSession.test.ts`:

```ts
const session = new SurvivalSession(saved('carlitos'), {
  seed: 7,
  initialCarlitos: { energy: 3 },
  initialEventId: 'drifting-barrel',
});
expect(session.resolveEvent({ kind: 'choice', choiceId: 'delegate-carlitos' }).accepted).toBe(true);
expect(session.snapshot().carlitos?.energy).toBe(0);
```

Also create a session with zero Carlitos energy and assert delegation is rejected.
Assert the rejected choice spends nothing.
Assert a dawn journal record changes energy from `0` to `1` for a surviving Carlitos.
Update the current journal copy expectation to include `energy 0 to 1`.

- [ ] **Step 5: Run session tests and verify failure**

Run:

```powershell
bunx vitest run tests/SurvivalSession.test.ts
```

Expected: delegation does not deduct Carlitos energy and journal records omit it.

- [ ] **Step 6: Enforce energy inside event resolution**

Check energy before the existing wellness branch for `delegateCarlitos`:

```ts
if (this.carlitos.energy < CARLITOS_EVENT_ENERGY_COST) {
  return {
    visible: true,
    energyCost: CARLITOS_EVENT_ENERGY_COST,
    availableEnergy: this.carlitos.energy,
    unavailableReason: `Carlitos needs 3 energy; he has ${this.carlitos.energy}.`,
  };
}
```

Return the same energy metadata with `unavailableReason: null` when wellness is at least four.
Return the same metadata with the current hunger, health, or mood reason otherwise.

After all choice validation passes and before event effects apply, spend Carlitos energy:

```ts
if (choice.companionAction === 'delegateCarlitos'
  && !spendCarlitosEnergy(this.carlitos!)) {
  return this.reject('companion-action-unavailable', 'Carlitos does not have enough energy.');
}
```

Include `energy` in `carlitosDawnState`, `carlitosDawnChanged`, and journal formatting.
Keep absence and death availability records invisible, with zero energy metadata.

- [ ] **Step 7: Show energy in the Carlitos card**

Add this row after Carlitos health:

```html
<div class="carlitos-status" data-carlitos-energy-row>
  <span class="carlitos-status__name ui-role-context">ENERGY</span>
  <strong class="ui-role-numeral" data-carlitos-energy-label></strong>
  <span class="carlitos-energy" aria-hidden="true">
    <i data-carlitos-energy-step="1"></i>
    <i data-carlitos-energy-step="2"></i>
    <i data-carlitos-energy-step="3"></i>
  </span>
</div>
```

Set the label to `${carlitos.energy} / 3`.
Set each step's `data-filled` value from current energy.
Style the steps with the existing Carlitos card material and `var(--ink-yellow)` fill.

- [ ] **Step 8: Run domain and UI tests**

Run:

```powershell
bunx vitest run tests/CarlitosState.test.ts tests/SurvivalSession.test.ts tests/SurvivalUI.test.ts
```

Expected: all Carlitos energy, journal, and card tests pass.

- [ ] **Step 9: Commit only Task 1 hunks**

Use `git add -p` for every pre-existing modified file.
Review `git diff --cached --check` and `git diff --cached`.
Commit with:

```powershell
git commit -m "feat: add Carlitos event energy"
```

---

### Task 2: Unify Drifting Item Rules

**Files:**
- Modify: `src/survival/events.ts`
- Modify: `src/survival/survivalTypes.ts`
- Modify: `src/survival/SurvivalSession.ts`
- Modify: `src/ui/SurvivalUI.ts`
- Modify: `src/survival/SurvivalPhase.ts`
- Test: `tests/survivalEvents.test.ts`
- Test: `tests/SurvivalSession.test.ts`

**Interfaces:**
- Produces: `DriftingItemEventId = DriftingCargoEventId | 'drifting-bottle'`.
- Produces: `isDriftingItemEventId(eventId: string): eventId is DriftingItemEventId`.
- Produces: `driftingItemRetrieveKey` and `driftingItemLeaveKey` returning `EventPresentationKey`.
- Extends: `EventContextChoice` with `energyOwner?: 'player' | 'carlitos'`.

- [ ] **Step 1: Write failing event rule tests**

Add these expectations:

```ts
const bottle = event('drifting-bottle');
expect(bottle.choices.map(({ id }) => id)).toEqual([
  'retrieve',
  'delegate-carlitos',
  'sleep',
]);
expect(bottle.choices.find(({ id }) => id === 'retrieve')?.requirements)
  .toEqual([{ resource: 'energy', minimum: 1 }]);
expect(bottle.choices.find(({ id }) => id === 'delegate-carlitos')?.companionAction)
  .toBe('delegateCarlitos');
expect(bottle.choices.find(({ id }) => id === 'sleep')?.label).toBe('Let It Drift');
```

In `SurvivalSession.test.ts`, assert bottle delegation grants `bottledPaper`,
spends three Carlitos energy, and leaves player energy unchanged.

- [ ] **Step 2: Run event tests and verify failure**

Run:

```powershell
bunx vitest run tests/survivalEvents.test.ts tests/SurvivalSession.test.ts
```

Expected: bottle has no Carlitos choice and still labels its leave choice `Sleep`.

- [ ] **Step 3: Add shared drifting item helpers**

Add these helpers beside existing cargo helpers in `events.ts`:

```ts
export type DriftingItemEventId = DriftingCargoEventId | 'drifting-bottle';

export function isDriftingItemEventId(eventId: string): eventId is DriftingItemEventId {
  return isDriftingCargoEventId(eventId) || eventId === 'drifting-bottle';
}

export function driftingItemRetrieveKey(eventId: DriftingItemEventId): EventPresentationKey {
  if (eventId === 'drifting-barrel') return 'drifting-barrel.food';
  if (eventId === 'drifting-chest') return 'drifting-chest.food';
  return 'drifting-bottle.retrieve';
}

export function driftingItemLeaveKey(eventId: DriftingItemEventId): EventPresentationKey {
  if (eventId === 'drifting-barrel') return 'drifting-barrel.drift';
  if (eventId === 'drifting-chest') return 'drifting-chest.drift';
  return 'drifting-bottle.lost';
}
```

Use these helpers instead of new string branches in later tasks.

- [ ] **Step 4: Add bottle delegation**

Insert this choice between bottle retrieval and leave:

```ts
{
  ...contextualChoice(
    'delegate-carlitos',
    'Send Carlitos',
    featuredOutcome(
      'drifting-bottle.retrieve',
      1,
      'Carlitos recovers the message bottle.',
      effects(undefined, [gain('bottledPaper')]),
    ),
  ),
  companionAction: 'delegateCarlitos',
},
```

Rename the bottle `sleep` choice to `Let It Drift`.
Keep its `drifting-bottle.lost` outcome unchanged.

- [ ] **Step 5: Carry energy ownership into UI choices**

Set player retrieval choices to:

```ts
{ energyCost: minimum, energyOwner: 'player' }
```

Set Carlitos delegation choices from availability metadata:

```ts
{
  energyCost: companionAvailability.energyCost,
  energyOwner: 'carlitos',
}
```

Do not use player lightning copy for Carlitos costs.

- [ ] **Step 6: Run event and session tests**

Run:

```powershell
bunx vitest run tests/survivalEvents.test.ts tests/SurvivalSession.test.ts
```

Expected: all drifting item rule tests pass.

- [ ] **Step 7: Commit only Task 2 hunks**

Review and stage only Task 2 changes with `git add -p`.
Commit with:

```powershell
git commit -m "feat: unify drifting item choices"
```

---

### Task 3: Build the Drifting Item Focus UI

**Files:**
- Modify: `src/survival/BoatInteraction.ts`
- Modify: `src/ui/SurvivalUI.ts`
- Modify: `src/styles/main.css`
- Test: `tests/SurvivalUI.test.ts`

**Interfaces:**
- Extends: `BoatInteractionAnchor` with `eventFocusId?: DriftingItemEventId`.
- Produces: `DriftingItemFocusView` and `DriftingItemResultView`.
- Produces callbacks: `onDriftingItemSelect` and `onDriftingItemBack`.
- Produces methods: `showDriftingItemFocus`, `showDriftingItemReturn`, and `hideDriftingItemFocus`.
- Renames: drifting cargo result UI types and methods to drifting item names.

Use these exact view interfaces:

```ts
export interface DriftingItemFocusView {
  readonly eventId: DriftingItemEventId;
  readonly title: string;
  readonly choices: readonly EventContextChoice[];
}

export interface DriftingItemResultView {
  readonly caption: string;
  readonly title: string;
  readonly detail: string;
  readonly target: ProjectedBoatBounds | null;
}
```

Use these exact callbacks and methods:

```ts
onDriftingItemSelect: ((eventId: DriftingItemEventId) => void) | null;
onDriftingItemBack: (() => void) | null;
onDriftingItemContinue: (() => void) | null;
showDriftingItemFocus(view: DriftingItemFocusView): void;
showDriftingItemReturn(): void;
hideDriftingItemFocus(): void;
showDriftingItemResult(view: DriftingItemResultView): void;
hideDriftingItemResult(): void;
```

- [ ] **Step 1: Write failing initial-anchor and panel tests**

Add UI tests that render a drifting item anchor with:

```ts
{
  id: 'event:drifting-bottle',
  eventFocusId: 'drifting-bottle',
  tooltip: false,
  label: 'BOTTLE',
  description: 'A sealed bottle taps the hull.',
  itemType: null,
  toolId: null,
  action: null,
  remainingUses: null,
  x: 420,
  y: 260,
  visible: true,
  depleted: false,
  hitArea: { width: 64, height: 64, depth: 2 },
}
```

Assert no `.boat-tooltip` exists inside that button.
Click the button and expect `onDriftingItemSelect('drifting-bottle')`.

Call `showDriftingItemFocus` with player cost `1` and Carlitos cost `3`.
Assert the right-side panel shows both owners, costs, and unavailable reasons.
Assert focus moves to the first available choice.

Call `showDriftingItemReturn()`.
Assert choices hide and the arrow label becomes `Return to boat`.
Click the arrow and expect `onDriftingItemBack()` once.

- [ ] **Step 2: Run UI tests and verify failure**

Run:

```powershell
bunx vitest run tests/SurvivalUI.test.ts
```

Expected: missing focus callbacks, view methods, and focus panel elements.

- [ ] **Step 3: Add the focus layer markup**

Add a side dialog with this structure:

```html
<section class="drifting-item-focus" data-drifting-item-focus
  role="dialog" aria-modal="true" aria-hidden="true" inert>
  <button type="button" class="drifting-item-focus__back"
    data-drifting-item-back aria-label="Let it drift and return">
    <span aria-hidden="true">&#8592;</span>
  </button>
  <div class="drifting-item-focus__card">
    <p class="eyebrow ui-role-context">DRIFTING ITEM</p>
    <h2 class="ui-role-display" data-drifting-item-title></h2>
    <nav data-drifting-item-choices aria-label="Pickup choices"></nav>
  </div>
</section>
```

Place the card at the right screen edge.
Use the existing weathered event-choice button treatment.
Keep the center and selected item clear.

- [ ] **Step 4: Render focus choices and energy owners**

Render only `retrieve` and `delegate-carlitos` in this panel.
Use `PLAYER — 1 ENERGY`, `PLAYER — 3 ENERGY`, or `CARLITOS — 3 ENERGY`.
Append the exact unavailable reason inside `.event-choice__reason`.

Use the existing `activateEventChoice` path for enabled choice buttons.
Include focus panel buttons in `syncCommandState`, focus trapping, and click handling.

- [ ] **Step 5: Replace cargo-only result names**

Rename without aliases:

```ts
DriftingCargoResultView -> DriftingItemResultView
showDriftingCargoResult -> showDriftingItemResult
hideDriftingCargoResult -> hideDriftingItemResult
onDriftingCargoContinue -> onDriftingItemContinue
```

Update DOM data names and CSS class names from `drifting-cargo-result` to
`drifting-item-result`. Preserve the current uncommitted title and detail result layout.

- [ ] **Step 6: Run UI tests**

Run:

```powershell
bunx vitest run tests/SurvivalUI.test.ts
```

Expected: all anchor, panel, keyboard, result, and arrow tests pass.

- [ ] **Step 7: Commit only Task 3 hunks**

Use `git add -p` because `SurvivalUI.ts` and `main.css` already contain unrelated changes.
Commit with:

```powershell
git commit -m "feat: add drifting item focus panel"
```

---

### Task 4: Add the World Camera and Bow Pickup Target

**Files:**
- Modify: `src/survival/BoatWorld.ts`
- Modify: `src/survival/FeaturedEventPresentations.ts`
- Modify: `src/survival/DriftingCargoPresentation.ts`
- Modify: `src/survival/DriftingBottlePresentation.ts`
- Test: `tests/BoatWorld.test.ts`

**Interfaces:**
- Produces: `enterDriftingItemView(eventId: DriftingItemEventId): Promise<void>`.
- Produces: `exitDriftingItemView(): Promise<void>`.
- Produces: `retrieveDriftingItem(eventId: DriftingItemEventId): Promise<void>`.
- Produces: `delegateDriftingItem(eventId: DriftingItemEventId): Promise<void>`.
- Produces: `recedeDriftingItem(eventId: DriftingItemEventId): Promise<void>`.
- Produces: `projectDriftingItemResult(width: number, height: number): ProjectedBoatBounds | null`.
- Consumes: Task 2 drifting item key helpers.

- [ ] **Step 1: Write failing camera and pickup tests**

For each drifting item, stage the event and call `enterDriftingItemView`.
Advance the world by the existing camera duration.
Assert:

```ts
expect(camera.position).toEqual(expect.objectContaining(FISHING_PLAYER_SEAT));
expect(camera.getWorldDirection(direction).dot(directionToItem)).toBeGreaterThan(0.995);
```

Resolve retrieval and advance until settled.
Assert the result root is close to `drifting-item-bow-rest`.
Call `exitDriftingItemView`, advance again, and assert the captured base pose returns.

Also test repeated entry, repeated exit, document hiding, clear, and dispose.
Each active promise must settle exactly once.

- [ ] **Step 2: Run world tests and verify failure**

Run:

```powershell
bunx vitest run tests/BoatWorld.test.ts
```

Expected: drifting item view methods and bow rest do not exist.

- [ ] **Step 3: Replace the stern rest with a bow rest**

Rename the target field and scene name without an alias:

```ts
const DRIFTING_ITEM_BOW_REST = Object.freeze({ x: 0.72, y: 0.58, z: -2.52 });
private readonly driftingItemBowRest = new Object3D();
this.driftingItemBowRest.name = 'drifting-item-bow-rest';
this.driftingItemBowRest.position.set(
  DRIFTING_ITEM_BOW_REST.x,
  DRIFTING_ITEM_BOW_REST.y,
  DRIFTING_ITEM_BOW_REST.z,
);
```

Pass this target to both drifting cargo and bottle presentations.

- [ ] **Step 4: Add separate camera transition state**

Add a separate operation from fishing:

```ts
type DriftingItemCameraPhase = 'idle' | 'entering' | 'focused' | 'returning';
type DriftingItemCameraAnimation = TimedAnimation<'enter' | 'return'>;
```

Store start position, start quaternion, target quaternion, world target,
parent quaternion, look matrix, and animation state as reusable fields.

`enterDriftingItemView` must capture the current camera pose, set `entering`,
calculate the active item aim target, and animate toward `fishingCameraPosition`.
`exitDriftingItemView` must animate from the current pose to `baseCameraPosition`
and `baseCameraQuaternion`.

- [ ] **Step 5: Keep the selected item framed without allocation**

During `focused`, update the target quaternion from the presentation aim target.
Reuse the stored vectors, matrix, and quaternions.
Do not call `new`, `clone`, array methods, or object spread in the update path.

Advance camera focus after featured event motion updates.
This lets the camera follow floating and retrieval motion from the current frame.

- [ ] **Step 6: Replace cargo-only world methods**

Use shared keys:

```ts
retrieveDriftingItem(eventId) {
  return this.featuredEvents.react(eventId, driftingItemRetrieveKey(eventId));
}

recedeDriftingItem(eventId) {
  return this.featuredEvents.react(eventId, driftingItemLeaveKey(eventId));
}
```

`delegateDriftingItem` must run the current Carlitos motion with the same retrieve key.
`projectDriftingItemResult` must project the active presentation result root for every item.
Remove `retrieveDriftingCargo`, `delegateDriftingCargo`, `recedeDriftingCargo`,
`projectDriftingCargo`, and `activeDriftingCargoEventId` paths.

- [ ] **Step 7: Settle camera lifecycle paths**

`setDocumentHidden(true)` must finish the current camera transition at its destination.
`clearEvent` and `dispose` must cancel focus animation and restore the base pose.
Do not resolve or clear an event solely because the page became hidden.

- [ ] **Step 8: Run focused world tests**

Run:

```powershell
bunx vitest run tests/BoatWorld.test.ts
```

Expected: camera, bow target, item motion, and lifecycle tests pass.

- [ ] **Step 9: Commit only Task 4 hunks**

Use `git add -p` for all files with earlier worktree changes.
Commit with:

```powershell
git commit -m "feat: add drifting item bow view"
```

---

### Task 5: Orchestrate the End-to-End Focus Flow

**Files:**
- Modify: `src/survival/SurvivalPhase.ts`
- Modify: `src/ui/SurvivalUI.ts`
- Test: `tests/SurvivalPhase.test.ts`
- Test: `tests/SurvivalUI.test.ts`

**Interfaces:**
- Consumes: Tasks 1 through 4 domain, UI, event, and world interfaces.
- Produces: one focus lifecycle for barrel, chest, and bottle.
- Removes: the cargo-only phase resolver and completion path.

- [ ] **Step 1: Build a focused phase test rig**

Create a rig with controllable promises for:

```ts
enterDriftingItemView
exitDriftingItemView
retrieveDriftingItem
delegateDriftingItem
recedeDriftingItem
```

Capture calls to:

```ts
showDriftingItemFocus
showDriftingItemResult
showDriftingItemReturn
hideDriftingItemFocus
```

Use `initialEventId` cases for barrel, chest, and bottle.

- [ ] **Step 2: Write failing entry and choice tests**

Assert the reveal completes with no visible contextual choices.
Invoke `ui.onDriftingItemSelect?.(eventId)` twice.
Assert world entry starts once and the focus panel appears only after entry settles.

Assert player and Carlitos actions call session resolution once.
Assert failed resolution restores the same focus panel and clears busy state.

- [ ] **Step 3: Write failing leave and result tests**

Before pickup, invoke `ui.onDriftingItemBack?.()`.
Assert the phase resolves `sleep`, awaits recede, awaits camera exit, then clears the event.

After pickup, settle retrieval and assert the shared item result appears in the bow view.
Invoke Continue and assert the result closes while the camera stays focused.
Invoke Back and assert camera exit occurs before event cleanup.

- [ ] **Step 4: Run phase tests and verify failure**

Run:

```powershell
bunx vitest run tests/SurvivalPhase.test.ts
```

Expected: selection still resolves retrieval immediately and bottle uses the generic event path.

- [ ] **Step 5: Add explicit focus lifecycle state**

Add:

```ts
type DriftingItemFocusState =
  | 'idle'
  | 'entering'
  | 'choosing'
  | 'resolving'
  | 'result'
  | 'return-ready'
  | 'returning';
```

Replace `activeDriftingCargoEventId` with `activeDriftingItemEventId`.
Wire `onDriftingItemSelect`, `onDriftingItemBack`, and `onDriftingItemContinue`.
Use lifecycle generation checks after every awaited transition.

- [ ] **Step 6: Withhold choices until selection**

During drifting item reveal, call `setEventSelection` with no contextual choices.
Build the real choices with `contextualChoicesFor` and pass them to
`showDriftingItemFocus` only after camera entry succeeds.

Set the featured item anchor to `tooltip: false` and `eventFocusId`.
Do not attach `eventChoiceId` to that initial anchor.

- [ ] **Step 7: Replace the cargo-only resolver**

Route every `isDriftingItemEventId(eventId)` through `resolveDriftingItemChoice`.
For `retrieve` and `delegate-carlitos`, require `rewardSummary`, play the matching
world motion, and show `DriftingItemResultView` at the projected result root.

For `sleep`, play recede motion and then call the shared camera return.
Bottle must not enter `runEventResolution` for this focused flow.

- [ ] **Step 8: Keep pickup results at the bow**

`continueDriftingItemResult` must hide only the result panel.
It must set focus state to `return-ready`, show the return arrow, and clear busy state.
It must not clear the world event or release the bundle.

`returnFromDriftingItemView` must await camera exit before it clears presentation,
releases the event bundle, renders the snapshot, and restores command focus.

- [ ] **Step 9: Cover restart, disposal, and hidden-page behavior**

Add phase tests at `entering`, `resolving`, `result`, and `returning`.
Assert late promise completion does not change UI or session state after restart or dispose.
Assert hiding settles motion but does not create a second choice resolution.

- [ ] **Step 10: Run phase and UI tests**

Run:

```powershell
bunx vitest run tests/SurvivalPhase.test.ts tests/SurvivalUI.test.ts
```

Expected: all three drifting item flows pass.

- [ ] **Step 11: Commit only Task 5 hunks**

Use `git add -p` for the already-modified phase, UI, and tests.
Commit with:

```powershell
git commit -m "feat: focus drifting item interactions"
```

---

### Task 6: Remove Obsolete Paths and Verify the Feature

**Files:**
- Verify: `src/`
- Verify: `tests/`
- Verify: `docs/superpowers/specs/2026-08-18-drifting-item-focus-design.md`

**Interfaces:**
- Consumes: the completed feature from Tasks 1 through 5.
- Produces: no drifting-cargo-only runtime or UI API names.

- [ ] **Step 1: Scan for obsolete implementation names**

Run:

```powershell
rg -n "activeDriftingCargoEventId|resolveDriftingCargoChoice|finishDriftingCargoPresentation|continueDriftingCargoResult|retrieveDriftingCargo|delegateDriftingCargo|recedeDriftingCargo|projectDriftingCargo|DriftingCargoResultView|showDriftingCargoResult|hideDriftingCargoResult|onDriftingCargoContinue" src tests
```

Expected: no output.
`DriftingCargoPresentation`, `DriftingCargoKind`, and event IDs remain valid model names.

- [ ] **Step 2: Fix each obsolete API reference**

Rename each result to its drifting-item form.
Do not add aliases, fallback branches, or deprecated wrappers.

- [ ] **Step 3: Run focused verification**

Run:

```powershell
bunx vitest run tests/CarlitosState.test.ts tests/survivalEvents.test.ts tests/SurvivalSession.test.ts tests/SurvivalUI.test.ts tests/BoatWorld.test.ts tests/SurvivalPhase.test.ts
```

Expected: every focused test exits with code `0`.

- [ ] **Step 4: Run full verification**

Run:

```powershell
bun run typecheck
bun run test
bun run build
```

Expected: each command exits with code `0`.

- [ ] **Step 5: Review final workspace changes**

Run:

```powershell
git diff --check
git status --short
```

Confirm that unrelated pre-existing worktree changes remain present.
Confirm no `dist/` output or unrelated file is staged.
Confirm the visual result follows `VISUAL_STYLE_GUIDE.md`.

- [ ] **Step 6: Commit cleanup only when needed**

If Step 2 changed code, stage only those hunks with `git add -p` and commit:

```powershell
git commit -m "test: verify drifting item focus flow"
```

Do not create an empty commit when no cleanup was required.

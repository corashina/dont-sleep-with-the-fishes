# Fishing Presentation Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver smooth bow-view fishing with a forward-facing bow-tip rod, readable cast and reel animation, a dedicated acknowledged result dialog, and repeat attempts while energy remains.

**Architecture:** Preserve `FishingSession` as the deterministic per-attempt state machine. Add a private daytime-activity discriminator to `SurvivalSession`, let `SurvivalPhase` own result acknowledgement and sequence ordering, let `SurvivalUI` own the result modal and simple tooltip, and keep all camera/rod/line animation inside `BoatWorld`.

**Tech Stack:** TypeScript 5.9, Three.js 0.180, Vitest 3.2 with jsdom, Vite 7, Bun scripts.

## Global Constraints

- Each accepted fishing attempt costs exactly one energy and is legal with exactly one energy.
- Fishing may repeat until energy reaches zero, but cannot be mixed with another main daytime activity that day.
- Fishing never requests or opens a scheduled daytime event.
- The visible rod tooltip is exactly `Fishing rod`; richer availability copy remains accessible.
- Result order is `finishFishing < reel/miss animation < result dialog < Continue < camera return`.
- Normal camera travel lasts roughly 1 to 1.2 seconds; reduced motion retains a short fade between stable poses.
- Keep gameplay deterministic and renderer-independent; randomness remains injected.
- Reuse Three.js objects and scratch math state in update paths and dispose each owned resource exactly once.
- Preserve the unrelated working-tree modification in `tests/world.test.ts`; do not stage or rewrite it.

---

### Task 1: Repeatable fishing activity rules

**Files:**
- Modify: `src/survival/SurvivalSession.ts`
- Test: `tests/SurvivalSession.test.ts`

**Interfaces:**
- Consumes: existing `beginFishing()`, `finishFishing()`, `perform()`, `availableReason()`, `requestDayEvent()`, and `beginDawn()` contracts.
- Produces: private `dayActivity: 'none' | 'fishing' | 'other'`; repeatable `beginFishing()` while activity is `fishing`; rejection code `fishing-activity-chosen` for attempts to mix activity types; rejection code `fishing-day-event-disabled` for a direct day-event request after fishing.

- [ ] **Step 1: Write failing repeat and exclusivity tests**

Add these focused cases beside the current fishing-start tests:

```ts
it('allows repeated fishing through the final energy point', () => {
  const session = new SurvivalSession(saved(), {
    seed: 1,
    random: sequenceRandom([0, 0, 0, 0, 0, 0]),
    initial: { energy: 3 },
  });

  for (const expectedEnergy of [2, 1, 0]) {
    const attempt = beginFishing(session);
    const result = reelCatch(attempt);
    expect(session.finishFishing(attempt.snapshot().id, result).accepted).toBe(true);
    expect(session.snapshot().energy).toBe(expectedEnergy);
  }

  expect(session.beginFishing()).toMatchObject({
    accepted: false,
    outcome: { code: 'not-enough-energy' },
  });
});

it('does not mix fishing with another main daytime activity', () => {
  const afterOther = new SurvivalSession(saved('energyBar'), {
    seed: 1,
    initial: { energy: 1 },
  });
  expect(afterOther.perform('useEnergyBar').accepted).toBe(true);
  expect(afterOther.beginFishing()).toMatchObject({
    accepted: false,
    outcome: { code: 'fishing-activity-chosen' },
  });

  const afterFishing = new SurvivalSession(saved('cannedFood'), {
    seed: 1,
    random: sequenceRandom([0, 0]),
    initial: { energy: 2, hunger: 80 },
  });
  const attempt = beginFishing(afterFishing);
  expect(afterFishing.finishFishing(attempt.snapshot().id, reelCatch(attempt)).accepted).toBe(true);
  expect(afterFishing.perform('eat')).toMatchObject({
    accepted: false,
    code: 'fishing-activity-chosen',
  });
  expect(afterFishing.perform('endDay').accepted).toBe(true);
});

it('does not open a daytime event after fishing', () => {
  const session = new SurvivalSession(saved(), {
    seed: 1,
    random: sequenceRandom([0, 0]),
  });
  const attempt = beginFishing(session);
  session.finishFishing(attempt.snapshot().id, reelCatch(attempt));

  expect(session.requestDayEvent()).toMatchObject({
    accepted: false,
    code: 'fishing-day-event-disabled',
  });
  expect(session.snapshot()).toMatchObject({ state: 'day', pendingEventId: null });
});
```

- [ ] **Step 2: Run the focused tests and confirm the old one-action guard fails**

Run:

```text
bun run test -- tests/SurvivalSession.test.ts
```

Expected: the repeat test fails with `already-acted`, and the two new activity/event contracts fail.

- [ ] **Step 3: Implement the private daytime-activity discriminator**

Add near the existing session fields:

```ts
type DayActivity = 'none' | 'fishing' | 'other';

private dayActivity: DayActivity = 'none';
```

In `beginFishing()`, replace the `actedToday` rejection with:

```ts
} else if (this.dayActivity === 'other') {
  rejection = this.reject(
    'fishing-activity-chosen',
    'Another daytime activity has already been chosen.',
  );
```

After the accepted energy commit, keep `actedToday = true` and add:

```ts
this.dayActivity = 'fishing';
```

At the start of `unavailable()` after the daytime-state check, add:

```ts
if (action !== 'fish' && action !== 'endDay' && this.dayActivity === 'fishing') {
  return {
    code: 'fishing-activity-chosen',
    message: 'Fishing is today\'s chosen activity.',
  };
}
```

In the `fish` case, reject only `dayActivity === 'other'`, not `actedToday`:

```ts
if (this.dayActivity === 'other') {
  return {
    code: 'fishing-activity-chosen',
    message: 'Another daytime activity has already been chosen.',
  };
}
```

After a successful non-`endDay` action in `perform()`, record:

```ts
if (action !== 'endDay') this.dayActivity = 'other';
this.actedToday = true;
```

Guard `requestDayEvent()` before drawing an event:

```ts
if (this.dayActivity === 'fishing') {
  return this.reject(
    'fishing-day-event-disabled',
    'Fishing results replace today\'s daytime event.',
  );
}
```

Reset the discriminator next to `actedToday = false` during dawn:

```ts
this.dayActivity = 'none';
```

- [ ] **Step 4: Update incompatible existing expectations and rerun**

Change the existing invalid-start expectation from `already-acted` to
`fishing-activity-chosen`. Replace the old test that opens a day event after a
fishing result with an ordinary accepted action before `requestDayEvent()`.

Run:

```text
bun run test -- tests/SurvivalSession.test.ts
```

Expected: all `SurvivalSession` tests pass.

- [ ] **Step 5: Commit the gameplay rule**

```text
git add -- src/survival/SurvivalSession.ts tests/SurvivalSession.test.ts
git commit -m "feat: allow repeat fishing activity"
```

---

### Task 2: Simple tooltip and dedicated result dialog

**Files:**
- Modify: `src/ui/SurvivalUI.ts`
- Modify: `src/styles/main.css`
- Test: `tests/SurvivalUI.test.ts`

**Interfaces:**
- Consumes: existing fishing modal/focus infrastructure and `BoatInteractionAnchor` tooltip rendering.
- Produces: exported `FishingResultView`, `onFishingResultContinue`, `showFishingResult(view)`, and `hideFishingResult()`.

- [ ] **Step 1: Write failing tooltip and dialog tests**

Add UI tests that assert exact visible copy and acknowledgement behavior:

```ts
it('shows only the simple fishing rod tooltip while preserving accessible detail', () => {
  const ui = createUi();
  ui.render(snapshot(), () => null);
  ui.setAnchors([fishingAnchor]);

  const button = mount.querySelector<HTMLButtonElement>('[data-tool="fishingRod"]')!;
  expect(button.querySelector('[role="tooltip"]')?.textContent).toBe('Fishing rod');
  expect(button.getAttribute('aria-description')).toContain('1 ENERGY');
  ui.dispose();
});

it('shows a modal fishing result and emits one Continue intent', () => {
  const ui = createUi();
  const onContinue = vi.fn();
  ui.onFishingResultContinue = onContinue;

  ui.showFishingResult({ title: 'COD', detail: '+1 FOOD' });

  const dialog = mount.querySelector<HTMLElement>('[data-fishing-result]')!;
  expect(dialog.classList.contains('is-visible')).toBe(true);
  expect(dialog.querySelector('[data-fishing-result-title]')?.textContent).toBe('COD');
  expect(dialog.querySelector('[data-fishing-result-detail]')?.textContent).toBe('+1 FOOD');
  const button = dialog.querySelector<HTMLButtonElement>('[data-fishing-result-continue]')!;
  expect(document.activeElement).toBe(button);
  button.click();
  button.click();
  expect(onContinue).toHaveBeenCalledOnce();

  ui.hideFishingResult();
  expect(dialog.classList.contains('is-visible')).toBe(false);
  ui.dispose();
});
```

- [ ] **Step 2: Run the UI tests and verify missing dialog APIs**

Run:

```text
bun run test -- tests/SurvivalUI.test.ts
```

Expected: failure because the result view and callbacks do not exist and the tooltip contains action detail.

- [ ] **Step 3: Add result view markup, state, and public methods**

Export the view type beside `FishingUiState`:

```ts
export interface FishingResultView {
  readonly title: string;
  readonly detail: string;
}
```

Add the callback and owned elements:

```ts
onFishingResultContinue: (() => void) | null = null;

private readonly fishingResultLayer: HTMLElement;
private readonly fishingResultTitle: HTMLElement;
private readonly fishingResultDetail: HTMLElement;
private readonly fishingResultContinue: HTMLButtonElement;
private fishingResultContinueIssued = false;
```

Add this markup after the fishing fade:

```html
<section class="survival-overlay fishing-result-overlay cinematic-overlay"
  data-fishing-result role="dialog" aria-modal="true"
  aria-hidden="true" aria-labelledby="fishing-result-title" inert>
  <div class="cinematic-overlay__content fishing-result-card">
    <p class="eyebrow">FISHING RESULT</p>
    <h2 id="fishing-result-title" data-fishing-result-title></h2>
    <p class="fishing-result-detail" data-fishing-result-detail></p>
    <button type="button" class="primary-action timber-action"
      data-fishing-result-continue>CONTINUE</button>
  </div>
</section>
```

Resolve the four elements in the constructor and place `fishingResultLayer`
before `fishingLayer` in `modalLayers`, because `topmostModal()` returns the
first visible entry.

Add:

```ts
showFishingResult(view: FishingResultView): void {
  if (this.disposed) return;
  this.fishingResultContinueIssued = false;
  this.fishingResultTitle.textContent = view.title;
  this.fishingResultDetail.textContent = view.detail;
  this.showLayer(this.fishingResultLayer);
  this.fishingResultContinue.focus();
}

hideFishingResult(): void {
  if (this.disposed) return;
  this.hideLayer(this.fishingResultLayer);
}
```

Handle `[data-fishing-result-continue]` before generic command routing:

```ts
if (target.closest('[data-fishing-result-continue]') !== null) {
  if (this.fishingResultContinueIssued) return;
  this.fishingResultContinueIssued = true;
  this.onFishingResultContinue?.();
  return;
}
```

Clear `onFishingResultContinue` during disposal and teach `focusModal()` to
focus the Continue button for this layer.

- [ ] **Step 4: Split visible fishing tooltip copy from accessibility copy**

Keep the existing full `text` construction, then use:

```ts
const visibleText = anchor.toolId === 'fishingRod' ? 'Fishing rod' : text;
requireElement<HTMLElement>(button, '[role="tooltip"]').textContent = visibleText;
button.setAttribute('aria-label', anchor.toolId === 'fishingRod' ? 'Fishing rod' : text);
button.setAttribute('aria-description', text);
```

- [ ] **Step 5: Style the result without adding new animation machinery**

Add to `src/styles/main.css` near the fishing styles:

```css
.fishing-result-card { text-align: center; }
.fishing-result-detail {
  color: var(--ink-bone);
  font-family: Impact, 'Arial Black', sans-serif;
  font-size: clamp(1rem, 2vw, 1.35rem);
  letter-spacing: .08em;
  text-transform: uppercase;
}
```

- [ ] **Step 6: Run UI tests and commit**

Run:

```text
bun run test -- tests/SurvivalUI.test.ts
```

Expected: all `SurvivalUI` tests pass.

Commit:

```text
git add -- src/ui/SurvivalUI.ts src/styles/main.css tests/SurvivalUI.test.ts
git commit -m "feat: add fishing result dialog"
```

---

### Task 3: Result-first phase sequencing without daytime events

**Files:**
- Modify: `src/survival/SurvivalPhase.ts`
- Test: `tests/SurvivalPhase.test.ts`
- Test: `tests/SurvivalPhaseFocus.test.ts`

**Interfaces:**
- Consumes: Task 2's `FishingResultView`, `showFishingResult()`, `hideFishingResult()`, and `onFishingResultContinue`.
- Produces: guarded result acknowledgement and `formatFishingResult(result, outcome): FishingResultView` inside `SurvivalPhase.ts`.

- [ ] **Step 1: Rewrite the success-order test to require acknowledgement**

Extend the fishing rig with:

```ts
showFishingResult: vi.fn((view: FishingResultView) => {
  calls.push(`result:${view.title}:${view.detail}`);
}),
hideFishingResult: vi.fn(() => calls.push('hideFishingResult')),
```

Then assert this sequence for a landed cod:

```ts
expect(rig.calls).not.toContain('result:COD:+1 FOOD');
rig.animations.reel.at(-1)!.resolve();
await flushPromises();
expect(rig.calls).toContain('result:COD:+1 FOOD');
expect(rig.world.exitFishingView).not.toHaveBeenCalled();
expect(rig.session.requestDayEvent).not.toHaveBeenCalled();

rig.ui.onFishingResultContinue?.();
expect(rig.calls.indexOf('playFishingReel:cod'))
  .toBeLessThan(rig.calls.indexOf('result:COD:+1 FOOD'));
expect(rig.calls.indexOf('result:COD:+1 FOOD'))
  .toBeLessThan(rig.calls.indexOf('exitFishingView'));
```

Add table cases for `TUNA / +2 FOOD - 1 BAIT USED`,
`PLASTIC BOTTLE / NO FOOD`, and `IT GOT AWAY / NO CATCH`. Assert duplicate
Continue calls issue only one camera return.

- [ ] **Step 2: Run phase tests and confirm they expose the old ordering**

Run:

```text
bun run test -- tests/SurvivalPhase.test.ts tests/SurvivalPhaseFocus.test.ts
```

Expected: failures because the current phase exposes result copy before reeling, returns automatically, and requests a day event.

- [ ] **Step 3: Add result formatting and callback wiring**

Import `FishingResultView` and add:

```ts
function formatFishingResult(
  result: FishingTerminalResult,
  outcome: ActionOutcome,
): FishingResultView {
  if (result.kind === 'miss') {
    return { title: 'IT GOT AWAY', detail: 'NO CATCH' };
  }
  if (result.catch.kind === 'junk') {
    return { title: result.catch.label.toLocaleUpperCase('en-US'), detail: 'NO FOOD' };
  }
  const bait = outcome.deltas.bait === -1 ? ' - 1 BAIT USED' : '';
  return {
    title: result.catch.label.toLocaleUpperCase('en-US'),
    detail: `+${result.catch.food} FOOD${bait}`,
  };
}
```

During UI initialization, assign:

```ts
this.ui.onFishingResultContinue = () => this.continueFishingResult();
```

- [ ] **Step 4: Sequence animation, dialog, acknowledgement, and return**

Remove `fishingDayEventPending`. In `settleFishing()`, after the accepted commit,
keep the UI non-actionable while presentation runs:

```ts
this.fishingPresentation = 'settling';
this.ui.setFishingState?.({
  mode: 'waiting',
  message: result.kind === 'catch' ? 'REELING IN' : 'THE LINE WENT SLACK',
  biteTarget: null,
});
void this.presentFishingResult(attempt, result, outcome, generation);
```

After awaiting `playFishingReel()` or `playFishingMiss()`, stop at the dialog:

```ts
if (!this.isCurrentFishing(attempt, generation)) return;
this.fishingPresentation = 'result';
this.ui.setFishingState?.({ mode: 'result', message: '', biteTarget: null });
this.ui.showFishingResult?.(formatFishingResult(result, outcome));
```

Add the guarded continuation:

```ts
private continueFishingResult(): void {
  const attempt = this.activeFishing;
  const generation = this.lifecycleGeneration;
  if (attempt === null || this.fishingPresentation !== 'result') return;
  this.fishingPresentation = 'returning';
  this.ui.hideFishingResult?.();
  void this.returnFromFishing(attempt, generation);
}

private async returnFromFishing(
  attempt: FishingSession,
  generation: number,
): Promise<void> {
  if (!await this.transitionFishingView('exit', generation)) return;
  if (!this.isCurrentFishing(attempt, generation)) return;
  this.completeFishingPresentation(generation);
}
```

Simplify `completeFishingPresentation()` to unlock, hide fishing UI, clear
world presentation, and stop. Delete `openPostFishingDayEvent()` and all
fishing-specific day-event scheduling.

Ensure disposal hides the result dialog, nulls the new callback, and cannot
start a return after lifecycle generation changes.

- [ ] **Step 5: Update focus/lifecycle tests and rerun**

Update successful and missed paths in both phase test files to resolve reel or
miss, invoke `onFishingResultContinue`, resolve the return animation, and then
assert focus/input unlock. Assert `requestDayEvent` remains at zero calls.

Run:

```text
bun run test -- tests/SurvivalPhase.test.ts tests/SurvivalPhaseFocus.test.ts
```

Expected: all focused phase tests pass.

- [ ] **Step 6: Commit the orchestration change**

```text
git add -- src/survival/SurvivalPhase.ts tests/SurvivalPhase.test.ts tests/SurvivalPhaseFocus.test.ts
git commit -m "feat: sequence fishing results before camera return"
```

---

### Task 4: Bow rod, camera track, cast, and reel polish

**Files:**
- Modify: `src/survival/BoatWorld.ts`
- Test: `tests/BoatWorld.test.ts`

**Interfaces:**
- Consumes: existing `enterFishingView()`, `playFishingCast()`, `playFishingReel()`, `playFishingMiss()`, and `exitFishingView()` phase-facing methods.
- Produces: named `fishing-rod-pivot` transform, eased 1.1-second camera endpoints, forward rod articulation, and visible bobber/catch travel without changing public world APIs.

- [ ] **Step 1: Add failing authored-transform and animation tests**

Add tests with these assertions:

```ts
const pivot = world.scene.getObjectByName('fishing-rod-pivot')!;
const rod = world.scene.getObjectByName('lifeboat-equipment:fishingRod')!;
expect(pivot.position.z).toBeLessThan(-2);
expect(rod.position.z).toBeLessThan(0);
const tip = world.scene.getObjectByName('fishing-line-origin')!;
expect(tip.getWorldPosition(new Vector3()).z)
  .toBeLessThan(pivot.getWorldPosition(new Vector3()).z);
```

Strengthen the camera test so entry does not mutate a normal-motion camera
until an update, a 16 ms frame stays near the starting pose, the midpoint lies
strictly between endpoints, and the final pose places the camera farther toward
the bow than the old `z = -0.72` pose:

```ts
const entering = world.enterFishingView();
expect(camera.position.toArray()).toEqual(normalPosition.toArray());
world.update(0.016, 0.016);
expect(camera.position.distanceTo(normalPosition)).toBeLessThan(0.1);
world.update(0.55, 0.534);
const midpoint = camera.position.clone();
world.update(1.1, 0.55);
await entering;
expect(midpoint.distanceTo(normalPosition)).toBeGreaterThan(0.1);
expect(midpoint.distanceTo(camera.position)).toBeGreaterThan(0.1);
expect(camera.position.z).toBeLessThan(-1.2);
```

For casting, capture bobber positions at 25%, 50%, and 100%, assert the middle
height exceeds both endpoints, assert the rod pivot changes during the throw,
and assert splash is hidden before landing and visible only near landing.

For reeling, assert the catch display moves horizontally toward the rod tip as
well as upward, and remains visible at the bow until `exitFishingView()`.

- [ ] **Step 2: Run the world tests and confirm authored presentation failures**

Run:

```text
bun run test -- tests/BoatWorld.test.ts
```

Expected: failures for missing pivot, old camera endpoint, rod-root rotation,
and catch movement that is vertical-only.

- [ ] **Step 3: Introduce the rod pivot and forward authored transform**

Add an owned group and baseline rotation:

```ts
private readonly rodPivot = new Group();
private readonly baseRodPivotRotationX: number;
```

Replace direct boat attachment with:

```ts
this.rodPivot.name = 'fishing-rod-pivot';
this.rodPivot.position.set(0.62, 0.56, -2.28);
this.rod = propModels.createEquipment('fishingRod');
this.rod.position.set(0, 0, -0.9);
this.rod.rotation.x = -Math.PI / 2;
this.fishingLineOrigin.name = 'fishing-line-origin';
this.fishingLineOrigin.position.set(0, 0.9, 0);
this.rod.add(this.fishingLineOrigin);
this.rodPivot.add(this.rod);
this.boat.add(this.rodPivot);
this.baseRodPivotRotationX = this.rodPivot.rotation.x;
```

Project interaction bounds from `rodPivot`, and reset/animate
`rodPivot.rotation.x` rather than `rod.rotation.z`.

- [ ] **Step 4: Move and ease the camera endpoints**

Use these authored values as the first browser-verification pass:

```ts
const FISHING_CAMERA_DURATION = 1.1;
private readonly bowCameraPosition = new Vector3(0, 1.22, -1.62);
private readonly bowCameraLookTarget = new Vector3(0, -0.38, -5.65);
```

Replace cubic smoothstep with a quintic smootherstep for camera tracks:

```ts
const smootherStep = (value: number): number =>
  value * value * value * (value * (value * 6 - 15) + 10);
```

Use `smootherStep(normalized)` for entry and return. Continue capturing the
actual current camera pose at the start of each track and preserve the reduced-
motion endpoint behavior.

- [ ] **Step 5: Author a staged cast and spatial reel**

For normal-motion casting, rotate the pivot through draw-back and follow-through:

```ts
const drawBack = normalized < 0.28
  ? easeInOut(normalized / 0.28) * 0.42
  : (1 - easeOut((normalized - 0.28) / 0.72)) * 0.42
    - Math.sin(Math.PI * (normalized - 0.28) / 0.72) * 0.5;
this.rodPivot.rotation.x = this.baseRodPivotRotationX + drawBack;
this.fishing.splash.visible = normalized >= 0.9 && normalized < 1;
```

Keep the existing no-allocation line interpolation, but use the raw eased cast
progress for horizontal travel and a `sin(pi * progress) * 1.35` vertical arc.
Do not let `updateFishingWave()` overwrite the in-flight bobber after
`updateFishingLine()` has placed it.

For reeling, interpolate `catchDisplay.position` from the stored cast position
toward the current line origin:

```ts
this.activeFishingCatch.position.set(0, 0, 0);
this.fishing.catchDisplay.position.lerpVectors(
  this.fishingCastPosition,
  this.fishingLineOriginWorld,
  eased * 0.82,
);
this.fishing.catchDisplay.position.y += Math.sin(Math.PI * eased) * 0.45;
```

Use reusable vectors already owned by `BoatWorld`; do not allocate a vector in
the frame loop. Keep reduced-motion pivot travel and catch swing minimal.

- [ ] **Step 6: Run world tests and inspect resource/lifecycle coverage**

Run:

```text
bun run test -- tests/BoatWorld.test.ts
```

Expected: all world tests pass, including existing pooling, wave-field,
reduced-motion, cancellation, and disposal tests.

- [ ] **Step 7: Commit the world presentation**

```text
git add -- src/survival/BoatWorld.ts tests/BoatWorld.test.ts
git commit -m "feat: polish fishing camera and rod animation"
```

---

### Task 5: Integrated regression and browser tuning

**Files:**
- Modify only if browser evidence requires numeric transform changes:
  `src/survival/BoatWorld.ts`
- Modify matching authored-value assertions if tuned:
  `tests/BoatWorld.test.ts`

**Interfaces:**
- Consumes: all Task 1-4 behavior.
- Produces: verified desktop framing and a clean, buildable branch.

- [ ] **Step 1: Run the focused fishing suite together**

Run:

```text
bun run test -- tests/FishingSession.test.ts tests/fishingCatalog.test.ts tests/SurvivalSession.test.ts tests/SurvivalUI.test.ts tests/SurvivalPhase.test.ts tests/SurvivalPhaseFocus.test.ts tests/BoatWorld.test.ts
```

Expected: all focused suites pass with no unhandled promise rejections.

- [ ] **Step 2: Run the complete automated verification**

Run:

```text
bun run test
bun run typecheck
bun run models:check
bun run build
```

Expected: all tests pass, TypeScript reports no errors, item/furniture model
budgets pass, and Vite produces the production bundle. The existing bundle-size
warning is informational unless its size materially increases.

- [ ] **Step 3: Start the local preview and inspect both desktop sizes**

Run:

```text
bun run dev -- --host 127.0.0.1 --port 4174
```

At 1280x720 and 1920x1080 verify:

- entry and return visibly ease with no first-frame snap;
- the rod handle is at the bow and its tip points over the water;
- the tooltip reads only `Fishing rod`;
- click and keyboard casts show draw-back, bobber arc, line extension, and landing splash;
- the centered target lies beyond the boat rim;
- bubbles are clickable and focusable;
- fish, junk, bait use, and miss each animate before their result dialog;
- the camera remains at the bow until Continue;
- Continue returns smoothly and the rod is usable again at one remaining energy;
- no `Quiet Waters` event appears;
- reduced-motion mode uses the fade and stable endpoints.

- [ ] **Step 4: Tune only authored transforms if visual evidence requires it**

If the rod or framing misses the acceptance criteria, adjust only
`rodPivot.position`, `rod.position`, `rod.rotation`, `bowCameraPosition`, or
`bowCameraLookTarget`, then update the exact matching assertions in
`tests/BoatWorld.test.ts`. Repeat the focused world and phase suites after each
numeric change.

- [ ] **Step 5: Stop the server, verify scope, and commit any tuning**

Confirm `git status --short` contains the known unrelated
`tests/world.test.ts` modification plus only intentional fishing files. If Task
5 produced transform changes, commit only these two paths:

```text
git add -- src/survival/BoatWorld.ts tests/BoatWorld.test.ts
git commit -m "fix: tune fishing bow presentation"
```

If no tuning was needed, do not create an empty commit.

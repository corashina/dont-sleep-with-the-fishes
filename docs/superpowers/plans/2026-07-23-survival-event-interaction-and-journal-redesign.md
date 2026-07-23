# Survival Event Interaction and Journal Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the survival response dialog with scene-led physical item selection, add exact-instance event resolution, improve the sleep transition, and restyle the journal after the approved reference composition.

**Architecture:** `SurvivalSession` owns event validation and deterministic mutations. `SurvivalPhase` owns the asynchronous sleep, reveal, choose, use, resolve, and dawn sequence. `SurvivalUI` owns captions and anchor interaction state. `BoatWorld` owns model materials, reveal cues, and item animation.

**Tech Stack:** TypeScript 5.9, Three.js 0.180, DOM/CSS, Vitest 3.2, Vite 7, Bun scripts.

## Global Constraints

- Keep gameplay rules deterministic and renderer-free.
- Keep phase lifecycle, rules, input, UI, rendering, and world construction in separate modules.
- Dispose each Three.js resource once.
- Allocate no materials, geometries, vectors, or collections in frame update and render paths.
- Keep desktop keyboard and mouse support.
- Honor `prefers-reduced-motion`.
- Add no saves, touch controls, crewmates, multiplayer, progression, models, downloaded artwork, or event rebalance.
- Preserve event weights, outcomes, cooldowns, resource effects, journal facts, and the 25 percent quiet-night chance.

---

## File Map

- `src/survival/survivalTypes.ts`: typed event response and authored reveal copy.
- `src/survival/events.ts`: reveal sentences and catalog validation.
- `src/survival/journal.ts`: supported journal resolution variants.
- `src/survival/inventory.ts`: exact-instance-first consumption helper.
- `src/survival/SurvivalSession.ts`: response validation and exact-instance mutation.
- `src/ui/SurvivalUI.ts`: scene captions, conditional Endure, event anchor states, and name-only item tooltips.
- `src/survival/BoatWorld.ts`: muted materials, eligibility, reveal presentation, and item-use animation.
- `src/survival/SurvivalPhase.ts`: presentation state and asynchronous sequencing.
- `src/styles/main.css`: event and journal presentation.
- `tests/survivalEvents.test.ts`, `tests/SurvivalSession.test.ts`, `tests/survivalJournal.test.ts`: rule coverage.
- `tests/SurvivalUI.test.ts`, `tests/SurvivalPhase.test.ts`, `tests/SurvivalPhaseFocus.test.ts`, `tests/world.test.ts`: presentation and lifecycle coverage.

---

### Task 1: Event Reveal Copy and Response Types

**Files:**
- Modify: `src/survival/survivalTypes.ts`
- Modify: `src/survival/events.ts`
- Test: `tests/survivalEvents.test.ts`

**Interfaces:**
- Produces: `EventResponse`, `SurvivalEventDefinition.revealText`.
- Consumes: existing `EventResponseId`, `ItemInstanceId`, event catalog helpers.

- [ ] **Step 1: Add failing catalog tests**

Add an exact reveal-copy map and validation cases:

```ts
const REVEAL_TEXT = {
  'dangerous-waters': 'Jagged rocks break the surface as the current pulls the boat off course.',
  leak: 'Water pushes through a split in the hull.',
  'school-of-fish': 'A dense school churns the water beside the boat.',
  snatcher: 'Something reaches over the gunwale and grabs one of your supplies.',
  'death-stare': 'A huge shape rises and fixes its gaze on the boat.',
  'swarm-of-anglerfish': 'Cold lights gather beneath the surface and close in.',
  whirlpool: 'The sea begins circling faster around the boat.',
  'shark-men': 'Figures cut through the water and surround the hull.',
  'shower-night': 'Rain starts falling over the exposed boat.',
  'windy-night': 'Wind catches every loose object on the boat.',
  'bad-sleep': 'Uneasy darkness settles over the boat.',
  thunderstorm: 'Thunder rolls as the storm breaks overhead.',
  'restless-waves': 'Waves hammer the sides through the night.',
  'man-in-the-fog': 'A lone figure appears in the fog.',
  ghosts: 'Pale shapes gather around the drifting boat.',
  'eerie-melody': 'A distant melody drifts across the water.',
  'face-on-the-moon': 'A face takes shape across the moon.',
} as const;

expect(Object.fromEntries(SURVIVAL_EVENTS.map(({ id, revealText }) => [id, revealText])))
  .toEqual(REVEAL_TEXT);

expect(() => validateSurvivalEventCatalog([{
  ...SURVIVAL_EVENTS[0]!,
  revealText: ' ',
}])).toThrow(/reveal text is blank/i);
```

- [ ] **Step 2: Run the focused test and confirm failure**

Run: `bunx vitest run tests/survivalEvents.test.ts`

Expected: FAIL because `revealText` does not exist and the validator accepts blank copy.

- [ ] **Step 3: Add the types and authored copy**

Replace the unused legacy `EventResponse` interface:

```ts
export type EventResponse =
  | {
      readonly kind: 'item';
      readonly choiceId: EventResponseId;
      readonly instanceId: ItemInstanceId;
    }
  | { readonly kind: 'endure' };
```

Add `readonly revealText: string` to `SurvivalEventDefinition`. Change the helper signature to:

```ts
function event(
  id: IncludedEventId,
  title: string,
  revealText: string,
  cue: PresentationCue,
  weight: number,
  earliestDay: number,
  cooldownDays: number,
  choices: [EventChoiceDefinition, ...EventChoiceDefinition[]],
  latestDay?: number,
): SurvivalEventDefinition
```

Pass the exact strings from the test, add calm fallback sentences, and reject blank text:

```ts
if (typeof eventEntry.revealText !== 'string' || eventEntry.revealText.trim().length === 0) {
  throw new Error(`${eventEntry.id} reveal text is blank`);
}
```

- [ ] **Step 4: Run the focused tests**

Run: `bunx vitest run tests/survivalEvents.test.ts tests/eventParityAudit.test.ts`

Expected: PASS with unchanged parity data outside `revealText`.

- [ ] **Step 5: Commit**

```bash
git add src/survival/survivalTypes.ts src/survival/events.ts tests/survivalEvents.test.ts
git commit -m "feat: author survival event reveals"
```

### Task 2: Exact-Instance Event Resolution

**Files:**
- Modify: `src/survival/journal.ts`
- Modify: `src/survival/inventory.ts`
- Modify: `src/survival/SurvivalSession.ts`
- Test: `tests/SurvivalSession.test.ts`
- Test: `tests/survivalJournal.test.ts`

**Interfaces:**
- Consumes: `EventResponse` from Task 1.
- Produces: `SurvivalSession.resolveEvent(response: EventResponse): ActionOutcome`.
- Produces: `SurvivalInventoryState.consumePreferred(type, quantity, preferredInstanceId, excludedIds)`.

- [ ] **Step 1: Add failing exact-instance and Endure tests**

Use duplicate instances and assert the clicked one mutates:

```ts
const session = new SurvivalSession(saved('bucket', 'bucket'), {
  seed: 25,
  random: sequenceRandom([0]),
  initialEventId: 'leak',
});

expect(session.resolveEvent({
  kind: 'item',
  choiceId: 'bucket',
  instanceId: 'bucket-2',
})).toMatchObject({ accepted: true, cue: 'none' });
expect(session.snapshot().inventory['bucket-1']?.condition).toBe('usable');
expect(session.snapshot().inventory['bucket-2']?.condition).toBe('broken');
```

Add rejected missing, mismatched, broken, consumed, lost, and stale instances. Assert the snapshot and injected random source do not advance. Add:

```ts
expect(session.resolveEvent({ kind: 'endure' })).toMatchObject({
  accepted: false,
  code: 'endure-unavailable',
});
```

for an event with a usable suitable item, plus acceptance when none exists.

- [ ] **Step 2: Run the tests and confirm failure**

Run: `bunx vitest run tests/SurvivalSession.test.ts tests/survivalJournal.test.ts`

Expected: FAIL because `resolveEvent` accepts `string | null`, unsuitable attempts remain valid, and mutations choose the first instance.

- [ ] **Step 3: Implement exact-instance inventory preference**

Add:

```ts
consumePreferred(
  type: ItemId,
  quantity: number,
  preferredInstanceId: ItemInstanceId | null,
  excludedInstanceIds: ReadonlySet<ItemInstanceId> = new Set(),
): ItemInstanceId[] {
  const consumed: ItemInstanceId[] = [];
  if (preferredInstanceId !== null) {
    const preferred = this.items.get(preferredInstanceId);
    if (
      preferred?.type === type
      && !excludedInstanceIds.has(preferredInstanceId)
      && this.consumeInstance(preferredInstanceId)
    ) consumed.push(preferredInstanceId);
  }
  const remaining = Math.max(0, quantity - consumed.length);
  if (remaining === 0) return consumed;
  const exclusions = new Set(excludedInstanceIds);
  consumed.forEach((id) => exclusions.add(id));
  return [...consumed, ...this.consume(type, remaining, exclusions)];
}
```

- [ ] **Step 4: Implement typed session validation**

Change `resolveEvent` to accept `EventResponse`. Resolve the itemless choice for Endure and reject Endure when `eligibleEventResponses()` finds a usable suitable instance. For item responses, validate the choice and snapshot instance before drawing an outcome:

```ts
const choice = response.kind === 'endure'
  ? event.choices.find(({ itemId }) => itemId === undefined)
  : event.choices.find(({ id }) => id === response.choiceId);

if (choice === undefined) return this.reject('choice-unavailable', 'That response is not available.');
if (response.kind === 'item') {
  const instance = this.inventory.snapshot()[response.instanceId];
  if (choice.itemId === undefined || instance?.type !== choice.itemId || instance.condition !== 'usable') {
    return this.reject('item-unavailable', 'That item cannot handle this event.');
  }
}
```

Pass the selected instance into item-specific mutation and recovered Food/Bait consumption. Prefer that instance when the mutation type matches. Return `none` for accepted nonterminal event outcomes and terminal cues for terminal states. Remove `unsuitableItem` from `JournalResolution` and update journal fixtures.

- [ ] **Step 5: Update existing response callers in rule tests**

Replace `resolveEvent(null)` with `resolveEvent({ kind: 'endure' })`. Replace item strings with typed item responses using the saved instance ID. Delete unsuitable-item expectations and assert rejection without mutation.

- [ ] **Step 6: Run the focused tests**

Run: `bunx vitest run tests/SurvivalSession.test.ts tests/survivalJournal.test.ts tests/eventResolver.test.ts`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/survival/journal.ts src/survival/inventory.ts src/survival/SurvivalSession.ts tests/SurvivalSession.test.ts tests/survivalJournal.test.ts
git commit -m "feat: resolve events with physical item instances"
```

### Task 3: Scene Caption and Event-Aware Item Anchors

**Files:**
- Modify: `src/ui/SurvivalUI.ts`
- Modify: `src/styles/main.css`
- Test: `tests/SurvivalUI.test.ts`

**Interfaces:**
- Produces: `showEventReveal(event): Promise<void>`.
- Produces: `setEventSelection(eligible: ReadonlyMap<ItemInstanceId, EventResponseId>): void`.
- Produces: `setEventUsing(instanceId: ItemInstanceId): void`.
- Produces: `clearEventPresentation(): void`.
- Produces callbacks `onEventItem(choiceId, instanceId)` and `onEndure()`.

- [ ] **Step 1: Replace dialog tests with failing scene-selection tests**

Assert the event modal and generated response buttons are absent. Render anchors, call selection methods, and verify:

```ts
expect(mount.querySelector('[data-event]')).toBeNull();
expect(mount.querySelector('[data-event-caption]')).not.toBeNull();

ui.setEventSelection(new Map([['bucket-1', 'bucket']]));
expect(bucket.dataset.eventState).toBe('eligible');
expect(bucket.getAttribute('aria-disabled')).toBe('false');
expect(anchor.querySelector('[role="tooltip"]')?.textContent).toBe('Bucket');
expect(umbrella.dataset.eventState).toBe('muted');
expect(umbrella.disabled).toBe(false);
expect(umbrella.getAttribute('aria-disabled')).toBe('true');
```

Click the eligible anchor and assert both IDs. Verify muted activation has no callback. Verify Endure stays hidden with eligibility and appears for an empty map.

- [ ] **Step 2: Run the UI test and confirm failure**

Run: `bunx vitest run tests/SurvivalUI.test.ts`

Expected: FAIL because the event modal still exists and item anchors route day actions.

- [ ] **Step 3: Replace event modal markup**

Add:

```html
<section class="event-caption" data-event-caption aria-hidden="true">
  <p class="event-caption__danger" data-event-danger></p>
  <h2 data-event-title></h2>
  <p data-event-reveal></p>
</section>
<button type="button" class="event-endure timber-action" data-endure hidden>ENDURE</button>
```

Remove `eventLayer`, `eventItems`, dialog registration, modal focus routing, and response-button construction.

- [ ] **Step 4: Implement anchor event state**

Store a `ReadonlyMap<ItemInstanceId, EventResponseId>` and selected instance. In `refreshAnchorTooltip`, return the label alone for recovered items and retain rich tool copy for permanent equipment. In `syncCommandState`, keep recovered item buttons focusable during busy event stages and derive `aria-disabled` from eligibility. Route an eligible item click before day-action routing:

```ts
const instanceId = button.dataset.anchorId as ItemInstanceId | undefined;
const choiceId = instanceId === undefined ? undefined : this.eventEligibility.get(instanceId);
if (choiceId !== undefined) {
  this.onEventItem(choiceId, instanceId);
  return;
}
```

Show Endure only for an active empty eligibility map. Use a tokenized timeout in `showEventReveal` so disposal or a newer reveal cancels the old completion.

- [ ] **Step 5: Add CSS states**

Add pointer-transparent caption styling and visible `.boat-anchor[data-event-state="eligible"]`, `muted`, and `selected` states. Keep a 44px target, strong focus outline, and a reduced-motion rule. Remove `.event-overlay` and `.event-items` rules.

- [ ] **Step 6: Run the UI tests**

Run: `bunx vitest run tests/SurvivalUI.test.ts tests/SurvivalPhaseFocus.test.ts`

Expected: PASS after obsolete modal expectations are replaced.

- [ ] **Step 7: Commit**

```bash
git add src/ui/SurvivalUI.ts src/styles/main.css tests/SurvivalUI.test.ts tests/SurvivalPhaseFocus.test.ts
git commit -m "feat: select event items in the survival scene"
```

### Task 4: Boat Item Presentation and Use Animation

**Files:**
- Modify: `src/survival/BoatWorld.ts`
- Test: `tests/world.test.ts`

**Interfaces:**
- Produces: `setEventEligibleItems(instanceIds: ReadonlySet<ItemInstanceId>): void`.
- Produces: `setEventSelectedItem(instanceId: ItemInstanceId | null): void`.
- Produces: `playEventItemUse(instanceId: ItemInstanceId): Promise<void>`.
- Consumes: existing `play(cue)`, `syncInventory`, and saved prop map.

- [ ] **Step 1: Add failing world tests**

Create a world with two saved items. Assert both start muted, eligibility restores one, hover does not restore a muted item, and clearing eligibility mutes both. Start item use and advance `world.update` until completion:

```ts
world.setEventEligibleItems(new Set(['bucket-2']));
expect(materialColor(world, 'bucket-1')).toBe(MUTED_COLOR);
expect(materialColor(world, 'bucket-2')).not.toBe(MUTED_COLOR);

const start = prop(world, 'bucket-2').position.clone();
const using = world.playEventItemUse('bucket-2');
world.update(0.3, 0.3);
expect(prop(world, 'bucket-2').position.y).toBeGreaterThan(start.y);
world.update(1, 1);
await using;
expect(prop(world, 'bucket-2').position).toEqual(start);
```

Add reduced-motion, missing-instance, interruption, and disposal tests.

- [ ] **Step 2: Run focused world tests and confirm failure**

Run: `bunx vitest run tests/world.test.ts`

Expected: FAIL because event material and animation APIs do not exist.

- [ ] **Step 3: Allocate muted material variants at construction**

Extend each `ConditionMaterialBinding` with muted usable and broken variants. Clone once, desaturate toward `0x596063`, reduce emissive intensity, and register each clone in `ownedMaterials`. Select material from condition plus eligibility in one helper. Do not clone in `syncInventory`, `setEventEligibleItems`, or `update`.

- [ ] **Step 4: Implement event selection visuals**

Store `eventEligibleItemIds` and `eventSelectedItemId`. Reapply binding materials when inventory or selection changes. Keep hover emissive changes from restoring the base color. Apply the warm emissive highlight to eligible and selected items.

- [ ] **Step 5: Implement reusable item animation**

Add an `ActiveEventItemAnimation` with saved position, quaternion, duration, elapsed, and resolver. `playEventItemUse` cancels the prior animation, validates visibility, records base transforms, and starts a 0.65 second animation. `update` adds a small vertical lift and tilt with `easeInOut`. Reduced motion uses `Number.EPSILON`. Completion, cancellation, and disposal restore the saved transform and resolve once.

- [ ] **Step 6: Run world tests**

Run: `bunx vitest run tests/world.test.ts tests/SceneResources.test.ts`

Expected: PASS with resource counts restored after disposal.

- [ ] **Step 7: Commit**

```bash
git add src/survival/BoatWorld.ts tests/world.test.ts
git commit -m "feat: animate physical event items"
```

### Task 5: Phase-Owned Event Presentation Sequence

**Files:**
- Modify: `src/survival/SurvivalPhase.ts`
- Modify: `tests/SurvivalPhase.test.ts`
- Modify: `tests/SurvivalPhaseFocus.test.ts`

**Interfaces:**
- Consumes: Task 2 typed responses, Task 3 UI APIs, Task 4 world APIs.
- Produces: one lifecycle-safe event sequence for day and night events.

- [ ] **Step 1: Add failing phase order tests**

Record calls and assert:

```ts
expect(calls).toEqual([
  'busy:true',
  'sleep:cover',
  'world:nightfall',
  'render:night',
  'sleep:uncover',
  'caption:reveal',
  'world:storm',
  'world:eligible',
  'ui:eligible',
  'busy:false',
]);
```

Add item selection order `ui:selected`, `world:selected`, `world:item-use`, `session:resolve`, `render`, `feedback`, `dawn`. Add quiet night, day event, terminal result, duplicate click, restart, disposal, pause, and reduced-motion cases.

- [ ] **Step 2: Run phase tests and confirm failure**

Run: `bunx vitest run tests/SurvivalPhase.test.ts tests/SurvivalPhaseFocus.test.ts`

Expected: FAIL because `openPendingEvent` opens the modal and resolution accepts a choice string.

- [ ] **Step 3: Add internal presentation state and eligibility mapping**

Add:

```ts
type EventPresentationState =
  | 'idle' | 'sleeping' | 'revealing' | 'choosing' | 'using' | 'resolving';

private eventPresentation: EventPresentationState = 'idle';
private eventEligibility = new Map<ItemInstanceId, EventResponseId>();
```

Build the map once by joining usable inventory instances to pending event choices by item type.

- [ ] **Step 4: Replace pending-event opening with reveal**

Create `runPendingEventReveal(snapshot, generation)`:

```ts
const event = survivalEventById(snapshot.pendingEventId!);
this.eventPresentation = 'revealing';
this.setBusy(true);
await Promise.all([
  this.world.play?.(event!.cue) ?? Promise.resolve(),
  this.ui.showEventReveal?.(event!) ?? Promise.resolve(),
]);
if (!this.isContinuationActive(generation)) return;
this.eventEligibility = this.eventEligibilityFor(event!, this.session.snapshot());
this.world.setEventEligibleItems?.(new Set(this.eventEligibility.keys()));
this.ui.setEventSelection?.(this.eventEligibility);
this.eventPresentation = 'choosing';
this.setBusy(false);
```

Night flow uncovers before calling this method. Day-event flow calls it after the action cue.

- [ ] **Step 5: Implement selected-item resolution**

Wire `onEventItem(choiceId, instanceId)`. Accept it only during `choosing`, switch to `using`, lock input, mark the UI/world selected state, await `playEventItemUse`, then call:

```ts
this.session.resolveEvent?.({ kind: 'item', choiceId, instanceId });
```

Endure sends `{ kind: 'endure' }` only when the eligibility map is empty. Clear event UI/world state before dawn or return to day. Keep generation checks after each await.

- [ ] **Step 6: Update start, quiet night, pause, and disposal paths**

Pending events present at `start()` enter reveal. Quiet nights keep cover through the hold and dawn. Disposal clears maps and world/UI event state. Pause blocks input without changing session or presentation state.

- [ ] **Step 7: Run phase and session integration tests**

Run: `bunx vitest run tests/SurvivalPhase.test.ts tests/SurvivalPhaseFocus.test.ts tests/SurvivalSession.test.ts`

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/survival/SurvivalPhase.ts tests/SurvivalPhase.test.ts tests/SurvivalPhaseFocus.test.ts
git commit -m "feat: sequence scene-led survival events"
```

### Task 6: Reference-Inspired Journal Surface

**Files:**
- Modify: `src/ui/SurvivalUI.ts`
- Modify: `src/styles/main.css`
- Test: `tests/SurvivalUI.test.ts`

**Interfaces:**
- Consumes: current immutable journal entries and `formatJournalEntry`.
- Produces: leather cover, parchment leaf, binding, decorative tabs, edge arrows, folio, and paper close strip.

- [ ] **Step 1: Add failing journal structure tests**

Assert:

```ts
expect(mount.querySelector('[data-journal-cover]')).not.toBeNull();
expect(mount.querySelector('[data-journal-binding]')).not.toBeNull();
expect(mount.querySelectorAll('[data-journal-bookmark]')).toHaveLength(4);
expect(mount.querySelector('[data-journal-close]')?.textContent).toMatch(/close journal/i);
expect(mount.querySelectorAll('[data-journal-bookmark][data-action]')).toHaveLength(0);
```

Keep existing page order, empty history, navigation bounds, focus trap, Escape, and focus restoration tests.

- [ ] **Step 2: Run journal UI tests and confirm failure**

Run: `bunx vitest run tests/SurvivalUI.test.ts -t journal`

Expected: FAIL because the cover, binding, and bookmarks do not exist.

- [ ] **Step 3: Add journal structure**

Wrap the current article:

```html
<div class="journal-book" data-journal-cover>
  <div class="journal-book__binding" data-journal-binding aria-hidden="true"></div>
  <i class="journal-book__bookmark journal-book__bookmark--1" data-journal-bookmark aria-hidden="true"></i>
  <i class="journal-book__bookmark journal-book__bookmark--2" data-journal-bookmark aria-hidden="true"></i>
  <i class="journal-book__bookmark journal-book__bookmark--3" data-journal-bookmark aria-hidden="true"></i>
  <i class="journal-book__bookmark journal-book__bookmark--4" data-journal-bookmark aria-hidden="true"></i>
  <article class="journal-page">
    <p class="journal-page__weather" data-journal-weather></p>
    <h2 data-journal-title tabindex="-1"></h2>
    <div class="journal-page__story" data-journal-story>
      <section aria-labelledby="journal-day-label">
        <h3 id="journal-day-label">DAY</h3>
        <p data-journal-day></p>
      </section>
      <section aria-labelledby="journal-night-label">
        <h3 id="journal-night-label">NIGHT</h3>
        <p data-journal-night></p>
      </section>
    </div>
    <nav class="journal-page__navigation" aria-label="Journal pages">
      <button type="button" class="journal-page__edge-arrow journal-page__edge-arrow--previous" data-journal-previous aria-label="Previous journal page">&lsaquo;</button>
      <span class="journal-page__folio" data-journal-page-count>PAGE 0 OF 0</span>
      <button type="button" class="journal-page__edge-arrow journal-page__edge-arrow--next" data-journal-next aria-label="Next journal page">&rsaquo;</button>
    </nav>
    <button type="button" class="journal-page__close-strip" data-journal-close>X CLOSE JOURNAL</button>
  </article>
</div>
```

Change close copy to `X CLOSE JOURNAL`.

- [ ] **Step 4: Restyle the journal**

Use CSS gradients and pseudo-elements for the dark leather cover, tall parchment, metal clips, paper fibers, salt marks, stains, page rules, decorative tab colors, page-edge arrows, folio, and paper-strip close control. Set the page width near `min(560px, calc(100vw - 120px))`, keep the boat visible behind the vignette, and preserve internal story scrolling at short heights.

- [ ] **Step 5: Add responsive and reduced-motion checks**

Keep controls reachable at 1280 by 720 and 1920 by 1080. Remove page transforms and transitions under `prefers-reduced-motion: reduce`.

- [ ] **Step 6: Run UI tests**

Run: `bunx vitest run tests/SurvivalUI.test.ts tests/survivalJournal.test.ts`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/ui/SurvivalUI.ts src/styles/main.css tests/SurvivalUI.test.ts
git commit -m "feat: rebuild the survival journal surface"
```

### Task 7: Full Verification and Browser Inspection

**Files:**
- Modify only files required by failures from this task.

**Interfaces:**
- Consumes all prior tasks.
- Produces a verified desktop survival flow.

- [ ] **Step 1: Run model policy checks**

Run: `bun run models:check`

Expected: PASS. No runtime asset manifest changes.

- [ ] **Step 2: Run the full test suite**

Run: `bun run test`

Expected: PASS with no skipped event, phase, UI, world, journal, or lifecycle tests.

- [ ] **Step 3: Run type checking**

Run: `bun run typecheck`

Expected: PASS with no TypeScript errors.

- [ ] **Step 4: Build production output**

Run: `bun run build`

Expected: PASS and Vite writes `dist`.

- [ ] **Step 5: Inspect desktop browser flows**

Run: `bun run dev -- --host 127.0.0.1`

Check quiet night; storm, fish, impact, darkness, and sighting reveals; eligible and empty selection; exact duplicate instance; interrupted animation; day, night, and terminal outcomes; journal at 1280 by 720 and 1920 by 1080; keyboard-only input; reduced motion.

- [ ] **Step 6: Commit verification fixes**

If verification required changes:

```bash
git add src/survival/survivalTypes.ts src/survival/events.ts src/survival/journal.ts src/survival/inventory.ts src/survival/SurvivalSession.ts src/survival/SurvivalPhase.ts src/survival/BoatWorld.ts src/ui/SurvivalUI.ts src/styles/main.css tests/survivalEvents.test.ts tests/survivalJournal.test.ts tests/SurvivalSession.test.ts tests/SurvivalUI.test.ts tests/SurvivalPhase.test.ts tests/SurvivalPhaseFocus.test.ts tests/world.test.ts
git commit -m "fix: finish survival event presentation"
```

If no files changed, record the passing commands in the final handoff without an empty commit.

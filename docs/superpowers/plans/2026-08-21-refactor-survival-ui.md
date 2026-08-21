# Survival UI Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split `SurvivalUI` into focused DOM views while preserving its public event facade and exact player-facing markup behavior.

**Architecture:** Each view creates and owns one DOM subtree. `SurvivalUI` mounts views in the current order, forwards semantic events, and coordinates cross-view visibility. One focus manager owns modal focus and background inert state.

**Tech Stack:** TypeScript 5.9, Vitest 3.2, JSDOM 29, plain DOM and CSS

**Spec:** `docs/superpowers/specs/2026-08-21-code-refactor-design.md`

## Global Constraints

- Complete the earlier refactor plans first.
- Preserve text, ARIA labels, roles, tab order, selectors, DOM order, timings, and focus restore behavior.
- Do not change `src/styles/main.css` during structural extraction.
- Do not add a UI framework or dependency.
- Each view owns its event listeners and removes them during idempotent disposal.
- `SurvivalUI` emits semantic commands. Views do not import `SurvivalSession`.

---

### Task 1: Extract Modal Focus Management

**Files:**
- Create: `src/ui/ModalFocusManager.ts`
- Create: `tests/ModalFocusManager.test.ts`
- Modify: `src/ui/SurvivalUI.ts`
- Modify: `tests/SurvivalUI.test.ts`

**Interfaces:**
- Consumes: background regions and ordered modal roots.
- Produces: modal activation, inert synchronization, focus trap, and focus restore.

- [ ] **Step 1: Move accessibility characterizations**

Cover topmost modal selection, background inert state, initial focus, Tab and Shift+Tab wrapping, nested overlay order, hidden controls, and origin restore.

```ts
manager.activate(journal, trigger);
expect(background.inert).toBe(true);
expect(document.activeElement).toBe(journalClose);
manager.deactivate(journal);
expect(document.activeElement).toBe(trigger);
```

- [ ] **Step 2: Run the focused test and confirm the missing class**

Run: `npm test -- tests/ModalFocusManager.test.ts`

Expected: module-resolution failure.

- [ ] **Step 3: Implement one focus owner**

```ts
export class ModalFocusManager {
  constructor(
    private readonly background: readonly HTMLElement[],
    private readonly modals: readonly HTMLElement[],
  );
  activate(modal: HTMLElement, origin?: HTMLElement | null): void;
  deactivate(modal: HTMLElement, restore?: boolean): void;
  sync(): void;
  handleKeyDown(event: KeyboardEvent): boolean;
  restore(target?: HTMLElement | null): void;
  dispose(): void;
}
```

Move existing usable-control filters, topmost modal logic, trap logic, background interaction, and restore rules unchanged.

- [ ] **Step 4: Delegate from `SurvivalUI`**

Keep the document key listener in one owner only. Remove focus helper methods from `SurvivalUI` after delegation.

- [ ] **Step 5: Run focus and UI tests**

Run: `npm test -- tests/ModalFocusManager.test.ts tests/SurvivalUI.test.ts tests/DiveUI.test.ts`

Expected: all selected tests pass.

- [ ] **Step 6: Commit the focus manager**

```bash
git add src/ui/ModalFocusManager.ts src/ui/SurvivalUI.ts tests/ModalFocusManager.test.ts tests/SurvivalUI.test.ts
git commit -m "refactor: extract survival modal focus"
```

---

### Task 2: Extract HUD and Boat Anchors

**Files:**
- Create: `src/ui/SurvivalHudView.ts`
- Create: `src/ui/BoatAnchorView.ts`
- Create: `tests/SurvivalHudView.test.ts`
- Create: `tests/BoatAnchorView.test.ts`
- Modify: `src/ui/SurvivalUI.ts`
- Modify: `tests/SurvivalUI.test.ts`

**Interfaces:**
- HUD consumes snapshots and action-unavailable reasons. It emits day actions, journal, pause, and camera-turn commands.
- Anchor view consumes projected anchors and event choice state. It emits anchor activation and highlight changes.

- [ ] **Step 1: Add focused view tests**

```ts
hud.render(snapshot, unavailable);
expect(hud.root.querySelector('[data-meter="health"]')?.getAttribute('aria-valuenow'))
  .toBe(String(snapshot.health));
anchors.setAnchors(anchorFixture);
expect(anchors.root.querySelectorAll('[data-anchor-id]')).toHaveLength(anchorFixture.length);
```

Cover Carlitos card, meter artwork thresholds, action reasons, tooltip placement, pointer and focus highlight, minimum hit areas, repair dialog entry, and camera turn.

- [ ] **Step 2: Run focused tests and confirm missing classes**

Run: `npm test -- tests/SurvivalHudView.test.ts tests/BoatAnchorView.test.ts`

Expected: module-resolution failures.

- [ ] **Step 3: Implement HUD ownership**

```ts
export class SurvivalHudView {
  readonly root: HTMLElement;
  onAction: (action: DayActionId, option?: DayActionOption) => void;
  onJournal: () => void;
  onPause: () => void;
  onCameraTurn: () => void;
  render(snapshot: SurvivalSnapshot, unavailable: (action: DayActionId) => string | null): void;
  setBusy(busy: boolean): void;
  setJournalUnread(unread: boolean): void;
  setCameraTurnState(visible: boolean, rear: boolean): void;
  dispose(): void;
}
```

- [ ] **Step 4: Implement anchor ownership**

```ts
export class BoatAnchorView {
  readonly root: HTMLElement;
  onActivate: (anchorId: string) => void;
  onHighlight: (anchorId: string | null) => void;
  setAnchors(anchors: readonly BoatInteractionAnchor[]): void;
  setEventChoices(choices: readonly EventContextChoice[]): void;
  setBusy(busy: boolean): void;
  clearHighlight(): void;
  dispose(): void;
}
```

Move anchor caches and tooltip nodes with this view. Reuse cached buttons when anchor identity is unchanged.

- [ ] **Step 5: Mount both views in the original positions**

Move their exact markup from the current constructor. Keep every class, data attribute, ARIA attribute, and text value unchanged.

- [ ] **Step 6: Run view and facade tests**

Run: `npm test -- tests/SurvivalHudView.test.ts tests/BoatAnchorView.test.ts tests/SurvivalUI.test.ts tests/BoatInteraction.test.ts`

Expected: all selected tests pass.

- [ ] **Step 7: Commit HUD and anchors**

```bash
git add src/ui/SurvivalHudView.ts src/ui/BoatAnchorView.ts src/ui/SurvivalUI.ts tests/SurvivalHudView.test.ts tests/BoatAnchorView.test.ts tests/SurvivalUI.test.ts
git commit -m "refactor: extract survival hud and anchors"
```

---

### Task 3: Extract Event and Cover Views

**Files:**
- Create: `src/ui/SurvivalEventView.ts`
- Create: `src/ui/SurvivalCoverView.ts`
- Create: `tests/SurvivalEventView.test.ts`
- Create: `tests/SurvivalCoverView.test.ts`
- Modify: `src/ui/SurvivalUI.ts`
- Modify: `tests/SurvivalUI.test.ts`
- Modify: `tests/DiveUI.test.ts`

**Interfaces:**
- Event view owns reveal copy, choices, selected and using state, choice beat, sleep mask, and feedback.
- Cover view owns sleep profiles, bad-sleep cue, dive result, fade timing, and covered holds.

- [ ] **Step 1: Add event and cover tests**

```ts
eventView.showReveal(event, choices);
expect(eventView.root.querySelector('[data-event-title]')?.textContent).toBe(event.title);
await eventView.playChoiceBeat(choiceId);
expect(eventView.selectedChoiceForTest()).toBe(choiceId);

await cover.setCovered(true);
expect(cover.root.classList).toContain('is-covered');
await cover.showRewardResult(result);
expect(cover.root.querySelector('[data-dive-result-title]')?.textContent).toBe(result.title);
```

- [ ] **Step 2: Run tests and confirm missing classes**

Run: `npm test -- tests/SurvivalEventView.test.ts tests/SurvivalCoverView.test.ts`

Expected: module-resolution failures.

- [ ] **Step 3: Implement event view**

```ts
export class SurvivalEventView {
  readonly root: HTMLElement;
  onItem: (choiceId: EventResponseId, instanceId: ItemInstanceId) => void;
  onEndure: () => void;
  begin(): void;
  showReveal(event: SurvivalEventDefinition, choices: readonly EventContextChoice[]): void;
  setSelection(choiceId: EventResponseId | null, instanceId: ItemInstanceId | null): void;
  setUsing(instanceId: ItemInstanceId): void;
  playChoiceBeat(choiceId: EventResponseId): Promise<void>;
  setSleepMask(eventId: string, visible: boolean): void;
  showFeedback(outcome: Pick<ActionOutcome, 'accepted' | 'message'>): void;
  clear(): void;
  dispose(): void;
}
```

- [ ] **Step 4: Implement cover view**

```ts
export class SurvivalCoverView {
  readonly root: HTMLElement;
  setProfile(profile: SleepCoverProfile): Promise<void>;
  setBadSleepCue(visible: boolean): void;
  setCovered(covered: boolean): Promise<void>;
  holdDiveCovered(): Promise<void>;
  showRewardResult(view: RewardResultView): Promise<void>;
  hideRewardResult(): void;
  settle(): Promise<void>;
  holdSleep(): Promise<void>;
  holdEventOutcome(): Promise<void>;
  dispose(): void;
}
```

Move timing constants unchanged.

- [ ] **Step 5: Delegate from `SurvivalUI` and run tests**

Run: `npm test -- tests/SurvivalEventView.test.ts tests/SurvivalCoverView.test.ts tests/SurvivalUI.test.ts tests/DiveUI.test.ts tests/SurvivalPhase.test.ts`

Expected: all selected tests pass.

- [ ] **Step 6: Commit event and cover views**

```bash
git add src/ui/SurvivalEventView.ts src/ui/SurvivalCoverView.ts src/ui/SurvivalUI.ts tests/SurvivalEventView.test.ts tests/SurvivalCoverView.test.ts tests/SurvivalUI.test.ts tests/DiveUI.test.ts
git commit -m "refactor: extract survival event and cover views"
```

---

### Task 4: Extract Fishing and Drifting Views

**Files:**
- Create: `src/ui/SurvivalFishingView.ts`
- Create: `src/ui/DriftingItemView.ts`
- Create: `tests/SurvivalFishingView.test.ts`
- Create: `tests/DriftingItemView.test.ts`
- Modify: `src/ui/SurvivalUI.ts`
- Modify: `tests/SurvivalUI.test.ts`

**Interfaces:**
- Fishing view owns aiming, bite target, fade, result, view exit, pointer input, and announcements.
- Drifting view owns focus card, choices, projected placement, and back control.

- [ ] **Step 1: Add focused interaction tests**

```ts
fishing.setState({ mode: 'bite', target });
expect(fishing.biteButton.hidden).toBe(false);
fishing.biteButton.click();
expect(onReel).toHaveBeenCalledOnce();

drifting.show(view);
drifting.updateTarget(bounds);
expect(drifting.card.style.left).toBe(`${bounds.x}px`);
```

Cover mouse cast, keyboard reel, result continue, exit, announcements, target reuse, viewport clamping, choices, and back.

- [ ] **Step 2: Run tests and confirm missing classes**

Run: `npm test -- tests/SurvivalFishingView.test.ts tests/DriftingItemView.test.ts`

Expected: module-resolution failures.

- [ ] **Step 3: Implement fishing view**

```ts
export class SurvivalFishingView {
  readonly root: HTMLElement;
  onCast: (clientX?: number, clientY?: number) => void;
  onReel: () => void;
  onContinue: () => void;
  onExit: () => void;
  setState(state: FishingUiState): void;
  showResult(view: FishingResultView): void;
  hideResult(): void;
  updateBiteTarget(target: ProjectedBoatBounds | null): void;
  setExitVisible(visible: boolean): void;
  setFade(covered: boolean): Promise<void>;
  dispose(): void;
}
```

- [ ] **Step 4: Implement drifting view**

```ts
export class DriftingItemView {
  readonly root: HTMLElement;
  onChoice: (choiceId: EventResponseId) => void;
  onBack: () => void;
  show(view: DriftingItemFocusView): void;
  hide(): void;
  updateTarget(target: ProjectedBoatBounds | null): void;
  dispose(): void;
}
```

- [ ] **Step 5: Delegate from `SurvivalUI` and run tests**

Run: `npm test -- tests/SurvivalFishingView.test.ts tests/DriftingItemView.test.ts tests/SurvivalUI.test.ts tests/SurvivalFishingFlow.test.ts tests/DriftingItemFlow.test.ts`

Expected: all selected tests pass.

- [ ] **Step 6: Commit fishing and drifting views**

```bash
git add src/ui/SurvivalFishingView.ts src/ui/DriftingItemView.ts src/ui/SurvivalUI.ts tests/SurvivalFishingView.test.ts tests/DriftingItemView.test.ts tests/SurvivalUI.test.ts
git commit -m "refactor: extract survival fishing and drifting views"
```

---

### Task 5: Extract Journal and Static Modals

**Files:**
- Create: `src/ui/SurvivalJournalView.ts`
- Create: `src/ui/SurvivalModalViews.ts`
- Create: `tests/SurvivalJournalView.test.ts`
- Create: `tests/SurvivalModalViews.test.ts`
- Modify: `src/ui/SurvivalUI.ts`
- Modify: `tests/SurvivalUI.test.ts`

**Interfaces:**
- Journal view owns pages, formatting, navigation, unread focus, and close.
- Static modal views own pause, repair options, ending, and item-animation-lab panels.

- [ ] **Step 1: Add focused modal tests**

```ts
journal.show(entries);
expect(journal.pageForTest()).toBe(entries.length - 1);
journal.previous();
expect(journal.pageForTest()).toBe(entries.length - 2);

modals.showEnding('rescued', 'standard');
expect(modals.endingTitle.textContent).toContain('RESCUED');
```

Cover empty journal, page bounds, formatted day and night text, repair target selection, cancel, pause resume, ending restart, and lab visibility.

- [ ] **Step 2: Run tests and confirm missing classes**

Run: `npm test -- tests/SurvivalJournalView.test.ts tests/SurvivalModalViews.test.ts`

Expected: module-resolution failures.

- [ ] **Step 3: Implement journal view**

```ts
export class SurvivalJournalView {
  readonly root: HTMLElement;
  onClose: () => void;
  show(entries: readonly JournalEntry[]): void;
  hide(): void;
  previous(): void;
  next(): void;
  dispose(): void;
}
```

- [ ] **Step 4: Implement static modal views**

```ts
export class SurvivalModalViews {
  readonly roots: readonly HTMLElement[];
  onResume: () => void;
  onRestart: () => void;
  onRepairTarget: (instanceId: ItemInstanceId) => void;
  onRepairCancel: () => void;
  setPaused(paused: boolean): void;
  showRepairOptions(items: readonly SurvivalItemState[]): void;
  hideRepairOptions(): void;
  showEnding(state: SurvivalState, reason: SurvivalEndingReason): void;
  showItemAnimationLab(): void;
  dispose(): void;
}
```

- [ ] **Step 5: Delegate from `SurvivalUI` and run tests**

Run: `npm test -- tests/SurvivalJournalView.test.ts tests/SurvivalModalViews.test.ts tests/SurvivalUI.test.ts tests/ItemAnimationLab.test.ts`

Expected: all selected tests pass.

- [ ] **Step 6: Commit journal and modal views**

```bash
git add src/ui/SurvivalJournalView.ts src/ui/SurvivalModalViews.ts src/ui/SurvivalUI.ts tests/SurvivalJournalView.test.ts tests/SurvivalModalViews.test.ts tests/SurvivalUI.test.ts
git commit -m "refactor: extract survival journal and modals"
```

---

### Task 6: Reduce `SurvivalUI` to View Composition

**Files:**
- Modify: `src/ui/SurvivalUI.ts`
- Modify: `tests/SurvivalUI.test.ts`
- Modify: `tests/GameLifecycle.test.ts`
- Modify: `README.md`

**Interfaces:**
- `SurvivalUI` keeps its public callbacks and facade methods used by survival flows.
- All DOM nodes belong to one extracted view.

- [ ] **Step 1: Add DOM-order and listener-ownership tests**

```ts
expect([...root.children]).toEqual(expectedViewRoots);
ui.dispose();
ui.dispose();
expect(listenerRemovals).toBe(listenerAdds);
```

- [ ] **Step 2: Remove direct node fields from `SurvivalUI`**

Run: `rg -n "private readonly .*HTMLElement|requireElement\(this.root" src/ui/SurvivalUI.ts`

Expected: only the root or composition-level nodes remain.

- [ ] **Step 3: Keep cross-view coordination explicit**

Busy state, modal focus, background interaction, and command focus call named view methods. Do not query across another view's subtree.

- [ ] **Step 4: Update architecture documentation**

List each view and state that `SurvivalUI` owns mounting and event forwarding.

- [ ] **Step 5: Run full verification**

Run: `npm run typecheck && npm test && npm run build`

Expected: all commands pass.

- [ ] **Step 6: Commit the UI composition cleanup**

```bash
git add src/ui/SurvivalUI.ts tests/SurvivalUI.test.ts tests/GameLifecycle.test.ts README.md
git commit -m "refactor: reduce survival ui to view composition"
```

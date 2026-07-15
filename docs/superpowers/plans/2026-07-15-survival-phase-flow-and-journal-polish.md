# Survival Phase Flow and Journal Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace blocking survival outcome screens with cue-driven feedback and sleep sequencing, add quiet nights and unread journal entries, and polish the top HUD and journal presentation.

**Architecture:** `SurvivalSession` owns the quiet-night roll and journal facts. `SurvivalPhase` sequences cues, sleep, events, dawn, endings, and the journal read watermark. `SurvivalUI` owns the stable top controls, nonmodal feedback, sleep cover, manual journal, and focus behavior; `BoatWorld` projects only physical boat interactions.

**Tech Stack:** TypeScript 5.9, Three.js 0.180, DOM/CSS, Vitest 3.2 with jsdom, Bun, Vite 7.

## Global Constraints

- Keep existing action costs, event content, event item rules, terminal states, condition meters, weather rules, and world assets.
- Use a 25 percent quiet-night chance from the seeded survival random source.
- Add no third-party asset or dependency.
- Remove the outcome overlay, Continue, Skip Presentation, automatic journal mode, and Begin Next Day instead of hiding them.
- Keep the journal browsing-only. Opening or closing it must not advance time or mutate survival rules.
- Keep keyboard access, screen-reader announcements, focus isolation, pause precedence, reduced-motion behavior, and 1280 by 720 plus 1920 by 1080 layouts complete.
- Preserve one journal entry per completed day and ignore duplicate commands during transitions.
- Follow test-driven development. Run the focused failing test before production edits in each task.
- Design reference: `docs/superpowers/specs/2026-07-15-survival-phase-flow-and-journal-polish-design.md`.

---

## File Structure

| File | Responsibility after this work |
|---|---|
| `src/survival/journal.ts` | Journal event records, explicit quiet/event night union, defensive page formatting. |
| `src/survival/survivalBalance.ts` | The exact `night.quietChance` balance value. |
| `src/survival/SurvivalSession.ts` | Seeded quiet-night selection, event selection, journal finalization, immutable snapshots. |
| `src/ui/SurvivalUI.ts` | Top HUD controls, projected physical actions, feedback caption, sleep cover, manual journal, focus and keyboard behavior. |
| `src/styles/main.css` | Top-center layout, feedback and sleep visuals, weathered journal texture, responsive and reduced-motion rules. |
| `src/survival/BoatWorld.ts` | Physical saved-item and repair-patch anchors; no horizon command anchor. |
| `src/survival/SurvivalPhase.ts` | Nonblocking action, event, sleep, quiet-night, dawn, ending, unread, and focus sequencing. |
| `tests/survivalJournal.test.ts` | Journal union and prose behavior. |
| `tests/SurvivalSession.test.ts` | Quiet-night threshold, event branch, finalization, and snapshot immutability. |
| `tests/SurvivalUI.test.ts` | DOM contracts, feedback, sleep cover, journal, keyboard, focus, and CSS contracts. |
| `tests/BoatWorld.test.ts` | Physical anchor projection without the horizon control. |
| `tests/SurvivalPhase.test.ts` | Orchestration order, command locking, unread watermark, and terminal flow. |
| `tests/SurvivalPhaseFocus.test.ts` | Focus fallback after a physical action source disappears. |
| `README.md` | Current survival controls and day-to-night player flow. |

---

### Task 1: Add explicit quiet-night rules and journal records

**Files:**
- Modify: `src/survival/journal.ts:1-66`
- Modify: `src/survival/survivalBalance.ts:1-22`
- Modify: `src/survival/SurvivalSession.ts:1-230, 450-490`
- Test: `tests/survivalJournal.test.ts`
- Test: `tests/SurvivalSession.test.ts`
- Test fixtures: `tests/SurvivalUI.test.ts:18-38`
- Test fixtures: `tests/SurvivalPhase.test.ts:47-63`

**Interfaces:**
- Consumes: existing `JournalEventRecord`, `ActionOutcome`, `RandomSource`, `SurvivalState`, and `sequenceRandom(values)`.
- Produces: `JournalNightRecord`, `SURVIVAL_BALANCE.night.quietChance`, End Day outcome codes `quiet-night | event-opened`, and immutable journal entries whose `nighttime` field uses the new union.

- [ ] **Step 1: Write failing journal tests for event and quiet night records**

Replace the journal fixture with an explicit event-night wrapper and add a quiet-night expectation:

```ts
const entry = (overrides: Partial<JournalEntry> = {}): JournalEntry => ({
  day: 4,
  weather: 'overcast',
  daytime: null,
  nighttime: { kind: 'event', event: event() },
  ...overrides,
});

it('writes a calm first-person passage for a quiet night', () => {
  const page = formatJournalEntry(entry({ nighttime: { kind: 'quiet' } }));
  expect(page.nighttime).toBe(
    'That night, the sea stayed calm, and I slept without interruption.',
  );
});
```

Update existing overrides so they target the nested record:

```ts
nighttime: {
  kind: 'event',
  event: event({ attemptedItemId: null, resolution: 'endure' }),
},
```

- [ ] **Step 2: Run the journal test and verify the type and formatting failures**

Run: `bunx vitest run tests/survivalJournal.test.ts`

Expected: FAIL because `JournalEntry.nighttime` still requires `JournalEventRecord` and `formatJournalEntry` cannot format `{ kind: 'quiet' }`.

- [ ] **Step 3: Add the journal union and formatter branch**

Implement these exact types and branch in `src/survival/journal.ts`:

```ts
export type JournalNightRecord =
  | { kind: 'event'; event: JournalEventRecord }
  | { kind: 'quiet' };

export interface JournalEntry {
  day: number;
  weather: WeatherId;
  daytime: JournalEventRecord | null;
  nighttime: JournalNightRecord;
}

function formatNight(record: JournalNightRecord): string {
  return record.kind === 'quiet'
    ? 'That night, the sea stayed calm, and I slept without interruption.'
    : formatEvent(record.event);
}

export function formatJournalEntry(entry: JournalEntry): JournalPageCopy {
  return {
    heading: `DAY ${entry.day}`,
    weather: WEATHER_LABELS[entry.weather],
    daytime: entry.daytime === null
      ? 'The daylight hours passed quietly.'
      : formatEvent(entry.daytime),
    nighttime: formatNight(entry.nighttime),
  };
}
```

- [ ] **Step 4: Write failing session tests for both sides of the 0.25 threshold**

Add focused tests in `tests/SurvivalSession.test.ts`:

```ts
it('finalizes a quiet night below the 25 percent threshold', () => {
  const session = new SurvivalSession(saved(), {
    seed: 21,
    random: sequenceRandom([0.249999]),
  });

  expect(session.perform('endDay')).toMatchObject({
    accepted: true,
    code: 'quiet-night',
    cue: 'nightfall',
  });
  expect(session.snapshot()).toMatchObject({
    state: 'nightEvent',
    pendingEventId: null,
    journalEntries: [{ day: 1, nighttime: { kind: 'quiet' } }],
  });
});

it('opens a night event at the 25 percent threshold', () => {
  const session = new SurvivalSession(saved(), {
    seed: 22,
    random: sequenceRandom([0.25, 0]),
  });

  expect(session.perform('endDay')).toMatchObject({
    accepted: true,
    code: 'event-opened',
    cue: 'nightfall',
  });
  expect(session.snapshot()).toMatchObject({
    state: 'nightEvent',
    pendingEventId: expect.any(String),
    journalEntries: [],
  });
});
```

Change event-night assertions to the union shape:

```ts
nighttime: {
  kind: 'event',
  event: expect.objectContaining({
    phase: 'night',
    attemptedItemId: 'flashlight',
  }),
},
```

For existing tests that call `perform('endDay')` and expect an event, prepend a quiet-night roll of `0.25` or greater before the event draw value. For example, change `sequenceRandom([0])` to `sequenceRandom([0.5, 0])`.

- [ ] **Step 5: Run the session and journal tests and verify the new session tests fail**

Run: `bunx vitest run tests/survivalJournal.test.ts tests/SurvivalSession.test.ts`

Expected: journal tests PASS; session tests FAIL because End Day still opens an event for every roll and event journal records lack the union wrapper.

- [ ] **Step 6: Add the quiet-night balance value and session branch**

Add the balance entry:

```ts
night: { quietChance: 0.25 },
```

Change session journal storage and End Day:

```ts
import type {
  JournalEntry,
  JournalEventRecord,
  JournalNightRecord,
  JournalResolution,
} from './journal';

private pendingJournalNighttime: JournalNightRecord | null = null;

endDay(): ActionOutcome {
  if (this.isTerminal()) return this.reject('terminal', 'The survival journey has already ended.');
  if (this.state !== 'day') return this.reject('not-daytime', 'The day cannot end while an event is unresolved.');

  if (this.random.next() < SURVIVAL_BALANCE.night.quietChance) {
    this.state = 'nightEvent';
    this.pendingJournalNighttime = { kind: 'quiet' };
    this.finalizeJournalDay();
    return this.commit('quiet-night', 'The night passes without incident.', {}, 'nightfall');
  }

  const event = this.drawEvent('night');
  this.openEvent(event);
  return this.commit('event-opened', event.prompt, {}, 'nightfall');
}
```

Wrap nighttime events and clone both variants:

```ts
this.pendingJournalNighttime = { kind: 'event', event: record };
this.finalizeJournalDay();

private cloneJournalNight(record: JournalNightRecord): JournalNightRecord {
  return record.kind === 'quiet'
    ? { kind: 'quiet' }
    : { kind: 'event', event: { ...record.event } };
}

private journalSnapshot(): readonly JournalEntry[] {
  return this.journalEntries.map((entry) => ({
    ...entry,
    daytime: entry.daytime === null ? null : { ...entry.daytime },
    nighttime: this.cloneJournalNight(entry.nighttime),
  }));
}
```

- [ ] **Step 7: Update shared journal fixtures and run all affected rule tests**

Update `journalEntries` in `tests/SurvivalUI.test.ts` and `completedEntry()` in `tests/SurvivalPhase.test.ts` to use:

```ts
nighttime: {
  kind: 'event',
  event: {
    phase: 'night',
    eventId: `night-${day}`,
    title: 'Quiet Night',
    prompt: `Night ${day} settled over the boat.`,
    attemptedItemId: null,
    resolution: 'endure',
    outcomeCode: 'event-resolved',
    outcomeMessage: 'I made it through until morning.',
  },
},
```

Run: `bunx vitest run tests/survivalJournal.test.ts tests/SurvivalSession.test.ts tests/SurvivalUI.test.ts tests/SurvivalPhase.test.ts`

Expected: PASS. The later UI and phase behavior still uses the old outcome pipeline at this checkpoint.

- [ ] **Step 8: Commit the quiet-night rule slice**

```bash
git add src/survival/journal.ts src/survival/survivalBalance.ts src/survival/SurvivalSession.ts tests/survivalJournal.test.ts tests/SurvivalSession.test.ts tests/SurvivalUI.test.ts tests/SurvivalPhase.test.ts
git commit -m "feat: add quiet survival nights"
```

---

### Task 2: Replace the projected End Day anchor with a stable top HUD

**Files:**
- Modify: `src/ui/SurvivalUI.ts:136-420, 640-760, 943-1045`
- Modify: `src/styles/main.css:180-220, 574-695, 746-760`
- Modify: `src/survival/BoatWorld.ts:195-265, 351-388`
- Test: `tests/SurvivalUI.test.ts`
- Test: `tests/BoatWorld.test.ts`

**Interfaces:**
- Consumes: existing `uiArtwork('journal')`, `DayActionId`, action availability reasons, delegated click and number-shortcut handlers.
- Produces: stable `[data-action="endDay"]`, `[data-survival-top]`, `[data-survival-status]`, `[data-journal-open]`, `[data-journal-unread]`, and `SurvivalUI.setJournalUnread(unread: boolean): void`.

- [ ] **Step 1: Write failing DOM and world-anchor tests**

Add or replace UI assertions:

```ts
it('separates journal, status, and stable End Day controls', () => {
  const mount = document.createElement('main');
  const ui = createUI(mount);
  ui.render(snapshot(), () => null);

  const top = mount.querySelector('[data-survival-top]')!;
  const status = top.querySelector('[data-survival-status]')!;
  const journal = top.querySelector('[data-journal-open]')!;
  const endDay = top.querySelector<HTMLButtonElement>('[data-action="endDay"]')!;

  expect(status.querySelector('[data-day]')?.textContent).toBe('DAY 1');
  expect(status.querySelector('[data-phase]')?.textContent).toBe('DAYLIGHT');
  expect(status.querySelector('[data-weather]')?.textContent).toBe('CALM');
  expect(status.querySelector('[data-ui-artwork="journal"]')).toBeNull();
  expect(journal.querySelector('[data-ui-artwork="journal"]')).not.toBeNull();
  expect(endDay.closest('[data-boat-anchors]')).toBeNull();
  expect(endDay.getAttribute('aria-keyshortcuts')).toBe('7');
  ui.dispose();
});

it('marks journal history unread until the marker opens', () => {
  const mount = document.createElement('main');
  const ui = createUI(mount);
  ui.setJournalUnread(true);
  expect(mount.querySelector<HTMLElement>('[data-journal-unread]')!.hidden).toBe(false);
  expect(mount.querySelector('[data-journal-open]')?.getAttribute('aria-label')).toContain('new entry');
  ui.setJournalUnread(false);
  expect(mount.querySelector<HTMLElement>('[data-journal-unread]')!.hidden).toBe(true);
  ui.dispose();
});
```

Change the BoatWorld projection test to expect saved props plus the repair patch only:

```ts
expect(anchors).toHaveLength(savedItems.length + 1);
expect(anchors).toEqual(expect.arrayContaining([
  expect.objectContaining({ id: 'fishingRod-1', action: 'fish' }),
  expect.objectContaining({ id: 'flareGun-1', action: null }),
  expect.objectContaining({ id: 'repair-patch', action: 'repair' }),
]));
expect(anchors.some(({ id }) => id === 'horizon')).toBe(false);
expect(anchors.some(({ action }) => action === 'endDay')).toBe(false);
```

Rename the overlap test to refer to the fixed repair anchor and remove its horizon expectation.

- [ ] **Step 2: Run the UI and world tests and verify they fail**

Run: `bunx vitest run tests/SurvivalUI.test.ts tests/BoatWorld.test.ts`

Expected: FAIL because status and journal share one button, End Day comes from the horizon anchor, and BoatWorld still projects that anchor.

- [ ] **Step 3: Add the two-row top HUD markup and state**

Replace the current journal/status button markup with:

```ts
<div class="survival-top" data-survival-top>
  <div class="survival-top__status-row">
    <button type="button" class="journal-marker" data-journal-open aria-label="Open journal">
      ${uiArtwork('journal', 'journal-marker__art')}
      <span class="journal-marker__unread" data-journal-unread hidden>NEW</span>
    </button>
    <section class="survival-status" data-survival-status aria-label="Current survival day">
      <strong data-day>DAY 1</strong>
      <span class="survival-status__detail"><span data-phase>DAYLIGHT</span><span aria-hidden="true"> · </span><span data-weather>CALM</span></span>
    </section>
  </div>
  <button type="button" class="end-day-button timber-action" data-action="endDay" aria-keyshortcuts="7">
    END DAY
  </button>
</div>
```

Store `topControls`, `endDayButton`, and `journalUnread`. Use `[topControls, anchorLayer]` as `backgroundRegions`. Implement:

```ts
setJournalUnread(unread: boolean): void {
  if (this.disposed) return;
  this.journalUnread.hidden = !unread;
  this.journalMarker.dataset.unread = String(unread);
  this.journalMarker.setAttribute(
    'aria-label',
    unread ? 'Open journal, new entry available' : 'Open journal',
  );
}
```

In `syncCommandState()`, apply the End Day availability and busy state:

```ts
const endDayReason = this.actionReasons.get('endDay') ?? null;
this.endDayButton.disabled = this.busy;
this.endDayButton.setAttribute('aria-disabled', endDayReason === null ? 'false' : 'true');
this.endDayButton.setAttribute(
  'aria-description',
  endDayReason ?? 'End the current day and go to sleep.',
);
this.endDayButton.title = endDayReason ?? 'End the current day';
```

Keep the delegated `[data-action]` click path and shortcut `7`; both should now find the stable button.

- [ ] **Step 4: Remove the horizon anchor and its special tooltip copy**

Delete the `horizon` `Object3D` construction and `fixedAnchors.push({ id: 'horizon', ... })` from `BoatWorld`.

Remove the `anchor.id === 'horizon'` branches from `refreshAnchorTooltip()` so the only `itemType: null` physical anchor copy describes the hull patch:

```ts
const itemLabel = anchor.itemType === null ? 'HULL PATCH' : ITEM_LABELS[anchor.itemType];
const itemDescription = anchor.itemType === null
  ? 'Inspect the lifeboat repair patch.'
  : SURVIVAL_ITEM_DESCRIPTIONS[anchor.itemType];
```

Remove horizon fixtures from `createUI()` and change generic fixed-anchor tests to use the repair action. Keep End Day coverage through the stable top button.

- [ ] **Step 5: Add top HUD CSS and remove horizon-tooltip CSS**

Implement the centered two-row cluster:

```css
.survival-top {
  position: absolute;
  top: 16px;
  left: 50%;
  z-index: 3;
  display: grid;
  justify-items: center;
  gap: 8px;
  transform: translateX(-50%);
  pointer-events: auto;
}
.survival-top__status-row { display: flex; align-items: center; gap: 10px; }
.survival-status { position: static; inset: auto; display: grid; gap: 2px; min-width: 150px; padding: 7px 12px; border: 0; text-align: center; }
.survival-status [data-day] { font-size: 1.15rem; color: var(--ink-bone); }
.survival-status__detail { color: var(--ink-faded); font-size: .62rem; letter-spacing: .12em; }
.journal-marker { position: relative; width: 52px; height: 52px; padding: 0; border: 0; background: transparent; }
.journal-marker__art { width: 52px; color: #8d5d37; }
.journal-marker__unread { position: absolute; top: -4px; right: -14px; padding: 2px 6px; color: var(--ink-yellow); background: #32100ee8; transform: rotate(5deg); }
.end-day-button { min-width: 190px; min-height: 48px; padding: 10px 28px; color: var(--ink-bone); }
```

Override the earlier absolute status rule with `position: static; inset: auto; border: 0;` in `.survival-status`. Update command discovery so the stable button can act as a focus fallback:

```ts
private isCommandControl(element: Element | null): element is HTMLButtonElement {
  return element instanceof HTMLButtonElement && element.hasAttribute('data-action');
}

private firstUsableAction(): HTMLButtonElement | null {
  return [...this.anchorButtons.values()].find((button) => (
    button.dataset.action !== '' && this.isUsableCommand(button)
  )) ?? (this.isUsableCommand(this.endDayButton) ? this.endDayButton : null);
}
```

Delete `.boat-anchor[data-action="endDay"] .boat-tooltip`. At `max-width: 980px`, scale or tighten `.survival-top` while keeping interactive targets at least 44 CSS pixels.

- [ ] **Step 6: Run focused tests**

Run: `bunx vitest run tests/SurvivalUI.test.ts tests/BoatWorld.test.ts tests/BoatInteraction.test.ts`

Expected: PASS. The outcome overlay still exists until Task 3.

- [ ] **Step 7: Commit the stable top HUD slice**

```bash
git add src/ui/SurvivalUI.ts src/styles/main.css src/survival/BoatWorld.ts tests/SurvivalUI.test.ts tests/BoatWorld.test.ts
git commit -m "feat: add stable survival day controls"
```

---

### Task 3: Replace outcome dialogs with feedback, sleep cover, and a browsing-only journal

**Files:**
- Modify: `src/ui/SurvivalUI.ts:90-620, 700-1045`
- Modify: `src/styles/main.css:443-538, 619-777`
- Test: `tests/SurvivalUI.test.ts`

**Interfaces:**
- Consumes: `ActionOutcome.message`, `ActionOutcome.accepted`, `JournalEntry`, the existing announcer, modal helpers, and optional reduced-motion media state.
- Produces: `showFeedback(outcome)`, `hideEvent()`, `setSleepCovered(covered)`, `holdSleep()`, `restoreCommandFocus()`, and `showJournal(entries)`.
- Removes: `showOutcome`, `hideOutcome`, `onContinue`, `onSkip`, `onJournalContinue`, automatic journal mode, outcome DOM, Continue, Skip Presentation, and Begin Next Day.

- [ ] **Step 1: Replace outcome and automatic-journal tests with failing presentation tests**

Add feedback and removal assertions:

```ts
it('uses nonmodal feedback and removes outcome continuation controls', async () => {
  const mount = document.createElement('main');
  const ui = createUI(mount);
  ui.showFeedback({ accepted: true, message: 'The patch holds.' });

  expect(mount.querySelector('[data-survival-feedback]')?.textContent).toBe('The patch holds.');
  expect(mount.querySelector('[data-survival-feedback]')?.classList).toContain('is-visible');
  expect(mount.querySelector('[data-survival-feedback]')?.closest('[role="dialog"]')).toBeNull();
  expect(mount.querySelector('[data-outcome]')).toBeNull();
  expect(mount.querySelector('[data-continue]')).toBeNull();
  expect(mount.querySelector('[data-skip]')).toBeNull();
  expect(mount.querySelector('[data-journal-continue]')).toBeNull();
  await Promise.resolve();
  await Promise.resolve();
  expect(mount.querySelector('[data-survival-announcer]')?.textContent).toBe('The patch holds.');
  ui.dispose();
});
```

Add fake-timer coverage for sleep and reduced motion:

```ts
it('covers, holds, and uncovers sleep without becoming interactive', async () => {
  vi.useFakeTimers();
  const mount = document.createElement('main');
  const ui = new SurvivalUI(mount, { matches: false });
  const cover = mount.querySelector<HTMLElement>('[data-sleep-cover]')!;

  const closing = ui.setSleepCovered(true);
  expect(cover.classList).toContain('is-covered');
  expect(cover.getAttribute('aria-hidden')).toBe('true');
  await vi.advanceTimersByTimeAsync(650);
  await closing;

  const hold = ui.holdSleep();
  await vi.advanceTimersByTimeAsync(450);
  await hold;

  const opening = ui.setSleepCovered(false);
  await vi.advanceTimersByTimeAsync(650);
  await opening;
  expect(cover.classList).not.toContain('is-covered');
  vi.useRealTimers();
  ui.dispose();
});
```

Replace the manual/automatic journal test with browsing-only assertions:

```ts
ui.showJournal(journalEntries);
expect(mount.querySelector('[data-journal-close]')).not.toBeNull();
expect(mount.querySelector('[data-journal-continue]')).toBeNull();
document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
expect(close).toHaveBeenCalledOnce();
```

- [ ] **Step 2: Run the UI tests and verify the new API tests fail**

Run: `bunx vitest run tests/SurvivalUI.test.ts`

Expected: FAIL because the UI still creates outcome and automatic journal controls and lacks feedback and sleep APIs.

- [ ] **Step 3: Add feedback and sleep markup, state, and timing**

Add constants and constructor input:

```ts
const SLEEP_TRANSITION_MS = 650;
const SLEEP_HOLD_MS = 450;
const REDUCED_TRANSITION_MS = 1;

constructor(
  mount: HTMLElement,
  private readonly reducedMotion: Pick<MediaQueryList, 'matches'> = { matches: false },
) { /* existing construction */ }
```

Add this nonmodal markup after the announcer:

```html
<div class="survival-feedback" data-survival-feedback aria-hidden="true"></div>
<div class="sleep-cover" data-sleep-cover aria-hidden="true"></div>
```

Implement the public APIs:

```ts
showFeedback(outcome: Pick<ActionOutcome, 'accepted' | 'message'>): void {
  if (this.disposed) return;
  window.clearTimeout(this.feedbackTimer);
  this.feedback.dataset.accepted = String(outcome.accepted);
  this.feedback.textContent = outcome.message;
  this.feedback.classList.remove('is-visible');
  void this.feedback.offsetWidth;
  this.feedback.classList.add('is-visible');
  this.publishAnnouncement(outcome.message);
  this.feedbackTimer = window.setTimeout(() => {
    if (!this.disposed) this.feedback.classList.remove('is-visible');
  }, 2600);
}

setSleepCovered(covered: boolean): Promise<void> {
  if (this.disposed) return Promise.resolve();
  this.sleepCover.classList.toggle('is-covered', covered);
  const delay = this.reducedMotion.matches ? REDUCED_TRANSITION_MS : SLEEP_TRANSITION_MS;
  return new Promise((resolve) => window.setTimeout(resolve, delay));
}

holdSleep(): Promise<void> {
  const delay = this.reducedMotion.matches ? REDUCED_TRANSITION_MS : SLEEP_HOLD_MS;
  return new Promise((resolve) => window.setTimeout(resolve, delay));
}

hideEvent(): void {
  if (!this.disposed) this.hideLayer(this.eventLayer);
}
```

Rename `publishOutcomeAnnouncement()` to `publishAnnouncement()`. Make the existing focus method public and give it a useful default instead of adding a second method with the same name:

```ts
restoreCommandFocus(target: HTMLElement | null = this.latestCommandOrigin): void {
  if (this.disposed) return;
  const destination = this.isUsableCommand(target) ? target : this.firstUsableAction();
  this.latestCommandOrigin = null;
  destination?.focus();
}
```

Declare `feedbackTimer` as `number | undefined` and clear it in `dispose()`.

- [ ] **Step 4: Remove the outcome and automatic journal contracts**

Delete `DELTAS`, the now-unused `ResourceDelta` import, outcome fields, outcome markup, `showOutcome()`, `hideOutcome()`, and outcome modal registration. Remove `this.hideLayer(this.outcomeLayer)` from `showEvent()` and the outcome branch from `focusModal()`. Delete the Continue and Skip controls and callbacks, including their resets in `dispose()`.

Change the journal API and clone the new union:

```ts
showJournal(entries: readonly JournalEntry[]): void {
  if (this.disposed) return;
  this.focusReturnTarget = this.journalMarker;
  this.journalEntries = entries.map((entry) => ({
    ...entry,
    daytime: entry.daytime === null ? null : { ...entry.daytime },
    nighttime: entry.nighttime.kind === 'quiet'
      ? { kind: 'quiet' }
      : { kind: 'event', event: { ...entry.nighttime.event } },
  }));
  this.journalIndex = Math.max(0, this.journalEntries.length - 1);
  this.renderJournalPage();
  this.showLayer(this.journalLayer);
  this.journalTitle.focus();
}
```

Make `Escape` always invoke `onJournalClose` when the journal is topmost. Remove click branches for `data-journal-continue`, `data-continue`, and `data-skip`.

- [ ] **Step 5: Add feedback, sleep, and weathered journal CSS**

Add noninteractive feedback and the eyelid cover:

```css
.survival-feedback {
  position: absolute;
  left: 50%;
  bottom: 72px;
  z-index: 3;
  max-width: min(560px, calc(100vw - 48px));
  padding: 9px 16px;
  color: var(--ink-bone);
  background: #090b0ce8;
  clip-path: polygon(2% 4%, 98% 0, 100% 90%, 4% 100%);
  opacity: 0;
  transform: translate(-50%, 8px);
  pointer-events: none;
}
.survival-feedback.is-visible { opacity: 1; transform: translate(-50%, 0); }
.survival-feedback[data-accepted="false"] { color: #f0a099; }
.sleep-cover {
  position: absolute;
  inset: -10%;
  z-index: 19;
  background: #010202;
  opacity: 0;
  transform: scaleY(0);
  transform-origin: center;
  transition: opacity 650ms ease, transform 650ms ease-in;
  pointer-events: none;
}
.sleep-cover.is-covered { opacity: 1; transform: scaleY(1); }
```

Replace the journal surface and navigation rules with concrete layered texture and integrated controls:

```css
.journal-page {
  isolation: isolate;
  background:
    radial-gradient(circle at 82% 18%, transparent 0 34px, #7c563322 35px 38px, transparent 39px),
    radial-gradient(ellipse at 18% 78%, #8a66421f 0 7%, transparent 22%),
    repeating-linear-gradient(0deg, transparent 0 31px, #68462d1c 32px 33px),
    linear-gradient(90deg, transparent 0 49.4%, #6a44251f 49.8% 50.2%, transparent 50.6%),
    linear-gradient(145deg, #e8d3a5, #c8a976 72%, #af8a58);
}
.journal-page::before {
  content: '';
  position: absolute;
  inset: 0;
  z-index: -1;
  opacity: .28;
  background:
    repeating-radial-gradient(circle at 15% 28%, #3a29181f 0 1px, transparent 1px 5px),
    repeating-linear-gradient(7deg, transparent 0 4px, #fff3cf18 5px 6px);
  mix-blend-mode: multiply;
  pointer-events: none;
}
.journal-page::after {
  content: '';
  position: absolute;
  inset: 10px;
  z-index: -1;
  box-shadow: inset 0 0 28px #5b351e55;
  clip-path: polygon(1% 2%, 98% 0, 100% 97%, 3% 100%, 0 53%);
  pointer-events: none;
}
.journal-page__navigation { position: static; display: contents; }
.journal-page__edge-arrow {
  position: absolute;
  top: 50%;
  width: 48px;
  height: 64px;
  border: 0;
  background: transparent;
  color: #5a3522;
  font-size: 2.4rem;
  transform: translateY(-50%) rotate(-3deg);
}
.journal-page__edge-arrow--previous { left: 10px; }
.journal-page__edge-arrow--next { right: 10px; transform: translateY(-50%) rotate(3deg); }
.journal-page__edge-arrow:disabled { opacity: .2; }
.journal-page__folio { justify-self: center; color: #75543b; font-size: .68rem; letter-spacing: .12em; }
.journal-page__bookmark {
  justify-self: center;
  margin-bottom: -70px;
  min-height: 48px;
  padding: 11px 18px 18px;
  border: 0;
  background: linear-gradient(90deg, #593023, #7e4932 48%, #4a281f);
  color: var(--ink-bone);
  clip-path: polygon(0 0, 100% 0, 88% 82%, 50% 100%, 12% 82%);
}
```

Use markup classes on the existing controls:

```html
<button type="button" class="journal-page__edge-arrow journal-page__edge-arrow--previous" data-journal-previous aria-label="Previous journal page">‹</button>
<span class="journal-page__folio" data-journal-page-count>PAGE 0 OF 0</span>
<button type="button" class="journal-page__edge-arrow journal-page__edge-arrow--next" data-journal-next aria-label="Next journal page">›</button>
<button type="button" class="journal-page__bookmark" data-journal-close>CLOSE JOURNAL</button>
```

Remove `.outcome-deltas` and automatic journal button CSS. Extend the reduced-motion rule:

```css
@media (prefers-reduced-motion: reduce) {
  .sleep-cover { transform: none; transition-duration: 1ms !important; }
  .survival-feedback { transition-duration: 1ms !important; }
}
```

- [ ] **Step 6: Update affected UI behavior tests**

Delete outcome-only tests and replace references as follows:

- use `showFeedback()` for repeated live-announcement and disposal coverage;
- remove outcome from modal-isolation, pause-precedence, and focus-trap lists;
- expect only event controls in event focus trapping;
- remove outcome nodes from cinematic-overlay assertions;
- assert the feedback caption has `pointer-events: none` through the stylesheet contract;
- assert journal arrows, folio, bookmark, fiber/line pseudo-elements, and reduced-motion sleep rules exist;
- expect six physical anchors plus the stable End Day action in the labeled action test.

Use these exact replacements for the two announcement tests and overlay list:

```ts
ui.showFeedback({ accepted: true, message: 'The patch holds.' });
await Promise.resolve();
await Promise.resolve();
ui.showFeedback({ accepted: true, message: 'The patch holds.' });

for (const selector of ['[data-action-options]', '[data-event]', '[data-pause]', '[data-ending]']) {
  const overlay = mount.querySelector<HTMLElement>(selector)!;
  expect(overlay.children).toHaveLength(1);
  expect(overlay.firstElementChild?.classList).toContain('cinematic-overlay__content');
}

ui.showFeedback({ accepted: true, message: 'Too late.' });
ui.dispose();
await Promise.resolve();
await Promise.resolve();
expect(publications).toEqual([]);
```

- [ ] **Step 7: Run focused UI tests**

Run: `bunx vitest run tests/SurvivalUI.test.ts tests/UIArtwork.test.ts`

Expected: PASS with no outcome or automatic-journal DOM contracts.

- [ ] **Step 8: Commit the presentation slice**

```bash
git add src/ui/SurvivalUI.ts src/styles/main.css tests/SurvivalUI.test.ts
git commit -m "feat: streamline survival presentation"
```

---

### Task 4: Replace Continue-gated phase orchestration with cue-driven sequencing

**Files:**
- Modify: `src/survival/SurvivalPhase.ts:1-410`
- Modify: `src/survival/SurvivalPhase.ts:80-100` constructor call to `SurvivalUI`
- Test: `tests/SurvivalPhase.test.ts`
- Test: `tests/SurvivalPhaseFocus.test.ts`

**Interfaces:**
- Consumes: Task 1 End Day codes and journal union; Task 3 `showFeedback`, `hideEvent`, `setSleepCovered`, `holdSleep`, `restoreCommandFocus`, `setJournalUnread`, and `showJournal(entries)`.
- Produces: cue-driven daytime action flow, event-phase-aware resolution, sleep/event/quiet branching, automatic dawn, ending bypass, and per-run `lastReadJournalDay`.
- Removes: `awaitingContinue`, `awaitingJournalDay`, `presentedJournalDays`, `handleContinue`, `handleJournalContinue`, `beginDawnAfterJournal`, `presentLatestJournal`, and generic `present`.

- [ ] **Step 1: Replace old phase tests with failing sequence tests**

Use a small deferred helper for command-lock tests:

```ts
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
}
```

Test an accepted daytime action without Continue:

```ts
it('renders and unlocks an accepted daytime action after its cue', async () => {
  const cue = deferred();
  const perform = vi.fn(() => accepted());
  const showFeedback = vi.fn();
  const setBusy = vi.fn();
  const render = vi.fn();
  const phase = SurvivalPhase.forTest({
    session: { snapshot: vi.fn(() => snapshot()), perform },
    world: { play: vi.fn(() => cue.promise), dispose: vi.fn() },
    ui: { render, showFeedback, setBusy, restoreCommandFocus: vi.fn(), dispose: vi.fn() },
  });

  phase.handleAction('fish');
  phase.handleAction('fish');
  expect(perform).toHaveBeenCalledOnce();
  expect(setBusy).toHaveBeenCalledWith(true);

  cue.resolve();
  await flushPromises();
  expect(render).toHaveBeenCalled();
  expect(showFeedback).toHaveBeenCalledWith(expect.objectContaining({ message: 'Caught one.' }));
  expect(setBusy).toHaveBeenLastCalledWith(false);

  phase.handleAction('fish');
  expect(perform).toHaveBeenCalledTimes(2);
});
```

Test a rejection without cue or lock:

```ts
it('shows rejected feedback without playing or locking', () => {
  const rejected = { ...accepted(), accepted: false, code: 'blocked', cue: 'none' as const };
  const play = vi.fn();
  const showFeedback = vi.fn();
  const setBusy = vi.fn();
  const phase = SurvivalPhase.forTest({
    session: { snapshot: vi.fn(() => snapshot()), perform: vi.fn(() => rejected) },
    world: { play, dispose: vi.fn() },
    ui: { showFeedback, setBusy, dispose: vi.fn() },
  });
  phase.handleAction('rest');
  expect(showFeedback).toHaveBeenCalledWith(rejected);
  expect(play).not.toHaveBeenCalled();
  expect(setBusy).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Add failing End Day tests for event and quiet branches**

Event-night order:

```ts
it('covers sleep before revealing a committed night event', async () => {
  const event = SURVIVAL_EVENTS.find(({ phase }) => phase === 'night')!;
  let current = snapshot();
  const calls: string[] = [];
  const perform = vi.fn(() => {
    current = snapshot({ state: 'nightEvent', pendingEventId: event.id });
    return accepted({ code: 'event-opened', cue: 'nightfall', deltas: {} });
  });
  const phase = SurvivalPhase.forTest({
    session: { snapshot: vi.fn(() => current), perform },
    world: { play: vi.fn(async () => { calls.push('nightfall'); }), dispose: vi.fn() },
    ui: {
      setSleepCovered: vi.fn(async (covered) => { calls.push(covered ? 'cover' : 'uncover'); }),
      setBusy: vi.fn(), render: vi.fn(), showEvent: vi.fn(() => { calls.push('event'); }),
      setJournalUnread: vi.fn(), dispose: vi.fn(),
    },
  });
  phase.handleAction('endDay');
  await flushPromises();
  expect(calls.indexOf('cover')).toBeLessThan(calls.indexOf('event'));
  expect(calls.indexOf('uncover')).toBeLessThan(calls.indexOf('event'));
});
```

Quiet-night order:

```ts
it('holds a quiet night under cover and begins dawn without a journal modal', async () => {
  let current = snapshot({
    state: 'nightEvent',
    journalEntries: [completedEntry(1, { kind: 'quiet' })],
  });
  const beginDawn = vi.fn(() => {
    current = snapshot({ day: 2, state: 'day', journalEntries: current.journalEntries });
    return accepted({ code: 'dawn', cue: 'dawn', deltas: {} });
  });
  const showJournal = vi.fn();
  const phase = SurvivalPhase.forTest({
    session: {
      snapshot: vi.fn(() => current),
      perform: vi.fn(() => accepted({ code: 'quiet-night', cue: 'nightfall', deltas: {} })),
      beginDawn,
    },
    world: { play: vi.fn(() => Promise.resolve()), dispose: vi.fn() },
    ui: {
      setSleepCovered: vi.fn(() => Promise.resolve()), holdSleep: vi.fn(() => Promise.resolve()),
      setBusy: vi.fn(), render: vi.fn(), setJournalUnread: vi.fn(), showJournal, dispose: vi.fn(),
    },
  });
  phase.handleAction('endDay');
  await flushPromises();
  expect(beginDawn).toHaveBeenCalledOnce();
  expect(showJournal).not.toHaveBeenCalled();
});
```

Import `JournalNightRecord` and replace the helper with:

```ts
function completedEntry(
  day: number,
  nighttime: JournalNightRecord = {
    kind: 'event',
    event: {
      phase: 'night',
      eventId: `night-${day}`,
      title: 'Quiet Night',
      prompt: 'The night passed without incident.',
      attemptedItemId: null,
      resolution: 'endure',
      outcomeCode: 'event-resolved',
      outcomeMessage: 'The night remained quiet.',
    },
  },
): JournalEntry {
  return { day, weather: 'calm', daytime: null, nighttime };
}
```

- [ ] **Step 3: Add failing event-phase, terminal, and unread tests**

Cover these cases with separate tests:

```ts
it.each([
  ['dayEvent', false],
  ['nightEvent', true],
] as const)('resolves %s and calls dawn only for night events', async (state, expectsDawn) => {
  let current = snapshot({ state });
  const beginDawn = vi.fn(() => accepted({ code: 'dawn', cue: 'dawn' }));
  const phase = SurvivalPhase.forTest({
    session: {
      snapshot: vi.fn(() => current),
      resolveEvent: vi.fn(() => {
        current = snapshot({ state: state === 'dayEvent' ? 'day' : 'nightEvent' });
        return accepted({ code: 'event-resolved', cue: 'impact' });
      }),
      beginDawn,
    },
    world: { play: vi.fn(() => Promise.resolve()), dispose: vi.fn() },
    ui: { hideEvent: vi.fn(), showFeedback: vi.fn(), setBusy: vi.fn(), render: vi.fn(), setJournalUnread: vi.fn(), dispose: vi.fn() },
  });
  phase.handleEndure();
  await flushPromises();
  expect(beginDawn).toHaveBeenCalledTimes(expectsDawn ? 1 : 0);
});
```

Add these terminal and unread tests:

```ts
it('shows a terminal night ending after its cue and skips dawn', async () => {
  let current = snapshot({ state: 'nightEvent', day: 5 });
  const beginDawn = vi.fn();
  const showEnding = vi.fn();
  const phase = SurvivalPhase.forTest({
    session: {
      snapshot: vi.fn(() => current),
      resolveEvent: vi.fn(() => {
        current = snapshot({
          state: 'sunk',
          day: 5,
          journalEntries: [completedEntry(5)],
        });
        return accepted({ code: 'event-resolved', cue: 'sinking' });
      }),
      beginDawn,
    },
    world: { play: vi.fn(() => Promise.resolve()), dispose: vi.fn() },
    ui: {
      hideEvent: vi.fn(), showFeedback: vi.fn(), setBusy: vi.fn(), render: vi.fn(),
      setJournalUnread: vi.fn(), showEnding, dispose: vi.fn(),
    },
  });
  phase.handleEndure();
  await flushPromises();
  expect(showEnding).toHaveBeenCalledOnce();
  expect(beginDawn).not.toHaveBeenCalled();
});

it('marks completed history unread and clears it when the journal opens', () => {
  const entries = [completedEntry(1)];
  const setJournalUnread = vi.fn();
  const showJournal = vi.fn();
  const beginDawn = vi.fn();
  const ui: Partial<SurvivalUI> = {
    render: vi.fn(), setJournalUnread, showJournal, dispose: vi.fn(),
  };
  const phase = SurvivalPhase.forTest({
    session: {
      snapshot: vi.fn(() => snapshot({ day: 2, journalEntries: entries })),
      beginDawn,
    },
    world: { dispose: vi.fn() },
    ui,
  });
  phase.start();
  expect(setJournalUnread).toHaveBeenLastCalledWith(true);
  ui.onJournalOpen?.();
  expect(showJournal).toHaveBeenCalledWith(entries);
  expect(setJournalUnread).toHaveBeenLastCalledWith(false);
  expect(beginDawn).not.toHaveBeenCalled();
});
```

- [ ] **Step 4: Run the phase tests and verify the old Continue pipeline fails them**

Run: `bunx vitest run tests/SurvivalPhase.test.ts tests/SurvivalPhaseFocus.test.ts`

Expected: FAIL because phase sequencing still stops at outcome and automatic journal gates and lacks sleep and unread calls.

- [ ] **Step 5: Construct `SurvivalUI` with reduced-motion state and replace phase fields**

Change production construction:

```ts
new SurvivalUI(context.mount, context.reducedMotion)
```

Replace the continuation fields with:

```ts
private lastReadJournalDay = 0;
private pendingDayEventDay: number | null = null;
private readonly requestedDayEventDays = new Set<number>();
```

Keep `busy`, pause, visibility, terminal, and disposal fields.

Add one helper so every sequence updates the phase and UI lock together:

```ts
private setBusy(busy: boolean): void {
  this.busy = busy;
  this.ui.setBusy?.(busy);
}
```

- [ ] **Step 6: Implement accepted, rejected, and scheduled daytime action sequencing**

Use focused async methods:

```ts
handleAction(action: DayActionId, option?: DayActionOption): void {
  if (!this.canAcceptCommand()) return;
  const selectedOption = action === 'repair' ? this.repairOption() : option;
  const outcome = this.session.perform?.(action, selectedOption);
  if (outcome === undefined) return;
  if (!outcome.accepted) {
    this.ui.showFeedback?.(outcome);
    return;
  }
  if (action === 'endDay') {
    void this.runEndDay(outcome);
    return;
  }
  if ((outcome.deltas.energy ?? 0) < 0) {
    const day = this.session.snapshot().day;
    if (!this.requestedDayEventDays.has(day)) this.pendingDayEventDay = day;
  }
  void this.runDayAction(outcome);
}

private async runDayAction(outcome: ActionOutcome): Promise<void> {
  this.setBusy(true);
  await (this.world.play?.(outcome.cue) ?? Promise.resolve());
  if (this.disposed) return;
  let snapshot = this.renderSnapshot(false, false);
  this.ui.showFeedback?.(outcome);
  if (isTerminal(snapshot.state)) {
    this.setBusy(false);
    this.presentTerminalOnce(snapshot);
    return;
  }
  snapshot = await this.openScheduledDayEvent(snapshot);
  if (this.disposed) return;
  this.setBusy(false);
  if (snapshot.pendingEventId !== null) this.openPendingEvent(snapshot);
  else this.ui.restoreCommandFocus?.();
}
```

Implement the scheduled event helper:

```ts
private async openScheduledDayEvent(snapshot: SurvivalSnapshot): Promise<SurvivalSnapshot> {
  if (
    this.pendingDayEventDay === null
    || snapshot.day !== this.pendingDayEventDay
    || snapshot.state !== 'day'
  ) return snapshot;

  const eventDay = this.pendingDayEventDay;
  this.pendingDayEventDay = null;
  this.requestedDayEventDays.add(eventDay);
  const eventOutcome = this.session.requestDayEvent?.();
  if (eventOutcome === undefined) return snapshot;
  if (!eventOutcome.accepted) {
    this.ui.showFeedback?.(eventOutcome);
    return this.renderSnapshot(false, false);
  }
  await (this.world.play?.(eventOutcome.cue) ?? Promise.resolve());
  if (this.disposed) return snapshot;
  return this.renderSnapshot(false, false);
}
```

- [ ] **Step 7: Implement sleep, quiet-night, and dawn sequencing**

```ts
private async runEndDay(outcome: ActionOutcome): Promise<void> {
  this.setBusy(true);
  await Promise.all([
    this.world.play?.(outcome.cue) ?? Promise.resolve(),
    this.ui.setSleepCovered?.(true) ?? Promise.resolve(),
  ]);
  if (this.disposed) return;
  let snapshot = this.renderSnapshot(false, false);

  if (outcome.code === 'quiet-night') {
    await (this.ui.holdSleep?.() ?? Promise.resolve());
    if (this.disposed) return;
    snapshot = await this.runDawn();
    if (this.disposed) return;
    await (this.ui.setSleepCovered?.(false) ?? Promise.resolve());
    if (this.disposed) return;
    this.setBusy(false);
    this.presentTerminalOnce(snapshot);
    this.ui.restoreCommandFocus?.();
    return;
  }

  await (this.ui.setSleepCovered?.(false) ?? Promise.resolve());
  if (this.disposed) return;
  this.setBusy(false);
  this.openPendingEvent(snapshot);
}

private async runDawn(): Promise<SurvivalSnapshot> {
  const dawn = this.session.beginDawn?.();
  if (dawn?.accepted) await (this.world.play?.(dawn.cue) ?? Promise.resolve());
  if (this.disposed) return this.session.snapshot();
  return this.renderSnapshot(false, false);
}
```

Treat any accepted End Day code other than `quiet-night` as the committed event branch. Keep the invariant test that event branches expose a pending event before `openPendingEvent()`.

- [ ] **Step 8: Implement event resolution and unread journal behavior**

Route both event entry points through one method:

```ts
handleEventItem(itemId: ItemId): void { this.resolveEvent(itemId); }
handleEndure(): void { this.resolveEvent(null); }

private resolveEvent(itemId: ItemId | null): void {
  if (!this.canAcceptCommand()) return;
  const eventState = this.session.snapshot().state;
  const outcome = this.session.resolveEvent?.(itemId);
  if (outcome === undefined) return;
  if (!outcome.accepted) {
    this.ui.showFeedback?.(outcome);
    return;
  }
  this.ui.hideEvent?.();
  void this.runEventResolution(outcome, eventState);
}

private async runEventResolution(
  outcome: ActionOutcome,
  eventState: Extract<SurvivalState, 'dayEvent' | 'nightEvent'> | SurvivalState,
): Promise<void> {
  this.setBusy(true);
  await (this.world.play?.(outcome.cue) ?? Promise.resolve());
  if (this.disposed) return;
  let snapshot = this.renderSnapshot(false, false);
  this.ui.showFeedback?.(outcome);
  if (isTerminal(snapshot.state)) {
    this.setBusy(false);
    this.presentTerminalOnce(snapshot);
    return;
  }
  if (eventState === 'nightEvent') snapshot = await this.runDawn();
  if (this.disposed) return;
  this.setBusy(false);
  this.presentTerminalOnce(snapshot);
  this.ui.restoreCommandFocus?.();
}
```

Track unread state from snapshots:

```ts
private latestJournalDay(snapshot: SurvivalSnapshot): number {
  return snapshot.journalEntries.at(-1)?.day ?? 0;
}

private syncJournalUnread(snapshot: SurvivalSnapshot): void {
  this.ui.setJournalUnread?.(this.latestJournalDay(snapshot) > this.lastReadJournalDay);
}

handleJournalOpen(): void {
  if (this.disposed || this.busy || this.paused || this.documentIsHidden()) return;
  const snapshot = this.session.snapshot();
  this.lastReadJournalDay = this.latestJournalDay(snapshot);
  this.ui.setJournalUnread?.(false);
  this.ui.showJournal?.(snapshot.journalEntries);
}
```

Call `syncJournalUnread(snapshot)` inside `renderSnapshot()` after `ui.render()`.

- [ ] **Step 9: Remove old callback wiring and simplify command gates**

Delete Continue, Skip, and journal-continuation wiring. Keep:

```ts
this.ui.onAction = (action, option) => this.handleAction(action, option);
this.ui.onEventItem = (itemId) => this.handleEventItem(itemId);
this.ui.onEndure = () => this.handleEndure();
this.ui.onRestart = () => this.requestRestart();
this.ui.onPauseChange = (paused) => this.setPaused(paused);
this.ui.onJournalOpen = () => this.handleJournalOpen();
this.ui.onJournalClose = () => this.handleJournalClose();
```

Update `canAcceptCommand()` to gate only disposed, busy, paused, hidden-document, and terminal states. Remove continuation and automatic-journal checks from `presentTerminalOnce()`.

- [ ] **Step 10: Update focus integration for the stable End Day fallback**

Remove `horizonAnchor` from `tests/SurvivalPhaseFocus.test.ts`. Let the test world project only the can while it exists:

```ts
let anchors: BoatInteractionAnchor[] = [canAnchor];
syncInventory(current: SurvivalSnapshot) {
  anchors = current.food > 0 ? [canAnchor] : [];
}
```

Click Eat, await its cue, and assert focus falls back to the stable top control:

```ts
expect(document.activeElement).toBe(mount.querySelector('[data-action="endDay"]'));
```

- [ ] **Step 11: Run phase, focus, UI, and session tests**

Run: `bunx vitest run tests/SurvivalPhase.test.ts tests/SurvivalPhaseFocus.test.ts tests/SurvivalUI.test.ts tests/SurvivalSession.test.ts`

Expected: PASS with no Continue-driven paths or forced journal presentation.

- [ ] **Step 12: Commit the orchestration slice**

```bash
git add src/survival/SurvivalPhase.ts tests/SurvivalPhase.test.ts tests/SurvivalPhaseFocus.test.ts
git commit -m "feat: streamline survival day transitions"
```

---

### Task 5: Update player documentation and verify the complete flow

**Files:**
- Modify: `README.md:40-70`
- Verify: all source and test files changed in Tasks 1 through 4

**Interfaces:**
- Consumes: the completed survival UI and flow.
- Produces: accurate controls and gameplay documentation plus final automated and browser evidence.

- [ ] **Step 1: Update README controls and survival flow copy**

Replace the centered marker and night-flow paragraphs with copy that matches the shipped behavior:

```md
| Top-center journal button | Open completed entries; `NEW` marks unread history |
| Top-center End Day button / `7` | Fade into sleep and advance to an event or quiet night |

Accepted daytime actions play through the lifeboat scene, update the condition display, and leave a short non-blocking caption. Rejected actions explain the reason without opening a dialog.

End Day fades the survivor to sleep. Most nights open an event decision; some nights pass quietly. Resolving a nighttime event or completing a quiet night advances to dawn. Each completed night adds an unread journal entry, and the player can open the journal later without advancing time.
```

Remove statements that say the journal opens after each nighttime outcome or that Continue begins dawn.

- [ ] **Step 2: Run the complete automated verification**

Run: `bun run test`

Expected: all Vitest files PASS.

Run: `bun run typecheck`

Expected: TypeScript exits 0 with no diagnostics.

Run: `bun run build`

Expected: TypeScript and Vite production build exit 0 and write `dist/`.

- [ ] **Step 3: Inspect source contracts for removed UI**

Run:

```bash
rg -n "showOutcome|hideOutcome|onContinue|onSkip|onJournalContinue|data-outcome|data-continue|data-skip|data-journal-continue|horizon-anchor" src tests README.md
```

Expected: no survival outcome, continuation, automatic-journal, or horizon-anchor matches. Unrelated uses of the word `horizon` in sky, ocean, event prose, and ending prose remain valid.

- [ ] **Step 4: Verify daytime action and focus behavior in the browser**

Run: `bun run dev -- --host 127.0.0.1`

At 1280 by 720:

1. Enter survival with at least one consumable and one durable action item.
2. Trigger an accepted action and confirm the cue, meter change, caption, and input release occur without an outcome overlay.
3. Trigger a rejected action and confirm its caption appears without command lock.
4. Consume the last instance behind the focused action and confirm focus moves to the stable End Day button.
5. Press `7` and confirm it invokes the same End Day control.

- [ ] **Step 5: Verify event night, quiet night, journal, responsive, and reduced-motion states**

Use deterministic test seams or repeat seeded runs to inspect both branches:

1. Event night: End Day covers the scene, reveals night, opens the event, accepts an item or Endure choice, shows a short result caption, then reaches dawn.
2. Quiet night: End Day covers the scene, holds on darkness, and reaches dawn without an event overlay.
3. Confirm neither path opens the journal.
4. Confirm `NEW` appears after the completed night, opening the journal clears it, and closing the journal changes no day or resource value.
5. Browse empty, first, middle, and last pages. Check edge arrows, folio, bookmark, paper texture, focus trap, `Escape`, and focus restoration.
6. Repeat the layout check at 1920 by 1080. Confirm top-center controls do not overlap the upper-right meters.
7. Enable reduced motion and confirm the sleep cover uses the brief crossfade without changing sequence order.

- [ ] **Step 6: Commit documentation and any verified test corrections**

```bash
git add README.md
git commit -m "docs: update survival night flow"
```

- [ ] **Step 7: Confirm the final worktree scope**

Run: `git status --short`

Expected: no uncommitted files from this implementation. Preserve unrelated pre-existing files and changes rather than adding them to these commits.

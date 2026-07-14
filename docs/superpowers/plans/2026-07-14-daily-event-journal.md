# Daily Event Journal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an automatic, browsable journal that turns each completed day's daytime and nighttime events into a short first-person story.

**Architecture:** A pure journal module owns immutable record types and prose formatting. `SurvivalSession` records event facts and finalizes one entry after each resolved night; `SurvivalPhase` gates dawn or an ending behind automatic journal presentation; `SurvivalUI` owns the modal, page index, keyboard behavior, and centered marker button.

**Tech Stack:** TypeScript 5.9, Three.js 0.180, DOM/CSS, Vitest 3.2 with jsdom, Vite 7, Bun.

## Global Constraints

- Record only resolved daytime and nighttime events; do not record fishing, diving, eating, repairing, treating, resting, resource deltas, charges, or unused inventory.
- Mention an item only when the player attempted it during an event.
- Use short first-person, past-tense prose; use `The daylight hours passed quietly.` when no daytime event occurred.
- Present the automatic journal after the nighttime outcome and before dawn or the terminal ending.
- Manual browsing must never mutate survival state or advance time.
- Keep all completed entries browsable for the current run, newest first; do not persist them across restarts.
- Keep desktop keyboard access, modal focus trapping, reduced-motion support, and responsive short-viewport behavior.
- Use original CSS and existing inline artwork only; add no external art, runtime network calls, or dependencies.

## File Structure

- Create `src/survival/journal.ts`: typed journal records, display copy, and the pure formatter.
- Create `tests/survivalJournal.test.ts`: formatter contracts for quiet days, item attempts, unsuitable items, and endurance.
- Modify `src/survival/survivalTypes.ts`: expose read-only journal history in `SurvivalSnapshot`.
- Modify `src/survival/SurvivalSession.ts`: capture resolved event facts and finalize one entry per night.
- Modify `src/ui/SurvivalUI.ts`: marker button, journal modal, paging, callbacks, focus, and keyboard behavior.
- Modify `src/survival/SurvivalPhase.ts`: sequence outcome -> journal -> dawn/ending and wire manual browsing.
- Modify `src/styles/main.css`: centered worn-paper page, marker focus state, responsive bounds, and reduced motion.
- Modify `tests/SurvivalSession.test.ts`: session history and defensive-copy coverage.
- Modify `tests/SurvivalPhase.test.ts`: orchestration coverage and snapshot fixture.
- Modify `tests/SurvivalUI.test.ts`: modal, navigation, focus, keyboard, and style contracts.
- Modify `tests/BoatWorld.test.ts`: add the required empty journal history to its explicit snapshot fixture.
- Modify `README.md`: document the journal marker and end-of-day flow.

---

### Task 1: Journal records and pure prose formatter

**Files:**
- Create: `src/survival/journal.ts`
- Create: `tests/survivalJournal.test.ts`

**Interfaces:**
- Consumes: `ItemId`, `ITEM_LABELS`, and `WeatherId`.
- Produces: `JournalResolution`, `JournalEventRecord`, `JournalEntry`, `JournalPageCopy`, and `formatJournalEntry(entry: JournalEntry): JournalPageCopy`.

- [ ] **Step 1: Write failing formatter tests**

Create `tests/survivalJournal.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  formatJournalEntry,
  type JournalEntry,
  type JournalEventRecord,
} from '../src/survival/journal';

const event = (overrides: Partial<JournalEventRecord> = {}): JournalEventRecord => ({
  phase: 'night',
  eventId: 'night-hull-impact',
  title: 'Hull Impact',
  prompt: 'Something heavy knocked against the hull in the darkness.',
  attemptedItemId: 'flashlight',
  resolution: 'suitableItem',
  outcomeCode: 'event-resolved',
  outcomeMessage: 'The beam let me fend the debris away.',
  ...overrides,
});

const entry = (overrides: Partial<JournalEntry> = {}): JournalEntry => ({
  day: 4,
  weather: 'overcast',
  daytime: null,
  nighttime: event(),
  ...overrides,
});

describe('formatJournalEntry', () => {
  it('writes a quiet day and a suitable item attempt as story prose', () => {
    const page = formatJournalEntry(entry());
    expect(page).toEqual({
      heading: 'DAY 4',
      weather: 'OVERCAST',
      daytime: 'The daylight hours passed quietly.',
      nighttime: 'That night, I encountered hull impact. I used the flashlight to handle it, and it helped.',
    });
  });

  it('describes an unsuitable item without repeating the system fallback', () => {
    const page = formatJournalEntry(entry({
      daytime: event({
        phase: 'day',
        eventId: 'day-sudden-squall',
        title: 'Sudden Squall',
        prompt: 'A black squall line bore down before I could prepare.',
        attemptedItemId: 'waterJug',
        resolution: 'unsuitableItem',
        outcomeMessage: 'That item cannot help. The squall tore open weak seams in the hull.',
      }),
    }));
    expect(page.daytime).toBe('During the day, I encountered sudden squall. I tried the water jug, but it did not help.');
    expect(page.daytime).not.toContain('That item cannot help');
  });

  it('describes endurance without naming inventory or resource deltas', () => {
    const page = formatJournalEntry(entry({
      nighttime: event({
        attemptedItemId: null,
        resolution: 'endure',
        outcomeMessage: 'Repeated impacts cracked the hull.',
      }),
    }));
    expect(page.nighttime).toBe('That night, I encountered hull impact. I faced it without using any supplies.');
    expect(JSON.stringify(page)).not.toMatch(/charges|repairMaterial|hull:\s*-/i);
  });
});
```

- [ ] **Step 2: Run the new test and verify the missing module failure**

Run: `bun run test -- tests/survivalJournal.test.ts`

Expected: FAIL because `src/survival/journal.ts` does not exist.

- [ ] **Step 3: Implement the journal records and formatter**

Create `src/survival/journal.ts`:

```ts
import { ITEM_LABELS, type ItemId } from '../game/ItemState';
import type { WeatherId } from './survivalTypes';

export type JournalResolution = 'suitableItem' | 'unsuitableItem' | 'endure';

export interface JournalEventRecord {
  phase: 'day' | 'night';
  eventId: string;
  title: string;
  prompt: string;
  attemptedItemId: ItemId | null;
  resolution: JournalResolution;
  outcomeCode: string;
  outcomeMessage: string;
}

export interface JournalEntry {
  day: number;
  weather: WeatherId;
  daytime: JournalEventRecord | null;
  nighttime: JournalEventRecord;
}

export interface JournalPageCopy {
  heading: string;
  weather: string;
  daytime: string;
  nighttime: string;
}

const WEATHER_LABELS: Readonly<Record<WeatherId, string>> = {
  calm: 'CALM',
  overcast: 'OVERCAST',
  squall: 'SQUALL',
};

function formatEvent(record: JournalEventRecord): string {
  const timing = record.phase === 'day' ? 'During the day' : 'That night';
  const situation = `${timing}, I encountered ${record.title.toLocaleLowerCase('en-US')}.`;
  if (record.resolution === 'endure') {
    return `${situation} I faced it without using any supplies.`;
  }
  const label = ITEM_LABELS[record.attemptedItemId!].toLocaleLowerCase('en-US');
  const action = record.resolution === 'suitableItem'
    ? `I used the ${label} to handle it, and it helped.`
    : `I tried the ${label}, but it did not help.`;
  return `${situation} ${action}`;
}

export function formatJournalEntry(entry: JournalEntry): JournalPageCopy {
  return {
    heading: `DAY ${entry.day}`,
    weather: WEATHER_LABELS[entry.weather],
    daytime: entry.daytime === null
      ? 'The daylight hours passed quietly.'
      : formatEvent(entry.daytime),
    nighttime: formatEvent(entry.nighttime),
  };
}
```

- [ ] **Step 4: Run formatter tests**

Run: `bun run test -- tests/survivalJournal.test.ts`

Expected: PASS, 3 tests.

- [ ] **Step 5: Commit the journal domain unit**

```powershell
git add src/survival/journal.ts tests/survivalJournal.test.ts
git commit -m "feat: add survival journal formatter"
```

---

### Task 2: Session-owned completed journal history

**Files:**
- Modify: `src/survival/survivalTypes.ts`
- Modify: `src/survival/SurvivalSession.ts`
- Modify: `tests/SurvivalSession.test.ts`
- Modify: `tests/SurvivalPhase.test.ts`
- Modify: `tests/BoatWorld.test.ts`

**Interfaces:**
- Consumes: `JournalEventRecord`, `JournalEntry`, `JournalResolution`, `SurvivalEventDefinition`, and `ItemId | null` from event resolution.
- Produces: `SurvivalSnapshot.journalEntries: readonly JournalEntry[]`; every resolved night appends one completed entry.

- [ ] **Step 1: Add failing session-history tests and update explicit snapshot fixtures**

Append to `tests/SurvivalSession.test.ts` inside the existing `describe` block:

```ts
  it('finalizes one journal entry from resolved day and night events', () => {
    const session = new SurvivalSession(saved('waterJug', 'flashlight'), {
      seed: 9,
      random: sequenceRandom([0]),
      initialEventId: 'day-heat-haze',
    });
    session.resolveEvent('waterJug');
    session.perform('endDay');
    session.resolveEvent('flashlight');

    expect(session.snapshot().journalEntries).toEqual([expect.objectContaining({
      day: 1,
      weather: 'calm',
      daytime: expect.objectContaining({
        eventId: 'day-heat-haze',
        attemptedItemId: 'waterJug',
        resolution: 'suitableItem',
      }),
      nighttime: expect.objectContaining({
        phase: 'night',
        attemptedItemId: 'flashlight',
      }),
    })]);
  });

  it('records a quiet day and protects internal history from snapshot mutation', () => {
    const session = new SurvivalSession(saved(), {
      seed: 10,
      initialEventId: 'night-calm-water',
    });
    session.resolveEvent(null);
    const first = session.snapshot();
    expect(first.journalEntries).toHaveLength(1);
    expect(first.journalEntries[0]!.daytime).toBeNull();
    (first.journalEntries as unknown as Array<{ day: number }>)[0]!.day = 99;
    expect(session.snapshot().journalEntries[0]!.day).toBe(1);
    expect(session.resolveEvent(null).accepted).toBe(false);
    expect(session.snapshot().journalEntries).toHaveLength(1);
  });

  it('records unsuitable item attempts without consuming the item', () => {
    const session = new SurvivalSession(saved('waterJug'), {
      seed: 11,
      initialEventId: 'night-hull-impact',
    });
    const charges = session.snapshot().inventory.waterJug.charges;
    session.resolveEvent('waterJug');
    expect(session.snapshot().journalEntries[0]!.nighttime).toMatchObject({
      attemptedItemId: 'waterJug',
      resolution: 'unsuitableItem',
    });
    expect(session.snapshot().inventory.waterJug.charges).toBe(charges);
  });

  it('finalizes the journal before a night consequence ends the run', () => {
    const session = new SurvivalSession(saved(), {
      seed: 12,
      initial: { hull: 5 },
      initialEventId: 'night-hull-impact',
    });
    session.resolveEvent(null);
    expect(session.snapshot()).toMatchObject({
      state: 'sunk',
      journalEntries: [expect.objectContaining({ day: 1 })],
    });
  });
```

Add `journalEntries: []` immediately before `pendingEventId` in the explicit `SurvivalSnapshot` factories in `tests/SurvivalPhase.test.ts` and `tests/BoatWorld.test.ts`.

- [ ] **Step 2: Run the focused session test and verify the type/property failures**

Run: `bun run test -- tests/SurvivalSession.test.ts tests/SurvivalPhase.test.ts tests/BoatWorld.test.ts`

Expected: FAIL because `SurvivalSnapshot` has no `journalEntries` property and the session does not record event history.

- [ ] **Step 3: Extend the snapshot contract**

Add a type import and property to `src/survival/survivalTypes.ts`:

```ts
import type { JournalEntry } from './journal';
```

Insert the new property immediately after `actedToday` in the existing interface:

```ts
  readonly journalEntries: readonly JournalEntry[];
```

- [ ] **Step 4: Capture records and finalize history in `SurvivalSession`**

Add journal imports, fields, and helpers to `src/survival/SurvivalSession.ts`:

```ts
import type {
  JournalEntry,
  JournalEventRecord,
  JournalResolution,
} from './journal';
```

```ts
  private pendingJournalDaytime: JournalEventRecord | null = null;
  private pendingJournalNighttime: JournalEventRecord | null = null;
  private readonly journalEntries: JournalEntry[] = [];
```

In `resolveEvent`, retain the existing validation, response selection, consumption, state, and `commit` behavior, but record the accepted result before returning:

```ts
    const resolution: JournalResolution = itemId === null
      ? 'endure'
      : usable ? 'suitableItem' : 'unsuitableItem';
    if (usable && matching!.consume) this.consumeCharge(matching!.itemId);
    this.lastEventId = event.id;
    this.lastSeenDay.set(event.id, this.day);
    this.pendingEvent = null;
    this.pendingEventId = null;

    if (usable && matching!.rescue === true) this.state = 'rescued';
    const outcome = this.commit('event-resolved', response.message, { ...response.deltas }, response.cue);
    this.recordJournalEvent(event, itemId, resolution, outcome);

    if (!this.isTerminal()) {
      if (phase === 'day') this.state = 'day';
      else this.state = 'nightEvent';
    }
    return outcome;
```

Add these helpers:

```ts
  private recordJournalEvent(
    event: SurvivalEventDefinition,
    attemptedItemId: ItemId | null,
    resolution: JournalResolution,
    outcome: ActionOutcome,
  ): void {
    const record: JournalEventRecord = {
      phase: event.phase,
      eventId: event.id,
      title: event.title,
      prompt: event.prompt,
      attemptedItemId,
      resolution,
      outcomeCode: outcome.code,
      outcomeMessage: outcome.message,
    };
    if (event.phase === 'day') {
      this.pendingJournalDaytime = record;
      return;
    }
    this.pendingJournalNighttime = record;
    this.finalizeJournalDay();
  }

  private finalizeJournalDay(): void {
    if (this.pendingJournalNighttime === null) return;
    if (this.journalEntries.some((entry) => entry.day === this.day)) return;
    this.journalEntries.push({
      day: this.day,
      weather: this.weather,
      daytime: this.pendingJournalDaytime,
      nighttime: this.pendingJournalNighttime,
    });
  }

  private journalSnapshot(): readonly JournalEntry[] {
    return this.journalEntries.map((entry) => ({
      ...entry,
      daytime: entry.daytime === null ? null : { ...entry.daytime },
      nighttime: { ...entry.nighttime },
    }));
  }
```

Return `journalEntries: this.journalSnapshot()` from `snapshot()`. In `beginDawn()`, after incrementing the day, clear both pending records:

```ts
    this.day += 1;
    this.pendingJournalDaytime = null;
    this.pendingJournalNighttime = null;
```

- [ ] **Step 5: Run session, phase, and world tests**

Run: `bun run test -- tests/SurvivalSession.test.ts tests/SurvivalPhase.test.ts tests/BoatWorld.test.ts`

Expected: PASS.

- [ ] **Step 6: Type-check the snapshot seam**

Run: `bun run typecheck`

Expected: PASS with every explicit snapshot fixture supplying `journalEntries`.

- [ ] **Step 7: Commit session history**

```powershell
git add src/survival/survivalTypes.ts src/survival/SurvivalSession.ts tests/SurvivalSession.test.ts tests/SurvivalPhase.test.ts tests/BoatWorld.test.ts
git commit -m "feat: record completed survival days"
```

---

### Task 3: Browsable journal modal and marker button

**Files:**
- Modify: `src/ui/SurvivalUI.ts`
- Modify: `tests/SurvivalUI.test.ts`

**Interfaces:**
- Consumes: `readonly JournalEntry[]` and `formatJournalEntry`.
- Produces: callbacks `onJournalOpen`, `onJournalClose`, and `onJournalContinue`; methods `showJournal(entries, mode)` and `hideJournal()` where `mode` is `'manual' | 'automatic'`.

- [ ] **Step 1: Add failing journal UI tests**

Add imports and a fixture to `tests/SurvivalUI.test.ts`:

```ts
import type { JournalEntry } from '../src/survival/journal';

const journalEntries: readonly JournalEntry[] = [1, 2].map((day) => ({
  day,
  weather: day === 1 ? 'calm' : 'overcast',
  daytime: null,
  nighttime: {
    phase: 'night',
    eventId: `night-${day}`,
    title: 'Quiet Night',
    prompt: `Night ${day} settled over the boat.`,
    attemptedItemId: null,
    resolution: 'endure',
    outcomeCode: 'event-resolved',
    outcomeMessage: 'I made it through until morning.',
  },
}));
```

Add these tests inside the existing suite:

```ts
  it('opens the marker through a callback and browses completed pages newest first', () => {
    const mount = document.createElement('main');
    document.body.append(mount);
    const ui = createUI(mount);
    const open = vi.fn();
    ui.onJournalOpen = open;
    mount.querySelector<HTMLButtonElement>('[data-journal-open]')!.click();
    expect(open).toHaveBeenCalledOnce();

    ui.showJournal(journalEntries, 'manual');
    expect(mount.querySelector('[data-journal-title]')?.textContent).toBe('DAY 2');
    expect(mount.querySelector('[data-journal-page-count]')?.textContent).toBe('PAGE 2 OF 2');
    mount.querySelector<HTMLButtonElement>('[data-journal-previous]')!.click();
    expect(mount.querySelector('[data-journal-title]')?.textContent).toBe('DAY 1');
    expect(mount.querySelector<HTMLButtonElement>('[data-journal-previous]')!.disabled).toBe(true);
    mount.querySelector<HTMLButtonElement>('[data-journal-next]')!.click();
    expect(mount.querySelector('[data-journal-title]')?.textContent).toBe('DAY 2');
  });

  it('separates manual close from automatic next-day continuation', () => {
    const mount = document.createElement('main');
    document.body.append(mount);
    const ui = createUI(mount);
    const close = vi.fn();
    const nextDay = vi.fn();
    ui.onJournalClose = close;
    ui.onJournalContinue = nextDay;

    ui.showJournal(journalEntries, 'manual');
    expect(mount.querySelector<HTMLButtonElement>('[data-journal-close]')!.hidden).toBe(false);
    expect(mount.querySelector<HTMLButtonElement>('[data-journal-continue]')!.hidden).toBe(true);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(close).toHaveBeenCalledOnce();

    ui.showJournal(journalEntries, 'manual');
    mount.querySelector<HTMLButtonElement>('[data-journal-close]')!.click();
    expect(close).toHaveBeenCalledTimes(2);

    ui.showJournal(journalEntries, 'automatic');
    expect(mount.querySelector<HTMLButtonElement>('[data-journal-close]')!.hidden).toBe(true);
    expect(mount.querySelector<HTMLButtonElement>('[data-journal-continue]')!.hidden).toBe(false);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(close).toHaveBeenCalledTimes(2);
    mount.querySelector<HTMLButtonElement>('[data-journal-continue]')!.click();
    expect(nextDay).toHaveBeenCalledOnce();
  });

  it('shows empty history safely and traps focus in the journal', () => {
    const mount = document.createElement('main');
    document.body.append(mount);
    const ui = createUI(mount);
    ui.showJournal([], 'manual');
    expect(mount.querySelector('[data-journal-title]')?.textContent).toBe('NO COMPLETED ENTRIES YET');
    const previous = mount.querySelector<HTMLButtonElement>('[data-journal-previous]')!;
    const close = mount.querySelector<HTMLButtonElement>('[data-journal-close]')!;
    expect(previous.disabled).toBe(true);
    close.focus();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }));
    expect(document.activeElement).toBe(close);
    expect(mount.querySelector('[data-boat-anchors]')?.hasAttribute('inert')).toBe(true);
  });

  it('restores focus to the marker after manual Escape closes the journal', () => {
    const mount = document.createElement('main');
    document.body.append(mount);
    const ui = createUI(mount);
    const marker = mount.querySelector<HTMLButtonElement>('[data-journal-open]')!;
    ui.onJournalClose = () => ui.hideJournal();
    marker.focus();
    ui.showJournal(journalEntries, 'manual');
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(document.activeElement).toBe(marker);
    expect(mount.querySelector('[data-journal]')?.hasAttribute('inert')).toBe(true);
  });
```

- [ ] **Step 2: Run UI tests and verify missing journal API failures**

Run: `bun run test -- tests/SurvivalUI.test.ts`

Expected: FAIL because the marker is not a button and the journal methods, callbacks, and modal do not exist.

- [ ] **Step 3: Add marker and journal modal markup**

In `src/ui/SurvivalUI.ts`, import journal types/formatter:

```ts
import { formatJournalEntry, type JournalEntry } from '../survival/journal';
```

Replace the journal `<header>` with:

```html
<button type="button" class="survival-status journal-marker" data-journal-open aria-label="Open completed journal entries">
  ${uiArtwork('journal', 'journal-marker__art')}
  <span class="survival-status__time"><span data-day>DAY 1</span><span data-phase>DAYLIGHT</span></span>
  <span class="survival-status__weather"><span class="eyebrow">WEATHER</span><strong data-weather>CALM</strong></span>
</button>
```

Insert this modal before the pause layer:

```html
<section class="survival-overlay journal-overlay" data-journal role="dialog" aria-modal="true" aria-hidden="true" aria-label="Survival journal" inert>
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
      <button type="button" class="secondary-action" data-journal-previous>PREVIOUS</button>
      <span data-journal-page-count>PAGE 0 OF 0</span>
      <button type="button" class="secondary-action" data-journal-next>NEXT</button>
    </nav>
    <button type="button" class="secondary-action" data-journal-close>CLOSE JOURNAL</button>
    <button type="button" class="primary-action timber-action" data-journal-continue hidden>BEGIN NEXT DAY</button>
  </article>
</section>
```

- [ ] **Step 4: Add journal state, methods, click routing, focus, and Escape behavior**

Add public callbacks and private state:

```ts
  onJournalOpen: () => void = () => undefined;
  onJournalClose: () => void = () => undefined;
  onJournalContinue: () => void = () => undefined;

  private readonly journalMarker: HTMLButtonElement;
  private readonly journalLayer: HTMLElement;
  private readonly journalTitle: HTMLElement;
  private readonly journalWeather: HTMLElement;
  private readonly journalDay: HTMLElement;
  private readonly journalNight: HTMLElement;
  private readonly journalPageCount: HTMLElement;
  private readonly journalPrevious: HTMLButtonElement;
  private readonly journalNext: HTMLButtonElement;
  private readonly journalClose: HTMLButtonElement;
  private readonly journalContinue: HTMLButtonElement;
  private journalEntries: readonly JournalEntry[] = [];
  private journalIndex = 0;
  private journalMode: 'manual' | 'automatic' = 'manual';
```

Bind those elements after `mount.append(this.root)` and include the journal in modal/background isolation:

```ts
    this.journalMarker = requireElement(this.root, '[data-journal-open]');
    this.journalLayer = requireElement(this.root, '[data-journal]');
    this.journalTitle = requireElement(this.root, '[data-journal-title]');
    this.journalWeather = requireElement(this.root, '[data-journal-weather]');
    this.journalDay = requireElement(this.root, '[data-journal-day]');
    this.journalNight = requireElement(this.root, '[data-journal-night]');
    this.journalPageCount = requireElement(this.root, '[data-journal-page-count]');
    this.journalPrevious = requireElement(this.root, '[data-journal-previous]');
    this.journalNext = requireElement(this.root, '[data-journal-next]');
    this.journalClose = requireElement(this.root, '[data-journal-close]');
    this.journalContinue = requireElement(this.root, '[data-journal-continue]');
    this.backgroundRegions = [this.journalMarker, this.anchorLayer];
    this.modalLayers = [
      this.pauseLayer,
      this.journalLayer,
      this.actionOptionsLayer,
      this.endingLayer,
      this.outcomeLayer,
      this.eventLayer,
    ];
```

Add these methods:

```ts
  showJournal(entries: readonly JournalEntry[], mode: 'manual' | 'automatic'): void {
    if (this.disposed) return;
    this.focusReturnTarget = mode === 'manual' ? this.journalMarker : this.resolveCommandOrigin();
    this.journalEntries = entries.map((entry) => ({
      ...entry,
      daytime: entry.daytime === null ? null : { ...entry.daytime },
      nighttime: { ...entry.nighttime },
    }));
    this.journalMode = mode;
    this.journalIndex = Math.max(0, this.journalEntries.length - 1);
    this.renderJournalPage();
    this.journalClose.hidden = mode !== 'manual';
    this.journalContinue.hidden = mode !== 'automatic';
    this.showLayer(this.journalLayer);
    this.journalTitle.focus();
  }

  hideJournal(): void {
    if (this.disposed) return;
    this.hideLayer(this.journalLayer);
    this.restoreFocus();
  }

  private renderJournalPage(): void {
    const entry = this.journalEntries[this.journalIndex];
    if (entry === undefined) {
      this.journalTitle.textContent = 'NO COMPLETED ENTRIES YET';
      this.journalWeather.textContent = '';
      this.journalDay.textContent = 'The journal is still waiting for its first completed day.';
      this.journalNight.textContent = '';
      this.journalPageCount.textContent = 'PAGE 0 OF 0';
    } else {
      const page = formatJournalEntry(entry);
      this.journalTitle.textContent = page.heading;
      this.journalWeather.textContent = page.weather;
      this.journalDay.textContent = page.daytime;
      this.journalNight.textContent = page.nighttime;
      this.journalPageCount.textContent = `PAGE ${this.journalIndex + 1} OF ${this.journalEntries.length}`;
    }
    this.journalPrevious.disabled = this.journalIndex <= 0;
    this.journalNext.disabled = this.journalEntries.length === 0
      || this.journalIndex >= this.journalEntries.length - 1;
  }

  private moveJournalPage(delta: -1 | 1): void {
    const maximum = Math.max(0, this.journalEntries.length - 1);
    this.journalIndex = Math.min(maximum, Math.max(0, this.journalIndex + delta));
    this.renderJournalPage();
    (delta < 0 ? this.journalPrevious : this.journalNext).focus();
  }
```

Extend `focusModal` with the journal title:

```ts
  private focusModal(layer: HTMLElement): void {
    if (layer === this.eventLayer) this.eventTitle.focus();
    else if (layer === this.outcomeLayer) this.outcomeTitle.focus();
    else if (layer === this.endingLayer) this.endingTitle.focus();
    else if (layer === this.actionOptionsLayer) this.actionOptionsTitle.focus();
    else if (layer === this.journalLayer) this.journalTitle.focus();
    else if (layer === this.pauseLayer) this.resumeButton.focus();
  }
```

Insert these branches in `handleClick` after the topmost-modal guard and before action routing:

```ts
    if (button.hasAttribute('data-journal-open')) {
      this.onJournalOpen();
      return;
    }
    if (button.hasAttribute('data-journal-previous')) {
      this.moveJournalPage(-1);
      return;
    }
    if (button.hasAttribute('data-journal-next')) {
      this.moveJournalPage(1);
      return;
    }
    if (button.hasAttribute('data-journal-close')) {
      this.onJournalClose();
      return;
    }
    if (button.hasAttribute('data-journal-continue')) {
      this.onJournalContinue();
      return;
    }
```

Use this journal-aware start of the existing `Escape` branch in `handleKeyDown`:

```ts
    if (event.key === 'Escape') {
      if (this.topmostModal() === this.journalLayer) {
        event.preventDefault();
        if (this.journalMode === 'manual') this.onJournalClose();
      } else if (this.topmostModal() === this.actionOptionsLayer) {
        event.preventDefault();
        this.closeActionOptions();
      } else {
        event.preventDefault();
        this.onPauseChange(!this.paused);
      }
      return;
    }
```

Add this line to `syncCommandState()` and reset the callbacks in `dispose()`:

```ts
    this.journalMarker.disabled = this.busy;
```

```ts
    this.onJournalOpen = () => undefined;
    this.onJournalClose = () => undefined;
    this.onJournalContinue = () => undefined;
```

- [ ] **Step 5: Run UI tests**

Run: `bun run test -- tests/SurvivalUI.test.ts`

Expected: PASS, including existing event/outcome/pause/ending modal regressions.

- [ ] **Step 6: Commit journal UI behavior**

```powershell
git add src/ui/SurvivalUI.ts tests/SurvivalUI.test.ts
git commit -m "feat: add browsable journal modal"
```

---

### Task 4: Gate dawn and endings behind the automatic journal

**Files:**
- Modify: `src/survival/SurvivalPhase.ts`
- Modify: `tests/SurvivalPhase.test.ts`

**Interfaces:**
- Consumes: `SurvivalSnapshot.journalEntries`, `SurvivalUI.showJournal`, `hideJournal`, and the three journal callbacks.
- Produces: `handleJournalOpen()`, `handleJournalClose()`, and `handleJournalContinue()`; automatic presentation occurs once per completed day.

- [ ] **Step 1: Add failing orchestration tests**

Import `JournalEntry` and add this fixture in `tests/SurvivalPhase.test.ts`:

```ts
import type { JournalEntry } from '../src/survival/journal';

function completedEntry(day: number): JournalEntry {
  return {
    day,
    weather: 'calm',
    daytime: null,
    nighttime: {
      phase: 'night',
      eventId: `night-${day}`,
      title: 'Quiet Night',
      prompt: 'The night passed without incident.',
      attemptedItemId: null,
      resolution: 'endure',
      outcomeCode: 'event-resolved',
      outcomeMessage: 'The night remained quiet.',
    },
  };
}
```

Then add:

```ts
  it('shows a completed night journal before dawn and advances only from it', async () => {
    let current = snapshot({ state: 'nightEvent', day: 3, pendingEventId: null });
    const showJournal = vi.fn();
    const hideJournal = vi.fn();
    const beginDawn = vi.fn(() => {
      current = snapshot({ state: 'day', day: 4, journalEntries: [completedEntry(3)] });
      return accepted({ code: 'dawn', cue: 'dawn', message: 'Another dawn.' });
    });
    const ui: Partial<SurvivalUI> = {
      render: vi.fn(), showOutcome: vi.fn(), hideOutcome: vi.fn(),
      showJournal, hideJournal, setBusy: vi.fn(), dispose: vi.fn(),
    };
    const phase = SurvivalPhase.forTest({
      session: {
        snapshot: vi.fn(() => current),
        resolveEvent: vi.fn(() => {
          current = snapshot({
            state: 'nightEvent', day: 3, pendingEventId: null,
            journalEntries: [completedEntry(3)],
          });
          return accepted({ code: 'event-resolved', cue: 'none' });
        }),
        beginDawn,
      },
      world: { play: vi.fn(() => Promise.resolve()), dispose: vi.fn() },
      ui,
    });

    phase.handleEndure();
    await flushPromises();
    phase.handleContinue();
    expect(showJournal).toHaveBeenCalledWith([completedEntry(3)], 'automatic');
    expect(beginDawn).not.toHaveBeenCalled();

    ui.onJournalContinue?.();
    expect(hideJournal).toHaveBeenCalledOnce();
    expect(beginDawn).toHaveBeenCalledOnce();
  });

  it('shows a terminal night journal before the ending and never calls dawn', async () => {
    let current = snapshot({ state: 'nightEvent', day: 5 });
    const showJournal = vi.fn();
    const showEnding = vi.fn();
    const beginDawn = vi.fn();
    const ui: Partial<SurvivalUI> = {
      render: vi.fn(), showOutcome: vi.fn(), hideOutcome: vi.fn(),
      showJournal, hideJournal: vi.fn(), showEnding, setBusy: vi.fn(), dispose: vi.fn(),
    };
    const phase = SurvivalPhase.forTest({
      session: {
        snapshot: vi.fn(() => current),
        resolveEvent: vi.fn(() => {
          current = snapshot({ state: 'sunk', day: 5, journalEntries: [completedEntry(5)] });
          return accepted({ code: 'event-resolved', cue: 'sinking' });
        }),
        beginDawn,
      },
      world: { play: vi.fn(() => Promise.resolve()), dispose: vi.fn() },
      ui,
    });
    phase.handleEndure();
    await flushPromises();
    phase.handleContinue();
    expect(showJournal).toHaveBeenCalledOnce();
    expect(showEnding).not.toHaveBeenCalled();
    ui.onJournalContinue?.();
    expect(showEnding).toHaveBeenCalledOnce();
    expect(beginDawn).not.toHaveBeenCalled();
  });

  it('opens and closes manual history without advancing survival state', () => {
    const entries = [completedEntry(1), completedEntry(2)];
    const showJournal = vi.fn();
    const hideJournal = vi.fn();
    const beginDawn = vi.fn();
    const ui: Partial<SurvivalUI> = { showJournal, hideJournal, dispose: vi.fn() };
    SurvivalPhase.forTest({
      session: { snapshot: vi.fn(() => snapshot({ day: 3, journalEntries: entries })), beginDawn },
      world: { dispose: vi.fn() },
      ui,
    });
    ui.onJournalOpen?.();
    expect(showJournal).toHaveBeenCalledWith(entries, 'manual');
    ui.onJournalClose?.();
    expect(hideJournal).toHaveBeenCalledOnce();
    expect(beginDawn).not.toHaveBeenCalled();
  });
```

- [ ] **Step 2: Run phase tests and verify sequencing failures**

Run: `bun run test -- tests/SurvivalPhase.test.ts`

Expected: FAIL because journal callbacks are not wired and `handleContinue` still advances directly to dawn or an ending.

- [ ] **Step 3: Implement journal orchestration**

Add fields to `SurvivalPhase`:

```ts
  private awaitingJournalDay: number | null = null;
  private readonly presentedJournalDays = new Set<number>();
```

Wire callbacks in `wireUI()`:

```ts
    this.ui.onJournalOpen = () => this.handleJournalOpen();
    this.ui.onJournalClose = () => this.handleJournalClose();
    this.ui.onJournalContinue = () => this.handleJournalContinue();
```

Add handlers:

```ts
  handleJournalOpen(): void {
    if (
      this.disposed
      || this.busy
      || this.awaitingContinue
      || this.paused
      || this.awaitingJournalDay !== null
      || this.documentIsHidden()
    ) return;
    this.ui.showJournal?.(this.session.snapshot().journalEntries, 'manual');
  }

  handleJournalClose(): void {
    if (this.disposed || this.awaitingJournalDay !== null) return;
    this.ui.hideJournal?.();
  }

  handleJournalContinue(): void {
    if (this.disposed || this.awaitingJournalDay === null) return;
    this.awaitingJournalDay = null;
    this.ui.hideJournal?.();
    const snapshot = this.session.snapshot();
    if (isTerminal(snapshot.state)) {
      this.presentTerminalOnce(snapshot);
      return;
    }
    this.beginDawnAfterJournal(snapshot);
  }

  private beginDawnAfterJournal(snapshot: SurvivalSnapshot): void {
    if (snapshot.state !== 'nightEvent' || snapshot.pendingEventId !== null) return;
    const dawn = this.session.beginDawn?.();
    if (!dawn?.accepted) return;
    this.busy = true;
    this.ui.setBusy?.(true);
    void (this.world.play?.(dawn.cue) ?? Promise.resolve()).finally(() => {
      if (this.disposed) return;
      this.busy = false;
      this.ui.setBusy?.(false);
      this.renderSnapshot(false);
    });
  }

  private presentLatestJournal(snapshot: SurvivalSnapshot): boolean {
    const latest = snapshot.journalEntries.at(-1);
    if (latest === undefined || latest.day !== snapshot.day || this.presentedJournalDays.has(latest.day)) return false;
    this.presentedJournalDays.add(latest.day);
    this.awaitingJournalDay = latest.day;
    this.ui.showJournal?.(snapshot.journalEntries, 'automatic');
    return true;
  }
```

Replace `handleContinue()` with the journal-aware sequence while preserving the existing pending-day-event branch:

```ts
  handleContinue(): void {
    if (this.disposed || !this.awaitingContinue) return;
    this.awaitingContinue = false;
    let snapshot = this.renderSnapshot(false, false);
    this.ui.hideOutcome?.();
    if (this.presentLatestJournal(snapshot)) return;
    this.presentTerminalOnce(snapshot);
    if (
      this.pendingDayEventDay !== null
      && snapshot.day === this.pendingDayEventDay
      && snapshot.state === 'day'
    ) {
      const eventDay = this.pendingDayEventDay;
      this.pendingDayEventDay = null;
      this.requestedDayEventDays.add(eventDay);
      const eventOutcome = this.session.requestDayEvent?.();
      if (eventOutcome?.accepted) {
        this.present(eventOutcome);
        return;
      }
      snapshot = this.renderSnapshot(false);
    }
    this.openPendingEvent(snapshot);
  }
```

Replace `canAcceptCommand()` with:

```ts
  private canAcceptCommand(): boolean {
    if (
      this.disposed
      || this.busy
      || this.awaitingContinue
      || this.awaitingJournalDay !== null
      || this.paused
      || this.documentIsHidden()
    ) return false;
    return !isTerminal(this.session.snapshot().state);
  }
```

- [ ] **Step 4: Run phase tests**

Run: `bun run test -- tests/SurvivalPhase.test.ts`

Expected: PASS, including the pre-existing continuation, terminal, pause, and disposal tests.

- [ ] **Step 5: Run session/UI/phase integration tests together**

Run: `bun run test -- tests/survivalJournal.test.ts tests/SurvivalSession.test.ts tests/SurvivalUI.test.ts tests/SurvivalPhase.test.ts tests/SurvivalPhaseFocus.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit phase sequencing**

```powershell
git add src/survival/SurvivalPhase.ts tests/SurvivalPhase.test.ts
git commit -m "feat: gate dawn behind daily journal"
```

---

### Task 5: Worn-paper presentation and responsive accessibility contracts

**Files:**
- Modify: `src/styles/main.css`
- Modify: `tests/SurvivalUI.test.ts`

**Interfaces:**
- Consumes: `.journal-marker`, `.journal-overlay`, `.journal-page`, and the journal data attributes from Task 3.
- Produces: centered paper presentation, visible marker focus, bounded story scrolling, short-viewport layout, and reduced-motion behavior.

- [ ] **Step 1: Add failing stylesheet contract tests**

Add to `tests/SurvivalUI.test.ts`:

```ts
  it('styles the journal as a centered bounded paper page with reduced-motion support', () => {
    expect(mainStyles).toMatch(/\.journal-marker:focus-visible\s*\{/);
    expect(mainStyles).toMatch(/\.journal-overlay::before\s*\{[^}]*display:\s*none/s);
    expect(mainStyles).toMatch(/\.journal-page\s*\{[^}]*width:\s*min\(680px/s);
    expect(mainStyles).toMatch(/\.journal-page__story\s*\{[^}]*overflow-y:\s*auto/s);
    expect(mainStyles).toMatch(/@media \(max-height:\s*760px\)[\s\S]*\.journal-page/s);
    expect(mainStyles).toMatch(/@media \(prefers-reduced-motion:\s*reduce\)[\s\S]*\.journal-page/s);
  });
```

- [ ] **Step 2: Run the UI test and verify the CSS contract failure**

Run: `bun run test -- tests/SurvivalUI.test.ts`

Expected: FAIL because journal-specific CSS is absent.

- [ ] **Step 3: Add the journal styles**

Add this focused block beside the existing journal-marker and overlay styles in `src/styles/main.css`:

```css
.journal-marker {
  appearance: none;
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
}
.journal-marker:focus-visible {
  outline: 3px solid var(--ink-yellow);
  outline-offset: 6px;
}
.journal-marker:disabled { cursor: default; opacity: .72; }
.journal-overlay {
  place-content: center;
  justify-items: center;
  background: radial-gradient(circle at 50% 50%, #090b0ca8, #020303ed 76%);
}
.journal-overlay::before { display: none; }
.journal-page {
  position: relative;
  display: grid;
  grid-template-rows: auto auto minmax(0, 1fr) auto auto;
  gap: 14px;
  width: min(680px, calc(100vw - 64px));
  max-height: calc(100dvh - 64px);
  min-height: min(560px, calc(100dvh - 64px));
  padding: clamp(28px, 5vw, 52px);
  color: #33251b;
  background:
    linear-gradient(90deg, transparent 0 7%, #8a513733 7.2% 7.6%, transparent 7.8%),
    radial-gradient(circle at 22% 18%, #fff8db 0 2%, transparent 18%),
    linear-gradient(145deg, #e8d3a5, #c8a976 72%, #af8a58);
  box-shadow: 0 28px 70px #000b, inset 0 0 34px #71482155;
  clip-path: polygon(1% 2%, 98% 0, 100% 97%, 3% 100%, 0 53%);
  transform: rotate(-.35deg);
}
.journal-page h2 {
  color: #342219;
  font-family: 'Segoe Print', 'Trebuchet MS', sans-serif;
  font-size: clamp(2rem, 5vw, 3.4rem);
  text-align: center;
  text-shadow: none;
}
.journal-page h3,
.journal-page__weather,
.journal-page__navigation { letter-spacing: .12em; text-transform: uppercase; }
.journal-page__weather { margin: 0; color: #75543b; text-align: right; }
.journal-page__story {
  min-height: 0;
  padding: 8px 18px;
  overflow-y: auto;
  font-size: clamp(.95rem, 2vw, 1.12rem);
  line-height: 1.7;
}
.journal-page__story section + section { margin-top: 24px; }
.journal-page__story h3 { margin: 0 0 6px; color: #7a3d2f; font-size: .72rem; }
.journal-page__story p { margin: 0; }
.journal-page__navigation {
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  align-items: center;
  gap: 12px;
  font-size: .68rem;
}
.journal-page__navigation [data-journal-next] { justify-self: end; }
.journal-page > [data-journal-close],
.journal-page > [data-journal-continue] { justify-self: center; }

@media (max-height: 760px) and (min-width: 761px) {
  .journal-page {
    min-height: 0;
    max-height: calc(100dvh - 32px);
    padding: 24px 38px;
  }
  .journal-page__story section + section { margin-top: 14px; }
}

@media (prefers-reduced-motion: reduce) {
  .journal-page { transform: none; transition: none; }
}
```

- [ ] **Step 4: Run UI tests and build**

Run: `bun run test -- tests/SurvivalUI.test.ts`

Expected: PASS.

Run: `bun run build`

Expected: TypeScript and Vite build complete successfully.

- [ ] **Step 5: Commit journal presentation**

```powershell
git add src/styles/main.css tests/SurvivalUI.test.ts
git commit -m "style: present daily journal as worn paper"
```

---

### Task 6: Player documentation and complete verification

**Files:**
- Modify: `README.md`

**Interfaces:**
- Consumes: the completed feature and its final controls.
- Produces: player-facing journal instructions and verified release evidence.

- [ ] **Step 1: Document the journal control and day transition**

Add this row to the Lifeboat survival controls table in `README.md`:

```markdown
| Center journal marker | Open and browse completed daily event entries |
```

Add this paragraph after the survival event description:

```markdown
After each nighttime outcome, a journal page retells that day's daytime and nighttime events as a short first-person entry. The entry mentions supplies only when they were attempted during an event. Continue from the page to begin dawn, or use the centered journal marker later to browse completed days.
```

- [ ] **Step 2: Run the complete automated test suite**

Run: `bun run test`

Expected: all Vitest files pass with zero failures.

- [ ] **Step 3: Run static and production verification**

Run: `bun run typecheck`

Expected: TypeScript exits 0 with no diagnostics.

Run: `bun run build`

Expected: Vite emits a successful production build to `dist/`.

- [ ] **Step 4: Perform the desktop browser playthrough**

Run: `bun run dev`

Verify in a desktop browser:

1. Resolve a day event with its matching item and confirm the item appears naturally in the completed page.
2. Finish a day without a daytime event and confirm the quiet-day sentence appears.
3. Attempt an unsuitable item and confirm the page describes the failed attempt without `That item cannot help` duplication.
4. Endure a night event and confirm the page says no supplies were used.
5. Confirm the nighttime outcome appears before the journal and dawn cannot start before **Begin Next Day**.
6. Open the marker during a later day, browse previous/next pages, close with `Escape`, and confirm the day does not advance.
7. Confirm `Tab` and `Shift+Tab` remain inside the journal, then restore focus to the marker on close.
8. Trigger a terminal night through a deterministic test setup or browser dev seam and confirm journal -> ending with no dawn.
9. Resize to a short desktop viewport and confirm only the story region scrolls.
10. Enable reduced motion and confirm the page has no transition or tilt.
11. Restart from the ship and confirm journal history is empty.

- [ ] **Step 5: Commit documentation**

```powershell
git add README.md
git commit -m "docs: explain the daily event journal"
```

- [ ] **Step 6: Confirm the implementation diff is scoped**

Run: `git status --short`

Expected: no uncommitted journal-feature files. Pre-existing unrelated workspace changes, if any, remain untouched and are reported separately.

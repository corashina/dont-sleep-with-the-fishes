# Daily Event Journal Design

## Status

Approved on 2026-07-14.

## Goal

Add a browsable journal to the lifeboat survival phase. After each nighttime event and its outcome, the game presents a centered journal page that summarizes that day's daytime and nighttime events as a short first-person story. The page mentions an item only when the player attempted to use it to handle an event. It never becomes an inventory audit or a list of ordinary daytime actions.

The original *Don't Sleep With The Fishes* uses event-triggered journal entries. This project adapts that idea into one completed-day entry after every resolved night while retaining original presentation, writing, and code. The existing wiki snapshot remains a development reference only:

- <https://unoffdontsleepwiththefishes.fandom.com/wiki/Events>

## Scope

### Included

- One immutable journal entry for each day whose nighttime event has resolved.
- An explicit quiet-day passage when no daytime event occurred.
- First-person prose for the daytime event, nighttime event, attempted item, and outcome.
- Prose for enduring an event without using an item.
- Prose that acknowledges an unsuitable item attempt and its failure.
- Automatic journal presentation after the nighttime outcome and before dawn.
- Final journal presentation before rescue, death, or sinking screens when a nighttime event ends the run.
- A centered worn-paper modal that is visually consistent with the existing hand-drawn UI.
- A clickable version of the existing centered journal marker.
- Browsing of all completed entries, newest first.
- Keyboard-accessible navigation, focus management, and modal semantics.

### Excluded

- Inventory lists, unused-item lists, charges, condition, or resource-delta summaries.
- Fishing, diving, eating, repairing, treating, resting, and other ordinary daytime-action summaries.
- Editing journal text.
- Save-file persistence or journal history across restarts.
- New lore, story progression, crewmates, or copyrighted source-game writing or artwork.
- In-progress pages for a day whose nighttime event has not resolved.

## Player Flow

The completed-day sequence is:

1. The player resolves the nighttime event.
2. The existing outcome presentation shows the immediate result.
3. Continuing from that outcome opens the newly finalized journal page.
4. The page blocks dawn until the player activates **Begin Next Day**.
5. Continuing advances to dawn, unless the resolved event ended the run.
6. A terminal run proceeds from the final journal page to the appropriate ending screen instead of dawn.

At any nonmodal point in survival, the player may activate the centered journal marker to browse completed entries. Manual browsing never advances time or changes survival state.

## Journal Data Model

`SurvivalSession` remains authoritative for journal facts and completed history. Presentation code must not reconstruct history from DOM text or transient outcome overlays.

The journal model has two levels:

- `JournalEventRecord`: event phase, event ID, event title, attempted item ID or `null`, outcome code, and outcome message.
- `JournalEntry`: day number, weather, optional daytime record, required nighttime record, and finalized identity for duplicate prevention.

The daytime record is absent when no daytime event occurred. That absence deliberately renders as the approved quiet-day passage rather than an error.

When an event resolves, the session records the selected item before clearing the pending event. A selected suitable, unsuitable, durable, or consumable item is still an attempted item and belongs in the record. Selecting **Endure** records `null` even when other supplies were available.

After a nighttime event resolves, the session finalizes exactly one immutable `JournalEntry` for the current day. `SurvivalSnapshot` exposes a read-only, defensively copied history so the phase and UI can render it without mutating session state.

No entry is finalized before the nighttime event resolves. Repeated continuation, rendering, or update calls cannot create a duplicate entry.

## Narrative Formatting

A focused pure formatter converts a `JournalEntry` into display prose. Records store facts rather than precomposed page text, allowing wording to improve without changing survival rules or old record structure.

Each page contains:

- a `DAY N` heading;
- a brief weather note;
- one short daytime passage;
- one short nighttime passage.

The daytime passage describes the daytime event, attempted item, and result. If the record is absent, it uses a concise quiet-day sentence such as "The daylight hours passed quietly."

The nighttime passage describes what disturbed the night, how the player responded, and the result:

- a suitable item is described as being used to handle the situation;
- an unsuitable item is described as an unsuccessful attempt;
- `null` is described as facing or enduring the event without using supplies.

The prose uses first person and past tense. It remains short enough to fit the supported desktop viewport without becoming a scrolling report in normal cases. It does not expose internal IDs, raw resource deltas, item charges, or inventory state.

The formatter derives item labels from the existing item catalog. Event-specific journal overrides are not part of this milestone, but the structured record leaves room for them later without changing session ownership.

## UI and Interaction

The existing top-center journal marker becomes an actual button while retaining its day, phase, weather, and journal artwork. Its accessible name clearly states that it opens the journal.

The full journal is a modal layer above a dimmed but visible lifeboat scene. It presents a single worn-paper page centered in the viewport using CSS and existing original inline artwork. No external art asset is required.

The page includes:

- day heading and weather note;
- day and night story passages;
- previous and next controls;
- a visible page count;
- **Begin Next Day** for automatic presentation;
- **Close Journal** for manual browsing.

Manual browsing opens on the newest completed entry. Previous and next controls are disabled at their respective boundaries. Page indexes are clamped whenever the available history changes.

When the journal opens, it stores the command focus origin, makes background controls inert, moves focus into the modal, and traps `Tab`/`Shift+Tab`. Closing a manually opened journal restores focus to the journal marker or the best available command target. `Escape` closes manual browsing. The automatic end-of-day journal cannot be dismissed with `Escape`; only **Begin Next Day** continues the flow.

Long prose remains within a bounded page region that can scroll vertically at unusually short desktop viewport heights. Reduced-motion preferences remove nonessential page transitions.

## Phase Orchestration

`SurvivalPhase` owns presentation sequencing but not journal content.

After a nighttime event outcome is acknowledged, the phase checks for the newly finalized entry before calling `beginDawn()`. If one is pending presentation, it opens the automatic journal and waits. A dedicated journal-continuation callback then either:

- calls `beginDawn()` and renders the new day; or
- presents the already committed rescue, death, or sinking ending.

The phase tracks which finalized entry has been automatically presented so repeated snapshots, animation completion, and continuation calls cannot reopen it. Opening or closing the journal manually does not touch this automatic-presentation state.

`SurvivalUI` owns only modal state and the selected browsing index. It reports open, close, navigation, and automatic-continuation intent through callbacks. It does not call survival-session methods directly.

## Component Boundaries

- A focused journal model/formatter module owns journal types and prose generation.
- `SurvivalSession` captures resolved event facts, finalizes entries, and exposes immutable history.
- `SurvivalPhase` sequences outcome, journal, dawn, and ending presentation.
- `SurvivalUI` owns journal markup, browsing, accessibility, and focus behavior.
- `src/styles/main.css` owns the responsive worn-paper presentation.

Each unit has one purpose and communicates through typed records or callbacks. Journal formatting can be tested without the DOM, and journal browsing can be tested without running survival rules.

## Error Handling and Invariants

- A day can produce at most one finalized entry.
- A finalized entry requires a nighttime event record.
- A missing daytime record is valid and means the day passed quietly.
- Dawn cannot begin while an automatic journal page is awaiting continuation.
- Manual browsing cannot mutate session state or advance the day.
- Unknown event or item IDs are development errors caught by typing and tests, not silently displayed to players.
- A disposed phase or UI ignores delayed journal callbacks.
- Empty history leaves the marker available but opens a clear "No completed entries yet" page rather than failing.
- Navigation never selects an index outside the current history.

## Testing

Implementation follows test-driven development.

### Journal model tests

- A quiet day produces the approved quiet-day passage.
- Suitable item use appears naturally in first-person prose.
- Unsuitable item attempts describe failure.
- Enduring an event mentions that no supply was used.
- Ordinary daytime actions and resource deltas never appear.
- Item labels come from the existing catalog rather than internal IDs.

### Session tests

- Resolving day and night events captures the selected item and outcome.
- A night resolution finalizes exactly one entry.
- Repeated reads and continuations cannot duplicate a day.
- The journal history returned in snapshots is immutable from the consumer's perspective.
- A day without a daytime event is finalized with no daytime record.

### Phase tests

- The order is night outcome, journal, then dawn.
- Dawn cannot run before automatic journal continuation.
- A terminal night outcome goes from its journal page to the ending without dawn.
- Each completed entry is automatically presented once.
- Manual browsing does not advance time or interfere with automatic presentation.

### UI tests

- The centered marker is a keyboard-accessible button.
- Automatic and manual journal modes use the correct primary action.
- Previous and next controls browse completed entries and disable at boundaries.
- Empty history is handled safely.
- Focus enters the modal, remains trapped, and restores correctly.
- `Escape` closes only manual browsing.
- Background controls become inert while the journal is open.
- Long content and reduced-motion contracts are present in markup and CSS.

### Completion verification

- Run the complete Vitest suite.
- Run TypeScript type-checking.
- Produce a successful Vite production build.
- Play through a quiet day, item-assisted event, unsuitable-item event, endure response, manual history browsing, terminal night, and restart in a desktop browser.

## Success Criteria

- Every completed survival day presents exactly one journal page after its nighttime outcome and before dawn or an ending.
- Every page reads as a short first-person account of only the day and night events.
- Item use appears naturally in the story without becoming an inventory report.
- Quiet days, unsuitable attempts, and enduring without an item all produce coherent prose.
- Completed entries remain browsable from the centered marker for the rest of the run.
- Journal presentation is responsive, keyboard accessible, deterministic, and isolated from survival-state mutation.
- All automated verification and the representative browser playthrough pass.

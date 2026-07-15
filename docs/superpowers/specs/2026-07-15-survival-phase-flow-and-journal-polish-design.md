# Survival Phase Flow and Journal Polish Design

**Date:** 2026-07-15
**Status:** Approved design, awaiting written-spec review

## Objective

Make the survival phase flow without blocking outcome screens. Daytime actions should resolve through the 3D scene, meter changes, and short captions. End Day should feel like the survivor goes to sleep, then reveal either a nighttime event or a quiet night. Dawn should follow without forcing the journal open.

The same change will clean up the top-center HUD, replace the projected End Day dot with a stable button, mark unread journal entries, and give the journal page a more physical logbook treatment.

## Scope

This milestone covers:

- accepted and rejected action feedback;
- End Day placement and sleep transition;
- nighttime event and quiet-night sequencing;
- unread journal state;
- top-center day, phase, weather, and journal controls;
- journal surface and navigation styling;
- keyboard, focus, reduced-motion, and responsive behavior;
- tests for the new rules and presentation order.

The milestone keeps existing action costs, event content, event item rules, terminal states, condition meters, weather rules, and world assets. It adds no third-party asset.

## Chosen Approach

Use a focused flow redesign. `SurvivalSession` will keep rule ownership, `SurvivalPhase` will sequence actions and transitions, and `SurvivalUI` will present controls and feedback. The implementation will remove the generic outcome-and-Continue pipeline instead of hiding it or driving it through automatic clicks.

A cosmetic auto-continue approach would leave timing tied to an invisible modal. A full survival state-machine rewrite would change more code than this milestone requires.

## Player Flow

### Daytime actions

An accepted daytime action follows this order:

1. The session validates and commits the action once.
2. The phase locks survival commands for the action cue.
3. The world plays the cue.
4. The UI renders the new snapshot and shows a short ink caption.
5. The phase restores daytime input or opens a scheduled daytime event.

The player never receives an outcome dialog or Continue button. Meter and inventory changes remain the primary result display. The caption carries the existing outcome sentence without blocking input after the cue ends.

A rejected action leaves session state unchanged. The UI keeps focus on the originating control and uses the same caption plus the existing live region to explain the rejection. Rejections do not play a cue or lock other commands.

### End Day

The top-center End Day button starts this sequence:

1. The session commits End Day and decides whether the night contains an event.
2. The phase locks survival commands.
3. The UI plays a short eyelid-like fade to near-black while the world moves to night.
4. The phase checks the End Day result code that it retained for the sleep sequence.
5. An event night fades back to the night scene and opens the event decision overlay.
6. A quiet night holds on darkness for a short calm beat, finalizes the journal entry, and moves into dawn.

Reduced-motion mode uses a brief opacity crossfade and keeps the same command lock and callback order.

### Event resolution

The event decision overlay remains because the player must choose an item or Endure. The phase records whether the event belongs to day or night before it resolves.

After a daytime event choice, the UI closes the event overlay, the world plays the result cue, the UI renders the new snapshot and caption, and the phase restores daytime play.

After a nighttime event choice, the UI closes the overlay, the world plays the result cue, and the UI shows a short caption. The session finalizes the journal entry. The phase then starts dawn without opening an outcome screen or journal page.

A rescue, death, or sinking result plays its cue and opens the existing ending screen. The phase does not start dawn after a terminal result.

### Dawn and journal notification

The dawn cue advances the session to the next day and returns the world to daytime. The journal marker gains `NEW` as soon as the session finalizes an entry. The phase does not interrupt dawn with the journal.

Opening the journal selects the newest completed entry and clears the unread marker. Closing or browsing the journal never advances time or mutates survival rules.

## Quiet Nights

`SurvivalSession.endDay()` uses the seeded survival random source for a 25 percent quiet-night chance. The remaining nights select a nighttime event through the current event draw, cooldown, and fallback rules. Tests can supply deterministic random values to cover both branches.

End Day returns `quiet-night` for the quiet branch and `event-opened` for the event branch. An event branch enters `nightEvent` with a pending event ID. A quiet branch enters `nightEvent` without a pending event, finalizes its journal entry, and waits for the phase to call `beginDawn()` after the dark hold. The retained result code keeps the sleep callback independent from DOM state.

The journal model represents the nighttime portion with a discriminated union:

```ts
type JournalNightRecord =
  | { kind: 'event'; event: JournalEventRecord }
  | { kind: 'quiet' };
```

`JournalEntry.nighttime` uses `JournalNightRecord`. A quiet record is a valid completed night and formats as a short first-person calm passage. The existing nullable daytime record continues to mean that no daytime event occurred.

The session finalizes a quiet-night entry during End Day. It finalizes an event-night entry after event resolution. Existing duplicate prevention continues to enforce one journal entry per day.

## Top-Center HUD

The top-center HUD uses two rows.

The first row contains a standalone journal button and a compact status plaque. The plaque gives `DAY N` the strongest weight and places `DAYLIGHT · OVERCAST` on one smaller line. The journal button contains the existing original journal artwork without repeating day or weather text.

The journal button displays a small ink-stroke `NEW` marker when the newest completed entry is unread. Its accessible name includes the unread state. Opening the journal clears the marker for all entries available at that moment.

The second row contains a wide timber End Day button. The button retains shortcut `7`, an exposed disabled reason, and clear hover, pressed, and keyboard-focus states. Action cues, sleep, event resolution, dawn, pause, and terminal screens disable it through the existing command-lock rules.

The implementation removes the horizon End Day anchor from `BoatWorld`, the projected End Day button from `SurvivalUI`, and its tooltip styling. End Day no longer moves with camera projection or boat drift.

Condition meters remain at the upper right. The center cluster must not overlap them at 1280 by 720 or 1920 by 1080. Narrow desktop rules may reduce gaps and type size, but must keep the journal and End Day targets at least 44 CSS pixels tall or wide.

## Non-Blocking Feedback

`SurvivalUI` adds one pointer-transparent feedback caption near the lower center of the viewport. It uses the existing ink and brush-stroke visual language. Each new message replaces the previous message, remains readable long enough to scan, and fades without capturing focus.

Accepted actions and event resolutions use their authored outcome message. Rejections use their authored unavailable reason. The live region announces each message once. Repeated renders do not restart the caption or repeat the announcement.

The caption never requires dismissal. A new command may replace it after the prior cue releases the command lock.

## Journal Presentation

The journal remains a modal, browsing-only view over the dimmed lifeboat scene. The implementation removes automatic journal mode and the Begin Next Day control.

The centered page keeps the current readable first-person day and night sections. CSS and original inline effects add:

- fine paper fibers and faded ruled lines;
- salt blooms, a water ring, smudged edges, and uneven ink density;
- a subtle vertical binding crease;
- worn edges and the existing warm paper palette.

All texture layers ignore pointer input and preserve text contrast. The design adds no downloaded texture.

Previous and Next become hand-drawn arrows inside the left and right page margins. Boundary arrows fade into the paper while remaining disabled in the DOM. A handwritten folio at the bottom shows the page number. Close Journal becomes a cloth bookmark tab extending from the lower page edge.

The modal opens on the newest entry, traps keyboard focus, supports `Escape`, and restores focus to the journal button. Arrow controls keep visible focus outlines and descriptive accessible names. An empty history renders a deliberate `No entries yet` page with disabled navigation.

## Component Responsibilities

### `SurvivalSession`

- Validate and commit actions.
- Roll for a quiet night through the seeded random source.
- Select normal night events through existing draw rules.
- Record event responses.
- Finalize event and quiet-night journal entries once.
- Expose immutable snapshots and journal history.

### `SurvivalPhase`

- Lock and release commands around cues and transitions.
- Sequence daytime actions, sleep, event resolution, quiet nights, dawn, and endings.
- Track the event phase across resolution.
- Track the highest journal day the player has read during the run.
- Choose the next presentation step from committed session state.

### `SurvivalUI`

- Render the top-center status, journal button, unread marker, and End Day button.
- Present non-blocking captions and live announcements.
- Play the sleep fade and reduced-motion crossfade.
- Render and operate the browsing-only journal.
- Preserve modal isolation, focus trapping, focus restoration, and pause precedence.

### `BoatWorld`

- Remove the fixed horizon End Day anchor.
- Keep current action, event, nightfall, dawn, and ending cues.
- Switch day and night presentation when the phase renders the committed snapshot.

## Removed Interfaces

The implementation removes these outcome-presentation contracts:

- the outcome overlay markup and styling;
- `SurvivalUI.showOutcome()` and `SurvivalUI.hideOutcome()`;
- `SurvivalUI.onContinue` and the Continue button;
- `SurvivalUI.onSkip` and Skip Presentation;
- automatic journal mode, `onJournalContinue`, and Begin Next Day;
- `SurvivalPhase.awaitingContinue`, automatic journal waiting, and their continuation handlers.

The implementation updates tests and callers in the same change. It does not retain hidden compatibility shims.

Action and event cues keep their current short durations. The player no longer receives a Skip Presentation control.

## Error Handling and Invariants

- A session finalizes at most one journal entry for a day.
- A completed journal entry has an event-night or quiet-night record.
- A quiet night cannot expose a pending event ID.
- An event night cannot proceed to dawn while its event remains unresolved.
- The phase ignores repeated commands during cues, sleep, event resolution, dawn, pause, and terminal presentation.
- A rejected command does not mutate state, play a cue, or start a transition.
- A disposed phase or UI ignores late cue and fade completions.
- The phase opens the ending screen instead of dawn after a terminal event result.
- Opening or closing the journal does not mutate the session or advance time.
- Repeated snapshots do not repeat feedback announcements or mark an already read entry unread.

## Testing

Implementation follows test-driven development.

### Session and journal tests

- A deterministic roll below 0.25 produces a quiet night.
- A roll at or above 0.25 selects a nighttime event.
- A quiet night finalizes one entry with a quiet record.
- A resolved nighttime event finalizes one event record.
- Repeated reads and phase continuations cannot duplicate an entry.
- The formatter writes a calm first-person quiet-night passage.
- Existing daytime, suitable-item, unsuitable-item, and Endure prose remains correct.

### Phase tests

- Accepted daytime actions never call an outcome modal.
- The phase holds commands during a cue and releases them afterward.
- A daytime action can open its scheduled event after its cue.
- End Day starts the sleep fade before showing a night event.
- A quiet night proceeds from sleep to dawn without an event overlay.
- Daytime event resolution returns to daytime.
- Nighttime event resolution proceeds to dawn.
- A terminal nighttime resolution opens the ending and skips dawn.
- Finalized entries update unread state without opening the journal.
- Repeated input during a transition resolves no action twice.

### UI and world tests

- The status plaque contains day, phase, and weather without the journal artwork.
- The standalone journal button exposes artwork and unread state.
- The stable top-center End Day button emits `endDay` and shortcut `7` reaches it.
- Projected anchors no longer contain End Day or the horizon anchor.
- The feedback caption remains nonmodal, pointer-transparent, and announced once.
- The outcome and automatic-journal controls no longer exist.
- Journal edge arrows navigate, disable at boundaries, and retain keyboard focus behavior.
- The bookmark tab closes the journal and `Escape` restores journal-button focus.
- Texture layers preserve interaction and reduced-motion rules remove the eyelid animation.

### Completion verification

- Run `bun run test`.
- Run `bun run typecheck`.
- Run `bun run build`.
- Inspect accepted and rejected daytime actions in the browser.
- Play one event night and one quiet night.
- Inspect unread, open, empty, first-page, middle-page, and last-page journal states.
- Check 1280 by 720 and 1920 by 1080 layouts.
- Check keyboard-only and reduced-motion flows.

## Acceptance Criteria

1. Accepted actions and resolved events no longer open outcome or Continue screens.
2. End Day uses a stable top-center timber button and removes the projected horizon control.
3. End Day fades into sleep before revealing an event night or quiet night.
4. Quiet nights occur on 25 percent of eligible deterministic rolls and produce valid journal prose.
5. Event decisions remain interactive, then proceed to daytime play, dawn, or an ending based on event phase and result.
6. Dawn never forces the journal open.
7. New journal entries mark the journal button unread until the player opens it.
8. The top status display separates the journal icon from day, phase, and weather text.
9. The journal page uses the approved weathered logbook texture and integrated navigation.
10. Keyboard, screen-reader, focus, reduced-motion, and supported desktop layout behavior remain complete.
11. The full test suite, typecheck, production build, and browser checks pass.

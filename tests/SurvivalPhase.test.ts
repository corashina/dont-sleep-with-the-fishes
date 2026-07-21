import { PerspectiveCamera, Scene } from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ItemInstanceId } from '../src/game/ItemState';
import type { SceneRenderer } from '../src/rendering/SceneRenderer';
import { SURVIVAL_EVENTS } from '../src/survival/events';
import type { JournalEntry, JournalNightRecord } from '../src/survival/journal';
import { SurvivalPhase } from '../src/survival/SurvivalPhase';
import type { SurvivalInventorySnapshot, SurvivalItemState, SurvivalSnapshot } from '../src/survival/survivalTypes';
import type { SurvivalUI } from '../src/ui/SurvivalUI';

function inventory(
  overrides: Partial<Record<ItemInstanceId, SurvivalItemState>> = {},
): SurvivalInventorySnapshot {
  return overrides;
}

function snapshot(overrides: Partial<SurvivalSnapshot> = {}): SurvivalSnapshot {
  return {
    state: 'day', day: 1, health: 100, hunger: 20, energy: 3, hull: 100,
    food: 0, bait: 0, recoveredFood: 0, recoveredBait: 0, repairMaterial: 0,
    rescueProgress: 0, weather: 'calm', actedToday: false,
    journalEntries: [], inventory: inventory(), savedItems: [], pendingEventId: null,
    lastOutcome: null, seed: 8, ...overrides,
  };
}

function completedEntry(
  day: number,
  nighttime: JournalNightRecord = {
    kind: 'event',
    event: {
      phase: 'night', eventId: `night-${day}`, title: 'Quiet Night',
      prompt: 'The night passed without incident.', attemptedChoiceId: null,
      attemptedItemId: null,
      resolution: 'endure', outcomeCode: 'event-resolved',
      outcomeMessage: 'The night remained quiet.',
      inventoryMutations: [],
    },
  },
): JournalEntry {
  return { day, weather: 'calm', actions: [], daytime: null, nighttime };
}

function accepted(overrides: Record<string, unknown> = {}) {
  return {
    accepted: true, code: 'fish-caught', message: 'Caught one.',
    deltas: { energy: -2, food: 1 }, cue: 'fish' as const, ...overrides,
  };
}

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
}

async function flushPromises(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

afterEach(() => vi.unstubAllGlobals());

describe('SurvivalPhase orchestration', () => {
  it('renders survival through sceneRenderer with night and squall state', () => {
    const scene = new Scene();
    const render = vi.fn();
    const sceneRenderer: SceneRenderer = { render, resize: vi.fn(), dispose: vi.fn() };
    const current = snapshot({ state: 'nightEvent', weather: 'squall' });
    const phase = SurvivalPhase.forTest({
      session: { snapshot: vi.fn(() => current) },
      world: { scene, update: vi.fn(), dispose: vi.fn() },
      ui: { render: vi.fn(), setJournalUnread: vi.fn(), dispose: vi.fn() },
      sceneRenderer,
    });

    phase.start();
    phase.update(7, 0.016);
    phase.render();

    expect(render).toHaveBeenLastCalledWith(
      scene,
      expect.any(PerspectiveCamera),
      {
        kind: 'survival',
        elapsedSeconds: 7,
        phase: 'night',
        weather: 'squall',
        reducedMotion: false,
      },
    );
  });

  it('synchronizes inventory and projected anchors after renders, updates, and resize', () => {
    const current = snapshot();
    const syncInventory = vi.fn();
    const anchors = [{
      id: 'can', itemType: 'cannedFood' as const, toolId: null, action: 'eat' as const,
      remainingUses: 1, x: 400, y: 80, visible: true, depleted: false,
    }];
    const projectInteractionAnchors = vi.fn(() => anchors);
    const setAnchors = vi.fn();
    const phase = SurvivalPhase.forTest({
      session: { snapshot: vi.fn(() => current) },
      world: { syncInventory, projectInteractionAnchors, update: vi.fn(), dispose: vi.fn() },
      ui: { render: vi.fn(), setAnchors, setJournalUnread: vi.fn(), dispose: vi.fn() },
    });

    phase.start();
    phase.resize(800, 600);
    phase.update(1, 0.016);

    expect(syncInventory).toHaveBeenCalledWith(current);
    expect(projectInteractionAnchors).toHaveBeenLastCalledWith(800, 600);
    expect(setAnchors).toHaveBeenLastCalledWith(anchors);
  });

  it('renders and unlocks an accepted daytime action after its cue', async () => {
    const cue = deferred();
    const perform = vi.fn(() => accepted());
    const showFeedback = vi.fn();
    const setBusy = vi.fn();
    const render = vi.fn();
    const phase = SurvivalPhase.forTest({
      session: { snapshot: vi.fn(() => snapshot()), perform },
      world: { play: vi.fn(() => cue.promise), dispose: vi.fn() },
      ui: { render, showFeedback, setBusy, restoreCommandFocus: vi.fn(), setJournalUnread: vi.fn(), dispose: vi.fn() },
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
    phase.handleAction('fish');
    expect(showFeedback).toHaveBeenCalledWith(rejected);
    expect(play).not.toHaveBeenCalled();
    expect(setBusy).not.toHaveBeenCalled();
  });

  it('plays a scheduled day event cue and opens it without a continuation gate', async () => {
    const event = SURVIVAL_EVENTS.find(({ phase }) => phase === 'day')!;
    let current = snapshot();
    const calls: string[] = [];
    const requestDayEvent = vi.fn(() => {
      current = snapshot({ state: 'dayEvent', pendingEventId: event.id, actedToday: true });
      return accepted({ code: 'event-opened', cue: event.cue, deltas: {} });
    });
    const phase = SurvivalPhase.forTest({
      session: { snapshot: vi.fn(() => current), perform: vi.fn(() => accepted()), requestDayEvent },
      world: { play: vi.fn(async (cue) => { calls.push(cue); }), dispose: vi.fn() },
      ui: {
        render: vi.fn(), showFeedback: vi.fn(), setBusy: vi.fn(), setJournalUnread: vi.fn(),
        showEvent: vi.fn(() => calls.push('event')), dispose: vi.fn(),
      },
    });

    phase.handleAction('fish');
    await flushPromises();

    expect(requestDayEvent).toHaveBeenCalledOnce();
    expect(calls).toEqual(['fish', event.cue, 'event']);
  });

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

  it('holds a quiet night under cover and begins dawn without a journal modal', async () => {
    let current = snapshot({ state: 'nightEvent', journalEntries: [completedEntry(1, { kind: 'quiet' })] });
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
        setBusy: vi.fn(), render: vi.fn(), setJournalUnread: vi.fn(), showJournal,
        restoreCommandFocus: vi.fn(), dispose: vi.fn(),
      },
    });
    phase.handleAction('endDay');
    await flushPromises();
    expect(beginDawn).toHaveBeenCalledOnce();
    expect(showJournal).not.toHaveBeenCalled();
  });

  it('passes strict discriminated options through and selects the best hull repair resource', () => {
    let current = snapshot({ bait: 1, repairMaterial: 1 });
    const perform = vi.fn(() => ({ ...accepted(), accepted: false }));
    const phase = SurvivalPhase.forTest({
      session: { snapshot: vi.fn(() => current), perform },
      world: { dispose: vi.fn() },
      ui: { showFeedback: vi.fn(), dispose: vi.fn() },
    });

    phase.handleAction('fish', { kind: 'fishing', useBait: true });
    phase.handleAction('repair');
    current = snapshot({
      inventory: inventory({
        'ductTape-1': { instanceId: 'ductTape-1', type: 'ductTape', condition: 'usable' },
      }),
    });
    phase.handleAction('repair');

    expect(perform).toHaveBeenNthCalledWith(1, 'fish', { kind: 'fishing', useBait: true });
    expect(perform).toHaveBeenNthCalledWith(2, 'repair', { kind: 'hullRepair', material: 'repairMaterial' });
    expect(perform).toHaveBeenNthCalledWith(3, 'repair', { kind: 'hullRepair', material: 'ductTape' });
  });

  it('renders repair availability using the same selected resource as the command', () => {
    const availableReason = vi.fn((_action: string, option?: unknown) => (
      typeof option === 'object' && option !== null && 'kind' in option
        ? null
        : 'No repair material remains.'
    ));
    const render = vi.fn();
    const phase = SurvivalPhase.forTest({
      session: {
        snapshot: vi.fn(() => snapshot({
          inventory: inventory({
            'ductTape-1': { instanceId: 'ductTape-1', type: 'ductTape', condition: 'usable' },
          }),
        })),
        availableReason,
      },
      world: { dispose: vi.fn() },
      ui: { render, setJournalUnread: vi.fn(), dispose: vi.fn() },
    });

    phase.start();
    const unavailable = render.mock.calls[0]![1];

    expect(unavailable('repair')).toBeNull();
    expect(availableReason).toHaveBeenLastCalledWith(
      'repair',
      { kind: 'hullRepair', material: 'ductTape' },
    );
  });

  it('routes item and endure event commands through the same presentation lock', async () => {
    const cue = deferred();
    const resolveEvent = vi.fn(() => accepted({ code: 'event-resolved', cue: 'impact' }));
    const phase = SurvivalPhase.forTest({
      session: { snapshot: vi.fn(() => snapshot({ state: 'dayEvent' })), resolveEvent },
      world: { play: vi.fn(() => cue.promise), dispose: vi.fn() },
      ui: { hideEvent: vi.fn(), showFeedback: vi.fn(), setBusy: vi.fn(), dispose: vi.fn() },
    });

    phase.handleEventItem('custom-event-choice');
    phase.handleEndure();
    expect(resolveEvent).toHaveBeenCalledOnce();
    expect(resolveEvent).toHaveBeenCalledWith('custom-event-choice');

    cue.resolve();
    await flushPromises();
    phase.handleEndure();
    expect(resolveEvent).toHaveBeenLastCalledWith(null);
  });

  it('shows an ending once and restarts only through its callback', () => {
    const restart = vi.fn();
    const showEnding = vi.fn();
    const phase = SurvivalPhase.forTest({
      session: { snapshot: vi.fn(() => snapshot({ state: 'sunk', day: 6, seed: 8 })) },
      world: { update: vi.fn(), dispose: vi.fn() },
      ui: { render: vi.fn(), showEnding, dispose: vi.fn() },
      onRestart: restart,
    });

    phase.update(1, 0.016);
    phase.update(2, 0.016);

    expect(showEnding).toHaveBeenCalledOnce();
    expect(showEnding).toHaveBeenCalledWith('sunk', 6, 8, expect.any(Number));
    phase.requestRestart();
    phase.requestRestart();
    expect(restart).toHaveBeenCalledOnce();
  });

  it('shows a terminal daytime ending only after its cue completes', async () => {
    let current = snapshot();
    const cue = deferred();
    const showEnding = vi.fn();
    const phase = SurvivalPhase.forTest({
      session: {
        snapshot: vi.fn(() => current),
        perform: vi.fn(() => {
          current = snapshot({ state: 'sunk', day: 4 });
          return accepted({ code: 'boat-sunk', cue: 'sinking', deltas: { hull: -100 } });
        }),
      },
      world: { play: vi.fn(() => cue.promise), dispose: vi.fn() },
      ui: { showFeedback: vi.fn(), setBusy: vi.fn(), showEnding, render: vi.fn(), dispose: vi.fn() },
    });

    phase.handleAction('dive');
    expect(showEnding).not.toHaveBeenCalled();
    cue.resolve();
    await flushPromises();
    expect(showEnding).toHaveBeenCalledOnce();
  });

  it.each([
    ['dayEvent', false],
    ['nightEvent', true],
  ] as const)('resolves %s and calls dawn only for night events', async (state, expectsDawn) => {
    let current = snapshot({ state });
    const beginDawn = vi.fn(() => {
      current = snapshot({ state: 'day', day: 2 });
      return accepted({ code: 'dawn', cue: 'dawn' });
    });
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
      ui: {
        hideEvent: vi.fn(), showFeedback: vi.fn(), setBusy: vi.fn(), render: vi.fn(),
        setJournalUnread: vi.fn(), restoreCommandFocus: vi.fn(), dispose: vi.fn(),
      },
    });
    phase.handleEndure();
    await flushPromises();
    expect(beginDawn).toHaveBeenCalledTimes(expectsDawn ? 1 : 0);
  });

  it('shows a terminal night ending after its cue and skips dawn', async () => {
    let current = snapshot({ state: 'nightEvent', day: 5 });
    const beginDawn = vi.fn();
    const showEnding = vi.fn();
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
    const ui: Partial<SurvivalUI> = { render: vi.fn(), setJournalUnread, showJournal, dispose: vi.fn() };
    const phase = SurvivalPhase.forTest({
      session: { snapshot: vi.fn(() => snapshot({ day: 2, journalEntries: entries })), beginDawn },
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

  it('pauses while hidden and requires the UI resume action before updates continue', () => {
    const listeners = new Map<string, EventListener>();
    const fakeDocument = {
      hidden: false,
      addEventListener: vi.fn((type: string, listener: EventListener) => listeners.set(type, listener)),
      removeEventListener: vi.fn((type: string) => listeners.delete(type)),
    };
    vi.stubGlobal('document', fakeDocument);
    const update = vi.fn();
    const setPaused = vi.fn();
    const ui: Record<string, unknown> = { render: vi.fn(), setPaused, setJournalUnread: vi.fn(), dispose: vi.fn() };
    const phase = SurvivalPhase.forTest({
      session: { snapshot: vi.fn(() => snapshot()) },
      world: { update, setPhase: vi.fn(), setWeather: vi.fn(), dispose: vi.fn() }, ui,
    });
    phase.start();
    phase.update(1, 0.016);
    expect(update).toHaveBeenCalledOnce();
    fakeDocument.hidden = true;
    listeners.get('visibilitychange')!(new Event('visibilitychange'));
    phase.update(2, 0.016);
    expect(setPaused).toHaveBeenCalledWith(true);
    expect(update).toHaveBeenCalledOnce();
    fakeDocument.hidden = false;
    (ui.onPauseChange as (paused: boolean) => void)(false);
    phase.update(3, 0.016);
    expect(update).toHaveBeenCalledTimes(2);
  });

  it('wires command, pause, journal, and restart callbacks without camera input', () => {
    const perform = vi.fn(() => ({ ...accepted(), accepted: false }));
    const restart = vi.fn();
    const ui: Record<string, unknown> = {
      showFeedback: vi.fn(),
      showJournal: vi.fn(),
      setJournalUnread: vi.fn(),
      dispose: vi.fn(),
    };
    SurvivalPhase.forTest({
      session: { snapshot: vi.fn(() => snapshot()), perform },
      world: { dispose: vi.fn() },
      ui,
      onRestart: restart,
    });
    (ui.onAction as (action: 'fish', option: { kind: 'fishing'; useBait: true }) => void)(
      'fish',
      { kind: 'fishing', useBait: true },
    );
    (ui.onPauseChange as (paused: boolean) => void)(true);
    (ui.onRestart as () => void)();
    expect(perform).toHaveBeenCalledWith('fish', { kind: 'fishing', useBait: true });
    expect(restart).toHaveBeenCalledOnce();
    expect(ui).not.toHaveProperty('onPointer');
    expect(ui).not.toHaveProperty('onContinue');
    expect(ui).not.toHaveProperty('onJournalContinue');
    expect(ui).not.toHaveProperty('onSkip');
  });

  it('relays item highlight identity to the world and ignores it after disposal', () => {
    const setHighlightedItem = vi.fn();
    const ui: Partial<SurvivalUI> = { dispose: vi.fn() };
    const phase = SurvivalPhase.forTest({
      session: { snapshot: vi.fn(() => snapshot()) },
      world: { setHighlightedItem, dispose: vi.fn() }, ui,
    });
    ui.onAnchorHighlight?.('bucket-1');
    ui.onAnchorHighlight?.(null);
    expect(setHighlightedItem.mock.calls).toEqual([['bucket-1'], [null]]);
    phase.dispose();
    ui.onAnchorHighlight?.('bucket-1');
    expect(setHighlightedItem).toHaveBeenCalledTimes(2);
  });

  it('ignores async sequence completion after disposal and disposes owned resources once', async () => {
    const cue = deferred();
    const worldDispose = vi.fn();
    const uiDispose = vi.fn();
    const setBusy = vi.fn();
    const phase = SurvivalPhase.forTest({
      session: { snapshot: vi.fn(() => snapshot()), perform: vi.fn(() => accepted()) },
      world: { play: vi.fn(() => cue.promise), dispose: worldDispose },
      ui: { showFeedback: vi.fn(), setBusy, render: vi.fn(), dispose: uiDispose },
    });
    phase.handleAction('fish');
    phase.dispose();
    phase.dispose();
    cue.resolve();
    await flushPromises();
    expect(setBusy).toHaveBeenCalledTimes(1);
    expect(worldDispose).toHaveBeenCalledOnce();
    expect(uiDispose).toHaveBeenCalledOnce();
  });
});

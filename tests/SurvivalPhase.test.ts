import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ItemId } from '../src/game/ItemState';
import { ITEM_IDS } from '../src/game/ItemState';
import { SURVIVAL_EVENTS } from '../src/survival/events';
import { SurvivalPhase } from '../src/survival/SurvivalPhase';
import type { SurvivalInventory, SurvivalSnapshot } from '../src/survival/survivalTypes';
import type { SurvivalUI } from '../src/ui/SurvivalUI';

function inventory(overrides: Partial<Record<ItemId, Partial<SurvivalInventory[ItemId]>>> = {}): SurvivalInventory {
  return Object.fromEntries(ITEM_IDS.map((id) => [id, {
    owned: false,
    charges: null,
    durable: false,
    ...overrides[id],
  }])) as SurvivalInventory;
}

function snapshot(overrides: Partial<SurvivalSnapshot> = {}): SurvivalSnapshot {
  return {
    state: 'day',
    day: 1,
    health: 100,
    hunger: 20,
    energy: 80,
    hull: 100,
    food: 0,
    bait: 0,
    recoveredFood: 0,
    recoveredBait: 0,
    repairMaterial: 0,
    rescueProgress: 0,
    weather: 'calm',
    restedToday: false,
    actedToday: false,
    inventory: inventory(),
    savedItems: [],
    pendingEventId: null,
    lastOutcome: null,
    seed: 8,
    ...overrides,
  };
}

function accepted(overrides: Record<string, unknown> = {}) {
  return {
    accepted: true,
    code: 'fish-caught',
    message: 'Caught one.',
    deltas: { energy: -2, food: 1 },
    cue: 'fish' as const,
    ...overrides,
  };
}

async function flushPromises(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('SurvivalPhase orchestration', () => {
  it('synchronizes inventory and projected anchors after renders, updates, and resize', () => {
    const current = snapshot();
    const syncInventory = vi.fn();
    const anchors = [{
      id: 'horizon', itemType: null, action: 'endDay' as const, remainingUses: null,
      x: 400, y: 80, visible: true, depleted: false,
    }];
    const projectInteractionAnchors = vi.fn(() => anchors);
    const setAnchors = vi.fn();
    const phase = SurvivalPhase.forTest({
      session: { snapshot: vi.fn(() => current) },
      world: { syncInventory, projectInteractionAnchors, update: vi.fn(), dispose: vi.fn() },
      ui: { render: vi.fn(), setAnchors, dispose: vi.fn() },
    });

    phase.start();
    phase.resize(800, 600);
    phase.update(1, 0.016);

    expect(syncInventory).toHaveBeenCalledWith(current);
    expect(projectInteractionAnchors).toHaveBeenLastCalledWith(800, 600);
    expect(setAnchors).toHaveBeenLastCalledWith(anchors);
    expect(projectInteractionAnchors.mock.calls.length).toBeGreaterThanOrEqual(3);
  });

  it('resolves one command, blocks another through presentation, and renders the new snapshot after Continue', async () => {
    let finishSequence!: () => void;
    const play = vi.fn(() => new Promise<void>((resolve) => { finishSequence = resolve; }));
    const perform = vi.fn().mockReturnValue(accepted());
    const render = vi.fn();
    const hideOutcome = vi.fn();
    const setBusy = vi.fn();
    const phase = SurvivalPhase.forTest({
      session: { perform, snapshot: vi.fn(() => snapshot()) },
      world: { play, update: vi.fn(), dispose: vi.fn(), setPointer: vi.fn(), skipSequence: vi.fn() },
      ui: { render, showOutcome: vi.fn(), hideOutcome, setBusy, dispose: vi.fn() },
    });

    phase.handleAction('fish');
    phase.handleAction('fish');

    expect(perform).toHaveBeenCalledOnce();
    expect(setBusy).toHaveBeenCalledWith(true);
    finishSequence();
    await flushPromises();
    phase.handleAction('fish');
    expect(perform).toHaveBeenCalledOnce();

    phase.handleContinue();

    expect(hideOutcome).toHaveBeenCalledOnce();
    expect(render).toHaveBeenCalledWith(expect.objectContaining({ state: 'day', day: 1 }), expect.any(Function));
    expect(Math.min(...render.mock.invocationCallOrder)).toBeLessThan(hideOutcome.mock.invocationCallOrder[0]!);
  });

  it('presents the requested day-event cue and waits for a second Continue before opening the event', async () => {
    const event = SURVIVAL_EVENTS.find((candidate) => candidate.phase === 'day')!;
    let current = snapshot();
    const eventOutcome = accepted({ code: 'event-opened', message: event.prompt, cue: event.cue, deltas: {} });
    const requestDayEvent = vi.fn(() => {
      current = snapshot({ state: 'dayEvent', actedToday: true, pendingEventId: event.id });
      return eventOutcome;
    });
    const play = vi.fn(() => Promise.resolve());
    const showEvent = vi.fn();
    const showOutcome = vi.fn();
    const phase = SurvivalPhase.forTest({
      session: {
        snapshot: vi.fn(() => current),
        perform: vi.fn(() => accepted()),
        requestDayEvent,
      },
      world: { play, dispose: vi.fn() },
      ui: { render: vi.fn(), showOutcome, hideOutcome: vi.fn(), setBusy: vi.fn(), showEvent, dispose: vi.fn() },
    });

    phase.handleAction('fish');
    await flushPromises();
    expect(requestDayEvent).not.toHaveBeenCalled();

    phase.handleContinue();

    expect(requestDayEvent).toHaveBeenCalledOnce();
    expect(showOutcome).toHaveBeenLastCalledWith(eventOutcome);
    expect(play).toHaveBeenNthCalledWith(2, event.cue);
    expect(showEvent).not.toHaveBeenCalled();

    await flushPromises();
    expect(showEvent).not.toHaveBeenCalled();
    phase.handleContinue();
    expect(showEvent).toHaveBeenCalledWith(event, current);
  });

  it('opens the night event only after the end-day presentation is continued', async () => {
    const event = SURVIVAL_EVENTS.find((candidate) => candidate.phase === 'night')!;
    let current = snapshot();
    const perform = vi.fn(() => {
      current = snapshot({ state: 'nightEvent', pendingEventId: event.id });
      return accepted({ code: 'event-opened', message: event.prompt, cue: event.cue, deltas: {} });
    });
    const showEvent = vi.fn();
    const phase = SurvivalPhase.forTest({
      session: { snapshot: vi.fn(() => current), perform },
      world: { play: vi.fn(() => Promise.resolve()), dispose: vi.fn() },
      ui: { render: vi.fn(), showOutcome: vi.fn(), hideOutcome: vi.fn(), setBusy: vi.fn(), showEvent, dispose: vi.fn() },
    });

    phase.handleAction('endDay');
    await flushPromises();

    expect(perform).toHaveBeenCalledWith('endDay', undefined);
    expect(showEvent).not.toHaveBeenCalled();
    phase.handleContinue();
    expect(showEvent).toHaveBeenCalledWith(event, current);
  });

  it('passes the bait option through and selects the best available repair resource', () => {
    let current = snapshot({ bait: 1, repairMaterial: 1 });
    const perform = vi.fn(() => ({ ...accepted(), accepted: false }));
    const phase = SurvivalPhase.forTest({
      session: { snapshot: vi.fn(() => current), perform },
      world: { dispose: vi.fn() },
      ui: { showOutcome: vi.fn(), dispose: vi.fn() },
    });

    phase.handleAction('fish', 'useBait');
    phase.handleContinue();
    phase.handleAction('repair');
    phase.handleContinue();
    current = snapshot({
      inventory: inventory({ ductTape: { owned: true, charges: 1, durable: false } }),
    });
    phase.handleAction('repair');

    expect(perform).toHaveBeenNthCalledWith(1, 'fish', 'useBait');
    expect(perform).toHaveBeenNthCalledWith(2, 'repair', 'repairMaterial');
    expect(perform).toHaveBeenNthCalledWith(3, 'repair', 'ductTape');
  });

  it('renders repair availability using the same selected resource as the command', () => {
    const availableReason = vi.fn((_action: string, option?: string) => option === 'ductTape' ? null : 'No repair material remains.');
    const render = vi.fn();
    const phase = SurvivalPhase.forTest({
      session: {
        snapshot: vi.fn(() => snapshot({
          inventory: inventory({ ductTape: { owned: true, charges: 1, durable: false } }),
        })),
        availableReason,
      },
      world: { dispose: vi.fn() },
      ui: { render, dispose: vi.fn() },
    });

    phase.start();
    const unavailable = render.mock.calls[0]![1];

    expect(unavailable('repair')).toBeNull();
    expect(availableReason).toHaveBeenLastCalledWith('repair', 'ductTape');
  });

  it('routes item and endure event commands through the same presentation lock', async () => {
    let finishSequence!: () => void;
    const play = vi.fn(() => new Promise<void>((resolve) => { finishSequence = resolve; }));
    const resolveEvent = vi.fn(() => accepted({ code: 'event-resolved', cue: 'impact' }));
    const phase = SurvivalPhase.forTest({
      session: { snapshot: vi.fn(() => snapshot({ state: 'dayEvent' })), resolveEvent },
      world: { play, dispose: vi.fn() },
      ui: { showOutcome: vi.fn(), setBusy: vi.fn(), dispose: vi.fn() },
    });

    phase.handleEventItem('flareGun');
    phase.handleEndure();
    expect(resolveEvent).toHaveBeenCalledOnce();
    expect(resolveEvent).toHaveBeenCalledWith('flareGun');

    finishSequence();
    await flushPromises();
    phase.handleContinue();
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

  it('keeps a terminal action outcome visible until its cue and explicit Continue complete', async () => {
    let current = snapshot();
    let finishSequence!: () => void;
    const play = vi.fn(() => new Promise<void>((resolve) => { finishSequence = resolve; }));
    const showEnding = vi.fn();
    const hideOutcome = vi.fn();
    const phase = SurvivalPhase.forTest({
      session: {
        snapshot: vi.fn(() => current),
        perform: vi.fn(() => {
          current = snapshot({ state: 'sunk', day: 4 });
          return accepted({ code: 'boat-sunk', cue: 'sinking', deltas: { hull: -100 } });
        }),
      },
      world: { play, update: vi.fn(), dispose: vi.fn() },
      ui: { showOutcome: vi.fn(), hideOutcome, setBusy: vi.fn(), showEnding, render: vi.fn(), dispose: vi.fn() },
    });

    phase.handleAction('dive');
    phase.update(1, 0.016);
    expect(showEnding).not.toHaveBeenCalled();

    finishSequence();
    await flushPromises();
    phase.update(2, 0.016);
    expect(showEnding).not.toHaveBeenCalled();

    phase.handleContinue();
    phase.update(3, 0.016);
    expect(hideOutcome).toHaveBeenCalledOnce();
    expect(showEnding).toHaveBeenCalledOnce();
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
    const ui: Record<string, unknown> = { render: vi.fn(), setPaused, dispose: vi.fn() };
    const phase = SurvivalPhase.forTest({
      session: { snapshot: vi.fn(() => snapshot()) },
      world: { update, setPhase: vi.fn(), setWeather: vi.fn(), dispose: vi.fn() },
      ui,
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
    listeners.get('visibilitychange')!(new Event('visibilitychange'));
    phase.update(3, 0.016);
    expect(update).toHaveBeenCalledOnce();

    (ui.onPauseChange as (paused: boolean) => void)(false);
    phase.update(4, 0.016);
    expect(update).toHaveBeenCalledTimes(2);
  });

  it('wires the UI callbacks to pointer, skip, command, Continue, pause, and restart handlers', () => {
    const perform = vi.fn(() => ({ ...accepted(), accepted: false }));
    const setPointer = vi.fn();
    const skipSequence = vi.fn();
    const restart = vi.fn();
    const ui: Record<string, unknown> = { showOutcome: vi.fn(), dispose: vi.fn() };
    SurvivalPhase.forTest({
      session: { snapshot: vi.fn(() => snapshot()), perform },
      world: { setPointer, skipSequence, dispose: vi.fn() },
      ui,
      onRestart: restart,
    });

    (ui.onAction as (action: 'fish', option: 'useBait') => void)('fish', 'useBait');
    (ui.onPointer as (x: number, y: number) => void)(0.25, -0.5);
    (ui.onSkip as () => void)();
    (ui.onPauseChange as (paused: boolean) => void)(true);
    (ui.onRestart as () => void)();

    expect(perform).toHaveBeenCalledWith('fish', 'useBait');
    expect(setPointer).toHaveBeenCalled();
    expect(skipSequence).toHaveBeenCalledOnce();
    expect(restart).toHaveBeenCalledOnce();
  });

  it('relays item highlight identity to the world and ignores it after disposal', () => {
    const setHighlightedItem = vi.fn();
    const ui: Partial<SurvivalUI> = { dispose: vi.fn() };
    const phase = SurvivalPhase.forTest({
      session: { snapshot: vi.fn(() => snapshot()) },
      world: { setHighlightedItem, dispose: vi.fn() },
      ui,
    });

    ui.onAnchorHighlight?.('fishingRod-1');
    ui.onAnchorHighlight?.(null);
    expect(setHighlightedItem).toHaveBeenNthCalledWith(1, 'fishingRod-1');
    expect(setHighlightedItem).toHaveBeenNthCalledWith(2, null);

    phase.dispose();
    ui.onAnchorHighlight?.('fishingRod-1');
    expect(setHighlightedItem).toHaveBeenCalledTimes(2);
  });

  it('ignores async sequence completion after disposal and disposes owned resources once', async () => {
    let finishSequence!: () => void;
    const play = vi.fn(() => new Promise<void>((resolve) => { finishSequence = resolve; }));
    const worldDispose = vi.fn();
    const uiDispose = vi.fn();
    const setBusy = vi.fn();
    const phase = SurvivalPhase.forTest({
      session: { snapshot: vi.fn(() => snapshot()), perform: vi.fn(() => accepted()) },
      world: { play, dispose: worldDispose },
      ui: { showOutcome: vi.fn(), setBusy, hideOutcome: vi.fn(), render: vi.fn(), dispose: uiDispose },
    });

    phase.handleAction('fish');
    phase.dispose();
    phase.dispose();
    finishSequence();
    await flushPromises();
    phase.handleContinue();

    expect(setBusy).toHaveBeenCalledTimes(1);
    expect(worldDispose).toHaveBeenCalledOnce();
    expect(uiDispose).toHaveBeenCalledOnce();
  });
});

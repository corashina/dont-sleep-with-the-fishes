// Importance: 10/10. Protects day-action order, covers, feedback, and lifecycle guards.
import { describe, expect, it, vi } from 'vitest';
import {
  formatDiveResult,
  SurvivalDayActionFlow,
  type DayActionAudioPort,
  type DayActionEventPort,
  type DayActionSessionPort,
  type DayActionUiPort,
  type DayActionWorldPort,
} from '../src/survival/SurvivalDayActionFlow';
import type {
  ActionOutcome,
  DayActionId,
  DayActionOption,
} from '../src/survival/survivalTypes';
import type { SurvivalSnapshot } from '../src/survival/survivalSnapshot';

interface Deferred {
  readonly promise: Promise<void>;
  readonly resolve: () => void;
  readonly reject: (error: unknown) => void;
}

function deferred(): Deferred {
  let resolve!: () => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<void>((settle, fail) => {
    resolve = settle;
    reject = fail;
  });
  return { promise, resolve, reject };
}

function snapshot(overrides: Partial<SurvivalSnapshot> = {}): SurvivalSnapshot {
  return {
    state: 'day',
    ending: null,
    day: 1,
    pressure: 0,
    health: 100,
    hunger: 20,
    energy: 3,
    hull: 100,
    food: 0,
    bait: 0,
    recoveredFood: 0,
    recoveredBait: 0,
    repairMaterial: 0,
    rescueLead: 0,
    rescueTraceFinds: 0,
    radioSignalAvailable: false,
    radioSignalsSent: 0,
    chest: { state: 'none', acquiredDay: null },
    weather: 'calm',
    actedToday: false,
    journalEntries: [],
    inventory: {},
    savedItems: [],
    carlitos: null,
    pendingEventId: null,
    pendingEventTargetId: null,
    lastOutcome: null,
    seed: 8,
    ...overrides,
  };
}

function accepted(overrides: Partial<ActionOutcome> = {}): ActionOutcome {
  return {
    accepted: true,
    code: 'action-complete',
    message: 'Action complete.',
    deltas: { energy: -1 },
    cue: 'repair',
    ...overrides,
  };
}

function createRig() {
  const calls: string[] = [];
  let current = snapshot();
  let outcome = accepted();
  let lifecycleGeneration = 0;
  let lifecycleActive = true;

  const session = {
    snapshot: vi.fn(() => current),
    perform: vi.fn((action: DayActionId, option?: DayActionOption) => {
      calls.push(`perform:${action}:${option?.kind ?? 'none'}`);
      return outcome;
    }),
    availableReason: vi.fn(() => null),
  } as unknown as DayActionSessionPort;
  const world = {
    play: vi.fn(async (cue: string) => { calls.push(`world:play:${cue}`); }),
    playCarlitosAction: vi.fn(async (action: string) => {
      calls.push(`world:carlitos:${action}`);
    }),
    playDive: vi.fn(async (instanceId: string, options: {
      readonly onWaterImpact: () => void;
      readonly revealUnderwaterScene: boolean;
    }) => {
      calls.push(`world:dive:${instanceId}`);
      options.onWaterImpact();
    }),
    clearDivePresentation: vi.fn(() => calls.push('world:clear-dive')),
  } as unknown as DayActionWorldPort;
  const ui = {
    showFeedback: vi.fn(() => calls.push('ui:feedback')),
    showRewardResult: vi.fn(async (view: { title: string }) => {
      calls.push(`ui:reward:${view.title}`);
    }),
    restoreCommandFocus: vi.fn(() => calls.push('ui:focus')),
    setSleepCoverProfile: vi.fn(async (profile: string) => {
      calls.push(`ui:profile:${profile}`);
    }),
    setSleepCovered: vi.fn(async (covered: boolean) => {
      calls.push(`ui:cover:${covered}`);
    }),
    holdDiveCovered: vi.fn(async () => { calls.push('ui:hold-dive'); }),
    holdSleep: vi.fn(async () => { calls.push('ui:hold-sleep'); }),
    beginEventPresentation: vi.fn(() => calls.push('ui:begin-event')),
  } as unknown as DayActionUiPort;
  const audio = {
    deny: vi.fn(() => calls.push('audio:deny')),
    action: vi.fn((action: DayActionId) => calls.push(`audio:action:${action}`)),
    sleep: vi.fn(() => calls.push('audio:sleep')),
    beginDive: vi.fn(() => calls.push('audio:begin-dive')),
    finishDive: vi.fn(() => calls.push('audio:finish-dive')),
    cancelDive: vi.fn(() => calls.push('audio:cancel-dive')),
    nightfall: vi.fn(() => calls.push('audio:nightfall')),
  } as unknown as DayActionAudioPort;
  const events = {
    sync: vi.fn(() => calls.push('events:sync')),
    beginDeferredSync: vi.fn(() => calls.push('events:defer')),
    cancelDeferredSync: vi.fn(() => calls.push('events:cancel-defer')),
    beginNightTransition: vi.fn(() => {
      calls.push('events:begin-night');
      return true;
    }),
    beginDawn: vi.fn(async () => {
      calls.push('events:dawn');
      current = snapshot({ day: current.day + 1 });
      return current;
    }),
    revealPending: vi.fn(async () => { calls.push('events:reveal'); }),
    finishQuietNight: vi.fn(() => calls.push('events:finish-night')),
    clearAfterFailure: vi.fn(() => calls.push('events:clear-failure')),
  } as unknown as DayActionEventPort;
  const renderSnapshot = vi.fn(() => {
    calls.push(`render:${current.state}`);
    return current;
  });
  const renderAndSettleCoveredScene = vi.fn(async () => {
    calls.push('render:covered');
    return true;
  });
  const presentTerminal = vi.fn((value: SurvivalSnapshot) => {
    calls.push(`terminal:${value.state}`);
  });
  const setBusy = vi.fn((busy: boolean) => { calls.push(`busy:${busy}`); });
  const waitForVisibilityResume = vi.fn(async () => true);
  const onInvariantError = vi.fn();
  const onFatalError = vi.fn();
  const flow = new SurvivalDayActionFlow({
    session,
    world,
    ui,
    audio,
    events,
    renderSnapshot,
    renderAndSettleCoveredScene,
    presentTerminal,
    setBusy,
    waitForVisibilityResume,
    captureLifecycleGeneration: () => lifecycleGeneration,
    advanceLifecycleGeneration: () => ++lifecycleGeneration,
    isLifecycleGenerationCurrent: (generation) => (
      lifecycleActive && generation === lifecycleGeneration
    ),
    onInvariantError,
    onFatalError,
  });

  return {
    flow,
    session,
    world,
    ui,
    audio,
    events,
    calls,
    renderSnapshot,
    renderAndSettleCoveredScene,
    presentTerminal,
    setBusy,
    waitForVisibilityResume,
    onInvariantError,
    onFatalError,
    setSnapshot: (value: SurvivalSnapshot) => { current = value; },
    setOutcome: (value: ActionOutcome) => { outcome = value; },
    restart: () => {
      lifecycleActive = false;
      lifecycleGeneration += 1;
    },
  };
}

describe('formatDiveResult', () => {
  it.each([
    [{ food: 1, energy: -3 }, { kind: 'resource', id: 'food', quantity: 1 }, []],
    [{ bait: 1, energy: -3 }, { kind: 'resource', id: 'bait', quantity: 1 }, []],
    [{ repairMaterial: 1, energy: -3 }, { kind: 'resource', id: 'repairMaterial', quantity: 1 }, []],
    [{ rescueLead: 1, energy: -3 }, null, ['RESCUE TRACE FOUND']],
    [{ energy: -3 }, null, ['NOTHING FOUND']],
    [{ energy: -3, health: -10 }, null, ['NOTHING FOUND', 'YOU SUFFERED SOME INJURIES']],
  ] as const)('formats exact dive deltas', (deltas, reward, lines) => {
    expect(formatDiveResult(accepted({ deltas }))).toEqual({
      title: 'DIVE RESULT',
      reward,
      lines,
    });
  });

  it('passes an item reward to the result paper', () => {
    const rewardSummary = { kind: 'item', id: 'energyBar', quantity: 1 } as const;
    expect(formatDiveResult(accepted({ deltas: { energy: -3 }, rewardSummary }))).toEqual({
      title: 'DIVE RESULT',
      reward: rewardSummary,
      lines: [],
    });
  });
});

describe('SurvivalDayActionFlow', () => {
  it('routes a rejected command through deny and feedback without busy state', async () => {
    const rig = createRig();
    const rejection = accepted({
      accepted: false,
      code: 'no-energy',
      message: 'No energy remains.',
    });
    rig.setOutcome(rejection);

    await rig.flow.run('repair');

    expect(rig.audio.deny).toHaveBeenCalledOnce();
    expect(rig.ui.showFeedback).toHaveBeenCalledWith(rejection);
    expect(rig.setBusy).not.toHaveBeenCalled();
    expect(rig.world.play).not.toHaveBeenCalled();
  });

  it('runs a normal action and restores focus after its cue', async () => {
    const rig = createRig();
    const cue = deferred();
    vi.mocked(rig.world.play).mockImplementationOnce(() => cue.promise);

    const pending = rig.flow.run('eat');

    expect(rig.calls).toEqual([
      'perform:eat:none',
      'audio:action:eat',
      'busy:true',
    ]);
    cue.resolve();
    await pending;

    expect(rig.calls).toEqual([
      'perform:eat:none',
      'audio:action:eat',
      'busy:true',
      'render:day',
      'busy:false',
      'ui:focus',
    ]);
  });

  it('holds chest presentation sync until reward confirmation', async () => {
    const rig = createRig();
    const before = snapshot({ chest: { state: 'closed', acquiredDay: 1 } });
    const after = snapshot({ chest: { state: 'none', acquiredDay: null } });
    const cue = deferred();
    const reward = deferred();
    rig.setSnapshot(before);
    rig.setOutcome(accepted({
      code: 'chest-opened',
      rewardSummary: { kind: 'resource', id: 'food', quantity: 2 },
    }));
    vi.mocked(rig.session.perform).mockImplementationOnce(() => {
      rig.setSnapshot(after);
      return accepted({
        code: 'chest-opened',
        rewardSummary: { kind: 'resource', id: 'food', quantity: 2 },
      });
    });
    vi.mocked(rig.world.play).mockImplementationOnce(() => cue.promise);
    vi.mocked(rig.ui.showRewardResult).mockImplementationOnce(() => reward.promise);

    const pending = rig.flow.run('openChest');

    expect(rig.events.beginDeferredSync).toHaveBeenCalledWith(before, 1);
    expect(rig.calls).toContain('events:defer');
    expect(rig.renderSnapshot).not.toHaveBeenCalled();
    cue.resolve();
    await Promise.resolve();
    expect(rig.ui.showRewardResult).toHaveBeenCalledWith({
      title: 'CHEST REWARD',
      reward: { kind: 'resource', id: 'food', quantity: 2 },
      lines: [],
    });
    expect(rig.events.cancelDeferredSync).not.toHaveBeenCalled();

    reward.resolve();
    await pending;

    expect(rig.events.cancelDeferredSync).toHaveBeenCalledWith(1);
    expect(rig.calls.indexOf('events:cancel-defer'))
      .toBeLessThan(rig.calls.indexOf('render:day'));
    expect(rig.ui.restoreCommandFocus).toHaveBeenCalledOnce();
  });

  it.each(['petCarlitos', 'feedCarlitos'] as const)(
    'syncs and presents %s after the accepted mutation',
    async (action) => {
      const rig = createRig();

      await rig.flow.run(action);

      expect(rig.events.sync).toHaveBeenCalledOnce();
      if (action === 'petCarlitos') {
        expect(rig.world.playCarlitosAction).toHaveBeenCalledWith(
          action,
          expect.any(Function),
        );
      } else {
        expect(rig.world.playCarlitosAction).toHaveBeenCalledWith(action);
      }
      expect(rig.calls.indexOf('audio:action:' + action))
        .toBeLessThan(rig.calls.indexOf('events:sync'));
      expect(rig.calls.indexOf('events:sync'))
        .toBeLessThan(rig.calls.indexOf(`world:carlitos:${action}`));
      expect(rig.ui.restoreCommandFocus).toHaveBeenCalledOnce();
    },
  );

  it('runs the dive cover, hold, reward, and focus sequence in order', async () => {
    const rig = createRig();
    rig.setSnapshot(snapshot({
      inventory: {
        'scubaSet-1': {
          instanceId: 'scubaSet-1',
          type: 'scubaSet',
          condition: 'usable',
        },
      },
    }));
    rig.setOutcome(accepted({
      code: 'dive-food',
      cue: 'dive',
      deltas: { energy: -3, food: 1 },
    }));

    await rig.flow.run('dive');

    expect(rig.world.playDive).toHaveBeenCalledWith(
      'scubaSet-1',
      {
        onWaterImpact: expect.any(Function),
        revealUnderwaterScene: false,
      },
    );
    expect(rig.calls).toEqual([
      'perform:dive:none',
      'busy:true',
      'world:dive:scubaSet-1',
      'audio:begin-dive',
      'ui:profile:dive',
      'ui:cover:true',
      'world:clear-dive',
      'audio:finish-dive',
      'render:day',
      'render:covered',
      'ui:hold-dive',
      'ui:cover:false',
      'ui:profile:solid',
      'ui:reward:DIVE RESULT',
      'busy:false',
      'ui:focus',
    ]);
  });

  it('holds a terminal dive result before presenting the ending', async () => {
    const rig = createRig();
    const result = deferred();
    rig.setSnapshot(snapshot({ state: 'dead', health: 0 }));
    rig.setOutcome(accepted({ cue: 'dive', deltas: { energy: -3, health: -4 } }));
    vi.mocked(rig.ui.showRewardResult).mockImplementationOnce(() => result.promise);

    const pending = rig.flow.run('dive');
    await Promise.resolve();
    await Promise.resolve();
    expect(rig.presentTerminal).not.toHaveBeenCalled();

    result.resolve();
    await pending;

    expect(rig.presentTerminal).toHaveBeenCalledWith(expect.objectContaining({ state: 'dead' }));
    expect(rig.ui.restoreCommandFocus).not.toHaveBeenCalled();
  });

  it('holds a quiet night, requests dawn, and removes the sleep cover', async () => {
    const rig = createRig();
    rig.setSnapshot(snapshot({ state: 'nightEvent' }));
    rig.setOutcome(accepted({ code: 'quiet-night', cue: 'nightfall' }));

    await rig.flow.run('endDay');

    expect(rig.calls).toEqual([
      'perform:endDay:none',
      'audio:sleep',
      'events:begin-night',
      'world:play:nightfall',
      'ui:cover:true',
      'audio:nightfall',
      'render:nightEvent',
      'ui:hold-sleep',
      'events:dawn',
      'render:covered',
      'ui:cover:false',
      'events:finish-night',
      'terminal:day',
      'ui:focus',
    ]);
  });

  it('hands an eventful night to the event flow while covered', async () => {
    const rig = createRig();
    const night = snapshot({ state: 'nightEvent', pendingEventId: 'fog-wall' });
    rig.setSnapshot(night);
    rig.setOutcome(accepted({ code: 'night-event', cue: 'nightfall' }));

    await rig.flow.run('endDay');

    expect(rig.events.beginNightTransition).toHaveBeenCalledWith(night, true);
    expect(rig.events.revealPending).toHaveBeenCalledWith(night, true);
    expect(rig.ui.holdSleep).not.toHaveBeenCalled();
    expect(rig.events.beginDawn).not.toHaveBeenCalled();
  });

  it('selects repair resources and coordinates unavailable reasons', async () => {
    const rig = createRig();
    const material = snapshot({ repairMaterial: 1 });
    rig.setSnapshot(material);

    await rig.flow.run('repair');

    expect(rig.session.perform).toHaveBeenCalledWith('repair', {
      kind: 'hullRepair',
      material: 'repairMaterial',
    });

    const items = snapshot({
      inventory: {
        'ductTape-1': {
          instanceId: 'ductTape-1', type: 'ductTape', condition: 'usable',
        },
        'compass-1': {
          instanceId: 'compass-1', type: 'compass', condition: 'broken',
        },
      },
    });
    expect(rig.flow.repairOption(items)).toEqual({
      kind: 'hullRepair',
      material: 'ductTape',
    });
    expect(rig.flow.repairItemReason(items)).toBeNull();
    expect(rig.session.availableReason).toHaveBeenLastCalledWith('repairItem', {
      kind: 'itemRepair',
      target: 'compass-1',
    });
    expect(rig.flow.repairItemReason(snapshot()))
      .toBe('No broken repairable item remains.');
  });

  it('makes disposed and restarted continuations inert', async () => {
    const rig = createRig();
    const cue = deferred();
    vi.mocked(rig.world.play).mockImplementationOnce(() => cue.promise);
    const disposed = rig.flow.run('eat');

    rig.flow.dispose();
    rig.flow.dispose();
    cue.resolve();
    await disposed;

    expect(rig.audio.cancelDive).not.toHaveBeenCalled();
    expect(rig.renderSnapshot).not.toHaveBeenCalled();
    expect(rig.setBusy).toHaveBeenCalledTimes(1);
    expect(rig.ui.restoreCommandFocus).not.toHaveBeenCalled();

    const restartedRig = createRig();
    const restartedCue = deferred();
    vi.mocked(restartedRig.world.play).mockImplementationOnce(() => restartedCue.promise);
    const restarted = restartedRig.flow.run('eat');
    restartedRig.restart();
    restartedCue.resolve();
    await restarted;
    expect(restartedRig.renderSnapshot).not.toHaveBeenCalled();
    expect(restartedRig.ui.restoreCommandFocus).not.toHaveBeenCalled();
  });

  it('blocks an older local operation after a newer command starts', async () => {
    const rig = createRig();
    const first = deferred();
    const second = deferred();
    vi.mocked(rig.world.play)
      .mockImplementationOnce(() => first.promise)
      .mockImplementationOnce(() => second.promise);

    const firstRun = rig.flow.run('eat');
    const secondRun = rig.flow.run('treat');
    first.resolve();
    await firstRun;
    expect(rig.renderSnapshot).not.toHaveBeenCalled();

    second.resolve();
    await secondRun;
    expect(rig.renderSnapshot).toHaveBeenCalledOnce();
    expect(rig.ui.restoreCommandFocus).toHaveBeenCalledOnce();
  });

  it('keeps the primary failure while chest cleanup and unlock fail', async () => {
    const rig = createRig();
    const primary = new Error('cue failed');
    vi.mocked(rig.world.play).mockRejectedValueOnce(primary);
    vi.mocked(rig.events.cancelDeferredSync).mockImplementationOnce(() => {
      throw new Error('deferred cleanup failed');
    });
    vi.mocked(rig.setBusy).mockImplementation((busy: boolean) => {
      rig.calls.push(`busy:${busy}`);
      if (!busy) throw new Error('unlock failed');
    });

    await rig.flow.run('openChest');

    expect(rig.onFatalError).toHaveBeenCalledTimes(1);
    expect(rig.onFatalError).toHaveBeenCalledWith(primary);
  });

  it('runs dive audio cleanup when presentation cleanup fails', async () => {
    const rig = createRig();
    const primary = new Error('dive failed');
    vi.mocked(rig.world.playDive).mockRejectedValueOnce(primary);
    vi.mocked(rig.world.clearDivePresentation).mockImplementationOnce(() => {
      throw new Error('dive presentation cleanup failed');
    });

    await rig.flow.run('dive');

    expect(rig.audio.cancelDive).toHaveBeenCalledOnce();
    expect(rig.onFatalError).toHaveBeenCalledExactlyOnceWith(primary);
  });

  it('keeps an end-day error primary when event cleanup fails', async () => {
    const rig = createRig();
    const primary = new Error('night cue failed');
    vi.mocked(rig.world.play).mockRejectedValueOnce(primary);
    vi.mocked(rig.events.clearAfterFailure).mockImplementationOnce(() => {
      throw new Error('event cleanup failed');
    });

    await rig.flow.run('endDay');

    expect(rig.events.clearAfterFailure).toHaveBeenCalledOnce();
    expect(rig.events.finishQuietNight).toHaveBeenCalledOnce();
    expect(rig.onFatalError).toHaveBeenCalledExactlyOnceWith(primary);
  });

  it('cancels dive audio when visibility settles', () => {
    const rig = createRig();

    rig.flow.settleForVisibilityChange();

    expect(rig.audio.cancelDive).toHaveBeenCalledOnce();
  });
});

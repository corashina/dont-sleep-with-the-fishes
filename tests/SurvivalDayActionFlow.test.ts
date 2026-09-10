// Importance: 10/10. Protects day-action order, covers, feedback, and lifecycle guards.
import { describe,expect,it,vi } from 'vitest';
import {
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
    history: [],
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
    playRepairToolboxAnimation: vi.fn(async (onAudioStart?: () => void) => {
      calls.push('world:repair-hammer');
      onAudioStart?.();
    }),
    playCarlitosAction: vi.fn(async (action: string) => {
      calls.push(`world:carlitos:${action}`);
    }),
    playDive: vi.fn(async (instanceId: string, options: {
      readonly onWaterImpact: () => void;
    }) => {
      calls.push(`world:dive:${instanceId}`);
      options.onWaterImpact();
    }),
    clearDivePresentation: vi.fn(() => calls.push('world:clear-dive')),
  } as unknown as DayActionWorldPort;
  const ui = {
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
    meowCarlitos: vi.fn(),
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

describe('SurvivalDayActionFlow', () => {
  it('keeps the last can on the boat until feeding finishes', async () => {
    const rig = createRig();
    const before = snapshot({ food: 1 });
    const after = snapshot({ food: 0 });
    const animation = deferred();
    rig.setSnapshot(before);
    vi.mocked(rig.session.perform).mockImplementation(() => {
      rig.setSnapshot(after);
      return accepted({ cue: 'none', deltas: { food: -1 } });
    });
    vi.mocked(rig.world.playCarlitosAction).mockReturnValue(animation.promise);
    const feeding = rig.flow.run('feedCarlitos');
    expect(rig.events.beginDeferredSync).toHaveBeenCalledWith(before, 0);
    expect(rig.events.sync).not.toHaveBeenCalledWith(after);
    expect(rig.renderSnapshot).not.toHaveBeenCalled();
    expect(rig.audio.meowCarlitos).not.toHaveBeenCalled();
    vi.mocked(rig.world.playCarlitosAction).mock.lastCall?.[1]?.();
    expect(rig.audio.meowCarlitos).toHaveBeenCalledOnce();
    animation.resolve();
    await feeding;
    expect(rig.events.cancelDeferredSync).toHaveBeenCalledWith(0);
    expect(rig.renderSnapshot).toHaveBeenCalledOnce();
    expect(rig.renderSnapshot.mock.results[0]?.value).toBe(after);
  });

  it.each(['repair', 'repairItem'] as const)(
    'renders %s resource changes before its cue settles',
    async (action) => {
      const rig = createRig();
      const cue = deferred();
      const play = action === 'repair' ? rig.world.playRepairToolboxAnimation : rig.world.play;
      vi.mocked(play).mockImplementationOnce(() => cue.promise);

      const pending = rig.flow.run(action);

      expect(rig.renderSnapshot).toHaveBeenCalledOnce();
      expect(rig.renderSnapshot.mock.invocationCallOrder[0])
        .toBeLessThan(vi.mocked(play).mock.invocationCallOrder[0]!);
      cue.resolve();
      await pending;
      expect(rig.renderSnapshot).toHaveBeenCalledOnce();
    },
  );

  it('waits for the repair hammer and starts its sound at the animation cue', async () => {
    const rig = createRig();
    const animation = deferred();
    let startSound!: () => void;
    vi.mocked(rig.world.playRepairToolboxAnimation).mockImplementationOnce((onAudioStart) => {
      startSound = onAudioStart!;
      return animation.promise;
    });
    const pending = rig.flow.run('repair');
    expect(rig.world.playRepairToolboxAnimation).toHaveBeenCalledOnce();
    expect(rig.world.play).not.toHaveBeenCalled();
    expect(rig.audio.action).not.toHaveBeenCalled();
    expect(rig.setBusy).toHaveBeenLastCalledWith(true);
    startSound();
    expect(rig.audio.action).toHaveBeenCalledExactlyOnceWith('repair');
    animation.resolve();
    await pending;
    expect(rig.setBusy).toHaveBeenLastCalledWith(false);
    expect(rig.ui.restoreCommandFocus).toHaveBeenCalledOnce();
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
      },
    );
    expect(rig.calls).toEqual([
      'perform:dive:none',
      'events:defer',
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
      'events:cancel-defer',
      'events:sync',
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

  it('cancels dive audio when visibility settles', () => {
    const rig = createRig();

    rig.flow.settleForVisibilityChange();

    expect(rig.audio.cancelDive).toHaveBeenCalledOnce();
  });
});

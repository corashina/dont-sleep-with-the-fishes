// Importance: 5/5. Protects the scavenging state machine.
import { describe, expect, it } from 'vitest';
import type { ItemInstance } from '../src/game/ItemState';
import { ScavengeSession } from '../src/game/ScavengeSession';
import { createScavengeItemInstances } from '../src/game/scavengeCatalog';

const BLOCKED_STATE_SETUPS = [
  { name: 'paused', enter: (session: ScavengeSession) => session.pause() },
  { name: 'after success', enter: (session: ScavengeSession) => session.evacuate() },
  { name: 'after failure', enter: (session: ScavengeSession) => session.tick(60) },
] as const;

const ITEM_MUTATIONS = [
  { name: 'dropCarried', run: (session: ScavengeSession) => session.dropCarried(), rejected: null },
  { name: 'saveCarried', run: (session: ScavengeSession) => session.saveCarried(), rejected: null },
  { name: 'saveCarriedBundle', run: (session: ScavengeSession) => session.saveCarriedBundle(), rejected: null },
  { name: 'loseCarried', run: (session: ScavengeSession) => session.loseCarried(), rejected: null },
  { name: 'lose', run: (session: ScavengeSession) => session.lose('ductTape-1'), rejected: false },
] as const;

describe('ScavengeSession', () => {
  it('reuses a snapshot until state changes', () => {
    const session = new ScavengeSession();
    const initial = session.snapshot();

    expect(session.snapshot()).toBe(initial);
    session.start();
    expect(session.snapshot()).not.toBe(initial);
  });

  it('keeps snapshot identity after a rejected mutation', () => {
    const session = new ScavengeSession();
    const initial = session.snapshot();

    expect(session.pickUp('cannedFood')).toBe(false);
    expect(session.snapshot()).toBe(initial);
  });

  it('uses the scavenging roster by default', () => {
    const session = new ScavengeSession();

    expect(Object.keys(session.snapshot().items))
      .toHaveLength(createScavengeItemInstances().length);
    expect(session.snapshot().items['energyBar-1']).toBeUndefined();
  });

  it('starts at 60 seconds and fails exactly once at expiry', () => {
    const session = new ScavengeSession();
    session.start();
    session.tick(59.5);
    expect(session.snapshot().remainingSeconds).toBeCloseTo(0.5);
    session.tick(0.5);
    expect(session.snapshot().status).toBe('failure');
    session.tick(5);
    expect(session.snapshot().remainingSeconds).toBe(0);
  });

  it('does not advance while paused', () => {
    const session = new ScavengeSession();
    session.start();
    session.tick(10);
    session.pause();
    session.tick(40);
    expect(session.snapshot().remainingSeconds).toBe(50);
    session.resume();
    session.tick(1);
    expect(session.snapshot().remainingSeconds).toBe(49);
  });

  it('carries repeatable instances up to total weight three', () => {
    const session = new ScavengeSession();
    session.start();
    expect(session.pickUp('cannedFood-1')).toBe(true);
    expect(session.pickUp('ductTape-1')).toBe(true);
    expect(session.pickUp('flashlight-1')).toBe(true);
    expect(session.snapshot()).toMatchObject({ carriedWeight: 3 });
    expect(session.pickUp('cannedFood-2')).toBe(false);
    expect(session.snapshot().carriedItems.map(({ instanceId }) => instanceId))
      .toEqual(['cannedFood-1', 'ductTape-1', 'flashlight-1']);
  });

  it.each(['scubaSet-1', 'anchor-1'] as const)(
    'rejects %s unless the full capacity is free',
    (instanceId) => {
      const session = new ScavengeSession();
      session.start();
      session.pickUp('cannedFood-1');
      expect(session.pickUp(instanceId)).toBe(false);
      expect(session.dropCarried()?.instanceId).toBe('cannedFood-1');
      expect(session.pickUp(instanceId)).toBe(true);
    },
  );

  it('saves duplicate instances without a boat limit', () => {
    const session = new ScavengeSession();
    session.start();
    for (const id of ['cannedFood-1', 'cannedFood-2', 'cannedFood-3'] as const) {
      session.pickUp(id);
      expect(session.saveCarried()?.instanceId).toBe(id);
    }
    expect(session.snapshot().savedCount).toBe(3);
  });

  it('saves the full carried bundle atomically in pickup order', () => {
    const session = new ScavengeSession();
    session.start();
    session.pickUp('cannedFood-1');
    session.pickUp('ductTape-1');
    session.pickUp('flashlight-1');

    expect(session.saveCarriedBundle()).toEqual([
      { instanceId: 'cannedFood-1', type: 'cannedFood' },
      { instanceId: 'ductTape-1', type: 'ductTape' },
      { instanceId: 'flashlight-1', type: 'flashlight' },
    ]);
    expect(session.snapshot()).toMatchObject({
      carriedItems: [],
      carriedWeight: 0,
      savedCount: 3,
      items: {
        'cannedFood-1': { status: 'saved' },
        'ductTape-1': { status: 'saved' },
        'flashlight-1': { status: 'saved' },
      },
    });
  });

  it('rejects a bundle save without mutation outside running state', () => {
    const session = new ScavengeSession();
    session.start();
    session.pickUp('flareGun-1');
    session.pause();
    const before = session.snapshot();

    expect(session.saveCarriedBundle()).toBeNull();
    expect(session.snapshot()).toEqual(before);
  });

  it('keys snapshot items only by physical instance ID', () => {
    const session = new ScavengeSession();
    session.start();
    session.pickUp('ductTape-1');
    session.saveCarried();

    expect(session.snapshot().items['ductTape-1']!.status).toBe('saved');
    expect(session.snapshot().items).not.toHaveProperty('ductTape');
  });

  it('releases carried instances in LIFO order for every transition', () => {
    const session = new ScavengeSession();
    session.start();
    session.pickUp('cannedFood-1');
    session.pickUp('ductTape-1');
    session.pickUp('flashlight-1');

    expect(session.dropCarried()).toEqual({ instanceId: 'flashlight-1', type: 'flashlight' });
    expect(session.saveCarried()).toEqual({ instanceId: 'ductTape-1', type: 'ductTape' });
    expect(session.loseCarried()).toEqual({ instanceId: 'cannedFood-1', type: 'cannedFood' });
    expect(session.snapshot()).toMatchObject({
      carriedItems: [],
      carriedWeight: 0,
      savedCount: 1,
      items: {
        'flashlight-1': { status: 'available' },
        'ductTape-1': { status: 'saved' },
        'cannedFood-1': { status: 'lost' },
      },
    });
  });

  it('keeps saved and lost instance transitions idempotent', () => {
    const savedSession = new ScavengeSession();
    savedSession.start();
    savedSession.pickUp('flareGun-1');
    expect(savedSession.saveCarried()?.instanceId).toBe('flareGun-1');
    expect(savedSession.lose('flareGun-1')).toBe(false);
    expect(savedSession.pickUp('flareGun-1')).toBe(false);
    expect(savedSession.snapshot().items['flareGun-1']!.status).toBe('saved');

    const lostSession = new ScavengeSession();
    lostSession.start();
    lostSession.pickUp('flashlight-1');
    expect(lostSession.loseCarried()?.instanceId).toBe('flashlight-1');
    expect(lostSession.lose('flashlight-1')).toBe(false);
    expect(lostSession.pickUp('flashlight-1')).toBe(false);
    expect(lostSession.snapshot().items['flashlight-1']!.status).toBe('lost');
  });

  it.each(BLOCKED_STATE_SETUPS)('rejects item mutations while $name', ({ enter }) => {
    for (const mutation of ITEM_MUTATIONS) {
      const session = new ScavengeSession();
      session.start();
      session.pickUp('flareGun-1');
      enter(session);
      const before = session.snapshot();

      expect.soft(mutation.run(session), mutation.name).toBe(mutation.rejected);
      expect.soft(session.snapshot(), mutation.name).toEqual(before);
    }
  });

  it('commits success only once', () => {
    const session = new ScavengeSession();
    session.start();
    expect(session.evacuate()).toBe(true);
    expect(session.evacuate()).toBe(false);
    expect(session.snapshot().status).toBe('success');
  });

  it('auto-evacuates when eligible on the deadline-crossing tick', () => {
    const session = new ScavengeSession();
    session.start();
    session.tick(59.75, false);
    session.tick(1, true);
    expect(session.snapshot()).toMatchObject({ status: 'success', remainingSeconds: 0 });
    expect(session.result()?.elapsedSeconds).toBe(60);
  });

  it('fails when ineligible on the deadline-crossing tick', () => {
    const session = new ScavengeSession();
    session.start();
    session.tick(60, false);
    expect(session.snapshot()).toMatchObject({ status: 'failure', remainingSeconds: 0 });
  });

  it('returns frozen snapshot clones instead of exposing session state', () => {
    const instances: readonly ItemInstance[] = [
      { instanceId: 'cannedFood-1', type: 'cannedFood' },
      { instanceId: 'cannedFood-2', type: 'cannedFood' },
    ];
    const session = new ScavengeSession(instances);
    session.start();
    session.pickUp('cannedFood-1');

    const snapshot = session.snapshot();
    expect(Object.isFrozen(snapshot.carriedItems)).toBe(true);
    expect(Object.isFrozen(snapshot.carriedItems[0])).toBe(true);
    expect(Object.isFrozen(snapshot.items)).toBe(true);
    expect(Object.isFrozen(snapshot.items['cannedFood-1'])).toBe(true);
    expect(snapshot.carriedItems[0]).not.toBe(instances[0]);
    expect(() => {
      (snapshot.items['cannedFood-1'] as { status: string }).status = 'lost';
    }).toThrow();
    expect(session.snapshot().items['cannedFood-1']!.status).toBe('carried');
  });

  it('returns an immutable result containing frozen saved instances', () => {
    const session = new ScavengeSession();
    session.start();
    session.pickUp('flareGun-1');
    session.saveCarried();
    session.pickUp('bucket-1');
    session.dropCarried();
    session.tick(12);
    session.evacuate();

    expect(session.result()).toEqual({
      savedItems: [{ instanceId: 'flareGun-1', type: 'flareGun' }],
      elapsedSeconds: 12,
    });
    const result = session.result()!;
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.savedItems)).toBe(true);
    expect(Object.isFrozen(result.savedItems[0])).toBe(true);
    expect(() => (result.savedItems as ItemInstance[]).push({
      instanceId: 'bucket-1',
      type: 'bucket',
    })).toThrow();
  });

  it('does not return a result before successful evacuation', () => {
    const idle = new ScavengeSession();
    expect(idle.result()).toBeNull();
    idle.start();
    expect(idle.result()).toBeNull();
  });

  it('does not return a result after failure', () => {
    const session = new ScavengeSession();
    session.start();
    session.tick(60);

    expect(session.result()).toBeNull();
  });

  it('deducts a five-second fall penalty without double-finishing', () => {
    const session = new ScavengeSession();
    session.start();
    session.penalize(5);
    expect(session.snapshot().remainingSeconds).toBe(55);
    session.penalize(500);
    expect(session.snapshot().remainingSeconds).toBe(0);
    expect(session.snapshot().status).toBe('failure');
  });
});

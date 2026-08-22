import { describe, expect, it, vi } from 'vitest';
import type { ItemId, ItemInstance, ItemInstanceId } from '../src/game/ItemState';
import {
  enumerateMissingPickupSets,
  runCompetentDay,
  runBalanceSimulation,
} from '../src/survival/balanceSimulation';
import { SurvivalSession } from '../src/survival/SurvivalSession';
import { sequenceRandom } from './helpers/random';

const saved = (...types: ItemId[]): ItemInstance[] => {
  const counts = new Map<ItemId, number>();
  return types.map((type) => {
    const number = (counts.get(type) ?? 0) + 1;
    counts.set(type, number);
    return { instanceId: `${type}-${number}` as ItemInstanceId, type };
  });
};

describe('survival balance simulation', () => {
  it('enumerates all three-pickup omissions', () => {
    const sets = enumerateMissingPickupSets();
    expect(sets).toHaveLength(1330);
    expect(new Set(sets.map(({ key }) => key)).size).toBe(1330);
    expect(sets.every(({ missing, saved }) => missing.length === 3 && saved.length === 18))
      .toBe(true);
  });

  it('is deterministic for the same policy and seeds', () => {
    const config = { loadoutLimit: 8, seedsPerLoadout: 2, fishingReactionSuccess: 0.90 };
    expect(runBalanceSimulation(config)).toEqual(runBalanceSimulation(config));
  });

  it('reports every terminal outcome', () => {
    const report = runBalanceSimulation({
      loadoutLimit: 8, seedsPerLoadout: 2, fishingReactionSuccess: 0.90,
    });
    expect(report.totalRuns).toBe(16);
    expect(report.rescued + report.dead + report.sunk + report.taken + report.blocked)
      .toBe(report.totalRuns);
    expect(Object.keys(report.byMissingPickupSet)).toHaveLength(8);
    expect(Object.values(report.byRescueLead)
      .reduce((sum, bucket) => sum + bucket.totalRuns, 0)).toBe(16);
    expect(report.averageNoSignalRescueDay).not.toBeNull();
  });

  it('repairs Hull at sixty before spending Energy on fishing', () => {
    const session = new SurvivalSession(saved('ductTape', 'radio'), {
      seed: 1,
      random: sequenceRandom([0]),
      initial: { hull: 60, energy: 3 },
    });
    const perform = vi.spyOn(session, 'perform');
    const beginFishing = vi.spyOn(session, 'beginFishing');

    runCompetentDay(session, sequenceRandom([0.99]), 0, true);

    const repairIndex = perform.mock.calls.findIndex(([action]) => action === 'repair');
    expect(repairIndex).toBeGreaterThanOrEqual(0);
    expect(perform.mock.invocationCallOrder[repairIndex])
      .toBeLessThan(beginFishing.mock.invocationCallOrder[0]!);
    expect(perform.mock.calls.some(([action]) => action === 'answerRadio')).toBe(false);
  });

  it('answers the Radio only after fishing leaves one Energy', () => {
    const session = new SurvivalSession(saved('radio'), {
      seed: 2,
      random: sequenceRandom([0, 0]),
      initial: { day: 4, energy: 3 },
      initialEventId: 'shower-night',
    });
    session.resolveEvent({ kind: 'endure' });
    session.beginDawn();
    const perform = vi.spyOn(session, 'perform');
    const beginFishing = vi.spyOn(session, 'beginFishing');

    runCompetentDay(session, sequenceRandom([0.99]), 0, true);

    const answerIndex = perform.mock.calls.findIndex(([action]) => action === 'answerRadio');
    expect(answerIndex).toBeGreaterThanOrEqual(0);
    expect(beginFishing.mock.invocationCallOrder[0])
      .toBeLessThan(perform.mock.invocationCallOrder[answerIndex]!);
    expect(session.snapshot()).toMatchObject({ rescueLead: 2, radioSignalsSent: 1 });
    expect(session.snapshot().inventory['radio-1']?.condition).toBe('usable');
  });

  it('rejects invalid simulation settings', () => {
    expect(() => runBalanceSimulation({
      seedsPerLoadout: 0, fishingReactionSuccess: 0.90,
    })).toThrow('seedsPerLoadout must be a positive integer.');
    expect(() => runBalanceSimulation({
      seedsPerLoadout: 1, fishingReactionSuccess: Number.NaN,
    })).toThrow('fishingReactionSuccess must be between zero and one.');
    expect(() => runBalanceSimulation({
      loadoutLimit: 0, seedsPerLoadout: 1, fishingReactionSuccess: 0.90,
    })).toThrow('loadoutLimit must be a positive integer.');
  });
});

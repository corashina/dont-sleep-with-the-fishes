import { describe, expect, it } from 'vitest';
import {
  enumerateMissingPickupSets,
  runBalanceSimulation,
} from '../src/survival/balanceSimulation';

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

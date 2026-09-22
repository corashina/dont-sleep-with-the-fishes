// Importance: 95/100. Prevents successful Kraken runs from being counted as deaths.
import { expect, it } from 'vitest';
import { mergeBalanceReports, runBalanceSimulation, runCompetentDay } from '../src/survival/balanceSimulation';
import { SurvivalSession } from '../src/survival/SurvivalSession';
import { COMPLETE_HEART } from '../src/survival/heartOfTheSea';
import { sequenceRandom } from './helpers/random';

it('returns the heart through the competent policy without stalling', () => {
  const session = new SurvivalSession([], { seed: 41, initialHeartPieces: COMPLETE_HEART });
  runCompetentDay(session, sequenceRandom([0]), 1, false);
  expect(session.snapshot().ending?.id).toBe('kraken');
});

it('merges Kraken counts through totals, controls, and loadout buckets', () => {
  const source = runBalanceSimulation({ seedsPerLoadout: 1, loadoutLimit: 1, fishingReactionSuccess: 1 });
  const bucket = { totalRuns: 1, kraken: 1, rescued: 0, dead: 0, sunk: 0, blocked: 0 };
  const scenario = { ...bucket, rescueRate: 0, averageRescueDay: null, medianRescueDay: null, endingsByDay: { 'kraken:20': 1 } };
  const report = { ...source, ...scenario, noSignal: scenario, byMissingPickupSet: { test: bucket }, byRescueLead: { '0': bucket } };
  const merged = mergeBalanceReports([report, report]);
  expect(merged).toMatchObject({ kraken: 2, dead: 0, noSignal: { kraken: 2 },
    byMissingPickupSet: { test: { kraken: 2 } }, byRescueLead: { '0': { kraken: 2 } }, endingsByDay: { 'kraken:20': 2 } });
});

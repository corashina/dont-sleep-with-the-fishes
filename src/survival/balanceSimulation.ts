import type { ItemInstance } from '../game/ItemState';
import { createScavengeItemInstances } from '../game/scavengeCatalog';
import {
  isSignalSightingEventId,
  survivalEventById,
  type SurvivalEventId,
} from './eventCatalog';
import { mulberry32 } from './random';
import { SURVIVAL_BALANCE } from './survivalBalance';
import { SurvivalSession } from './SurvivalSession';
import type { RandomSource } from './survivalTypes';

export interface MissingPickupSet {
  readonly key: string;
  readonly missing: readonly ItemInstance[];
  readonly saved: readonly ItemInstance[];
}

export interface BalanceSimulationProgress {
  readonly loadoutIndex: number;
  readonly loadoutCount: number;
  readonly completedRuns: number;
  readonly totalRuns: number;
}

export interface BalanceSimulationConfig {
  readonly seedsPerLoadout: number;
  readonly fishingReactionSuccess: number;
  readonly loadoutLimit?: number;
  readonly loadoutIndices?: readonly number[];
  readonly onProgress?: (progress: BalanceSimulationProgress) => void;
}

export interface BalanceOutcomeBucket {
  readonly totalRuns: number;
  readonly rescued: number;
  readonly dead: number;
  readonly sunk: number;
  readonly abducted: number;
  readonly blocked: number;
}

export interface BalanceScenarioReport extends BalanceOutcomeBucket {
  readonly rescueRate: number;
  readonly averageRescueDay: number | null;
  readonly medianRescueDay: number | null;
  readonly endingsByDay: Readonly<Record<string, number>>;
}

export interface BalanceReport extends BalanceOutcomeBucket {
  readonly rescueRate: number;
  readonly averageRescueDay: number | null;
  readonly medianRescueDay: number | null;
  readonly rescueDay30To35Rate: number;
  /** Signal-disabled control cohort. */
  readonly noSignal: BalanceScenarioReport;
  readonly blockedLoadouts: readonly string[];
  readonly unrescuedLoadouts: readonly string[];
  readonly endingsByDay: Readonly<Record<string, number>>;
  readonly byMissingPickupSet: Readonly<Record<string, BalanceOutcomeBucket>>;
  readonly byRescueLead: Readonly<Record<string, BalanceOutcomeBucket>>;
}

export function enumerateMissingPickupSets(): readonly MissingPickupSet[] {
  const pickups = createScavengeItemInstances();
  const sets: MissingPickupSet[] = [];
  for (let first = 0; first < pickups.length - 2; first += 1) {
    for (let second = first + 1; second < pickups.length - 1; second += 1) {
      for (let third = second + 1; third < pickups.length; third += 1) {
        const omitted = new Set([first, second, third]);
        const missing = pickups.filter((_, index) => omitted.has(index));
        const saved = pickups.filter((_, index) => !omitted.has(index));
        sets.push(Object.freeze({
          key: missing.map(({ instanceId }) => instanceId).join('|'),
          missing: Object.freeze(missing),
          saved: Object.freeze(saved),
        }));
      }
    }
  }
  return Object.freeze(sets);
}

const EVENT_CHOICE_PRIORITY = Object.freeze({
  'starry-night': ['wish'],
  'quiet-night': ['sleep'],
  'something-under-us': ['baitTin', 'sleep'],
  'ocean-of-blood': ['fishingNet', 'sleep'],
  'dangerous-waters': ['map', 'compass', 'sleep'],
  leak: ['ductTape', 'bucket', 'map', 'sleep'],
  'school-of-fish': ['fishingNet', 'bucket', 'spyglass', 'sleep'],
  snatcher: ['shotgun', 'flareGun', 'knife', 'sleep'],
  'death-stare': ['shotgun', 'flashlight', 'umbrella', 'cannedFood', 'sleep'],
  'swarm-of-sharks': ['fishingNet', 'knife', 'shotgun', 'baitTin', 'sleep'],
  tornado: ['anchor', 'swimRing', 'sleep'],
  'shower-night': ['umbrella', 'bucket', 'map', 'sleep'],
  'windy-night': ['fishingNet', 'umbrella', 'map', 'sleep'],
  'bad-sleep': ['flashlight', 'bucket', 'swimRing', 'umbrella', 'sleep'],
  thunderstorm: ['anchor', 'umbrella', 'bucket', 'sleep'],
  'restless-waves': ['anchor', 'swimRing', 'sleep'],
  'monster-in-the-fog': ['compass', 'flashlight', 'sleep'],
  ghosts: ['flashlight', 'sleep', 'flareGun'],
  'eerie-melody': ['ductTape', 'umbrella', 'bucket', 'sleep', 'spyglass'],
  'face-on-the-moon': ['umbrella', 'spyglass', 'sleep'],
  'shadow-figure': ['sleep'],
  'guarded-sleep': ['watch', 'sleep'],
  'drifting-supplies': ['retrieve', 'delegate-carlitos', 'sleep'],
  'drifting-chest': ['retrieve', 'delegate-carlitos', 'sleep'],
  'seagull-theft': ['steal'],
  'check-the-back': ['check', 'sleep'],
  flowers: ['fishingNet', 'bucket', 'sleep'],
  'chest-attack': ['knife', 'attack'],
  'midnight-tour': ['sleep'],
  'night-trader': ['sleep'],
  handyman: ['sleep'],
  'other-people': ['flareGun', 'flashlight', 'sleep'],
  'ghost-ship': ['sleep'],
  plane: ['flareGun', 'flashlight', 'sleep'],
  'flying-saucer': ['sleep'],
  lighthouse: ['flareGun', 'flashlight', 'shotgun', 'sleep'],
} as const satisfies Readonly<Record<SurvivalEventId, readonly string[]>>);

function resolvePendingEvent(session: SurvivalSession, signalsEnabled: boolean): void {
  const eventId = session.snapshot().pendingEventId;
  if (eventId === null) return;
  const event = survivalEventById(eventId);
  if (event === undefined) throw new Error(`Unknown active event: ${eventId}`);
  const priorities = !signalsEnabled
    && isSignalSightingEventId(eventId)
    ? ['sleep']
    : eventId in EVENT_CHOICE_PRIORITY
      ? EVENT_CHOICE_PRIORITY[eventId as SurvivalEventId]
      : ['sleep'];

  for (const choiceId of priorities) {
    const choice = event.choices.find(({ id }) => id === choiceId);
    if (choice === undefined) continue;
    if (choice.itemId === undefined) {
      const outcome = session.resolveEvent({ kind: 'choice', choiceId });
      if (outcome.accepted) return;
      continue;
    }

    const instance = Object.values(session.snapshot().inventory).find(
      (item) => item !== undefined
        && item.type === choice.itemId
        && item.condition === 'usable',
    );
    if (instance === undefined) continue;
    const outcome = session.resolveEvent({
      kind: 'item',
      choiceId,
      instanceId: instance.instanceId,
    });
    if (outcome.accepted) return;
  }

  throw new Error(`No competent choice resolved event ${eventId}.`);
}

function resolvePendingDayEvent(session: SurvivalSession, signalsEnabled: boolean): void {
  while (session.snapshot().state === 'dayEvent'
    && session.snapshot().pendingEventId !== null) {
    resolvePendingEvent(session, signalsEnabled);
  }
}

function resolvePendingNightEvent(session: SurvivalSession, signalsEnabled: boolean): void {
  while (session.snapshot().state === 'nightEvent'
    && session.snapshot().pendingEventId !== null) {
    resolvePendingEvent(session, signalsEnabled);
  }
}

function careForCarlitos(session: SurvivalSession): void {
  let carlitos = session.snapshot().carlitos;
  if (carlitos === null) return;
  if (!carlitos.pettedToday && session.availableReason('petCarlitos') === null) {
    session.perform('petCarlitos');
  }
  carlitos = session.snapshot().carlitos;
  if (carlitos !== null && carlitos.hunger <= 3
    && session.availableReason('feedCarlitos') === null) {
    session.perform('feedCarlitos');
  }
}

function repairHullAtOrBelowSixty(session: SurvivalSession): void {
  if (session.snapshot().hull > 60) return;
  if (session.availableReason('repair') === null) {
    session.perform('repair');
  }
}

function fishOnceWhenPossible(
  session: SurvivalSession,
  policyRandom: RandomSource,
  fishingReactionSuccess: number,
): void {
  const begun = session.beginFishing();
  if (!begun.accepted) return;
  begun.attempt.cast({ x: 4, z: -2 });
  begun.attempt.completeCast();
  const catches = policyRandom.next() < fishingReactionSuccess;
  begun.attempt.advance(
    begun.attempt.snapshot().biteDelaySeconds
      + (catches ? 0 : SURVIVAL_BALANCE.fishing.reactionSeconds),
  );
  const terminal = catches
    ? begun.attempt.reel().result!
    : begun.attempt.snapshot().result!;
  if (catches) begun.attempt.completeReel();
  session.finishFishing(begun.attempt.snapshot().id, terminal);
}

function recoverDailyResources(session: SurvivalSession): void {
  careForCarlitos(session);
  while (session.snapshot().hunger >= 52 && session.snapshot().food > 0) {
    session.perform('eat');
  }
  if (session.snapshot().health <= 60) session.perform('treat');
  repairHullAtOrBelowSixty(session);
}

function seekRescueOrFish(
  session: SurvivalSession,
  policyRandom: RandomSource,
  fishingReactionSuccess: number,
  signalsEnabled: boolean,
): void {
  const snapshot = session.snapshot();
  const canSeekTrace = signalsEnabled
    && snapshot.rescueTraceFinds < 2
    && snapshot.food >= 3
    && snapshot.health >= 70
    && session.availableReason('dive') === null;
  if (canSeekTrace) session.perform('dive');
  else fishOnceWhenPossible(session, policyRandom, fishingReactionSuccess);
}

function answerRadioIfPossible(session: SurvivalSession, signalsEnabled: boolean): void {
  if (signalsEnabled
    && session.snapshot().energy === 1
    && session.availableReason('answerRadio') === null) {
    session.perform('answerRadio');
  }
}

function completeCompetentDay(session: SurvivalSession, signalsEnabled: boolean): void {
  session.perform('endDay');
  resolvePendingNightEvent(session, signalsEnabled);
  if (session.snapshot().state === 'nightEvent'
    && session.snapshot().pendingEventId === null) session.beginDawn();
}

export function runCompetentDay(
  session: SurvivalSession,
  policyRandom: RandomSource,
  fishingReactionSuccess: number,
  signalsEnabled: boolean,
): void {
  resolvePendingDayEvent(session, signalsEnabled);
  if (session.snapshot().state !== 'day') return;
  recoverDailyResources(session);
  seekRescueOrFish(session, policyRandom, fishingReactionSuccess, signalsEnabled);
  answerRadioIfPossible(session, signalsEnabled);
  completeCompetentDay(session, signalsEnabled);
}

function runToTerminal(
  saved: readonly ItemInstance[],
  seed: number,
  fishingReactionSuccess: number,
  signalsEnabled: boolean,
): SurvivalSession {
  const session = new SurvivalSession(saved, {
    seed,
    radioSignalsEnabled: signalsEnabled,
  });
  const policyRandom = mulberry32(seed ^ 0x9e3779b9);
  while (session.snapshot().ending === null && session.snapshot().day <= 120) {
    const before = session.snapshot();
    runCompetentDay(session, policyRandom, fishingReactionSuccess, signalsEnabled);
    const after = session.snapshot();
    if (after.ending === null && after.day === before.day) {
      throw new Error(
        `Simulation stalled on day ${before.day} in state '${after.state}'`
        + ` with pending event '${after.pendingEventId ?? 'none'}'.`,
      );
    }
  }
  return session;
}

function average(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

type OutcomeKey = 'rescued' | 'dead' | 'sunk' | 'abducted' | 'blocked';
type MutableBucket = { -readonly [Key in keyof BalanceOutcomeBucket]: number };

function emptyBucket(): MutableBucket {
  return { totalRuns: 0, rescued: 0, dead: 0, sunk: 0, abducted: 0, blocked: 0 };
}

function recordOutcome(bucket: MutableBucket, outcome: OutcomeKey): void {
  bucket.totalRuns += 1;
  bucket[outcome] += 1;
}

function freezeBucket(bucket: MutableBucket): BalanceOutcomeBucket {
  return Object.freeze({ ...bucket });
}

function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.floor((sorted.length - 1) / 2)]!;
}

function rateInRange(values: readonly number[], minimum: number, maximum: number): number {
  if (values.length === 0) return 0;
  return values.filter((value) => value >= minimum && value <= maximum).length / values.length;
}

type SessionEnding = ReturnType<SurvivalSession['snapshot']>['ending'];

interface SimulationStats {
  readonly rescueDays: number[];
  readonly blockedLoadouts: Set<string>;
  readonly totals: MutableBucket;
  readonly endingsByDay: Record<string, number>;
  readonly byRescueLead: Map<number, MutableBucket>;
  readonly noSignalRescueDays: number[];
  readonly noSignalTotals: MutableBucket;
  readonly noSignalEndingsByDay: Record<string, number>;
}

function outcomeForEnding(ending: SessionEnding): OutcomeKey {
  if (ending === null) return 'blocked';
  if (ending.id === 'rescue') return 'rescued';
  if (ending.id === 'sinking') return 'sunk';
  if (ending.id === 'abduction') return 'abducted';
  return 'dead';
}

function recordSignalRun(
  session: SurvivalSession,
  loadoutKey: string,
  loadoutBucket: MutableBucket,
  stats: SimulationStats,
): void {
  const { ending, rescueLead } = session.snapshot();
  const leadBucket = stats.byRescueLead.get(rescueLead) ?? emptyBucket();
  stats.byRescueLead.set(rescueLead, leadBucket);
  const outcome = outcomeForEnding(ending);
  recordOutcome(stats.totals, outcome);
  recordOutcome(loadoutBucket, outcome);
  recordOutcome(leadBucket, outcome);
  if (ending === null) stats.blockedLoadouts.add(loadoutKey);
  else {
    const dayKey = `${ending.id}:${ending.day}`;
    stats.endingsByDay[dayKey] = (stats.endingsByDay[dayKey] ?? 0) + 1;
  }
  if (ending?.id === 'rescue') stats.rescueDays.push(ending.day);
}

function recordNoSignalRun(session: SurvivalSession, stats: SimulationStats): void {
  const ending = session.snapshot().ending;
  const outcome = outcomeForEnding(ending);
  recordOutcome(stats.noSignalTotals, outcome);
  if (ending !== null) {
    const dayKey = `${ending.id}:${ending.day}`;
    stats.noSignalEndingsByDay[dayKey] = (stats.noSignalEndingsByDay[dayKey] ?? 0) + 1;
  }
  if (ending?.id === 'rescue') stats.noSignalRescueDays.push(ending.day);
}

function simulationSeed(loadoutIndex: number, runIndex: number): number {
  return (
    Math.imul(loadoutIndex + 1, 0x045d9f3b)
    ^ Math.imul(runIndex + 1, 0x27d4eb2d)
  ) >>> 0;
}

function simulateLoadout(
  loadout: MissingPickupSet,
  loadoutIndex: number,
  loadoutCount: number,
  config: BalanceSimulationConfig,
  stats: SimulationStats,
): BalanceOutcomeBucket {
  const loadoutBucket = emptyBucket();
  for (let runIndex = 0; runIndex < config.seedsPerLoadout; runIndex += 1) {
    const seed = simulationSeed(loadoutIndex, runIndex);
    const session = runToTerminal(loadout.saved, seed, config.fishingReactionSuccess, true);
    recordSignalRun(session, loadout.key, loadoutBucket, stats);
    const noSignalSession = runToTerminal(
      loadout.saved,
      seed,
      config.fishingReactionSuccess,
      false,
    );
    recordNoSignalRun(noSignalSession, stats);
    config.onProgress?.({
      loadoutIndex,
      loadoutCount,
      completedRuns: loadoutIndex * config.seedsPerLoadout + runIndex + 1,
      totalRuns: loadoutCount * config.seedsPerLoadout,
    });
  }
  return freezeBucket(loadoutBucket);
}

function selectLoadouts(
  allLoadouts: readonly MissingPickupSet[],
  config: BalanceSimulationConfig,
): readonly MissingPickupSet[] {
  const selectedIndices = config.loadoutIndices;
  if (selectedIndices !== undefined) {
    for (const index of selectedIndices) {
      if (!Number.isInteger(index) || index < 0 || index >= allLoadouts.length) {
        throw new Error(`loadoutIndices contains invalid index ${index}.`);
      }
    }
    return selectedIndices.map((index) => allLoadouts[index]!);
  }
  if (config.loadoutLimit === undefined) return allLoadouts;
  return allLoadouts.slice(0, config.loadoutLimit);
}

export function runBalanceSimulation(
  config: BalanceSimulationConfig,
): BalanceReport {
  if (!Number.isInteger(config.seedsPerLoadout) || config.seedsPerLoadout <= 0) {
    throw new Error('seedsPerLoadout must be a positive integer.');
  }
  if (!Number.isFinite(config.fishingReactionSuccess)
    || config.fishingReactionSuccess < 0
    || config.fishingReactionSuccess > 1) {
    throw new Error('fishingReactionSuccess must be between zero and one.');
  }
  if (config.loadoutLimit !== undefined
    && (!Number.isInteger(config.loadoutLimit) || config.loadoutLimit <= 0)) {
    throw new Error('loadoutLimit must be a positive integer.');
  }

  const allLoadouts = enumerateMissingPickupSets();
  const loadouts = selectLoadouts(allLoadouts, config);
  const rescueDays: number[] = [];
  const noSignalRescueDays: number[] = [];
  const blockedLoadouts = new Set<string>();
  const totals = emptyBucket();
  const endingsByDay: Record<string, number> = {};
  const byMissingPickupSet: Record<string, BalanceOutcomeBucket> = {};
  const byRescueLead = new Map<number, MutableBucket>();
  const noSignalTotals = emptyBucket();
  const noSignalEndingsByDay: Record<string, number> = {};
  const stats: SimulationStats = {
    rescueDays,
    noSignalRescueDays,
    blockedLoadouts,
    totals,
    endingsByDay,
    byRescueLead,
    noSignalTotals,
    noSignalEndingsByDay,
  };

  loadouts.forEach((loadout, loadoutIndex) => {
    byMissingPickupSet[loadout.key] = simulateLoadout(
      loadout,
      loadoutIndex,
      loadouts.length,
      config,
      stats,
    );
  });

  const totalRuns = loadouts.length * config.seedsPerLoadout;
  const noSignal: BalanceScenarioReport = Object.freeze({
    ...freezeBucket(noSignalTotals),
    rescueRate: totalRuns === 0 ? 0 : noSignalTotals.rescued / totalRuns,
    averageRescueDay: average(noSignalRescueDays),
    medianRescueDay: median(noSignalRescueDays),
    endingsByDay: Object.freeze({ ...noSignalEndingsByDay }),
  });
  return Object.freeze({
    ...freezeBucket(totals),
    rescueRate: totalRuns === 0 ? 0 : totals.rescued / totalRuns,
    averageRescueDay: average(rescueDays),
    medianRescueDay: median(rescueDays),
    rescueDay30To35Rate: rateInRange(rescueDays, 30, 35),
    noSignal,
    blockedLoadouts: Object.freeze([...blockedLoadouts].sort()),
    unrescuedLoadouts: Object.freeze(Object.entries(byMissingPickupSet)
      .filter(([, bucket]) => bucket.rescued === 0)
      .map(([key]) => key)
      .sort()),
    endingsByDay: Object.freeze({ ...endingsByDay }),
    byMissingPickupSet: Object.freeze({ ...byMissingPickupSet }),
    byRescueLead: Object.freeze(Object.fromEntries(
      [...byRescueLead.entries()].map(([lead, bucket]) => [lead, freezeBucket(bucket)]),
    )),
  });
}

function addBucket(target: MutableBucket, source: BalanceOutcomeBucket): void {
  target.totalRuns += source.totalRuns;
  target.rescued += source.rescued;
  target.dead += source.dead;
  target.sunk += source.sunk;
  target.abducted += source.abducted;
  target.blocked += source.blocked;
}

function endingDays(
  endingsByDay: Readonly<Record<string, number>>,
  endingId: string,
): number[] {
  const days: number[] = [];
  for (const [key, count] of Object.entries(endingsByDay)) {
    const [id, dayText] = key.split(':');
    if (id !== endingId) continue;
    const day = Number(dayText);
    for (let index = 0; index < count; index += 1) days.push(day);
  }
  return days.sort((left, right) => left - right);
}

function addCounts(
  target: Record<string, number>,
  source: Readonly<Record<string, number>>,
): void {
  for (const [key, count] of Object.entries(source)) {
    target[key] = (target[key] ?? 0) + count;
  }
}

export function mergeBalanceReports(
  reports: readonly BalanceReport[],
): BalanceReport {
  const totals = emptyBucket();
  const noSignalTotals = emptyBucket();
  const endingsByDay: Record<string, number> = {};
  const noSignalEndingsByDay: Record<string, number> = {};
  const blockedLoadouts = new Set<string>();
  const unrescuedLoadouts = new Set<string>();
  const byMissingPickupSet = new Map<string, MutableBucket>();
  const byRescueLead = new Map<number, MutableBucket>();

  for (const report of reports) {
    addBucket(totals, report);
    addBucket(noSignalTotals, report.noSignal);
    addCounts(endingsByDay, report.endingsByDay);
    addCounts(noSignalEndingsByDay, report.noSignal.endingsByDay);
    for (const key of report.blockedLoadouts) blockedLoadouts.add(key);
    for (const key of report.unrescuedLoadouts) unrescuedLoadouts.add(key);
    for (const [key, bucket] of Object.entries(report.byMissingPickupSet)) {
      const target = byMissingPickupSet.get(key) ?? emptyBucket();
      addBucket(target, bucket);
      byMissingPickupSet.set(key, target);
    }
    for (const [leadText, bucket] of Object.entries(report.byRescueLead)) {
      const lead = Number(leadText);
      const target = byRescueLead.get(lead) ?? emptyBucket();
      addBucket(target, bucket);
      byRescueLead.set(lead, target);
    }
  }

  const totalRuns = totals.totalRuns;
  const rescueDays = endingDays(endingsByDay, 'rescue');
  const noSignalRescueDays = endingDays(noSignalEndingsByDay, 'rescue');
  const noSignal: BalanceScenarioReport = Object.freeze({
    ...freezeBucket(noSignalTotals),
    rescueRate: noSignalTotals.totalRuns === 0
      ? 0
      : noSignalTotals.rescued / noSignalTotals.totalRuns,
    averageRescueDay: average(noSignalRescueDays),
    medianRescueDay: median(noSignalRescueDays),
    endingsByDay: Object.freeze({ ...noSignalEndingsByDay }),
  });
  return Object.freeze({
    ...freezeBucket(totals),
    rescueRate: totalRuns === 0 ? 0 : totals.rescued / totalRuns,
    averageRescueDay: average(rescueDays),
    medianRescueDay: median(rescueDays),
    rescueDay30To35Rate: rateInRange(rescueDays, 30, 35),
    noSignal,
    blockedLoadouts: Object.freeze([...blockedLoadouts].sort()),
    unrescuedLoadouts: Object.freeze([...unrescuedLoadouts].sort()),
    endingsByDay: Object.freeze({ ...endingsByDay }),
    byMissingPickupSet: Object.freeze(Object.fromEntries(
      [...byMissingPickupSet.entries()].map(([key, bucket]) => [key, freezeBucket(bucket)]),
    )),
    byRescueLead: Object.freeze(Object.fromEntries(
      [...byRescueLead.entries()].map(([lead, bucket]) => [lead, freezeBucket(bucket)]),
    )),
  });
}

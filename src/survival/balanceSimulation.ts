import type { ItemInstance } from '../game/ItemState';
import { createScavengeItemInstances } from '../game/scavengeCatalog';
import {
  isSignalSightingEventId,
  survivalEventById,
  type SurvivalEventId,
} from './eventCatalog';
import { mulberry32 } from './random';
import { SurvivalSession } from './SurvivalSession';
import type { RandomSource } from './survivalTypes';

export interface MissingPickupSet {
  readonly key: string;
  readonly missing: readonly ItemInstance[];
  readonly saved: readonly ItemInstance[];
}

export interface BalanceSimulationConfig {
  readonly seedsPerLoadout: number;
  readonly fishingReactionSuccess: number;
  readonly loadoutLimit?: number;
}

export interface BalanceOutcomeBucket {
  readonly totalRuns: number;
  readonly rescued: number;
  readonly dead: number;
  readonly sunk: number;
  readonly taken: number;
  readonly blocked: number;
}

export interface BalanceReport extends BalanceOutcomeBucket {
  readonly rescueRate: number;
  readonly averageRescueDay: number | null;
  /** Successful rescue days from the separate signal-disabled control cohort. */
  readonly averageNoSignalRescueDay: number | null;
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
  'dangerous-waters': ['map', 'compass', 'sleep'],
  leak: ['ductTape', 'bucket', 'map', 'sleep'],
  'school-of-fish': ['fishingNet', 'bucket', 'spyglass', 'sleep'],
  snatcher: ['shotgun', 'knife', 'spyglass', 'swimRing', 'fishingNet', 'sleep'],
  'death-stare': ['shotgun', 'flashlight', 'umbrella', 'cannedFood', 'sleep'],
  'swarm-of-sharks': ['fishingNet', 'knife', 'shotgun', 'baitTin', 'sleep'],
  tornado: ['anchor', 'swimRing', 'sleep'],
  'shower-night': ['umbrella', 'bucket', 'map', 'sleep'],
  'windy-night': ['fishingNet', 'umbrella', 'map', 'sleep'],
  'bad-sleep': ['flashlight', 'bucket', 'swimRing', 'umbrella', 'sleep'],
  thunderstorm: ['anchor', 'umbrella', 'bucket', 'sleep'],
  'restless-waves': ['anchor', 'swimRing', 'sleep'],
  'man-in-the-fog': ['compass', 'flashlight', 'sleep'],
  ghosts: ['flashlight', 'sleep', 'flareGun'],
  'eerie-melody': ['ductTape', 'umbrella', 'bucket', 'sleep', 'spyglass'],
  'face-on-the-moon': ['umbrella', 'spyglass', 'sleep'],
  'shadow-figure': ['sleep'],
  'guarded-sleep': ['watch', 'sleep'],
  'drifting-supplies': ['retrieve', 'delegate-carlitos', 'sleep'],
  'drifting-chest': ['retrieve', 'delegate-carlitos', 'sleep'],
  wreckage: ['search', 'delegate-carlitos', 'dive', 'leave'],
  'check-the-back': ['check', 'sleep'],
  flowers: ['fishingNet', 'bucket', 'sleep'],
  'chest-attack': ['fishingNet', 'attack'],
  'midnight-tour': ['sleep'],
  'night-trader': ['sleep'],
  handyman: ['sleep'],
  'other-people': ['flareGun', 'flashlight', 'sleep'],
  plane: ['flareGun', 'flashlight', 'sleep'],
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
  if (carlitos === null || !carlitos.alive) return;
  if (!carlitos.pettedToday && session.availableReason('petCarlitos') === null) {
    session.perform('petCarlitos');
  }
  carlitos = session.snapshot().carlitos;
  if (carlitos !== null && carlitos.hunger <= 3
    && session.availableReason('feedCarlitos') === null) {
    session.perform('feedCarlitos');
  }
  carlitos = session.snapshot().carlitos;
  if (carlitos !== null && carlitos.sickness >= 2
    && session.availableReason('treatCarlitos') === null) {
    session.perform('treatCarlitos');
  }
}

function repairHullAtOrBelowSixty(session: SurvivalSession): void {
  if (session.snapshot().hull > 60) return;
  const repairMaterial = { kind: 'hullRepair', material: 'repairMaterial' } as const;
  if (session.availableReason('repair', repairMaterial) === null) {
    session.perform('repair', repairMaterial);
    return;
  }
  const ductTape = { kind: 'hullRepair', material: 'ductTape' } as const;
  if (session.availableReason('repair', ductTape) === null) {
    session.perform('repair', ductTape);
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
    begun.attempt.snapshot().biteDelaySeconds + (catches ? 0 : 1.5),
  );
  const terminal = catches
    ? begun.attempt.reel().result!
    : begun.attempt.snapshot().result!;
  if (catches) begun.attempt.completeReel();
  session.finishFishing(begun.attempt.snapshot().id, terminal);
}

export function runCompetentDay(
  session: SurvivalSession,
  policyRandom: RandomSource,
  fishingReactionSuccess: number,
  signalsEnabled: boolean,
): void {
  resolvePendingDayEvent(session, signalsEnabled);
  if (session.snapshot().state !== 'day') return;

  careForCarlitos(session);
  while (session.snapshot().hunger >= 52 && session.snapshot().food > 0) {
    session.perform('eat');
  }
  if (session.snapshot().health <= 60) session.perform('treat');
  repairHullAtOrBelowSixty(session);

  const snapshot = session.snapshot();
  const canSeekTrace = signalsEnabled
    && snapshot.rescueTraceFinds < 2
    && snapshot.food >= 3
    && snapshot.health >= 70
    && session.availableReason('dive') === null;
  if (canSeekTrace) session.perform('dive');
  else fishOnceWhenPossible(session, policyRandom, fishingReactionSuccess);

  if (signalsEnabled
    && session.snapshot().energy === 1
    && session.availableReason('answerRadio') === null) {
    session.perform('answerRadio');
  }

  session.perform('endDay');
  resolvePendingNightEvent(session, signalsEnabled);
  if (session.snapshot().state === 'nightEvent'
    && session.snapshot().pendingEventId === null) session.beginDawn();
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
    runCompetentDay(session, policyRandom, fishingReactionSuccess, signalsEnabled);
  }
  return session;
}

function average(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

type OutcomeKey = 'rescued' | 'dead' | 'sunk' | 'taken' | 'blocked';
type MutableBucket = { -readonly [Key in keyof BalanceOutcomeBucket]: number };

function emptyBucket(): MutableBucket {
  return { totalRuns: 0, rescued: 0, dead: 0, sunk: 0, taken: 0, blocked: 0 };
}

function recordOutcome(bucket: MutableBucket, outcome: OutcomeKey): void {
  bucket.totalRuns += 1;
  bucket[outcome] += 1;
}

function freezeBucket(bucket: MutableBucket): BalanceOutcomeBucket {
  return Object.freeze({ ...bucket });
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
  const loadouts = config.loadoutLimit === undefined
    ? allLoadouts
    : allLoadouts.slice(0, config.loadoutLimit);
  const rescueDays: number[] = [];
  const noSignalRescueDays: number[] = [];
  const blockedLoadouts = new Set<string>();
  const totals = emptyBucket();
  const endingsByDay: Record<string, number> = {};
  const byMissingPickupSet: Record<string, BalanceOutcomeBucket> = {};
  const byRescueLead = new Map<number, MutableBucket>();

  loadouts.forEach((loadout, loadoutIndex) => {
    const loadoutBucket = emptyBucket();
    for (let runIndex = 0; runIndex < config.seedsPerLoadout; runIndex += 1) {
      const seed = (
        Math.imul(loadoutIndex + 1, 0x045d9f3b)
        ^ Math.imul(runIndex + 1, 0x27d4eb2d)
      ) >>> 0;
      const session = runToTerminal(
        loadout.saved,
        seed,
        config.fishingReactionSuccess,
        true,
      );

      const ending = session.snapshot().ending;
      const rescueLead = session.snapshot().rescueLead;
      const leadBucket = byRescueLead.get(rescueLead) ?? emptyBucket();
      byRescueLead.set(rescueLead, leadBucket);
      const outcome: OutcomeKey = ending === null
        ? 'blocked'
        : ending.id === 'rescue'
          ? 'rescued'
          : ending.id === 'death'
            ? 'dead'
            : ending.id === 'sinking'
              ? 'sunk'
              : 'taken';
      recordOutcome(totals, outcome);
      recordOutcome(loadoutBucket, outcome);
      recordOutcome(leadBucket, outcome);

      if (ending === null) {
        blockedLoadouts.add(loadout.key);
      } else {
        const dayKey = `${ending.id}:${ending.day}`;
        endingsByDay[dayKey] = (endingsByDay[dayKey] ?? 0) + 1;
      }
      if (ending?.id === 'rescue') {
        rescueDays.push(ending.day);
      }

      const noSignalSession = runToTerminal(
        loadout.saved,
        seed,
        config.fishingReactionSuccess,
        false,
      );
      const noSignalEnding = noSignalSession.snapshot().ending;
      if (noSignalEnding?.id === 'rescue') noSignalRescueDays.push(noSignalEnding.day);
    }
    byMissingPickupSet[loadout.key] = freezeBucket(loadoutBucket);
  });

  const totalRuns = loadouts.length * config.seedsPerLoadout;
  return Object.freeze({
    ...freezeBucket(totals),
    rescueRate: totalRuns === 0 ? 0 : totals.rescued / totalRuns,
    averageRescueDay: average(rescueDays),
    averageNoSignalRescueDay: average(noSignalRescueDays),
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

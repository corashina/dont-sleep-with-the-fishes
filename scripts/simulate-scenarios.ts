import {
  enumerateMissingPickupSets,
  runBalanceSimulation,
  type BalanceScenarioReport,
  type BalanceSimulationProgress,
} from '../src/survival/balanceSimulation';

const SEEDS_PER_LOADOUT = Number(process.env.SIM_SEEDS ?? '100');
const LOADOUT_LIMIT = process.env.SIM_LOADOUT_LIMIT === undefined
  ? undefined
  : Number(process.env.SIM_LOADOUT_LIMIT);
const FISHING_REACTION_SUCCESS = Number(process.env.SIM_FISHING_SUCCESS ?? '0.90');
const PROGRESS_INTERVAL_MS = 5000;

interface DayStats {
  readonly mean: number | null;
  readonly median: number | null;
  readonly minimum: number | null;
  readonly p10: number | null;
  readonly p90: number | null;
  readonly maximum: number | null;
}

interface CohortSummary {
  readonly label: string;
  readonly totalRuns: number;
  readonly outcomes: Readonly<Record<string, number>>;
  readonly rates: Readonly<Record<string, number>>;
  readonly endings: Readonly<Record<string, number>>;
  readonly rescueDays: DayStats;
  readonly endingDays: Omit<DayStats, 'p10' | 'p90'>;
}

function daySamples(
  endingsByDay: Readonly<Record<string, number>>,
  endingId?: string,
): number[] {
  const days: number[] = [];
  for (const [key, count] of Object.entries(endingsByDay)) {
    const [id, dayText] = key.split(':');
    if (endingId !== undefined && id !== endingId) continue;
    const day = Number(dayText);
    for (let index = 0; index < count; index += 1) days.push(day);
  }
  return days.sort((left, right) => left - right);
}

function mean(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  return values[Math.floor((values.length - 1) / 2)]!;
}

function percentile(values: readonly number[], fraction: number): number | null {
  if (values.length === 0) return null;
  return values[Math.min(values.length - 1, Math.floor(fraction * (values.length - 1)))]!;
}

function round(value: number | null): number | null {
  return value === null ? null : Math.round(value * 1000) / 1000;
}

function endingIdCounts(
  endingsByDay: Readonly<Record<string, number>>,
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const [key, count] of Object.entries(endingsByDay)) {
    const id = key.split(':')[0]!;
    counts[id] = (counts[id] ?? 0) + count;
  }
  return counts;
}

function summarize(label: string, cohort: BalanceScenarioReport): CohortSummary {
  const rescueDays = daySamples(cohort.endingsByDay, 'rescue');
  const allDays = daySamples(cohort.endingsByDay);
  const total = cohort.totalRuns;
  const rate = (value: number): number => round(total === 0 ? 0 : value / total)!;
  return {
    label,
    totalRuns: total,
    outcomes: {
      rescued: cohort.rescued,
      dead: cohort.dead,
      sunk: cohort.sunk,
      abducted: cohort.abducted,
      blocked: cohort.blocked,
    },
    rates: {
      rescued: rate(cohort.rescued),
      dead: rate(cohort.dead),
      sunk: rate(cohort.sunk),
      abducted: rate(cohort.abducted),
      blocked: rate(cohort.blocked),
    },
    endings: endingIdCounts(cohort.endingsByDay),
    rescueDays: {
      mean: round(cohort.averageRescueDay),
      median: cohort.medianRescueDay,
      minimum: rescueDays[0] ?? null,
      p10: percentile(rescueDays, 0.1),
      p90: percentile(rescueDays, 0.9),
      maximum: rescueDays[rescueDays.length - 1] ?? null,
    },
    endingDays: {
      mean: round(mean(allDays)),
      median: median(allDays),
      minimum: allDays[0] ?? null,
      maximum: allDays[allDays.length - 1] ?? null,
    },
  };
}

function formatDayStats(stats: DayStats): string {
  return `mean ${stats.mean ?? '-'} | median ${stats.median ?? '-'}`
    + ` | min ${stats.minimum ?? '-'} | p10 ${stats.p10 ?? '-'}`
    + ` | p90 ${stats.p90 ?? '-'} | max ${stats.maximum ?? '-'}`;
}

function printCohort(summary: CohortSummary): void {
  console.log(`\n[${summary.label}] runs ${summary.totalRuns}`);
  console.log('  outcomes : '
    + Object.entries(summary.outcomes)
      .map(([key, count]) => `${key} ${count} (${summary.rates[key]})`)
      .join(' | '));
  console.log('  endings  : '
    + Object.entries(summary.endings)
      .sort((left, right) => right[1] - left[1])
      .map(([key, count]) => `${key} ${count}`)
      .join(' | '));
  console.log(`  rescue day  : ${formatDayStats(summary.rescueDays)}`);
  console.log(`  ending day  : mean ${summary.endingDays.mean ?? '-'}`
    + ` | median ${summary.endingDays.median ?? '-'}`
    + ` | min ${summary.endingDays.minimum ?? '-'}`
    + ` | max ${summary.endingDays.maximum ?? '-'}`);
}

function formatDuration(milliseconds: number): string {
  const totalSeconds = Math.max(0, Math.round(milliseconds / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

const allLoadouts = enumerateMissingPickupSets();
const loadouts = LOADOUT_LIMIT === undefined
  ? allLoadouts
  : allLoadouts.slice(0, LOADOUT_LIMIT);
const loadoutCount = loadouts.length;
const runsPerCohort = loadoutCount * SEEDS_PER_LOADOUT;
const startedAt = Date.now();
let lastProgressAt = startedAt;

function reportProgress(progress: BalanceSimulationProgress): void {
  const now = Date.now();
  const complete = progress.completedRuns >= progress.totalRuns;
  if (!complete && now - lastProgressAt < PROGRESS_INTERVAL_MS) return;
  lastProgressAt = now;
  const elapsed = now - startedAt;
  const fraction = progress.totalRuns === 0 ? 1 : progress.completedRuns / progress.totalRuns;
  const eta = fraction > 0 ? elapsed / fraction - elapsed : null;
  console.log(`[progress] ${(fraction * 100).toFixed(1)}%`
    + ` | loadouts ${progress.loadoutIndex + 1}/${progress.loadoutCount}`
    + ` | runs ${progress.completedRuns}/${progress.totalRuns}`
    + ` | elapsed ${formatDuration(elapsed)}`
    + ` | eta ${eta === null ? '-' : formatDuration(eta)}`);
}

console.log(`[scenario-sim] loadouts ${loadoutCount}`
  + ` | seeds/loadout ${SEEDS_PER_LOADOUT}`
  + ` | runs/cohort ${runsPerCohort}`
  + ` | total sessions ${runsPerCohort * 2}`
  + ` | fishing success ${FISHING_REACTION_SUCCESS}`);

const report = runBalanceSimulation({
  seedsPerLoadout: SEEDS_PER_LOADOUT,
  fishingReactionSuccess: FISHING_REACTION_SUCCESS,
  loadoutLimit: LOADOUT_LIMIT,
  onProgress: reportProgress,
});

console.log(`[milestone] simulation complete in ${formatDuration(Date.now() - startedAt)}`);

const signal = summarize('signals enabled', report);
const noSignal = summarize('signals disabled', report.noSignal);
const signalRescueRate = report.totalRuns === 0 ? 0 : report.rescued / report.totalRuns;
const noSignalRescueRate = report.noSignal.totalRuns === 0
  ? 0
  : report.noSignal.rescued / report.noSignal.totalRuns;

const summary = {
  config: {
    seedsPerLoadout: SEEDS_PER_LOADOUT,
    fishingReactionSuccess: FISHING_REACTION_SUCCESS,
    loadoutCount,
    runsPerCohort: loadoutCount * SEEDS_PER_LOADOUT,
    grandTotalRuns: loadoutCount * SEEDS_PER_LOADOUT * 2,
  },
  signal,
  noSignal,
  signalEffect: {
    rescueRateDelta: round(signalRescueRate - noSignalRescueRate),
    averageRescueDayDelta: report.averageRescueDay === null
      || report.noSignal.averageRescueDay === null
      ? null
      : round(report.averageRescueDay - report.noSignal.averageRescueDay),
  },
  integrity: {
    blockedLoadouts: report.blockedLoadouts.length,
    unrescuedLoadouts: report.unrescuedLoadouts.length,
  },
};

console.log(JSON.stringify(summary, null, 2));
printCohort(signal);
printCohort(noSignal);
console.log(`\n[signal effect] rescue rate ${summary.signalEffect.rescueRateDelta}`
  + ` | average rescue day ${summary.signalEffect.averageRescueDayDelta}`);
console.log(`[integrity] blocked loadouts ${summary.integrity.blockedLoadouts}`
  + ` | unrescued loadouts ${summary.integrity.unrescuedLoadouts}`);

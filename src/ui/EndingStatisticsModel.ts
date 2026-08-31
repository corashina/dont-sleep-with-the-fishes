import type { EndingRecord } from '../game/ending';
import type { ScavengeSnapshot } from '../game/ScavengeSession';
import { SCAVENGE_DURATION_SECONDS } from '../game/scavengeRules';
import { carlitosStatus } from '../survival/CarlitosState';
import type { SurvivalSnapshot } from '../survival/survivalSnapshot';
import { itemArtwork, uiArtwork } from './uiArtwork';
import type { StatisticsGraph } from './StatisticsGraph';

export interface EndingStatistic {
  readonly label: string;
  readonly value: string;
  readonly icon: string;
}

export interface EndingStatistics {
  readonly rows: readonly EndingStatistic[];
  readonly graph: StatisticsGraph | null;
}

function baseRows(record: EndingRecord): EndingStatistic[] {
  return [
    { label: 'ENDING DAY', value: record.id === 'dorothy' ? 'BEFORE DAY 1' : String(record.day), icon: uiArtwork('watch') },
    { label: 'PICKUPS SAVED', value: String(record.savedPickupCount), icon: uiArtwork('guideSave') },
  ];
}

export function survivalEndingStatistics(record: EndingRecord, snapshot: SurvivalSnapshot | null): EndingStatistics {
  const rows = baseRows(record);
  if (snapshot === null) return { rows, graph: null };
  rows.push(
    { label: 'HEALTH', value: `${snapshot.health} / 100`, icon: uiArtwork('health') },
    { label: 'HUNGER', value: `${snapshot.hunger} / 100`, icon: uiArtwork('hunger') },
    { label: 'BOAT CONDITION', value: `${snapshot.hull} / 100`, icon: uiArtwork('hull') },
    { label: 'FOOD LEFT', value: String(snapshot.food), icon: itemArtwork('cannedFood') },
    { label: 'BAIT LEFT', value: String(snapshot.bait), icon: itemArtwork('baitTin') },
    { label: 'RADIO SIGNALS', value: String(snapshot.radioSignalsSent), icon: itemArtwork('radio') },
    { label: 'CARLITOS', value: companionValue(snapshot), icon: itemArtwork('carlitos') },
  );
  return {
    rows,
    graph: snapshot.history.length === 0 ? null : {
      times: snapshot.history.map(({ day }) => day),
      axis: 'DAY', maximum: 100, stepped: false,
      series: [
        { label: 'HEALTH', values: snapshot.history.map(({ health }) => health) },
        { label: 'HUNGER', values: snapshot.history.map(({ hunger }) => hunger) },
        { label: 'BOAT', values: snapshot.history.map(({ hull }) => hull) },
      ],
      note: 'Last reading of each day. Hunger rises toward starvation.',
    },
  };
}

function companionValue(snapshot: SurvivalSnapshot): string {
  if (snapshot.carlitos === null) return 'NOT ABOARD';
  if (!snapshot.carlitos.alive) return 'DEAD';
  return carlitosStatus(snapshot.carlitos).health.toUpperCase();
}

export function scavengeEndingStatistics(record: EndingRecord, snapshot: ScavengeSnapshot | null): EndingStatistics {
  const rows = baseRows(record);
  if (snapshot === null) return { rows, graph: null };
  const seconds = SCAVENGE_DURATION_SECONDS - snapshot.remainingSeconds;
  rows.push({ label: 'SHIP TIME', value: `${Math.round(seconds)} SECONDS`, icon: uiArtwork('watch') });
  return {
    rows,
    graph: {
      times: snapshot.pickupHistory.map((reading) => reading.seconds),
      axis: 'SHIP TIME (SECONDS)', maximum: Math.max(2, Math.ceil(snapshot.savedCount / 2) * 2), stepped: true,
      series: [{ label: 'PICKUPS SAVED', values: snapshot.pickupHistory.map(({ savedCount }) => savedCount) }],
      note: 'Each step marks supplies placed in the lifeboat.',
    },
  };
}

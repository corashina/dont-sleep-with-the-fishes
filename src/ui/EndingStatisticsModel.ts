import { uiDynamic } from '../i18n/uiDynamicMessages';
import { uiText } from '../i18n/uiMessages';
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
    { label: uiText('endingDay'), value: record.id === 'dorothy' ? uiText('beforeDayOne') : String(record.day), icon: uiArtwork('watch') },
    { label: uiText('pickupsSaved'), value: String(record.savedPickupCount), icon: uiArtwork('guideSave') },
  ];
}

export function survivalEndingStatistics(record: EndingRecord, snapshot: SurvivalSnapshot | null): EndingStatistics {
  const rows = baseRows(record);
  if (snapshot === null) return { rows, graph: null };
  rows.push(
    { label: uiText('health'), value: `${snapshot.health} / 100`, icon: uiArtwork('health') },
    { label: uiText('hunger'), value: `${snapshot.hunger} / 100`, icon: uiArtwork('hunger') },
    { label: uiText('boatCondition'), value: `${snapshot.hull} / 100`, icon: uiArtwork('hull') },
    { label: uiText('foodLeft'), value: String(snapshot.food), icon: itemArtwork('cannedFood') },
    { label: uiText('baitLeft'), value: String(snapshot.bait), icon: itemArtwork('baitTin') },
    { label: uiText('radioSignals'), value: String(snapshot.radioSignalsSent), icon: itemArtwork('radio') },
    { label: 'CARLITOS', value: companionValue(snapshot), icon: itemArtwork('carlitos') },
  );
  return {
    rows,
    graph: snapshot.history.length === 0 ? null : {
      times: snapshot.history.map(({ day }) => day),
      axis: uiText('dayUpper'), maximum: 100, stepped: false,
      series: [
        { label: uiText('health'), values: snapshot.history.map(({ health }) => health) },
        { label: uiText('hunger'), values: snapshot.history.map(({ hunger }) => hunger) },
        { label: uiText('boat'), values: snapshot.history.map(({ hull }) => hull) },
      ],
      note: uiText('survivalGraphNote'),
    },
  };
}

function companionValue(snapshot: SurvivalSnapshot): string {
  if (snapshot.carlitos === null) return uiText('notAboard');
  if (!snapshot.carlitos.alive) return uiText('dead');
  return carlitosStatus(snapshot.carlitos).health.toUpperCase();
}

export function scavengeEndingStatistics(record: EndingRecord, snapshot: ScavengeSnapshot | null): EndingStatistics {
  const rows = baseRows(record);
  if (snapshot === null) return { rows, graph: null };
  const seconds = SCAVENGE_DURATION_SECONDS - snapshot.remainingSeconds;
  rows.push({ label: uiText('shipTime'), value: uiDynamic('seconds', Math.round(seconds)), icon: uiArtwork('watch') });
  return {
    rows,
    graph: {
      times: snapshot.pickupHistory.map((reading) => reading.seconds),
      axis: uiText('shipTimeSeconds'), maximum: Math.max(2, Math.ceil(snapshot.savedCount / 2) * 2), stepped: true,
      series: [{ label: uiText('pickupsSaved'), values: snapshot.pickupHistory.map(({ savedCount }) => savedCount) }],
      note: uiText('scavengeGraphNote'),
    },
  };
}

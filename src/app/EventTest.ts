import {
  ITEM_IDS,
  type ItemInstance,
  type ItemInstanceId,
} from '../game/ItemState';
import type { ScavengeResult } from '../game/ScavengeSession';
import type { EndingRecord } from '../game/ending';
import { eventMessage, type EventTextId } from '../i18n/eventMessages';
import { SURVIVAL_EVENTS } from '../survival/eventCatalog';
import { ITEM_ANIMATION_LAB_ID } from '../survival/ItemAnimationLab';
import { deriveEventVariantSeed } from '../survival/eventPresentationOutcome';
import { nightTraderOffers } from '../survival/nightTraderTrades';
import type { PresentationCue } from '../survival/survivalTypes';

interface EventSceneTestOption {
  readonly id: string;
  readonly title: string;
  readonly phase: 'lab' | 'day' | 'night';
  readonly eventId: string;
  readonly resultId?: string;
  readonly seed?: number;
}

export type EventTestOption = EventSceneTestOption | {
  readonly id: string;
  readonly title: string;
  readonly phase: 'ending';
  readonly endingId: EndingRecord['id'];
};

const NIGHT_EVENT_TYPE_ORDER: readonly PresentationCue[] = Object.freeze([
  'storm',
  'impact',
  'fish',
  'darkness',
  'sighting',
  'repair',
]);

function nightEventTypeRank(cue: PresentationCue): number {
  const rank = NIGHT_EVENT_TYPE_ORDER.indexOf(cue);
  return rank === -1 ? NIGHT_EVENT_TYPE_ORDER.length : rank;
}

function eventSceneOption(
  option: Omit<EventSceneTestOption, 'title'>,
  title: () => string,
): EventSceneTestOption {
  return Object.freeze(Object.defineProperty(option, 'title', {
    enumerable: true,
    get: title,
  }) as EventSceneTestOption);
}

function endingOption(
  endingId: EndingRecord['id'],
  titleId: EventTextId,
): EventTestOption {
  return Object.freeze(Object.defineProperty({
    id: `ending-${endingId}`,
    phase: 'ending' as const,
    endingId,
  }, 'title', {
    enumerable: true,
    get: () => eventMessage(`event-test.ending.${endingId}`, titleId),
  }) as EventTestOption);
}

export const EVENT_TEST_OPTIONS: readonly EventTestOption[] = Object.freeze([
  ...[
    {
      id: ITEM_ANIMATION_LAB_ID,
      phase: 'lab' as const,
    },
    ...SURVIVAL_EVENTS.filter(({ phase }) => phase === 'day'),
    ...SURVIVAL_EVENTS
      .filter(({ phase }) => phase === 'night')
      .map((event, catalogIndex) => ({ event, catalogIndex }))
      .sort((left, right) => (
        nightEventTypeRank(left.event.cue) - nightEventTypeRank(right.event.cue)
        || left.catalogIndex - right.catalogIndex
      ))
      .map(({ event }) => event),
  ]
    .flatMap((definition): readonly EventTestOption[] => {
      const { id, phase } = definition;
      if (id === 'drifting-supplies') {
        // Fixed day-one session seeds keep each supply preview repeatable.
        return ([
          ['barrel', 3, 'eventTestSupplyBarrel'],
          ['lifeboat', 0, 'eventTestSupplyLifeboat'],
          ['container', 5, 'eventTestSupplyContainer'],
          ['debris', 1, 'eventTestSupplyDebris'],
        ] as const).map(([kind, seed, titleId]) => eventSceneOption({
          id: `${id}-${kind}`,
          phase,
          eventId: id,
          seed,
        }, () => eventMessage(`event-test.drifting-supplies.${kind}`, titleId)));
      }
      if (id === 'check-the-back') {
        return [
          eventSceneOption({
            id: 'check-the-back-fish',
            phase,
            eventId: id,
            resultId: 'check-the-back.fish',
          }, () => eventMessage('event-test.check-back.fish', 'eventTestCheckBackFish')),
          eventSceneOption({
            id: 'check-the-back-bad',
            phase,
            eventId: id,
            resultId: 'check-the-back.bad',
          }, () => eventMessage('event-test.check-back.bad', 'eventTestCheckBackBad')),
        ];
      }
      if (id !== 'midnight-tour') {
        return [eventSceneOption(
          // Seed zero gives Night Trader five offers with no payment/reward overlap.
          { id, phase, eventId: id, ...(id === 'night-trader' ? { seed: 0 } : {}) },
          () => id === ITEM_ANIMATION_LAB_ID
            ? eventMessage('event-test.item-animation-lab', 'eventTestItemAnimationLab')
            : 'title' in definition ? definition.title : '',
        )];
      }
      return [
        eventSceneOption({
          id: 'midnight-tour-chest',
          phase,
          eventId: id,
          resultId: 'tour-chest',
        }, () => eventMessage('event-test.midnight-tour.chest', 'eventTestMidnightChest')),
        eventSceneOption({
          id: 'midnight-tour-grave',
          phase,
          eventId: id,
          resultId: 'tour-grave',
        }, () => eventMessage('event-test.midnight-tour.grave', 'eventTestMidnightGrave')),
        eventSceneOption({
          id: 'midnight-tour-camp',
          phase,
          eventId: id,
          resultId: 'tour-camp',
        }, () => eventMessage('event-test.midnight-tour.camp', 'eventTestMidnightCamp')),
        eventSceneOption({
          id: 'midnight-tour-monster',
          phase,
          eventId: id,
          resultId: 'tour-attack',
        }, () => eventMessage('event-test.midnight-tour.monster', 'eventTestMidnightMonster')),
      ];
    })
    .map((option) => Object.freeze(option)),
  endingOption('dorothy', 'eventTestDorothy'),
  endingOption('rescue', 'eventTestRescue'),
  endingOption('death', 'eventTestDeath'),
  endingOption('sinking', 'eventTestSinking'),
]);

export function createEventTestResult(option: EventTestOption, seed: number): Readonly<ScavengeResult> {
  const rewards = option.phase !== 'ending' && option.eventId === 'night-trader'
    ? new Set(nightTraderOffers(deriveEventVariantSeed(seed, 1, option.eventId)).map(({ reward }) => reward))
    // Reserve a light reward so every stocked Handyman payment has a valid trade.
    : new Set(option.phase !== 'ending' && option.eventId === 'handyman' ? ['compass'] : []);
  const savedItems = ITEM_IDS.filter((type) => !rewards.has(type)).map((type): Readonly<ItemInstance> => Object.freeze({
    instanceId: `${type}-1` as ItemInstanceId,
    type,
  }));
  return Object.freeze({
    savedItems: Object.freeze(savedItems),
    elapsedSeconds: 0,
  });
}

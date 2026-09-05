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
import type { PresentationCue } from '../survival/survivalTypes';

interface EventSceneTestOption {
  readonly id: string;
  readonly title: string;
  readonly phase: 'lab' | 'day' | 'night';
  readonly eventId: string;
  readonly resultId?: string;
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
          { id, phase, eventId: id },
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

export function createEventTestResult(): Readonly<ScavengeResult> {
  const savedItems = ITEM_IDS.map((type): Readonly<ItemInstance> => Object.freeze({
    instanceId: `${type}-1` as ItemInstanceId,
    type,
  }));
  return Object.freeze({
    savedItems: Object.freeze(savedItems),
    elapsedSeconds: 0,
  });
}

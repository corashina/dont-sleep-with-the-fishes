import type { SoundId } from '../audio/audioManifest';
import type { EventModelId } from './eventModelManifest';
import {
  EVENT_PRESENTATION_ROUTES,
} from './eventPresentationRoutes';
import type { SurvivalEventModelId } from './eventModelManifest';
import { SURVIVAL_EVENTS, type SurvivalEventId } from './events';

export type EventBundleModelId = EventModelId | SurvivalEventModelId;

export interface EventBundleSpec {
  readonly models: readonly EventBundleModelId[];
  readonly sounds: readonly SoundId[];
}

const RESOURCES: Partial<Readonly<Record<SurvivalEventId, EventBundleSpec>>> = {
  leak: { models: ['leakPlanks'], sounds: ['leak'] },
  'school-of-fish': { models: ['schoolFish'], sounds: [] },
  snatcher: { models: ['snatcher'], sounds: ['tentacleMovement'] },
  'death-stare': { models: ['deathStareBlob'], sounds: [] },
  'swarm-of-anglerfish': { models: ['anglerFish'], sounds: [] },
  tornado: { models: ['tornadoCore'], sounds: ['tornadoWind'] },
  'man-in-the-fog': { models: ['fogMan'], sounds: [] },
  ghosts: { models: ['ghost'], sounds: [] },
  'eerie-melody': {
    models: ['siren'],
    sounds: ['eerieMelody'],
  },
  thunderstorm: {
    models: [],
    sounds: ['thunderLightning', 'thunderLightningCrack', 'thunderLightningDry'],
  },
  'bad-sleep': { models: [], sounds: ['yawn'] },
  'drifting-barrel': {
    models: ['driftingBarrel'],
    sounds: ['driftingCargo'],
  },
  'drifting-chest': {
    models: ['mysteryChest'],
    sounds: ['driftingCargo'],
  },
  'drifting-bottle': { models: ['driftingBottle'], sounds: [] },
  'check-the-back': { models: ['checkBackFish'], sounds: [] },
  flowers: { models: ['flowers'], sounds: [] },
  'chest-attack': { models: [], sounds: [] },
};

const ITEM_SOUNDS = Object.freeze({
  bucket: ['bucketRain'],
  umbrella: ['umbrella'],
  anchor: ['anchorChain', 'anchorSplash'],
  flashlight: ['flashlight'],
  flareGun: ['flareGunShot', 'flareGun'],
  shotgun: ['shotgun'],
} as const satisfies Partial<Readonly<Record<string, readonly SoundId[]>>>);

const eventChoiceSounds = new Map<SurvivalEventId, readonly SoundId[]>(
  SURVIVAL_EVENTS.map((event) => [
    event.id as SurvivalEventId,
    Object.freeze([...new Set(event.choices.flatMap(({ itemId }) => (
      itemId === undefined ? [] : ITEM_SOUNDS[itemId as keyof typeof ITEM_SOUNDS] ?? []
    )))]) as readonly SoundId[],
  ]),
);

const eventIds = Object.keys(EVENT_PRESENTATION_ROUTES) as SurvivalEventId[];

export const EVENT_BUNDLE_SPECS = Object.freeze(Object.fromEntries(
  eventIds.map((eventId) => {
    const resources = RESOURCES[eventId];
    return [eventId, Object.freeze({
      models: Object.freeze([...(resources?.models ?? [])]),
      sounds: Object.freeze([...new Set([
        ...(resources?.sounds ?? []),
        ...(eventChoiceSounds.get(eventId) ?? []),
      ])]),
    })];
  }),
) as Readonly<Record<SurvivalEventId, EventBundleSpec>>);

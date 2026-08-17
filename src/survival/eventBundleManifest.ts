import type { SoundId } from '../audio/audioManifest';
import type { EventModelId } from './eventModelManifest';
import {
  EVENT_PRESENTATION_ROUTES,
} from './eventPresentationRoutes';
import type { SurvivalEventModelId } from './eventModelManifest';
import type { SurvivalEventId } from './events';

export type EventBundleModelId = EventModelId | SurvivalEventModelId;

export interface EventBundleSpec {
  readonly models: readonly EventBundleModelId[];
  readonly sounds: readonly SoundId[];
}

const RESOURCES: Partial<Readonly<Record<SurvivalEventId, EventBundleSpec>>> = {
  leak: { models: ['leakPlanks'], sounds: [] },
  'school-of-fish': { models: ['schoolFish'], sounds: [] },
  snatcher: { models: ['snatcher'], sounds: ['tentacleMovement'] },
  'death-stare': { models: ['deathStareBlob'], sounds: [] },
  'swarm-of-anglerfish': { models: ['anglerFish'], sounds: [] },
  whirlpool: { models: ['whirlpoolCore'], sounds: [] },
  'man-in-the-fog': { models: ['fogMan'], sounds: [] },
  ghosts: { models: ['ghost'], sounds: [] },
  'eerie-melody': {
    models: ['siren', 'sirenRock'],
    sounds: ['eerieMelody'],
  },
  thunderstorm: {
    models: [],
    sounds: ['thunderLightning'],
  },
  'bad-sleep': { models: [], sounds: ['yawn'] },
  'drifting-loot': {
    models: ['driftingLootBarrel', 'driftingLootCrate'],
    sounds: ['driftingCargo'],
  },
  'mystery-chest': {
    models: ['mysteryChest'],
    sounds: ['chest'],
  },
  'drifting-bottle': { models: ['driftingBottle'], sounds: [] },
  'check-the-back': { models: ['checkBackFish'], sounds: [] },
  flowers: { models: ['flowers'], sounds: [] },
  'chest-attack': { models: [], sounds: ['chest'] },
};

const eventIds = Object.keys(EVENT_PRESENTATION_ROUTES) as SurvivalEventId[];

export const EVENT_BUNDLE_SPECS = Object.freeze(Object.fromEntries(
  eventIds.map((eventId) => {
    const resources = RESOURCES[eventId];
    return [eventId, Object.freeze({
      models: Object.freeze([...(resources?.models ?? [])]),
      sounds: Object.freeze([...(resources?.sounds ?? [])]),
    })];
  }),
) as Readonly<Record<SurvivalEventId, EventBundleSpec>>);

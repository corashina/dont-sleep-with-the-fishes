import { INCLUDED_EVENT_PHASES } from './events';

export const EVENT_PARITY_AUDIT = Object.freeze({
  sources: Object.freeze({
    items: 'https://unoffdontsleepwiththefishes.fandom.com/wiki/Items',
    events: 'https://unoffdontsleepwiththefishes.fandom.com/wiki/Events',
    reviewed: '2026-07-15',
  }),
  included: Object.freeze(Object.keys(INCLUDED_EVENT_PHASES)),
  excluded: Object.freeze({
    'peaceful-night': 'Represented by the existing quiet-night branch.',
    'check-the-back': 'Contains no Dorothy item response.',
    'needs-direction': 'Requires excluded route state and contains no item response.',
    'mystery-chest': 'Introduces later Chest loot.',
    seagull: 'Scheduling and outcome weights are undocumented.',
    'midnight-tour': 'Introduces later Chest loot and story-only outcomes.',
    'chest-attack': 'Requires the excluded Chest.',
    'broken-boat': 'Represented by the existing hull terminal rule.',
    'the-handyman': 'Requires excluded trades and later item acquisition.',
  }),
} as const);

import { describe, expect, it } from 'vitest';
import { ITEM_IDS } from '../src/game/ItemState';
import { EVENT_PARITY_AUDIT } from '../src/survival/eventParityAudit';
import { SURVIVAL_EVENTS } from '../src/survival/events';

const EXCLUDED = {
  'peaceful-night': 'Represented by the existing quiet-night branch.',
  'check-the-back': 'Contains no Dorothy item response.',
  'needs-direction': 'Requires excluded route state and contains no item response.',
  'mystery-chest': 'Introduces later Chest loot.',
  seagull: 'Scheduling and outcome weights are undocumented.',
  'midnight-tour': 'Introduces later Chest loot and story-only outcomes.',
  'chest-attack': 'Requires the excluded Chest.',
  'broken-boat': 'Represented by the existing hull terminal rule.',
  'the-handyman': 'Requires excluded trades and later item acquisition.',
} as const;

describe('event parity audit', () => {
  it('records the fixed source review and every explicit exclusion reason', () => {
    expect(EVENT_PARITY_AUDIT).toEqual({
      sources: {
        items: 'https://unoffdontsleepwiththefishes.fandom.com/wiki/Items',
        events: 'https://unoffdontsleepwiththefishes.fandom.com/wiki/Events',
        reviewed: '2026-07-15',
      },
      included: SURVIVAL_EVENTS.map(({ id }) => id),
      excluded: EXCLUDED,
    });
    expect(Object.isFrozen(EVENT_PARITY_AUDIT)).toBe(true);
    expect(Object.isFrozen(EVENT_PARITY_AUDIT.included)).toBe(true);
    expect(Object.isFrozen(EVENT_PARITY_AUDIT.excluded)).toBe(true);
  });

  it('keeps every included and excluded ID unique and mutually exclusive', () => {
    const included = EVENT_PARITY_AUDIT.included;
    const excluded = Object.keys(EVENT_PARITY_AUDIT.excluded);
    expect(new Set(included).size).toBe(included.length);
    expect(new Set(excluded).size).toBe(excluded.length);
    expect(included.filter((id) => excluded.includes(id))).toEqual([]);
    expect(SURVIVAL_EVENTS.map(({ id }) => id)).toEqual(included);
  });

  it('uses only catalog items and provides all fifteen documented Dorothy event response types', () => {
    const responseIds = SURVIVAL_EVENTS.flatMap(({ choices }) => choices.flatMap(({ itemId }) => itemId ?? []));
    expect(responseIds.every((id) => (ITEM_IDS as readonly string[]).includes(id))).toBe(true);
    expect([...new Set(responseIds)].sort()).toEqual([
      'anchor', 'baitTin', 'bucket', 'cannedFood', 'compass', 'ductTape', 'fishingNet',
      'flareGun', 'flashlight', 'harpoonGun', 'map', 'scubaSet', 'spyglass', 'swimRing',
      'umbrella',
    ]);
    expect(SURVIVAL_EVENTS.some(({ id }) => id in EXCLUDED)).toBe(false);
  });
});

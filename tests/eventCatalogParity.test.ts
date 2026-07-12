import { describe, expect, it } from 'vitest';
import {
  CANONICAL_EVENTS,
  SURVIVAL_EVENTS,
  eventDamageMultiplier,
  validateCanonicalEvents,
} from '../src/canonical/events';
import { PARITY_AUDIT } from '../src/canonical/parityAudit';
import type { CanonicalEventDefinition } from '../src/survival/survivalTypes';

const includedIds = [
  'peaceful-night', 'shower-night', 'windy-night', 'bad-sleep', 'thunderstorm',
  'check-the-back', 'dangerous-waters', 'needs-direction', 'restless-waves', 'leak',
  'man-in-the-fog', 'mystery-chest', 'seagull', 'midnight-tour', 'ghosts',
  'school-of-fish', 'snatcher', 'chest-attack', 'death-stare', 'swarm-of-anglerfish',
  'whirlpool', 'eerie-melody', 'shark-men', 'face-on-the-moon', 'broken-boat',
  'the-handyman',
] as const;

const event = (id: string) => {
  const found = CANONICAL_EVENTS.find((entry) => entry.id === id);
  expect(found, id).toBeDefined();
  return found!;
};

const choice = (eventId: string, choiceId: string) => {
  const found = event(eventId);
  if (found.automatic) throw new Error(`${eventId} is automatic`);
  const selected = found.choices.find((entry) => entry.id === choiceId);
  expect(selected, `${eventId}.${choiceId}`).toBeDefined();
  return selected!;
};

const metadata = (entry: (typeof CANONICAL_EVENTS)[number]) => ({
  id: entry.id,
  sourceId: entry.sourceId,
  weight: entry.weight,
  minDay: entry.minDay,
  maxDay: entry.maxDay,
  cooldownDays: entry.cooldownDays,
  maxAppearances: entry.maxAppearances,
  dangerMin: entry.dangerMin,
  routeWeightBonuses: entry.routeWeightBonuses,
  selectable: entry.selectable,
});

describe('canonical ordinary event catalog', () => {
  it('contains the exact included IDs in canonical order', () => {
    expect(CANONICAL_EVENTS.map(({ id }) => id)).toEqual(includedIds);
    expect(SURVIVAL_EVENTS).toBe(CANONICAL_EVENTS);
  });

  it('records every documented selection boundary and source ID', () => {
    expect(CANONICAL_EVENTS.map(metadata)).toEqual([
      { id: 'peaceful-night', sourceId: 'events', weight: 75, minDay: 0, maxDay: undefined, cooldownDays: 0, maxAppearances: 0, dangerMin: 0, routeWeightBonuses: undefined, selectable: true },
      { id: 'shower-night', sourceId: 'events', weight: 35, minDay: 2, maxDay: undefined, cooldownDays: 35, maxAppearances: 1, dangerMin: 0, routeWeightBonuses: undefined, selectable: true },
      { id: 'windy-night', sourceId: 'events', weight: 40, minDay: 2, maxDay: undefined, cooldownDays: 40, maxAppearances: 1, dangerMin: 0, routeWeightBonuses: undefined, selectable: true },
      { id: 'bad-sleep', sourceId: 'events', weight: 40, minDay: 2, maxDay: 10, cooldownDays: 40, maxAppearances: 1, dangerMin: 0, routeWeightBonuses: undefined, selectable: true },
      { id: 'thunderstorm', sourceId: 'events', weight: 40, minDay: 2, maxDay: undefined, cooldownDays: 35, maxAppearances: 1, dangerMin: 0, routeWeightBonuses: undefined, selectable: true },
      { id: 'check-the-back', sourceId: 'events', weight: 35, minDay: 2, maxDay: undefined, cooldownDays: 35, maxAppearances: 1, dangerMin: 0, routeWeightBonuses: undefined, selectable: true },
      { id: 'dangerous-waters', sourceId: 'events', weight: 15, minDay: 2, maxDay: 30, cooldownDays: 0, maxAppearances: 1, dangerMin: 0, routeWeightBonuses: { right: 25 }, selectable: true },
      { id: 'needs-direction', sourceId: 'events', weight: 33, minDay: 2, maxDay: 24, cooldownDays: 0, maxAppearances: 1, dangerMin: 0, routeWeightBonuses: undefined, selectable: true },
      { id: 'restless-waves', sourceId: 'events', weight: 30, minDay: 3, maxDay: undefined, cooldownDays: 35, maxAppearances: 1, dangerMin: 0, routeWeightBonuses: undefined, selectable: true },
      { id: 'leak', sourceId: 'events', weight: 10, minDay: 4, maxDay: undefined, cooldownDays: 0, maxAppearances: 1, dangerMin: 0, routeWeightBonuses: undefined, selectable: true },
      { id: 'man-in-the-fog', sourceId: 'events', weight: 18, minDay: 6, maxDay: undefined, cooldownDays: 40, maxAppearances: 1, dangerMin: 1, routeWeightBonuses: undefined, selectable: true },
      { id: 'mystery-chest', sourceId: 'events', weight: 45, minDay: 6, maxDay: undefined, cooldownDays: 33, maxAppearances: 1, dangerMin: 1, routeWeightBonuses: { right: 5 }, selectable: true },
      { id: 'seagull', sourceId: 'events', weight: 0, minDay: 0, maxDay: undefined, cooldownDays: 0, maxAppearances: 0, dangerMin: 0, routeWeightBonuses: undefined, selectable: false },
      { id: 'midnight-tour', sourceId: 'events', weight: 22, minDay: 7, maxDay: 40, cooldownDays: 30, maxAppearances: 1, dangerMin: 1, routeWeightBonuses: { right: 8 }, selectable: true },
      { id: 'ghosts', sourceId: 'events', weight: 25, minDay: 8, maxDay: undefined, cooldownDays: 38, maxAppearances: 1, dangerMin: 1, routeWeightBonuses: { left: 3 }, selectable: true },
      { id: 'school-of-fish', sourceId: 'events', weight: 66, minDay: 8, maxDay: undefined, cooldownDays: 39, maxAppearances: 1, dangerMin: 1, routeWeightBonuses: { right: 5 }, selectable: true },
      { id: 'snatcher', sourceId: 'events', weight: 28, minDay: 8, maxDay: undefined, cooldownDays: 45, maxAppearances: 1, dangerMin: 1, routeWeightBonuses: { left: 5 }, selectable: true },
      { id: 'chest-attack', sourceId: 'events', weight: 0, minDay: 0, maxDay: undefined, cooldownDays: 0, maxAppearances: 0, dangerMin: 0, routeWeightBonuses: undefined, selectable: false },
      { id: 'death-stare', sourceId: 'events', weight: 160, minDay: 9, maxDay: undefined, cooldownDays: 32, maxAppearances: 1, dangerMin: 1, routeWeightBonuses: undefined, selectable: true },
      { id: 'swarm-of-anglerfish', sourceId: 'events', weight: 12, minDay: 10, maxDay: undefined, cooldownDays: 38, maxAppearances: 1, dangerMin: 1, routeWeightBonuses: { left: 4 }, selectable: true },
      { id: 'whirlpool', sourceId: 'events', weight: 5, minDay: 12, maxDay: undefined, cooldownDays: 30, maxAppearances: 1, dangerMin: 1, routeWeightBonuses: { left: 1 }, selectable: true },
      { id: 'eerie-melody', sourceId: 'events', weight: 19, minDay: 13, maxDay: undefined, cooldownDays: 30, maxAppearances: 1, dangerMin: 2, routeWeightBonuses: { right: 7 }, selectable: true },
      { id: 'shark-men', sourceId: 'events', weight: 15, minDay: 15, maxDay: undefined, cooldownDays: 30, maxAppearances: 1, dangerMin: 2, routeWeightBonuses: { left: 5 }, selectable: true },
      { id: 'face-on-the-moon', sourceId: 'events', weight: 5, minDay: 17, maxDay: undefined, cooldownDays: 50, maxAppearances: 1, dangerMin: 3, routeWeightBonuses: { left: 1 }, selectable: true },
      { id: 'broken-boat', sourceId: 'events', weight: 0, minDay: 0, maxDay: undefined, cooldownDays: 0, maxAppearances: 0, dangerMin: 0, routeWeightBonuses: undefined, selectable: false },
      { id: 'the-handyman', sourceId: 'events', weight: 12, minDay: 20, maxDay: undefined, cooldownDays: 50, maxAppearances: 1, dangerMin: 2, routeWeightBonuses: { left: 8 }, selectable: true },
    ]);
  });

  it('uses the exact canonical choice IDs and stable item IDs for every event', () => {
    expect(Object.fromEntries(CANONICAL_EVENTS.map((entry) => [
      entry.id,
      entry.automatic ? [] : entry.choices.map(({ id, itemId }) => [id, itemId]),
    ]))).toEqual({
      'peaceful-night': [['sleep', undefined]],
      'shower-night': [['bucket', 'bucket'], ['umbrella', 'umbrella'], ['map', 'map'], ['sleep', undefined]],
      'windy-night': [['fishingNet', 'fishingNet'], ['map', 'map'], ['umbrella', 'umbrella'], ['sleep', undefined]],
      'bad-sleep': [['bucket', 'bucket'], ['flashlight', 'flashlight'], ['swimRing', 'swimRing'], ['umbrella', 'umbrella'], ['sleep', undefined]],
      thunderstorm: [['anchor', 'anchor'], ['bucket', 'bucket'], ['umbrella', 'umbrella'], ['sleep', undefined]],
      'check-the-back': [['yes', undefined], ['no', undefined]],
      'dangerous-waters': [['map', 'map'], ['compass', 'compass'], ['sleep', undefined]],
      'needs-direction': [['left', undefined], ['right', undefined]],
      'restless-waves': [['anchor', 'anchor'], ['swimRing', 'swimRing'], ['sleep', undefined]],
      leak: [['ductTape', 'ductTape'], ['bucket', 'bucket'], ['map', 'map'], ['sleep', undefined]],
      'man-in-the-fog': [['compass', 'compass'], ['telescope', 'telescope'], ['flashlight', 'flashlight'], ['sleep', undefined]],
      'mystery-chest': [['yes', undefined], ['no', undefined]],
      seagull: [['shoo', undefined], ['cannedFood', 'cannedFood']],
      'midnight-tour': [['yes', undefined], ['no', undefined]],
      ghosts: [['flareGun', 'flareGun'], ['flashlight', 'flashlight'], ['sleep', undefined]],
      'school-of-fish': [['fishingNet', 'fishingNet'], ['bucket', 'bucket'], ['telescope', 'telescope'], ['sleep', undefined]],
      snatcher: [['telescope', 'telescope'], ['swimRing', 'swimRing'], ['fishingNet', 'fishingNet'], ['harpoonGun', 'harpoonGun'], ['sleep', undefined]],
      'chest-attack': [['fishingNet', 'fishingNet'], ['touch', undefined], ['sleep', undefined]],
      'death-stare': [['flashlight', 'flashlight'], ['umbrella', 'umbrella'], ['cannedFood', 'cannedFood'], ['harpoonGun', 'harpoonGun'], ['fishingNet', 'fishingNet'], ['sleep', undefined]],
      'swarm-of-anglerfish': [['fishingNet', 'fishingNet'], ['harpoonGun', 'harpoonGun'], ['flashlight', 'flashlight'], ['baitTin', 'baitTin'], ['sleep', undefined]],
      whirlpool: [['anchor', 'anchor'], ['swimRing', 'swimRing'], ['sleep', undefined]],
      'eerie-melody': [['bucket', 'bucket'], ['telescope', 'telescope'], ['umbrella', 'umbrella'], ['ductTape', 'ductTape'], ['sleep', undefined]],
      'shark-men': [['harpoonGun', 'harpoonGun'], ['swimRing', 'swimRing'], ['scubaSet', 'scubaSet'], ['sleep', undefined]],
      'face-on-the-moon': [['umbrella', 'umbrella'], ['telescope', 'telescope'], ['sleep', undefined]],
      'broken-boat': [],
      'the-handyman': [
        ['telescope', 'telescope'], ['flashlight', 'flashlight'], ['flareGun', 'flareGun'],
        ['harpoonGun', 'harpoonGun'], ['scubaSet', 'scubaSet'], ['medicalKit', 'medicalKit'],
        ['fishingNet', 'fishingNet'], ['bucket', 'bucket'], ['ductTape', 'ductTape'],
        ['energyBar', 'energyBar'], ['chest', 'chest'], ['anchor', 'anchor'],
        ['invalid-trade', 'any'], ['touch', undefined], ['sleep', undefined],
      ],
    });
  });

  it('preserves the high-risk documented outcome values and mutations', () => {
    expect(choice('check-the-back', 'yes').outcomes).toMatchObject([
      { weight: 500, effects: { resources: [{ resource: 'food', operation: 'add', value: 1 }] } },
      { weight: 50, effects: {} }, { weight: 1, effects: {} },
    ]);
    expect(choice('dangerous-waters', 'map').outcomes).toMatchObject([{ weight: 80 }, { weight: 20 }]);
    expect(choice('dangerous-waters', 'compass').outcomes).toMatchObject([{ weight: 50 }, { weight: 50 }]);
    expect(choice('dangerous-waters', 'sleep').outcomes[0]?.effects.resources).toContainEqual({ resource: 'hull', operation: 'subtract', value: { min: 25, max: 45 } });
    expect(choice('mystery-chest', 'yes').outcomes).toMatchObject([
      { weight: 80, effects: { items: [{ kind: 'gain', itemId: 'chest', quantity: 1 }] } },
      { weight: 30, effects: { resources: [{ resource: 'health', operation: 'subtract', value: 25 }] } },
    ]);
    expect(choice('school-of-fish', 'fishingNet').outcomes).toMatchObject([{ weight: 60 }, { weight: 40 }]);
    expect(choice('school-of-fish', 'bucket').outcomes).toMatchObject([{ weight: 50 }, { weight: 50 }]);
    expect(choice('school-of-fish', 'telescope').outcomes).toMatchObject([{ weight: 50 }, { weight: 50 }]);
    expect(choice('death-stare', 'umbrella').outcomes).toMatchObject([{ weight: 40 }, { weight: 50 }]);
    expect(choice('death-stare', 'cannedFood').outcomes).toMatchObject([{ weight: 66 }, { weight: 33 }]);
    expect(choice('death-stare', 'sleep').outcomes).toMatchObject([{ weight: 5 }, { weight: 85 }]);
    expect(choice('whirlpool', 'anchor').outcomes).toMatchObject([{ weight: 90 }, { weight: 10 }]);
    expect(choice('whirlpool', 'swimRing').outcomes).toMatchObject([{ weight: 50 }, { weight: 50 }]);
    expect(choice('whirlpool', 'sleep').outcomes).toMatchObject([
      { weight: 80 },
      { weight: 30, effects: { items: [{ kind: 'loseRandom', quantity: 2 }] } },
    ]);
    expect(choice('eerie-melody', 'sleep').outcomes).toMatchObject([{ weight: 60 }, { weight: 40 }]);
    expect(choice('shark-men', 'swimRing').outcomes).toMatchObject([{ weight: 85 }, { weight: 35 }]);
    expect(choice('shark-men', 'scubaSet').outcomes).toMatchObject([{ weight: 70 }, { weight: 36 }]);
    expect(choice('shark-men', 'sleep').outcomes).toMatchObject([{ weight: 80 }, { weight: 20 }]);
    expect(choice('face-on-the-moon', 'telescope').outcomes).toMatchObject([{ weight: 60 }, { weight: 40 }]);
    expect(choice('face-on-the-moon', 'sleep').outcomes).toMatchObject([{ weight: 100 }, { weight: 20 }]);
  });

  it('models dormant, automatic, damage, and deterministic trade rules without invented weights', () => {
    expect(event('seagull')).toMatchObject({ selectable: false, weight: 0, sourceNote: expect.stringMatching(/undocumented/i) });
    expect(event('chest-attack')).toMatchObject({
      selectable: false,
      weight: 0,
      sourceNote: expect.stringMatching(/undocumented/i),
      trigger: { itemId: 'chest', minAgeDays: 2 },
    });
    expect(event('mystery-chest')).toMatchObject({ forbiddenItems: ['chest'] });
    expect(event('midnight-tour')).toMatchObject({ forbiddenItems: ['chest'] });
    expect(event('broken-boat')).toMatchObject({
      selectable: false,
      automatic: true,
      trigger: { resource: 'hull', max: 10, chancePercentBase: 100 },
      automaticOutcome: { effects: { terminal: 'sunk' } },
    });
    expect(eventDamageMultiplier('night', 49)).toBe(1);
    expect(eventDamageMultiplier('night', 50)).toBe(2);
    expect(eventDamageMultiplier('day', 99)).toBe(1);

    const handyman = event('the-handyman');
    if (handyman.automatic) throw new Error('handyman must use choices');
    expect(handyman.choices.filter(({ trade }) => trade).map(({ itemId, trade }) => [itemId, trade])).toEqual([
      ['telescope', { receive: 'flashlight', fallbackFood: 1 }],
      ['flashlight', { receive: 'telescope', fallbackFood: 1 }],
      ['flareGun', { receive: 'harpoonGun', fallbackFood: 1 }],
      ['harpoonGun', { receive: 'flareGun', fallbackFood: 1 }],
      ['scubaSet', { receive: 'medicalKit', fallbackFood: 1 }],
      ['medicalKit', { receive: 'scubaSet', fallbackFood: 1 }],
      ['fishingNet', { receive: 'bucket', fallbackFood: 1 }],
      ['bucket', { receive: 'fishingNet', fallbackFood: 1 }],
      ['ductTape', { receive: 'energyBar', fallbackFood: 1 }],
      ['energyBar', { receive: 'ductTape', fallbackFood: 1 }],
      ['chest', { receive: 'anchor', fallbackFood: 1 }],
      ['anchor', { receive: 'chest', fallbackFood: 1 }],
    ]);
    expect(handyman.choices.filter(({ trade }) => trade).every(({ outcomes }) =>
      outcomes[0]?.effects.items?.[0]?.kind === 'lose')).toBe(true);
    expect(choice('the-handyman', 'invalid-trade').outcomes[0]?.effects.items).toEqual([
      { kind: 'loseEventTarget', quantity: 1 },
    ]);
    expect(choice('the-handyman', 'invalid-trade').outcomes[0]?.effects.resources).toEqual([
      { resource: 'food', operation: 'add', value: 1 },
    ]);
  });
});

describe('canonical event validation and audit', () => {
  it('rejects unknown item IDs, empty ordinary choices, and incomplete automatic events', () => {
    const base = event('shower-night');
    expect(() => validateCanonicalEvents([{ ...base, choices: [] } as unknown as CanonicalEventDefinition]))
      .toThrow(/choices.*empty/i);
    expect(() => validateCanonicalEvents([{ ...base, choices: [{ ...choice('shower-night', 'bucket'), itemId: 'unknown' }] } as unknown as CanonicalEventDefinition]))
      .toThrow(/unknown item/i);
    expect(() => validateCanonicalEvents([{ ...event('broken-boat'), automaticOutcome: undefined } as unknown as CanonicalEventDefinition]))
      .toThrow(/terminal outcome/i);
    expect(() => validateCanonicalEvents([{
      ...event('broken-boat'), choices: [choice('shower-night', 'bucket')],
    } as unknown as CanonicalEventDefinition])).toThrow(/automatic.*no choices/i);
  });

  it('classifies all included, story-excluded, and unsupported-undocumented events', () => {
    const eventAudit = PARITY_AUDIT.filter(({ kind }) => kind === 'event');
    expect(eventAudit.filter(({ classification }) => classification === 'included').map(({ runtimeId }) => runtimeId)).toEqual(includedIds);
    expect(eventAudit.filter(({ classification }) => classification === 'unsupported-undocumented').map(({ wikiName }) => wikiName)).toEqual([
      'Drifting Loot', 'Night Trader', 'Sleep Killer',
    ]);
    expect(eventAudit.filter(({ classification }) => classification === 'story-excluded').map(({ wikiName }) => wikiName)).toEqual([
      'Sinking Ship', 'Drifting Bottle', 'Flowers', 'Distant Ship/Airplane/Hope', 'Helicopter',
      'Red', 'Ghost Ship', 'Mirror', 'Kraken/The One', 'Found Land', 'Sick Companion',
      'Guarded Sleep', 'Shadow Figure', 'Sea Watcher',
    ]);
  });
});

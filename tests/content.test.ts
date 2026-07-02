import { describe, it, expect } from 'vitest';
import { ITEMS } from '../src/content/items';
import { CREWMATES, CREWMATE_LIST } from '../src/content/crewmates';
import { NIGHT_EVENTS } from '../src/content/nightEvents';

describe('content tables', () => {
  it('items has the 10 MVP items plus food', () => {
    for (const id of ['anchor', 'flareGun', 'flashlight', 'ductTape', 'bucket', 'bait', 'fishingRod', 'firstAidKit', 'harpoonGun', 'spyglass', 'food']) {
      expect(ITEMS[id], `missing ${id}`).toBeDefined();
    }
  });
  it('crewmates has frederik and row with correct perks', () => {
    expect(CREWMATE_LIST.map((c) => c.id).sort()).toEqual(['frederik', 'row']);
    expect(CREWMATES.frederik.repairBonus).toBe(5);
    expect(CREWMATES.frederik.guaranteesBait).toBe(true);
    expect(CREWMATES.row.monsterDamageMultiplier).toBe(0.5);
    expect(CREWMATES.row.monsterEvents).toContain('giantSquid');
    expect(CREWMATES.row.monsterEvents).toContain('eerieMelody');
  });
  it('night events has 4 MVP events with counters', () => {
    const ids = NIGHT_EVENTS.map((e) => e.id);
    expect(ids.sort()).toEqual(['eerieMelody', 'giantSquid', 'hope', 'leak']);
    const leak = NIGHT_EVENTS.find((e) => e.id === 'leak')!;
    expect(leak.validCounters).toContain('ductTape');
    expect(leak.failureCost.hull).toBeGreaterThan(0);
    const melody = NIGHT_EVENTS.find((e) => e.id === 'eerieMelody')!;
    expect(melody.worseWithItem).toBe('flashlight');
    const hope = NIGHT_EVENTS.find((e) => e.id === 'hope')!;
    expect(hope.validCounters).toContain('flareGun');
    expect(hope.isRescue).toBe(true);
  });
});

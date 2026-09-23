import { describe, expect, it } from 'vitest';
import { ITEM_DEFINITIONS, type ItemId } from '../src/game/ItemState';
import { SurvivalSession } from '../src/survival/SurvivalSession';
import { survivalEventById } from '../src/survival/eventCatalog';
import { eligibleEvents } from '../src/survival/eventSelection';
import { constellationItems, prepareStarryNightEvent, STARRY_NIGHT_ITEMS } from '../src/survival/starryNight';
import { createSurvivalSaveDocument, parseSurvivalSaveDocument } from '../src/survival/SurvivalSaveData';

function session() {
  return new SurvivalSession([{ type: 'carlitos', instanceId: 'carlitos-1' }, { type: 'knife', instanceId: 'knife-1' }], {
    seed: 715, initialEventId: 'starry-night',
    initial: { day: 4, health: 40, hunger: 30, energy: 0, food: 0 },
    initialCarlitos: { rest: 'exhausted', hunger: 0, unhappiness: 10 },
  });
}
const event = survivalEventById('starry-night')!;
const choices = (run: SurvivalSession) => prepareStarryNightEvent(event, run.snapshot()).choices;

describe('Starry Night', () => {
  // Importance: 95/100. The event must never offer or grant excluded equipment.
  it('limits rewards to the seven approved items', () => {
    expect(STARRY_NIGHT_ITEMS).toEqual([
      'cannedFood', 'baitTin', 'ductTape', 'compass', 'map', 'knife', 'energyBar',
    ]);
    for (const choiceId of ['flareGun', 'spyglass', 'flashlight', 'radio']) {
      expect(event.choices.some(({ id }) => id === choiceId)).toBe(false);
      expect(session().resolveEvent({ kind: 'choice', choiceId }).accepted).toBe(false);
    }
  });

  // Importance: 95/100. Each event must offer exactly two valid rewards.
  it('offers two distinct unowned weight-one items and sleep', () => {
    for (let seed = 0; seed < 100; seed++) {
      const items = constellationItems(seed, new Set(['knife', 'radio']));
      expect(items).toHaveLength(2);
      expect(new Set(items).size).toBe(2);
      expect(items.every((id) => ITEM_DEFINITIONS[id].weight === 1 && id !== 'knife' && id !== 'radio')).toBe(true);
    }
    expect(choices(session())).toHaveLength(3);
    expect(event.weather).toEqual(['calm']);
  });

  it('awards exactly the selected item once without restoring the crew', () => {
    for (const choice of choices(session()).filter(({ id }) => id !== 'sleep')) {
      const run = session();
      const before = run.snapshot();
      expect(run.resolveEvent({ kind: 'choice', choiceId: choice.id }).accepted).toBe(true);
      expect(Object.values(run.snapshot().inventory)).toContainEqual({
        instanceId: choice.id + '-1', type: choice.id, condition: 'usable',
      });
      expect(run.snapshot()).toMatchObject({ health: 40, hunger: 30, energy: 0, carlitos: before.carlitos });
      const after = run.snapshot();
      expect(run.resolveEvent({ kind: 'choice', choiceId: choice.id }).accepted).toBe(false);
      expect(run.snapshot().inventory).toEqual(after.inventory);
    }
  });

  it('rejects an item outside the displayed choices', () => {
    expect(session().resolveEvent({ kind: 'choice', choiceId: 'knife' }).accepted).toBe(false);
  });

  it('keeps choices and rewards through a save round trip', () => {
    const run = session();
    const document = createSurvivalSaveDocument({ scavengeElapsedSeconds: 8, session: run.exportCheckpoint() });
    const parsed = parseSurvivalSaveDocument(JSON.parse(JSON.stringify(document)))!;
    expect(parsed).not.toBeNull();
    const restored = SurvivalSession.restore(parsed.checkpoint.session);
    expect(choices(restored).map(({ id }) => id)).toEqual(choices(run).map(({ id }) => id));
    const choiceId = choices(run)[0]!.id;
    expect(restored.resolveEvent({ kind: 'choice', choiceId })).toEqual(run.resolveEvent({ kind: 'choice', choiceId }));
  });

  // Importance: 95/100. An eligible event must have enough distinct rewards.
  it('requires two missing items before the event can appear', () => {
    const criteria = {
      phase: 'night' as const, day: 4, weather: 'calm' as const, lastEventId: null,
      lastSeenDay: new Map<string, number>(), targetableItemIds: new Set<ItemId>(),
      appearanceCounts: new Map<string, number>(), rescueLead: 0,
      inventoryItemIds: new Set(STARRY_NIGHT_ITEMS.slice(1)),
    };
    expect(eligibleEvents([event], criteria)).toHaveLength(0);
    expect(eligibleEvents([event], { ...criteria, inventoryItemIds: new Set(STARRY_NIGHT_ITEMS.slice(2)) })).toHaveLength(1);
  });

  it('grants nothing when sleeping and uses normal dawn rules', () => {
    const run = session();
    const before = run.snapshot();
    expect(run.resolveEvent({ kind: 'choice', choiceId: 'sleep' })).toMatchObject({ accepted: true, deltas: {} });
    expect(run.snapshot().inventory).toEqual(before.inventory);
    expect(run.beginDawn().accepted).toBe(true);
    expect(run.snapshot().hunger).toBeGreaterThan(before.hunger);
  });
});

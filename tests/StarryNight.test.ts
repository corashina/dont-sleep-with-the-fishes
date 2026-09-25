import { describe, expect, it } from 'vitest';
import { type ItemId } from '../src/game/ItemState';
import { SurvivalSession } from '../src/survival/SurvivalSession';
import { survivalEventById } from '../src/survival/eventCatalog';
import { eligibleEvents } from '../src/survival/eventSelection';
import { prepareStarryNightEvent, STARRY_NIGHT_ITEMS } from '../src/survival/starryNight';
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
});

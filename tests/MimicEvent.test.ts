// Importance: 95/100. Both choices must finish the night without losing the flashlight or blocking play.
import { describe, expect, it } from 'vitest';
import { SurvivalSession } from '../src/survival/SurvivalSession';
import { survivalEventById } from '../src/survival/eventCatalog';
import { presentationWeatherForEvent } from '../src/weather/presentationWeather';

describe('Mimic event', () => {
  it.each(['sleep', 'flashlight'])('resolves %s and keeps the boat and inventory intact', (choiceId) => {
    const session = new SurvivalSession([{ instanceId: 'flashlight-1', type: 'flashlight' }], {
      seed: 42, initial: { day: 15 }, initialEventId: 'mimic', radioSignalsEnabled: false,
    });
    const before = session.snapshot();
    const outcome = session.resolveEvent(choiceId === 'sleep'
      ? { kind: 'choice', choiceId }
      : { kind: 'item', choiceId, instanceId: 'flashlight-1' });
    expect(outcome.accepted).toBe(true);
    expect(outcome.eventResult?.eventId).toBe('mimic');
    expect(session.snapshot()).toMatchObject({ health: before.health, hull: before.hull, pendingEventId: null });
    expect(session.snapshot().inventory).toEqual(before.inventory);
  });

  it('is a repeatable night encounter with fog and an equipment-free exit', () => {
    const event = survivalEventById('mimic');
    expect(event).toMatchObject({ phase: 'night', earliestDay: 8, cooldownDays: 8 });
    expect(event?.choices.find(({ id }) => id === 'sleep')).toMatchObject({ id: 'sleep' });
    expect(event?.choices.find(({ id }) => id === 'sleep')?.itemId).toBeUndefined();
    expect(event?.choices.filter(choice => choice.itemId === undefined).map(choice => choice.id)).toEqual(['sleep']);
    expect(presentationWeatherForEvent('mimic')).toBe('fog');
  });
});

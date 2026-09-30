import { describe, expect, it } from 'vitest';
import { SURVIVAL_EVENTS } from '../src/survival/eventCatalog';
import { SurvivalSession } from '../src/survival/SurvivalSession';
import { validateSurvivalEventCatalog } from '../src/survival/eventCatalogValidation';
import type { ItemInstanceId } from '../src/game/ItemState';
import { reactionResultLabel } from '../src/i18n/eventReactionMessages';
import { formatJournalEntry } from '../src/survival/journal';
import { setLanguage } from '../src/i18n/language';

const replacements = [
  ['dangerous-waters', 'spyglass', 0, 'pressure', 1],
  ['whirlpool', 'map', 0, 'hull', -5],
  ['shower-night', 'sleep', 1, 'health', -10],
  ['bad-sleep', 'sleep', 0, 'pressure', 1],
  ['thunderstorm', 'anchor', 1, 'hull', -10],
  ['ocean-of-blood', 'sleep', 0, 'pressure', 1],
  ['ghosts', 'flashlight', 1, 'pressure', 2],
  ['ghosts', 'sleep', 0, 'pressure', 1],
  ['ghosts', 'sleep', 1, 'pressure', 2],
  ['eerie-melody', 'radio', 0, 'pressure', 1],
  ['eerie-melody', 'sleep', 0, 'pressure', 2],
  ['face-on-the-moon', 'bucket', 0, 'pressure', 1],
  ['face-on-the-moon', 'umbrella', 0, 'pressure', 1],
  ['face-on-the-moon', 'sleep', 0, 'pressure', 2],
  ['face-on-the-moon', 'sleep', 1, 'pressure', 1],
  ['midnight-tour', 'visit', 1, 'health', -10],
  ['other-people', 'radio', 0, 'pressure', 1],
  ['something-under-us', 'sleep', 0, 'pressure', 1],
] as const;

// Importance: 95/100. Event choices must not change hunger-based dawn energy.
describe('event dawn penalties', () => {
  it.each(replacements)('replaces %s/%s outcome %s and preserves hunger tiers after saving',
    (eventId, choiceId, index, resource, amount) => {
      const event = SURVIVAL_EVENTS.find(event => event.id === eventId)!;
      const choice = event.choices.find(choice => choice.id === choiceId)!;
      const instanceId = `${choice.itemId}-1` as ItemInstanceId;
      for (const [hunger, energy] of [[0, 3], [50, 2], [75, 1]]) {
        const session = new SurvivalSession(choice.itemId ? [{ type: choice.itemId, instanceId }] : [], {
          seed: 41, initialEventId: eventId, initial: { day: 20, hunger, pressure: 0 },
        });
        const response = { choiceId, resultId: choice.outcomes[index]!.resultId };
        const outcome = session.resolveEvent(choice.itemId
          ? { ...response, kind: 'item', instanceId } : { ...response, kind: 'choice' });
        expect(outcome).toMatchObject({ accepted: true, deltas: { [resource]: amount } });
        const restored = SurvivalSession.restore(session.exportCheckpoint());
        expect(restored.beginDawn().accepted).toBe(true);
        expect(restored.snapshot().energy).toBe(energy);
        for (const language of ['en', 'pl', 'es-AR'] as const) {
          setLanguage(language);
          try {
            expect(reactionResultLabel(choice.outcomes[index]!)).not.toMatch(/dawn energy|energia rano|energía matinal/i);
            expect(formatJournalEntry(restored.snapshot().journalEntries.at(-1)!).nighttime).not.toBe('');
          } finally {
            setLanguage('en');
          }
        }
      }
    });

  it.each(['nextDawnEnergy', 'nextDawnEnergyReduction', 'maximumNextDawnEnergy'])(
    'rejects removed effect %s', field => {
      const event = SURVIVAL_EVENTS[0]!;
      const choice = event.choices[0]!;
      const effects = { ...choice.outcomes[0]!.effects, [field]: 1 };
      expect(() => validateSurvivalEventCatalog([{ ...event, choices: [{ ...choice,
        outcomes: [{ ...choice.outcomes[0]!, effects }],
      }] }])).toThrow();
    });

  it('has no event-based dawn energy effects', () => {
    const combined: string[] = [];
    for (const event of SURVIVAL_EVENTS) {
      for (const choice of event.choices) {
        for (const outcome of choice.outcomes) {
          const effects = outcome.effects;
          const dawnPenalty = ['nextDawnEnergy', 'nextDawnEnergyReduction', 'maximumNextDawnEnergy']
            .some(key => key in effects);
          if (dawnPenalty) combined.push(outcome.resultId!);
        }
      }
    }
    expect(combined).toEqual([]);
  });

  it('keeps fog damage and restores normal energy at dawn', () => {
    const session = new SurvivalSession([{ type: 'flashlight', instanceId: 'flashlight-1' }], {
      seed: 41, initialEventId: 'monster-in-the-fog',
      initial: { day: 20, energy: 0, hunger: 0 },
    });
    const result = session.resolveEvent({
      kind: 'item', choiceId: 'flashlight', instanceId: 'flashlight-1',
      resultId: 'monster-in-the-fog.flashlight.1',
    });
    expect(result).toMatchObject({ accepted: true, deltas: { hull: -20, pressure: 2 } });
    expect(result).not.toHaveProperty('nextDawnEnergy');
    expect(session.beginDawn().accepted).toBe(true);
    expect(session.snapshot().energy).toBe(3);
  });
});

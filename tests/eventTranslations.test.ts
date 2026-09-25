import { beforeEach, describe, expect, it } from 'vitest';
import { initializeLanguage, setLanguage } from '../src/i18n/language';
import {
  getEventResultMessage,
  SURVIVAL_EVENTS,
  survivalEventById,
} from '../src/survival/eventCatalog';

beforeEach(() => initializeLanguage(null));

describe('event translations', () => {

  // Importance: 95/100. Catalog fields must remain translated through their production getters.
  it('covers every event field in all languages', () => {
    const fallbackEvents = [
      survivalEventById('day-calm-fallback')!,
    ];
    const events = [...SURVIVAL_EVENTS, ...fallbackEvents];
    const readText = () => events.flatMap((event) => [
      event.title,
      event.revealText,
      event.prompt,
      ...event.choices.flatMap((choice) => [
        choice.label,
        ...choice.outcomes.map(({ message }) => message),
      ]),
    ]);

    const english = readText();
    setLanguage('pl');
    const polish = readText();

    expect(english).toHaveLength(polish.length);
    expect(english.every((text) => text.trim().length > 0)).toBe(true);
    expect(polish.every((text) => text.trim().length > 0)).toBe(true);
    expect(polish.every((text, index) => text !== english[index] || text === 'Kraken')).toBe(true);
    setLanguage('es-AR');
    const spanish = readText();
    expect(spanish).toHaveLength(english.length);
    expect(spanish.every(text => text.trim().length > 0)).toBe(true);
    expect(survivalEventById('dangerous-waters')!.title).toBe('Aguas peligrosas');
    expect(survivalEventById('dangerous-waters')!.choices.find(({ id }) => id === 'map')!.label).toBe('Usá el mapa');
  });

  it('assigns stable result IDs and resolves saved outcome text', () => {
    for (const event of SURVIVAL_EVENTS) {
      for (const choice of event.choices) {
        const resultIds = choice.outcomes.map(({ resultId }) => resultId);
        expect(resultIds.every((resultId) => resultId !== undefined), `${event.id}.${choice.id}`)
          .toBe(true);
        expect(new Set(resultIds).size, `${event.id}.${choice.id}`).toBe(resultIds.length);
      }
    }

    const reference = {
      eventId: 'midnight-tour',
      choiceId: 'visit',
      resultId: 'tour-attack',
    };
    expect(getEventResultMessage(reference)).toBe('Something jumps from the palms.');
    setLanguage('pl');
    expect(getEventResultMessage(reference)).toBe('Coś wyskakuje spomiędzy palm.');
    expect(() => getEventResultMessage({ ...reference, resultId: 'missing' }))
      .toThrow(/Unknown event result/);
  });

});

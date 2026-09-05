import { beforeEach, describe, expect, it } from 'vitest';
import { eventTranslationCount } from '../src/i18n/eventMessages';
import { initializeLanguage, setLanguage } from '../src/i18n/language';
import {
  getEventResultMessage,
  SURVIVAL_EVENTS,
  survivalEventById,
} from '../src/survival/eventCatalog';
import { validateSurvivalEventCatalog } from '../src/survival/eventCatalogValidation';

beforeEach(() => initializeLanguage(null));

describe('event translations', () => {
  it('updates an existing event definition after the language changes', () => {
    const event = survivalEventById('dangerous-waters')!;
    const choice = event.choices[0]!;
    const outcome = choice.outcomes[0]!;

    expect(event.title).toBe('Dangerous Waters');
    expect(event.revealText).toContain('Jagged rocks');
    expect(choice.label).toBe('Use Map');
    expect(outcome.message).toContain('clear channel');

    setLanguage('pl');

    expect(survivalEventById(event.id)).toBe(event);
    expect(event.title).toBe('Niebezpieczne wody');
    expect(event.revealText).toContain('Poszarpane skały');
    expect(choice.label).toBe('Użyj mapy');
    expect(outcome.message).toContain('bezpieczny przesmyk');
  });

  it('covers every event field in both languages', () => {
    const fallbackEvents = [
      survivalEventById('day-calm-fallback')!,
      survivalEventById('night-calm-fallback')!,
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

    expect(eventTranslationCount()).toBeGreaterThan(150);
    expect(english).toHaveLength(polish.length);
    expect(english.every((text) => text.trim().length > 0)).toBe(true);
    expect(polish.every((text) => text.trim().length > 0)).toBe(true);
    expect(polish.every((text, index) => text !== english[index])).toBe(true);
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

  it('keeps the translated event catalog valid', () => {
    expect(() => validateSurvivalEventCatalog(SURVIVAL_EVENTS)).not.toThrow();
    setLanguage('pl');
    expect(() => validateSurvivalEventCatalog(SURVIVAL_EVENTS)).not.toThrow();
  });
});

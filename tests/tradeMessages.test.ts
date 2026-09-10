import { afterEach, describe, expect, it } from 'vitest';
import { setLanguage } from '../src/i18n/language';
import {
  handymanTradeLabel,
} from '../src/i18n/tradeMessages';

afterEach(() => setLanguage('en'));

describe('trade messages', () => {
  it('keeps the Handyman reward hidden in each language', () => {
    const labels = [
      ['en', 'Offer ANCHOR'],
      ['pl', 'Oddaj KOTWICA'],
      ['es-AR', 'Ofrecer ANCLA'],
    ] as const;

    for (const [language, expected] of labels) {
      setLanguage(language);
      expect(handymanTradeLabel('anchor')).toBe(expected);
      expect(handymanTradeLabel('anchor')).not.toContain('SCUBA');
    }
  });

});

import { afterEach, describe, expect, it } from 'vitest';
import { setLanguage } from '../src/i18n/language';
import {
  handymanTradeLabel,
  traderOfferLabel,
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

  it('names the trader reward and exact resource price', () => {
    setLanguage('en');
    expect(traderOfferLabel('scubaSet', 'food', 3)).toBe('Buy SCUBA GEAR — 3 food');

    setLanguage('pl');
    expect(traderOfferLabel('ductTape', 'bait', 1)).toBe('Kup TAŚMA KLEJĄCA — 1 porcja przynęty');

    setLanguage('es-AR');
    expect(traderOfferLabel('energyBar', 'food', 1)).toBe('Comprar BARRA ENERGÉTICA — 1 porción de comida');
  });
});

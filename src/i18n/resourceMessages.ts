import { getLanguage } from './language';
import { defineMessages } from './messages';

const pluralRules = { en: new Intl.PluralRules('en'), pl: new Intl.PluralRules('pl') };
const numbers = { en: new Intl.NumberFormat('en'), pl: new Intl.NumberFormat('pl'), 'es-AR': new Intl.NumberFormat('es-AR') };

function polishCount(quantity: number, one: string, few: string, many: string): string {
  const form = pluralRules.pl.select(quantity);
  return `${numbers.pl.format(quantity)} ${form === 'one' ? one : form === 'few' ? few : many}`;
}

const t = defineMessages({
  food: { en: (quantity: number) => `${numbers.en.format(quantity)} food`, pl: (quantity: number) => polishCount(quantity, 'porcja jedzenia', 'porcje jedzenia', 'porcji jedzenia'), 'es-AR': (quantity: number) => `${numbers['es-AR'].format(quantity)} ${quantity === 1 ? 'porción' : 'porciones'} de comida` },
  bait: { en: (quantity: number) => `${numbers.en.format(quantity)} bait`, pl: (quantity: number) => polishCount(quantity, 'porcja przynęty', 'porcje przynęty', 'porcji przynęty'), 'es-AR': (quantity: number) => `${numbers['es-AR'].format(quantity)} ${quantity === 1 ? 'porción' : 'porciones'} de carnada` },
});

export function resourceQuantity(resource: 'food' | 'bait', quantity: number): string {
  return t(resource, quantity);
}

export function formatDomainNumber(quantity: number): string {
  return numbers[getLanguage()].format(quantity);
}

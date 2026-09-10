import type { ItemId } from '../game/ItemState';
import { itemLabel } from './itemMessages';
import { defineMessages } from './messages';

const t = defineMessages({
  handymanOffer: {
    en: (item: string) => `Offer ${item}`,
    pl: (item: string) => `Oddaj ${item}`,
    'es-AR': (item: string) => `Ofrecer ${item}`,
  },
});

export function handymanTradeLabel(payment: ItemId): string {
  return t('handymanOffer', itemLabel(payment));
}

import type { ItemId } from '../game/ItemState';
import type { TraderPaymentResource } from '../survival/tradeRules';
import { itemLabel } from './itemMessages';
import { defineMessages } from './messages';
import { resourceQuantity } from './resourceMessages';

const t = defineMessages({
  handymanOffer: {
    en: (item: string) => `Offer ${item}`,
    pl: (item: string) => `Oddaj ${item}`,
    'es-AR': (item: string) => `Ofrecer ${item}`,
  },
  traderOffer: {
    en: (item: string, price: string) => `Buy ${item} — ${price}`,
    pl: (item: string, price: string) => `Kup ${item} — ${price}`,
    'es-AR': (item: string, price: string) => `Comprar ${item} — ${price}`,
  },
});

export function handymanTradeLabel(payment: ItemId): string {
  return t('handymanOffer', itemLabel(payment));
}

export function traderOfferLabel(
  itemId: ItemId,
  payment: TraderPaymentResource,
  price: 1 | 3,
): string {
  return t('traderOffer', itemLabel(itemId), resourceQuantity(payment, price));
}

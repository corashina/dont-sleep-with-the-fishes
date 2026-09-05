import { ITEM_IDS, type ItemId } from '../game/ItemState';
import { itemDescription } from '../i18n/itemMessages';

export const SURVIVAL_ITEM_DESCRIPTIONS = Object.freeze(Object.defineProperties({}, Object.fromEntries(
  ITEM_IDS.map((id) => [id, { enumerable: true, get: () => itemDescription(id) }]),
)) as Record<ItemId, string>);

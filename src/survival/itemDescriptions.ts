import { RUNTIME_ITEM_IDS, runtimeItemDefinition } from '../canonical/items';
import type { ItemId } from '../game/ItemState';

export const SURVIVAL_ITEM_DESCRIPTIONS = Object.fromEntries(
  RUNTIME_ITEM_IDS.map((id) => [id, runtimeItemDefinition(id).description]),
) as Readonly<Record<ItemId, string>>;

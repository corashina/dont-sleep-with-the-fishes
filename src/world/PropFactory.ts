import type { ItemInstance } from '../game/ItemState';
import type {
  PropModelLibrary,
  PropPresentation,
} from './PropModelLibrary';

export function createProp(
  models: PropModelLibrary,
  instance: ItemInstance,
): PropPresentation {
  return models.createPresentation(instance);
}

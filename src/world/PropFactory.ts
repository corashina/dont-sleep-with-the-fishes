import type { Group } from 'three';
import type { ItemInstance } from '../game/ItemState';
import type { PropModelLibrary } from './PropModelLibrary';

export function createProp(models: PropModelLibrary, instance: ItemInstance): Group {
  return models.create(instance);
}

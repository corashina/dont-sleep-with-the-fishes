import { BoxGeometry, Color, Group, Mesh, MeshStandardMaterial } from 'three';
import { ITEM_IDS, type ItemId } from '../../src/game/ItemState';
import { PropModelLibrary } from '../../src/world/PropModelLibrary';

export function createTestPropModels(): PropModelLibrary {
  const templates = new Map<ItemId, Group>(ITEM_IDS.map((id, index) => {
    const root = new Group();
    root.add(new Mesh(
      new BoxGeometry(0.2 + index * 0.01, 0.2, 0.2),
      new MeshStandardMaterial({
        color: new Color().setHSL(index / ITEM_IDS.length, 0.55, 0.5),
      }),
    ));
    return [id, root];
  }));

  return PropModelLibrary.fromTemplatesForTest(templates);
}

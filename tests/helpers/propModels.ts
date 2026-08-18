import { BoxGeometry, Color, Group, Mesh, MeshStandardMaterial, type Object3D } from 'three';
import { ITEM_IDS, type ItemId } from '../../src/game/ItemState';
import type { LifeboatEquipmentId } from '../../src/world/lifeboatEquipmentManifest';
import type { PracticalLightModelId } from '../../src/world/practicalLightModelManifest';
import {
  EVENT_MODEL_IDS,
  type EventModelId,
} from '../../src/world/eventModelManifest';
import { PropModelLibrary } from '../../src/world/PropModelLibrary';

export function createTestPropModels(): PropModelLibrary {
  const staticItemCount = ITEM_IDS.filter((id) => id !== 'carlitos').length;
  const template = (id: string, index: number): Group => {
    const root = new Group();
    const model = new Group();
    model.name = `model:${id}`;
    model.position.set(0.31, -0.27, 0.19);
    model.rotation.set(0.23, -0.41, 0.17);
    model.scale.setScalar(0.37);
    model.add(new Mesh(
      new BoxGeometry(0.2 + index * 0.01, 0.2, 0.2),
      new MeshStandardMaterial({
        color: new Color().setHSL(index / ITEM_IDS.length, 0.55, 0.5),
      }),
    ));
    if (id === 'scubaSet') {
      const goggles = new Group();
      goggles.name = 'scubaSet:scubaGoggles';
      const glasses = new Mesh(
        new BoxGeometry(0.3, 0.15, 0.08),
        new MeshStandardMaterial({ color: 0x263c3d }),
      );
      glasses.name = 'glasses25.001';
      goggles.add(glasses);
      model.add(goggles);
    }
    root.add(model);
    return root;
  };
  const itemTemplates = new Map<ItemId, Group>(ITEM_IDS.map((id, index) => [
    id,
    template(id, index),
  ]));
  const equipmentTemplates = new Map<LifeboatEquipmentId, Group>([
    ['fishingRod', template('fishingRod', staticItemCount)],
    ['hammer', template('hammer', staticItemCount)],
  ]);
  const practicalLightTemplates = new Map<PracticalLightModelId, Group>([
    ['lantern', template('lantern', staticItemCount + 1)],
    ['ceilingLight', template('ceilingLight', staticItemCount + 2)],
  ]);
  const eventTemplates = new Map<EventModelId, Group>(EVENT_MODEL_IDS.map((id, index) => [
    id,
    template(id, staticItemCount + 3 + index),
  ]));

  return PropModelLibrary.fromTemplatesForTest(
    itemTemplates,
    equipmentTemplates,
    practicalLightTemplates,
    new Map(),
    eventTemplates,
  );
}

export function testPropModel(root: Object3D): Object3D {
  const model = root.children[0];
  if (!model) throw new Error('Expected normalized test model child');
  return model;
}

export const TEST_PROP_MODEL_TRANSFORM = {
  position: [0.31, -0.27, 0.19],
  rotation: [0.23, -0.41, 0.17],
  scale: [0.37, 0.37, 0.37],
} as const;

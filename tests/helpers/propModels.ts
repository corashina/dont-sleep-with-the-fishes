import {
  AnimationClip,
  BoxGeometry,
  Color,
  Group,
  Mesh,
  MeshStandardMaterial,
  type Object3D,
} from 'three';
import { ITEM_IDS, type ItemId } from '../../src/game/ItemState';
import type { LifeboatEquipmentId } from '../../src/world/lifeboatEquipmentManifest';
import type { PracticalLightModelId } from '../../src/world/practicalLightModelManifest';
import {
  EVENT_MODEL_IDS,
  type EventModelId,
} from '../../src/world/eventModelIds';
import { PropModelLibrary } from '../../src/world/PropModelLibrary';

export function createTestPropModels(): PropModelLibrary {
  const equipmentTemplateIndex = 18;
  const practicalLightTemplateIndex = 19;
  const eventTemplateIndex = 21;
  const template = (id: string, index: number): Group => {
    const root = new Group();
    const model = new Group();
    model.name = `model:${id}`;
    model.position.set(0.31, -0.27, 0.19);
    model.rotation.set(0.23, -0.41, 0.17);
    model.scale.setScalar(0.37);
    if (id === 'midnightPalmTrees') {
      for (let palmIndex = 0; palmIndex < 5; palmIndex += 1) {
        const palm = new Group();
        const height = 1 + palmIndex * 0.1;
        palm.name = `PalmTree_${palmIndex + 1}`;
        palm.position.x = palmIndex * 0.4;
        const mesh = new Mesh(
          new BoxGeometry(0.12, height, 0.12),
          new MeshStandardMaterial({ color: 0x31552d }),
        );
        mesh.position.y = height / 2;
        palm.add(mesh);
        model.add(palm);
      }
    } else {
      model.add(new Mesh(
        new BoxGeometry(0.2 + index * 0.01, 0.2, 0.2),
        new MeshStandardMaterial({
          color: new Color().setHSL(index / ITEM_IDS.length, 0.55, 0.5),
        }),
      ));
    }
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
    ['fishingRod', template('fishingRod', equipmentTemplateIndex)],
    ['hammer', template('hammer', equipmentTemplateIndex)],
    ['pillow', template('pillow', equipmentTemplateIndex)],
  ]);
  const practicalLightTemplates = new Map<PracticalLightModelId, Group>([
    ['lantern', template('lantern', practicalLightTemplateIndex)],
    ['ceilingLight', template('ceilingLight', practicalLightTemplateIndex + 1)],
  ]);
  const eventTemplates = new Map<EventModelId, Group>(EVENT_MODEL_IDS.map((id, index) => [
    id,
    template(id, eventTemplateIndex + index),
  ]));
  const eventAnimations = new Map<EventModelId, readonly AnimationClip[]>([[
    'midnightMonster',
    [
      new AnimationClip('CharacterArmature|Idle', 1),
      new AnimationClip('CharacterArmature|Idle_Attack', 1),
    ],
  ]]);

  return PropModelLibrary.fromTemplatesForTest(
    itemTemplates,
    equipmentTemplates,
    practicalLightTemplates,
    new Map(),
    eventTemplates,
    eventAnimations,
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

import {
  BufferGeometry,
  Group,
  Material,
  Mesh,
  SpotLight,
} from 'three';
import {
  collectMeshResources,
  disposeResourceSets,
  runCleanupSteps,
} from './SceneResources';

export interface ShipRoomLights {
  readonly root: Group;
  dispose(): void;
}

interface LampPlacement {
  readonly name: string;
  readonly x: number;
  readonly z: number;
}

const CEILING_Y = 5.56;
const LAMP_PLACEMENTS: readonly LampPlacement[] = [
  { name: 'crew-cabin', x: 0, z: 8.7 },
  { name: 'wheelhouse', x: -0.36, z: 15.3 },
  { name: 'storage-workroom', x: 0.38, z: -10.7 },
];

export function createShipRoomLights(model?: Group): ShipRoomLights {
  const root = new Group();
  root.name = 'ship-room-lights';
  const geometries = new Set<BufferGeometry>();
  const materials = new Set<Material>();
  if (model) collectMeshResources(model, geometries, materials);

  const lights: SpotLight[] = [];
  for (const [index, placement] of LAMP_PLACEMENTS.entries()) {
    const fixture = new Group();
    fixture.name = `room-lamp:${placement.name}`;
    fixture.position.set(placement.x, CEILING_Y, placement.z);

    if (model) {
      const fixtureModel = index === 0 ? model : model.clone(true);
      fixtureModel.name = `${fixture.name}:model`;
      fixtureModel.traverse((object) => {
        if (!(object instanceof Mesh)) return;
        object.castShadow = true;
        object.receiveShadow = true;
      });
      fixture.add(fixtureModel);
    }

    const light = new SpotLight(0xffb96b, 18, 7, 1.02, 0.62, 2);
    light.name = `${fixture.name}:light`;
    light.position.y = -0.27;
    light.castShadow = true;
    light.shadow.mapSize.set(512, 512);
    light.shadow.camera.near = 0.2;
    light.shadow.camera.far = 7;
    light.shadow.bias = -0.0008;
    light.shadow.normalBias = 0.025;
    light.target.name = `${fixture.name}:target`;
    light.target.position.set(placement.x, 2.28, placement.z);
    light.shadow.camera.updateProjectionMatrix();
    fixture.add(light);
    root.add(fixture, light.target);
    lights.push(light);
  }

  let disposed = false;
  return {
    root,
    dispose: () => {
      if (disposed) return;
      disposed = true;
      runCleanupSteps([
        ...lights.map((light) => () => light.shadow.dispose()),
        () => disposeResourceSets(geometries, materials),
        () => root.clear(),
      ]);
    },
  };
}

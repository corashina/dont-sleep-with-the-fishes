import { describe, expect, it } from 'vitest';
import {
  AnimationClip,
  BufferGeometry,
  Float32BufferAttribute,
  Group,
  Mesh,
  MeshStandardMaterial,
  VectorKeyframeTrack,
} from 'three';
import { PropModelLibrary, type ItemModelLoader } from '../src/world/PropModelLibrary';
import { ITEM_MODEL_SPECS } from '../src/world/itemModelManifest';

function modelWithoutNormals(): Group {
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute([
    0, 0, 0,
    1, 0, 0,
    0, 1, 0,
  ], 3));
  const root = new Group();
  root.add(new Mesh(geometry, new MeshStandardMaterial({ color: 0x888888 })));
  return root;
}

describe('PropModelLibrary normals', () => {
  it('generates missing normals for lit prop materials', async () => {
    const loader: ItemModelLoader = {
      load: async (url) => ({
        scene: modelWithoutNormals(),
        animations: url === ITEM_MODEL_SPECS.captainWhiskers.url
          ? [new AnimationClip('CaptainWhiskersIdle', 1, [
            new VectorKeyframeTrack('.position', [0, 1], [0, 0, 0, 0, 0, 0]),
          ])]
          : [],
      }),
    };
    const library = await PropModelLibrary.load(loader);

    const bucket = library.create({ instanceId: 'bucket-1', type: 'bucket' });
    const mesh = bucket.getObjectByProperty('isMesh', true) as Mesh;
    const normals = mesh.geometry.getAttribute('normal');

    expect(normals).toBeDefined();
    expect(normals.count).toBe(3);
    expect([normals.getX(0), normals.getY(0), normals.getZ(0)]).toEqual([0, 0, 1]);

    library.dispose();
  });
});

// Importance: 8/10 (scaled from 4/5). Protects shared texture ownership.
import { describe, expect, it, vi } from 'vitest';
import {
  AnimationClip,
  Bone,
  BoxGeometry,
  BufferGeometry,
  Float32BufferAttribute,
  Group,
  Mesh,
  MeshStandardMaterial,
  NumberKeyframeTrack,
  Skeleton,
  SkinnedMesh,
  Texture,
  Uint16BufferAttribute,
} from 'three';
import type { ItemId } from '../src/game/ItemState';
import type { EventModelId } from '../src/world/eventModelIds';
import { CARLITOS_SITTING_IDLE_CLIP } from '../src/world/PropAnimation';
import {
  ItemModelLoadError,
  PropModelLibrary,
  type ItemModelLoader,
} from '../src/world/PropModelLibrary';

function staticTemplate(): Group {
  const root = new Group();
  root.add(new Mesh(new BoxGeometry(), new MeshStandardMaterial()));
  return root;
}

function skinnedTemplate(): Group {
  const geometry = new BoxGeometry();
  const vertexCount = geometry.getAttribute('position').count;
  const skinIndices = new Uint16Array(vertexCount * 4);
  const skinWeights = new Float32Array(vertexCount * 4);
  for (let index = 0; index < vertexCount; index += 1) skinWeights[index * 4] = 1;
  geometry.setAttribute('skinIndex', new Uint16BufferAttribute(skinIndices, 4));
  geometry.setAttribute('skinWeight', new Float32BufferAttribute(skinWeights, 4));
  const bone = new Bone();
  bone.name = 'HandMain';
  const mesh = new SkinnedMesh(geometry, new MeshStandardMaterial());
  mesh.add(bone);
  mesh.bind(new Skeleton([bone]));
  const root = new Group();
  root.add(mesh);
  return root;
}

function firstMesh(root: Group): Mesh<BufferGeometry, MeshStandardMaterial> {
  let result: Mesh<BufferGeometry, MeshStandardMaterial> | null = null;
  root.traverse((object) => {
    if (!result && object instanceof Mesh) {
      result = object as Mesh<BufferGeometry, MeshStandardMaterial>;
    }
  });
  if (!result) throw new Error('Expected event model mesh');
  return result;
}

describe('PropModelLibrary texture ownership', () => {
  it('disposes shared template textures exactly once', () => {
    const texture = new Texture();
    const material = new MeshStandardMaterial({ map: texture });
    const template = new Group();
    template.add(new Mesh(new BoxGeometry(), material));
    const library = PropModelLibrary.fromTemplatesForTest(
      new Map<ItemId, Group>([['cannedFood', template]]),
    );
    const textureDispose = vi.spyOn(texture, 'dispose');

    library.dispose();
    library.dispose();

    expect(textureDispose).toHaveBeenCalledOnce();
  });

  it('returns optional event clones with independent owned state', () => {
    const clip = new AnimationClip('HandWave', 1, [
      new NumberKeyframeTrack('HandMain.rotation[x]', [0, 1], [0, 0.4]),
    ]);
    const library = PropModelLibrary.fromTemplatesForTest(
      new Map<ItemId, Group>(),
      new Map(),
      new Map(),
      new Map(),
      new Map<EventModelId, Group>([['midnightIsland', skinnedTemplate()]]),
      new Map<EventModelId, readonly AnimationClip[]>([['midnightIsland', [clip]]]),
    );
    const libraryWithoutEventAssets = PropModelLibrary.fromTemplatesForTest(
      new Map<ItemId, Group>(),
    );

    const first = library.createEventModel('midnightIsland');
    const second = library.createEventModel('midnightIsland');

    expect(first).toMatchObject({ root: expect.any(Group) });
    expect(second).toMatchObject({ root: expect.any(Group) });
    expect(libraryWithoutEventAssets.createEventModel('midnightIsland')).toBeNull();
    const firstOwnedMesh = firstMesh(first!.root);
    const secondOwnedMesh = firstMesh(second!.root);
    const firstSkinnedMesh = firstOwnedMesh as unknown as SkinnedMesh;
    const secondSkinnedMesh = secondOwnedMesh as unknown as SkinnedMesh;
    expect(firstOwnedMesh.geometry).not.toBe(secondOwnedMesh.geometry);
    expect(firstOwnedMesh.material).not.toBe(secondOwnedMesh.material);
    expect(firstSkinnedMesh.skeleton).not.toBe(secondSkinnedMesh.skeleton);
    expect(firstSkinnedMesh.skeleton.bones[0])
      .not.toBe(secondSkinnedMesh.skeleton.bones[0]);
    expect(first!.animations[0]).not.toBe(second!.animations[0]);
    expect(first!.animations[0]!.tracks[0]).not.toBe(second!.animations[0]!.tracks[0]);
  });

  it('keeps loading when one optional event model fails', async () => {
    const loader: ItemModelLoader = {
      async load(url) {
        if (url.includes('/events/midnightIsland.glb')) {
          throw new Error('optional island missing');
        }
        const animations = url.includes('/items/carlitos.glb')
          ? [new AnimationClip(CARLITOS_SITTING_IDLE_CLIP, 1, [
            new NumberKeyframeTrack('.rotation[x]', [0, 1], [0, 0.1]),
          ])]
          : [];
        return { scene: staticTemplate(), animations };
      },
    };

    const library = await PropModelLibrary.load(loader);

    expect(library.createEventModel('midnightIsland')).toBeNull();
    expect(library.createEventModel('containerShip')).toMatchObject({
      root: expect.any(Group),
    });
    expect(library.createEventModel('midnightPalmTrees')).toMatchObject({
      root: expect.any(Group),
    });
  });

  it('keeps required item model failures fatal', async () => {
    const loader: ItemModelLoader = {
      async load(url) {
        if (url.includes('/items/cannedFood.glb')) throw new Error('required item missing');
        return { scene: staticTemplate(), animations: [] };
      },
    };

    await expect(PropModelLibrary.load(loader)).rejects.toEqual(expect.objectContaining({
      name: ItemModelLoadError.name,
      itemId: 'cannedFood',
    }));
  });
});

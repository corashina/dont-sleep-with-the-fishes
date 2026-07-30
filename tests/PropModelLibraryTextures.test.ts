// Importance: 4/5. Protects shared texture ownership.
import { describe, expect, it, vi } from 'vitest';
import {
  AnimationClip,
  BufferGeometry,
  BoxGeometry,
  Float32BufferAttribute,
  Group,
  Mesh,
  MeshStandardMaterial,
  NumberKeyframeTrack,
  Texture,
} from 'three';
import type { ItemId } from '../src/game/ItemState';
import { ITEM_IDS } from '../src/game/ItemState';
import {
  CAPTAIN_WHISKERS_IDLE_CLIP,
} from '../src/world/PropAnimation';
import {
  PropModelLibrary,
  type ItemModelLoader,
} from '../src/world/PropModelLibrary';
import { EVENT_MODEL_SPECS } from '../src/world/eventModelManifest';
import { ITEM_MODEL_SPECS } from '../src/world/itemModelManifest';
import {
  LIFEBOAT_EQUIPMENT_IDS,
  LIFEBOAT_EQUIPMENT_MODEL_SPECS,
} from '../src/world/lifeboatEquipmentManifest';
import {
  PRACTICAL_LIGHT_MODEL_IDS,
  PRACTICAL_LIGHT_MODEL_SPECS,
} from '../src/world/practicalLightModelManifest';

function modelRoot(name: string): Group {
  const geometry = new BufferGeometry();
  geometry.setAttribute(
    'position',
    new Float32BufferAttribute([0, 0, 0, 1, 0, 0, 0, 1, 0], 3),
  );
  const root = new Group();
  root.name = name;
  root.add(new Mesh(geometry, new MeshStandardMaterial()));
  return root;
}

const requiredModelUrls = new Set([
  ...ITEM_IDS.map((id) => ITEM_MODEL_SPECS[id].url),
  ...LIFEBOAT_EQUIPMENT_IDS.map((id) => LIFEBOAT_EQUIPMENT_MODEL_SPECS[id].url),
  ...PRACTICAL_LIGHT_MODEL_IDS.map((id) => PRACTICAL_LIGHT_MODEL_SPECS[id].url),
]);

function requiredAnimations(url: string): readonly AnimationClip[] {
  if (url !== ITEM_MODEL_SPECS.captainWhiskers.url) return [];
  return [new AnimationClip(CAPTAIN_WHISKERS_IDLE_CLIP, 1, [
    new NumberKeyframeTrack('.rotation[y]', [0, 1], [0, 0.2]),
  ])];
}

function loaderWithEventModel(
  shark: Group,
  animations: readonly AnimationClip[],
): ItemModelLoader {
  return {
    async load(url) {
      if (url === EVENT_MODEL_SPECS.sharkMenShark.url) {
        return { scene: shark, animations };
      }
      if (requiredModelUrls.has(url)) {
        return { scene: modelRoot(url), animations: requiredAnimations(url) };
      }
      throw new Error(`Unexpected model URL: ${url}`);
    },
  };
}

function loaderWithMissingEventModel(): ItemModelLoader {
  return {
    async load(url) {
      if (url === EVENT_MODEL_SPECS.sharkMenShark.url) {
        throw new Error('Shark Men model unavailable');
      }
      if (requiredModelUrls.has(url)) {
        return { scene: modelRoot(url), animations: requiredAnimations(url) };
      }
      throw new Error(`Unexpected model URL: ${url}`);
    },
  };
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

  it('clones the optional Shark Men model with its animation clips', async () => {
    const shark = modelRoot('shark-source');
    const swim = new AnimationClip('Swim', 1, [
      new NumberKeyframeTrack('.rotation[y]', [0, 1], [0, 0.2]),
    ]);
    const library = await PropModelLibrary.load(loaderWithEventModel(shark, [swim]));

    const eventModel = library.createEventModel('sharkMenShark');

    expect(eventModel?.root).not.toBe(shark);
    expect(eventModel?.animations.map(({ name }) => name)).toContain('Swim');
    library.dispose();
  });

  it('returns null when the optional Shark Men model cannot load', async () => {
    const library = await PropModelLibrary.load(loaderWithMissingEventModel());
    expect(library.createEventModel('sharkMenShark')).toBeNull();
    library.dispose();
  });
});

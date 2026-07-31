// Importance: 4/5. Protects shared texture ownership.
import { describe, expect, it, vi } from 'vitest';
import {
  BoxGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  Texture,
} from 'three';
import type { ItemId } from '../src/game/ItemState';
import { PropModelLibrary } from '../src/world/PropModelLibrary';

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
});

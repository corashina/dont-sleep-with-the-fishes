// Importance: 8/10. Protects the shared acquired and Drifting Chest model structure.
import { BoxGeometry, Group, Mesh, MeshStandardMaterial } from 'three';
import { describe, expect, it } from 'vitest';
import { ChestDisplay } from '../src/survival/ChestDisplay';

function driftingChestModel(): Group {
  const root = new Group();
  const base = new Mesh(new BoxGeometry(1, 0.5, 0.7), new MeshStandardMaterial());
  base.name = 'Chest_Base';
  const top = new Mesh(new BoxGeometry(1, 0.3, 0.7), new MeshStandardMaterial());
  top.name = 'Chest_Top';
  top.position.set(0, 0.4, -0.3);
  root.add(base, top);
  return root;
}

describe('ChestDisplay', () => {
  it('uses the Drifting Chest top as its animated imported lid', () => {
    const display = new ChestDisplay(driftingChestModel());

    expect(display.root.userData.modelKind).toBe('imported');
    expect(display.root.getObjectByName('chest-lid')
      ?.getObjectByName('Chest_Top')).toBeDefined();

    display.dispose();
  });
});

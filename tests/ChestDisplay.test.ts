// Importance: 8/10. Protects the shared acquired and Drifting Chest model structure.
import { BoxGeometry, Group, Mesh, MeshStandardMaterial } from 'three';
import { describe, expect, it } from 'vitest';
import {
  CHEST_DISAPPEAR_DURATION,
  CHEST_DISPLAY_SCALE,
  ChestDisplay,
} from '../src/survival/ChestDisplay';

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
    expect(display.root.scale.toArray()).toEqual([
      CHEST_DISPLAY_SCALE,
      CHEST_DISPLAY_SCALE,
      CHEST_DISPLAY_SCALE,
    ]);
    expect(display.root.position.toArray()).toEqual([0, 0.22, 2.15]);
    expect(display.root.getObjectByName('chest-lid')
      ?.getObjectByName('Chest_Top')).toBeDefined();

    display.dispose();
  });

  it('fades before hiding a consumed chest', () => {
    const display = new ChestDisplay(driftingChestModel());
    const base = display.root.getObjectByName('Chest_Base') as Mesh<
      BoxGeometry,
      MeshStandardMaterial
    >;

    display.sync({ state: 'closed', acquiredDay: 3 });
    display.sync({ state: 'none', acquiredDay: null });

    expect(display.root.visible).toBe(true);
    expect(display.root.userData.disappearing).toBe(true);

    display.update(CHEST_DISAPPEAR_DURATION / 2);

    expect(display.root.visible).toBe(true);
    expect(base.material.opacity).toBeGreaterThan(0);
    expect(base.material.opacity).toBeLessThan(1);
    expect(display.root.scale.x).toBeLessThan(CHEST_DISPLAY_SCALE);

    display.update(CHEST_DISAPPEAR_DURATION / 2);

    expect(display.root.visible).toBe(false);
    expect(display.root.userData.disappearing).toBe(false);
    expect(base.material.opacity).toBe(1);
    expect(display.root.scale.toArray()).toEqual([
      CHEST_DISPLAY_SCALE,
      CHEST_DISPLAY_SCALE,
      CHEST_DISPLAY_SCALE,
    ]);

    display.dispose();
  });
});

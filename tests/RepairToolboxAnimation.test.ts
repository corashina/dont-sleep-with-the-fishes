import { describe, expect, it, vi } from 'vitest';
import { BoxGeometry, Group, Mesh, MeshStandardMaterial } from 'three';
import { RepairToolboxAnimation, REPAIR_HAMMER_DURATION_SECONDS } from '../src/survival/RepairToolboxAnimation';
import { collectMeshResources, disposeMeshResources } from '../src/world/SceneResources';
import type { BufferGeometry, Material } from 'three';

function disposeBoat(boat: Group): void {
  const geometries = new Set<BufferGeometry>();
  const materials = new Set<Material>();
  collectMeshResources(boat, geometries, materials);
  disposeMeshResources(geometries, materials);
}

describe('repair toolbox animation', () => {
  it('starts sound once, then restores the hammer after completion or cancellation', async () => {
    const boat = new Group();
    const toolbox = new Group();
    toolbox.scale.setScalar(0.72);
    boat.add(toolbox);
    const hammer = new Mesh(new BoxGeometry(0.62, 0.07, 0.2), new MeshStandardMaterial());
    hammer.position.set(-0.12, 0.39, 0.01);
    toolbox.add(hammer);
    const rest = hammer.position.clone();
    const animation = new RepairToolboxAnimation(boat, toolbox, hammer);
    for (const cancel of [false, true]) {
      const audio = vi.fn();
      const pending = animation.play(audio);
      expect(hammer.visible).toBe(true);
      animation.update(0.54);
      expect(audio).not.toHaveBeenCalled();
      animation.update(0.02);
      expect(audio).toHaveBeenCalledOnce();
      if (cancel) animation.cancel();
      else animation.update(REPAIR_HAMMER_DURATION_SECONDS);
      await pending;
      expect(audio).toHaveBeenCalledOnce();
      expect(hammer.parent).toBe(toolbox);
      expect(hammer.position).toEqual(rest);
      expect(hammer.scale.x).toBeCloseTo(1);
      expect(hammer.visible).toBe(false);
    }
    disposeBoat(boat);
  });
});

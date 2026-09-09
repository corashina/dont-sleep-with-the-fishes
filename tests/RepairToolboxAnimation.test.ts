import { describe, expect, it, vi } from 'vitest';
import { BoxGeometry, Group, Mesh, MeshStandardMaterial, PerspectiveCamera, Raycaster, Texture, Vector3 } from 'three';
import { RepairToolboxAnimation, REPAIR_HAMMER_DURATION_SECONDS, REPAIR_HAMMER_PEAK_SECONDS } from '../src/survival/RepairToolboxAnimation';
import { createLifeboat } from '../src/world/Lifeboat';
import { LifeboatAssets } from '../src/world/LifeboatAssets';
import { collectMeshResources, disposeMeshResources } from '../src/world/SceneResources';
import type { BufferGeometry, Material } from 'three';

function disposeBoat(boat: Group): void {
  const geometries = new Set<BufferGeometry>();
  const materials = new Set<Material>();
  collectMeshResources(boat, geometries, materials);
  disposeMeshResources(geometries, materials);
}

describe('repair toolbox animation', () => {
  it('keeps the hammer in view and in front of boat geometry at each strike', () => {
    const assets = LifeboatAssets.fromTextures(new Texture(), new Texture(), new Texture());
    const boat = createLifeboat(assets).root;
    const toolbox = new Group();
    toolbox.position.set(-1.05, 0.225, 0.78);
    toolbox.rotation.y = -Math.PI / 2;
    toolbox.scale.setScalar(0.72);
    boat.add(toolbox);
    const hammer = new Group();
    hammer.position.set(-0.12, 0.39, 0.01);
    toolbox.add(hammer);
    const animation = new RepairToolboxAnimation(boat, toolbox, hammer);
    const camera = new PerspectiveCamera(60, 4 / 3, 0.01, 100);
    camera.position.set(0, 0.88, 1.56);
    camera.lookAt(0, 0.88, -1.55);
    camera.updateMatrixWorld(true);
    void animation.play();
    let elapsed = 0;
    for (const peak of REPAIR_HAMMER_PEAK_SECONDS) {
      animation.update(peak - elapsed);
      elapsed = peak;
      boat.updateMatrixWorld(true);
      const point = hammer.getWorldPosition(new Vector3());
      const projected = point.clone().project(camera);
      expect(Math.abs(projected.x)).toBeLessThan(0.85);
      expect(Math.abs(projected.y)).toBeLessThan(0.85);
      const distance = camera.position.distanceTo(point);
      const ray = new Raycaster(camera.position, point.clone().sub(camera.position).normalize(), 0, distance - 0.02);
      expect(ray.intersectObject(boat, true)).toHaveLength(0);
    }
    animation.cancel();
    disposeBoat(boat);
    assets.dispose();
  });

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

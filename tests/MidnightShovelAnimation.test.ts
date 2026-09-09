import { Group, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { MidnightShovelAnimation } from '../src/survival/MidnightShovelAnimation';
import { collectMeshResources, disposeMeshResources } from '../src/world/SceneResources';
import type { BufferGeometry, Material } from 'three';

function setup() {
  const model = new Group();
  const bladeTip = new Group();
  bladeTip.position.y = -0.625;
  model.add(bladeTip);
  const animation = new MidnightShovelAnimation(model, -0.625, new Vector3(4, 0.8, -12));
  return {
    animation, bladeTip,
    dispose: () => {
      const geometries = new Set<BufferGeometry>();
      const materials = new Set<Material>();
      collectMeshResources(animation.root, geometries, materials);
      disposeMeshResources(geometries, materials);
    },
  };
}

describe('Midnight Tour shovel', () => {
  it('plants the blade in the soil before lifting soil and adding it to the pile', () => {
    const rig = setup();
    const { animation, bladeTip } = rig;
    for (let stroke = 0; stroke < 3; stroke += 1) {
      animation.update(3 + (stroke + 0.2) * 2);
      expect(bladeTip.getWorldPosition(new Vector3()).y).toBeGreaterThan(1.4);
      animation.update(3 + (stroke + 0.4) * 2);
      const contact = bladeTip.getWorldPosition(new Vector3());
      expect(contact.y).toBeCloseTo(0.8 - 0.06);
      expect(contact.distanceTo(animation.root.position)).toBeLessThan(0.45);
      expect(animation.pose.contacts).toBe(stroke + 1);
      expect(animation.pose.excavation).toBeCloseTo(stroke / 3);
      animation.update(3 + (stroke + 0.72) * 2);
      expect(animation.pose.excavation).toBeCloseTo((stroke + 1) / 3);
      expect(animation.pose.deposit).toBeCloseTo(stroke / 3);
      expect(bladeTip.getWorldPosition(new Vector3()).y).toBeGreaterThan(1.1);
      animation.update(3 + (stroke + 1) * 2);
      expect(animation.pose.deposit).toBeCloseTo((stroke + 1) / 3);
    }
    rig.dispose();
  });

  it('releases soil without a position jump and returns smoothly between strokes', () => {
    const rig = setup();
    const { animation, bladeTip } = rig;
    const soil = animation.root.getObjectByName('midnight-tour-thrown-soil')!;
    for (let stroke = 0; stroke < 3; stroke += 1) {
      const release = 3 + (stroke + 0.82) * 2;
      animation.update(release - 0.00001);
      const positions = soil.children.map((clod) => clod.position.clone());
      animation.update(release + 0.00001);
      soil.children.forEach((clod, index) => {
        expect(clod.position.distanceTo(positions[index]!)).toBeLessThan(0.0001);
      });
      const end = 3 + (stroke + 1) * 2;
      animation.update(end - 0.00001);
      const before = bladeTip.getWorldPosition(new Vector3());
      animation.update(end + 0.00001);
      expect(before.distanceTo(bladeTip.getWorldPosition(new Vector3()))).toBeLessThan(0.0001);
    }
    animation.update(9.7);
    expect(animation.root.getObjectByName('midnight-tour-shovel-blade-pivot')!.visible).toBe(false);
    expect(soil.visible).toBe(false);
    rig.dispose();
  });
});

// Importance: 95/100. Protects GPU preparation for the Death Stare reveal and item lights.
import { describe, expect, it, vi } from 'vitest';
import {
  Group,
  Light,
  Mesh,
  MeshStandardMaterial,
  SphereGeometry,
} from 'three';
import { FlashlightBeam } from '../src/survival/FlashlightBeam';
import { DeathStarePresentation } from '../src/survival/events/DeathStarePresentation';

function modelInstance() {
  const root = new Group();
  root.add(new Mesh(new SphereGeometry(1, 4, 3), new MeshStandardMaterial()));
  return { root, dispose: vi.fn() };
}

describe('Death Stare performance preparation', () => {
  it('keeps its zero-strength point light visible while reveal meshes stay hidden', () => {
    const model = modelInstance();
    const presentation = new DeathStarePresentation({
      eventModels: { create: vi.fn(() => model) },
      sampleWorldWaveInto: vi.fn(),
    } as never);
    try {
      presentation.stage({
        eventId: 'death-stare',
        targetInstanceId: null,
        variantSeed: 1,
      });
      const visibleLights: Light[] = [];
      const visibleMeshes: Mesh[] = [];
      presentation.worldRoot.traverseVisible((object) => {
        if (object instanceof Light) visibleLights.push(object);
        if (object instanceof Mesh) visibleMeshes.push(object);
      });

      expect(visibleLights.map(({ name }) => name)).toContain(
        'death-stare-dominant-eye-light',
      );
      expect(visibleLights[0]!.intensity).toBe(0);
      expect(visibleMeshes).toHaveLength(0);
    } finally {
      presentation.dispose();
      model.root.traverse((object) => {
        if (!(object instanceof Mesh)) return;
        object.geometry.dispose();
        const materials = Array.isArray(object.material)
          ? object.material
          : [object.material];
        materials.forEach((material) => material.dispose());
      });
    }
  });

  it('keeps the inactive flashlight light visible for scene preparation', () => {
    const beam = new FlashlightBeam();
    try {
      const visibleLights: Light[] = [];
      const visibleMeshes: Mesh[] = [];
      beam.traverseVisible((object) => {
        if (object instanceof Light) visibleLights.push(object);
        if (object instanceof Mesh) visibleMeshes.push(object);
      });

      expect(visibleLights).toHaveLength(1);
      expect(visibleLights[0]!.intensity).toBe(0);
      expect(visibleMeshes).toHaveLength(0);
    } finally {
      beam.dispose();
    }
  });
});

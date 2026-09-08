import { describe, expect, it } from 'vitest';
import { Mesh, ShaderLib, type WebGLRenderer } from 'three';
import { createShipGeometry } from '../src/world/ShipGeometry';
import { createShipMaterials } from '../src/world/ShipMaterials';

describe('room weathering', () => {
  it('covers walls, infills, roofs and ceilings with finite, stationary surface coordinates', () => {
    const materials = createShipMaterials();
    const ship = createShipGeometry(materials);
    let surfaces = 0;
    try {
      ship.root.traverse((object) => {
        if (!(object instanceof Mesh)) return;
        const isRoom = object.material === materials.paintedPanel
          || object.name.endsWith('-roof') || object.name.startsWith('cabin-');
        if (!isRoom) return;
        surfaces += 1;
        const position = object.geometry.getAttribute('position');
        const panel = object.geometry.getAttribute('roomWearPanel');
        const coordinates = object.geometry.getAttribute('roomWearPosition');
        expect(panel, object.name).toBeDefined();
        expect(coordinates.count, object.name).toBe(position.count);
        expect(Array.from(coordinates.array).every(Number.isFinite), object.name).toBe(true);
        expect(Array.from(panel.array).every(Number.isFinite), object.name).toBe(true);
        expect(panel.getZ(0), object.name).toBeGreaterThan(0);
        const original = Array.from(coordinates.array);
        object.rotation.z += 0.2;
        object.updateMatrixWorld(true);
        expect(Array.from(coordinates.array)).toEqual(original);
      });
      expect(surfaces).toBeGreaterThan(30);
    } finally {
      ship.disposeGeometry();
      materials.dispose();
    }
  });

  it('composes with water shading and uses separate wood and steel shader programs', () => {
    const materials = createShipMaterials();
    try {
      const keys = new Set<string>();
      for (const material of [materials.paintedPanel, materials.paintedSteel]) {
        const shader = { ...ShaderLib.standard, uniforms: {} } as Parameters<typeof material.onBeforeCompile>[0];
        material.onBeforeCompile(shader, {} as WebGLRenderer);
        expect(shader.uniforms).toHaveProperty('shipWetStrength');
        expect(shader.fragmentShader).toContain('float shipWetness');
        expect(shader.fragmentShader.indexOf('float shipWetness'))
          .toBeLessThan(shader.fragmentShader.indexOf('vec3 substrate'));
        keys.add(material.customProgramCacheKey());
      }
      expect(keys.size).toBe(2);
    } finally {
      materials.dispose();
    }
  });
});

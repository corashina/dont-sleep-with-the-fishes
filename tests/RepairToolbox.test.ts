import { BufferGeometry, Material, Mesh } from 'three';
import { describe, expect, it } from 'vitest';
import { createRepairToolbox } from '../src/world/RepairToolbox';

describe('repair toolbox', () => {
  it('builds an open weathered toolbox with visible hand tools', () => {
    const toolbox = createRepairToolbox();
    expect(toolbox.name).toBe('repair-toolbox');
    expect(toolbox.getObjectByName('repair-toolbox-case')).toBeDefined();
    expect(toolbox.getObjectByName('repair-toolbox-lid')).toBeDefined();
    expect(toolbox.getObjectByName('repair-toolbox-tray')).toBeDefined();
    expect(toolbox.getObjectByName('repair-toolbox-handle')).toBeDefined();
    expect(toolbox.getObjectByName('repair-toolbox-hammer')).toBeDefined();
    expect(toolbox.getObjectByName('repair-toolbox-wrench')).toBeDefined();
    expect(toolbox.getObjectByName('repair-toolbox-screwdriver')).toBeDefined();
    expect(toolbox.getObjectByName('repair-toolbox-wear')).toBeDefined();

    const geometries = new Set<BufferGeometry>();
    const materials = new Set<Material>();
    toolbox.traverse((object) => {
      if (!(object instanceof Mesh)) return;
      geometries.add(object.geometry);
      const assigned = Array.isArray(object.material) ? object.material : [object.material];
      assigned.forEach((material) => materials.add(material));
    });
    geometries.forEach((geometry) => geometry.dispose());
    materials.forEach((material) => material.dispose());
  });
});
